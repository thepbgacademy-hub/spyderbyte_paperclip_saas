create table if not exists wfpc.harness_runs (
  id uuid primary key,
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  workflow_id text not null,
  package_id text not null,
  orchestrator_persona text not null,
  state text not null check (state in ('queued', 'planning', 'active', 'waiting', 'blocked', 'assembling', 'done', 'failed', 'cancelled')),
  runtime_context jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(runtime_context) = 'object'),
  check ((runtime_context ? 'secretValues') = false)
);

create index if not exists harness_runs_tenant_created_at_idx
on wfpc.harness_runs (tenant_id, created_at desc);

create unique index if not exists harness_runs_tenant_workflow_unique_idx
on wfpc.harness_runs (tenant_id, workflow_id);

create table if not exists wfpc.harness_cards (
  id uuid primary key,
  run_id uuid not null references wfpc.harness_runs(id) on delete cascade,
  parent_card_id uuid null references wfpc.harness_cards(id) on delete set null,
  persona text not null,
  title text not null,
  deliverable_type text not null,
  state text not null check (state in ('queued', 'planning', 'approved', 'working', 'waiting', 'blocked', 'done', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists harness_cards_run_created_at_idx
on wfpc.harness_cards (run_id, created_at asc);

create table if not exists wfpc.harness_card_events (
  id uuid primary key,
  card_id uuid not null references wfpc.harness_cards(id) on delete cascade,
  event_kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(payload) = 'object')
);

create index if not exists harness_card_events_card_created_at_idx
on wfpc.harness_card_events (card_id, created_at asc);
