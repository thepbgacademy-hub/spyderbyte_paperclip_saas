create table if not exists wfpc.tenant_package_purchases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  package_id uuid not null references wfpc.wealth_factory_packages(id) on delete restrict,
  purchased_by_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'cancelled', 'expired', 'refunded')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tenant_package_purchases_tenant_id_package_id_key'
      and conrelid = 'wfpc.tenant_package_purchases'::regclass
  ) then
    alter table wfpc.tenant_package_purchases
    add constraint tenant_package_purchases_tenant_id_package_id_key
    unique (tenant_id, package_id);
  end if;
end $$;

create index if not exists tenant_package_purchases_active_idx
on wfpc.tenant_package_purchases (tenant_id, package_id, status, starts_at, ends_at);

alter table wfpc.tenant_package_purchases enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'wfpc'
      and tablename = 'tenant_package_purchases'
      and policyname = 'members can read tenant package purchases'
  ) then
    create policy "members can read tenant package purchases"
    on wfpc.tenant_package_purchases for select
    to authenticated
    using (wfpc_private.is_tenant_member(tenant_id));
  end if;
end $$;
