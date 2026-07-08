import { describe, expect, it } from "vitest";

import { createWorkspace } from "../src/factory/workspaces/workspace-service.js";
import { createBlueprintPackage } from "../src/factory/packages/package-registry.js";
import { installBlueprintPackage } from "../src/factory/packages/package-install-service.js";
import { submitIntakeAnswers, startIntakeRun } from "../src/factory/runs/intake-run-service.js";
import {
  approvePositioningAnalysis,
  completePositioningAnalysis,
  revisePositioningAnalysisAfterChangesRequested,
  requestChangesForPositioningAnalysis,
  startPositioningAnalysisStation
} from "../src/factory/runs/positioning-station-service.js";

function createCurrentSliceBlueprint(input?: { key?: string; title?: string }) {
  return createBlueprintPackage({
    key: input?.key ?? "connect-first",
    title: input?.title ?? "Connect First Operating System",
    personas: [
      {
        key: "founder_guide",
        name: "Founder Guide",
        tagline: "Guides the founder through intake.",
        specialistKey: "direction",
        allowedStationKeys: ["intake"]
      },
      {
        key: "market_strategist",
        name: "Market Strategist",
        tagline: "Shapes the positioning brief.",
        specialistKey: "market",
        allowedStationKeys: ["positioning"]
      }
    ],
    stations: [
      {
        key: "intake",
        familyKey: "intake",
        personaKey: "founder_guide",
        kind: "structured_interview",
        title: "Intake Station"
      },
      {
        key: "positioning",
        familyKey: "positioning",
        personaKey: "market_strategist",
        kind: "analysis",
        title: "Positioning Station"
      }
    ]
  });
}

function createIntakeOnlyBlueprint(input?: { key?: string; title?: string }) {
  return createBlueprintPackage({
    key: input?.key ?? "connect-first",
    title: input?.title ?? "Connect First Operating System",
    personas: [
      {
        key: "founder_guide",
        name: "Founder Guide",
        tagline: "Guides the founder through intake.",
        specialistKey: "direction",
        allowedStationKeys: ["intake"]
      }
    ],
    stations: [
      {
        key: "intake",
        familyKey: "intake",
        personaKey: "founder_guide",
        kind: "structured_interview",
        title: "Intake Station"
      }
    ]
  });
}

