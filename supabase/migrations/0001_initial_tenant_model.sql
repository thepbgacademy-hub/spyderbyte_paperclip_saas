create extension if not exists "pgcrypto";
create schema if not exists private;

create type public.tenant_role as enum ('owner', 'admin', 'member', 'operator');
create type public.workflow_run_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');
create type public.provider_kind as enum (
  'openai',
  'openai_api',
  'openai_chatgpt_codex_subscription',
  'anthropic_api',
  'xai_grok_api',
  'openrouter_api',
  'generic_api'
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  paused_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_memberships (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.tenant_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table public.paperclip_company_mappings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  paperclip_company_id text not null unique,
  created_at timestamptz not null default now()
);

create table public.workflow_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  provider_kind public.provider_kind not null default 'openai',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);

create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  workflow_template_id uuid not null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  status public.workflow_run_status not null default 'queued',
  public_result jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workflow_template_id, tenant_id)
    references public.workflow_templates(id, tenant_id)
    on delete restrict,
  check (jsonb_typeof(public_result) = 'object')
);

create table public.secret_references (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_kind public.provider_kind not null,
  label text not null,
  secret_ref text not null,
  metadata jsonb not null default '{}'::jsonb,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(metadata) = 'object')
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(metadata) = 'object')
);

create table public.operator_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operator_user_id uuid not null references auth.users(id) on delete restrict,
  action_type text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(metadata) = 'object')
);

create index tenant_memberships_user_id_idx on public.tenant_memberships (user_id);
create index workflow_templates_tenant_id_idx on public.workflow_templates (tenant_id);
create index workflow_runs_tenant_id_idx on public.workflow_runs (tenant_id);
create index workflow_runs_template_idx on public.workflow_runs (workflow_template_id);
create index secret_references_tenant_id_idx on public.secret_references (tenant_id);
create index audit_events_tenant_id_created_at_idx on public.audit_events (tenant_id, created_at desc);
create index operator_actions_tenant_id_created_at_idx on public.operator_actions (tenant_id, created_at desc);

create function private.is_tenant_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.tenant_memberships
    where tenant_id = target_tenant_id
      and user_id = auth.uid()
  );
$$;

create function private.is_tenant_operator(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.tenant_memberships
    where tenant_id = target_tenant_id
      and user_id = auth.uid()
      and role in ('owner', 'admin', 'operator')
  );
$$;

create function private.workflow_template_belongs_to_tenant(target_template_id uuid, target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workflow_templates
    where id = target_template_id
      and tenant_id = target_tenant_id
  );
$$;

revoke all on schema private from public;
revoke all on all functions in schema private from public;
grant usage on schema private to authenticated;
grant execute on function private.is_tenant_member(uuid) to authenticated;
grant execute on function private.is_tenant_operator(uuid) to authenticated;
grant execute on function private.workflow_template_belongs_to_tenant(uuid, uuid) to authenticated;

alter table public.tenants enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.paperclip_company_mappings enable row level security;
alter table public.workflow_templates enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.secret_references enable row level security;
alter table public.audit_events enable row level security;
alter table public.operator_actions enable row level security;

create policy "members can read tenants"
on public.tenants for select
to authenticated
using (private.is_tenant_member(id));

create policy "members can read memberships"
on public.tenant_memberships for select
to authenticated
using (private.is_tenant_member(tenant_id));

create policy "members can read paperclip mappings"
on public.paperclip_company_mappings for select
to authenticated
using (private.is_tenant_member(tenant_id));

create policy "members can read workflow templates"
on public.workflow_templates for select
to authenticated
using (private.is_tenant_member(tenant_id));

create policy "members can read workflow runs"
on public.workflow_runs for select
to authenticated
using (private.is_tenant_member(tenant_id));

create policy "members can create workflow runs"
on public.workflow_runs for insert
to authenticated
with check (
  private.is_tenant_member(tenant_id)
  and private.workflow_template_belongs_to_tenant(workflow_template_id, tenant_id)
  and created_by_user_id = auth.uid()
);

create policy "members can read audit events"
on public.audit_events for select
to authenticated
using (private.is_tenant_member(tenant_id));

create policy "operators can read operator actions"
on public.operator_actions for select
to authenticated
using (private.is_tenant_operator(tenant_id));

create policy "operators can create operator actions"
on public.operator_actions for insert
to authenticated
with check (
  private.is_tenant_operator(tenant_id)
  and operator_user_id = auth.uid()
);
