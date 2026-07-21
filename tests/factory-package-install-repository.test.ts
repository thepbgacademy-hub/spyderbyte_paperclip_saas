import { describe, expect, it } from "vitest";

import {
  createPackageInstalledAuditIntent,
  disableBlueprintPackageInstall,
  installBlueprintPackage
} from "../src/factory/packages/package-install-service.js";
import { createInMemoryFactoryPackageInstallRepository } from "../src/factory/packages/package-install-repository.js";
import { loadBlueprintPackageManifest } from "../src/factory/packages/package-manifest-loader.js";
import { createCurrentSliceManifest } from "./factory-package-manifest-fixtures.js";

describe("factory package install repository", () => {
  it("persists blueprint-native install rows and lifecycle event rows", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    const install = installBlueprintPackage({
      id: "install_123",
      workspaceId: "tenant_123",
      blueprint,
      installedAt: "2026-07-11T12:00:00.000Z"
    });
    const installedAudit = createPackageInstalledAuditIntent({
      install,
      installedAt: "2026-07-11T12:00:00.000Z"
    });

    await repository.saveLifecycleEvent({
      install,
      auditIntent: installedAudit
    });

    expect(await repository.findInstallById({ tenantId: "tenant_123", installId: "install_123" })).toMatchObject({
      installId: "install_123",
      tenantId: "tenant_123",
      packageId: "pkg_connect_first",
      packageVersionId: "pkg_connect_first@1.0.0",
      previousPackageVersionId: null,
      installStatus: "enabled",
      installedAt: "2026-07-11T12:00:00.000Z",
      updatedAt: null,
      disabledAt: null,
      uninstalledAt: null,
      permissionDiff: null
    });
    expect(await repository.findInstallById({ tenantId: "tenant_other", installId: "install_123" })).toBeNull();
    expect(
      (await repository.findInstallById({ tenantId: "tenant_123", installId: "install_123" }))?.permissionSnapshot
    ).toEqual(install.permissionSnapshot);
    expect(await repository.listEventsForInstall({ tenantId: "tenant_123", installId: "install_123" })).toEqual([
      {
        installEventId: "install_123:package_installed:2026-07-11T12:00:00.000Z",
        tenantId: "tenant_123",
        packageInstallId: "install_123",
        packageId: "pkg_connect_first",
        packageVersionId: "pkg_connect_first@1.0.0",
        eventAction: "package_installed",
        occurredAt: "2026-07-11T12:00:00.000Z",
        metadata: {}
      }
    ]);
    expect(await repository.listEventsForInstall({ tenantId: "tenant_other", installId: "install_123" })).toEqual([]);

    const disabledTransition = disableBlueprintPackageInstall({
      install,
      disabledAt: "2026-07-11T12:05:00.000Z"
    });
    await repository.saveLifecycleEvent({
      install: disabledTransition.install,
      auditIntent: disabledTransition.auditIntent
    });

    const persistedDisabled = await repository.findInstallById({ tenantId: "tenant_123", installId: "install_123" });
    expect(persistedDisabled).toMatchObject({
      installStatus: "disabled",
      disabledAt: "2026-07-11T12:05:00.000Z"
    });
    persistedDisabled?.permissionSnapshot.permissions.tools.push("mutated_after_read");
    expect(
      (await repository.findInstallById({ tenantId: "tenant_123", installId: "install_123" }))?.permissionSnapshot
        .permissions.tools
    ).not.toContain("mutated_after_read");
    expect(
      (await repository.listEventsForInstall({ tenantId: "tenant_123", installId: "install_123" })).map(
        (event) => event.eventAction
      )
    ).toEqual([
      "package_installed",
      "package_disabled"
    ]);
  });

  it("rejects audit intents that do not match the install identity", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    const install = installBlueprintPackage({
      id: "install_123",
      workspaceId: "tenant_123",
      blueprint,
      installedAt: "2026-07-11T12:00:00.000Z"
    });
    const auditIntent = createPackageInstalledAuditIntent({
      install,
      installedAt: "2026-07-11T12:00:00.000Z"
    });

    await expect(
      repository.saveLifecycleEvent({
        install,
        auditIntent: {
          ...auditIntent,
          packageVersionId: "pkg_connect_first@9.9.9"
        }
      })
    ).rejects.toThrow("Package install audit intent does not match install identity");
  });

  it("mirrors durable uniqueness for lifecycle event IDs and tenant package installs", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    const install = installBlueprintPackage({
      id: "install_123",
      workspaceId: "tenant_123",
      blueprint,
      installedAt: "2026-07-11T12:00:00.000Z"
    });
    const auditIntent = createPackageInstalledAuditIntent({
      install,
      installedAt: "2026-07-11T12:00:00.000Z"
    });

    await repository.saveLifecycleEvent({ install, auditIntent });
    await expect(repository.saveLifecycleEvent({ install, auditIntent })).rejects.toThrow(
      "Package install lifecycle event already exists"
    );

    const duplicateInstall = installBlueprintPackage({
      id: "install_456",
      workspaceId: "tenant_123",
      blueprint,
      installedAt: "2026-07-11T12:10:00.000Z"
    });
    await expect(
      repository.saveLifecycleEvent({
        install: duplicateInstall,
        auditIntent: createPackageInstalledAuditIntent({
          install: duplicateInstall,
          installedAt: "2026-07-11T12:10:00.000Z"
        })
      })
    ).rejects.toThrow("Tenant already has an install for this package");

    const crossTenantDuplicateId = installBlueprintPackage({
      id: "install_123",
      workspaceId: "tenant_456",
      blueprint,
      installedAt: "2026-07-11T12:15:00.000Z"
    });
    await expect(
      repository.saveLifecycleEvent({
        install: crossTenantDuplicateId,
        auditIntent: createPackageInstalledAuditIntent({
          install: crossTenantDuplicateId,
          installedAt: "2026-07-11T12:15:00.000Z"
        })
      })
    ).rejects.toThrow("Package install id already exists");
  });
});
