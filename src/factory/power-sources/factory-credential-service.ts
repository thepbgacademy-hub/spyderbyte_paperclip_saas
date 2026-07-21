import { randomUUID } from "node:crypto";

import type {
  MaskedPowerSourceCredential,
  PowerSourceCredential,
  PowerSourceProviderKind
} from "../domain/types.js";
import type { FactoryCredentialRepository } from "./factory-credential-repository.js";
import type { createFactoryCredentialVault } from "./factory-credential-vault.js";
import {
  createRepositoryBackedFactoryCredentialValidationQueue,
  type FactoryCredentialValidationQueue
} from "../queues/factory-credential-validation-queue.js";

type FactoryCredentialVault = ReturnType<typeof createFactoryCredentialVault>;

export class FactoryCredentialNotFoundError extends Error {
  readonly code = "factory_credential_not_found";

  constructor() {
    super("Factory credential was not found");
    this.name = "FactoryCredentialNotFoundError";
  }
}

export class FactoryCredentialPurposeRequiredError extends Error {
  readonly code = "factory_credential_purpose_required";

  constructor() {
    super("A decrypt purpose is required before accessing a factory credential");
    this.name = "FactoryCredentialPurposeRequiredError";
  }
}

export function createFactoryCredentialService(options: {
  repository: FactoryCredentialRepository;
  validationQueue?: FactoryCredentialValidationQueue;
  vault: FactoryCredentialVault;
  now?: () => string;
}) {
  const now = options.now ?? (() => new Date().toISOString());
  const validationQueue =
    options.validationQueue ?? createRepositoryBackedFactoryCredentialValidationQueue({ repository: options.repository });

  return {
    async createCredential(input: {
      workspaceId: string;
      providerKind: PowerSourceProviderKind;
      label: string;
      secret: Record<string, string>;
    }) {
      const encrypted = options.vault.encrypt(input.secret);
      const credential: PowerSourceCredential = {
        id: `credential_${randomUUID()}`,
        workspaceId: input.workspaceId,
        providerKind: input.providerKind,
        label: input.label,
        last4: deriveLast4(input.secret),
        keyVersion: encrypted.keyVersion,
        validationStatus: "pending",
        validationMessage: "Validation is queued.",
        lastValidatedAt: null,
        encryptedPayload: encrypted.payload,
        createdAt: now(),
        deletedAt: null
      };
      const validationJob = {
        id: `credential_validation_${randomUUID()}`,
        workspaceId: credential.workspaceId,
        credentialId: credential.id,
        reason: "credential_created",
        status: "queued",
        requestedAt: now(),
        startedAt: null,
        completedAt: null,
        message: null
      } as const;
      await options.repository.insertCredential(credential);
      try {
        await validationQueue.enqueue(validationJob);
      } catch (error) {
        await options.repository.removeCredential(credential.id);
        throw error;
      }
      return maskCredential(credential);
    },

    async listCredentials(input: { workspaceId: string }) {
      const credentials = await options.repository.listCredentials(input);
      return credentials.filter((credential) => credential.deletedAt === null).map(maskCredential);
    },

    async deleteCredential(input: { workspaceId: string; credentialId: string }) {
      const credential = await getActiveCredential(options.repository, input);
      await options.repository.updateCredential({
        ...credential,
        deletedAt: now()
      });
    },

    async decryptCredential(input: { workspaceId: string; credentialId: string; runId: string; purpose: string }) {
      if (input.purpose.trim().length === 0) {
        throw new FactoryCredentialPurposeRequiredError();
      }
      const credential = await getActiveCredential(options.repository, input);
      const secret = options.vault.decrypt({
        payload: credential.encryptedPayload,
        keyVersion: credential.keyVersion
      });
      await options.repository.insertAccessAuditEvent({
        id: `credential_access_${randomUUID()}`,
        workspaceId: credential.workspaceId,
        credentialId: credential.id,
        runId: input.runId,
        purpose: input.purpose,
        accessedAt: now()
      });
      return secret;
    }
  };
}

function maskCredential(credential: PowerSourceCredential): MaskedPowerSourceCredential {
  return {
    id: credential.id,
    workspaceId: credential.workspaceId,
    providerKind: credential.providerKind,
    label: credential.label,
    last4: credential.last4,
    keyVersion: credential.keyVersion,
    validationStatus: credential.validationStatus,
    validationMessage: credential.validationMessage,
    lastValidatedAt: credential.lastValidatedAt,
    createdAt: credential.createdAt,
    deletedAt: credential.deletedAt,
    masked: true
  };
}

async function getActiveCredential(
  repository: FactoryCredentialRepository,
  input: { workspaceId: string; credentialId: string }
) {
  const credential = await repository.getCredential(input);
  if (!credential || credential.deletedAt !== null) {
    throw new FactoryCredentialNotFoundError();
  }
  return credential;
}

function deriveLast4(secret: Record<string, string>) {
  const value = secret.apiKey ?? secret.accessToken ?? secret.token ?? Object.values(secret)[0] ?? "";
  return value.slice(-4);
}
