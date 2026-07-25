// TASK-084: real-Postgres counterpart to
// tests/factory-run-driver-application-service.test.ts. Proves the run-driver
// spine persists through the real Postgres adapters (migration 0040's
// wfpc.factory_runs, plus the existing deliverable/approval tables) rather
// than only through the in-memory repositories, and proves AC5 tenant
// isolation for the new run-state table, shown falsifiable.
//
// Gated on WF_LOCAL_PG_URL so it is skipped whenever the disposable DB is
// not running, and it refuses to run at all if the target looks like the
// real Supabase host (CON-012 / DEC-040).
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectPgQueryClient } from "../src/db/postgres-client.js";
import type { QueryClient } from "../src/db/supabase-repositories.js";
import { createWorkspace } from "../src/factory/workspaces/workspace-service.js";
import { loadBlueprintPackageManifest } from "../src/factory/packages/package-manifest-loader.js";
import {
  createPostgresFactoryPackageInstallRepository
} from "../src/factory/packages/package-install-repository.js";
import { installBlueprintPackageForTenant } from "../src/factory/packages/package-install-application-service.js";
import type { TenantPackageInstallActor } from "../src/factory/packages/package-install-application-service.js";
import { startFactoryRun } from "../src/factory/runs/run-driver-application-service.js";
import { createPostgresFactoryRunRepository } from "../src/factory/runs/run-repository.js";
import { createPostgresFactoryRunDeliverableRepository } from "../src/factory/runs/deliverable-repository.js";
import { createPostgresFactoryRunApprovalRepository } from "../src/factory/runs/run-approval-repository.js";
import { createStubLLMProvider } from "../src/factory/providers/stub-provider.js";
import { createCurrentSliceManifest } from "./factory-package-manifest-fixtures.js";

const LOCAL_PG_URL = process.env.WF_LOCAL_PG_URL;

function readDotEnvValue(key: string): string | undefined {
  if (!existsSync(".env")) {
    return undefined;
  }
  const line = readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim();
}

function assertNeverPointsAtSupabase(connectionString: string) {
  const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
  if (!isLocal) {
    throw new Error(
      `Refusing to run the run-driver integration test: WF_LOCAL_PG_URL "${connectionString}" does not look local (CON-012).`
    );
  }
  const supabaseDbUrl = process.env.SUPABASE_DB_URL ?? readDotEnvValue("SUPABASE_DB_URL");
  if (supabaseDbUrl && supabaseDbUrl !== "PLACE_HOLDER" && connectionString === supabaseDbUrl) {
    throw new Error(
      "Refusing to run the run-driver integration test: WF_LOCAL_PG_URL equals SUPABASE_DB_URL (CON-012)."
    );
  }
}

