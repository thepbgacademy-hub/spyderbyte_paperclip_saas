import { describe, expect, it } from "vitest";

import { createWorkspace } from "../src/factory/workspaces/workspace-service.js";
import { createBlueprintPackage } from "../src/factory/packages/package-registry.js";
import { installBlueprintPackage } from "../src/factory/packages/package-install-service.js";
import { startIntakeRun, submitIntakeAnswers } from "../src/factory/runs/intake-run-service.js";

describe("factory intake run service", () => {
  it("drives the first blueprint-native vertical slice from workspace to founder profile deliverable", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T18:15:00.000Z"
    });
    const blueprint = createBlueprintPackage({
      key: "connect-first",
      title: "Connect First Operating System",
      stations: [{ key: "intake", kind: "structured_interview", title: "Intake Station" }]
    });
    const packageInstall = installBlueprintPackage({
      id: "install_123",
      workspaceId: workspace.id,
      blueprint,
      installedAt: "2026-07-06T18:16:00.000Z"
    });

    const startedRun = startIntakeRun({
      id: "run_123",
      workspace,
      packageInstall,
      blueprint,
      startedAt: "2026-07-06T18:17:00.000Z"
    });

    expect(startedRun.status).toBe("waiting_for_input");
    expect(startedRun.currentStationKey).toBe("intake");
    expect(startedRun.packageId).toBe("connect-first");
    expect(startedRun.packageInstallId).toBe("install_123");

    const completed = submitIntakeAnswers({
      run: startedRun,
      workspace,
      packageInstall,
      blueprint,
      answers: {
        founderName: "Avery Stone",
        businessName: "Acme Advisory",
        primaryGoal: "Reach the first ten consulting clients",
        targetAudience: "Solo founders"
      },
      completedAt: "2026-07-06T18:18:00.000Z"
    });

    expect(completed.run.status).toBe("completed");
    expect(completed.run.currentStationKey).toBeNull();
    expect(completed.run.completedAt).toBe("2026-07-06T18:18:00.000Z");
    expect(completed.deliverable).toEqual({
      id: "deliverable_run_123_founder_profile",
      workspaceId: workspace.id,
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
        summary:
          "Avery Stone is building Acme Advisory for Solo founders with the immediate goal: Reach the first ten consulting clients."
      }
    });
  });

  it("fails closed when the workspace does not own the installed blueprint", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T18:15:00.000Z"
    });
    const blueprint = createBlueprintPackage({
      key: "connect-first",
      title: "Connect First Operating System",
      stations: [{ key: "intake", kind: "structured_interview", title: "Intake Station" }]
    });
    const packageInstall = installBlueprintPackage({
      id: "install_999",
      workspaceId: "ws_other",
      blueprint,
      installedAt: "2026-07-06T18:16:00.000Z"
    });

    expect(() =>
      startIntakeRun({
        id: "run_123",
        workspace,
        packageInstall,
        blueprint,
        startedAt: "2026-07-06T18:17:00.000Z"
      })
    ).toThrow('Blueprint install "install_999" does not belong to workspace "ws_123"');
  });

  it("fails closed when the blueprint does not expose an intake station", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T18:15:00.000Z"
    });
    const blueprint = createBlueprintPackage({
      key: "connect-first",
      title: "Connect First Operating System",
      stations: [{ key: "offer", kind: "analysis", title: "Offer Station" }]
    });
    const packageInstall = installBlueprintPackage({
      id: "install_123",
      workspaceId: workspace.id,
      blueprint,
      installedAt: "2026-07-06T18:16:00.000Z"
    });

    expect(() =>
      startIntakeRun({
        id: "run_123",
        workspace,
        packageInstall,
        blueprint,
        startedAt: "2026-07-06T18:17:00.000Z"
      })
    ).toThrow('Blueprint package "connect-first" does not define an intake station');
  });

  it("fails closed when the installed blueprint does not match the requested blueprint package", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T18:15:00.000Z"
    });
    const installedBlueprint = createBlueprintPackage({
      key: "connect-first",
      title: "Connect First Operating System",
      stations: [{ key: "intake", kind: "structured_interview", title: "Intake Station" }]
    });
    const requestedBlueprint = createBlueprintPackage({
      key: "pricing-review",
      title: "Pricing Review System",
      stations: [{ key: "intake", kind: "structured_interview", title: "Pricing Intake Station" }]
    });
    const packageInstall = installBlueprintPackage({
      id: "install_123",
      workspaceId: workspace.id,
      blueprint: installedBlueprint,
      installedAt: "2026-07-06T18:16:00.000Z"
    });

    expect(() =>
      startIntakeRun({
        id: "run_123",
        workspace,
        packageInstall,
        blueprint: requestedBlueprint,
        startedAt: "2026-07-06T18:17:00.000Z"
      })
    ).toThrow(
      'Blueprint install "install_123" is bound to package "connect-first", not "pricing-review"'
    );
  });

  it("fails closed when intake answers are submitted through a different install of the same package", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T18:15:00.000Z"
    });
    const blueprint = createBlueprintPackage({
      key: "connect-first",
      title: "Connect First Operating System",
      stations: [{ key: "intake", kind: "structured_interview", title: "Intake Station" }]
    });
    const packageInstall = installBlueprintPackage({
      id: "install_123",
      workspaceId: workspace.id,
      blueprint,
      installedAt: "2026-07-06T18:16:00.000Z"
    });
    const secondInstall = installBlueprintPackage({
      id: "install_456",
      workspaceId: workspace.id,
      blueprint,
      installedAt: "2026-07-06T18:16:30.000Z"
    });
    const run = startIntakeRun({
      id: "run_123",
      workspace,
      packageInstall,
      blueprint,
      startedAt: "2026-07-06T18:17:00.000Z"
    });

    expect(() =>
      submitIntakeAnswers({
        run,
        workspace,
        packageInstall: secondInstall,
        blueprint,
        answers: {
          founderName: "Avery Stone",
          businessName: "Acme Advisory",
          primaryGoal: "Reach the first ten consulting clients",
          targetAudience: "Solo founders"
        },
        completedAt: "2026-07-06T18:18:00.000Z"
      })
    ).toThrow('Run "run_123" is bound to install "install_123", not "install_456"');
  });
});
