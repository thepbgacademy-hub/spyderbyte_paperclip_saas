import { describe, expect, it, vi } from "vitest";

import { createSupabaseRepositories, createSupabaseSecretRepository, createSupabaseStorageConnectorRepository } from "../src/db/supabase-repositories.js";

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

  it("persists storage connector summaries while keeping OAuth refs private", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "storage-connector-1",
              provider_kind: "google_drive",
              display_name: "Company Drive",
              public_target: { folderLabel: "Exports" }
            }
          ]
        })
        .mockResolvedValueOnce({ rows: [] })
    };
    const repositories = createSupabaseRepositories(client);

    await expect(
      repositories.registerStorageConnector({
        tenantId: "tenant-1",
        actorUserId: "user-1",
        providerKind: "google_drive",
        displayName: "Company Drive",
        secretRefs: { oauthTokenRef: "wf_secret_storage" },
        publicTarget: { folderLabel: "Exports" }
      })
    ).resolves.toEqual({
      id: "storage-connector-1",
      providerKind: "google_drive",
      displayName: "Company Drive",
      connected: true,
      publicTarget: { folderLabel: "Exports" }
    });

    expect(String(client.query.mock.calls[0]?.[0])).toMatch(/insert into wfpc\.storage_connectors/i);
    expect(String(client.query.mock.calls[1]?.[0])).toMatch(/insert into wfpc_private\.storage_connector_secrets/i);
    expect(JSON.stringify(client.query.mock.calls[0])).not.toMatch(/wf_secret|oauthTokenRef/i);
  });

  it("persists storage connector rows through a transaction-backed repository", async () => {
    const transaction = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "storage-connector-1",
              provider_kind: "dropbox",
              display_name: "Dropbox",
              public_target: { folderLabel: "Exports" }
            }
          ]
        })
        .mockResolvedValueOnce({ rows: [] })
    };
    const runner = {
      withTransaction: vi.fn().mockImplementation(async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction))
    };
    const repository = createSupabaseStorageConnectorRepository(runner);

    await expect(
      repository.register({
        tenantId: "tenant-1",
        actorUserId: "user-1",
        providerKind: "dropbox",
        displayName: "Dropbox",
        secretRefs: { oauthTokenRef: "wf_secret_storage", refreshTokenRef: "wf_secret_storage" },
        publicTarget: { folderLabel: "Exports" }
      })
    ).resolves.toEqual({
      id: "storage-connector-1",
      providerKind: "dropbox",
      displayName: "Dropbox",
      connected: true,
      publicTarget: { folderLabel: "Exports" }
    });

    expect(runner.withTransaction).toHaveBeenCalledOnce();
    expect(String(transaction.query.mock.calls[0]?.[0])).toMatch(/insert into wfpc\.storage_connectors/i);
    expect(String(transaction.query.mock.calls[1]?.[0])).toMatch(/insert into wfpc_private\.storage_connector_secrets/i);
  });
});
