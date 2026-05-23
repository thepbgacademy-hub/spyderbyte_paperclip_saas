alter table wfpc.harness_subcard_proposals
  drop constraint if exists harness_subcard_proposals_resolution_check;

alter table wfpc.harness_subcard_proposals
  add constraint harness_subcard_proposals_resolution_check
  check (resolution is null or resolution in ('create_lane', 'update_existing_lane', 'handoff_existing_lane'));

alter table wfpc.harness_board_decisions
  drop constraint if exists harness_board_decisions_resolution_check;

alter table wfpc.harness_board_decisions
  add constraint harness_board_decisions_resolution_check
  check (resolution is null or resolution in ('create_lane', 'update_existing_lane', 'handoff_existing_lane'));
