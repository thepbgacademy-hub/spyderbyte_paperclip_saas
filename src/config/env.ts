export type AppEnv = {
  nodeEnv: "development" | "test" | "production";
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  redisUrl: string;
  paperclipBaseUrl: string;
  paperclipServiceToken: string;
  vaultMasterKey: string;
  providerExecutionMode: "tenant_credentials_required" | "debug_shared_fallback";
  workerConcurrency: number;
  workerMaxActivePerTenant: number;
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
  const workerConcurrency = readPositiveInteger(source.WF_WORKER_CONCURRENCY, 2);
  if (workerConcurrency === null) {
    invalidKeys.push("WF_WORKER_CONCURRENCY");
  }
  const workerMaxActivePerTenant = readPositiveInteger(source.WF_WORKER_MAX_ACTIVE_PER_TENANT, 1);
  if (workerMaxActivePerTenant === null) {
    invalidKeys.push("WF_WORKER_MAX_ACTIVE_PER_TENANT");
  }

  if (missingKeys.length > 0 || invalidKeys.length > 0) {
    throw new EnvValidationError(missingKeys, invalidKeys);
  }

  return {
    nodeEnv: nodeEnv as AppEnv["nodeEnv"],
    supabaseUrl: source.SUPABASE_URL as string,
    supabaseAnonKey: source.SUPABASE_ANON_KEY as string,
    supabaseServiceRoleKey: source.SUPABASE_SERVICE_ROLE_KEY as string,
    redisUrl: source.REDIS_URL as string,
    paperclipBaseUrl: trimTrailingSlash(source.PAPERCLIP_BASE_URL as string),
    paperclipServiceToken: source.PAPERCLIP_SERVICE_TOKEN as string,
    vaultMasterKey: source.WF_VAULT_MASTER_KEY as string,
    providerExecutionMode: providerExecutionMode as AppEnv["providerExecutionMode"],
    workerConcurrency: workerConcurrency as number,
    workerMaxActivePerTenant: workerMaxActivePerTenant as number
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
