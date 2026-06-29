import { describe, expect, it, vi } from "vitest";

import { createHarnessBoardService } from "../src/harness/board-service.js";
import { createInMemoryHarnessRepository } from "../src/harness/repository.js";
import {
  buildHarnessWorkerDispatch,
  commitHarnessWorkerLaneOutcome
} from "../src/harness/worker-executor.js";
import { createHarnessWorkflowRegistry } from "../src/wealthfactory/workflow-registry.js";

async function expectCreatedCard<
  T extends {
    createTopLevelChildCard(request: {
      authorization: string;
      cookie?: string;
      persona: string;
      title: string;
      deliverableType: string;
    }): Promise<{ cardId: string } | { status: "deferred"; proposalId: string }>;
  }
>(
  promise: ReturnType<T["createTopLevelChildCard"]>
): Promise<{ cardId: string }> {
  const result = await promise;
  if ("status" in result && result.status === "deferred") {
    throw new Error(`Expected created card but received deferred proposal ${result.proposalId}`);
  }
  return result as { cardId: string };
}

function createHarnessLoopTestContext() {
  const tenantId = "tenant_123";
  const workflowId = "wf_connect_first_workflow";
  const repository = createInMemoryHarnessRepository();
  const service = createHarnessBoardService({
    authenticate: vi.fn().mockResolvedValue({
      tenantId,
      userId: "user_123",
      role: "member"
    }),
    requireTenantMember: vi.fn().mockResolvedValue(undefined),
    requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
    repository,
    runAtomically: async (work) => work(repository),
    workflowRegistry: createHarnessWorkflowRegistry({
      harnessEnabledWorkflowIds: [workflowId]
    })
  });

  return {
    repository,
    service,
    tenantId,
    workflowId
  };
}

