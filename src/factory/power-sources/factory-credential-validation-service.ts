import { randomUUID } from "node:crypto";

import type {
  CredentialValidationJob,
  CredentialValidationStatus,
  PowerSourceCredential
} from "../domain/types.js";
import { mapPowerSourceProviderKindToFactoryProviderKey } from "../providers/provider-registry.js";
import type { FactoryProviderKey, LLMProvider, ValidationResult } from "../providers/provider-types.js";
import type { FactoryCredentialRepository } from "./factory-credential-repository.js";
import type { createFactoryCredentialVault } from "./factory-credential-vault.js";
import {
  createRepositoryBackedFactoryCredentialValidationQueue,
  type FactoryCredentialValidationQueue
} from "../queues/factory-credential-validation-queue.js";

type FactoryCredentialVault = ReturnType<typeof createFactoryCredentialVault>;

const WEEKLY_REVALIDATION_MS = 7 * 24 * 60 * 60 * 1000;

export function createFactoryCredentialValidationService(options: {
  repository: FactoryCredentialRepository;
  validationQueue?: FactoryCredentialValidationQueue;
  vault: FactoryCredentialVault;
  providers: Partial<Record<FactoryProviderKey, LLMProvider>>;
  now?: () => string;
}) {
  const now = options.now ?? (() => new Date().toISOString());
  const validationQueue =
    options.validationQueue ?? createRepositoryBackedFactoryCredentialValidationQueue({ repository: options.repository });

  return {
    async processNextValidationJob() {
      const queued = await validationQueue.claimNext({ now: now() });
      if (!queued) {
        return null;
      }

      return processClaimedValidationJob(queued);
    },

    async processValidationJob(input: { jobId: string }) {
      const queued = await validationQueue.claimById({ jobId: input.jobId, now: now() });
      if (!queued) {
        return null;
      }

      return processClaimedValidationJob(queued);
    },

    async enqueueWeeklyRevalidationJobs() {
      const timestamp = now();
      const queued: Array<{ workspaceId: string; credentialId: string }> = [];
      for (const credential of await options.repository.listAllCredentials()) {
        if (!isDueForWeeklyRevalidation(credential, timestamp)) {
          continue;
        }
        const hasOpenJob = await validationQueue.hasOpenJob({
          workspaceId: credential.workspaceId,
          credentialId: credential.id,
          reason: "weekly_revalidation"
        });
        if (hasOpenJob) {
          continue;
        }
        await validationQueue.enqueue(createValidationJob(credential, "weekly_revalidation", timestamp));
        queued.push({ workspaceId: credential.workspaceId, credentialId: credential.id });
      }
      return queued;
    },

    async invalidateCredentialAfterAuthFailure(input: { workspaceId: string; credentialId: string }) {
      const credential = await options.repository.getCredential(input);
      if (!credential || credential.deletedAt !== null) {
        return null;
      }
      const updatedCredential = await applyCredentialValidation(
        credential,
        "invalid",
        "Power Source credential was rejected by the provider."
      );
      return {
        workspaceId: updatedCredential.workspaceId,
        credentialId: updatedCredential.id,
        validationStatus: updatedCredential.validationStatus,
        validationMessage: updatedCredential.validationMessage,
        lastValidatedAt: updatedCredential.lastValidatedAt
      };
    }
  };

  async function validateCredential(credential: PowerSourceCredential): Promise<{
    status: CredentialValidationStatus;
    message: string;
    updateLastValidatedAt: boolean;
  }> {
    const providerKey = mapPowerSourceProviderKindToFactoryProviderKey(credential.providerKind);
    const provider = options.providers[providerKey];
    if (!provider) {
      return {
        status: "invalid",
        message: "Power Source provider is not available for validation.",
        updateLastValidatedAt: true
      };
    }

    const secret = options.vault.decrypt({
      payload: credential.encryptedPayload,
      keyVersion: credential.keyVersion
    });
    const validation = await provider.validateCredential(secret.apiKey ?? secret.accessToken ?? secret.token ?? "");
    if (validation.valid) {
      return { status: "valid", message: "Power Source is connected.", updateLastValidatedAt: true };
    }
    if (isRetryableValidationFailure(validation)) {
      return {
        status: credential.validationStatus,
        message: "Validation could not complete; it can retry later.",
        updateLastValidatedAt: false
      };
    }
    return { status: "invalid", message: friendlyValidationMessage(validation), updateLastValidatedAt: true };
  }

  async function applyCredentialValidation(
    credential: PowerSourceCredential,
    validationStatus: CredentialValidationStatus,
    validationMessage: string,
    input: { updateLastValidatedAt: boolean } = { updateLastValidatedAt: true }
  ) {
    const updatedCredential = {
      ...credential,
      validationStatus,
      validationMessage,
      lastValidatedAt: input.updateLastValidatedAt ? now() : credential.lastValidatedAt
    };
    await options.repository.updateCredential(updatedCredential);
    return updatedCredential;
  }

  async function processClaimedValidationJob(queued: CredentialValidationJob) {
    const credential = await options.repository.getCredential({
      workspaceId: queued.workspaceId,
      credentialId: queued.credentialId
    });
    if (!credential || credential.deletedAt !== null) {
      await validationQueue.complete(queued, {
        status: "failed",
        completedAt: now(),
        message: "Credential was not found."
      });
      return null;
    }

    let validation: { status: CredentialValidationStatus; message: string; updateLastValidatedAt: boolean };
    let completionStatus: Extract<CredentialValidationJob["status"], "succeeded" | "failed"> = "succeeded";
    try {
      validation = await validateCredential(credential);
    } catch {
      validation = {
        status: credential.validationStatus,
        message: "Validation could not complete; it can retry later.",
        updateLastValidatedAt: false
      };
      completionStatus = "failed";
    }

    const updatedCredential = await applyCredentialValidation(credential, validation.status, validation.message, {
      updateLastValidatedAt: validation.updateLastValidatedAt
    });
    if (!validation.updateLastValidatedAt) {
      await validationQueue.requeue(queued, {
        requestedAt: now(),
        message: validation.message
      });
      return {
        workspaceId: credential.workspaceId,
        credentialId: credential.id,
        validationStatus: validation.status,
        validationMessage: validation.message,
        lastValidatedAt: updatedCredential.lastValidatedAt
      };
    }
    await validationQueue.complete(queued, {
      status: completionStatus,
      completedAt: now(),
      message: validation.message
    });

    return {
      workspaceId: credential.workspaceId,
      credentialId: credential.id,
      validationStatus: validation.status,
      validationMessage: validation.message,
      lastValidatedAt: updatedCredential.lastValidatedAt
    };
  }
}

