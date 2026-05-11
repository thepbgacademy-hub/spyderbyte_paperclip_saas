import { describe, expect, it, vi } from "vitest";

import { createSupabaseRepositories, createSupabaseSecretRepository } from "../src/db/supabase-repositories.js";

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

  it("persists provider credential references without raw secret values", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: "secret-reference-1" }] })
    };
    const repository = createSupabaseSecretRepository(client);

    await expect(
      repository.create({
        tenantId: "tenant-1",
        providerKind: "openrouter_api",
        label: "OpenRouter",
        secretRef: "wf_secret_opaque",
        metadata: { allowedModels: ["openai/gpt-5"] },
        revokedAt: null
      })
    ).resolves.toBe("secret-reference-1");

    const call = client.query.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("Expected secret reference insert query");
    expect(String(call[0])).toMatch(/insert into wfpc\.secret_references/i);
    expect(JSON.stringify(call)).not.toContain("sk-");
    expect(call[1]).toContain("wf_secret_opaque");
  });
});
