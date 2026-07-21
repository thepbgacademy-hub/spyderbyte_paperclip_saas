import { randomBytes } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { createFactoryCredentialApi } from "../src/api/factory-credential-api.js";
import { createFactoryCredentialService } from "../src/factory/power-sources/factory-credential-service.js";
import { createMemoryFactoryCredentialRepository } from "../src/factory/power-sources/factory-credential-repository.js";
import { createFactoryCredentialVault } from "../src/factory/power-sources/factory-credential-vault.js";

const ownerSession = { userId: "user-owner", tenantId: "tenant-1" };
const adminSession = { userId: "user-admin", tenantId: "tenant-1" };
const memberSession = { userId: "user-member", tenantId: "tenant-1" };

function createApiHarness(input?: {
  session?: typeof ownerSession | typeof adminSession | typeof memberSession | null;
  role?: "owner" | "admin" | "member";
  memberRequired?: boolean;
  membershipFailure?: Error;
}) {
  const repository = createMemoryFactoryCredentialRepository();
  const credentialService = createFactoryCredentialService({
    repository,
    vault: createFactoryCredentialVault({
      keyring: { current: { version: "v1", masterKey: randomBytes(32).toString("base64") } }
    }),
    now: () => "2026-07-11T12:00:00.000Z"
  });
  const deps = {
    authenticate: vi.fn().mockResolvedValue(input?.session === undefined ? ownerSession : input.session),
    requireTenantMember: vi.fn().mockImplementation(async () => {
      if (input?.membershipFailure) {
        throw input.membershipFailure;
      }
      if (input?.memberRequired === false) {
        throw new Error("Tenant membership was not found");
      }
    }),
    resolveTenantCredentialRole: vi.fn().mockResolvedValue(input?.role ?? "owner"),
    credentialService
  };
  return {
    api: createFactoryCredentialApi(deps),
    deps,
    repository
  };
}

describe("factory credential API", () => {
  it("creates, lists, and deletes masked Power Source credentials without returning plaintext", async () => {
    const { api, repository } = createApiHarness();

    const created = await api.createCredential({
      authorization: "Bearer owner",
      providerKind: "anthropic_api",
      label: "Founder Anthropic key",
      secret: { apiKey: "sk-ant-secret-value" }
    });

    expect(created).toMatchObject({
      workspaceId: "tenant-1",
      providerKind: "anthropic_api",
      label: "Founder Anthropic key",
      last4: "alue",
      masked: true
    });
    expect(JSON.stringify(created)).not.toContain("sk-ant-secret-value");
    expect(JSON.stringify(repository.dump())).not.toContain("sk-ant-secret-value");

    await expect(api.listCredentials({ authorization: "Bearer owner" })).resolves.toEqual([created]);

    await expect(
      api.deleteCredential({
        authorization: "Bearer owner",
        credentialId: created.id
      })
    ).resolves.toEqual({ credentialId: created.id, deleted: true });
    await expect(api.listCredentials({ authorization: "Bearer owner" })).resolves.toEqual([]);
  });

  it("allows tenant admins but rejects tenant members before credential persistence", async () => {
    const adminHarness = createApiHarness({ session: adminSession, role: "admin" });

    await expect(
      adminHarness.api.createCredential({
        authorization: "Bearer admin",
        providerKind: "openai_api",
        label: "Admin OpenAI key",
        secret: { apiKey: "sk-admin-secret" }
      })
    ).resolves.toMatchObject({ workspaceId: "tenant-1", masked: true });

    const memberHarness = createApiHarness({ session: memberSession, role: "member" });

    await expect(
      memberHarness.api.createCredential({
        authorization: "Bearer member",
        providerKind: "openai_api",
        label: "Member OpenAI key",
        secret: { apiKey: "sk-member-secret" }
      })
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(memberHarness.repository.dump()).toEqual([]);
  });

  it("maps missing tenant membership to forbidden before credential persistence", async () => {
    const missingMemberHarness = createApiHarness({ memberRequired: false });

    await expect(
      missingMemberHarness.api.createCredential({
        authorization: "Bearer stale",
        providerKind: "openai_api",
        label: "Stale member key",
        secret: { apiKey: "sk-stale-secret" }
      })
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(missingMemberHarness.repository.dump()).toEqual([]);
  });

  it("does not flatten unexpected membership dependency failures into forbidden", async () => {
    const failingHarness = createApiHarness({ membershipFailure: new Error("database connection failed") });

    await expect(
      failingHarness.api.createCredential({
        authorization: "Bearer owner",
        providerKind: "openai_api",
        label: "OpenAI key",
        secret: { apiKey: "sk-secret" }
      })
    ).rejects.toThrow("database connection failed");
    expect(failingHarness.repository.dump()).toEqual([]);
  });

  it("rejects unauthenticated and malformed credential requests before persistence", async () => {
    const unauthenticatedHarness = createApiHarness({ session: null });

    await expect(
      unauthenticatedHarness.api.createCredential({
        authorization: "",
        providerKind: "openai_api",
        label: "OpenAI key",
        secret: { apiKey: "sk-secret" }
      })
    ).rejects.toMatchObject({ code: "unauthorized" });

    const { api, repository } = createApiHarness();

    await expect(
      api.createCredential({
        authorization: "Bearer owner",
        providerKind: "unsupported_provider",
        label: "Bad key",
        secret: { apiKey: "sk-secret" }
      })
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      api.createCredential({
        authorization: "Bearer owner",
        providerKind: "openai_api",
        label: " ",
        secret: { apiKey: "sk-secret" }
      })
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      api.createCredential({
        authorization: "Bearer owner",
        providerKind: "openai_api",
        label: "Missing secret",
        secret: {}
      })
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(repository.dump()).toEqual([]);
  });

  it("fails closed when deleting a missing tenant credential", async () => {
    const { api } = createApiHarness();

    await expect(
      api.deleteCredential({
        authorization: "Bearer owner",
        credentialId: "credential_missing"
      })
    ).rejects.toMatchObject({ code: "invalid_request" });
  });
});
