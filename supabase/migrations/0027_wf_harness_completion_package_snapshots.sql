create table if not exists wfpc.harness_completion_package_snapshots (
  run_id uuid primary key references wfpc.harness_runs(id) on delete cascade,
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  workflow_id text not null,
  package_id text not null,
  snapshot_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(snapshot_payload) = 'object')
);

create index if not exists harness_completion_package_snapshots_tenant_updated_at_idx
on wfpc.harness_completion_package_snapshots (tenant_id, updated_at desc);

alter table wfpc.harness_completion_package_snapshots enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'wfpc'
      and tablename = 'harness_completion_package_snapshots'
      and policyname = 'members can read harness completion package snapshots'
  ) then
    create policy "members can read harness completion package snapshots"
    on wfpc.harness_completion_package_snapshots for select
    to authenticated
    using (wfpc_private.is_tenant_member(tenant_id));
  end if;
end $$;
