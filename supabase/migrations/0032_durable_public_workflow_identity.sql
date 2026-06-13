alter table wfpc.workflow_run_reservations
add column if not exists public_workflow_id text;

alter table wfpc.workflow_run_reservations
add column if not exists workflow_identity_kind text;

alter table wfpc.workflow_run_reservations
add column if not exists workflow_package_id uuid;

alter table wfpc.workflow_runs
add column if not exists public_workflow_id text;

alter table wfpc.workflow_runs
add column if not exists workflow_identity_kind text;

alter table wfpc.workflow_runs
add column if not exists workflow_package_id uuid;

alter table wfpc.workflow_runs
add column if not exists workflow_definition_snapshot jsonb not null default '{}'::jsonb;

alter table wfpc.workflow_queue_outbox
add column if not exists public_workflow_id text;

alter table wfpc.workflow_queue_outbox
add column if not exists workflow_identity_kind text;

alter table wfpc.workflow_queue_outbox
add column if not exists workflow_package_id uuid;

update wfpc.workflow_run_reservations
set public_workflow_id = coalesce(public_workflow_id, workflow_template_id::text),
    workflow_identity_kind = coalesce(workflow_identity_kind, 'tenant_template');

update wfpc.workflow_runs
set public_workflow_id = coalesce(public_workflow_id, workflow_template_id::text),
    workflow_identity_kind = coalesce(workflow_identity_kind, 'tenant_template');

update wfpc.workflow_queue_outbox
set public_workflow_id = coalesce(public_workflow_id, workflow_template_id::text),
    workflow_identity_kind = coalesce(workflow_identity_kind, 'tenant_template');

update wfpc.workflow_run_reservations reservations
set workflow_package_id = coalesce(reservations.workflow_package_id, templates.package_id)
from wfpc.workflow_templates templates
where reservations.workflow_template_id = templates.id
  and reservations.tenant_id = templates.tenant_id;

update wfpc.workflow_runs runs
set workflow_package_id = coalesce(runs.workflow_package_id, templates.package_id)
from wfpc.workflow_templates templates
where runs.workflow_template_id = templates.id
  and runs.tenant_id = templates.tenant_id;

update wfpc.workflow_queue_outbox outbox
set workflow_package_id = coalesce(outbox.workflow_package_id, templates.package_id)
from wfpc.workflow_templates templates
where outbox.workflow_template_id = templates.id
  and outbox.tenant_id = templates.tenant_id;

alter table wfpc.workflow_run_reservations
alter column public_workflow_id set not null;

alter table wfpc.workflow_run_reservations
alter column workflow_identity_kind set not null;

alter table wfpc.workflow_runs
alter column public_workflow_id set not null;

alter table wfpc.workflow_runs
alter column workflow_identity_kind set not null;

alter table wfpc.workflow_queue_outbox
alter column public_workflow_id set not null;

alter table wfpc.workflow_queue_outbox
alter column workflow_identity_kind set not null;

alter table wfpc.workflow_run_reservations
alter column workflow_template_id drop not null;

alter table wfpc.workflow_runs
alter column workflow_template_id drop not null;

alter table wfpc.workflow_queue_outbox
alter column workflow_template_id drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workflow_run_reservations_workflow_package_fk'
      and conrelid = 'wfpc.workflow_run_reservations'::regclass
  ) then
    alter table wfpc.workflow_run_reservations
    add constraint workflow_run_reservations_workflow_package_fk
    foreign key (workflow_package_id)
    references wfpc.wealth_factory_packages(id)
    on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'workflow_runs_workflow_package_fk'
      and conrelid = 'wfpc.workflow_runs'::regclass
  ) then
    alter table wfpc.workflow_runs
    add constraint workflow_runs_workflow_package_fk
    foreign key (workflow_package_id)
    references wfpc.wealth_factory_packages(id)
    on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'workflow_queue_outbox_workflow_package_fk'
      and conrelid = 'wfpc.workflow_queue_outbox'::regclass
  ) then
    alter table wfpc.workflow_queue_outbox
    add constraint workflow_queue_outbox_workflow_package_fk
    foreign key (workflow_package_id)
    references wfpc.wealth_factory_packages(id)
    on delete set null;
  end if;
end $$;

do $$
begin
  alter table wfpc.workflow_run_reservations
  drop constraint if exists workflow_run_reservations_identity_kind_check;

  alter table wfpc.workflow_run_reservations
  add constraint workflow_run_reservations_identity_kind_check
  check (
    workflow_identity_kind in ('tenant_template', 'installed_package_overlay')
    and (
      (workflow_identity_kind = 'tenant_template' and workflow_template_id is not null)
      or (workflow_identity_kind = 'installed_package_overlay' and workflow_template_id is null and workflow_package_id is not null)
    )
  );

  alter table wfpc.workflow_runs
  drop constraint if exists workflow_runs_identity_kind_check;

  alter table wfpc.workflow_runs
  add constraint workflow_runs_identity_kind_check
  check (
    workflow_identity_kind in ('tenant_template', 'installed_package_overlay')
    and (
      (workflow_identity_kind = 'tenant_template' and workflow_template_id is not null)
      or (workflow_identity_kind = 'installed_package_overlay' and workflow_template_id is null and workflow_package_id is not null)
    )
  );

  alter table wfpc.workflow_queue_outbox
  drop constraint if exists workflow_queue_outbox_identity_kind_check;

  alter table wfpc.workflow_queue_outbox
  add constraint workflow_queue_outbox_identity_kind_check
  check (
    workflow_identity_kind in ('tenant_template', 'installed_package_overlay')
    and (
      (workflow_identity_kind = 'tenant_template' and workflow_template_id is not null)
      or (workflow_identity_kind = 'installed_package_overlay' and workflow_template_id is null and workflow_package_id is not null)
    )
  );
end $$;

drop index if exists wfpc.workflow_run_reservations_idempotency_unique;
create unique index if not exists workflow_run_reservations_public_idempotency_unique
on wfpc.workflow_run_reservations (tenant_id, public_workflow_id, idempotency_key);

alter table wfpc.workflow_queue_outbox
drop constraint if exists workflow_queue_outbox_tenant_id_workflow_template_id_idempo_key;

alter table wfpc.workflow_queue_outbox
add constraint workflow_queue_outbox_tenant_id_public_workflow_id_idempo_key
unique (tenant_id, public_workflow_id, idempotency_key);

create index if not exists workflow_runs_public_workflow_idx
on wfpc.workflow_runs (tenant_id, public_workflow_id);

create index if not exists workflow_queue_outbox_public_workflow_idx
on wfpc.workflow_queue_outbox (tenant_id, public_workflow_id, status);
