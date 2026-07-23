-- TASK-055 walking skeleton: durable persistence for station deliverables.
-- No run/deliverable persistence table existed before this migration (only
-- the B19 package-install tables from 0037) -- AC2 requires a deliverable to
-- survive logout, so this is the smallest addition that satisfies it.
-- Isolation is app-layer tenant_id scoping (WHERE tenant_id = $1) in the
-- repository, same as the rest of this schema; RLS below is defense in
-- depth, not the mechanism the skeleton's isolation test proves (TASK-055 AC3).

create table if not exists wfpc.factory_run_deliverables (
  deliverable_id text primary key,
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  run_id text not null,
  package_install_id text not null,
  station_key text not null,
  kind text not null,
  title text not null,
  body jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint factory_run_deliverables_install_fk
    foreign key (package_install_id) references wfpc.factory_blueprint_package_installs(install_id),
  constraint factory_run_deliverables_body_check check (jsonb_typeof(body) = 'object')
);

create index if not exists factory_run_deliverables_tenant_run_idx
  on wfpc.factory_run_deliverables (tenant_id, run_id);

alter table wfpc.factory_run_deliverables enable row level security;

drop policy if exists "members can read factory run deliverables"
  on wfpc.factory_run_deliverables;

create policy "members can read factory run deliverables"
  on wfpc.factory_run_deliverables
  for select
  to authenticated
  using (wfpc_private.is_tenant_member(tenant_id));
