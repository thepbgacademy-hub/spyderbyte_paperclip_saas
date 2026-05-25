import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { createAppShellHandler } from "./app-shell.js";
import type { ApiSession } from "./dashboard-api.js";
import { createDashboardApi } from "./dashboard-api.js";
import { createDashboardHttpHandler, type DashboardHttpRequest, type DashboardHttpResponse } from "./dashboard-http.js";
import { createHarnessHttpHandler } from "./harness-http.js";
import { createHealthHttpHandler } from "./health-http.js";
import { createStorageOAuthHttpHandler } from "./storage-oauth-http.js";
import { createDurableAuditSink } from "../audit/durable-audit.js";
import { createAcidGuardRepository } from "../db/acid-guard-repository.js";
import { createPgPool, createPgPoolQueryClient, createPgTransactionRunner } from "../db/postgres-client.js";
import { createSupabaseRepositories, createSupabaseSecretRepository } from "../db/supabase-repositories.js";
import {
  createPaperclipSecretAdminHttpClient,
  createPaperclipSecretBindingRepository,
  createPaperclipSecretProjectionService
} from "../paperclip/secret-sync.js";
import { createHarnessBoardService } from "../harness/board-service.js";
import { createPostgresHarnessRepository } from "../harness/repository.js";
import { assertAllowedOrigin, createSecurityHeaders } from "../security/cors.js";
import { createPostgresFixedWindowRateLimiter } from "../security/postgres-rate-limit.js";
import { createEncryptedSecretVault } from "../secrets/encrypted-vault.js";
import { createAcidSecretRevokeService } from "../secrets/acid-secret-revoke-service.js";
import { createPostgresEncryptedVaultStore } from "../secrets/postgres-vault-store.js";
import { createProviderCredentialService } from "../secrets/provider-credential-service.js";
import { createSecretService } from "../secrets/secret-service.js";
import { createStorageOAuthService, STORAGE_OAUTH_PROVIDER_CONFIGS } from "../storage/storage-oauth-service.js";
import { createPostgresOAuthStateStore } from "../storage/postgres-oauth-state-store.js";
import { createVaultBackedStorageOAuthRegistration } from "../storage/vault-backed-storage-oauth-registration.js";
import { createHarnessWorkflowRegistry } from "../wealthfactory/workflow-registry.js";
import type { WorkflowRunEnqueuer } from "../workflows/acid-run-reservation.js";
import { createQueueOutboxPump } from "../workflows/queue-outbox-pump.js";
import { createQueueOutboxWorker } from "../workflows/queue-outbox-worker.js";

export type RuntimeEnv = {
  supabaseDbUrl: string;
  supabaseDbSsl?: string;
  allowedOrigins: readonly string[];
  apiPort: number;
  vaultMasterKey: string;
  webAppEntryUrl?: string;
  webAppStylesheetUrl?: string;
  runtimeEnv: Record<string, string | undefined>;
  storageOAuthRedirectOrigin?: string;
  googleDriveClientId?: string;
  googleDriveClientSecret?: string;
  dropboxClientId?: string;
  dropboxClientSecret?: string;
};

export type RuntimeAuth = {
  authenticate(input: { authorization: string; cookie?: string }): Promise<ApiSession | null>;
};

export class RuntimeEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeEnvError";
  }
}

