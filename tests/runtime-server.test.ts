import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";

import { createRuntimeSessionAuth, createRuntimeSessionToken } from "../src/api/runtime-auth.js";
import { createDashboardRuntime, createNodeRequestListener, loadRuntimeEnv } from "../src/api/runtime-server.js";
import { createDurableAuditSink } from "../src/audit/durable-audit.js";
import { createPgPoolQueryClient, createPgTransactionRunner } from "../src/db/postgres-client.js";
import {
  createHarnessBoardService,
  type HarnessGovernanceHistoryExportReadyDispatch,
  type HarnessPackageBundleExportReadyDispatch
} from "../src/harness/board-service.js";

const TEST_SUPABASE_DB_URL = "postgresql://postgres.tenant:placeholder-password@db.invalid:5432/postgres";
type MockExportDeliveryRow = {
  id: string;
  run_id: string;
  tenant_id: string;
  workflow_id: string;
  package_id: string;
  candidate_id: "governance_history_export" | "package_bundle_export";
  status: "export_ready" | "delivery_in_progress" | "delivered" | "delivery_failed";
  export_format: "obsidian_markdown_bundle";
  record_target: "governance_history_record" | "package_deliverable_record";
  bundle_id: string;
  bundle_revision: string;
  idempotency_key: string;
  note_title: string;
  note_file_name: string;
  placement_manifest: Record<string, unknown>;
  files: Array<Record<string, unknown>>;
  record_count: number;
  disclosure_summary: string;
  redaction_summary: string;
  attempt_count: number;
  last_attempted_at: string | null;
  delivered_at: string | null;
  writer_kind: "obsidian_filesystem" | null;
  delivery_receipt: Record<string, unknown>;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
};

const defaultExportDeliveryRow: MockExportDeliveryRow = {
  id: "export_delivery_1",
  run_id: "run_123",
  tenant_id: "tenant_123",
  workflow_id: "wf_connect_first_workflow",
  package_id: "pkg_bib_connect",
  candidate_id: "governance_history_export",
  status: "export_ready",
  export_format: "obsidian_markdown_bundle",
  record_target: "governance_history_record",
  bundle_id: "bundle_123",
  bundle_revision: "bundle_revision_123",
  idempotency_key: "idempotency_123",
  note_title: "Governance history",
  note_file_name: "wf_connect_first_workflow-governance-history.md",
  placement_manifest: {
    targetSystem: "obsidian_vault",
    vaultFolder: "wealth-factory/governance-history/wf_connect_first_workflow",
    primaryNotePath:
      "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
    syncStrategy: "append_history_entry",
    confirmationRequirement: "tenant_export_confirmation"
  },
  files: [
    {
      path: "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
      mediaType: "text/markdown",
      byteSize: 20,
      checksum: "abc",
      content: "# Governance history"
    }
  ],
  record_count: 2,
  disclosure_summary: "Decision summary only",
  redaction_summary: "Governance-safe redaction",
  attempt_count: 0,
  last_attempted_at: null,
  delivered_at: null,
  writer_kind: null,
  delivery_receipt: {},
  last_error_code: null,
  last_error_message: null,
  created_at: "2026-05-29T00:00:00.000Z",
  updated_at: "2026-05-29T00:00:00.000Z"
};

let mockExportDeliveryRow = { ...defaultExportDeliveryRow };

function resetMockExportDeliveryRow(overrides: Partial<typeof defaultExportDeliveryRow> = {}) {
  mockExportDeliveryRow = {
    ...defaultExportDeliveryRow,
    ...overrides
  };
}

function createMockDbQuery() {
  return vi.fn(async (sql: string, values: readonly unknown[] = []) => {
    if (sql.includes("from wfpc.harness_export_deliveries") && sql.includes("idempotency_key")) {
      return { rows: [mockExportDeliveryRow] };
    }

    if (sql.includes("insert into wfpc.harness_export_deliveries")) {
      return { rows: [mockExportDeliveryRow] };
    }

    if (sql.includes("update wfpc.harness_export_deliveries")) {
      if (sql.includes("set status = 'delivery_in_progress'")) {
        const claimedAt = values[2] === null || values[2] === undefined ? null : Date.parse(String(values[2]));
        const existingAttemptedAt =
          mockExportDeliveryRow.last_attempted_at === null ? null : Date.parse(mockExportDeliveryRow.last_attempted_at);
        const staleInProgress =
          mockExportDeliveryRow.status === "delivery_in_progress" &&
          claimedAt !== null &&
          existingAttemptedAt !== null &&
          Number.isFinite(claimedAt) &&
          Number.isFinite(existingAttemptedAt) &&
          claimedAt - existingAttemptedAt >= 10 * 60 * 1000;
        if (
          mockExportDeliveryRow.status !== "export_ready" &&
          mockExportDeliveryRow.status !== "delivery_failed" &&
          !staleInProgress
        ) {
          return { rows: [] };
        }
        mockExportDeliveryRow = {
          ...mockExportDeliveryRow,
          status: "delivery_in_progress",
          writer_kind:
            values[1] === null || values[1] === undefined
              ? null
              : (String(values[1]) as NonNullable<MockExportDeliveryRow["writer_kind"]>),
          delivery_receipt: {},
          attempt_count: mockExportDeliveryRow.attempt_count + 1,
          last_attempted_at: values[2] === null || values[2] === undefined ? null : String(values[2]),
          delivered_at: null,
          last_error_code: null,
          last_error_message: null,
          updated_at: values[3] === null || values[3] === undefined ? mockExportDeliveryRow.updated_at : String(values[3])
        };
        return { rows: [mockExportDeliveryRow] };
      }
      if (mockExportDeliveryRow.status !== "delivery_in_progress") {
        return { rows: [] };
      }
      const expectedAttemptedAt = values[10] === null || values[10] === undefined ? null : String(values[10]);
      if (mockExportDeliveryRow.last_attempted_at !== expectedAttemptedAt) {
        return { rows: [] };
      }
      mockExportDeliveryRow = {
        ...mockExportDeliveryRow,
        status: (values[0] ?? mockExportDeliveryRow.status) as MockExportDeliveryRow["status"],
        writer_kind:
          values[1] === null || values[1] === undefined
            ? null
            : (String(values[1]) as NonNullable<MockExportDeliveryRow["writer_kind"]>),
        delivery_receipt:
          typeof values[2] === "string" ? JSON.parse(String(values[2])) : (values[2] as Record<string, unknown> | null) ?? {},
        attempt_count: Number(values[3] ?? mockExportDeliveryRow.attempt_count),
        last_attempted_at: values[4] === null || values[4] === undefined ? null : String(values[4]),
        delivered_at: values[5] === null || values[5] === undefined ? null : String(values[5]),
        last_error_code: values[6] === null || values[6] === undefined ? null : String(values[6]),
        last_error_message: values[7] === null || values[7] === undefined ? null : String(values[7]),
        updated_at: values[8] === null || values[8] === undefined ? mockExportDeliveryRow.updated_at : String(values[8])
      };
      return { rows: [mockExportDeliveryRow] };
    }

    if (sql.includes("harness_export_deliveries")) {
      return { rows: [mockExportDeliveryRow] };
    }

    if (sql.includes("workflow_queue_outbox")) {
      return { rows: [{ id: "outbox-redispatch-1" }] };
    }

    return { rows: [] };
  });
}

vi.mock("../src/db/postgres-client.js", () => ({
  createPgPool: vi.fn(() => ({
    query: createMockDbQuery(),
    connect: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined)
  })),
  createPgPoolQueryClient: vi.fn(() => ({ query: createMockDbQuery() })),
  createPgTransactionRunner: vi.fn(() => {
    const query = createMockDbQuery();
    return {
      __query: query,
      withTransaction: vi.fn().mockImplementation(async (callback: (transaction: { query: typeof query }) => Promise<unknown>) =>
        callback({ query })
      )
    };
  })
}));

vi.mock("../src/db/supabase-repositories.js", () => ({
  createSupabaseStorageConnectorRepository: vi.fn(() => ({ register: vi.fn() })),
  createSupabaseSecretRepository: vi.fn(() => ({
    create: vi.fn(),
    updateSecretRef: vi.fn(),
    revoke: vi.fn(),
    findIdBySecretRef: vi.fn(),
    describeSecretRef: vi.fn()
  })),
  createSupabaseRepositories: vi.fn(() => ({
    resolvePaperclipCompanyMapping: vi.fn().mockResolvedValue({ paperclipCompanyId: "pc-company-1", paperclipIssueAgentId: "pc-agent-1" }),
    hasActiveWorkflowRuns: vi.fn().mockResolvedValue(false),
    countActiveWorkflowRuns: vi.fn().mockResolvedValue(0),
    requireTenantMember: vi.fn(),
    requireActivePackageInstall: vi.fn(),
    listWorkflows: vi.fn(),
    listPackages: vi.fn(),
    listArtifacts: vi.fn(),
    listProviderConnections: vi.fn(),
    listStorageConnectors: vi.fn(),
    getPlatformLoad: vi.fn().mockResolvedValue({
      level: "light",
      summary: "Light traffic",
      detail: "New workflows should begin processing quickly."
    })
  }))
}));

