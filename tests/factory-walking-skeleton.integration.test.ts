// TASK-055 walking skeleton: the first real-Postgres integration test in
// this repo (every other *-migration.test.ts only regex-matches .sql text).
// Drives one thin customer path end to end against a real, local, disposable
// Postgres: real tenant rows -> a real session token -> package install
// persisted -> one station executed through a deterministic stub provider
// (DEC-040, no network/credential/spend) -> deliverable persisted and
// re-readable on a fresh connection after "logout" -> a second tenant
// provably denied the first tenant's rows, shown falsifiable (AC3).
//
// Gated on WF_LOCAL_PG_URL so it is skipped whenever the disposable DB is
// not running, and it refuses to run at all if the target looks like the
// real Supabase host (CON-012 / DEC-040).
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectPgQueryClient } from "../src/db/postgres-client.js";
import type { QueryClient } from "../src/db/supabase-repositories.js";
import { createDurableAuditSink } from "../src/audit/durable-audit.js";
import { createRuntimeSessionToken, verifyRuntimeSessionToken } from "../src/api/runtime-auth.js";
import { createWorkspace } from "../src/factory/workspaces/workspace-service.js";
import { loadBlueprintPackageManifest } from "../src/factory/packages/package-manifest-loader.js";
import {
  createPostgresFactoryPackageInstallRepository
} from "../src/factory/packages/package-install-repository.js";
import { installBlueprintPackageForTenant } from "../src/factory/packages/package-install-application-service.js";
import type { TenantPackageInstallActor } from "../src/factory/packages/package-install-application-service.js";
import { startIntakeRun, submitIntakeAnswers } from "../src/factory/runs/intake-run-service.js";
import {
  completePositioningAnalysisWithProvider,
  startPositioningAnalysisStation
} from "../src/factory/runs/positioning-station-service.js";
import { createStubLLMProvider } from "../src/factory/providers/stub-provider.js";
import {
  createPostgresFactoryRunDeliverableRepository
} from "../src/factory/runs/deliverable-repository.js";
import { createCurrentSliceManifest } from "./factory-package-manifest-fixtures.js";

const LOCAL_PG_URL = process.env.WF_LOCAL_PG_URL;
const SESSION_ENV = {
  signingKey: "test-only-signing-key-not-a-real-secret-value",
  issuer: "wealth-factory-runtime",
  audience: "wealth-factory-portal"
};

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
      `Refusing to run the walking-skeleton integration test: WF_LOCAL_PG_URL "${connectionString}" does not look local (CON-012).`
    );
  }
  const supabaseDbUrl = process.env.SUPABASE_DB_URL ?? readDotEnvValue("SUPABASE_DB_URL");
  if (supabaseDbUrl && supabaseDbUrl !== "PLACE_HOLDER" && connectionString === supabaseDbUrl) {
    throw new Error(
      "Refusing to run the walking-skeleton integration test: WF_LOCAL_PG_URL equals SUPABASE_DB_URL (CON-012)."
    );
  }
}

