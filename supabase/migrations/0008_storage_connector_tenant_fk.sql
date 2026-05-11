do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'storage_connectors_id_tenant_id_key'
      and conrelid = 'wfpc.storage_connectors'::regclass
  ) then
    alter table wfpc.storage_connectors
      add constraint storage_connectors_id_tenant_id_key unique (id, tenant_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'storage_connector_secrets_connector_tenant_fkey'
      and conrelid = 'wfpc_private.storage_connector_secrets'::regclass
  ) then
    alter table wfpc_private.storage_connector_secrets
      add constraint storage_connector_secrets_connector_tenant_fkey
      foreign key (storage_connector_id, tenant_id)
      references wfpc.storage_connectors (id, tenant_id)
      on delete cascade;
  end if;
end $$;
