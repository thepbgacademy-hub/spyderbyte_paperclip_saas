import { createRequire } from "node:module";

import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { proveLiveAttentionCycleRefresh } = require("../scripts/lib/live-attention-cycle-proof.mjs") as {
  proveLiveAttentionCycleRefresh(input: {
    baseUrl: string;
    portalOrigin: string;
    sessionCookieName: string;
    sessionToken: string;
    workflowId: string;
    persona: string;
    title: string;
    deliverableType: string;
    firstBlockSummary: string;
    secondBlockSummary: string;
    unblockSummary?: string;
    fetchImpl?: (url: string, options?: Record<string, unknown>) => Promise<{
      status: number;
      json(): Promise<unknown>;
    }>;
  }): Promise<{
    ok: boolean;
    phase: string;
    notes: string[];
    runId?: string;
    cardId?: string;
    firstActionHandle?: string;
    secondActionHandle?: string;
    staleActionResult?: {
      status: number;
      body: unknown;
    };
  }>;
};

const defaultProofInput = {
  baseUrl: "https://wf-api.spyderbyte.cloud",
  portalOrigin: "https://www.spyderbyte.cloud",
  sessionCookieName: "wf_portal_session",
  sessionToken: "session-token-123",
  workflowId: "wf_connect_first_workflow",
  persona: "cfo",
  title: "Pressure-test the pricing lane",
  deliverableType: "pricing_review",
  firstBlockSummary: "Lane is blocked pending an explicit board unblock decision.",
  secondBlockSummary: "Lane re-entered a new blocked cycle after additional bounded follow-up.",
  unblockSummary: "The board supplied the missing bounded unblock context."
};

function mockJsonResponse(status: number, body: unknown) {
  return {
    status,
    json: async () => body
  };
}

function createPendingAttention(overrides: Partial<{
  actionRoute: string;
  actionPath: string;
  actionHandle: string;
  allowedResolutions: string[];
  targetCardId: string;
}> = {}) {
  return {
    actionRoute: "resolve-attention",
    actionPath: "/api/harness/runs/run-123/resolve-attention",
    actionHandle: "handle-cycle-1",
    allowedResolutions: ["unblock_lane"],
    targetCardId: "card-123",
    ...overrides
  };
}

function createBoardBody(overrides: Partial<{
  runId: string;
  workflowId: string;
  cards: unknown[];
  pendingAttention: unknown;
}> = {}) {
  return {
    runId: "run-123",
    workflowId: defaultProofInput.workflowId,
    cards: [],
    pendingAttention: undefined,
    ...overrides
  };
}

function createCycleRefreshFetchImpl(options: Partial<{
  initialBoard: unknown;
  createCard: unknown;
  firstWorking: unknown;
  firstBlocked: unknown;
  firstAttentionBoard: unknown;
  firstResolve: { status: number; body: unknown };
  secondWorking: unknown;
  secondBlocked: unknown;
  secondAttentionBoard: unknown;
  staleResolve: { status: number; body: unknown };
  secondResolve: { status: number; body: unknown };
}> = {}) {
  const fetchImpl = vi.fn();
  const firstAttention = createPendingAttention();
  const secondAttention = createPendingAttention({ actionHandle: "handle-cycle-2" });

  [
    mockJsonResponse(200, createBoardBody(options.initialBoard as Record<string, unknown> | undefined)),
    mockJsonResponse(200, { cardId: "card-123", ...(options.createCard as Record<string, unknown> | undefined) }),
    mockJsonResponse(200, { cardId: "card-123", state: "working", ...(options.firstWorking as Record<string, unknown> | undefined) }),
    mockJsonResponse(200, { cardId: "card-123", state: "blocked", ...(options.firstBlocked as Record<string, unknown> | undefined) }),
    mockJsonResponse(200, createBoardBody({
      pendingAttention: firstAttention,
      ...(options.firstAttentionBoard as Record<string, unknown> | undefined)
    })),
    mockJsonResponse(options.firstResolve?.status ?? 200, options.firstResolve?.body ?? {
      status: "unblocked",
      cardId: "card-123",
      state: "approved"
    }),
    mockJsonResponse(200, { cardId: "card-123", state: "working", ...(options.secondWorking as Record<string, unknown> | undefined) }),
    mockJsonResponse(200, { cardId: "card-123", state: "blocked", ...(options.secondBlocked as Record<string, unknown> | undefined) }),
    mockJsonResponse(200, createBoardBody({
      pendingAttention: secondAttention,
      ...(options.secondAttentionBoard as Record<string, unknown> | undefined)
    })),
    mockJsonResponse(options.staleResolve?.status ?? 409, options.staleResolve?.body ?? { code: "stale_contract" }),
    mockJsonResponse(options.secondResolve?.status ?? 200, options.secondResolve?.body ?? {
      status: "unblocked",
      cardId: "card-123",
      state: "approved"
    })
  ].forEach((response) => fetchImpl.mockResolvedValueOnce(response));

  return fetchImpl;
}

