import { createRequire } from "node:module";

import { describe, expect, it, vi } from "vitest";

// Vitest imports the plain Node `.mjs` helper directly for script-level coverage.
const require = createRequire(import.meta.url);
const { createLiveRunRequest, reserveLiveWorkflowRun, loadWorkflowRunSnapshot, summarizeWorkflowRunVerification } = require("../scripts/lib/live-run-drive.mjs");

describe("live run drive helpers", () => {
  it("creates deterministic idempotency keys for live run requests", () => {
    expect(
      createLiveRunRequest({
        tenantId: "tenant-1",
        userId: "user-1",
        workflowId: "workflow-1",
        runId: "run-1"
      })
    ).toEqual({
      tenantId: "tenant-1",
      userId: "user-1",
      workflowId: "workflow-1",
      runId: "run-1",
      idempotencyKey: "tenant-1:workflow-1:run-1"
    });
  });

  it("preserves the public workflow id while carrying a separate workflow template id when provided", () => {
    expect(
      createLiveRunRequest({
        tenantId: "tenant-1",
        userId: "user-1",
        workflowId: "wf_connect_first_workflow",
        workflowTemplateId: "44444444-4444-4444-8444-444444444444",
        runId: "run-1"
      })
    ).toEqual({
      tenantId: "tenant-1",
      userId: "user-1",
      workflowId: "wf_connect_first_workflow",
      workflowTemplateId: "44444444-4444-4444-8444-444444444444",
      runId: "run-1",
      idempotencyKey: "tenant-1:wf_connect_first_workflow:run-1"
    });
  });

  it("falls back to the tenant's latest workflow template when a legacy queue proof passes only the public workflow id", async () => {
    const responses = [
      { rows: [{ id: "44444444-4444-4444-8444-444444444444" }] },
      { rows: [{ paused_at: null }] },
      { rows: [{ tenant_id: "tenant-1" }] },
      { rows: [{ id: "44444444-4444-4444-8444-444444444444", package_id: "package-1", provider_kind: "openai_api" }] },
      { rows: [{ id: "install-1" }] },
      { rows: [{ id: "requirement-1", capability: "text_generation", provider_kind: "openai_api" }] },
      { rows: [{ id: "secret-reference-1", secret_ref: "wf_secret_demo", label: "OpenAI", metadata: {} }] },
      { rows: [] },
      { rows: [{ id: "reservation-1" }] },
      { rows: [] },
      { rows: [] }
    ];
    const queries: string[] = [];
    const values: unknown[][] = [];
    const client = {
      query: vi.fn(async (sql, params = []) => {
        queries.push(String(sql));
        values.push(params);
        return responses.shift() ?? { rows: [] };
      })
    };

    await expect(
      reserveLiveWorkflowRun({
        client,
        tenantId: "tenant-1",
        userId: "user-1",
        workflowId: "wf_connect_first_workflow",
        runId: "run-1",
        idempotencyKey: "tenant-1:wf_connect_first_workflow:run-1"
      })
    ).resolves.toEqual({ reserved: true, runId: "run-1" });

    expect(queries[0]).toContain("order by created_at desc");
    expect(queries[0]).toContain("limit 1");
    expect(values[0]).toEqual(["tenant-1"]);
    const reservationCallIndex = queries.findIndex((sql) => sql.includes("insert into wfpc.workflow_run_reservations"));
    expect(reservationCallIndex).toBeGreaterThanOrEqual(0);
    expect(values[reservationCallIndex]).toEqual([
      "tenant-1",
      "wf_connect_first_workflow",
      "44444444-4444-4444-8444-444444444444",
      "package-1",
      "run-1",
      "tenant-1:wf_connect_first_workflow:run-1",
      "user-1"
    ]);
  });

  it("bootstraps harness state for native public workflow proofs after reserving the direct queue path", async () => {
    const responses = [
      { rows: [{ paused_at: null }] },
      { rows: [{ tenant_id: "tenant-1" }] },
      { rows: [{ id: "44444444-4444-4444-8444-444444444444", package_id: "package-1", provider_kind: "openai_api" }] },
      { rows: [{ id: "install-1" }] },
      { rows: [{ id: "requirement-1", capability: "text_generation", provider_kind: "openai_api" }] },
      { rows: [{ id: "secret-reference-1", secret_ref: "wf_secret_demo", label: "Primary OpenAI", metadata: {} }] },
      { rows: [] },
      { rows: [{ id: "reservation-1" }] },
      { rows: [] },
      { rows: [] }
    ];
    const client = {
      query: vi.fn(async () => responses.shift() ?? { rows: [] })
    };
    const bootstrapNativePublicRun = vi.fn(async () => undefined);

    await expect(
      reserveLiveWorkflowRun({
        client,
        tenantId: "tenant-1",
        userId: "user-1",
        workflowId: "wf_connect_first_workflow",
        workflowTemplateId: "44444444-4444-4444-8444-444444444444",
        runId: "run-1",
        idempotencyKey: "tenant-1:wf_connect_first_workflow:run-1",
        bootstrapNativePublicRun
      })
    ).resolves.toEqual({ reserved: true, runId: "run-1" });

    expect(bootstrapNativePublicRun).toHaveBeenCalledWith({
      client,
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "package-1",
      providerKind: "openai_api",
      credentialLabel: "Primary OpenAI"
    });
  });

  it("reuses the existing durable native harness run instead of trying to seed a duplicate public proof row", async () => {
    const responses = [
      { rows: [{ paused_at: null }] },
      { rows: [{ tenant_id: "tenant-1" }] },
      { rows: [{ id: "44444444-4444-4444-8444-444444444444", package_id: "package-1", provider_kind: "openai_api" }] },
      { rows: [{ id: "install-1" }] },
      { rows: [{ id: "requirement-1", capability: "text_generation", provider_kind: "openai_api" }] },
      { rows: [{ id: "secret-reference-1", secret_ref: "wf_secret_demo", label: "Primary OpenAI", metadata: {} }] },
      { rows: [{ id: "existing-harness-run-1" }] },
      { rows: [] },
      { rows: [{ id: "outbox-1" }] }
    ];
    const queries: string[] = [];
    const client = {
      query: vi.fn(async (sql) => {
        queries.push(String(sql));
        return responses.shift() ?? { rows: [] };
      })
    };
    const bootstrapNativePublicRun = vi.fn(async () => undefined);

    await expect(
      reserveLiveWorkflowRun({
        client,
        tenantId: "tenant-1",
        userId: "user-1",
        workflowId: "wf_connect_first_workflow",
        workflowTemplateId: "44444444-4444-4444-8444-444444444444",
        runId: "fresh-run-id-that-should-not-be-used",
        idempotencyKey: "tenant-1:wf_connect_first_workflow:fresh-run-id-that-should-not-be-used",
        bootstrapNativePublicRun
      })
    ).resolves.toEqual({ reserved: true, runId: "existing-harness-run-1" });

    expect(queries.some((sql) => sql.includes("insert into wfpc.workflow_run_reservations"))).toBe(false);
    expect(queries.some((sql) => sql.includes("from wfpc.harness_runs"))).toBe(true);
    expect(queries.some((sql) => sql.includes("on conflict (id) do update"))).toBe(true);
    expect(queries.some((sql) => sql.includes("on conflict (tenant_id, run_id) do update"))).toBe(true);
    expect(bootstrapNativePublicRun).not.toHaveBeenCalled();
  });

  it("skips existing harness reuse when a fresh proof run is explicitly requested", async () => {
    const responses = [
      { rows: [{ paused_at: null }] },
      { rows: [{ tenant_id: "tenant-1" }] },
      { rows: [{ id: "44444444-4444-4444-8444-444444444444", package_id: "package-1", provider_kind: "openai_api" }] },
      { rows: [{ id: "install-1" }] },
      { rows: [{ id: "requirement-1", capability: "text_generation", provider_kind: "openai_api" }] },
      { rows: [{ id: "secret-reference-1", secret_ref: "wf_secret_demo", label: "Primary OpenAI", metadata: {} }] },
      { rows: [{ id: "reservation-1" }] },
      { rows: [] },
      { rows: [] }
    ];
    const queries: string[] = [];
    const client = {
      query: vi.fn(async (sql) => {
        queries.push(String(sql));
        return responses.shift() ?? { rows: [] };
      })
    };
    const bootstrapNativePublicRun = vi.fn(async () => undefined);

    await expect(
      reserveLiveWorkflowRun({
        client,
        tenantId: "tenant-1",
        userId: "user-1",
        workflowId: "wf_connect_first_workflow",
        workflowTemplateId: "44444444-4444-4444-8444-444444444444",
        runId: "fresh-proof-run-1",
        idempotencyKey: "tenant-1:wf_connect_first_workflow:fresh-proof-run-1",
        skipExistingHarnessReuse: true,
        bootstrapNativePublicRun
      })
    ).resolves.toEqual({ reserved: true, runId: "fresh-proof-run-1" });

    expect(queries.some((sql) => sql.includes("from wfpc.harness_runs"))).toBe(false);
    expect(queries.some((sql) => sql.includes("insert into wfpc.workflow_run_reservations"))).toBe(true);
    expect(bootstrapNativePublicRun).toHaveBeenCalledWith({
      client,
      tenantId: "tenant-1",
      runId: "fresh-proof-run-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "package-1",
      providerKind: "openai_api",
      credentialLabel: "Primary OpenAI"
    });
  });

  it("loads a combined workflow snapshot from workflow runs and outbox", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              run_id: "run-1",
              run_status: "queued",
              run_created_at: new Date("2026-05-20T06:00:00.000Z"),
              public_workflow_id: "wf_connect_first_workflow",
              workflow_template_id: "44444444-4444-4444-8444-444444444444",
              bound_secret_reference_id: "secret-ref-1",
              bound_provider_context: [
                {
                  capability: "text_generation",
                  providerKind: "openai_api",
                  label: "OpenAI",
                  secretRef: "wf_secret_demo",
                  metadata: { project: "demo" }
                }
              ],
              outbox_id: "outbox-1",
              outbox_status: "enqueued",
              outbox_created_at: new Date("2026-05-20T06:00:01.000Z"),
              outbox_public_workflow_id: "wf_connect_first_workflow",
              outbox_workflow_template_id: "44444444-4444-4444-8444-444444444444",
              outbox_attempts: 1,
              outbox_last_error: null
            }
          ]
        })
    };

    await expect(loadWorkflowRunSnapshot({ client, tenantId: "tenant-1", runId: "run-1" })).resolves.toEqual({
      run: {
        id: "run-1",
        status: "queued",
        createdAt: "2026-05-20T06:00:00.000Z",
        publicWorkflowId: "wf_connect_first_workflow",
        workflowTemplateId: "44444444-4444-4444-8444-444444444444",
        boundSecretReferenceId: "secret-ref-1",
        providerContext: [
          {
            capability: "text_generation",
            providerKind: "openai_api",
            label: "OpenAI",
            secretRef: "wf_secret_demo",
            metadata: { project: "demo" }
          }
        ]
      },
      outbox: {
        id: "outbox-1",
        status: "enqueued",
        createdAt: "2026-05-20T06:00:01.000Z",
        publicWorkflowId: "wf_connect_first_workflow",
        workflowTemplateId: "44444444-4444-4444-8444-444444444444",
        attempts: 1,
        lastError: null
      }
    });
  });

  it("summarizes a successfully queued live run as ready for worker execution", () => {
    expect(
      summarizeWorkflowRunVerification({
        snapshot: {
          run: {
            id: "run-1",
            status: "queued",
            boundSecretReferenceId: "secret-ref-1",
            providerContext: [
              {
                capability: "text_generation",
                providerKind: "openai_api",
                label: "OpenAI",
                secretRef: "wf_secret_demo",
                metadata: {}
              }
            ]
          },
          outbox: {
            id: "outbox-1",
            status: "enqueued",
            attempts: 1,
            lastError: null
          }
        },
        queue: {
          queueName: "wfpc-workflow-runs",
          jobId: "tenant-1:workflow-1:run-1",
          state: "waiting"
        }
      })
    ).toEqual({
      ok: true,
      phase: "queued_for_worker",
      notes: [
        "Workflow run is reserved and queued.",
        "Bound provider context is attached to the workflow run.",
        "BullMQ job is present for worker pickup."
      ]
    });
  });

  it("surfaces outbox failures as actionable verification failures", () => {
    expect(
      summarizeWorkflowRunVerification({
        snapshot: {
          run: {
            id: "run-1",
            status: "queued",
            boundSecretReferenceId: "secret-ref-1",
            providerContext: []
          },
          outbox: {
            id: "outbox-1",
            status: "failed",
            attempts: 3,
            lastError: "redis unavailable"
          }
        },
        queue: {
          queueName: "wfpc-workflow-runs",
          jobId: "tenant-1:workflow-1:run-1",
          state: null
        }
      })
    ).toEqual({
      ok: false,
      phase: "outbox_failed",
      notes: [
        "Workflow run is reserved but the outbox is failing to enqueue.",
        "Last outbox error: redis unavailable"
      ]
    });
  });

  it("fails closed when the workflow run carries more than one bound provider context entry", () => {
    expect(
      summarizeWorkflowRunVerification({
        snapshot: {
          run: {
            id: "run-1",
            status: "queued",
            boundSecretReferenceId: "secret-ref-1",
            providerContext: [
              {
                capability: "text_generation",
                providerKind: "openai_api",
                label: "OpenAI",
                secretRef: "wf_secret_demo",
                metadata: {}
              },
              {
                capability: "image_generation",
                providerKind: "openai_api",
                label: "OpenAI",
                secretRef: "wf_secret_demo",
                metadata: {}
              }
            ]
          },
          outbox: {
            id: "outbox-1",
            status: "enqueued",
            attempts: 1,
            lastError: null
          }
        },
        queue: {
          queueName: "wfpc-workflow-runs",
          jobId: "tenant-1:workflow-1:run-1",
          state: "waiting"
        }
      })
    ).toEqual({
      ok: false,
      phase: "binding_missing",
      notes: [
        "Workflow run is missing bound provider context.",
        "The worker should not be allowed to drift onto an unbound or shared credential."
      ]
    });
  });

  it("distinguishes unreachable queue inspection from missing queue state", () => {
    expect(
      summarizeWorkflowRunVerification({
        snapshot: {
          run: {
            id: "run-1",
            status: "queued",
            boundSecretReferenceId: "secret-ref-1",
            providerContext: [
              {
                capability: "text_generation",
                providerKind: "openai_api",
                label: "OpenAI",
                secretRef: "wf_secret_demo",
                metadata: {}
              }
            ]
          },
          outbox: {
            id: "outbox-1",
            status: "enqueued",
            attempts: 1,
            lastError: null
          }
        },
        queue: {
          queueName: "wfpc-workflow-runs",
          jobId: "tenant-1:workflow-1:run-1",
          state: null,
          reachable: false,
          error: "Connection is closed."
        }
      })
    ).toEqual({
      ok: false,
      phase: "queued_queue_unreachable",
      notes: [
        "Workflow run is reserved and the outbox is marked enqueued.",
        "Queue reachability could not be verified from this caller, so worker pickup is still unproven.",
        "Queue inspection error: Connection is closed."
      ]
    });
  });
});
