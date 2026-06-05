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
