alter table wfpc.workflow_runs
add column if not exists bound_secret_reference_id uuid references wfpc.secret_references(id) on delete restrict;

alter table wfpc.workflow_runs
add column if not exists bound_provider_context jsonb not null default '[]'::jsonb;

update wfpc.workflow_runs
set bound_provider_context = '[]'::jsonb
where bound_provider_context is null;

alter table wfpc.workflow_runs
alter column bound_provider_context set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workflow_runs_bound_provider_context_object_check'
      and conrelid = 'wfpc.workflow_runs'::regclass
  ) then
    alter table wfpc.workflow_runs
    add constraint workflow_runs_bound_provider_context_object_check
    check (jsonb_typeof(bound_provider_context) = 'array');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workflow_runs_bound_provider_context_single_entry_check'
      and conrelid = 'wfpc.workflow_runs'::regclass
  ) then
    alter table wfpc.workflow_runs
    add constraint workflow_runs_bound_provider_context_single_entry_check
    check (jsonb_array_length(bound_provider_context) <= 1);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workflow_runs_bound_provider_context_binding_check'
      and conrelid = 'wfpc.workflow_runs'::regclass
  ) then
    alter table wfpc.workflow_runs
    add constraint workflow_runs_bound_provider_context_binding_check
    check (
      (bound_secret_reference_id is null and jsonb_array_length(bound_provider_context) = 0)
      or
      (bound_secret_reference_id is not null and jsonb_array_length(bound_provider_context) = 1)
    );
  end if;
end $$;

create index if not exists workflow_runs_bound_secret_reference_idx
on wfpc.workflow_runs (tenant_id, bound_secret_reference_id);
