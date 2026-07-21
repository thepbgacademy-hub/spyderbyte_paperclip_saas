import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0037_factory_blueprint_package_installs.sql", "utf8");

describe("factory blueprint package installs migration", () => {
  it("creates a tenant-owned install table anchored to blueprint catalog versions", () => {
    expect(migration).toMatch(/create table if not exists wfpc\.factory_blueprint_package_installs/i);
    expect(migration).toMatch(/install_id text primary key/i);
    expect(migration).toMatch(/tenant_id uuid not null references wfpc\.tenants\(id\) on delete cascade/i);
    expect(migration).toMatch(/package_id text not null/i);
    expect(migration).toMatch(/package_version_id text not null/i);
    expect(migration).toMatch(/previous_package_version_id text null/i);
    expect(migration).toMatch(/foreign key \(package_version_id\) references wfpc\.factory_blueprint_package_versions\(package_version_id\)/i);
    expect(migration).toMatch(/foreign key \(previous_package_version_id\) references wfpc\.factory_blueprint_package_versions\(package_version_id\)/i);
    expect(migration).toMatch(/foreign key \(package_id, package_version_id\) references wfpc\.factory_blueprint_package_versions\(package_id, package_version_id\)/i);
    expect(migration).toMatch(/foreign key \(package_id, previous_package_version_id\) references wfpc\.factory_blueprint_package_versions\(package_id, package_version_id\)/i);
    expect(migration).toMatch(/unique \(tenant_id, package_id\)/i);
    expect(migration).not.toMatch(/wfpc\.tenant_package_installs/i);
    expect(migration).not.toMatch(/wealth_factory_packages/i);
  });

  it("persists the B18 lifecycle projection and permission snapshot without deleting customer assets", () => {
    expect(migration).toMatch(/install_status text not null check/i);
    expect(migration).toMatch(/'enabled', 'disabled', 'uninstalled'/i);
    expect(migration).toMatch(/permission_snapshot jsonb not null/i);
    expect(migration).toMatch(/permission_diff jsonb null/i);
    expect(migration).toMatch(/installed_at timestamptz not null/i);
    expect(migration).toMatch(/updated_at timestamptz null/i);
    expect(migration).toMatch(/disabled_at timestamptz null/i);
    expect(migration).toMatch(/uninstalled_at timestamptz null/i);
    expect(migration).toMatch(/constraint factory_blueprint_package_installs_snapshot_check check/i);
    expect(migration).toMatch(/jsonb_typeof\(permission_snapshot\) = 'object'/i);
    expect(migration).toMatch(/deliverables are never deleted by uninstall/i);
    expect(migration).not.toMatch(/references wfpc\.factory_blueprint_package_versions\(package_version_id\) on delete cascade/i);
  });

  it("creates durable tenant install audit events for every lifecycle action", () => {
    expect(migration).toMatch(/create table if not exists wfpc\.factory_blueprint_package_install_events/i);
    expect(migration).toMatch(/install_event_id text primary key/i);
    expect(migration).toMatch(/package_install_id text not null/i);
    expect(migration).toMatch(/event_action text not null check/i);
    expect(migration).toMatch(/'package_installed',\s*'package_disabled',\s*'package_enabled',\s*'package_updated',\s*'package_rolled_back',\s*'package_uninstalled'/i);
    expect(migration).toMatch(/metadata jsonb not null default '\{\}'::jsonb/i);
    expect(migration).toMatch(/foreign key \(package_install_id\) references wfpc\.factory_blueprint_package_installs\(install_id\)/i);
    expect(migration).toMatch(/unique \(install_id, tenant_id, package_id\)/i);
    expect(migration).toMatch(/foreign key \(package_install_id, tenant_id, package_id\) references wfpc\.factory_blueprint_package_installs\(install_id, tenant_id, package_id\)/i);
    expect(migration).toMatch(/foreign key \(package_id, package_version_id\) references wfpc\.factory_blueprint_package_versions\(package_id, package_version_id\)/i);
    expect(migration).toMatch(/factory_blueprint_package_install_events_tenant_created_idx/i);
  });

  it("enables tenant-scoped read policies while leaving owner-admin write enforcement to the API phase", () => {
    expect(migration).toMatch(/alter table wfpc\.factory_blueprint_package_installs enable row level security/i);
    expect(migration).toMatch(/alter table wfpc\.factory_blueprint_package_install_events enable row level security/i);
    expect(migration).toMatch(/create policy "members can read factory blueprint package installs"/i);
    expect(migration).toMatch(/using \(wfpc_private\.is_tenant_member\(tenant_id\)\)/i);
    expect(migration).toMatch(/create policy "members can read factory blueprint package install events"/i);
    expect(migration).not.toMatch(/for insert/i);
    expect(migration).not.toMatch(/for update/i);
    expect(migration).not.toMatch(/for delete/i);
  });
});
