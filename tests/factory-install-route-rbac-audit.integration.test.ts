// TASK-069: proves session-auth -> real tenant-membership role -> install RBAC
// -> persisted audit_events row as ONE wired route path, against the real
// local disposable Postgres. TASK-055 proved auth, RBAC, and audit as three
// disconnected pieces (its test built the actor from a direct tenant_memberships
// lookup and wrote the audit_events row by hand). This test drives the real
// HTTP handler with a Bearer token instead, composing the real runtime session
// auth, a real Postgres-backed role resolver, the real install repository, and
// the real durable audit sink -- and shows session.role is never trusted by
// minting the member's token with the most-privileged session role ("operator")
// and proving the route still denies the install because the DB membership
// role, not the token's role claim, drives the RBAC decision.
//
// Gated on WF_LOCAL_PG_URL so it is skipped whenever the disposable DB is not
// running, and it refuses to run at all if the target looks like the real
// Supabase host (CON-012 / DEC-040).
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectPgQueryClient } from "../src/db/postgres-client.js";
import type { QueryClient } from "../src/db/supabase-repositories.js";
import { createSupabaseRepositories } from "../src/db/supabase-repositories.js";
import { createRuntimeSessionAuth, createRuntimeSessionToken } from "../src/api/runtime-auth.js";
import { createFactoryPackageInstallApi } from "../src/api/factory-package-install-api.js";
import { createFactoryPackageInstallHttpHandler } from "../src/api/factory-package-install-http.js";
import { createPostgresTenantPackageInstallRoleResolver } from "../src/api/factory-package-install-role-resolver.js";
import { createDurableFactoryPackageInstallAuditSink } from "../src/api/factory-package-install-audit.js";
import { loadBlueprintPackageManifest } from "../src/factory/packages/package-manifest-loader.js";
import {
  createPostgresFactoryPackageInstallRepository
} from "../src/factory/packages/package-install-repository.js";
import { allowAllPackageInstallEntitlements } from "../src/factory/packages/package-install-application-service.js";
import { createCurrentSliceManifest } from "./factory-package-manifest-fixtures.js";

const LOCAL_PG_URL = process.env.WF_LOCAL_PG_URL;
const SESSION_ENV = {
  signingKey: "test-only-signing-key-not-a-real-secret-value",
  sessionCookieName: "wf_portal_session",
  issuer: "wealth-factory-runtime",
  audience: "wealth-factory-portal"
};
const ALLOWED_ORIGIN = "https://portal.wealthfactory.test";

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
      `Refusing to run the install-route RBAC/audit integration test: WF_LOCAL_PG_URL "${connectionString}" does not look local (CON-012).`
    );
  }
  const supabaseDbUrl = process.env.SUPABASE_DB_URL ?? readDotEnvValue("SUPABASE_DB_URL");
  if (supabaseDbUrl && supabaseDbUrl !== "PLACE_HOLDER" && connectionString === supabaseDbUrl) {
    throw new Error(
      "Refusing to run the install-route RBAC/audit integration test: WF_LOCAL_PG_URL equals SUPABASE_DB_URL (CON-012)."
    );
  }
}

