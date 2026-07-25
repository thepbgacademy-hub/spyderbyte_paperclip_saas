-- TASK-084: durable persistence for the factory run driver spine. 0038/0039
-- persist a run's deliverables and approval checkpoints, but nothing before
-- this migration persists the run's own progress (intake-run-service.ts's
-- IntakeRun shape: status, currentStationKey/completedStationKey, the active
-- deliverable/approval slots, positioningRevisionGeneration) -- every prior
-- test seeded that state in memory rather than reloading it. Isolation is
-- app-layer tenant_id scoping (WHERE tenant_id = $1) in the repository, same
-- load-bearing pattern as 0037/0038/0039; RLS below is defense in depth, not
-- the mechanism the isolation test proves (TASK-084 AC5).

create table if not exists wfpc.factory_runs (
  run_id text not null,
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  package_install_id text not null,
  package_id text not null,
  package_version_id text not null,
  status text not null check (
    status in ('draft', 'ready', 'running', 'waiting_for_input', 'waiting_for_approval', 'completed', 'failed')
  ),
  current_station_key text null check (current_station_key in ('intake', 'positioning')),
  completed_station_key text null check (completed_station_key in ('intake', 'positioning')),
  active_deliverable_id text null,
  active_approval_id text null,
  active_approval_contract_key text null check (active_approval_contract_key in ('original', 'revision_1')),
  positioning_revision_generation smallint not null default 0 check (positioning_revision_generation in (0, 1)),
  started_at timestamptz not null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, run_id),
  constraint factory_runs_install_fk
    foreign key (package_install_id) references wfpc.factory_blueprint_package_installs(install_id)
);

comment on table wfpc.factory_runs is
  'Blueprint-native factory run progress (TASK-084 run-driver spine); distinct from wfpc.factory_run_deliverables/factory_run_approvals, which persist per-station output.';

create index if not exists factory_runs_tenant_install_idx
  on wfpc.factory_runs (tenant_id, package_install_id);

alter table wfpc.factory_runs enable row level security;

drop policy if exists "members can read factory runs"
  on wfpc.factory_runs;

create policy "members can read factory runs"
  on wfpc.factory_runs
  for select
  to authenticated
  using (wfpc_private.is_tenant_member(tenant_id));
