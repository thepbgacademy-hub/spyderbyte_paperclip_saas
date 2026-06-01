alter table wfpc.harness_export_deliveries
  drop constraint if exists harness_export_deliveries_status_check;

alter table wfpc.harness_export_deliveries
  add constraint harness_export_deliveries_status_check
  check (status in ('export_ready', 'delivery_in_progress', 'delivered', 'delivery_failed'));
