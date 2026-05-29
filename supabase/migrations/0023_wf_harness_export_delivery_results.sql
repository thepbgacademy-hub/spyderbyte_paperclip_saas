alter table wfpc.harness_export_deliveries
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempted_at timestamptz null,
  add column if not exists delivered_at timestamptz null,
  add column if not exists writer_kind text null,
  add column if not exists delivery_receipt jsonb not null default '{}'::jsonb,
  add column if not exists last_error_code text null,
  add column if not exists last_error_message text null;

alter table wfpc.harness_export_deliveries
  drop constraint if exists harness_export_deliveries_status_check;

alter table wfpc.harness_export_deliveries
  add constraint harness_export_deliveries_status_check
  check (status in ('export_ready', 'delivered', 'delivery_failed'));

alter table wfpc.harness_export_deliveries
  drop constraint if exists harness_export_deliveries_writer_kind_check;

alter table wfpc.harness_export_deliveries
  add constraint harness_export_deliveries_writer_kind_check
  check (writer_kind is null or writer_kind in ('obsidian_filesystem'));

alter table wfpc.harness_export_deliveries
  drop constraint if exists harness_export_deliveries_delivery_receipt_object_check;

alter table wfpc.harness_export_deliveries
  add constraint harness_export_deliveries_delivery_receipt_object_check
  check (jsonb_typeof(delivery_receipt) = 'object');
