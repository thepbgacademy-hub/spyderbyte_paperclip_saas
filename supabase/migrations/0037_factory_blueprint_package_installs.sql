-- Phase B19: blueprint-native tenant package install persistence.
-- Keep this lane separate from the legacy tenant package install tables.

create table if not exists wfpc.factory_blueprint_package_installs (
  install_id text primary key,
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  package_id text not null,
  package_version_id text not null,
  previous_package_version_id text null,
  install_status text not null check (install_status in ('enabled', 'disabled', 'uninstalled')),
  permission_snapshot jsonb not null,
  permission_diff jsonb null,
  installed_at timestamptz not null default now(),
  updated_at timestamptz null,
  disabled_at timestamptz null,
  uninstalled_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint factory_blueprint_package_installs_package_fk
    foreign key (package_id) references wfpc.factory_blueprint_packages(package_id),
  constraint factory_blueprint_package_installs_version_fk
    foreign key (package_version_id) references wfpc.factory_blueprint_package_versions(package_version_id),
  constraint factory_blueprint_package_installs_package_version_fk
    foreign key (package_id, package_version_id) references wfpc.factory_blueprint_package_versions(package_id, package_version_id),
  constraint factory_blueprint_package_installs_previous_version_fk
    foreign key (previous_package_version_id) references wfpc.factory_blueprint_package_versions(package_version_id),
  constraint factory_blueprint_package_installs_previous_package_version_fk
    foreign key (package_id, previous_package_version_id) references wfpc.factory_blueprint_package_versions(package_id, package_version_id),
  constraint factory_blueprint_package_installs_snapshot_check check (
    jsonb_typeof(permission_snapshot) = 'object'
    and (permission_diff is null or jsonb_typeof(permission_diff) = 'object')
  ),
  constraint factory_blueprint_package_installs_lifecycle_check check (
    (install_status = 'enabled' and uninstalled_at is null)
    or (install_status = 'disabled' and disabled_at is not null and uninstalled_at is null)
    or (install_status = 'uninstalled' and uninstalled_at is not null)
  ),
  unique (install_id, tenant_id, package_id),
  unique (tenant_id, package_id)
);

comment on table wfpc.factory_blueprint_package_installs is
  'Blueprint-native tenant package install projection; deliverables are never deleted by uninstall.';

create index if not exists factory_blueprint_package_installs_tenant_status_idx
  on wfpc.factory_blueprint_package_installs (tenant_id, install_status);

create index if not exists factory_blueprint_package_installs_version_idx
  on wfpc.factory_blueprint_package_installs (package_version_id);

alter table wfpc.factory_blueprint_package_installs enable row level security;

drop policy if exists "members can read factory blueprint package installs"
  on wfpc.factory_blueprint_package_installs;

create policy "members can read factory blueprint package installs"
  on wfpc.factory_blueprint_package_installs
  for select
  to authenticated
  using (wfpc_private.is_tenant_member(tenant_id));

create table if not exists wfpc.factory_blueprint_package_install_events (
  install_event_id text primary key,
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  package_install_id text not null,
  package_id text not null,
  package_version_id text not null,
  event_action text not null check (event_action in (
    'package_installed',
    'package_disabled',
    'package_enabled',
    'package_updated',
    'package_rolled_back',
    'package_uninstalled'
  )),
  occurred_at timestamptz not null default now(),
  actor_user_id uuid null references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint factory_blueprint_package_install_events_install_fk
    foreign key (package_install_id) references wfpc.factory_blueprint_package_installs(install_id),
  constraint factory_blueprint_package_install_events_install_identity_fk
    foreign key (package_install_id, tenant_id, package_id) references wfpc.factory_blueprint_package_installs(install_id, tenant_id, package_id),
  constraint factory_blueprint_package_install_events_package_version_fk
    foreign key (package_id, package_version_id) references wfpc.factory_blueprint_package_versions(package_id, package_version_id),
  constraint factory_blueprint_package_install_events_metadata_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

create index if not exists factory_blueprint_package_install_events_tenant_created_idx
  on wfpc.factory_blueprint_package_install_events (tenant_id, occurred_at desc);

create index if not exists factory_blueprint_package_install_events_install_created_idx
  on wfpc.factory_blueprint_package_install_events (package_install_id, occurred_at desc);

alter table wfpc.factory_blueprint_package_install_events enable row level security;

drop policy if exists "members can read factory blueprint package install events"
  on wfpc.factory_blueprint_package_install_events;

create policy "members can read factory blueprint package install events"
  on wfpc.factory_blueprint_package_install_events
  for select
  to authenticated
  using (wfpc_private.is_tenant_member(tenant_id));
