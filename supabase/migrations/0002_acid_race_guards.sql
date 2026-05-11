create table if not exists wfpc.workflow_run_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  workflow_template_id uuid not null,
  run_id uuid not null,
  idempotency_key text not null,
  reserved_by_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'reserved' check (status in ('reserved', 'queued', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  foreign key (workflow_template_id, tenant_id)
    references wfpc.workflow_templates(id, tenant_id)
    on delete restrict
);

alter table wfpc.workflow_run_reservations
add column if not exists run_id uuid;

update wfpc.workflow_run_reservations
set run_id = gen_random_uuid()
where run_id is null;

alter table wfpc.workflow_run_reservations
alter column run_id set not null;

alter table wfpc.workflow_templates
add column if not exists package_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workflow_templates_package_fk'
      and conrelid = 'wfpc.workflow_templates'::regclass
  ) then
    alter table wfpc.workflow_templates
    add constraint workflow_templates_package_fk
    foreign key (package_id)
    references wfpc.wealth_factory_packages(id)
    on delete set null;
  end if;
end $$;

create index if not exists workflow_templates_package_idx
on wfpc.workflow_templates (tenant_id, package_id);

create unique index if not exists workflow_run_reservations_idempotency_unique
on wfpc.workflow_run_reservations (tenant_id, workflow_template_id, idempotency_key);

create unique index if not exists workflow_run_reservations_run_id_unique
on wfpc.workflow_run_reservations (run_id);

create index if not exists workflow_run_reservations_tenant_created_idx
on wfpc.workflow_run_reservations (tenant_id, created_at desc);

create unique index if not exists secret_references_active_unique
on wfpc.secret_references (tenant_id, provider_kind, label)
where revoked_at is null;

create unique index if not exists secret_references_tenant_secret_ref_unique
on wfpc.secret_references (tenant_id, secret_ref);

create index if not exists workflow_runs_status_guard_idx
on wfpc.workflow_runs (tenant_id, id, status);

alter table wfpc.workflow_run_reservations enable row level security;