export function loadRuntimeEnv(source: NodeJS.ProcessEnv = process.env): RuntimeEnv {
  const supabaseDbUrl = source.SUPABASE_DB_URL;
  if (!supabaseDbUrl || supabaseDbUrl === "PLACE_HOLDER") {
    throw new RuntimeEnvError("SUPABASE_DB_URL is required");
  }

  const allowedOrigins = (source.WF_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (allowedOrigins.length === 0 || allowedOrigins.includes("*")) {
    throw new RuntimeEnvError("WF_ALLOWED_ORIGINS must list explicit portal origins");
  }

  const apiPort = source.WF_API_PORT ? Number(source.WF_API_PORT) : 8080;
  if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65_535) {
    throw new RuntimeEnvError("WF_API_PORT must be a valid TCP port");
  }
  const vaultMasterKey = source.WF_VAULT_MASTER_KEY;
  if (!vaultMasterKey || vaultMasterKey.length < 24) {
    throw new RuntimeEnvError("WF_VAULT_MASTER_KEY must be at least 24 characters");
  }
  let storageOAuthRedirectOrigin: string | undefined;
  if (source.WF_STORAGE_OAUTH_REDIRECT_ORIGIN) {
    const redirectOrigin = parseRedirectOrigin(source.WF_STORAGE_OAUTH_REDIRECT_ORIGIN);
    if (!allowedOrigins.includes(redirectOrigin)) {
      throw new RuntimeEnvError("WF_STORAGE_OAUTH_REDIRECT_ORIGIN must match an allowed portal origin");
    }
    storageOAuthRedirectOrigin = redirectOrigin;
  }

  return {
    supabaseDbUrl,
    ...(source.SUPABASE_DB_SSL ? { supabaseDbSsl: source.SUPABASE_DB_SSL } : {}),
    allowedOrigins,
    apiPort,
    vaultMasterKey,
    ...(source.WF_WEB_APP_ENTRY_URL ? { webAppEntryUrl: source.WF_WEB_APP_ENTRY_URL } : {}),
    ...(source.WF_WEB_APP_STYLESHEET_URL ? { webAppStylesheetUrl: source.WF_WEB_APP_STYLESHEET_URL } : {}),
    runtimeEnv: source,
    ...(storageOAuthRedirectOrigin ? { storageOAuthRedirectOrigin } : {}),
    ...(source.GOOGLE_DRIVE_CLIENT_ID ? { googleDriveClientId: source.GOOGLE_DRIVE_CLIENT_ID } : {}),
    ...(source.GOOGLE_DRIVE_CLIENT_SECRET ? { googleDriveClientSecret: source.GOOGLE_DRIVE_CLIENT_SECRET } : {}),
    ...(source.DROPBOX_CLIENT_ID ? { dropboxClientId: source.DROPBOX_CLIENT_ID } : {}),
    ...(source.DROPBOX_CLIENT_SECRET ? { dropboxClientSecret: source.DROPBOX_CLIENT_SECRET } : {})
  };
}

function parseRedirectOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RuntimeEnvError("WF_STORAGE_OAUTH_REDIRECT_ORIGIN must be an absolute origin URL");
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new RuntimeEnvError("WF_STORAGE_OAUTH_REDIRECT_ORIGIN must be a bare http(s) origin");
  }
  return url.origin;
}

