create unique index if not exists harness_runs_id_tenant_unique_idx
  on wfpc.harness_runs (id, tenant_id);

create table if not exists wfpc.harness_result_approval_states (
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  run_id uuid not null,
  result_id text not null,
  approval_state text not null check (approval_state in ('Awaiting review', 'Approved', 'Revision needed')),
  actor_user_id text null,
  decision_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint harness_result_approval_states_run_tenant_fk
    foreign key (run_id, tenant_id) references wfpc.harness_runs(id, tenant_id) on delete cascade,
  primary key (tenant_id, run_id, result_id)
);

create index if not exists harness_result_approval_states_tenant_updated_idx
  on wfpc.harness_result_approval_states (tenant_id, updated_at desc);

alter table wfpc.harness_result_approval_states enable row level security;

drop policy if exists "members can read harness result approval states"
  on wfpc.harness_result_approval_states;

create policy "members can read harness result approval states"
  on wfpc.harness_result_approval_states
  for select
  using (wfpc_private.is_tenant_member(tenant_id));
