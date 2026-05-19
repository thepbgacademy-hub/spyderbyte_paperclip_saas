import { describe, expect, it } from "vitest";

import { EnvValidationError, loadEnv } from "../src/config/env.js";

const validEnv = {
  NODE_ENV: "test",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  REDIS_URL: "redis://localhost:6379",
  PAPERCLIP_BASE_URL: "https://paperclip-internal.spyderbyte.cloud/",
  PAPERCLIP_SERVICE_TOKEN: "paperclip-service-token",
  WF_VAULT_MASTER_KEY: "test-master-key-with-enough-length"
};

describe("loadEnv", () => {
  it("returns normalized environment values", () => {
    expect(loadEnv(validEnv)).toEqual({
      nodeEnv: "test",
      supabaseUrl: "https://example.supabase.co",
      supabaseAnonKey: "anon-key",
      supabaseServiceRoleKey: "service-role-key",
      redisUrl: "redis://localhost:6379",
      paperclipBaseUrl: "https://paperclip-internal.spyderbyte.cloud",
      paperclipServiceToken: "paperclip-service-token",
      vaultMasterKey: "test-master-key-with-enough-length",
      providerExecutionMode: "tenant_credentials_required",
      workerConcurrency: 2,
      workerMaxActivePerTenant: 1
    });
  });

  it("throws with missing required keys", () => {
    expect(() => loadEnv({ ...validEnv, REDIS_URL: "" })).toThrow(EnvValidationError);

    try {
      loadEnv({ ...validEnv, REDIS_URL: "" });
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as EnvValidationError).missingKeys).toEqual(["REDIS_URL"]);
    }
  });

  it("throws with invalid URLs", () => {
    expect(() =>
      loadEnv({
        ...validEnv,
        SUPABASE_URL: "not-a-url",
        REDIS_URL: "http://localhost:6379",
        PAPERCLIP_BASE_URL: "ftp://paperclip"
      })
    ).toThrow(/invalid: SUPABASE_URL, REDIS_URL, PAPERCLIP_BASE_URL/);
  });

  it("requires a strong vault master key", () => {
    expect(() => loadEnv({ ...validEnv, WF_VAULT_MASTER_KEY: "short" })).toThrow(/invalid: WF_VAULT_MASTER_KEY/);
  });

  it("accepts explicit debug shared fallback mode", () => {
    expect(loadEnv({ ...validEnv, WF_PROVIDER_EXECUTION_MODE: "debug_shared_fallback" }).providerExecutionMode).toBe("debug_shared_fallback");
  });

  it("rejects unknown provider execution modes", () => {
    expect(() => loadEnv({ ...validEnv, WF_PROVIDER_EXECUTION_MODE: "something_else" })).toThrow(/WF_PROVIDER_EXECUTION_MODE/);
  });

  it("accepts explicit worker concurrency settings", () => {
    expect(
      loadEnv({
        ...validEnv,
        WF_WORKER_CONCURRENCY: "4",
        WF_WORKER_MAX_ACTIVE_PER_TENANT: "2"
      })
    ).toMatchObject({
      workerConcurrency: 4,
      workerMaxActivePerTenant: 2
    });
  });

  it("rejects invalid worker concurrency settings", () => {
    expect(() => loadEnv({ ...validEnv, WF_WORKER_CONCURRENCY: "0" })).toThrow(/WF_WORKER_CONCURRENCY/);
    expect(() => loadEnv({ ...validEnv, WF_WORKER_MAX_ACTIVE_PER_TENANT: "0" })).toThrow(/WF_WORKER_MAX_ACTIVE_PER_TENANT/);
  });
});
