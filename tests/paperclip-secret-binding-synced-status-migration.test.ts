import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0014_paperclip_secret_binding_synced_status.sql", "utf8");

describe("paperclip secret binding synced status migration", () => {
  it("allows synced bindings in the binding status constraint", () => {
    expect(migration).toMatch(/paperclip_secret_bindings_binding_status_check/i);
    expect(migration).toMatch(/binding_status in \('active', 'synced', 'revoked', 'error'\)/i);
  });
});
