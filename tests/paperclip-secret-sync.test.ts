import { describe, expect, it, vi } from "vitest";

import { createPaperclipSecretBindingRepository, createPaperclipSecretSyncService } from "../src/paperclip/secret-sync.js";

describe("paperclip secret sync", () => {
  it("syncs secrets into paperclip and records an active binding", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const bindings = createPaperclipSecretBindingRepository({ query });
    const adminClient = {
      upsertSecret: vi.fn().mockResolvedValue({
        paperclipSecretId: "pc-secret-1",
        paperclipSecretKey: "WF_OPENAI_API_KEY"
      }),
      bindAgentSecretRef: vi.fn().mockResolvedValue(undefined)
    };
    const service = createPaperclipSecretSyncService({
      adminClient,
      bindings
    });

    await expect(
      service.syncBinding({
        tenantId: "tenant-1",
        wealthFactorySecretReferenceId: "11111111-1111-4111-8111-111111111111",
        paperclipCompanyId: "company-1",
        paperclipAgentId: "agent-1",
        paperclipEnvKey: "WF_OPENAI_API_KEY",
        providerKind: "openai_api",
        secretValue: "sk-tenant",
        paperclipSecretKey: "WF_OPENAI_API_KEY"
      })
    ).resolves.toBeUndefined();

    expect(adminClient.upsertSecret).toHaveBeenCalledWith({
      companyId: "company-1",
      secretKey: "WF_OPENAI_API_KEY",
      secretValue: "sk-tenant"
    });
    expect(adminClient.bindAgentSecretRef).toHaveBeenCalledWith({
      companyId: "company-1",
      agentId: "agent-1",
      envKey: "WF_OPENAI_API_KEY",
      paperclipSecretId: "pc-secret-1"
    });
    expect(String(query.mock.calls[0]?.[0])).toMatch(/insert into wfpc\.paperclip_secret_bindings/i);
  });

  it("revokes remote bindings before marking the local record revoked", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            tenant_id: "tenant-1",
            wealth_factory_secret_reference_id: "11111111-1111-4111-8111-111111111111",
            paperclip_company_id: "company-1",
            paperclip_agent_id: "agent-1",
            paperclip_env_key: "WF_OPENAI_API_KEY",
            paperclip_secret_id: "pc-secret-1",
            paperclip_secret_key: "WF_OPENAI_API_KEY",
            provider_kind: "openai_api",
            binding_status: "active",
            last_synced_at: "2026-05-19T20:00:00.000Z",
            last_error: null
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] });
    const bindings = createPaperclipSecretBindingRepository({ query });
    const adminClient = {
      upsertSecret: vi.fn(),
      bindAgentSecretRef: vi.fn(),
      revokeSecretBinding: vi.fn().mockResolvedValue(undefined)
    };
    const service = createPaperclipSecretSyncService({
      adminClient,
      bindings
    });

    await expect(
      service.revokeBinding({
        tenantId: "tenant-1",
        wealthFactorySecretReferenceId: "11111111-1111-4111-8111-111111111111"
      })
    ).resolves.toBeUndefined();

    expect(adminClient.revokeSecretBinding).toHaveBeenCalledWith({
      companyId: "company-1",
      agentId: "agent-1",
      envKey: "WF_OPENAI_API_KEY",
      paperclipSecretId: "pc-secret-1"
    });
    expect(String(query.mock.calls[1]?.[0])).toMatch(/update wfpc\.paperclip_secret_bindings/i);
  });
});
