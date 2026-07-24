// TASK-073: closes TASK-069 finding F1 -- there was no production
// construction site for the install RBAC+audit route, so real HTTP traffic
// never reached the wired path. TASK-069 proved the route by hand-building
// the handler and calling it as a function; THIS test boots the actual
// composition root (createDashboardRuntime, src/api/runtime-server.ts),
// listens on a real socket, and issues real HTTP requests over fetch,
// proving the MOUNTED route -- not a stand-in -- reaches the real Postgres
// role resolver, the real install repository, and the real durable audit
// sink.
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

const LOCAL_PG_URL = process.env.WF_LOCAL_PG_URL;
const SESSION_ENV = {
  signingKey: "test-only-signing-key-not-a-real-secret-value",
  sessionCookieName: "wf_portal_session",
  issuer: "wealth-factory-runtime",
  audience: "wealth-factory-portal"
};
const ALLOWED_ORIGIN = "https://portal.wealthfactory.test";
const TEST_VAULT_MASTER_KEY = "test-only-vault-master-key-not-a-real-secret";
const PACKAGE_KEY = "local-service-launch";

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
      `Refusing to run the mounted install-route e2e test: WF_LOCAL_PG_URL "${connectionString}" does not look local (CON-012).`
    );
  }
  const supabaseDbUrl = process.env.SUPABASE_DB_URL ?? readDotEnvValue("SUPABASE_DB_URL");
  if (supabaseDbUrl && supabaseDbUrl !== "PLACE_HOLDER" && connectionString === supabaseDbUrl) {
    throw new Error(
      "Refusing to run the mounted install-route e2e test: WF_LOCAL_PG_URL equals SUPABASE_DB_URL (CON-012)."
    );
  }
}

describe.skipIf(!LOCAL_PG_URL)("factory package install route: mounted composition root, real socket (TASK-073)", () => {
  let seedClientHandle: Awaited<ReturnType<typeof connectPgQueryClient>>;
  let seedClient: QueryClient;
  let runtime: ReturnType<typeof createDashboardRuntime>;
  let baseUrl: string;

  const tenantId = randomUUID();
  const ownerUserId = randomUUID();
  const memberUserId = randomUUID();

  const blueprintManifestJson = JSON.parse(
    readFileSync(new URL("../demo-packages/local-service-launch/manifest.json", import.meta.url), "utf8")
  );
  const blueprint = loadBlueprintPackageManifest(blueprintManifestJson);

  beforeAll(async () => {
    if (!LOCAL_PG_URL) {
      return;
    }
    assertNeverPointsAtSupabase(LOCAL_PG_URL);
    seedClientHandle = await connectPgQueryClient({ connectionString: LOCAL_PG_URL });
    seedClient = seedClientHandle;

    await seedClient.query("insert into auth.users (id) values ($1), ($2)", [ownerUserId, memberUserId]);
    await seedClient.query("insert into wfpc.tenants (id, name, slug) values ($1, $2, $3)", [
      tenantId,
      "Mounted Route Advisory",
      `mounted-route-advisory-${tenantId}`
    ]);
    await seedClient.query(
      "insert into wfpc.tenant_memberships (tenant_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'member')",
      [tenantId, ownerUserId, memberUserId]
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
        JSON.stringify({ note: "mounted install-route e2e test seed" }),
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

  function mintToken(input: { userId: string; role: "member" | "operator" }): string {
    return createRuntimeSessionToken({
      signingKey: SESSION_ENV.signingKey,
      issuer: SESSION_ENV.issuer,
      audience: SESSION_ENV.audience,
      session: { tenantId, userId: input.userId, role: input.role },
      expiresAt: new Date(Date.now() + 60_000)
    });
  }

  async function postInstall(input: { token: string; installId: string }) {
    return fetch(`${baseUrl}/api/factory/package-installs`, {
      method: "POST",
      headers: {
        origin: ALLOWED_ORIGIN,
        authorization: `Bearer ${input.token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        packageKey: PACKAGE_KEY,
        installId: input.installId,
        installedAt: new Date().toISOString()
      })
    });
  }

  async function countAuditEventsForInstall(installId: string): Promise<number> {
    const result = await seedClient.query(
      `select count(*)::int as count
       from wfpc.audit_events
       where tenant_id = $1 and event_type = 'factory.package.installed' and metadata->>'externalEntityId' = $2`,
      [tenantId, installId]
    );
    return Number((result.rows[0] as { count: number }).count);
  }

  async function countInstallRows(installId: string): Promise<number> {
    const result = await seedClient.query(
      "select count(*)::int as count from wfpc.factory_blueprint_package_installs where tenant_id = $1 and install_id = $2",
      [tenantId, installId]
    );
    return Number((result.rows[0] as { count: number }).count);
  }

  it("AC2: owner token reaches the mounted route -- 201, install row persisted, one real audit_events row", async () => {
    const installId = `install_${randomUUID()}`;
    const response = await postInstall({ token: mintToken({ userId: ownerUserId, role: "member" }), installId });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe("enabled");

    expect(await countInstallRows(installId)).toBe(1);

    const auditRows = await seedClient.query(
      `select event_type, actor_user_id, metadata
       from wfpc.audit_events
       where tenant_id = $1 and metadata->>'externalEntityId' = $2`,
      [tenantId, installId]
    );
    expect(auditRows.rows).toHaveLength(1);
    const auditRow = auditRows.rows[0] as {
      event_type: string;
      actor_user_id: string;
      metadata: { packageKey: string; externalEntityId: string };
    };
    expect(auditRow.event_type).toBe("factory.package.installed");
    expect(auditRow.actor_user_id).toBe(ownerUserId);
    expect(auditRow.metadata.packageKey).toBe(PACKAGE_KEY);
  });

  it("AC2: member token is DENIED by the mounted route -- 403, zero install rows, zero audit rows", async () => {
    const installId = `install_${randomUUID()}`;
    const response = await postInstall({ token: mintToken({ userId: memberUserId, role: "member" }), installId });

    expect(response.status).toBe(403);
    expect(await countInstallRows(installId)).toBe(0);
    expect(await countAuditEventsForInstall(installId)).toBe(0);
  });

  it("AC2: session.role is never trusted through the mounted server -- member token minted with session.role='operator' is still DENIED", async () => {
    const installId = `install_${randomUUID()}`;
    const response = await postInstall({
      token: mintToken({ userId: memberUserId, role: "operator" }),
      installId
    });

    expect(response.status).toBe(403);
    expect(await countInstallRows(installId)).toBe(0);
    expect(await countAuditEventsForInstall(installId)).toBe(0);
  });
});
