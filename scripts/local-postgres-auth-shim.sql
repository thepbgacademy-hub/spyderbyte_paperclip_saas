-- Disposable-Postgres auth shim for TASK-055 (DEC-040 / CON-012).
--
-- The Supabase migrations in supabase/migrations/*.sql assume Supabase's
-- built-in auth schema: a users table FK target, an auth.uid() function used
-- inside SECURITY DEFINER helper functions, and an `authenticated` role that
-- RLS policies grant to. Vanilla postgres:16 has none of this. This shim
-- creates only the minimal shape those migrations need so they can apply
-- unmodified against a disposable local database. It is NOT a migration and
-- must never be applied to the real Supabase database.
--
-- The app connects as the "postgres" superuser in this local skeleton, which
-- bypasses row level security entirely (superusers and table owners are
-- exempt from RLS by Postgres design) -- exactly like Supabase's service
-- role bypasses RLS in production. So auth.uid() is never actually
-- evaluated by the walking skeleton's queries; it only needs to exist so the
-- migrations that reference it apply without error.

create extension if not exists "pgcrypto";

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end
$$;
