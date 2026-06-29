import { createRequire } from "node:module";

import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { postDashboardRunAndVerifyDurableBinding } = require("../scripts/lib/live-dashboard-run-proof.mjs");

describe("live dashboard run proof helper", () => {
  it("posts an authenticated dashboard run request and verifies the durable workflow run binding", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 202,
      json: vi.fn().mockResolvedValue({
        queued: true,
        runId: "run-123"
      })
    });
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            run_id: "run-123",
            run_status: "queued",
            run_created_at: new Date("2026-06-18T12:00:00.000Z"),
            public_workflow_id: "workflow-template-1",
            workflow_template_id: "workflow-template-1",
            bound_secret_reference_id: "secret-ref-1",
            bound_provider_context: [
              {
                capability: "text_generation",
                providerKind: "openai_api",
                label: "OpenAI",
                secretRef: "wf_secret_stale",
                metadata: {}
              }
            ],
            current_secret_ref: "wf_secret_current",
            outbox_id: "outbox-1",
            outbox_status: "pending",
            outbox_created_at: new Date("2026-06-18T12:00:01.000Z"),
            outbox_public_workflow_id: "workflow-template-1",
            outbox_workflow_template_id: "workflow-template-1",
            outbox_attempts: 0,
            outbox_last_error: null
          }
        ]
      })
    };

    await expect(
      postDashboardRunAndVerifyDurableBinding({
        baseUrl: "https://api.wealthfactory.test",
        portalOrigin: "https://app.wealthfactory.test",
        sessionToken: "signed-session-token",
        tenantId: "tenant-1",
        workflowId: "workflow-template-1",
        client,
        fetchImpl
      })
    ).resolves.toEqual({
      ok: true,
      runId: "run-123",
      snapshot: {
        run: {
          id: "run-123",
          status: "queued",
          createdAt: "2026-06-18T12:00:00.000Z",
          publicWorkflowId: "workflow-template-1",
          workflowTemplateId: "workflow-template-1",
          boundSecretReferenceId: "secret-ref-1",
          providerContext: [
            {
              capability: "text_generation",
              providerKind: "openai_api",
              label: "OpenAI",
              secretRef: "wf_secret_current",
              metadata: {}
            }
          ]
        },
        outbox: {
          id: "outbox-1",
          status: "pending",
          createdAt: "2026-06-18T12:00:01.000Z",
          publicWorkflowId: "workflow-template-1",
          workflowTemplateId: "workflow-template-1",
          attempts: 0,
          lastError: null
        }
      },
      verification: {
        ok: true,
        phase: "durable_binding_verified",
        notes: [
          "Dashboard run request returned HTTP 202 with a durable run id.",
          "Workflow run and queue outbox rows are present with a single bound provider context."
        ]
      }
    });

    expect(fetchImpl).toHaveBeenCalledWith("https://api.wealthfactory.test/api/dashboard/runs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.wealthfactory.test",
        cookie: "wf_portal_session=signed-session-token"
      },
      body: JSON.stringify({
        workflowId: "workflow-template-1"
      })
    });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("accepts a custom durable snapshot loader for live environments that cannot use the local pg path directly", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 202,
      json: vi.fn().mockResolvedValue({
        queued: true,
        runId: "run-remote-123"
      })
    });
    const loadSnapshot = vi.fn().mockResolvedValue({
      run: {
        id: "run-remote-123",
        status: "queued",
        createdAt: "2026-06-18T12:30:00.000Z",
        publicWorkflowId: "workflow-template-1",
        workflowTemplateId: "workflow-template-1",
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
        id: "outbox-remote-1",
        status: "pending",
        createdAt: "2026-06-18T12:30:01.000Z",
        publicWorkflowId: "workflow-template-1",
        workflowTemplateId: "workflow-template-1",
        attempts: 0,
        lastError: null
      }
    });

    await expect(
      postDashboardRunAndVerifyDurableBinding({
        baseUrl: "https://api.wealthfactory.test",
        portalOrigin: "https://app.wealthfactory.test",
        sessionToken: "signed-session-token",
        tenantId: "tenant-1",
        workflowId: "workflow-template-1",
        loadSnapshot,
        fetchImpl
      })
    ).resolves.toMatchObject({
      ok: true,
      runId: "run-remote-123",
      verification: {
        ok: true,
        phase: "durable_binding_verified"
      }
    });

    expect(loadSnapshot).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-remote-123"
    });
  });

  it("forwards an explicit fresh-run request body when the proof must avoid durable run reuse", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 202,
      json: vi.fn().mockResolvedValue({
        queued: true,
        runId: "run-fresh-123"
      })
    });
    const loadSnapshot = vi.fn().mockResolvedValue({
      run: {
        id: "run-fresh-123",
        status: "queued",
        createdAt: "2026-06-18T12:31:00.000Z",
        publicWorkflowId: "workflow-template-1",
        workflowTemplateId: "workflow-template-1",
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
        id: "outbox-fresh-1",
        status: "pending",
        createdAt: "2026-06-18T12:31:01.000Z",
        publicWorkflowId: "workflow-template-1",
        workflowTemplateId: "workflow-template-1",
        attempts: 0,
        lastError: null
      }
    });

    await expect(
      postDashboardRunAndVerifyDurableBinding({
        baseUrl: "https://api.wealthfactory.test",
        portalOrigin: "https://app.wealthfactory.test",
        sessionToken: "signed-session-token",
        tenantId: "tenant-1",
        workflowId: "workflow-template-1",
        freshRun: true,
        loadSnapshot,
        fetchImpl
      })
    ).resolves.toMatchObject({
      ok: true,
      runId: "run-fresh-123"
    });

    expect(fetchImpl).toHaveBeenCalledWith("https://api.wealthfactory.test/api/dashboard/runs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.wealthfactory.test",
        cookie: "wf_portal_session=signed-session-token"
      },
      body: JSON.stringify({
        workflowId: "workflow-template-1",
        freshRun: true
      })
    });
  });

  it("fails closed when the durable snapshot loses the authoritative current secret ref even if stale provider context remains", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 202,
      json: vi.fn().mockResolvedValue({
        queued: true,
        runId: "run-stale-123"
      })
    });
    const loadSnapshot = vi.fn().mockResolvedValue({
      run: {
        id: "run-stale-123",
        status: "queued",
        createdAt: "2026-06-18T12:32:00.000Z",
        publicWorkflowId: "workflow-template-1",
        workflowTemplateId: "workflow-template-1",
        boundSecretReferenceId: "secret-ref-1",
        providerContext: []
      },
      outbox: {
        id: "outbox-stale-1",
        status: "pending",
        createdAt: "2026-06-18T12:32:01.000Z",
        publicWorkflowId: "workflow-template-1",
        workflowTemplateId: "workflow-template-1",
        attempts: 0,
        lastError: null
      }
    });

    await expect(
      postDashboardRunAndVerifyDurableBinding({
        baseUrl: "https://api.wealthfactory.test",
        portalOrigin: "https://app.wealthfactory.test",
        sessionToken: "signed-session-token",
        tenantId: "tenant-1",
        workflowId: "workflow-template-1",
        loadSnapshot,
        fetchImpl
      })
    ).resolves.toMatchObject({
      ok: false,
      runId: "run-stale-123",
      verification: {
        ok: false,
        phase: "binding_missing"
      }
    });
  });

  it("retries durable snapshot verification once when the first snapshot is still missing rows", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 202,
      json: vi.fn().mockResolvedValue({
        queued: true,
        runId: "run-retry-123"
      })
    });
    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    const loadSnapshot = vi.fn()
      .mockResolvedValueOnce({
        run: {
          id: "",
          status: "",
          createdAt: null,
          publicWorkflowId: "",
          workflowTemplateId: "",
          boundSecretReferenceId: null,
          providerContext: []
        },
        outbox: {
          id: "",
          status: "",
          createdAt: null,
          publicWorkflowId: "",
          workflowTemplateId: "",
          attempts: null,
          lastError: null
        }
      })
      .mockResolvedValueOnce({
        run: {
          id: "run-retry-123",
          status: "queued",
          createdAt: "2026-06-18T12:45:00.000Z",
          publicWorkflowId: "workflow-template-1",
          workflowTemplateId: "workflow-template-1",
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
          id: "outbox-retry-1",
          status: "pending",
          createdAt: "2026-06-18T12:45:01.000Z",
          publicWorkflowId: "workflow-template-1",
          workflowTemplateId: "workflow-template-1",
          attempts: 0,
          lastError: null
        }
      });

    await expect(
      postDashboardRunAndVerifyDurableBinding({
        baseUrl: "https://api.wealthfactory.test",
        portalOrigin: "https://app.wealthfactory.test",
        sessionToken: "signed-session-token",
        tenantId: "tenant-1",
        workflowId: "workflow-template-1",
        loadSnapshot,
        sleepImpl,
        fetchImpl
      })
    ).resolves.toMatchObject({
      ok: true,
      runId: "run-retry-123",
      verification: {
        ok: true,
        phase: "durable_binding_verified"
      }
    });

    expect(loadSnapshot).toHaveBeenCalledTimes(2);
    expect(sleepImpl).toHaveBeenCalledWith(50);
  });

  it("fails closed when the durable run identity does not match the requested workflow selector", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 202,
      json: vi.fn().mockResolvedValue({
        queued: true,
        runId: "run-wrong-workflow-123"
      })
    });
    const loadSnapshot = vi.fn().mockResolvedValue({
      run: {
        id: "run-wrong-workflow-123",
        status: "queued",
        createdAt: "2026-06-18T13:00:00.000Z",
        publicWorkflowId: "wf_other_workflow",
        workflowTemplateId: "99999999-9999-4999-8999-999999999999",
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
        id: "outbox-other-1",
        status: "pending",
        createdAt: "2026-06-18T13:00:01.000Z",
        publicWorkflowId: "wf_other_workflow",
        workflowTemplateId: "99999999-9999-4999-8999-999999999999",
        attempts: 0,
        lastError: null
      }
    });

    await expect(
      postDashboardRunAndVerifyDurableBinding({
        baseUrl: "https://api.wealthfactory.test",
        portalOrigin: "https://app.wealthfactory.test",
        sessionToken: "signed-session-token",
        tenantId: "tenant-1",
        workflowId: "workflow-template-1",
        loadSnapshot,
        fetchImpl
      })
    ).resolves.toMatchObject({
      ok: false,
      verification: {
        ok: false,
        phase: "workflow_identity_mismatch"
      }
    });
  });

  it("fails closed when the run and outbox disagree on the requested workflow selector", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 202,
      json: vi.fn().mockResolvedValue({
        queued: true,
        runId: "run-mixed-workflow-123"
      })
    });
    const loadSnapshot = vi.fn().mockResolvedValue({
      run: {
        id: "run-mixed-workflow-123",
        status: "queued",
        createdAt: "2026-06-18T13:05:00.000Z",
        publicWorkflowId: "workflow-template-1",
        workflowTemplateId: "workflow-template-1",
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
        id: "outbox-mixed-1",
        status: "pending",
        createdAt: "2026-06-18T13:05:01.000Z",
        publicWorkflowId: "wf_other_workflow",
        workflowTemplateId: "99999999-9999-4999-8999-999999999999",
        attempts: 0,
        lastError: null
      }
    });

    await expect(
      postDashboardRunAndVerifyDurableBinding({
        baseUrl: "https://api.wealthfactory.test",
        portalOrigin: "https://app.wealthfactory.test",
        sessionToken: "signed-session-token",
        tenantId: "tenant-1",
        workflowId: "workflow-template-1",
        loadSnapshot,
        fetchImpl
      })
    ).resolves.toMatchObject({
      ok: false,
      verification: {
        ok: false,
        phase: "workflow_identity_mismatch"
      }
    });
  });

  it("fails closed when the durable outbox lands in a failed state", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 202,
      json: vi.fn().mockResolvedValue({
        queued: true,
        runId: "run-failed-outbox-123"
      })
    });
    const loadSnapshot = vi.fn().mockResolvedValue({
      run: {
        id: "run-failed-outbox-123",
        status: "queued",
        createdAt: "2026-06-18T13:10:00.000Z",
        publicWorkflowId: "workflow-template-1",
        workflowTemplateId: "workflow-template-1",
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
        id: "outbox-failed-1",
        status: "failed",
        createdAt: "2026-06-18T13:10:01.000Z",
        publicWorkflowId: "workflow-template-1",
        workflowTemplateId: "workflow-template-1",
        attempts: 2,
        lastError: "queue unavailable"
      }
    });

    await expect(
      postDashboardRunAndVerifyDurableBinding({
        baseUrl: "https://api.wealthfactory.test",
        portalOrigin: "https://app.wealthfactory.test",
        sessionToken: "signed-session-token",
        tenantId: "tenant-1",
        workflowId: "workflow-template-1",
        loadSnapshot,
        fetchImpl
      })
    ).resolves.toMatchObject({
      ok: false,
      verification: {
        ok: false,
        phase: "outbox_failed"
      }
    });
  });

  it("fails closed when the durable outbox lands in an unexpected non-launch state", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 202,
      json: vi.fn().mockResolvedValue({
        queued: true,
        runId: "run-unexpected-outbox-123"
      })
    });
    const loadSnapshot = vi.fn().mockResolvedValue({
      run: {
        id: "run-unexpected-outbox-123",
        status: "queued",
        createdAt: "2026-06-18T13:15:00.000Z",
        publicWorkflowId: "workflow-template-1",
        workflowTemplateId: "workflow-template-1",
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
        id: "outbox-unexpected-1",
        status: "paused",
        createdAt: "2026-06-18T13:15:01.000Z",
        publicWorkflowId: "workflow-template-1",
        workflowTemplateId: "workflow-template-1",
        attempts: 0,
        lastError: null
      }
    });

    await expect(
      postDashboardRunAndVerifyDurableBinding({
        baseUrl: "https://api.wealthfactory.test",
        portalOrigin: "https://app.wealthfactory.test",
        sessionToken: "signed-session-token",
        tenantId: "tenant-1",
        workflowId: "workflow-template-1",
        loadSnapshot,
        fetchImpl
      })
    ).resolves.toMatchObject({
      ok: false,
      verification: {
        ok: false,
        phase: "outbox_unexpected"
      }
    });
  });
});
