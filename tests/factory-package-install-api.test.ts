import { describe, expect, it, vi } from "vitest";

import { createFactoryPackageInstallApi } from "../src/api/factory-package-install-api.js";
import { createInMemoryFactoryPackageInstallRepository } from "../src/factory/packages/package-install-repository.js";
import { loadBlueprintPackageManifest } from "../src/factory/packages/package-manifest-loader.js";
import { createCurrentSliceManifest } from "./factory-package-manifest-fixtures.js";

const ownerSession = { userId: "user-owner", tenantId: "tenant-1" };
const adminSession = { userId: "user-admin", tenantId: "tenant-1" };
const memberSession = { userId: "user-member", tenantId: "tenant-1" };

function createVersionedBlueprint(version: string, widened = false) {
  const manifest = createCurrentSliceManifest();
  manifest.version = version;
  if (widened) {
    manifest.permissions.tools = [...manifest.permissions.tools, "web_research_readonly"];
    manifest.permissions.external_actions.send_email = "approval_required";
    manifest.budgets.max_run_cost_usd = 40;
  }
  return loadBlueprintPackageManifest(manifest);
}

function createApiHarness(input?: {
  session?: typeof ownerSession | typeof adminSession | typeof memberSession | null;
  role?: "owner" | "admin" | "member";
  entitled?: boolean;
}) {
  const repository = createInMemoryFactoryPackageInstallRepository();
  const blueprints = new Map([
    ["connect-first@1.0.0", createVersionedBlueprint("1.0.0")],
    ["connect-first@1.1.0", createVersionedBlueprint("1.1.0", true)]
  ]);
  const deps = {
    authenticate: vi.fn().mockResolvedValue(input?.session === undefined ? ownerSession : input.session),
    requireTenantMember: vi.fn().mockResolvedValue(undefined),
    resolveTenantPackageInstallRole: vi.fn().mockResolvedValue(input?.role ?? "owner"),
    loadBlueprintPackage: vi.fn(async ({ packageKey, packageVersionId }: { packageKey: string; packageVersionId?: string }) => {
      const version = packageVersionId ? packageVersionId.split("@").at(-1) : "1.0.0";
      const blueprint = blueprints.get(`${packageKey}@${version}`);
      if (!blueprint) {
        throw new Error(`Missing blueprint ${packageKey}@${version}`);
      }
      return blueprint;
    }),
    entitlements: {
      canInstall: vi.fn().mockResolvedValue(input?.entitled ?? true)
    },
    repository,
    auditSink: vi.fn().mockResolvedValue(undefined)
  };
  return {
    api: createFactoryPackageInstallApi(deps),
    deps,
    repository
  };
}

