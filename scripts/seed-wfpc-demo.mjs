import { readFileSync } from "node:fs";
import process from "node:process";

import pg from "pg";

const DEMO = {
  userId: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  packageId: "33333333-3333-4333-8333-333333333333",
  workflowId: "44444444-4444-4444-8444-444444444444",
  providerReferenceId: "55555555-5555-4555-8555-555555555555"
};

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith("#"))
    .map((line) => line.split(/=(.*)/s).slice(0, 2))
);

const client = new pg.Client({
  connectionString: env.SUPABASE_DB_URL,
  ssl: resolveSsl()
});

await client.connect();

try {
  await client.query("begin");

  await client.query(
    `insert into auth.users
      (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ($1, 'authenticated', 'authenticated', 'demo@wealthfactory.local', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"Wealth Factory Demo"}'::jsonb, now(), now())
     on conflict (id) do update
     set email = excluded.email,
         updated_at = now()`,
    [DEMO.userId]
  );

  await client.query(
    `insert into wfpc.tenants (id, name, slug)
     values ($1, 'Wealth Factory Demo', 'wealth-factory-demo')
     on conflict (id) do update
     set name = excluded.name,
         slug = excluded.slug,
         updated_at = now()`,
    [DEMO.tenantId]
  );

  await client.query(
    `insert into wfpc.tenant_memberships (tenant_id, user_id, role)
     values ($1, $2, 'owner')
     on conflict (tenant_id, user_id) do update
     set role = excluded.role`,
    [DEMO.tenantId, DEMO.userId]
  );

  await client.query(
    `insert into wfpc.wealth_factory_packages (id, package_key, name, kind, metadata)
     values ($1, 'social-media-agency', 'Social Media Agency', 'industry', '{"industry":"marketing"}'::jsonb)
     on conflict (id) do update
     set package_key = excluded.package_key,
         name = excluded.name,
         kind = excluded.kind,
         metadata = excluded.metadata,
         updated_at = now()`,
    [DEMO.packageId]
  );

  await client.query(
    `insert into wfpc.tenant_package_installs (id, tenant_id, package_id, installed_by_user_id, status)
     values (gen_random_uuid(), $1, $2, $3, 'active')
     on conflict (tenant_id, package_id) do update
     set status = 'active'`,
    [DEMO.tenantId, DEMO.packageId, DEMO.userId]
  );

  await client.query(
    `insert into wfpc.package_provider_requirements (id, package_id, capability, required, provider_kind)
     values (gen_random_uuid(), $1, 'content_generation', true, 'openai_api')
     on conflict do nothing`,
    [DEMO.packageId]
  );

  await client.query(
    `insert into wfpc.workflow_templates (id, tenant_id, name, description, provider_kind, enabled, package_id)
     values ($1, $2, 'Wealth Factory Social Calendar', 'Plan approved social posts for the installed package.', 'openai_api', true, $3)
     on conflict (id) do update
     set tenant_id = excluded.tenant_id,
         name = excluded.name,
         description = excluded.description,
         provider_kind = excluded.provider_kind,
         enabled = excluded.enabled,
         package_id = excluded.package_id,
         updated_at = now()`,
    [DEMO.workflowId, DEMO.tenantId, DEMO.packageId]
  );

  await client.query(
    `insert into wfpc.secret_references (id, tenant_id, provider_kind, label, secret_ref, metadata)
     values ($1, $2, 'openai_api', 'OpenAI', 'wf_secret_demo_openai', '{"project":"demo"}'::jsonb)
     on conflict (id) do update
     set label = excluded.label,
         metadata = excluded.metadata,
         revoked_at = null,
         updated_at = now()`,
    [DEMO.providerReferenceId, DEMO.tenantId]
  );

  await client.query("commit");

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        demo: {
          tenantId: DEMO.tenantId,
          userId: DEMO.userId,
          packageId: DEMO.packageId,
          workflowId: DEMO.workflowId
        }
      },
      null,
      2
    ) + "\n"
  );
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}

function resolveSsl() {
  if (
    env.SUPABASE_DB_SSL === "false" ||
    env.SUPABASE_DB_URL.includes("localhost") ||
    env.SUPABASE_DB_URL.includes("127.0.0.1")
  ) {
    return undefined;
  }

  return { rejectUnauthorized: true };
}
