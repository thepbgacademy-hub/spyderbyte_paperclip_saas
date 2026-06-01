alter table wfpc.harness_export_deliveries
  add column if not exists bundle_revision text;

update wfpc.harness_export_deliveries
   set bundle_revision = coalesce(nullif(bundle_revision, ''), bundle_id)
 where bundle_revision is null
    or bundle_revision = '';

alter table wfpc.harness_export_deliveries
  alter column bundle_revision set not null;
