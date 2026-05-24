alter table if exists wfpc.harness_card_continuity
  add column if not exists continuity_source text not null default 'state_transition';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'harness_card_continuity_source_check'
      and conrelid = to_regclass('wfpc.harness_card_continuity')
  ) then
    alter table wfpc.harness_card_continuity
      add constraint harness_card_continuity_source_check
      check (
        continuity_source in (
          'state_transition',
          'resume_override',
          'proposal_absorbed',
          'lane_handoff',
          'result_recorded'
        )
      );
  end if;
end
$$;
