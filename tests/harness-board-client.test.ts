import { describe, expect, it, vi } from "vitest";

import { createHarnessBoardClient } from "../apps/web/src/harness-board-client.js";

describe("harness board client", () => {
  it("enables browser fallback only on loopback hosts", () => {
    const localClient = createHarnessBoardClient(
      fetch,
      { location: { hostname: "127.0.0.1" } as Window["location"] }
    );
    const remoteClient = createHarnessBoardClient(
      fetch,
      { location: { hostname: "app.spyderbyte.cloud" } as Window["location"] }
    );

    expect(localClient.isBrowserFallbackEnabled()).toBe(true);
    expect(remoteClient.isBrowserFallbackEnabled()).toBe(false);
  });

  it("does not silently fall back on non-loopback hosts when the live request fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false
    });
    const client = createHarnessBoardClient(
      fetchImpl as unknown as typeof fetch,
      { location: { hostname: "app.spyderbyte.cloud" } as Window["location"] }
    );

    await expect(client.fetchBoard()).rejects.toThrow("Unable to load harness board");
    expect(fetchImpl).toHaveBeenCalledWith("/api/harness/board", { credentials: "include" });
    expect(client.isBrowserFallbackEnabled()).toBe(false);
  });

  it("submits bounded board actions through the live contract path", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "approved" })
    });
    const client = createHarnessBoardClient(
      fetchImpl as unknown as typeof fetch,
      { location: { hostname: "app.spyderbyte.cloud" } as Window["location"] }
    );

    await expect(
      client.submitAction("/api/harness/proposals/proposal_1/decision", { decision: "approve" })
    ).resolves.toEqual({ status: "approved" });

    expect(fetchImpl).toHaveBeenCalledWith("/api/harness/proposals/proposal_1/decision", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ decision: "approve" })
    });
  });

  it("fails closed when a bounded board action request is rejected", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false
    });
    const client = createHarnessBoardClient(
      fetchImpl as unknown as typeof fetch,
      { location: { hostname: "app.spyderbyte.cloud" } as Window["location"] }
    );

    await expect(
      client.submitAction("/api/harness/runs/run_1/review-attention", { decision: "complete_run" })
    ).rejects.toThrow("Unable to update harness board");
  });

  it("keeps the localhost fallback aligned with the bounded board action contract", () => {
    const client = createHarnessBoardClient(
      fetch,
      { location: { hostname: "127.0.0.1" } as Window["location"] }
    );

    const fallback = client.getFallback();

    expect(fallback.pendingAttention).toEqual(
      expect.objectContaining({
        actionRoute: "review-attention",
        actionPath: expect.stringContaining("/review-attention"),
        actionMethod: "POST",
        actionLabel: "Review final assembly",
        requestedAtLabel: "recently",
        recommendedOptionValue: "complete_run",
        requestFields: expect.arrayContaining([
          expect.objectContaining({
            name: "mode",
            suggestedValue: "reopen_deferred"
          })
        ]),
        actionOptions: expect.arrayContaining([
          expect.objectContaining({
            value: "complete_run",
            nextEffectSummary: expect.any(String)
          }),
          expect.objectContaining({
            value: "start_fresh_cycle",
            requiresConfirmation: true
          })
        ])
      })
    );

    expect(fallback.pendingApprovals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionRoute: "proposal-decision",
          actionMethod: "POST",
          actionLabel: "Review proposal decision",
          recommendedOptionValue: "approve",
          policyReasonLabel: "Review for expansion",
          nextReviewTrigger: expect.any(String),
          lastDecisionAtLabel: "recently",
          requestFields: expect.arrayContaining([
            expect.objectContaining({
              name: "decisionNote",
              supportedWhenValue: "defer"
            })
          ]),
          actionOptions: expect.arrayContaining([
            expect.objectContaining({
              value: "approve",
              nextEffectSummary: expect.any(String)
            }),
            expect.objectContaining({
              value: "deny",
              requiresConfirmation: true
            })
          ])
        })
      ])
    );

    expect(fallback.recentDecisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          decisionKind: "lane_opened",
          recommendationSummary: expect.any(String)
        })
      ])
    );

    expect(fallback.followThroughItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "opened_lane",
          persona: "CFO"
        })
      ])
    );

    expect(fallback.completionPackage).toEqual(
      expect.objectContaining({
        status: "assembling",
        deferredApprovalCount: 1,
        hasOpenGovernanceItems: true,
        recommendations: expect.arrayContaining([expect.any(String)]),
        objections: expect.arrayContaining([expect.any(String)]),
        governanceItems: expect.arrayContaining([
          expect.objectContaining({
            persona: "RESEARCHER",
            deliverableLabel: "Research Brief"
          })
        ]),
        deliverables: expect.arrayContaining([
          expect.objectContaining({
            persona: "CFO",
            deliverableLabel: "Pricing Review"
          })
        ])
      })
    );
    expect(fallback.completionPackage?.governanceItems).toHaveLength(1);
    expect(fallback.completionPackage?.deliverables).toHaveLength(2);
  });
});
