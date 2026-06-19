import { DEMO_PROFILES } from "./demo-seed-profiles.mjs";

export const STAGE_DEMO_LANE_NAMES = ["primary", "secondary", "tertiary", "quaternary", "quinary", "senary"];

export const CORE_STAGE_PACKAGE_ROWS = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    publicPackageId: "pkg_bib_connect",
    packageKey: "pkg_bib_connect",
    name: "Connect First",
    kind: "industry",
    metadata: { workflowFamily: "connect-first" }
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    publicPackageId: "pkg_tax_strategy",
    packageKey: "pkg_tax_strategy",
    name: "Tax Strategy",
    kind: "industry",
    metadata: { workflowFamily: "tax-strategy" }
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
    publicPackageId: "pkg_package_followup",
    packageKey: "pkg_package_followup",
    name: "Package Follow-up",
    kind: "industry",
    metadata: { workflowFamily: "package-followup" }
  }
];

const CORE_STAGE_PACKAGE_BY_PUBLIC_ID = new Map(
  CORE_STAGE_PACKAGE_ROWS.map((row) => [row.publicPackageId, row])
);

export function buildStageDemoRealignmentPlan() {
  return STAGE_DEMO_LANE_NAMES.map((laneName) => {
    const preset = DEMO_PROFILES[laneName];
    if (!preset) {
      throw new Error(`Missing demo preset for lane '${laneName}'`);
    }

    const packageRow = CORE_STAGE_PACKAGE_BY_PUBLIC_ID.get(preset.packageId);
    if (!packageRow) {
      throw new Error(`No stage package row defined for public package id '${preset.packageId}'`);
    }

    return {
      laneName,
      tenantSlug: preset.tenantSlug,
      tenantName: preset.tenantName,
      packageId: packageRow.id,
      publicPackageId: packageRow.publicPackageId,
      packageKey: packageRow.packageKey,
      packageName: packageRow.name,
      packageKind: packageRow.kind,
      packageMetadata: packageRow.metadata,
      workflowName: preset.workflowName,
      workflowDescription: preset.workflowDescription
    };
  });
}

export function generateStageDemoRealignmentSql() {
  const packageStatements = CORE_STAGE_PACKAGE_ROWS.map((row) => {
    return [
      "insert into wfpc.wealth_factory_packages (id, package_key, name, kind, metadata)",
      `values ('${row.id}'::uuid, ${toSqlString(row.packageKey)}, ${toSqlString(row.name)}, ${toSqlString(row.kind)}, ${toSqlJson(row.metadata)})`,
      "on conflict (id) do update",
      "set package_key = excluded.package_key,",
      "    name = excluded.name,",
      "    kind = excluded.kind,",
      "    metadata = excluded.metadata,",
      "    updated_at = now();",
      "",
      "delete from wfpc.package_provider_requirements",
      `where package_id = '${row.id}'::uuid`,
      "  and capability = 'content_generation'",
      "  and provider_kind = 'openai_api';",
      "",
      "insert into wfpc.package_provider_requirements (id, package_id, capability, required, provider_kind)",
      `values (gen_random_uuid(), '${row.id}'::uuid, 'content_generation', true, 'openai_api');`
    ].join("\n");
  }).join("\n\n");

  const laneStatements = buildStageDemoRealignmentPlan().map((entry) => {
    return [
      "  lane_tenant_id := null;",
      `  select id into lane_tenant_id from wfpc.tenants where slug = ${toSqlString(entry.tenantSlug)};`,
      "  if lane_tenant_id is null then",
      `    raise exception 'Missing Wealth Factory stage tenant for slug ${escapeSqlLiteral(entry.tenantSlug)}';`,
      "  end if;",
      "",
      "  update wfpc.tenant_package_purchases",
      `     set package_id = '${entry.packageId}'::uuid,`,
      "         status = 'active',",
      "         ends_at = null,",
      "         updated_at = now()",
      "   where tenant_id = lane_tenant_id;",
      "  get diagnostics row_count_for_tenant = row_count;",
      "  if row_count_for_tenant <> 1 then",
      `    raise exception 'Expected exactly 1 tenant_package_purchases row for ${escapeSqlLiteral(entry.tenantSlug)}, found %', row_count_for_tenant;`,
      "  end if;",
      "",
      "  update wfpc.tenant_package_installs",
      `     set package_id = '${entry.packageId}'::uuid,`,
      "         status = 'active'",
      "   where tenant_id = lane_tenant_id;",
      "  get diagnostics row_count_for_tenant = row_count;",
      "  if row_count_for_tenant <> 1 then",
      `    raise exception 'Expected exactly 1 tenant_package_installs row for ${escapeSqlLiteral(entry.tenantSlug)}, found %', row_count_for_tenant;`,
      "  end if;",
      "",
      "  update wfpc.workflow_templates",
      `     set name = ${toSqlString(entry.workflowName)},`,
      `         description = ${toSqlString(entry.workflowDescription)},`,
      "         provider_kind = 'openai_api',",
      "         enabled = true,",
      `         package_id = '${entry.packageId}'::uuid,`,
      "         updated_at = now()",
      "   where tenant_id = lane_tenant_id;",
      "  get diagnostics row_count_for_tenant = row_count;",
      "  if row_count_for_tenant <> 1 then",
      `    raise exception 'Expected exactly 1 workflow_templates row for ${escapeSqlLiteral(entry.tenantSlug)}, found %', row_count_for_tenant;`,
      "  end if;"
    ].join("\n");
  }).join("\n\n");

  return [
    "begin;",
    "",
    packageStatements,
    "",
    "do $$",
    "declare",
    "  lane_tenant_id uuid;",
    "  row_count_for_tenant integer;",
    "begin",
    laneStatements,
    "end $$;",
    "",
    "commit;"
  ].join("\n");
}

function toSqlString(value) {
  return `'${escapeSqlLiteral(value)}'`;
}

function toSqlJson(value) {
  return `${toSqlString(JSON.stringify(value))}::jsonb`;
}

function escapeSqlLiteral(value) {
  return String(value).replace(/'/g, "''");
}