vi.mock("../src/audit/durable-audit.js", () => ({
  createDurableAuditSink: vi.fn(() => vi.fn().mockResolvedValue(undefined))
}));

vi.mock("../src/security/postgres-rate-limit.js", () => ({
  createPostgresFixedWindowRateLimiter: vi.fn(() => ({
    consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 })
  }))
}));

vi.mock("../src/harness/board-service.js", () => ({
  createHarnessBoardService: vi.fn(() => ({
    listBoardState: vi.fn().mockResolvedValue({
      runId: "run_123",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      columns: [
        {
          id: "planning",
          title: "Planning",
          description: "Work being shaped by the orchestrator.",
          cardIds: ["card_1"]
        }
      ],
      cards: [
        {
          id: "card_1",
          persona: "CEO",
          title: "Shape the launch plan",
          summary: "Keep the board calm and tenant-safe.",
          lane: "planning",
          statusLabel: "Planning",
          priorityLabel: "High priority",
          deliverableLabel: "Launch Plan",
          updatedAtLabel: "Updated recently",
          outcome: "The next move is being clarified without backend chatter.",
          focusPoints: ["Stay bounded", "Keep it clear", "Protect tenant context"],
          activity: [
            {
              id: "activity_1",
              label: "CEO opened the planning lane.",
              timestampLabel: "recently"
            }
          ],
          detailSections: [
            {
              id: "snapshot",
              title: "Snapshot",
              body: "This lane is ready to resume from persisted state."
            }
          ]
        }
      ],
      pendingApprovals: [],
      followThroughItems: [],
      recentDecisions: []
    }),
    approveProposal: vi.fn().mockResolvedValue({ cardId: "card_approved_1" }),
    decideProposal: vi.fn().mockResolvedValue({ status: "approved", cardId: "card_approved_1" }),
    createTopLevelChildCard: vi.fn().mockResolvedValue({ cardId: "card_created_1" }),
    advanceChildCard: vi.fn().mockResolvedValue({ cardId: "card_created_1", state: "working" }),
    completeRun: vi.fn().mockResolvedValue({ runId: "run_123", state: "done" }),
    reviewPendingAttention: vi.fn().mockResolvedValue({ status: "done", runId: "run_123" }),
    resolvePendingAttention: vi.fn().mockResolvedValue({ status: "resumed", cardId: "card_created_1", state: "working" }),
    startFreshCycle: vi.fn().mockResolvedValue({ runId: "run_124", reopenedProposalCount: 1 })
  }))
}));

vi.mock("../src/paperclip/secret-sync.js", () => ({
  createPaperclipSecretBindingRepository: vi.fn(() => ({})),
  createPaperclipSecretAdminHttpClient: vi.fn(() => ({})),
  createPaperclipSecretProjectionService: vi.fn(() => ({
    onRegistered: vi.fn(),
    onRotated: vi.fn(),
    revokeBySecretRef: vi.fn()
  }))
}));

vi.mock("../src/secrets/provider-credential-service.js", () => ({
  createProviderCredentialService: vi.fn(() => ({ register: vi.fn() }))
}));

vi.mock("../src/secrets/secret-service.js", () => ({
  createSecretService: vi.fn(() => ({
    rotate: vi.fn(),
    registerProviderCredential: vi.fn(),
    access: vi.fn(),
    revoke: vi.fn()
  }))
}));

vi.mock("../src/secrets/acid-secret-revoke-service.js", () => ({
  createAcidSecretRevokeService: vi.fn(() => ({ revoke: vi.fn() }))
}));

vi.mock("../src/workflows/queue-outbox-pump.js", () => ({
  createQueueOutboxPump: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn()
  }))
}));

