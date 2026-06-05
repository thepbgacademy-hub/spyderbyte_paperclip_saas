export type AppEnv = {
  nodeEnv: "development" | "test" | "production";
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  redisUrl: string;
  workflowQueueName: string;
  paperclipBaseUrl: string;
  paperclipServiceToken: string;
  paperclipServiceTokensByCompany: Readonly<Record<string, string>>;
  paperclipBoardSessionToken?: string;
  paperclipBoardOrigin?: string;
  paperclipAdminToken?: string;
  vaultMasterKey: string;
  providerExecutionMode: "tenant_credentials_required" | "debug_shared_fallback";
  paperclipLaunchMode: "runs" | "issues";
  paperclipIssueAgentId?: string;
  paperclipIssuePollIntervalMs: number;
  paperclipIssueMaxPollAttempts: number;
  harnessEnabledWorkflowIds: readonly string[];
  nativeExecutorEnabledWorkflowIds: readonly string[];
  nativeOpenAIModel: string;
  workerConcurrency: number;
  workerMaxActivePerTenant: number;
};

export type WorkflowQueueEnv = {
  redisUrl: string;
  workflowQueueName: string;
};

const REQUIRED_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "REDIS_URL",
  "PAPERCLIP_BASE_URL",
  "PAPERCLIP_SERVICE_TOKEN",
  "WF_VAULT_MASTER_KEY"
] as const;

type RequiredEnvKey = (typeof REQUIRED_KEYS)[number];

