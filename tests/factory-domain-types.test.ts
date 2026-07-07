import { describe, expect, it } from "vitest";

import { DEFAULT_RUN_STATUS_ORDER, isTerminalRunStatus } from "../src/factory/domain/run-status.js";
import type {
  Approval,
  FounderProfileDeliverable,
  PositioningBriefDeliverable
} from "../src/factory/domain/types.js";

describe("factory run status domain", () => {
  it("keeps the blueprint-native run statuses in bounded lifecycle order", () => {
    expect(DEFAULT_RUN_STATUS_ORDER).toEqual([
      "draft",
      "ready",
      "running",
      "waiting_for_input",
      "waiting_for_approval",
      "completed",
      "failed"
    ]);
  });

  it("treats only completed and failed states as terminal", () => {
    expect(isTerminalRunStatus("draft")).toBe(false);
    expect(isTerminalRunStatus("running")).toBe(false);
    expect(isTerminalRunStatus("waiting_for_input")).toBe(false);
    expect(isTerminalRunStatus("waiting_for_approval")).toBe(false);
    expect(isTerminalRunStatus("completed")).toBe(true);
    expect(isTerminalRunStatus("failed")).toBe(true);
  });

  it("supports separate bounded output shapes for intake and positioning", () => {
    const founderProfile: FounderProfileDeliverable = {
      id: "deliverable_run_123_founder_profile",
      workspaceId: "ws_123",
      runId: "run_123",
      stationKey: "intake",
      kind: "founder_profile",
      title: "Founder Profile",
      status: "ready",
      body: {
        founderName: "Avery Stone",
        businessName: "Acme Advisory",
        primaryGoal: "Reach the first ten consulting clients",
        targetAudience: "Solo founders",
        summary: "Avery Stone is building Acme Advisory for Solo founders."
      }
    };

    const positioningBrief: PositioningBriefDeliverable = {
      id: "deliverable_run_123_positioning_brief",
      workspaceId: "ws_123",
      runId: "run_123",
      stationKey: "positioning",
      kind: "positioning_brief",
      title: "Positioning Brief",
      status: "ready",
      body: {
        headline: "Acme Advisory helps Solo founders reach the first ten consulting clients.",
        audience: "Solo founders",
        primaryGoal: "Reach the first ten consulting clients",
        positioningSummary:
          "Acme Advisory should position itself as the focused guide for Solo founders who need to Reach the first ten consulting clients."
      }
    };

    expect(founderProfile.kind).toBe("founder_profile");
    expect(positioningBrief.kind).toBe("positioning_brief");
    expect(positioningBrief.stationKey).toBe("positioning");
  });

  it("defines a bounded approval shape for review-gated factory work", () => {
    const approval: Approval = {
      id: "approval_run_123_positioning",
      workspaceId: "ws_123",
      runId: "run_123",
      packageId: "connect-first",
      packageInstallId: "install_123",
      stationKey: "positioning",
      deliverableId: "deliverable_run_123_positioning_brief",
      status: "pending",
      requestedAt: "2026-07-06T20:05:00.000Z",
      resolvedAt: null,
      resolutionSummary: null
    };

    expect(approval.stationKey).toBe("positioning");
    expect(approval.status).toBe("pending");
    expect(approval.resolvedAt).toBeNull();
  });
});
