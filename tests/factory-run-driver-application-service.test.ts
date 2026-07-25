import { describe, expect, it } from "vitest";

import { startFactoryRun } from "../src/factory/runs/run-driver-application-service.js";
import { createInMemoryFactoryRunRepository } from "../src/factory/runs/run-repository.js";
import { createInMemoryFactoryRunDeliverableRepository } from "../src/factory/runs/deliverable-repository.js";
import { createInMemoryFactoryRunApprovalRepository } from "../src/factory/runs/run-approval-repository.js";
import { createWorkspace } from "../src/factory/workspaces/workspace-service.js";
import { createStubLLMProvider } from "../src/factory/providers/stub-provider.js";
import { loadBlueprintPackageManifest } from "../src/factory/packages/package-manifest-loader.js";
import { createCurrentSliceManifest } from "./factory-package-manifest-fixtures.js";

const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());

function buildDeps() {
  return {
    runRepository: createInMemoryFactoryRunRepository(),
    deliverableRepository: createInMemoryFactoryRunDeliverableRepository(),
    approvalRepository: createInMemoryFactoryRunApprovalRepository()
  };
}

function buildInput(input: {
  runId: string;
  deps: ReturnType<typeof buildDeps>;
}) {
  const workspace = createWorkspace({
    id: "tenant_1",
    name: "Acme Advisory",
    slug: "acme-advisory",
    createdAt: "2026-07-21T00:00:00.000Z"
  });
  const packageInstall = {
    id: "install_1",
    workspaceId: workspace.id,
    packageId: blueprint.packageId,
    packageVersionId: blueprint.packageVersionId,
    previousPackageVersionId: null,
    status: "enabled" as const,
    installedAt: "2026-07-21T00:00:00.000Z",
    updatedAt: null,
    disabledAt: null,
    uninstalledAt: null,
    enabled: true,
    permissionSnapshot: {
      permissions: {
        tools: [],
        externalActions: {},
        dataAccess: { tenantScopeOnly: true, packageScopeOnly: true, readableDeliverables: "own_package" as const }
      },
      budgets: { maxRunCostUsd: 10, maxRunMinutes: 60, maxStepCostUsd: 2, approvalRequiredAboveUsd: 5 }
    },
    permissionDiff: null
  };

  return {
    runId: input.runId,
    workspace,
    packageInstall,
    blueprint,
    answers: {
      founderName: "Avery Stone",
      businessName: "Acme Advisory",
      primaryGoal: "Reach the first ten consulting clients",
      targetAudience: "Solo founders"
    },
    provider: createStubLLMProvider(),
    providerModel: "stub-deterministic-v1",
    providerSecret: "no-real-secret-the-stub-never-uses-this",
    startedAt: "2026-07-21T00:00:00.000Z",
    intakeCompletedAt: "2026-07-21T00:01:00.000Z",
    positioningRequestedAt: "2026-07-21T00:02:00.000Z",
    ...input.deps
  };
}

describe("startFactoryRun", () => {
  it("drives intake -> positioning on the stub provider, persisting run state, both deliverables, and the checkpoint approval", async () => {
    const deps = buildDeps();
    const result = await startFactoryRun(buildInput({ runId: "run_1", deps }));

    expect(result.run.status).toBe("waiting_for_approval");
    expect(result.run.currentStationKey).toBe("positioning");
    expect(result.run.activeApprovalContractKey).toBe("original");
    expect(result.run.positioningRevisionGeneration).toBe(0);

    const persistedRun = await deps.runRepository.findByRunId({ tenantId: "tenant_1", runId: "run_1" });
    expect(persistedRun?.status).toBe("waiting_for_approval");
    expect(persistedRun?.currentStationKey).toBe("positioning");
    expect(persistedRun?.activeDeliverableId).toBe("deliverable_run_1_positioning_brief");
    expect(persistedRun?.activeApprovalId).toBe("approval_run_1_positioning");

    const deliverables = await deps.deliverableRepository.listDeliverablesForRun({
      tenantId: "tenant_1",
      runId: "run_1"
    });
    expect(deliverables).toHaveLength(2);
    expect(deliverables[0]?.stationKey).toBe("intake");
    expect(deliverables[0]?.kind).toBe("founder_profile");
    expect(deliverables[1]?.stationKey).toBe("positioning");
    expect(deliverables[1]?.kind).toBe("positioning_brief");

    const pendingApproval = await deps.approvalRepository.findPendingApprovalForRun({
      tenantId: "tenant_1",
      runId: "run_1"
    });
    expect(pendingApproval?.approvalId).toBe("approval_run_1_positioning");
    expect(pendingApproval?.deliverableId).toBe(deliverables[1]?.deliverableId);
    expect(pendingApproval?.contractKey).toBe("original");
    expect(pendingApproval?.status).toBe("pending");
  });

  it("is idempotent: re-invoking start for an existing run_id does not duplicate deliverables or approvals", async () => {
    const deps = buildDeps();
    const first = await startFactoryRun(buildInput({ runId: "run_2", deps }));
    const second = await startFactoryRun(buildInput({ runId: "run_2", deps }));

    expect(second.run).toEqual(first.run);

    const deliverables = await deps.deliverableRepository.listDeliverablesForRun({
      tenantId: "tenant_1",
      runId: "run_2"
    });
    expect(deliverables).toHaveLength(2);

    const approvalRepository = deps.approvalRepository;
    await expect(
      approvalRepository.createPendingApproval({
        row: {
          approvalId: "approval_run_2_positioning",
          tenantId: "tenant_1",
          runId: "run_2",
          packageId: blueprint.packageId,
          packageVersionId: blueprint.packageVersionId,
          packageInstallId: "install_1",
          stationKey: "positioning",
          deliverableId: "deliverable_run_2_positioning_brief",
          contractKey: "original",
          status: "pending",
          requestedAt: "2026-07-21T00:02:00.000Z",
          resolvedAt: null,
          resolutionSummary: null
        }
      })
    ).rejects.toThrow();
  });
});