describe.skipIf(!LOCAL_PG_URL)("run-driver spine against a real local disposable Postgres (TASK-084)", () => {
  let seedClientHandle: Awaited<ReturnType<typeof connectPgQueryClient>>;
  let seedClient: QueryClient;

  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const ownerAUserId = randomUUID();
  const ownerBUserId = randomUUID();

  const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());

  beforeAll(async () => {
    if (!LOCAL_PG_URL) {
      return;
    }
    assertNeverPointsAtSupabase(LOCAL_PG_URL);
    seedClientHandle = await connectPgQueryClient({ connectionString: LOCAL_PG_URL });
    seedClient = seedClientHandle;

    await seedClient.query("insert into auth.users (id) values ($1), ($2)", [ownerAUserId, ownerBUserId]);
    await seedClient.query("insert into wfpc.tenants (id, name, slug) values ($1, $2, $3)", [
      tenantAId,
      "Run Driver Advisory A",
      `run-driver-advisory-a-${tenantAId}`
    ]);
    await seedClient.query("insert into wfpc.tenants (id, name, slug) values ($1, $2, $3)", [
      tenantBId,
      "Run Driver Advisory B",
      `run-driver-advisory-b-${tenantBId}`
    ]);
    await seedClient.query(
      "insert into wfpc.tenant_memberships (tenant_id, user_id, role) values ($1, $2, 'owner')",
      [tenantAId, ownerAUserId]
    );
    await seedClient.query(
      "insert into wfpc.tenant_memberships (tenant_id, user_id, role) values ($1, $2, 'owner')",
      [tenantBId, ownerBUserId]
    );

    await seedClient.query(
      `insert into wfpc.factory_blueprint_packages (package_id, package_key, title)
       values ($1, $2, $3)
       on conflict (package_id) do nothing`,
      [blueprint.packageId, blueprint.key, blueprint.title]
    );
    await seedClient.query(
      `insert into wfpc.factory_blueprint_package_versions
        (package_version_id, package_id, version, manifest, content_hash, catalog_status, published_by_operator_ref)
       values ($1, $2, $3, $4::jsonb, $5, 'published', 'test-operator')
       on conflict (package_version_id) do nothing`,
      [
        blueprint.packageVersionId,
        blueprint.packageId,
        blueprint.version,
        JSON.stringify({ note: "run-driver integration test seed" }),
        blueprint.source?.contentHash ?? "sha256:0000000000000000000000000000000000000000000000000000000000000"
      ]
    );
  });

  afterAll(async () => {
    if (seedClientHandle) {
      await seedClientHandle.close();
    }
  });

  const installIdByTenant = new Map<string, string>();

  async function installForTenant(tenantId: string, ownerUserId: string): Promise<string> {
    const existing = installIdByTenant.get(tenantId);
    if (existing) {
      return existing;
    }
    const installRepository = createPostgresFactoryPackageInstallRepository(seedClient);
    const actor: TenantPackageInstallActor = { userId: ownerUserId, tenantId, role: "owner" };
    const installId = `install_${randomUUID()}`;
    await installBlueprintPackageForTenant({
      actor,
      blueprint,
      packageKey: blueprint.key,
      installId,
      installedAt: new Date().toISOString(),
      repository: installRepository
    });
    installIdByTenant.set(tenantId, installId);
    return installId;
  }

  it("drives intake -> positioning through the real Postgres repositories and persists run state, both deliverables, and the checkpoint approval, surviving a fresh connection", async () => {
    const installId = await installForTenant(tenantAId, ownerAUserId);
    const workspace = createWorkspace({
      id: tenantAId,
      name: "Run Driver Advisory A",
      slug: `run-driver-advisory-a-${tenantAId}`,
      createdAt: new Date().toISOString()
    });
    const installRow = await createPostgresFactoryPackageInstallRepository(seedClient).findInstallById({
      tenantId: tenantAId,
      installId
    });
    if (!installRow) {
      throw new Error("install row was not found");
    }
    const packageInstall = {
      id: installRow.installId,
      workspaceId: installRow.tenantId,
      packageId: installRow.packageId,
      packageVersionId: installRow.packageVersionId,
      previousPackageVersionId: installRow.previousPackageVersionId,
      status: installRow.installStatus,
      installedAt: installRow.installedAt,
      updatedAt: installRow.updatedAt,
      disabledAt: installRow.disabledAt,
      uninstalledAt: installRow.uninstalledAt,
      enabled: installRow.installStatus === "enabled",
      permissionSnapshot: installRow.permissionSnapshot,
      permissionDiff: installRow.permissionDiff
    };

    const runId = `run_${randomUUID()}`;
    const runRepository = createPostgresFactoryRunRepository(seedClient);
    const deliverableRepository = createPostgresFactoryRunDeliverableRepository(seedClient);
    const approvalRepository = createPostgresFactoryRunApprovalRepository(seedClient);

    const result = await startFactoryRun({
      runId,
      workspace,
      packageInstall,
      blueprint,
      answers: {
        founderName: "Avery Stone",
        businessName: "Acme Advisory",
        primaryGoal: "Reach the first ten consulting clients",
        targetAudience: "Solo founders"
      },
      provider: createStubLLMProvider(),
      providerModel: "stub-deterministic-v1",
      providerSecret: "no-real-secret-the-stub-never-uses-this",
      startedAt: new Date().toISOString(),
      intakeCompletedAt: new Date().toISOString(),
      positioningRequestedAt: new Date().toISOString(),
      runRepository,
      deliverableRepository,
      approvalRepository
    });

    expect(result.run.status).toBe("waiting_for_approval");

    // Re-run the driver against the same runId: idempotency guard must not
    // duplicate anything (AC2).
    const secondInvocation = await startFactoryRun({
      runId,
      workspace,
      packageInstall,
      blueprint,
      answers: {
        founderName: "Avery Stone",
        businessName: "Acme Advisory",
        primaryGoal: "Reach the first ten consulting clients",
        targetAudience: "Solo founders"
      },
      provider: createStubLLMProvider(),
      providerModel: "stub-deterministic-v1",
      providerSecret: "no-real-secret-the-stub-never-uses-this",
      startedAt: new Date().toISOString(),
      intakeCompletedAt: new Date().toISOString(),
      positioningRequestedAt: new Date().toISOString(),
      runRepository,
      deliverableRepository,
      approvalRepository
    });
    expect(secondInvocation.run).toEqual(result.run);

    // "Survives a fresh session": open a brand-new connection and re-read.
    const freshConnection = await connectPgQueryClient({ connectionString: LOCAL_PG_URL! });
    try {
      const freshRunRepository = createPostgresFactoryRunRepository(freshConnection);
      const freshRun = await freshRunRepository.findByRunId({ tenantId: tenantAId, runId });
      expect(freshRun?.status).toBe("waiting_for_approval");
      expect(freshRun?.currentStationKey).toBe("positioning");
      expect(freshRun?.activeApprovalContractKey).toBe("original");

      const freshDeliverableRepository = createPostgresFactoryRunDeliverableRepository(freshConnection);
      const deliverables = await freshDeliverableRepository.listDeliverablesForRun({ tenantId: tenantAId, runId });
      expect(deliverables).toHaveLength(2);

      const freshApprovalRepository = createPostgresFactoryRunApprovalRepository(freshConnection);
      const pendingApproval = await freshApprovalRepository.findPendingApprovalForRun({ tenantId: tenantAId, runId });
      expect(pendingApproval?.status).toBe("pending");
      expect(pendingApproval?.deliverableId).toBe(deliverables[1]?.deliverableId);
    } finally {
      await freshConnection.close();
    }

    const rows = await seedClient.query("select run_id from wfpc.factory_runs where tenant_id = $1 and run_id = $2", [
      tenantAId,
      runId
    ]);
    expect(rows.rows).toHaveLength(1);
  });

  it("AC5: a second tenant provably cannot read the first tenant's run state, shown falsifiable", async () => {
    const installId = await installForTenant(tenantAId, ownerAUserId);
    const workspace = createWorkspace({
      id: tenantAId,
      name: "Run Driver Advisory A",
      slug: `run-driver-advisory-a-${tenantAId}`,
      createdAt: new Date().toISOString()
    });
    const installRow = await createPostgresFactoryPackageInstallRepository(seedClient).findInstallById({
      tenantId: tenantAId,
      installId
    });
    if (!installRow) {
      throw new Error("install row was not found");
    }
    const packageInstall = {
      id: installRow.installId,
      workspaceId: installRow.tenantId,
      packageId: installRow.packageId,
      packageVersionId: installRow.packageVersionId,
      previousPackageVersionId: installRow.previousPackageVersionId,
      status: installRow.installStatus,
      installedAt: installRow.installedAt,
      updatedAt: installRow.updatedAt,
      disabledAt: installRow.disabledAt,
      uninstalledAt: installRow.uninstalledAt,
      enabled: installRow.installStatus === "enabled",
      permissionSnapshot: installRow.permissionSnapshot,
      permissionDiff: installRow.permissionDiff
    };

    const runId = `run_${randomUUID()}`;
    const runRepository = createPostgresFactoryRunRepository(seedClient);

    await startFactoryRun({
      runId,
      workspace,
      packageInstall,
      blueprint,
      answers: {
        founderName: "Avery Stone",
        businessName: "Acme Advisory",
        primaryGoal: "Reach the first ten consulting clients",
        targetAudience: "Solo founders"
      },
      provider: createStubLLMProvider(),
      providerModel: "stub-deterministic-v1",
      providerSecret: "no-real-secret-the-stub-never-uses-this",
      startedAt: new Date().toISOString(),
      intakeCompletedAt: new Date().toISOString(),
      positioningRequestedAt: new Date().toISOString(),
      runRepository,
      deliverableRepository: createPostgresFactoryRunDeliverableRepository(seedClient),
      approvalRepository: createPostgresFactoryRunApprovalRepository(seedClient)
    });

    // GREEN: the app-layer tenant_id guard denies tenant B's repository read.
    const deniedRead = await runRepository.findByRunId({ tenantId: tenantBId, runId });
    expect(deniedRead).toBeNull();

    // Sanity: the same row IS visible to tenant A, so the denial above is
    // about tenant scoping, not a missing row.
    const ownRead = await runRepository.findByRunId({ tenantId: tenantAId, runId });
    expect(ownRead).not.toBeNull();

    // FALSIFIABLE RED: a raw query against the same table with no tenant_id
    // predicate proves tenant A's row is not hidden by anything but that
    // predicate -- removing the guard exposes cross-tenant data.
    const unguardedRead = await seedClient.query("select tenant_id from wfpc.factory_runs where run_id = $1", [runId]);
    expect(unguardedRead.rows).toHaveLength(1);
    expect((unguardedRead.rows[0] as { tenant_id: string }).tenant_id).toBe(tenantAId);
  });
});
