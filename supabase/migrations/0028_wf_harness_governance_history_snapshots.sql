create table if not exists wfpc.harness_governance_history_snapshots (
  run_id uuid primary key references wfpc.harness_runs(id) on delete cascade,
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  workflow_id text not null,
  package_id text not null,
  snapshot_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint harness_governance_history_snapshots_payload_is_object
    check (jsonb_typeof(snapshot_payload) = 'object')
);

create index if not exists harness_governance_history_snapshots_tenant_updated_idx
  on wfpc.harness_governance_history_snapshots (tenant_id, updated_at desc);

alter table wfpc.harness_governance_history_snapshots enable row level security;

drop policy if exists "members can read harness governance history snapshots"
  on wfpc.harness_governance_history_snapshots;

create policy "members can read harness governance history snapshots"
  on wfpc.harness_governance_history_snapshots
  for select
  using (wfpc_private.is_tenant_member(tenant_id));
