import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createWorkerRuntime, loadWorkerEnv } from "../src/worker/runtime.js";

const { makeHarnessRepository, harnessRepositoryRef } = vi.hoisted(() => {
  const createHarnessRepositoryMock = () => ({
    getRun: vi.fn().mockResolvedValue({
      id: "run-1",
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      state: "active",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      },
      createdAt: "2026-05-21T10:00:00.000Z",
      updatedAt: "2026-05-21T10:00:00.000Z"
    }),
    listCardsForRun: vi.fn().mockResolvedValue([
      {
        id: "card_ceo",
        runId: "run-1",
        parentCardId: null,
        persona: "ceo",
        title: "Plan run",
        deliverableType: "plan",
        state: "planning",
        createdAt: "2026-05-21T10:00:00.000Z",
        updatedAt: "2026-05-21T10:00:00.000Z"
      },
      {
        id: "card_cfo",
        runId: "run-1",
        parentCardId: "card_ceo",
        persona: "cfo",
        title: "Pressure-test the pricing lane",
        deliverableType: "pricing_review",
        state: "approved",
        createdAt: "2026-05-21T10:01:00.000Z",
        updatedAt: "2026-05-21T10:02:00.000Z"
      }
    ]),
    claimCardForExecution: vi.fn().mockResolvedValue({
      id: "card_cfo",
      runId: "run-1",
      parentCardId: "card_ceo",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review",
      state: "working",
      createdAt: "2026-05-21T10:01:00.000Z",
      updatedAt: "2026-05-21T10:04:00.000Z"
    }),
    updateRunState: vi.fn().mockImplementation(async ({ runId, state }) => ({
      id: runId,
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      state,
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      },
      createdAt: "2026-05-21T10:00:00.000Z",
      updatedAt: "2026-05-21T10:05:00.000Z"
    })),
    insertEvent: vi.fn().mockResolvedValue(undefined),
    upsertCardContinuity: vi.fn().mockResolvedValue(undefined),
    listProposalsForRun: vi.fn().mockResolvedValue([]),
    listCardContinuityForRun: vi.fn().mockResolvedValue([
      {
        cardId: "card_cfo",
        runId: "run-1",
        continuitySummary: "Resume the pricing lane from the revised assumptions workbook.",
        latestResultSummary: "Initial pricing floor is stable.",
        absorbedWorkItems: [],
        updatedAt: "2026-05-21T10:03:00.000Z"
      }
    ])
  });

  return {
    makeHarnessRepository: createHarnessRepositoryMock,
    harnessRepositoryRef: { current: createHarnessRepositoryMock() }
  };
});

vi.mock("../src/harness/repository.js", () => ({
  createPostgresHarnessRepository: vi.fn(() => harnessRepositoryRef.current)
}));

vi.mock("../src/db/postgres-client.js", () => ({
  createPgPool: vi.fn(() => ({
    end: vi.fn().mockResolvedValue(undefined)
  })),
  createPgPoolQueryClient: vi.fn(() => ({ query: vi.fn() })),
  createPgTransactionRunner: vi.fn(() => ({
    withTransaction: vi.fn(async (callback) => callback({ query: vi.fn() }))
  }))
}));

