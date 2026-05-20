import { describe, expect, it, vi } from "vitest";

import {
  createPaperclipSecretBindingRepository,
  createPaperclipSecretProjectionService,
  createPaperclipSecretSyncService
} from "../src/paperclip/secret-sync.js";

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

  it("projects registration, rotation, and revoke through the admin-lane projection service", async () => {
    const bindings = {
      upsert: vi.fn().mockResolvedValue(undefined),
      revoke: vi.fn().mockResolvedValue(undefined),
      listBindingsBySecretReference: vi
        .fn()
        .mockResolvedValueOnce([
          {
            tenantId: "tenant-1",
            wealthFactorySecretReferenceId: "11111111-1111-4111-8111-111111111111",
            paperclipCompanyId: "company-1",
            paperclipAgentId: "agent-1",
            paperclipEnvKey: "OPENAI_API_KEY",
            paperclipSecretId: "pc-secret-1",
            paperclipSecretKey: "OPENAI_API_KEY",
            providerKind: "openai_api",
            bindingStatus: "active",
            lastSyncedAt: "2026-05-19T20:00:00.000Z",
            lastError: null
          }
        ])
        .mockResolvedValueOnce([
          {
            tenantId: "tenant-1",
            wealthFactorySecretReferenceId: "11111111-1111-4111-8111-111111111111",
            paperclipCompanyId: "company-1",
            paperclipAgentId: "agent-1",
            paperclipEnvKey: "OPENAI_API_KEY",
            paperclipSecretId: "pc-secret-1",
            paperclipSecretKey: "OPENAI_API_KEY",
            providerKind: "openai_api",
            bindingStatus: "active",
            lastSyncedAt: "2026-05-19T20:00:00.000Z",
            lastError: null
          }
        ]),
      findActiveBySecretRef: vi.fn().mockResolvedValue({
        tenantId: "tenant-1",
        wealthFactorySecretReferenceId: "11111111-1111-4111-8111-111111111111",
        paperclipCompanyId: "company-1",
        paperclipAgentId: "agent-1",
        paperclipEnvKey: "OPENAI_API_KEY",
        paperclipSecretId: "pc-secret-1",
        paperclipSecretKey: "OPENAI_API_KEY",
        providerKind: "openai_api",
        bindingStatus: "active",
        lastSyncedAt: "2026-05-19T20:00:00.000Z",
        lastError: null
      })
    };
    const adminClient = {
      upsertSecret: vi.fn().mockResolvedValue({
        paperclipSecretId: "pc-secret-1",
        paperclipSecretKey: "OPENAI_API_KEY"
      }),
      bindAgentSecretRef: vi.fn().mockResolvedValue(undefined),
      revokeSecretBinding: vi.fn().mockResolvedValue(undefined)
    };
    const projection = createPaperclipSecretProjectionService({
      adminClient,
      bindings: bindings as never,
      resolveCompanyMapping: vi.fn().mockResolvedValue({ paperclipCompanyId: "company-1" }),
      paperclipAgentId: "agent-1"
    });

    await projection.onRegistered({
      tenantId: "tenant-1",
      secretReferenceId: "11111111-1111-4111-8111-111111111111",
      providerKind: "openai_api",
      secretRef: "wf_secret_1",
      secretValues: { apiKey: "sk-tenant" }
    });
    await projection.onRotated({
      tenantId: "tenant-1",
      secretReferenceId: "11111111-1111-4111-8111-111111111111",
      providerKind: "openai_api",
      allowBootstrap: true,
      previousSecretRef: "wf_secret_1",
      nextSecretRef: "wf_secret_2",
      nextSecretValues: { apiKey: "sk-next" }
    });
    await projection.revokeBySecretRef({
      tenantId: "tenant-1",
      secretRef: "wf_secret_2"
    });

    expect(adminClient.upsertSecret).toHaveBeenCalledWith({
      companyId: "company-1",
      secretKey: "OPENAI_API_KEY",
      secretValue: "sk-tenant"
    });
    expect(adminClient.upsertSecret).toHaveBeenCalledWith({
      companyId: "company-1",
      secretKey: "OPENAI_API_KEY",
      secretValue: "sk-next"
    });
    expect(adminClient.revokeSecretBinding).toHaveBeenCalledWith({
      companyId: "company-1",
      agentId: "agent-1",
      envKey: "OPENAI_API_KEY",
      paperclipSecretId: "pc-secret-1"
    });
  });

  it("bootstraps a new binding on rotation when no prior paperclip binding exists", async () => {
    const bindings = {
      upsert: vi.fn().mockResolvedValue(undefined),
      revoke: vi.fn().mockResolvedValue(undefined),
      listBindingsBySecretReference: vi.fn().mockResolvedValue([]),
      findActiveBySecretRef: vi.fn().mockResolvedValue(null)
    };
    const adminClient = {
      upsertSecret: vi.fn().mockResolvedValue({
        paperclipSecretId: "pc-secret-2",
        paperclipSecretKey: "OPENAI_API_KEY"
      }),
      bindAgentSecretRef: vi.fn().mockResolvedValue(undefined),
      revokeSecretBinding: vi.fn().mockResolvedValue(undefined)
    };
    const projection = createPaperclipSecretProjectionService({
      adminClient,
      bindings: bindings as never,
      resolveCompanyMapping: vi.fn().mockResolvedValue({ paperclipCompanyId: "company-1" }),
      paperclipAgentId: "agent-1"
    });

    await expect(
      projection.onRotated({
        tenantId: "tenant-1",
        secretReferenceId: "11111111-1111-4111-8111-111111111111",
        providerKind: "openai_api",
        allowBootstrap: true,
        previousSecretRef: "wf_secret_1",
        nextSecretRef: "wf_secret_2",
        nextSecretValues: { apiKey: "sk-next" }
      })
    ).resolves.toBeUndefined();

    expect(adminClient.upsertSecret).toHaveBeenCalledWith({
      companyId: "company-1",
      secretKey: "OPENAI_API_KEY",
      secretValue: "sk-next"
    });
    expect(adminClient.bindAgentSecretRef).toHaveBeenCalledWith({
      companyId: "company-1",
      agentId: "agent-1",
      envKey: "OPENAI_API_KEY",
      paperclipSecretId: "pc-secret-2"
    });
  });

  it("treats missing company mappings as a local-safe no-op for projection hooks", async () => {
    const bindings = {
      upsert: vi.fn().mockResolvedValue(undefined),
      revoke: vi.fn().mockResolvedValue(undefined),
      listBindingsBySecretReference: vi.fn().mockResolvedValue([]),
      findActiveBySecretRef: vi.fn().mockResolvedValue(null)
    };
    const adminClient = {
      upsertSecret: vi.fn(),
      bindAgentSecretRef: vi.fn(),
      revokeSecretBinding: vi.fn()
    };
    const audit = vi.fn().mockResolvedValue(undefined);
    const projection = createPaperclipSecretProjectionService({
      adminClient: adminClient as never,
      bindings: bindings as never,
      resolveCompanyMapping: vi.fn().mockRejectedValue(new Error("Paperclip company mapping is required")),
      paperclipAgentId: "agent-1",
      audit
    });

    await expect(
      projection.onRegistered({
        tenantId: "tenant-1",
        secretReferenceId: "11111111-1111-4111-8111-111111111111",
        providerKind: "openai_api",
        secretRef: "wf_secret_1",
        secretValues: { apiKey: "sk-tenant" }
      })
    ).resolves.toBeUndefined();
    await expect(projection.revokeBySecretRef({ tenantId: "tenant-1", secretRef: "wf_secret_1" })).resolves.toBeUndefined();

    expect(adminClient.upsertSecret).not.toHaveBeenCalled();
    expect(adminClient.revokeSecretBinding).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      eventType: "paperclip.secret_projection_skipped",
      entityType: "paperclip_secret_projection",
      entityId: "11111111-1111-4111-8111-111111111111",
      metadata: {
        lifecycle: "register",
        providerKind: "openai_api",
        error: "Paperclip company mapping is required"
      }
    });
    expect(audit).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      eventType: "paperclip.secret_projection_skipped",
      entityType: "paperclip_secret_projection",
      entityId: "wf_secret_1",
      metadata: {
        lifecycle: "revoke",
        error: "Paperclip company mapping is required"
      }
    });
  });
});
