create table if not exists wfpc.workflow_queue_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  run_id uuid not null references wfpc.workflow_runs(id) on delete cascade,
  workflow_template_id uuid not null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null,
  status text not null default 'pending' check (status in ('pending', 'claimed', 'enqueued', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  claim_token uuid,
  claimed_at timestamptz,
  enqueued_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workflow_template_id, tenant_id)
    references wfpc.workflow_templates(id, tenant_id)
    on delete restrict,
  unique (tenant_id, run_id),
  unique (tenant_id, workflow_template_id, idempotency_key)
);

alter table wfpc.workflow_queue_outbox
add column if not exists created_by_user_id uuid;

alter table wfpc.workflow_queue_outbox
add column if not exists attempts integer not null default 0;

alter table wfpc.workflow_queue_outbox
alter column attempts set default 0;

update wfpc.workflow_queue_outbox
set attempts = 0
where attempts is null;

alter table wfpc.workflow_queue_outbox
alter column attempts set not null;

alter table wfpc.workflow_queue_outbox
add column if not exists available_at timestamptz not null default now();

alter table wfpc.workflow_queue_outbox
alter column available_at set default now();

update wfpc.workflow_queue_outbox
set available_at = now()
where available_at is null;

alter table wfpc.workflow_queue_outbox
alter column available_at set not null;

alter table wfpc.workflow_queue_outbox
add column if not exists claim_token uuid;

alter table wfpc.workflow_queue_outbox
add column if not exists claimed_at timestamptz;

alter table wfpc.workflow_queue_outbox
add column if not exists enqueued_at timestamptz;

alter table wfpc.workflow_queue_outbox
add column if not exists last_error text;

alter table wfpc.workflow_queue_outbox
add column if not exists status text not null default 'pending';

alter table wfpc.workflow_queue_outbox
add column if not exists idempotency_key text;

alter table wfpc.workflow_queue_outbox
add column if not exists created_at timestamptz not null default now();

alter table wfpc.workflow_queue_outbox
add column if not exists updated_at timestamptz not null default now();

alter table wfpc.workflow_queue_outbox
alter column status set default 'pending';

update wfpc.workflow_queue_outbox
set status = 'pending'
where status is null;

alter table wfpc.workflow_queue_outbox
alter column status set not null;

update wfpc.workflow_queue_outbox
set idempotency_key = tenant_id::text || ':' || workflow_template_id::text || ':' || run_id::text
where idempotency_key is null;

alter table wfpc.workflow_queue_outbox
alter column idempotency_key set not null;

alter table wfpc.workflow_queue_outbox
alter column created_at set default now();

update wfpc.workflow_queue_outbox
set created_at = now()
where created_at is null;

alter table wfpc.workflow_queue_outbox
alter column created_at set not null;

alter table wfpc.workflow_queue_outbox
alter column updated_at set default now();

update wfpc.workflow_queue_outbox
set updated_at = now()
where updated_at is null;

alter table wfpc.workflow_queue_outbox
alter column updated_at set not null;

update wfpc.workflow_queue_outbox outbox
set created_by_user_id = runs.created_by_user_id
from wfpc.workflow_runs runs
where outbox.created_by_user_id is null
  and runs.id = outbox.run_id
  and runs.tenant_id = outbox.tenant_id;

insert into wfpc.workflow_queue_outbox
  (tenant_id, run_id, workflow_template_id, created_by_user_id, idempotency_key, status, created_at, updated_at)
select runs.tenant_id,
       runs.id,
       runs.workflow_template_id,
       runs.created_by_user_id,
       reservations.idempotency_key,
       'pending',
       reservations.reserved_at,
       now()
from wfpc.workflow_runs runs
join wfpc.workflow_run_reservations reservations
  on reservations.tenant_id = runs.tenant_id
 and reservations.run_id = runs.id
where runs.status = 'queued'
on conflict (tenant_id, run_id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'wfpc.workflow_queue_outbox'::regclass
      and contype = 'p'
  ) then
    alter table wfpc.workflow_queue_outbox
    add constraint workflow_queue_outbox_pkey
    primary key (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'workflow_queue_outbox_created_by_user_id_fkey'
      and conrelid = 'wfpc.workflow_queue_outbox'::regclass
  ) then
    alter table wfpc.workflow_queue_outbox
    add constraint workflow_queue_outbox_created_by_user_id_fkey
    foreign key (created_by_user_id)
    references auth.users(id)
    on delete restrict;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'wfpc.workflow_queue_outbox'::regclass
      and pg_get_constraintdef(oid) like '%wfpc.workflow_runs%'
  ) then
    alter table wfpc.workflow_queue_outbox
    add constraint workflow_queue_outbox_run_id_fkey
    foreign key (run_id)
    references wfpc.workflow_runs(id)
    on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'wfpc.workflow_queue_outbox'::regclass
      and pg_get_constraintdef(oid) like '%workflow_template_id, tenant_id%'
  ) then
    alter table wfpc.workflow_queue_outbox
    add constraint workflow_queue_outbox_workflow_template_tenant_fkey
    foreign key (workflow_template_id, tenant_id)
    references wfpc.workflow_templates(id, tenant_id)
    on delete restrict;
  end if;
end $$;

alter table wfpc.workflow_queue_outbox
alter column created_by_user_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workflow_queue_outbox_attempts_check'
      and conrelid = 'wfpc.workflow_queue_outbox'::regclass
  ) then
    alter table wfpc.workflow_queue_outbox
    add constraint workflow_queue_outbox_attempts_check
    check (attempts >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workflow_queue_outbox_status_check'
      and conrelid = 'wfpc.workflow_queue_outbox'::regclass
      and pg_get_constraintdef(oid) like '%claimed%'
  ) then
    alter table wfpc.workflow_queue_outbox
    drop constraint if exists workflow_queue_outbox_status_check;

    alter table wfpc.workflow_queue_outbox
    add constraint workflow_queue_outbox_status_check
    check (status in ('pending', 'claimed', 'enqueued', 'failed'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workflow_queue_outbox_tenant_id_run_id_key'
      and conrelid = 'wfpc.workflow_queue_outbox'::regclass
  ) then
    alter table wfpc.workflow_queue_outbox
    add constraint workflow_queue_outbox_tenant_id_run_id_key
    unique (tenant_id, run_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workflow_queue_outbox_tenant_id_workflow_template_id_idempo_key'
      and conrelid = 'wfpc.workflow_queue_outbox'::regclass
  ) then
    alter table wfpc.workflow_queue_outbox
    add constraint workflow_queue_outbox_tenant_id_workflow_template_id_idempo_key
    unique (tenant_id, workflow_template_id, idempotency_key);
  end if;
end $$;

create index if not exists workflow_queue_outbox_pending_idx
on wfpc.workflow_queue_outbox (status, available_at, created_at)
where status in ('pending', 'failed');

create index if not exists workflow_queue_outbox_claimed_idx
on wfpc.workflow_queue_outbox (status, claimed_at)
where status = 'claimed';

alter table wfpc.workflow_queue_outbox enable row level security;