describe("factory positioning station service", () => {
  it("widens the reboot slice from intake into one bounded analysis station family", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T20:00:00.000Z"
    });
    const blueprint = createCurrentSliceBlueprint();
    const packageInstall = installBlueprintPackage({
      id: "install_123",
      workspaceId: workspace.id,
      blueprint,
      installedAt: "2026-07-06T20:01:00.000Z"
    });
    const intakeRun = startIntakeRun({
      id: "run_123",
      workspace,
      packageInstall,
      blueprint,
      startedAt: "2026-07-06T20:02:00.000Z"
    });
    const intakeCompletion = submitIntakeAnswers({
      run: intakeRun,
      workspace,
      packageInstall,
      blueprint,
      answers: {
        founderName: "Avery Stone",
        businessName: "Acme Advisory",
        primaryGoal: "Reach the first ten consulting clients",
        targetAudience: "Solo founders"
      },
      completedAt: "2026-07-06T20:03:00.000Z"
    });

    const analysisRun = startPositioningAnalysisStation({
      run: intakeCompletion.run,
      workspace,
      packageInstall,
      blueprint
    });

    expect(analysisRun.status).toBe("running");
    expect(analysisRun.currentStationKey).toBe("positioning");
    expect(analysisRun.startedAt).toBe("2026-07-06T20:02:00.000Z");

    const analysisCompletion = completePositioningAnalysis({
      run: analysisRun,
      workspace,
      packageInstall,
      blueprint,
      founderProfile: intakeCompletion.deliverable,
      requestedAt: "2026-07-06T20:05:00.000Z"
    });

    expect(analysisCompletion.run.status).toBe("waiting_for_approval");
    expect(analysisCompletion.run.currentStationKey).toBe("positioning");
    expect(analysisCompletion.run.completedAt).toBeNull();
    expect(analysisCompletion.deliverable).toEqual({
      id: "deliverable_run_123_positioning_brief",
      workspaceId: workspace.id,
      runId: "run_123",
      stationKey: "positioning",
      kind: "positioning_brief",
      title: "Positioning Brief",
      status: "ready",
      body: {
        headline: "Acme Advisory helps Solo founders Reach the first ten consulting clients.",
        audience: "Solo founders",
        primaryGoal: "Reach the first ten consulting clients",
        positioningSummary:
          "Acme Advisory should position itself as the focused guide for Solo founders who need to Reach the first ten consulting clients."
      }
    });
    expect(analysisCompletion.approval).toEqual({
      id: "approval_run_123_positioning",
      workspaceId: workspace.id,
      runId: "run_123",
      packageId: "connect-first",
      packageInstallId: "install_123",
      stationKey: "positioning",
      deliverableId: "deliverable_run_123_positioning_brief",
      status: "pending",
      requestedAt: "2026-07-06T20:05:00.000Z",
      resolvedAt: null,
      resolutionSummary: null
    });
  });

  it("fails closed when the blueprint does not expose a positioning analysis station", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T20:00:00.000Z"
    });
    const blueprint = createIntakeOnlyBlueprint();
    const packageInstall = installBlueprintPackage({
      id: "install_123",
      workspaceId: workspace.id,
      blueprint,
      installedAt: "2026-07-06T20:01:00.000Z"
    });
    const intakeRun = startIntakeRun({
      id: "run_123",
      workspace,
      packageInstall,
      blueprint,
      startedAt: "2026-07-06T20:02:00.000Z"
    });
    const intakeCompletion = submitIntakeAnswers({
      run: intakeRun,
      workspace,
      packageInstall,
      blueprint,
      answers: {
        founderName: "Avery Stone",
        businessName: "Acme Advisory",
        primaryGoal: "Reach the first ten consulting clients",
        targetAudience: "Solo founders"
      },
      completedAt: "2026-07-06T20:03:00.000Z"
    });

    expect(() =>
      startPositioningAnalysisStation({
        run: intakeCompletion.run,
        workspace,
        packageInstall,
        blueprint
      })
    ).toThrow('Blueprint package "connect-first" does not define a positioning analysis station');
  });

  it("fails closed when positioning analysis is started from a run that is not complete at intake", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T20:00:00.000Z"
    });
    const blueprint = createCurrentSliceBlueprint();
    const packageInstall = installBlueprintPackage({
      id: "install_123",
      workspaceId: workspace.id,
      blueprint,
      installedAt: "2026-07-06T20:01:00.000Z"
    });
    const intakeRun = startIntakeRun({
      id: "run_123",
      workspace,
      packageInstall,
      blueprint,
      startedAt: "2026-07-06T20:02:00.000Z"
    });

    expect(() =>
      startPositioningAnalysisStation({
        run: intakeRun,
        workspace,
        packageInstall,
        blueprint
      })
    ).toThrow('Run "run_123" must complete intake before the positioning analysis station can start');
  });

  it("fails closed when the founder profile belongs to a different run than the positioning analysis input", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T20:00:00.000Z"
    });
    const blueprint = createCurrentSliceBlueprint();
    const packageInstall = installBlueprintPackage({
      id: "install_123",
      workspaceId: workspace.id,
      blueprint,
      installedAt: "2026-07-06T20:01:00.000Z"
    });
    const intakeRun = startIntakeRun({
      id: "run_123",
      workspace,
      packageInstall,
      blueprint,
      startedAt: "2026-07-06T20:02:00.000Z"
    });
    const intakeCompletion = submitIntakeAnswers({
      run: intakeRun,
      workspace,
      packageInstall,
      blueprint,
      answers: {
        founderName: "Avery Stone",
        businessName: "Acme Advisory",
        primaryGoal: "Reach the first ten consulting clients",
        targetAudience: "Solo founders"
      },
      completedAt: "2026-07-06T20:03:00.000Z"
    });
    const analysisRun = startPositioningAnalysisStation({
      run: intakeCompletion.run,
      workspace,
      packageInstall,
      blueprint
    });

    expect(() =>
      completePositioningAnalysis({
        run: analysisRun,
        workspace,
        packageInstall,
        blueprint,
        founderProfile: {
          ...intakeCompletion.deliverable,
          runId: "run_other"
        },
        requestedAt: "2026-07-06T20:05:00.000Z"
      })
    ).toThrow(
      'Founder profile "deliverable_run_123_founder_profile" does not belong to the positioning analysis input contract'
    );
  });

  it("fails closed when positioning analysis uses a different install of the same package", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T20:00:00.000Z"
    });
    const blueprint = createCurrentSliceBlueprint();
    const packageInstall = installBlueprintPackage({
      id: "install_123",
      workspaceId: workspace.id,
      blueprint,
      installedAt: "2026-07-06T20:01:00.000Z"
    });
    const secondInstall = installBlueprintPackage({
      id: "install_456",
      workspaceId: workspace.id,
      blueprint,
      installedAt: "2026-07-06T20:01:30.000Z"
    });
    const intakeRun = startIntakeRun({
      id: "run_123",
      workspace,
      packageInstall,
      blueprint,
      startedAt: "2026-07-06T20:02:00.000Z"
    });
    const intakeCompletion = submitIntakeAnswers({
      run: intakeRun,
      workspace,
      packageInstall,
      blueprint,
      answers: {
        founderName: "Avery Stone",
        businessName: "Acme Advisory",
        primaryGoal: "Reach the first ten consulting clients",
        targetAudience: "Solo founders"
      },
      completedAt: "2026-07-06T20:03:00.000Z"
    });

    expect(() =>
      startPositioningAnalysisStation({
        run: intakeCompletion.run,
        workspace,
        packageInstall: secondInstall,
        blueprint
      })
    ).toThrow('Run "run_123" is bound to install "install_123", not "install_456"');
  });

  it("fails closed when positioning analysis receives an install for a different package identity", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T20:00:00.000Z"
    });
    const blueprint = createCurrentSliceBlueprint();
    const otherBlueprint = createCurrentSliceBlueprint({ key: "scale-offer", title: "Scale Offer Operating System" });
    const packageInstall = installBlueprintPackage({
      id: "install_123",
      workspaceId: workspace.id,
      blueprint,
      installedAt: "2026-07-06T20:01:00.000Z"
    });
    const intakeRun = startIntakeRun({
      id: "run_123",
      workspace,
      packageInstall,
      blueprint,
      startedAt: "2026-07-06T20:02:00.000Z"
    });
    const intakeCompletion = submitIntakeAnswers({
      run: intakeRun,
      workspace,
      packageInstall,
      blueprint,
      answers: {
        founderName: "Avery Stone",
        businessName: "Acme Advisory",
        primaryGoal: "Reach the first ten consulting clients",
        targetAudience: "Solo founders"
      },
      completedAt: "2026-07-06T20:03:00.000Z"
    });

    expect(() =>
      startPositioningAnalysisStation({
        run: intakeCompletion.run,
        workspace,
        packageInstall,
        blueprint: otherBlueprint
      })
    ).toThrow('Blueprint install "install_123" is bound to package "connect-first", not "scale-offer"');
  });

  it("approves the persisted positioning checkpoint and completes the run", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T20:00:00.000Z"
    });
    const blueprint = createCurrentSliceBlueprint();
    const packageInstall = installBlueprintPackage({
      id: "install_123",
      workspaceId: workspace.id,
      blueprint,
      installedAt: "2026-07-06T20:01:00.000Z"
    });
    const intakeRun = startIntakeRun({
      id: "run_123",
      workspace,
      packageInstall,
      blueprint,
      startedAt: "2026-07-06T20:02:00.000Z"
    });
    const intakeCompletion = submitIntakeAnswers({
      run: intakeRun,
      workspace,
      packageInstall,
      blueprint,
      answers: {
        founderName: "Avery Stone",
        businessName: "Acme Advisory",
        primaryGoal: "Reach the first ten consulting clients",
        targetAudience: "Solo founders"
      },
      completedAt: "2026-07-06T20:03:00.000Z"
    });
    const analysisRun = startPositioningAnalysisStation({
      run: intakeCompletion.run,
      workspace,
      packageInstall,
      blueprint
    });
    const analysisCompletion = completePositioningAnalysis({
      run: analysisRun,
      workspace,
      packageInstall,
      blueprint,
      founderProfile: intakeCompletion.deliverable,
      requestedAt: "2026-07-06T20:05:00.000Z"
    });

    const approvalCompletion = approvePositioningAnalysis({
      run: analysisCompletion.run,
      workspace,
      packageInstall,
      blueprint,
      positioningBrief: analysisCompletion.deliverable,
      approval: analysisCompletion.approval,
      approvedAt: "2026-07-06T20:06:00.000Z"
    });

    expect(approvalCompletion.run.status).toBe("completed");
    expect(approvalCompletion.run.currentStationKey).toBeNull();
    expect(approvalCompletion.run.completedAt).toBe("2026-07-06T20:06:00.000Z");
    expect(approvalCompletion.approval.status).toBe("approved");
    expect(approvalCompletion.approval.resolvedAt).toBe("2026-07-06T20:06:00.000Z");
  });

  it("fails closed when a positioning approval is resolved from the wrong install", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T20:00:00.000Z"
    });
    const blueprint = createCurrentSliceBlueprint();
    const packageInstall = installBlueprintPackage({
      id: "install_123",
      workspaceId: workspace.id,
      blueprint,
      installedAt: "2026-07-06T20:01:00.000Z"
    });
    const secondInstall = installBlueprintPackage({
      id: "install_456",
      workspaceId: workspace.id,
      blueprint,
      installedAt: "2026-07-06T20:01:30.000Z"
    });
    const intakeRun = startIntakeRun({
      id: "run_123",
      workspace,
      packageInstall,
      blueprint,
      startedAt: "2026-07-06T20:02:00.000Z"
    });
    const intakeCompletion = submitIntakeAnswers({
      run: intakeRun,
      workspace,
      packageInstall,
      blueprint,
      answers: {
        founderName: "Avery Stone",
        businessName: "Acme Advisory",
        primaryGoal: "Reach the first ten consulting clients",
        targetAudience: "Solo founders"
      },
      completedAt: "2026-07-06T20:03:00.000Z"
    });
    const analysisRun = startPositioningAnalysisStation({
      run: intakeCompletion.run,
      workspace,
      packageInstall,
      blueprint
    });
    const analysisCompletion = completePositioningAnalysis({
      run: analysisRun,
      workspace,
      packageInstall,
      blueprint,
      founderProfile: intakeCompletion.deliverable,
      requestedAt: "2026-07-06T20:05:00.000Z"
    });

    expect(() =>
      approvePositioningAnalysis({
        run: analysisCompletion.run,
        workspace,
        packageInstall: secondInstall,
        blueprint,
        positioningBrief: analysisCompletion.deliverable,
        approval: analysisCompletion.approval,
        approvedAt: "2026-07-06T20:06:00.000Z"
      })
    ).toThrow('Run "run_123" is bound to install "install_123", not "install_456"');
  });

  it("pauses the run for bounded revision input when changes are requested", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T20:00:00.000Z"
    });
    const blueprint = createCurrentSliceBlueprint();
    const packageInstall = installBlueprintPackage({
      id: "install_123",
      workspaceId: workspace.id,
      blueprint,
      installedAt: "2026-07-06T20:01:00.000Z"
    });
    const intakeRun = startIntakeRun({
      id: "run_123",
      workspace,
      packageInstall,
      blueprint,
      startedAt: "2026-07-06T20:02:00.000Z"
    });
    const intakeCompletion = submitIntakeAnswers({
      run: intakeRun,
      workspace,
      packageInstall,
      blueprint,
      answers: {
        founderName: "Avery Stone",
        businessName: "Acme Advisory",
        primaryGoal: "Reach the first ten consulting clients",
        targetAudience: "Solo founders"
      },
      completedAt: "2026-07-06T20:03:00.000Z"
    });
    const analysisRun = startPositioningAnalysisStation({
      run: intakeCompletion.run,
      workspace,
      packageInstall,
      blueprint
    });
    const analysisCompletion = completePositioningAnalysis({
      run: analysisRun,
      workspace,
      packageInstall,
      blueprint,
      founderProfile: intakeCompletion.deliverable,
      requestedAt: "2026-07-06T20:05:00.000Z"
    });

    const changesRequested = requestChangesForPositioningAnalysis({
      run: analysisCompletion.run,
      workspace,
      packageInstall,
      blueprint,
      positioningBrief: analysisCompletion.deliverable,
      approval: analysisCompletion.approval,
      requestedChangesAt: "2026-07-06T20:06:00.000Z",
      resolutionSummary: "Tighten the audience claim and clarify the proof of value."
    });

    expect(changesRequested.run.status).toBe("waiting_for_input");
    expect(changesRequested.run.currentStationKey).toBe("positioning");
    expect(changesRequested.run.completedAt).toBeNull();
    expect(changesRequested.approval.status).toBe("changes_requested");
    expect(changesRequested.approval.resolutionSummary).toBe(
      "Tighten the audience claim and clarify the proof of value."
    );
  });

  it("fails closed when the original completion path is reused after changes are requested", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T20:00:00.000Z"
    });
    const blueprint = createCurrentSliceBlueprint();
    const packageInstall = installBlueprintPackage({
      id: "install_123",
      workspaceId: workspace.id,
      blueprint,
      installedAt: "2026-07-06T20:01:00.000Z"
    });
    const intakeRun = startIntakeRun({
      id: "run_123",
      workspace,
      packageInstall,
      blueprint,
      startedAt: "2026-07-06T20:02:00.000Z"
    });
    const intakeCompletion = submitIntakeAnswers({
      run: intakeRun,
      workspace,
      packageInstall,
      blueprint,
      answers: {
        founderName: "Avery Stone",
        businessName: "Acme Advisory",
        primaryGoal: "Reach the first ten consulting clients",
        targetAudience: "Solo founders"
      },
      completedAt: "2026-07-06T20:03:00.000Z"
    });
    const analysisRun = startPositioningAnalysisStation({
      run: intakeCompletion.run,
      workspace,
      packageInstall,
      blueprint
    });
    const analysisCompletion = completePositioningAnalysis({
      run: analysisRun,
      workspace,
      packageInstall,
      blueprint,
      founderProfile: intakeCompletion.deliverable,
      requestedAt: "2026-07-06T20:05:00.000Z"
    });
    const changesRequested = requestChangesForPositioningAnalysis({
      run: analysisCompletion.run,
      workspace,
      packageInstall,
      blueprint,
      positioningBrief: analysisCompletion.deliverable,
      approval: analysisCompletion.approval,
      requestedChangesAt: "2026-07-06T20:06:00.000Z",
      resolutionSummary: "Tighten the audience claim and clarify the proof of value."
    });

    expect(() =>
      completePositioningAnalysis({
        run: changesRequested.run,
        workspace,
        packageInstall,
        blueprint,
        founderProfile: intakeCompletion.deliverable,
        requestedAt: "2026-07-06T20:07:00.000Z"
      })
    ).toThrow('Run "run_123" is not actively running the positioning analysis station');
  });

  it("creates a revised positioning brief and a fresh approval request after changes are requested", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T20:00:00.000Z"
    });
    const blueprint = createCurrentSliceBlueprint();
    const packageInstall = installBlueprintPackage({
      id: "install_123",
      workspaceId: workspace.id,
      blueprint,
      installedAt: "2026-07-06T20:01:00.000Z"
    });
    const intakeRun = startIntakeRun({
      id: "run_123",
      workspace,
      packageInstall,
      blueprint,
      startedAt: "2026-07-06T20:02:00.000Z"
    });
    const intakeCompletion = submitIntakeAnswers({
      run: intakeRun,
      workspace,
      packageInstall,
      blueprint,
      answers: {
        founderName: "Avery Stone",
        businessName: "Acme Advisory",
        primaryGoal: "Reach the first ten consulting clients",
        targetAudience: "Solo founders"
      },
      completedAt: "2026-07-06T20:03:00.000Z"
    });
    const analysisRun = startPositioningAnalysisStation({
      run: intakeCompletion.run,
      workspace,
      packageInstall,
      blueprint
    });
    const analysisCompletion = completePositioningAnalysis({
      run: analysisRun,
      workspace,
      packageInstall,
      blueprint,
      founderProfile: intakeCompletion.deliverable,
      requestedAt: "2026-07-06T20:05:00.000Z"
    });
    const changesRequested = requestChangesForPositioningAnalysis({
      run: analysisCompletion.run,
      workspace,
      packageInstall,
      blueprint,
      positioningBrief: analysisCompletion.deliverable,
      approval: analysisCompletion.approval,
      requestedChangesAt: "2026-07-06T20:06:00.000Z",
      resolutionSummary: "Tighten the audience claim and clarify the proof of value."
    });

    const revised = revisePositioningAnalysisAfterChangesRequested({
      run: changesRequested.run,
      workspace,
      packageInstall,
      blueprint,
      founderProfile: intakeCompletion.deliverable,
      previousPositioningBrief: analysisCompletion.deliverable,
      previousApproval: changesRequested.approval,
      revisionSummary: "Clarify the buyer proof and narrow the audience promise.",
      requestedAt: "2026-07-06T20:07:00.000Z"
    });

    expect(revised.run.status).toBe("waiting_for_approval");
    expect(revised.run.currentStationKey).toBe("positioning");
    expect(revised.run.completedAt).toBeNull();
    expect(revised.deliverable).toEqual({
      id: "deliverable_run_123_positioning_brief_revision_1",
      workspaceId: workspace.id,
      runId: "run_123",
      stationKey: "positioning",
      kind: "positioning_brief",
      title: "Positioning Brief",
      status: "ready",
      body: {
        headline: "Acme Advisory helps Solo founders Reach the first ten consulting clients.",
        audience: "Solo founders",
        primaryGoal: "Reach the first ten consulting clients",
        positioningSummary:
          "Acme Advisory should position itself as the focused guide for Solo founders who need to Reach the first ten consulting clients. Revision focus: Clarify the buyer proof and narrow the audience promise."
      }
    });
    expect(revised.approval).toEqual({
      id: "approval_run_123_positioning_revision_1",
      workspaceId: workspace.id,
      runId: "run_123",
      packageId: "connect-first",
      packageInstallId: "install_123",
      stationKey: "positioning",
      deliverableId: "deliverable_run_123_positioning_brief_revision_1",
      status: "pending",
      requestedAt: "2026-07-06T20:07:00.000Z",
      resolvedAt: null,
      resolutionSummary: null
    });
  });

  it("approves the first revised positioning brief and completes the run without widening downstream", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T20:00:00.000Z"
    });
    const blueprint = createCurrentSliceBlueprint();
    const packageInstall = installBlueprintPackage({
      id: "install_123",
      workspaceId: workspace.id,
      blueprint,
      installedAt: "2026-07-06T20:01:00.000Z"
    });
    const intakeRun = startIntakeRun({
      id: "run_123",
      workspace,
      packageInstall,
      blueprint,
      startedAt: "2026-07-06T20:02:00.000Z"
    });
    const intakeCompletion = submitIntakeAnswers({
      run: intakeRun,
      workspace,
      packageInstall,
      blueprint,
      answers: {
        founderName: "Avery Stone",
        businessName: "Acme Advisory",
        primaryGoal: "Reach the first ten consulting clients",
        targetAudience: "Solo founders"
      },
      completedAt: "2026-07-06T20:03:00.000Z"
    });
    const analysisRun = startPositioningAnalysisStation({
      run: intakeCompletion.run,
      workspace,
      packageInstall,
      blueprint
    });
    const analysisCompletion = completePositioningAnalysis({
      run: analysisRun,
      workspace,
      packageInstall,
      blueprint,
      founderProfile: intakeCompletion.deliverable,
      requestedAt: "2026-07-06T20:05:00.000Z"
    });
    const changesRequested = requestChangesForPositioningAnalysis({
      run: analysisCompletion.run,
      workspace,
      packageInstall,
      blueprint,
      positioningBrief: analysisCompletion.deliverable,
      approval: analysisCompletion.approval,
      requestedChangesAt: "2026-07-06T20:06:00.000Z",
      resolutionSummary: "Tighten the audience claim and clarify the proof of value."
    });
    const revised = revisePositioningAnalysisAfterChangesRequested({
      run: changesRequested.run,
      workspace,
      packageInstall,
      blueprint,
      founderProfile: intakeCompletion.deliverable,
      previousPositioningBrief: analysisCompletion.deliverable,
      previousApproval: changesRequested.approval,
      revisionSummary: "Clarify the buyer proof and narrow the audience promise.",
      requestedAt: "2026-07-06T20:07:00.000Z"
    });

    const approvalCompletion = approvePositioningAnalysis({
      run: revised.run,
      workspace,
      packageInstall,
      blueprint,
      positioningBrief: revised.deliverable,
      approval: revised.approval,
      approvedAt: "2026-07-06T20:08:00.000Z"
    });

    expect(approvalCompletion.run.status).toBe("completed");
    expect(approvalCompletion.run.currentStationKey).toBeNull();
    expect(approvalCompletion.run.completedAt).toBe("2026-07-06T20:08:00.000Z");
    expect(approvalCompletion.approval).toEqual({
      ...revised.approval,
      status: "approved",
      resolvedAt: "2026-07-06T20:08:00.000Z"
    });
  });

  it("fails closed when a revised run is approved with a fabricated original approval pair", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T20:00:00.000Z"
    });
    const blueprint = createCurrentSliceBlueprint();
    const packageInstall = installBlueprintPackage({
      id: "install_123",
      workspaceId: workspace.id,
      blueprint,
      installedAt: "2026-07-06T20:01:00.000Z"
    });
    const intakeRun = startIntakeRun({
      id: "run_123",
      workspace,
      packageInstall,
      blueprint,
      startedAt: "2026-07-06T20:02:00.000Z"
    });
    const intakeCompletion = submitIntakeAnswers({
      run: intakeRun,
      workspace,
      packageInstall,
      blueprint,
      answers: {
        founderName: "Avery Stone",
        businessName: "Acme Advisory",
        primaryGoal: "Reach the first ten consulting clients",
        targetAudience: "Solo founders"
      },
      completedAt: "2026-07-06T20:03:00.000Z"
    });
    const analysisRun = startPositioningAnalysisStation({
      run: intakeCompletion.run,
      workspace,
      packageInstall,
      blueprint
    });
    const analysisCompletion = completePositioningAnalysis({
      run: analysisRun,
      workspace,
      packageInstall,
      blueprint,
      founderProfile: intakeCompletion.deliverable,
      requestedAt: "2026-07-06T20:05:00.000Z"
    });
    const changesRequested = requestChangesForPositioningAnalysis({
      run: analysisCompletion.run,
      workspace,
      packageInstall,
      blueprint,
      positioningBrief: analysisCompletion.deliverable,
      approval: analysisCompletion.approval,
      requestedChangesAt: "2026-07-06T20:06:00.000Z",
      resolutionSummary: "Tighten the audience claim and clarify the proof of value."
    });
    const revised = revisePositioningAnalysisAfterChangesRequested({
      run: changesRequested.run,
      workspace,
      packageInstall,
      blueprint,
      founderProfile: intakeCompletion.deliverable,
      previousPositioningBrief: analysisCompletion.deliverable,
      previousApproval: changesRequested.approval,
      revisionSummary: "Clarify the buyer proof and narrow the audience promise.",
      requestedAt: "2026-07-06T20:07:00.000Z"
    });

    expect(() =>
      approvePositioningAnalysis({
        run: revised.run,
        workspace,
        packageInstall,
        blueprint,
        positioningBrief: analysisCompletion.deliverable,
        approval: {
          id: "approval_run_123_positioning",
          workspaceId: workspace.id,
          runId: "run_123",
          packageId: blueprint.id,
          packageInstallId: packageInstall.id,
          stationKey: "positioning",
          deliverableId: analysisCompletion.deliverable.id,
          status: "pending",
          requestedAt: "2026-07-06T20:05:00.000Z",
          resolvedAt: null,
          resolutionSummary: null
        },
        approvedAt: "2026-07-06T20:08:00.000Z"
      })
    ).toThrow('Approval "approval_run_123_positioning" does not belong to the active positioning approval contract');
  });

  it("fails closed when a revised run reopens changes with a fabricated original approval pair", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T20:00:00.000Z"
    });
    const blueprint = createCurrentSliceBlueprint();
    const packageInstall = installBlueprintPackage({
      id: "install_123",
      workspaceId: workspace.id,
      blueprint,
      installedAt: "2026-07-06T20:01:00.000Z"
    });
    const intakeRun = startIntakeRun({
      id: "run_123",
      workspace,
      packageInstall,
      blueprint,
      startedAt: "2026-07-06T20:02:00.000Z"
    });
    const intakeCompletion = submitIntakeAnswers({
      run: intakeRun,
      workspace,
      packageInstall,
      blueprint,
      answers: {
        founderName: "Avery Stone",
        businessName: "Acme Advisory",
        primaryGoal: "Reach the first ten consulting clients",
        targetAudience: "Solo founders"
      },
      completedAt: "2026-07-06T20:03:00.000Z"
    });
    const analysisRun = startPositioningAnalysisStation({
      run: intakeCompletion.run,
      workspace,
      packageInstall,
      blueprint
    });
    const analysisCompletion = completePositioningAnalysis({
      run: analysisRun,
      workspace,
      packageInstall,
      blueprint,
      founderProfile: intakeCompletion.deliverable,
      requestedAt: "2026-07-06T20:05:00.000Z"
    });
    const changesRequested = requestChangesForPositioningAnalysis({
      run: analysisCompletion.run,
      workspace,
      packageInstall,
      blueprint,
      positioningBrief: analysisCompletion.deliverable,
      approval: analysisCompletion.approval,
      requestedChangesAt: "2026-07-06T20:06:00.000Z",
      resolutionSummary: "Tighten the audience claim and clarify the proof of value."
    });
    const revised = revisePositioningAnalysisAfterChangesRequested({
      run: changesRequested.run,
      workspace,
      packageInstall,
      blueprint,
      founderProfile: intakeCompletion.deliverable,
      previousPositioningBrief: analysisCompletion.deliverable,
      previousApproval: changesRequested.approval,
      revisionSummary: "Clarify the buyer proof and narrow the audience promise.",
      requestedAt: "2026-07-06T20:07:00.000Z"
    });

    expect(() =>
      requestChangesForPositioningAnalysis({
        run: revised.run,
        workspace,
        packageInstall,
        blueprint,
        positioningBrief: analysisCompletion.deliverable,
        approval: {
          id: "approval_run_123_positioning",
          workspaceId: workspace.id,
          runId: "run_123",
          packageId: blueprint.id,
          packageInstallId: packageInstall.id,
          stationKey: "positioning",
          deliverableId: analysisCompletion.deliverable.id,
          status: "pending",
          requestedAt: "2026-07-06T20:05:00.000Z",
          resolvedAt: null,
          resolutionSummary: null
        },
        requestedChangesAt: "2026-07-06T20:08:00.000Z",
        resolutionSummary: "Attempt to reopen the original loop."
      })
    ).toThrow('Approval "approval_run_123_positioning" does not belong to the active positioning approval contract');
  });

  it("fails closed when a revised run forges the original approval family back into active state", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T20:00:00.000Z"
    });
    const blueprint = createCurrentSliceBlueprint();
    const packageInstall = installBlueprintPackage({
      id: "install_123",
      workspaceId: workspace.id,
      blueprint,
      installedAt: "2026-07-06T20:01:00.000Z"
    });
    const intakeRun = startIntakeRun({
      id: "run_123",
      workspace,
      packageInstall,
      blueprint,
      startedAt: "2026-07-06T20:02:00.000Z"
    });
    const intakeCompletion = submitIntakeAnswers({
      run: intakeRun,
      workspace,
      packageInstall,
      blueprint,
      answers: {
        founderName: "Avery Stone",
        businessName: "Acme Advisory",
        primaryGoal: "Reach the first ten consulting clients",
        targetAudience: "Solo founders"
      },
      completedAt: "2026-07-06T20:03:00.000Z"
    });
    const analysisRun = startPositioningAnalysisStation({
      run: intakeCompletion.run,
      workspace,
      packageInstall,
      blueprint
    });
    const analysisCompletion = completePositioningAnalysis({
      run: analysisRun,
      workspace,
      packageInstall,
      blueprint,
      founderProfile: intakeCompletion.deliverable,
      requestedAt: "2026-07-06T20:05:00.000Z"
    });
    const changesRequested = requestChangesForPositioningAnalysis({
      run: analysisCompletion.run,
      workspace,
      packageInstall,
      blueprint,
      positioningBrief: analysisCompletion.deliverable,
      approval: analysisCompletion.approval,
      requestedChangesAt: "2026-07-06T20:06:00.000Z",
      resolutionSummary: "Tighten the audience claim and clarify the proof of value."
    });
    const revised = revisePositioningAnalysisAfterChangesRequested({
      run: changesRequested.run,
      workspace,
      packageInstall,
      blueprint,
      founderProfile: intakeCompletion.deliverable,
      previousPositioningBrief: analysisCompletion.deliverable,
      previousApproval: changesRequested.approval,
      revisionSummary: "Clarify the buyer proof and narrow the audience promise.",
      requestedAt: "2026-07-06T20:07:00.000Z"
    });

    expect(() =>
      approvePositioningAnalysis({
        run: {
          ...revised.run,
          activeDeliverableId: analysisCompletion.deliverable.id,
          activeApprovalId: analysisCompletion.approval.id,
          activeApprovalContractKey: "original"
        },
        workspace,
        packageInstall,
        blueprint,
        positioningBrief: analysisCompletion.deliverable,
        approval: {
          ...analysisCompletion.approval,
          status: "pending"
        },
        approvedAt: "2026-07-06T20:08:00.000Z"
      })
    ).toThrow('Approval "approval_run_123_positioning" does not belong to the bounded positioning approval contract');
  });

  it("fails closed when a completed revised run tries to restart positioning", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T20:00:00.000Z"
    });
    const blueprint = createCurrentSliceBlueprint();
    const packageInstall = installBlueprintPackage({
      id: "install_123",
      workspaceId: workspace.id,
      blueprint,
      installedAt: "2026-07-06T20:01:00.000Z"
    });
    const intakeRun = startIntakeRun({
      id: "run_123",
      workspace,
      packageInstall,
      blueprint,
      startedAt: "2026-07-06T20:02:00.000Z"
    });
    const intakeCompletion = submitIntakeAnswers({
      run: intakeRun,
      workspace,
      packageInstall,
      blueprint,
      answers: {
        founderName: "Avery Stone",
        businessName: "Acme Advisory",
        primaryGoal: "Reach the first ten consulting clients",
        targetAudience: "Solo founders"
      },
      completedAt: "2026-07-06T20:03:00.000Z"
    });
    const analysisRun = startPositioningAnalysisStation({
      run: intakeCompletion.run,
      workspace,
      packageInstall,
      blueprint
    });
    const analysisCompletion = completePositioningAnalysis({
      run: analysisRun,
      workspace,
      packageInstall,
      blueprint,
      founderProfile: intakeCompletion.deliverable,
      requestedAt: "2026-07-06T20:05:00.000Z"
    });
    const changesRequested = requestChangesForPositioningAnalysis({
      run: analysisCompletion.run,
      workspace,
      packageInstall,
      blueprint,
      positioningBrief: analysisCompletion.deliverable,
      approval: analysisCompletion.approval,
      requestedChangesAt: "2026-07-06T20:06:00.000Z",
      resolutionSummary: "Tighten the audience claim and clarify the proof of value."
    });
    const revised = revisePositioningAnalysisAfterChangesRequested({
      run: changesRequested.run,
      workspace,
      packageInstall,
      blueprint,
      founderProfile: intakeCompletion.deliverable,
      previousPositioningBrief: analysisCompletion.deliverable,
      previousApproval: changesRequested.approval,
      revisionSummary: "Clarify the buyer proof and narrow the audience promise.",
      requestedAt: "2026-07-06T20:07:00.000Z"
    });
    const approvalCompletion = approvePositioningAnalysis({
      run: revised.run,
      workspace,
      packageInstall,
      blueprint,
      positioningBrief: revised.deliverable,
      approval: revised.approval,
      approvedAt: "2026-07-06T20:08:00.000Z"
    });

    expect(() =>
      startPositioningAnalysisStation({
        run: approvalCompletion.run,
        workspace,
        packageInstall,
        blueprint
      })
    ).toThrow('Run "run_123" cannot restart the bounded positioning station after terminal completion');
  });

  it("fails closed when a fabricated wider revision pair is approved directly", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T20:00:00.000Z"
    });
    const blueprint = createCurrentSliceBlueprint();
    const packageInstall = installBlueprintPackage({
      id: "install_123",
      workspaceId: workspace.id,
      blueprint,
      installedAt: "2026-07-06T20:01:00.000Z"
    });
    const intakeRun = startIntakeRun({
      id: "run_123",
      workspace,
      packageInstall,
      blueprint,
      startedAt: "2026-07-06T20:02:00.000Z"
    });
    const intakeCompletion = submitIntakeAnswers({
      run: intakeRun,
      workspace,
      packageInstall,
      blueprint,
      answers: {
        founderName: "Avery Stone",
        businessName: "Acme Advisory",
        primaryGoal: "Reach the first ten consulting clients",
        targetAudience: "Solo founders"
      },
      completedAt: "2026-07-06T20:03:00.000Z"
    });
    const analysisRun = startPositioningAnalysisStation({
      run: intakeCompletion.run,
      workspace,
      packageInstall,
      blueprint
    });

    expect(() =>
      approvePositioningAnalysis({
        run: {
          ...analysisRun,
          activeDeliverableId: "deliverable_run_123_positioning_brief_revision_2",
          activeApprovalId: "approval_run_123_positioning_revision_2",
          status: "waiting_for_approval"
        },
        workspace,
        packageInstall,
        blueprint,
        positioningBrief: {
          id: "deliverable_run_123_positioning_brief_revision_2",
          workspaceId: workspace.id,
          runId: "run_123",
          stationKey: "positioning",
          kind: "positioning_brief",
          title: "Positioning Brief",
          status: "ready",
          body: {
            headline: "Acme Advisory helps Solo founders Reach the first ten consulting clients.",
            audience: "Solo founders",
            primaryGoal: "Reach the first ten consulting clients",
            positioningSummary: "Forged wider revision."
          }
        },
        approval: {
          id: "approval_run_123_positioning_revision_2",
          workspaceId: workspace.id,
          runId: "run_123",
          packageId: blueprint.id,
          packageInstallId: packageInstall.id,
          stationKey: "positioning",
          deliverableId: "deliverable_run_123_positioning_brief_revision_2",
          status: "pending",
          requestedAt: "2026-07-06T20:07:00.000Z",
          resolvedAt: null,
          resolutionSummary: null
        },
        approvedAt: "2026-07-06T20:08:00.000Z"
      })
    ).toThrow('Approval "approval_run_123_positioning_revision_2" does not belong to the bounded positioning approval contract');
  });

  it("fails closed when a malformed changes-requested approval is used to drive a revision", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T20:00:00.000Z"
    });
    const blueprint = createCurrentSliceBlueprint();
    const packageInstall = installBlueprintPackage({
      id: "install_123",
      workspaceId: workspace.id,
      blueprint,
      installedAt: "2026-07-06T20:01:00.000Z"
    });
    const intakeRun = startIntakeRun({
      id: "run_123",
      workspace,
      packageInstall,
      blueprint,
      startedAt: "2026-07-06T20:02:00.000Z"
    });
    const intakeCompletion = submitIntakeAnswers({
      run: intakeRun,
      workspace,
      packageInstall,
      blueprint,
      answers: {
        founderName: "Avery Stone",
        businessName: "Acme Advisory",
        primaryGoal: "Reach the first ten consulting clients",
        targetAudience: "Solo founders"
      },
      completedAt: "2026-07-06T20:03:00.000Z"
    });
    const analysisRun = startPositioningAnalysisStation({
      run: intakeCompletion.run,
      workspace,
      packageInstall,
      blueprint
    });
    const analysisCompletion = completePositioningAnalysis({
      run: analysisRun,
      workspace,
      packageInstall,
      blueprint,
      founderProfile: intakeCompletion.deliverable,
      requestedAt: "2026-07-06T20:05:00.000Z"
    });
    const changesRequested = requestChangesForPositioningAnalysis({
      run: analysisCompletion.run,
      workspace,
      packageInstall,
      blueprint,
      positioningBrief: analysisCompletion.deliverable,
      approval: analysisCompletion.approval,
      requestedChangesAt: "2026-07-06T20:06:00.000Z",
      resolutionSummary: "Tighten the audience claim and clarify the proof of value."
    });

    expect(() =>
      revisePositioningAnalysisAfterChangesRequested({
        run: changesRequested.run,
        workspace,
        packageInstall,
        blueprint,
        founderProfile: intakeCompletion.deliverable,
        previousPositioningBrief: analysisCompletion.deliverable,
        previousApproval: {
          ...changesRequested.approval,
          resolvedAt: null
        },
        revisionSummary: "Clarify the buyer proof and narrow the audience promise.",
        requestedAt: "2026-07-06T20:07:00.000Z"
      })
    ).toThrow('Approval "approval_run_123_positioning" does not belong to the positioning revision contract');

    expect(() =>
      revisePositioningAnalysisAfterChangesRequested({
        run: changesRequested.run,
        workspace,
        packageInstall,
        blueprint,
        founderProfile: intakeCompletion.deliverable,
        previousPositioningBrief: analysisCompletion.deliverable,
        previousApproval: {
          ...changesRequested.approval,
          resolutionSummary: "   "
        },
        revisionSummary: "Clarify the buyer proof and narrow the audience promise.",
        requestedAt: "2026-07-06T20:07:00.000Z"
      })
    ).toThrow('Approval "approval_run_123_positioning" does not belong to the positioning revision contract');
  });

  it("fails closed when a second changes-requested loop tries to widen beyond the first bounded revision", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T20:00:00.000Z"
    });
    const blueprint = createCurrentSliceBlueprint();
    const packageInstall = installBlueprintPackage({
      id: "install_123",
      workspaceId: workspace.id,
      blueprint,
      installedAt: "2026-07-06T20:01:00.000Z"
    });
    const intakeRun = startIntakeRun({
      id: "run_123",
      workspace,
      packageInstall,
      blueprint,
      startedAt: "2026-07-06T20:02:00.000Z"
    });
    const intakeCompletion = submitIntakeAnswers({
      run: intakeRun,
      workspace,
      packageInstall,
      blueprint,
      answers: {
        founderName: "Avery Stone",
        businessName: "Acme Advisory",
        primaryGoal: "Reach the first ten consulting clients",
        targetAudience: "Solo founders"
      },
      completedAt: "2026-07-06T20:03:00.000Z"
    });
    const analysisRun = startPositioningAnalysisStation({
      run: intakeCompletion.run,
      workspace,
      packageInstall,
      blueprint
    });
    const analysisCompletion = completePositioningAnalysis({
      run: analysisRun,
      workspace,
      packageInstall,
      blueprint,
      founderProfile: intakeCompletion.deliverable,
      requestedAt: "2026-07-06T20:05:00.000Z"
    });
    const firstChangesRequested = requestChangesForPositioningAnalysis({
      run: analysisCompletion.run,
      workspace,
      packageInstall,
      blueprint,
      positioningBrief: analysisCompletion.deliverable,
      approval: analysisCompletion.approval,
      requestedChangesAt: "2026-07-06T20:06:00.000Z",
      resolutionSummary: "Tighten the audience claim and clarify the proof of value."
    });
    const revised = revisePositioningAnalysisAfterChangesRequested({
      run: firstChangesRequested.run,
      workspace,
      packageInstall,
      blueprint,
      founderProfile: intakeCompletion.deliverable,
      previousPositioningBrief: analysisCompletion.deliverable,
      previousApproval: firstChangesRequested.approval,
      revisionSummary: "Clarify the buyer proof and narrow the audience promise.",
      requestedAt: "2026-07-06T20:07:00.000Z"
    });

    expect(() =>
      requestChangesForPositioningAnalysis({
        run: revised.run,
        workspace,
        packageInstall,
        blueprint,
        positioningBrief: revised.deliverable,
        approval: revised.approval,
        requestedChangesAt: "2026-07-06T20:08:00.000Z",
        resolutionSummary: "Push into a second revision cycle."
      })
    ).toThrow('Approval "approval_run_123_positioning_revision_1" does not belong to the first bounded positioning approval contract');

    expect(() =>
      revisePositioningAnalysisAfterChangesRequested({
        run: {
          ...revised.run,
          status: "waiting_for_input"
        },
        workspace,
        packageInstall,
        blueprint,
        founderProfile: intakeCompletion.deliverable,
        previousPositioningBrief: revised.deliverable,
        previousApproval: {
          ...revised.approval,
          status: "changes_requested",
          resolvedAt: "2026-07-06T20:08:00.000Z",
          resolutionSummary: "Push into a second revision cycle."
        },
        revisionSummary: "Attempt a second revision generation.",
        requestedAt: "2026-07-06T20:09:00.000Z"
      })
    ).toThrow(
      'Positioning brief "deliverable_run_123_positioning_brief_revision_1" does not belong to the positioning revision contract'
    );
  });
});




