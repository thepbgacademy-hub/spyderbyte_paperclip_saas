import { describe, expect, it } from "vitest";

import {
  assembleFactoryRunLaunchKit,
  FactoryRunExportNotReadyError
} from "../src/factory/runs/run-export-application-service.js";
import {
  createInMemoryFactoryRunApprovalRepository,
  type FactoryRunApprovalRow
} from "../src/factory/runs/run-approval-repository.js";
import {
  createInMemoryFactoryRunDeliverableRepository,
  type FactoryRunDeliverableRow
} from "../src/factory/runs/deliverable-repository.js";

function approvalRow(overrides: Partial<FactoryRunApprovalRow> = {}): FactoryRunApprovalRow {
  return {
    approvalId: "approval_run_1_positioning",
    tenantId: "tenant_1",
    runId: "run_1",
    packageId: "pkg_1",
    packageVersionId: "pkg_1@1.0.0",
    packageInstallId: "install_1",
    stationKey: "positioning",
    deliverableId: "deliverable_run_1_positioning_brief",
    contractKey: "original",
    status: "pending",
    requestedAt: "2026-07-21T00:00:00.000Z",
    resolvedAt: null,
    resolutionSummary: null,
    ...overrides
  };
}

function founderProfileRow(overrides: Partial<FactoryRunDeliverableRow> = {}): FactoryRunDeliverableRow {
  return {
    deliverableId: "deliverable_run_1_founder_profile",
    tenantId: "tenant_1",
    runId: "run_1",
    packageInstallId: "install_1",
    stationKey: "intake",
    kind: "founder_profile",
    title: "Founder Profile",
    body: {
      founderName: "Test Founder",
      businessName: "Test Business",
      primaryGoal: "Test goal",
      targetAudience: "Test audience",
      summary: "Test summary"
    },
    ...overrides
  };
}

function positioningRow(overrides: Partial<FactoryRunDeliverableRow> = {}): FactoryRunDeliverableRow {
  return {
    deliverableId: "deliverable_run_1_positioning_brief",
    tenantId: "tenant_1",
    runId: "run_1",
    packageInstallId: "install_1",
    stationKey: "positioning",
    kind: "positioning_brief",
    title: "Positioning Brief",
    body: { headline: "Test headline", audience: "Test audience", primaryGoal: "Test goal", positioningSummary: "Test summary" },
    ...overrides
  };
}

describe("assembleFactoryRunLaunchKit", () => {
  it("assembles a kit for an approved run with deliverables in station order", async () => {
    const approvalRepository = createInMemoryFactoryRunApprovalRepository();
    await approvalRepository.createPendingApproval({ row: approvalRow() });
    await approvalRepository.applyDecision({
      tenantId: "tenant_1",
      approvalId: "approval_run_1_positioning",
      status: "approved",
      resolvedAt: "2026-07-21T01:00:00.000Z",
      resolutionSummary: null
    });

    const deliverableRepository = createInMemoryFactoryRunDeliverableRepository();
    await deliverableRepository.save(positioningRow());
    await deliverableRepository.save(founderProfileRow());

    const kit = await assembleFactoryRunLaunchKit({
      tenantId: "tenant_1",
      runId: "run_1",
      deliverableRepository,
      approvalRepository
    });

    expect(kit.runId).toBe("run_1");
    expect(kit.packageId).toBe("pkg_1");
    expect(kit.packageVersionId).toBe("pkg_1@1.0.0");
    expect(kit.approvedAt).toBe("2026-07-21T01:00:00.000Z");
    expect(kit.deliverables.map((deliverable) => deliverable.stationKey)).toEqual(["intake", "positioning"]);
    expect(kit.deliverables.map((deliverable) => deliverable.kind)).toEqual(["founder_profile", "positioning_brief"]);
  });

  it("tie-breaks same-station deliverables by deliverableId ascending", async () => {
    const approvalRepository = createInMemoryFactoryRunApprovalRepository();
    await approvalRepository.createPendingApproval({ row: approvalRow() });
    await approvalRepository.applyDecision({
      tenantId: "tenant_1",
      approvalId: "approval_run_1_positioning",
      status: "approved",
      resolvedAt: "2026-07-21T01:00:00.000Z",
      resolutionSummary: null
    });

    const deliverableRepository = createInMemoryFactoryRunDeliverableRepository();
    await deliverableRepository.save(positioningRow());
    await deliverableRepository.save(
      positioningRow({
        deliverableId: "deliverable_run_1_positioning_addendum",
        kind: "positioning_addendum"
      })
    );

    const kit = await assembleFactoryRunLaunchKit({
      tenantId: "tenant_1",
      runId: "run_1",
      deliverableRepository,
      approvalRepository
    });

    expect(kit.deliverables.map((deliverable) => deliverable.kind)).toEqual([
      "positioning_addendum",
      "positioning_brief"
    ]);
  });

  it("refuses export when the run has no approved approval", async () => {
    const approvalRepository = createInMemoryFactoryRunApprovalRepository();
    await approvalRepository.createPendingApproval({ row: approvalRow() });

    const deliverableRepository = createInMemoryFactoryRunDeliverableRepository();
    await deliverableRepository.save(positioningRow());

    await expect(
      assembleFactoryRunLaunchKit({
        tenantId: "tenant_1",
        runId: "run_1",
        deliverableRepository,
        approvalRepository
      })
    ).rejects.toThrow(FactoryRunExportNotReadyError);
  });

  it("refuses export for a run whose only approval belongs to another tenant (cross-tenant is not distinguishable from missing)", async () => {
    const approvalRepository = createInMemoryFactoryRunApprovalRepository();
    await approvalRepository.createPendingApproval({ row: approvalRow({ tenantId: "tenant_1" }) });
    await approvalRepository.applyDecision({
      tenantId: "tenant_1",
      approvalId: "approval_run_1_positioning",
      status: "approved",
      resolvedAt: "2026-07-21T01:00:00.000Z",
      resolutionSummary: null
    });

    const deliverableRepository = createInMemoryFactoryRunDeliverableRepository();
    await deliverableRepository.save(positioningRow({ tenantId: "tenant_1" }));

    await expect(
      assembleFactoryRunLaunchKit({
        tenantId: "tenant_2",
        runId: "run_1",
        deliverableRepository,
        approvalRepository
      })
    ).rejects.toThrow(FactoryRunExportNotReadyError);
  });
});
