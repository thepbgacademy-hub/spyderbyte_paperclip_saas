import { describe, expect, it, vi } from "vitest";

import { RuntimeProviderResolutionError } from "../src/providers/runtime-provider-resolution.js";
import { createWorkflowQueuePayload, validateWorkflowQueuePayload } from "../src/workflows/queue.js";
import { createRunService } from "../src/workflows/run-service.js";
import { processWorkflowJob } from "../src/workflows/worker.js";

describe("workflow queue payloads", () => {
  it("creates tenant-aware payloads without Paperclip internals", () => {
    expect(
      createWorkflowQueuePayload({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "workflow-1",
        createdByUserId: "user-1"
      })
    ).toMatchObject({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "workflow-1",
      createdByUserId: "user-1",
      idempotencyKey: "tenant-1:workflow-1:run-1"
    });
  });

  it("rejects raw secrets and Paperclip internals in queue payloads", () => {
    expect(() =>
      validateWorkflowQueuePayload({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "workflow-1",
        createdByUserId: "user-1",
        idempotencyKey: "tenant-1:workflow-1:run-1",
        createdAt: new Date().toISOString(),
        apiKey: "sk-secret",
        paperclipCompanyId: "pc-company-1"
      })
    ).toThrow(/Queue payload contains forbidden keys: apiKey, paperclipCompanyId/);
  });

  it("rejects secret-like and Paperclip-internal values in allowed fields", () => {
    expect(() =>
      validateWorkflowQueuePayload({
        tenantId: "tenant-1",
        runId: "pc-run-1",
        workflowId: "workflow-1",
        createdByUserId: "user-1",
        idempotencyKey: "tenant-1:workflow-1:pc-run-1",
        createdAt: new Date().toISOString()
      })
    ).toThrow(/Queue payload runId contains a forbidden internal value/);

    expect(() =>
      validateWorkflowQueuePayload({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "sk-secret",
        createdByUserId: "user-1",
        idempotencyKey: "tenant-1:sk-secret:run-1",
        createdAt: new Date().toISOString()
      })
    ).toThrow(/Queue payload workflowId contains a forbidden secret-like value/);
  });
});

