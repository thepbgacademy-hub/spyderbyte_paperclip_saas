import process from "node:process";

import pg from "pg";

import { loadRuntimePreflight, summarizeRuntimePreflight } from "./lib/runtime-preflight.mjs";
import { loadScriptEnv } from "./lib/script-env.mjs";

const DEMO_PROFILES = {
  primary: {
    userId: "11111111-1111-4111-8111-111111111111",
    tenantId: "22222222-2222-4222-8222-222222222222",
    packageId: "33333333-3333-4333-8333-333333333333",
    workflowId: "44444444-4444-4444-8444-444444444444",
    providerReferenceId: "55555555-5555-4555-8555-555555555555",
    purchaseId: "66666666-6666-4666-8666-666666666666",
    tenantName: "Wealth Factory Demo",
    tenantSlug: "wealth-factory-demo",
    userEmail: "demo@wealthfactory.local",
    workflowName: "Wealth Factory Social Calendar",
    workflowDescription: "Plan approved social posts for the installed package.",
    providerLabel: "OpenAI",
    providerSecretRef: "wf_secret_demo_openai",
    providerMetadata: { project: "demo" }
  },
  secondary: {
    userId: "11111111-1111-4111-8111-222222222222",
    tenantId: "22222222-2222-4222-8222-333333333333",
    packageId: "33333333-3333-4333-8333-333333333333",
    workflowId: "44444444-4444-4444-8444-555555555555",
    providerReferenceId: "55555555-5555-4555-8555-666666666666",
    purchaseId: "66666666-6666-4666-8666-777777777777",
    tenantName: "Wealth Factory Demo Two",
    tenantSlug: "wealth-factory-demo-two",
    userEmail: "demo-two@wealthfactory.local",
    workflowName: "Wealth Factory Social Calendar Two",
    workflowDescription: "Plan approved social posts for the installed package.",
    providerLabel: "OpenAI",
    providerSecretRef: "wf_secret_demo_two_openai",
    providerMetadata: { project: "demo-two" }
  }
};

const env = loadScriptEnv();
const args = parseArgs(process.argv.slice(2));
const profile = buildSeedProfile(args, env);

const client = new pg.Client({
  connectionString: env.SUPABASE_DB_URL,
  ssl: resolveSsl()
});
let closing = false;
client.on("error", (error) => {
  if (!closing) {
    throw error;
  }
});

await client.connect();

