// TASK-084: mirrors tests/factory-run-approval-route-mounted.e2e.test.ts
// (TASK-076) and tests/factory-run-export-route-mounted.e2e.test.ts
// (TASK-079). Boots the actual composition root (createDashboardRuntime,
// src/api/runtime-server.ts), listens on a real socket, and issues real HTTP
// requests over fetch, proving the belt moves as one system: token ->
// POST /api/factory/runs (answers-at-start) -> the driver runs intake and
// positioning on the stub provider -> GET /api/factory/runs/:runId shows the
// run stopped at the approval checkpoint -> the EXISTING approve route
// (TASK-076) yields ready_for_export -> the EXISTING export route
// (TASK-079) serves the kit with both deliverables.
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
      `Refusing to run the mounted run-driver-route e2e test: WF_LOCAL_PG_URL "${connectionString}" does not look local (CON-012).`
    );
  }
  const supabaseDbUrl = process.env.SUPABASE_DB_URL ?? readDotEnvValue("SUPABASE_DB_URL");
  if (supabaseDbUrl && supabaseDbUrl !== "PLACE_HOLDER" && connectionString === supabaseDbUrl) {
    throw new Error(
      "Refusing to run the mounted run-driver-route e2e test: WF_LOCAL_PG_URL equals SUPABASE_DB_URL (CON-012)."
    );
  }
}

