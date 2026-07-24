// TASK-079: mirrors tests/factory-run-approval-route-mounted.e2e.test.ts
// (TASK-076) and tests/factory-install-route-mounted.e2e.test.ts (TASK-073).
// Boots the actual composition root (createDashboardRuntime,
// src/api/runtime-server.ts), listens on a real socket, and issues real HTTP
// requests over fetch, proving the MOUNTED export route -- not a stand-in --
// reaches the real Postgres deliverable and run-approval repositories, gates
// on approval, and survives a fresh connection.
//
// Gated on WF_LOCAL_PG_URL so it is skipped whenever the disposable DB is
// not running, and it refuses to run at all if the target looks like the
// real Supabase host (CON-012 / DEC-040).
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectPgQueryClient } from "../src/db/postgres-client.js";
import type { QueryClient } from "../src/db/supabase-repositories.js";
import { createRuntimeSessionAuth, createRuntimeSessionToken } from "../src/api/runtime-auth.js";
import { createDashboardRuntime, type RuntimeEnv } from "../src/api/runtime-server.js";
import { loadBlueprintPackageManifest } from "../src/factory/packages/package-manifest-loader.js";
import { createPostgresFactoryPackageInstallRepository } from "../src/factory/packages/package-install-repository.js";
import { installBlueprintPackageForTenant } from "../src/factory/packages/package-install-application-service.js";
import type { TenantPackageInstallActor } from "../src/factory/packages/package-install-application-service.js";
import { createPostgresFactoryRunDeliverableRepository } from "../src/factory/runs/deliverable-repository.js";
import { createPostgresFactoryRunApprovalRepository } from "../src/factory/runs/run-approval-repository.js";

const LOCAL_PG_URL = process.env.WF_LOCAL_PG_URL;
const SESSION_ENV = {
  signingKey: "test-only-signing-key-not-a-real-secret-value",
  sessionCookieName: "wf_portal_session",
  issuer: "wealth-factory-runtime",
  audience: "wealth-factory-portal"
};
const ALLOWED_ORIGIN = "https://portal.wealthfactory.test";
const TEST_VAULT_MASTER_KEY = "test-only-vault-master-key-not-a-real-secret";

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
      `Refusing to run the mounted run-export-route e2e test: WF_LOCAL_PG_URL "${connectionString}" does not look local (CON-012).`
    );
  }
  const supabaseDbUrl = process.env.SUPABASE_DB_URL ?? readDotEnvValue("SUPABASE_DB_URL");
  if (supabaseDbUrl && supabaseDbUrl !== "PLACE_HOLDER" && connectionString === supabaseDbUrl) {
    throw new Error(
      "Refusing to run the mounted run-export-route e2e test: WF_LOCAL_PG_URL equals SUPABASE_DB_URL (CON-012)."
    );
  }
}