describe("factory package install API", () => {
  it("walks the Ticket 09 tenant package lifecycle with statuses and audit events", async () => {
    const { api, repository } = createApiHarness();

    await expect(
      api.installPackage({
        authorization: "Bearer owner",
        packageKey: "connect-first",
        installId: "install-1",
        installedAt: "2026-07-11T15:00:00.000Z"
      })
    ).resolves.toMatchObject({
      installId: "install-1",
      packageVersionId: "pkg_connect_first@1.0.0",
      status: "enabled"
    });

    await expect(
      api.disablePackage({
        authorization: "Bearer owner",
        installId: "install-1",
        disabledAt: "2026-07-11T15:10:00.000Z"
      })
    ).resolves.toMatchObject({ status: "disabled", enabled: false });

    await expect(
      api.enablePackage({
        authorization: "Bearer owner",
        installId: "install-1",
        enabledAt: "2026-07-11T15:20:00.000Z"
      })
    ).resolves.toMatchObject({ status: "enabled", enabled: true });

    await expect(
      api.updatePackage({
        authorization: "Bearer owner",
        packageKey: "connect-first",
        installId: "install-1",
        packageVersionId: "pkg_connect_first@1.1.0",
        consent: true,
        updatedAt: "2026-07-11T15:30:00.000Z"
      })
    ).resolves.toMatchObject({
      packageVersionId: "pkg_connect_first@1.1.0",
      previousPackageVersionId: "pkg_connect_first@1.0.0",
      status: "enabled",
      permissionDiff: {
        widened: true
      }
    });

    await expect(
      api.rollbackPackage({
        authorization: "Bearer owner",
        packageKey: "connect-first",
        installId: "install-1",
        packageVersionId: "pkg_connect_first@1.0.0",
        rolledBackAt: "2026-07-11T15:40:00.000Z"
      })
    ).resolves.toMatchObject({
      packageVersionId: "pkg_connect_first@1.0.0",
      status: "enabled"
    });

    await expect(
      api.uninstallPackage({
        authorization: "Bearer owner",
        packageId: "pkg_connect_first",
        packageKey: "connect-first",
        installId: "install-1",
        confirmation: "UNINSTALL connect-first",
        uninstalledAt: "2026-07-11T15:50:00.000Z"
      })
    ).resolves.toMatchObject({
      status: "uninstalled",
      enabled: false,
      deliverablesDeleted: false,
      launchKitDeleted: false
    });

    expect(
      (await repository.listEventsForInstall({ tenantId: "tenant-1", installId: "install-1" })).map(
        (event) => event.eventAction
      )
    ).toEqual([
      "package_installed",
      "package_disabled",
      "package_enabled",
      "package_updated",
      "package_rolled_back",
      "package_uninstalled"
    ]);
  });

  it("requires explicit widened-permission consent and echoes the permission diff", async () => {
    const { api } = createApiHarness();
    await api.installPackage({
      authorization: "Bearer owner",
      packageKey: "connect-first",
      installId: "install-1",
      installedAt: "2026-07-11T15:00:00.000Z"
    });

    await expect(
      api.updatePackage({
        authorization: "Bearer owner",
        packageKey: "connect-first",
        installId: "install-1",
        packageVersionId: "pkg_connect_first@1.1.0",
        updatedAt: "2026-07-11T15:30:00.000Z"
      })
    ).rejects.toMatchObject({
      code: "permission_widening_requires_consent",
      permissionDiff: {
        widened: true
      }
    });
  });

  it("allows tenant admins but rejects tenant members before lifecycle persistence", async () => {
    const adminHarness = createApiHarness({ session: adminSession, role: "admin" });

    await expect(
      adminHarness.api.installPackage({
        authorization: "Bearer admin",
        packageKey: "connect-first",
        installId: "install-admin",
        installedAt: "2026-07-11T15:00:00.000Z"
      })
    ).resolves.toMatchObject({ workspaceId: "tenant-1", status: "enabled" });

    const memberHarness = createApiHarness({ session: memberSession, role: "member" });

    await expect(
      memberHarness.api.installPackage({
        authorization: "Bearer member",
        packageKey: "connect-first",
        installId: "install-member",
        installedAt: "2026-07-11T15:00:00.000Z"
      })
    ).rejects.toMatchObject({ code: "forbidden" });

    expect(await memberHarness.repository.findInstallById({ tenantId: "tenant-1", installId: "install-member" })).toBeNull();
  });

  it("rejects unauthenticated and unentitled package install requests before persistence", async () => {
    const unauthenticatedHarness = createApiHarness({ session: null });

    await expect(
      unauthenticatedHarness.api.installPackage({
        authorization: "",
        packageKey: "connect-first",
        installId: "install-1",
        installedAt: "2026-07-11T15:00:00.000Z"
      })
    ).rejects.toMatchObject({ code: "unauthorized" });

    const unentitledHarness = createApiHarness({ entitled: false });

    await expect(
      unentitledHarness.api.installPackage({
        authorization: "Bearer owner",
        packageKey: "connect-first",
        installId: "install-1",
        installedAt: "2026-07-11T15:00:00.000Z"
      })
    ).rejects.toMatchObject({ code: "forbidden" });

    expect(await unentitledHarness.repository.findInstallById({ tenantId: "tenant-1", installId: "install-1" })).toBeNull();
  });
});
