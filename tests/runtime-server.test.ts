import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";

import { createRuntimeSessionAuth, createRuntimeSessionToken } from "../src/api/runtime-auth.js";
import { createDashboardRuntime, createNodeRequestListener, loadRuntimeEnv } from "../src/api/runtime-server.js";

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
      ]
    }),
    approveProposal: vi.fn().mockResolvedValue({ cardId: "card_approved_1" }),
    createTopLevelChildCard: vi.fn().mockResolvedValue({ cardId: "card_created_1" })
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
        SUPABASE_DB_URL: "postgresql://postgres.tenant:pw@187.77.19.83:5432/postgres",
        SUPABASE_DB_SSL: "false",
        WF_ALLOWED_ORIGINS: "https://www.spyderbyte.cloud, https://portal.spyderbyte.cloud",
        WF_API_PORT: "8081",
        WF_VAULT_MASTER_KEY: "test-master-key-with-enough-length"
      })
    ).toMatchObject({
      supabaseDbUrl: "postgresql://postgres.tenant:pw@187.77.19.83:5432/postgres",
      supabaseDbSsl: "false",
      allowedOrigins: ["https://www.spyderbyte.cloud", "https://portal.spyderbyte.cloud"],
      apiPort: 8081,
      vaultMasterKey: "test-master-key-with-enough-length"
    });
  });

  it("rejects wildcard portal origins for authenticated APIs", () => {
    expect(() =>
      loadRuntimeEnv({
        SUPABASE_DB_URL: "postgresql://postgres.tenant:pw@187.77.19.83:5432/postgres",
        WF_ALLOWED_ORIGINS: "*",
        WF_VAULT_MASTER_KEY: "test-master-key-with-enough-length"
      })
    ).toThrow(/WF_ALLOWED_ORIGINS/);
  });

  it("requires a vault master key for runtime credential storage", () => {
    expect(() =>
      loadRuntimeEnv({
        SUPABASE_DB_URL: "postgresql://postgres.tenant:pw@187.77.19.83:5432/postgres",
        WF_ALLOWED_ORIGINS: "https://www.spyderbyte.cloud"
      })
    ).toThrow(/WF_VAULT_MASTER_KEY/);
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
      ip: "127.0.0.1"
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(JSON.stringify({ ok: true }));
  });

  it("routes health checks through the runtime readiness handler", async () => {
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: "postgresql://postgres.tenant:pw@187.77.19.83:5432/postgres",
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
        supabaseDbUrl: "postgresql://postgres.tenant:pw@187.77.19.83:5432/postgres",
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
        supabaseDbUrl: "postgresql://postgres.tenant:pw@187.77.19.83:5432/postgres",
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
      url: "/api/harness/cards?persona=cfo&title=Pressure-test%20the%20pricing%20lane&deliverableType=pricing_review",
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
    expect(response.body).toContain('"cardId":"card_created_1"');
    await runtime.close();
  });

  it("wires the durable workflow outbox pump when a queue enqueuer is provided", async () => {
    const { createQueueOutboxPump } = await import("../src/workflows/queue-outbox-pump.js");
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: "postgresql://postgres.tenant:pw@187.77.19.83:5432/postgres",
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
        supabaseDbUrl: "postgresql://postgres.tenant:pw@187.77.19.83:5432/postgres",
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
        supabaseDbUrl: "postgresql://postgres.tenant:pw@187.77.19.83:5432/postgres",
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
        supabaseDbUrl: "postgresql://postgres.tenant:pw@187.77.19.83:5432/postgres",
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
    await runtime.close();
  });

  it("serves an authenticated HTML shell with bootstrap JSON when a web entry URL is configured", async () => {
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: "postgresql://postgres.tenant:pw@187.77.19.83:5432/postgres",
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
        supabaseDbUrl: "postgresql://postgres.tenant:pw@187.77.19.83:5432/postgres",
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

function createRequest(input: { method: string; url: string; headers: Record<string, string> }) {
  return Object.assign(new EventEmitter(), {
    method: input.method,
    url: input.url,
    headers: input.headers,
    socket: { remoteAddress: "127.0.0.1" }
  });
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
