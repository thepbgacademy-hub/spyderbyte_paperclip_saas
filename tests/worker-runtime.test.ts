import { describe, expect, it, vi } from "vitest";

import { createWorkerRuntime, loadWorkerEnv } from "../src/worker/runtime.js";

vi.mock("../src/db/postgres-client.js", () => ({
  createPgPool: vi.fn(() => ({
    end: vi.fn().mockResolvedValue(undefined)
  })),
  createPgPoolQueryClient: vi.fn(() => ({ query: vi.fn() })),
  createPgTransactionRunner: vi.fn(() => ({ withTransaction: vi.fn() }))
}));

vi.mock("../src/db/supabase-repositories.js", () => ({
  createSupabaseRepositories: vi.fn(() => ({
    createSecretReference: vi.fn(),
    updateSecretRef: vi.fn(),
    revokeSecretReference: vi.fn(),
    findIdBySecretRef: vi.fn().mockResolvedValue("secret-1"),
    resolvePaperclipCompanyMapping: vi.fn().mockResolvedValue({ paperclipCompanyId: "pc-company-1" })
  }))
}));

vi.mock("../src/db/acid-guard-repository.js", () => ({
  createAcidGuardRepository: vi.fn(() => ({
    getBoundProviderContext: vi.fn().mockResolvedValue([
      {
        capability: "text_generation",
        providerKind: "openai_api",
        label: "Bound OpenAI",
        secretRef: "wf_secret_bound",
        metadata: {}
      }
    ])
  }))
}));

vi.mock("../src/secrets/postgres-vault-store.js", () => ({
  createPostgresEncryptedVaultStore: vi.fn(() => ({}))
}));

vi.mock("../src/secrets/encrypted-vault.js", () => ({
  createEncryptedSecretVault: vi.fn(() => ({
    access: vi.fn().mockResolvedValue({ apiKey: "sk-tenant" }),
    store: vi.fn(),
    rotate: vi.fn(),
    revoke: vi.fn()
  }))
}));

vi.mock("../src/secrets/secret-service.js", () => ({
  createSecretService: vi.fn(() => ({
    access: vi.fn().mockResolvedValue({ apiKey: "sk-tenant" })
  }))
}));

vi.mock("../src/paperclip/client.js", () => ({
  createPaperclipClient: vi.fn(() => ({
    createRun: vi.fn().mockResolvedValue({ paperclipRunId: "pc-run-1", status: "queued" })
  }))
}));

describe("worker runtime", () => {
  const validEnv = {
    NODE_ENV: "test",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    REDIS_URL: "redis://localhost:6379",
    PAPERCLIP_BASE_URL: "https://paperclip-internal.spyderbyte.cloud/",
    PAPERCLIP_SERVICE_TOKEN: "paperclip-service-token",
    WF_VAULT_MASTER_KEY: "test-master-key-with-enough-length",
    SUPABASE_DB_URL: "postgresql://postgres.tenant:pw@127.0.0.1:5432/postgres",
    WF_ALLOWED_ORIGINS: "https://www.spyderbyte.cloud"
  };

  it("loads worker env including provider execution mode", () => {
    expect(loadWorkerEnv(validEnv).providerExecutionMode).toBe("tenant_credentials_required");
  });

  it("processes queue payloads through the bound-provider worker path", async () => {
    const runtime = createWorkerRuntime({ env: loadWorkerEnv(validEnv) });

    await expect(
      runtime.processQueuePayload({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "workflow-1",
        createdByUserId: "user-1",
        idempotencyKey: "tenant-1:workflow-1:run-1",
        createdAt: new Date().toISOString()
      })
    ).resolves.toEqual({
      runId: "run-1",
      workflowId: "workflow-1",
      status: "queued"
    });

    await runtime.close();
  });
});
