create extension if not exists "pgcrypto";
create schema if not exists wfpc;
create schema if not exists wfpc_private;

create type wfpc.tenant_role as enum ('owner', 'admin', 'member', 'operator');
create type wfpc.workflow_run_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');
create type wfpc.provider_kind as enum (
  'openai',
  'openai_api',
  'openai_chatgpt_codex_subscription',
  'anthropic_api',
  'xai_grok_api',
  'openrouter_api',
  'generic_api'
);

create table wfpc.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  paused_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table wfpc.tenant_memberships (
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role wfpc.tenant_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table wfpc.paperclip_company_mappings (
  tenant_id uuid primary key references wfpc.tenants(id) on delete cascade,
  paperclip_company_id text not null unique,
  created_at timestamptz not null default now()
);

create table wfpc.workflow_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  name text not null,
  description text,
  provider_kind wfpc.provider_kind not null default 'openai',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);

create table wfpc.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  workflow_template_id uuid not null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  status wfpc.workflow_run_status not null default 'queued',
  public_result jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workflow_template_id, tenant_id)
    references wfpc.workflow_templates(id, tenant_id)
    on delete restrict,
  check (jsonb_typeof(public_result) = 'object')
);

create table wfpc.secret_references (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  provider_kind wfpc.provider_kind not null,
  label text not null,
  secret_ref text not null,
  metadata jsonb not null default '{}'::jsonb,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(metadata) = 'object')
);

create table wfpc.wealth_factory_packages (
  id uuid primary key default gen_random_uuid(),
  package_key text not null unique,
  name text not null,
  kind text not null check (kind in ('industry', 'blank_canvas')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(metadata) = 'object')
);

create table wfpc.tenant_package_installs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  package_id uuid not null references wfpc.wealth_factory_packages(id) on delete restrict,
  installed_by_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'paused', 'removed')),
  installed_at timestamptz not null default now(),
  unique (tenant_id, package_id)
);

create table wfpc.package_provider_requirements (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references wfpc.wealth_factory_packages(id) on delete cascade,
  capability text not null,
  required boolean not null default false,
  provider_kind wfpc.provider_kind,
  created_at timestamptz not null default now()
);

create table wfpc.artifact_metadata (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  workflow_run_id uuid not null references wfpc.workflow_runs(id) on delete cascade,
  package_id uuid references wfpc.wealth_factory_packages(id) on delete set null,
  artifact_type text not null,
  filename text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  checksum text not null,
  expires_at timestamptz not null,
  purged_at timestamptz,
  export_status text not null default 'not_exported',
  created_at timestamptz not null default now()
);

create table wfpc.storage_connectors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  provider_kind text not null,
  display_name text not null,
  public_target jsonb not null default '{}'::jsonb,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(public_target) = 'object')
);

create table wfpc.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(metadata) = 'object')
);

create table wfpc.operator_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  operator_user_id uuid not null references auth.users(id) on delete restrict,
  action_type text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(metadata) = 'object')
);

create index tenant_memberships_user_id_idx on wfpc.tenant_memberships (user_id);
create index workflow_templates_tenant_id_idx on wfpc.workflow_templates (tenant_id);
create index workflow_runs_tenant_id_idx on wfpc.workflow_runs (tenant_id);
create index workflow_runs_template_idx on wfpc.workflow_runs (workflow_template_id);
create index secret_references_tenant_id_idx on wfpc.secret_references (tenant_id);
create index tenant_package_installs_tenant_id_idx on wfpc.tenant_package_installs (tenant_id);
create index package_provider_requirements_package_id_idx on wfpc.package_provider_requirements (package_id);
create index artifact_metadata_tenant_id_created_at_idx on wfpc.artifact_metadata (tenant_id, created_at desc);
create index storage_connectors_tenant_id_idx on wfpc.storage_connectors (tenant_id);
create index audit_events_tenant_id_created_at_idx on wfpc.audit_events (tenant_id, created_at desc);
create index operator_actions_tenant_id_created_at_idx on wfpc.operator_actions (tenant_id, created_at desc);