describe("harness native E2E run loop", () => {
  it("drives one approved lane from board bootstrap through native worker completion and CEO closure", async () => {
    const { repository, service, tenantId, workflowId } = createHarnessLoopTestContext();

    const bootstrappedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    expect(bootstrappedBoard.boardState).toBe("open");
    expect(bootstrappedBoard.cards).toEqual([
      expect.objectContaining({
        persona: "CEO",
        lane: "planning",
        statusLabel: "Planning"
      })
    ]);

    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    const dispatch = await buildHarnessWorkerDispatch({
      repository,
      tenantId,
      runId: bootstrappedBoard.runId,
      workflowId
    });
    expect(dispatch).toEqual(
      expect.objectContaining({
        status: "running",
        laneExecution: expect.objectContaining({
          cardId: created.cardId,
          persona: "cfo",
          state: "working"
        })
      })
    );

    const claimedCard = await repository.getCard(created.cardId);
    expect(claimedCard).toEqual(
      expect.objectContaining({
        state: "working",
        executionClaimToken: expect.any(String)
      })
    );

    await expect(
      commitHarnessWorkerLaneOutcome({
        repository,
        tenantId,
        runId: bootstrappedBoard.runId,
        workflowId,
        cardId: created.cardId,
        executionClaimToken: claimedCard!.executionClaimToken!,
        state: "done",
        resultSummary: "Pricing floor is stable enough for launch."
      })
    ).resolves.toEqual(
      expect.objectContaining({
        status: "committed",
        laneExecution: expect.objectContaining({
          cardId: created.cardId,
          state: "done",
          latestResultSummary: "Pricing floor is stable enough for launch."
        }),
        postOutcomeAction: expect.objectContaining({
          kind: "queue_ceo_review",
          reason: "final_assembly",
          runState: "assembling"
        })
      })
    );

    const reviewBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const actionToken = reviewBoard.pendingAttention?.actionHandle;
    expect(actionToken).toEqual(expect.any(String));
    expect(reviewBoard.pendingAttention).toEqual(
      expect.objectContaining({
        actionRoute: "review-attention",
        reasonLabel: "Final assembly",
        actionHandle: expect.any(String)
      })
    );

    await expect(
      service.reviewPendingAttention({
        authorization: "Bearer valid",
        runId: bootstrappedBoard.runId,
        decision: "complete_run",
        actionToken: actionToken!,
        completionSummary: "The CEO packaged the final business-facing outcome."
      })
    ).resolves.toEqual({
      status: "done",
      runId: bootstrappedBoard.runId
    });

    const completedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    expect(completedBoard.boardState).toBe("closed");
    expect(completedBoard.pendingAttention).toBeUndefined();
    expect(completedBoard.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          persona: "CFO",
          lane: "done",
          statusLabel: "Done"
        })
      ])
    );
    expect(completedBoard.completionPackage).toEqual(
      expect.objectContaining({
        status: "done",
        deliverables: expect.arrayContaining([
          expect.objectContaining({
            cardId: created.cardId,
            persona: "CFO",
            outcome: "Pricing floor is stable enough for launch."
          })
        ])
      })
    );
    expect(completedBoard.memoryBoundary.exportCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "governance_history_export",
          readiness: "ready_now",
          promotionState: "ready_for_tenant_export"
        }),
        expect.objectContaining({
          id: "package_bundle_export",
          readiness: "ready_now",
          promotionState: "ready_for_tenant_export"
        })
      ])
    );
  });

  it("requires CEO review before dispatching the next approved lane and closing the board", async () => {
    const { repository, service, tenantId, workflowId } = createHarnessLoopTestContext();

    const bootstrappedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const pricingLane = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    const messagingLane = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cmo",
      title: "Prepare launch messaging",
      deliverableType: "launch_copy"
    }));

    const firstDispatch = await buildHarnessWorkerDispatch({
      repository,
      tenantId,
      runId: bootstrappedBoard.runId,
      workflowId
    });
    expect(firstDispatch).toEqual(
      expect.objectContaining({
        status: "running",
        dispatchHandoff: expect.objectContaining({
          kind: "initial_claim"
        }),
        laneExecution: expect.objectContaining({
          cardId: pricingLane.cardId,
          persona: "cfo",
          state: "working"
        })
      })
    );

    const claimedPricingLane = await repository.getCard(pricingLane.cardId);
    expect(claimedPricingLane?.executionClaimToken).toEqual(expect.any(String));
    await expect(
      commitHarnessWorkerLaneOutcome({
        repository,
        tenantId,
        runId: bootstrappedBoard.runId,
        workflowId,
        cardId: pricingLane.cardId,
        executionClaimToken: claimedPricingLane!.executionClaimToken!,
        state: "done",
        resultSummary: "Pricing floor is stable enough for launch."
      })
    ).resolves.toEqual(
      expect.objectContaining({
        status: "committed",
        postOutcomeAction: expect.objectContaining({
          kind: "queue_ceo_review",
          reason: "next_lane_decision",
          nextCardId: messagingLane.cardId,
          runState: "active"
        })
      })
    );

    const nextLaneReviewBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const nextLaneActionToken = nextLaneReviewBoard.pendingAttention?.actionHandle;
    expect(nextLaneActionToken).toEqual(expect.any(String));
    expect(nextLaneReviewBoard.pendingAttention).toEqual(
      expect.objectContaining({
        actionRoute: "review-attention",
        recommendedOptionValue: "start_next_lane",
        reasonLabel: "Next lane decision",
        actionHandle: expect.any(String)
      })
    );

    await expect(
      buildHarnessWorkerDispatch({
        repository,
        tenantId,
        runId: bootstrappedBoard.runId,
        workflowId
      })
    ).resolves.toEqual({
      runId: bootstrappedBoard.runId,
      workflowId,
      status: "queued",
      laneExecution: null
    });
    await expect(repository.getCard(messagingLane.cardId)).resolves.toEqual(
      expect.objectContaining({
        state: "approved",
        executionClaimToken: null
      })
    );

    await expect(
      service.reviewPendingAttention({
        authorization: "Bearer valid",
        runId: bootstrappedBoard.runId,
        decision: "start_next_lane",
        actionToken: nextLaneActionToken!
      })
    ).resolves.toEqual({
      status: "next_lane_started",
      runId: bootstrappedBoard.runId,
      cardId: messagingLane.cardId,
      state: "working"
    });

    const claimedMessagingLane = await repository.getCard(messagingLane.cardId);
    expect(claimedMessagingLane).toEqual(
      expect.objectContaining({
        state: "working",
        executionClaimToken: expect.any(String)
      })
    );
    await expect(
      commitHarnessWorkerLaneOutcome({
        repository,
        tenantId,
        runId: bootstrappedBoard.runId,
        workflowId,
        cardId: messagingLane.cardId,
        executionClaimToken: claimedMessagingLane!.executionClaimToken!,
        state: "done",
        resultSummary: "Launch messaging is ready for tenant review."
      })
    ).resolves.toEqual(
      expect.objectContaining({
        status: "committed",
        postOutcomeAction: expect.objectContaining({
          kind: "queue_ceo_review",
          reason: "final_assembly",
          runState: "assembling"
        })
      })
    );

    const finalAssemblyBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const finalAssemblyActionToken = finalAssemblyBoard.pendingAttention?.actionHandle;
    expect(finalAssemblyActionToken).toEqual(expect.any(String));
    expect(finalAssemblyBoard.pendingAttention).toEqual(
      expect.objectContaining({
        actionRoute: "review-attention",
        reasonLabel: "Final assembly"
      })
    );

    await expect(
      service.reviewPendingAttention({
        authorization: "Bearer valid",
        runId: bootstrappedBoard.runId,
        decision: "complete_run",
        actionToken: finalAssemblyActionToken!,
        completionSummary: "The CEO accepted both completed lanes and packaged the board."
      })
    ).resolves.toEqual({
      status: "done",
      runId: bootstrappedBoard.runId
    });

    const completedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    expect(completedBoard.boardState).toBe("closed");
    expect(completedBoard.completionPackage).toEqual(
      expect.objectContaining({
        status: "done",
        deliverables: expect.arrayContaining([
          expect.objectContaining({
            cardId: pricingLane.cardId,
            persona: "CFO",
            outcome: "Pricing floor is stable enough for launch."
          }),
          expect.objectContaining({
            cardId: messagingLane.cardId,
            persona: "CMO",
            outcome: "Launch messaging is ready for tenant review."
          })
        ])
      })
    );
    expect(completedBoard.memoryBoundary.exportCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "governance_history_export",
          readiness: "ready_now"
        }),
        expect.objectContaining({
          id: "package_bundle_export",
          readiness: "ready_now"
        })
      ])
    );
  });
});
