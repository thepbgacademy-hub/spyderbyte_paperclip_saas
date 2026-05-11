import { describe, expect, it, vi } from "vitest";

import { createSupabaseRepositories } from "../src/db/supabase-repositories.js";

function createQuery(rowsBySql: Record<string, unknown[]>) {
  return vi.fn().mockImplementation((sql: string, values: unknown[]) => {
    const key = Object.keys(rowsBySql).find((candidate) => sql.includes(candidate));
    if (!key) {
      throw new Error(`Unexpected SQL: ${sql}`);
    }
    return Promise.resolve({ rows: rowsBySql[key], values });
  });
}

describe("Supabase wfpc repositories", () => {
  it("maps dashboard repositories from wfpc schema without exposing secret handles", async () => {
    const query = createQuery({
      "from wfpc.workflow_templates": [{ id: "wf-social-calendar", name: "Wealth Factory Social Calendar", provider_kind: "openai_api", enabled: true }],
      "from wfpc.tenant_package_installs": [{ id: "pkg-social", name: "Social Media Agency", kind: "industry", status: "active" }],
      "from wfpc.artifact_metadata": [
        { id: "artifact-1", filename: "post.png", artifact_type: "image", expires_at: "2026-05-11T00:00:00.000Z" }
      ],
      "from wfpc.secret_references": [
        { provider_kind: "openai_api", label: "OpenAI", revoked_at: null, secret_ref: "vault://secret" },
        { provider_kind: "anthropic_api", label: "Anthropic", revoked_at: "2026-05-11T00:00:00.000Z", secret_ref: "vault://old" }
      ],
      "from wfpc.tenant_memberships": [{ tenant_id: "tenant-1" }]
    });
    const repositories = createSupabaseRepositories({ query });

    await expect(repositories.requireTenantMember({ tenantId: "tenant-1", userId: "user-1" })).resolves.toBeUndefined();
    await expect(repositories.listWorkflows({ tenantId: "tenant-1" })).resolves.toEqual([
      {
        id: "wf-social-calendar",
        name: "Wealth Factory Social Calendar",
        providerKind: "openai_api",
        enabled: true
      }
    ]);
    await expect(repositories.listPackages({ tenantId: "tenant-1" })).resolves.toEqual([
      { id: "pkg-social", name: "Social Media Agency", kind: "industry", status: "active" }
    ]);
    await expect(repositories.listArtifacts({ tenantId: "tenant-1" })).resolves.toEqual([
      { id: "artifact-1", filename: "post.png", artifactType: "image", expiresAt: "2026-05-11T00:00:00.000Z" }
    ]);
    await expect(repositories.listProviderConnections({ tenantId: "tenant-1" })).resolves.toEqual([
      { providerKind: "openai_api", label: "OpenAI", connected: true }
    ]);

    const serialized = JSON.stringify(await repositories.listProviderConnections({ tenantId: "tenant-1" }));
    expect(serialized).not.toMatch(/secret|vault/i);
  });

  it("rejects tenant membership misses", async () => {
    const repositories = createSupabaseRepositories({
      query: createQuery({
        "from wfpc.tenant_memberships": []
      })
    });

    await expect(repositories.requireTenantMember({ tenantId: "tenant-2", userId: "user-1" })).rejects.toThrow(
      "Tenant membership is required"
    );
  });
});
