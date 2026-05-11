create table if not exists wfpc_private.vault_secrets (
  secret_ref text primary key,
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  provider_kind wfpc.provider_kind not null,
  ciphertext text not null,
  iv text not null,
  tag text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table wfpc_private.vault_secrets enable row level security;

revoke all on wfpc_private.vault_secrets from public;
revoke all on wfpc_private.vault_secrets from authenticated;

create index if not exists vault_secrets_tenant_id_idx
on wfpc_private.vault_secrets (tenant_id);
