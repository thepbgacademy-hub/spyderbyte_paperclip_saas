export type AcidCredentialRevokeRepository = {
  revokeCredential(input: { tenantId: string; secretReferenceId: string }): Promise<{ revoked: boolean }>;
};

export type SecretReferenceResolver = {
  findIdBySecretRef(input: { tenantId: string; secretRef: string }): Promise<string>;
};

export type VaultRevoker = {
  revoke(input: { tenantId: string; secretRef: string }): Promise<void>;
};

export type SecretRevokeAudit = (event: {
  tenantId: string;
  actorUserId: string;
  eventType: "secret.revoked";
  entityType: "secret_reference";
  entityId: string;
  metadata: Record<string, never>;
}) => void | Promise<void>;

export class CredentialAlreadyRevokedError extends Error {
  readonly code = "credential_already_revoked";
  readonly publicMessage = "credential_unavailable";

  constructor() {
    super("Credential is already revoked or unavailable");
    this.name = "CredentialAlreadyRevokedError";
  }
}

export function createAcidSecretRevokeService(options: {
  repository: AcidCredentialRevokeRepository;
  resolver: SecretReferenceResolver;
  vault: VaultRevoker;
  audit: SecretRevokeAudit;
}) {
  return {
    async revoke(input: { tenantId: string; actorUserId: string; secretRef: string }): Promise<void> {
      const secretReferenceId = await options.resolver.findIdBySecretRef({ tenantId: input.tenantId, secretRef: input.secretRef });
      const revokeResult = await options.repository.revokeCredential({ tenantId: input.tenantId, secretReferenceId });
      await options.vault.revoke({ tenantId: input.tenantId, secretRef: input.secretRef });
      if (!revokeResult.revoked) {
        throw new CredentialAlreadyRevokedError();
      }

      await options.audit({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        eventType: "secret.revoked",
        entityType: "secret_reference",
        entityId: secretReferenceId,
        metadata: {}
      });
    }
  };
}
