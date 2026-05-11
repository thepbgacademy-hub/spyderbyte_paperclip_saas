import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import type { ApiSession } from "./dashboard-api.js";
import { createDashboardApi } from "./dashboard-api.js";
import { createDashboardHttpHandler, type DashboardHttpResponse } from "./dashboard-http.js";
import { createAcidGuardRepository } from "../db/acid-guard-repository.js";
import { createPgPool, createPgPoolQueryClient, createPgTransactionRunner } from "../db/postgres-client.js";
import { createSupabaseRepositories } from "../db/supabase-repositories.js";
import { createFixedWindowRateLimiter } from "../security/rate-limit.js";
import { createEncryptedSecretVault } from "../secrets/encrypted-vault.js";
import { createPostgresEncryptedVaultStore } from "../secrets/postgres-vault-store.js";
import { createVaultBackedProviderCredentialRegistration } from "../secrets/vault-backed-provider-registration.js";
import type { WorkflowRunEnqueuer } from "../workflows/acid-run-reservation.js";
import { createQueueOutboxPump } from "../workflows/queue-outbox-pump.js";
import { createQueueOutboxWorker } from "../workflows/queue-outbox-worker.js";

export type RuntimeEnv = {
  supabaseDbUrl: string;
  supabaseDbSsl?: string;
  allowedOrigins: readonly string[];
  apiPort: number;
  vaultMasterKey: string;
  runtimeEnv: Record<string, string | undefined>;
};

export type RuntimeAuth = {
  authenticate(input: { authorization: string }): Promise<ApiSession | null>;
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

  return {
    supabaseDbUrl,
    ...(source.SUPABASE_DB_SSL ? { supabaseDbSsl: source.SUPABASE_DB_SSL } : {}),
    allowedOrigins,
    apiPort,
    vaultMasterKey,
    runtimeEnv: source
  };
}

export function createDashboardRuntime(options: { env: RuntimeEnv; auth: RuntimeAuth; workflowQueueEnqueuer?: WorkflowRunEnqueuer }) {
  const pool = createPgPool({
    connectionString: options.env.supabaseDbUrl,
    ...(options.env.supabaseDbSsl ? { sslMode: options.env.supabaseDbSsl } : {})
  });
  const queryClient = createPgPoolQueryClient(pool);
  const repositories = createSupabaseRepositories(queryClient);
  const registerProviderCredential = createVaultBackedProviderCredentialRegistration({
    vault: createEncryptedSecretVault({
      masterKey: options.env.vaultMasterKey,
      store: createPostgresEncryptedVaultStore(queryClient)
    }),
    repository: {
      create: repositories.createSecretReference,
      updateSecretRef: repositories.updateSecretRef,
      revoke: repositories.revokeSecretReference,
      findIdBySecretRef: repositories.findSecretReferenceId
    },
    audit: async () => undefined,
    runtimeEnv: options.env.runtimeEnv
  });
  const acidRepository = createAcidGuardRepository(createPgTransactionRunner(pool));
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
    listProviderConnections: repositories.listProviderConnections
  });
  const handler = createDashboardHttpHandler({
    allowedOrigins: options.env.allowedOrigins,
    dashboardApi,
    rateLimiter: createFixedWindowRateLimiter({ limit: 120, windowMs: 60_000 })
  });

  return {
    server: createServer(createNodeRequestListener(handler)),
    registerProviderCredential,
    startWorkers: () => outboxPump?.start(),
    close: async () => {
      outboxPump?.stop();
      await pool.end();
    }
  };
}

export function createNodeRequestListener(handler: (request: Parameters<ReturnType<typeof createDashboardHttpHandler>>[0]) => Promise<DashboardHttpResponse>) {
  return (request: IncomingMessage, response: ServerResponse) => {
    handleNodeRequest(handler, request, response).catch(() => {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ code: "service_unavailable" }));
    });
  };
}

async function handleNodeRequest(handler: (request: Parameters<ReturnType<typeof createDashboardHttpHandler>>[0]) => Promise<DashboardHttpResponse>, request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", "http://wealthfactory.local");
  const result = await handler({
    method: request.method ?? "GET",
    path: url.pathname,
    headers: normalizeHeaders(request),
    bodyByteLength: Number(request.headers["content-length"] ?? 0),
    ip: readClientIp(request)
  });

  response.writeHead(result.status, { "content-type": "application/json", ...result.headers });
  response.end(result.body === null ? "" : JSON.stringify(result.body));
}

function normalizeHeaders(request: IncomingMessage): Record<string, string | undefined> {
  return {
    authorization: readHeader(request, "authorization"),
    origin: readHeader(request, "origin")
  };
}

function readHeader(request: IncomingMessage, key: string): string | undefined {
  const value = request.headers[key];
  return Array.isArray(value) ? value[0] : value;
}

function readClientIp(request: IncomingMessage): string {
  return request.socket.remoteAddress || "unknown";
}
