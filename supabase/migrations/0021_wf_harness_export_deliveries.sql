create table if not exists wfpc.harness_export_deliveries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references wfpc.harness_runs(id) on delete cascade,
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  workflow_id text not null,
  package_id text not null,
  candidate_id text not null check (candidate_id in ('governance_history_export')),
  status text not null check (status in ('export_ready')),
  export_format text not null check (export_format in ('obsidian_markdown_bundle')),
  record_target text not null check (record_target in ('governance_history_record')),
  bundle_id text not null,
  idempotency_key text not null,
  note_title text not null,
  note_file_name text not null,
  placement_manifest jsonb not null,
  files jsonb not null default '[]'::jsonb,
  record_count integer not null check (record_count >= 0),
  disclosure_summary text not null,
  redaction_summary text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(placement_manifest) = 'object'),
  check (jsonb_typeof(files) = 'array')
);

create unique index if not exists harness_export_deliveries_idempotency_key_idx
on wfpc.harness_export_deliveries (idempotency_key);

create index if not exists harness_export_deliveries_run_created_at_idx
on wfpc.harness_export_deliveries (run_id, created_at desc);
