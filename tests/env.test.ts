import { describe, expect, it } from "vitest";

import { EnvValidationError, loadEnv, loadWorkflowQueueEnv, validatePaperclipLaunchEnv } from "../src/config/env.js";

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
      workflowQueueName: "wfpc-workflow-runs",
      paperclipBaseUrl: "https://paperclip-internal.spyderbyte.cloud",
      paperclipServiceToken: "paperclip-service-token",
      paperclipServiceTokensByCompany: {},
      vaultMasterKey: "test-master-key-with-enough-length",
      providerExecutionMode: "tenant_credentials_required",
      paperclipLaunchMode: "runs",
      paperclipIssuePollIntervalMs: 1000,
      paperclipIssueMaxPollAttempts: 60,
      harnessEnabledWorkflowIds: [],
      nativeExecutorEnabledWorkflowIds: [],
      nativeOpenAIModel: "gpt-4.1-mini",
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

  it("accepts issue-launch mode when an agent id is configured", () => {
    expect(
      loadEnv({
        ...validEnv,
        WF_PAPERCLIP_LAUNCH_MODE: "issues",
        WF_PAPERCLIP_BOARD_SESSION_TOKEN: "board-session-cookie",
        WF_PAPERCLIP_BOARD_ORIGIN: "https://paperclip-board.internal.local",
        WF_PAPERCLIP_ISSUE_AGENT_ID: "agent-1",
        WF_PAPERCLIP_ISSUE_POLL_INTERVAL_MS: "1500",
        WF_PAPERCLIP_ISSUE_MAX_POLL_ATTEMPTS: "12"
      })
    ).toMatchObject({
      paperclipLaunchMode: "issues",
      paperclipBoardSessionToken: "board-session-cookie",
      paperclipBoardOrigin: "https://paperclip-board.internal.local",
      paperclipIssueAgentId: "agent-1",
      paperclipIssuePollIntervalMs: 1500,
      paperclipIssueMaxPollAttempts: 12
    });
  });

  it("parses an optional Paperclip company token map", () => {
    expect(
      loadEnv({
        ...validEnv,
        WF_PAPERCLIP_SERVICE_TOKEN_MAP: JSON.stringify({
          "pc-company-1": "pcp-company-1",
          "pc-company-2": "pcp-company-2"
        })
      }).paperclipServiceTokensByCompany
    ).toEqual({
      "pc-company-1": "pcp-company-1",
      "pc-company-2": "pcp-company-2"
    });
  });

  it("rejects an invalid Paperclip company token map", () => {
    expect(() => loadEnv({ ...validEnv, WF_PAPERCLIP_SERVICE_TOKEN_MAP: '{"pc-company-1":""}' })).toThrow(/WF_PAPERCLIP_SERVICE_TOKEN_MAP/);
  });

  it("preserves the legacy admin token separately from the board-session token", () => {
    expect(
      loadEnv({
        ...validEnv,
        WF_PAPERCLIP_ADMIN_TOKEN: "legacy-admin-token",
        WF_PAPERCLIP_BOARD_ORIGIN: "https://paperclip-board.internal.local"
      })
    ).toMatchObject({
      paperclipBoardOrigin: "https://paperclip-board.internal.local",
      paperclipAdminToken: "legacy-admin-token"
    });
  });

  it("requires an explicit board origin when the board session token is configured", () => {
    expect(() => loadEnv({ ...validEnv, WF_PAPERCLIP_BOARD_SESSION_TOKEN: "board-session-cookie" })).toThrow(/WF_PAPERCLIP_BOARD_ORIGIN/);
  });

  it("requires an agent id for issue-launch mode", () => {
    expect(() => loadEnv({ ...validEnv, WF_PAPERCLIP_LAUNCH_MODE: "issues" })).toThrow(/WF_PAPERCLIP_ISSUE_AGENT_ID/);
  });

  it("validates the issue-launch env seam without requiring the full app env set", () => {
    expect(() =>
      validatePaperclipLaunchEnv({
        WF_PAPERCLIP_LAUNCH_MODE: "issues",
        WF_PAPERCLIP_BOARD_SESSION_TOKEN: "board-session-cookie",
        WF_PAPERCLIP_ISSUE_AGENT_ID: "agent-1"
      })
    ).toThrow(/WF_PAPERCLIP_BOARD_ORIGIN/);

    expect(() =>
      validatePaperclipLaunchEnv({
        WF_PAPERCLIP_LAUNCH_MODE: "issues",
        WF_PAPERCLIP_BOARD_SESSION_TOKEN: "board-session-cookie",
        WF_PAPERCLIP_BOARD_ORIGIN: "https://paperclip-board.internal.local",
        WF_PAPERCLIP_ISSUE_AGENT_ID: "agent-1"
      })
    ).not.toThrow();
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

  it("parses opted-in harness workflow ids", () => {
    expect(
      loadEnv({
        ...validEnv,
        WF_HARNESS_ENABLED_WORKFLOW_IDS: " wf_connect_first_workflow , wf_package_followup "
      }).harnessEnabledWorkflowIds
    ).toEqual(["wf_connect_first_workflow", "wf_package_followup"]);
  });

  it("parses opted-in native executor workflow ids", () => {
    expect(
      loadEnv({
        ...validEnv,
        WF_NATIVE_EXECUTOR_ENABLED_WORKFLOW_IDS: " wf_connect_first_workflow , wf_package_followup "
      }).nativeExecutorEnabledWorkflowIds
    ).toEqual(["wf_connect_first_workflow", "wf_package_followup"]);
  });

  it("accepts an explicit native OpenAI model override", () => {
    expect(
      loadEnv({
        ...validEnv,
        WF_NATIVE_OPENAI_MODEL: "gpt-4.1"
      }).nativeOpenAIModel
    ).toBe("gpt-4.1");
  });

  it("rejects invalid worker concurrency settings", () => {
    expect(() => loadEnv({ ...validEnv, WF_WORKER_CONCURRENCY: "0" })).toThrow(/WF_WORKER_CONCURRENCY/);
    expect(() => loadEnv({ ...validEnv, WF_WORKER_MAX_ACTIVE_PER_TENANT: "0" })).toThrow(/WF_WORKER_MAX_ACTIVE_PER_TENANT/);
  });

  it("loads queue env without requiring worker-only runtime values", () => {
    expect(
      loadWorkflowQueueEnv({
        REDIS_URL: "redis://localhost:6379",
        WF_WORKFLOW_QUEUE_NAME: "wfpc-custom"
      })
    ).toEqual({
      redisUrl: "redis://localhost:6379",
      workflowQueueName: "wfpc-custom"
    });
  });
});
