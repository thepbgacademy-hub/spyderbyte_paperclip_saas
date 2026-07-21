import { describe, expect, it } from "vitest";

import {
  createPackageInstalledAuditIntent,
  disableBlueprintPackageInstall,
  enableBlueprintPackageInstall,
  installBlueprintPackage,
  rollbackBlueprintPackageInstall,
  uninstallBlueprintPackageInstall,
  updateBlueprintPackageInstall
} from "../src/factory/packages/package-install-service.js";
import { loadBlueprintPackageManifest } from "../src/factory/packages/package-manifest-loader.js";
import { createCurrentSliceManifest } from "./factory-package-manifest-fixtures.js";

describe("factory package install service", () => {
  it("installs a blueprint with immutable permission and budget snapshots", () => {
    const manifest = createCurrentSliceManifest();
    const blueprint = loadBlueprintPackageManifest(manifest);
    const install = installBlueprintPackage({
      id: "install_123",
      workspaceId: "ws_123",
      blueprint,
      installedAt: "2026-07-07T10:00:00.000Z"
    });

    manifest.permissions.tools.push("web_research_readonly");
    manifest.budgets.max_run_cost_usd = 999;

    expect(install).toMatchObject({
      id: "install_123",
      workspaceId: "ws_123",
      packageId: "pkg_connect_first",
      packageVersionId: "pkg_connect_first@1.0.0",
      installedAt: "2026-07-07T10:00:00.000Z",
      enabled: true,
      status: "enabled"
    });
    expect(install.permissionSnapshot).toEqual({
      permissions: {
        tools: ["structured_interview", "document_generation", "deliverable_write", "brand_profile_update"],
        externalActions: {
          publish: "approval_required",
          sendEmail: "denied"
        },
        dataAccess: {
          tenantScopeOnly: true,
          packageScopeOnly: true,
          readableDeliverables: "own_package"
        }
      },
      budgets: {
        maxRunCostUsd: 25,
        maxRunMinutes: 90,
        maxStepCostUsd: 5,
        approvalRequiredAboveUsd: 10
      }
    });
    expect(
      createPackageInstalledAuditIntent({
        install,
        installedAt: "2026-07-07T10:00:00.000Z"
      })
    ).toMatchObject({
      action: "package_installed",
      workspaceId: "ws_123",
      packageInstallId: "install_123",
      packageId: "pkg_connect_first",
      packageVersionId: "pkg_connect_first@1.0.0",
      occurredAt: "2026-07-07T10:00:00.000Z"
    });
  });

  it("walks the bounded tenant lifecycle with permission-widening consent and rollback", () => {
    const v1Manifest = createCurrentSliceManifest();
    const v1Blueprint = loadBlueprintPackageManifest(v1Manifest);
    const install = installBlueprintPackage({
      id: "install_123",
      workspaceId: "ws_123",
      blueprint: v1Blueprint,
      installedAt: "2026-07-07T10:00:00.000Z"
    });
    const disabledTransition = disableBlueprintPackageInstall({
      install,
      disabledAt: "2026-07-07T10:05:00.000Z"
    });
    const disabled = disabledTransition.install;
    const enabledTransition = enableBlueprintPackageInstall({
      install: disabled,
      enabledAt: "2026-07-07T10:06:00.000Z"
    });
    const enabled = enabledTransition.install;
    const v2Manifest = createCurrentSliceManifest();
    v2Manifest.version = "1.1.0";
    v2Manifest.permissions.tools.push("web_research_readonly");
    v2Manifest.permissions.external_actions.send_email = "approval_required";
    v2Manifest.budgets.max_step_cost_usd = 8;
    const v2Blueprint = loadBlueprintPackageManifest(v2Manifest);

    expect(() =>
      updateBlueprintPackageInstall({
        install: enabled,
        blueprint: v2Blueprint,
        updatedAt: "2026-07-07T10:07:00.000Z"
      })
    ).toThrow("Package update widens permissions and requires explicit consent");

    const updatedTransition = updateBlueprintPackageInstall({
      install: enabled,
      blueprint: v2Blueprint,
      consent: true,
      updatedAt: "2026-07-07T10:08:00.000Z"
    });
    const updated = updatedTransition.install;
    const rolledBackTransition = rollbackBlueprintPackageInstall({
      install: updated,
      blueprint: v1Blueprint,
      rolledBackAt: "2026-07-07T10:09:00.000Z"
    });
    const rolledBack = rolledBackTransition.install;
    const uninstalledTransition = uninstallBlueprintPackageInstall({
      install: rolledBack,
      uninstalledAt: "2026-07-07T10:10:00.000Z"
    });
    const uninstalled = uninstalledTransition.install;

    expect(disabled.status).toBe("disabled");
    expect(disabled.enabled).toBe(false);
    expect(disabledTransition.auditIntent.action).toBe("package_disabled");
    expect(enabled.status).toBe("enabled");
    expect(enabledTransition.auditIntent.action).toBe("package_enabled");
    expect(updated.packageVersionId).toBe("pkg_connect_first@1.1.0");
    expect(updated.previousPackageVersionId).toBe("pkg_connect_first@1.0.0");
    expect(updated.permissionDiff).toEqual({
      addedTools: ["web_research_readonly"],
      widenedExternalActions: [
        {
          action: "sendEmail",
          from: "denied",
          to: "approval_required"
        }
      ],
      budgetIncreases: [
        {
          budget: "maxStepCostUsd",
          from: 5,
          to: 8
        }
      ]
    });
    expect(updatedTransition.auditIntent).toMatchObject({
      action: "package_updated",
      packageInstallId: "install_123",
      packageVersionId: "pkg_connect_first@1.1.0",
      metadata: {
        previousPackageVersionId: "pkg_connect_first@1.0.0",
        permissionDiff: updated.permissionDiff
      }
    });
    expect(rolledBack.packageVersionId).toBe("pkg_connect_first@1.0.0");
    expect(rolledBack.previousPackageVersionId).toBe("pkg_connect_first@1.1.0");
    expect(rolledBack.permissionSnapshot).toEqual(install.permissionSnapshot);
    expect(rolledBack.permissionDiff).toBeNull();
    expect(rolledBackTransition.auditIntent.action).toBe("package_rolled_back");
    expect(uninstalled.status).toBe("uninstalled");
    expect(uninstalled.enabled).toBe(false);
    expect(uninstalledTransition.auditIntent.action).toBe("package_uninstalled");
  });

  it("treats newly approval-required external actions as widened permissions", () => {
    const v1Blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    const install = installBlueprintPackage({
      id: "install_123",
      workspaceId: "ws_123",
      blueprint: v1Blueprint,
      installedAt: "2026-07-07T10:00:00.000Z"
    });
    const v2Manifest = createCurrentSliceManifest();
    v2Manifest.version = "1.1.0";
    v2Manifest.permissions.external_actions.launch_ads = "approval_required";
    const v2Blueprint = loadBlueprintPackageManifest(v2Manifest);

    expect(() =>
      updateBlueprintPackageInstall({
        install,
        blueprint: v2Blueprint,
        updatedAt: "2026-07-07T10:08:00.000Z"
      })
    ).toThrow("Package update widens permissions and requires explicit consent");

    const updated = updateBlueprintPackageInstall({
      install,
      blueprint: v2Blueprint,
      consent: true,
      updatedAt: "2026-07-07T10:08:00.000Z"
    }).install;

    expect(updated.permissionDiff?.widenedExternalActions).toEqual([
      {
        action: "launchAds",
        from: null,
        to: "approval_required"
      }
    ]);
  });
});
