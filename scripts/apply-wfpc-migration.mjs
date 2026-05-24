import { readFileSync } from "node:fs";
import { Client } from "pg";

import { loadScriptEnv } from "./lib/script-env.mjs";

/* global console */

const env = loadScriptEnv();

const connectionString = env.SUPABASE_DB_URL;
if (!connectionString || connectionString === "PLACE_HOLDER") {
  throw new Error("SUPABASE_DB_URL is required");
}

const ssl =
  env.SUPABASE_DB_SSL === "false" ||
  connectionString.includes("localhost") ||
  connectionString.includes("127.0.0.1")
    ? undefined
    : { rejectUnauthorized: false };

const client = new Client({
  connectionString,
  ssl
});
let closing = false;
client.on("error", (error) => {
  if (!closing) {
    throw error;
  }
});

await client.connect();
try {
  const existing = await client.query(
    "select exists (select 1 from information_schema.schemata where schema_name = 'wfpc') as exists"
  );
  if (!existing.rows[0]?.exists) {
    await client.query(readFileSync("supabase/migrations/0001_initial_tenant_model.sql", "utf8"));
  }
  const acidExisting = await client.query(
    `select
      exists (select 1 from information_schema.tables where table_schema = 'wfpc' and table_name = 'workflow_run_reservations') as has_table,
      exists (select 1 from pg_indexes where schemaname = 'wfpc' and indexname = 'workflow_run_reservations_idempotency_unique') as has_idempotency_index,
      exists (select 1 from pg_indexes where schemaname = 'wfpc' and indexname = 'workflow_run_reservations_run_id_unique') as has_run_id_unique,
      exists (select 1 from pg_indexes where schemaname = 'wfpc' and indexname = 'secret_references_active_unique') as has_active_secret_index,
      exists (select 1 from pg_indexes where schemaname = 'wfpc' and indexname = 'secret_references_tenant_secret_ref_unique') as has_secret_ref_index,
      exists (select 1 from pg_indexes where schemaname = 'wfpc' and indexname = 'workflow_runs_status_guard_idx') as has_status_index,
      exists (select 1 from pg_indexes where schemaname = 'wfpc' and indexname = 'workflow_templates_package_idx') as has_workflow_package_index,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_templates' and column_name = 'package_id') as has_workflow_package_column,
      exists (select 1 from pg_constraint where conname = 'workflow_templates_package_fk' and conrelid = 'wfpc.workflow_templates'::regclass) as has_workflow_package_fk,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_run_reservations' and column_name = 'run_id' and is_nullable = 'NO') as has_run_id_not_null,
      exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'wfpc' and c.relname = 'workflow_run_reservations' and c.relrowsecurity) as has_rls`
  );
  const acidReady = Object.values(acidExisting.rows[0] ?? {}).every(Boolean);
  if (!acidReady) {
    await client.query(readFileSync("supabase/migrations/0002_acid_race_guards.sql", "utf8"));
  }
  const purchaseExisting = await client.query(
    `select
      exists (select 1 from information_schema.tables where table_schema = 'wfpc' and table_name = 'tenant_package_purchases') as has_table,
      exists (select 1 from pg_indexes where schemaname = 'wfpc' and indexname = 'tenant_package_purchases_active_idx') as has_active_index,
      exists (select 1 from pg_constraint where conname = 'tenant_package_purchases_tenant_id_package_id_key' and conrelid = to_regclass('wfpc.tenant_package_purchases')) as has_unique_purchase,
      exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'wfpc' and c.relname = 'tenant_package_purchases' and c.relrowsecurity) as has_rls,
      exists (select 1 from pg_policies where schemaname = 'wfpc' and tablename = 'tenant_package_purchases' and policyname = 'members can read tenant package purchases') as has_member_read_policy`
  );
  const purchaseReady = Object.values(purchaseExisting.rows[0] ?? {}).every(Boolean);
  if (!purchaseReady) {
    await client.query(readFileSync("supabase/migrations/0003_package_purchase_guards.sql", "utf8"));
  }
  const outboxExisting = await client.query(
    `select
      exists (select 1 from information_schema.tables where table_schema = 'wfpc' and table_name = 'workflow_queue_outbox') as has_table,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_queue_outbox' and column_name = 'created_by_user_id' and is_nullable = 'NO') as has_user_column,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_queue_outbox' and column_name = 'status' and is_nullable = 'NO' and column_default like '%pending%') as has_status_column,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_queue_outbox' and column_name = 'idempotency_key' and is_nullable = 'NO') as has_idempotency_column,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_queue_outbox' and column_name = 'attempts' and is_nullable = 'NO') as has_attempts_column,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_queue_outbox' and column_name = 'available_at' and is_nullable = 'NO') as has_available_at_column,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_queue_outbox' and column_name = 'created_at' and is_nullable = 'NO') as has_created_at_column,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_queue_outbox' and column_name = 'updated_at' and is_nullable = 'NO') as has_updated_at_column,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_queue_outbox' and column_name = 'claim_token') as has_claim_token,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_queue_outbox' and column_name = 'claimed_at') as has_claimed_at_column,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_queue_outbox' and column_name = 'enqueued_at') as has_enqueued_at_column,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_queue_outbox' and column_name = 'last_error') as has_last_error_column,
      exists (select 1 from pg_indexes where schemaname = 'wfpc' and indexname = 'workflow_queue_outbox_pending_idx') as has_pending_index,
      exists (select 1 from pg_indexes where schemaname = 'wfpc' and indexname = 'workflow_queue_outbox_claimed_idx') as has_claimed_index,
      exists (select 1 from pg_constraint where conname = 'workflow_queue_outbox_tenant_id_run_id_key' and conrelid = to_regclass('wfpc.workflow_queue_outbox')) as has_run_unique,
      exists (select 1 from pg_constraint where conname = 'workflow_queue_outbox_tenant_id_workflow_template_id_idempo_key' and conrelid = to_regclass('wfpc.workflow_queue_outbox')) as has_idempotency_unique,
      exists (select 1 from pg_constraint where conrelid = to_regclass('wfpc.workflow_queue_outbox') and contype = 'p') as has_primary_key,
      exists (select 1 from pg_constraint where conrelid = to_regclass('wfpc.workflow_queue_outbox') and pg_get_constraintdef(oid) like '%wfpc.workflow_runs%') as has_run_fk,
      exists (select 1 from pg_constraint where conrelid = to_regclass('wfpc.workflow_queue_outbox') and pg_get_constraintdef(oid) like '%workflow_template_id, tenant_id%') as has_workflow_template_fk,
      exists (
        select 1
        from pg_constraint
        where conname = 'workflow_queue_outbox_status_check'
          and conrelid = to_regclass('wfpc.workflow_queue_outbox')
          and pg_get_constraintdef(oid) like '%claimed%'
      ) as has_status_check,
      exists (select 1 from pg_constraint where conname = 'workflow_queue_outbox_attempts_check' and conrelid = to_regclass('wfpc.workflow_queue_outbox')) as has_attempts_check,
      exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'wfpc' and c.relname = 'workflow_queue_outbox' and c.relrowsecurity) as has_rls`
  );
  const outboxReady = Object.values(outboxExisting.rows[0] ?? {}).every(Boolean);
  if (!outboxReady) {
    await client.query(readFileSync("supabase/migrations/0004_workflow_queue_outbox.sql", "utf8"));
  }
  const boundProviderExisting = await client.query(
    `select
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_runs' and column_name = 'bound_secret_reference_id') as has_secret_reference_id,
      exists (
        select 1
        from pg_constraint
        where conname = 'workflow_runs_bound_secret_reference_id_fkey'
          and conrelid = to_regclass('wfpc.workflow_runs')
          and pg_get_constraintdef(oid) like '%references wfpc.secret_references(id)%'
      ) as has_secret_reference_fk,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_runs' and column_name = 'bound_provider_context' and is_nullable = 'NO') as has_provider_context,
      exists (
        select 1
        from pg_constraint
        where conname = 'workflow_runs_bound_provider_context_object_check'
          and conrelid = to_regclass('wfpc.workflow_runs')
          and pg_get_constraintdef(oid) like '%jsonb_typeof(bound_provider_context) = ''array''%'
      ) as has_context_check,
      exists (select 1 from pg_indexes where schemaname = 'wfpc' and indexname = 'workflow_runs_bound_secret_reference_idx') as has_secret_reference_idx`
  );
  const boundProviderReady = Object.values(boundProviderExisting.rows[0] ?? {}).every(Boolean);
  if (!boundProviderReady) {
    await client.query(readFileSync("supabase/migrations/0005_bound_provider_context.sql", "utf8"));
  }
  const activeProviderLaneExisting = await client.query(
    `select
      exists (
        select 1
        from pg_indexes
        where schemaname = 'wfpc'
          and indexname = 'secret_references_active_provider_lane_unique'
      ) as has_active_provider_lane_index`
  );
  const activeProviderLaneReady = Object.values(activeProviderLaneExisting.rows[0] ?? {}).every(Boolean);
  if (!activeProviderLaneReady) {
    await client.query(readFileSync("supabase/migrations/0006_single_active_provider_lane.sql", "utf8"));
  }
  const vaultExisting = await client.query(
    `select
      exists (select 1 from information_schema.tables where table_schema = 'wfpc_private' and table_name = 'vault_secrets') as has_table,
      exists (select 1 from pg_indexes where schemaname = 'wfpc_private' and indexname = 'vault_secrets_tenant_id_idx') as has_tenant_index,
      exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'wfpc_private' and c.relname = 'vault_secrets' and c.relrowsecurity) as has_rls`
  );
  const vaultReady = Object.values(vaultExisting.rows[0] ?? {}).every(Boolean);
  if (!vaultReady) {
    await client.query(readFileSync("supabase/migrations/0005_private_encrypted_vault.sql", "utf8"));
  }
  const vaultKindExisting = await client.query(
    `select exists (
      select 1
      from information_schema.columns
      where table_schema = 'wfpc_private'
        and table_name = 'vault_secrets'
        and column_name = 'provider_kind'
        and data_type = 'text'
    ) as ready`
  );
  const vaultKindReady = Boolean(vaultKindExisting.rows[0]?.ready);
  if (!vaultKindReady) {
    await client.query(readFileSync("supabase/migrations/0006_vault_storage_secret_kinds.sql", "utf8"));
  }
  const storageSecretExisting = await client.query(
    `select
      exists (select 1 from information_schema.tables where table_schema = 'wfpc_private' and table_name = 'storage_connector_secrets') as has_table,
      exists (select 1 from pg_indexes where schemaname = 'wfpc_private' and indexname = 'storage_connector_secrets_tenant_id_idx') as has_tenant_index,
      exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'wfpc_private' and c.relname = 'storage_connector_secrets' and c.relrowsecurity) as has_rls`
  );
  const storageSecretReady = Object.values(storageSecretExisting.rows[0] ?? {}).every(Boolean);
  if (!storageSecretReady) {
    await client.query(readFileSync("supabase/migrations/0007_private_storage_connector_secrets.sql", "utf8"));
  }
  const storageConnectorTenantFkExisting = await client.query(
    `select
      exists (select 1 from pg_constraint where conname = 'storage_connectors_id_tenant_id_key' and conrelid = to_regclass('wfpc.storage_connectors')) as has_unique_connector_tenant,
      exists (select 1 from pg_constraint where conname = 'storage_connector_secrets_connector_tenant_fkey' and conrelid = to_regclass('wfpc_private.storage_connector_secrets')) as has_connector_tenant_fk`
  );
  const storageConnectorTenantFkReady = Object.values(storageConnectorTenantFkExisting.rows[0] ?? {}).every(Boolean);
  if (!storageConnectorTenantFkReady) {
    await client.query(readFileSync("supabase/migrations/0008_storage_connector_tenant_fk.sql", "utf8"));
  }
  const runtimeSharedStateExisting = await client.query(
    `select
      exists (select 1 from information_schema.tables where table_schema = 'wfpc_private' and table_name = 'oauth_pending_states') as has_oauth_pending_states,
      exists (select 1 from pg_indexes where schemaname = 'wfpc_private' and indexname = 'oauth_pending_states_expires_at_idx') as has_oauth_pending_states_expires_idx,
      exists (select 1 from information_schema.tables where table_schema = 'wfpc_private' and table_name = 'rate_limit_buckets') as has_rate_limit_buckets`
  );
  const runtimeSharedStateReady = Object.values(runtimeSharedStateExisting.rows[0] ?? {}).every(Boolean);
  if (!runtimeSharedStateReady) {
    await client.query(readFileSync("supabase/migrations/0010_runtime_shared_state.sql", "utf8"));
  }
  const paperclipSecretBindingExisting = await client.query(
    `select
      exists (select 1 from information_schema.tables where table_schema = 'wfpc' and table_name = 'paperclip_secret_bindings') as has_table,
      exists (select 1 from pg_indexes where schemaname = 'wfpc' and indexname = 'paperclip_secret_bindings_tenant_id_idx') as has_tenant_index,
      exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'wfpc' and c.relname = 'paperclip_secret_bindings' and c.relrowsecurity) as has_rls`
  );
  const paperclipSecretBindingReady = Object.values(paperclipSecretBindingExisting.rows[0] ?? {}).every(Boolean);
  if (!paperclipSecretBindingReady) {
    await client.query(readFileSync("supabase/migrations/0011_paperclip_secret_bindings.sql", "utf8"));
  }
  const paperclipSecretBindingVersionExisting = await client.query(
    `select
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'wfpc'
          and table_name = 'paperclip_secret_bindings'
          and column_name = 'paperclip_secret_version'
      ) as has_version_column`
  );
  const paperclipSecretBindingVersionReady = Object.values(paperclipSecretBindingVersionExisting.rows[0] ?? {}).every(Boolean);
  if (!paperclipSecretBindingVersionReady) {
    await client.query(readFileSync("supabase/migrations/0012_paperclip_secret_binding_versions.sql", "utf8"));
  }
  const paperclipCompanyIssueAgentExisting = await client.query(
    `select
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'wfpc'
          and table_name = 'paperclip_company_mappings'
          and column_name = 'paperclip_issue_agent_id'
      ) as has_issue_agent_column`
  );
  const paperclipCompanyIssueAgentReady = Object.values(paperclipCompanyIssueAgentExisting.rows[0] ?? {}).every(Boolean);
  if (!paperclipCompanyIssueAgentReady) {
    await client.query(readFileSync("supabase/migrations/0013_paperclip_company_issue_agents.sql", "utf8"));
  }
  const paperclipSecretBindingStatusExisting = await client.query(
    `select
      exists (
        select 1
        from pg_constraint
        where conname = 'paperclip_secret_bindings_binding_status_check'
          and conrelid = to_regclass('wfpc.paperclip_secret_bindings')
          and pg_get_constraintdef(oid) like '%synced%'
      ) as has_synced_status`
  );
  const paperclipSecretBindingStatusReady = Object.values(paperclipSecretBindingStatusExisting.rows[0] ?? {}).every(Boolean);
  if (!paperclipSecretBindingStatusReady) {
    await client.query(readFileSync("supabase/migrations/0014_paperclip_secret_binding_synced_status.sql", "utf8"));
  }
  const harnessRunsExisting = await client.query(
    `select
      exists (select 1 from information_schema.tables where table_schema = 'wfpc' and table_name = 'harness_runs') as has_runs,
      exists (select 1 from information_schema.tables where table_schema = 'wfpc' and table_name = 'harness_cards') as has_cards,
      exists (select 1 from information_schema.tables where table_schema = 'wfpc' and table_name = 'harness_card_events') as has_events`
  );
  const harnessRunsReady = Object.values(harnessRunsExisting.rows[0] ?? {}).every(Boolean);
  if (!harnessRunsReady) {
    await client.query(readFileSync("supabase/migrations/0013_wf_harness_runs_cards.sql", "utf8"));
  }
  const harnessProposalExisting = await client.query(
    `select
      exists (select 1 from information_schema.tables where table_schema = 'wfpc' and table_name = 'harness_subcard_proposals') as has_table,
      exists (
        select 1
        from pg_constraint
        where conname = 'harness_subcard_proposals_status_check'
          and conrelid = to_regclass('wfpc.harness_subcard_proposals')
          and pg_get_constraintdef(oid) like '%deferred%'
          and pg_get_constraintdef(oid) like '%denied%'
      ) as has_wide_status_check,
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'wfpc'
          and table_name = 'harness_subcard_proposals'
          and column_name = 'resolution'
      ) as has_resolution_column,
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'wfpc'
          and table_name = 'harness_subcard_proposals'
          and column_name = 'decision_note'
      ) as has_decision_note_column,
      exists (
        select 1
        from pg_constraint
        where conname = 'harness_subcard_proposals_resolution_check'
          and conrelid = to_regclass('wfpc.harness_subcard_proposals')
          and pg_get_constraintdef(oid) like '%create_lane%'
          and pg_get_constraintdef(oid) like '%update_existing_lane%'
          and pg_get_constraintdef(oid) like '%handoff_existing_lane%'
      ) as has_resolution_check,
      exists (
        select 1
        from pg_indexes
        where schemaname = 'wfpc'
          and indexname = 'harness_subcard_proposals_run_status_idx'
      ) as has_run_status_idx,
      not exists (
        select 1
        from pg_indexes
        where schemaname = 'wfpc'
          and indexname in ('harness_subcard_proposals_approved_card_idx', 'wfpc.harness_subcard_proposals_approved_card_idx')
      ) as dropped_approved_card_unique_idx`
  );
  const harnessProposalReady = Object.values(harnessProposalExisting.rows[0] ?? {}).every(Boolean);
  if (!harnessProposalReady) {
    await client.query(readFileSync("supabase/migrations/0014_wf_harness_subcard_proposals.sql", "utf8"));
    await client.query(readFileSync("supabase/migrations/0015_wf_harness_proposal_resolutions.sql", "utf8"));
  }
  const queryHarnessBoardDecisionReady = () =>
    client.query(
      `select
        exists (select 1 from information_schema.tables where table_schema = 'wfpc' and table_name = 'harness_board_decisions') as has_table,
        exists (
          select 1
          from information_schema.columns
          where table_schema = 'wfpc'
            and table_name = 'harness_board_decisions'
            and column_name = 'decision_note'
        ) as has_decision_note_column,
        exists (
          select 1
          from information_schema.columns
          where table_schema = 'wfpc'
            and table_name = 'harness_board_decisions'
            and column_name = 'resolution'
        ) as has_resolution_column,
        exists (
          select 1
          from pg_constraint
          where conname like '%resolution%'
            and conrelid = to_regclass('wfpc.harness_board_decisions')
            and pg_get_constraintdef(oid) like '%create_lane%'
            and pg_get_constraintdef(oid) like '%update_existing_lane%'
            and pg_get_constraintdef(oid) like '%handoff_existing_lane%'
        ) as has_resolution_check,
        exists (
          select 1
          from pg_constraint
          where conname like '%decision_kind%'
            and conrelid = to_regclass('wfpc.harness_board_decisions')
            and pg_get_constraintdef(oid) like '%proposal_denied%'
            and pg_get_constraintdef(oid) like '%run_completed%'
        ) as has_kind_check,
        exists (
          select 1
          from pg_constraint
          where conrelid = to_regclass('wfpc.harness_board_decisions')
            and pg_get_constraintdef(oid) like '%references wfpc.harness_subcard_proposals(id)%'
        ) as has_proposal_fk,
        exists (
          select 1
          from pg_constraint
          where conrelid = to_regclass('wfpc.harness_board_decisions')
            and pg_get_constraintdef(oid) like '%target_card_id%'
            and pg_get_constraintdef(oid) like '%references wfpc.harness_cards(id)%'
        ) as has_target_card_fk,
        exists (
          select 1
          from pg_indexes
          where schemaname = 'wfpc'
            and indexname = 'harness_board_decisions_run_created_at_idx'
        ) as has_run_created_idx,
        exists (
          select 1
          from pg_indexes
          where schemaname = 'wfpc'
            and indexname = 'harness_board_decisions_tenant_created_at_idx'
        ) as has_tenant_created_idx`
    );
  let harnessBoardDecisionExisting = await queryHarnessBoardDecisionReady();
  let harnessBoardDecisionReady = Object.values(harnessBoardDecisionExisting.rows[0] ?? {}).every(Boolean);
  if (!harnessBoardDecisionReady) {
    await client.query(readFileSync("supabase/migrations/0016_wf_harness_board_decisions.sql", "utf8"));
    harnessBoardDecisionExisting = await queryHarnessBoardDecisionReady();
    harnessBoardDecisionReady = Object.values(harnessBoardDecisionExisting.rows[0] ?? {}).every(Boolean);
    if (!harnessBoardDecisionReady) {
      throw new Error("Harness board decisions migration did not produce the required schema shape");
    }
  }
  const queryHarnessBoardMemoryReady = () =>
    client.query(
      `select
        exists (
          select 1
          from information_schema.columns
          where table_schema = 'wfpc'
            and table_name = 'harness_board_decisions'
            and column_name = 'policy_reason'
        ) as has_policy_reason_column,
        exists (
          select 1
          from information_schema.columns
          where table_schema = 'wfpc'
            and table_name = 'harness_board_decisions'
            and column_name = 'recommendation_summary'
        ) as has_recommendation_summary_column,
        exists (
          select 1
          from information_schema.columns
          where table_schema = 'wfpc'
            and table_name = 'harness_board_decisions'
            and column_name = 'objection_summary'
        ) as has_objection_summary_column,
        exists (
          select 1
          from pg_constraint
          where conname = 'harness_board_decisions_policy_reason_check'
            and conrelid = to_regclass('wfpc.harness_board_decisions')
            and pg_get_constraintdef(oid) like '%created_new_lane%'
            and pg_get_constraintdef(oid) like '%reused_existing_lane%'
            and pg_get_constraintdef(oid) like '%deliverable_owner_conflict%'
            and pg_get_constraintdef(oid) like '%lane_cap%'
            and pg_get_constraintdef(oid) like '%scope_guardrail%'
            and pg_get_constraintdef(oid) like '%completed_lanes_only%'
        ) as has_policy_reason_check`
    );
  let harnessBoardMemoryExisting = await queryHarnessBoardMemoryReady();
  let harnessBoardMemoryReady = Object.values(harnessBoardMemoryExisting.rows[0] ?? {}).every(Boolean);
  if (!harnessBoardMemoryReady) {
    await client.query(readFileSync("supabase/migrations/0017_wf_harness_board_memory.sql", "utf8"));
    harnessBoardMemoryExisting = await queryHarnessBoardMemoryReady();
    harnessBoardMemoryReady = Object.values(harnessBoardMemoryExisting.rows[0] ?? {}).every(Boolean);
    if (!harnessBoardMemoryReady) {
      throw new Error("Harness board memory migration did not produce the required schema shape");
    }
  }
  const harnessLaneHandoffExisting = await client.query(
    `select
      exists (
        select 1
        from pg_constraint
        where conname = 'harness_subcard_proposals_resolution_check'
          and conrelid = to_regclass('wfpc.harness_subcard_proposals')
          and pg_get_constraintdef(oid) like '%handoff_existing_lane%'
      ) as has_proposal_handoff_resolution,
      exists (
        select 1
        from pg_constraint
        where conname like '%resolution%'
          and conrelid = to_regclass('wfpc.harness_board_decisions')
          and pg_get_constraintdef(oid) like '%handoff_existing_lane%'
      ) as has_decision_handoff_resolution`
  );
  const harnessLaneHandoffReady = Object.values(harnessLaneHandoffExisting.rows[0] ?? {}).every(Boolean);
  if (!harnessLaneHandoffReady) {
    await client.query(readFileSync("supabase/migrations/0018_wf_harness_lane_handoff.sql", "utf8"));
  }
  const queryHarnessCardContinuityReady = async () =>
    client.query(
      `select
        exists (
          select 1
          from information_schema.tables
          where table_schema = 'wfpc'
            and table_name = 'harness_card_continuity'
        ) as has_table,
        exists (
          select 1
          from information_schema.columns
          where table_schema = 'wfpc'
            and table_name = 'harness_card_continuity'
            and column_name = 'continuity_source'
        ) as has_continuity_source,
        exists (
          select 1
          from information_schema.columns
          where table_schema = 'wfpc'
            and table_name = 'harness_card_continuity'
            and column_name = 'continuity_summary'
        ) as has_continuity_summary,
        exists (
          select 1
          from information_schema.columns
          where table_schema = 'wfpc'
            and table_name = 'harness_card_continuity'
            and column_name = 'latest_result_summary'
        ) as has_latest_result_summary,
        exists (
          select 1
          from information_schema.columns
          where table_schema = 'wfpc'
            and table_name = 'harness_card_continuity'
            and column_name = 'absorbed_work_items'
        ) as has_absorbed_work_items,
        exists (
          select 1
          from pg_constraint
          where conrelid = to_regclass('wfpc.harness_card_continuity')
            and conname = 'harness_card_continuity_source_check'
            and pg_get_constraintdef(oid) like '%state_transition%'
            and pg_get_constraintdef(oid) like '%resume_override%'
            and pg_get_constraintdef(oid) like '%proposal_absorbed%'
            and pg_get_constraintdef(oid) like '%lane_handoff%'
            and pg_get_constraintdef(oid) like '%result_recorded%'
        ) as has_continuity_source_check,
        exists (
          select 1
          from pg_constraint
          where conrelid = to_regclass('wfpc.harness_card_continuity')
            and pg_get_constraintdef(oid) like '%jsonb_typeof(absorbed_work_items)%'
        ) as has_absorbed_work_items_check,
        exists (
          select 1
          from pg_indexes
          where schemaname = 'wfpc'
            and indexname = 'harness_card_continuity_run_updated_at_idx'
        ) as has_run_updated_index`
    );
  let harnessCardContinuityExisting = await queryHarnessCardContinuityReady();
  let harnessCardContinuityReady = Object.values(harnessCardContinuityExisting.rows[0] ?? {}).every(Boolean);
  if (!harnessCardContinuityReady) {
    await client.query(readFileSync("supabase/migrations/0019_wf_harness_card_continuity.sql", "utf8"));
    await client.query(readFileSync("supabase/migrations/0020_wf_harness_card_continuity_source.sql", "utf8"));
    harnessCardContinuityExisting = await queryHarnessCardContinuityReady();
    harnessCardContinuityReady = Object.values(harnessCardContinuityExisting.rows[0] ?? {}).every(Boolean);
    if (!harnessCardContinuityReady) {
      throw new Error("Harness card continuity migration did not produce the required schema shape");
    }
  }
  const { rows } = await client.query(
    "select table_schema, table_name from information_schema.tables where table_schema = 'wfpc' order by table_name"
  );
  console.log(
    JSON.stringify(
      {
        schema: "wfpc",
        migrationApplied:
          !existing.rows[0]?.exists ||
          !acidReady ||
          !purchaseReady ||
          !outboxReady ||
          !boundProviderReady ||
          !activeProviderLaneReady ||
          !vaultReady ||
          !vaultKindReady ||
          !storageSecretReady ||
          !storageConnectorTenantFkReady ||
          !runtimeSharedStateReady ||
          !paperclipSecretBindingReady ||
          !paperclipSecretBindingVersionReady ||
          !paperclipCompanyIssueAgentReady ||
          !paperclipSecretBindingStatusReady ||
          !harnessRunsReady ||
          !harnessProposalReady ||
          !harnessBoardDecisionReady ||
          !harnessBoardMemoryReady ||
          !harnessLaneHandoffReady ||
          !harnessCardContinuityReady,
        tableCount: rows.length,
        tables: rows.map((row) => row.table_name)
      },
      null,
      2
    )
  );
} finally {
  closing = true;
  await client.end();
}
