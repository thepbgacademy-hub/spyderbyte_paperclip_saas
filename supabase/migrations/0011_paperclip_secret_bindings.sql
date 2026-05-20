create table if not exists wfpc.paperclip_secret_bindings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  wealth_factory_secret_reference_id uuid not null references wfpc.secret_references(id) on delete cascade,
  paperclip_company_id text not null,
  paperclip_agent_id text not null,
  paperclip_env_key text not null,
  paperclip_secret_id text not null,
  paperclip_secret_key text not null,
  provider_kind wfpc.provider_kind not null,
  binding_status text not null check (binding_status in ('active', 'revoked', 'error')),
  last_synced_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wealth_factory_secret_reference_id, paperclip_company_id, paperclip_agent_id, paperclip_env_key)
);

create index if not exists paperclip_secret_bindings_tenant_id_idx
on wfpc.paperclip_secret_bindings (tenant_id, provider_kind, binding_status);

alter table wfpc.paperclip_secret_bindings enable row level security;