vi.mock("../src/db/supabase-repositories.js", () => ({
  createSupabaseRepositories: vi.fn(() => ({
    createSecretReference: vi.fn(),
    updateSecretRef: vi.fn(),
    revokeSecretReference: vi.fn(),
    findIdBySecretRef: vi.fn().mockResolvedValue("secret-1"),
    findSecretReferenceId: vi.fn().mockResolvedValue("11111111-1111-4111-8111-111111111111"),
    resolvePaperclipCompanyMapping: vi.fn().mockResolvedValue({ paperclipCompanyId: "pc-company-1", paperclipIssueAgentId: "pc-agent-1" }),
    hasActiveWorkflowRuns: vi.fn().mockResolvedValue(false),
    countActiveWorkflowRuns: vi.fn().mockResolvedValue(1),
    countRunningWorkflowRuns: vi.fn().mockResolvedValue(0)
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
  harnessRepositoryRef.current = makeHarnessRepository();
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
    const { createPaperclipClient } = await import("../src/paperclip/client.js");
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
    expect(createPaperclipClient).toHaveBeenCalled();

    await runtime.close();
  });

  it("routes harness-enabled workflows through the bounded lane-dispatch path with continuity resume focus", async () => {
    const { createPaperclipClient } = await import("../src/paperclip/client.js");
    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_HARNESS_ENABLED_WORKFLOW_IDS: "wf_connect_first_workflow"
      }),
      workerInstanceId: "worker-test-harness"
    });

    await expect(
      runtime.processQueuePayload({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        createdByUserId: "user-1",
        idempotencyKey: "tenant-1:wf_connect_first_workflow:run-1",
        createdAt: new Date().toISOString()
      })
    ).resolves.toEqual({
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      status: "running"
    });

    const harnessRepository = harnessRepositoryRef.current;
    expect(harnessRepository.getRun).toHaveBeenCalledWith("run-1");
    expect(harnessRepository.claimCardForExecution).toHaveBeenCalledWith({
      cardId: "card_cfo",
      expectedState: "approved"
    });
    expect(harnessRepository.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: "card_cfo",
        eventKind: "state_changed",
        payload: {
          from: "approved",
          to: "working"
        }
      })
    );
    expect(harnessRepository.upsertCardContinuity).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: "card_cfo",
        runId: "run-1",
        continuitySummary: "CFO should continue this active pricing review lane: Pressure-test the pricing lane.",
        latestResultSummary: "Initial pricing floor is stable."
      })
    );
    expect(vi.mocked(createPaperclipClient).mock.results.at(-1)?.value.createRun).not.toHaveBeenCalled();
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_lane_dispatch\"")
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"status\":\"running\"")
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"resumeFocus\":\"CFO should continue this active pricing review lane: Pressure-test the pricing lane.\"")
    );

    await runtime.close();
  });

  it("fails closed for terminal harness runs without emitting a stale lane dispatch", async () => {
    const { createAcidGuardRepository } = await import("../src/db/acid-guard-repository.js");
    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_HARNESS_ENABLED_WORKFLOW_IDS: "wf_connect_first_workflow"
      }),
      workerInstanceId: "worker-test-harness-terminal"
    });

    const harnessRepository = harnessRepositoryRef.current;
    harnessRepository.getRun.mockResolvedValueOnce({
      id: "run-1",
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      state: "done",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      },
      createdAt: "2026-05-21T10:00:00.000Z",
      updatedAt: "2026-05-21T10:00:00.000Z"
    });

    stdoutWrite.mockClear();
    await expect(
      runtime.processQueuePayload({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        createdByUserId: "user-1",
        idempotencyKey: "tenant-1:wf_connect_first_workflow:run-1",
        createdAt: new Date().toISOString()
      })
    ).resolves.toEqual({
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      status: "queued"
    });

    const acidRepository = vi.mocked(createAcidGuardRepository).mock.results[0]?.value;
    expect(stdoutWrite).not.toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_lane_dispatch\"")
    );
    expect(acidRepository.transitionWorkflowRunStatus).not.toHaveBeenCalled();
    expect(harnessRepository.insertEvent).not.toHaveBeenCalled();
    expect(harnessRepository.upsertCardContinuity).not.toHaveBeenCalled();

    await runtime.close();
  });

  it("stays quiet when a harness run is active but has no actionable child lane", async () => {
    const { createAcidGuardRepository } = await import("../src/db/acid-guard-repository.js");
    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_HARNESS_ENABLED_WORKFLOW_IDS: "wf_connect_first_workflow"
      }),
      workerInstanceId: "worker-test-harness-idle"
    });

    const harnessRepository = harnessRepositoryRef.current;
    harnessRepository.listCardsForRun.mockResolvedValueOnce([
      {
        id: "card_ceo",
        runId: "run-1",
        parentCardId: null,
        persona: "ceo",
        title: "Plan run",
        deliverableType: "plan",
        state: "planning",
        createdAt: "2026-05-21T10:00:00.000Z",
        updatedAt: "2026-05-21T10:00:00.000Z"
      },
      {
        id: "card_cfo",
        runId: "run-1",
        parentCardId: "card_ceo",
        persona: "cfo",
        title: "Waiting on pricing review",
        deliverableType: "pricing_review",
        state: "done",
        createdAt: "2026-05-21T10:01:00.000Z",
        updatedAt: "2026-05-21T10:02:00.000Z"
      }
    ]);

    stdoutWrite.mockClear();
    await expect(
      runtime.processQueuePayload({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        createdByUserId: "user-1",
        idempotencyKey: "tenant-1:wf_connect_first_workflow:run-1",
        createdAt: new Date().toISOString()
      })
    ).resolves.toEqual({
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      status: "queued"
    });

    const acidRepository = vi.mocked(createAcidGuardRepository).mock.results[0]?.value;
    expect(stdoutWrite).not.toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_lane_dispatch\"")
    );
    expect(acidRepository.transitionWorkflowRunStatus).not.toHaveBeenCalled();

    await runtime.close();
  });

  it("stays quiet when the worker loses the approved-lane claim race", async () => {
    const { createAcidGuardRepository } = await import("../src/db/acid-guard-repository.js");
    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_HARNESS_ENABLED_WORKFLOW_IDS: "wf_connect_first_workflow"
      }),
      workerInstanceId: "worker-test-harness-raced"
    });

    const harnessRepository = harnessRepositoryRef.current;
    harnessRepository.claimCardForExecution.mockResolvedValueOnce(null);

    stdoutWrite.mockClear();
    await expect(
      runtime.processQueuePayload({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        createdByUserId: "user-1",
        idempotencyKey: "tenant-1:wf_connect_first_workflow:run-1",
        createdAt: new Date().toISOString()
      })
    ).resolves.toEqual({
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      status: "queued"
    });

    const acidRepository = vi.mocked(createAcidGuardRepository).mock.results[0]?.value;
    expect(stdoutWrite).not.toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_lane_dispatch\"")
    );
    expect(acidRepository.transitionWorkflowRunStatus).not.toHaveBeenCalled();

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
            maxPollAttempts: 60,
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
      paperclipSecretKey: "OPENAI_API_KEY"
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

  it("fails closed instead of rebinding the Paperclip issue agent while another tenant run is still active", async () => {
    const { createPaperclipClient } = await import("../src/paperclip/client.js");
    const {
      createPaperclipSecretBindingRepository,
      createPaperclipSecretSyncService
    } = await import("../src/paperclip/secret-sync.js");
    const { createSupabaseRepositories } = await import("../src/db/supabase-repositories.js");

    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_PAPERCLIP_LAUNCH_MODE: "issues",
        WF_PAPERCLIP_BOARD_SESSION_TOKEN: "board-session-token",
        WF_PAPERCLIP_BOARD_ORIGIN: "https://paperclip-board.internal.local/",
        WF_PAPERCLIP_ISSUE_AGENT_ID: "agent-fallback"
      })
    });
    const repositories = vi.mocked(createSupabaseRepositories).mock.results[0]?.value;
    repositories.countRunningWorkflowRuns.mockResolvedValue(1);
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

    await expect(
      issueLaunch?.syncProviderSecretRefs?.({
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
      })
    ).rejects.toThrow("Paperclip secret binding refresh deferred");

    const syncService = vi.mocked(createPaperclipSecretSyncService).mock.results[0]?.value;
    expect(syncService.syncBinding).not.toHaveBeenCalled();

    await runtime.close();
  });

  it("allows first-use Paperclip secret refresh when only queued follow-up runs exist", async () => {
    const { createPaperclipClient } = await import("../src/paperclip/client.js");
    const {
      createPaperclipSecretBindingRepository,
      createPaperclipSecretSyncService
    } = await import("../src/paperclip/secret-sync.js");
    const { createSupabaseRepositories } = await import("../src/db/supabase-repositories.js");

    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_PAPERCLIP_LAUNCH_MODE: "issues",
        WF_PAPERCLIP_BOARD_SESSION_TOKEN: "board-session-token",
        WF_PAPERCLIP_BOARD_ORIGIN: "https://paperclip-board.internal.local/",
        WF_PAPERCLIP_ISSUE_AGENT_ID: "agent-fallback"
      })
    });
    const repositories = vi.mocked(createSupabaseRepositories).mock.results[0]?.value;
    repositories.countActiveWorkflowRuns.mockResolvedValue(2);
    repositories.countRunningWorkflowRuns.mockResolvedValue(0);

    await runtime.processQueuePayload({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "workflow-1",
      createdByUserId: "user-1",
      idempotencyKey: "tenant-1:workflow-1:run-1",
      createdAt: new Date().toISOString()
    });

    const issueLaunch = vi.mocked(createPaperclipClient).mock.calls.at(-1)?.[0].issueLaunch;
    const bindingRepository = vi.mocked(createPaperclipSecretBindingRepository).mock.results[0]?.value;
    bindingRepository.findActiveBySecretRef.mockResolvedValue(null);

    const syncService = vi.mocked(createPaperclipSecretSyncService).mock.results[0]?.value;
    syncService.syncBinding.mockResolvedValueOnce({
      paperclipSecretId: "pc-secret-bootstrap",
      paperclipSecretKey: "OPENAI_API_KEY",
      paperclipSecretVersion: "19"
    });

    await expect(
      issueLaunch?.syncProviderSecretRefs?.({
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
      })
    ).resolves.toEqual({
      adapterConfig: {
        env: {
          OPENAI_API_KEY: {
            type: "secret_ref",
            secretId: "pc-secret-bootstrap",
            version: 19
          }
        }
      }
    });

    expect(syncService.syncBinding).toHaveBeenCalledTimes(1);

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

    expect(syncService.syncBinding).not.toHaveBeenCalled();

    await runtime.close();
  });

  it("retries a transient Paperclip board-session sync failure when no existing binding is available yet", async () => {
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
    bindingRepository.findActiveBySecretRef.mockResolvedValue(null);

    const syncService = vi.mocked(createPaperclipSecretSyncService).mock.results[0]?.value;
    syncService.syncBinding
      .mockRejectedValueOnce(new Error("Paperclip board-session request failed: 500"))
      .mockResolvedValueOnce({
        paperclipSecretId: "pc-secret-retry",
        paperclipSecretKey: "OPENAI_API_KEY",
        paperclipSecretVersion: "17"
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
            secretId: "pc-secret-retry",
            version: 17
          }
        }
      }
    });

    expect(syncService.syncBinding).toHaveBeenCalledTimes(2);

    await runtime.close();
  });

  it("deduplicates concurrent same-worker Paperclip secret sync attempts for the same tenant and agent binding", async () => {
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
    bindingRepository.findActiveBySecretRef.mockResolvedValue(null);

    const syncResolver: {
      current: ((value: { paperclipSecretId: string; paperclipSecretKey: string; paperclipSecretVersion: string }) => void) | null;
    } = { current: null };
    const syncService = vi.mocked(createPaperclipSecretSyncService).mock.results[0]?.value;
    syncService.syncBinding.mockImplementationOnce(
      () =>
        new Promise<{ paperclipSecretId: string; paperclipSecretKey: string; paperclipSecretVersion: string }>((resolve) => {
          syncResolver.current = resolve;
        })
    );

    const issueLaunch = vi.mocked(createPaperclipClient).mock.calls.at(-1)?.[0].issueLaunch;
    const syncInput = {
      companyId: "pc-company-1",
      workflowId: "workflow-1",
      agentId: "pc-agent-1",
      providerContext: [
        {
          capability: "text_generation" as const,
          providerKind: "openai_api" as const,
          label: "Bound OpenAI",
          secretRef: "wf_secret_bound",
          metadata: {},
          secretValues: { apiKey: "sk-tenant" }
        }
      ]
    };

    const first = issueLaunch?.syncProviderSecretRefs?.(syncInput);
    const second = issueLaunch?.syncProviderSecretRefs?.(syncInput);

    await vi.waitFor(() => {
      expect(syncService.syncBinding).toHaveBeenCalledTimes(1);
    });

    const completeSync = syncResolver.current;
    expect(completeSync).not.toBeNull();
    completeSync?.({
      paperclipSecretId: "pc-secret-shared",
      paperclipSecretKey: "OPENAI_API_KEY",
      paperclipSecretVersion: "18"
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      {
        adapterConfig: {
          env: {
            OPENAI_API_KEY: {
              type: "secret_ref",
              secretId: "pc-secret-shared",
              version: 18
            }
          }
        }
      },
      {
        adapterConfig: {
          env: {
            OPENAI_API_KEY: {
              type: "secret_ref",
              secretId: "pc-secret-shared",
              version: 18
            }
          }
        }
      }
    ]);

    await runtime.close();
  });

  it("does not deduplicate concurrent Paperclip secret sync attempts across different agents", async () => {
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
    bindingRepository.findActiveBySecretRef.mockResolvedValue(null);

    const syncService = vi.mocked(createPaperclipSecretSyncService).mock.results[0]?.value;
    syncService.syncBinding
      .mockResolvedValueOnce({
        paperclipSecretId: "pc-secret-agent-1",
        paperclipSecretKey: "OPENAI_API_KEY",
        paperclipSecretVersion: "21"
      })
      .mockResolvedValueOnce({
        paperclipSecretId: "pc-secret-agent-2",
        paperclipSecretKey: "OPENAI_API_KEY",
        paperclipSecretVersion: "22"
      });

    const issueLaunch = vi.mocked(createPaperclipClient).mock.calls.at(-1)?.[0].issueLaunch;
    const baseInput = {
      companyId: "pc-company-1",
      workflowId: "workflow-1",
      providerContext: [
        {
          capability: "text_generation" as const,
          providerKind: "openai_api" as const,
          label: "Bound OpenAI",
          secretRef: "wf_secret_bound",
          metadata: {},
          secretValues: { apiKey: "sk-tenant" }
        }
      ]
    };

    await expect(Promise.all([
      issueLaunch?.syncProviderSecretRefs?.({
        ...baseInput,
        agentId: "pc-agent-1"
      }),
      issueLaunch?.syncProviderSecretRefs?.({
        ...baseInput,
        agentId: "pc-agent-2"
      })
    ])).resolves.toEqual([
      {
        adapterConfig: {
          env: {
            OPENAI_API_KEY: {
              type: "secret_ref",
              secretId: "pc-secret-agent-1",
              version: 21
            }
          }
        }
      },
      {
        adapterConfig: {
          env: {
            OPENAI_API_KEY: {
              type: "secret_ref",
              secretId: "pc-secret-agent-2",
              version: 22
            }
          }
        }
      }
    ]);

    expect(syncService.syncBinding).toHaveBeenCalledTimes(2);

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