try {
  const preflight = await loadRuntimePreflight({
    client,
    tenantId: profile.tenantId,
    workflowId: profile.workflowId
  });
  const summary = summarizeRuntimePreflight(preflight);
  const paperclipCompanyId = resolvePaperclipCompanyId(args, env);
  const paperclipIssueAgentId = resolvePaperclipIssueAgentId(args, env);
  if (!preflight.schema.tenantPackagePurchasesReady) {
    throw new Error(`Live runtime schema is not ready for demo seeding: ${summary.blockers.join("; ")}`);
  }
  if (paperclipCompanyId && !preflight.schema.hasCompanyMappingTable) {
    throw new Error("Live runtime schema is not ready for Paperclip company mapping seeding: paperclip_company_mappings table is missing");
  }

  await client.query("begin");

  await client.query(
    `insert into auth.users
      (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ($1, 'authenticated', 'authenticated', $2, now(), '{"provider":"email","providers":["email"]}'::jsonb, $3::jsonb, now(), now())
     on conflict (id) do update
     set email = excluded.email,
         raw_user_meta_data = excluded.raw_user_meta_data,
         updated_at = now()`,
    [profile.userId, profile.userEmail, JSON.stringify({ name: profile.tenantName })]
  );

  await client.query(
    `insert into wfpc.tenants (id, name, slug)
     values ($1, $2, $3)
     on conflict (id) do update
     set name = excluded.name,
         slug = excluded.slug,
         updated_at = now()`,
    [profile.tenantId, profile.tenantName, profile.tenantSlug]
  );

  await client.query(
    `insert into wfpc.tenant_memberships (tenant_id, user_id, role)
     values ($1, $2, 'owner')
     on conflict (tenant_id, user_id) do update
     set role = excluded.role`,
    [profile.tenantId, profile.userId]
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
    [profile.packageId]
  );

  await client.query(
    `insert into wfpc.tenant_package_purchases
      (id, tenant_id, package_id, status, starts_at, ends_at, ${preflight.schema.purchaseActorColumn})
     values ($1, $2, $3, 'active', now() - interval '1 day', null, $4)
     on conflict (tenant_id, package_id) do update
     set status = 'active',
         starts_at = excluded.starts_at,
         ends_at = excluded.ends_at,
         updated_at = now()`,
    [profile.purchaseId, profile.tenantId, profile.packageId, profile.userId]
  );

  await client.query(
    `insert into wfpc.tenant_package_installs (id, tenant_id, package_id, installed_by_user_id, status)
     values (gen_random_uuid(), $1, $2, $3, 'active')
     on conflict (tenant_id, package_id) do update
     set status = 'active'`,
    [profile.tenantId, profile.packageId, profile.userId]
  );

  await client.query(
    `delete from wfpc.package_provider_requirements
     where package_id = $1
       and capability = 'content_generation'
       and provider_kind = 'openai_api'`,
    [profile.packageId]
  );

  await client.query(
    `insert into wfpc.package_provider_requirements (id, package_id, capability, required, provider_kind)
     values (gen_random_uuid(), $1, 'content_generation', true, 'openai_api')`,
    [profile.packageId]
  );

  await client.query(
    `insert into wfpc.workflow_templates (id, tenant_id, name, description, provider_kind, enabled, package_id)
     values ($1, $2, $3, $4, 'openai_api', true, $5)
     on conflict (id) do update
     set tenant_id = excluded.tenant_id,
         name = excluded.name,
         description = excluded.description,
         provider_kind = excluded.provider_kind,
         enabled = excluded.enabled,
         package_id = excluded.package_id,
         updated_at = now()`,
    [profile.workflowId, profile.tenantId, profile.workflowName, profile.workflowDescription, profile.packageId]
  );

  const activeSecretReferenceUpdate = await client.query(
    `update wfpc.secret_references
     set label = $2,
         metadata = $3::jsonb,
         updated_at = now()
     where tenant_id = $1
       and provider_kind = 'openai_api'
       and revoked_at is null
     returning id`,
    [
      profile.tenantId,
      profile.providerLabel,
      JSON.stringify(profile.providerMetadata)
    ]
  );

  const revivedSecretReferenceUpdate =
    activeSecretReferenceUpdate.rows.length === 0
      ? await client.query(
          `update wfpc.secret_references
           set label = $2,
               secret_ref = $3,
               metadata = $4::jsonb,
               revoked_at = null,
               revoked_reason = null,
               updated_at = now()
           where tenant_id = $1
             and provider_kind = 'openai_api'
             and secret_ref = $3
           returning id`,
          [
            profile.tenantId,
            profile.providerLabel,
            profile.providerSecretRef,
            JSON.stringify(profile.providerMetadata)
          ]
        )
      : { rows: [] };

  if (activeSecretReferenceUpdate.rows.length === 0 && revivedSecretReferenceUpdate.rows.length === 0) {
    await client.query(
      `insert into wfpc.secret_references (id, tenant_id, provider_kind, label, secret_ref, metadata)
       values ($1, $2, 'openai_api', $3, $4, $5::jsonb)
       on conflict (id) do update
       set label = excluded.label,
           metadata = excluded.metadata,
           revoked_at = null,
           revoked_reason = null,
         updated_at = now()
       where wfpc.secret_references.secret_ref = excluded.secret_ref`,
      [
        profile.providerReferenceId,
        profile.tenantId,
        profile.providerLabel,
        profile.providerSecretRef,
        JSON.stringify(profile.providerMetadata)
      ]
    );
  }

  if (paperclipCompanyId) {
    await client.query(
      `insert into wfpc.paperclip_company_mappings (tenant_id, paperclip_company_id, paperclip_issue_agent_id)
       values ($1, $2, $3)
       on conflict (tenant_id) do update
       set paperclip_company_id = excluded.paperclip_company_id,
           paperclip_issue_agent_id = coalesce(excluded.paperclip_issue_agent_id, wfpc.paperclip_company_mappings.paperclip_issue_agent_id)`,
      [profile.tenantId, paperclipCompanyId, paperclipIssueAgentId]
    );
  }

  await client.query("commit");

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        profile: args.lane ?? "primary",
        demo: {
          tenantId: profile.tenantId,
          userId: profile.userId,
          packageId: profile.packageId,
          workflowId: profile.workflowId,
          providerReferenceId: profile.providerReferenceId,
          providerSecretRef: profile.providerSecretRef,
          ...(paperclipCompanyId ? { paperclipCompanyId } : {}),
          ...(paperclipIssueAgentId ? { paperclipIssueAgentId } : {})
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
  closing = true;
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

function parseArgs(values) {
  const args = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      continue;
    }
    args[value.slice(2)] = values[index + 1];
    index += 1;
  }
  return args;
}

