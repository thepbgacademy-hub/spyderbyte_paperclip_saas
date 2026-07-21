import { describe, expect, it } from "vitest";

import { DEFAULT_RUN_STATUS_ORDER, isTerminalRunStatus } from "../src/factory/domain/run-status.js";
import type {
  Approval,
  BlueprintPersonaDefinition,
  CredentialAccessAuditIntent,
  FounderProfileDeliverable,
  MaskedPowerSourceCredential,
  PowerSourceCredential,
  PositioningBriefDeliverable,
  StationDefinition
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
      packageId: "pkg_connect_first",
      packageVersionId: "pkg_connect_first@1.0.0",
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
    expect(approval.packageVersionId).toBe("pkg_connect_first@1.0.0");
    expect(approval.resolvedAt).toBeNull();
  });

  it("supports specialist-bound station definitions instead of a legacy persona shell", () => {
    const founderGuide: BlueprintPersonaDefinition = {
      key: "founder_guide",
      name: "Founder Guide",
      tagline: "Guides the founder through intake.",
      specialistKey: "direction",
      allowedStationKeys: ["intake"]
    };
    const marketStrategist: BlueprintPersonaDefinition = {
      key: "market_strategist",
      name: "Market Strategist",
      tagline: "Shapes the positioning brief.",
      specialistKey: "market",
      allowedStationKeys: ["positioning"]
    };

    const intakeStation: StationDefinition = {
      key: "intake",
      familyKey: "intake",
      personaKey: "founder_guide",
      kind: "structured_interview",
      title: "Intake Station"
    };

    const positioningStation: StationDefinition = {
      key: "positioning",
      familyKey: "positioning",
      personaKey: "market_strategist",
      kind: "analysis",
      title: "Positioning Station"
    };

    expect(founderGuide.specialistKey).toBe("direction");
    expect(founderGuide.allowedStationKeys).toEqual(["intake"]);
    expect(marketStrategist.specialistKey).toBe("market");
    expect(marketStrategist.allowedStationKeys).toEqual(["positioning"]);
    expect(intakeStation.familyKey).toBe("intake");
    expect(intakeStation.personaKey).toBe("founder_guide");
    expect(positioningStation.familyKey).toBe("positioning");
    expect(positioningStation.personaKey).toBe("market_strategist");
  });

  it("defines a masked power-source credential shape separate from encrypted storage and decrypt audit", () => {
    const credential: PowerSourceCredential = {
      id: "credential_123",
      workspaceId: "workspace_123",
      providerKind: "openai_api",
      label: "Founder OpenAI key",
      last4: "cret",
      keyVersion: "v1",
      validationStatus: "pending",
      validationMessage: "Validation is queued.",
      lastValidatedAt: null,
      encryptedPayload: {
        ciphertext: "ciphertext",
        iv: "iv",
        tag: "tag",
        wrappedDataKey: "wrapped",
        wrappedDataKeyIv: "wrapped-iv",
        wrappedDataKeyTag: "wrapped-tag"
      },
      createdAt: "2026-07-11T12:00:00.000Z",
      deletedAt: null
    };
    const masked: MaskedPowerSourceCredential = {
      id: credential.id,
      workspaceId: credential.workspaceId,
      providerKind: credential.providerKind,
      label: credential.label,
      last4: credential.last4,
      keyVersion: credential.keyVersion,
      validationStatus: credential.validationStatus,
      validationMessage: credential.validationMessage,
      lastValidatedAt: credential.lastValidatedAt,
      createdAt: credential.createdAt,
      deletedAt: credential.deletedAt,
      masked: true
    };
    const audit: CredentialAccessAuditIntent = {
      id: "credential_access_123",
      workspaceId: credential.workspaceId,
      credentialId: credential.id,
      runId: "run_123",
      purpose: "worker_execution",
      accessedAt: "2026-07-11T12:01:00.000Z"
    };

    expect(masked).not.toHaveProperty("encryptedPayload");
    expect(masked.masked).toBe(true);
    expect(masked.last4).toBe("cret");
    expect(audit.runId).toBe("run_123");
    expect(audit.purpose).toBe("worker_execution");
  });
});