describe.skipIf(!LOCAL_PG_URL)(
  "factory run-driver spine: mounted composition root, real socket (TASK-084)",
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
        "Run Driver Route Advisory A",
        `run-driver-route-advisory-a-${tenantAId}`
      ]);
      await seedClient.query("insert into wfpc.tenants (id, name, slug) values ($1, $2, $3)", [
        tenantBId,
        "Run Driver Route Advisory B",
        `run-driver-route-advisory-b-${tenantBId}`
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
          JSON.stringify({ note: "run-driver mounted-route e2e test seed" }),
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

    const answers = {
      founderName: "Avery Stone",
      businessName: "Acme Advisory",
      primaryGoal: "Reach the first ten consulting clients",
      targetAudience: "Solo founders"
    };

    async function postStart(input: { token: string; packageInstallId: string; runId?: string }) {
      return fetch(`${baseUrl}/api/factory/runs`, {
        method: "POST",
        headers: {
          origin: ALLOWED_ORIGIN,
          authorization: `Bearer ${input.token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          packageInstallId: input.packageInstallId,
          answers,
          ...(input.runId ? { runId: input.runId } : {})
        })
      });
    }

    async function getStatus(input: { token: string; runId: string }) {
      return fetch(`${baseUrl}/api/factory/runs/${input.runId}`, {
        method: "GET",
        headers: {
          origin: ALLOWED_ORIGIN,
          authorization: `Bearer ${input.token}`
        }
      });
    }

    it("AC4/AC6: drives the whole belt end to end -- start, status, approve, export", async () => {
      const installId = await ensureTenantInstall({ tenantId: tenantAId, ownerUserId: ownerAUserId });
      const token = mintToken({ tenantId: tenantAId, userId: ownerAUserId });

      const startResponse = await postStart({ token, packageInstallId: installId });
      expect(startResponse.status).toBe(201);
      const started = (await startResponse.json()) as {
        runId: string;
        status: string;
        currentStationKey: string | null;
      };
      expect(started.status).toBe("waiting_for_approval");
      expect(started.currentStationKey).toBe("positioning");

      const statusResponse = await getStatus({ token, runId: started.runId });
      expect(statusResponse.status).toBe(200);
      const status = (await statusResponse.json()) as { status: string; currentStationKey: string | null };
      expect(status.status).toBe("waiting_for_approval");
      expect(status.currentStationKey).toBe("positioning");

      // The existing TASK-076 approve route.
      const approveResponse = await fetch(`${baseUrl}/api/factory/runs/${started.runId}/approval/approve`, {
        method: "POST",
        headers: {
          origin: ALLOWED_ORIGIN,
          authorization: `Bearer ${token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({})
      });
      expect(approveResponse.status).toBe(200);
      const approved = (await approveResponse.json()) as { runOutcome: string };
      expect(approved.runOutcome).toBe("ready_for_export");

      // The existing TASK-079 export route.
      const exportResponse = await fetch(`${baseUrl}/api/factory/runs/${started.runId}/export`, {
        method: "GET",
        headers: {
          origin: ALLOWED_ORIGIN,
          authorization: `Bearer ${token}`
        }
      });
      expect(exportResponse.status).toBe(200);
      const kit = (await exportResponse.json()) as {
        runId: string;
        deliverables: Array<{ stationKey: string; kind: string }>;
      };
      expect(kit.runId).toBe(started.runId);
      expect(kit.deliverables).toHaveLength(2);
      expect(kit.deliverables[0]?.stationKey).toBe("intake");
      expect(kit.deliverables[1]?.stationKey).toBe("positioning");
    });

    it("AC2: re-invoking start with the same runId is idempotent over HTTP -- no duplicate deliverables or approvals", async () => {
      const installId = await ensureTenantInstall({ tenantId: tenantAId, ownerUserId: ownerAUserId });
      const token = mintToken({ tenantId: tenantAId, userId: ownerAUserId });
      const runId = `run_${randomUUID()}`;

      const first = await postStart({ token, packageInstallId: installId, runId });
      expect(first.status).toBe(201);
      const second = await postStart({ token, packageInstallId: installId, runId });
      expect(second.status).toBe(201);

      const firstBody = await first.json();
      const secondBody = await second.json();
      expect(secondBody).toEqual(firstBody);

      const deliverableRows = await seedClient.query(
        "select deliverable_id from wfpc.factory_run_deliverables where tenant_id = $1 and run_id = $2",
        [tenantAId, runId]
      );
      expect(deliverableRows.rows).toHaveLength(2);

      const approvalRows = await seedClient.query(
        "select approval_id from wfpc.factory_run_approvals where tenant_id = $1 and run_id = $2",
        [tenantAId, runId]
      );
      expect(approvalRows.rows).toHaveLength(1);
    });

    it("AC5: a second tenant is DENIED starting a run against, or reading the status of, the first tenant's run -- proven falsifiable", async () => {
      const installId = await ensureTenantInstall({ tenantId: tenantAId, ownerUserId: ownerAUserId });
      const tenantAToken = mintToken({ tenantId: tenantAId, userId: ownerAUserId });
      const tenantBToken = mintToken({ tenantId: tenantBId, userId: ownerBUserId });

      // GREEN: tenant B cannot start a run against tenant A's install --
      // the mounted route denies with 404 (install not visible under
      // tenant B's tenant_id), not 201.
      const crossTenantStart = await postStart({ token: tenantBToken, packageInstallId: installId });
      expect(crossTenantStart.status).toBe(404);

      // FALSIFIABLE RED: bypassing the tenant_id guard (querying by
      // install_id alone) proves the install row is reachable and belongs
      // to tenant A -- so the 404 above is the tenant_id guard denying
      // cross-tenant access, not a missing row.
      const unguardedInstall = await seedClient.query(
        "select tenant_id from wfpc.factory_blueprint_package_installs where install_id = $1",
        [installId]
      );
      expect(unguardedInstall.rows).toHaveLength(1);
      expect((unguardedInstall.rows[0] as { tenant_id: string }).tenant_id).toBe(tenantAId);

      const started = await postStart({ token: tenantAToken, packageInstallId: installId });
      expect(started.status).toBe(201);
      const startedBody = (await started.json()) as { runId: string };

      // GREEN: tenant B cannot read tenant A's run status.
      const crossTenantStatus = await getStatus({ token: tenantBToken, runId: startedBody.runId });
      expect(crossTenantStatus.status).toBe(404);

      // FALSIFIABLE RED: bypassing the tenant_id guard (querying by run_id
      // alone, the way an un-scoped repository call would) proves the run
      // row is reachable and belongs to tenant A.
      const runRepository = createPostgresFactoryRunRepository(seedClient);
      const unguardedRun = await seedClient.query("select tenant_id from wfpc.factory_runs where run_id = $1", [
        startedBody.runId
      ]);
      expect(unguardedRun.rows).toHaveLength(1);
      expect((unguardedRun.rows[0] as { tenant_id: string }).tenant_id).toBe(tenantAId);

      // Sanity: tenant A itself CAN still read its own run status, so the
      // denials above are about tenant scoping, not a broken route.
      const ownRead = await runRepository.findByRunId({ tenantId: tenantAId, runId: startedBody.runId });
      expect(ownRead).not.toBeNull();
      const ownTenantStatus = await getStatus({ token: tenantAToken, runId: startedBody.runId });
      expect(ownTenantStatus.status).toBe(200);
    });
  }
);