describe.skipIf(!LOCAL_PG_URL)("walking skeleton against a real local disposable Postgres (TASK-055)", () => {
  let seedClientHandle: Awaited<ReturnType<typeof connectPgQueryClient>>;
  let seedClient: QueryClient;

  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const ownerUserId = randomUUID();
  const memberUserId = randomUUID();
  const tenantBOwnerUserId = randomUUID();

  const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());

  beforeAll(async () => {
    if (!LOCAL_PG_URL) {
      return;
    }
    assertNeverPointsAtSupabase(LOCAL_PG_URL);
    seedClientHandle = await connectPgQueryClient({ connectionString: LOCAL_PG_URL });
    seedClient = seedClientHandle;

    await seedClient.query("insert into auth.users (id) values ($1), ($2), ($3)", [
      ownerUserId,
      memberUserId,
      tenantBOwnerUserId
    ]);
    await seedClient.query("insert into wfpc.tenants (id, name, slug) values ($1, $2, $3)", [
      tenantAId,
      "Acme Advisory",
      `acme-advisory-${tenantAId}`
    ]);
    await seedClient.query("insert into wfpc.tenants (id, name, slug) values ($1, $2, $3)", [
      tenantBId,
      "Beta Studio",
      `beta-studio-${tenantBId}`
    ]);
    await seedClient.query(
      "insert into wfpc.tenant_memberships (tenant_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'member')",
      [tenantAId, ownerUserId, memberUserId]
    );
    await seedClient.query("insert into wfpc.tenant_memberships (tenant_id, user_id, role) values ($1, $2, 'owner')", [
      tenantBId,
      tenantBOwnerUserId
    ]);

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
        JSON.stringify({ note: "walking-skeleton test seed" }),
        blueprint.source?.contentHash ?? "sha256:0000000000000000000000000000000000000000000000000000000000000"
      ]
    );
  });

  afterAll(async () => {
    if (seedClientHandle) {
      await seedClientHandle.close();
    }
  });

  it("mints a real HMAC session token and authenticates a real tenant owner", () => {
    const token = createRuntimeSessionToken({
      signingKey: SESSION_ENV.signingKey,
      issuer: SESSION_ENV.issuer,
      audience: SESSION_ENV.audience,
      session: { tenantId: tenantAId, userId: ownerUserId, role: "operator" },
      expiresAt: new Date(Date.now() + 60_000)
    });

    const claims = verifyRuntimeSessionToken({
      token,
      signingKey: SESSION_ENV.signingKey,
      issuer: SESSION_ENV.issuer,
      audience: SESSION_ENV.audience
    });

    expect(claims?.tenantId).toBe(tenantAId);
    expect(claims?.userId).toBe(ownerUserId);
  });

  it("installs the connect-first package for the real tenant, persisted to Postgres, gated by owner/admin RBAC", async () => {
    const installRepository = createPostgresFactoryPackageInstallRepository(seedClient);

    const memberActor: TenantPackageInstallActor = { userId: memberUserId, tenantId: tenantAId, role: "member" };
    await expect(
      installBlueprintPackageForTenant({
        actor: memberActor,
        blueprint,
        packageKey: blueprint.key,
        installId: `install_${randomUUID()}`,
        installedAt: new Date().toISOString(),
        repository: installRepository
      })
    ).rejects.toThrow("Only tenant owners and admins can install blueprint packages");

    const ownerActor: TenantPackageInstallActor = { userId: ownerUserId, tenantId: tenantAId, role: "owner" };
    const installId = `install_${randomUUID()}`;
    const install = await installBlueprintPackageForTenant({
      actor: ownerActor,
      blueprint,
      packageKey: blueprint.key,
      installId,
      installedAt: new Date().toISOString(),
      repository: installRepository
    });

    expect(install.status).toBe("enabled");

    const persisted = await installRepository.findInstallById({ tenantId: tenantAId, installId });
    expect(persisted?.installId).toBe(installId);
    expect(persisted?.tenantId).toBe(tenantAId);
    expect(persisted?.packageVersionId).toBe(blueprint.packageVersionId);

    const events = await installRepository.listEventsForInstall({ tenantId: tenantAId, installId });
    expect(events).toHaveLength(1);
    expect(events[0]?.eventAction).toBe("package_installed");

    await createDurableAuditSink(seedClient)({
      tenantId: tenantAId,
      actorUserId: ownerUserId,
      eventType: "factory.package.installed",
      entityType: "factory_blueprint_package_install",
      entityId: installId,
      metadata: { packageKey: blueprint.key }
    });

    const auditRows = await seedClient.query(
      "select event_type from wfpc.audit_events where tenant_id = $1 and event_type = 'factory.package.installed'",
      [tenantAId]
    );
    expect(auditRows.rows.length).toBeGreaterThan(0);

    (globalThis as { __wf_skeleton_install_id?: string }).__wf_skeleton_install_id = installId;
  });

  it("runs the positioning station through the deterministic stub provider and persists a deliverable retrievable after logout", async () => {
    const installId = (globalThis as { __wf_skeleton_install_id?: string }).__wf_skeleton_install_id;
    if (!installId) {
      throw new Error("install id was not seeded by the previous test");
    }

    const workspace = createWorkspace({
      id: tenantAId,
      name: "Acme Advisory",
      slug: `acme-advisory-${tenantAId}`,
      createdAt: new Date().toISOString()
    });
    const installRepository = createPostgresFactoryPackageInstallRepository(seedClient);
    const installRow = await installRepository.findInstallById({ tenantId: tenantAId, installId });
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
    const intakeRun = startIntakeRun({
      id: runId,
      workspace,
      packageInstall,
      blueprint,
      startedAt: new Date().toISOString()
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
      completedAt: new Date().toISOString()
    });
    const analysisRun = startPositioningAnalysisStation({
      run: intakeCompletion.run,
      workspace,
      packageInstall,
      blueprint
    });

    const stubProvider = createStubLLMProvider();
    const analysisCompletion = await completePositioningAnalysisWithProvider({
      run: analysisRun,
      workspace,
      packageInstall,
      blueprint,
      founderProfile: intakeCompletion.deliverable,
      requestedAt: new Date().toISOString(),
      provider: stubProvider,
      providerModel: "stub-deterministic-v1",
      // Deliberately not a real secret: DEC-040/AC5 bars real provider credentials from the crew.
      providerSecret: "no-real-secret-the-stub-never-uses-this"
    });

    const deliverableRepository = createPostgresFactoryRunDeliverableRepository(seedClient);
    await deliverableRepository.save({
      deliverableId: analysisCompletion.deliverable.id,
      tenantId: tenantAId,
      runId,
      packageInstallId: installId,
      stationKey: analysisCompletion.deliverable.stationKey,
      kind: analysisCompletion.deliverable.kind,
      title: analysisCompletion.deliverable.title,
      body: analysisCompletion.deliverable.body
    });

    // "Viewable after logout": open a brand-new connection and mint a brand-new
    // session token, simulating a fresh browser session after the first one ended.
    const freshConnection = await connectPgQueryClient({ connectionString: LOCAL_PG_URL! });
    try {
      const freshToken = createRuntimeSessionToken({
        signingKey: SESSION_ENV.signingKey,
        issuer: SESSION_ENV.issuer,
        audience: SESSION_ENV.audience,
        session: { tenantId: tenantAId, userId: ownerUserId, role: "operator" },
        expiresAt: new Date(Date.now() + 60_000)
      });
      const freshClaims = verifyRuntimeSessionToken({
        token: freshToken,
        signingKey: SESSION_ENV.signingKey,
        issuer: SESSION_ENV.issuer,
        audience: SESSION_ENV.audience
      });
      expect(freshClaims?.tenantId).toBe(tenantAId);

      const freshDeliverableRepository = createPostgresFactoryRunDeliverableRepository(freshConnection);
      const reloaded = await freshDeliverableRepository.findById({
        tenantId: tenantAId,
        deliverableId: analysisCompletion.deliverable.id
      });

      expect(reloaded?.title).toBe("Positioning Brief");
      expect(reloaded?.body.positioningSummary).toBe(analysisCompletion.deliverable.body.positioningSummary);
      expect(String(reloaded?.body.positioningSummary)).toMatch(/^\[stub:[0-9a-f]{16}\] /);
    } finally {
      await freshConnection.close();
    }

    (globalThis as { __wf_skeleton_deliverable_id?: string }).__wf_skeleton_deliverable_id =
      analysisCompletion.deliverable.id;
  });

  it("AC3: a second tenant provably cannot read the first tenant's install row, shown falsifiable", async () => {
    const installId = (globalThis as { __wf_skeleton_install_id?: string }).__wf_skeleton_install_id;
    if (!installId) {
      throw new Error("install id was not seeded by a previous test");
    }
    const installRepository = createPostgresFactoryPackageInstallRepository(seedClient);

    // GREEN: the app-layer tenant_id guard denies tenant B's repository read.
    const deniedRead = await installRepository.findInstallById({ tenantId: tenantBId, installId });
    expect(deniedRead).toBeNull();

    // Sanity: the same row IS visible to tenant A, so the denial above is
    // about tenant scoping, not a missing row.
    const ownRead = await installRepository.findInstallById({ tenantId: tenantAId, installId });
    expect(ownRead).not.toBeNull();

    // FALSIFIABLE RED: a raw query against the same table with no tenant_id
    // predicate proves tenant A's row is not hidden by anything but that
    // predicate -- removing the guard exposes cross-tenant data.
    const unguardedRead = await seedClient.query(
      "select tenant_id from wfpc.factory_blueprint_package_installs where install_id = $1",
      [installId]
    );
    expect(unguardedRead.rows).toHaveLength(1);
    expect((unguardedRead.rows[0] as { tenant_id: string }).tenant_id).toBe(tenantAId);
  });

  it("AC3: a second tenant provably cannot read the first tenant's deliverable row, shown falsifiable", async () => {
    const deliverableId = (globalThis as { __wf_skeleton_deliverable_id?: string }).__wf_skeleton_deliverable_id;
    if (!deliverableId) {
      throw new Error("deliverable id was not seeded by a previous test");
    }
    const deliverableRepository = createPostgresFactoryRunDeliverableRepository(seedClient);

    const deniedRead = await deliverableRepository.findById({ tenantId: tenantBId, deliverableId });
    expect(deniedRead).toBeNull();

    const ownRead = await deliverableRepository.findById({ tenantId: tenantAId, deliverableId });
    expect(ownRead).not.toBeNull();

    const unguardedRead = await seedClient.query(
      "select tenant_id from wfpc.factory_run_deliverables where deliverable_id = $1",
      [deliverableId]
    );
    expect(unguardedRead.rows).toHaveLength(1);
    expect((unguardedRead.rows[0] as { tenant_id: string }).tenant_id).toBe(tenantAId);
  });
});
