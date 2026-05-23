alter table wfpc.harness_board_decisions
  add column if not exists policy_reason text null,
  add column if not exists recommendation_summary text null,
  add column if not exists objection_summary text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'harness_board_decisions_policy_reason_check'
      and conrelid = to_regclass('wfpc.harness_board_decisions')
  ) then
    alter table wfpc.harness_board_decisions
      add constraint harness_board_decisions_policy_reason_check
      check (
        policy_reason is null
        or policy_reason in (
          'created_new_lane',
          'reused_existing_lane',
          'deliverable_owner_conflict',
          'lane_cap',
          'scope_guardrail',
          'completed_lanes_only'
        )
      );
  end if;
end $$;
