import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";

import { createRuntimeSessionAuth, createRuntimeSessionToken } from "../src/api/runtime-auth.js";
import { createDashboardRuntime, createNodeRequestListener, loadRuntimeEnv } from "../src/api/runtime-server.js";
import { createDurableAuditSink } from "../src/audit/durable-audit.js";
import { createHarnessBoardService } from "../src/harness/board-service.js";

const TEST_SUPABASE_DB_URL = "postgresql://postgres.tenant:placeholder-password@db.invalid:5432/postgres";

vi.mock("../src/db/postgres-client.js", () => ({
  createPgPool: vi.fn(() => ({
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined)
  })),
  createPgPoolQueryClient: vi.fn(() => ({ query: vi.fn() })),
  createPgTransactionRunner: vi.fn(() => ({ withTransaction: vi.fn() }))
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
    createTopLevelChildCard: vi.fn().mockResolvedValue({ cardId: "card_created_1" }),
    advanceChildCard: vi.fn().mockResolvedValue({ cardId: "card_created_1", state: "working" }),
    completeRun: vi.fn().mockResolvedValue({ runId: "run_123", state: "done" })
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
        "content-length": "69",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        completionSummary: "The CEO packaged the final business-facing outcome."
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
