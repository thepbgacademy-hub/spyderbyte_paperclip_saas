import { describe, expect, it, vi } from "vitest";

import {
  createHarnessBoardClient,
  HarnessBoardClientError
} from "../apps/web/src/harness-board-client.js";

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
      ok: false,
      status: 500,
      headers: {
        get: vi.fn().mockReturnValue(null)
      },
      json: async () => ({ code: "service_unavailable" })
    });
    const client = createHarnessBoardClient(
      fetchImpl as unknown as typeof fetch,
      { location: { hostname: "app.spyderbyte.cloud" } as Window["location"] }
    );

    await expect(client.fetchBoard()).rejects.toThrow("Unable to load harness board");
    expect(fetchImpl).toHaveBeenCalledWith("/api/harness/board", expect.objectContaining({
      credentials: "include",
      signal: expect.any(AbortSignal)
    }));
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

    expect(fetchImpl).toHaveBeenCalledWith("/api/harness/proposals/proposal_1/decision", expect.objectContaining({
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ decision: "approve" }),
      signal: expect.any(AbortSignal)
    }));
  });

  it("fails closed when a bounded board action request is rejected", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      headers: {
        get: vi.fn().mockReturnValue(null)
      },
      json: async () => ({ code: "conflict" })
    });
    const client = createHarnessBoardClient(
      fetchImpl as unknown as typeof fetch,
      { location: { hostname: "app.spyderbyte.cloud" } as Window["location"] }
    );

    await expect(
      client.submitAction("/api/harness/runs/run_1/review-attention", { decision: "complete_run" })
    ).rejects.toMatchObject({
      name: "HarnessBoardClientError",
      code: "conflict",
      status: 409
    } satisfies Partial<HarnessBoardClientError>);
  });

  it("preserves structured rate-limit details from the live action seam", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: {
        get: vi.fn().mockImplementation((name: string) => (name === "retry-after" ? "7" : null))
      },
      json: async () => ({ code: "rate_limited" })
    });
    const client = createHarnessBoardClient(
      fetchImpl as unknown as typeof fetch,
      { location: { hostname: "app.spyderbyte.cloud" } as Window["location"] }
    );

    await expect(
      client.submitAction("/api/harness/proposals/proposal_1/decision", { decision: "approve" })
    ).rejects.toMatchObject({
      name: "HarnessBoardClientError",
      code: "rate_limited",
      status: 429,
      retryAfterSeconds: 7
    } satisfies Partial<HarnessBoardClientError>);
  });

  it("fails with a bounded timed_out error when the live board load exceeds the request timeout", async () => {
    const fetchImpl = vi.fn().mockImplementation((_input: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        });
      });
    });
    const client = createHarnessBoardClient(
      fetchImpl as unknown as typeof fetch,
      { location: { hostname: "app.spyderbyte.cloud" } as Window["location"] },
      { requestTimeoutMs: 5 }
    );

    await expect(client.fetchBoard()).rejects.toMatchObject({
      name: "HarnessBoardClientError",
      code: "timed_out",
      status: 408
    } satisfies Partial<HarnessBoardClientError>);
  });

  it("fails with a bounded timed_out error when a live board action exceeds the request timeout", async () => {
    const fetchImpl = vi.fn().mockImplementation((_input: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        });
      });
    });
    const client = createHarnessBoardClient(
      fetchImpl as unknown as typeof fetch,
      { location: { hostname: "app.spyderbyte.cloud" } as Window["location"] },
      { requestTimeoutMs: 5 }
    );

    await expect(
      client.submitAction("/api/harness/proposals/proposal_1/decision", { decision: "approve" })
    ).rejects.toMatchObject({
      name: "HarnessBoardClientError",
      code: "timed_out",
      status: 408
    } satisfies Partial<HarnessBoardClientError>);
  });

  it("derives a bounded memory boundary when an older live board payload omits that seam", async () => {
    const previewClient = createHarnessBoardClient(
      fetch,
      { location: { hostname: "127.0.0.1", search: "" } as Window["location"] }
    );
    const { memoryBoundary: _memoryBoundary, ...legacyShape } = previewClient.getFallback();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => legacyShape
    });
    const client = createHarnessBoardClient(
      fetchImpl as unknown as typeof fetch,
      { location: { hostname: "app.spyderbyte.cloud" } as Window["location"] }
    );

    const board = await client.fetchBoard();

    expect(board.memoryBoundary).toEqual(
      expect.objectContaining({
        operationalItems: expect.arrayContaining([
          expect.objectContaining({
            id: "lane_continuity",
            destination: "wealth_factory_runtime",
            readiness: "live_runtime_only"
          })
        ]),
        exportReadyItems: expect.arrayContaining([
          expect.objectContaining({
            id: "governance_decisions",
            destination: "tenant_record_candidate",
            readiness: "ready_now"
          })
        ])
      })
    );
  });

  it("fills missing readiness fields when a staggered live payload includes memoryBoundary without the new item readiness seam", async () => {
    const previewClient = createHarnessBoardClient(
      fetch,
      { location: { hostname: "127.0.0.1", search: "" } as Window["location"] }
    );
    const fallback = previewClient.getFallback();
    const partialBoundary = {
      ...fallback.memoryBoundary,
      operationalItems: fallback.memoryBoundary.operationalItems.map(({ readiness: _readiness, ...item }) => item),
      exportReadyItems: fallback.memoryBoundary.exportReadyItems.map(({ readiness: _readiness, ...item }) => item)
    };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...fallback,
        memoryBoundary: partialBoundary
      })
    });
    const client = createHarnessBoardClient(
      fetchImpl as unknown as typeof fetch,
      { location: { hostname: "app.spyderbyte.cloud" } as Window["location"] }
    );

    const board = await client.fetchBoard();

    expect(board.memoryBoundary.operationalItems[0]?.readiness).toBe("live_runtime_only");
    expect(board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.readiness).toBe(
      "after_board_closes"
    );
  });

  it("keeps the localhost fallback aligned with the bounded board action contract", () => {
    const client = createHarnessBoardClient(
      fetch,
      { location: { hostname: "127.0.0.1", search: "" } as Window["location"] }
    );

    const fallback = client.getFallback();
    const fallbackState = client.getFallbackState();

    expect(fallbackState.controlMode).toBe("preview");
    expect(fallbackState.variant).toBe("review-attention");
    expect(fallbackState.variantLabel).toBe("Final assembly review");
    expect(fallbackState.board).toEqual(fallback);

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
              value: "defer",
              emphasis: "secondary"
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
          persona: "CFO",
          policyReasonLabel: expect.any(String),
          recommendationSummary: expect.any(String)
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
    expect(fallback.memoryBoundary).toEqual(
      expect.objectContaining({
        operationalItems: expect.arrayContaining([
          expect.objectContaining({
            id: "lane_continuity",
            destination: "wealth_factory_runtime",
            readiness: "live_runtime_only"
          })
        ]),
        exportReadyItems: expect.arrayContaining([
          expect.objectContaining({
            id: "governance_decisions",
            destination: "tenant_record_candidate",
            readiness: "ready_now"
          })
        ])
      })
    );
  });

  it("supports a bounded resolve-attention localhost fallback variant for preview-only contract work", () => {
    const client = createHarnessBoardClient(
      fetch,
      { location: { hostname: "127.0.0.1", search: "?harnessPreview=resolve-attention" } as Window["location"] }
    );

    const fallbackState = client.getFallbackState();

    expect(fallbackState.controlMode).toBe("preview");
    expect(fallbackState.variant).toBe("resolve-attention");
    expect(fallbackState.variantLabel).toBe("Lane resume");
    expect(fallbackState.board.pendingAttention).toEqual(
      expect.objectContaining({
        actionRoute: "resolve-attention",
        actionPath: expect.stringContaining("/resolve-attention"),
        actionLabel: "Resume lane",
        allowedCommands: ["resume_lane"],
        targetSummary: expect.stringContaining("Resume CFO lane")
      })
    );
  });

  it("supports a bounded pending-approvals localhost fallback variant for governance-backlog preview work", () => {
    const client = createHarnessBoardClient(
      fetch,
      { location: { hostname: "127.0.0.1", search: "?harnessPreview=pending-approvals" } as Window["location"] }
    );

    const fallbackState = client.getFallbackState();

    expect(fallbackState.controlMode).toBe("preview");
    expect(fallbackState.variant).toBe("pending-approvals");
    expect(fallbackState.variantLabel).toBe("Approval backlog");
    expect(fallbackState.board.pendingAttention).toEqual(
      expect.objectContaining({
        actionRoute: "pending-approvals",
        actionLabel: "Review pending approvals",
        pendingApprovalCount: 1,
        proposedApprovalCount: 1,
        deferredApprovalCount: 0,
        backlogMode: "new_work_waiting",
        reasonLabel: "Governance backlog",
        targetProposalId: "proposal-fallback-1",
        targetStatusLabel: "Pending CEO approval",
        targetSummary: expect.stringContaining("Next queue target: RESEARCHER")
      })
    );
  });
});