export class EnvValidationError extends Error {
  constructor(readonly missingKeys: RequiredEnvKey[], readonly invalidKeys: string[]) {
    const details = [
      missingKeys.length > 0 ? `missing: ${missingKeys.join(", ")}` : "",
      invalidKeys.length > 0 ? `invalid: ${invalidKeys.join(", ")}` : ""
    ]
      .filter(Boolean)
      .join("; ");

    super(`Invalid environment configuration (${details})`);
    this.name = "EnvValidationError";
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const missingKeys = REQUIRED_KEYS.filter((key) => !hasValue(source[key]));
  const invalidKeys: string[] = [];

  if (hasValue(source.SUPABASE_URL) && !isHttpUrl(source.SUPABASE_URL)) {
    invalidKeys.push("SUPABASE_URL");
  }

  if (hasValue(source.REDIS_URL) && !source.REDIS_URL.startsWith("redis://") && !source.REDIS_URL.startsWith("rediss://")) {
    invalidKeys.push("REDIS_URL");
  }

  if (hasValue(source.PAPERCLIP_BASE_URL) && !isHttpUrl(source.PAPERCLIP_BASE_URL)) {
    invalidKeys.push("PAPERCLIP_BASE_URL");
  }
  if (hasValue(source.WF_PAPERCLIP_BOARD_ORIGIN) && !isHttpUrl(source.WF_PAPERCLIP_BOARD_ORIGIN)) {
    invalidKeys.push("WF_PAPERCLIP_BOARD_ORIGIN");
  }

  if (hasValue(source.WF_VAULT_MASTER_KEY) && source.WF_VAULT_MASTER_KEY.length < 24) {
    invalidKeys.push("WF_VAULT_MASTER_KEY");
  }

  const nodeEnv = source.NODE_ENV ?? "development";
  if (!["development", "test", "production"].includes(nodeEnv)) {
    invalidKeys.push("NODE_ENV");
  }
  const providerExecutionMode = source.WF_PROVIDER_EXECUTION_MODE ?? "tenant_credentials_required";
  if (!["tenant_credentials_required", "debug_shared_fallback"].includes(providerExecutionMode)) {
    invalidKeys.push("WF_PROVIDER_EXECUTION_MODE");
  }
  const paperclipLaunchMode = source.WF_PAPERCLIP_LAUNCH_MODE ?? "runs";
  if (!["runs", "issues"].includes(paperclipLaunchMode)) {
    invalidKeys.push("WF_PAPERCLIP_LAUNCH_MODE");
  }
  const paperclipIssueAgentId = hasValue(source.WF_PAPERCLIP_ISSUE_AGENT_ID) ? source.WF_PAPERCLIP_ISSUE_AGENT_ID.trim() : undefined;
  if (paperclipLaunchMode === "issues" && !paperclipIssueAgentId) {
    invalidKeys.push("WF_PAPERCLIP_ISSUE_AGENT_ID");
  }
  const paperclipIssuePollIntervalMs = readPositiveInteger(source.WF_PAPERCLIP_ISSUE_POLL_INTERVAL_MS, 1_000);
  if (paperclipIssuePollIntervalMs === null) {
    invalidKeys.push("WF_PAPERCLIP_ISSUE_POLL_INTERVAL_MS");
  }
  const paperclipIssueMaxPollAttempts = readPositiveInteger(source.WF_PAPERCLIP_ISSUE_MAX_POLL_ATTEMPTS, 60);
  if (paperclipIssueMaxPollAttempts === null) {
    invalidKeys.push("WF_PAPERCLIP_ISSUE_MAX_POLL_ATTEMPTS");
  }
  const paperclipBoardSessionToken = hasValue(source.WF_PAPERCLIP_BOARD_SESSION_TOKEN)
    ? source.WF_PAPERCLIP_BOARD_SESSION_TOKEN.trim()
    : undefined;
  const paperclipServiceTokensByCompany = readJsonStringMap(source.WF_PAPERCLIP_SERVICE_TOKEN_MAP);
  if (source.WF_PAPERCLIP_SERVICE_TOKEN_MAP !== undefined && paperclipServiceTokensByCompany === null) {
    invalidKeys.push("WF_PAPERCLIP_SERVICE_TOKEN_MAP");
  }
  const paperclipBoardOrigin = hasValue(source.WF_PAPERCLIP_BOARD_ORIGIN) ? trimTrailingSlash(source.WF_PAPERCLIP_BOARD_ORIGIN) : undefined;
  const paperclipAdminToken = hasValue(source.WF_PAPERCLIP_ADMIN_TOKEN) ? source.WF_PAPERCLIP_ADMIN_TOKEN.trim() : undefined;
  if (paperclipBoardSessionToken && !paperclipBoardOrigin) {
    invalidKeys.push("WF_PAPERCLIP_BOARD_ORIGIN");
  }
  const workerConcurrency = readPositiveInteger(source.WF_WORKER_CONCURRENCY, 2);
  if (workerConcurrency === null) {
    invalidKeys.push("WF_WORKER_CONCURRENCY");
  }
  const workerMaxActivePerTenant = readPositiveInteger(source.WF_WORKER_MAX_ACTIVE_PER_TENANT, 1);
  if (workerMaxActivePerTenant === null) {
    invalidKeys.push("WF_WORKER_MAX_ACTIVE_PER_TENANT");
  }
  const harnessEnabledWorkflowIds = parseCommaSeparatedValues(source.WF_HARNESS_ENABLED_WORKFLOW_IDS);
  const nativeExecutorEnabledWorkflowIds = parseCommaSeparatedValues(source.WF_NATIVE_EXECUTOR_ENABLED_WORKFLOW_IDS);
  const nativeOpenAIModel = source.WF_NATIVE_OPENAI_MODEL?.trim() || "gpt-4.1-mini";

  if (missingKeys.length > 0 || invalidKeys.length > 0) {
    throw new EnvValidationError(missingKeys, invalidKeys);
  }

  return {
    nodeEnv: nodeEnv as AppEnv["nodeEnv"],
    supabaseUrl: source.SUPABASE_URL as string,
    supabaseAnonKey: source.SUPABASE_ANON_KEY as string,
    supabaseServiceRoleKey: source.SUPABASE_SERVICE_ROLE_KEY as string,
    redisUrl: source.REDIS_URL as string,
    workflowQueueName: source.WF_WORKFLOW_QUEUE_NAME?.trim() || "wfpc-workflow-runs",
    paperclipBaseUrl: trimTrailingSlash(source.PAPERCLIP_BASE_URL as string),
    paperclipServiceToken: source.PAPERCLIP_SERVICE_TOKEN as string,
    paperclipServiceTokensByCompany: paperclipServiceTokensByCompany ?? {},
    ...(paperclipBoardSessionToken ? { paperclipBoardSessionToken } : {}),
    ...(paperclipBoardOrigin ? { paperclipBoardOrigin } : {}),
    ...(paperclipAdminToken ? { paperclipAdminToken } : {}),
    vaultMasterKey: source.WF_VAULT_MASTER_KEY as string,
    providerExecutionMode: providerExecutionMode as AppEnv["providerExecutionMode"],
    paperclipLaunchMode: paperclipLaunchMode as AppEnv["paperclipLaunchMode"],
    ...(paperclipIssueAgentId ? { paperclipIssueAgentId } : {}),
    paperclipIssuePollIntervalMs: paperclipIssuePollIntervalMs as number,
    paperclipIssueMaxPollAttempts: paperclipIssueMaxPollAttempts as number,
    harnessEnabledWorkflowIds,
    nativeExecutorEnabledWorkflowIds,
    nativeOpenAIModel,
    workerConcurrency: workerConcurrency as number,
    workerMaxActivePerTenant: workerMaxActivePerTenant as number
  };
}

export function validatePaperclipLaunchEnv(source: NodeJS.ProcessEnv = process.env): void {
  const invalidKeys: string[] = [];

  const paperclipLaunchMode = source.WF_PAPERCLIP_LAUNCH_MODE ?? "runs";
  if (!["runs", "issues"].includes(paperclipLaunchMode)) {
    invalidKeys.push("WF_PAPERCLIP_LAUNCH_MODE");
  }

  const paperclipIssueAgentId = hasValue(source.WF_PAPERCLIP_ISSUE_AGENT_ID) ? source.WF_PAPERCLIP_ISSUE_AGENT_ID.trim() : undefined;
  if (paperclipLaunchMode === "issues" && !paperclipIssueAgentId) {
    invalidKeys.push("WF_PAPERCLIP_ISSUE_AGENT_ID");
  }

  const paperclipIssuePollIntervalMs = readPositiveInteger(source.WF_PAPERCLIP_ISSUE_POLL_INTERVAL_MS, 1_000);
  if (paperclipIssuePollIntervalMs === null) {
    invalidKeys.push("WF_PAPERCLIP_ISSUE_POLL_INTERVAL_MS");
  }
  const paperclipIssueMaxPollAttempts = readPositiveInteger(source.WF_PAPERCLIP_ISSUE_MAX_POLL_ATTEMPTS, 60);
  if (paperclipIssueMaxPollAttempts === null) {
    invalidKeys.push("WF_PAPERCLIP_ISSUE_MAX_POLL_ATTEMPTS");
  }

  const paperclipBoardSessionToken = hasValue(source.WF_PAPERCLIP_BOARD_SESSION_TOKEN)
    ? source.WF_PAPERCLIP_BOARD_SESSION_TOKEN.trim()
    : undefined;
  const paperclipBoardOrigin = hasValue(source.WF_PAPERCLIP_BOARD_ORIGIN) ? trimTrailingSlash(source.WF_PAPERCLIP_BOARD_ORIGIN) : undefined;
  if (paperclipBoardSessionToken && !paperclipBoardOrigin) {
    invalidKeys.push("WF_PAPERCLIP_BOARD_ORIGIN");
  }

  if (invalidKeys.length > 0) {
    throw new EnvValidationError([], invalidKeys);
  }
}

export function loadWorkflowQueueEnv(source: NodeJS.ProcessEnv = process.env): WorkflowQueueEnv {
  const missingKeys = REQUIRED_KEYS.filter((key) => key === "REDIS_URL" && !hasValue(source[key]));
  const invalidKeys: string[] = [];

  if (hasValue(source.REDIS_URL) && !source.REDIS_URL.startsWith("redis://") && !source.REDIS_URL.startsWith("rediss://")) {
    invalidKeys.push("REDIS_URL");
  }

  if (missingKeys.length > 0 || invalidKeys.length > 0) {
    throw new EnvValidationError(missingKeys, invalidKeys);
  }

  return {
    redisUrl: source.REDIS_URL as string,
    workflowQueueName: source.WF_WORKFLOW_QUEUE_NAME?.trim() || "wfpc-workflow-runs"
  };
}

function hasValue(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function readPositiveInteger(value: string | undefined, fallback: number): number | null {
  if (!hasValue(value)) {
    return fallback;
  }

  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return parsed >= 1 ? parsed : null;
}

function readJsonStringMap(value: string | undefined): Readonly<Record<string, string>> | null {
  if (!hasValue(value)) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const entries = Object.entries(parsed);
    if (entries.some(([key, entryValue]) => key.trim().length === 0 || typeof entryValue !== "string" || entryValue.trim().length === 0)) {
      return null;
    }
    return Object.freeze(
      Object.fromEntries(entries.map(([key, entryValue]) => [key.trim(), (entryValue as string).trim()]))
    );
  } catch {
    return null;
  }
}

function parseCommaSeparatedValues(value: string | undefined): readonly string[] {
  if (!hasValue(value)) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