describe("live attention cycle proof helper", () => {
  it("proves a fresh unblock handle is minted for a second blocked cycle and rejects the stale first handle", async () => {
    const fetchImpl = createCycleRefreshFetchImpl();

    await expect(
      proveLiveAttentionCycleRefresh({
        ...defaultProofInput,
        fetchImpl
      })
    ).resolves.toEqual({
      ok: true,
      phase: "attention_cycle_refresh_verified",
      notes: [
        "The live board started without unrelated pending attention for the selected workflow.",
        "A fresh proof lane was opened and blocked twice through the bounded board seam.",
        "The second blocked cycle exposed a different action handle than the first blocked cycle.",
        "The first-cycle action handle was rejected with the expected stale_contract response.",
        "The second-cycle action handle resolved successfully through the bounded resolve-attention route."
      ],
      runId: "run-123",
      cardId: "card-123",
      firstActionHandle: "handle-cycle-1",
      secondActionHandle: "handle-cycle-2",
      staleActionResult: {
        status: 409,
        body: {
          code: "stale_contract"
        }
      }
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://wf-api.spyderbyte.cloud/api/harness/cards",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          workflowId: "wf_connect_first_workflow",
          persona: "cfo",
          title: "Pressure-test the pricing lane",
          deliverableType: "pricing_review"
        })
      })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      10,
      "https://wf-api.spyderbyte.cloud/api/harness/runs/run-123/resolve-attention",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          resolution: "unblock_lane",
          actionHandle: "handle-cycle-1",
          resumeSummary: "The board supplied the missing bounded unblock context."
        })
      })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      11,
      "https://wf-api.spyderbyte.cloud/api/harness/runs/run-123/resolve-attention",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          resolution: "unblock_lane",
          actionHandle: "handle-cycle-2",
          resumeSummary: "The board supplied the missing bounded unblock context."
        })
      })
    );
  });

  it("fails closed when the workflow already has unrelated pending attention before the proof starts", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({
        runId: "run-dirty-1",
        workflowId: "wf_connect_first_workflow",
        pendingAttention: {
          actionRoute: "resolve-attention",
          actionPath: "/api/harness/runs/run-dirty-1/resolve-attention",
          actionHandle: "existing-handle",
          allowedResolutions: ["resume_lane"],
          targetCardId: "other-card"
        }
      })
    });

    await expect(
      proveLiveAttentionCycleRefresh({
        ...defaultProofInput,
        sessionToken: "session-token-456",
        fetchImpl
      })
    ).resolves.toEqual({
      ok: false,
      phase: "preexisting_attention_present",
      notes: [
        "The selected workflow already exposes pending attention before the bounded cycle-refresh proof starts.",
        "The live proof stops here to avoid mutating a dirty board lane or claiming ownership over unrelated attention."
      ],
      runId: "run-dirty-1",
      cardId: undefined,
      firstActionHandle: undefined,
      secondActionHandle: undefined,
      staleActionResult: undefined
    });
  });

  it("fails closed when the board response does not belong to the requested workflow", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({
        runId: "run-mismatch-1",
        workflowId: "wf_tax_strategy",
        pendingAttention: undefined,
        cards: []
      })
    });

    await expect(
      proveLiveAttentionCycleRefresh({
        ...defaultProofInput,
        sessionToken: "session-token-mismatch",
        fetchImpl
      })
    ).resolves.toEqual({
      ok: false,
      phase: "workflow_mismatch",
      notes: [
        "The live harness board did not return the requested workflow id.",
        "Expected workflow wf_connect_first_workflow before mutating any bounded proof lane."
      ]
    });
  });

  it("fails closed when pending attention widens beyond the bounded same-origin run path", async () => {
    const fetchImpl = createCycleRefreshFetchImpl({
      firstAttentionBoard: {
        pendingAttention: createPendingAttention({
          actionPath: "https://evil.example/api/harness/runs/run-123/resolve-attention"
        })
      }
    });

    await expect(
      proveLiveAttentionCycleRefresh({
        ...defaultProofInput,
        fetchImpl
      })
    ).resolves.toEqual({
      ok: false,
      phase: "attention_path_invalid",
      notes: [
        "The live board exposed a resolve-attention path outside the bounded same-origin run contract.",
        "Expected /api/harness/runs/run-123/resolve-attention on https://wf-api.spyderbyte.cloud."
      ],
      runId: "run-123",
      cardId: "card-123"
    });
  });

  it("fails closed when pending attention does not allow the bounded unblock resolution", async () => {
    const fetchImpl = createCycleRefreshFetchImpl({
      firstAttentionBoard: {
        pendingAttention: createPendingAttention({
          allowedResolutions: ["resume_lane"]
        })
      }
    });

    await expect(
      proveLiveAttentionCycleRefresh({
        ...defaultProofInput,
        fetchImpl
      })
    ).resolves.toEqual({
      ok: false,
      phase: "attention_resolution_invalid",
      notes: [
        "The live board did not allow the expected bounded unblock resolution for the blocked proof lane.",
        "Expected allowedResolutions to include unblock_lane."
      ],
      runId: "run-123",
      cardId: "card-123"
    });
  });

  it("fails closed when the second blocked cycle reuses the first action handle", async () => {
    const fetchImpl = createCycleRefreshFetchImpl({
      secondAttentionBoard: {
        pendingAttention: createPendingAttention({
          actionHandle: "handle-cycle-1"
        })
      }
    });

    await expect(
      proveLiveAttentionCycleRefresh({
        ...defaultProofInput,
        fetchImpl
      })
    ).resolves.toEqual({
      ok: false,
      phase: "attention_handle_not_refreshed",
      notes: [
        "The second blocked cycle reused the first blocked cycle action handle.",
        "That means the live board did not mint a fresh cycle-specific handle for the new blocked state."
      ],
      runId: "run-123",
      cardId: "card-123",
      firstActionHandle: "handle-cycle-1",
      secondActionHandle: "handle-cycle-1"
    });
  });

  it("fails closed when the stale first handle is not rejected as stale_contract", async () => {
    const fetchImpl = createCycleRefreshFetchImpl({
      staleResolve: {
        status: 200,
        body: {
          status: "unblocked",
          cardId: "card-123",
          state: "approved"
        }
      }
    });

    await expect(
      proveLiveAttentionCycleRefresh({
        ...defaultProofInput,
        fetchImpl
      })
    ).resolves.toEqual({
      ok: false,
      phase: "stale_handle_not_rejected",
      notes: [
        "Reusing the first blocked-cycle action handle did not return the expected stale_contract rejection.",
        "Observed HTTP status 200 with code missing."
      ],
      runId: "run-123",
      cardId: "card-123",
      firstActionHandle: "handle-cycle-1",
      secondActionHandle: "handle-cycle-2",
      staleActionResult: {
        status: 200,
        body: {
          status: "unblocked",
          cardId: "card-123",
          state: "approved"
        }
      }
    });
  });

  it("reuses a matching approved lane instead of creating a duplicate proof card", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          runId: "run-reuse-1",
          workflowId: "wf_connect_first_workflow",
          pendingAttention: undefined,
          cards: [
            {
              id: "card-reuse-1",
              persona: "CFO",
              title: "Pressure-test the pricing lane",
              statusLabel: "Approved",
              deliverableLabel: "Pricing Review"
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          cardId: "card-reuse-1",
          state: "working"
        })
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          cardId: "card-reuse-1",
          state: "blocked"
        })
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          runId: "run-reuse-1",
          workflowId: "wf_connect_first_workflow",
          pendingAttention: {
            actionRoute: "resolve-attention",
            actionPath: "/api/harness/runs/run-reuse-1/resolve-attention",
            actionHandle: "reuse-handle-1",
            allowedResolutions: ["unblock_lane"],
            targetCardId: "card-reuse-1"
          }
        })
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          status: "unblocked",
          cardId: "card-reuse-1",
          state: "approved"
        })
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          cardId: "card-reuse-1",
          state: "working"
        })
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          cardId: "card-reuse-1",
          state: "blocked"
        })
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          runId: "run-reuse-1",
          workflowId: "wf_connect_first_workflow",
          pendingAttention: {
            actionRoute: "resolve-attention",
            actionPath: "/api/harness/runs/run-reuse-1/resolve-attention",
            actionHandle: "reuse-handle-2",
            allowedResolutions: ["unblock_lane"],
            targetCardId: "card-reuse-1"
          }
        })
      })
      .mockResolvedValueOnce({
        status: 409,
        json: async () => ({
          code: "stale_contract"
        })
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          status: "unblocked",
          cardId: "card-reuse-1",
          state: "approved"
        })
      });

    await expect(
      proveLiveAttentionCycleRefresh({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-token-789",
        workflowId: "wf_connect_first_workflow",
        persona: "cfo",
        title: "Pressure-test the pricing lane",
        deliverableType: "pricing_review",
        firstBlockSummary: "Lane is blocked pending an explicit board unblock decision.",
        secondBlockSummary: "Lane re-entered a new blocked cycle after additional bounded follow-up.",
        fetchImpl
      })
    ).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        phase: "attention_cycle_refresh_verified",
        cardId: "card-reuse-1",
        notes: expect.arrayContaining([
          "A matching approved proof lane was reused and blocked twice through the bounded board seam."
        ])
      })
    );

    expect(fetchImpl).not.toHaveBeenCalledWith(
      "https://wf-api.spyderbyte.cloud/api/harness/cards",
      expect.anything()
    );
  });

  it("can continue from a matching preexisting blocked proof lane while still rejecting unrelated attention adoption", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          runId: "run-blocked-1",
          workflowId: "wf_connect_first_workflow",
          pendingAttention: {
            kind: "await_unblock",
            runState: "blocked",
            actionRoute: "resolve-attention",
            actionPath: "/api/harness/runs/run-blocked-1/resolve-attention",
            actionHandle: "blocked-handle-1",
            allowedResolutions: ["unblock_lane"],
            targetCardId: "card-blocked-1",
            targetPersona: "CFO",
            targetTitle: "Pressure-test the pricing lane"
          },
          cards: [
            {
              id: "card-blocked-1",
              persona: "CFO",
              title: "Pressure-test the pricing lane",
              statusLabel: "Blocked",
              deliverableLabel: "Pricing Review"
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          status: "unblocked",
          cardId: "card-blocked-1",
          state: "approved"
        })
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          cardId: "card-blocked-1",
          state: "working"
        })
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          cardId: "card-blocked-1",
          state: "blocked"
        })
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          runId: "run-blocked-1",
          workflowId: "wf_connect_first_workflow",
          pendingAttention: {
            actionRoute: "resolve-attention",
            actionPath: "/api/harness/runs/run-blocked-1/resolve-attention",
            actionHandle: "blocked-handle-2",
            allowedResolutions: ["unblock_lane"],
            targetCardId: "card-blocked-1"
          }
        })
      })
      .mockResolvedValueOnce({
        status: 409,
        json: async () => ({
          code: "stale_contract"
        })
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          status: "unblocked",
          cardId: "card-blocked-1",
          state: "approved"
        })
      });

    await expect(
      proveLiveAttentionCycleRefresh({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-token-blocked",
        workflowId: "wf_connect_first_workflow",
        persona: "cfo",
        title: "Pressure-test the pricing lane",
        deliverableType: "pricing_review",
        firstBlockSummary: "Lane is blocked pending an explicit board unblock decision.",
        secondBlockSummary: "Lane re-entered a new blocked cycle after additional bounded follow-up.",
        fetchImpl
      })
    ).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        phase: "attention_cycle_refresh_verified",
        firstActionHandle: "blocked-handle-1",
        secondActionHandle: "blocked-handle-2",
        notes: expect.arrayContaining([
          "The live board started from a matching blocked proof lane and no unrelated attention was adopted."
        ])
      })
    );
  });
});
