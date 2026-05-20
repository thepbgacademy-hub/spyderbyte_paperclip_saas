import { createRequire } from "node:module";

import { describe, expect, it, vi } from "vitest";

// Vitest imports the plain Node `.mjs` helper directly for script-level coverage.
const require = createRequire(import.meta.url);
const { createLiveRunRequest, loadWorkflowRunSnapshot, summarizeWorkflowRunVerification } = require("../scripts/lib/live-run-drive.mjs");

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
      ok: true,
      phase: "queued_queue_unreachable",
      notes: [
        "Workflow run is reserved and the outbox is marked enqueued.",
        "Queue reachability could not be verified from this caller.",
        "Queue inspection error: Connection is closed."
      ]
    });
  });
});
