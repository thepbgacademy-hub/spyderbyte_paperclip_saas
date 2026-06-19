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
  const runtimeSchemaGuards = await client.query(
    `select
       exists (
         select 1
         from pg_constraint
         where conname = 'workflow_runs_bound_provider_context_single_entry_check'
           and conrelid = to_regclass('wfpc.workflow_runs')
           and lower(pg_get_constraintdef(oid)) like '%jsonb_array_length(bound_provider_context) <= 1%'
       ) as has_single_provider_bound_context_guard,
       exists (
         select 1
         from pg_constraint
         where conname = 'workflow_runs_bound_provider_context_binding_check'
           and conrelid = to_regclass('wfpc.workflow_runs')
           and lower(pg_get_constraintdef(oid)) like '%bound_secret_reference_id is null%'
           and lower(pg_get_constraintdef(oid)) like '%jsonb_array_length(bound_provider_context) = 0%'
           and lower(pg_get_constraintdef(oid)) like '%bound_secret_reference_id is not null%'
           and lower(pg_get_constraintdef(oid)) like '%jsonb_array_length(bound_provider_context) = 1%'
       ) as has_bound_provider_binding_shape_guard,
       exists (
         select 1
         from pg_indexes
         where schemaname = 'wfpc'
           and indexname = 'secret_references_active_provider_lane_unique'
       ) as has_single_active_provider_lane_guard`,
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
    isUuid(workflowId)
      ? "select id, tenant_id, enabled, provider_kind, package_id from wfpc.workflow_templates where tenant_id = $1 and id = $2 limit 1"
      : "select id, tenant_id, enabled, provider_kind, package_id from wfpc.workflow_templates where tenant_id = $1 order by created_at desc limit 1",
    isUuid(workflowId) ? [tenantId, workflowId] : [tenantId]
  );
  const mappingRows = asRecord(workerSignals.rows[0]).has_company_mapping
    ? await client.query(
        "select tenant_id, paperclip_company_id, paperclip_issue_agent_id from wfpc.paperclip_company_mappings where tenant_id = $1 limit 1",
        [tenantId]
      )
    : { rows: [] };

  const workflowRunColumnSet = new Set(workflowRunColumns.rows.map((row) => String(row.column_name)));
  const purchaseColumnSet = new Set(purchaseColumns.rows.map((row) => String(row.column_name)));
  const tenant = asRecord(tenantRows.rows[0]);
  const workflow = asRecord(workflowRows.rows[0]);
  const mapping = asRecord(mappingRows.rows[0]);
  const signals = asRecord(workerSignals.rows[0]);
  const guards = asRecord(runtimeSchemaGuards.rows[0]);

  return {
    schema: {
      workflowRunsBoundProviderReady:
        workflowRunColumnSet.has("bound_secret_reference_id") && workflowRunColumnSet.has("bound_provider_context"),
      workflowRunsSingleProviderGuardReady: Boolean(guards.has_single_provider_bound_context_guard),
      workflowRunsBindingShapeGuardReady: Boolean(guards.has_bound_provider_binding_shape_guard),
      tenantPackagePurchasesReady:
        purchaseColumnSet.has("purchased_by_user_id") || purchaseColumnSet.has("created_by_user_id"),
      purchaseActorColumn: purchaseColumnSet.has("created_by_user_id")
        ? "created_by_user_id"
        : purchaseColumnSet.has("purchased_by_user_id")
          ? "purchased_by_user_id"
          : null,
      secretReferencesSingleActiveProviderLaneReady: Boolean(guards.has_single_active_provider_lane_guard),
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
      paperclipCompanyId: typeof mapping.paperclip_company_id === "string" ? mapping.paperclip_company_id : null,
      paperclipIssueAgentId: typeof mapping.paperclip_issue_agent_id === "string" ? mapping.paperclip_issue_agent_id : null
    }
  };
}

export function summarizeRuntimePreflight(preflight) {
  const blockers = [];

  if (!preflight.schema.workflowRunsBoundProviderReady) {
    blockers.push("workflow_runs is missing bound provider context columns from the latest repo migrations");
  }
  if (!preflight.schema.workflowRunsSingleProviderGuardReady) {
    blockers.push("workflow_runs is missing the single-provider bound context guard from the latest repo migrations");
  }
  if (!preflight.schema.workflowRunsBindingShapeGuardReady) {
    blockers.push("workflow_runs is missing the bound secret/context shape guard from the latest repo migrations");
  }
  if (!preflight.schema.tenantPackagePurchasesReady) {
    blockers.push("tenant_package_purchases is missing the purchaser column expected by the live-drive seed path");
  }
  if (!preflight.schema.secretReferencesSingleActiveProviderLaneReady) {
    blockers.push("secret_references is missing the single-active provider lane guard from the latest repo migrations");
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

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ""));
}