create function wfpc_private.is_tenant_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = wfpc, auth
as $$
  select exists (
    select 1
    from wfpc.tenant_memberships
    where tenant_id = target_tenant_id
      and user_id = auth.uid()
  );
$$;

create function wfpc_private.is_tenant_operator(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = wfpc, auth
as $$
  select exists (
    select 1
    from wfpc.tenant_memberships
    where tenant_id = target_tenant_id
      and user_id = auth.uid()
      and role in ('owner', 'admin', 'operator')
  );
$$;

create function wfpc_private.workflow_template_belongs_to_tenant(target_template_id uuid, target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = wfpc
as $$
  select exists (
    select 1
    from wfpc.workflow_templates
    where id = target_template_id
      and tenant_id = target_tenant_id
  );
$$;

revoke all on schema wfpc_private from public;
revoke all on all functions in schema wfpc_private from public;
grant usage on schema wfpc_private to authenticated;
grant execute on function wfpc_private.is_tenant_member(uuid) to authenticated;
grant execute on function wfpc_private.is_tenant_operator(uuid) to authenticated;
grant execute on function wfpc_private.workflow_template_belongs_to_tenant(uuid, uuid) to authenticated;

alter table wfpc.tenants enable row level security;
alter table wfpc.tenant_memberships enable row level security;
alter table wfpc.paperclip_company_mappings enable row level security;
alter table wfpc.workflow_templates enable row level security;
alter table wfpc.workflow_runs enable row level security;
alter table wfpc.secret_references enable row level security;
alter table wfpc.wealth_factory_packages enable row level security;
alter table wfpc.tenant_package_installs enable row level security;
alter table wfpc.package_provider_requirements enable row level security;
alter table wfpc.artifact_metadata enable row level security;
alter table wfpc.storage_connectors enable row level security;
alter table wfpc.audit_events enable row level security;
alter table wfpc.operator_actions enable row level security;

create policy "members can read tenants"
on wfpc.tenants for select
to authenticated
using (wfpc_private.is_tenant_member(id));

create policy "members can read memberships"
on wfpc.tenant_memberships for select
to authenticated
using (wfpc_private.is_tenant_member(tenant_id));

create policy "members can read paperclip mappings"
on wfpc.paperclip_company_mappings for select
to authenticated
using (wfpc_private.is_tenant_member(tenant_id));

create policy "members can read workflow templates"
on wfpc.workflow_templates for select
to authenticated
using (wfpc_private.is_tenant_member(tenant_id));

create policy "members can read workflow runs"
on wfpc.workflow_runs for select
to authenticated
using (wfpc_private.is_tenant_member(tenant_id));

create policy "members can read package catalog"
on wfpc.wealth_factory_packages for select
to authenticated
using (true);

create policy "members can read tenant package installs"
on wfpc.tenant_package_installs for select
to authenticated
using (wfpc_private.is_tenant_member(tenant_id));

create policy "members can read package provider requirements"
on wfpc.package_provider_requirements for select
to authenticated
using (true);

create policy "members can read artifact metadata"
on wfpc.artifact_metadata for select
to authenticated
using (wfpc_private.is_tenant_member(tenant_id));

create policy "members can read storage connectors"
on wfpc.storage_connectors for select
to authenticated
using (wfpc_private.is_tenant_member(tenant_id));

create policy "members can create workflow runs"
on wfpc.workflow_runs for insert
to authenticated
with check (
  wfpc_private.is_tenant_member(tenant_id)
  and wfpc_private.workflow_template_belongs_to_tenant(workflow_template_id, tenant_id)
  and created_by_user_id = auth.uid()
);

create policy "members can read audit events"
on wfpc.audit_events for select
to authenticated
using (wfpc_private.is_tenant_member(tenant_id));

create policy "operators can read operator actions"
on wfpc.operator_actions for select
to authenticated
using (wfpc_private.is_tenant_operator(tenant_id));

create policy "operators can create operator actions"
on wfpc.operator_actions for insert
to authenticated
with check (
  wfpc_private.is_tenant_operator(tenant_id)
  and operator_user_id = auth.uid()
);