export function createDashboardRuntime(options: { env: RuntimeEnv; auth: RuntimeAuth; workflowQueueEnqueuer?: WorkflowRunEnqueuer }) {
  const pool = createPgPool({
    connectionString: options.env.supabaseDbUrl,
    ...(options.env.supabaseDbSsl ? { sslMode: options.env.supabaseDbSsl } : {})
  });
  const transactionRunner = createPgTransactionRunner(pool);
  const queryClient = createPgPoolQueryClient(pool);
  const harnessRepository = createPostgresHarnessRepository(queryClient);
  const harnessWorkflowRegistry = createHarnessWorkflowRegistry({
    harnessEnabledWorkflowIds:
      options.env.runtimeEnv.WF_HARNESS_ENABLED_WORKFLOW_IDS?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? []
  });
  const repositories = createSupabaseRepositories(queryClient);
  const audit = createDurableAuditSink(queryClient);
  const vault = createEncryptedSecretVault({
    masterKey: options.env.vaultMasterKey,
    store: createPostgresEncryptedVaultStore(queryClient)
  });
  const paperclipSecretBindings = createPaperclipSecretBindingRepository(queryClient);
  const paperclipBoardSessionToken = options.env.runtimeEnv.WF_PAPERCLIP_BOARD_SESSION_TOKEN;
  const paperclipBoardOrigin = options.env.runtimeEnv.WF_PAPERCLIP_BOARD_ORIGIN;
  const paperclipProjection =
    paperclipBoardSessionToken &&
    options.env.runtimeEnv.PAPERCLIP_BASE_URL
      ? createPaperclipSecretProjectionService({
          adminClient: createPaperclipSecretAdminHttpClient({
            baseUrl: paperclipBoardOrigin ?? options.env.runtimeEnv.PAPERCLIP_BASE_URL,
            adminToken: paperclipBoardSessionToken,
            ...(paperclipBoardOrigin
              ? {
                  origin: paperclipBoardOrigin,
                  referer: `${paperclipBoardOrigin.replace(/\/+$/, "")}/`
                }
              : {})
          }),
          bindings: paperclipSecretBindings,
          resolveCompanyMapping: async ({ tenantId }) => repositories.resolvePaperclipCompanyMapping({ tenantId }),
          hasActiveRuns: async ({ tenantId }) => repositories.hasActiveWorkflowRuns({ tenantId }),
          ...(options.env.runtimeEnv.WF_PAPERCLIP_ISSUE_AGENT_ID
            ? { defaultPaperclipAgentId: options.env.runtimeEnv.WF_PAPERCLIP_ISSUE_AGENT_ID }
            : {}),
          audit
        })
      : undefined;
  const secretRepository = createSupabaseSecretRepository(queryClient, transactionRunner);
  const secretService = createSecretService({
    vault,
    repository: secretRepository,
    ...(paperclipProjection ? { projection: paperclipProjection } : {}),
    audit,
  });
  const registerProviderCredential = createProviderCredentialService({
    secrets: secretService,
    runtimeEnv: options.env.runtimeEnv
  }).register;
  const rotateProviderCredential = secretService.rotate;
  const acidRepository = createAcidGuardRepository(transactionRunner);
  const revokeProviderCredential = createAcidSecretRevokeService({
    repository: { revokeCredential: acidRepository.revokeCredential },
    resolver: { findIdBySecretRef: repositories.findSecretReferenceId },
    vault,
    audit,
    ...(paperclipProjection ? { projection: paperclipProjection } : {})
  }).revoke;
  const storageOAuthProviders =
    options.env.storageOAuthRedirectOrigin
      ? {
          ...(options.env.googleDriveClientId
            ? {
                google_drive: STORAGE_OAUTH_PROVIDER_CONFIGS.googleDrive({
                  clientId: options.env.googleDriveClientId,
                  ...(options.env.googleDriveClientSecret ? { clientSecret: options.env.googleDriveClientSecret } : {}),
                  redirectUri: `${options.env.storageOAuthRedirectOrigin}/api/storage/oauth/google_drive/callback`
                })
              }
            : {}),
          ...(options.env.dropboxClientId
            ? {
                dropbox: STORAGE_OAUTH_PROVIDER_CONFIGS.dropbox({
                  clientId: options.env.dropboxClientId,
                  ...(options.env.dropboxClientSecret ? { clientSecret: options.env.dropboxClientSecret } : {}),
                  redirectUri: `${options.env.storageOAuthRedirectOrigin}/api/storage/oauth/dropbox/callback`
                })
              }
            : {})
        }
      : {};
  const storageOAuth =
    Object.keys(storageOAuthProviders).length > 0
      ? createStorageOAuthService({
          providers: storageOAuthProviders,
          stateStore: createPostgresOAuthStateStore(queryClient),
          registration: createVaultBackedStorageOAuthRegistration({
            runner: transactionRunner,
            vaultMasterKey: options.env.vaultMasterKey,
            audit
          }),
          fetch: globalThis.fetch
        })
      : undefined;
  const outboxPump = options.workflowQueueEnqueuer
    ? createQueueOutboxPump({
        worker: createQueueOutboxWorker({
          repository: acidRepository,
          enqueuer: options.workflowQueueEnqueuer
        })
      })
    : undefined;
  const dashboardApi = createDashboardApi({
    authenticate: options.auth.authenticate,
    requireTenantMember: repositories.requireTenantMember,
    listWorkflows: repositories.listWorkflows,
    listPackages: repositories.listPackages,
    listArtifacts: repositories.listArtifacts,
    listProviderConnections: repositories.listProviderConnections,
    listStorageConnectors: repositories.listStorageConnectors,
    getPlatformLoad: repositories.getPlatformLoad
  });
  const harnessBoardApi = createHarnessBoardService({
    authenticate: options.auth.authenticate,
    requireTenantMember: repositories.requireTenantMember,
    requireActivePackageInstall: repositories.requireActivePackageInstall,
    repository: harnessRepository,
    workflowRegistry: harnessWorkflowRegistry,
    audit,
    ...(options.workflowQueueEnqueuer
      ? {
          onResolvedAttentionDispatch: async (dispatch: {
            tenantId: string;
            userId: string;
            runId: string;
            workflowId: string;
            cardId: string;
            command: "resume_lane" | "unblock_lane";
            state: "working" | "approved";
          }) => {
            await options.workflowQueueEnqueuer?.enqueueOnce({
              tenantId: dispatch.tenantId,
              workflowTemplateId: dispatch.workflowId,
              runId: dispatch.runId,
              userId: dispatch.userId,
              idempotencyKey: `${dispatch.tenantId}:${dispatch.workflowId}:${dispatch.runId}`
            });
          },
          onFreshCycleDispatch: async (dispatch: {
            tenantId: string;
            userId: string;
            runId: string;
            workflowId: string;
            mode: "reopen_deferred" | "clean";
            reopenedProposalCount: number;
          }) => {
            await options.workflowQueueEnqueuer?.enqueueOnce({
              tenantId: dispatch.tenantId,
              workflowTemplateId: dispatch.workflowId,
              runId: dispatch.runId,
              userId: dispatch.userId,
              idempotencyKey: `${dispatch.tenantId}:${dispatch.workflowId}:${dispatch.runId}`
            });
          }
        }
      : {}),
    runAtomically: async (work) =>
      transactionRunner.withTransaction(async (transaction) =>
        work(createPostgresHarnessRepository(transaction))
      )
  });
  const handler = createDashboardHttpHandler({
    allowedOrigins: options.env.allowedOrigins,
    dashboardApi,
    rateLimiter: createPostgresFixedWindowRateLimiter({ runner: transactionRunner, limit: 120, windowMs: 60_000 })
  });
  const harnessBoardHandler = createHarnessHttpHandler({
    allowedOrigins: options.env.allowedOrigins,
    listBoardState: harnessBoardApi.listBoardState,
    createTopLevelChildCard: harnessBoardApi.createTopLevelChildCard,
    advanceChildCard: harnessBoardApi.advanceChildCard,
    decideProposal: harnessBoardApi.decideProposal,
    completeRun: harnessBoardApi.completeRun,
    reviewPendingAttention: harnessBoardApi.reviewPendingAttention,
    resolvePendingAttention: harnessBoardApi.resolvePendingAttention,
    startFreshCycle: harnessBoardApi.startFreshCycle,
    rateLimiter: createPostgresFixedWindowRateLimiter({ runner: transactionRunner, limit: 120, windowMs: 60_000 })
  });
  const healthHandler = createHealthHttpHandler({
    allowedOrigins: options.env.allowedOrigins,
    readinessCheck: () => checkDatabaseReadiness(pool)
  });
  const storageOAuthHandler = storageOAuth
    ? createStorageOAuthHttpHandler({
        allowedOrigins: options.env.allowedOrigins,
        authenticate: options.auth.authenticate,
        requireTenantMember: repositories.requireTenantMember,
        storageOAuth,
        rateLimiter: createPostgresFixedWindowRateLimiter({ runner: transactionRunner, limit: 60, windowMs: 60_000 })
      })
    : undefined;
  const appShellHandler = options.env.webAppEntryUrl
    ? createAppShellHandler({
        dashboardApi,
        webAppEntryUrl: options.env.webAppEntryUrl,
        ...(options.env.webAppStylesheetUrl ? { webAppStylesheetUrl: options.env.webAppStylesheetUrl } : {})
      })
    : undefined;
  const runtimeHandler = async (request: DashboardHttpRequest): Promise<DashboardHttpResponse> => {
    if (request.path === "/health" || request.path === "/api/health") {
      return healthHandler(request);
    }
    if (request.path.startsWith("/api/storage/oauth/")) {
      if (!storageOAuthHandler) {
        return createStorageOAuthUnavailableResponse(request, options.env.allowedOrigins);
      }
      return storageOAuthHandler(request);
    }
    if (request.path.startsWith("/api/harness/")) {
      return harnessBoardHandler(request);
    }
    if (appShellHandler && !request.path.startsWith("/api/")) {
      return appShellHandler(request);
    }
    return handler(request);
  };

  return {
    server: createServer(createNodeRequestListener(runtimeHandler, options.env.allowedOrigins)),
    registerProviderCredential,
    rotateProviderCredential,
    revokeProviderCredential,
    storageOAuth,
    startWorkers: () => outboxPump?.start(),
    close: async () => {
      outboxPump?.stop();
      await pool.end();
    }
  };
}

