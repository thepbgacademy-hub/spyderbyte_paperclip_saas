import type { ProviderConfig, ProviderKind } from "../providers/provider-types.js";
import { safeAuditMetadata } from "./redaction.js";

type ProviderRegistration = {
  provider: ProviderConfig;
  secretValues: Record<string, string>;
  metadata: Record<string, unknown>;
};

export type SecretReference = {
  tenantId: string;
  providerKind: ProviderKind;
  label: string;
  secretRef: string;
  metadata: Record<string, unknown>;
  revokedAt: string | null;
};

export type PublicSecretConnection = {
  providerKind: ProviderKind;
  label: string;
  connected: true;
  metadata: Record<string, unknown>;
};

type Vault = {
  store(input: { tenantId: string; providerKind: ProviderKind; secretValues: Record<string, string> }): Promise<string>;
  rotate(input: { tenantId: string; secretRef: string; nextSecretValues: Record<string, string> }): Promise<string>;
  revoke(input: { tenantId: string; secretRef: string }): Promise<void>;
  access(input: { tenantId: string; secretRef: string; runId: string }): Promise<unknown>;
};

type Audit = (event: {
  tenantId: string;
  actorUserId?: string;
  eventType: string;
  entityType: string;
      entityId: string;
      metadata: Record<string, unknown>;
}) => void | Promise<void>;

export class SecretReferenceUnavailableError extends Error {
  readonly code = "secret_reference_unavailable";
  readonly publicMessage = "credential_invalid";

  constructor() {
    super("Secret reference is unavailable");
    this.name = "SecretReferenceUnavailableError";
  }
}

type SecretRepository = {
  create(reference: SecretReference): Promise<string> | string;
  updateSecretRef(input: { tenantId: string; previousSecretRef: string; nextSecretRef: string }): Promise<string> | string;
  revoke(input: { tenantId: string; secretRef: string }): Promise<string> | string;
  findIdBySecretRef(input: { tenantId: string; secretRef: string; runId?: string }): Promise<string> | string;
};

export function createSecretService(options: { vault: Vault; audit: Audit; repository: SecretRepository }) {
  async function register(input: {
    tenantId: string;
    actorUserId: string;
    label: string;
    registration: ProviderRegistration;
  }): Promise<SecretReference> {
      const secretRef = await options.vault.store({
        tenantId: input.tenantId,
        providerKind: input.registration.provider.kind,
        secretValues: input.registration.secretValues
      });

      const reference = {
        tenantId: input.tenantId,
        providerKind: input.registration.provider.kind,
        label: input.label,
        secretRef,
        metadata: input.registration.metadata,
        revokedAt: null
      };

      const secretReferenceId = await options.repository.create(reference);
      await options.audit({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        eventType: "secret.created",
        entityType: "secret_reference",
        entityId: secretReferenceId,
        metadata: safeAuditMetadata({
          providerKind: input.registration.provider.kind,
          label: input.label,
          ...input.registration.metadata
        })
      });

      return reference;
  }

  return {
    register,
    async registerProviderCredential(input: {
      tenantId: string;
      actorUserId: string;
      label: string;
      registration: ProviderRegistration;
    }): Promise<PublicSecretConnection> {
      const reference = await register(input);
      return {
        providerKind: reference.providerKind,
        label: reference.label,
        connected: true,
        metadata: publicMetadataForProvider(reference.providerKind, reference.metadata)
      };
    },

    async rotate(input: {
      tenantId: string;
      actorUserId: string;
      secretRef: string;
      nextSecretValues: Record<string, string>;
    }): Promise<{ secretRef: string }> {
      const secretRef = await options.vault.rotate({
        tenantId: input.tenantId,
        secretRef: input.secretRef,
        nextSecretValues: input.nextSecretValues
      });

      const secretReferenceId = await options.repository.updateSecretRef({
        tenantId: input.tenantId,
        previousSecretRef: input.secretRef,
        nextSecretRef: secretRef
      });
      await options.audit({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        eventType: "secret.rotated",
        entityType: "secret_reference",
        entityId: secretReferenceId,
        metadata: safeAuditMetadata({})
      });

      return { secretRef };
    },

    async revoke(input: { tenantId: string; actorUserId: string; secretRef: string }): Promise<void> {
      await options.vault.revoke({ tenantId: input.tenantId, secretRef: input.secretRef });
      const secretReferenceId = await options.repository.revoke({ tenantId: input.tenantId, secretRef: input.secretRef });
      await options.audit({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        eventType: "secret.revoked",
        entityType: "secret_reference",
        entityId: secretReferenceId,
        metadata: safeAuditMetadata({})
      });
    },

    async access(input: { tenantId: string; runId: string; secretRef: string }): Promise<unknown> {
      const secretReferenceId = await options.repository.findIdBySecretRef({
        tenantId: input.tenantId,
        secretRef: input.secretRef,
        runId: input.runId
      });
      if (!secretReferenceId) {
        throw new SecretReferenceUnavailableError();
      }
      const secretValue = await options.vault.access(input);
      await options.audit({
        tenantId: input.tenantId,
        eventType: "secret.accessed",
        entityType: "secret_reference",
        entityId: secretReferenceId,
        metadata: safeAuditMetadata({})
      });
      return secretValue;
    }
  };
}

function publicMetadataForProvider(providerKind: ProviderKind, metadata: Record<string, unknown>): Record<string, unknown> {
  if (providerKind === "openai_chatgpt_codex_subscription") {
    return {};
  }
  return metadata;
}
