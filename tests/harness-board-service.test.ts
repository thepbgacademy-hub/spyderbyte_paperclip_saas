import { describe, expect, it, vi } from "vitest";

import { ApiAuthError } from "../src/api/dashboard-api.js";
import {
  ActivePackageInstallRequiredError,
  TenantMembershipRequiredError
} from "../src/db/supabase-repositories.js";
import {
  HarnessActionContractConflictError,
  HarnessCardCreationConflictError,
  HarnessCardProgressionConflictError,
  type HarnessGovernanceHistoryExportReadyDispatch,
  HarnessRunCompletionConflictError,
  createHarnessBoardService
} from "../src/harness/board-service.js";
import { createInMemoryHarnessRepository } from "../src/harness/repository.js";
import { createHarnessBoardDecisionRecord } from "../src/harness/types.js";
import { createHarnessWorkflowRegistry } from "../src/wealthfactory/workflow-registry.js";


async function expectCreatedCard<T extends { createTopLevelChildCard(request: { authorization: string; cookie?: string; persona: string; title: string; deliverableType: string }): Promise<{ cardId: string } | { status: "deferred"; proposalId: string }> }>(
  promise: ReturnType<T["createTopLevelChildCard"]>
): Promise<{ cardId: string }> {
  const result = await promise;
  if ("status" in result && result.status === "deferred") {
    throw new Error(`Expected created card but received deferred proposal ${result.proposalId}`);
  }
  return result as { cardId: string };
}

