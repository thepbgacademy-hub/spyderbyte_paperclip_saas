create table if not exists wfpc.factory_blueprint_packages (
  package_id text primary key,
  package_key text not null unique,
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists wfpc.factory_blueprint_package_versions (
  package_version_id text primary key,
  package_id text not null,
  version text not null,
  manifest jsonb not null,
  content_hash text not null,
  catalog_status text not null check (catalog_status in ('published', 'deprecated', 'yanked')),
  published_at timestamptz not null default now(),
  published_by_operator_ref text not null,
  deprecated_at timestamptz null,
  deprecated_by_operator_ref text null,
  yanked_at timestamptz null,
  yanked_by_operator_ref text null,
  created_at timestamptz not null default now(),
  constraint factory_blueprint_package_versions_package_fk
    foreign key (package_id) references wfpc.factory_blueprint_packages(package_id),
  unique (package_id, version),
  unique (package_id, package_version_id),
  constraint factory_blueprint_package_versions_lifecycle_check check (
    (
      catalog_status = 'published'
      and deprecated_at is null
      and deprecated_by_operator_ref is null
      and yanked_at is null
      and yanked_by_operator_ref is null
    )
    or (
      catalog_status = 'deprecated'
      and deprecated_at is not null
      and deprecated_by_operator_ref is not null
      and deprecated_at >= published_at
      and yanked_at is null
      and yanked_by_operator_ref is null
    )
    or (
      catalog_status = 'yanked'
      and yanked_at is not null
      and yanked_by_operator_ref is not null
      and yanked_at >= coalesce(deprecated_at, published_at)
      and (deprecated_at is null or deprecated_at >= published_at)
      and (
        (deprecated_at is null and deprecated_by_operator_ref is null)
        or (deprecated_at is not null and deprecated_by_operator_ref is not null)
      )
    )
  )
);

create index if not exists factory_blueprint_package_versions_status_idx
  on wfpc.factory_blueprint_package_versions (catalog_status, published_at desc);

create or replace function wfpc.enforce_factory_blueprint_package_identity_immutability()
returns trigger
language plpgsql
as $$
begin
  if new.package_id is distinct from old.package_id then
    raise exception 'factory blueprint package_id is immutable';
  end if;

  if new.package_key is distinct from old.package_key then
    raise exception 'factory blueprint package_key is immutable';
  end if;

  if new.title is distinct from old.title then
    raise exception 'factory blueprint title is immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists factory_blueprint_package_identity_immutable_trigger
  on wfpc.factory_blueprint_packages;

create trigger factory_blueprint_package_identity_immutable_trigger
before update on wfpc.factory_blueprint_packages
for each row
execute function wfpc.enforce_factory_blueprint_package_identity_immutability();

create or replace function wfpc.enforce_factory_blueprint_package_version_immutability()
returns trigger
language plpgsql
as $$
begin
  if new.package_version_id is distinct from old.package_version_id then
    raise exception 'factory blueprint package_version_id is immutable';
  end if;

  if new.package_id is distinct from old.package_id then
    raise exception 'factory blueprint package_id is immutable';
  end if;

  if new.version is distinct from old.version then
    raise exception 'factory blueprint version is immutable';
  end if;

  if new.manifest is distinct from old.manifest then
    raise exception 'factory blueprint manifest is immutable';
  end if;

  if new.content_hash is distinct from old.content_hash then
    raise exception 'factory blueprint content_hash is immutable';
  end if;

  if new.published_at is distinct from old.published_at then
    raise exception 'factory blueprint published_at is immutable';
  end if;

  if new.published_by_operator_ref is distinct from old.published_by_operator_ref then
    raise exception 'factory blueprint published_by_operator_ref is immutable';
  end if;

  if old.catalog_status = 'yanked' then
    if old.catalog_status is distinct from new.catalog_status
      or new.deprecated_at is distinct from old.deprecated_at
      or new.deprecated_by_operator_ref is distinct from old.deprecated_by_operator_ref
      or new.yanked_at is distinct from old.yanked_at
      or new.yanked_by_operator_ref is distinct from old.yanked_by_operator_ref then
      raise exception 'catalog lifecycle transition is not allowed';
    end if;
  elsif old.catalog_status = 'published' then
    if old.catalog_status is distinct from new.catalog_status then
      if new.catalog_status in ('deprecated', 'yanked') then
        null;
      else
        raise exception 'catalog lifecycle transition is not allowed';
      end if;
    elsif new.deprecated_at is distinct from old.deprecated_at
      or new.deprecated_by_operator_ref is distinct from old.deprecated_by_operator_ref
      or new.yanked_at is distinct from old.yanked_at
      or new.yanked_by_operator_ref is distinct from old.yanked_by_operator_ref then
      raise exception 'catalog lifecycle transition is not allowed';
    end if;
  elsif old.catalog_status = 'deprecated' then
    if old.catalog_status is distinct from new.catalog_status then
      if new.catalog_status is distinct from 'yanked' then
        raise exception 'catalog lifecycle transition is not allowed';
      end if;
    elsif new.deprecated_at is distinct from old.deprecated_at
      or new.deprecated_by_operator_ref is distinct from old.deprecated_by_operator_ref
      or new.yanked_at is distinct from old.yanked_at
      or new.yanked_by_operator_ref is distinct from old.yanked_by_operator_ref then
      raise exception 'catalog lifecycle transition is not allowed';
    end if;
  else
    raise exception 'catalog lifecycle transition is not allowed';
  end if;

  if new.deprecated_at is distinct from old.deprecated_at
    and old.deprecated_at is not null then
    raise exception 'catalog lifecycle transition is not allowed';
  end if;

  if new.deprecated_by_operator_ref is distinct from old.deprecated_by_operator_ref
    and old.deprecated_by_operator_ref is not null then
    raise exception 'catalog lifecycle transition is not allowed';
  end if;

  if new.yanked_at is distinct from old.yanked_at
    and old.yanked_at is not null then
    raise exception 'catalog lifecycle transition is not allowed';
  end if;

  if new.yanked_by_operator_ref is distinct from old.yanked_by_operator_ref
    and old.yanked_by_operator_ref is not null then
    raise exception 'catalog lifecycle transition is not allowed';
  end if;

  return new;
end;
$$;

drop trigger if exists factory_blueprint_package_version_immutable_trigger
  on wfpc.factory_blueprint_package_versions;

create trigger factory_blueprint_package_version_immutable_trigger
before update on wfpc.factory_blueprint_package_versions
for each row
execute function wfpc.enforce_factory_blueprint_package_version_immutability();
