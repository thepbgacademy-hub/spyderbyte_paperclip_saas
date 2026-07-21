import { describe, expect, it } from "vitest";

import {
  approvePendingApproval,
  createApprovalRequest,
  requestChangesForPendingApproval
} from "../src/factory/approvals/approval-service.js";

describe("factory approval service", () => {
  it("creates the first bounded approval request for a review-gated deliverable", () => {
    const approval = createApprovalRequest({
      id: "approval_run_123_positioning",
      workspaceId: "ws_123",
      runId: "run_123",
      packageId: "pkg_connect_first",
      packageVersionId: "pkg_connect_first@1.0.0",
      packageInstallId: "install_123",
      stationKey: "positioning",
      deliverableId: "deliverable_run_123_positioning_brief",
      requestedAt: "2026-07-06T20:05:00.000Z"
    });

    expect(approval).toEqual({
      id: "approval_run_123_positioning",
      workspaceId: "ws_123",
      runId: "run_123",
      packageId: "pkg_connect_first",
      packageVersionId: "pkg_connect_first@1.0.0",
      packageInstallId: "install_123",
      stationKey: "positioning",
      deliverableId: "deliverable_run_123_positioning_brief",
      status: "pending",
      requestedAt: "2026-07-06T20:05:00.000Z",
      resolvedAt: null,
      resolutionSummary: null
    });
  });

  it("fails closed when a pending approval is resolved twice", () => {
    const approval = {
      id: "approval_run_123_positioning",
      workspaceId: "ws_123",
      runId: "run_123",
      packageId: "pkg_connect_first",
      packageVersionId: "pkg_connect_first@1.0.0",
      packageInstallId: "install_123",
      stationKey: "positioning" as const,
      deliverableId: "deliverable_run_123_positioning_brief",
      status: "approved" as const,
      requestedAt: "2026-07-06T20:05:00.000Z",
      resolvedAt: "2026-07-06T20:06:00.000Z",
      resolutionSummary: null
    };

    expect(() =>
      approvePendingApproval({
        approval,
        resolvedAt: "2026-07-06T20:07:00.000Z"
      })
    ).toThrow('Approval "approval_run_123_positioning" is not pending');
  });

  it("records a bounded changes-requested resolution with a required summary", () => {
    const approval = createApprovalRequest({
      id: "approval_run_123_positioning",
      workspaceId: "ws_123",
      runId: "run_123",
      packageId: "pkg_connect_first",
      packageVersionId: "pkg_connect_first@1.0.0",
      packageInstallId: "install_123",
      stationKey: "positioning",
      deliverableId: "deliverable_run_123_positioning_brief",
      requestedAt: "2026-07-06T20:05:00.000Z"
    });

    expect(
      requestChangesForPendingApproval({
        approval,
        resolvedAt: "2026-07-06T20:06:00.000Z",
        resolutionSummary: "Tighten the audience claim and clarify the proof of value."
      })
    ).toEqual({
      ...approval,
      status: "changes_requested",
      resolvedAt: "2026-07-06T20:06:00.000Z",
      resolutionSummary: "Tighten the audience claim and clarify the proof of value."
    });
  });

  it("fails closed when a pending approval already carries stale resolution data", () => {
    const malformedPendingApproval = {
      id: "approval_run_123_positioning",
      workspaceId: "ws_123",
      runId: "run_123",
      packageId: "pkg_connect_first",
      packageVersionId: "pkg_connect_first@1.0.0",
      packageInstallId: "install_123",
      stationKey: "positioning" as const,
      deliverableId: "deliverable_run_123_positioning_brief",
      status: "pending" as const,
      requestedAt: "2026-07-06T20:05:00.000Z",
      resolvedAt: "2026-07-06T20:06:00.000Z",
      resolutionSummary: null
    };

    expect(() =>
      approvePendingApproval({
        approval: malformedPendingApproval,
        resolvedAt: "2026-07-06T20:07:00.000Z"
      })
    ).toThrow('Approval "approval_run_123_positioning" is malformed for pending resolution');

    expect(() =>
      requestChangesForPendingApproval({
        approval: malformedPendingApproval,
        resolvedAt: "2026-07-06T20:07:00.000Z",
        resolutionSummary: "Clarify the proof and narrow the audience promise."
      })
    ).toThrow('Approval "approval_run_123_positioning" is malformed for pending resolution');
  });
});