function createStorageOAuthUnavailableResponse(
  request: DashboardHttpRequest,
  allowedOrigins: readonly string[]
): DashboardHttpResponse {
  const securityHeaders = createSecurityHeaders();
  let corsHeaders: Record<string, string>;
  try {
    corsHeaders =
      request.path.endsWith("/callback") && !request.headers.origin
        ? {}
        : assertAllowedOrigin(request.headers.origin, allowedOrigins);
  } catch {
    return { status: 403, headers: securityHeaders, body: { code: "request_rejected" } };
  }

  return {
    status: 503,
    headers: { ...securityHeaders, ...corsHeaders },
    body: { code: "storage_oauth_unavailable" }
  };
}

function createAdapterErrorResponse(
  request: IncomingMessage,
  allowedOrigins: readonly string[],
  status: 400 | 413 | 500,
  body: { code: string }
): DashboardHttpResponse {
  const securityHeaders = createSecurityHeaders();
  let corsHeaders: Record<string, string> = {};
  try {
    const origin = readHeader(request, "origin");
    corsHeaders = origin ? assertAllowedOrigin(origin, allowedOrigins) : {};
  } catch {
    // Invalid origins fall back to a headerless adapter error response.
  }

  return {
    status,
    headers: { "content-type": "application/json", ...securityHeaders, ...corsHeaders },
    body
  };
}

