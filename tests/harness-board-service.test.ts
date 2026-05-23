import { describe, expect, it, vi } from "vitest";

import { ApiAuthError } from "../src/api/dashboard-api.js";
import {
  ActivePackageInstallRequiredError,
  TenantMembershipRequiredError
} from "../src/db/supabase-repositories.js";
import {
  HarnessCardCreationConflictError,
  HarnessCardProgressionConflictError,
  HarnessRunCompletionConflictError,
  createHarnessBoardService
} from "../src/harness/board-service.js";
import { createInMemoryHarnessRepository } from "../src/harness/repository.js";
import { createHarnessWorkflowRegistry } from "../src/wealthfactory/workflow-registry.js";

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
    const created = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });

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
        statusLabel: "Pending CEO approval"
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
    const created = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });

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
    await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });

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
    const parentCard = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });

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
    const parentCard = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });

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
    const parentCard = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });

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
    const parentCard = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });

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
    const parentCard = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });

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
        handoffTargetCardId: parentCard.cardId,
        handoffTargetPersona: "CFO",
        handoffTargetTitle: "Pressure-test the pricing lane"
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
        policyReasonLabel: "Waiting on current lane owner",
        nextReviewTrigger: "Review again when the current deliverable owner clears or hands off the lane.",
        handoffTargetCardId: parentCard.cardId,
        handoffTargetPersona: "CFO",
        handoffTargetTitle: "Pressure-test the pricing lane"
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
    const parentCard = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });

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
    const parentCard = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });

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
    const parentCard = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });

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
    const created = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
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
    const created = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
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
    const created = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });

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
    const created = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });

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
    const created = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });
    const existingLane = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief"
    });

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
    const parentEvents = await repository.listEventsForCard(created.cardId);
    expect(pricingReviewCards).toHaveLength(1);
    expect(hydrated.pendingApprovals).toEqual([]);
    expect(laneEvents.some((event) => event.eventKind === "proposal_absorbed")).toBe(true);
    expect(laneCard?.activity.some((item) => item.label.includes('folded "Refresh pricing anchors"'))).toBe(true);
    expect(laneCard?.detailSections).toEqual(
      expect.arrayContaining([
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
    const existingLane = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief"
    });

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
    const existingLane = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief"
    });

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
    const result = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });
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

    const first = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });
    const second = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });

    const run = await repository.findLatestRunForTenantWorkflow({
      tenantId: "tenant_123",
      workflowId: "wf_connect_first_workflow"
    });
    const cards = await repository.listCardsForRun(run!.id);
    const cfoCards = cards.filter((card) => card.persona === "cfo");

    expect(second.cardId).toBe(first.cardId);
    expect(cfoCards).toHaveLength(1);
  });

  it("fails closed when another open card already owns the same deliverable lane", async () => {
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

    await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });

    await expect(
      service.createTopLevelChildCard({
        authorization: "Bearer valid",
        persona: "analyst",
        title: "Model the renewal downside",
        deliverableType: "pricing_review"
      })
    ).rejects.toBeInstanceOf(HarnessCardCreationConflictError);
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

  it("fails closed when the direct child-card limit is reached", async () => {
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
      await service.createTopLevelChildCard({
        authorization: "Bearer valid",
        persona: assignment.persona,
        title: assignment.title,
        deliverableType: assignment.deliverableType
      });
    }

    await expect(
      service.createTopLevelChildCard({
        authorization: "Bearer valid",
        persona: "legal",
        title: "Review the offer language",
        deliverableType: "legal_review"
      })
    ).rejects.toBeInstanceOf(HarnessCardCreationConflictError);
  });

  it("fails closed when direct child-card creation targets an assembling run", async () => {
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
    const created = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
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

    await expect(
      service.createTopLevelChildCard({
        authorization: "Bearer valid",
        persona: "researcher",
        title: "Research the next pricing iteration",
        deliverableType: "research_brief"
      })
    ).rejects.toBeInstanceOf(HarnessCardCreationConflictError);

    const run = await repository.findLatestRunForTenantWorkflow({
      tenantId: "tenant_123",
      workflowId: "wf_connect_first_workflow"
    });
    expect(run?.state).toBe("assembling");
  });

  it("fails closed when direct child-card creation targets a done run", async () => {
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
    const created = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
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
    ).rejects.toBeInstanceOf(HarnessCardCreationConflictError);

    const run = await repository.findLatestRunForTenantWorkflow({
      tenantId: "tenant_123",
      workflowId: "wf_connect_first_workflow"
    });
    expect(run?.state).toBe("done");
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
    const created = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });

    await expect(
      service.advanceChildCard({
        authorization: "Bearer valid",
        cardId: created.cardId,
        state: "working"
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
    expect(hydratedCard?.lane).toBe("done");
    expect(hydratedCard?.outcome).toBe("Pricing floor is stable enough for the first launch wave.");
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
    const created = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });

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
    const created = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });

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
    const created = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });

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
    const workingCard = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });
    const waitingCard = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "coo",
      title: "Prepare the fulfillment handoff",
      deliverableType: "ops_handoff"
    });

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
    const created = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
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
        hasOpenGovernanceItems: false,
        packageNote: "The board outcome includes clear next-step recommendations for the tenant-facing handoff.",
        recommendations: expect.arrayContaining(["Package only completed lanes into the tenant-facing board outcome."]),
        objections: [],
        governanceItems: []
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
    const created = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });
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
    const created = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
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
    const created = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
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
    const created = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
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
    const created = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
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
      const created = await service.createTopLevelChildCard({
        authorization: "Bearer valid",
        persona: "cfo",
        title: "Pressure-test the pricing lane",
        deliverableType: "pricing_review"
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
      const created = await service.createTopLevelChildCard({
        authorization: "Bearer valid",
        persona: "cfo",
        title: "Pressure-test the pricing lane",
        deliverableType: "pricing_review"
      });

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
    const created = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });

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
    const created = await createService.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });

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
    const created = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });

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
    const created = await service.createTopLevelChildCard({
      authorization: "Bearer valid",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
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
    const created = await tenantOneService.createTopLevelChildCard({
      authorization: "Bearer tenant-one",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });

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
    const created = await tenantOneService.createTopLevelChildCard({
      authorization: "Bearer tenant-one",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });

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