describe("run service", () => {
  it("starts a workflow through Paperclip and returns sanitized SpyderByte status", async () => {
    const paperclipClient = {
      createRun: vi.fn().mockResolvedValue({ paperclipRunId: "pc-run-1", status: "queued" })
    };
    const tenantResolver = vi.fn().mockResolvedValue({ paperclipCompanyId: "pc-company-1" });
    const service = createRunService({
      paperclipClient,
      tenantResolver,
      authorizeRunStart: vi.fn().mockResolvedValue(true)
    });

    await expect(
      service.startRun({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "workflow-1"
      })
    ).resolves.toEqual({
      runId: "run-1",
      workflowId: "workflow-1",
      status: "queued"
    });

    expect(paperclipClient.createRun).toHaveBeenCalledWith({
      companyId: "pc-company-1",
      workflowId: "workflow-1",
      spyderbyteRunId: "run-1"
    });
  });

  it("passes resolved provider context into the Paperclip run contract", async () => {
    const paperclipClient = {
      createRun: vi.fn().mockResolvedValue({ paperclipRunId: "pc-run-1", status: "queued" })
    };
    const service = createRunService({
      paperclipClient,
      tenantResolver: vi.fn().mockResolvedValue({ paperclipCompanyId: "pc-company-1" }),
      authorizeRunStart: vi.fn().mockResolvedValue(true),
      resolveProviderContext: vi.fn().mockResolvedValue([
        {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Primary OpenAI",
          secretRef: "wf_secret_openai",
          metadata: { projectId: "proj_123" }
        }
      ])
    });

    await service.startRun({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "workflow-1",
      requiredCapabilities: ["text_generation"]
    });

    expect(paperclipClient.createRun).toHaveBeenCalledWith({
      companyId: "pc-company-1",
      workflowId: "workflow-1",
      spyderbyteRunId: "run-1",
      providerContext: [
        {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Primary OpenAI",
          secretRef: "wf_secret_openai",
          metadata: { projectId: "proj_123" }
        }
      ],
      runtimeProviderContext: [
        {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Primary OpenAI",
          secretRef: "wf_secret_openai",
          metadata: { projectId: "proj_123" }
        }
      ]
    });
  });

  it("hydrates resolved provider context internally but strips secret values before calling Paperclip", async () => {
    const paperclipClient = {
      createRun: vi.fn().mockResolvedValue({ paperclipRunId: "pc-run-1", status: "queued" })
    };
    const service = createRunService({
      paperclipClient,
      tenantResolver: vi.fn().mockResolvedValue({ paperclipCompanyId: "pc-company-1" }),
      authorizeRunStart: vi.fn().mockResolvedValue(true),
      resolveProviderContext: vi.fn().mockResolvedValue([
        {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Primary OpenAI",
          secretRef: "wf_secret_openai",
          metadata: { projectId: "proj_123" }
        }
      ]),
      hydrateProviderContext: vi.fn().mockResolvedValue([
        {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Primary OpenAI",
          secretRef: "wf_secret_openai",
          metadata: { projectId: "proj_123" },
          secretValues: { apiKey: "sk-openai-secret" }
        }
      ])
    });

    await service.startRun({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "workflow-1",
      requiredCapabilities: ["text_generation"]
    });

    expect(paperclipClient.createRun).toHaveBeenCalledWith({
      companyId: "pc-company-1",
      workflowId: "workflow-1",
      spyderbyteRunId: "run-1",
      providerContext: [
        {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Primary OpenAI",
          secretRef: "wf_secret_openai",
          metadata: { projectId: "proj_123" }
        }
      ],
      runtimeProviderContext: [
        {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Primary OpenAI",
          secretRef: "wf_secret_openai",
          metadata: { projectId: "proj_123" },
          secretValues: { apiKey: "sk-openai-secret" }
        }
      ]
    });
  });

  it("prefers a run's bound provider context so retries cannot drift to a different credential", async () => {
    const paperclipClient = {
      createRun: vi.fn().mockResolvedValue({ paperclipRunId: "pc-run-1", status: "queued" })
    };
    const resolveProviderContext = vi.fn();
    const loadBoundProviderContext = vi.fn().mockResolvedValue([
      {
        capability: "text_generation",
        providerKind: "openai_api",
        label: "Bound OpenAI",
        secretRef: "wf_secret_bound",
        metadata: {}
      }
    ]);
    const hydrateProviderContext = vi.fn().mockResolvedValue([
      {
        capability: "text_generation",
        providerKind: "openai_api",
        label: "Bound OpenAI",
        secretRef: "wf_secret_bound",
        metadata: {},
        secretValues: { apiKey: "sk-bound" }
      }
    ]);
    const service = createRunService({
      paperclipClient,
      tenantResolver: vi.fn().mockResolvedValue({ paperclipCompanyId: "pc-company-1" }),
      authorizeRunStart: vi.fn().mockResolvedValue(true),
      loadBoundProviderContext,
      resolveProviderContext,
      hydrateProviderContext
    });

    await service.startRun({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "workflow-1"
    });

    expect(loadBoundProviderContext).toHaveBeenCalled();
    expect(resolveProviderContext).not.toHaveBeenCalled();
    expect(hydrateProviderContext).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "workflow-1",
      providerBindings: [
        {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Bound OpenAI",
          secretRef: "wf_secret_bound",
          metadata: {}
        }
      ]
    });
  });

  it("fails closed in tenant-required mode when no tenant provider is connected", async () => {
    const paperclipClient = {
      createRun: vi.fn()
    };
    const service = createRunService({
      paperclipClient,
      tenantResolver: vi.fn().mockResolvedValue({ paperclipCompanyId: "pc-company-1" }),
      authorizeRunStart: vi.fn().mockResolvedValue(true),
      resolveProviderContext: vi.fn().mockRejectedValue(
        new RuntimeProviderResolutionError({
          tenantId: "tenant-1",
          workflowId: "workflow-1",
          capability: "text_generation"
        })
      ),
      resolveDebugSharedProvider: vi.fn()
    });

    await expect(
      service.startRun({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "workflow-1",
        requiredCapabilities: ["text_generation"]
      })
    ).rejects.toMatchObject({
      code: "runtime_provider_unavailable",
      publicMessage: "workflow_failed"
    });

    expect(paperclipClient.createRun).not.toHaveBeenCalled();
  });

  it("uses explicit debug shared fallback only when tenant resolution is unavailable", async () => {
    const paperclipClient = {
      createRun: vi.fn().mockResolvedValue({ paperclipRunId: "pc-run-1", status: "queued" })
    };
    const resolveDebugSharedProvider = vi.fn().mockResolvedValue([
      {
        capability: "text_generation",
        providerKind: "openai_api",
        label: "Operator Debug Provider",
        secretRef: "wf_debug_shared_provider",
        metadata: {},
        secretValues: { apiKey: "sk-operator-debug" }
      }
    ]);
    const service = createRunService({
      paperclipClient,
      tenantResolver: vi.fn().mockResolvedValue({ paperclipCompanyId: "pc-company-1" }),
      authorizeRunStart: vi.fn().mockResolvedValue(true),
      providerExecutionMode: "debug_shared_fallback",
      resolveProviderContext: vi.fn().mockRejectedValue(
        new RuntimeProviderResolutionError({
          tenantId: "tenant-1",
          workflowId: "workflow-1",
          capability: "text_generation"
        })
      ),
      resolveDebugSharedProvider
    });

    await service.startRun({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "workflow-1",
      requiredCapabilities: ["text_generation"]
    });

    expect(resolveDebugSharedProvider).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "workflow-1",
      requiredCapabilities: ["text_generation"]
    });
    expect(paperclipClient.createRun).toHaveBeenCalledWith({
      companyId: "pc-company-1",
      workflowId: "workflow-1",
      spyderbyteRunId: "run-1",
      providerContext: [
        {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Operator Debug Provider",
          secretRef: "wf_debug_shared_provider",
          metadata: {}
        }
      ],
      runtimeProviderContext: [
        {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Operator Debug Provider",
          secretRef: "wf_debug_shared_provider",
          metadata: {},
          secretValues: { apiKey: "sk-operator-debug" }
        }
      ]
    });
  });

  it("does not use debug shared fallback when tenant provider context resolves successfully", async () => {
    const paperclipClient = {
      createRun: vi.fn().mockResolvedValue({ paperclipRunId: "pc-run-1", status: "queued" })
    };
    const resolveDebugSharedProvider = vi.fn();
    const service = createRunService({
      paperclipClient,
      tenantResolver: vi.fn().mockResolvedValue({ paperclipCompanyId: "pc-company-1" }),
      authorizeRunStart: vi.fn().mockResolvedValue(true),
      providerExecutionMode: "debug_shared_fallback",
      resolveProviderContext: vi.fn().mockResolvedValue([
        {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Tenant OpenAI",
          secretRef: "wf_secret_openai",
          metadata: {}
        }
      ]),
      hydrateProviderContext: vi.fn().mockResolvedValue([
        {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Tenant OpenAI",
          secretRef: "wf_secret_openai",
          metadata: {},
          secretValues: { apiKey: "sk-tenant" }
        }
      ]),
      resolveDebugSharedProvider
    });

    await service.startRun({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "workflow-1",
      requiredCapabilities: ["text_generation"]
    });

    expect(resolveDebugSharedProvider).not.toHaveBeenCalled();
    expect(paperclipClient.createRun).toHaveBeenCalledWith({
      companyId: "pc-company-1",
      workflowId: "workflow-1",
      spyderbyteRunId: "run-1",
      providerContext: [
        {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Tenant OpenAI",
          secretRef: "wf_secret_openai",
          metadata: {}
        }
      ],
      runtimeProviderContext: [
        {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Tenant OpenAI",
          secretRef: "wf_secret_openai",
          metadata: {},
          secretValues: { apiKey: "sk-tenant" }
        }
      ]
    });
  });

  it("validates tenant run ownership before calling Paperclip", async () => {
    const paperclipClient = {
      createRun: vi.fn()
    };
    const service = createRunService({
      paperclipClient,
      tenantResolver: vi.fn().mockResolvedValue({ paperclipCompanyId: "pc-company-1" }),
      authorizeRunStart: vi.fn().mockResolvedValue(false)
    });

    await expect(
      service.startRun({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "workflow-1",
        createdByUserId: "user-1"
      })
    ).rejects.toMatchObject({
      code: "workflow_not_authorized",
      publicMessage: "workflow_failed"
    });

    expect(paperclipClient.createRun).not.toHaveBeenCalled();
  });

  it("blocks Paperclip calls when tenant integration is disabled", async () => {
    const paperclipClient = {
      createRun: vi.fn()
    };
    const service = createRunService({
      paperclipClient,
      tenantResolver: vi.fn().mockResolvedValue({ paperclipCompanyId: "pc-company-1" }),
      authorizeRunStart: vi.fn().mockResolvedValue(true),
      isPaperclipEnabled: vi.fn().mockResolvedValue(false)
    });

    await expect(
      service.startRun({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "workflow-1",
        createdByUserId: "user-1"
      })
    ).rejects.toMatchObject({
      code: "paperclip_disabled",
      publicMessage: "tenant_paused"
    });

    expect(paperclipClient.createRun).not.toHaveBeenCalled();
  });

  it("fails closed when no run ownership authorizer is configured", async () => {
    const paperclipClient = {
      createRun: vi.fn()
    };
    const service = createRunService({
      paperclipClient,
      tenantResolver: vi.fn().mockResolvedValue({ paperclipCompanyId: "pc-company-1" })
    });

    await expect(
      service.startRun({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "workflow-1",
        createdByUserId: "user-1"
      })
    ).rejects.toMatchObject({
      code: "workflow_authorizer_missing",
      publicMessage: "workflow_failed"
    });

    expect(paperclipClient.createRun).not.toHaveBeenCalled();
  });

  it("checks package entitlements before calling Paperclip", async () => {
    const paperclipClient = {
      createRun: vi.fn()
    };
    const service = createRunService({
      paperclipClient,
      tenantResolver: vi.fn().mockResolvedValue({ paperclipCompanyId: "pc-company-1" }),
      authorizeRunStart: vi.fn().mockResolvedValue(true),
      checkEntitlement: vi.fn().mockResolvedValue({ allowed: false, reason: "workflow_not_in_package" })
    });

    await expect(
      service.startRun({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf-social-calendar",
        createdByUserId: "user-1"
      })
    ).rejects.toMatchObject({
      code: "workflow_entitlement_denied",
      publicMessage: "workflow_failed",
      reason: "workflow_not_in_package"
    });

    expect(paperclipClient.createRun).not.toHaveBeenCalled();
  });
});

