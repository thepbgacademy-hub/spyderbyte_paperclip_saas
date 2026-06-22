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

  it("adds the explicit workflow selector to the live board request when present", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        runId: "run_123",
        workflowId: "wf_tax_strategy",
        packageId: "pkg_tax_strategy",
        columns: [],
        cards: [],
        pendingApprovals: [],
        followThroughItems: [],
        recentDecisions: []
      })
    });
    const client = createHarnessBoardClient(
      fetchImpl as unknown as typeof fetch,
      { location: { hostname: "app.spyderbyte.cloud", search: "?workflowId=wf_tax_strategy" } as Window["location"] }
    );

    await client.fetchBoard();

    expect(fetchImpl).toHaveBeenCalledWith("/api/harness/board?workflowId=wf_tax_strategy", expect.objectContaining({
      credentials: "include",
      signal: expect.any(AbortSignal)
    }));
  });

  it("threads the package-followup workflow selector through the live board request seam", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        runId: "run_123",
        workflowId: "wf_package_followup",
        packageId: "pkg_package_followup",
        columns: [],
        cards: [],
        pendingApprovals: [],
        followThroughItems: [],
        recentDecisions: []
      })
    });
    const client = createHarnessBoardClient(
      fetchImpl as unknown as typeof fetch,
      { location: { hostname: "app.spyderbyte.cloud", search: "?workflowId=wf_package_followup" } as Window["location"] }
    );

    await client.fetchBoard();

    expect(fetchImpl).toHaveBeenCalledWith("/api/harness/board?workflowId=wf_package_followup", expect.objectContaining({
      credentials: "include",
      signal: expect.any(AbortSignal)
    }));
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

  it("keeps live board loads working when an older payload omits memoryBoundary", async () => {
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
    expect(board.runId).toBe(legacyShape.runId);
    expect(board.cards).toEqual(legacyShape.cards);
    expect(board.pendingApprovals).toEqual(legacyShape.pendingApprovals);
    expect(board).not.toHaveProperty("memoryBoundary");
  });

  it("normalizes legacy public board action fields on live payloads", async () => {
    const previewClient = createHarnessBoardClient(
      fetch,
      { location: { hostname: "127.0.0.1", search: "?harnessPreview=resolve-attention" } as Window["location"] }
    );
    const fallback = previewClient.getFallback();
    const legacyShape = {
      ...fallback,
      pendingApprovals: fallback.pendingApprovals.map((approval) => ({
        ...approval,
        actionToken: approval.actionHandle,
        actionHandle: undefined
      })),
      memoryBoundary: {
        ...fallback.memoryBoundary,
        exportCandidates: (fallback.memoryBoundary.exportCandidates ?? []).map((candidate) => ({
          ...candidate,
          exportActions: (candidate.exportActions ?? []).map((action) => ({
            ...action,
            actionToken: action.actionHandle,
            actionHandle: undefined
          }))
        }))
      },
      pendingAttention: fallback.pendingAttention
        ? {
            ...fallback.pendingAttention,
            actionToken: fallback.pendingAttention.actionHandle,
            actionHandle: undefined,
            allowedCommands: fallback.pendingAttention.allowedResolutions,
            allowedResolutions: undefined,
            requestFields: fallback.pendingAttention.requestFields?.map((field) => ({
              ...field,
              name: field.name === "resolution" ? "command" : field.name
            })),
            actionOptions: fallback.pendingAttention.actionOptions?.map((option) => ({
              ...option,
              exampleRequest:
                typeof option.exampleRequest?.resolution === "string"
                  ? { command: option.exampleRequest.resolution }
                  : option.exampleRequest
            }))
          }
        : null
    };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => legacyShape
    });
    const client = createHarnessBoardClient(
      fetchImpl as unknown as typeof fetch,
      { location: { hostname: "app.spyderbyte.cloud" } as Window["location"] }
    );

    const board = await client.fetchBoard();

    expect(board.pendingApprovals[0]?.actionHandle).toBe("preview-proposal-fallback-1");
    expect(board.pendingAttention?.actionHandle).toBe("preview-resolve-attention");
    expect(board.pendingAttention?.allowedResolutions).toEqual(["resume_lane"]);
    expect(board.memoryBoundary.exportCandidates?.[0]?.exportActions?.[0]?.actionHandle).toBe(
      fallback.memoryBoundary.exportCandidates?.[0]?.exportActions?.[0]?.actionHandle
    );
    expect(board.pendingAttention?.requestFields?.some((field) => field.name === "resolution")).toBe(true);
    expect(board.pendingAttention?.actionOptions?.every((option) => !("command" in (option.exampleRequest ?? {})))).toBe(true);
  });
  it("fills missing readiness fields when a reduced live payload still includes memoryBoundary", async () => {
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
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.readinessLabel
    ).toBe("After board closes");
    expect(board.memoryBoundary.exportCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "governance_history_export",
          readinessLabel: "Ready now"
        }),
        expect.objectContaining({
          id: "package_bundle_export",
          readinessLabel: "After board closes"
        })
      ])
    );
  });

  it("keeps a collapsed live memoryBoundary collapsed instead of rebuilding legacy fields", async () => {
    const previewClient = createHarnessBoardClient(
      fetch,
      { location: { hostname: "127.0.0.1", search: "" } as Window["location"] }
    );
    const fallback = previewClient.getFallback();
    const collapsedBoundary = {
      summary: "2 runtime memory buckets stay inside Wealth Factory while 2 export candidates remain bounded for later tenant export.",
      exportCandidates: (fallback.memoryBoundary.exportCandidates ?? []).map((candidate) => ({
        id: candidate.id,
        label: candidate.label,
        itemCount: candidate.itemCount,
        itemIds: candidate.itemIds,
        itemLabels: candidate.itemLabels,
        summary: candidate.summary,
        readiness: candidate.readiness,
        readinessLabel: candidate.readinessLabel,
        eligibilityRule: candidate.eligibilityRule,
        eligibilityRuleLabel: candidate.eligibilityRuleLabel,
        promotionBlocker: candidate.promotionBlocker,
        promotionBlockerLabel: candidate.promotionBlockerLabel,
        promotionState: candidate.promotionState,
        promotionStateLabel: candidate.promotionStateLabel,
        promotionNextStep: candidate.promotionNextStep,
        promotionNextStepLabel: candidate.promotionNextStepLabel,
        syncStrategy: candidate.syncStrategy,
        syncStrategyLabel: candidate.syncStrategyLabel,
        exportConfirmationRequirement: candidate.exportConfirmationRequirement,
        exportConfirmationRequirementLabel: candidate.exportConfirmationRequirementLabel,
        exportRedactionBoundary: candidate.exportRedactionBoundary,
        exportRedactionBoundaryLabel: candidate.exportRedactionBoundaryLabel,
        exportSourceDisclosurePolicy: candidate.exportSourceDisclosurePolicy,
        exportSourceDisclosurePolicyLabel: candidate.exportSourceDisclosurePolicyLabel,
        latestDelivery: candidate.latestDelivery,
        exportActions: candidate.exportActions
      }))
    };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...fallback,
        memoryBoundary: collapsedBoundary
      })
    });
    const client = createHarnessBoardClient(
      fetchImpl as unknown as typeof fetch,
      { location: { hostname: "app.spyderbyte.cloud" } as Window["location"] }
    );

    const board = await client.fetchBoard();

    expect(board.memoryBoundary.summary).toBe(collapsedBoundary.summary);
    expect(board.memoryBoundary.exportCandidates).toEqual(collapsedBoundary.exportCandidates);
    expect(board.memoryBoundary).not.toHaveProperty("operationalItems");
    expect(board.memoryBoundary).not.toHaveProperty("exportReadyItems");
    expect(board.memoryBoundary).not.toHaveProperty("exportSummary");
  });

  it("does not rebuild legacy memoryBoundary fields from a mixed transitional payload", async () => {
    const previewClient = createHarnessBoardClient(
      fetch,
      { location: { hostname: "127.0.0.1", search: "" } as Window["location"] }
    );
    const fallback = previewClient.getFallback();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...fallback,
        memoryBoundary: {
          summary: fallback.memoryBoundary.summary,
          operationalItems: fallback.memoryBoundary.operationalItems
        }
      })
    });
    const client = createHarnessBoardClient(
      fetchImpl as unknown as typeof fetch,
      { location: { hostname: "app.spyderbyte.cloud" } as Window["location"] }
    );

    const board = await client.fetchBoard();

    expect(board.memoryBoundary.summary).toBe(fallback.memoryBoundary.summary);
    expect(board.memoryBoundary.operationalItems).toEqual(fallback.memoryBoundary.operationalItems);
    expect(board.memoryBoundary).not.toHaveProperty("exportReadyItems");
    expect(board.memoryBoundary).not.toHaveProperty("exportSummary");
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
        exportSummary: "2 export candidates are ready now, and 2 still wait for board closure.",
        readyNowCount: 2,
        waitingOnBoardClosureCount: 2
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
        allowedResolutions: ["resume_lane"],
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
