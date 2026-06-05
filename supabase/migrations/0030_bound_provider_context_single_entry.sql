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
