create table if not exists wfpc_private.storage_connector_secrets (
  storage_connector_id uuid primary key references wfpc.storage_connectors(id) on delete cascade,
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  provider_kind text not null,
  secret_refs jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(secret_refs) = 'object')
);

alter table wfpc_private.storage_connector_secrets enable row level security;

revoke all on wfpc_private.storage_connector_secrets from public;
revoke all on wfpc_private.storage_connector_secrets from authenticated;

create index if not exists storage_connector_secrets_tenant_id_idx
on wfpc_private.storage_connector_secrets (tenant_id);
