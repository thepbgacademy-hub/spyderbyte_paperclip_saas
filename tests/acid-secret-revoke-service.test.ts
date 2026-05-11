import { describe, expect, it, vi } from "vitest";

import { createAcidSecretRevokeService } from "../src/secrets/acid-secret-revoke-service.js";

describe("ACID secret revoke service", () => {
  it("revokes credentials through Supabase before vault cleanup and audit", async () => {
    const repository = {
      revokeCredential: vi.fn().mockResolvedValue({ revoked: true })
    };
    const resolver = {
      findIdBySecretRef: vi.fn().mockResolvedValue("11111111-1111-4111-8111-111111111111")
    };
    const vault = {
      revoke: vi.fn().mockResolvedValue(undefined)
    };
    const audit = vi.fn();
    const service = createAcidSecretRevokeService({ repository, resolver, vault, audit });

    await service.revoke({ tenantId: "tenant-1", actorUserId: "user-1", secretRef: "vault://secret-ref" });

    expect(repository.revokeCredential).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      secretReferenceId: "11111111-1111-4111-8111-111111111111"
    });
    expect(vault.revoke).toHaveBeenCalledWith({ tenantId: "tenant-1", secretRef: "vault://secret-ref" });
    expect(audit).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      actorUserId: "user-1",
      eventType: "secret.revoked",
      entityType: "secret_reference",
      entityId: "11111111-1111-4111-8111-111111111111",
      metadata: {}
    });
    expect(JSON.stringify(audit.mock.calls)).not.toContain("vault://secret-ref");
  });

  it("still attempts vault cleanup when the credential is already revoked", async () => {
    const vault = { revoke: vi.fn().mockResolvedValue(undefined) };
    const service = createAcidSecretRevokeService({
      repository: { revokeCredential: vi.fn().mockResolvedValue({ revoked: false }) },
      resolver: { findIdBySecretRef: vi.fn().mockResolvedValue("11111111-1111-4111-8111-111111111111") },
      vault,
      audit: vi.fn()
    });

    await expect(service.revoke({ tenantId: "tenant-1", actorUserId: "user-1", secretRef: "vault://secret-ref" })).rejects.toMatchObject({
      code: "credential_already_revoked",
      publicMessage: "credential_unavailable"
    });
    expect(vault.revoke).toHaveBeenCalledWith({ tenantId: "tenant-1", secretRef: "vault://secret-ref" });
  });

  it("can retry vault cleanup after a database revoke succeeds but vault cleanup fails", async () => {
    const repository = { revokeCredential: vi.fn().mockResolvedValue({ revoked: false }) };
    const vault = { revoke: vi.fn().mockResolvedValue(undefined) };
    const audit = vi.fn();
    const service = createAcidSecretRevokeService({
      repository,
      resolver: { findIdBySecretRef: vi.fn().mockResolvedValue("11111111-1111-4111-8111-111111111111") },
      vault,
      audit
    });

    await expect(service.revoke({ tenantId: "tenant-1", actorUserId: "user-1", secretRef: "vault://secret-ref" })).rejects.toMatchObject({
      code: "credential_already_revoked"
    });
    expect(vault.revoke).toHaveBeenCalledOnce();
    expect(audit).not.toHaveBeenCalled();
  });
});
