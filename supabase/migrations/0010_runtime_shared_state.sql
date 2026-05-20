create table if not exists wfpc_private.oauth_pending_states (
  state text primary key,
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  provider_kind text not null,
  display_name text not null,
  public_target jsonb not null default '{}'::jsonb,
  code_verifier text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(public_target) = 'object')
);

create index if not exists oauth_pending_states_expires_at_idx
on wfpc_private.oauth_pending_states (expires_at);

create table if not exists wfpc_private.rate_limit_buckets (
  bucket_key text primary key,
  request_count integer not null check (request_count >= 0),
  window_started_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
