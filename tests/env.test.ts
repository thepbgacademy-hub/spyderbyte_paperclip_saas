import { describe, expect, it } from "vitest";

import { EnvValidationError, loadEnv } from "../src/config/env.js";

const validEnv = {
  NODE_ENV: "test",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  REDIS_URL: "redis://localhost:6379",
  PAPERCLIP_BASE_URL: "https://paperclip-internal.spyderbyte.cloud/",
  PAPERCLIP_SERVICE_TOKEN: "paperclip-service-token"
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
      paperclipServiceToken: "paperclip-service-token"
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
});
