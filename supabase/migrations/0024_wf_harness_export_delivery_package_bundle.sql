alter table wfpc.harness_export_deliveries
  drop constraint if exists harness_export_deliveries_candidate_id_check;

alter table wfpc.harness_export_deliveries
  add constraint harness_export_deliveries_candidate_id_check
  check (candidate_id in ('governance_history_export', 'package_bundle_export'));

alter table wfpc.harness_export_deliveries
  drop constraint if exists harness_export_deliveries_record_target_check;

alter table wfpc.harness_export_deliveries
  add constraint harness_export_deliveries_record_target_check
  check (record_target in ('governance_history_record', 'package_deliverable_record'));