describe.skipIf(!LOCAL_PG_URL)(
  "factory run export route: mounted composition root, real socket (TASK-079)",
  () => {
    let seedClientHandle: Awaited<ReturnType<typeof connectPgQueryClient>>;
    let seedClient: QueryClient;
    let runtime: ReturnType<typeof createDashboardRuntime>;
    let baseUrl: string;

    const tenantAId = randomUUID();
    const tenantBId = randomUUID();
    const ownerAUserId = randomUUID();
    const ownerBUserId = randomUUID();

    const blueprintManifestJson = JSON.parse(
      readFileSync(new URL("../demo-packages/local-service-launch/manifest.json", import.meta.url), "utf8")
    );
    const blueprint = loadBlueprintPackageManifest(blueprintManifestJson);

    const installIdByTenant = new Map<string, string>();

    async function ensureTenantInstall(input: { tenantId: string; ownerUserId: string }): Promise<string> {
      const existing = installIdByTenant.get(input.tenantId);
      if (existing) {
        return existing;
      }
      const installRepository = createPostgresFactoryPackageInstallRepository(seedClient);
      const actor: TenantPackageInstallActor = { userId: input.ownerUserId, tenantId: input.tenantId, role: "owner" };
      const installId = `install_${randomUUID()}`;
      await installBlueprintPackageForTenant({
        actor,
        blueprint,
        packageKey: blueprint.key,
        installId,
        installedAt: new Date().toISOString(),
        repository: installRepository
      });
      installIdByTenant.set(input.tenantId, installId);
      return installId;
    }

    async function seedRunDeliverables(input: { tenantId: string; installId: string }): Promise<{
      runId: string;
      installId: string;
      founderProfileDeliverableId: string;
      positioningDeliverableId: string;
    }> {
      const installId = input.installId;
      const runId = `run_${randomUUID()}`;
      const deliverableRepository = createPostgresFactoryRunDeliverableRepository(seedClient);

      const founderProfileDeliverableId = `deliverable_${runId}_founder_profile`;
      await deliverableRepository.save({
        deliverableId: founderProfileDeliverableId,
        tenantId: input.tenantId,
        runId,
        packageInstallId: installId,
        stationKey: "intake",
        kind: "founder_profile",
        title: "Founder Profile",
        body: {
          founderName: "Test Founder",
          businessName: "Test Business",
          primaryGoal: "Test goal",
          targetAudience: "Test audience",
          summary: "Test summary"
        }
      });

      const positioningDeliverableId = `deliverable_${runId}_positioning_brief`;
      await deliverableRepository.save({
        deliverableId: positioningDeliverableId,
        tenantId: input.tenantId,
        runId,
        packageInstallId: installId,
        stationKey: "positioning",
        kind: "positioning_brief",
        title: "Positioning Brief",
        body: { headline: "Test headline", audience: "Test audience", primaryGoal: "Test goal", positioningSummary: "Test summary" }
      });

      return { runId, installId, founderProfileDeliverableId, positioningDeliverableId };
    }

    async function seedApprovedApproval(input: {
      tenantId: string;
      installId: string;
      runId: string;
      deliverableId: string;
    }): Promise<string> {
      const approvalRepository = createPostgresFactoryRunApprovalRepository(seedClient);
      const approvalId = `approval_${input.runId}_positioning`;
      await approvalRepository.createPendingApproval({
        row: {
          approvalId,
          tenantId: input.tenantId,
          runId: input.runId,
          packageId: blueprint.packageId,
          packageVersionId: blueprint.packageVersionId,
          packageInstallId: input.installId,
          stationKey: "positioning",
          deliverableId: input.deliverableId,
          contractKey: "original",
          status: "pending",
          requestedAt: new Date().toISOString(),
          resolvedAt: null,
          resolutionSummary: null
        }
      });
      await approvalRepository.applyDecision({
        tenantId: input.tenantId,
        approvalId,
        status: "approved",
        resolvedAt: new Date().toISOString(),
        resolutionSummary: null
      });
      return approvalId;
    }

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
        "Export Route Advisory A",
        `export-route-advisory-a-${tenantAId}`
      ]);
      await seedClient.query("insert into wfpc.tenants (id, name, slug) values ($1, $2, $3)", [
        tenantBId,
        "Export Route Advisory B",
        `export-route-advisory-b-${tenantBId}`
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
          JSON.stringify({ note: "run-export mounted-route e2e test seed" }),
          blueprint.source?.contentHash ?? "sha256:0000000000000000000000000000000000000000000000000000000000000"
        ]
      );

      const env: RuntimeEnv = {
        supabaseDbUrl: LOCAL_PG_URL,
        allowedOrigins: [ALLOWED_ORIGIN],
        apiPort: 0,
        vaultMasterKey: TEST_VAULT_MASTER_KEY,
        runtimeEnv: {}
      };
      runtime = createDashboardRuntime({
        env,
        auth: createRuntimeSessionAuth(SESSION_ENV)
      });

      await new Promise<void>((resolve) => {
        runtime.server.listen(0, "127.0.0.1", resolve);
      });
      const address = runtime.server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
      if (runtime) {
        await new Promise<void>((resolve) => runtime.server.close(() => resolve()));
        await runtime.close();
      }
      if (seedClientHandle) {
        await seedClientHandle.close();
      }
    });

    function mintToken(input: { tenantId: string; userId: string }): string {
      return createRuntimeSessionToken({
        signingKey: SESSION_ENV.signingKey,
        issuer: SESSION_ENV.issuer,
        audience: SESSION_ENV.audience,
        session: { tenantId: input.tenantId, userId: input.userId, role: "member" },
        expiresAt: new Date(Date.now() + 60_000)
      });
    }

    async function getExport(input: { token: string; runId: string }) {
      return fetch(`${baseUrl}/api/factory/runs/${input.runId}/export`, {
        method: "GET",
        headers: {
          origin: ALLOWED_ORIGIN,
          authorization: `Bearer ${input.token}`
        }
      });
    }

    it("AC2/AC3: owner exports an approved run over the mounted route -- downloadable kit with both deliverables, survives a fresh connection", async () => {
      const tenantAInstallId = await ensureTenantInstall({ tenantId: tenantAId, ownerUserId: ownerAUserId });
      const { runId, installId, positioningDeliverableId } = await seedRunDeliverables({
        tenantId: tenantAId,
        installId: tenantAInstallId
      });
      const approvalId = await seedApprovedApproval({
        tenantId: tenantAId,
        installId,
        runId,
        deliverableId: positioningDeliverableId
      });

      const response = await getExport({ token: mintToken({ tenantId: tenantAId, userId: ownerAUserId }), runId });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(response.headers.get("content-disposition")).toContain("attachment");
      expect(response.headers.get("content-disposition")).toContain(runId);

      const kit = (await response.json()) as {
        runId: string;
        packageId: string;
        approvedAt: string;
        deliverables: Array<{ stationKey: string; kind: string; title: string; body: Record<string, unknown> }>;
      };
      expect(kit.runId).toBe(runId);
      expect(kit.packageId).toBe(blueprint.packageId);
      expect(kit.deliverables).toHaveLength(2);
      expect(kit.deliverables[0]?.stationKey).toBe("intake");
      expect(kit.deliverables[0]?.kind).toBe("founder_profile");
      expect(kit.deliverables[1]?.stationKey).toBe("positioning");
      expect(kit.deliverables[1]?.kind).toBe("positioning_brief");

      // "Survives a fresh session": open a brand-new connection and re-read
      // the same rows the mounted route just served.
      const freshConnection = await connectPgQueryClient({ connectionString: LOCAL_PG_URL! });
      try {
        const freshApprovalRepository = createPostgresFactoryRunApprovalRepository(freshConnection);
        const approved = await freshApprovalRepository.findApprovedApprovalForRun({ tenantId: tenantAId, runId });
        expect(approved?.approvalId).toBe(approvalId);

        const freshDeliverableRepository = createPostgresFactoryRunDeliverableRepository(freshConnection);
        const deliverables = await freshDeliverableRepository.listDeliverablesForRun({ tenantId: tenantAId, runId });
        expect(deliverables).toHaveLength(2);
      } finally {
        await freshConnection.close();
      }
    });

    it("AC2: export is refused before the run's approval is decided", async () => {
      const tenantAInstallId = await ensureTenantInstall({ tenantId: tenantAId, ownerUserId: ownerAUserId });
      const { runId, installId, positioningDeliverableId } = await seedRunDeliverables({
        tenantId: tenantAId,
        installId: tenantAInstallId
      });
      const approvalRepository = createPostgresFactoryRunApprovalRepository(seedClient);
      await approvalRepository.createPendingApproval({
        row: {
          approvalId: `approval_${runId}_positioning`,
          tenantId: tenantAId,
          runId,
          packageId: blueprint.packageId,
          packageVersionId: blueprint.packageVersionId,
          packageInstallId: installId,
          stationKey: "positioning",
          deliverableId: positioningDeliverableId,
          contractKey: "original",
          status: "pending",
          requestedAt: new Date().toISOString(),
          resolvedAt: null,
          resolutionSummary: null
        }
      });

      const response = await getExport({ token: mintToken({ tenantId: tenantAId, userId: ownerAUserId }), runId });
      expect(response.status).toBe(404);
      const body = (await response.json()) as { code: string };
      expect(body.code).toBe("not_ready");
    });

    it("AC4: a second tenant is DENIED exporting the first tenant's run -- proven falsifiable", async () => {
      const tenantAInstallId = await ensureTenantInstall({ tenantId: tenantAId, ownerUserId: ownerAUserId });
      const { runId, installId, positioningDeliverableId } = await seedRunDeliverables({
        tenantId: tenantAId,
        installId: tenantAInstallId
      });
      const approvalId = await seedApprovedApproval({
        tenantId: tenantAId,
        installId,
        runId,
        deliverableId: positioningDeliverableId
      });

      // GREEN: tenant B's own session, scoped to tenant B, cannot export
      // tenant A's run -- the mounted route denies with 404 (no approved
      // approval visible under tenant B's tenant_id), not 200.
      const crossTenantResponse = await getExport({
        token: mintToken({ tenantId: tenantBId, userId: ownerBUserId }),
        runId
      });
      expect(crossTenantResponse.status).toBe(404);

      // FALSIFIABLE RED: bypassing the tenant_id guard (querying by run_id
      // alone, the way an un-scoped repository call would) proves the
      // approval and deliverable rows are reachable and belong to tenant A --
      // so the 404 above is the tenant_id guard denying cross-tenant access,
      // not a missing run.
      const unguardedApproval = await seedClient.query(
        "select tenant_id, approval_status from wfpc.factory_run_approvals where approval_id = $1",
        [approvalId]
      );
      expect(unguardedApproval.rows).toHaveLength(1);
      expect((unguardedApproval.rows[0] as { tenant_id: string }).tenant_id).toBe(tenantAId);
      expect((unguardedApproval.rows[0] as { approval_status: string }).approval_status).toBe("approved");

      const unguardedDeliverables = await seedClient.query(
        "select tenant_id from wfpc.factory_run_deliverables where run_id = $1",
        [runId]
      );
      expect(unguardedDeliverables.rows).toHaveLength(2);
      for (const row of unguardedDeliverables.rows) {
        expect((row as { tenant_id: string }).tenant_id).toBe(tenantAId);
      }

      // Sanity: tenant A itself CAN still export its own approved run, so
      // the denial above is about tenant scoping, not a broken route.
      const ownTenantResponse = await getExport({
        token: mintToken({ tenantId: tenantAId, userId: ownerAUserId }),
        runId
      });
      expect(ownTenantResponse.status).toBe(200);
    });
  }
);
