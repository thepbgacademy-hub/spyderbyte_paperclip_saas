import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0036_factory_blueprint_catalog.sql", "utf8");

describe("factory blueprint catalog migration", () => {
  it("creates an operator-owned catalog separate from the legacy tenant package tables", () => {
    expect(migration).toMatch(/create table if not exists wfpc\.factory_blueprint_packages/i);
    expect(migration).toMatch(/create table if not exists wfpc\.factory_blueprint_package_versions/i);
    expect(migration).toMatch(/package_id text primary key/i);
    expect(migration).toMatch(/foreign key \(package_id\) references wfpc\.factory_blueprint_packages\(package_id\)/i);
    expect(migration).not.toMatch(/wealth_factory_packages/i);
    expect(migration).not.toMatch(/tenant_id/i);
    expect(migration).not.toMatch(/on delete cascade/i);
  });

  it("persists the validated immutable version identity and catalog lifecycle state", () => {
    expect(migration).toMatch(/package_version_id text primary key/i);
    expect(migration).toMatch(/version text not null/i);
    expect(migration).toMatch(/manifest jsonb not null/i);
    expect(migration).toMatch(/content_hash text not null/i);
    expect(migration).toMatch(/unique \(package_id, version\)/i);
    expect(migration).toMatch(/unique \(package_id, package_version_id\)/i);
    expect(migration).toMatch(/catalog_status text not null check/i);
    expect(migration).toMatch(/'published', 'deprecated', 'yanked'/i);
    expect(migration).toMatch(/catalog_status = 'deprecated'\s+and deprecated_at is not null\s+and deprecated_by_operator_ref is not null/i);
    expect(migration).toMatch(/catalog_status = 'yanked'\s+and yanked_at is not null\s+and yanked_by_operator_ref is not null/i);
  });

  it("prevents published content from being rewritten while lifecycle metadata can advance", () => {
    expect(migration).toMatch(/create or replace function wfpc\.enforce_factory_blueprint_package_identity_immutability/i);
    expect(migration).toMatch(/new\.package_id is distinct from old\.package_id/i);
    expect(migration).toMatch(/new\.package_key is distinct from old\.package_key/i);
    expect(migration).toMatch(/new\.title is distinct from old\.title/i);
    expect(migration).toMatch(/create trigger factory_blueprint_package_identity_immutable_trigger/i);
    expect(migration).toMatch(/before update on wfpc\.factory_blueprint_packages/i);
    expect(migration).toMatch(/create or replace function wfpc\.enforce_factory_blueprint_package_version_immutability/i);
    expect(migration).toMatch(/new\.manifest is distinct from old\.manifest/i);
    expect(migration).toMatch(/new\.content_hash is distinct from old\.content_hash/i);
    expect(migration).toMatch(/new\.package_version_id is distinct from old\.package_version_id/i);
    expect(migration).toMatch(/new\.package_id is distinct from old\.package_id/i);
    expect(migration).toMatch(/new\.version is distinct from old\.version/i);
    expect(migration).toMatch(/new\.published_at is distinct from old\.published_at/i);
    expect(migration).toMatch(/new\.published_by_operator_ref is distinct from old\.published_by_operator_ref/i);
    expect(migration).not.toMatch(/new\.catalog_status is distinct from old\.catalog_status/i);
    expect(migration).toMatch(/old\.catalog_status = 'published'[\s\S]+new\.catalog_status in \('deprecated', 'yanked'\)/i);
    expect(migration).toMatch(/old\.catalog_status = 'deprecated'[\s\S]+new\.catalog_status is distinct from 'yanked'/i);
    expect(migration).toMatch(/old\.catalog_status = 'yanked'[\s\S]+raise exception/i);
    expect(migration).toMatch(/catalog lifecycle transition is not allowed/i);
    expect(migration).toMatch(/create trigger factory_blueprint_package_version_immutable_trigger/i);
    expect(migration).toMatch(/before update on wfpc\.factory_blueprint_package_versions/i);
    expect(migration).toMatch(/deprecated_at >= published_at/i);
    expect(migration).toMatch(/deprecated_at is null or deprecated_at >= published_at/i);
    expect(migration).toMatch(/yanked_at >= coalesce\(deprecated_at, published_at\)/i);
  });
});
