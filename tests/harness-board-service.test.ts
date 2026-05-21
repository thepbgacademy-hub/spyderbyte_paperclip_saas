import { describe, expect, it, vi } from "vitest";

import { ApiAuthError } from "../src/api/dashboard-api.js";
import {
  ActivePackageInstallRequiredError,
  TenantMembershipRequiredError
} from "../src/db/supabase-repositories.js";
import { createHarnessBoardService } from "../src/harness/board-service.js";
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
    expect(board.cards).toHaveLength(3);
    expect(board.cards.some((card) => card.persona === "CEO")).toBe(true);
    expect(board.cards.some((card) => card.persona === "CFO" && card.lane === "working")).toBe(true);
    expect(board.cards.some((card) => card.persona === "COO" && card.lane === "done")).toBe(true);
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
    await expect(repository.listCardsForRun(board.runId)).resolves.toHaveLength(3);
    await expect(repository.listEventsForRun(board.runId)).resolves.toHaveLength(6);
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
    await expect(repository.listCardsForRun(firstBoard.runId)).resolves.toHaveLength(3);
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
    const cfoCard = board.cards.find((card) => card.persona === "CFO");
    expect(cfoCard).toBeDefined();

    await repository.insertProposal({
      id: "proposal_approval_1",
      runId: board.runId,
      parentCardId: cfoCard!.id,
      requestedByCardId: cfoCard!.id,
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
    const cfoCard = board.cards.find((card) => card.persona === "CFO");
    expect(cfoCard).toBeDefined();

    await repository.insertProposal({
      id: "proposal_repeat_1",
      runId: board.runId,
      parentCardId: cfoCard!.id,
      requestedByCardId: cfoCard!.id,
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
    const cfoCard = board.cards.find((card) => card.persona === "CFO");
    expect(cfoCard).toBeDefined();

    await repository.insertProposal({
      id: "proposal_atomic_guard_1",
      runId: board.runId,
      parentCardId: cfoCard!.id,
      requestedByCardId: cfoCard!.id,
      requestedByPersona: "cfo",
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
});
