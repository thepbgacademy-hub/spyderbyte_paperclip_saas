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
    getCard: vi.fn().mockImplementation(async (cardId: string) => {
      if (cardId === "card_cmo") {
        return {
          id: "card_cmo",
          runId: "run-1",
          parentCardId: "card_ceo",
          persona: "cmo",
          title: "Prepare launch messaging",
          deliverableType: "marketing_plan",
          state: "working",
          executionClaimToken: "claim-cmo-active",
          executionClaimedAt: "2026-05-21T10:07:30.000Z",
          createdAt: "2026-05-21T10:05:00.000Z",
          updatedAt: "2026-05-21T10:08:00.000Z"
        };
      }
      if (cardId === "card_cfo") {
        return {
          id: "card_cfo",
          runId: "run-1",
          parentCardId: "card_ceo",
          persona: "cfo",
          title: "Pressure-test the pricing lane",
          deliverableType: "pricing_review",
          state: "working",
          executionClaimToken: "claim-cfo-1",
          executionClaimedAt: "2026-05-21T10:04:00.000Z",
          createdAt: "2026-05-21T10:01:00.000Z",
          updatedAt: "2026-05-21T10:04:00.000Z"
        };
      }
      return null;
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
        executionClaimToken: null,
        executionClaimedAt: null,
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
        executionClaimToken: null,
        executionClaimedAt: null,
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
      executionClaimToken: "claim-cfo-1",
      executionClaimedAt: "2026-05-21T10:04:00.000Z",
      createdAt: "2026-05-21T10:01:00.000Z",
      updatedAt: "2026-05-21T10:04:00.000Z"
    }),
    refreshCardExecutionClaim: vi.fn().mockResolvedValue({
      id: "card_cfo",
      runId: "run-1",
      parentCardId: "card_ceo",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review",
      state: "working",
      executionClaimToken: "claim-cfo-refreshed",
      executionClaimedAt: "2026-05-21T10:04:30.000Z",
      createdAt: "2026-05-21T10:01:00.000Z",
      updatedAt: "2026-05-21T10:04:30.000Z"
    }),
    transitionCardState: vi.fn().mockImplementation(async ({ cardId, state }) => ({
      id: cardId,
      runId: "run-1",
      parentCardId: "card_ceo",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review",
      state,
      executionClaimToken: state === "working" ? "claim-cfo-transitioned" : null,
      executionClaimedAt: state === "working" ? "2026-05-21T10:05:00.000Z" : null,
      createdAt: "2026-05-21T10:01:00.000Z",
      updatedAt: "2026-05-21T10:05:00.000Z"
    })),
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
    getCardContinuity: vi.fn().mockImplementation(async (cardId: string) => {
      if (cardId === "card_cmo") {
        return {
          cardId: "card_cmo",
          runId: "run-1",
          continuitySource: "state_transition",
          continuitySummary: "CMO should continue this active marketing plan lane: Prepare launch messaging.",
          latestResultSummary: null,
          absorbedWorkItems: [],
          updatedAt: "2026-05-21T10:07:00.000Z"
        };
      }
      if (cardId === "card_cfo") {
        return {
          cardId: "card_cfo",
          runId: "run-1",
          continuitySource: "state_transition",
          continuitySummary: "CFO should continue this active pricing review lane: Pressure-test the pricing lane.",
          latestResultSummary: "Initial pricing floor is stable.",
          absorbedWorkItems: ["Re-check discount floor", "Verify competitor anchor notes"],
          updatedAt: "2026-05-21T10:03:00.000Z"
        };
      }
      return null;
    }),
    listProposalsForRun: vi.fn().mockResolvedValue([]),
    listEventsForRun: vi.fn().mockResolvedValue([]),
    listCardContinuityForRun: vi.fn().mockResolvedValue([
      {
        cardId: "card_cfo",
        runId: "run-1",
        continuitySource: "resume_override",
        continuitySummary: "Resume the pricing lane from the revised assumptions workbook.",
        latestResultSummary: "Initial pricing floor is stable.",
        absorbedWorkItems: ["Re-check discount floor", "Verify competitor anchor notes"],
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
      from: ["queued", "running"],
      to: "queued"
    });
    expect(createPaperclipClient).toHaveBeenCalled();

    await runtime.close();
  });

  it("routes harness-enabled workflows through the bounded lane-dispatch path with continuity resume focus", async () => {
    const { createPaperclipClient } = await import("../src/paperclip/client.js");
    const onHarnessLaneReady = vi.fn();
    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_HARNESS_ENABLED_WORKFLOW_IDS: "wf_connect_first_workflow"
      }),
      workerInstanceId: "worker-test-harness",
      onHarnessLaneReady
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
    expect(harnessRepository.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: "card_cfo",
        eventKind: "execution_claimed",
        payload: {
          claimKind: "approved_claim",
          claimedAt: "2026-05-21T10:04:00.000Z",
          previousClaimedAt: null
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
    expect(onHarnessLaneReady).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        requiredCapabilities: ["text_generation"],
        runtimeContext: {
          providerKind: "openai_api",
          credentialLabel: "Primary OpenAI"
        },
        executionClaim: {
          kind: "approved_claim",
          token: "claim-cfo-1",
          claimedAt: "2026-05-21T10:04:00.000Z",
          previousClaimedAt: null
        },
        continuityContext: {
          source: "state_transition",
          summary: "CFO should continue this active pricing review lane: Pressure-test the pricing lane.",
          latestResultSummary: "Initial pricing floor is stable.",
          absorbedWorkCount: 2,
          latestAbsorbedWork: {
            resolution: "update_existing_lane",
            requestedByPersona: null,
            title: "Verify competitor anchor notes",
            label: "Verify competitor anchor notes"
          },
          absorbedWorkTrail: [
            {
              resolution: "update_existing_lane",
              requestedByPersona: null,
              title: "Re-check discount floor",
              label: "Re-check discount floor"
            },
            {
              resolution: "update_existing_lane",
              requestedByPersona: null,
              title: "Verify competitor anchor notes",
              label: "Verify competitor anchor notes"
            }
          ]
        },
        dispatchHandoff: {
          kind: "initial_claim",
          kindLabel: "Initial lane claim",
          executionStage: "initial_lane_start",
          executionStageLabel: "Initial lane start"
        },
        laneExecution: expect.objectContaining({
          cardId: "card_cfo",
          parentCardId: "card_ceo",
          persona: "cfo",
          title: "Pressure-test the pricing lane",
          deliverableType: "pricing_review",
          state: "working",
          resumeFocus: "CFO should continue this active pricing review lane: Pressure-test the pricing lane.",
          continuitySource: "state_transition",
          latestResultSummary: "Initial pricing floor is stable.",
          absorbedWorkItems: ["Re-check discount floor", "Verify competitor anchor notes"]
        }),
        outcomeContract: {
          allowedStates: ["waiting", "done", "blocked", "cancelled"],
          resultSummaryRequiredStates: ["done"],
          resumeSummaryAllowedStates: ["waiting", "blocked", "cancelled"]
        }
      })
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_lane_dispatch\"")
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"dispatchHandoff\":{\"kind\":\"initial_claim\"")
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"status\":\"running\"")
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"resumeFocus\":\"CFO should continue this active pricing review lane: Pressure-test the pricing lane.\"")
    );
    expect(stdoutWrite).not.toHaveBeenCalledWith(expect.stringContaining("\"requiredCapabilities\""));
    expect(stdoutWrite).not.toHaveBeenCalledWith(expect.stringContaining("\"runtimeContext\""));
    expect(stdoutWrite).not.toHaveBeenCalledWith(expect.stringContaining("\"absorbedWorkItems\""));
    expect(stdoutWrite).not.toHaveBeenCalledWith(expect.stringContaining("\"continuityContext\""));
    expect(stdoutWrite).not.toHaveBeenCalledWith(expect.stringContaining("\"outcomeContract\""));

    await runtime.close();
  });

  it("keeps a durably claimed harness lane running when the private execution-envelope hook rejects", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_HARNESS_ENABLED_WORKFLOW_IDS: "wf_connect_first_workflow"
      }),
      workerInstanceId: "worker-test-harness-hook-reject",
      onHarnessLaneReady: vi.fn().mockRejectedValue(new Error("hook unavailable"))
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

    expect(warn).toHaveBeenCalledWith(
      "Harness lane-ready hook failed after durable lane claim",
      expect.objectContaining({
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        cardId: "card_cfo"
      })
    );

    warn.mockRestore();
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
    harnessRepository.listCardsForRun.mockResolvedValue([
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
    const onHarnessLaneReady = vi.fn();
    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_HARNESS_ENABLED_WORKFLOW_IDS: "wf_connect_first_workflow"
      }),
      workerInstanceId: "worker-test-harness-raced",
      onHarnessLaneReady
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
    expect(onHarnessLaneReady).not.toHaveBeenCalled();

    await runtime.close();
  });

  it("commits a private harness lane outcome and emits a bounded worker event", async () => {
    const { createAcidGuardRepository } = await import("../src/db/acid-guard-repository.js");
    const onHarnessLaneOutcomeCommitted = vi.fn();
    const onHarnessLaneDone = vi.fn();
    const onHarnessPostOutcomeAction = vi.fn();
    const onHarnessCeoReviewRequested = vi.fn();
    const onHarnessLaneResumeAwaited = vi.fn();
    const onHarnessLaneUnblockAwaited = vi.fn();
    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_HARNESS_ENABLED_WORKFLOW_IDS: "wf_connect_first_workflow"
      }),
      workerInstanceId: "worker-test-harness-outcome",
      onHarnessLaneOutcomeCommitted,
      onHarnessLaneDone,
      onHarnessPostOutcomeAction,
      onHarnessCeoReviewRequested,
      onHarnessLaneResumeAwaited,
      onHarnessLaneUnblockAwaited
    });

    stdoutWrite.mockClear();
    const harnessRepository = harnessRepositoryRef.current;
    harnessRepository.getRun
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({
        id: "run-1",
        tenantId: "tenant-1",
        workflowId: "wf_connect_first_workflow",
        packageId: "pkg_bib_connect",
        orchestratorPersona: "ceo",
        state: "assembling",
        runtimeContext: {
          providerKind: "openai_api",
          credentialLabel: "Primary OpenAI"
        },
        createdAt: "2026-05-21T10:00:00.000Z",
        updatedAt: "2026-05-21T10:05:00.000Z"
      });
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
        title: "Pressure-test the pricing lane",
        deliverableType: "pricing_review",
        state: "done",
        createdAt: "2026-05-21T10:01:00.000Z",
        updatedAt: "2026-05-21T10:05:00.000Z"
      }
    ]);
    await expect(
      runtime.commitHarnessLaneOutcome({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        cardId: "card_cfo",
        executionClaimToken: "claim-cfo-1",
        state: "done",
        resultSummary: "Validated the pricing model and preserved the final floor."
      })
    ).resolves.toEqual({
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      status: "committed",
      attentionTransition: {
        kind: "requested",
        requestedAction: {
          kind: "queue_ceo_review",
          runState: "assembling",
          reason: "final_assembly"
        }
      },
      laneExecution: {
        cardId: "card_cfo",
        state: "done",
        runState: "assembling",
        latestResultSummary: "Validated the pricing model and preserved the final floor."
      },
      postOutcomeAction: {
        kind: "queue_ceo_review",
        runState: "assembling",
        reason: "final_assembly"
      }
    });

    expect(harnessRepository.transitionCardState).toHaveBeenCalledWith({
      cardId: "card_cfo",
      expectedState: "working",
      expectedExecutionClaimToken: "claim-cfo-1",
      state: "done"
    });
    expect(harnessRepository.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: "card_cfo",
        eventKind: "result_recorded",
        payload: {
          summary: "Validated the pricing model and preserved the final floor."
        }
      })
    );
    expect(harnessRepository.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: "card_cfo",
        eventKind: "attention_requested",
        payload: {
          actionKind: "queue_ceo_review",
          runState: "assembling",
          reason: "final_assembly",
          statusLabel: "CEO review required",
          summary: "The board is ready for final assembly before the tenant-facing package is closed.",
          reasonLabel: "Final assembly",
          targetPersona: "ceo"
        }
      })
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_lane_outcome\"")
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_lane_outcome_committed\"")
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_lane_done\"")
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"status\":\"committed\"")
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"postOutcomeAction\":{\"kind\":\"queue_ceo_review\",\"runState\":\"assembling\",\"reason\":\"final_assembly\"}")
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_post_outcome_action\"")
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_ceo_review_requested\"")
    );
    expect(onHarnessPostOutcomeAction).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      action: {
        kind: "queue_ceo_review",
        runState: "assembling",
        reason: "final_assembly"
      },
      laneExecution: {
        cardId: "card_cfo",
        state: "done",
        runState: "assembling",
        latestResultSummary: "Validated the pricing model and preserved the final floor."
      }
    });
    expect(onHarnessLaneOutcomeCommitted).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      attentionTransition: {
        kind: "requested",
        requestedAction: {
          kind: "queue_ceo_review",
          runState: "assembling",
          reason: "final_assembly"
        }
      },
      laneExecution: {
        cardId: "card_cfo",
        state: "done",
        runState: "assembling",
        latestResultSummary: "Validated the pricing model and preserved the final floor."
      },
      postOutcomeAction: {
        kind: "queue_ceo_review",
        runState: "assembling",
        reason: "final_assembly"
      }
    });
    expect(onHarnessLaneDone).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      attentionTransition: {
        kind: "requested",
        requestedAction: {
          kind: "queue_ceo_review",
          runState: "assembling",
          reason: "final_assembly"
        }
      },
      laneExecution: {
        cardId: "card_cfo",
        state: "done",
        runState: "assembling",
        latestResultSummary: "Validated the pricing model and preserved the final floor."
      },
      postOutcomeAction: {
        kind: "queue_ceo_review",
        runState: "assembling",
        reason: "final_assembly"
      }
    });
    expect(onHarnessCeoReviewRequested).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      action: {
        kind: "queue_ceo_review",
        runState: "assembling",
        reason: "final_assembly"
      },
      laneExecution: {
        cardId: "card_cfo",
        state: "done",
        runState: "assembling",
        latestResultSummary: "Validated the pricing model and preserved the final floor."
      }
    });
    expect(onHarnessLaneResumeAwaited).not.toHaveBeenCalled();
    expect(onHarnessLaneUnblockAwaited).not.toHaveBeenCalled();
    const acidRepository = vi.mocked(createAcidGuardRepository).mock.results.at(-1)?.value;
    expect(acidRepository.transitionWorkflowRunStatus).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      from: ["queued", "running"],
      to: "queued"
    });

    await runtime.close();
  });

  it("still runs the specific CEO review handler when the generic post-outcome hook rejects", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const onHarnessLaneOutcomeCommitted = vi.fn().mockRejectedValue(new Error("committed handoff unavailable"));
    const onHarnessLaneDone = vi.fn();
    const onHarnessPostOutcomeAction = vi.fn().mockRejectedValue(new Error("generic handoff unavailable"));
    const onHarnessCeoReviewRequested = vi.fn();
    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_HARNESS_ENABLED_WORKFLOW_IDS: "wf_connect_first_workflow"
      }),
      workerInstanceId: "worker-test-harness-post-outcome-hook-reject",
      onHarnessLaneOutcomeCommitted,
      onHarnessLaneDone,
      onHarnessPostOutcomeAction,
      onHarnessCeoReviewRequested
    });

    const harnessRepository = harnessRepositoryRef.current;
    harnessRepository.getRun
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({
        id: "run-1",
        tenantId: "tenant-1",
        workflowId: "wf_connect_first_workflow",
        packageId: "pkg_bib_connect",
        orchestratorPersona: "ceo",
        state: "assembling",
        runtimeContext: {
          providerKind: "openai_api",
          credentialLabel: "Primary OpenAI"
        },
        createdAt: "2026-05-21T10:00:00.000Z",
        updatedAt: "2026-05-21T10:05:00.000Z"
      });
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
        title: "Pressure-test the pricing lane",
        deliverableType: "pricing_review",
        state: "done",
        createdAt: "2026-05-21T10:01:00.000Z",
        updatedAt: "2026-05-21T10:05:00.000Z"
      }
    ]);

    await expect(
      runtime.commitHarnessLaneOutcome({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        cardId: "card_cfo",
        executionClaimToken: "claim-cfo-1",
        state: "done",
        resultSummary: "Validated the pricing model and preserved the final floor."
      })
    ).resolves.toEqual({
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      status: "committed",
      attentionTransition: {
        kind: "requested",
        requestedAction: {
          kind: "queue_ceo_review",
          runState: "assembling",
          reason: "final_assembly"
        }
      },
      laneExecution: {
        cardId: "card_cfo",
        state: "done",
        runState: "assembling",
        latestResultSummary: "Validated the pricing model and preserved the final floor."
      },
      postOutcomeAction: {
        kind: "queue_ceo_review",
        runState: "assembling",
        reason: "final_assembly"
      }
    });

    expect(onHarnessPostOutcomeAction).toHaveBeenCalledTimes(1);
    expect(onHarnessLaneOutcomeCommitted).toHaveBeenCalledTimes(1);
    expect(onHarnessLaneDone).toHaveBeenCalledTimes(1);
    expect(onHarnessCeoReviewRequested).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      action: {
        kind: "queue_ceo_review",
        runState: "assembling",
        reason: "final_assembly"
      },
      laneExecution: {
        cardId: "card_cfo",
        state: "done",
        runState: "assembling",
        latestResultSummary: "Validated the pricing model and preserved the final floor."
      }
    });
    expect(warn).toHaveBeenCalledWith(
      "Harness committed-outcome hook failed after durable worker outcome",
      expect.objectContaining({
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        cardId: "card_cfo"
      })
    );
    expect(warn).toHaveBeenCalledWith(
      "Harness post-outcome hook failed after durable worker outcome",
      expect.objectContaining({
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        cardId: "card_cfo",
        actionKind: "queue_ceo_review"
      })
    );

    warn.mockRestore();
    await runtime.close();
  });

  it("emits a follow-on harness dispatch when a committed lane outcome frees the next approved lane", async () => {
    const { createAcidGuardRepository } = await import("../src/db/acid-guard-repository.js");
    const onHarnessLaneReady = vi.fn();
    const onHarnessLaneOutcomeCommitted = vi.fn();
    const onHarnessLaneDone = vi.fn();
    const onHarnessAttentionResolved = vi.fn();
    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_HARNESS_ENABLED_WORKFLOW_IDS: "wf_connect_first_workflow"
      }),
      workerInstanceId: "worker-test-harness-follow-on",
      onHarnessLaneOutcomeCommitted,
      onHarnessLaneDone,
      onHarnessLaneReady,
      onHarnessAttentionResolved
    });

    const harnessRepository = harnessRepositoryRef.current;
    harnessRepository.listCardsForRun.mockResolvedValue([
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
        title: "Finalize pricing review",
        deliverableType: "pricing_review",
        state: "done",
        createdAt: "2026-05-21T10:01:00.000Z",
        updatedAt: "2026-05-21T10:06:00.000Z"
      },
      {
        id: "card_cmo",
        runId: "run-1",
        parentCardId: "card_ceo",
        persona: "cmo",
        title: "Prepare launch messaging",
        deliverableType: "marketing_plan",
        state: "approved",
        createdAt: "2026-05-21T10:02:00.000Z",
        updatedAt: "2026-05-21T10:03:00.000Z"
      }
    ]);
    harnessRepository.listCardContinuityForRun.mockResolvedValue([
      {
        cardId: "card_cmo",
        runId: "run-1",
        continuitySummary: "Resume the launch messaging lane from the approved positioning draft.",
        latestResultSummary: null,
        absorbedWorkItems: [],
        updatedAt: "2026-05-21T10:03:00.000Z"
      }
    ]);
    harnessRepository.listEventsForRun.mockResolvedValueOnce([
      {
        id: "event_attention_requested",
        cardId: "card_cfo",
        eventKind: "attention_requested",
        payload: {
          actionKind: "queue_ceo_review",
          runState: "assembling",
          reason: "final_assembly"
        },
        createdAt: "2026-05-21T10:05:00.000Z"
      }
    ]);
    harnessRepository.claimCardForExecution.mockResolvedValueOnce({
      id: "card_cmo",
      runId: "run-1",
      parentCardId: "card_ceo",
      persona: "cmo",
      title: "Prepare launch messaging",
      deliverableType: "marketing_plan",
      state: "working",
      createdAt: "2026-05-21T10:02:00.000Z",
      updatedAt: "2026-05-21T10:07:00.000Z"
    });

    stdoutWrite.mockClear();
    await expect(
      runtime.commitHarnessLaneOutcome({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        cardId: "card_cfo",
        executionClaimToken: "claim-cfo-1",
        state: "done",
        resultSummary: "Pricing review is complete and ready for board packaging."
      })
    ).resolves.toEqual({
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      status: "committed",
      attentionTransition: {
        kind: "resolved",
        resolvedAction: {
          kind: "queue_ceo_review",
          runState: "assembling",
          reason: "final_assembly"
        }
      },
      laneExecution: {
        cardId: "card_cfo",
        state: "done",
        runState: "active",
        latestResultSummary: "Pricing review is complete and ready for board packaging."
      },
      postOutcomeAction: {
        kind: "dispatch_next_lane",
        runState: "active",
        cardId: "card_cmo",
        persona: "cmo"
      },
      nextDispatch: {
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        status: "running",
        dispatchHandoff: {
          kind: "follow_on_dispatch",
          kindLabel: "Follow-on dispatch",
          executionStage: "post_outcome_follow_on",
          executionStageLabel: "Post-outcome follow-on",
          reactivatedRun: false,
          triggeredByCardId: "card_cfo",
          triggeredByPersona: "cfo",
          triggeredByOutcomeState: "done",
          triggeredByResultSummary: "Pricing review is complete and ready for board packaging."
        },
        laneExecution: {
          cardId: "card_cmo",
          persona: "cmo",
          title: "Prepare launch messaging",
          deliverableType: "marketing_plan",
          state: "working",
          resumeFocus: "CMO should continue this active marketing plan lane: Prepare launch messaging."
        }
      }
    });

    expect(harnessRepository.claimCardForExecution).toHaveBeenCalledWith({
      cardId: "card_cmo",
      expectedState: "approved"
    });
    expect(harnessRepository.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: "card_cfo",
        eventKind: "attention_resolved",
        payload: {
          actionKind: "queue_ceo_review",
          runState: "assembling",
          reason: "final_assembly",
          statusLabel: "CEO review required",
          summary: "The board is ready for final assembly before the tenant-facing package is closed.",
          reasonLabel: "Final assembly",
          targetPersona: "ceo"
        }
      })
    );
    expect(harnessRepository.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: "card_cmo",
        eventKind: "execution_dispatched",
        payload: {
          kind: "follow_on_dispatch",
          kindLabel: "Follow-on dispatch",
          executionStage: "post_outcome_follow_on",
          executionStageLabel: "Post-outcome follow-on",
          reactivatedRun: false,
          triggeredByCardId: "card_cfo",
          triggeredByPersona: "cfo",
          triggeredByOutcomeState: "done",
          triggeredByResultSummary: "Pricing review is complete and ready for board packaging."
        }
      })
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_lane_outcome_committed\"")
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_lane_done\"")
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_attention_resolved\"")
    );
    expect(onHarnessLaneOutcomeCommitted).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      attentionTransition: {
        kind: "resolved",
        resolvedAction: {
          kind: "queue_ceo_review",
          runState: "assembling",
          reason: "final_assembly"
        }
      },
      laneExecution: {
        cardId: "card_cfo",
        state: "done",
        runState: "active",
        latestResultSummary: "Pricing review is complete and ready for board packaging."
      },
      postOutcomeAction: {
        kind: "dispatch_next_lane",
        runState: "active",
        cardId: "card_cmo",
        persona: "cmo"
      },
      nextDispatch: expect.objectContaining({
        laneExecution: expect.objectContaining({
          cardId: "card_cmo",
          persona: "cmo"
        })
      })
    });
    expect(onHarnessLaneDone).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      attentionTransition: {
        kind: "resolved",
        resolvedAction: {
          kind: "queue_ceo_review",
          runState: "assembling",
          reason: "final_assembly"
        }
      },
      laneExecution: {
        cardId: "card_cfo",
        state: "done",
        runState: "active",
        latestResultSummary: "Pricing review is complete and ready for board packaging."
      },
      postOutcomeAction: {
        kind: "dispatch_next_lane",
        runState: "active",
        cardId: "card_cmo",
        persona: "cmo"
      },
      nextDispatch: expect.objectContaining({
        laneExecution: expect.objectContaining({
          cardId: "card_cmo",
          persona: "cmo"
        })
      })
    });
    expect(onHarnessAttentionResolved).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      action: {
        kind: "queue_ceo_review",
        runState: "assembling",
        reason: "final_assembly"
      },
      laneExecution: {
        cardId: "card_cfo",
        state: "done",
        runState: "active",
        latestResultSummary: "Pricing review is complete and ready for board packaging."
      }
    });
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_lane_dispatch\"")
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"dispatchHandoff\":{\"kind\":\"follow_on_dispatch\"")
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"postOutcomeAction\":{\"kind\":\"dispatch_next_lane\",\"runState\":\"active\",\"cardId\":\"card_cmo\",\"persona\":\"cmo\"}")
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"cardId\":\"card_cmo\"")
    );
    expect(onHarnessLaneReady).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        requiredCapabilities: ["text_generation"],
        runtimeContext: {
          providerKind: "openai_api",
          credentialLabel: "Primary OpenAI"
        },
        executionClaim: {
          kind: "existing_working_claim",
          token: "claim-cmo-active",
          claimedAt: "2026-05-21T10:07:30.000Z",
          previousClaimedAt: null
        },
        continuityContext: {
          source: "state_transition",
          summary: "CMO should continue this active marketing plan lane: Prepare launch messaging.",
          latestResultSummary: null,
          absorbedWorkCount: 0,
          absorbedWorkTrail: []
        },
        dispatchHandoff: {
          kind: "follow_on_dispatch",
          kindLabel: "Follow-on dispatch",
          executionStage: "post_outcome_follow_on",
          executionStageLabel: "Post-outcome follow-on",
          reactivatedRun: false,
          triggeredByCardId: "card_cfo",
          triggeredByPersona: "cfo",
          triggeredByOutcomeState: "done",
          triggeredByResultSummary: "Pricing review is complete and ready for board packaging."
        },
        laneExecution: expect.objectContaining({
          cardId: "card_cmo",
          persona: "cmo",
          title: "Prepare launch messaging",
          deliverableType: "marketing_plan",
          state: "working",
          resumeFocus: "CMO should continue this active marketing plan lane: Prepare launch messaging."
        }),
        outcomeContract: {
          allowedStates: ["waiting", "done", "blocked", "cancelled"],
          resultSummaryRequiredStates: ["done"],
          resumeSummaryAllowedStates: ["waiting", "blocked", "cancelled"]
        }
      })
    );
    const acidRepository = vi.mocked(createAcidGuardRepository).mock.results.at(-1)?.value;
    expect(acidRepository.transitionWorkflowRunStatus).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      from: ["queued", "running"],
      to: "running"
    });
    expect(onHarnessLaneReady).toHaveBeenCalledTimes(1);

    await runtime.close();
  });

  it("does not emit an attention-resolved handoff when a committed follow-on dispatch has no attention transition", async () => {
    const onHarnessLaneReady = vi.fn();
    const onHarnessAttentionResolved = vi.fn();
    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_HARNESS_ENABLED_WORKFLOW_IDS: "wf_connect_first_workflow"
      }),
      workerInstanceId: "worker-test-harness-follow-on-no-attention",
      onHarnessLaneReady,
      onHarnessAttentionResolved
    });

    const harnessRepository = harnessRepositoryRef.current;
    harnessRepository.listCardsForRun.mockResolvedValue([
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
        title: "Finalize pricing review",
        deliverableType: "pricing_review",
        state: "done",
        createdAt: "2026-05-21T10:01:00.000Z",
        updatedAt: "2026-05-21T10:06:00.000Z"
      },
      {
        id: "card_cmo",
        runId: "run-1",
        parentCardId: "card_ceo",
        persona: "cmo",
        title: "Prepare launch messaging",
        deliverableType: "marketing_plan",
        state: "approved",
        createdAt: "2026-05-21T10:02:00.000Z",
        updatedAt: "2026-05-21T10:03:00.000Z"
      }
    ]);
    harnessRepository.listCardContinuityForRun.mockResolvedValue([
      {
        cardId: "card_cmo",
        runId: "run-1",
        continuitySummary: "Resume the launch messaging lane from the approved positioning draft.",
        latestResultSummary: null,
        absorbedWorkItems: [],
        updatedAt: "2026-05-21T10:03:00.000Z"
      }
    ]);
    harnessRepository.listEventsForRun.mockResolvedValueOnce([]);
    harnessRepository.claimCardForExecution.mockResolvedValueOnce({
      id: "card_cmo",
      runId: "run-1",
      parentCardId: "card_ceo",
      persona: "cmo",
      title: "Prepare launch messaging",
      deliverableType: "marketing_plan",
      state: "working",
      createdAt: "2026-05-21T10:02:00.000Z",
      updatedAt: "2026-05-21T10:07:00.000Z"
    });

    stdoutWrite.mockClear();
    await expect(
      runtime.commitHarnessLaneOutcome({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        cardId: "card_cfo",
        executionClaimToken: "claim-cfo-1",
        state: "done",
        resultSummary: "Pricing review is complete and ready for board packaging."
      })
    ).resolves.toEqual(
      expect.objectContaining({
        status: "committed",
        attentionTransition: {
          kind: "none"
        },
        nextDispatch: expect.objectContaining({
          dispatchHandoff: {
            kind: "follow_on_dispatch",
            kindLabel: "Follow-on dispatch",
            executionStage: "post_outcome_follow_on",
            executionStageLabel: "Post-outcome follow-on",
            reactivatedRun: false,
            triggeredByCardId: "card_cfo",
            triggeredByPersona: "cfo",
            triggeredByOutcomeState: "done",
            triggeredByResultSummary: "Pricing review is complete and ready for board packaging."
          },
          laneExecution: expect.objectContaining({
            cardId: "card_cmo"
          })
        })
      })
    );

    expect(stdoutWrite).not.toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_attention_resolved\"")
    );
    expect(onHarnessAttentionResolved).not.toHaveBeenCalled();
    expect(onHarnessLaneReady).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatchHandoff: {
          kind: "follow_on_dispatch",
          kindLabel: "Follow-on dispatch",
          executionStage: "post_outcome_follow_on",
          executionStageLabel: "Post-outcome follow-on",
          reactivatedRun: false,
          triggeredByCardId: "card_cfo",
          triggeredByPersona: "cfo",
          triggeredByOutcomeState: "done",
          triggeredByResultSummary: "Pricing review is complete and ready for board packaging."
        },
        executionClaim: {
          kind: "existing_working_claim",
          token: "claim-cmo-active",
          claimedAt: "2026-05-21T10:07:30.000Z",
          previousClaimedAt: null
        },
        continuityContext: {
          source: "state_transition",
          summary: "CMO should continue this active marketing plan lane: Prepare launch messaging.",
          latestResultSummary: null,
          absorbedWorkCount: 0,
          absorbedWorkTrail: []
        },
        laneExecution: expect.objectContaining({
          cardId: "card_cmo"
        })
      })
    );

    await runtime.close();
  });

  it("emits an explicit post-outcome handoff when a worker outcome leaves the board waiting", async () => {
    const onHarnessPostOutcomeAction = vi.fn();
    const onHarnessLaneWaiting = vi.fn();
    const onHarnessLaneResumeAwaited = vi.fn();
    const onHarnessCeoReviewRequested = vi.fn();
    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_HARNESS_ENABLED_WORKFLOW_IDS: "wf_connect_first_workflow"
      }),
      workerInstanceId: "worker-test-harness-waiting-handoff",
      onHarnessLaneWaiting,
      onHarnessPostOutcomeAction,
      onHarnessLaneResumeAwaited,
      onHarnessCeoReviewRequested
    });

    stdoutWrite.mockClear();
    const harnessRepository = harnessRepositoryRef.current;
    harnessRepository.getRun
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({
        id: "run-1",
        tenantId: "tenant-1",
        workflowId: "wf_connect_first_workflow",
        packageId: "pkg_bib_connect",
        orchestratorPersona: "ceo",
        state: "waiting",
        runtimeContext: {
          providerKind: "openai_api",
          credentialLabel: "Primary OpenAI"
        },
        createdAt: "2026-05-21T10:00:00.000Z",
        updatedAt: "2026-05-21T10:06:00.000Z"
      })
      .mockResolvedValueOnce({
        id: "run-1",
        tenantId: "tenant-1",
        workflowId: "wf_connect_first_workflow",
        packageId: "pkg_bib_connect",
        orchestratorPersona: "ceo",
        state: "waiting",
        runtimeContext: {
          providerKind: "openai_api",
          credentialLabel: "Primary OpenAI"
        },
        createdAt: "2026-05-21T10:00:00.000Z",
        updatedAt: "2026-05-21T10:06:00.000Z"
      });
    harnessRepository.listCardsForRun
      .mockResolvedValueOnce([
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
          title: "Wait for revenue assumptions",
          deliverableType: "pricing_review",
          state: "waiting",
          createdAt: "2026-05-21T10:01:00.000Z",
          updatedAt: "2026-05-21T10:05:00.000Z"
        }
      ])
      .mockResolvedValueOnce([
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
          title: "Wait for revenue assumptions",
          deliverableType: "pricing_review",
          state: "waiting",
          createdAt: "2026-05-21T10:01:00.000Z",
          updatedAt: "2026-05-21T10:05:00.000Z"
        }
      ])
      .mockResolvedValueOnce([
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
        title: "Wait for revenue assumptions",
        deliverableType: "pricing_review",
        state: "waiting",
        createdAt: "2026-05-21T10:01:00.000Z",
        updatedAt: "2026-05-21T10:05:00.000Z"
      }
    ]);
    harnessRepository.listCardContinuityForRun.mockResolvedValueOnce([
      {
        cardId: "card_cfo",
        runId: "run-1",
        continuitySource: "resume_override",
        continuitySummary: "CFO should resume this lane once the tenant confirms the latest revenue assumption.",
        latestResultSummary: null,
        absorbedWorkItems: [],
        updatedAt: "2026-05-21T10:05:00.000Z"
      }
    ]);
    harnessRepository.claimCardForExecution.mockResolvedValueOnce(null);

    await expect(
      runtime.commitHarnessLaneOutcome({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        cardId: "card_cfo",
        executionClaimToken: "claim-cfo-1",
        state: "waiting",
        resumeSummary: "CFO should resume this lane once the tenant confirms the latest revenue assumption."
      })
    ).resolves.toEqual({
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      status: "committed",
      attentionTransition: {
        kind: "requested",
        requestedAction: {
          kind: "await_lane_resume",
          runState: "waiting",
          cardId: "card_cfo"
        }
      },
      laneExecution: {
        cardId: "card_cfo",
        state: "waiting",
        runState: "waiting",
        resumeFocus: "CFO should resume this lane once the tenant confirms the latest revenue assumption.",
        latestResultSummary: "Initial pricing floor is stable."
      },
      postOutcomeAction: {
        kind: "await_lane_resume",
        runState: "waiting",
        cardId: "card_cfo"
      }
    });

    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_post_outcome_action\"")
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_lane_waiting\"")
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_lane_resume_awaited\"")
    );
    expect(stdoutWrite).not.toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_lane_dispatch\"")
    );
    expect(onHarnessPostOutcomeAction).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      action: {
        kind: "await_lane_resume",
        runState: "waiting",
        cardId: "card_cfo"
      },
      laneExecution: {
        cardId: "card_cfo",
        state: "waiting",
        runState: "waiting",
        resumeFocus: "CFO should resume this lane once the tenant confirms the latest revenue assumption.",
        latestResultSummary: "Initial pricing floor is stable."
      }
    });
    expect(onHarnessLaneWaiting).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      attentionTransition: {
        kind: "requested",
        requestedAction: {
          kind: "await_lane_resume",
          runState: "waiting",
          cardId: "card_cfo"
        }
      },
      laneExecution: {
        cardId: "card_cfo",
        state: "waiting",
        runState: "waiting",
        resumeFocus: "CFO should resume this lane once the tenant confirms the latest revenue assumption.",
        latestResultSummary: "Initial pricing floor is stable."
      },
      postOutcomeAction: {
        kind: "await_lane_resume",
        runState: "waiting",
        cardId: "card_cfo"
      }
    });
    expect(onHarnessLaneResumeAwaited).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      action: {
        kind: "await_lane_resume",
        runState: "waiting",
        cardId: "card_cfo"
      },
      laneExecution: {
        cardId: "card_cfo",
        state: "waiting",
        runState: "waiting",
        resumeFocus: "CFO should resume this lane once the tenant confirms the latest revenue assumption.",
        latestResultSummary: "Initial pricing floor is stable."
      }
    });
    expect(harnessRepository.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: "card_cfo",
        eventKind: "attention_requested",
        payload: {
          actionKind: "await_lane_resume",
          runState: "waiting",
          targetCardId: "card_cfo",
          statusLabel: "Waiting on lane resume",
          summary: "Resume the pricing lane from the revised assumptions workbook.",
          targetPersona: "cfo",
          targetTitle: "Wait for revenue assumptions"
        }
      })
    );
    expect(onHarnessCeoReviewRequested).not.toHaveBeenCalled();

    await runtime.close();
  });

  it("does not re-emit CEO review handoff chatter when attention remains unchanged", async () => {
    const onHarnessPostOutcomeAction = vi.fn();
    const onHarnessCeoReviewRequested = vi.fn();
    const onHarnessAttentionResolved = vi.fn();
    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_HARNESS_ENABLED_WORKFLOW_IDS: "wf_connect_first_workflow"
      }),
      workerInstanceId: "worker-test-harness-unchanged-ceo-review",
      onHarnessPostOutcomeAction,
      onHarnessCeoReviewRequested,
      onHarnessAttentionResolved
    });

    stdoutWrite.mockClear();
    const harnessRepository = harnessRepositoryRef.current;
    harnessRepository.getRun
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({
        id: "run-1",
        tenantId: "tenant-1",
        workflowId: "wf_connect_first_workflow",
        packageId: "pkg_bib_connect",
        orchestratorPersona: "ceo",
        state: "assembling",
        runtimeContext: {
          providerKind: "openai_api",
          credentialLabel: "Primary OpenAI"
        },
        createdAt: "2026-05-21T10:00:00.000Z",
        updatedAt: "2026-05-21T10:05:00.000Z"
      });
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
        title: "Pressure-test the pricing lane",
        deliverableType: "pricing_review",
        state: "done",
        createdAt: "2026-05-21T10:01:00.000Z",
        updatedAt: "2026-05-21T10:05:00.000Z"
      }
    ]);
    harnessRepository.listEventsForRun.mockResolvedValueOnce([
      {
        id: "event_attention_requested",
        cardId: "card_cfo",
        eventKind: "attention_requested",
        payload: {
          actionKind: "queue_ceo_review",
          runState: "assembling",
          reason: "final_assembly"
        },
        createdAt: "2026-05-21T10:05:00.000Z"
      }
    ]);

    await expect(
      runtime.commitHarnessLaneOutcome({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        cardId: "card_cfo",
        executionClaimToken: "claim-cfo-1",
        state: "done",
        resultSummary: "Validated the pricing model and preserved the final floor."
      })
    ).resolves.toEqual(
      expect.objectContaining({
        attentionTransition: {
          kind: "unchanged",
          action: {
            kind: "queue_ceo_review",
            runState: "assembling",
            reason: "final_assembly"
          }
        },
        postOutcomeAction: {
          kind: "queue_ceo_review",
          runState: "assembling",
          reason: "final_assembly"
        }
      })
    );

    expect(stdoutWrite).not.toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_post_outcome_action\"")
    );
    expect(stdoutWrite).not.toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_ceo_review_requested\"")
    );
    expect(stdoutWrite).not.toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_attention_resolved\"")
    );
    expect(onHarnessPostOutcomeAction).not.toHaveBeenCalled();
    expect(onHarnessCeoReviewRequested).not.toHaveBeenCalled();
    expect(onHarnessAttentionResolved).not.toHaveBeenCalled();

    await runtime.close();
  });

  it("does not re-emit lane-resume handoff chatter when attention remains unchanged", async () => {
    const onHarnessPostOutcomeAction = vi.fn();
    const onHarnessLaneResumeAwaited = vi.fn();
    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_HARNESS_ENABLED_WORKFLOW_IDS: "wf_connect_first_workflow"
      }),
      workerInstanceId: "worker-test-harness-unchanged-resume",
      onHarnessPostOutcomeAction,
      onHarnessLaneResumeAwaited
    });

    stdoutWrite.mockClear();
    const harnessRepository = harnessRepositoryRef.current;
    harnessRepository.getRun
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({
        id: "run-1",
        tenantId: "tenant-1",
        workflowId: "wf_connect_first_workflow",
        packageId: "pkg_bib_connect",
        orchestratorPersona: "ceo",
        state: "waiting",
        runtimeContext: {
          providerKind: "openai_api",
          credentialLabel: "Primary OpenAI"
        },
        createdAt: "2026-05-21T10:00:00.000Z",
        updatedAt: "2026-05-21T10:06:00.000Z"
      })
      .mockResolvedValueOnce({
        id: "run-1",
        tenantId: "tenant-1",
        workflowId: "wf_connect_first_workflow",
        packageId: "pkg_bib_connect",
        orchestratorPersona: "ceo",
        state: "waiting",
        runtimeContext: {
          providerKind: "openai_api",
          credentialLabel: "Primary OpenAI"
        },
        createdAt: "2026-05-21T10:00:00.000Z",
        updatedAt: "2026-05-21T10:06:00.000Z"
      });
    harnessRepository.listCardsForRun
      .mockResolvedValueOnce([
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
          title: "Wait for revenue assumptions",
          deliverableType: "pricing_review",
          state: "waiting",
          createdAt: "2026-05-21T10:01:00.000Z",
          updatedAt: "2026-05-21T10:05:00.000Z"
        }
      ])
      .mockResolvedValueOnce([
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
          title: "Wait for revenue assumptions",
          deliverableType: "pricing_review",
          state: "waiting",
          createdAt: "2026-05-21T10:01:00.000Z",
          updatedAt: "2026-05-21T10:05:00.000Z"
        }
      ])
      .mockResolvedValueOnce([
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
          title: "Wait for revenue assumptions",
          deliverableType: "pricing_review",
          state: "waiting",
          createdAt: "2026-05-21T10:01:00.000Z",
          updatedAt: "2026-05-21T10:05:00.000Z"
        }
      ]);
    harnessRepository.listCardContinuityForRun.mockResolvedValueOnce([
      {
        cardId: "card_cfo",
        runId: "run-1",
        continuitySource: "resume_override",
        continuitySummary: "CFO should resume this lane once the tenant confirms the latest revenue assumption.",
        latestResultSummary: null,
        absorbedWorkItems: [],
        updatedAt: "2026-05-21T10:05:00.000Z"
      }
    ]);
    harnessRepository.claimCardForExecution.mockResolvedValueOnce(null);
    harnessRepository.listEventsForRun.mockResolvedValueOnce([
      {
        id: "event_attention_requested",
        cardId: "card_cfo",
        eventKind: "attention_requested",
        payload: {
          actionKind: "await_lane_resume",
          runState: "waiting",
          targetCardId: "card_cfo"
        },
        createdAt: "2026-05-21T10:05:00.000Z"
      }
    ]);

    await expect(
      runtime.commitHarnessLaneOutcome({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        cardId: "card_cfo",
        executionClaimToken: "claim-cfo-1",
        state: "waiting",
        resumeSummary: "CFO should resume this lane once the tenant confirms the latest revenue assumption."
      })
    ).resolves.toEqual(
      expect.objectContaining({
        attentionTransition: {
          kind: "unchanged",
          action: {
            kind: "await_lane_resume",
            runState: "waiting",
            cardId: "card_cfo"
          }
        },
        postOutcomeAction: {
          kind: "await_lane_resume",
          runState: "waiting",
          cardId: "card_cfo"
        }
      })
    );

    expect(stdoutWrite).not.toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_post_outcome_action\"")
    );
    expect(stdoutWrite).not.toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_lane_resume_awaited\"")
    );
    expect(onHarnessPostOutcomeAction).not.toHaveBeenCalled();
    expect(onHarnessLaneResumeAwaited).not.toHaveBeenCalled();

    await runtime.close();
  });

  it("routes blocked post-outcome handoffs through the explicit unblock hook", async () => {
    const onHarnessPostOutcomeAction = vi.fn();
    const onHarnessLaneBlocked = vi.fn();
    const onHarnessLaneUnblockAwaited = vi.fn();
    const onHarnessCeoReviewRequested = vi.fn();
    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_HARNESS_ENABLED_WORKFLOW_IDS: "wf_connect_first_workflow"
      }),
      workerInstanceId: "worker-test-harness-blocked-handoff",
      onHarnessLaneBlocked,
      onHarnessPostOutcomeAction,
      onHarnessLaneUnblockAwaited,
      onHarnessCeoReviewRequested
    });

    stdoutWrite.mockClear();
    const harnessRepository = harnessRepositoryRef.current;
    harnessRepository.getRun
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({
        id: "run-1",
        tenantId: "tenant-1",
        workflowId: "wf_connect_first_workflow",
        packageId: "pkg_bib_connect",
        orchestratorPersona: "ceo",
        state: "blocked",
        runtimeContext: {
          providerKind: "openai_api",
          credentialLabel: "Primary OpenAI"
        },
        createdAt: "2026-05-21T10:00:00.000Z",
        updatedAt: "2026-05-21T10:06:00.000Z"
      })
      .mockResolvedValueOnce({
        id: "run-1",
        tenantId: "tenant-1",
        workflowId: "wf_connect_first_workflow",
        packageId: "pkg_bib_connect",
        orchestratorPersona: "ceo",
        state: "blocked",
        runtimeContext: {
          providerKind: "openai_api",
          credentialLabel: "Primary OpenAI"
        },
        createdAt: "2026-05-21T10:00:00.000Z",
        updatedAt: "2026-05-21T10:06:00.000Z"
      });
    harnessRepository.listCardsForRun
      .mockResolvedValueOnce([
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
          title: "Resolve blocked pricing lane",
          deliverableType: "pricing_review",
          state: "blocked",
          createdAt: "2026-05-21T10:01:00.000Z",
          updatedAt: "2026-05-21T10:05:00.000Z"
        }
      ])
      .mockResolvedValueOnce([
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
          title: "Resolve blocked pricing lane",
          deliverableType: "pricing_review",
          state: "blocked",
          createdAt: "2026-05-21T10:01:00.000Z",
          updatedAt: "2026-05-21T10:05:00.000Z"
        }
      ])
      .mockResolvedValueOnce([
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
          title: "Resolve blocked pricing lane",
          deliverableType: "pricing_review",
          state: "blocked",
          createdAt: "2026-05-21T10:01:00.000Z",
          updatedAt: "2026-05-21T10:05:00.000Z"
        }
      ]);
    harnessRepository.listCardContinuityForRun.mockResolvedValueOnce([
      {
        cardId: "card_cfo",
        runId: "run-1",
        continuitySource: "resume_override",
        continuitySummary: "CFO is blocked until the tenant confirms the final margin constraint.",
        latestResultSummary: null,
        absorbedWorkItems: [],
        updatedAt: "2026-05-21T10:05:00.000Z"
      }
    ]);
    harnessRepository.claimCardForExecution.mockResolvedValueOnce(null);

    await expect(
      runtime.commitHarnessLaneOutcome({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        cardId: "card_cfo",
        executionClaimToken: "claim-cfo-1",
        state: "blocked",
        resumeSummary: "CFO is blocked until the tenant confirms the final margin constraint."
      })
    ).resolves.toEqual({
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      status: "committed",
      attentionTransition: {
        kind: "requested",
        requestedAction: {
          kind: "await_unblock",
          runState: "blocked",
          cardId: "card_cfo"
        }
      },
      laneExecution: {
        cardId: "card_cfo",
        state: "blocked",
        runState: "blocked",
        resumeFocus: "CFO is blocked until the tenant confirms the final margin constraint.",
        latestResultSummary: "Initial pricing floor is stable."
      },
      postOutcomeAction: {
        kind: "await_unblock",
        runState: "blocked",
        cardId: "card_cfo"
      }
    });

    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_post_outcome_action\"")
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_lane_blocked\"")
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_lane_unblock_awaited\"")
    );
    expect(onHarnessPostOutcomeAction).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      action: {
        kind: "await_unblock",
        runState: "blocked",
        cardId: "card_cfo"
      },
      laneExecution: {
        cardId: "card_cfo",
        state: "blocked",
        runState: "blocked",
        resumeFocus: "CFO is blocked until the tenant confirms the final margin constraint.",
        latestResultSummary: "Initial pricing floor is stable."
      }
    });
    expect(onHarnessLaneBlocked).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      attentionTransition: {
        kind: "requested",
        requestedAction: {
          kind: "await_unblock",
          runState: "blocked",
          cardId: "card_cfo"
        }
      },
      laneExecution: {
        cardId: "card_cfo",
        state: "blocked",
        runState: "blocked",
        resumeFocus: "CFO is blocked until the tenant confirms the final margin constraint.",
        latestResultSummary: "Initial pricing floor is stable."
      },
      postOutcomeAction: {
        kind: "await_unblock",
        runState: "blocked",
        cardId: "card_cfo"
      }
    });
    expect(onHarnessLaneUnblockAwaited).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      action: {
        kind: "await_unblock",
        runState: "blocked",
        cardId: "card_cfo"
      },
      laneExecution: {
        cardId: "card_cfo",
        state: "blocked",
        runState: "blocked",
        resumeFocus: "CFO is blocked until the tenant confirms the final margin constraint.",
        latestResultSummary: "Initial pricing floor is stable."
      }
    });
    expect(harnessRepository.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: "card_cfo",
        eventKind: "attention_requested",
        payload: {
          actionKind: "await_unblock",
          runState: "blocked",
          targetCardId: "card_cfo",
          statusLabel: "Waiting on unblock",
          summary: "Resume the pricing lane from the revised assumptions workbook.",
          targetPersona: "cfo",
          targetTitle: "Resolve blocked pricing lane"
        }
      })
    );
    expect(onHarnessCeoReviewRequested).not.toHaveBeenCalled();

    await runtime.close();
  });

  it("emits a bounded cancelled-lane handoff when a worker cancels a lane", async () => {
    const onHarnessLaneCancelled = vi.fn();
    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_HARNESS_ENABLED_WORKFLOW_IDS: "wf_connect_first_workflow"
      }),
      workerInstanceId: "worker-test-harness-cancelled",
      onHarnessLaneCancelled
    });

    stdoutWrite.mockClear();
    const harnessRepository = harnessRepositoryRef.current;
    harnessRepository.getRun
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({
        id: "run-1",
        tenantId: "tenant-1",
        workflowId: "wf_connect_first_workflow",
        packageId: "pkg_bib_connect",
        orchestratorPersona: "ceo",
        state: "blocked",
        runtimeContext: {
          providerKind: "openai_api",
          credentialLabel: "Primary OpenAI"
        },
        createdAt: "2026-05-21T10:00:00.000Z",
        updatedAt: "2026-05-21T10:06:00.000Z"
      });

    await expect(
      runtime.commitHarnessLaneOutcome({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        cardId: "card_cfo",
        executionClaimToken: "claim-cfo-1",
        state: "cancelled",
        resumeSummary: "CFO cancelled this lane after the tenant withdrew the request."
      })
    ).resolves.toEqual(
      expect.objectContaining({
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        status: "committed",
        attentionTransition: {
          kind: "none"
        },
        laneExecution: {
          cardId: "card_cfo",
          state: "cancelled",
          runState: "active",
          resumeFocus: "CFO cancelled this lane after the tenant withdrew the request.",
          latestResultSummary: "Initial pricing floor is stable."
        },
        postOutcomeAction: {
          kind: "dispatch_next_lane",
          runState: "active",
          cardId: "card_cfo",
          persona: "cfo"
        },
        nextDispatch: expect.objectContaining({
          laneExecution: expect.objectContaining({
            cardId: "card_cfo",
            persona: "cfo"
          })
        })
      })
    );

    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_lane_outcome_committed\"")
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_lane_cancelled\"")
    );
    expect(stdoutWrite).not.toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_post_outcome_action\"")
    );
    expect(onHarnessLaneCancelled).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      attentionTransition: {
        kind: "none"
      },
      laneExecution: {
        cardId: "card_cfo",
        state: "cancelled",
        runState: "active",
        resumeFocus: "CFO cancelled this lane after the tenant withdrew the request.",
        latestResultSummary: "Initial pricing floor is stable."
      },
      postOutcomeAction: {
        kind: "dispatch_next_lane",
        runState: "active",
        cardId: "card_cfo",
        persona: "cfo"
      },
      nextDispatch: expect.objectContaining({
        laneExecution: expect.objectContaining({
          cardId: "card_cfo",
          persona: "cfo"
        })
      })
    });

    await runtime.close();
  });

  it("does not re-emit lane-unblock handoff chatter when attention remains unchanged", async () => {
    const onHarnessPostOutcomeAction = vi.fn();
    const onHarnessLaneUnblockAwaited = vi.fn();
    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_HARNESS_ENABLED_WORKFLOW_IDS: "wf_connect_first_workflow"
      }),
      workerInstanceId: "worker-test-harness-unchanged-unblock",
      onHarnessPostOutcomeAction,
      onHarnessLaneUnblockAwaited
    });

    stdoutWrite.mockClear();
    const harnessRepository = harnessRepositoryRef.current;
    harnessRepository.getRun
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({
        id: "run-1",
        tenantId: "tenant-1",
        workflowId: "wf_connect_first_workflow",
        packageId: "pkg_bib_connect",
        orchestratorPersona: "ceo",
        state: "blocked",
        runtimeContext: {
          providerKind: "openai_api",
          credentialLabel: "Primary OpenAI"
        },
        createdAt: "2026-05-21T10:00:00.000Z",
        updatedAt: "2026-05-21T10:06:00.000Z"
      })
      .mockResolvedValueOnce({
        id: "run-1",
        tenantId: "tenant-1",
        workflowId: "wf_connect_first_workflow",
        packageId: "pkg_bib_connect",
        orchestratorPersona: "ceo",
        state: "blocked",
        runtimeContext: {
          providerKind: "openai_api",
          credentialLabel: "Primary OpenAI"
        },
        createdAt: "2026-05-21T10:00:00.000Z",
        updatedAt: "2026-05-21T10:06:00.000Z"
      });
    harnessRepository.listCardsForRun
      .mockResolvedValueOnce([
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
          title: "Resolve blocked pricing lane",
          deliverableType: "pricing_review",
          state: "blocked",
          createdAt: "2026-05-21T10:01:00.000Z",
          updatedAt: "2026-05-21T10:05:00.000Z"
        }
      ])
      .mockResolvedValueOnce([
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
          title: "Resolve blocked pricing lane",
          deliverableType: "pricing_review",
          state: "blocked",
          createdAt: "2026-05-21T10:01:00.000Z",
          updatedAt: "2026-05-21T10:05:00.000Z"
        }
      ])
      .mockResolvedValueOnce([
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
          title: "Resolve blocked pricing lane",
          deliverableType: "pricing_review",
          state: "blocked",
          createdAt: "2026-05-21T10:01:00.000Z",
          updatedAt: "2026-05-21T10:05:00.000Z"
        }
      ]);
    harnessRepository.listCardContinuityForRun.mockResolvedValueOnce([
      {
        cardId: "card_cfo",
        runId: "run-1",
        continuitySource: "resume_override",
        continuitySummary: "CFO is blocked until the tenant confirms the final margin constraint.",
        latestResultSummary: null,
        absorbedWorkItems: [],
        updatedAt: "2026-05-21T10:05:00.000Z"
      }
    ]);
    harnessRepository.claimCardForExecution.mockResolvedValueOnce(null);
    harnessRepository.listEventsForRun.mockResolvedValueOnce([
      {
        id: "event_attention_requested",
        cardId: "card_cfo",
        eventKind: "attention_requested",
        payload: {
          actionKind: "await_unblock",
          runState: "blocked",
          targetCardId: "card_cfo"
        },
        createdAt: "2026-05-21T10:05:00.000Z"
      }
    ]);

    await expect(
      runtime.commitHarnessLaneOutcome({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        cardId: "card_cfo",
        executionClaimToken: "claim-cfo-1",
        state: "blocked",
        resumeSummary: "CFO is blocked until the tenant confirms the final margin constraint."
      })
    ).resolves.toEqual(
      expect.objectContaining({
        attentionTransition: {
          kind: "unchanged",
          action: {
            kind: "await_unblock",
            runState: "blocked",
            cardId: "card_cfo"
          }
        },
        postOutcomeAction: {
          kind: "await_unblock",
          runState: "blocked",
          cardId: "card_cfo"
        }
      })
    );

    expect(stdoutWrite).not.toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_post_outcome_action\"")
    );
    expect(stdoutWrite).not.toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_lane_unblock_awaited\"")
    );
    expect(onHarnessPostOutcomeAction).not.toHaveBeenCalled();
    expect(onHarnessLaneUnblockAwaited).not.toHaveBeenCalled();

    await runtime.close();
  });

  it("keeps a committed follow-on harness dispatch successful when the private execution-envelope hook rejects", async () => {
    const { createAcidGuardRepository } = await import("../src/db/acid-guard-repository.js");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_HARNESS_ENABLED_WORKFLOW_IDS: "wf_connect_first_workflow"
      }),
      workerInstanceId: "worker-test-harness-follow-on-hook-reject",
      onHarnessLaneReady: vi.fn().mockRejectedValue(new Error("hook unavailable"))
    });

    const harnessRepository = harnessRepositoryRef.current;
    harnessRepository.listCardsForRun.mockResolvedValue([
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
        title: "Finalize pricing review",
        deliverableType: "pricing_review",
        state: "done",
        createdAt: "2026-05-21T10:01:00.000Z",
        updatedAt: "2026-05-21T10:06:00.000Z"
      },
      {
        id: "card_cmo",
        runId: "run-1",
        parentCardId: "card_ceo",
        persona: "cmo",
        title: "Prepare launch messaging",
        deliverableType: "marketing_plan",
        state: "approved",
        createdAt: "2026-05-21T10:02:00.000Z",
        updatedAt: "2026-05-21T10:03:00.000Z"
      }
    ]);
    harnessRepository.listCardContinuityForRun.mockResolvedValue([
      {
        cardId: "card_cmo",
        runId: "run-1",
        continuitySource: "resume_override",
        continuitySummary: "Resume the launch messaging lane from the approved positioning draft.",
        latestResultSummary: null,
        absorbedWorkItems: [],
        updatedAt: "2026-05-21T10:03:00.000Z"
      }
    ]);
    harnessRepository.claimCardForExecution.mockResolvedValueOnce({
      id: "card_cmo",
      runId: "run-1",
      parentCardId: "card_ceo",
      persona: "cmo",
      title: "Prepare launch messaging",
      deliverableType: "marketing_plan",
      state: "working",
      createdAt: "2026-05-21T10:02:00.000Z",
      updatedAt: "2026-05-21T10:07:00.000Z"
    });

    await expect(
      runtime.commitHarnessLaneOutcome({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        cardId: "card_cfo",
        executionClaimToken: "claim-cfo-1",
        state: "done",
        resultSummary: "Pricing review is complete and ready for board packaging."
      })
    ).resolves.toEqual(
      expect.objectContaining({
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        status: "committed",
        nextDispatch: expect.objectContaining({
          laneExecution: expect.objectContaining({
            cardId: "card_cmo"
          })
        })
      })
    );

    expect(warn).toHaveBeenCalledWith(
      "Harness lane-ready hook failed after durable follow-on dispatch",
      expect.objectContaining({
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        cardId: "card_cmo"
      })
    );
    const acidRepository = vi.mocked(createAcidGuardRepository).mock.results.at(-1)?.value;
    expect(acidRepository.transitionWorkflowRunStatus).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      from: ["queued", "running"],
      to: "running"
    });

    warn.mockRestore();
    await runtime.close();
  });

  it("ignores a private harness lane outcome when the execution claim token is stale", async () => {
    const onHarnessLaneOutcomeIgnored = vi.fn();
    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_HARNESS_ENABLED_WORKFLOW_IDS: "wf_connect_first_workflow"
      }),
      workerInstanceId: "worker-test-harness-outcome-stale-claim",
      onHarnessLaneOutcomeIgnored
    });

    stdoutWrite.mockClear();
    await expect(
      runtime.commitHarnessLaneOutcome({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        cardId: "card_cfo",
        executionClaimToken: "claim-cfo-stale",
        state: "done",
        resultSummary: "This should not commit."
      })
    ).resolves.toEqual({
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      status: "ignored",
      ignored: {
        reason: "stale_execution_claim",
        currentLaneState: "working",
        activeExecutionClaimPresent: true,
        activeExecutionClaimClaimedAt: "2026-05-21T10:04:00.000Z",
        presentedExecutionClaimState: "mismatched"
      }
    });

    const harnessRepository = harnessRepositoryRef.current;
    expect(harnessRepository.transitionCardState).not.toHaveBeenCalled();
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_lane_outcome_ignored\"")
    );
    expect(stdoutWrite).not.toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_lane_outcome\"")
    );
    expect(stdoutWrite).not.toHaveBeenCalledWith(expect.stringContaining("claim-cfo-stale"));
    expect(onHarnessLaneOutcomeIgnored).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      cardId: "card_cfo",
      ignored: {
        reason: "stale_execution_claim",
        currentLaneState: "working",
        activeExecutionClaimPresent: true,
        activeExecutionClaimClaimedAt: "2026-05-21T10:04:00.000Z",
        presentedExecutionClaimState: "mismatched"
      }
    });

    await runtime.close();
  });

  it("keeps quiet when a private harness lane outcome targets a lane that is no longer working", async () => {
    const onHarnessAttentionResolved = vi.fn();
    const onHarnessLaneOutcomeIgnored = vi.fn();
    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_HARNESS_ENABLED_WORKFLOW_IDS: "wf_connect_first_workflow"
      }),
      workerInstanceId: "worker-test-harness-outcome-idle",
      onHarnessAttentionResolved,
      onHarnessLaneOutcomeIgnored
    });

    const harnessRepository = harnessRepositoryRef.current;
    harnessRepository.getCard.mockResolvedValueOnce({
      id: "card_cfo",
      runId: "run-1",
      parentCardId: "card_ceo",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review",
      state: "waiting",
      createdAt: "2026-05-21T10:01:00.000Z",
      updatedAt: "2026-05-21T10:04:00.000Z"
    });

    stdoutWrite.mockClear();
    await expect(
      runtime.commitHarnessLaneOutcome({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        cardId: "card_cfo",
        executionClaimToken: "claim-cfo-1",
        state: "done",
        resultSummary: "This should not commit."
      })
    ).resolves.toEqual({
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      status: "ignored",
      ignored: {
        reason: "lane_not_working",
        currentLaneState: "waiting"
      }
    });

    expect(harnessRepository.transitionCardState).not.toHaveBeenCalled();
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_lane_outcome_ignored\"")
    );
    expect(stdoutWrite).not.toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_lane_outcome\"")
    );
    expect(stdoutWrite).not.toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_attention_resolved\"")
    );
    expect(onHarnessAttentionResolved).not.toHaveBeenCalled();
    expect(onHarnessLaneOutcomeIgnored).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      cardId: "card_cfo",
      ignored: {
        reason: "lane_not_working",
        currentLaneState: "waiting"
      }
    });

    await runtime.close();
  });

  it("emits the ignored-outcome handoff when a private harness callback arrives after the run is terminal", async () => {
    const onHarnessLaneOutcomeIgnored = vi.fn();
    const runtime = createWorkerRuntime({
      env: loadWorkerEnv({
        ...validEnv,
        WF_HARNESS_ENABLED_WORKFLOW_IDS: "wf_connect_first_workflow"
      }),
      workerInstanceId: "worker-test-harness-outcome-terminal",
      onHarnessLaneOutcomeIgnored
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
      updatedAt: "2026-05-21T10:10:00.000Z"
    });

    stdoutWrite.mockClear();
    await expect(
      runtime.commitHarnessLaneOutcome({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        cardId: "card_cfo",
        executionClaimToken: "claim-cfo-1",
        state: "done",
        resultSummary: "This should not commit."
      })
    ).resolves.toEqual({
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      status: "ignored",
      ignored: {
        reason: "terminal_run",
        runState: "done"
      }
    });

    expect(harnessRepository.transitionCardState).not.toHaveBeenCalled();
    expect(harnessRepository.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: "card_cfo",
        eventKind: "execution_outcome_ignored",
        payload: {
          reason: "terminal_run",
          runState: "done"
        }
      })
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_lane_outcome_ignored\"")
    );
    expect(stdoutWrite).not.toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"wealth_factory_harness_lane_outcome\"")
    );
    expect(onHarnessLaneOutcomeIgnored).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      cardId: "card_cfo",
      ignored: {
        reason: "terminal_run",
        runState: "done"
      }
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