describe("harness board service", () => {
  it("bootstraps and persists a tenant-scoped harness board from guarded auth", async () => {
    const repository = createInMemoryHarnessRepository();
    const authenticate = vi.fn().mockResolvedValue({
      tenantId: "tenant_123",
      userId: "user_123",
      role: "member"
    });
    const requireTenantMember = vi.fn().mockResolvedValue(undefined);
    const requireActivePackageInstall = vi.fn().mockResolvedValue(undefined);
    const service = createHarnessBoardService({
      authenticate,
      requireTenantMember,
      requireActivePackageInstall,
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });

    expect(board.workflowId).toBe("wf_connect_first_workflow");
    expect(board.packageId).toBe("pkg_bib_connect");
    expect(board.columns.map((column) => column.id)).toEqual(["planning", "working", "waiting", "blocked", "done"]);
    expect(board.pendingApprovals).toEqual([]);
    expect(board.cards).toHaveLength(1);
    expect(board.cards.some((card) => card.persona === "CEO")).toBe(true);
    expect(board.cards.every((card) => card.persona === "CEO")).toBe(true);
    expect(requireTenantMember).toHaveBeenCalledWith({ tenantId: "tenant_123", userId: "user_123" });
    expect(requireActivePackageInstall).toHaveBeenCalledWith({
      tenantId: "tenant_123",
      packageId: "pkg_bib_connect"
    });

    const persistedRun = await repository.findLatestRunForTenantWorkflow({
      tenantId: "tenant_123",
      workflowId: "wf_connect_first_workflow"
    });
    expect(persistedRun?.state).toBe("active");
    await expect(repository.listCardsForRun(board.runId)).resolves.toHaveLength(1);
    await expect(repository.listEventsForRun(board.runId)).resolves.toHaveLength(2);
  });

  it("reuses the persisted board instead of reseeding duplicate runs", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const firstBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const secondBoard = await service.listBoardState({ authorization: "Bearer valid" });

    expect(secondBoard.runId).toBe(firstBoard.runId);
    await expect(repository.listCardsForRun(firstBoard.runId)).resolves.toHaveLength(1);
  });

  it("fails closed when the harness workflow is not enabled or the session is invalid", async () => {
    const unauthorizedService = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue(null),
      requireTenantMember: vi.fn(),
      requireActivePackageInstall: vi.fn(),
      repository: createInMemoryHarnessRepository(),
      runAtomically: async (work) => work(createInMemoryHarnessRepository()),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await expect(unauthorizedService.listBoardState({ authorization: "" })).rejects.toBeInstanceOf(ApiAuthError);

    const disabledService = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository: createInMemoryHarnessRepository(),
      runAtomically: async (work) => work(createInMemoryHarnessRepository()),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: []
      })
    });

    await expect(disabledService.listBoardState({ authorization: "Bearer valid" })).rejects.toThrow(
      /Harness workflow is not enabled/
    );
  });

  it("fails closed when multiple harness workflows are exposed without an explicit selector", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: {
        listHarnessEligibleWorkflowIds: () => ["wf_connect_first_workflow", "wf_package_followup"],
        getDefinition: vi.fn()
      }
    });

    await expect(service.listBoardState({ authorization: "Bearer valid" })).rejects.toThrow(
      /Harness workflow selector is ambiguous/
    );
  });

  it("fails closed when the tenant lacks the required package boundary", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockRejectedValue(new ActivePackageInstallRequiredError()),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await expect(service.listBoardState({ authorization: "Bearer valid" })).rejects.toBeInstanceOf(ApiAuthError);
  });

  it("fails closed when tenant membership is missing but keeps infrastructure errors visible", async () => {
    const missingMembershipRepository = createInMemoryHarnessRepository();
    const missingMembershipService = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockRejectedValue(new TenantMembershipRequiredError()),
      requireActivePackageInstall: vi.fn(),
      repository: missingMembershipRepository,
      runAtomically: async (work) => work(missingMembershipRepository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await expect(missingMembershipService.listBoardState({ authorization: "Bearer valid" })).rejects.toBeInstanceOf(
      ApiAuthError
    );

    const unavailableRepository = createInMemoryHarnessRepository();
    const unavailableDatabaseService = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockRejectedValue(new Error("database unavailable")),
      requireActivePackageInstall: vi.fn(),
      repository: unavailableRepository,
      runAtomically: async (work) => work(unavailableRepository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await expect(unavailableDatabaseService.listBoardState({ authorization: "Bearer valid" })).rejects.toThrow(
      "database unavailable"
    );
  });

  it("surfaces persisted CEO approvals and converts approval into a queued child card", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    const createdContinuity = await repository.getCardContinuity(created.cardId);

    expect(createdContinuity).toEqual(
      expect.objectContaining({
        cardId: created.cardId,
        continuitySummary: 'CFO should begin this approved pricing review lane: Pressure-test the pricing lane.'
      })
    );

    await repository.insertProposal({
      id: "proposal_approval_1",
      runId: board.runId,
      parentCardId: created.cardId,
      requestedByCardId: created.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief",
      status: "proposed"
    });

    const hydrated = await service.listBoardState({ authorization: "Bearer valid" });
    expect(hydrated.pendingApprovals).toEqual([
      expect.objectContaining({
        id: "proposal_approval_1",
        requestedByPersona: "CFO",
        targetPersona: "RESEARCHER",
        statusLabel: "Pending CEO approval",
        actionRoute: "proposal-decision",
        actionPath: "/api/harness/proposals/proposal_approval_1/decision",
        actionMethod: "POST",
        actionLabel: "Review proposal decision",
        actionDescription: "Choose whether this proposed follow-on work should be approved, deferred, or denied.",
        requestFields: [
          {
            name: "decision",
            label: "Proposal decision",
            description: "Choose whether this proposed follow-on work should be approved, deferred, or denied.",
            required: true,
            allowedValues: ["approve", "defer", "deny"]
          },
          {
            name: "decisionNote",
            label: "Decision note",
            description: "Optional bounded note explaining the decision or what should change before review resumes.",
            required: false
          }
        ],
        actionOptions: [
          {
            value: "approve",
            label: "Approve proposal",
            description: "Approve this work so it can move into the bounded execution flow.",
            emphasis: "primary",
            nextEffectSummary: "This proposal can move into the bounded execution flow and open or advance the intended lane.",
            exampleRequest: { decision: "approve" }
          },
          {
            value: "defer",
            label: "Defer proposal",
            description: "Pause this follow-on work without dropping it so the CEO can revisit it later.",
            emphasis: "secondary",
            nextEffectSummary: "This proposal stays visible in the pending-approval queue for later CEO review.",
            exampleRequest: { decision: "defer" }
          },
          {
            value: "deny",
            label: "Deny proposal",
            description: "Reject this follow-on work when it should not expand the current board cycle.",
            emphasis: "caution",
            nextEffectSummary: "This proposal closes without opening or advancing any new work lane.",
            requiresConfirmation: true,
            confirmationLabel: "Deny this proposal and close the follow-on request?",
            exampleRequest: { decision: "deny" }
          }
        ],
        recommendedOptionValue: "approve",
        allowedDecisions: ["approve", "defer", "deny"]
      })
    ]);

    const approval = await service.approveProposal({
      authorization: "Bearer valid",
      proposalId: "proposal_approval_1"
    });

    const afterApproval = await service.listBoardState({ authorization: "Bearer valid" });
    expect(approval.cardId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(afterApproval.pendingApprovals).toEqual([]);
    expect(afterApproval.cards.some((card) => card.id === approval.cardId && card.persona === "RESEARCHER")).toBe(true);
  });

  it("treats repeated approval of the same proposal as idempotent", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertProposal({
      id: "proposal_repeat_1",
      runId: board.runId,
      parentCardId: created.cardId,
      requestedByCardId: created.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Validate renewal assumptions",
      deliverableType: "research_brief",
      status: "proposed"
    });

    const firstApproval = await service.approveProposal({
      authorization: "Bearer valid",
      proposalId: "proposal_repeat_1"
    });
    const secondApproval = await service.approveProposal({
      authorization: "Bearer valid",
      proposalId: "proposal_repeat_1"
    });

    const cards = await repository.listCardsForRun(board.runId);
    const researcherCards = cards.filter((card) => card.persona === "researcher");

    expect(secondApproval.cardId).toBe(firstApproval.cardId);
    expect(researcherCards).toHaveLength(1);
    expect(researcherCards[0]?.id).toBe(firstApproval.cardId);
  });

  it("surfaces bounded recent board decisions without exposing backend chatter", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    const board = await service.listBoardState({ authorization: "Bearer valid" });

    expect(board.recentDecisions).toEqual([
      expect.objectContaining({
        decisionKind: "lane_opened",
        label: "CEO opened a new pricing review lane for CFO.",
        resolution: "create_lane",
        policyReasonLabel: "New lane approved",
        recommendationSummary: "Open a dedicated pricing review lane for CFO."
      })
    ]);
    expect(JSON.stringify(board.recentDecisions)).not.toMatch(/tool|prompt|internal|secret/i);
  });

  it("surfaces a bounded pending-attention view when the board is waiting on a lane resume", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "waiting",
      resumeSummary: "CFO should resume this lane once the tenant confirms the latest revenue assumption."
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });

    expect(board.pendingAttention).toEqual({
      kind: "await_lane_resume",
      runState: "waiting",
      statusLabel: "Waiting on lane resume",
      summary: "CFO should resume this lane once the tenant confirms the latest revenue assumption.",
      actionRoute: "resolve-attention",
      actionPath: `/api/harness/runs/${board.runId}/resolve-attention`,
      actionToken: expect.any(String),
      actionMethod: "POST",
      actionLabel: "Resume lane",
      actionDescription: "Resume the waiting lane when the required board input is ready.",
      requestFields: [
        {
          name: "command",
          label: "Resolution command",
          description: "Choose the single bounded command that resolves this attention state.",
          required: true,
          allowedValues: ["resume_lane"]
        },
        {
          name: "resumeSummary",
          label: "Resume summary",
          description: "Optional tenant-safe note describing what changed before execution resumes.",
          required: false
        }
      ],
      actionOptions: [
        {
          value: "resume_lane",
          label: "Resume lane",
          description: "Return the lane to active execution with an optional bounded resume note.",
          emphasis: "primary",
          nextEffectSummary: "The lane returns to active execution and re-enters the worker queue through the existing harness path.",
          exampleRequest: { command: "resume_lane" }
        }
      ],
      recommendedOptionValue: "resume_lane",
      allowedCommands: ["resume_lane"],
      targetCardId: created.cardId,
      targetPersona: "CFO",
      targetTitle: "Pressure-test the pricing lane",
      targetSummary: "Resume CFO lane: Pressure-test the pricing lane"
    });
  });

  it("prefers persisted attention-requested snapshot metadata when hydrating pendingAttention", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "waiting",
      resumeSummary: "Current continuity summary should not leak into pendingAttention."
    });
    await repository.insertEvent({
      id: "event_attention_requested_snapshot",
      cardId: created.cardId,
      eventKind: "attention_requested",
      payload: {
        actionKind: "await_lane_resume",
        runState: "waiting",
        targetCardId: created.cardId,
        statusLabel: "Awaiting board packet",
        summary: "Use the persisted snapshot summary for tenant-safe pending attention.",
        targetPersona: "ANALYST",
        targetTitle: "Persisted handoff lane"
      },
      createdAt: "2026-05-24T20:10:00.000Z"
    });
    await repository.updateCardAssignment({
      cardId: created.cardId,
      persona: "researcher",
      title: "Current lane title should not replace the snapshot"
    });
    await repository.upsertCardContinuity({
      cardId: created.cardId,
      runId: (await repository.getCard(created.cardId))!.runId,
      continuitySource: "resume_override",
      continuitySummary: "Current continuity summary should not leak into pendingAttention.",
      latestResultSummary: null,
      absorbedWorkItems: [],
      updatedAt: "2026-05-24T20:11:00.000Z"
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });

    expect(board.pendingAttention).toEqual(
      expect.objectContaining({
        kind: "await_lane_resume",
        runState: "waiting",
        statusLabel: "Awaiting board packet",
        summary: "Use the persisted snapshot summary for tenant-safe pending attention.",
        actionRoute: "resolve-attention",
        actionPath: `/api/harness/runs/${board.runId}/resolve-attention`,
        actionMethod: "POST",
        actionLabel: "Resume lane",
        actionDescription: "Resume the waiting lane when the required board input is ready.",
        requestFields: [
          {
            name: "command",
            label: "Resolution command",
            description: "Choose the single bounded command that resolves this attention state.",
            required: true,
            allowedValues: ["resume_lane"]
          },
          {
            name: "resumeSummary",
            label: "Resume summary",
            description: "Optional tenant-safe note describing what changed before execution resumes.",
            required: false
          }
        ],
        actionOptions: [
          {
            value: "resume_lane",
            label: "Resume lane",
            description: "Return the lane to active execution with an optional bounded resume note.",
            emphasis: "primary",
            nextEffectSummary: "The lane returns to active execution and re-enters the worker queue through the existing harness path.",
            exampleRequest: { command: "resume_lane" }
          }
        ],
        recommendedOptionValue: "resume_lane",
        allowedCommands: ["resume_lane"],
        targetCardId: created.cardId,
        targetPersona: "ANALYST",
        targetTitle: "Persisted handoff lane",
        targetSummary: "Resume ANALYST lane: Persisted handoff lane"
      })
    );
    expect(JSON.stringify(board.pendingAttention)).not.toContain(
      "Current continuity summary should not leak into pendingAttention."
    );
  });

  it("surfaces a bounded CEO review attention view when completed work is ready for final assembly", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });

    expect(board.pendingAttention).toEqual({
      kind: "queue_ceo_review",
      runState: "assembling",
      statusLabel: "CEO review required",
      summary: "The board is ready for final assembly before the tenant-facing package is closed.",
      actionRoute: "review-attention",
      actionPath: `/api/harness/runs/${board.runId}/review-attention`,
      actionToken: expect.any(String),
      actionMethod: "POST",
      actionLabel: "Review final assembly",
      actionDescription: "Finish the current board cycle or intentionally start the next one.",
      requestFields: [
        {
          name: "decision",
          label: "Review decision",
          description: "Choose whether to close the current board cycle or start the next one.",
          required: true,
          allowedValues: ["complete_run", "start_fresh_cycle"]
        },
        {
          name: "completionSummary",
          label: "Completion summary",
          description: "Optional tenant-facing summary to package with the completed run.",
          required: false,
          requiredWhenValue: "complete_run"
        },
        {
          name: "mode",
          label: "Fresh-cycle mode",
          description: "Choose whether the next cycle should reopen deferred work or start clean.",
          required: false,
          supportedWhenValue: "start_fresh_cycle",
          allowedValues: ["reopen_deferred", "clean"]
        }
      ],
      actionOptions: [
        {
          value: "complete_run",
          label: "Complete run",
          description: "Close the current board cycle and package the current business outcome.",
          emphasis: "primary",
          nextEffectSummary: "The current run closes as done and the tenant-facing package stays on this board cycle.",
          exampleRequest: { decision: "complete_run" }
        },
        {
          value: "start_fresh_cycle",
          label: "Start fresh cycle",
          description: "Open the next board cycle from this run, with or without reopening deferred work.",
          emphasis: "secondary",
          nextEffectSummary: "A new run starts from this board, optionally carrying deferred follow-on work into the next cycle.",
          requiresConfirmation: true,
          confirmationLabel: "Start a new board cycle from this run?",
          exampleRequest: { decision: "start_fresh_cycle", mode: "reopen_deferred" }
        }
      ],
      recommendedOptionValue: "complete_run",
      allowedDecisions: ["complete_run", "start_fresh_cycle"],
      reasonLabel: "Final assembly"
    });
  });

  it("keeps governance-backlog CEO attention visible without advertising explicit review commands", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const cards = await repository.listCardsForRun(board.runId);
    const ceoCard = cards.find((card) => card.persona === "ceo");
    await repository.insertProposal({
      id: "proposal_governance_backlog_1",
      runId: board.runId,
      parentCardId: ceoCard!.id,
      requestedByCardId: ceoCard!.id,
      requestedByPersona: "ceo",
      persona: "researcher",
      title: "Investigate market signals before another lane opens",
      deliverableType: "research_brief",
      status: "proposed"
    });

    const hydrated = await service.listBoardState({ authorization: "Bearer valid" });

    expect(hydrated.pendingAttention).toEqual({
      kind: "queue_ceo_review",
      runState: "active",
      statusLabel: "CEO review required",
      summary: "The board needs CEO review because deferred governance is now the next bounded move.",
      actionRoute: "pending-approvals",
      actionLabel: "Review pending approvals",
      actionDescription: "Open the proposal review queue to clear governance backlog before more work starts.",
      pendingApprovalCount: 1,
      proposedApprovalCount: 1,
      deferredApprovalCount: 0,
      backlogMode: "new_work_waiting",
      reasonLabel: "Governance backlog",
      targetProposalId: "proposal_governance_backlog_1",
      targetStatusLabel: "Pending CEO approval",
      targetPersona: "RESEARCHER",
      targetTitle: "Investigate market signals before another lane opens",
      targetSummary: "Next queue target: RESEARCHER · Investigate market signals before another lane opens"
    });
  });

  it("keeps blocked governance-hold attention visible without advertising explicit review commands", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "blocked"
    });
    await repository.insertProposal({
      id: "proposal_governance_hold_1",
      runId: board.runId,
      parentCardId: created.cardId,
      requestedByCardId: created.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Compare alternate pricing anchors",
      deliverableType: "research_brief",
      status: "deferred",
      decisionNote: "Wait until lane pressure clears."
    });

    const hydrated = await service.listBoardState({ authorization: "Bearer valid" });

    expect(hydrated.pendingAttention).toEqual({
      kind: "queue_ceo_review",
      runState: "blocked",
      statusLabel: "CEO review required",
      summary: "The board needs CEO review because governance work is still shaping what can move next.",
      actionRoute: "pending-approvals",
      actionLabel: "Review pending approvals",
      actionDescription: "Open the proposal review queue to clear governance backlog before more work starts.",
      pendingApprovalCount: 1,
      proposedApprovalCount: 0,
      deferredApprovalCount: 1,
      backlogMode: "carry_forward_review",
      reasonLabel: "Governance hold",
      targetProposalId: "proposal_governance_hold_1",
      targetStatusLabel: "Deferred for later CEO review",
      targetPersona: "RESEARCHER",
      targetTitle: "Compare alternate pricing anchors",
      targetSummary: "Next queue target: RESEARCHER · Compare alternate pricing anchors"
    });
  });

  it("reports mixed backlog composition when proposed and deferred approvals coexist", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const cards = await repository.listCardsForRun(board.runId);
    const ceoCard = cards.find((card) => card.persona === "ceo");
    await repository.insertProposal({
      id: "proposal_governance_mixed_2",
      runId: board.runId,
      parentCardId: ceoCard!.id,
      requestedByCardId: ceoCard!.id,
      requestedByPersona: "ceo",
      persona: "cfo",
      title: "Revisit an earlier pricing objection",
      deliverableType: "pricing_review",
      status: "deferred"
    });
    await repository.insertProposal({
      id: "proposal_governance_mixed_1",
      runId: board.runId,
      parentCardId: ceoCard!.id,
      requestedByCardId: ceoCard!.id,
      requestedByPersona: "ceo",
      persona: "researcher",
      title: "Gather fresh competitor price anchors",
      deliverableType: "research_brief",
      status: "proposed"
    });

    const hydrated = await service.listBoardState({ authorization: "Bearer valid" });

    expect(hydrated.pendingAttention).toEqual(
      expect.objectContaining({
        actionRoute: "pending-approvals",
        pendingApprovalCount: 2,
        proposedApprovalCount: 1,
        deferredApprovalCount: 1,
        backlogMode: "mixed_backlog",
        targetProposalId: "proposal_governance_mixed_1",
        targetStatusLabel: "Pending CEO approval"
      })
    );
  });

  it("keeps historical attention activity but clears pendingAttention after an explicit resolution", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "waiting",
      resumeSummary: "CFO should resume this lane once the tenant confirms the latest revenue assumption."
    });
    await repository.insertEvent({
      id: "event_attention_resolved",
      cardId: created.cardId,
      eventKind: "attention_resolved",
      payload: {
        actionKind: "await_lane_resume",
        runState: "waiting",
        targetCardId: created.cardId
      },
      createdAt: "2026-05-24T20:20:00.000Z"
    });
    await repository.updateRunState({
      runId: board.runId,
      state: "active"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });

    const hydrated = await service.listBoardState({ authorization: "Bearer valid" });

    expect(hydrated.pendingAttention).toBeUndefined();
    expect(hydrated.cards.find((card) => card.id === created.cardId)?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Board attention no longer needs a lane resume decision."
        })
      ])
    );
  });

  it("resolves CEO review attention by completing the run through the explicit review seam", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });

    const reviewed = await service.reviewPendingAttention({
      authorization: "Bearer valid",
      runId: board.runId,
      decision: "complete_run",
      completionSummary: "The CEO accepted the completed board output and packaged it."
    });

    const run = await repository.findLatestRunForTenantWorkflow({
      tenantId: "tenant_123",
      workflowId: "wf_connect_first_workflow"
    });
    const ceoCard = (await repository.listCardsForRun(board.runId)).find((card) => card.persona === "ceo");
    const ceoEvents = await repository.listEventsForCard(ceoCard!.id);

    expect(reviewed).toEqual({
      status: "done",
      runId: board.runId
    });
    expect(run?.state).toBe("done");
    expect(ceoEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventKind: "attention_resolved",
          payload: expect.objectContaining({
            actionKind: "queue_ceo_review",
            runState: "assembling",
            reason: "final_assembly"
          })
        })
      ])
    );
  });

  it("fails closed when explicit CEO review completion carries a stale action token", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });

    const assemblingBoard = await service.listBoardState({ authorization: "Bearer valid" });

    await expect(
      service.reviewPendingAttention({
        authorization: "Bearer valid",
        runId: board.runId,
        decision: "complete_run",
        actionToken: `${assemblingBoard.pendingAttention?.actionToken ?? "missing"}-stale`,
        completionSummary: "This should fail because the contract token is stale."
      })
    ).rejects.toThrow(/action token no longer matches/i);
  });

  it("resolves CEO review attention by starting a fresh cycle through the explicit review seam", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });
    await repository.insertProposal({
      id: "proposal_fresh_cycle_review_1",
      runId: board.runId,
      parentCardId: created.cardId,
      requestedByCardId: created.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief",
      status: "deferred",
      decisionNote: "Review again when the current cycle closes."
    });
    await repository.insertDecision({
      id: "decision_fresh_cycle_review_1",
      runId: board.runId,
      tenantId: "tenant_123",
      actorUserId: "user_123",
      decisionKind: "proposal_deferred",
      cardId: created.cardId,
      proposalId: "proposal_fresh_cycle_review_1",
      targetCardId: null,
      persona: "researcher",
      deliverableType: "research_brief",
      policyReason: "completed_lanes_only",
      resolution: null,
      decisionNote: "Review again when the current cycle closes.",
      recommendationSummary: "Start a new board cycle before reopening this research brief request.",
      objectionSummary: "Keep this follow-on work out of the completed cycle package.",
      createdAt: new Date().toISOString()
    });

    const reviewed = await service.reviewPendingAttention({
      authorization: "Bearer valid",
      runId: board.runId,
      decision: "start_fresh_cycle",
      mode: "reopen_deferred"
    });
    const ceoCard = (await repository.listCardsForRun(board.runId)).find((card) => card.persona === "ceo");
    const ceoEvents = await repository.listEventsForCard(ceoCard!.id);

    expect(reviewed).toEqual({
      status: "fresh_cycle_started",
      runId: expect.any(String),
      reopenedProposalCount: 1
    });
    expect(reviewed.runId).not.toBe(board.runId);
    expect(ceoEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventKind: "attention_resolved",
          payload: expect.objectContaining({
            actionKind: "queue_ceo_review",
            runState: "assembling",
            reason: "governance_hold"
          })
        })
      ])
    );
  });

  it("fails closed when a fresh-cycle review token is reused after a newer cycle already exists", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });

    const assemblingBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const actionToken = assemblingBoard.pendingAttention?.actionToken;
    expect(actionToken).toEqual(expect.any(String));

    const freshCycle = await service.reviewPendingAttention({
      authorization: "Bearer valid",
      runId: board.runId,
      decision: "start_fresh_cycle",
      actionToken: actionToken!,
      mode: "clean"
    });
    expect(freshCycle.status).toBe("fresh_cycle_started");

    await expect(
      service.completeRun({
        authorization: "Bearer valid",
        runId: board.runId,
        actionToken: actionToken!,
        completionSummary: "This should fail because a newer board cycle already exists."
      })
    ).rejects.toThrow(/latest board cycle/i);
  });

  it("fails closed when explicit review is attempted without pending CEO attention", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "waiting",
      resumeSummary: "Wait for the tenant to confirm the revised revenue assumption."
    });

    await expect(
      service.reviewPendingAttention({
        authorization: "Bearer valid",
        runId: board.runId,
        decision: "complete_run",
        completionSummary: "This should fail because the run is not awaiting CEO review."
      })
    ).rejects.toThrow(/not waiting on CEO review/i);
  });

  it("resolves pending lane-resume attention through the explicit attention seam", async () => {
    const repository = createInMemoryHarnessRepository();
    const onResolvedAttentionDispatch = vi.fn().mockResolvedValue(undefined);
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      onResolvedAttentionDispatch,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "waiting",
      resumeSummary: "Pause until the tenant confirms the revised revenue assumption."
    });

    const resolved = await service.resolvePendingAttention({
      authorization: "Bearer valid",
      runId: board.runId,
      command: "resume_lane",
      resumeSummary: "Resume with the confirmed revenue assumption."
    });

    const persistedCard = await repository.getCard(created.cardId);
    const hydrated = await service.listBoardState({ authorization: "Bearer valid" });

    expect(resolved).toEqual({
      status: "resumed",
      cardId: created.cardId,
      state: "working"
    });
    expect(onResolvedAttentionDispatch).toHaveBeenCalledWith({
      tenantId: "tenant_123",
      userId: "user_123",
      runId: board.runId,
      workflowId: "wf_connect_first_workflow",
      cardId: created.cardId,
      command: "resume_lane",
      state: "working"
    });
    expect(persistedCard?.state).toBe("working");
    expect(hydrated.pendingAttention).toBeUndefined();
  });

  it("resolves pending lane-unblock attention through the explicit attention seam", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "blocked"
    });

    const resolved = await service.resolvePendingAttention({
      authorization: "Bearer valid",
      runId: board.runId,
      command: "unblock_lane",
      resumeSummary: "The blocker is cleared and the lane can re-enter the board queue."
    });

    const persistedCard = await repository.getCard(created.cardId);
    const hydrated = await service.listBoardState({ authorization: "Bearer valid" });

    expect(resolved).toEqual({
      status: "unblocked",
      cardId: created.cardId,
      state: "approved"
    });
    expect(persistedCard?.state).toBe("approved");
    expect(hydrated.pendingAttention).toBeUndefined();
  });

  it("fails closed when explicit attention resolution does not match the active attention kind", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "waiting",
      resumeSummary: "Pause until the tenant confirms the revised revenue assumption."
    });

    await expect(
      service.resolvePendingAttention({
        authorization: "Bearer valid",
        runId: board.runId,
        command: "unblock_lane"
      })
    ).rejects.toThrow(/not waiting on that attention command/i);
  });

  it("prefers persisted attention-resolved snapshot metadata in historical activity", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "waiting",
      resumeSummary: "This newer resume summary should not replace the resolved snapshot in history."
    });
    await repository.insertEvent({
      id: "event_attention_requested_snapshot_history",
      cardId: created.cardId,
      eventKind: "attention_requested",
      payload: {
        actionKind: "await_lane_resume",
        runState: "waiting",
        targetCardId: created.cardId,
        statusLabel: "Awaiting board packet",
        summary: "Persisted attention summary should stay attached to the historical resolution.",
        targetPersona: "CFO",
        targetTitle: "Original persisted lane"
      },
      createdAt: "2026-05-24T20:20:00.000Z"
    });
    await repository.insertEvent({
      id: "event_attention_resolved_snapshot_history",
      cardId: created.cardId,
      eventKind: "attention_resolved",
      payload: {
        actionKind: "await_lane_resume",
        runState: "waiting",
        targetCardId: created.cardId,
        statusLabel: "Awaiting board packet",
        summary: "Persisted attention summary should stay attached to the historical resolution.",
        targetPersona: "CFO",
        targetTitle: "Original persisted lane"
      },
      createdAt: "2026-05-24T20:21:00.000Z"
    });
    await repository.updateRunState({
      runId: board.runId,
      state: "active"
    });
    await repository.updateCardAssignment({
      cardId: created.cardId,
      persona: "researcher",
      title: "Current lane title should not replace historical attention labels"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Awaiting board packet resolved: Persisted attention summary should stay attached to the historical resolution."
        })
      ])
    );
    expect(JSON.stringify(hydratedCard?.activity)).not.toContain(
      "Board attention no longer needs a lane resume decision."
    );
  });

  it("keeps governance-backlog attention-requested history explicit without a persisted snapshot", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const ceoCard = (await repository.listCardsForRun(board.runId)).find((card) => card.persona === "ceo");
    expect(ceoCard).toBeTruthy();

    await repository.insertEvent({
      id: "event_attention_requested_governance_backlog",
      cardId: ceoCard!.id,
      eventKind: "attention_requested",
      payload: {
        actionKind: "queue_ceo_review",
        reason: "governance_backlog"
      },
      createdAt: "2026-06-03T10:12:00.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === ceoCard!.id
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Board attention is now waiting on CEO governance backlog review."
        })
      ])
    );
  });

  it("keeps final-assembly attention-requested history explicit without a persisted snapshot", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const ceoCard = (await repository.listCardsForRun(board.runId)).find((card) => card.persona === "ceo");
    expect(ceoCard).toBeTruthy();

    await repository.insertEvent({
      id: "event_attention_requested_final_assembly",
      cardId: ceoCard!.id,
      eventKind: "attention_requested",
      payload: {
        actionKind: "queue_ceo_review",
        reason: "final_assembly"
      },
      createdAt: "2026-06-03T10:12:07.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === ceoCard!.id
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Board attention is now waiting on CEO final assembly review."
        })
      ])
    );
  });

  it("keeps governance-hold attention-requested history explicit without a persisted snapshot", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const ceoCard = (await repository.listCardsForRun(board.runId)).find((card) => card.persona === "ceo");
    expect(ceoCard).toBeTruthy();

    await repository.insertEvent({
      id: "event_attention_requested_governance_hold",
      cardId: ceoCard!.id,
      eventKind: "attention_requested",
      payload: {
        actionKind: "queue_ceo_review",
        reason: "governance_hold"
      },
      createdAt: "2026-06-03T10:12:15.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === ceoCard!.id
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Board attention is now waiting on CEO governance-hold review."
        })
      ])
    );
  });

  it("keeps generic attention-requested history explicit when no action metadata is present", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const ceoCard = (await repository.listCardsForRun(board.runId)).find((card) => card.persona === "ceo");
    expect(ceoCard).toBeTruthy();

    await repository.insertEvent({
      id: "event_attention_requested_generic",
      cardId: ceoCard!.id,
      eventKind: "attention_requested",
      payload: {},
      createdAt: "2026-06-03T10:12:30.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === ceoCard!.id
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Board attention is waiting on the next bounded orchestration step."
        })
      ])
    );
  });

  it("keeps lane-resume attention-requested history explicit without a persisted snapshot", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertEvent({
      id: "event_attention_requested_resume",
      cardId: created.cardId,
      eventKind: "attention_requested",
      payload: {
        actionKind: "await_lane_resume",
        targetCardId: created.cardId
      },
      createdAt: "2026-06-03T10:12:35.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Board attention is now waiting on a lane resume decision."
        })
      ])
    );
  });

  it("keeps lane-unblock attention-requested history explicit without a persisted snapshot", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertEvent({
      id: "event_attention_requested_unblock",
      cardId: created.cardId,
      eventKind: "attention_requested",
      payload: {
        actionKind: "await_unblock",
        targetCardId: created.cardId
      },
      createdAt: "2026-06-03T10:12:40.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Board attention is now waiting on a lane unblock decision."
        })
      ])
    );
  });

  it("keeps governance-backlog attention-resolved history explicit without a persisted snapshot", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const ceoCard = (await repository.listCardsForRun(board.runId)).find((card) => card.persona === "ceo");
    expect(ceoCard).toBeTruthy();

    await repository.insertEvent({
      id: "event_attention_resolved_governance_backlog",
      cardId: ceoCard!.id,
      eventKind: "attention_resolved",
      payload: {
        actionKind: "queue_ceo_review",
        reason: "governance_backlog"
      },
      createdAt: "2026-06-03T10:12:45.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === ceoCard!.id
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Board attention no longer needs CEO governance backlog review."
        })
      ])
    );
  });

  it("keeps final-assembly attention-resolved history explicit without a persisted snapshot", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const ceoCard = (await repository.listCardsForRun(board.runId)).find((card) => card.persona === "ceo");
    expect(ceoCard).toBeTruthy();

    await repository.insertEvent({
      id: "event_attention_resolved_final_assembly",
      cardId: ceoCard!.id,
      eventKind: "attention_resolved",
      payload: {
        actionKind: "queue_ceo_review",
        reason: "final_assembly"
      },
      createdAt: "2026-06-03T10:12:52.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === ceoCard!.id
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Board attention no longer needs CEO final assembly review."
        })
      ])
    );
  });

  it("keeps lane-unblock attention-resolved history explicit without a persisted snapshot", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertEvent({
      id: "event_attention_resolved_unblock",
      cardId: created.cardId,
      eventKind: "attention_resolved",
      payload: {
        actionKind: "await_unblock",
        targetCardId: created.cardId
      },
      createdAt: "2026-06-03T10:13:00.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Board attention no longer needs a lane unblock decision."
        })
      ])
    );
  });

  it("keeps generic attention-resolved history explicit when no action metadata is present", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertEvent({
      id: "event_attention_resolved_generic",
      cardId: created.cardId,
      eventKind: "attention_resolved",
      payload: {},
      createdAt: "2026-06-03T10:13:10.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Board attention has moved past the prior orchestration hold."
        })
      ])
    );
  });

  it("surfaces ignored worker outcomes as bounded historical activity", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertEvent({
      id: "event_execution_outcome_ignored",
      cardId: created.cardId,
      eventKind: "execution_outcome_ignored",
      payload: {
        reason: "stale_execution_claim",
        currentLaneState: "working",
        activeExecutionClaimPresent: true,
        activeExecutionClaimClaimedAt: "2026-06-02T15:10:00.000Z",
        presentedExecutionClaimState: "mismatched"
      },
      createdAt: "2026-06-02T15:12:00.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "A stale worker callback was ignored because this lane had already moved to a newer execution claim."
        })
      ])
    );
  });

  it("surfaces no-longer-working ignored outcomes as bounded historical activity", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertEvent({
      id: "event_execution_outcome_ignored_waiting",
      cardId: created.cardId,
      eventKind: "execution_outcome_ignored",
      payload: {
        reason: "lane_not_working",
        currentLaneState: "waiting"
      },
      createdAt: "2026-06-03T12:12:00.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "A worker callback was ignored because the lane had already left active execution and was Waiting."
        })
      ])
    );
  });

  it("surfaces terminal-run ignored outcomes as bounded historical activity", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertEvent({
      id: "event_execution_outcome_ignored_terminal",
      cardId: created.cardId,
      eventKind: "execution_outcome_ignored",
      payload: {
        reason: "terminal_run",
        runState: "done"
      },
      createdAt: "2026-06-03T12:13:00.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "A worker callback was ignored because this run had already closed."
        })
      ])
    );
  });

  it("surfaces fresh worker execution claims as bounded historical activity", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertEvent({
      id: "event_execution_claimed",
      cardId: created.cardId,
      eventKind: "execution_claimed",
      payload: {
        claimKind: "approved_claim",
        claimedAt: "2026-06-03T10:10:00.000Z"
      },
      createdAt: "2026-06-03T10:10:00.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "A worker claimed this lane from the approved execution queue."
        })
      ])
    );
  });

  it("surfaces recovered worker claim refreshes as bounded historical activity", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertEvent({
      id: "event_execution_claim_refreshed",
      cardId: created.cardId,
      eventKind: "execution_claim_refreshed",
      payload: {
        claimKind: "working_claim_refresh",
        claimedAt: "2026-06-03T10:11:00.000Z",
        previousClaimedAt: "2026-06-03T10:09:00.000Z"
      },
      createdAt: "2026-06-03T10:11:00.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "A worker refreshed a recovered execution claim for this lane."
        })
      ])
    );
  });

  it("surfaces durable worker dispatch handoff history as bounded board activity", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cmo",
      title: "Prepare launch messaging",
      deliverableType: "launch_copy"
    }));

    await repository.insertEvent({
      id: "event_execution_dispatched",
      cardId: created.cardId,
      eventKind: "execution_dispatched",
      payload: {
        kind: "follow_on_dispatch",
        kindLabel: "Follow-on dispatch",
        executionStage: "post_outcome_follow_on",
        executionStageLabel: "Post-outcome follow-on",
        reactivatedRun: false,
        triggeredByCardId: "card_cfo",
        triggeredByPersona: "cfo",
        triggeredByOutcomeState: "done",
        triggeredByResultSummary: "Pricing review is complete and ready for board packaging."
      },
      createdAt: "2026-06-02T15:09:00.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "A worker started this lane from CFO's completed-lane handoff."
        })
      ])
    );
  });

  it("surfaces reactivated follow-on dispatch history as bounded board activity", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "researcher",
      title: "Validate competitor pressure notes",
      deliverableType: "research_brief"
    }));

    await repository.insertEvent({
      id: "event_execution_dispatched_reactivated",
      cardId: created.cardId,
      eventKind: "execution_dispatched",
      payload: {
        kind: "follow_on_dispatch",
        kindLabel: "Follow-on dispatch",
        executionStage: "post_outcome_follow_on",
        executionStageLabel: "Post-outcome follow-on",
        reactivatedRun: true,
        triggeredByCardId: "card_cfo",
        triggeredByPersona: "cfo",
        triggeredByOutcomeState: "cancelled"
      },
      createdAt: "2026-06-03T10:09:00.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "A worker reactivated this run and started this lane after CFO cancelled the prior lane."
        })
      ])
    );
  });

  it("surfaces initial execution-claim dispatch history as bounded board activity", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertEvent({
      id: "event_execution_dispatched_initial",
      cardId: created.cardId,
      eventKind: "execution_dispatched",
      payload: {
        kind: "initial_claim",
        kindLabel: "Initial claim",
        executionStage: "initial_lane_start",
        executionStageLabel: "Initial lane start"
      },
      createdAt: "2026-06-03T10:10:00.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "A worker started this lane from the initial execution claim."
        })
      ])
    );
  });

  it("keeps follow-on dispatch history explicit even when triggering persona detail is absent", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "researcher",
      title: "Validate competitor pressure notes",
      deliverableType: "research_brief"
    }));

    await repository.insertEvent({
      id: "event_execution_dispatched_follow_on_without_persona",
      cardId: created.cardId,
      eventKind: "execution_dispatched",
      payload: {
        kind: "follow_on_dispatch",
        kindLabel: "Follow-on dispatch",
        executionStage: "post_outcome_follow_on",
        executionStageLabel: "Post-outcome follow-on",
        reactivatedRun: false,
        triggeredByOutcomeState: "done"
      },
      createdAt: "2026-06-03T10:10:30.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "A worker started this lane from a follow-on handoff."
        })
      ])
    );
  });

  it("keeps reactivated follow-on dispatch history explicit even when triggering persona detail is absent", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "researcher",
      title: "Validate competitor pressure notes",
      deliverableType: "research_brief"
    }));

    await repository.insertEvent({
      id: "event_execution_dispatched_reactivated_without_persona",
      cardId: created.cardId,
      eventKind: "execution_dispatched",
      payload: {
        kind: "follow_on_dispatch",
        kindLabel: "Follow-on dispatch",
        executionStage: "post_outcome_follow_on",
        executionStageLabel: "Post-outcome follow-on",
        reactivatedRun: true,
        triggeredByOutcomeState: "cancelled"
      },
      createdAt: "2026-06-03T10:10:45.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "A worker reactivated this run and started this lane from a follow-on handoff."
        })
      ])
    );
  });

  it("keeps current execution-queue dispatch history explicit when dispatch metadata is absent", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "researcher",
      title: "Validate competitor pressure notes",
      deliverableType: "research_brief"
    }));

    await repository.insertEvent({
      id: "event_execution_dispatched_generic_queue",
      cardId: created.cardId,
      eventKind: "execution_dispatched",
      payload: {},
      createdAt: "2026-06-03T10:11:00.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "A worker started this lane from the current execution queue."
        })
      ])
    );
  });

  it("keeps generic execution-claim history explicit when claim kind metadata is absent", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "researcher",
      title: "Validate competitor pressure notes",
      deliverableType: "research_brief"
    }));

    await repository.insertEvent({
      id: "event_execution_claimed_generic",
      cardId: created.cardId,
      eventKind: "execution_claimed",
      payload: {},
      createdAt: "2026-06-03T10:11:15.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "A worker claimed this lane for execution."
        })
      ])
    );
  });

  it("keeps generic execution-claim refresh history explicit when recovery kind metadata is absent", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "researcher",
      title: "Validate competitor pressure notes",
      deliverableType: "research_brief"
    }));

    await repository.insertEvent({
      id: "event_execution_claimed_refreshed_generic",
      cardId: created.cardId,
      eventKind: "execution_claim_refreshed",
      payload: {},
      createdAt: "2026-06-03T10:11:30.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "A worker refreshed the active execution claim for this lane."
        })
      ])
    );
  });

  it("surfaces committed worker outcome history as bounded board activity", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cmo",
      title: "Prepare launch messaging",
      deliverableType: "launch_copy"
    }));

    await repository.insertEvent({
      id: "event_execution_outcome_committed",
      cardId: created.cardId,
      eventKind: "execution_outcome_committed",
      payload: {
        outcomeState: "done",
        runState: "assembling",
        postOutcomeActionKind: "queue_ceo_review",
        postOutcomeReason: "final_assembly",
        resultSummary: "Launch copy is ready for final packaging."
      },
      createdAt: "2026-06-02T15:11:00.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "A worker finished this lane and queued CEO review for Final Assembly: Launch copy is ready for final packaging."
        })
      ])
    );
  });

  it("surfaces waiting worker outcome history with continuity-aware board activity", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    repository.insertEvent({
      id: "event_execution_outcome_waiting",
      cardId: created.cardId,
      eventKind: "execution_outcome_committed",
      payload: {
        outcomeState: "waiting",
        runState: "waiting",
        postOutcomeActionKind: "await_lane_resume",
        targetCardId: created.cardId,
        continuitySummary: "Resume after the tenant confirms the latest revenue assumption."
      },
      createdAt: "2026-06-02T15:11:00.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "A worker paused this lane and is waiting for an explicit resume: Resume after the tenant confirms the latest revenue assumption."
        })
      ])
    );
  });

  it("keeps CEO review outcome history explicit when no review reason is present", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cmo",
      title: "Prepare launch messaging",
      deliverableType: "launch_copy"
    }));

    await repository.insertEvent({
      id: "event_execution_outcome_committed_generic_review",
      cardId: created.cardId,
      eventKind: "execution_outcome_committed",
      payload: {
        outcomeState: "done",
        runState: "assembling",
        postOutcomeActionKind: "queue_ceo_review"
      },
      createdAt: "2026-06-02T15:11:15.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "A worker finished this lane and queued CEO review."
        })
      ])
    );
  });

  it("keeps waiting worker outcome history explicit when no continuity detail is available", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    repository.insertEvent({
      id: "event_execution_outcome_waiting_no_detail",
      cardId: created.cardId,
      eventKind: "execution_outcome_committed",
      payload: {
        outcomeState: "waiting",
        runState: "waiting",
        postOutcomeActionKind: "await_lane_resume",
        targetCardId: created.cardId
      },
      createdAt: "2026-06-02T15:11:30.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "A worker paused this lane and is waiting for an explicit resume."
        })
      ])
    );
  });

  it("surfaces done worker outcome history with explicit next-lane handoff copy", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    repository.insertEvent({
      id: "event_execution_outcome_done_dispatch",
      cardId: created.cardId,
      eventKind: "execution_outcome_committed",
      payload: {
        outcomeState: "done",
        runState: "active",
        postOutcomeActionKind: "dispatch_next_lane",
        targetCardId: "card_cmo",
        targetPersona: "cmo",
        resultSummary: "The pricing lane is ready for message-market fit packaging."
      },
      createdAt: "2026-06-02T15:11:30.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "A worker finished this lane and handed the next lane to CMO: The pricing lane is ready for message-market fit packaging."
        })
      ])
    );
  });

  it("keeps done worker outcome summary detail explicit when no post-outcome action is present", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    repository.insertEvent({
      id: "event_execution_outcome_done_summary_only",
      cardId: created.cardId,
      eventKind: "execution_outcome_committed",
      payload: {
        outcomeState: "done",
        runState: "active",
        resultSummary: "The pricing lane finished cleanly without another immediate handoff."
      },
      createdAt: "2026-06-02T15:11:45.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "A worker finished this lane: The pricing lane finished cleanly without another immediate handoff."
        })
      ])
    );
  });

  it("surfaces blocked worker outcome history with continuity-aware board activity", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    repository.insertEvent({
      id: "event_execution_outcome_blocked",
      cardId: created.cardId,
      eventKind: "execution_outcome_committed",
      payload: {
        outcomeState: "blocked",
        runState: "blocked",
        postOutcomeActionKind: "await_unblock",
        targetCardId: created.cardId,
        continuitySummary: "Unblock after the tenant confirms the final margin constraint."
      },
      createdAt: "2026-06-02T15:12:00.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "A worker marked this lane blocked and is waiting for an explicit unblock: Unblock after the tenant confirms the final margin constraint."
        })
      ])
    );
  });

  it("keeps blocked worker outcome history explicit when no continuity detail is available", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    repository.insertEvent({
      id: "event_execution_outcome_blocked_no_detail",
      cardId: created.cardId,
      eventKind: "execution_outcome_committed",
      payload: {
        outcomeState: "blocked",
        runState: "blocked",
        postOutcomeActionKind: "await_unblock",
        targetCardId: created.cardId
      },
      createdAt: "2026-06-02T15:12:30.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "A worker marked this lane blocked and is waiting for an explicit unblock."
        })
      ])
    );
  });

  it("surfaces cancelled worker outcome history with follow-on control handoff copy", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    repository.insertEvent({
      id: "event_execution_outcome_cancelled",
      cardId: created.cardId,
      eventKind: "execution_outcome_committed",
      payload: {
        outcomeState: "cancelled",
        runState: "active",
        postOutcomeActionKind: "dispatch_next_lane",
        targetCardId: "card_cfo",
        targetPersona: "cfo",
        continuitySummary: "The tenant withdrew the request, so CFO can decide the next move."
      },
      createdAt: "2026-06-02T15:13:00.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "A worker cancelled this lane and handed control to CFO: The tenant withdrew the request, so CFO can decide the next move."
        })
      ])
    );
  });

  it("keeps cancelled worker outcome history persona-aware even without continuity detail", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    repository.insertEvent({
      id: "event_execution_outcome_cancelled_no_continuity",
      cardId: created.cardId,
      eventKind: "execution_outcome_committed",
      payload: {
        outcomeState: "cancelled",
        runState: "active",
        postOutcomeActionKind: "dispatch_next_lane",
        targetCardId: "card_cfo",
        targetPersona: "cfo"
      },
      createdAt: "2026-06-02T15:14:00.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "A worker cancelled this lane and handed control to CFO."
        })
      ])
    );
  });

  it("keeps cancelled worker outcome summary detail even without continuity detail", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    repository.insertEvent({
      id: "event_execution_outcome_cancelled_summary_only",
      cardId: created.cardId,
      eventKind: "execution_outcome_committed",
      payload: {
        outcomeState: "cancelled",
        runState: "active",
        resultSummary: "The tenant withdrew the request after the pricing assumptions changed."
      },
      createdAt: "2026-06-02T15:15:00.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "A worker cancelled this lane and returned control to the harness: The tenant withdrew the request after the pricing assumptions changed."
        })
      ])
    );
  });

  it("keeps generic committed-outcome history explicit when outcome-state metadata is absent", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    repository.insertEvent({
      id: "event_execution_outcome_generic",
      cardId: created.cardId,
      eventKind: "execution_outcome_committed",
      payload: {},
      createdAt: "2026-06-02T15:15:15.000Z"
    });

    const hydratedCard = (await service.listBoardState({ authorization: "Bearer valid" })).cards.find(
      (card) => card.id === created.cardId
    );

    expect(hydratedCard?.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "A worker committed a new lane outcome."
        })
      ])
    );
  });

  it("derives tenant-safe board follow-through items from implemented governance decisions", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await repository.insertProposal({
      id: "proposal_followthrough_1",
      runId: board.runId,
      parentCardId: created.cardId,
      requestedByCardId: created.cardId,
      requestedByPersona: "cfo",
      persona: "cfo",
      title: "Add renewal downside analysis",
      deliverableType: "pricing_review",
      status: "proposed"
    });

    await expect(
      service.decideProposal({
        authorization: "Bearer valid",
        proposalId: "proposal_followthrough_1",
        decision: "approve"
      })
    ).resolves.toEqual({
      status: "approved",
      cardId: created.cardId
    });

    const hydrated = await service.listBoardState({ authorization: "Bearer valid" });
    expect(hydrated.memoryBoundary.summary).toContain("Wealth Factory runtime");
    expect(hydrated.memoryBoundary.exportSummary).toContain("ready now");
    expect(hydrated.memoryBoundary.roleSummary).toContain("governance history candidate");
    expect(hydrated.memoryBoundary.readyNowCount).toEqual(expect.any(Number));
    expect(hydrated.memoryBoundary.waitingOnBoardClosureCount).toEqual(expect.any(Number));
    expect(hydrated.memoryBoundary.governanceReadyCount).toEqual(expect.any(Number));
    expect(hydrated.memoryBoundary.blockedCandidateCount).toEqual(expect.any(Number));
    expect(hydrated.memoryBoundary.tenantControlledCandidateCount).toEqual(expect.any(Number));
    expect(hydrated.memoryBoundary.boardControlledCandidateCount).toEqual(expect.any(Number));
    expect(hydrated.memoryBoundary.tenantExportTriggerCount).toEqual(expect.any(Number));
    expect(hydrated.memoryBoundary.boardClosureTriggerCount).toEqual(expect.any(Number));
    expect(hydrated.memoryBoundary.ownershipSummary).toContain("Wealth Factory-only");
    expect(hydrated.memoryBoundary.promotionSummary).toContain("never promote");
    expect(hydrated.memoryBoundary.recordTargetSummary).toContain("governance history record");
    expect(hydrated.memoryBoundary.assemblySummary).toContain("standalone export records");
    expect(hydrated.memoryBoundary.phaseSummary).toContain("phase-one export");
    expect(hydrated.memoryBoundary.mutabilitySummary).toContain("append-only history");
    expect(hydrated.memoryBoundary.scopeSummary).toContain("single-record exports");
    expect(hydrated.memoryBoundary.identitySummary).toContain("stable record identity");
    expect(hydrated.memoryBoundary.auditSummary).toContain("decision-ledger-backed");
    expect(hydrated.memoryBoundary.concurrencySummary).toContain("promote independently");
    expect(hydrated.memoryBoundary.payloadShapeSummary).toContain("governance history records");
    expect(hydrated.memoryBoundary.idempotencySummary).toContain("deterministic upsert");
    expect(hydrated.memoryBoundary.replaySafetySummary).toContain("replay-safe");
    expect(hydrated.memoryBoundary.conflictPolicySummary).toContain("append-or-upsert");
    expect(hydrated.memoryBoundary.atomicitySummary).toContain("record-level atomic");
    expect(hydrated.memoryBoundary.derivationSummary).toContain("decision history");
    expect(hydrated.memoryBoundary.revisionSummary).toContain("new revisions");
    expect(hydrated.memoryBoundary.freshnessSummary).toContain("latest record state");
    expect(hydrated.memoryBoundary.validationSummary).toContain("record level");
    expect(hydrated.memoryBoundary.completenessSummary).toContain("self-contained records");
    expect(hydrated.memoryBoundary.sensitivitySummary).toContain("tenant business context");
    expect(hydrated.memoryBoundary.audienceSummary).toContain("governance-history readers");
    expect(hydrated.memoryBoundary.sanitizationSummary).toContain("exported as recorded");
    expect(hydrated.memoryBoundary.redactionSummary).toContain("governance-safe redaction");
    expect(hydrated.memoryBoundary.sourceDisclosureSummary).toContain("decision summaries only");
    expect(hydrated.memoryBoundary.placementSummary).toContain("governance history notes");
    expect(hydrated.memoryBoundary.syncStrategySummary).toContain("append history entries");
    expect(hydrated.memoryBoundary.requestShapeSummary).toContain("single-record export requests");
    expect(hydrated.memoryBoundary.confirmationSummary).toContain("tenant export confirmation");
    expect(hydrated.memoryBoundary.recoveryPathSummary).toContain("retry the latest record export");
    expect(hydrated.memoryBoundary.runtimeShapeSummary).toContain("bounded continuity trio");
    expect(hydrated.memoryBoundary.runtimeLongMemoryDispositionSummary).toContain(
      "do not promote directly into tenant-owned long memory"
    );
    expect(hydrated.memoryBoundary.exportCandidateSummary).toContain("export candidate group");
    expect(hydrated.memoryBoundary.exportCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.readyExportCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.waitingExportCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.foundationalExportCandidateCount).toBe(1);
    expect(hydrated.memoryBoundary.boardClosureFollowingExportCandidateCount).toBe(0);
    expect(hydrated.memoryBoundary.independentExportCandidateCount).toBe(1);
    expect(hydrated.memoryBoundary.dependentExportCandidateCount).toBe(0);
    expect(hydrated.memoryBoundary.continuityTrioRuntimeItemCount).toBe(1);
    expect(hydrated.memoryBoundary.attentionSignalRuntimeItemCount).toBe(1);
    expect(hydrated.memoryBoundary.runtimeOnlyLongMemoryItemCount).toBe(2);
    expect(hydrated.memoryBoundary.sequenceSummary).toContain("foundational export sequence");
    expect(hydrated.memoryBoundary.dependencySummary).toContain("stands independently");
    expect(hydrated.memoryBoundary.blockerSummary).toContain("blocked");
    expect(hydrated.memoryBoundary.authoritySummary).toContain("tenant-controlled");
    expect(hydrated.memoryBoundary.triggerSummary).toContain("tenant export request");
    expect(hydrated.memoryBoundary.nextStepSummary).toContain("tenant export step");
    expect(hydrated.memoryBoundary.actionFamilySummary).toContain("tenant export family");
    expect(hydrated.memoryBoundary.partitions).toMatchObject({
      runtime: { itemCount: 2 },
      governanceHistoryCandidates: { itemCount: 2 }
    });
    expect(hydrated.memoryBoundary.operationalItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "lane_continuity",
          destination: "wealth_factory_runtime",
          count: expect.any(Number),
          readiness: "live_runtime_only",
          readinessLabel: "Live runtime only",
          role: "runtime_memory",
          eligibilityRule: "runtime_only",
          sourceSurface: "continuity_snapshots",
          candidateClass: "runtime_operational",
          durabilityCondition: "runtime_ephemeral",
          runtimeMemoryShape: "bounded_continuity_trio",
          runtimeMemoryShapeLabel: "Bounded continuity trio",
          runtimeMemoryComponents: ["continuity_summary", "latest_result_summary", "absorbed_work_items"],
          runtimeMemoryComponentLabels: ["Continuity summary", "Latest result summary", "Absorbed work items"],
          runtimeLongMemoryDisposition: "stays_runtime_only",
          runtimeLongMemoryDispositionLabel: "Stays runtime only",
          ownershipBoundary: "wealth_factory_only",
          ownershipBoundaryLabel: "Wealth Factory only",
          promotionPath: "never_promotes",
          promotionPathLabel: "Never promotes",
          recordTarget: "none_runtime_only",
          recordTargetLabel: "Runtime only",
          promotionBlocker: "not_applicable_runtime_only",
          promotionBlockerLabel: "Not applicable in runtime",
          promotionAuthority: "wealth_factory_runtime_only",
          promotionAuthorityLabel: "Wealth Factory runtime only",
          promotionTrigger: "not_applicable_runtime",
          promotionTriggerLabel: "No promotion trigger",
          promotionNextStep: "none_runtime_only",
          promotionNextStepLabel: "No promotion step",
          promotionActionFamily: "none_runtime_only",
          promotionActionFamilyLabel: "No promotion action",
          assemblyShape: "none_runtime_only",
          assemblyShapeLabel: "No export assembly",
          promotionPhase: "not_exported_runtime",
          promotionPhaseLabel: "No export phase",
          promotionMutability: "runtime_mutable",
          promotionMutabilityLabel: "Runtime mutable",
          promotionScope: "none_runtime_only",
          promotionScopeLabel: "No promotion scope",
          identityStability: "runtime_transient_identity",
          identityStabilityLabel: "Runtime transient identity",
          auditBacking: "runtime_state_only",
          auditBackingLabel: "Runtime-state-backed",
          concurrencyBoundary: "runtime_only",
          concurrencyBoundaryLabel: "Runtime only",
          exportPayloadShape: "none_runtime_only",
          exportPayloadShapeLabel: "No export payload",
          idempotencyPolicy: "not_applicable_runtime",
          idempotencyPolicyLabel: "No idempotency policy",
          replaySafety: "runtime_only",
          replaySafetyLabel: "Runtime only",
          conflictPolicy: "runtime_only",
          conflictPolicyLabel: "Runtime only",
          exportAtomicity: "none_runtime_only",
          exportAtomicityLabel: "No export atomicity",
          exportDerivationBasis: "none_runtime_only",
          exportDerivationBasisLabel: "No export derivation",
          exportRevisionPolicy: "none_runtime_only",
          exportRevisionPolicyLabel: "No export revision policy",
          exportFreshnessSource: "none_runtime_only",
          exportFreshnessSourceLabel: "No export freshness source",
          exportValidationBoundary: "none_runtime_only",
          exportValidationBoundaryLabel: "No export validation",
          exportCompletenessRule: "none_runtime_only",
          exportCompletenessRuleLabel: "No export completeness rule",
          exportSensitivity: "none_runtime_only",
          exportSensitivityLabel: "No export sensitivity",
          exportAudienceBoundary: "wealth_factory_runtime_only",
          exportAudienceBoundaryLabel: "Wealth Factory runtime only",
          exportSanitizationPolicy: "none_runtime_only",
          exportSanitizationPolicyLabel: "No export sanitization",
          exportRedactionBoundary: "runtime_internal_only",
          exportRedactionBoundaryLabel: "Runtime internal only",
          exportSourceDisclosurePolicy: "runtime_only",
          exportSourceDisclosurePolicyLabel: "Runtime only",
          memoryPlacement: "none_runtime_only",
          memoryPlacementLabel: "No tenant memory placement",
          syncStrategy: "none_runtime_only",
          syncStrategyLabel: "No tenant sync strategy",
          exportRequestShape: "none_runtime_only",
          exportRequestShapeLabel: "No export request shape",
          exportConfirmationRequirement: "none_runtime_only",
          exportConfirmationRequirementLabel: "No export confirmation",
          exportRecoveryPath: "runtime_only",
          exportRecoveryPathLabel: "Runtime only"
        })
      ])
    );
    expect(hydrated.memoryBoundary.exportReadyItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "governance_decisions",
          destination: "tenant_record_candidate",
          count: expect.any(Number),
          readiness: "ready_now",
          readinessLabel: "Ready now",
          role: "governance_record_candidate",
          eligibilityRule: "explicit_export_later",
          sourceSurface: "recent_decisions",
          candidateClass: "governance_history",
          durabilityCondition: "stable_when_recorded",
          ownershipBoundary: "tenant_owned_later",
          ownershipBoundaryLabel: "Tenant-owned later",
          promotionPath: "ready_for_explicit_export",
          promotionPathLabel: "Ready for explicit export",
          recordTarget: "governance_history_record",
          recordTargetLabel: "Governance history record",
          promotionBlocker: "none_ready_now",
          promotionBlockerLabel: "No blocker",
          promotionAuthority: "tenant_explicit_export",
          promotionAuthorityLabel: "Tenant explicit export",
          promotionTrigger: "tenant_export_request",
          promotionTriggerLabel: "Tenant export request",
          promotionNextStep: "tenant_export_available",
          promotionNextStepLabel: "Tenant export available",
          promotionActionFamily: "tenant_export_candidate",
          promotionActionFamilyLabel: "Tenant export family",
          assemblyShape: "standalone_export_record",
          assemblyShapeLabel: "Standalone export record",
          promotionPhase: "phase_one_governance_history",
          promotionPhaseLabel: "Phase-one export",
          promotionMutability: "append_only_history",
          promotionMutabilityLabel: "Append-only history",
          promotionScope: "single_record_export",
          promotionScopeLabel: "Single-record export",
          identityStability: "stable_record_identity",
          identityStabilityLabel: "Stable record identity",
          auditBacking: "decision_ledger_backed",
          auditBackingLabel: "Decision-ledger-backed",
          concurrencyBoundary: "independent_export_safe",
          concurrencyBoundaryLabel: "Independent export safe",
          exportPayloadShape: "governance_history_record",
          exportPayloadShapeLabel: "Governance history record",
          idempotencyPolicy: "deterministic_upsert",
          idempotencyPolicyLabel: "Deterministic upsert",
          replaySafety: "replay_safe",
          replaySafetyLabel: "Replay-safe",
          conflictPolicy: "append_or_upsert",
          conflictPolicyLabel: "Append or upsert",
          exportAtomicity: "record_level_atomic",
          exportAtomicityLabel: "Record-level atomic",
          exportDerivationBasis: "decision_history_derived",
          exportDerivationBasisLabel: "Decision-history-derived",
          exportRevisionPolicy: "append_new_revision",
          exportRevisionPolicyLabel: "Append new revision",
          exportFreshnessSource: "latest_record_state",
          exportFreshnessSourceLabel: "Latest record state",
          exportValidationBoundary: "record_level_validation",
          exportValidationBoundaryLabel: "Record-level validation",
          exportCompletenessRule: "self_contained_record",
          exportCompletenessRuleLabel: "Self-contained record",
          exportSensitivity: "tenant_business_context",
          exportSensitivityLabel: "Tenant business context",
          exportAudienceBoundary: "tenant_governance_history_readers",
          exportAudienceBoundaryLabel: "Tenant governance-history readers",
          exportSanitizationPolicy: "export_as_recorded",
          exportSanitizationPolicyLabel: "Export as recorded",
          exportRedactionBoundary: "governance_safe_redaction",
          exportRedactionBoundaryLabel: "Governance-safe redaction",
          exportSourceDisclosurePolicy: "decision_summary_only",
          exportSourceDisclosurePolicyLabel: "Decision summary only",
          memoryPlacement: "governance_history_note",
          memoryPlacementLabel: "Governance history note",
          syncStrategy: "append_history_entry",
          syncStrategyLabel: "Append history entry",
          exportRequestShape: "single_record_export_request",
          exportRequestShapeLabel: "Single-record export request",
          exportConfirmationRequirement: "tenant_export_confirmation",
          exportConfirmationRequirementLabel: "Tenant export confirmation",
          exportRecoveryPath: "retry_latest_record_export",
          exportRecoveryPathLabel: "Retry latest record export"
        }),
        expect.objectContaining({
          id: "implemented_actions",
          destination: "tenant_record_candidate",
          count: expect.any(Number),
          readiness: "ready_now",
          readinessLabel: "Ready now",
          role: "governance_record_candidate",
          eligibilityRule: "explicit_export_later",
          sourceSurface: "follow_through",
          candidateClass: "governance_history",
          durabilityCondition: "stable_when_recorded",
          ownershipBoundary: "tenant_owned_later",
          ownershipBoundaryLabel: "Tenant-owned later",
          promotionPath: "ready_for_explicit_export",
          promotionPathLabel: "Ready for explicit export",
          recordTarget: "governance_history_record",
          recordTargetLabel: "Governance history record",
          promotionBlocker: "none_ready_now",
          promotionBlockerLabel: "No blocker",
          promotionAuthority: "tenant_explicit_export",
          promotionAuthorityLabel: "Tenant explicit export",
          promotionTrigger: "tenant_export_request",
          promotionTriggerLabel: "Tenant export request",
          promotionNextStep: "tenant_export_available",
          promotionNextStepLabel: "Tenant export available",
          promotionActionFamily: "tenant_export_candidate",
          promotionActionFamilyLabel: "Tenant export family",
          assemblyShape: "standalone_export_record",
          assemblyShapeLabel: "Standalone export record",
          promotionPhase: "phase_one_governance_history",
          promotionPhaseLabel: "Phase-one export",
          promotionMutability: "append_only_history",
          promotionMutabilityLabel: "Append-only history",
          promotionScope: "single_record_export",
          promotionScopeLabel: "Single-record export",
          identityStability: "stable_record_identity",
          identityStabilityLabel: "Stable record identity",
          auditBacking: "decision_ledger_backed",
          auditBackingLabel: "Decision-ledger-backed",
          concurrencyBoundary: "independent_export_safe",
          concurrencyBoundaryLabel: "Independent export safe",
          exportPayloadShape: "governance_history_record",
          exportPayloadShapeLabel: "Governance history record",
          idempotencyPolicy: "deterministic_upsert",
          idempotencyPolicyLabel: "Deterministic upsert",
          replaySafety: "replay_safe",
          replaySafetyLabel: "Replay-safe",
          conflictPolicy: "append_or_upsert",
          conflictPolicyLabel: "Append or upsert"
        })
      ])
    );
    expect(hydrated.followThroughItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "opened_lane",
          summary: "CEO opened a new pricing review lane for CFO.",
          persona: "CFO",
          deliverableLabel: "Pricing Review",
          policyReasonLabel: "New lane approved",
          recommendationSummary: "Open a dedicated pricing review lane for CFO."
        }),
        expect.objectContaining({
          action: "reused_lane",
          proposalId: "proposal_followthrough_1",
          targetCardId: created.cardId,
          summary: "CEO folded a proposal into the existing pricing review lane.",
          persona: "CFO",
          deliverableLabel: "Pricing Review",
          policyReasonLabel: "Existing lane reused",
          resolutionLabel: "Update Existing Lane",
          recommendationSummary: "Advance this pricing review inside the existing CFO lane."
        })
      ])
    );
    expect(JSON.stringify(hydrated.followThroughItems)).not.toMatch(/decisionNote|tool|prompt|internal|secret/i);
  });

  it("keeps deferred proposals visible for later CEO approval", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const parentCard = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertProposal({
      id: "proposal_deferred_1",
      runId: board.runId,
      parentCardId: parentCard.cardId,
      requestedByCardId: parentCard.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief",
      status: "proposed"
    });

    await expect(
      service.decideProposal({
        authorization: "Bearer valid",
        proposalId: "proposal_deferred_1",
        decision: "defer",
        decisionNote: "Wait for the pricing lane to settle first."
      })
    ).resolves.toEqual({ status: "deferred" });

    const deferredBoard = await service.listBoardState({ authorization: "Bearer valid" });
    expect(deferredBoard.pendingApprovals).toEqual([
      expect.objectContaining({
        id: "proposal_deferred_1",
        statusLabel: "Deferred for later CEO review",
        actionRoute: "proposal-decision",
        actionPath: "/api/harness/proposals/proposal_deferred_1/decision",
        allowedDecisions: ["approve", "defer", "deny"],
        policyReasonLabel: "Scope guardrail",
        nextReviewTrigger: "Review again only if the CEO widens the approved workflow boundary."
      })
    ]);

    await expect(
      service.approveProposal({
        authorization: "Bearer valid",
        proposalId: "proposal_deferred_1"
      })
    ).resolves.toEqual({
      cardId: expect.stringMatching(/^[0-9a-f-]{36}$/i)
    });

    const approvedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    expect(approvedBoard.pendingApprovals).toEqual([]);
  });

  it("treats repeated defer decisions without a new note as idempotent", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const parentCard = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertProposal({
      id: "proposal_deferred_repeat_1",
      runId: board.runId,
      parentCardId: parentCard.cardId,
      requestedByCardId: parentCard.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief",
      status: "deferred",
      decisionNote: "Wait for the pricing lane to settle first."
    });
    await repository.insertDecision({
      id: "decision_deferred_repeat_1",
      runId: board.runId,
      tenantId: "tenant_123",
      actorUserId: "user_123",
      decisionKind: "proposal_deferred",
      cardId: parentCard.cardId,
      proposalId: "proposal_deferred_repeat_1",
      targetCardId: null,
      persona: "researcher",
      deliverableType: "research_brief",
      policyReason: "scope_guardrail",
      resolution: null,
      decisionNote: "Wait for the pricing lane to settle first.",
      recommendationSummary: "Revisit this research brief request only if the CEO deliberately widens the approved workflow boundary.",
      objectionSummary: "Do not widen this run beyond the approved research brief workflow boundary.",
      createdAt: new Date().toISOString()
    });

    const decisionsBefore = await repository.listDecisionsForRun(board.runId);
    const eventsBefore = await repository.listEventsForCard(parentCard.cardId);

    await expect(
      service.decideProposal({
        authorization: "Bearer valid",
        proposalId: "proposal_deferred_repeat_1",
        decision: "defer"
      })
    ).resolves.toEqual({ status: "deferred" });

    const decisionsAfter = await repository.listDecisionsForRun(board.runId);
    const eventsAfter = await repository.listEventsForCard(parentCard.cardId);
    expect(decisionsAfter).toHaveLength(decisionsBefore.length);
    expect(eventsAfter).toHaveLength(eventsBefore.length);
  });

  it("records a fresh defer decision when the governance reason changes even if the note does not", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const parentCard = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertProposal({
      id: "proposal_deferred_reason_change_1",
      runId: board.runId,
      parentCardId: parentCard.cardId,
      requestedByCardId: parentCard.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Research the pricing lane",
      deliverableType: "pricing_review",
      status: "deferred",
      decisionNote: "Hold this for now."
    });
    await repository.insertDecision({
      id: "decision_deferred_reason_change_1",
      runId: board.runId,
      tenantId: "tenant_123",
      actorUserId: "user_123",
      decisionKind: "proposal_deferred",
      cardId: parentCard.cardId,
      proposalId: "proposal_deferred_reason_change_1",
      targetCardId: null,
      persona: "researcher",
      deliverableType: "pricing_review",
      policyReason: "scope_guardrail",
      resolution: null,
      decisionNote: "Hold this for now.",
      recommendationSummary:
        "Revisit this pricing review request only if the CEO deliberately widens the approved workflow boundary.",
      objectionSummary: "Do not widen this run beyond the approved pricing review workflow boundary.",
      createdAt: new Date(Date.now() - 1000).toISOString()
    });

    await expect(
      service.decideProposal({
        authorization: "Bearer valid",
        proposalId: "proposal_deferred_reason_change_1",
        decision: "defer",
        decisionNote: "Hold this for now."
      })
    ).resolves.toEqual({ status: "deferred" });

    const decisionsAfter = await repository.listDecisionsForRun(board.runId);
    const latestDecision = decisionsAfter.find((decision) => decision.proposalId === "proposal_deferred_reason_change_1");
    expect(decisionsAfter.filter((decision) => decision.proposalId === "proposal_deferred_reason_change_1")).toHaveLength(2);
    expect(latestDecision).toEqual(
      expect.objectContaining({
        policyReason: "deliverable_owner_conflict",
        recommendationSummary: "Keep advancing the current pricing review lane and revisit this request after a clear handoff.",
        objectionSummary: "Wait for the current pricing review owner to clear or hand off that lane first."
      })
    );
  });

  it("does not carry stale deferred objections into the final completion package after later approval", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const parentCard = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertProposal({
      id: "proposal_deferred_then_approved_1",
      runId: board.runId,
      parentCardId: parentCard.cardId,
      requestedByCardId: parentCard.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief",
      status: "proposed"
    });

    await service.decideProposal({
      authorization: "Bearer valid",
      proposalId: "proposal_deferred_then_approved_1",
      decision: "defer"
    });

    const approval = await service.approveProposal({
      authorization: "Bearer valid",
      proposalId: "proposal_deferred_then_approved_1"
    });

    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: parentCard.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: parentCard.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: approval.cardId,
      state: "planning"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: approval.cardId,
      state: "approved"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: approval.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: approval.cardId,
      state: "done",
      resultSummary: "Competitor price anchors are packaged for the board."
    });
    await service.completeRun({
      authorization: "Bearer valid",
      runId: board.runId,
      completionSummary: "The CEO packaged the final business-facing outcome."
    });

    const completedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    expect(completedBoard.completionPackage).toEqual(
      expect.objectContaining({
        deferredApprovalCount: 0,
        deniedApprovalCount: 0,
        hasOpenGovernanceItems: false,
        objections: [],
        governanceItems: []
      })
    );
  });

  it("defers approval when another active persona already owns the deliverable lane", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const parentCard = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertProposal({
      id: "proposal_owner_conflict_1",
      runId: board.runId,
      parentCardId: parentCard.cardId,
      requestedByCardId: parentCard.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Research the pricing lane",
      deliverableType: "pricing_review",
      status: "proposed"
    });

    const proposedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    expect(proposedBoard.pendingApprovals).toEqual([
      expect.objectContaining({
        id: "proposal_owner_conflict_1",
        statusLabel: "Pending CEO approval",
        actionMethod: "POST",
        actionLabel: "Review proposal decision",
        actionDescription: "Choose whether this proposed follow-on work should be approved, deferred, or denied.",
        requestFields: [
          {
            name: "decision",
            label: "Proposal decision",
            description: "Choose whether this proposed follow-on work should be approved, deferred, or denied.",
            required: true,
            allowedValues: ["approve", "defer", "deny"]
          },
          {
            name: "decisionNote",
            label: "Decision note",
            description: "Optional bounded note explaining the decision or what should change before review resumes.",
            required: false
          },
          {
            name: "targetCardId",
            label: "Handoff target lane",
            description: "Optional existing lane to reuse when approval should fold this work into an active owner-conflict handoff.",
            required: false,
            supportedWhenValue: "approve",
            suggestedValue: parentCard.cardId
          }
        ],
        actionOptions: [
          {
            value: "approve",
            label: "Approve proposal",
            description: "Approve this work and optionally fold it into CFO lane (Pressure-test the pricing lane).",
            emphasis: "primary",
            nextEffectSummary: "This proposal can move forward by reusing the existing lane instead of opening a duplicate card.",
            exampleRequest: { decision: "approve", targetCardId: parentCard.cardId }
          },
          {
            value: "defer",
            label: "Defer proposal",
            description: "Pause this follow-on work without dropping it so the CEO can revisit it later.",
            emphasis: "secondary",
            nextEffectSummary: "This proposal stays visible in the pending-approval queue for later CEO review.",
            exampleRequest: { decision: "defer" }
          },
          {
            value: "deny",
            label: "Deny proposal",
            description: "Reject this follow-on work when it should not expand the current board cycle.",
            emphasis: "caution",
            nextEffectSummary: "This proposal closes without opening or advancing any new work lane.",
            requiresConfirmation: true,
            confirmationLabel: "Deny this proposal and close the follow-on request?",
            exampleRequest: { decision: "deny" }
          }
        ],
        recommendedOptionValue: "approve",
        handoffTargetCardId: parentCard.cardId,
        handoffTargetPersona: "CFO",
        handoffTargetTitle: "Pressure-test the pricing lane",
        targetSummary: "Reuse CFO lane: Pressure-test the pricing lane"
      })
    ]);

    await expect(
      service.decideProposal({
        authorization: "Bearer valid",
        proposalId: "proposal_owner_conflict_1",
        decision: "approve"
      })
    ).resolves.toEqual({
      status: "deferred"
    });

    const deferredBoard = await service.listBoardState({ authorization: "Bearer valid" });
    expect(deferredBoard.pendingApprovals).toEqual([
      expect.objectContaining({
        id: "proposal_owner_conflict_1",
        statusLabel: "Deferred for later CEO review",
        actionMethod: "POST",
        actionLabel: "Review proposal decision",
        actionDescription: "Choose whether this proposed follow-on work should be approved, deferred, or denied.",
        requestFields: [
          {
            name: "decision",
            label: "Proposal decision",
            description: "Choose whether this proposed follow-on work should be approved, deferred, or denied.",
            required: true,
            allowedValues: ["approve", "defer", "deny"]
          },
          {
            name: "decisionNote",
            label: "Decision note",
            description: "Optional bounded note explaining the decision or what should change before review resumes.",
            required: false
          },
          {
            name: "targetCardId",
            label: "Handoff target lane",
            description: "Optional existing lane to reuse when approval should fold this work into an active owner-conflict handoff.",
            required: false,
            supportedWhenValue: "approve",
            suggestedValue: parentCard.cardId
          }
        ],
        actionOptions: [
          {
            value: "approve",
            label: "Approve proposal",
            description: "Approve this work and optionally fold it into CFO lane (Pressure-test the pricing lane).",
            emphasis: "primary",
            nextEffectSummary: "This proposal can move forward by reusing the existing lane instead of opening a duplicate card.",
            exampleRequest: { decision: "approve", targetCardId: parentCard.cardId }
          },
          {
            value: "defer",
            label: "Defer proposal",
            description: "Pause this follow-on work without dropping it so the CEO can revisit it later.",
            emphasis: "secondary",
            nextEffectSummary: "This proposal stays visible in the pending-approval queue for later CEO review.",
            exampleRequest: { decision: "defer" }
          },
          {
            value: "deny",
            label: "Deny proposal",
            description: "Reject this follow-on work when it should not expand the current board cycle.",
            emphasis: "caution",
            nextEffectSummary: "This proposal closes without opening or advancing any new work lane.",
            requiresConfirmation: true,
            confirmationLabel: "Deny this proposal and close the follow-on request?",
            exampleRequest: { decision: "deny" }
          }
        ],
        policyReasonLabel: "Waiting on current lane owner",
        nextReviewTrigger: "Review again when the current deliverable owner clears or hands off the lane.",
        handoffTargetCardId: parentCard.cardId,
        handoffTargetPersona: "CFO",
        handoffTargetTitle: "Pressure-test the pricing lane",
        targetSummary: "Reuse CFO lane: Pressure-test the pricing lane"
      })
    ]);
    expect(
      deferredBoard.recentDecisions.some(
        (decision) =>
          decision.label === "CEO deferred a pricing review request for RESEARCHER." &&
          decision.policyReasonLabel === "Waiting on current lane owner" &&
          decision.objectionSummary === "Wait for the current pricing review owner to clear or hand off that lane first."
      )
    ).toBe(true);
  });

  it("defers approval when the requested persona already has another active lane", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const parentCard = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief"
    }));

    await repository.insertProposal({
      id: "proposal_persona_focus_cap_1",
      runId: board.runId,
      parentCardId: parentCard.cardId,
      requestedByCardId: parentCard.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Validate the forecast assumptions",
      deliverableType: "forecast_model",
      status: "proposed"
    });

    await expect(
      service.decideProposal({
        authorization: "Bearer valid",
        proposalId: "proposal_persona_focus_cap_1",
        decision: "approve"
      })
    ).resolves.toEqual({
      status: "deferred"
    });

    const deferredProposal = await repository.getProposal("proposal_persona_focus_cap_1");
    expect(deferredProposal).toEqual(
      expect.objectContaining({
        status: "deferred",
        decisionNote: "CEO deferred this proposal because RESEARCHER already has another active lane."
      })
    );

    const deferredBoard = await service.listBoardState({ authorization: "Bearer valid" });
    expect(deferredBoard.pendingApprovals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "proposal_persona_focus_cap_1",
          statusLabel: "Deferred for later CEO review",
          policyReasonLabel: "Persona focus protection",
          nextReviewTrigger: "Review again when that persona's current active lane closes or is handed off."
        })
      ])
    );
    expect(
      deferredBoard.recentDecisions.some(
        (decision) =>
          decision.label === "CEO deferred a forecast model request for RESEARCHER." &&
          decision.policyReasonLabel === "Persona focus protection" &&
          decision.recommendationSummary ===
            "Finish, close, or hand off the current forecast model lane before opening another active lane for this persona." &&
          decision.objectionSummary ===
            "Keep this persona focused on the current forecast model lane until that work closes or is handed off."
      )
    ).toBe(true);
  });

  it("denies a repeated unresolved request when an earlier matching proposal is already pending CEO review", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const parentCard = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertProposal({
      id: "proposal_pending_duplicate_original_1",
      runId: board.runId,
      parentCardId: parentCard.cardId,
      requestedByCardId: parentCard.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief",
      status: "proposed"
    });
    await repository.insertProposal({
      id: "proposal_pending_duplicate_follow_on_1",
      runId: board.runId,
      parentCardId: parentCard.cardId,
      requestedByCardId: parentCard.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief",
      status: "proposed"
    });

    await expect(
      service.decideProposal({
        authorization: "Bearer valid",
        proposalId: "proposal_pending_duplicate_follow_on_1",
        decision: "approve"
      })
    ).resolves.toEqual({ status: "denied" });

    const originalProposal = await repository.getProposal("proposal_pending_duplicate_original_1");
    const duplicateProposal = await repository.getProposal("proposal_pending_duplicate_follow_on_1");
    expect(originalProposal).toEqual(
      expect.objectContaining({
        status: "proposed"
      })
    );
    expect(duplicateProposal).toEqual(
      expect.objectContaining({
        status: "denied",
        decisionNote: "CEO denied this proposal because an equivalent request is already pending CEO review."
      })
    );

    const hydratedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    expect(hydratedBoard.pendingApprovals).toEqual([
      expect.objectContaining({
        id: "proposal_pending_duplicate_original_1",
        statusLabel: "Pending CEO approval"
      })
    ]);
    expect(
      hydratedBoard.recentDecisions.some(
        (decision) =>
          decision.label === "CEO denied a research brief request for RESEARCHER." &&
          decision.policyReasonLabel === "Scope guardrail" &&
          decision.recommendationSummary ===
            "Keep this research brief work inside the current approved package boundary unless the CEO deliberately widens scope." &&
          decision.objectionSummary === "Do not widen this run beyond the approved research brief workflow boundary."
      )
    ).toBe(true);
  });

  it("keeps a repeated request deferred when an earlier matching proposal is already paused for lane pressure", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const parentCard = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertProposal({
      id: "proposal_deferred_duplicate_original_1",
      runId: board.runId,
      parentCardId: parentCard.cardId,
      requestedByCardId: parentCard.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief",
      status: "deferred",
      decisionNote: "Wait for a lane to clear first."
    });
    await repository.insertDecision({
      id: "decision_deferred_duplicate_original_1",
      runId: board.runId,
      tenantId: "tenant_123",
      actorUserId: "user_123",
      decisionKind: "proposal_deferred",
      cardId: parentCard.cardId,
      proposalId: "proposal_deferred_duplicate_original_1",
      targetCardId: null,
      persona: "researcher",
      deliverableType: "research_brief",
      policyReason: "lane_cap",
      resolution: null,
      decisionNote: "Wait for a lane to clear first.",
      recommendationSummary: "Finish or close one active lane before reopening this research brief request.",
      objectionSummary: "Hold this research brief request until the active lane count drops.",
      createdAt: new Date(Date.now() - 1000).toISOString()
    });
    await repository.insertProposal({
      id: "proposal_deferred_duplicate_follow_on_1",
      runId: board.runId,
      parentCardId: parentCard.cardId,
      requestedByCardId: parentCard.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief",
      status: "proposed"
    });

    await expect(
      service.decideProposal({
        authorization: "Bearer valid",
        proposalId: "proposal_deferred_duplicate_follow_on_1",
        decision: "approve"
      })
    ).resolves.toEqual({ status: "deferred" });

    const duplicateProposal = await repository.getProposal("proposal_deferred_duplicate_follow_on_1");
    expect(duplicateProposal).toEqual(
      expect.objectContaining({
        status: "deferred",
        decisionNote: "CEO deferred this proposal because an equivalent request is already waiting for lane capacity."
      })
    );

    const hydratedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    expect(hydratedBoard.pendingApprovals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "proposal_deferred_duplicate_original_1",
          statusLabel: "Deferred for later CEO review",
          policyReasonLabel: "Lane cap protection"
        }),
        expect.objectContaining({
          id: "proposal_deferred_duplicate_follow_on_1",
          statusLabel: "Deferred for later CEO review",
          policyReasonLabel: "Lane cap protection"
        })
      ])
    );
    expect(
      hydratedBoard.recentDecisions.some(
        (decision) =>
          decision.label === "CEO deferred a research brief request for RESEARCHER." &&
          decision.policyReasonLabel === "Lane cap protection" &&
          decision.recommendationSummary === "Finish or close one active lane before reopening this research brief request." &&
          decision.objectionSummary === "Hold this research brief request until the active lane count drops."
      )
    ).toBe(true);
  });

  it("keeps a repeated request deferred when an earlier matching proposal is already paused for persona focus", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const parentCard = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertProposal({
      id: "proposal_persona_focus_original_1",
      runId: board.runId,
      parentCardId: parentCard.cardId,
      requestedByCardId: parentCard.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Validate the forecast assumptions",
      deliverableType: "forecast_model",
      status: "deferred",
      decisionNote: "Wait for the current researcher lane to clear first."
    });
    await repository.insertDecision({
      id: "decision_persona_focus_original_1",
      runId: board.runId,
      tenantId: "tenant_123",
      actorUserId: "user_123",
      decisionKind: "proposal_deferred",
      cardId: parentCard.cardId,
      proposalId: "proposal_persona_focus_original_1",
      targetCardId: null,
      persona: "researcher",
      deliverableType: "forecast_model",
      policyReason: "persona_lane_cap",
      resolution: null,
      decisionNote: "Wait for the current researcher lane to clear first.",
      recommendationSummary:
        "Finish, close, or hand off the current forecast model lane before opening another active lane for this persona.",
      objectionSummary:
        "Keep RESEARCHER focused on the current active lane before opening another forecast model request.",
      createdAt: new Date(Date.now() - 1000).toISOString()
    });
    await repository.insertProposal({
      id: "proposal_persona_focus_follow_on_1",
      runId: board.runId,
      parentCardId: parentCard.cardId,
      requestedByCardId: parentCard.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Validate the forecast assumptions",
      deliverableType: "forecast_model",
      status: "proposed"
    });

    await expect(
      service.decideProposal({
        authorization: "Bearer valid",
        proposalId: "proposal_persona_focus_follow_on_1",
        decision: "approve"
      })
    ).resolves.toEqual({ status: "deferred" });

    const duplicateProposal = await repository.getProposal("proposal_persona_focus_follow_on_1");
    expect(duplicateProposal).toEqual(
      expect.objectContaining({
        status: "deferred",
        decisionNote:
          "CEO deferred this proposal because an equivalent request is already waiting on the same persona's active lane focus."
      })
    );

    const hydratedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    expect(hydratedBoard.pendingApprovals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "proposal_persona_focus_original_1",
          statusLabel: "Deferred for later CEO review",
          policyReasonLabel: "Persona focus protection"
        }),
        expect.objectContaining({
          id: "proposal_persona_focus_follow_on_1",
          statusLabel: "Deferred for later CEO review",
          policyReasonLabel: "Persona focus protection"
        })
      ])
    );
  });

  it("does not treat a distinct follow-on request title as a duplicate unresolved proposal", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const parentCard = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertProposal({
      id: "proposal_distinct_follow_on_original_1",
      runId: board.runId,
      parentCardId: parentCard.cardId,
      requestedByCardId: parentCard.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief",
      status: "proposed"
    });
    await repository.insertProposal({
      id: "proposal_distinct_follow_on_second_1",
      runId: board.runId,
      parentCardId: parentCard.cardId,
      requestedByCardId: parentCard.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Summarize price-anchor anomalies",
      deliverableType: "research_brief",
      status: "proposed"
    });

    await expect(
      service.decideProposal({
        authorization: "Bearer valid",
        proposalId: "proposal_distinct_follow_on_second_1",
        decision: "approve"
      })
    ).resolves.toEqual({
      status: "approved",
      cardId: expect.any(String)
    });

    const originalProposal = await repository.getProposal("proposal_distinct_follow_on_original_1");
    expect(originalProposal).toEqual(
      expect.objectContaining({
        status: "proposed"
      })
    );
  });

  it("approves an owner-conflict proposal by handing off the active lane to the requested persona", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const parentCard = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertProposal({
      id: "proposal_owner_conflict_handoff_1",
      runId: board.runId,
      parentCardId: parentCard.cardId,
      requestedByCardId: parentCard.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Research the pricing lane",
      deliverableType: "pricing_review",
      status: "proposed"
    });

    await expect(
      service.decideProposal({
        authorization: "Bearer valid",
        proposalId: "proposal_owner_conflict_handoff_1",
        decision: "approve",
        targetCardId: parentCard.cardId
      })
    ).resolves.toEqual({
      status: "approved",
      cardId: parentCard.cardId
    });

    const persistedCard = await repository.getCard(parentCard.cardId);
    expect(persistedCard).toEqual(
      expect.objectContaining({
        id: parentCard.cardId,
        persona: "researcher",
        title: "Research the pricing lane",
        deliverableType: "pricing_review"
      })
    );

    const proposal = await repository.getProposal("proposal_owner_conflict_handoff_1");
    expect(proposal).toEqual(
      expect.objectContaining({
        status: "approved",
        approvedCardId: parentCard.cardId,
        resolution: "handoff_existing_lane"
      })
    );

    const laneEvents = await repository.listEventsForCard(parentCard.cardId);
    expect(laneEvents.some((event) => event.eventKind === "lane_handed_off")).toBe(true);
    expect(laneEvents.some((event) => event.eventKind === "proposal_absorbed")).toBe(true);

    const hydratedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const handedOffCard = hydratedBoard.cards.find((card) => card.id === parentCard.cardId);
    expect(handedOffCard?.persona).toBe("RESEARCHER");
    expect(handedOffCard?.title).toBe("Research the pricing lane");
    expect(handedOffCard?.activity.some((item) => item.label.includes("CEO handed this lane from CFO to RESEARCHER."))).toBe(
      true
    );
    expect(
      hydratedBoard.recentDecisions.some(
        (decision) =>
          decision.label === "CEO handed the active pricing review lane to RESEARCHER." &&
          decision.policyReasonLabel === "Waiting on current lane owner" &&
          decision.recommendationSummary ===
            "Hand this pricing review lane to RESEARCHER and continue the work inside the existing board lane."
        )
    ).toBe(true);
    expect(hydratedBoard.followThroughItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "handed_off_lane",
          proposalId: "proposal_owner_conflict_handoff_1",
          targetCardId: parentCard.cardId,
          summary: "CEO handed the active pricing review lane to RESEARCHER.",
          persona: "RESEARCHER",
          deliverableLabel: "Pricing Review",
          policyReasonLabel: "Waiting on current lane owner",
          resolutionLabel: "Handoff Existing Lane",
          recommendationSummary:
            "Hand this pricing review lane to RESEARCHER and continue the work inside the existing board lane."
        })
      ])
    );
    expect(handedOffCard?.detailSections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "snapshot",
          body: "RESEARCHER should resume this handed-off pricing review lane from CFO: Pressure-test the pricing lane."
        }),
        expect.objectContaining({
          id: "absorbed-work",
          body: expect.stringContaining("CFO: Pressure-test the pricing lane")
        }),
        expect.objectContaining({
          id: "continuity-memory",
          body: expect.stringContaining("Source: Lane handoff")
        })
      ])
    );
    expect(hydratedBoard.pendingApprovals).toEqual([]);
  });

  it("falls back to deferred governance when an owner-conflict approval receives a stale handoff target", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const parentCard = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertProposal({
      id: "proposal_owner_conflict_stale_target_1",
      runId: board.runId,
      parentCardId: parentCard.cardId,
      requestedByCardId: parentCard.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Research the pricing lane",
      deliverableType: "pricing_review",
      status: "proposed"
    });

    await expect(
      service.decideProposal({
        authorization: "Bearer valid",
        proposalId: "proposal_owner_conflict_stale_target_1",
        decision: "approve",
        targetCardId: "card_missing"
      })
    ).resolves.toEqual({
      status: "deferred"
    });

    const proposal = await repository.getProposal("proposal_owner_conflict_stale_target_1");
    expect(proposal).toEqual(
      expect.objectContaining({
        status: "deferred",
        decisionNote: "CEO deferred this proposal because another active persona already owns that deliverable lane."
      })
    );
  });

  it("uses the live governance reason when the CEO manually defers a request", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const parentCard = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertProposal({
      id: "proposal_manual_owner_conflict_1",
      runId: board.runId,
      parentCardId: parentCard.cardId,
      requestedByCardId: parentCard.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Research the pricing lane",
      deliverableType: "pricing_review",
      status: "proposed"
    });

    await expect(
      service.decideProposal({
        authorization: "Bearer valid",
        proposalId: "proposal_manual_owner_conflict_1",
        decision: "defer"
      })
    ).resolves.toEqual({ status: "deferred" });

    const deferredBoard = await service.listBoardState({ authorization: "Bearer valid" });
    expect(deferredBoard.pendingApprovals).toEqual([
      expect.objectContaining({
        id: "proposal_manual_owner_conflict_1",
        statusLabel: "Deferred for later CEO review",
        policyReasonLabel: "Waiting on current lane owner",
        nextReviewTrigger: "Review again when the current deliverable owner clears or hands off the lane."
      })
    ]);
    expect(
      deferredBoard.recentDecisions.some(
        (decision) =>
          decision.label === "CEO deferred a pricing review request for RESEARCHER." &&
          decision.policyReasonLabel === "Waiting on current lane owner" &&
          decision.recommendationSummary ===
            "Keep advancing the current pricing review lane and revisit this request after a clear handoff." &&
          decision.objectionSummary === "Wait for the current pricing review owner to clear or hand off that lane first."
      )
    ).toBe(true);
  });

  it("defers follow-on approvals once the run is already assembling completed work", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });

    const assemblingRun = await repository.findLatestRunForTenantWorkflow({
      tenantId: "tenant_123",
      workflowId: "wf_connect_first_workflow"
    });
    expect(assemblingRun?.state).toBe("assembling");

    await repository.insertProposal({
      id: "proposal_completed_lane_assembling_1",
      runId: board.runId,
      parentCardId: created.cardId,
      requestedByCardId: created.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Research the next pricing iteration",
      deliverableType: "pricing_review",
      status: "proposed"
    });

    await expect(
      service.decideProposal({
        authorization: "Bearer valid",
        proposalId: "proposal_completed_lane_assembling_1",
        decision: "approve"
      })
    ).resolves.toEqual({
      status: "deferred"
    });

    const deferredBoard = await service.listBoardState({ authorization: "Bearer valid" });
    expect(deferredBoard.pendingApprovals).toEqual([
      expect.objectContaining({
        id: "proposal_completed_lane_assembling_1",
        statusLabel: "Deferred for later CEO review",
        policyReasonLabel: "Completed lanes only",
        nextReviewTrigger: "Review again only if the CEO deliberately starts a fresh board cycle for follow-on work."
      })
    ]);
    expect(
      deferredBoard.recentDecisions.some(
        (decision) =>
          decision.label === "CEO deferred a pricing review request for RESEARCHER." &&
          decision.policyReasonLabel === "Completed lanes only" &&
          decision.recommendationSummary ===
            "Package only completed lanes into the tenant-facing board outcome until the CEO deliberately starts a fresh board cycle." &&
          decision.objectionSummary ===
            "Do not reopen new pricing review work until the CEO deliberately starts a fresh board cycle."
      )
    ).toBe(true);

    const run = await repository.findLatestRunForTenantWorkflow({
      tenantId: "tenant_123",
      workflowId: "wf_connect_first_workflow"
    });
    expect(run?.state).toBe("assembling");
  });

  it("keeps a done run terminal when follow-on proposals are deferred under completed-lanes-only policy", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });
    await service.completeRun({
      authorization: "Bearer valid",
      runId: board.runId,
      completionSummary: "The CEO packaged the final business-facing outcome."
    });

    await repository.insertProposal({
      id: "proposal_completed_lane_done_1",
      runId: board.runId,
      parentCardId: created.cardId,
      requestedByCardId: created.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Research the next pricing iteration",
      deliverableType: "pricing_review",
      status: "proposed"
    });

    await expect(
      service.decideProposal({
        authorization: "Bearer valid",
        proposalId: "proposal_completed_lane_done_1",
        decision: "approve"
      })
    ).resolves.toEqual({
      status: "deferred"
    });

    const run = await repository.findLatestRunForTenantWorkflow({
      tenantId: "tenant_123",
      workflowId: "wf_connect_first_workflow"
    });
    expect(run?.state).toBe("done");
  });

  it("starts a fresh board cycle and carries only completed-lanes-only deferred proposals forward", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });
    await service.completeRun({
      authorization: "Bearer valid",
      runId: board.runId,
      completionSummary: "The CEO packaged the final business-facing outcome."
    });

    await repository.insertProposal({
      id: "proposal_fresh_cycle_reopen_1",
      runId: board.runId,
      parentCardId: created.cardId,
      requestedByCardId: created.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Research the next pricing iteration",
      deliverableType: "pricing_review",
      status: "proposed"
    });
    await service.decideProposal({
      authorization: "Bearer valid",
      proposalId: "proposal_fresh_cycle_reopen_1",
      decision: "approve"
    });

    await repository.insertProposal({
      id: "proposal_fresh_cycle_hold_1",
      runId: board.runId,
      parentCardId: created.cardId,
      requestedByCardId: created.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief",
      status: "deferred"
    });
    await repository.insertDecision({
      id: "decision_fresh_cycle_hold_1",
      runId: board.runId,
      tenantId: "tenant_123",
      actorUserId: "user_123",
      decisionKind: "proposal_deferred",
      cardId: created.cardId,
      proposalId: "proposal_fresh_cycle_hold_1",
      targetCardId: null,
      persona: "researcher",
      deliverableType: "research_brief",
      policyReason: "lane_cap",
      resolution: null,
      decisionNote: "Wait for the active lane count to drop first.",
      recommendationSummary: "Finish or close one active lane before reopening this research brief request.",
      objectionSummary: "Hold this research brief request until the active lane count drops.",
      createdAt: new Date().toISOString()
    });

    const onFreshCycleDispatch = vi.fn().mockResolvedValue(undefined);
    const serviceWithDispatch = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      onFreshCycleDispatch,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const reopened = await serviceWithDispatch.startFreshCycle({
      authorization: "Bearer valid",
      runId: board.runId
    });

    const latestBoard = await serviceWithDispatch.listBoardState({ authorization: "Bearer valid" });
    const oldRun = await repository.getRun(board.runId);

    expect(reopened).toEqual({
      runId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      reopenedProposalCount: 1
    });
    expect(onFreshCycleDispatch).toHaveBeenCalledWith({
      tenantId: "tenant_123",
      userId: "user_123",
      runId: reopened.runId,
      workflowId: "wf_connect_first_workflow",
      mode: "reopen_deferred",
      reopenedProposalCount: 1
    });
    expect(reopened.runId).not.toBe(board.runId);
    expect(oldRun?.state).toBe("done");
    expect(latestBoard.runId).toBe(reopened.runId);
    expect(latestBoard.pendingApprovals).toEqual([
      expect.objectContaining({
        requestedByPersona: "CFO",
        targetPersona: "RESEARCHER",
        statusLabel: "Pending CEO approval",
        title: "Research the next pricing iteration"
      })
    ]);
    expect(latestBoard.pendingApprovals.some((approval) => approval.title === "Gather competitor price anchors")).toBe(false);
  });

  it("fails closed when a fresh board cycle is requested before the run is packaged", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });

    await expect(
      service.startFreshCycle({
        authorization: "Bearer valid",
        runId: board.runId
      })
    ).rejects.toThrow(/fresh cycle can only start from a packaged run/i);
  });

  it("fails closed when the same packaged run is reopened twice", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });
    await service.completeRun({
      authorization: "Bearer valid",
      runId: board.runId,
      completionSummary: "The CEO packaged the final business-facing outcome."
    });

    await service.startFreshCycle({
      authorization: "Bearer valid",
      runId: board.runId
    });

    await expect(
      service.startFreshCycle({
        authorization: "Bearer valid",
        runId: board.runId
      })
    ).rejects.toThrow(/latest packaged run/i);
  });

  it("fails closed when a historical packaged run is reopened after a newer cycle exists", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const firstBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });
    await service.completeRun({
      authorization: "Bearer valid",
      runId: firstBoard.runId,
      completionSummary: "The CEO packaged the final business-facing outcome."
    });

    const secondCycle = await service.startFreshCycle({
      authorization: "Bearer valid",
      runId: firstBoard.runId
    });
    const secondBoard = await service.listBoardState({ authorization: "Bearer valid" });
    expect(secondBoard.runId).toBe(secondCycle.runId);
    const secondCreated = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane again",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: secondCreated.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: secondCreated.cardId,
      state: "done",
      resultSummary: "Second cycle packaged its own pricing outcome."
    });
    await service.completeRun({
      authorization: "Bearer valid",
      runId: secondCycle.runId,
      completionSummary: "The CEO packaged the second-cycle outcome."
    });
    await service.startFreshCycle({
      authorization: "Bearer valid",
      runId: secondCycle.runId
    });

    await expect(
      service.startFreshCycle({
        authorization: "Bearer valid",
        runId: firstBoard.runId
      })
    ).rejects.toThrow(/latest packaged run/i);
  });

  it("can start a completely clean fresh board cycle without carrying deferred follow-on work forward", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });
    await service.completeRun({
      authorization: "Bearer valid",
      runId: board.runId,
      completionSummary: "The CEO packaged the final business-facing outcome."
    });

    await repository.insertProposal({
      id: "proposal_clean_cycle_1",
      runId: board.runId,
      parentCardId: created.cardId,
      requestedByCardId: created.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Research the next pricing iteration",
      deliverableType: "research_brief",
      status: "deferred"
    });
    await repository.insertDecision({
      id: "decision_clean_cycle_1",
      runId: board.runId,
      tenantId: "tenant_123",
      actorUserId: "user_123",
      decisionKind: "proposal_deferred",
      cardId: created.cardId,
      proposalId: "proposal_clean_cycle_1",
      targetCardId: null,
      persona: "researcher",
      deliverableType: "research_brief",
      policyReason: "completed_lanes_only",
      resolution: null,
      decisionNote: "Hold this for the next cycle if the CEO chooses to reopen it.",
      recommendationSummary: "Reopen this research brief only when the next cycle needs pricing follow-through.",
      objectionSummary: "This research brief stays deferred while the current board cycle is already packaged.",
      createdAt: new Date().toISOString()
    });

    const reopened = await service.startFreshCycle({
      authorization: "Bearer valid",
      runId: board.runId,
      mode: "clean"
    });
    const latestBoard = await service.listBoardState({ authorization: "Bearer valid" });

    expect(reopened).toEqual({
      runId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      reopenedProposalCount: 0
    });
    expect(latestBoard.runId).toBe(reopened.runId);
    expect(latestBoard.pendingApprovals).toEqual([]);
  });

  it("keeps raw defer notes out of the tenant-facing board activity feed", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertProposal({
      id: "proposal_private_note_1",
      runId: board.runId,
      parentCardId: created.cardId,
      requestedByCardId: created.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief",
      status: "proposed"
    });

    await service.decideProposal({
      authorization: "Bearer valid",
      proposalId: "proposal_private_note_1",
      decision: "defer",
      decisionNote: "Internal note: do not show this phrase to the tenant."
    });

    const hydratedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const cfoCard = hydratedBoard.cards.find((card) => card.id === created.cardId);
    expect(JSON.stringify(cfoCard?.activity)).not.toContain("Internal note: do not show this phrase to the tenant.");
    expect(cfoCard?.activity.some((item) => item.label.includes("CEO deferred this research brief request"))).toBe(true);
  });

  it("keeps denied proposal activity policy-aware without echoing raw notes", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertProposal({
      id: "proposal_private_deny_note_1",
      runId: board.runId,
      parentCardId: created.cardId,
      requestedByCardId: created.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "pricing_review",
      status: "proposed"
    });

    await service.decideProposal({
      authorization: "Bearer valid",
      proposalId: "proposal_private_deny_note_1",
      decision: "deny",
      decisionNote: "Internal note: the CFO was too pushy here."
    });

    const hydratedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const cfoCard = hydratedBoard.cards.find((card) => card.id === created.cardId);
    expect(JSON.stringify(cfoCard?.activity)).not.toContain("Internal note: the CFO was too pushy here.");
    expect(cfoCard?.activity.some((item) => item.label.includes("current lane owner still controls that work"))).toBe(
      true
    );
    expect(cfoCard?.activity.some((item) => item.label.includes("approved workflow boundary"))).toBe(false);
  });

  it("reuses an open persona deliverable lane instead of opening a duplicate card", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    const existingLane = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief"
    }));

    await repository.insertProposal({
      id: "proposal_duplicate_lane_1",
      runId: board.runId,
      parentCardId: created.cardId,
      requestedByCardId: created.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Refresh pricing anchors",
      deliverableType: "research_brief",
      status: "proposed"
    });

    await expect(
      service.approveProposal({
        authorization: "Bearer valid",
        proposalId: "proposal_duplicate_lane_1"
      })
    ).resolves.toEqual({ cardId: existingLane.cardId });

    const hydrated = await service.listBoardState({ authorization: "Bearer valid" });
    const pricingReviewCards = hydrated.cards.filter(
      (card) => card.persona === "RESEARCHER" && card.deliverableLabel === "Research Brief"
    );
    const laneCard = pricingReviewCards[0];
    const laneEvents = await repository.listEventsForCard(existingLane.cardId);
    const laneContinuity = await repository.getCardContinuity(existingLane.cardId);
    const parentEvents = await repository.listEventsForCard(created.cardId);
    expect(pricingReviewCards).toHaveLength(1);
    expect(hydrated.pendingApprovals).toEqual([]);
    expect(laneEvents.some((event) => event.eventKind === "proposal_absorbed")).toBe(true);
    expect(laneContinuity).toEqual(
      expect.objectContaining({
        cardId: existingLane.cardId,
        absorbedWorkItems: ["update_existing_lane|CFO: Refresh pricing anchors"],
        continuitySummary:
          "RESEARCHER should fold the absorbed follow-on work from CFO: Refresh pricing anchors into this research brief lane."
      })
    );
    expect(laneCard?.activity.some((item) => item.label.includes('folded "Refresh pricing anchors"'))).toBe(true);
    expect(laneCard?.detailSections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "snapshot",
          body:
            "RESEARCHER should fold the absorbed follow-on work from CFO: Refresh pricing anchors into this research brief lane."
        }),
        expect.objectContaining({
          id: "absorbed-work",
          body: expect.stringContaining("CFO: Refresh pricing anchors")
        })
      ])
    );
    expect(parentEvents.at(-1)?.eventKind).toBe("comment_added");
  });

  it("does not duplicate approval notes when a proposal folds back into its own lane", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const existingLane = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief"
    }));

    await repository.insertProposal({
      id: "proposal_same_lane_1",
      runId: board.runId,
      parentCardId: existingLane.cardId,
      requestedByCardId: existingLane.cardId,
      requestedByPersona: "researcher",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief",
      status: "proposed"
    });

    await expect(
      service.approveProposal({
        authorization: "Bearer valid",
        proposalId: "proposal_same_lane_1"
      })
    ).resolves.toEqual({ cardId: existingLane.cardId });

    const laneEvents = await repository.listEventsForCard(existingLane.cardId);
    const absorbedEvents = laneEvents.filter((event) => event.eventKind === "proposal_absorbed");
    const approvalNotes = laneEvents.filter((event) => event.eventKind === "comment_added");
    expect(absorbedEvents).toHaveLength(1);
    expect(approvalNotes).toHaveLength(1);
  });

  it("keeps reused-lane approvals idempotent after a proposal is already absorbed", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const existingLane = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief"
    }));

    await repository.insertProposal({
      id: "proposal_idempotent_reuse_1",
      runId: board.runId,
      parentCardId: existingLane.cardId,
      requestedByCardId: existingLane.cardId,
      requestedByPersona: "researcher",
      persona: "researcher",
      title: "Refresh pricing anchors",
      deliverableType: "research_brief",
      status: "proposed"
    });

    await expect(
      service.approveProposal({
        authorization: "Bearer valid",
        proposalId: "proposal_idempotent_reuse_1"
      })
    ).resolves.toEqual({ cardId: existingLane.cardId });

    await expect(
      service.approveProposal({
        authorization: "Bearer valid",
        proposalId: "proposal_idempotent_reuse_1"
      })
    ).resolves.toEqual({ cardId: existingLane.cardId });

    const laneEvents = await repository.listEventsForCard(existingLane.cardId);
    expect(laneEvents.filter((event) => event.eventKind === "proposal_absorbed")).toHaveLength(1);
  });

  it("reopens a completed same-lane card for a bounded refinement while the board cycle is still live", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const cfoLane = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    const researcherLane = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief"
    }));

    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: cfoLane.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: cfoLane.cardId,
      state: "waiting",
      resumeSummary: "CFO is waiting for refreshed research before revising the pricing lane."
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: researcherLane.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: researcherLane.cardId,
      state: "done",
      resultSummary: "Initial competitor pricing anchors are recorded."
    });

    await repository.insertProposal({
      id: "proposal_reopen_done_lane_1",
      runId: board.runId,
      parentCardId: researcherLane.cardId,
      requestedByCardId: researcherLane.cardId,
      requestedByPersona: "researcher",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief",
      status: "proposed"
    });

    await expect(
      service.approveProposal({
        authorization: "Bearer valid",
        proposalId: "proposal_reopen_done_lane_1"
      })
    ).resolves.toEqual({ cardId: researcherLane.cardId });

    const reopenedLane = await repository.getCard(researcherLane.cardId);
    const laneEvents = await repository.listEventsForCard(researcherLane.cardId);
    const continuity = await repository.getCardContinuity(researcherLane.cardId);
    const proposal = await repository.getProposal("proposal_reopen_done_lane_1");
    const run = await repository.findLatestRunForTenantWorkflow({
      tenantId: "tenant_123",
      workflowId: "wf_connect_first_workflow"
    });
    const hydrated = await service.listBoardState({ authorization: "Bearer valid" });
    const hydratedLane = hydrated.cards.find((card) => card.id === researcherLane.cardId);

    expect(reopenedLane).toEqual(
      expect.objectContaining({
        id: researcherLane.cardId,
        state: "approved"
      })
    );
    expect(laneEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventKind: "state_changed",
          payload: expect.objectContaining({ from: "done", to: "approved" })
        }),
        expect.objectContaining({
          eventKind: "proposal_absorbed"
        })
      ])
    );
    expect(continuity).toEqual(
      expect.objectContaining({
        cardId: researcherLane.cardId,
        latestResultSummary: "Initial competitor pricing anchors are recorded.",
        continuitySummary:
          "RESEARCHER should fold the absorbed follow-on work from RESEARCHER: Gather competitor price anchors into this research brief lane."
      })
    );
    expect(proposal).toEqual(
      expect.objectContaining({
        status: "approved",
        approvedCardId: researcherLane.cardId,
        resolution: "update_existing_lane"
      })
    );
    expect(run?.state).toBe("waiting");
    expect(hydratedLane?.lane).toBe("planning");
    expect(hydratedLane?.activity.some((item) => item.label.includes("reopened this completed research brief lane"))).toBe(
      true
    );
    expect(hydratedLane?.detailSections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "continuity-memory",
          body: expect.stringContaining("Source: Proposal absorbed")
        }),
        expect.objectContaining({
          id: "continuity-memory",
          body: expect.stringContaining("Latest outcome memory: Initial competitor pricing anchors are recorded.")
        })
      ])
    );
    expect(hydrated.memoryBoundary.exportCandidates).toEqual([
      expect.objectContaining({
        id: "governance_history_export",
        label: "Governance history export",
        itemCount: 2,
        readinessLabel: "Ready now",
        exportSequenceLabel: "Foundational export sequence",
        exportDependencyPolicyLabel: "Independent export candidate",
        memoryPlacementLabel: "Governance history note",
        syncStrategyLabel: "Append history entry",
        exportRequestShapeLabel: "Single-record export request",
        exportConfirmationRequirementLabel: "Tenant export confirmation",
        exportRecoveryPathLabel: "Retry latest record export",
        exportPayloadShapeLabel: "Governance history record",
        idempotencyPolicyLabel: "Deterministic upsert",
        replaySafetyLabel: "Replay-safe",
        conflictPolicyLabel: "Append or upsert",
        exportAtomicityLabel: "Record-level atomic",
        exportDerivationBasisLabel: "Decision-history-derived",
        exportRevisionPolicyLabel: "Append new revision",
        exportFreshnessSourceLabel: "Latest record state",
        exportValidationBoundaryLabel: "Record-level validation",
        exportCompletenessRuleLabel: "Self-contained record",
        exportSensitivityLabel: "Tenant business context",
        exportAudienceBoundaryLabel: "Tenant governance-history readers",
        exportSanitizationPolicyLabel: "Export as recorded",
        exportRedactionBoundaryLabel: "Governance-safe redaction",
        exportSourceDisclosurePolicyLabel: "Decision summary only",
        candidateClassLabel: "Governance history",
        durabilityConditionLabel: "Stable when recorded",
        ownershipBoundaryLabel: "Tenant-owned later",
        promotionMutabilityLabel: "Append-only history",
        promotionScopeLabel: "Single-record export",
        identityStabilityLabel: "Stable record identity",
        auditBackingLabel: "Decision-ledger-backed",
        concurrencyBoundaryLabel: "Independent export safe",
        recordTargetLabel: "Governance history record",
        promotionAuthorityLabel: "Tenant explicit export",
        promotionTriggerLabel: "Tenant export request",
        exportActions: expect.arrayContaining([
          expect.objectContaining({
            actionRoute: "export-preflight",
            actionLabel: "Run export preflight"
          }),
          expect.objectContaining({
            actionRoute: "export-dry-run",
            actionLabel: "Preview Obsidian export bundle"
          }),
          expect.objectContaining({
            actionRoute: "governance-history-export",
            actionLabel: "Build governance history export"
          })
        ])
      })
    ]);
    expect(hydrated.memoryBoundary.independentExportSafeCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.requiresClosureSnapshotCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.exportCandidateConcurrencySummary).toContain("concurrency-safe for later independent export");
    expect(hydrated.memoryBoundary.tenantBusinessContextCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.packageConsumerAudienceCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.exportCandidateSensitivitySummary).toContain("tenant business context");
    expect(hydrated.memoryBoundary.exportCandidateAudienceSummary).toContain("tenant governance-history readers");
    expect(hydrated.memoryBoundary.exportCandidateSanitizationSummary).toContain("exported as recorded");
    expect(hydrated.memoryBoundary.exportCandidateRedactionSummary).toContain("governance-safe redaction");
    expect(hydrated.memoryBoundary.decisionSummaryOnlyCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.closureSnapshotSummaryOnlyCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.singleRecordExportRequestCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.packageBundleExportRequestCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.tenantExportConfirmationCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.boardClosureThenTenantExportConfirmationCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.retryLatestRecordExportCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.rerunAfterBoardClosureSnapshotCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.governanceHistoryNoteCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.packageRecordFolderCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.appendHistoryEntryCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.replacePackageSnapshotAfterClosureCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.readyForTenantExportCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.awaitingBoardClosureCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.tenantExportAvailableNextStepCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.boardClosureThenTenantExportNextStepCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.tenantExportActionFamilyCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.boardClosureActionFamilyCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.governanceHistoryCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.packagedOutputCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.stableWhenRecordedCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.stableAfterBoardClosureCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.tenantOwnedLaterCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.governanceHistoryRecordCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.packageBundleRecordCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.tenantExplicitExportAuthorityCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.boardClosureThenTenantExportAuthorityCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.explicitExportLaterCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.afterBoardClosesThenExportCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.recentDecisionsSourceCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.completionPackageSurfaceCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.readyForExplicitExportCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.afterBoardClosureThenExportCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.noPromotionBlockerCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.boardClosureRequiredCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.tenantExportRequestCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.boardClosureTriggerCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.standaloneExportRecordCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.packageRecordSetCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.phaseOneExportCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.phaseTwoExportCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.appendOnlyHistoryCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.replaceableSnapshotCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.singleRecordExportScopeCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.packageRecordSetExportScopeCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.stableIdentityCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.closureFinalizedIdentityCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.exportCandidateSourceDisclosureSummary).toContain("decision summaries only");
    expect(hydrated.memoryBoundary.exportCandidateRequestShapeSummary).toContain("single-record export requests");
    expect(hydrated.memoryBoundary.exportCandidateConfirmationSummary).toContain("tenant export confirmation");
    expect(hydrated.memoryBoundary.exportCandidateRecoveryPathSummary).toContain("retries the latest record export");
    expect(hydrated.memoryBoundary.exportCandidatePlacementSummary).toContain("governance history notes");
    expect(hydrated.memoryBoundary.exportCandidateSyncStrategySummary).toContain("appends history entries");
    expect(hydrated.memoryBoundary.exportCandidateStateSummary).toContain("ready for tenant export later");
    expect(hydrated.memoryBoundary.exportCandidateNextStepSummary).toContain("ready for a later tenant export step");
    expect(hydrated.memoryBoundary.exportCandidateActionFamilySummary).toContain("tenant export family");
    expect(hydrated.memoryBoundary.exportCandidateClassSummary).toContain("governance history");
    expect(hydrated.memoryBoundary.exportCandidateDurabilitySummary).toContain("stable when recorded");
    expect(hydrated.memoryBoundary.exportCandidateOwnershipSummary).toContain("tenant-owned later");
    expect(hydrated.memoryBoundary.exportCandidateRecordTargetSummary).toContain("governance history records");
    expect(hydrated.memoryBoundary.exportCandidateAuthoritySummary).toContain("tenant-controlled for later explicit export");
    expect(hydrated.memoryBoundary.exportCandidateEligibilitySummary).toContain("eligible for later explicit export");
    expect(hydrated.memoryBoundary.exportCandidateSourceSurfaceSummary).toContain("recent decisions");
    expect(hydrated.memoryBoundary.exportCandidatePathSummary).toContain("ready-for-explicit-export path");
    expect(hydrated.memoryBoundary.exportCandidateBlockerSummary).toContain("no promotion blocker");
    expect(hydrated.memoryBoundary.exportCandidateTriggerSummary).toContain("later tenant export request");
    expect(hydrated.memoryBoundary.exportCandidateAssemblySummary).toContain("standalone export record");
    expect(hydrated.memoryBoundary.exportCandidatePhaseSummary).toContain("phase-one governance export");
    expect(hydrated.memoryBoundary.exportCandidateMutabilitySummary).toContain("append-only history");
    expect(hydrated.memoryBoundary.exportCandidateScopeSummary).toContain("single-record export scope");
    expect(hydrated.memoryBoundary.exportCandidateIdentitySummary).toContain("stable record identity");
    expect(hydrated.memoryBoundary.governanceHistoryPayloadCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.packageSnapshotBundleCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.deterministicUpsertCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.boardClosureSnapshotOnceCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.replaySafeCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.freshClosureSnapshotReplayCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.appendOrUpsertConflictCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.replaceLatestClosureSnapshotCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.recordLevelAtomicCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.closureBundleAtomicCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.decisionHistoryDerivedCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.boardClosureSnapshotDerivedCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.appendNewRevisionCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.replaceClosureBundleRevisionCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.latestRecordStateCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.latestBoardClosureSnapshotCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.recordLevelValidationCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.closureBundleValidationCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.selfContainedRecordCandidateGroupCount).toBe(1);
    expect(hydrated.memoryBoundary.boardClosureCompleteBundleCandidateGroupCount).toBe(0);
    expect(hydrated.memoryBoundary.exportCandidatePayloadShapeSummary).toContain("governance history record payloads");
    expect(hydrated.memoryBoundary.exportCandidateIdempotencySummary).toContain("deterministic upsert");
    expect(hydrated.memoryBoundary.exportCandidateReplaySafetySummary).toContain("replay-safe");
    expect(hydrated.memoryBoundary.exportCandidateConflictPolicySummary).toContain("append-or-upsert conflict handling");
    expect(hydrated.memoryBoundary.exportCandidateAtomicitySummary).toContain("record-level atomic exports");
    expect(hydrated.memoryBoundary.exportCandidateDerivationSummary).toContain("derived from decision history");
    expect(hydrated.memoryBoundary.exportCandidateRevisionSummary).toContain("appends as new revisions");
    expect(hydrated.memoryBoundary.exportCandidateFreshnessSummary).toContain("uses the latest record state");
    expect(hydrated.memoryBoundary.exportCandidateValidationSummary).toContain("validates at record level");
    expect(hydrated.memoryBoundary.exportCandidateCompletenessSummary).toContain("self-contained records");
  });

  it("runs bounded export preflight, dry-run, and governance-history export from the grouped candidate contract", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const initialBoard = await service.listBoardState({ authorization: "Bearer valid" });
    await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    const hydrated = await service.listBoardState({ authorization: "Bearer valid" });
    const candidate = hydrated.memoryBoundary.exportCandidates?.find((entry) => entry.id === "governance_history_export");
    const preflightAction = candidate?.exportActions?.find((entry) => entry.actionRoute === "export-preflight");
    const dryRunAction = candidate?.exportActions?.find((entry) => entry.actionRoute === "export-dry-run");
    const exportAction = candidate?.exportActions?.find((entry) => entry.actionRoute === "governance-history-export");

    expect(initialBoard.memoryBoundary.exportCandidates ?? []).toHaveLength(0);
    expect(candidate).toBeTruthy();
    expect(preflightAction).toBeTruthy();
    expect(dryRunAction).toBeTruthy();
    expect(exportAction).toBeTruthy();

    await expect(service.preflightExportCandidate({
      authorization: "Bearer valid",
      runId: hydrated.runId,
      candidateId: "governance_history_export",
      actionToken: preflightAction!.actionToken
    })).resolves.toMatchObject({
      candidateId: "governance_history_export",
      status: "ready",
      supportsDryRun: true,
      supportsExport: true
    });

    await expect(service.dryRunExportCandidate({
      authorization: "Bearer valid",
      runId: hydrated.runId,
      candidateId: "governance_history_export",
      actionToken: dryRunAction!.actionToken
    })).resolves.toMatchObject({
      candidateId: "governance_history_export",
      status: "ready",
      exportFormat: "obsidian_markdown_bundle",
      recordTarget: "governance_history_record",
      noteFileName: "wf_connect_first_workflow-governance-history.md",
      bundleId: expect.any(String),
      placement: expect.objectContaining({
        targetSystem: "obsidian_vault",
        vaultFolder: "wealth-factory/governance-history/wf_connect_first_workflow",
        primaryNotePath: "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md"
      }),
      files: expect.arrayContaining([
        expect.objectContaining({
          path: "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
          mediaType: "text/markdown"
        }),
        expect.objectContaining({
          path: "wealth-factory/governance-history/wf_connect_first_workflow/export-manifest.json",
          mediaType: "application/json"
        })
      ]),
      disclosureSummary: "Decision summary only",
      redactionSummary: "Governance-safe redaction"
    });

    await expect(service.exportGovernanceHistoryCandidate({
      authorization: "Bearer valid",
      runId: hydrated.runId,
      candidateId: "governance_history_export",
      actionToken: exportAction!.actionToken
    })).resolves.toMatchObject({
      candidateId: "governance_history_export",
      status: "export_ready",
      exportFormat: "obsidian_markdown_bundle",
      noteFileName: "wf_connect_first_workflow-governance-history.md",
      placement: expect.objectContaining({
        targetSystem: "obsidian_vault",
        primaryNotePath: "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md"
      }),
      files: expect.arrayContaining([
        expect.objectContaining({
          path: "wealth-factory/governance-history/wf_connect_first_workflow/export-manifest.json",
          mediaType: "application/json"
        })
      ])
    });
  });

  it("fails closed when a governance-history export token no longer matches the current candidate contract", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    const hydrated = await service.listBoardState({ authorization: "Bearer valid" });
    const staleToken = hydrated.memoryBoundary.exportCandidates
      ?.find((entry) => entry.id === "governance_history_export")
      ?.exportActions
      ?.find((entry) => entry.actionRoute === "export-preflight")
      ?.actionToken;

    await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief"
    }));

    await expect(service.preflightExportCandidate({
      authorization: "Bearer valid",
      runId: hydrated.runId,
      candidateId: "governance_history_export",
      actionToken: staleToken!
    })).rejects.toBeInstanceOf(HarnessActionContractConflictError);
  });

  it("publishes bounded audit events for export preflight, dry-run, and governance-history export without note content", async () => {
    const repository = createInMemoryHarnessRepository();
    const audit = vi.fn().mockResolvedValue(undefined);
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      audit,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    const hydrated = await service.listBoardState({ authorization: "Bearer valid" });
    const actions = hydrated.memoryBoundary.exportCandidates
      ?.find((entry) => entry.id === "governance_history_export")
      ?.exportActions ?? [];
    const preflightAction = actions.find((entry) => entry.actionRoute === "export-preflight");
    const dryRunAction = actions.find((entry) => entry.actionRoute === "export-dry-run");
    const exportAction = actions.find((entry) => entry.actionRoute === "governance-history-export");
    expect(preflightAction).toBeTruthy();
    expect(dryRunAction).toBeTruthy();
    expect(exportAction).toBeTruthy();
    audit.mockClear();

    await service.preflightExportCandidate({
      authorization: "Bearer valid",
      runId: hydrated.runId,
      candidateId: "governance_history_export",
      actionToken: preflightAction!.actionToken
    });
    await service.dryRunExportCandidate({
      authorization: "Bearer valid",
      runId: hydrated.runId,
      candidateId: "governance_history_export",
      actionToken: dryRunAction!.actionToken
    });
    await service.exportGovernanceHistoryCandidate({
      authorization: "Bearer valid",
      runId: hydrated.runId,
      candidateId: "governance_history_export",
      actionToken: exportAction!.actionToken
    });

    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant_123",
      actorUserId: "user_123",
      eventType: "harness.export_candidate_preflight_ready",
      entityType: "harness_export_candidate",
      metadata: expect.objectContaining({
        candidateId: "governance_history_export",
        runId: hydrated.runId,
        supportsDryRun: true,
        supportsExport: true
      })
    }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "harness.export_candidate_dry_run_built",
      metadata: expect.objectContaining({
        candidateId: "governance_history_export",
        bundleId: expect.any(String),
        primaryNotePath: "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
        fileCount: 2
      })
    }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "harness.governance_history_export_ready",
      metadata: expect.objectContaining({
        candidateId: "governance_history_export",
        idempotencyKey: expect.any(String),
        fileCount: 2
      })
    }));
    expect(JSON.stringify(audit.mock.calls)).not.toContain("# ");
  });

  it("dispatches a cloned private governance-history export-ready envelope", async () => {
    const repository = createInMemoryHarnessRepository();
    const onGovernanceHistoryExportReady = vi.fn().mockImplementation(async (dispatch: HarnessGovernanceHistoryExportReadyDispatch) => {
      dispatch.placement.primaryNotePath = "mutated-path.md";
      dispatch.files[0]!.path = "mutated-file.md";
      dispatch.files[0]!.content = "mutated";
    });
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      }),
      onGovernanceHistoryExportReady
    });

    await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    const hydrated = await service.listBoardState({ authorization: "Bearer valid" });
    const exportAction = hydrated.memoryBoundary.exportCandidates
      ?.find((entry) => entry.id === "governance_history_export")
      ?.exportActions?.find((entry) => entry.actionRoute === "governance-history-export");
    expect(exportAction).toBeTruthy();

    const result = await service.exportGovernanceHistoryCandidate({
      authorization: "Bearer valid",
      runId: hydrated.runId,
      candidateId: "governance_history_export",
      actionToken: exportAction!.actionToken
    });

    expect(onGovernanceHistoryExportReady).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant_123",
      userId: "user_123",
      runId: hydrated.runId,
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      candidateId: "governance_history_export",
      bundleId: expect.any(String),
      bundleRevision: expect.any(String),
      idempotencyKey: expect.any(String)
    }));
    expect(result.placement.primaryNotePath).toBe(
      "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md"
    );
    expect(result.files[0]?.path).toBe(
      "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md"
    );
    expect(result.files[0]?.content).toContain("# Bib Connect governance history");
  });

  it("issues a fresh governance-history bundle revision and idempotency key when export content changes", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    const initialBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const initialExportAction = initialBoard.memoryBoundary.exportCandidates
      ?.find((entry) => entry.id === "governance_history_export")
      ?.exportActions?.find((entry) => entry.actionRoute === "governance-history-export");
    expect(initialExportAction).toBeTruthy();

    const firstExport = await service.exportGovernanceHistoryCandidate({
      authorization: "Bearer valid",
      runId: initialBoard.runId,
      candidateId: "governance_history_export",
      actionToken: initialExportAction!.actionToken
    });

    await repository.insertDecision(createHarnessBoardDecisionRecord({
      runId: initialBoard.runId,
      tenantId: "tenant_123",
      actorUserId: "user_123",
      decisionKind: "proposal_deferred",
      cardId: created.cardId,
      persona: "researcher",
      deliverableType: "research_brief",
      policyReason: "lane_cap",
      decisionNote: "Keep this note inside runtime only.",
      recommendationSummary: "Wait for the current pricing lane to close before opening more research work.",
      objectionSummary: "Do not widen the current run while the pricing lane is still active."
    }));

    const refreshedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const refreshedExportAction = refreshedBoard.memoryBoundary.exportCandidates
      ?.find((entry) => entry.id === "governance_history_export")
      ?.exportActions?.find((entry) => entry.actionRoute === "governance-history-export");
    expect(refreshedExportAction).toBeTruthy();

    const secondExport = await service.exportGovernanceHistoryCandidate({
      authorization: "Bearer valid",
      runId: refreshedBoard.runId,
      candidateId: "governance_history_export",
      actionToken: refreshedExportAction!.actionToken
    });

    expect(secondExport.bundleId).not.toBe(firstExport.bundleId);
    expect(secondExport.bundleRevision).not.toBe(firstExport.bundleRevision);
    expect(secondExport.idempotencyKey).not.toBe(firstExport.idempotencyKey);
    expect(secondExport.latestDelivery.attemptCount).toBe(0);
    expect(secondExport.latestDelivery.contractFreshness).toBe("current_bundle");
  });

  it("surfaces a bounded governance-history delivery replay action when the latest delivery is export-ready or failed", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const dryRunAction = board.memoryBoundary.exportCandidates
      ?.find((entry) => entry.id === "governance_history_export")
      ?.exportActions?.find((entry) => entry.actionRoute === "export-dry-run");
    expect(dryRunAction).toBeTruthy();
    const dryRun = await service.dryRunExportCandidate({
      authorization: "Bearer valid",
      runId: board.runId,
      candidateId: "governance_history_export",
      actionToken: dryRunAction!.actionToken
    });
    await repository.upsertExportDelivery({
      id: "delivery_replay_test_1",
      runId: board.runId,
      tenantId: "tenant_123",
      workflowId: board.workflowId,
      packageId: board.packageId,
      candidateId: "governance_history_export",
      status: "delivery_failed",
      exportFormat: dryRun.exportFormat,
      recordTarget: "governance_history_record",
      bundleId: dryRun.bundleId,
      bundleRevision: dryRun.bundleRevision,
      idempotencyKey: "idempotency_replay_test_1",
      noteTitle: dryRun.noteTitle,
      noteFileName: dryRun.noteFileName,
      placementTargetSystem: dryRun.placement.targetSystem,
      vaultFolder: dryRun.placement.vaultFolder,
      primaryNotePath: dryRun.placement.primaryNotePath,
      syncStrategy: dryRun.placement.syncStrategy,
      confirmationRequirement: dryRun.placement.confirmationRequirement,
      files: dryRun.files,
      recordCount: dryRun.recordCount,
      disclosureSummary: dryRun.disclosureSummary,
      redactionSummary: dryRun.redactionSummary,
      attemptCount: 1,
      lastAttemptedAt: "2026-05-29T01:00:00.000Z",
      deliveredAt: null,
      writerKind: "obsidian_filesystem",
      deliveryReceipt: {},
      lastErrorCode: "writer_failed",
      lastErrorMessage: "Disk was temporarily unavailable",
      createdAt: "2026-05-29T01:00:00.000Z",
      updatedAt: "2026-05-29T01:00:00.000Z"
    });

    const hydrated = await service.listBoardState({ authorization: "Bearer valid" });
    const candidate = hydrated.memoryBoundary.exportCandidates?.find((entry) => entry.id === "governance_history_export");
    const replayAction = candidate?.exportActions?.find((entry) => entry.actionRoute === "governance-history-export-replay");

    expect(replayAction).toBeTruthy();
    expect(replayAction).toEqual(expect.objectContaining({
      actionLabel: "Replay governance history delivery"
    }));
    expect(candidate?.latestDelivery).toEqual(expect.objectContaining({
      contractFreshness: "current_bundle"
    }));
  });

  it("suppresses export replay actions while a governance-history delivery is already in progress", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    const board = await service.listBoardState({ authorization: "Bearer valid" });
    await repository.upsertExportDelivery({
      id: "delivery_in_progress_test_1",
      runId: board.runId,
      tenantId: "tenant_123",
      workflowId: board.workflowId,
      packageId: board.packageId,
      candidateId: "governance_history_export",
      status: "delivery_in_progress",
      exportFormat: "obsidian_markdown_bundle",
      recordTarget: "governance_history_record",
      bundleId: "bundle_in_progress_test_1",
      bundleRevision: "bundle_in_progress_revision_1",
      idempotencyKey: "idempotency_in_progress_test_1",
      noteTitle: "Governance history",
      noteFileName: "wf_connect_first_workflow-governance-history.md",
      placementTargetSystem: "obsidian_vault",
      vaultFolder: "wealth-factory/governance-history/wf_connect_first_workflow",
      primaryNotePath: "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
      syncStrategy: "append_history_entry",
      confirmationRequirement: "tenant_export_confirmation",
      files: [],
      recordCount: 2,
      disclosureSummary: "Decision summary only",
      redactionSummary: "Governance-safe redaction",
      attemptCount: 1,
      lastAttemptedAt: "2026-06-01T00:05:00.000Z",
      deliveredAt: null,
      writerKind: "obsidian_filesystem",
      deliveryReceipt: {},
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: "2026-06-01T00:05:00.000Z",
      updatedAt: "2026-06-01T00:05:00.000Z"
    });

    const hydrated = await service.listBoardState({ authorization: "Bearer valid" });
    const candidate = hydrated.memoryBoundary.exportCandidates?.find((entry) => entry.id === "governance_history_export");

    expect(candidate?.latestDelivery).toEqual(expect.objectContaining({
      status: "delivery_in_progress",
      statusLabel: "Delivery in progress",
      contractFreshness: "stale_bundle"
    }));
    expect(candidate?.exportActions?.find((entry) => entry.actionRoute === "governance-history-export-replay")).toBeUndefined();
    expect(candidate?.exportActions?.find((entry) => entry.actionRoute === "governance-history-export")).toBeTruthy();
  });

  it("replays the persisted governance-history delivery bundle through the private export-ready seam", async () => {
    const repository = createInMemoryHarnessRepository();
    const onGovernanceHistoryExportReady = vi.fn().mockImplementation(async (dispatch: HarnessGovernanceHistoryExportReadyDispatch) => {
      dispatch.files[0]!.content = "mutated";
    });
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      }),
      onGovernanceHistoryExportReady
    });

    await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const dryRunAction = board.memoryBoundary.exportCandidates
      ?.find((entry) => entry.id === "governance_history_export")
      ?.exportActions?.find((entry) => entry.actionRoute === "export-dry-run");
    expect(dryRunAction).toBeTruthy();
    const dryRun = await service.dryRunExportCandidate({
      authorization: "Bearer valid",
      runId: board.runId,
      candidateId: "governance_history_export",
      actionToken: dryRunAction!.actionToken
    });
    await repository.upsertExportDelivery({
      id: "delivery_replay_test_2",
      runId: board.runId,
      tenantId: "tenant_123",
      workflowId: board.workflowId,
      packageId: board.packageId,
      candidateId: "governance_history_export",
      status: "delivery_failed",
      exportFormat: dryRun.exportFormat,
      recordTarget: "governance_history_record",
      bundleId: dryRun.bundleId,
      bundleRevision: dryRun.bundleRevision,
      idempotencyKey: "idempotency_replay_test_2",
      noteTitle: dryRun.noteTitle,
      noteFileName: dryRun.noteFileName,
      placementTargetSystem: dryRun.placement.targetSystem,
      vaultFolder: dryRun.placement.vaultFolder,
      primaryNotePath: dryRun.placement.primaryNotePath,
      syncStrategy: dryRun.placement.syncStrategy,
      confirmationRequirement: dryRun.placement.confirmationRequirement,
      files: dryRun.files,
      recordCount: dryRun.recordCount,
      disclosureSummary: dryRun.disclosureSummary,
      redactionSummary: dryRun.redactionSummary,
      attemptCount: 1,
      lastAttemptedAt: "2026-05-29T01:00:00.000Z",
      deliveredAt: null,
      writerKind: "obsidian_filesystem",
      deliveryReceipt: {},
      lastErrorCode: "writer_failed",
      lastErrorMessage: "Disk was temporarily unavailable",
      createdAt: "2026-05-29T01:00:00.000Z",
      updatedAt: "2026-05-29T01:00:00.000Z"
    });

    const hydrated = await service.listBoardState({ authorization: "Bearer valid" });
    const replayAction = hydrated.memoryBoundary.exportCandidates
      ?.find((entry) => entry.id === "governance_history_export")
      ?.exportActions?.find((entry) => entry.actionRoute === "governance-history-export-replay");
    expect(replayAction).toBeTruthy();

    await expect(service.replayGovernanceHistoryDeliveryCandidate({
      authorization: "Bearer valid",
      runId: hydrated.runId,
      candidateId: "governance_history_export",
      actionToken: replayAction!.actionToken
    })).resolves.toMatchObject({
      candidateId: "governance_history_export",
      status: "delivery_replayed",
      idempotencyKey: "idempotency_replay_test_2",
      latestDelivery: {
        status: "export_ready"
      }
    });

    expect(onGovernanceHistoryExportReady).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "idempotency_replay_test_2",
      bundleId: dryRun.bundleId,
      bundleRevision: dryRun.bundleRevision
    }));
    await expect(repository.listExportDeliveriesForRun(hydrated.runId)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        idempotencyKey: "idempotency_replay_test_2",
        files: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining("# Bib Connect governance history")
          })
        ])
      })
    ]));
  });

  it("fails closed when a governance-history replay targets a stale stored bundle revision", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const exportAction = board.memoryBoundary.exportCandidates
      ?.find((entry) => entry.id === "governance_history_export")
      ?.exportActions?.find((entry) => entry.actionRoute === "governance-history-export");
    expect(exportAction).toBeTruthy();

    const firstExport = await service.exportGovernanceHistoryCandidate({
      authorization: "Bearer valid",
      runId: board.runId,
      candidateId: "governance_history_export",
      actionToken: exportAction!.actionToken
    });
    await repository.upsertExportDelivery({
      id: "delivery_replay_stale_governance_1",
      runId: board.runId,
      tenantId: "tenant_123",
      workflowId: board.workflowId,
      packageId: board.packageId,
      candidateId: "governance_history_export",
      status: "delivery_failed",
      exportFormat: firstExport.exportFormat,
      recordTarget: firstExport.recordTarget,
      bundleId: firstExport.bundleId,
      bundleRevision: firstExport.bundleRevision,
      idempotencyKey: firstExport.idempotencyKey,
      noteTitle: firstExport.noteTitle,
      noteFileName: firstExport.noteFileName,
      placementTargetSystem: firstExport.placement.targetSystem,
      vaultFolder: firstExport.placement.vaultFolder,
      primaryNotePath: firstExport.placement.primaryNotePath,
      syncStrategy: firstExport.placement.syncStrategy,
      confirmationRequirement: firstExport.placement.confirmationRequirement,
      files: firstExport.files,
      recordCount: firstExport.recordCount,
      disclosureSummary: firstExport.disclosureSummary,
      redactionSummary: firstExport.redactionSummary,
      attemptCount: 1,
      lastAttemptedAt: "2026-06-01T00:05:00.000Z",
      deliveredAt: null,
      writerKind: "obsidian_filesystem",
      deliveryReceipt: {},
      lastErrorCode: "writer_failed",
      lastErrorMessage: "Disk was temporarily unavailable",
      createdAt: "2026-06-01T00:05:00.000Z",
      updatedAt: "2026-06-01T00:05:00.000Z"
    });
    await repository.insertDecision(createHarnessBoardDecisionRecord({
      runId: board.runId,
      tenantId: "tenant_123",
      actorUserId: "user_123",
      decisionKind: "proposal_deferred",
      cardId: created.cardId,
      persona: "researcher",
      deliverableType: "research_brief",
      policyReason: "lane_cap",
      recommendationSummary: "Wait for the current pricing lane to close before opening more research work.",
      objectionSummary: "Do not widen the current run while the pricing lane is still active."
    }));

    const refreshedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const replayCandidate = refreshedBoard.memoryBoundary.exportCandidates
      ?.find((entry) => entry.id === "governance_history_export");
    const replayAction = replayCandidate?.exportActions?.find((entry) => entry.actionRoute === "governance-history-export-replay");
    expect(replayCandidate?.latestDelivery).toEqual(expect.objectContaining({
      contractFreshness: "stale_bundle"
    }));
    expect(replayAction).toBeUndefined();

    await expect(service.replayGovernanceHistoryDeliveryCandidate({
      authorization: "Bearer valid",
      runId: refreshedBoard.runId,
      candidateId: "governance_history_export"
    })).rejects.toThrow("Harness export action is not available for the current candidate contract");
  });

  it("runs bounded package-bundle dry-run and export from the grouped candidate contract after board closure", async () => {
    const repository = createInMemoryHarnessRepository();
    const onPackageBundleExportReady = vi.fn().mockResolvedValue(undefined);
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      }),
      onPackageBundleExportReady
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });
    await service.completeRun({
      authorization: "Bearer valid",
      runId: board.runId,
      completionSummary: "The CEO packaged the final business-facing outcome."
    });

    const hydrated = await service.listBoardState({ authorization: "Bearer valid" });
    const governanceExportAction = hydrated.memoryBoundary.exportCandidates
      ?.find((entry) => entry.id === "governance_history_export")
      ?.exportActions?.find((entry) => entry.actionRoute === "governance-history-export");
    expect(governanceExportAction).toBeTruthy();
    const governanceExport = await service.exportGovernanceHistoryCandidate({
      authorization: "Bearer valid",
      runId: hydrated.runId,
      candidateId: "governance_history_export",
      actionToken: governanceExportAction!.actionToken
    });
    await repository.upsertExportDelivery({
      id: "delivery_governance_dependency_test_1",
      runId: hydrated.runId,
      tenantId: "tenant_123",
      workflowId: hydrated.workflowId,
      packageId: hydrated.packageId,
      candidateId: "governance_history_export",
      status: "delivered",
      exportFormat: governanceExport.exportFormat,
      recordTarget: governanceExport.recordTarget,
      bundleId: governanceExport.bundleId,
      bundleRevision: governanceExport.bundleRevision,
      idempotencyKey: governanceExport.idempotencyKey,
      noteTitle: governanceExport.noteTitle,
      noteFileName: governanceExport.noteFileName,
      placementTargetSystem: governanceExport.placement.targetSystem,
      vaultFolder: governanceExport.placement.vaultFolder,
      primaryNotePath: governanceExport.placement.primaryNotePath,
      syncStrategy: governanceExport.placement.syncStrategy,
      confirmationRequirement: governanceExport.placement.confirmationRequirement,
      files: governanceExport.files,
      recordCount: governanceExport.recordCount,
      disclosureSummary: governanceExport.disclosureSummary,
      redactionSummary: governanceExport.redactionSummary,
      attemptCount: 1,
      lastAttemptedAt: "2026-06-01T00:10:00.000Z",
      deliveredAt: "2026-06-01T00:10:01.000Z",
      writerKind: "obsidian_filesystem",
      deliveryReceipt: {
        primaryNotePath: governanceExport.placement.primaryNotePath,
        writtenFileCount: governanceExport.files.length
      },
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: "2026-06-01T00:10:00.000Z",
      updatedAt: "2026-06-01T00:10:01.000Z"
    });

    const exportReadyBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const candidate = exportReadyBoard.memoryBoundary.exportCandidates?.find((entry) => entry.id === "package_bundle_export");
    const dryRunAction = candidate?.exportActions?.find((entry) => entry.actionRoute === "export-dry-run");
    const exportAction = candidate?.exportActions?.find((entry) => entry.actionRoute === "package-bundle-export");
    expect(candidate?.readiness).toBe("ready_now");
    expect(dryRunAction).toBeTruthy();
    expect(exportAction).toBeTruthy();

    await expect(service.dryRunExportCandidate({
      authorization: "Bearer valid",
      runId: hydrated.runId,
      candidateId: "package_bundle_export",
      actionToken: dryRunAction!.actionToken
    })).resolves.toMatchObject({
      candidateId: "package_bundle_export",
      status: "ready",
      recordTarget: "package_deliverable_record",
      noteFileName: "wf_connect_first_workflow-package-bundle.md",
      placement: expect.objectContaining({
        targetSystem: "obsidian_vault",
        vaultFolder: "wealth-factory/package-bundles/wf_connect_first_workflow"
      }),
      files: expect.arrayContaining([
        expect.objectContaining({
          path: "wealth-factory/package-bundles/wf_connect_first_workflow/wf_connect_first_workflow-package-bundle.md"
        }),
        expect.objectContaining({
          path: "wealth-factory/package-bundles/wf_connect_first_workflow/export-manifest.json",
          mediaType: "application/json"
        })
      ])
    });

    await expect(service.exportPackageBundleCandidate({
      authorization: "Bearer valid",
      runId: hydrated.runId,
      candidateId: "package_bundle_export",
      actionToken: exportAction!.actionToken
    })).resolves.toMatchObject({
      candidateId: "package_bundle_export",
      status: "export_ready",
      recordTarget: "package_deliverable_record",
      noteFileName: "wf_connect_first_workflow-package-bundle.md",
      idempotencyKey: expect.any(String)
    });

    expect(onPackageBundleExportReady).toHaveBeenCalledWith(expect.objectContaining({
      candidateId: "package_bundle_export",
      bundleId: expect.any(String),
      bundleRevision: expect.any(String),
      recordTarget: "package_deliverable_record"
    }));
  });

  it("keeps package-bundle export blocked until governance history delivery completes for the current bundle", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });
    await service.completeRun({
      authorization: "Bearer valid",
      runId: board.runId,
      completionSummary: "The CEO packaged the final business-facing outcome."
    });

    const completedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const packageCandidate = completedBoard.memoryBoundary.exportCandidates?.find((entry) => entry.id === "package_bundle_export");
    expect(packageCandidate?.exportActions?.find((entry) => entry.actionRoute === "package-bundle-export")).toBeUndefined();

    const packagePreflightToken =
      packageCandidate?.exportActions?.find((entry) => entry.actionRoute === "export-preflight")?.actionToken;

    await expect(service.preflightExportCandidate({
      authorization: "Bearer valid",
      runId: completedBoard.runId,
      candidateId: "package_bundle_export",
      ...(packagePreflightToken ? { actionToken: packagePreflightToken } : {})
    })).resolves.toMatchObject({
      candidateId: "package_bundle_export",
      status: "blocked",
      blockerLabel: "Governance history delivery must complete first",
      supportsDryRun: true,
      supportsExport: false
    });

    await expect(service.exportPackageBundleCandidate({
      authorization: "Bearer valid",
      runId: completedBoard.runId,
      candidateId: "package_bundle_export"
    })).rejects.toThrow("Harness package bundle export is not available until governance history delivery completes for the current bundle");
  });

  it("replays the persisted package-bundle delivery bundle through the private export-ready seam", async () => {
    const repository = createInMemoryHarnessRepository();
    const onPackageBundleExportReady = vi.fn().mockResolvedValue(undefined);
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      }),
      onPackageBundleExportReady
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });
    await service.completeRun({
      authorization: "Bearer valid",
      runId: board.runId,
      completionSummary: "The CEO packaged the final business-facing outcome."
    });

    const hydrated = await service.listBoardState({ authorization: "Bearer valid" });
    const governanceExportAction = hydrated.memoryBoundary.exportCandidates
      ?.find((entry) => entry.id === "governance_history_export")
      ?.exportActions?.find((entry) => entry.actionRoute === "governance-history-export");
    expect(governanceExportAction).toBeTruthy();
    const governanceExport = await service.exportGovernanceHistoryCandidate({
      authorization: "Bearer valid",
      runId: hydrated.runId,
      candidateId: "governance_history_export",
      actionToken: governanceExportAction!.actionToken
    });
    await repository.upsertExportDelivery({
      id: "delivery_governance_dependency_test_2",
      runId: hydrated.runId,
      tenantId: "tenant_123",
      workflowId: hydrated.workflowId,
      packageId: hydrated.packageId,
      candidateId: "governance_history_export",
      status: "delivered",
      exportFormat: governanceExport.exportFormat,
      recordTarget: governanceExport.recordTarget,
      bundleId: governanceExport.bundleId,
      bundleRevision: governanceExport.bundleRevision,
      idempotencyKey: governanceExport.idempotencyKey,
      noteTitle: governanceExport.noteTitle,
      noteFileName: governanceExport.noteFileName,
      placementTargetSystem: governanceExport.placement.targetSystem,
      vaultFolder: governanceExport.placement.vaultFolder,
      primaryNotePath: governanceExport.placement.primaryNotePath,
      syncStrategy: governanceExport.placement.syncStrategy,
      confirmationRequirement: governanceExport.placement.confirmationRequirement,
      files: governanceExport.files,
      recordCount: governanceExport.recordCount,
      disclosureSummary: governanceExport.disclosureSummary,
      redactionSummary: governanceExport.redactionSummary,
      attemptCount: 1,
      lastAttemptedAt: "2026-06-01T00:10:00.000Z",
      deliveredAt: "2026-06-01T00:10:01.000Z",
      writerKind: "obsidian_filesystem",
      deliveryReceipt: {
        primaryNotePath: governanceExport.placement.primaryNotePath,
        writtenFileCount: governanceExport.files.length
      },
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: "2026-06-01T00:10:00.000Z",
      updatedAt: "2026-06-01T00:10:01.000Z"
    });

    const deliveryReadyBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const dryRunAction = deliveryReadyBoard.memoryBoundary.exportCandidates
      ?.find((entry) => entry.id === "package_bundle_export")
      ?.exportActions?.find((entry) => entry.actionRoute === "export-dry-run");
    expect(dryRunAction).toBeTruthy();
    const dryRun = await service.dryRunExportCandidate({
      authorization: "Bearer valid",
      runId: deliveryReadyBoard.runId,
      candidateId: "package_bundle_export",
      actionToken: dryRunAction!.actionToken
    });
    await repository.upsertExportDelivery({
      id: "delivery_package_replay_test_1",
      runId: deliveryReadyBoard.runId,
      tenantId: "tenant_123",
      workflowId: deliveryReadyBoard.workflowId,
      packageId: deliveryReadyBoard.packageId,
      candidateId: "package_bundle_export",
      status: "delivery_failed",
      exportFormat: dryRun.exportFormat,
      recordTarget: "package_deliverable_record",
      bundleId: dryRun.bundleId,
      bundleRevision: dryRun.bundleRevision,
      idempotencyKey: "idempotency_package_replay_test_1",
      noteTitle: dryRun.noteTitle,
      noteFileName: dryRun.noteFileName,
      placementTargetSystem: dryRun.placement.targetSystem,
      vaultFolder: dryRun.placement.vaultFolder,
      primaryNotePath: dryRun.placement.primaryNotePath,
      syncStrategy: dryRun.placement.syncStrategy,
      confirmationRequirement: dryRun.placement.confirmationRequirement,
      files: dryRun.files,
      recordCount: dryRun.recordCount,
      disclosureSummary: dryRun.disclosureSummary,
      redactionSummary: dryRun.redactionSummary,
      attemptCount: 1,
      lastAttemptedAt: "2026-05-30T01:00:00.000Z",
      deliveredAt: null,
      writerKind: "obsidian_filesystem",
      deliveryReceipt: {},
      lastErrorCode: "writer_failed",
      lastErrorMessage: "Disk was temporarily unavailable",
      createdAt: "2026-05-30T01:00:00.000Z",
      updatedAt: "2026-05-30T01:00:00.000Z"
    });

    const replayBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const replayAction = replayBoard.memoryBoundary.exportCandidates
      ?.find((entry) => entry.id === "package_bundle_export")
      ?.exportActions?.find((entry) => entry.actionRoute === "package-bundle-export-replay");
    expect(replayAction).toBeTruthy();

    await expect(service.replayPackageBundleDeliveryCandidate({
      authorization: "Bearer valid",
      runId: replayBoard.runId,
      candidateId: "package_bundle_export",
      actionToken: replayAction!.actionToken
    })).resolves.toMatchObject({
      candidateId: "package_bundle_export",
      status: "delivery_replayed",
      idempotencyKey: "idempotency_package_replay_test_1"
    });

    expect(onPackageBundleExportReady).toHaveBeenCalledWith(expect.objectContaining({
      candidateId: "package_bundle_export",
      idempotencyKey: "idempotency_package_replay_test_1",
      bundleRevision: dryRun.bundleRevision
    }));
  });

  it("fails closed when a package-bundle replay targets a stale stored bundle revision", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });
    await service.completeRun({
      authorization: "Bearer valid",
      runId: board.runId,
      completionSummary: "The CEO packaged the final business-facing outcome."
    });

    const completedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const governanceExportAction = completedBoard.memoryBoundary.exportCandidates
      ?.find((entry) => entry.id === "governance_history_export")
      ?.exportActions?.find((entry) => entry.actionRoute === "governance-history-export");
    expect(governanceExportAction).toBeTruthy();
    const governanceExport = await service.exportGovernanceHistoryCandidate({
      authorization: "Bearer valid",
      runId: completedBoard.runId,
      candidateId: "governance_history_export",
      actionToken: governanceExportAction!.actionToken
    });
    await repository.upsertExportDelivery({
      id: "delivery_governance_dependency_test_3",
      runId: completedBoard.runId,
      tenantId: "tenant_123",
      workflowId: completedBoard.workflowId,
      packageId: completedBoard.packageId,
      candidateId: "governance_history_export",
      status: "delivered",
      exportFormat: governanceExport.exportFormat,
      recordTarget: governanceExport.recordTarget,
      bundleId: governanceExport.bundleId,
      bundleRevision: governanceExport.bundleRevision,
      idempotencyKey: governanceExport.idempotencyKey,
      noteTitle: governanceExport.noteTitle,
      noteFileName: governanceExport.noteFileName,
      placementTargetSystem: governanceExport.placement.targetSystem,
      vaultFolder: governanceExport.placement.vaultFolder,
      primaryNotePath: governanceExport.placement.primaryNotePath,
      syncStrategy: governanceExport.placement.syncStrategy,
      confirmationRequirement: governanceExport.placement.confirmationRequirement,
      files: governanceExport.files,
      recordCount: governanceExport.recordCount,
      disclosureSummary: governanceExport.disclosureSummary,
      redactionSummary: governanceExport.redactionSummary,
      attemptCount: 1,
      lastAttemptedAt: "2026-06-01T00:10:00.000Z",
      deliveredAt: "2026-06-01T00:10:01.000Z",
      writerKind: "obsidian_filesystem",
      deliveryReceipt: {
        primaryNotePath: governanceExport.placement.primaryNotePath,
        writtenFileCount: governanceExport.files.length
      },
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: "2026-06-01T00:10:00.000Z",
      updatedAt: "2026-06-01T00:10:01.000Z"
    });
    const dependencyReadyBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const exportAction = dependencyReadyBoard.memoryBoundary.exportCandidates
      ?.find((entry) => entry.id === "package_bundle_export")
      ?.exportActions?.find((entry) => entry.actionRoute === "package-bundle-export");
    expect(exportAction).toBeTruthy();

    const firstExport = await service.exportPackageBundleCandidate({
      authorization: "Bearer valid",
      runId: dependencyReadyBoard.runId,
      candidateId: "package_bundle_export",
      actionToken: exportAction!.actionToken
    });
    await repository.upsertExportDelivery({
      id: "delivery_replay_stale_package_1",
      runId: dependencyReadyBoard.runId,
      tenantId: "tenant_123",
      workflowId: dependencyReadyBoard.workflowId,
      packageId: dependencyReadyBoard.packageId,
      candidateId: "package_bundle_export",
      status: "delivery_failed",
      exportFormat: firstExport.exportFormat,
      recordTarget: firstExport.recordTarget,
      bundleId: "stale_bundle_package_revision_1",
      bundleRevision: "stale_bundle_package_revision_1",
      idempotencyKey: firstExport.idempotencyKey,
      noteTitle: firstExport.noteTitle,
      noteFileName: firstExport.noteFileName,
      placementTargetSystem: firstExport.placement.targetSystem,
      vaultFolder: firstExport.placement.vaultFolder,
      primaryNotePath: firstExport.placement.primaryNotePath,
      syncStrategy: firstExport.placement.syncStrategy,
      confirmationRequirement: firstExport.placement.confirmationRequirement,
      files: firstExport.files,
      recordCount: firstExport.recordCount,
      disclosureSummary: firstExport.disclosureSummary,
      redactionSummary: firstExport.redactionSummary,
      attemptCount: 1,
      lastAttemptedAt: "2026-06-01T00:15:00.000Z",
      deliveredAt: null,
      writerKind: "obsidian_filesystem",
      deliveryReceipt: {},
      lastErrorCode: "writer_failed",
      lastErrorMessage: "Disk was temporarily unavailable",
      createdAt: "2026-06-01T00:15:00.000Z",
      updatedAt: "2026-06-01T00:15:00.000Z"
    });
    const refreshedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const replayCandidate = refreshedBoard.memoryBoundary.exportCandidates
      ?.find((entry) => entry.id === "package_bundle_export");
    const replayAction = replayCandidate?.exportActions?.find((entry) => entry.actionRoute === "package-bundle-export-replay");
    expect(replayCandidate?.latestDelivery).toEqual(expect.objectContaining({
      contractFreshness: "stale_bundle"
    }));
    expect(replayAction).toBeUndefined();

    await expect(service.replayPackageBundleDeliveryCandidate({
      authorization: "Bearer valid",
      runId: refreshedBoard.runId,
      candidateId: "package_bundle_export"
    })).rejects.toThrow("Harness export action is not available for the current candidate contract");
  });

  it("fails closed when approval mutation is invoked without an atomic runner", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const ceoCard = board.cards.find((card) => card.persona === "CEO");
    expect(ceoCard).toBeDefined();

    await repository.insertProposal({
      id: "proposal_atomic_guard_1",
      runId: board.runId,
      parentCardId: ceoCard!.id,
      requestedByCardId: ceoCard!.id,
      requestedByPersona: "ceo",
      persona: "researcher",
      title: "Gather expansion risk notes",
      deliverableType: "research_brief",
      status: "proposed"
    });

    await expect(
      service.approveProposal({
        authorization: "Bearer valid",
        proposalId: "proposal_atomic_guard_1"
      })
    ).rejects.toThrow(/require atomic execution/i);
  });

  it("creates a CEO-owned direct child card in approved state and persists bootstrap-style events", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const result = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    const cards = await repository.listCardsForRun(board.runId);
    const createdCard = cards.find((card) => card.id === result.cardId);
    const events = await repository.listEventsForCard(result.cardId);

    expect(createdCard).toMatchObject({
      id: result.cardId,
      parentCardId: cards.find((card) => card.persona === "ceo")?.id,
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review",
      state: "approved"
    });
    expect(events.map((event) => event.eventKind)).toEqual(["created", "state_changed"]);
    expect(events[0]?.payload).toMatchObject({
      title: "Pressure-test the pricing lane",
      persona: "cfo",
      state: "approved"
    });
    expect(events[1]?.payload).toEqual({ to: "approved" });
  });

  it("treats repeated direct child creation as idempotent for the same open assignment", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const first = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    const second = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    const run = await repository.findLatestRunForTenantWorkflow({
      tenantId: "tenant_123",
      workflowId: "wf_connect_first_workflow"
    });
    const cards = await repository.listCardsForRun(run!.id);
    const cfoCards = cards.filter((card) => card.persona === "cfo");

    expect(second.cardId).toBe(first.cardId);
    expect(cfoCards).toHaveLength(1);
  });

  it("treats minor title wording changes as the same open direct-child assignment", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const first = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief"
    }));
    const second = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "researcher",
      title: "Gather competitor pricing anchors",
      deliverableType: "research_brief"
    }));

    const run = await repository.findLatestRunForTenantWorkflow({
      tenantId: "tenant_123",
      workflowId: "wf_connect_first_workflow"
    });
    const cards = await repository.listCardsForRun(run!.id);
    const researcherCards = cards.filter((card) => card.persona === "researcher");

    expect(second.cardId).toBe(first.cardId);
    expect(researcherCards).toHaveLength(1);
  });

  it("folds a CEO follow-on request into the existing open lane for the same persona and deliverable", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const first = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief"
    }));
    const second = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "researcher",
      title: "Summarize price-anchor anomalies",
      deliverableType: "research_brief"
    }));

    const run = await repository.findLatestRunForTenantWorkflow({
      tenantId: "tenant_123",
      workflowId: "wf_connect_first_workflow"
    });
    const cards = await repository.listCardsForRun(run!.id);
    const continuity = await repository.getCardContinuity(first.cardId);
    const decisions = await repository.listDecisionsForRun(run!.id);
    const hydratedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const lane = hydratedBoard.cards.find((card) => card.id === first.cardId);

    expect(second.cardId).toBe(first.cardId);
    expect(cards.filter((card) => card.persona === "researcher")).toHaveLength(1);
    expect(continuity).toEqual(
      expect.objectContaining({
        absorbedWorkItems: ["update_existing_lane|CEO: Summarize price-anchor anomalies"],
        continuitySummary:
          "RESEARCHER should fold the absorbed follow-on work from CEO: Summarize price-anchor anomalies into this research brief lane."
      })
    );
    expect(
      decisions.some(
        (decision) =>
          decision.decisionKind === "lane_opened" &&
          decision.policyReason === "reused_existing_lane" &&
          decision.resolution === "update_existing_lane"
      )
    ).toBe(true);
    expect(
      lane?.activity.some((item) =>
        item.label.includes("CEO folded this follow-on research brief request into the existing RESEARCHER lane")
      )
    ).toBe(true);
  });

  it("reopens the latest completed direct child lane for a bounded same-lane refinement while the run is still live", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const cfoLane = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    const researcherLane = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief"
    }));

    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: cfoLane.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: cfoLane.cardId,
      state: "waiting",
      resumeSummary: "CFO is waiting for refreshed research before revising the pricing lane."
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: researcherLane.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: researcherLane.cardId,
      state: "done",
      resultSummary: "Initial competitor pricing anchors are recorded."
    });

    const reopened = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief"
    }));

    const reopenedLane = await repository.getCard(researcherLane.cardId);
    const continuity = await repository.getCardContinuity(researcherLane.cardId);
    const events = await repository.listEventsForCard(researcherLane.cardId);
    const decisions = await repository.listDecisionsForRun(reopenedLane!.runId);
    const hydrated = await service.listBoardState({ authorization: "Bearer valid" });
    const hydratedLane = hydrated.cards.find((card) => card.id === researcherLane.cardId);

    expect(reopened.cardId).toBe(researcherLane.cardId);
    expect(reopenedLane).toEqual(
      expect.objectContaining({
        id: researcherLane.cardId,
        state: "approved"
      })
    );
    expect(continuity).toEqual(
      expect.objectContaining({
        cardId: researcherLane.cardId,
        continuitySummary: "RESEARCHER should begin this approved research brief lane: Gather competitor price anchors.",
        latestResultSummary: "Initial competitor pricing anchors are recorded."
      })
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventKind: "state_changed",
          payload: expect.objectContaining({ from: "done", to: "approved" })
        }),
        expect.objectContaining({
          eventKind: "comment_added",
          payload: expect.objectContaining({
            message: "CEO reopened this completed research brief lane for a bounded refinement."
          })
        })
      ])
    );
    expect(
      decisions.some(
        (decision) =>
          decision.decisionKind === "lane_opened" &&
          decision.cardId === researcherLane.cardId &&
          decision.policyReason === "reused_existing_lane" &&
          decision.resolution === "update_existing_lane"
      )
    ).toBe(true);
    expect(hydratedLane?.lane).toBe("planning");
    expect(hydratedLane?.activity.some((item) => item.label.includes("CEO reopened this completed research brief lane"))).toBe(
      true
    );
  });

  it("reopens a completed proposal lane when the requested title is only a minor wording variant", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const parentLane = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    const researcherLane = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief"
    }));

    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: parentLane.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: parentLane.cardId,
      state: "waiting",
      resumeSummary: "CFO is waiting for refreshed research before revising the pricing lane."
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: researcherLane.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: researcherLane.cardId,
      state: "done",
      resultSummary: "Initial competitor pricing anchors are recorded."
    });

    await repository.insertProposal({
      id: "proposal_variant_reopen_1",
      runId: (await repository.getCard(parentLane.cardId))!.runId,
      parentCardId: parentLane.cardId,
      requestedByCardId: parentLane.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Gather competitor pricing anchors",
      deliverableType: "research_brief",
      status: "proposed"
    });

    await expect(
      service.approveProposal({
        authorization: "Bearer valid",
        proposalId: "proposal_variant_reopen_1"
      })
    ).resolves.toEqual({ cardId: researcherLane.cardId });

    const proposal = await repository.getProposal("proposal_variant_reopen_1");
    const lane = await repository.getCard(researcherLane.cardId);
    const continuity = await repository.getCardContinuity(researcherLane.cardId);

    expect(proposal).toEqual(
      expect.objectContaining({
        status: "approved",
        approvedCardId: researcherLane.cardId,
        resolution: "update_existing_lane"
      })
    );
    expect(lane).toEqual(
      expect.objectContaining({
        id: researcherLane.cardId,
        state: "approved"
      })
    );
    expect(continuity).toEqual(
      expect.objectContaining({
        latestResultSummary: "Initial competitor pricing anchors are recorded."
      })
    );
  });

  it("preserves a direct CEO request as deferred governance when another open card already owns the same deliverable lane", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await expect(
      service.createTopLevelChildCard({
        authorization: "Bearer valid",
        persona: "analyst",
        title: "Model the renewal downside",
        deliverableType: "pricing_review"
      })
    ).resolves.toEqual({
      status: "deferred",
      proposalId: expect.any(String)
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    expect(board.pendingApprovals).toEqual([
      expect.objectContaining({
        title: "Model the renewal downside",
        requestedByPersona: "CEO",
        targetPersona: "ANALYST",
        deliverableLabel: "Pricing Review",
        statusLabel: "Deferred for later CEO review",
        policyReasonLabel: "Waiting on current lane owner",
        nextReviewTrigger: "Review again when the current deliverable owner clears or hands off the lane."
      })
    ]);
  });

  it("preserves a direct CEO request as deferred governance when that persona already has another active lane", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief"
    }));

    await expect(
      service.createTopLevelChildCard({
        authorization: "Bearer valid",
        persona: "researcher",
        title: "Validate the forecast assumptions",
        deliverableType: "forecast_model"
      })
    ).resolves.toEqual({
      status: "deferred",
      proposalId: expect.any(String)
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    expect(board.pendingApprovals).toEqual([
      expect.objectContaining({
        title: "Validate the forecast assumptions",
        requestedByPersona: "CEO",
        targetPersona: "RESEARCHER",
        deliverableLabel: "Forecast Model",
        statusLabel: "Deferred for later CEO review",
        policyReasonLabel: "Persona focus protection",
        nextReviewTrigger: "Review again when that persona's current active lane closes or is handed off."
      })
    ]);
  });

  it("rejects child-card requests outside the approved persona and deliverable catalog", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await expect(
      service.createTopLevelChildCard({
        authorization: "Bearer valid",
        persona: "rogue_persona",
        title: "Open a surprise lane",
        deliverableType: "surprise_output"
      })
    ).rejects.toBeInstanceOf(HarnessCardCreationConflictError);
  });

  it("preserves a direct CEO request as deferred governance when the child-card lane cap is reached", async () => {
    const repository = createInMemoryHarnessRepository();
    const audit = vi.fn().mockResolvedValue(undefined);
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      audit,
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });
    const initialBoard = await service.listBoardState({ authorization: "Bearer valid" });

    for (const assignment of [
      { persona: "cfo", title: "Pressure-test the pricing lane", deliverableType: "pricing_review" },
      { persona: "coo", title: "Prepare the fulfillment handoff", deliverableType: "ops_handoff" },
      { persona: "researcher", title: "Gather competitor anchors", deliverableType: "research_brief" },
      { persona: "cto", title: "Review the automation seams", deliverableType: "technical_review" },
      { persona: "cmo", title: "Draft the launch narrative", deliverableType: "launch_copy" },
      { persona: "analyst", title: "Estimate the revenue delta", deliverableType: "forecast_model" }
    ]) {
      await expectCreatedCard(service.createTopLevelChildCard({
        authorization: "Bearer valid",
        persona: assignment.persona,
        title: assignment.title,
        deliverableType: assignment.deliverableType
      }));
    }

    await expect(
      service.createTopLevelChildCard({
        authorization: "Bearer valid",
        persona: "analyst",
        title: "Review the offer language",
        deliverableType: "legal_review"
      })
    ).resolves.toEqual({
      status: "deferred",
      proposalId: expect.stringMatching(/^[0-9a-f-]{36}$/i)
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    expect(board.pendingApprovals).toEqual([
      expect.objectContaining({
        title: "Review the offer language",
        requestedByPersona: "CEO",
        targetPersona: "ANALYST",
        deliverableLabel: "Legal Review",
        statusLabel: "Deferred for later CEO review",
        policyReasonLabel: "Persona focus protection",
        nextReviewTrigger: "Review again when that persona's current active lane closes or is handed off."
      })
    ]);

    const deferredProposal = await repository.getProposal(board.pendingApprovals[0]?.id ?? "");
    expect(deferredProposal).toEqual(
      expect.objectContaining({
        runId: initialBoard.runId,
        requestedByPersona: "ceo",
        persona: "analyst",
        title: "Review the offer language",
        deliverableType: "legal_review",
        status: "deferred",
        decisionNote: "CEO deferred this proposal because ANALYST already has another active lane."
      })
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "harness_proposal_decided",
        metadata: expect.objectContaining({
          decision: "deferred",
          reason: "persona_lane_cap",
          hasDecisionNote: true
        })
      })
    );
  });

  it("reuses the same deferred direct CEO request when lane-cap retries repeat the same bounded assignment", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    for (const assignment of [
      { persona: "cfo", title: "Pressure-test the pricing lane", deliverableType: "pricing_review" },
      { persona: "coo", title: "Prepare the fulfillment handoff", deliverableType: "ops_handoff" },
      { persona: "researcher", title: "Gather competitor anchors", deliverableType: "research_brief" },
      { persona: "cto", title: "Review the automation seams", deliverableType: "technical_review" },
      { persona: "cmo", title: "Draft the launch narrative", deliverableType: "launch_copy" },
      { persona: "analyst", title: "Estimate the revenue delta", deliverableType: "forecast_model" }
    ]) {
      await expectCreatedCard(service.createTopLevelChildCard({
        authorization: "Bearer valid",
        persona: assignment.persona,
        title: assignment.title,
        deliverableType: assignment.deliverableType
      }));
    }

    const firstDeferred = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "analyst",
      title: "Review the offer language",
      deliverableType: "legal_review"
    });
    const secondDeferred = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "analyst",
      title: "Reviewing the offer language",
      deliverableType: "legal_review"
    });

    expect(firstDeferred).toEqual({
      status: "deferred",
      proposalId: expect.any(String)
    });
    expect(secondDeferred).toEqual(firstDeferred);

    const run = await repository.findLatestRunForTenantWorkflow({
      tenantId: "tenant_123",
      workflowId: "wf_connect_first_workflow"
    });
    const proposals = await repository.listProposalsForRun(run!.id);
    expect(proposals.filter((proposal) => proposal.status === "deferred")).toHaveLength(1);
  });

  it("preserves a direct CEO request as deferred governance when child-card creation targets an assembling run", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });

    await expect(
      service.createTopLevelChildCard({
        authorization: "Bearer valid",
        persona: "researcher",
        title: "Research the next pricing iteration",
        deliverableType: "research_brief"
      })
    ).resolves.toEqual({
      status: "deferred",
      proposalId: expect.any(String)
    });

    const run = await repository.findLatestRunForTenantWorkflow({
      tenantId: "tenant_123",
      workflowId: "wf_connect_first_workflow"
    });
    expect(run?.state).toBe("assembling");
    const board = await service.listBoardState({ authorization: "Bearer valid" });
    expect(board.pendingApprovals).toEqual([
      expect.objectContaining({
        title: "Research the next pricing iteration",
        requestedByPersona: "CEO",
        targetPersona: "RESEARCHER",
        deliverableLabel: "Research Brief",
        statusLabel: "Deferred for later CEO review",
        policyReasonLabel: "Completed lanes only",
        nextReviewTrigger: "Review again only if the CEO deliberately starts a fresh board cycle for follow-on work."
      })
    ]);
  });

  it("preserves a direct CEO request as deferred governance when child-card creation targets a done run", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });
    await service.completeRun({
      authorization: "Bearer valid",
      runId: board.runId,
      completionSummary: "The CEO packaged the final business-facing outcome."
    });

    await expect(
      service.createTopLevelChildCard({
        authorization: "Bearer valid",
        persona: "researcher",
        title: "Research the next pricing iteration",
        deliverableType: "research_brief"
      })
    ).resolves.toEqual({
      status: "deferred",
      proposalId: expect.any(String)
    });

    const run = await repository.findLatestRunForTenantWorkflow({
      tenantId: "tenant_123",
      workflowId: "wf_connect_first_workflow"
    });
    expect(run?.state).toBe("done");
    const boardAfterDone = await service.listBoardState({ authorization: "Bearer valid" });
    expect(boardAfterDone.pendingApprovals).toEqual([
      expect.objectContaining({
        title: "Research the next pricing iteration",
        requestedByPersona: "CEO",
        targetPersona: "RESEARCHER",
        deliverableLabel: "Research Brief",
        statusLabel: "Deferred for later CEO review",
        policyReasonLabel: "Completed lanes only"
      })
    ]);
  });

  it("reuses the same deferred direct CEO request when owner-conflict retries repeat the same bounded assignment", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    const firstDeferred = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "analyst",
      title: "Model the renewal downside",
      deliverableType: "pricing_review"
    });
    const secondDeferred = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "analyst",
      title: "Modeling the renewal downside",
      deliverableType: "pricing_review"
    });

    expect(firstDeferred).toEqual({
      status: "deferred",
      proposalId: expect.any(String)
    });
    expect(secondDeferred).toEqual(firstDeferred);
  });

  it("reuses the same carried-forward proposed request when a repeated direct CEO ask later hits lane pressure in the fresh cycle", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const initialBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const completedLane = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: completedLane.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: completedLane.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });
    await repository.insertProposal({
      id: "proposal_repeat_fresh_cycle_1",
      runId: initialBoard.runId,
      parentCardId: completedLane.cardId,
      requestedByCardId: completedLane.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief",
      status: "deferred",
      decisionNote: "Review again when the current cycle closes."
    });
    await repository.insertDecision({
      id: "decision_repeat_fresh_cycle_1",
      runId: initialBoard.runId,
      tenantId: "tenant_123",
      actorUserId: "user_123",
      decisionKind: "proposal_deferred",
      cardId: completedLane.cardId,
      proposalId: "proposal_repeat_fresh_cycle_1",
      targetCardId: null,
      persona: "researcher",
      deliverableType: "research_brief",
      policyReason: "completed_lanes_only",
      resolution: null,
      decisionNote: "Review again when the current cycle closes.",
      recommendationSummary: "Start a new board cycle before reopening this research brief request.",
      objectionSummary: "Keep this follow-on work out of the completed cycle package.",
      createdAt: new Date().toISOString()
    });

    const freshCycle = await service.startFreshCycle({
      authorization: "Bearer valid",
      runId: initialBoard.runId,
      mode: "reopen_deferred"
    });

    for (const assignment of [
      { persona: "cfo", title: "Pressure-test the pricing lane", deliverableType: "pricing_review" },
      { persona: "coo", title: "Prepare the fulfillment handoff", deliverableType: "ops_handoff" },
      { persona: "cto", title: "Review the automation seams", deliverableType: "technical_review" },
      { persona: "cmo", title: "Draft the launch narrative", deliverableType: "launch_copy" },
      { persona: "analyst", title: "Estimate the revenue delta", deliverableType: "forecast_model" },
      { persona: "researcher", title: "Review the offer language", deliverableType: "legal_review" }
    ]) {
      await expectCreatedCard(service.createTopLevelChildCard({
        authorization: "Bearer valid",
        persona: assignment.persona,
        title: assignment.title,
        deliverableType: assignment.deliverableType
      }));
    }

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const carriedForwardProposalId = board.pendingApprovals.find(
      (proposal) =>
        proposal.title === "Gather competitor price anchors" &&
        proposal.targetPersona === "RESEARCHER" &&
        proposal.deliverableLabel === "Research Brief"
    )?.id;

    expect(freshCycle).toEqual({
      runId: expect.any(String),
      reopenedProposalCount: 1
    });
    expect(carriedForwardProposalId).toBeTruthy();

    const repeated = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "researcher",
      title: "Gathering competitor price anchors",
      deliverableType: "research_brief"
    });

    expect(repeated).toEqual({
      status: "deferred",
      proposalId: carriedForwardProposalId
    });

    const matchingProposals = (await repository.listProposalsForRun(freshCycle.runId)).filter(
      (proposal) => proposal.persona === "researcher" && proposal.deliverableType === "research_brief"
    );
    expect(matchingProposals).toHaveLength(1);
    expect(matchingProposals[0]).toEqual(
      expect.objectContaining({
        id: carriedForwardProposalId,
        status: "proposed"
      })
    );
  });

  it("keeps a carried-forward direct CEO request in pending review even when conditions clear in the fresh cycle", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const initialBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const completedLane = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: completedLane.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: completedLane.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });
    await repository.insertProposal({
      id: "proposal_repeat_fresh_cycle_clear_1",
      runId: initialBoard.runId,
      parentCardId: completedLane.cardId,
      requestedByCardId: completedLane.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief",
      status: "deferred",
      decisionNote: "Review again when the current cycle closes."
    });
    await repository.insertDecision({
      id: "decision_repeat_fresh_cycle_clear_1",
      runId: initialBoard.runId,
      tenantId: "tenant_123",
      actorUserId: "user_123",
      decisionKind: "proposal_deferred",
      cardId: completedLane.cardId,
      proposalId: "proposal_repeat_fresh_cycle_clear_1",
      targetCardId: null,
      persona: "researcher",
      deliverableType: "research_brief",
      policyReason: "completed_lanes_only",
      resolution: null,
      decisionNote: "Review again when the current cycle closes.",
      recommendationSummary: "Start a new board cycle before reopening this research brief request.",
      objectionSummary: "Keep this follow-on work out of the completed cycle package.",
      createdAt: new Date().toISOString()
    });

    const freshCycle = await service.startFreshCycle({
      authorization: "Bearer valid",
      runId: initialBoard.runId,
      mode: "reopen_deferred"
    });

    const repeated = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "researcher",
      title: "Gathering competitor price anchors",
      deliverableType: "research_brief"
    });

    const proposals = await repository.listProposalsForRun(freshCycle.runId);
    const carriedForward = proposals.find(
      (proposal) =>
        proposal.persona === "researcher" &&
        proposal.deliverableType === "research_brief" &&
        proposal.title === "Gather competitor price anchors"
    );
    const board = await service.listBoardState({ authorization: "Bearer valid" });

    expect(repeated).toEqual({
      status: "deferred",
      proposalId: carriedForward?.id
    });
    expect(carriedForward).toEqual(
      expect.objectContaining({
        status: "proposed"
      })
    );
    expect(board.pendingApprovals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: carriedForward?.id,
          title: "Gather competitor price anchors",
          targetPersona: "RESEARCHER"
        })
      ])
    );
  });

  it("approves an earlier unresolved direct CEO request into the existing open lane instead of leaving the proposal pending", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const ceoCardId = (await repository.listCardsForRun(board.runId)).find((card) => card.persona === "ceo")?.id;
    const cfoLane = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    expect(ceoCardId).toBeTruthy();
    await repository.insertProposal({
      id: "proposal_direct_reuse_existing_1",
      runId: board.runId,
      parentCardId: ceoCardId!,
      requestedByCardId: ceoCardId!,
      requestedByPersona: "ceo",
      persona: "cfo",
      title: "Pressure testing the pricing lane",
      deliverableType: "pricing_review",
      status: "proposed"
    });

    const reused = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    const proposal = await repository.getProposal("proposal_direct_reuse_existing_1");
    const hydrated = await service.listBoardState({ authorization: "Bearer valid" });

    expect(reused).toEqual({ cardId: cfoLane.cardId });
    expect(proposal).toEqual(
      expect.objectContaining({
        id: "proposal_direct_reuse_existing_1",
        status: "approved",
        approvedCardId: cfoLane.cardId
      })
    );
    expect(hydrated.pendingApprovals).toEqual([]);
  });

  it("approves an earlier unresolved direct CEO request by reopening the latest completed lane when the refinement stays bounded", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const ceoCardId = (await repository.listCardsForRun(board.runId)).find((card) => card.persona === "ceo")?.id;
    const completedLane = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "coo",
      title: "Keep the board cycle live",
      deliverableType: "ops_handoff"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: completedLane.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: completedLane.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });
    expect(ceoCardId).toBeTruthy();
    await repository.insertProposal({
      id: "proposal_direct_reopen_existing_1",
      runId: board.runId,
      parentCardId: ceoCardId!,
      requestedByCardId: ceoCardId!,
      requestedByPersona: "ceo",
      persona: "cfo",
      title: "Pressure testing the pricing lane",
      deliverableType: "pricing_review",
      status: "proposed"
    });

    const reopened = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    const proposal = await repository.getProposal("proposal_direct_reopen_existing_1");
    const card = await repository.getCard(completedLane.cardId);
    const hydrated = await service.listBoardState({ authorization: "Bearer valid" });

    expect(reopened).toEqual({ cardId: completedLane.cardId });
    expect(card?.state).toBe("approved");
    expect(proposal).toEqual(
      expect.objectContaining({
        id: "proposal_direct_reopen_existing_1",
        status: "approved",
        approvedCardId: completedLane.cardId
      })
    );
    expect(hydrated.pendingApprovals).toEqual([]);
  });

  it("does not open a nested atomic block when the first direct child card seeds the run", async () => {
    const repository = createInMemoryHarnessRepository();
    let inAtomic = false;
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => {
        if (inAtomic) {
          throw new Error("nested atomic block");
        }
        inAtomic = true;
        try {
          return await work(repository);
        } finally {
          inAtomic = false;
        }
      },
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await expect(
      service.createTopLevelChildCard({
        authorization: "Bearer valid",
        persona: "cfo",
        title: "Pressure-test the pricing lane",
        deliverableType: "pricing_review"
      })
    ).resolves.toMatchObject({
      cardId: expect.any(String)
    });
  });

  it("fails closed when direct child creation is invoked without an atomic runner", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await expect(
      service.createTopLevelChildCard({
        authorization: "Bearer valid",
        persona: "cfo",
        title: "Pressure-test the pricing lane",
        deliverableType: "pricing_review"
      })
    ).rejects.toThrow(/require atomic execution/i);
  });

  it("advances a persisted child card through working and done while recording durable progress events", async () => {
    const repository = createInMemoryHarnessRepository();
    const audit = vi.fn().mockResolvedValue(undefined);
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      audit,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await expect(
      service.advanceChildCard({
        authorization: "Bearer valid",
        cardId: created.cardId,
        state: "working",
        resumeSummary: "Keep the pricing review lane moving from the revised assumptions workbook."
      })
    ).resolves.toEqual({ cardId: created.cardId, state: "working" });

    await expect(
      service.advanceChildCard({
        authorization: "Bearer valid",
        cardId: created.cardId,
        state: "done",
        resultSummary: "Pricing floor is stable enough for the first launch wave."
      })
    ).resolves.toEqual({ cardId: created.cardId, state: "done" });

    const updatedCard = (await repository.listCardsForRun(board.runId)).find((card) => card.id === created.cardId);
    const persistedEvents = await repository.listEventsForCard(created.cardId);
    const persistedContinuity = await repository.getCardContinuity(created.cardId);
    const hydratedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const hydratedCard = hydratedBoard.cards.find((card) => card.id === created.cardId);
    const run = await repository.findLatestRunForTenantWorkflow({
      tenantId: "tenant_123",
      workflowId: "wf_connect_first_workflow"
    });

    expect(updatedCard?.state).toBe("done");
    expect(run?.state).toBe("assembling");
    expect(persistedEvents.map((event) => event.eventKind)).toEqual([
      "created",
      "state_changed",
      "state_changed",
      "state_changed",
      "result_recorded"
    ]);
    expect(persistedEvents.find((event) => event.eventKind === "result_recorded")?.payload).toEqual({
      summary: "Pricing floor is stable enough for the first launch wave."
    });
    expect(persistedContinuity).toEqual(
      expect.objectContaining({
        cardId: created.cardId,
        continuitySummary: null,
        latestResultSummary: "Pricing floor is stable enough for the first launch wave."
      })
    );
    expect(hydratedCard?.lane).toBe("done");
    expect(hydratedCard?.outcome).toBe("Pricing floor is stable enough for the first launch wave.");
    expect(hydratedCard?.detailSections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "snapshot",
          body: "CFO completed this pricing review lane and preserved the latest outcome for later review."
        })
      ])
    );
    expect(hydratedCard?.detailSections.some((section) => section.title === "Latest Outcome")).toBe(true);
    expect(hydratedCard?.activity.some((item) => item.label.includes("Pricing floor is stable enough"))).toBe(true);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant_123",
        eventType: "harness_card_advanced",
        metadata: expect.objectContaining({
          fromState: "working",
          toState: "done",
          hasResultSummary: true
        })
      })
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant_123",
        eventType: "harness_run_reconciled",
        metadata: expect.objectContaining({
          fromState: "active",
          toState: "assembling"
        })
      })
    );
    expect(audit.mock.calls.some(([event]) => JSON.stringify(event).includes("Pricing floor is stable enough"))).toBe(false);
  });

  it("persists a bounded resume summary for in-flight child-card work", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await expect(
      service.advanceChildCard({
        authorization: "Bearer valid",
        cardId: created.cardId,
        state: "working",
        resumeSummary: "Keep the pricing review lane moving from the revised assumptions workbook."
      })
    ).resolves.toEqual({ cardId: created.cardId, state: "working" });

    const persistedContinuity = await repository.getCardContinuity(created.cardId);
    const hydratedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const hydratedCard = hydratedBoard.cards.find((card) => card.id === created.cardId);

    expect(persistedContinuity).toEqual(
      expect.objectContaining({
        cardId: created.cardId,
        continuitySummary: "Keep the pricing review lane moving from the revised assumptions workbook."
      })
    );
    expect(hydratedCard?.detailSections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "snapshot",
          body: "Keep the pricing review lane moving from the revised assumptions workbook."
        })
      ])
    );
  });

  it("rejects resume summaries when a child card reaches done", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });

    await expect(
      service.advanceChildCard({
        authorization: "Bearer valid",
        cardId: created.cardId,
        state: "done",
        resultSummary: "Pricing floor is stable enough for the first launch wave.",
        resumeSummary: "Resume this lane from the prior assumptions workbook."
      })
    ).rejects.toThrow("Resume summaries cannot be recorded when a card reaches done");
  });

  it("reconciles run state to waiting and then blocked as child cards lose active progress", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "waiting"
    });

    let run = await repository.findLatestRunForTenantWorkflow({
      tenantId: "tenant_123",
      workflowId: "wf_connect_first_workflow"
    });
    expect(run?.state).toBe("waiting");

    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "blocked"
    });

    run = await repository.findLatestRunForTenantWorkflow({
      tenantId: "tenant_123",
      workflowId: "wf_connect_first_workflow"
    });
    expect(run?.state).toBe("blocked");
  });

  it("reconciles a blocked run back to active when child work resumes", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "blocked"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "approved"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });

    const run = await repository.findLatestRunForTenantWorkflow({
      tenantId: "tenant_123",
      workflowId: "wf_connect_first_workflow"
    });

    expect(run?.id).toBe(board.runId);
    expect(run?.state).toBe("active");
  });

  it("reconciles a run to blocked when its only child lane is cancelled", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "cancelled"
    });

    const run = await repository.findLatestRunForTenantWorkflow({
      tenantId: "tenant_123",
      workflowId: "wf_connect_first_workflow"
    });

    expect(run?.id).toBe(board.runId);
    expect(run?.state).toBe("blocked");
  });

  it("keeps the run active while at least one child card is still working", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const workingCard = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    const waitingCard = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "coo",
      title: "Prepare the fulfillment handoff",
      deliverableType: "ops_handoff"
    }));

    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: workingCard.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: waitingCard.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: waitingCard.cardId,
      state: "waiting"
    });

    const run = await repository.findLatestRunForTenantWorkflow({
      tenantId: "tenant_123",
      workflowId: "wf_connect_first_workflow"
    });
    expect(run?.state).toBe("active");
  });

  it("completes an assembling run through an explicit CEO assembly seam", async () => {
    const repository = createInMemoryHarnessRepository();
    const audit = vi.fn().mockResolvedValue(undefined);
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      audit,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });

    await expect(
      service.completeRun({
        authorization: "Bearer valid",
        runId: board.runId,
        completionSummary: "The CEO packaged the final business-facing outcome."
      })
    ).resolves.toEqual({
      runId: board.runId,
      state: "done"
    });

    const run = await repository.findLatestRunForTenantWorkflow({
      tenantId: "tenant_123",
      workflowId: "wf_connect_first_workflow"
    });
    const cards = await repository.listCardsForRun(board.runId);
    const ceoCard = cards.find((card) => card.persona === "ceo");
    const ceoEvents = await repository.listEventsForCard(ceoCard!.id);
    const hydratedBoard = await service.listBoardState({ authorization: "Bearer valid" });

    expect(run?.state).toBe("done");
    expect(ceoEvents.at(-1)?.eventKind).toBe("result_recorded");
    expect(ceoEvents.at(-1)?.payload).toEqual({
      summary: "The CEO packaged the final business-facing outcome."
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "harness_run_completed",
        metadata: expect.objectContaining({
          fromState: "assembling",
          toState: "done",
          hasCompletionSummary: true
        })
      })
    );
    expect(audit.mock.calls.some(([event]) => JSON.stringify(event).includes("The CEO packaged the final business-facing outcome."))).toBe(
      false
    );
    expect(hydratedBoard.completionPackage).toEqual(
      expect.objectContaining({
        status: "done",
        deferredApprovalCount: 0,
        deniedApprovalCount: 0,
        hasOpenGovernanceItems: false,
        packageNote: "The board outcome includes clear next-step recommendations for the tenant-facing handoff.",
        recommendations: expect.arrayContaining(["Package only completed lanes into the tenant-facing board outcome."]),
        objections: [],
        governanceItems: []
      })
    );
    expect(hydratedBoard.followThroughItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "packaged_outcome",
          summary: "CEO packaged the final board outcome for the tenant."
        })
      ])
    );
    expect(hydratedBoard.memoryBoundary.exportReadyItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "package_governance",
          readiness: "ready_now",
          readinessLabel: "Ready now",
          role: "packaged_record_candidate",
          eligibilityRule: "explicit_export_later",
          sourceSurface: "completion_package_governance",
          candidateClass: "packaged_output",
          durabilityCondition: "stable_when_recorded"
        }),
        expect.objectContaining({
          id: "package_deliverables",
          readiness: "ready_now",
          readinessLabel: "Ready now",
          role: "packaged_record_candidate",
          eligibilityRule: "explicit_export_later",
          sourceSurface: "completion_package_deliverables",
          candidateClass: "packaged_output",
          durabilityCondition: "stable_when_recorded"
        })
      ])
    );
    expect(hydratedBoard.memoryBoundary).toEqual(
      expect.objectContaining({
        readyNowCount: 4,
        waitingOnBoardClosureCount: 0,
        governanceReadyCount: 2,
        packagedReadyCount: 2,
        packagedWaitingCount: 0,
        exportSummary: "4 export candidates are ready now. No export candidates are waiting on board closure.",
        roleSummary:
          "4 tenant-record candidates are ready now, including 2 governance history candidates and 2 packaged output candidates."
      })
    );
  });

  it("reconciles a stale blocked run into assembling before explicit completion", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "blocked"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "approved"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });

    const completed = await service.completeRun({
      authorization: "Bearer valid",
      runId: board.runId,
      completionSummary: "The CEO packaged the final business-facing outcome."
    });

    const run = await repository.findLatestRunForTenantWorkflow({
      tenantId: "tenant_123",
      workflowId: "wf_connect_first_workflow"
    });

    expect(completed).toEqual({
      runId: board.runId,
      state: "done"
    });
    expect(run?.state).toBe("done");
  });

  it("packages deferred and denied governance items into the tenant-facing completion package without leaking raw notes", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });

    await repository.insertProposal({
      id: "proposal_completion_deferred_1",
      runId: board.runId,
      parentCardId: created.cardId,
      requestedByCardId: created.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief",
      status: "deferred",
      decisionNote: "This note should not surface directly."
    });
    await repository.insertDecision({
      id: "decision_completion_deferred_1",
      runId: board.runId,
      tenantId: "tenant_123",
      actorUserId: "user_123",
      decisionKind: "proposal_deferred",
      cardId: created.cardId,
      proposalId: "proposal_completion_deferred_1",
      targetCardId: null,
      persona: "researcher",
      deliverableType: "research_brief",
      policyReason: "lane_cap",
      resolution: null,
      decisionNote: "This note should not surface directly.",
      recommendationSummary: "Finish or close one active lane before reopening this research brief request.",
      objectionSummary: "Hold this research brief request until the active lane count drops.",
      createdAt: new Date().toISOString()
    });
    await repository.insertProposal({
      id: "proposal_completion_denied_1",
      runId: board.runId,
      parentCardId: created.cardId,
      requestedByCardId: created.cardId,
      requestedByPersona: "cfo",
      persona: "cto",
      title: "Open an extra technical review lane",
      deliverableType: "technical_review",
      status: "denied",
      decisionNote: "Another note that should stay out of the package."
    });
    await repository.insertDecision({
      id: "decision_completion_denied_1",
      runId: board.runId,
      tenantId: "tenant_123",
      actorUserId: "user_123",
      decisionKind: "proposal_denied",
      cardId: created.cardId,
      proposalId: "proposal_completion_denied_1",
      targetCardId: null,
      persona: "cto",
      deliverableType: "technical_review",
      policyReason: "scope_guardrail",
      resolution: null,
      decisionNote: "Another note that should stay out of the package.",
      recommendationSummary:
        "Keep this technical review work inside the current approved package boundary unless the CEO deliberately widens scope.",
      objectionSummary: "Do not widen this run beyond the approved technical review workflow boundary.",
      createdAt: new Date(Date.now() - 1000).toISOString()
    });

    await service.completeRun({
      authorization: "Bearer valid",
      runId: board.runId,
      completionSummary: "The CEO packaged the final business-facing outcome."
    });

    const completedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    expect(completedBoard.completionPackage).toEqual(
      expect.objectContaining({
        status: "done",
        deferredApprovalCount: 1,
        deniedApprovalCount: 1,
        hasOpenGovernanceItems: true,
        packageNote: "The board is packaging completed work while keeping deferred follow-up requests visible for later CEO review.",
        recommendations: expect.arrayContaining([
          "Package only completed lanes into the tenant-facing board outcome.",
          "Finish or close one active lane before reopening this research brief request.",
          "Keep this technical review work inside the current approved package boundary unless the CEO deliberately widens scope."
        ]),
        objections: expect.arrayContaining([
          "Hold this research brief request until the active lane count drops.",
          "Do not widen this run beyond the approved technical review workflow boundary."
        ]),
        governanceItems: [
          expect.objectContaining({
            proposalId: "proposal_completion_deferred_1",
            statusLabel: "Deferred for later CEO review",
            persona: "RESEARCHER",
            deliverableLabel: "Research Brief",
            policyReasonLabel: "Lane cap protection",
            recommendationSummary: "Finish or close one active lane before reopening this research brief request.",
            objectionSummary: "Hold this research brief request until the active lane count drops.",
            nextReviewTrigger: "Review again when one of the active child lanes closes."
          }),
          expect.objectContaining({
            proposalId: "proposal_completion_denied_1",
            statusLabel: "Denied by the CEO",
            persona: "CTO",
            deliverableLabel: "Technical Review",
            policyReasonLabel: "Scope guardrail",
            recommendationSummary:
              "Keep this technical review work inside the current approved package boundary unless the CEO deliberately widens scope.",
            objectionSummary: "Do not widen this run beyond the approved technical review workflow boundary."
          })
        ]
      })
    );
    expect(JSON.stringify(completedBoard.completionPackage)).not.toContain("This note should not surface directly.");
    expect(JSON.stringify(completedBoard.completionPackage)).not.toContain("Another note that should stay out of the package.");
    await expect(repository.getCompletionPackageSnapshot(board.runId)).resolves.toEqual(
      expect.objectContaining(completedBoard.completionPackage ?? {})
    );
  });

  it("keeps the persisted completion package immutable after the board closes", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });

    await service.completeRun({
      authorization: "Bearer valid",
      runId: board.runId,
      completionSummary: "The CEO packaged the final business-facing outcome."
    });

    const completedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const persistedSnapshot = await repository.getCompletionPackageSnapshot(board.runId);

    await repository.insertProposal({
      id: "proposal_post_completion_noise_1",
      runId: board.runId,
      parentCardId: created.cardId,
      requestedByCardId: created.cardId,
      requestedByPersona: "cfo",
      persona: "cto",
      title: "Open an extra technical review lane",
      deliverableType: "technical_review",
      status: "denied"
    });
    await repository.insertDecision({
      id: "decision_post_completion_noise_1",
      runId: board.runId,
      tenantId: "tenant_123",
      actorUserId: "user_123",
      decisionKind: "proposal_denied",
      cardId: created.cardId,
      proposalId: "proposal_post_completion_noise_1",
      targetCardId: null,
      persona: "cto",
      deliverableType: "technical_review",
      policyReason: "scope_guardrail",
      resolution: null,
      decisionNote: "Should stay out of the persisted closed-board package.",
      recommendationSummary: "Do not mutate the closed-board package snapshot.",
      objectionSummary: "This late governance noise should not rewrite the package export surface.",
      createdAt: new Date().toISOString()
    });

    const hydratedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    expect(hydratedBoard.completionPackage).toEqual(completedBoard.completionPackage);
    await expect(repository.getCompletionPackageSnapshot(board.runId)).resolves.toEqual(
      expect.objectContaining(persistedSnapshot ?? {})
    );
    expect(JSON.stringify(hydratedBoard.completionPackage)).not.toContain("Open an extra technical review lane");
  });

  it("keeps persisted governance history immutable after the board closes", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });

    await service.completeRun({
      authorization: "Bearer valid",
      runId: board.runId,
      completionSummary: "The CEO packaged the final business-facing outcome."
    });

    const completedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    const persistedSnapshot = await repository.getGovernanceHistorySnapshot(board.runId);
    const dryRunAction = completedBoard.memoryBoundary.exportCandidates
      ?.find((entry) => entry.id === "governance_history_export")
      ?.exportActions?.find((entry) => entry.actionRoute === "export-dry-run");
    expect(dryRunAction).toBeTruthy();
    const completedDryRun = await service.dryRunExportCandidate({
      authorization: "Bearer valid",
      runId: board.runId,
      candidateId: "governance_history_export",
      actionToken: dryRunAction!.actionToken
    });

    await repository.insertProposal({
      id: "proposal_post_completion_noise_2",
      runId: board.runId,
      parentCardId: created.cardId,
      requestedByCardId: created.cardId,
      requestedByPersona: "cfo",
      persona: "cto",
      title: "Open an extra technical review lane",
      deliverableType: "technical_review",
      status: "denied"
    });
    await repository.insertDecision({
      id: "decision_post_completion_noise_2",
      runId: board.runId,
      tenantId: "tenant_123",
      actorUserId: "user_123",
      decisionKind: "proposal_denied",
      cardId: created.cardId,
      proposalId: "proposal_post_completion_noise_2",
      targetCardId: null,
      persona: "cto",
      deliverableType: "technical_review",
      policyReason: "scope_guardrail",
      resolution: null,
      decisionNote: "Should stay out of the persisted closed-board governance history.",
      recommendationSummary: "Do not mutate the closed-board governance-history snapshot.",
      objectionSummary: "This late governance noise should not rewrite the governance export surface.",
      createdAt: new Date().toISOString()
    });

    const hydratedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    expect(hydratedBoard.recentDecisions).toEqual(completedBoard.recentDecisions);
    expect(hydratedBoard.followThroughItems).toEqual(completedBoard.followThroughItems);
    await expect(repository.getGovernanceHistorySnapshot(board.runId)).resolves.toEqual(
      expect.objectContaining(persistedSnapshot ?? {})
    );
    const refreshedDryRunAction = hydratedBoard.memoryBoundary.exportCandidates
      ?.find((entry) => entry.id === "governance_history_export")
      ?.exportActions?.find((entry) => entry.actionRoute === "export-dry-run");
    expect(refreshedDryRunAction).toBeTruthy();
    const hydratedDryRun = await service.dryRunExportCandidate({
      authorization: "Bearer valid",
      runId: board.runId,
      candidateId: "governance_history_export",
      actionToken: refreshedDryRunAction!.actionToken
    });
    expect(hydratedDryRun.bundleId).toBe(completedDryRun.bundleId);
    expect(hydratedDryRun.bundleRevision).toBe(completedDryRun.bundleRevision);
    expect(hydratedDryRun.content).not.toContain("Open an extra technical review lane");
  });

  it("keeps denied-only governance items visible in the completion package", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });

    await repository.insertProposal({
      id: "proposal_completion_denied_only_1",
      runId: board.runId,
      parentCardId: created.cardId,
      requestedByCardId: created.cardId,
      requestedByPersona: "cfo",
      persona: "cto",
      title: "Open an extra technical review lane",
      deliverableType: "technical_review",
      status: "denied"
    });
    await repository.insertDecision({
      id: "decision_completion_denied_only_1",
      runId: board.runId,
      tenantId: "tenant_123",
      actorUserId: "user_123",
      decisionKind: "proposal_denied",
      cardId: created.cardId,
      proposalId: "proposal_completion_denied_only_1",
      targetCardId: null,
      persona: "cto",
      deliverableType: "technical_review",
      policyReason: "scope_guardrail",
      resolution: null,
      decisionNote: "No extra lane.",
      recommendationSummary:
        "Keep this technical review work inside the current approved package boundary unless the CEO deliberately widens scope.",
      objectionSummary: "Do not widen this run beyond the approved technical review workflow boundary.",
      createdAt: new Date().toISOString()
    });

    await service.completeRun({
      authorization: "Bearer valid",
      runId: board.runId,
      completionSummary: "The CEO packaged the final business-facing outcome."
    });

    const completedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    expect(completedBoard.completionPackage).toEqual(
      expect.objectContaining({
        deferredApprovalCount: 0,
        deniedApprovalCount: 1,
        hasOpenGovernanceItems: true,
        packageNote: "The board outcome keeps denied governance requests visible so the tenant can see where the CEO held the workflow boundary.",
        governanceItems: [
          expect.objectContaining({
            proposalId: "proposal_completion_denied_only_1",
            statusLabel: "Denied by the CEO"
          })
        ]
      })
    );
  });

  it("keeps denied governance exportable through the existing closed-board candidates even when it falls outside the recent decision slice", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });

    await repository.insertProposal({
      id: "proposal_denied_export_visibility_1",
      runId: board.runId,
      parentCardId: created.cardId,
      requestedByCardId: created.cardId,
      requestedByPersona: "cfo",
      persona: "cto",
      title: "Open an extra technical review lane",
      deliverableType: "technical_review",
      status: "denied"
    });
    await repository.insertDecision({
      id: "decision_denied_export_visibility_1",
      runId: board.runId,
      tenantId: "tenant_123",
      actorUserId: "user_123",
      decisionKind: "proposal_denied",
      cardId: created.cardId,
      proposalId: "proposal_denied_export_visibility_1",
      targetCardId: null,
      persona: "cto",
      deliverableType: "technical_review",
      policyReason: "scope_guardrail",
      resolution: null,
      decisionNote: "Keep this denied governance item out of raw recent-decision dependency checks.",
      recommendationSummary:
        "Keep this technical review work inside the current approved package boundary unless the CEO deliberately widens scope.",
      objectionSummary: "Do not widen this run beyond the approved technical review workflow boundary.",
      createdAt: "2026-05-01T00:00:00.000Z"
    });

    for (let index = 1; index <= 8; index += 1) {
      await repository.insertDecision({
        id: `decision_newer_lane_opened_${index}`,
        runId: board.runId,
        tenantId: "tenant_123",
        actorUserId: "user_123",
        decisionKind: "lane_opened",
        cardId: created.cardId,
        proposalId: null,
        targetCardId: created.cardId,
        persona: index % 2 === 0 ? "researcher" : "cfo",
        deliverableType: index % 2 === 0 ? "research_brief" : "pricing_review",
        policyReason: "created_new_lane",
        resolution: null,
        decisionNote: null,
        recommendationSummary: null,
        objectionSummary: null,
        createdAt: `2026-05-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`
      });
    }

    await service.completeRun({
      authorization: "Bearer valid",
      runId: board.runId,
      completionSummary: "The CEO packaged the final business-facing outcome."
    });

    const completedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    expect(completedBoard.recentDecisions).toHaveLength(8);
    expect(completedBoard.recentDecisions.some((decision) => decision.label.includes("Denied"))).toBe(false);

    const candidate = completedBoard.memoryBoundary.exportCandidates?.find((entry) => entry.id === "governance_history_export");
    const dryRunAction = candidate?.exportActions?.find((entry) => entry.actionRoute === "export-dry-run");
    expect(candidate).toEqual(
      expect.objectContaining({
        governanceItemCount: 1,
        deniedGovernanceItemCount: 1,
        deferredGovernanceItemCount: 0,
        governanceExportDisposition: "included_in_existing_candidates",
        governanceExportDispositionLabel: "Included in governance history and package exports"
      })
    );
    expect(dryRunAction).toBeTruthy();

    const dryRun = await service.dryRunExportCandidate({
      authorization: "Bearer valid",
      runId: board.runId,
      candidateId: "governance_history_export",
      actionToken: dryRunAction!.actionToken
    });

    expect(dryRun.governanceItemCount).toBe(1);
    expect(dryRun.deniedGovernanceItemCount).toBe(1);
    expect(dryRun.deferredGovernanceItemCount).toBe(0);
    expect(dryRun.governanceExportDisposition).toBe("included_in_existing_candidates");
    expect(dryRun.governanceExportDispositionLabel).toBe("Included in governance history and package exports");
    expect(dryRun.content).toContain("## Governance Holds");
    expect(dryRun.content).toContain("Denied by the CEO");
    expect(dryRun.content).toContain("CTO Technical Review (Denied by the CEO)");
  });

  it("derives package-level recommendations and objections from the full governance set, not only the visible slice", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });

    for (let index = 1; index <= 7; index += 1) {
      const uniqueTail = index === 7;
      await repository.insertProposal({
        id: `proposal_completion_slice_${index}`,
        runId: board.runId,
        parentCardId: created.cardId,
        requestedByCardId: created.cardId,
        requestedByPersona: "cfo",
        persona: uniqueTail ? "cto" : "researcher",
        title: `Follow-up request ${index}`,
        deliverableType: uniqueTail ? "technical_review" : "research_brief",
        status: "denied"
      });
      await repository.insertDecision({
        id: `decision_completion_slice_${index}`,
        runId: board.runId,
        tenantId: "tenant_123",
        actorUserId: "user_123",
        decisionKind: "proposal_denied",
        cardId: created.cardId,
        proposalId: `proposal_completion_slice_${index}`,
        targetCardId: null,
        persona: uniqueTail ? "cto" : "researcher",
        deliverableType: uniqueTail ? "technical_review" : "research_brief",
        policyReason: "scope_guardrail",
        resolution: null,
        decisionNote: `Internal note ${index}`,
        recommendationSummary: uniqueTail
          ? "Keep this technical review work inside the current approved package boundary unless the CEO deliberately widens scope."
          : "Revisit this research brief request only if the CEO deliberately widens the approved workflow boundary.",
        objectionSummary: uniqueTail
          ? "Do not widen this run beyond the approved technical review workflow boundary."
          : "Do not widen this run beyond the approved research brief workflow boundary.",
        createdAt: new Date(Date.now() - index * 1000).toISOString()
      });
    }

    await service.completeRun({
      authorization: "Bearer valid",
      runId: board.runId,
      completionSummary: "The CEO packaged the final business-facing outcome."
    });

    const completedBoard = await service.listBoardState({ authorization: "Bearer valid" });
    expect(completedBoard.completionPackage?.governanceItems).toHaveLength(6);
    expect(completedBoard.completionPackage?.recommendations).toContain(
      "Keep this technical review work inside the current approved package boundary unless the CEO deliberately widens scope."
    );
    expect(completedBoard.completionPackage?.objections).toContain(
      "Do not widen this run beyond the approved technical review workflow boundary."
    );
  });

  it("rejects completion before the run reaches assembling", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });

    await expect(
      service.completeRun({
        authorization: "Bearer valid",
        runId: board.runId,
        completionSummary: "Too early."
      })
    ).rejects.toBeInstanceOf(HarnessRunCompletionConflictError);
  });

  it("treats repeated run completion as idempotent", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });

    await service.completeRun({
      authorization: "Bearer valid",
      runId: board.runId,
      completionSummary: "The CEO packaged the final business-facing outcome."
    });

    await expect(
      service.completeRun({
        authorization: "Bearer valid",
        runId: board.runId,
        completionSummary: "The CEO packaged the final business-facing outcome."
      })
    ).resolves.toEqual({
      runId: board.runId,
      state: "done"
    });
  });

  it("keeps committed run completion successful when post-commit audit publishing fails", async () => {
    const repository = createInMemoryHarnessRepository();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      audit: vi.fn().mockRejectedValue(new Error("audit unavailable")),
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    try {
      const board = await service.listBoardState({ authorization: "Bearer valid" });
      const created = await expectCreatedCard(service.createTopLevelChildCard({
        authorization: "Bearer valid",
        persona: "cfo",
        title: "Pressure-test the pricing lane",
        deliverableType: "pricing_review"
      }));
      await service.advanceChildCard({
        authorization: "Bearer valid",
        cardId: created.cardId,
        state: "working"
      });
      await service.advanceChildCard({
        authorization: "Bearer valid",
        cardId: created.cardId,
        state: "done",
        resultSummary: "Pricing floor is stable enough for launch."
      });

      await expect(
        service.completeRun({
          authorization: "Bearer valid",
          runId: board.runId,
          completionSummary: "The CEO packaged the final business-facing outcome."
        })
      ).resolves.toEqual({
        runId: board.runId,
        state: "done"
      });

      const run = await repository.findLatestRunForTenantWorkflow({
        tenantId: "tenant_123",
        workflowId: "wf_connect_first_workflow"
      });
      expect(run?.state).toBe("done");
      expect(warn).toHaveBeenCalledWith(
        "Harness audit publish failed after mutation commit",
        expect.objectContaining({
          eventType: "harness_run_completed",
          entityId: board.runId,
          message: "audit unavailable"
        })
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("keeps a committed mutation successful when post-commit audit publishing fails", async () => {
    const repository = createInMemoryHarnessRepository();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      audit: vi.fn().mockRejectedValue(new Error("audit unavailable")),
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    try {
      await service.listBoardState({ authorization: "Bearer valid" });
      const created = await expectCreatedCard(service.createTopLevelChildCard({
        authorization: "Bearer valid",
        persona: "cfo",
        title: "Pressure-test the pricing lane",
        deliverableType: "pricing_review"
      }));

      await expect(
        service.advanceChildCard({
          authorization: "Bearer valid",
          cardId: created.cardId,
          state: "working"
        })
      ).resolves.toEqual({
        cardId: created.cardId,
        state: "working"
      });

      const persistedCard = (await repository.listCardsForRun((await service.listBoardState({ authorization: "Bearer valid" })).runId))
        .find((card) => card.id === created.cardId);

      expect(persistedCard?.state).toBe("working");
      expect(warn).toHaveBeenCalledWith(
        "Harness audit publish failed after mutation commit",
        expect.objectContaining({
          eventType: expect.any(String),
          entityId: expect.any(String),
          message: "audit unavailable"
        })
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("rejects non-done outcome summaries before persisting child-card progression", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await expect(
      service.advanceChildCard({
        authorization: "Bearer valid",
        cardId: created.cardId,
        state: "working",
        resultSummary: "This should be rejected before any state change."
      })
    ).rejects.toBeInstanceOf(HarnessCardProgressionConflictError);

    const persistedCard = await repository.getCard(created.cardId);
    const persistedEvents = await repository.listEventsForCard(created.cardId);
    expect(persistedCard?.state).toBe("approved");
    expect(persistedEvents.map((event) => event.eventKind)).toEqual(["created", "state_changed"]);
  });

  it("fails closed when child-card advancement is invoked without an atomic runner", async () => {
    const repository = createInMemoryHarnessRepository();
    const createService = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });
    const readOnlyService = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await createService.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(createService.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await expect(
      readOnlyService.advanceChildCard({
        authorization: "Bearer valid",
        cardId: created.cardId,
        state: "working"
      })
    ).rejects.toThrow(/require atomic execution/i);
  });

  it("fails closed when child-card advancement requests an unsupported state", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await expect(
      service.advanceChildCard({
        authorization: "Bearer valid",
        cardId: created.cardId,
        state: "invented" as never
      })
    ).rejects.toBeInstanceOf(HarnessCardProgressionConflictError);
  });

  it("fails closed when child-card advancement targets a done run", async () => {
    const repository = createInMemoryHarnessRepository();
    const service = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await service.listBoardState({ authorization: "Bearer valid" });
    const created = await expectCreatedCard(service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "working"
    });
    await service.advanceChildCard({
      authorization: "Bearer valid",
      cardId: created.cardId,
      state: "done",
      resultSummary: "Pricing floor is stable enough for launch."
    });
    await service.completeRun({
      authorization: "Bearer valid",
      runId: board.runId,
      completionSummary: "The CEO packaged the final business-facing outcome."
    });

    await expect(
      service.advanceChildCard({
        authorization: "Bearer valid",
        cardId: created.cardId,
        state: "blocked"
      })
    ).rejects.toBeInstanceOf(HarnessCardProgressionConflictError);

    const persistedCard = await repository.getCard(created.cardId);
    expect(persistedCard?.state).toBe("done");
  });

  it("fails closed when approving a proposal from another tenant", async () => {
    const repository = createInMemoryHarnessRepository();
    const tenantOneService = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });
    const tenantTwoService = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_456",
        userId: "user_456",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await tenantOneService.listBoardState({ authorization: "Bearer tenant-one" });
    const created = await expectCreatedCard(tenantOneService.createTopLevelChildCard({
      authorization: "Bearer tenant-one",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertProposal({
      id: "proposal_cross_tenant_1",
      runId: board.runId,
      parentCardId: created.cardId,
      requestedByCardId: created.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief",
      status: "proposed"
    });

    await expect(
      tenantTwoService.approveProposal({
        authorization: "Bearer tenant-two",
        proposalId: "proposal_cross_tenant_1"
      })
    ).rejects.toBeInstanceOf(ApiAuthError);
  });

  it("fails closed when another tenant targets an already-approved proposal", async () => {
    const repository = createInMemoryHarnessRepository();
    const tenantOneService = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_123",
        userId: "user_123",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });
    const tenantTwoService = createHarnessBoardService({
      authenticate: vi.fn().mockResolvedValue({
        tenantId: "tenant_456",
        userId: "user_456",
        role: "member"
      }),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      requireActivePackageInstall: vi.fn().mockResolvedValue(undefined),
      repository,
      runAtomically: async (work) => work(repository),
      workflowRegistry: createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"]
      })
    });

    const board = await tenantOneService.listBoardState({ authorization: "Bearer tenant-one" });
    const created = await expectCreatedCard(tenantOneService.createTopLevelChildCard({
      authorization: "Bearer tenant-one",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }));

    await repository.insertProposal({
      id: "proposal_cross_tenant_approved_1",
      runId: board.runId,
      parentCardId: created.cardId,
      requestedByCardId: created.cardId,
      requestedByPersona: "cfo",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief",
      status: "approved",
      approvedCardId: "card_existing_research"
    });

    await expect(
      tenantTwoService.approveProposal({
        authorization: "Bearer tenant-two",
        proposalId: "proposal_cross_tenant_approved_1"
      })
    ).rejects.toBeInstanceOf(ApiAuthError);
  });
});