describe("runtime server", () => {
  it("loads explicit split-origin runtime settings", () => {
    expect(
      loadRuntimeEnv({
        SUPABASE_DB_URL: TEST_SUPABASE_DB_URL,
        SUPABASE_DB_SSL: "false",
        WF_ALLOWED_ORIGINS: "https://www.spyderbyte.cloud, https://portal.spyderbyte.cloud",
        WF_API_PORT: "8081",
        WF_VAULT_MASTER_KEY: "test-master-key-with-enough-length"
      })
    ).toMatchObject({
      supabaseDbUrl: TEST_SUPABASE_DB_URL,
      supabaseDbSsl: "false",
      allowedOrigins: ["https://www.spyderbyte.cloud", "https://portal.spyderbyte.cloud"],
      apiPort: 8081,
      vaultMasterKey: "test-master-key-with-enough-length"
    });
  });

  it("rejects wildcard portal origins for authenticated APIs", () => {
    expect(() =>
      loadRuntimeEnv({
        SUPABASE_DB_URL: TEST_SUPABASE_DB_URL,
        WF_ALLOWED_ORIGINS: "*",
        WF_VAULT_MASTER_KEY: "test-master-key-with-enough-length"
      })
    ).toThrow(/WF_ALLOWED_ORIGINS/);
  });

  it("requires a vault master key for runtime credential storage", () => {
    expect(() =>
      loadRuntimeEnv({
        SUPABASE_DB_URL: TEST_SUPABASE_DB_URL,
        WF_ALLOWED_ORIGINS: "https://www.spyderbyte.cloud"
      })
    ).toThrow(/WF_VAULT_MASTER_KEY/);
  });

  it("requires the storage OAuth redirect origin to match an allowed portal origin", () => {
    expect(() =>
      loadRuntimeEnv({
        SUPABASE_DB_URL: TEST_SUPABASE_DB_URL,
        WF_ALLOWED_ORIGINS: "https://portal.spyderbyte.cloud",
        WF_STORAGE_OAUTH_REDIRECT_ORIGIN: "https://api.spyderbyte.cloud",
        WF_VAULT_MASTER_KEY: "test-master-key-with-enough-length"
      })
    ).toThrow(/WF_STORAGE_OAUTH_REDIRECT_ORIGIN/);
  });

  it("normalizes the accepted storage OAuth redirect origin before storing it in runtime config", () => {
    expect(
      loadRuntimeEnv({
        SUPABASE_DB_URL: TEST_SUPABASE_DB_URL,
        WF_ALLOWED_ORIGINS: "https://portal.spyderbyte.cloud",
        WF_STORAGE_OAUTH_REDIRECT_ORIGIN: "https://portal.spyderbyte.cloud/",
        WF_VAULT_MASTER_KEY: "test-master-key-with-enough-length"
      }).storageOAuthRedirectOrigin
    ).toBe("https://portal.spyderbyte.cloud");
  });

  it("normalizes an absolute Obsidian export root before storing it in runtime config", () => {
    expect(
      loadRuntimeEnv({
        SUPABASE_DB_URL: TEST_SUPABASE_DB_URL,
        WF_ALLOWED_ORIGINS: "https://portal.spyderbyte.cloud",
        WF_VAULT_MASTER_KEY: "test-master-key-with-enough-length",
        WF_OBSIDIAN_EXPORT_ROOT: "C:\\obsidian-vault\\exports\\..\\exports"
      }).obsidianExportRoot
    ).toBe("C:\\obsidian-vault\\exports");
  });

  it("rejects relative Obsidian export roots", () => {
    expect(() =>
      loadRuntimeEnv({
        SUPABASE_DB_URL: TEST_SUPABASE_DB_URL,
        WF_ALLOWED_ORIGINS: "https://portal.spyderbyte.cloud",
        WF_VAULT_MASTER_KEY: "test-master-key-with-enough-length",
        WF_OBSIDIAN_EXPORT_ROOT: "relative\\vault"
      })
    ).toThrow(/WF_OBSIDIAN_EXPORT_ROOT/);
  });

  it("adapts Node requests to the guarded dashboard HTTP handler", async () => {
    const handler = vi.fn().mockResolvedValue({
      status: 200,
      headers: { "x-content-type-options": "nosniff" },
      body: { ok: true }
    });
    const request = createRequest({
      method: "GET",
      url: "/api/dashboard?tab=runs",
      headers: {
        authorization: "Bearer token",
        origin: "https://www.spyderbyte.cloud",
        "content-length": "0",
        "x-forwarded-for": "203.0.113.7, 10.0.0.1"
      }
    });
    const response = createResponse();

    createNodeRequestListener(handler)(request as unknown as IncomingMessage, response as unknown as ServerResponse);
    await response.finished;

    expect(handler).toHaveBeenCalledWith({
      method: "GET",
      path: "/api/dashboard",
      headers: {
        authorization: "Bearer token",
        origin: "https://www.spyderbyte.cloud"
      },
      query: { tab: "runs" },
      bodyByteLength: 0,
      ip: "203.0.113.7"
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(JSON.stringify({ ok: true }));
  });

  it("rejects oversized chunked request bodies based on bytes actually read", async () => {
    const handler = vi.fn();
    const request = createRequest({
      method: "POST",
      url: "/api/harness/cards",
      headers: {
        authorization: "Bearer token",
        origin: "https://www.spyderbyte.cloud",
        "content-type": "application/json"
      },
      bodyChunks: [Buffer.alloc(10_000, "a"), Buffer.alloc(8_000, "b")]
    });
    const response = createResponse();

    createNodeRequestListener(handler)(request as unknown as IncomingMessage, response as unknown as ServerResponse);
    await response.finished;

    expect(handler).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(413);
    expect(response.body).toBe(JSON.stringify({ code: "request_rejected" }));
  });

  it("keeps security and CORS headers on malformed JSON adapter rejections", async () => {
    const handler = vi.fn();
    const request = createRequest({
      method: "POST",
      url: "/api/harness/cards",
      headers: {
        authorization: "Bearer token",
        origin: "https://www.spyderbyte.cloud",
        "content-type": "application/json"
      },
      body: "{not-json",
      remoteAddress: "127.0.0.1"
    });
    const response = createResponse();

    createNodeRequestListener(handler, ["https://www.spyderbyte.cloud"])(
      request as unknown as IncomingMessage,
      response as unknown as ServerResponse
    );
    await response.finished;

    expect(handler).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(400);
    expect(response.headers["access-control-allow-origin"]).toBe("https://www.spyderbyte.cloud");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.body).toBe(JSON.stringify({ code: "invalid_request" }));
  });

  it("routes health checks through the runtime readiness handler", async () => {
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {}
      },
      auth: { authenticate: vi.fn() }
    });

    const request = createRequest({
      method: "GET",
      url: "/api/health",
      headers: {
        origin: "https://www.spyderbyte.cloud",
        "content-length": "0"
      }
    });
    const response = createResponse();

    runtime.server.emit("request", request as unknown as IncomingMessage, response as unknown as ServerResponse);
    await response.finished;

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(JSON.stringify({ status: "ok", service: "wealth_factory_api" }));
    await runtime.close();
  });

  it("routes harness board requests through the new harness HTTP surface", async () => {
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {}
      },
      auth: { authenticate: vi.fn() }
    });

    const request = createRequest({
      method: "GET",
      url: "/api/harness/board",
      headers: {
        authorization: "Bearer token",
        origin: "https://www.spyderbyte.cloud",
        "content-length": "0"
      }
    });
    const response = createResponse();

    runtime.server.emit("request", request as unknown as IncomingMessage, response as unknown as ServerResponse);
    await response.finished;

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"runId":"run_123"');
    expect(response.body).toContain('"persona":"CEO"');
    expect(response.body).not.toContain("prompt");
    await runtime.close();
  });

  it("routes the harness direct-child mutation through the runtime harness surface", async () => {
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {}
      },
      auth: { authenticate: vi.fn() }
    });

    const request = createRequest({
      method: "POST",
      url: "/api/harness/cards",
      headers: {
        authorization: "Bearer token",
        origin: "https://www.spyderbyte.cloud",
        "content-length": "89",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        persona: "cfo",
        title: "Pressure-test the pricing lane",
        deliverableType: "pricing_review"
      })
    });
    const response = createResponse();

    runtime.server.emit("request", request as unknown as IncomingMessage, response as unknown as ServerResponse);
    await response.finished;

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"cardId":"card_created_1"');
    await runtime.close();
  });

  it("routes harness child-card progression through the runtime harness surface", async () => {
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {}
      },
      auth: { authenticate: vi.fn() }
    });

    const request = createRequest({
      method: "POST",
      url: "/api/harness/cards/card_created_1/advance",
      headers: {
        authorization: "Bearer token",
        origin: "https://www.spyderbyte.cloud",
        "content-length": "19",
        "content-type": "application/json"
      },
      body: JSON.stringify({ state: "working" })
    });
    const response = createResponse();

    runtime.server.emit("request", request as unknown as IncomingMessage, response as unknown as ServerResponse);
    await response.finished;

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"cardId":"card_created_1"');
    expect(response.body).toContain('"state":"working"');
    await runtime.close();
  });

  it("routes harness completion through the runtime harness surface", async () => {
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {}
      },
      auth: { authenticate: vi.fn() }
    });

    const request = createRequest({
      method: "POST",
      url: "/api/harness/runs/run_123/complete",
      headers: {
        authorization: "Bearer token",
        origin: "https://www.spyderbyte.cloud",
        "content-length": String(
          JSON.stringify({
            completionSummary: "The CEO packaged the final business-facing outcome.",
            actionToken: "test-review-token"
          }).length
        ),
        "content-type": "application/json"
      },
      body: JSON.stringify({
        completionSummary: "The CEO packaged the final business-facing outcome.",
        actionToken: "test-review-token"
      })
    });
    const response = createResponse();

    runtime.server.emit("request", request as unknown as IncomingMessage, response as unknown as ServerResponse);
    await response.finished;

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"runId":"run_123"');
    expect(response.body).toContain('"state":"done"');
    await runtime.close();
  });

  it("routes harness fresh-cycle reopening through the runtime harness surface", async () => {
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {}
      },
      auth: { authenticate: vi.fn() }
    });

    const request = createRequest({
      method: "POST",
      url: "/api/harness/runs/run_123/fresh-cycle",
      headers: {
        authorization: "Bearer token",
        origin: "https://www.spyderbyte.cloud",
        "content-type": "application/json",
        "content-length": String(JSON.stringify({ mode: "clean", actionToken: "test-review-token" }).length)
      },
      body: JSON.stringify({ mode: "clean", actionToken: "test-review-token" })
    });
    const response = createResponse();

    runtime.server.emit("request", request as unknown as IncomingMessage, response as unknown as ServerResponse);
    await response.finished;
    const harnessBoardService = vi.mocked(createHarnessBoardService).mock.results.at(-1)?.value;

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"runId":"run_124"');
    expect(response.body).toContain('"reopenedProposalCount":1');
    expect(harnessBoardService?.startFreshCycle).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run_123",
        actionToken: "test-review-token",
        mode: "clean"
      })
    );
    await runtime.close();
  });

  it("wires the durable audit sink into the harness board service", async () => {
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {}
      },
      auth: { authenticate: vi.fn() }
    });

    const audit = vi.mocked(createDurableAuditSink).mock.results.at(-1)?.value;
    expect(createHarnessBoardService).toHaveBeenCalledWith(
      expect.objectContaining({
        audit
      })
    );

    await runtime.close();
  });

  it("wires the durable workflow outbox pump when a queue enqueuer is provided", async () => {
    const { createQueueOutboxPump } = await import("../src/workflows/queue-outbox-pump.js");
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {}
      },
      auth: { authenticate: vi.fn() },
      workflowQueueEnqueuer: { enqueueOnce: vi.fn().mockResolvedValue("enqueued") }
    });

    runtime.startWorkers();
    await runtime.close();

    expect(createQueueOutboxPump).toHaveBeenCalled();
    const pump = vi.mocked(createQueueOutboxPump).mock.results[0]?.value;
    expect(pump.start).toHaveBeenCalledOnce();
    expect(pump.stop).toHaveBeenCalledOnce();
  });

  it("requeues resolved harness attention through the existing workflow queue seam when an enqueuer is available", async () => {
    const enqueueOnce = vi.fn().mockResolvedValue("enqueued");
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {}
      },
      auth: { authenticate: vi.fn() },
      workflowQueueEnqueuer: { enqueueOnce }
    });

    const boardServiceOptions = vi.mocked(createHarnessBoardService).mock.calls.at(-1)?.[0];
    expect(boardServiceOptions?.onResolvedAttentionDispatch).toEqual(expect.any(Function));

    await boardServiceOptions?.onResolvedAttentionDispatch?.({
      tenantId: "tenant_123",
      userId: "user_123",
      runId: "run_123",
      workflowId: "wf_connect_first_workflow",
      cardId: "card_123",
      actionToken: "attention-token-123",
      command: "resume_lane",
      state: "working"
    });

    expect(enqueueOnce).not.toHaveBeenCalled();
    const redispatchQuery = (vi.mocked(createPgTransactionRunner).mock.results.at(-1)?.value as { __query?: ReturnType<typeof vi.fn> } | undefined)?.__query;
    const sql = redispatchQuery?.mock.calls.map(([statement]) => String(statement)).join("\n") ?? "";
    expect(sql).toMatch(/insert into wfpc\.workflow_queue_outbox/i);
    expect(sql).toMatch(/when wfpc\.workflow_queue_outbox\.status = 'claimed' then wfpc\.workflow_queue_outbox\.idempotency_key/i);
    expect(sql).toMatch(/else excluded\.idempotency_key/i);
    expect(redispatchQuery?.mock.calls[0]?.[1]?.[4]).toMatch(/^tenant_123:wf_connect_first_workflow:run_123:redispatch:resume_lane:[a-f0-9]{12}$/i);

    await runtime.close();
  });

  it("does not warn when resolved harness attention redispatch staging succeeds", async () => {
    const enqueueOnce = vi.fn().mockResolvedValue("enqueued");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {}
      },
      auth: { authenticate: vi.fn() },
      workflowQueueEnqueuer: { enqueueOnce }
    });

    const boardServiceOptions = vi.mocked(createHarnessBoardService).mock.calls.at(-1)?.[0];
    await expect(
      boardServiceOptions?.onResolvedAttentionDispatch?.({
        tenantId: "tenant_123",
        userId: "user_123",
        runId: "run_123",
        workflowId: "wf_connect_first_workflow",
        cardId: "card_123",
        actionToken: "attention-token-123",
        command: "resume_lane",
        state: "working"
      })
    ).resolves.toBeUndefined();

    expect(enqueueOnce).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    const redispatchQuery = (vi.mocked(createPgTransactionRunner).mock.results.at(-1)?.value as { __query?: ReturnType<typeof vi.fn> } | undefined)?.__query;
    const sql = redispatchQuery?.mock.calls.map(([statement]) => String(statement)).join("\n") ?? "";
    expect(sql).toMatch(/insert into wfpc\.workflow_queue_outbox/i);
    expect(enqueueOnce).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    await runtime.close();
  });

  it("requeues fresh harness cycles through the existing workflow queue seam when an enqueuer is available", async () => {
    const enqueueOnce = vi.fn().mockResolvedValue("enqueued");
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {}
      },
      auth: { authenticate: vi.fn() },
      workflowQueueEnqueuer: { enqueueOnce }
    });

    const boardServiceOptions = vi.mocked(createHarnessBoardService).mock.calls.at(-1)?.[0];
    expect(boardServiceOptions?.onFreshCycleDispatch).toEqual(expect.any(Function));

    await boardServiceOptions?.onFreshCycleDispatch?.({
      tenantId: "tenant_123",
      userId: "user_123",
      runId: "run_124",
      workflowId: "wf_connect_first_workflow",
      actionToken: "fresh-cycle-token-123",
      mode: "reopen_deferred",
      reopenedProposalCount: 1
    });

    expect(enqueueOnce).not.toHaveBeenCalled();
    const redispatchQuery = (vi.mocked(createPgTransactionRunner).mock.results.at(-1)?.value as { __query?: ReturnType<typeof vi.fn> } | undefined)?.__query;
    const sql = redispatchQuery?.mock.calls.map(([statement]) => String(statement)).join("\n") ?? "";
    expect(sql).toMatch(/insert into wfpc\.workflow_queue_outbox/i);
    expect(sql).toMatch(/when wfpc\.workflow_queue_outbox\.status = 'claimed' then wfpc\.workflow_queue_outbox\.idempotency_key/i);
    expect(sql).toMatch(/else excluded\.idempotency_key/i);
    expect(redispatchQuery?.mock.calls[0]?.[1]?.[4]).toMatch(/^tenant_123:wf_connect_first_workflow:run_124:redispatch:fresh_cycle_reopen_deferred:[a-f0-9]{12}$/i);

    await runtime.close();
  });

  it("does not warn when fresh-cycle redispatch staging succeeds", async () => {
    const enqueueOnce = vi.fn().mockResolvedValue("enqueued");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {}
      },
      auth: { authenticate: vi.fn() },
      workflowQueueEnqueuer: { enqueueOnce }
    });

    const boardServiceOptions = vi.mocked(createHarnessBoardService).mock.calls.at(-1)?.[0];
    await expect(
      boardServiceOptions?.onFreshCycleDispatch?.({
        tenantId: "tenant_123",
        userId: "user_123",
        runId: "run_124",
        workflowId: "wf_connect_first_workflow",
        actionToken: "fresh-cycle-token-123",
        mode: "reopen_deferred",
        reopenedProposalCount: 1
      })
    ).resolves.toBeUndefined();

    expect(enqueueOnce).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    const redispatchQuery = (vi.mocked(createPgTransactionRunner).mock.results.at(-1)?.value as { __query?: ReturnType<typeof vi.fn> } | undefined)?.__query;
    const sql = redispatchQuery?.mock.calls.map(([statement]) => String(statement)).join("\n") ?? "";
    expect(sql).toMatch(/insert into wfpc\.workflow_queue_outbox/i);
    expect(enqueueOnce).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    await runtime.close();
  });

  it("passes the private governance-history export-ready hook through to the board service seam", async () => {
    resetMockExportDeliveryRow();
    const onGovernanceHistoryExportReady = vi.fn().mockResolvedValue(undefined);
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {}
      },
      auth: { authenticate: vi.fn() },
      onGovernanceHistoryExportReady
    });

    const boardServiceOptions = vi.mocked(createHarnessBoardService).mock.calls.at(-1)?.[0];
    expect(boardServiceOptions?.onGovernanceHistoryExportReady).toEqual(expect.any(Function));

    await boardServiceOptions?.onGovernanceHistoryExportReady?.({
      tenantId: "tenant_123",
      userId: "user_123",
      runId: "run_123",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      candidateId: "governance_history_export",
      bundleId: "bundle_123",
      bundleRevision: "bundle_revision_123",
      exportFormat: "obsidian_markdown_bundle",
      recordTarget: "governance_history_record",
      idempotencyKey: "idempotency_123",
      noteTitle: "Governance history",
      noteFileName: "wf_connect_first_workflow-governance-history.md",
      placement: {
        targetSystem: "obsidian_vault",
        vaultFolder: "wealth-factory/governance-history/wf_connect_first_workflow",
        primaryNotePath: "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
        syncStrategy: "append_history_entry",
        confirmationRequirement: "tenant_export_confirmation"
      },
      files: [
        {
          path: "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
          mediaType: "text/markdown",
          byteSize: 20,
          checksum: "abc",
          content: "# Governance history"
        }
      ],
      recordCount: 2,
      disclosureSummary: "Decision summary only",
      redactionSummary: "Governance-safe redaction"
    });

    expect(onGovernanceHistoryExportReady).toHaveBeenCalledOnce();

    await runtime.close();
  });

  it("passes the private package-bundle export-ready hook through to the board service seam", async () => {
    resetMockExportDeliveryRow();
    const onPackageBundleExportReady = vi.fn().mockResolvedValue(undefined);
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {}
      },
      auth: { authenticate: vi.fn() },
      onPackageBundleExportReady
    });

    const boardServiceOptions = vi.mocked(createHarnessBoardService).mock.calls.at(-1)?.[0];
    expect(boardServiceOptions?.onPackageBundleExportReady).toEqual(expect.any(Function));

    await boardServiceOptions?.onPackageBundleExportReady?.({
      tenantId: "tenant_123",
      userId: "user_123",
      runId: "run_123",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      candidateId: "package_bundle_export",
      bundleId: "bundle_package_123",
      bundleRevision: "bundle_package_revision_123",
      exportFormat: "obsidian_markdown_bundle",
      recordTarget: "package_deliverable_record",
      idempotencyKey: "package_idempotency_123",
      noteTitle: "Package bundle",
      noteFileName: "wf_connect_first_workflow-package-bundle.md",
      placement: {
        targetSystem: "obsidian_vault",
        vaultFolder: "wealth-factory/package-bundles/wf_connect_first_workflow",
        primaryNotePath: "wealth-factory/package-bundles/wf_connect_first_workflow/wf_connect_first_workflow-package-bundle.md",
        syncStrategy: "replace_package_snapshot_after_board_closure",
        confirmationRequirement: "board_closure_then_tenant_export_confirmation"
      },
      files: [
        {
          path: "wealth-factory/package-bundles/wf_connect_first_workflow/wf_connect_first_workflow-package-bundle.md",
          mediaType: "text/markdown",
          byteSize: 20,
          checksum: "abc",
          content: "# Package bundle"
        }
      ],
      recordCount: 3,
      disclosureSummary: "Closure snapshot summary only",
      redactionSummary: "Package-safe redaction"
    });

    expect(onPackageBundleExportReady).toHaveBeenCalledOnce();
    await runtime.close();
  });

  it("delivers governance-history export bundles through the injected writer and records delivery success", async () => {
    resetMockExportDeliveryRow();
    const governanceHistoryExportWriter = {
      write: vi.fn().mockResolvedValue({
        writerKind: "obsidian_filesystem",
        deliveredAt: "2026-05-29T01:00:01.000Z",
        receipt: {
          primaryNotePath:
            "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
          manifestPath: "wealth-factory/governance-history/wf_connect_first_workflow/manifest.json",
          writtenFileCount: 2
        }
      })
    };
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {}
      },
      auth: { authenticate: vi.fn() },
      governanceHistoryExportWriter
    });

    const { createPgPoolQueryClient } = await import("../src/db/postgres-client.js");
    const query = vi.mocked(createPgPoolQueryClient).mock.results.at(-1)?.value.query;
    const boardServiceOptions = vi.mocked(createHarnessBoardService).mock.calls.at(-1)?.[0];
    await boardServiceOptions?.onGovernanceHistoryExportReady?.({
      tenantId: "tenant_123",
      userId: "user_123",
      runId: "run_123",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      candidateId: "governance_history_export",
      bundleId: "bundle_123",
      bundleRevision: "bundle_revision_123",
      exportFormat: "obsidian_markdown_bundle",
      recordTarget: "governance_history_record",
      idempotencyKey: "idempotency_123",
      noteTitle: "Governance history",
      noteFileName: "wf_connect_first_workflow-governance-history.md",
      placement: {
        targetSystem: "obsidian_vault",
        vaultFolder: "wealth-factory/governance-history/wf_connect_first_workflow",
        primaryNotePath:
          "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
        syncStrategy: "append_history_entry",
        confirmationRequirement: "tenant_export_confirmation"
      },
      files: [
        {
          path: "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
          mediaType: "text/markdown",
          byteSize: 20,
          checksum: "abc",
          content: "# Governance history"
        },
        {
          path: "wealth-factory/governance-history/wf_connect_first_workflow/manifest.json",
          mediaType: "application/json",
          byteSize: 42,
          checksum: "def",
          content: "{\"ok\":true}"
        }
      ],
      recordCount: 2,
      disclosureSummary: "Decision summary only",
      redactionSummary: "Governance-safe redaction"
    });

    expect(governanceHistoryExportWriter.write).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(expect.stringContaining("update wfpc.harness_export_deliveries"), expect.any(Array));

    await runtime.close();
  });

  it("delivers package-bundle export bundles through the injected writer and records delivery success", async () => {
    resetMockExportDeliveryRow();
    const packageBundleExportWriter = {
      write: vi.fn().mockResolvedValue({
        writerKind: "obsidian_filesystem",
        deliveredAt: "2026-05-30T01:00:01.000Z",
        receipt: {
          primaryNotePath:
            "wealth-factory/package-bundles/wf_connect_first_workflow/wf_connect_first_workflow-package-bundle.md",
          manifestPath: "wealth-factory/package-bundles/wf_connect_first_workflow/export-manifest.json",
          writtenFileCount: 4
        }
      })
    };
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {}
      },
      auth: { authenticate: vi.fn() },
      packageBundleExportWriter
    });

    const { createPgPoolQueryClient } = await import("../src/db/postgres-client.js");
    const query = vi.mocked(createPgPoolQueryClient).mock.results.at(-1)?.value.query;
    const boardServiceOptions = vi.mocked(createHarnessBoardService).mock.calls.at(-1)?.[0];
    await boardServiceOptions?.onPackageBundleExportReady?.({
      tenantId: "tenant_123",
      userId: "user_123",
      runId: "run_123",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      candidateId: "package_bundle_export",
      bundleId: "bundle_package_123",
      bundleRevision: "bundle_package_revision_123",
      exportFormat: "obsidian_markdown_bundle",
      recordTarget: "package_deliverable_record",
      idempotencyKey: "package_idempotency_123",
      noteTitle: "Package bundle",
      noteFileName: "wf_connect_first_workflow-package-bundle.md",
      placement: {
        targetSystem: "obsidian_vault",
        vaultFolder: "wealth-factory/package-bundles/wf_connect_first_workflow",
        primaryNotePath:
          "wealth-factory/package-bundles/wf_connect_first_workflow/wf_connect_first_workflow-package-bundle.md",
        syncStrategy: "replace_package_snapshot_after_board_closure",
        confirmationRequirement: "board_closure_then_tenant_export_confirmation"
      },
      files: [
        {
          path: "wealth-factory/package-bundles/wf_connect_first_workflow/wf_connect_first_workflow-package-bundle.md",
          mediaType: "text/markdown",
          byteSize: 20,
          checksum: "abc",
          content: "# Package bundle"
        },
        {
          path: "wealth-factory/package-bundles/wf_connect_first_workflow/export-manifest.json",
          mediaType: "application/json",
          byteSize: 42,
          checksum: "def",
          content: "{\"ok\":true}"
        }
      ],
      recordCount: 3,
      disclosureSummary: "Closure snapshot summary only",
      redactionSummary: "Package-safe redaction"
    });

    expect(packageBundleExportWriter.write).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(expect.stringContaining("update wfpc.harness_export_deliveries"), expect.any(Array));
    await runtime.close();
  });

  it("skips duplicate governance-history delivery when the bundle is already in progress", async () => {
    const recentAttemptAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    resetMockExportDeliveryRow({
      status: "delivery_in_progress",
      attempt_count: 2,
      last_attempted_at: recentAttemptAt,
      writer_kind: "obsidian_filesystem"
    });
    const governanceHistoryExportWriter = {
      write: vi.fn()
    };
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {}
      },
      auth: { authenticate: vi.fn() },
      governanceHistoryExportWriter
    });

    const boardServiceOptions = vi.mocked(createHarnessBoardService).mock.calls.at(-1)?.[0];
    await boardServiceOptions?.onGovernanceHistoryExportReady?.({
      tenantId: "tenant_123",
      userId: "user_123",
      runId: "run_123",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      candidateId: "governance_history_export",
      bundleId: "bundle_123",
      bundleRevision: "bundle_revision_123",
      exportFormat: "obsidian_markdown_bundle",
      recordTarget: "governance_history_record",
      idempotencyKey: "idempotency_123",
      noteTitle: "Governance history",
      noteFileName: "wf_connect_first_workflow-governance-history.md",
      placement: {
        targetSystem: "obsidian_vault",
        vaultFolder: "wealth-factory/governance-history/wf_connect_first_workflow",
        primaryNotePath:
          "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
        syncStrategy: "append_history_entry",
        confirmationRequirement: "tenant_export_confirmation"
      },
      files: [
        {
          path: "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
          mediaType: "text/markdown",
          byteSize: 20,
          checksum: "abc",
          content: "# Governance history"
        }
      ],
      recordCount: 2,
      disclosureSummary: "Decision summary only",
      redactionSummary: "Governance-safe redaction"
    });

    expect(governanceHistoryExportWriter.write).not.toHaveBeenCalled();
    await runtime.close();
  });

  it("recovers a stale governance-history delivery claim when the latest attempt is older than the lease window", async () => {
    const staleAttemptAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    resetMockExportDeliveryRow({
      status: "delivery_in_progress",
      attempt_count: 2,
      last_attempted_at: staleAttemptAt,
      writer_kind: "obsidian_filesystem"
    });
    const governanceHistoryExportWriter = {
      write: vi.fn().mockResolvedValue({
        writerKind: "obsidian_filesystem",
        deliveredAt: "2026-06-01T01:00:00.000Z",
        receipt: {
          primaryNotePath:
            "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
          manifestPath: null,
          writtenFileCount: 1
        }
      })
    };
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {}
      },
      auth: { authenticate: vi.fn() },
      governanceHistoryExportWriter
    });

    const boardServiceOptions = vi.mocked(createHarnessBoardService).mock.calls.at(-1)?.[0];
    await boardServiceOptions?.onGovernanceHistoryExportReady?.({
      tenantId: "tenant_123",
      userId: "user_123",
      runId: "run_123",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      candidateId: "governance_history_export",
      bundleId: "bundle_123",
      bundleRevision: "bundle_revision_123",
      exportFormat: "obsidian_markdown_bundle",
      recordTarget: "governance_history_record",
      idempotencyKey: "idempotency_123",
      noteTitle: "Governance history",
      noteFileName: "wf_connect_first_workflow-governance-history.md",
      placement: {
        targetSystem: "obsidian_vault",
        vaultFolder: "wealth-factory/governance-history/wf_connect_first_workflow",
        primaryNotePath:
          "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
        syncStrategy: "append_history_entry",
        confirmationRequirement: "tenant_export_confirmation"
      },
      files: [
        {
          path: "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
          mediaType: "text/markdown",
          byteSize: 20,
          checksum: "abc",
          content: "# Governance history"
        }
      ],
      recordCount: 2,
      disclosureSummary: "Decision summary only",
      redactionSummary: "Governance-safe redaction"
    });

    expect(governanceHistoryExportWriter.write).toHaveBeenCalledOnce();
    await runtime.close();
  });

  it("does not let a late governance-history writer callback overwrite a newer recovered claim outcome", async () => {
    const staleAttemptAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    resetMockExportDeliveryRow({
      status: "delivery_in_progress",
      attempt_count: 2,
      last_attempted_at: staleAttemptAt,
      writer_kind: "obsidian_filesystem"
    });

    type GovernanceHistoryWriterResolution = {
      writerKind: "obsidian_filesystem";
      deliveredAt: string;
      receipt: {
        primaryNotePath: string;
        manifestPath: string | null;
        writtenFileCount: number;
        writtenPaths: string[];
      };
    };
    let resolveFirstWrite: ((value: GovernanceHistoryWriterResolution) => void) | null = null;
    let signalFirstWriteStarted: (() => void) | null = null;
    const firstWritePending = new Promise<GovernanceHistoryWriterResolution>((resolve) => {
      resolveFirstWrite = resolve;
    });
    const firstWriteObserved = new Promise<void>((resolve) => {
      signalFirstWriteStarted = resolve;
    });
    const governanceHistoryExportWriter = {
      write: vi
        .fn()
        .mockImplementationOnce(async () => {
          signalFirstWriteStarted?.();
          return firstWritePending;
        })
        .mockResolvedValueOnce({
          writerKind: "obsidian_filesystem",
          deliveredAt: "2026-06-01T01:15:00.000Z",
          receipt: {
            primaryNotePath:
              "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
            manifestPath: "wealth-factory/governance-history/wf_connect_first_workflow/manifest.json",
            writtenFileCount: 2,
            writtenPaths: [
              "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
              "wealth-factory/governance-history/wf_connect_first_workflow/manifest.json"
            ]
          }
        })
    };
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {}
      },
      auth: { authenticate: vi.fn() },
      governanceHistoryExportWriter
    });

    const audit = vi.mocked(createDurableAuditSink).mock.results.at(-1)?.value;
    const boardServiceOptions = vi.mocked(createHarnessBoardService).mock.calls.at(-1)?.[0];
    const dispatch: HarnessGovernanceHistoryExportReadyDispatch = {
      tenantId: "tenant_123",
      userId: "user_123",
      runId: "run_123",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      candidateId: "governance_history_export" as const,
      bundleId: "bundle_123",
      bundleRevision: "bundle_revision_123",
      exportFormat: "obsidian_markdown_bundle" as const,
      recordTarget: "governance_history_record" as const,
      idempotencyKey: "idempotency_123",
      noteTitle: "Governance history",
      noteFileName: "wf_connect_first_workflow-governance-history.md",
      placement: {
        targetSystem: "obsidian_vault" as const,
        vaultFolder: "wealth-factory/governance-history/wf_connect_first_workflow",
        primaryNotePath:
          "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
        syncStrategy: "append_history_entry" as const,
        confirmationRequirement: "tenant_export_confirmation" as const
      },
      files: [
        {
          path: "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
          mediaType: "text/markdown",
          byteSize: 20,
          checksum: "abc",
          content: "# Governance history"
        }
      ],
      recordCount: 2,
      disclosureSummary: "Decision summary only",
      redactionSummary: "Governance-safe redaction"
    };

    const firstDispatch = boardServiceOptions?.onGovernanceHistoryExportReady?.(dispatch);
    await firstWriteObserved;

    mockExportDeliveryRow = {
      ...mockExportDeliveryRow,
      last_attempted_at: new Date(Date.parse(mockExportDeliveryRow.last_attempted_at ?? staleAttemptAt) - 20 * 60 * 1000).toISOString()
    };

    await boardServiceOptions?.onGovernanceHistoryExportReady?.(dispatch);

    expect(mockExportDeliveryRow).toMatchObject({
      status: "delivered",
      attempt_count: 4,
      delivered_at: "2026-06-01T01:15:00.000Z",
      delivery_receipt: {
        primaryNotePath:
          "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
        manifestPath: "wealth-factory/governance-history/wf_connect_first_workflow/manifest.json",
        writtenFileCount: 2
      }
    });

    const releaseFirstWrite: (value: GovernanceHistoryWriterResolution) => void =
      resolveFirstWrite ??
      (() => {
        throw new Error("expected the first governance-history writer to start before release");
      });
    releaseFirstWrite({
      writerKind: "obsidian_filesystem",
      deliveredAt: "2026-06-01T01:00:00.000Z",
      receipt: {
        primaryNotePath:
          "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
        manifestPath: null,
        writtenFileCount: 1,
        writtenPaths: [
          "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md"
        ]
      }
    });
    await firstDispatch;

    expect(governanceHistoryExportWriter.write).toHaveBeenCalledTimes(2);
    expect(mockExportDeliveryRow).toMatchObject({
      status: "delivered",
      attempt_count: 4,
      delivered_at: "2026-06-01T01:15:00.000Z",
      delivery_receipt: {
        primaryNotePath:
          "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
        manifestPath: "wealth-factory/governance-history/wf_connect_first_workflow/manifest.json",
        writtenFileCount: 2
      }
    });
    expect(audit).toHaveBeenCalledTimes(1);

    await runtime.close();
  });

  it("does not let a late package-bundle writer callback overwrite a newer recovered claim outcome", async () => {
    const staleAttemptAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    resetMockExportDeliveryRow({
      candidate_id: "package_bundle_export",
      status: "delivery_in_progress",
      record_target: "package_deliverable_record",
      bundle_id: "bundle_package_123",
      bundle_revision: "bundle_package_revision_123",
      idempotency_key: "package_idempotency_123",
      note_title: "Package bundle",
      note_file_name: "wf_connect_first_workflow-package-bundle.md",
      placement_manifest: {
        targetSystem: "obsidian_vault",
        vaultFolder: "wealth-factory/package-bundles/wf_connect_first_workflow",
        primaryNotePath:
          "wealth-factory/package-bundles/wf_connect_first_workflow/wf_connect_first_workflow-package-bundle.md",
        syncStrategy: "replace_package_snapshot_after_board_closure",
        confirmationRequirement: "board_closure_then_tenant_export_confirmation"
      },
      disclosure_summary: "Closure snapshot summary only",
      redaction_summary: "Package-safe redaction",
      attempt_count: 2,
      last_attempted_at: staleAttemptAt,
      writer_kind: "obsidian_filesystem"
    });

    type PackageBundleWriterResolution = {
      writerKind: "obsidian_filesystem";
      deliveredAt: string;
      receipt: {
        primaryNotePath: string;
        manifestPath: string | null;
        writtenFileCount: number;
        writtenPaths: string[];
      };
    };
    let resolveFirstWrite: ((value: PackageBundleWriterResolution) => void) | null = null;
    let signalFirstWriteStarted: (() => void) | null = null;
    const firstWritePending = new Promise<PackageBundleWriterResolution>((resolve) => {
      resolveFirstWrite = resolve;
    });
    const firstWriteObserved = new Promise<void>((resolve) => {
      signalFirstWriteStarted = resolve;
    });
    const packageBundleExportWriter = {
      write: vi
        .fn()
        .mockImplementationOnce(async () => {
          signalFirstWriteStarted?.();
          return firstWritePending;
        })
        .mockResolvedValueOnce({
          writerKind: "obsidian_filesystem",
          deliveredAt: "2026-06-01T02:15:00.000Z",
          receipt: {
            primaryNotePath:
              "wealth-factory/package-bundles/wf_connect_first_workflow/wf_connect_first_workflow-package-bundle.md",
            manifestPath: "wealth-factory/package-bundles/wf_connect_first_workflow/export-manifest.json",
            writtenFileCount: 2,
            writtenPaths: [
              "wealth-factory/package-bundles/wf_connect_first_workflow/wf_connect_first_workflow-package-bundle.md",
              "wealth-factory/package-bundles/wf_connect_first_workflow/export-manifest.json"
            ]
          }
        })
    };
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {}
      },
      auth: { authenticate: vi.fn() },
      packageBundleExportWriter
    });

    const audit = vi.mocked(createDurableAuditSink).mock.results.at(-1)?.value;
    const boardServiceOptions = vi.mocked(createHarnessBoardService).mock.calls.at(-1)?.[0];
    const dispatch: HarnessPackageBundleExportReadyDispatch = {
      tenantId: "tenant_123",
      userId: "user_123",
      runId: "run_123",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      candidateId: "package_bundle_export" as const,
      bundleId: "bundle_package_123",
      bundleRevision: "bundle_package_revision_123",
      exportFormat: "obsidian_markdown_bundle" as const,
      recordTarget: "package_deliverable_record" as const,
      idempotencyKey: "package_idempotency_123",
      noteTitle: "Package bundle",
      noteFileName: "wf_connect_first_workflow-package-bundle.md",
      placement: {
        targetSystem: "obsidian_vault" as const,
        vaultFolder: "wealth-factory/package-bundles/wf_connect_first_workflow",
        primaryNotePath:
          "wealth-factory/package-bundles/wf_connect_first_workflow/wf_connect_first_workflow-package-bundle.md",
        syncStrategy: "replace_package_snapshot_after_board_closure" as const,
        confirmationRequirement: "board_closure_then_tenant_export_confirmation" as const
      },
      files: [
        {
          path: "wealth-factory/package-bundles/wf_connect_first_workflow/wf_connect_first_workflow-package-bundle.md",
          mediaType: "text/markdown" as const,
          byteSize: 20,
          checksum: "abc",
          content: "# Package bundle"
        }
      ],
      recordCount: 3,
      disclosureSummary: "Closure snapshot summary only",
      redactionSummary: "Package-safe redaction"
    };

    const firstDispatch = boardServiceOptions?.onPackageBundleExportReady?.(dispatch);
    await firstWriteObserved;

    mockExportDeliveryRow = {
      ...mockExportDeliveryRow,
      last_attempted_at: new Date(Date.parse(mockExportDeliveryRow.last_attempted_at ?? staleAttemptAt) - 20 * 60 * 1000).toISOString()
    };

    await boardServiceOptions?.onPackageBundleExportReady?.(dispatch);

    expect(mockExportDeliveryRow).toMatchObject({
      status: "delivered",
      attempt_count: 4,
      delivered_at: "2026-06-01T02:15:00.000Z",
      delivery_receipt: {
        primaryNotePath:
          "wealth-factory/package-bundles/wf_connect_first_workflow/wf_connect_first_workflow-package-bundle.md",
        manifestPath: "wealth-factory/package-bundles/wf_connect_first_workflow/export-manifest.json",
        writtenFileCount: 2
      }
    });

    const releaseFirstWrite: (value: PackageBundleWriterResolution) => void =
      resolveFirstWrite ??
      (() => {
        throw new Error("expected the first package-bundle writer to start before release");
      });
    releaseFirstWrite({
      writerKind: "obsidian_filesystem",
      deliveredAt: "2026-06-01T02:00:00.000Z",
      receipt: {
        primaryNotePath:
          "wealth-factory/package-bundles/wf_connect_first_workflow/wf_connect_first_workflow-package-bundle.md",
        manifestPath: null,
        writtenFileCount: 1,
        writtenPaths: [
          "wealth-factory/package-bundles/wf_connect_first_workflow/wf_connect_first_workflow-package-bundle.md"
        ]
      }
    });
    await firstDispatch;

    expect(packageBundleExportWriter.write).toHaveBeenCalledTimes(2);
    expect(mockExportDeliveryRow).toMatchObject({
      status: "delivered",
      attempt_count: 4,
      delivered_at: "2026-06-01T02:15:00.000Z",
      delivery_receipt: {
        primaryNotePath:
          "wealth-factory/package-bundles/wf_connect_first_workflow/wf_connect_first_workflow-package-bundle.md",
        manifestPath: "wealth-factory/package-bundles/wf_connect_first_workflow/export-manifest.json",
        writtenFileCount: 2
      }
    });
    expect(audit).toHaveBeenCalledTimes(1);

    await runtime.close();
  });

  it("records bounded partial failure receipt details when governance-history delivery fails mid-write", async () => {
    resetMockExportDeliveryRow();
    const governanceHistoryExportWriter = {
      write: vi.fn().mockRejectedValue(Object.assign(new Error("disk write blocked"), {
        partialReceipt: {
          writtenFileCount: 1,
          lastAttemptedPath:
            "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md"
        }
      }))
    };
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {}
      },
      auth: { authenticate: vi.fn() },
      governanceHistoryExportWriter
    });

    const boardServiceOptions = vi.mocked(createHarnessBoardService).mock.calls.at(-1)?.[0];
    await boardServiceOptions?.onGovernanceHistoryExportReady?.({
      tenantId: "tenant_123",
      userId: "user_123",
      runId: "run_123",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      candidateId: "governance_history_export",
      bundleId: "bundle_123",
      bundleRevision: "bundle_revision_123",
      exportFormat: "obsidian_markdown_bundle",
      recordTarget: "governance_history_record",
      idempotencyKey: "idempotency_123",
      noteTitle: "Governance history",
      noteFileName: "wf_connect_first_workflow-governance-history.md",
      placement: {
        targetSystem: "obsidian_vault",
        vaultFolder: "wealth-factory/governance-history/wf_connect_first_workflow",
        primaryNotePath:
          "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
        syncStrategy: "append_history_entry",
        confirmationRequirement: "tenant_export_confirmation"
      },
      files: [
        {
          path: "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
          mediaType: "text/markdown",
          byteSize: 20,
          checksum: "abc",
          content: "# Governance history"
        }
      ],
      recordCount: 2,
      disclosureSummary: "Decision summary only",
      redactionSummary: "Governance-safe redaction"
    });

    const query = vi.mocked(createPgPoolQueryClient).mock.results.at(-1)?.value.query;
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("delivery_receipt = $3::jsonb"),
      expect.arrayContaining([
        "delivery_failed",
        "obsidian_filesystem",
        JSON.stringify({
          writtenFileCount: 1,
          lastAttemptedPath:
            "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md"
        }),
        expect.any(Number),
        expect.any(String),
        null,
        "writer_partial_failure",
        "disk write blocked",
        expect.any(String),
        "idempotency_123",
        expect.any(String)
      ])
    );
    await runtime.close();
  });

  it("wires provider credential registration to the runtime vault path", async () => {
    const { createProviderCredentialService } = await import("../src/secrets/provider-credential-service.js");
    const { createSecretService } = await import("../src/secrets/secret-service.js");
    const { createAcidSecretRevokeService } = await import("../src/secrets/acid-secret-revoke-service.js");
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {}
      },
      auth: { authenticate: vi.fn() }
    });

    expect(runtime.registerProviderCredential).toEqual(expect.any(Function));
    expect(runtime.rotateProviderCredential).toEqual(expect.any(Function));
    expect(runtime.revokeProviderCredential).toEqual(expect.any(Function));
    const providerServiceArgs = vi.mocked(createProviderCredentialService).mock.calls.at(-1)?.[0];
    expect(providerServiceArgs).toBeDefined();
    expect(providerServiceArgs?.runtimeEnv).toEqual({});
    const secretServiceArgs = vi.mocked(createSecretService).mock.calls.at(-1)?.[0];
    expect(secretServiceArgs).toBeDefined();
    expect(secretServiceArgs).not.toHaveProperty("projection");
    const revokeArgs = vi.mocked(createAcidSecretRevokeService).mock.calls.at(-1)?.[0];
    expect(revokeArgs).toBeDefined();
    expect(revokeArgs).not.toHaveProperty("projection");
    await runtime.close();
  });

  it("wires Paperclip projection into provider registration when admin issue-launch env is configured", async () => {
    const { createProviderCredentialService } = await import("../src/secrets/provider-credential-service.js");
    const { createSecretService } = await import("../src/secrets/secret-service.js");
    const { createAcidSecretRevokeService } = await import("../src/secrets/acid-secret-revoke-service.js");
    const { createPaperclipSecretAdminHttpClient, createPaperclipSecretProjectionService } = await import("../src/paperclip/secret-sync.js");

    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {
          PAPERCLIP_BASE_URL: "https://paperclip.internal.local",
          WF_PAPERCLIP_BOARD_SESSION_TOKEN: "board-session-token",
          WF_PAPERCLIP_BOARD_ORIGIN: "https://paperclip-board.internal.local/",
          WF_PAPERCLIP_ISSUE_AGENT_ID: "agent-1"
        }
      },
      auth: { authenticate: vi.fn() }
    });

    expect(createPaperclipSecretProjectionService).toHaveBeenCalled();
    expect(createPaperclipSecretAdminHttpClient).toHaveBeenCalledWith({
      baseUrl: "https://paperclip-board.internal.local/",
      adminToken: "board-session-token",
      origin: "https://paperclip-board.internal.local/",
      referer: "https://paperclip-board.internal.local/"
    });
    expect(createProviderCredentialService).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeEnv: expect.objectContaining({
          PAPERCLIP_BASE_URL: "https://paperclip.internal.local"
        })
      })
    );
    expect(createSecretService).toHaveBeenCalledWith(
      expect.objectContaining({
        projection: expect.objectContaining({
          onRegistered: expect.any(Function),
          onRotated: expect.any(Function),
          revokeBySecretRef: expect.any(Function)
        })
      })
    );
    const projectionArgs = vi.mocked(createPaperclipSecretProjectionService).mock.calls.at(-1)?.[0];
    await expect(projectionArgs?.resolveCompanyMapping({ tenantId: "tenant-1" })).resolves.toEqual({
      paperclipCompanyId: "pc-company-1",
      paperclipIssueAgentId: "pc-agent-1"
    });
    await expect(projectionArgs?.hasActiveRuns?.({ tenantId: "tenant-1" })).resolves.toBe(false);
    expect(projectionArgs?.defaultPaperclipAgentId).toBe("agent-1");
    expect(createAcidSecretRevokeService).toHaveBeenCalledWith(
      expect.objectContaining({
        projection: expect.objectContaining({
          revokeBySecretRef: expect.any(Function)
        })
      })
    );

    await runtime.close();
  });

  it("wires customer-owned storage OAuth when provider clients are configured", async () => {
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {},
        storageOAuthRedirectOrigin: "https://api.spyderbyte.cloud",
        googleDriveClientId: "google-client",
        dropboxClientId: "dropbox-client"
      },
      auth: { authenticate: vi.fn() }
    });

    expect(runtime.storageOAuth).toEqual(expect.objectContaining({ begin: expect.any(Function), complete: expect.any(Function) }));
    expect(runtime.storageOAuth?.isProviderAvailable("google_drive")).toBe(true);
    expect(runtime.storageOAuth?.isProviderAvailable("dropbox")).toBe(true);
    await runtime.close();
  });

  it("keeps storage OAuth available for configured providers and returns structured 503s for missing ones", async () => {
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {},
        storageOAuthRedirectOrigin: "https://api.spyderbyte.cloud",
        googleDriveClientId: "google-client"
      },
      auth: { authenticate: vi.fn() }
    });

    expect(runtime.storageOAuth?.isProviderAvailable("google_drive")).toBe(true);
    expect(runtime.storageOAuth?.isProviderAvailable("dropbox")).toBe(false);

    const request = createRequest({
      method: "GET",
      url: "/api/storage/oauth/dropbox/begin",
      headers: {
        authorization: "Bearer token",
        origin: "https://www.spyderbyte.cloud",
        "content-length": "0"
      }
    });
    const response = createResponse();

    runtime.server.emit("request", request as unknown as IncomingMessage, response as unknown as ServerResponse);
    await response.finished;

    expect(response.statusCode).toBe(503);
    expect(response.headers["access-control-allow-origin"]).toBe("https://www.spyderbyte.cloud");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.body).toBe(JSON.stringify({ code: "storage_oauth_unavailable" }));
    await runtime.close();
  });

  it("returns a structured 503 for unavailable storage OAuth callback paths even without Origin", async () => {
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {}
      },
      auth: { authenticate: vi.fn() }
    });

    const request = createRequest({
      method: "GET",
      url: "/api/storage/oauth/dropbox/callback?state=opaque&code=oauth-code",
      headers: {
        "content-length": "0"
      }
    });
    const response = createResponse();

    runtime.server.emit("request", request as unknown as IncomingMessage, response as unknown as ServerResponse);
    await response.finished;

    expect(response.statusCode).toBe(503);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.body).toBe(JSON.stringify({ code: "storage_oauth_unavailable" }));
    await runtime.close();
  });

  it("serves an authenticated HTML shell with bootstrap JSON when a web entry URL is configured", async () => {
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        webAppEntryUrl: "https://portal.spyderbyte.cloud/assets/app.js",
        webAppStylesheetUrl: "https://portal.spyderbyte.cloud/assets/app.css",
        runtimeEnv: {}
      },
      auth: {
        authenticate: vi.fn().mockResolvedValue({
          tenantId: "tenant-1",
          userId: "user-1",
          role: "operator"
        })
      }
    });

    const request = createRequest({
      method: "GET",
      url: "/workflows",
      headers: {
        cookie: "wf_portal_session=portal-session-token",
        "content-length": "0"
      }
    });
    const response = createResponse();

    runtime.server.emit("request", request as unknown as IncomingMessage, response as unknown as ServerResponse);
    await response.finished;

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain('id="wf-dashboard-bootstrap"');
    expect(response.body).toContain('"tenantId":"tenant-1"');
    expect(response.body).toContain('"role":"operator"');
    expect(response.body).toContain('href="https://portal.spyderbyte.cloud/assets/app.css"');
    expect(response.body).toContain('src="https://portal.spyderbyte.cloud/assets/app.js"');
    expect(response.headers["content-security-policy"]).toContain("style-src 'self' 'unsafe-inline' https://portal.spyderbyte.cloud");
    expect(response.headers["content-security-policy"]).toContain("img-src 'self' data: blob: https://portal.spyderbyte.cloud");
    expect(response.headers["content-security-policy"]).toContain("font-src 'self' data: https://portal.spyderbyte.cloud");
    await runtime.close();
  });

  it("authenticates an app-shell request with a real signed session cookie", async () => {
    const signingKey = "wf-demo-signing-key-with-sufficient-length";
    const auth = createRuntimeSessionAuth(
      {
        signingKey,
        sessionCookieName: "wf_portal_session",
        issuer: "wealth-factory-runtime",
        audience: "wealth-factory-portal"
      },
      {
        now: () => new Date("2026-05-19T12:00:00.000Z").getTime()
      }
    );
    const token = createRuntimeSessionToken({
      signingKey,
      issuer: "wealth-factory-runtime",
      audience: "wealth-factory-portal",
      session: {
        tenantId: "tenant-1",
        userId: "user-1",
        role: "operator"
      },
      issuedAt: new Date("2026-05-19T11:55:00.000Z"),
      expiresAt: new Date("2026-05-19T12:30:00.000Z")
    });
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: TEST_SUPABASE_DB_URL,
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        webAppEntryUrl: "https://portal.spyderbyte.cloud/assets/app.js",
        webAppStylesheetUrl: "https://portal.spyderbyte.cloud/assets/app.css",
        runtimeEnv: {}
      },
      auth
    });

    const request = createRequest({
      method: "GET",
      url: "/home",
      headers: {
        cookie: `wf_portal_session=${token}`,
        "content-length": "0"
      }
    });
    const response = createResponse();

    runtime.server.emit("request", request as unknown as IncomingMessage, response as unknown as ServerResponse);
    await response.finished;

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"tenantId":"tenant-1"');
    expect(response.body).toContain('"role":"operator"');
    expect(response.body).not.toContain('"userId"');
    await runtime.close();
  });
});

function createRequest(input: {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  bodyChunks?: readonly (string | Buffer)[];
  remoteAddress?: string;
}) {
  const request = Object.assign(new EventEmitter(), {
    method: input.method,
    url: input.url,
    headers: input.headers,
    socket: { remoteAddress: input.remoteAddress ?? "127.0.0.1" },
    resume: vi.fn()
  });
  process.nextTick(() => {
    if (input.bodyChunks) {
      for (const chunk of input.bodyChunks) {
        request.emit("data", chunk);
      }
    } else if (input.body) {
      request.emit("data", Buffer.from(input.body));
    }
    request.emit("end");
  });
  return request;
}

function createResponse() {
  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    finished,
    writeHead(statusCode: number, headers: Record<string, string>) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(chunk: string) {
      this.body = chunk;
      resolveFinished();
    }
  };
}
