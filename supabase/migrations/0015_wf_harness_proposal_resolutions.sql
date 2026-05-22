alter table wfpc.harness_subcard_proposals
  drop constraint if exists harness_subcard_proposals_status_check;

alter table wfpc.harness_subcard_proposals
  add column if not exists resolution text null,
  add column if not exists decision_note text null;

update wfpc.harness_subcard_proposals
set resolution = 'create_lane'
where status = 'approved'
  and approved_card_id is not null
  and resolution is null;

alter table wfpc.harness_subcard_proposals
  add constraint harness_subcard_proposals_status_check
  check (status in ('proposed', 'approved', 'deferred', 'denied'));

alter table wfpc.harness_subcard_proposals
  add constraint harness_subcard_proposals_resolution_check
  check (resolution is null or resolution in ('create_lane', 'update_existing_lane'));

drop index if exists wfpc.harness_subcard_proposals_approved_card_idx;
drop index if exists harness_subcard_proposals_approved_card_idx;

create index if not exists harness_subcard_proposals_run_status_idx
on wfpc.harness_subcard_proposals (run_id, status, created_at asc);
