import { describe, expect, it } from "vitest";

import {
  disableBlueprintPackageForTenant,
  enableBlueprintPackageForTenant,
  installBlueprintPackageForTenant,
  rollbackBlueprintPackageForTenant,
  uninstallBlueprintPackageForTenant,
  updateBlueprintPackageForTenant
} from "../src/factory/packages/package-install-application-service.js";
import { uninstallBlueprintPackageInstall } from "../src/factory/packages/package-install-service.js";
import { createInMemoryFactoryPackageInstallRepository } from "../src/factory/packages/package-install-repository.js";
import { loadBlueprintPackageManifest } from "../src/factory/packages/package-manifest-loader.js";
import { createCurrentSliceManifest } from "./factory-package-manifest-fixtures.js";

describe("factory package install application service", () => {
  it("allows tenant owners and admins to install entitled blueprint packages", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());

    const result = await installBlueprintPackageForTenant({
      actor: {
        userId: "user_owner",
        tenantId: "tenant_123",
        role: "owner"
      },
      blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      installedAt: "2026-07-11T13:00:00.000Z",
      repository,
      entitlements: {
        async canInstall(input) {
          return input.tenantId === "tenant_123" && input.packageKey === "connect-first";
        }
      }
    });

    expect(result).toMatchObject({
      id: "install_123",
      workspaceId: "tenant_123",
      packageId: "pkg_connect_first",
      packageVersionId: "pkg_connect_first@1.0.0",
      status: "enabled"
    });
    expect(await repository.findInstallById({ tenantId: "tenant_123", installId: "install_123" })).toMatchObject({
      installId: "install_123",
      tenantId: "tenant_123",
      installStatus: "enabled"
    });
    expect(await repository.listEventsForInstall({ tenantId: "tenant_123", installId: "install_123" })).toHaveLength(1);

    await expect(
      installBlueprintPackageForTenant({
        actor: {
          userId: "user_admin",
          tenantId: "tenant_456",
          role: "admin"
        },
        blueprint,
        packageKey: "connect-first",
        installId: "install_456",
        installedAt: "2026-07-11T13:05:00.000Z",
        repository: createInMemoryFactoryPackageInstallRepository(),
        entitlements: {
          async canInstall() {
            return true;
          }
        }
      })
    ).resolves.toMatchObject({
      id: "install_456",
      workspaceId: "tenant_456"
    });
  });

  it("blocks non-admin members before entitlement or persistence work", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    let entitlementChecks = 0;

    await expect(
      installBlueprintPackageForTenant({
        actor: {
          userId: "user_member",
          tenantId: "tenant_123",
          role: "member"
        },
        blueprint,
        packageKey: "connect-first",
        installId: "install_123",
        installedAt: "2026-07-11T13:00:00.000Z",
        repository,
        entitlements: {
          async canInstall() {
            entitlementChecks += 1;
            return true;
          }
        }
      })
    ).rejects.toThrow("Only tenant owners and admins can install blueprint packages");

    expect(entitlementChecks).toBe(0);
    expect(await repository.findInstallById({ tenantId: "tenant_123", installId: "install_123" })).toBeNull();
  });

  it("blocks install when the tenant is not entitled to the package key", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());

    await expect(
      installBlueprintPackageForTenant({
        actor: {
          userId: "user_owner",
          tenantId: "tenant_123",
          role: "owner"
        },
        blueprint,
        packageKey: "connect-first",
        installId: "install_123",
        installedAt: "2026-07-11T13:00:00.000Z",
        repository,
        entitlements: {
          async canInstall() {
            return false;
          }
        }
      })
    ).rejects.toThrow('Tenant "tenant_123" is not entitled to install package "connect-first"');

    expect(await repository.findInstallById({ tenantId: "tenant_123", installId: "install_123" })).toBeNull();
  });

  it("fails closed when the requested package key does not match the resolved blueprint", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    let entitlementChecks = 0;

    await expect(
      installBlueprintPackageForTenant({
        actor: {
          userId: "user_owner",
          tenantId: "tenant_123",
          role: "owner"
        },
        blueprint,
        packageKey: "different-package",
        installId: "install_123",
        installedAt: "2026-07-11T13:00:00.000Z",
        repository,
        entitlements: {
          async canInstall() {
            entitlementChecks += 1;
            return true;
          }
        }
      })
    ).rejects.toThrow('Blueprint package key "connect-first" does not match requested package "different-package"');

    expect(entitlementChecks).toBe(0);
    expect(await repository.findInstallById({ tenantId: "tenant_123", installId: "install_123" })).toBeNull();
  });

  it("lets tenant owners disable and enable an installed blueprint package with audited lifecycle events", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    const actor = {
      userId: "user_owner",
      tenantId: "tenant_123",
      role: "owner" as const
    };

    await installBlueprintPackageForTenant({
      actor,
      blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      installedAt: "2026-07-11T13:00:00.000Z",
      repository
    });

    const disabled = await disableBlueprintPackageForTenant({
      actor,
      installId: "install_123",
      disabledAt: "2026-07-11T13:10:00.000Z",
      repository
    });

    expect(disabled).toMatchObject({
      id: "install_123",
      workspaceId: "tenant_123",
      status: "disabled",
      enabled: false,
      disabledAt: "2026-07-11T13:10:00.000Z"
    });
    expect(await repository.findInstallById({ tenantId: "tenant_123", installId: "install_123" })).toMatchObject({
      installStatus: "disabled",
      disabledAt: "2026-07-11T13:10:00.000Z"
    });

    const enabled = await enableBlueprintPackageForTenant({
      actor,
      installId: "install_123",
      enabledAt: "2026-07-11T13:20:00.000Z",
      repository
    });

    expect(enabled).toMatchObject({
      id: "install_123",
      workspaceId: "tenant_123",
      status: "enabled",
      enabled: true,
      updatedAt: "2026-07-11T13:20:00.000Z"
    });
    expect(await repository.findInstallById({ tenantId: "tenant_123", installId: "install_123" })).toMatchObject({
      installStatus: "enabled",
      updatedAt: "2026-07-11T13:20:00.000Z"
    });
    expect(
      (await repository.listEventsForInstall({ tenantId: "tenant_123", installId: "install_123" })).map(
        (event) => event.eventAction
      )
    ).toEqual(["package_installed", "package_disabled", "package_enabled"]);
  });

  it("lets tenant admins disable and enable installed blueprint packages", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    const actor = {
      userId: "user_admin",
      tenantId: "tenant_123",
      role: "admin" as const
    };

    await installBlueprintPackageForTenant({
      actor,
      blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      installedAt: "2026-07-11T13:00:00.000Z",
      repository
    });

    await expect(
      disableBlueprintPackageForTenant({
        actor,
        installId: "install_123",
        disabledAt: "2026-07-11T13:10:00.000Z",
        repository
      })
    ).resolves.toMatchObject({
      status: "disabled",
      enabled: false
    });

    await expect(
      enableBlueprintPackageForTenant({
        actor,
        installId: "install_123",
        enabledAt: "2026-07-11T13:20:00.000Z",
        repository
      })
    ).resolves.toMatchObject({
      status: "enabled",
      enabled: true
    });
  });

  it("blocks non-admin members from disabling or enabling package installs before persistence work", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    const owner = {
      userId: "user_owner",
      tenantId: "tenant_123",
      role: "owner" as const
    };
    const member = {
      userId: "user_member",
      tenantId: "tenant_123",
      role: "member" as const
    };

    await installBlueprintPackageForTenant({
      actor: owner,
      blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      installedAt: "2026-07-11T13:00:00.000Z",
      repository
    });

    await expect(
      disableBlueprintPackageForTenant({
        actor: member,
        installId: "install_123",
        disabledAt: "2026-07-11T13:10:00.000Z",
        repository
      })
    ).rejects.toThrow("Only tenant owners and admins can manage blueprint package installs");

    await expect(
      enableBlueprintPackageForTenant({
        actor: member,
        installId: "install_123",
        enabledAt: "2026-07-11T13:20:00.000Z",
        repository
      })
    ).rejects.toThrow("Only tenant owners and admins can manage blueprint package installs");

    expect(await repository.findInstallById({ tenantId: "tenant_123", installId: "install_123" })).toMatchObject({
      installStatus: "enabled"
    });
    expect(await repository.listEventsForInstall({ tenantId: "tenant_123", installId: "install_123" })).toHaveLength(1);
  });

  it("fails closed when lifecycle actions target another tenant install", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());

    await installBlueprintPackageForTenant({
      actor: {
        userId: "user_owner",
        tenantId: "tenant_123",
        role: "owner"
      },
      blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      installedAt: "2026-07-11T13:00:00.000Z",
      repository
    });

    await expect(
      disableBlueprintPackageForTenant({
        actor: {
          userId: "user_other_owner",
          tenantId: "tenant_456",
          role: "owner"
        },
        installId: "install_123",
        disabledAt: "2026-07-11T13:10:00.000Z",
        repository
      })
    ).rejects.toThrow('Blueprint package install "install_123" was not found for tenant "tenant_456"');

    expect(await repository.findInstallById({ tenantId: "tenant_123", installId: "install_123" })).toMatchObject({
      installStatus: "enabled"
    });
    expect(await repository.listEventsForInstall({ tenantId: "tenant_123", installId: "install_123" })).toHaveLength(1);
  });

  it("preserves the stored install contract when lifecycle actions hydrate repository rows", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    const actor = {
      userId: "user_owner",
      tenantId: "tenant_123",
      role: "owner" as const
    };

    const installed = await installBlueprintPackageForTenant({
      actor,
      blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      installedAt: "2026-07-11T13:00:00.000Z",
      repository
    });

    await disableBlueprintPackageForTenant({
      actor,
      installId: "install_123",
      disabledAt: "2026-07-11T13:10:00.000Z",
      repository
    });
    const enabled = await enableBlueprintPackageForTenant({
      actor,
      installId: "install_123",
      enabledAt: "2026-07-11T13:20:00.000Z",
      repository
    });

    expect(enabled).toMatchObject({
      id: installed.id,
      workspaceId: installed.workspaceId,
      packageId: installed.packageId,
      packageVersionId: installed.packageVersionId,
      previousPackageVersionId: null,
      installedAt: installed.installedAt,
      disabledAt: "2026-07-11T13:10:00.000Z",
      permissionSnapshot: installed.permissionSnapshot,
      permissionDiff: null
    });
  });

  it("fails closed when lifecycle actions target an uninstalled package install", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    const actor = {
      userId: "user_owner",
      tenantId: "tenant_123",
      role: "owner" as const
    };

    const installed = await installBlueprintPackageForTenant({
      actor,
      blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      installedAt: "2026-07-11T13:00:00.000Z",
      repository
    });
    await repository.saveLifecycleEvent(
      uninstallBlueprintPackageInstall({
        install: installed,
        uninstalledAt: "2026-07-11T13:30:00.000Z"
      })
    );

    await expect(
      disableBlueprintPackageForTenant({
        actor,
        installId: "install_123",
        disabledAt: "2026-07-11T13:40:00.000Z",
        repository
      })
    ).rejects.toThrow('Blueprint install "install_123" is uninstalled');
    await expect(
      enableBlueprintPackageForTenant({
        actor,
        installId: "install_123",
        enabledAt: "2026-07-11T13:50:00.000Z",
        repository
      })
    ).rejects.toThrow('Blueprint install "install_123" is uninstalled');

    expect(await repository.findInstallById({ tenantId: "tenant_123", installId: "install_123" })).toMatchObject({
      installStatus: "uninstalled"
    });
    expect(
      (await repository.listEventsForInstall({ tenantId: "tenant_123", installId: "install_123" })).map(
        (event) => event.eventAction
      )
    ).toEqual(["package_installed", "package_uninstalled"]);
  });

  it("blocks widened package updates without explicit consent and leaves the install unchanged", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    const widenedManifest = createCurrentSliceManifest();
    widenedManifest.version = "1.1.0";
    widenedManifest.permissions.tools.push("web_research_readonly");
    widenedManifest.permissions.external_actions.send_email = "approval_required";
    widenedManifest.budgets.max_step_cost_usd = 8;
    const widenedBlueprint = loadBlueprintPackageManifest(widenedManifest);
    const actor = {
      userId: "user_owner",
      tenantId: "tenant_123",
      role: "owner" as const
    };

    await installBlueprintPackageForTenant({
      actor,
      blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      installedAt: "2026-07-11T13:00:00.000Z",
      repository
    });

    await expect(
      updateBlueprintPackageForTenant({
        actor,
        blueprint: widenedBlueprint,
        packageKey: "connect-first",
        installId: "install_123",
        updatedAt: "2026-07-11T13:30:00.000Z",
        repository
      })
    ).rejects.toThrow("Package update widens permissions and requires explicit consent");

    expect(await repository.findInstallById({ tenantId: "tenant_123", installId: "install_123" })).toMatchObject({
      packageVersionId: "pkg_connect_first@1.0.0",
      installStatus: "enabled",
      permissionDiff: null
    });
    expect(
      (await repository.listEventsForInstall({ tenantId: "tenant_123", installId: "install_123" })).map(
        (event) => event.eventAction
      )
    ).toEqual(["package_installed"]);
  });

  it("updates an installed blueprint package with consent and persists the permission diff audit event", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    const widenedManifest = createCurrentSliceManifest();
    widenedManifest.version = "1.1.0";
    widenedManifest.permissions.tools.push("web_research_readonly");
    widenedManifest.permissions.external_actions.send_email = "approval_required";
    widenedManifest.budgets.max_step_cost_usd = 8;
    const widenedBlueprint = loadBlueprintPackageManifest(widenedManifest);
    const actor = {
      userId: "user_admin",
      tenantId: "tenant_123",
      role: "admin" as const
    };

    await installBlueprintPackageForTenant({
      actor,
      blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      installedAt: "2026-07-11T13:00:00.000Z",
      repository
    });

    const updated = await updateBlueprintPackageForTenant({
      actor,
      blueprint: widenedBlueprint,
      packageKey: "connect-first",
      installId: "install_123",
      consent: true,
      updatedAt: "2026-07-11T13:30:00.000Z",
      repository
    });

    expect(updated).toMatchObject({
      id: "install_123",
      workspaceId: "tenant_123",
      packageId: "pkg_connect_first",
      packageVersionId: "pkg_connect_first@1.1.0",
      previousPackageVersionId: "pkg_connect_first@1.0.0",
      status: "enabled",
      enabled: true,
      updatedAt: "2026-07-11T13:30:00.000Z"
    });
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
    expect(await repository.findInstallById({ tenantId: "tenant_123", installId: "install_123" })).toMatchObject({
      packageVersionId: "pkg_connect_first@1.1.0",
      previousPackageVersionId: "pkg_connect_first@1.0.0",
      permissionDiff: updated.permissionDiff
    });
    expect(await repository.listEventsForInstall({ tenantId: "tenant_123", installId: "install_123" })).toMatchObject([
      { eventAction: "package_installed", packageVersionId: "pkg_connect_first@1.0.0" },
      {
        eventAction: "package_updated",
        packageVersionId: "pkg_connect_first@1.1.0",
        metadata: {
          previousPackageVersionId: "pkg_connect_first@1.0.0",
          permissionDiff: updated.permissionDiff
        }
      }
    ]);
  });

  it("allows non-widening package updates without explicit consent", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    const nextManifest = createCurrentSliceManifest();
    nextManifest.version = "1.1.0";
    nextManifest.name = "Connect First Operating System Refined";
    const nextBlueprint = loadBlueprintPackageManifest(nextManifest);
    const actor = {
      userId: "user_owner",
      tenantId: "tenant_123",
      role: "owner" as const
    };

    await installBlueprintPackageForTenant({
      actor,
      blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      installedAt: "2026-07-11T13:00:00.000Z",
      repository
    });

    const updated = await updateBlueprintPackageForTenant({
      actor,
      blueprint: nextBlueprint,
      packageKey: "connect-first",
      installId: "install_123",
      updatedAt: "2026-07-11T13:30:00.000Z",
      repository
    });

    expect(updated).toMatchObject({
      packageVersionId: "pkg_connect_first@1.1.0",
      previousPackageVersionId: "pkg_connect_first@1.0.0",
      status: "enabled"
    });
    expect(updated.permissionDiff).toEqual({
      addedTools: [],
      widenedExternalActions: [],
      budgetIncreases: []
    });
  });

  it("blocks package updates for disabled installs so update does not implicitly re-enable them", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    const nextManifest = createCurrentSliceManifest();
    nextManifest.version = "1.1.0";
    const nextBlueprint = loadBlueprintPackageManifest(nextManifest);
    const actor = {
      userId: "user_owner",
      tenantId: "tenant_123",
      role: "owner" as const
    };

    await installBlueprintPackageForTenant({
      actor,
      blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      installedAt: "2026-07-11T13:00:00.000Z",
      repository
    });
    await disableBlueprintPackageForTenant({
      actor,
      installId: "install_123",
      disabledAt: "2026-07-11T13:10:00.000Z",
      repository
    });

    await expect(
      updateBlueprintPackageForTenant({
        actor,
        blueprint: nextBlueprint,
        packageKey: "connect-first",
        installId: "install_123",
        updatedAt: "2026-07-11T13:30:00.000Z",
        repository
      })
    ).rejects.toThrow('Blueprint package install "install_123" must be enabled before it can be updated');

    expect(await repository.findInstallById({ tenantId: "tenant_123", installId: "install_123" })).toMatchObject({
      packageVersionId: "pkg_connect_first@1.0.0",
      installStatus: "disabled"
    });
    expect(
      (await repository.listEventsForInstall({ tenantId: "tenant_123", installId: "install_123" })).map(
        (event) => event.eventAction
      )
    ).toEqual(["package_installed", "package_disabled"]);
  });

  it("rejects same-version package updates before emitting a lifecycle event", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    const actor = {
      userId: "user_owner",
      tenantId: "tenant_123",
      role: "owner" as const
    };

    await installBlueprintPackageForTenant({
      actor,
      blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      installedAt: "2026-07-11T13:00:00.000Z",
      repository
    });

    await expect(
      updateBlueprintPackageForTenant({
        actor,
        blueprint,
        packageKey: "connect-first",
        installId: "install_123",
        updatedAt: "2026-07-11T13:30:00.000Z",
        repository
      })
    ).rejects.toThrow('Blueprint package install "install_123" is already on package version "pkg_connect_first@1.0.0"');

    expect(await repository.listEventsForInstall({ tenantId: "tenant_123", installId: "install_123" })).toHaveLength(1);
  });

  it("fails closed when package update requests do not match the tenant install boundary", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    const nextManifest = createCurrentSliceManifest();
    nextManifest.version = "1.1.0";
    const nextBlueprint = loadBlueprintPackageManifest(nextManifest);

    await installBlueprintPackageForTenant({
      actor: {
        userId: "user_owner",
        tenantId: "tenant_123",
        role: "owner"
      },
      blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      installedAt: "2026-07-11T13:00:00.000Z",
      repository
    });

    await expect(
      updateBlueprintPackageForTenant({
        actor: {
          userId: "user_member",
          tenantId: "tenant_123",
          role: "member"
        },
        blueprint: nextBlueprint,
        packageKey: "connect-first",
        installId: "install_123",
        updatedAt: "2026-07-11T13:30:00.000Z",
        repository
      })
    ).rejects.toThrow("Only tenant owners and admins can manage blueprint package installs");

    await expect(
      updateBlueprintPackageForTenant({
        actor: {
          userId: "user_owner",
          tenantId: "tenant_123",
          role: "owner"
        },
        blueprint: nextBlueprint,
        packageKey: "different-package",
        installId: "install_123",
        updatedAt: "2026-07-11T13:30:00.000Z",
        repository
      })
    ).rejects.toThrow('Blueprint package key "connect-first" does not match requested package "different-package"');

    await expect(
      updateBlueprintPackageForTenant({
        actor: {
          userId: "user_other_owner",
          tenantId: "tenant_456",
          role: "owner"
        },
        blueprint: nextBlueprint,
        packageKey: "connect-first",
        installId: "install_123",
        updatedAt: "2026-07-11T13:30:00.000Z",
        repository
      })
    ).rejects.toThrow('Blueprint package install "install_123" was not found for tenant "tenant_456"');

    expect(await repository.findInstallById({ tenantId: "tenant_123", installId: "install_123" })).toMatchObject({
      packageVersionId: "pkg_connect_first@1.0.0"
    });
    expect(await repository.listEventsForInstall({ tenantId: "tenant_123", installId: "install_123" })).toHaveLength(1);
  });

  it("rolls back an updated blueprint package to its previous version with an audited lifecycle event", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const v1Blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    const v2Manifest = createCurrentSliceManifest();
    v2Manifest.version = "1.1.0";
    v2Manifest.permissions.tools.push("web_research_readonly");
    const v2Blueprint = loadBlueprintPackageManifest(v2Manifest);
    const actor = {
      userId: "user_owner",
      tenantId: "tenant_123",
      role: "owner" as const
    };

    const installed = await installBlueprintPackageForTenant({
      actor,
      blueprint: v1Blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      installedAt: "2026-07-11T13:00:00.000Z",
      repository
    });
    await updateBlueprintPackageForTenant({
      actor,
      blueprint: v2Blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      consent: true,
      updatedAt: "2026-07-11T13:30:00.000Z",
      repository
    });

    const rolledBack = await rollbackBlueprintPackageForTenant({
      actor,
      blueprint: v1Blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      rolledBackAt: "2026-07-11T13:45:00.000Z",
      repository
    });

    expect(rolledBack).toMatchObject({
      id: "install_123",
      workspaceId: "tenant_123",
      packageId: "pkg_connect_first",
      packageVersionId: "pkg_connect_first@1.0.0",
      previousPackageVersionId: "pkg_connect_first@1.1.0",
      status: "enabled",
      enabled: true,
      updatedAt: "2026-07-11T13:45:00.000Z",
      permissionDiff: null
    });
    expect(rolledBack.permissionSnapshot).toEqual(installed.permissionSnapshot);
    expect(await repository.findInstallById({ tenantId: "tenant_123", installId: "install_123" })).toMatchObject({
      packageVersionId: "pkg_connect_first@1.0.0",
      previousPackageVersionId: "pkg_connect_first@1.1.0",
      permissionDiff: null
    });
    expect(await repository.listEventsForInstall({ tenantId: "tenant_123", installId: "install_123" })).toMatchObject([
      { eventAction: "package_installed", packageVersionId: "pkg_connect_first@1.0.0" },
      { eventAction: "package_updated", packageVersionId: "pkg_connect_first@1.1.0" },
      {
        eventAction: "package_rolled_back",
        packageVersionId: "pkg_connect_first@1.0.0",
        metadata: {
          previousPackageVersionId: "pkg_connect_first@1.1.0"
        }
      }
    ]);
  });

  it("lets tenant admins roll back updated blueprint packages", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const v1Blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    const v2Manifest = createCurrentSliceManifest();
    v2Manifest.version = "1.1.0";
    const v2Blueprint = loadBlueprintPackageManifest(v2Manifest);
    const actor = {
      userId: "user_admin",
      tenantId: "tenant_123",
      role: "admin" as const
    };

    await installBlueprintPackageForTenant({
      actor,
      blueprint: v1Blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      installedAt: "2026-07-11T13:00:00.000Z",
      repository
    });
    await updateBlueprintPackageForTenant({
      actor,
      blueprint: v2Blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      updatedAt: "2026-07-11T13:30:00.000Z",
      repository
    });

    await expect(
      rollbackBlueprintPackageForTenant({
        actor,
        blueprint: v1Blueprint,
        packageKey: "connect-first",
        installId: "install_123",
        rolledBackAt: "2026-07-11T13:45:00.000Z",
        repository
      })
    ).resolves.toMatchObject({
      packageVersionId: "pkg_connect_first@1.0.0",
      previousPackageVersionId: "pkg_connect_first@1.1.0",
      status: "enabled"
    });
  });

  it("fails closed when rollback requests do not match the tenant install boundary", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const v1Blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    const v2Manifest = createCurrentSliceManifest();
    v2Manifest.version = "1.1.0";
    const v2Blueprint = loadBlueprintPackageManifest(v2Manifest);

    await installBlueprintPackageForTenant({
      actor: {
        userId: "user_owner",
        tenantId: "tenant_123",
        role: "owner"
      },
      blueprint: v1Blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      installedAt: "2026-07-11T13:00:00.000Z",
      repository
    });
    await updateBlueprintPackageForTenant({
      actor: {
        userId: "user_owner",
        tenantId: "tenant_123",
        role: "owner"
      },
      blueprint: v2Blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      updatedAt: "2026-07-11T13:30:00.000Z",
      repository
    });

    await expect(
      rollbackBlueprintPackageForTenant({
        actor: {
          userId: "user_member",
          tenantId: "tenant_123",
          role: "member"
        },
        blueprint: v1Blueprint,
        packageKey: "connect-first",
        installId: "install_123",
        rolledBackAt: "2026-07-11T13:45:00.000Z",
        repository
      })
    ).rejects.toThrow("Only tenant owners and admins can manage blueprint package installs");

    await expect(
      rollbackBlueprintPackageForTenant({
        actor: {
          userId: "user_owner",
          tenantId: "tenant_123",
          role: "owner"
        },
        blueprint: v1Blueprint,
        packageKey: "different-package",
        installId: "install_123",
        rolledBackAt: "2026-07-11T13:45:00.000Z",
        repository
      })
    ).rejects.toThrow('Blueprint package key "connect-first" does not match requested package "different-package"');

    await expect(
      rollbackBlueprintPackageForTenant({
        actor: {
          userId: "user_other_owner",
          tenantId: "tenant_456",
          role: "owner"
        },
        blueprint: v1Blueprint,
        packageKey: "connect-first",
        installId: "install_123",
        rolledBackAt: "2026-07-11T13:45:00.000Z",
        repository
      })
    ).rejects.toThrow('Blueprint package install "install_123" was not found for tenant "tenant_456"');

    expect(await repository.findInstallById({ tenantId: "tenant_123", installId: "install_123" })).toMatchObject({
      packageVersionId: "pkg_connect_first@1.1.0"
    });
    expect(await repository.listEventsForInstall({ tenantId: "tenant_123", installId: "install_123" })).toHaveLength(2);
  });

  it("blocks rollback for disabled installs and invalid rollback versions before emitting an event", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const v1Blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    const v2Manifest = createCurrentSliceManifest();
    v2Manifest.version = "1.1.0";
    const v2Blueprint = loadBlueprintPackageManifest(v2Manifest);
    const v3Manifest = createCurrentSliceManifest();
    v3Manifest.version = "1.2.0";
    const v3Blueprint = loadBlueprintPackageManifest(v3Manifest);
    const actor = {
      userId: "user_owner",
      tenantId: "tenant_123",
      role: "owner" as const
    };

    await installBlueprintPackageForTenant({
      actor,
      blueprint: v1Blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      installedAt: "2026-07-11T13:00:00.000Z",
      repository
    });
    await updateBlueprintPackageForTenant({
      actor,
      blueprint: v2Blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      updatedAt: "2026-07-11T13:30:00.000Z",
      repository
    });

    await expect(
      rollbackBlueprintPackageForTenant({
        actor,
        blueprint: v3Blueprint,
        packageKey: "connect-first",
        installId: "install_123",
        rolledBackAt: "2026-07-11T13:45:00.000Z",
        repository
      })
    ).rejects.toThrow('Blueprint install "install_123" cannot roll back to package version "pkg_connect_first@1.2.0"');

    await disableBlueprintPackageForTenant({
      actor,
      installId: "install_123",
      disabledAt: "2026-07-11T13:50:00.000Z",
      repository
    });

    await expect(
      rollbackBlueprintPackageForTenant({
        actor,
        blueprint: v1Blueprint,
        packageKey: "connect-first",
        installId: "install_123",
        rolledBackAt: "2026-07-11T14:00:00.000Z",
        repository
      })
    ).rejects.toThrow('Blueprint package install "install_123" must be enabled before it can be rolled back');

    expect(
      (await repository.listEventsForInstall({ tenantId: "tenant_123", installId: "install_123" })).map(
        (event) => event.eventAction
      )
    ).toEqual(["package_installed", "package_updated", "package_disabled"]);
  });

  it("uninstalls a blueprint package with typed confirmation and audited lifecycle persistence", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    const actor = {
      userId: "user_owner",
      tenantId: "tenant_123",
      role: "owner" as const
    };

    await installBlueprintPackageForTenant({
      actor,
      blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      installedAt: "2026-07-11T13:00:00.000Z",
      repository
    });

    const uninstalled = await uninstallBlueprintPackageForTenant({
      actor,
      packageId: "pkg_connect_first",
      packageKey: "connect-first",
      installId: "install_123",
      confirmation: "UNINSTALL connect-first",
      uninstalledAt: "2026-07-11T14:30:00.000Z",
      repository
    });

    expect(uninstalled).toMatchObject({
      id: "install_123",
      workspaceId: "tenant_123",
      packageId: "pkg_connect_first",
      packageVersionId: "pkg_connect_first@1.0.0",
      status: "uninstalled",
      enabled: false,
      uninstalledAt: "2026-07-11T14:30:00.000Z"
    });
    expect(await repository.findInstallById({ tenantId: "tenant_123", installId: "install_123" })).toMatchObject({
      installStatus: "uninstalled",
      uninstalledAt: "2026-07-11T14:30:00.000Z"
    });
    expect(await repository.listEventsForInstall({ tenantId: "tenant_123", installId: "install_123" })).toMatchObject([
      { eventAction: "package_installed", packageVersionId: "pkg_connect_first@1.0.0" },
      { eventAction: "package_uninstalled", packageVersionId: "pkg_connect_first@1.0.0" }
    ]);
  });

  it("lets tenant admins uninstall blueprint packages", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    const actor = {
      userId: "user_admin",
      tenantId: "tenant_123",
      role: "admin" as const
    };

    await installBlueprintPackageForTenant({
      actor,
      blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      installedAt: "2026-07-11T13:00:00.000Z",
      repository
    });

    await expect(
      uninstallBlueprintPackageForTenant({
        actor,
        packageId: "pkg_connect_first",
        packageKey: "connect-first",
        installId: "install_123",
        confirmation: "UNINSTALL connect-first",
        uninstalledAt: "2026-07-11T14:30:00.000Z",
        repository
      })
    ).resolves.toMatchObject({
      status: "uninstalled",
      enabled: false
    });
  });

  it("blocks uninstall without exact typed confirmation before persistence", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    const actor = {
      userId: "user_owner",
      tenantId: "tenant_123",
      role: "owner" as const
    };

    await installBlueprintPackageForTenant({
      actor,
      blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      installedAt: "2026-07-11T13:00:00.000Z",
      repository
    });

    await expect(
      uninstallBlueprintPackageForTenant({
        actor,
        packageId: "pkg_connect_first",
        packageKey: "connect-first",
        installId: "install_123",
        confirmation: "delete it",
        uninstalledAt: "2026-07-11T14:30:00.000Z",
        repository
      })
    ).rejects.toThrow('Uninstall confirmation must exactly match "UNINSTALL connect-first"');

    expect(await repository.findInstallById({ tenantId: "tenant_123", installId: "install_123" })).toMatchObject({
      installStatus: "enabled"
    });
    expect(await repository.listEventsForInstall({ tenantId: "tenant_123", installId: "install_123" })).toHaveLength(1);
  });

  it("uses the current package key, not stable package id, for uninstall typed confirmation", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    const actor = {
      userId: "user_owner",
      tenantId: "tenant_123",
      role: "owner" as const
    };
    await installBlueprintPackageForTenant({
      actor,
      blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      installedAt: "2026-07-11T14:00:00.000Z",
      repository
    });

    await expect(
      uninstallBlueprintPackageForTenant({
        actor,
        packageId: "pkg_connect_first",
        packageKey: "connect-foundation",
        installId: "install_123",
        confirmation: "UNINSTALL connect-foundation",
        uninstalledAt: "2026-07-11T14:30:00.000Z",
        repository
      })
    ).resolves.toMatchObject({ status: "uninstalled" });
  });

  it("fails closed when uninstall requests do not match the tenant install boundary", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());

    await installBlueprintPackageForTenant({
      actor: {
        userId: "user_owner",
        tenantId: "tenant_123",
        role: "owner"
      },
      blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      installedAt: "2026-07-11T13:00:00.000Z",
      repository
    });

    await expect(
      uninstallBlueprintPackageForTenant({
        actor: {
          userId: "user_member",
          tenantId: "tenant_123",
          role: "member"
        },
        packageId: "pkg_connect_first",
        packageKey: "connect-first",
        installId: "install_123",
        confirmation: "UNINSTALL connect-first",
        uninstalledAt: "2026-07-11T14:30:00.000Z",
        repository
      })
    ).rejects.toThrow("Only tenant owners and admins can manage blueprint package installs");

    await expect(
      uninstallBlueprintPackageForTenant({
        actor: {
          userId: "user_owner",
          tenantId: "tenant_123",
          role: "owner"
        },
        packageId: "pkg_other",
        packageKey: "connect-first",
        installId: "install_123",
        confirmation: "UNINSTALL connect-first",
        uninstalledAt: "2026-07-11T14:30:00.000Z",
        repository
      })
    ).rejects.toThrow('Blueprint package install "install_123" is bound to package "pkg_connect_first", not "pkg_other"');

    await expect(
      uninstallBlueprintPackageForTenant({
        actor: {
          userId: "user_owner",
          tenantId: "tenant_123",
          role: "owner"
        },
        packageId: "pkg_connect_first",
        packageKey: "connect-first",
        installId: "install_123",
        confirmation: "UNINSTALL other-slug",
        uninstalledAt: "2026-07-11T14:30:00.000Z",
        repository
      })
    ).rejects.toThrow('Uninstall confirmation must exactly match "UNINSTALL connect-first"');

    await expect(
      uninstallBlueprintPackageForTenant({
        actor: {
          userId: "user_other_owner",
          tenantId: "tenant_456",
          role: "owner"
        },
        packageId: "pkg_connect_first",
        packageKey: "connect-first",
        installId: "install_123",
        confirmation: "UNINSTALL connect-first",
        uninstalledAt: "2026-07-11T14:30:00.000Z",
        repository
      })
    ).rejects.toThrow('Blueprint package install "install_123" was not found for tenant "tenant_456"');

    expect(await repository.findInstallById({ tenantId: "tenant_123", installId: "install_123" })).toMatchObject({
      installStatus: "enabled"
    });
    expect(await repository.listEventsForInstall({ tenantId: "tenant_123", installId: "install_123" })).toHaveLength(1);
  });

  it("fails closed when uninstall targets an already uninstalled package install", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    const actor = {
      userId: "user_owner",
      tenantId: "tenant_123",
      role: "owner" as const
    };

    await installBlueprintPackageForTenant({
      actor,
      blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      installedAt: "2026-07-11T13:00:00.000Z",
      repository
    });
    await uninstallBlueprintPackageForTenant({
      actor,
      packageId: "pkg_connect_first",
      packageKey: "connect-first",
      installId: "install_123",
      confirmation: "UNINSTALL connect-first",
      uninstalledAt: "2026-07-11T14:30:00.000Z",
      repository
    });

    await expect(
      uninstallBlueprintPackageForTenant({
        actor,
        packageId: "pkg_connect_first",
        packageKey: "connect-first",
        installId: "install_123",
        confirmation: "UNINSTALL connect-first",
        uninstalledAt: "2026-07-11T14:35:00.000Z",
        repository
      })
    ).rejects.toThrow('Blueprint install "install_123" is uninstalled');

    expect(
      (await repository.listEventsForInstall({ tenantId: "tenant_123", installId: "install_123" })).map(
        (event) => event.eventAction
      )
    ).toEqual(["package_installed", "package_uninstalled"]);
  });

  it("allows disabled blueprint package installs to be uninstalled without re-enabling them", async () => {
    const repository = createInMemoryFactoryPackageInstallRepository();
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
    const actor = {
      userId: "user_owner",
      tenantId: "tenant_123",
      role: "owner" as const
    };
    await installBlueprintPackageForTenant({
      actor,
      blueprint,
      packageKey: "connect-first",
      installId: "install_123",
      installedAt: "2026-07-11T14:00:00.000Z",
      repository
    });
    await disableBlueprintPackageForTenant({
      actor,
      installId: "install_123",
      disabledAt: "2026-07-11T14:10:00.000Z",
      repository
    });

    await expect(
      uninstallBlueprintPackageForTenant({
        actor,
        packageId: "pkg_connect_first",
        packageKey: "connect-first",
        installId: "install_123",
        confirmation: "UNINSTALL connect-first",
        uninstalledAt: "2026-07-11T14:30:00.000Z",
        repository
      })
    ).resolves.toMatchObject({
      status: "uninstalled",
      enabled: false,
      disabledAt: "2026-07-11T14:10:00.000Z",
      uninstalledAt: "2026-07-11T14:30:00.000Z"
    });
    expect(
      (await repository.listEventsForInstall({ tenantId: "tenant_123", installId: "install_123" })).map(
        (event) => event.eventAction
      )
    ).toEqual(["package_installed", "package_disabled", "package_uninstalled"]);
  });
});
