import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

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
    findSecretReferenceId: vi.fn().mockResolvedValue("11111111-1111-4111-8111-111111111111"),
    resolvePaperclipCompanyMapping: vi.fn().mockResolvedValue({ paperclipCompanyId: "pc-company-1", paperclipIssueAgentId: "pc-agent-1" })
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
    ]),
    transitionWorkflowRunStatus: vi.fn().mockResolvedValue({ transitioned: true, status: "queued" })
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

vi.mock("../src/paperclip/secret-sync.js", () => ({
  createPaperclipSecretBindingRepository: vi.fn(() => ({
    findActiveBySecretRef: vi.fn().mockResolvedValue(null)
  })),
  createPaperclipSecretAdminHttpClient: vi.fn(() => ({})),
  createPaperclipSecretSyncService: vi.fn(() => ({
    syncBinding: vi.fn().mockResolvedValue({
      paperclipSecretId: "pc-secret-1",
      paperclipSecretKey: "OPENAI_API_KEY",
      paperclipSecretVersion: "9"
    })
  })),
  toPaperclipEnvBindings: vi.fn(() => [{ envKey: "OPENAI_API_KEY", secretValue: "sk-tenant" }]),
  toPaperclipSecretRefBinding: vi.fn(({ paperclipSecretId, paperclipSecretVersion }) => ({
    type: "secret_ref",
    secretId: paperclipSecretId,
    version: Number(paperclipSecretVersion)
  }))
}));

vi.mock("../src/paperclip/client.js", () => ({
  createPaperclipClient: vi.fn(() => ({
    createRun: vi.fn().mockResolvedValue({ paperclipRunId: "pc-run-1", status: "queued" })
  }))
}));

const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

afterAll(() => {
  stdoutWrite.mockRestore();
});

