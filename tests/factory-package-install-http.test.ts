import { describe, expect, it, vi } from "vitest";

import {
  FactoryPackageInstallApiError,
  FactoryPackageInstallPermissionConsentError,
  type FactoryPackageInstallPermissionDiffDto
} from "../src/api/factory-package-install-api.js";
import { createFactoryPackageInstallHttpHandler } from "../src/api/factory-package-install-http.js";

function createHandler(input?: {
  api?: Partial<Parameters<typeof createFactoryPackageInstallHttpHandler>[0]["packageInstallApi"]>;
  allowedOrigins?: string[];
}) {
  const packageInstallApi = {
    installPackage: vi.fn(),
    disablePackage: vi.fn(),
    enablePackage: vi.fn(),
    updatePackage: vi.fn(),
    rollbackPackage: vi.fn(),
    uninstallPackage: vi.fn(),
    ...input?.api
  };
  return {
    packageInstallApi,
    handler: createFactoryPackageInstallHttpHandler({
      allowedOrigins: input?.allowedOrigins ?? ["https://portal.wealthfactory.test"],
      packageInstallApi,
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: 1 }) }
    })
  };
}

describe("factory package install HTTP boundary", () => {
  it("walks Ticket 09 lifecycle routes through guarded tenant endpoints", async () => {
    const { handler, packageInstallApi } = createHandler({
      api: {
        installPackage: vi.fn().mockResolvedValue({ installId: "install-1", status: "enabled" }),
        disablePackage: vi.fn().mockResolvedValue({ installId: "install-1", status: "disabled" }),
        enablePackage: vi.fn().mockResolvedValue({ installId: "install-1", status: "enabled" }),
        updatePackage: vi.fn().mockResolvedValue({ installId: "install-1", status: "enabled" }),
        rollbackPackage: vi.fn().mockResolvedValue({ installId: "install-1", status: "enabled" }),
        uninstallPackage: vi.fn().mockResolvedValue({
          installId: "install-1",
          status: "uninstalled",
          deliverablesDeleted: false,
          launchKitDeleted: false
        })
      }
    });

    const base = {
      method: "POST",
      headers: { origin: "https://portal.wealthfactory.test", authorization: "Bearer owner" },
      bodyByteLength: 80,
      ip: "203.0.113.10"
    };

    await expect(
      handler({
        ...base,
        path: "/api/factory/package-installs",
        body: { packageKey: "connect-first", installId: "install-1", installedAt: "2026-07-11T15:00:00.000Z" }
      })
    ).resolves.toMatchObject({ status: 201, body: { status: "enabled" } });

    await expect(
      handler({
        ...base,
        path: "/api/factory/package-installs/install-1/disable",
        body: { disabledAt: "2026-07-11T15:10:00.000Z" }
      })
    ).resolves.toMatchObject({ status: 200, body: { status: "disabled" } });

    await expect(
      handler({
        ...base,
        path: "/api/factory/package-installs/install-1/enable",
        body: { enabledAt: "2026-07-11T15:20:00.000Z" }
      })
    ).resolves.toMatchObject({ status: 200, body: { status: "enabled" } });

    await expect(
      handler({
        ...base,
        path: "/api/factory/package-installs/install-1/update",
        body: {
          packageKey: "connect-first",
          packageVersionId: "pkg_connect_first@1.1.0",
          consent: true,
          updatedAt: "2026-07-11T15:30:00.000Z"
        }
      })
    ).resolves.toMatchObject({ status: 200, body: { status: "enabled" } });

    await expect(
      handler({
        ...base,
        path: "/api/factory/package-installs/install-1/rollback",
        body: {
          packageKey: "connect-first",
          packageVersionId: "pkg_connect_first@1.0.0",
          rolledBackAt: "2026-07-11T15:40:00.000Z"
        }
      })
    ).resolves.toMatchObject({ status: 200, body: { status: "enabled" } });

    await expect(
      handler({
        ...base,
        path: "/api/factory/package-installs/install-1/uninstall",
        body: {
          packageId: "pkg_connect_first",
          packageKey: "connect-first",
          confirmation: "UNINSTALL connect-first",
          uninstalledAt: "2026-07-11T15:50:00.000Z"
        }
      })
    ).resolves.toMatchObject({
      status: 200,
      body: { status: "uninstalled", deliverablesDeleted: false, launchKitDeleted: false }
    });

    expect(packageInstallApi.installPackage).toHaveBeenCalledWith({
      authorization: "Bearer owner",
      packageKey: "connect-first",
      installId: "install-1",
      installedAt: "2026-07-11T15:00:00.000Z"
    });
    expect(packageInstallApi.uninstallPackage).toHaveBeenCalledWith({
      authorization: "Bearer owner",
      packageId: "pkg_connect_first",
      packageKey: "connect-first",
      installId: "install-1",
      confirmation: "UNINSTALL connect-first",
      uninstalledAt: "2026-07-11T15:50:00.000Z"
    });
  });

  it("maps widened-permission consent failures without flattening the diff", async () => {
    const permissionDiff: FactoryPackageInstallPermissionDiffDto = {
      widened: true,
      addedTools: ["web_research_readonly"],
      widenedExternalActions: [],
      budgetIncreases: []
    };
    const { handler } = createHandler({
      api: {
        updatePackage: vi.fn().mockRejectedValue(new FactoryPackageInstallPermissionConsentError(permissionDiff))
      }
    });

    const response = await handler({
      method: "POST",
      path: "/api/factory/package-installs/install-1/update",
      headers: { origin: "https://portal.wealthfactory.test", authorization: "Bearer owner" },
      body: { packageKey: "connect-first", packageVersionId: "pkg_connect_first@1.1.0" },
      bodyByteLength: 75,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      code: "permission_widening_requires_consent",
      permissionDiff
    });
  });

  it("rejects invalid origins, malformed payloads, and unauthorized API results", async () => {
    const { handler, packageInstallApi } = createHandler({
      api: {
        installPackage: vi.fn().mockRejectedValue(new FactoryPackageInstallApiError("unauthorized", "Unauthorized"))
      }
    });

    const rejectedOrigin = await handler({
      method: "POST",
      path: "/api/factory/package-installs",
      headers: { origin: "https://evil.example", authorization: "Bearer owner" },
      body: { packageKey: "connect-first" },
      bodyByteLength: 31,
      ip: "203.0.113.10"
    });
    expect(rejectedOrigin.status).toBe(403);

    const malformed = await handler({
      method: "POST",
      path: "/api/factory/package-installs",
      headers: { origin: "https://portal.wealthfactory.test", authorization: "Bearer owner" },
      body: { packageKey: "connect-first" },
      bodyByteLength: 31,
      ip: "203.0.113.10"
    });
    expect(malformed.status).toBe(400);

    const unauthorized = await handler({
      method: "POST",
      path: "/api/factory/package-installs",
      headers: { origin: "https://portal.wealthfactory.test", authorization: "Bearer owner" },
      body: { packageKey: "connect-first", installId: "install-1", installedAt: "2026-07-11T15:00:00.000Z" },
      bodyByteLength: 96,
      ip: "203.0.113.10"
    });
    expect(unauthorized.status).toBe(401);
    expect(packageInstallApi.installPackage).toHaveBeenCalledTimes(1);
  });

  it("fails closed on malformed encoded install ids and domain validation errors", async () => {
    const { handler } = createHandler({
      api: {
        uninstallPackage: vi.fn().mockRejectedValue(new Error('Uninstall confirmation must exactly match "UNINSTALL connect-first"'))
      }
    });

    const malformedPath = await handler({
      method: "POST",
      path: "/api/factory/package-installs/%E0%A4%A/update",
      headers: { origin: "https://portal.wealthfactory.test", authorization: "Bearer owner" },
      body: { packageKey: "connect-first", packageVersionId: "pkg_connect_first@1.1.0" },
      bodyByteLength: 75,
      ip: "203.0.113.10"
    });
    expect(malformedPath.status).toBe(400);
    expect(malformedPath.body).toEqual({ code: "invalid_request" });

    const validationFailure = await handler({
      method: "POST",
      path: "/api/factory/package-installs/install-1/uninstall",
      headers: { origin: "https://portal.wealthfactory.test", authorization: "Bearer owner" },
      body: {
        packageId: "pkg_connect_first",
        packageKey: "connect-first",
        confirmation: "delete it",
        uninstalledAt: "2026-07-11T15:50:00.000Z"
      },
      bodyByteLength: 130,
      ip: "203.0.113.10"
    });
    expect(validationFailure.status).toBe(400);
    expect(validationFailure.body).toEqual({ code: "invalid_request" });
  });
});
