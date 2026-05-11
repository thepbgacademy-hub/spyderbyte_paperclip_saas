import { describe, expect, it, vi } from "vitest";

import { createPostgresEncryptedVaultStore } from "../src/secrets/postgres-vault-store.js";

describe("Postgres encrypted vault store", () => {
  it("persists only encrypted vault fields in the private schema", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const store = createPostgresEncryptedVaultStore(client);

    await store.put({
      secretRef: "wf_secret_opaque",
      record: {
        tenantId: "tenant-1",
        providerKind: "openai_api",
        ciphertext: "encrypted",
        iv: "iv",
        tag: "tag",
        createdAt: "2026-05-11T00:00:00.000Z"
      }
    });

    const [sql, values] = client.query.mock.calls[0] ?? [];
    expect(String(sql)).toMatch(/wfpc_private\.vault_secrets/i);
    expect(String(sql)).not.toMatch(/secretValues|apiKey|raw/i);
    expect(JSON.stringify(values)).not.toContain("sk-");
  });

  it("maps encrypted records without exposing raw provider secrets", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            tenant_id: "tenant-1",
            provider_kind: "openrouter_api",
            ciphertext: "encrypted",
            iv: "iv",
            tag: "tag",
            created_at: "2026-05-11T00:00:00.000Z"
          }
        ]
      })
    };
    const store = createPostgresEncryptedVaultStore(client);

    await expect(store.get({ secretRef: "wf_secret_opaque" })).resolves.toEqual({
      tenantId: "tenant-1",
      providerKind: "openrouter_api",
      ciphertext: "encrypted",
      iv: "iv",
      tag: "tag",
      createdAt: "2026-05-11T00:00:00.000Z"
    });
  });
});