describe("workflow worker", () => {
  it("records only sanitized SpyderByte status after processing a job", async () => {
    const recordStatus = vi.fn();

    await expect(
      processWorkflowJob({
        payload: createWorkflowQueuePayload({
          tenantId: "tenant-1",
          runId: "run-1",
          workflowId: "workflow-1",
          createdByUserId: "user-1"
        }),
        paperclipClient: {
          createRun: vi.fn().mockResolvedValue({
            paperclipRunId: "pc-run-1",
            status: "queued"
          })
        },
        tenantResolver: vi.fn().mockResolvedValue({ paperclipCompanyId: "pc-company-1" }),
        authorizeRunStart: vi.fn().mockResolvedValue(true),
        isPaperclipEnabled: vi.fn().mockResolvedValue(true),
        checkEntitlement: vi.fn().mockResolvedValue({ allowed: true }),
        recordStatus
      })
    ).resolves.toEqual({
      runId: "run-1",
      workflowId: "workflow-1",
      status: "queued"
    });

    expect(recordStatus).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "workflow-1",
      status: "queued"
    });
  });

  it("records sanitized failure status when Paperclip start fails", async () => {
    const recordStatus = vi.fn();

    await expect(
      processWorkflowJob({
        payload: createWorkflowQueuePayload({
          tenantId: "tenant-1",
          runId: "run-1",
          workflowId: "workflow-1",
          createdByUserId: "user-1"
        }),
        paperclipClient: {
          createRun: vi.fn().mockRejectedValue(new Error("prompt stack trace"))
        },
        tenantResolver: vi.fn().mockResolvedValue({ paperclipCompanyId: "pc-company-1" }),
        authorizeRunStart: vi.fn().mockResolvedValue(true),
        isPaperclipEnabled: vi.fn().mockResolvedValue(true),
        checkEntitlement: vi.fn().mockResolvedValue({ allowed: true }),
        recordStatus
      })
    ).rejects.toThrow();

    expect(recordStatus).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "workflow-1",
      status: "failed"
    });
  });

  it("worker blocks Paperclip calls when tenant integration is disabled", async () => {
    const createRun = vi.fn();
    await expect(
      processWorkflowJob({
        payload: createWorkflowQueuePayload({
          tenantId: "tenant-1",
          runId: "run-1",
          workflowId: "workflow-1",
          createdByUserId: "user-1"
        }),
        paperclipClient: { createRun },
        tenantResolver: vi.fn().mockResolvedValue({ paperclipCompanyId: "pc-company-1" }),
        authorizeRunStart: vi.fn().mockResolvedValue(true),
        isPaperclipEnabled: vi.fn().mockResolvedValue(false),
        checkEntitlement: vi.fn().mockResolvedValue({ allowed: true })
      })
    ).rejects.toMatchObject({ code: "paperclip_disabled" });
    expect(createRun).not.toHaveBeenCalled();
  });

  it("worker re-checks entitlements before calling Paperclip", async () => {
    const createRun = vi.fn();
    await expect(
      processWorkflowJob({
        payload: createWorkflowQueuePayload({
          tenantId: "tenant-1",
          runId: "run-1",
          workflowId: "wf-social-calendar",
          createdByUserId: "user-1"
        }),
        paperclipClient: { createRun },
        tenantResolver: vi.fn().mockResolvedValue({ paperclipCompanyId: "pc-company-1" }),
        authorizeRunStart: vi.fn().mockResolvedValue(true),
        isPaperclipEnabled: vi.fn().mockResolvedValue(true),
        checkEntitlement: vi.fn().mockResolvedValue({ allowed: false, reason: "provider_not_connected" })
      })
    ).rejects.toMatchObject({ code: "workflow_entitlement_denied", reason: "provider_not_connected" });
    expect(createRun).not.toHaveBeenCalled();
  });

  it("worker hydrates provider secrets just-in-time but does not forward raw values to Paperclip", async () => {
    const createRun = vi.fn().mockResolvedValue({
      paperclipRunId: "pc-run-1",
      status: "queued"
    });

    await processWorkflowJob({
      payload: createWorkflowQueuePayload({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "workflow-1",
        createdByUserId: "user-1"
      }),
      paperclipClient: { createRun },
      tenantResolver: vi.fn().mockResolvedValue({ paperclipCompanyId: "pc-company-1" }),
      authorizeRunStart: vi.fn().mockResolvedValue(true),
      isPaperclipEnabled: vi.fn().mockResolvedValue(true),
      checkEntitlement: vi.fn().mockResolvedValue({ allowed: true }),
      resolveProviderContext: vi.fn().mockResolvedValue([
        {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Primary OpenAI",
          secretRef: "wf_secret_openai",
          metadata: {}
        }
      ]),
      hydrateProviderContext: vi.fn().mockResolvedValue([
        {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Primary OpenAI",
          secretRef: "wf_secret_openai",
          metadata: {},
          secretValues: { apiKey: "sk-openai-secret" }
        }
      ])
    });

    expect(createRun).toHaveBeenCalledWith({
      companyId: "pc-company-1",
      workflowId: "workflow-1",
      spyderbyteRunId: "run-1",
      providerContext: [
        {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Primary OpenAI",
          secretRef: "wf_secret_openai",
          metadata: {}
        }
      ],
      runtimeProviderContext: [
        {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Primary OpenAI",
          secretRef: "wf_secret_openai",
          metadata: {},
          secretValues: { apiKey: "sk-openai-secret" }
        }
      ]
    });
  });

  it("worker fails closed when the bound credential is no longer active at execution time", async () => {
    const createRun = vi.fn();

    await expect(
      processWorkflowJob({
        payload: createWorkflowQueuePayload({
          tenantId: "tenant-1",
          runId: "run-1",
          workflowId: "workflow-1",
          createdByUserId: "user-1"
        }),
        paperclipClient: { createRun },
        tenantResolver: vi.fn().mockResolvedValue({ paperclipCompanyId: "pc-company-1" }),
        authorizeRunStart: vi.fn().mockResolvedValue(true),
        isPaperclipEnabled: vi.fn().mockResolvedValue(true),
        checkEntitlement: vi.fn().mockResolvedValue({ allowed: true }),
        loadBoundProviderContext: vi.fn().mockResolvedValue(null),
        resolveProviderContext: vi.fn().mockRejectedValue(
          new RuntimeProviderResolutionError({
            tenantId: "tenant-1",
            workflowId: "workflow-1",
            capability: "text_generation"
          })
        )
      })
    ).rejects.toMatchObject({
      code: "runtime_provider_unavailable",
      publicMessage: "workflow_failed"
    });

    expect(createRun).not.toHaveBeenCalled();
  });

  it("worker uses debug shared fallback only in explicit fallback mode", async () => {
    const createRun = vi.fn().mockResolvedValue({
      paperclipRunId: "pc-run-1",
      status: "queued"
    });

    await processWorkflowJob({
      payload: createWorkflowQueuePayload({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "workflow-1",
        createdByUserId: "user-1"
      }),
      paperclipClient: { createRun },
      tenantResolver: vi.fn().mockResolvedValue({ paperclipCompanyId: "pc-company-1" }),
      authorizeRunStart: vi.fn().mockResolvedValue(true),
      isPaperclipEnabled: vi.fn().mockResolvedValue(true),
      checkEntitlement: vi.fn().mockResolvedValue({ allowed: true }),
      providerExecutionMode: "debug_shared_fallback",
      resolveProviderContext: vi.fn().mockRejectedValue(
        new RuntimeProviderResolutionError({
          tenantId: "tenant-1",
          workflowId: "workflow-1",
          capability: "text_generation"
        })
      ),
      resolveDebugSharedProvider: vi.fn().mockResolvedValue([
        {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Operator Debug Provider",
          secretRef: "wf_debug_shared_provider",
          metadata: {},
          secretValues: { apiKey: "sk-operator-debug" }
        }
      ])
    });

    expect(createRun).toHaveBeenCalledWith({
      companyId: "pc-company-1",
      workflowId: "workflow-1",
      spyderbyteRunId: "run-1",
      providerContext: [
        {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Operator Debug Provider",
          secretRef: "wf_debug_shared_provider",
          metadata: {}
        }
      ],
      runtimeProviderContext: [
        {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Operator Debug Provider",
          secretRef: "wf_debug_shared_provider",
          metadata: {},
          secretValues: { apiKey: "sk-operator-debug" }
        }
      ]
    });
  });
});
