export async function loadRuntimePreflight({ client, tenantId, workflowId }) {
  const workflowRunColumns = await client.query(
    `select column_name
     from information_schema.columns
     where table_schema = 'wfpc'
       and table_name = 'workflow_runs'
     order by ordinal_position`,
    []
  );
  const purchaseColumns = await client.query(
    `select column_name
     from information_schema.columns
     where table_schema = 'wfpc'
       and table_name = 'tenant_package_purchases'
     order by ordinal_position`,
    []
  );
  const workerSignals = await client.query(
    `select
       exists (
         select 1
         from information_schema.tables
         where table_schema = 'wfpc'
           and table_name = 'workflow_queue_outbox'
       ) as has_outbox,
       exists (
         select 1
         from information_schema.tables
         where table_schema = 'wfpc'
           and table_name = 'paperclip_company_mappings'
       ) as has_company_mapping`,
    []
  );
  const tenantRows = await client.query("select id, paused_at from wfpc.tenants where id = $1 limit 1", [tenantId]);
  const workflowRows = await client.query(
    "select id, tenant_id, enabled, provider_kind, package_id from wfpc.workflow_templates where tenant_id = $1 and id = $2 limit 1",
    [tenantId, workflowId]
  );
  const mappingRows = asRecord(workerSignals.rows[0]).has_company_mapping
    ? await client.query("select tenant_id, paperclip_company_id from wfpc.paperclip_company_mappings where tenant_id = $1 limit 1", [tenantId])
    : { rows: [] };

  const workflowRunColumnSet = new Set(workflowRunColumns.rows.map((row) => String(row.column_name)));
  const purchaseColumnSet = new Set(purchaseColumns.rows.map((row) => String(row.column_name)));
  const tenant = asRecord(tenantRows.rows[0]);
  const workflow = asRecord(workflowRows.rows[0]);
  const mapping = asRecord(mappingRows.rows[0]);
  const signals = asRecord(workerSignals.rows[0]);

  return {
    schema: {
      workflowRunsBoundProviderReady:
        workflowRunColumnSet.has("bound_secret_reference_id") && workflowRunColumnSet.has("bound_provider_context"),
      tenantPackagePurchasesReady:
        purchaseColumnSet.has("purchased_by_user_id") || purchaseColumnSet.has("created_by_user_id"),
      purchaseActorColumn: purchaseColumnSet.has("created_by_user_id")
        ? "created_by_user_id"
        : purchaseColumnSet.has("purchased_by_user_id")
          ? "purchased_by_user_id"
          : null,
      hasOutbox: Boolean(signals.has_outbox),
      hasCompanyMappingTable: Boolean(signals.has_company_mapping)
    },
    tenant: {
      exists: tenantRows.rows.length > 0,
      paused: tenant.paused_at !== null && tenant.paused_at !== undefined
    },
    workflow: {
      exists: workflowRows.rows.length > 0,
      enabled: Boolean(workflow.enabled),
      packageId: typeof workflow.package_id === "string" ? workflow.package_id : null,
      providerKind: typeof workflow.provider_kind === "string" ? workflow.provider_kind : null
    },
    mapping: {
      exists: mappingRows.rows.length > 0,
      paperclipCompanyId: typeof mapping.paperclip_company_id === "string" ? mapping.paperclip_company_id : null
    }
  };
}

export function summarizeRuntimePreflight(preflight) {
  const blockers = [];

  if (!preflight.schema.workflowRunsBoundProviderReady) {
    blockers.push("workflow_runs is missing bound provider context columns from the latest repo migrations");
  }
  if (!preflight.schema.tenantPackagePurchasesReady) {
    blockers.push("tenant_package_purchases is missing the purchaser column expected by the live-drive seed path");
  }
  if (!preflight.schema.hasOutbox) {
    blockers.push("workflow_queue_outbox table is missing");
  }
  if (!preflight.schema.hasCompanyMappingTable) {
    blockers.push("paperclip_company_mappings table is missing");
  }
  if (!preflight.tenant.exists) {
    blockers.push("target tenant does not exist");
  } else if (preflight.tenant.paused) {
    blockers.push("target tenant is paused");
  }
  if (!preflight.workflow.exists) {
    blockers.push("target workflow does not exist for the tenant");
  } else {
    if (!preflight.workflow.enabled) {
      blockers.push("target workflow is disabled");
    }
    if (!preflight.workflow.packageId) {
      blockers.push("target workflow is not package-bound");
    }
  }

  return {
    ok: blockers.length === 0,
    blockers
  };
}

function asRecord(value) {
  return value && typeof value === "object" ? value : {};
}
