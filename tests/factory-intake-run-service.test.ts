import { describe, expect, it } from "vitest";

import { createWorkspace } from "../src/factory/workspaces/workspace-service.js";
import { loadBlueprintPackageManifest } from "../src/factory/packages/package-manifest-loader.js";
import { installBlueprintPackage } from "../src/factory/packages/package-install-service.js";
import { startIntakeRun, submitIntakeAnswers } from "../src/factory/runs/intake-run-service.js";
import {
  createIntakeOnlyManifest,
  createPositioningOnlyManifest
} from "./factory-package-manifest-fixtures.js";

describe("factory intake run service", () => {
  it("drives the first blueprint-native vertical slice from workspace to founder profile deliverable", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T18:15:00.000Z"
    });
    const blueprint = loadBlueprintPackageManifest(createIntakeOnlyManifest());
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
    expect(startedRun.packageId).toBe("pkg_connect_first");
    expect(startedRun.packageVersionId).toBe("pkg_connect_first@1.0.0");
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
    const blueprint = loadBlueprintPackageManifest(createIntakeOnlyManifest());
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
    const blueprint = loadBlueprintPackageManifest(createPositioningOnlyManifest());
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
    ).toThrow('Blueprint package "pkg_connect_first" does not define an intake station');
  });

  it("fails closed when the installed blueprint does not match the requested blueprint package", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T18:15:00.000Z"
    });
    const installedBlueprint = loadBlueprintPackageManifest(createIntakeOnlyManifest());
    const requestedBlueprint = loadBlueprintPackageManifest(
      createIntakeOnlyManifest({
        packageId: "pkg_pricing_review",
        packageKey: "pricing-review",
        name: "Pricing Review System"
      })
    );
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
      'Blueprint install "install_123" is bound to package "pkg_connect_first", not "pkg_pricing_review"'
    );
  });

  it("fails closed when the installed blueprint version does not match the requested blueprint version", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T18:15:00.000Z"
    });
    const installedManifest = createIntakeOnlyManifest();
    const requestedManifest = createIntakeOnlyManifest();
    requestedManifest.version = "1.1.0";

    const installedBlueprint = loadBlueprintPackageManifest(installedManifest);
    const requestedBlueprint = loadBlueprintPackageManifest(requestedManifest);
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
      'Blueprint install "install_123" is bound to package version "pkg_connect_first@1.0.0", not "pkg_connect_first@1.1.0"'
    );
  });

  it("fails closed when intake answers are submitted through a different install of the same package", () => {
    const workspace = createWorkspace({
      id: "ws_123",
      name: "Acme Advisory",
      slug: "acme-advisory",
      createdAt: "2026-07-06T18:15:00.000Z"
    });
    const blueprint = loadBlueprintPackageManifest(createIntakeOnlyManifest());
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