function buildSeedProfile(args, source) {
  const preset = DEMO_PROFILES[args.lane ?? "primary"] ?? DEMO_PROFILES.primary;
  return {
    userId: args.user ?? source.WF_DEMO_USER_ID ?? preset.userId,
    tenantId: args.tenant ?? source.WF_DEMO_TENANT_ID ?? preset.tenantId,
    packageId: args.package ?? source.WF_DEMO_PACKAGE_ID ?? preset.packageId,
    workflowId: args.workflow ?? source.WF_DEMO_WORKFLOW_ID ?? preset.workflowId,
    providerReferenceId: args["provider-reference"] ?? source.WF_DEMO_PROVIDER_REFERENCE_ID ?? preset.providerReferenceId,
    purchaseId: args.purchase ?? source.WF_DEMO_PURCHASE_ID ?? preset.purchaseId,
    tenantName: args["tenant-name"] ?? source.WF_DEMO_TENANT_NAME ?? preset.tenantName,
    tenantSlug: args["tenant-slug"] ?? source.WF_DEMO_TENANT_SLUG ?? preset.tenantSlug,
    userEmail: args["user-email"] ?? source.WF_DEMO_USER_EMAIL ?? preset.userEmail,
    workflowName: args["workflow-name"] ?? source.WF_DEMO_WORKFLOW_NAME ?? preset.workflowName,
    workflowDescription: args["workflow-description"] ?? source.WF_DEMO_WORKFLOW_DESCRIPTION ?? preset.workflowDescription,
    providerLabel: args["provider-label"] ?? source.WF_DEMO_PROVIDER_LABEL ?? preset.providerLabel,
    providerSecretRef: args["provider-secret-ref"] ?? source.WF_DEMO_PROVIDER_SECRET_REF ?? preset.providerSecretRef,
    providerMetadata: {
      ...preset.providerMetadata,
      ...parseJsonObject(source.WF_DEMO_PROVIDER_METADATA),
      ...parseJsonObject(args["provider-metadata"])
    }
  };
}

function resolvePaperclipCompanyId(args, source) {
  const value = args["paperclip-company-id"] ?? source.WF_DEMO_PAPERCLIP_COMPANY_ID;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function resolvePaperclipIssueAgentId(args, source) {
  const value = args["paperclip-issue-agent-id"] ?? source.WF_DEMO_PAPERCLIP_ISSUE_AGENT_ID;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseJsonObject(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {};
  }
  const parsed = JSON.parse(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}