describe.skipIf(!LOCAL_PG_URL)("factory package install route: token -> RBAC -> persisted audit (TASK-069)", () => {
  let seedClientHandle: Awaited<ReturnType<typeof connectPgQueryClient>>;
  let seedClient: QueryClient;

  const tenantId = randomUUID();
  const ownerUserId = randomUUID();
  const memberUserId = randomUUID();

  const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());

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
      "Route Wiring Advisory",
      `route-wiring-advisory-${tenantId}`
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
        JSON.stringify({ note: "install-route RBAC/audit test seed" }),
        blueprint.source?.contentHash ?? "sha256:0000000000000000000000000000000000000000000000000000000000000"
      ]
    );
  });

  afterAll(async () => {
    if (seedClientHandle) {
      await seedClientHandle.close();
    }
  });

  function createRoute() {
    const runtimeAuth = createRuntimeSessionAuth(SESSION_ENV);
    const supabaseRepositories = createSupabaseRepositories(seedClient);
    const api = createFactoryPackageInstallApi({
      authenticate: runtimeAuth.authenticate,
      requireTenantMember: supabaseRepositories.requireTenantMember,
      resolveTenantPackageInstallRole: createPostgresTenantPackageInstallRoleResolver(seedClient),
      loadBlueprintPackage: async () => blueprint,
      entitlements: allowAllPackageInstallEntitlements,
      repository: createPostgresFactoryPackageInstallRepository(seedClient),
      auditSink: createDurableFactoryPackageInstallAuditSink(seedClient)
    });
    return createFactoryPackageInstallHttpHandler({
      allowedOrigins: [ALLOWED_ORIGIN],
      packageInstallApi: api,
      rateLimiter: { consume: async () => ({ allowed: true, remaining: 9, resetAt: Date.now() + 1000 }) }
    });
  }

  function mintToken(input: { userId: string; role: "member" | "operator" }): string {
    return createRuntimeSessionToken({
      signingKey: SESSION_ENV.signingKey,
      issuer: SESSION_ENV.issuer,
      audience: SESSION_ENV.audience,
      session: { tenantId, userId: input.userId, role: input.role },
      expiresAt: new Date(Date.now() + 60_000)
    });
  }

  // installId ("install_<uuid>") is not itself a valid Postgres uuid, so
  // createDurableAuditSink (src/audit/durable-audit.ts) stores it in
  // metadata.externalEntityId rather than the entity_id column -- match on
  // that, not entity_id.
  async function countAuditEventsForInstall(installId: string): Promise<number> {
    const result = await seedClient.query(
      `select count(*)::int as count
       from wfpc.audit_events
       where tenant_id = $1 and event_type = 'factory.package.installed' and metadata->>'externalEntityId' = $2`,
      [tenantId, installId]
    );
    return Number((result.rows[0] as { count: number }).count);
  }

  it("AC1/AC3: owner token succeeds -- real membership role, real RBAC gate, real DB", async () => {
    const handler = createRoute();
    const installId = `install_${randomUUID()}`;
    const ownerToken = mintToken({ userId: ownerUserId, role: "member" });

    const response = await handler({
      method: "POST",
      path: "/api/factory/package-installs",
      headers: { origin: ALLOWED_ORIGIN, authorization: `Bearer ${ownerToken}` },
      body: { packageKey: blueprint.key, installId, installedAt: new Date().toISOString() },
      bodyByteLength: 120,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(201);
    expect((response.body as { status: string }).status).toBe("enabled");

    const installRepository = createPostgresFactoryPackageInstallRepository(seedClient);
    const persisted = await installRepository.findInstallById({ tenantId, installId });
    expect(persisted?.installId).toBe(installId);

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
    expect(auditRow.metadata.packageKey).toBe(blueprint.key);
    expect(auditRow.metadata.externalEntityId).toBe(installId);
  });

  it("AC1/AC3: member token is DENIED -- no install row, no audit row written", async () => {
    const handler = createRoute();
    const installId = `install_${randomUUID()}`;
    const memberToken = mintToken({ userId: memberUserId, role: "member" });

    const response = await handler({
      method: "POST",
      path: "/api/factory/package-installs",
      headers: { origin: ALLOWED_ORIGIN, authorization: `Bearer ${memberToken}` },
      body: { packageKey: blueprint.key, installId, installedAt: new Date().toISOString() },
      bodyByteLength: 120,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(403);

    const installRepository = createPostgresFactoryPackageInstallRepository(seedClient);
    const persisted = await installRepository.findInstallById({ tenantId, installId });
    expect(persisted).toBeNull();

    expect(await countAuditEventsForInstall(installId)).toBe(0);
  });

  it("AC1: session.role is NEVER trusted -- member's token minted with the most-privileged session role ('operator') is still DENIED", async () => {
    const handler = createRoute();
    const installId = `install_${randomUUID()}`;
    const memberTokenWithOperatorSessionRole = mintToken({ userId: memberUserId, role: "operator" });

    const response = await handler({
      method: "POST",
      path: "/api/factory/package-installs",
      headers: { origin: ALLOWED_ORIGIN, authorization: `Bearer ${memberTokenWithOperatorSessionRole}` },
      body: { packageKey: blueprint.key, installId, installedAt: new Date().toISOString() },
      bodyByteLength: 120,
      ip: "203.0.113.10"
    });

    // The token's session.role claims "operator" (the most privileged value a
    // session can carry) but the DB membership row for this user is "member".
    // A route that trusted session.role would install here; this route denies
    // because resolveTenantPackageInstallRole ignores session.role entirely
    // and resolves the actor's role from wfpc.tenant_memberships.
    expect(response.status).toBe(403);

    const installRepository = createPostgresFactoryPackageInstallRepository(seedClient);
    const persisted = await installRepository.findInstallById({ tenantId, installId });
    expect(persisted).toBeNull();

    expect(await countAuditEventsForInstall(installId)).toBe(0);
  });
});
