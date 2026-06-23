import { createRequire } from "node:module";

import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { resolveLiveNativeAttention } = require("../scripts/lib/live-harness-board-roundtrip.mjs") as {
  resolveLiveNativeAttention(input: {
    baseUrl: string;
    portalOrigin: string;
    sessionCookieName: string;
    sessionToken: string;
    workflowId: string;
    expectedRunId: string;
    fetchImpl?: (url: string, options?: Record<string, unknown>) => Promise<{
      status: number;
      json(): Promise<unknown>;
    }>;
    nowImpl?: () => string;
  }): Promise<{
    ok: boolean;
    phase: string;
    notes: string[];
    postAttemptedAt?: string;
    actionResult?: {
      status: number;
      body: unknown;
    };
  }>;
};

describe("live harness board round-trip helper", () => {
  it("loads the current board contract and resolves a waiting lane through resume_lane", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          runId: "run-123",
          workflowId: "wf_connect_first_workflow",
          pendingAttention: {
            actionRoute: "resolve-attention",
            actionPath: "/api/harness/runs/run-123/resolve-attention",
            actionHandle: "handle-123",
            allowedResolutions: ["resume_lane"]
          }
        })
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          status: "resumed",
          cardId: "card-123",
          state: "working"
        })
      });

    await expect(
      resolveLiveNativeAttention({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-token-123",
        workflowId: "wf_connect_first_workflow",
        expectedRunId: "run-123",
        fetchImpl,
        nowImpl: () => "2026-06-22T23:59:30.000Z"
      })
    ).resolves.toEqual({
      ok: true,
      phase: "native_attention_resolved",
      notes: [
        "The live board returned the current native attention contract for the requested workflow.",
        "Submitting the bounded native attention resolution through the guarded resolve-attention route returned a successful response."
      ],
      postAttemptedAt: "2026-06-22T23:59:30.000Z",
      actionResult: {
        status: 200,
        body: {
          status: "resumed",
          cardId: "card-123",
          state: "working"
        }
      }
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://wf-api.spyderbyte.cloud/api/harness/board?workflowId=wf_connect_first_workflow",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          cookie: "wf_portal_session=session-token-123",
          origin: "https://www.spyderbyte.cloud"
        })
      })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://wf-api.spyderbyte.cloud/api/harness/runs/run-123/resolve-attention",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          cookie: "wf_portal_session=session-token-123",
          origin: "https://www.spyderbyte.cloud"
        }),
        body: JSON.stringify({
          resolution: "resume_lane",
          actionHandle: "handle-123",
          command: "resume_lane",
          actionToken: "handle-123"
        })
      })
    );
  });

  it("loads the current board contract and resolves a blocked lane through unblock_lane", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          runId: "run-456",
          workflowId: "wf_connect_first_workflow",
          pendingAttention: {
            actionRoute: "resolve-attention",
            actionPath: "/api/harness/runs/run-456/resolve-attention",
            actionHandle: "handle-456",
            allowedResolutions: ["unblock_lane"]
          }
        })
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          status: "unblocked",
          cardId: "card-456",
          state: "approved"
        })
      });

    await expect(
      resolveLiveNativeAttention({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-token-456",
        workflowId: "wf_connect_first_workflow",
        expectedRunId: "run-456",
        fetchImpl,
        nowImpl: () => "2026-06-23T00:00:30.000Z"
      })
    ).resolves.toEqual({
      ok: true,
      phase: "native_attention_resolved",
      notes: [
        "The live board returned the current native attention contract for the requested workflow.",
        "Submitting the bounded native attention resolution through the guarded resolve-attention route returned a successful response."
      ],
      postAttemptedAt: "2026-06-23T00:00:30.000Z",
      actionResult: {
        status: 200,
        body: {
          status: "unblocked",
          cardId: "card-456",
          state: "approved"
        }
      }
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://wf-api.spyderbyte.cloud/api/harness/runs/run-456/resolve-attention",
      expect.objectContaining({
        body: JSON.stringify({
          resolution: "unblock_lane",
          actionHandle: "handle-456",
          command: "unblock_lane",
          actionToken: "handle-456"
        })
      })
    );
  });

  it("fails closed when the live board is not exposing a native resolve-attention contract for the expected run", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({
        runId: "run-other",
        workflowId: "wf_connect_first_workflow",
        pendingAttention: {
          actionRoute: "review-attention",
          actionPath: "/api/harness/runs/run-other/review-attention",
          actionHandle: "handle-other",
          allowedDecisions: ["start_next_lane"]
        }
      })
    });

    await expect(
      resolveLiveNativeAttention({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-token-123",
        workflowId: "wf_connect_first_workflow",
        expectedRunId: "run-123",
        fetchImpl
      })
    ).resolves.toEqual({
      ok: false,
      phase: "native_attention_unavailable",
      notes: [
        "The live board did not return the expected native resolve-attention contract for the requested run.",
        "Expected run run-123 with a resolve-attention action that allows resume_lane or unblock_lane."
      ],
      actionResult: undefined
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