async function checkDatabaseReadiness(pool: { query(sql: string, values: readonly unknown[]): Promise<{ rows: unknown[] }> }) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      pool.query("select 1", []),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("health_readiness_timeout")), 2_000);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export function createNodeRequestListener(
  handler: (request: DashboardHttpRequest) => Promise<DashboardHttpResponse>,
  allowedOrigins: readonly string[] = []
) {
  return (request: IncomingMessage, response: ServerResponse) => {
    handleNodeRequest(handler, request, response, allowedOrigins).catch(() => {
      const errorResponse = createAdapterErrorResponse(request, allowedOrigins, 500, { code: "service_unavailable" });
      response.writeHead(errorResponse.status, errorResponse.headers);
      response.end(JSON.stringify(errorResponse.body));
    });
  };
}

async function handleNodeRequest(
  handler: (request: DashboardHttpRequest) => Promise<DashboardHttpResponse>,
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: readonly string[] = []
) {
  const url = new URL(request.url ?? "/", "http://wealthfactory.local");
  const maxBodyBytes = resolveMaxBodyBytes(url.pathname);
  const requestBody = await readRequestBody(request, maxBodyBytes);
  if (requestBody instanceof Error) {
    const rejection = createAdapterErrorResponse(request, allowedOrigins, 413, { code: "request_rejected" });
    response.writeHead(rejection.status, rejection.headers);
    response.end(JSON.stringify(rejection.body));
    return;
  }
  const parsedBody = parseRequestBody(request, requestBody.bodyText);
  if (parsedBody instanceof Error) {
    const invalidRequest = createAdapterErrorResponse(request, allowedOrigins, 400, { code: "invalid_request" });
    response.writeHead(invalidRequest.status, invalidRequest.headers);
    response.end(JSON.stringify(invalidRequest.body));
    return;
  }
  const result = await handler({
    method: request.method ?? "GET",
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    ...(parsedBody !== undefined ? { body: parsedBody } : {}),
    headers: normalizeHeaders(request),
    bodyByteLength: requestBody.bodyByteLength,
    ip: readClientIp(request)
  });

  const contentType = result.headers["content-type"] ?? "application/json";
  response.writeHead(result.status, { "content-type": contentType, ...result.headers });
  response.end(result.body === null ? "" : typeof result.body === "string" ? result.body : JSON.stringify(result.body));
}

function normalizeHeaders(request: IncomingMessage): Record<string, string | undefined> {
  return {
    authorization: readHeader(request, "authorization"),
    cookie: readHeader(request, "cookie"),
    origin: readHeader(request, "origin")
  };
}

async function readRequestBody(
  request: IncomingMessage,
  maxBodyBytes: number
): Promise<{ bodyText: string; bodyByteLength: number } | Error> {
  const chunks: Buffer[] = [];
  let bodyByteLength = 0;

  return await new Promise<{ bodyText: string; bodyByteLength: number } | Error>((resolve, reject) => {
    request.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      bodyByteLength += buffer.byteLength;
      if (bodyByteLength > maxBodyBytes) {
        request.removeAllListeners("data");
        request.removeAllListeners("end");
        request.resume();
        resolve(new Error("request_too_large"));
        return;
      }

      chunks.push(buffer);
    });
    request.on("end", () => {
      resolve({ bodyText: Buffer.concat(chunks).toString("utf8"), bodyByteLength });
    });
    request.on("error", reject);
  });
}

function parseRequestBody(request: IncomingMessage, bodyText: string): unknown {
  if (bodyText.length === 0) {
    return undefined;
  }

  const contentType = readHeader(request, "content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return undefined;
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    return new Error("invalid_json");
  }
}

function readHeader(request: IncomingMessage, key: string): string | undefined {
  const value = request.headers[key];
  return Array.isArray(value) ? value[0] : value;
}

function readClientIp(request: IncomingMessage): string {
  const socketAddress = request.socket.remoteAddress || "unknown";
  const forwardedFor = readHeader(request, "x-forwarded-for");
  if (forwardedFor && isTrustedProxyAddress(socketAddress)) {
    const forwardedClientIp = forwardedFor
      .split(",")
      .map((entry) => entry.trim())
      .find(Boolean);
    if (forwardedClientIp) {
      return forwardedClientIp;
    }
  }

  return socketAddress;
}

function resolveMaxBodyBytes(pathname: string): number {
  if (pathname === "/api/health") {
    return 8_192;
  }

  return 16_384;
}

function isTrustedProxyAddress(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}