beforeEach(() => {
  vi.clearAllMocks();
});

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
    const { createAcidGuardRepository } = await import("../src/db/acid-guard-repository.js");
    const runtime = createWorkerRuntime({ env: loadWorkerEnv(validEnv), workerInstanceId: "worker-test-1" });

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

    const acidRepository = vi.mocked(createAcidGuardRepository).mock.results[0]?.value;
    expect(acidRepository.transitionWorkflowRunStatus).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      from: ["queued"],
      to: "queued"
    });

    await runtime.close();
  });

  it("wires the issue-launch adapter into the worker runtime when configured", async () => {
    const { createPaperclipClient } = await import("../src/paperclip/client.js");
    const {
      createPaperclipSecretAdminHttpClient,
      createPaperclipSecretBindingRepository,
      createPaperclipSecretSyncService
    } = await import("../src/paperclip/secret-sync.js");

    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_PAPERCLIP_LAUNCH_MODE: "issues",
        WF_PAPERCLIP_BOARD_SESSION_TOKEN: "board-session-token",
        WF_PAPERCLIP_BOARD_ORIGIN: "https://paperclip-board.internal.local/",
        WF_PAPERCLIP_ISSUE_AGENT_ID: "agent-fallback"
      })
    });

    expect(createPaperclipClient).toHaveBeenCalledWith(
      expect.objectContaining({
        launchMode: "issues",
        issueLaunch: expect.objectContaining({
          pollIntervalMs: 1000,
          maxPollAttempts: 10,
          resolveLaunchTarget: expect.any(Function),
          syncProviderSecretRefs: expect.any(Function)
        })
      })
    );
    expect(createPaperclipSecretAdminHttpClient).toHaveBeenCalledWith({
      baseUrl: "https://paperclip-board.internal.local",
      adminToken: "board-session-token",
      origin: "https://paperclip-board.internal.local",
      referer: "https://paperclip-board.internal.local/"
    });

    await runtime.processQueuePayload({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "workflow-1",
      createdByUserId: "user-1",
      idempotencyKey: "tenant-1:workflow-1:run-1",
      createdAt: new Date().toISOString()
    });

    const issueLaunch = vi.mocked(createPaperclipClient).mock.calls.at(-1)?.[0].issueLaunch;
    expect(issueLaunch).toBeDefined();
    const bindingRepository = vi.mocked(createPaperclipSecretBindingRepository).mock.results[0]?.value;
    bindingRepository.findActiveBySecretRef.mockResolvedValue(null);
    await expect(issueLaunch?.syncProviderSecretRefs?.({
      companyId: "pc-company-1",
      workflowId: "workflow-1",
      agentId: "pc-agent-1",
      providerContext: [
        {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Bound OpenAI",
          secretRef: "wf_secret_bound",
          metadata: {},
          secretValues: { apiKey: "sk-tenant" }
        }
      ]
    })).resolves.toEqual({
      adapterConfig: {
        env: {
          OPENAI_API_KEY: {
            type: "secret_ref",
            secretId: "pc-secret-1",
            version: 9
          }
        }
      }
    });

    const syncService = vi.mocked(createPaperclipSecretSyncService).mock.results[0]?.value;
    expect(syncService.syncBinding).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      wealthFactorySecretReferenceId: "11111111-1111-4111-8111-111111111111",
      paperclipCompanyId: "pc-company-1",
      paperclipAgentId: "pc-agent-1",
      paperclipEnvKey: "OPENAI_API_KEY",
      providerKind: "openai_api",
      secretValue: "sk-tenant",
      paperclipSecretKey: "OPENAI_API_KEY",
      bindToAgent: false
    });

    await expect(issueLaunch?.resolveLaunchTarget({
      companyId: "pc-company-1",
      workflowId: "workflow-1",
      providerContext: []
    })).resolves.toEqual({ agentId: "pc-agent-1" });

    await expect(issueLaunch?.resolveServiceToken?.({
      companyId: "pc-company-1",
      workflowId: "workflow-1",
      providerContext: []
    })).resolves.toBe("paperclip-service-token");

    await runtime.close();
  });

  it("reuses an existing synced Paperclip binding before attempting a fresh secret sync", async () => {
    const { createPaperclipClient } = await import("../src/paperclip/client.js");
    const {
      createPaperclipSecretBindingRepository,
      createPaperclipSecretSyncService
    } = await import("../src/paperclip/secret-sync.js");

    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_PAPERCLIP_LAUNCH_MODE: "issues",
        WF_PAPERCLIP_BOARD_SESSION_TOKEN: "board-session-token",
        WF_PAPERCLIP_BOARD_ORIGIN: "https://paperclip-board.internal.local/",
        WF_PAPERCLIP_ISSUE_AGENT_ID: "agent-fallback"
      })
    });

    await runtime.processQueuePayload({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "workflow-1",
      createdByUserId: "user-1",
      idempotencyKey: "tenant-1:workflow-1:run-1",
      createdAt: new Date().toISOString()
    });

    const bindingRepository = vi.mocked(createPaperclipSecretBindingRepository).mock.results[0]?.value;
    bindingRepository.findActiveBySecretRef.mockResolvedValue({
      tenantId: "tenant-1",
      wealthFactorySecretReferenceId: "11111111-1111-4111-8111-111111111111",
      paperclipCompanyId: "pc-company-1",
      paperclipAgentId: "pc-agent-1",
      paperclipEnvKey: "OPENAI_API_KEY",
      paperclipSecretId: "pc-secret-existing",
      paperclipSecretKey: "OPENAI_API_KEY",
      paperclipSecretVersion: "12",
      providerKind: "openai_api",
      bindingStatus: "synced",
      lastSyncedAt: "2026-05-20T17:00:00.000Z",
      lastError: null
    });

    const issueLaunch = vi.mocked(createPaperclipClient).mock.calls.at(-1)?.[0].issueLaunch;
    await expect(issueLaunch?.syncProviderSecretRefs?.({
      companyId: "pc-company-1",
      workflowId: "workflow-1",
      agentId: "pc-agent-1",
      providerContext: [
        {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Bound OpenAI",
          secretRef: "wf_secret_bound",
          metadata: {},
          secretValues: { apiKey: "sk-tenant" }
        }
      ]
    })).resolves.toEqual({
      adapterConfig: {
        env: {
          OPENAI_API_KEY: {
            type: "secret_ref",
            secretId: "pc-secret-existing",
            version: 12
          }
        }
      }
    });

    const syncService = vi.mocked(createPaperclipSecretSyncService).mock.results[0]?.value;
    expect(syncService.syncBinding).not.toHaveBeenCalled();

    await runtime.close();
  });

  it("recovers from a transient Paperclip sync failure when another worker already created the binding", async () => {
    const { createPaperclipClient } = await import("../src/paperclip/client.js");
    const {
      createPaperclipSecretBindingRepository,
      createPaperclipSecretSyncService
    } = await import("../src/paperclip/secret-sync.js");

    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_PAPERCLIP_LAUNCH_MODE: "issues",
        WF_PAPERCLIP_BOARD_SESSION_TOKEN: "board-session-token",
        WF_PAPERCLIP_BOARD_ORIGIN: "https://paperclip-board.internal.local/",
        WF_PAPERCLIP_ISSUE_AGENT_ID: "agent-fallback"
      })
    });

    await runtime.processQueuePayload({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "workflow-1",
      createdByUserId: "user-1",
      idempotencyKey: "tenant-1:workflow-1:run-1",
      createdAt: new Date().toISOString()
    });

    const bindingRepository = vi.mocked(createPaperclipSecretBindingRepository).mock.results[0]?.value;
    bindingRepository.findActiveBySecretRef
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        tenantId: "tenant-1",
        wealthFactorySecretReferenceId: "11111111-1111-4111-8111-111111111111",
        paperclipCompanyId: "pc-company-1",
        paperclipAgentId: "pc-agent-1",
        paperclipEnvKey: "OPENAI_API_KEY",
        paperclipSecretId: "pc-secret-raced",
        paperclipSecretKey: "OPENAI_API_KEY",
        paperclipSecretVersion: "13",
        providerKind: "openai_api",
        bindingStatus: "synced",
        lastSyncedAt: "2026-05-20T17:00:00.000Z",
        lastError: null
      });

    const syncService = vi.mocked(createPaperclipSecretSyncService).mock.results[0]?.value;
    syncService.syncBinding.mockRejectedValueOnce(new Error("Paperclip board-session request failed: 500"));

    const issueLaunch = vi.mocked(createPaperclipClient).mock.calls.at(-1)?.[0].issueLaunch;
    await expect(issueLaunch?.syncProviderSecretRefs?.({
      companyId: "pc-company-1",
      workflowId: "workflow-1",
      agentId: "pc-agent-1",
      providerContext: [
        {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Bound OpenAI",
          secretRef: "wf_secret_bound",
          metadata: {},
          secretValues: { apiKey: "sk-tenant" }
        }
      ]
    })).resolves.toEqual({
      adapterConfig: {
        env: {
          OPENAI_API_KEY: {
            type: "secret_ref",
            secretId: "pc-secret-raced",
            version: 13
          }
        }
      }
    });

    expect(syncService.syncBinding).toHaveBeenCalledTimes(1);

    await runtime.close();
  });

  it("falls back to an agentless synced binding lookup when the company-scoped secret was created under a different agent id", async () => {
    const { createPaperclipClient } = await import("../src/paperclip/client.js");
    const {
      createPaperclipSecretBindingRepository,
      createPaperclipSecretSyncService
    } = await import("../src/paperclip/secret-sync.js");

    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_PAPERCLIP_LAUNCH_MODE: "issues",
        WF_PAPERCLIP_BOARD_SESSION_TOKEN: "board-session-token",
        WF_PAPERCLIP_BOARD_ORIGIN: "https://paperclip-board.internal.local/",
        WF_PAPERCLIP_ISSUE_AGENT_ID: "agent-fallback"
      })
    });

    await runtime.processQueuePayload({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "workflow-1",
      createdByUserId: "user-1",
      idempotencyKey: "tenant-1:workflow-1:run-1",
      createdAt: new Date().toISOString()
    });

    const bindingRepository = vi.mocked(createPaperclipSecretBindingRepository).mock.results[0]?.value;
    bindingRepository.findActiveBySecretRef
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        tenantId: "tenant-1",
        wealthFactorySecretReferenceId: "11111111-1111-4111-8111-111111111111",
        paperclipCompanyId: "pc-company-1",
        paperclipAgentId: "pc-agent-older",
        paperclipEnvKey: "OPENAI_API_KEY",
        paperclipSecretId: "pc-secret-existing",
        paperclipSecretKey: "OPENAI_API_KEY",
        paperclipSecretVersion: "21",
        providerKind: "openai_api",
        bindingStatus: "synced",
        lastSyncedAt: "2026-05-20T17:00:00.000Z",
        lastError: null
      });

    const issueLaunch = vi.mocked(createPaperclipClient).mock.calls.at(-1)?.[0].issueLaunch;
    await expect(issueLaunch?.syncProviderSecretRefs?.({
      companyId: "pc-company-1",
      workflowId: "workflow-1",
      agentId: "pc-agent-current",
      providerContext: [
        {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Bound OpenAI",
          secretRef: "wf_secret_bound",
          metadata: {},
          secretValues: { apiKey: "sk-tenant" }
        }
      ]
    })).resolves.toEqual({
      adapterConfig: {
        env: {
          OPENAI_API_KEY: {
            type: "secret_ref",
            secretId: "pc-secret-existing",
            version: 21
          }
        }
      }
    });

    const syncService = vi.mocked(createPaperclipSecretSyncService).mock.results[0]?.value;
    expect(syncService.syncBinding).not.toHaveBeenCalled();

    await runtime.close();
  });

  it("uses a company-scoped Paperclip service token override when configured", async () => {
    const { createPaperclipClient } = await import("../src/paperclip/client.js");
    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_PAPERCLIP_LAUNCH_MODE: "issues",
        WF_PAPERCLIP_BOARD_SESSION_TOKEN: "board-session-token",
        WF_PAPERCLIP_BOARD_ORIGIN: "https://paperclip-board.internal.local/",
        WF_PAPERCLIP_ISSUE_AGENT_ID: "agent-fallback",
        WF_PAPERCLIP_SERVICE_TOKEN_MAP: JSON.stringify({
          "pc-company-1": "pc-company-1-token"
        })
      })
    });

    await runtime.processQueuePayload({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "workflow-1",
      createdByUserId: "user-1",
      idempotencyKey: "tenant-1:workflow-1:run-1",
      createdAt: new Date().toISOString()
    });

    const issueLaunch = vi.mocked(createPaperclipClient).mock.calls.at(-1)?.[0].issueLaunch;
    await expect(issueLaunch?.resolveServiceToken?.({
      companyId: "pc-company-1",
      workflowId: "workflow-1",
      providerContext: []
    })).resolves.toBe("pc-company-1-token");

    await runtime.close();
  });

  it("emits tenant-safe fairness snapshots while processing queue payloads", async () => {
    stdoutWrite.mockClear();
    const runtime = createWorkerRuntime({ env: loadWorkerEnv(validEnv), workerInstanceId: "worker-test-1" });

    await runtime.processQueuePayload({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "workflow-1",
      createdByUserId: "user-1",
      idempotencyKey: "tenant-1:workflow-1:run-1",
      createdAt: new Date().toISOString()
    });

    const logged = stdoutWrite.mock.calls
      .map(([value]) => String(value))
      .filter((value) => value.includes("wealth_factory_worker_fairness"));
    const allOutput = stdoutWrite.mock.calls.map(([value]) => String(value));

    expect(logged.length).toBeGreaterThan(0);
    expect(logged.some((line) => line.includes("\"tenantId\":\"tenant-1\""))).toBe(true);
    expect(allOutput.some((line) => line.includes("\"type\":\"wealth_factory_worker_run\""))).toBe(true);
    expect(allOutput.some((line) => line.includes("\"runId\":\"run-1\""))).toBe(true);
    expect(allOutput.some((line) => line.includes("\"event\":\"released\""))).toBe(true);
    expect(allOutput.some((line) => line.includes("\"workerInstanceId\":\"worker-test-1\""))).toBe(true);

    await runtime.close();
  });
});