function createValidationJob(
  credential: PowerSourceCredential,
  reason: CredentialValidationJob["reason"],
  requestedAt: string
): CredentialValidationJob {
  return {
    id: `credential_validation_${randomUUID()}`,
    workspaceId: credential.workspaceId,
    credentialId: credential.id,
    reason,
    status: "queued",
    requestedAt,
    startedAt: null,
    completedAt: null,
    message: null
  };
}

function friendlyValidationMessage(validation: ValidationResult): string {
  if (validation.errorClass === "auth") {
    return "Power Source credential was rejected by the provider.";
  }

  if (validation.errorClass === "rate_limit") {
    return "Provider rate limit reached; validation can retry later.";
  }

  if (validation.errorClass === "provider_outage") {
    return "Provider appears unavailable; validation can retry later.";
  }

  return validation.message && !containsSecretLikeText(validation.message)
    ? validation.message
    : "Power Source could not be validated right now.";
}

function isRetryableValidationFailure(validation: ValidationResult): boolean {
  return (
    validation.errorClass === "rate_limit" ||
    validation.errorClass === "provider_outage" ||
    validation.errorClass === "transient"
  );
}

function containsSecretLikeText(value: string): boolean {
  return /sk-|secret|token|key/i.test(value);
}

function isDueForWeeklyRevalidation(credential: PowerSourceCredential, nowIso: string): boolean {
  if (credential.deletedAt !== null || credential.validationStatus !== "valid" || !credential.lastValidatedAt) {
    return false;
  }
  return Date.parse(nowIso) - Date.parse(credential.lastValidatedAt) >= WEEKLY_REVALIDATION_MS;
}
