import { describe, expect, it } from "vitest";

import {
  decideFactoryRunApproval,
  FactoryRunApprovalConflictError,
  FactoryRunApprovalNotFoundError,
  FactoryRunApprovalRevisionCapReachedError
} from "../src/factory/runs/run-approval-application-service.js";
import {
  createInMemoryFactoryRunApprovalRepository,
  type FactoryRunApprovalRow
} from "../src/factory/runs/run-approval-repository.js";

function pendingRow(overrides: Partial<FactoryRunApprovalRow> = {}): FactoryRunApprovalRow {
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

describe("decideFactoryRunApproval", () => {
  it("approves a pending approval and reports the run as ready for export", async () => {
    const repository = createInMemoryFactoryRunApprovalRepository();
    await repository.createPendingApproval({ row: pendingRow() });

    const result = await decideFactoryRunApproval({
      tenantId: "tenant_1",
      runId: "run_1",
      decision: "approve",
      decidedAt: "2026-07-21T01:00:00.000Z",
      repository
    });

    expect(result.runOutcome).toBe("ready_for_export");
    expect(result.approval.status).toBe("approved");
    expect(result.approval.resolvedAt).toBe("2026-07-21T01:00:00.000Z");

    expect(await repository.findPendingApprovalForRun({ tenantId: "tenant_1", runId: "run_1" })).toBeNull();
  });

  it("requests changes on the original contract and reports the run as awaiting revision", async () => {
    const repository = createInMemoryFactoryRunApprovalRepository();
    await repository.createPendingApproval({ row: pendingRow() });

    const result = await decideFactoryRunApproval({
      tenantId: "tenant_1",
      runId: "run_1",
      decision: "request_changes",
      resolutionSummary: "Sharpen the audience framing",
      decidedAt: "2026-07-21T01:00:00.000Z",
      repository
    });

    expect(result.runOutcome).toBe("awaiting_revision");
    expect(result.approval.status).toBe("changes_requested");
    expect(result.approval.resolutionSummary).toBe("Sharpen the audience framing");
  });

  it("honors the one-revision cap: request-changes on a revision_1 contract is rejected", async () => {
    const repository = createInMemoryFactoryRunApprovalRepository();
    await repository.createPendingApproval({
      row: pendingRow({ approvalId: "approval_run_1_positioning_revision_1", contractKey: "revision_1" })
    });

    await expect(
      decideFactoryRunApproval({
        tenantId: "tenant_1",
        runId: "run_1",
        decision: "request_changes",
        resolutionSummary: "One more pass please",
        decidedAt: "2026-07-21T01:00:00.000Z",
        repository
      })
    ).rejects.toThrow(FactoryRunApprovalRevisionCapReachedError);

    const stillPending = await repository.findPendingApprovalForRun({ tenantId: "tenant_1", runId: "run_1" });
    expect(stillPending?.status).toBe("pending");
  });

  it("still allows approval of a revision_1 contract even though changes cannot be requested again", async () => {
    const repository = createInMemoryFactoryRunApprovalRepository();
    await repository.createPendingApproval({
      row: pendingRow({ approvalId: "approval_run_1_positioning_revision_1", contractKey: "revision_1" })
    });

    const result = await decideFactoryRunApproval({
      tenantId: "tenant_1",
      runId: "run_1",
      decision: "approve",
      decidedAt: "2026-07-21T01:00:00.000Z",
      repository
    });

    expect(result.runOutcome).toBe("ready_for_export");
  });

  it("throws not-found when the tenant has no pending approval for the run (including cross-tenant lookups)", async () => {
    const repository = createInMemoryFactoryRunApprovalRepository();
    await repository.createPendingApproval({ row: pendingRow() });

    await expect(
      decideFactoryRunApproval({
        tenantId: "tenant_2",
        runId: "run_1",
        decision: "approve",
        decidedAt: "2026-07-21T01:00:00.000Z",
        repository
      })
    ).rejects.toThrow(FactoryRunApprovalNotFoundError);
  });

  it("throws conflict when a concurrent decision resolves the approval between the read and the write", async () => {
    const raced = pendingRow();
    const racingRepository = {
      async createPendingApproval() {
        throw new Error("not used in this test");
      },
      async findPendingApprovalForRun() {
        return raced;
      },
      async applyDecision() {
        // Simulates another request winning the race and resolving the row first.
        return null;
      }
    };

    await expect(
      decideFactoryRunApproval({
        tenantId: "tenant_1",
        runId: "run_1",
        decision: "approve",
        decidedAt: "2026-07-21T01:00:00.000Z",
        repository: racingRepository
      })
    ).rejects.toThrow(FactoryRunApprovalConflictError);
  });
});
