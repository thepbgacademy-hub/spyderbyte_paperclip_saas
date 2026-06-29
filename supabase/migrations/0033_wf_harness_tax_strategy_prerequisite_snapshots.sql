create table if not exists wfpc.harness_tax_strategy_prerequisite_snapshots (
  run_id uuid primary key references wfpc.harness_runs(id) on delete cascade,
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  workflow_id text not null,
  package_id text not null,
  snapshot_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint harness_tax_strategy_prerequisite_snapshots_payload_is_object
    check (jsonb_typeof(snapshot_payload) = 'object')
);

create index if not exists harness_tax_strategy_prerequisite_snapshots_tenant_updated_idx
  on wfpc.harness_tax_strategy_prerequisite_snapshots (tenant_id, updated_at desc);

alter table wfpc.harness_tax_strategy_prerequisite_snapshots enable row level security;

drop policy if exists "members can read harness tax strategy prerequisite snapshots"
  on wfpc.harness_tax_strategy_prerequisite_snapshots;

create policy "members can read harness tax strategy prerequisite snapshots"
  on wfpc.harness_tax_strategy_prerequisite_snapshots
  for select
  using (wfpc_private.is_tenant_member(tenant_id));
