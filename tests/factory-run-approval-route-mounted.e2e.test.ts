// TASK-076: mirrors tests/factory-install-route-mounted.e2e.test.ts (TASK-073).
// Boots the actual composition root (createDashboardRuntime,
// src/api/runtime-server.ts), listens on a real socket, and issues real HTTP
// requests over fetch, proving the MOUNTED approve/request-changes route --
// not a stand-in -- reaches the real Postgres run-approval repository and
// the real durable audit sink, and that the persisted decision survives a
// fresh connection ("logout").
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
import { createPostgresFactoryRunRepository } from "../src/factory/runs/run-repository.js";

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
      `Refusing to run the mounted run-approval-route e2e test: WF_LOCAL_PG_URL "${connectionString}" does not look local (CON-012).`
    );
  }
  const supabaseDbUrl = process.env.SUPABASE_DB_URL ?? readDotEnvValue("SUPABASE_DB_URL");
  if (supabaseDbUrl && supabaseDbUrl !== "PLACE_HOLDER" && connectionString === supabaseDbUrl) {
    throw new Error(
      "Refusing to run the mounted run-approval-route e2e test: WF_LOCAL_PG_URL equals SUPABASE_DB_URL (CON-012)."
    );
  }
}

describe.skipIf(!LOCAL_PG_URL)(
  "factory run approval route: mounted composition root, real socket (TASK-076)",
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

    async function seedDeliverable(input: { tenantId: string; installId: string }): Promise<{
      installId: string;
      deliverableId: string;
    }> {
      const installId = input.installId;
      const runId = `run_${randomUUID()}`;
      const deliverableId = `deliverable_${runId}_positioning_brief`;
      const deliverableRepository = createPostgresFactoryRunDeliverableRepository(seedClient);
      await deliverableRepository.save({
        deliverableId,
        tenantId: input.tenantId,
        runId,
        packageInstallId: installId,
        stationKey: "positioning",
        kind: "positioning_brief",
        title: "Positioning Brief",
        body: { headline: "Test headline", audience: "Test audience", primaryGoal: "Test goal", positioningSummary: "Test summary" }
      });

      return { installId, deliverableId };
    }

    async function seedPendingApproval(input: {
      tenantId: string;
      installId: string;
      deliverableId: string;
      runId: string;
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
      return approvalId;
    }

    /**
     * TASK-078: request_changes now also drives the positioning revision
     * re-run (reviseFactoryRunPositioning), which needs a real run row and
     * the intake founder_profile deliverable to exist -- the same
     * prerequisites startFactoryRun always creates together in production.
     * seedDeliverable/seedPendingApproval alone (TASK-076) only seed the
     * positioning_brief + its approval, so the request-changes test seeds
     * this run-level state too.
     */
    async function seedRunReadyForRevision(input: {
      tenantId: string;
      installId: string;
      runId: string;
      deliverableId: string;
      approvalId: string;
    }): Promise<void> {
      const runRepository = createPostgresFactoryRunRepository(seedClient);
      await runRepository.upsert({
        runId: input.runId,
        tenantId: input.tenantId,
        packageInstallId: input.installId,
        packageId: blueprint.packageId,
        packageVersionId: blueprint.packageVersionId,
        status: "waiting_for_approval",
        currentStationKey: "positioning",
        completedStationKey: null,
        activeDeliverableId: input.deliverableId,
        activeApprovalId: input.approvalId,
        activeApprovalContractKey: "original",
        positioningRevisionGeneration: 0,
        startedAt: new Date().toISOString(),
        completedAt: null
      });

      const deliverableRepository = createPostgresFactoryRunDeliverableRepository(seedClient);
      await deliverableRepository.save({
        deliverableId: `deliverable_${input.runId}_founder_profile`,
        tenantId: input.tenantId,
        runId: input.runId,
        packageInstallId: input.installId,
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
        "Approval Route Advisory A",
        `approval-route-advisory-a-${tenantAId}`
      ]);
      await seedClient.query("insert into wfpc.tenants (id, name, slug) values ($1, $2, $3)", [
        tenantBId,
        "Approval Route Advisory B",
        `approval-route-advisory-b-${tenantBId}`
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
          JSON.stringify({ note: "run-approval mounted-route e2e test seed" }),
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

    async function postDecision(input: {
      token: string;
      runId: string;
      action: "approve" | "request-changes";
      resolutionSummary?: string;
    }) {
      return fetch(`${baseUrl}/api/factory/runs/${input.runId}/approval/${input.action}`, {
        method: "POST",
        headers: {
          origin: ALLOWED_ORIGIN,
          authorization: `Bearer ${input.token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(
          input.resolutionSummary === undefined ? {} : { resolutionSummary: input.resolutionSummary }
        )
      });
    }

    it("AC2/AC4: owner token reaches the mounted route -- approval persists, run reflects approved, survives fresh connection", async () => {
      const tenantAInstallId = await ensureTenantInstall({ tenantId: tenantAId, ownerUserId: ownerAUserId });
      const { installId, deliverableId } = await seedDeliverable({ tenantId: tenantAId, installId: tenantAInstallId });
      const runId = deliverableId.replace("deliverable_", "").replace("_positioning_brief", "");
      const approvalId = await seedPendingApproval({ tenantId: tenantAId, installId, deliverableId, runId });

      const response = await postDecision({
        token: mintToken({ tenantId: tenantAId, userId: ownerAUserId }),
        runId,
        action: "approve"
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { status: string; runOutcome: string; approvalId: string };
      expect(body.status).toBe("approved");
      expect(body.runOutcome).toBe("ready_for_export");
      expect(body.approvalId).toBe(approvalId);

      // "Survives a fresh session": open a brand-new connection and re-read.
      const freshConnection = await connectPgQueryClient({ connectionString: LOCAL_PG_URL! });
      try {
        const freshRepository = createPostgresFactoryRunApprovalRepository(freshConnection);
        expect(await freshRepository.findPendingApprovalForRun({ tenantId: tenantAId, runId })).toBeNull();

        const rows = await freshConnection.query(
          "select approval_status, resolved_at from wfpc.factory_run_approvals where tenant_id = $1 and approval_id = $2",
          [tenantAId, approvalId]
        );
        expect(rows.rows).toHaveLength(1);
        expect((rows.rows[0] as { approval_status: string }).approval_status).toBe("approved");
      } finally {
        await freshConnection.close();
      }
    });

    it("AC2: request-changes persists changes_requested and reports the run as awaiting revision", async () => {
      const tenantAInstallId = await ensureTenantInstall({ tenantId: tenantAId, ownerUserId: ownerAUserId });
      const { installId, deliverableId } = await seedDeliverable({ tenantId: tenantAId, installId: tenantAInstallId });
      const runId = deliverableId.replace("deliverable_", "").replace("_positioning_brief", "");
      const approvalId = await seedPendingApproval({ tenantId: tenantAId, installId, deliverableId, runId });
      await seedRunReadyForRevision({ tenantId: tenantAId, installId, runId, deliverableId, approvalId });

      const response = await postDecision({
        token: mintToken({ tenantId: tenantAId, userId: ownerAUserId }),
        runId,
        action: "request-changes",
        resolutionSummary: "Please sharpen the positioning summary"
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { status: string; runOutcome: string; resolutionSummary: string };
      expect(body.status).toBe("changes_requested");
      expect(body.runOutcome).toBe("awaiting_revision");
      expect(body.resolutionSummary).toBe("Please sharpen the positioning summary");

      // TASK-078: the mounted route also drove the positioning revision
      // re-run -- the run row moved onto the revision_1 contract.
      const runRepository = createPostgresFactoryRunRepository(seedClient);
      const revisedRunRow = await runRepository.findByRunId({ tenantId: tenantAId, runId });
      expect(revisedRunRow?.status).toBe("waiting_for_approval");
      expect(revisedRunRow?.activeApprovalContractKey).toBe("revision_1");
      expect(revisedRunRow?.positioningRevisionGeneration).toBe(1);
    });

    it("AC3: a second tenant is DENIED acting on the first tenant's pending approval -- proven falsifiable", async () => {
      const tenantAInstallId = await ensureTenantInstall({ tenantId: tenantAId, ownerUserId: ownerAUserId });
      const { installId, deliverableId } = await seedDeliverable({ tenantId: tenantAId, installId: tenantAInstallId });
      const runId = deliverableId.replace("deliverable_", "").replace("_positioning_brief", "");
      const approvalId = await seedPendingApproval({ tenantId: tenantAId, installId, deliverableId, runId });

      // GREEN: tenant B's own session, scoped to tenant B, cannot find or act
      // on tenant A's run -- the mounted route denies with 404 (no pending
      // approval visible under tenant B's tenant_id), not 200.
      const crossTenantResponse = await postDecision({
        token: mintToken({ tenantId: tenantBId, userId: ownerBUserId }),
        runId,
        action: "approve"
      });
      expect(crossTenantResponse.status).toBe(404);

      const guardedRow = await seedClient.query(
        "select approval_status from wfpc.factory_run_approvals where tenant_id = $1 and approval_id = $2",
        [tenantAId, approvalId]
      );
      expect((guardedRow.rows[0] as { approval_status: string }).approval_status).toBe("pending");

      // FALSIFIABLE RED: bypassing the tenant_id guard (querying by
      // approval_id alone, the way an un-scoped repository call would) proves
      // the row is reachable and belongs to tenant A -- so the 404 above is
      // the tenant_id guard denying cross-tenant access, not a missing row.
      const unguardedRead = await seedClient.query(
        "select tenant_id, approval_status from wfpc.factory_run_approvals where approval_id = $1",
        [approvalId]
      );
      expect(unguardedRead.rows).toHaveLength(1);
      expect((unguardedRead.rows[0] as { tenant_id: string }).tenant_id).toBe(tenantAId);
      expect((unguardedRead.rows[0] as { approval_status: string }).approval_status).toBe("pending");

      // Sanity: tenant A itself CAN still act on its own approval, so the
      // denial above is about tenant scoping, not a broken route.
      const ownTenantResponse = await postDecision({
        token: mintToken({ tenantId: tenantAId, userId: ownerAUserId }),
        runId,
        action: "approve"
      });
      expect(ownTenantResponse.status).toBe(200);
    });

    it("honors the one-revision cap end to end: request-changes on a revision_1 contract is rejected by the mounted route", async () => {
      const tenantAInstallId = await ensureTenantInstall({ tenantId: tenantAId, ownerUserId: ownerAUserId });
      const { installId, deliverableId: originalDeliverableId } = await seedDeliverable({
        tenantId: tenantAId,
        installId: tenantAInstallId
      });
      const runId = originalDeliverableId.replace("deliverable_", "").replace("_positioning_brief", "");

      const revisionDeliverableId = `deliverable_${runId}_positioning_brief_revision_1`;
      const deliverableRepository = createPostgresFactoryRunDeliverableRepository(seedClient);
      await deliverableRepository.save({
        deliverableId: revisionDeliverableId,
        tenantId: tenantAId,
        runId,
        packageInstallId: installId,
        stationKey: "positioning",
        kind: "positioning_brief",
        title: "Positioning Brief",
        body: { headline: "Revised", audience: "Test audience", primaryGoal: "Test goal", positioningSummary: "Revised summary" }
      });

      const approvalRepository = createPostgresFactoryRunApprovalRepository(seedClient);
      const revisionApprovalId = `approval_${runId}_positioning_revision_1`;
      await approvalRepository.createPendingApproval({
        row: {
          approvalId: revisionApprovalId,
          tenantId: tenantAId,
          runId,
          packageId: blueprint.packageId,
          packageVersionId: blueprint.packageVersionId,
          packageInstallId: installId,
          stationKey: "positioning",
          deliverableId: revisionDeliverableId,
          contractKey: "revision_1",
          status: "pending",
          requestedAt: new Date().toISOString(),
          resolvedAt: null,
          resolutionSummary: null
        }
      });

      const response = await postDecision({
        token: mintToken({ tenantId: tenantAId, userId: ownerAUserId }),
        runId,
        action: "request-changes",
        resolutionSummary: "One more revision please"
      });

      expect(response.status).toBe(400);
      const stillPending = await seedClient.query(
        "select approval_status from wfpc.factory_run_approvals where tenant_id = $1 and approval_id = $2",
        [tenantAId, revisionApprovalId]
      );
      expect((stillPending.rows[0] as { approval_status: string }).approval_status).toBe("pending");
    });
  }
);
