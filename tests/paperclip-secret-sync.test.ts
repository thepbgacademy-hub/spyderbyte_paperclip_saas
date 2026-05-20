import { describe, expect, it, vi } from "vitest";

import {
  createPaperclipSecretAdminHttpClient,
  createPaperclipSecretBindingRepository,
  createPaperclipSecretBoardSessionHttpClient,
  createPaperclipSecretProjectionService,
  createPaperclipSecretSyncService
} from "../src/paperclip/secret-sync.js";

describe("paperclip secret sync", () => {
  it("syncs secrets into paperclip and records an active binding when the agent is bound", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const bindings = createPaperclipSecretBindingRepository({ query });
    const adminClient = {
      upsertSecret: vi.fn().mockResolvedValue({
        paperclipSecretId: "pc-secret-1",
        paperclipSecretKey: "WF_OPENAI_API_KEY",
        paperclipSecretVersion: "3"
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
    ).resolves.toEqual({
      paperclipSecretId: "pc-secret-1",
      paperclipSecretKey: "WF_OPENAI_API_KEY",
      paperclipSecretVersion: "3"
    });

    expect(adminClient.upsertSecret).toHaveBeenCalledWith({
      companyId: "company-1",
      secretKey: "WF_OPENAI_API_KEY",
      secretValue: "sk-tenant"
    });
    expect(adminClient.bindAgentSecretRef).toHaveBeenCalledWith({
      companyId: "company-1",
      agentId: "agent-1",
      envKey: "WF_OPENAI_API_KEY",
      paperclipSecretId: "pc-secret-1",
      paperclipSecretVersion: "3"
    });
    expect(String(query.mock.calls[0]?.[0])).toMatch(/insert into wfpc\.paperclip_secret_bindings/i);
  });

  it("records a synced binding when the secret is versioned but not globally bound to the agent", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const bindings = createPaperclipSecretBindingRepository({ query });
    const adminClient = {
      upsertSecret: vi.fn().mockResolvedValue({
        paperclipSecretId: "pc-secret-1",
        paperclipSecretKey: "WF_OPENAI_API_KEY",
        paperclipSecretVersion: "3"
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
        paperclipSecretKey: "WF_OPENAI_API_KEY",
        bindToAgent: false
      })
    ).resolves.toEqual({
      paperclipSecretId: "pc-secret-1",
      paperclipSecretKey: "WF_OPENAI_API_KEY",
      paperclipSecretVersion: "3"
    });

    expect(adminClient.bindAgentSecretRef).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/insert into wfpc\.paperclip_secret_bindings/i),
      expect.arrayContaining([
        "tenant-1",
        "11111111-1111-4111-8111-111111111111",
        "company-1",
        "agent-1",
        "WF_OPENAI_API_KEY",
        "pc-secret-1",
        "WF_OPENAI_API_KEY",
        "3",
        "openai_api",
        "synced"
      ])
    );
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

  it("projects registration and rotation as synced-only bindings while keeping revoke available for active bindings", async () => {
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
        paperclipSecretKey: "OPENAI_API_KEY",
        paperclipSecretVersion: "4"
      }),
      bindAgentSecretRef: vi.fn().mockResolvedValue(undefined),
      revokeSecretBinding: vi.fn().mockResolvedValue(undefined)
    };
    const projection = createPaperclipSecretProjectionService({
      adminClient,
      bindings: bindings as never,
      resolveCompanyMapping: vi.fn().mockResolvedValue({ paperclipCompanyId: "company-1", paperclipIssueAgentId: "agent-1" })
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
    expect(adminClient.bindAgentSecretRef).not.toHaveBeenCalled();
    expect(adminClient.revokeSecretBinding).toHaveBeenCalledWith({
      companyId: "company-1",
      agentId: "agent-1",
      envKey: "OPENAI_API_KEY",
      paperclipSecretId: "pc-secret-1"
    });
  });

  it("bootstraps a synced-only binding on rotation when no prior paperclip binding exists", async () => {
    const bindings = {
      upsert: vi.fn().mockResolvedValue(undefined),
      revoke: vi.fn().mockResolvedValue(undefined),
      listBindingsBySecretReference: vi.fn().mockResolvedValue([]),
      findActiveBySecretRef: vi.fn().mockResolvedValue(null)
    };
    const adminClient = {
      upsertSecret: vi.fn().mockResolvedValue({
        paperclipSecretId: "pc-secret-2",
        paperclipSecretKey: "OPENAI_API_KEY",
        paperclipSecretVersion: "7"
      }),
      bindAgentSecretRef: vi.fn().mockResolvedValue(undefined),
      revokeSecretBinding: vi.fn().mockResolvedValue(undefined)
    };
    const projection = createPaperclipSecretProjectionService({
      adminClient,
      bindings: bindings as never,
      resolveCompanyMapping: vi.fn().mockResolvedValue({ paperclipCompanyId: "company-1", paperclipIssueAgentId: "agent-1" })
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
    expect(adminClient.bindAgentSecretRef).not.toHaveBeenCalled();
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
      defaultPaperclipAgentId: "agent-1",
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

  it("defers remote rotation projection when active workflow runs are present for the tenant", async () => {
    const bindings = {
      upsert: vi.fn().mockResolvedValue(undefined),
      revoke: vi.fn().mockResolvedValue(undefined),
      listBindingsBySecretReference: vi.fn().mockResolvedValue([
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
      findActiveBySecretRef: vi.fn().mockResolvedValue(null)
    };
    const adminClient = {
      upsertSecret: vi.fn().mockResolvedValue({
        paperclipSecretId: "pc-secret-1",
        paperclipSecretKey: "OPENAI_API_KEY",
        paperclipSecretVersion: "5"
      }),
      bindAgentSecretRef: vi.fn().mockResolvedValue(undefined),
      revokeSecretBinding: vi.fn().mockResolvedValue(undefined)
    };
    const audit = vi.fn().mockResolvedValue(undefined);
    const projection = createPaperclipSecretProjectionService({
      adminClient: adminClient as never,
      bindings: bindings as never,
      resolveCompanyMapping: vi.fn().mockResolvedValue({ paperclipCompanyId: "company-1", paperclipIssueAgentId: "agent-1" }),
      hasActiveRuns: vi.fn().mockResolvedValue(true),
      audit
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

    expect(adminClient.upsertSecret).not.toHaveBeenCalled();
    expect(adminClient.bindAgentSecretRef).not.toHaveBeenCalled();
    expect(bindings.listBindingsBySecretReference).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      eventType: "paperclip.secret_projection_deferred",
      entityType: "paperclip_secret_projection",
      entityId: "11111111-1111-4111-8111-111111111111",
      metadata: {
        lifecycle: "rotate",
        providerKind: "openai_api",
        reason: "active_runs_present"
      }
    });
  });

  it("uses the board-session company secret and agent patch routes", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(200, [
          {
            id: "pc-secret-1",
            key: "OPENAI_API_KEY"
          }
        ])
      )
      .mockResolvedValueOnce(createJsonResponse(200, { id: "pc-secret-1", key: "OPENAI_API_KEY" }))
      .mockResolvedValueOnce(createJsonResponse(200, { id: "agent-1", adapterConfig: { env: {} } }))
      .mockResolvedValueOnce(createJsonResponse(200, { ok: true }));
    const client = createPaperclipSecretBoardSessionHttpClient({
      baseUrl: "https://paperclip.internal.local/",
      boardSessionCookie: "paperclip_board_session=abc123",
      origin: "https://paperclip.internal.local",
      referer: "https://paperclip.internal.local/board",
      fetchImpl
    });

    await expect(
      client.upsertSecret({
        companyId: "company-1",
        secretKey: "OPENAI_API_KEY",
        secretValue: "sk-tenant"
      })
    ).resolves.toEqual({
      paperclipSecretId: "pc-secret-1",
      paperclipSecretKey: "OPENAI_API_KEY",
      paperclipSecretVersion: "latest"
    });
    await expect(
      client.bindAgentSecretRef({
        companyId: "company-1",
        agentId: "agent-1",
        envKey: "OPENAI_API_KEY",
        paperclipSecretId: "pc-secret-1"
      })
    ).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://paperclip.internal.local/api/companies/company-1/secrets",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          cookie: "paperclip_board_session=abc123",
          origin: "https://paperclip.internal.local",
          referer: "https://paperclip.internal.local/board"
        })
      })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://paperclip.internal.local/api/secrets/pc-secret-1/rotate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ value: "sk-tenant" })
      })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      4,
      "https://paperclip.internal.local/api/agents/agent-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          replaceAdapterConfig: true,
          adapterConfig: {
            env: {
              OPENAI_API_KEY: {
                type: "secret_ref",
                secretId: "pc-secret-1",
                version: "latest"
              }
            }
          }
        })
      })
    );
  });

  it("coerces numeric secret versions to numbers when binding agent secret refs", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(200, []))
      .mockResolvedValueOnce(createJsonResponse(200, { id: "pc-secret-9", key: "OPENAI_API_KEY", latestVersion: "14" }))
      .mockResolvedValueOnce(createJsonResponse(200, { id: "agent-1", adapterConfig: { env: {} } }))
      .mockResolvedValueOnce(createJsonResponse(200, { ok: true }));
    const client = createPaperclipSecretBoardSessionHttpClient({
      baseUrl: "https://paperclip.internal.local/",
      boardSessionCookie: "paperclip_board_session=abc123",
      fetchImpl
    });

    const secret = await client.upsertSecret({
      companyId: "company-1",
      secretKey: "OPENAI_API_KEY",
      secretValue: "sk-tenant"
    });
    await client.bindAgentSecretRef({
      companyId: "company-1",
      agentId: "agent-1",
      envKey: "OPENAI_API_KEY",
      paperclipSecretId: secret.paperclipSecretId,
      paperclipSecretVersion: secret.paperclipSecretVersion
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      4,
      "https://paperclip.internal.local/api/agents/agent-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          replaceAdapterConfig: true,
          adapterConfig: {
            env: {
              OPENAI_API_KEY: {
                type: "secret_ref",
                secretId: "pc-secret-9",
                version: 14
              }
            }
          }
        })
      })
    );
  });

  it("normalizes a raw board session token into the expected cookie header", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(200, []))
      .mockResolvedValueOnce(createJsonResponse(200, { id: "pc-secret-4", key: "OPENAI_API_KEY" }));
    const client = createPaperclipSecretBoardSessionHttpClient({
      baseUrl: "https://paperclip.internal.local/",
      boardSessionCookie: "raw-session-token",
      fetchImpl
    });

    await expect(
      client.upsertSecret({
        companyId: "company-1",
        secretKey: "OPENAI_API_KEY",
        secretValue: "sk-tenant"
      })
    ).resolves.toEqual({
      paperclipSecretId: "pc-secret-4",
      paperclipSecretKey: "OPENAI_API_KEY",
      paperclipSecretVersion: "latest"
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://paperclip.internal.local/api/companies/company-1/secrets",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          cookie: "paperclip-default.session_token=raw-session-token",
          origin: "https://paperclip.internal.local",
          referer: "https://paperclip.internal.local/"
        })
      })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://paperclip.internal.local/api/companies/company-1/secrets",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "OPENAI_API_KEY",
          key: "openai_api_key",
          value: "sk-tenant"
        })
      })
    );
  });

  it("recovers from a create conflict by re-listing and rotating the existing company secret", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(200, []))
      .mockResolvedValueOnce(createJsonResponse(409, { error: "duplicate_secret_key" }))
      .mockResolvedValueOnce(
        createJsonResponse(200, [
          {
            id: "pc-secret-5",
            key: "openai_api_key",
            name: "OPENAI_API_KEY"
          }
        ])
      )
      .mockResolvedValueOnce(createJsonResponse(200, { id: "pc-secret-5", key: "openai_api_key" }));
    const client = createPaperclipSecretBoardSessionHttpClient({
      baseUrl: "https://paperclip.internal.local/",
      boardSessionCookie: "raw-session-token",
      fetchImpl
    });

    await expect(
      client.upsertSecret({
        companyId: "company-1",
        secretKey: "OPENAI_API_KEY",
        secretValue: "sk-tenant"
      })
    ).resolves.toEqual({
      paperclipSecretId: "pc-secret-5",
      paperclipSecretKey: "openai_api_key",
      paperclipSecretVersion: "latest"
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://paperclip.internal.local/api/companies/company-1/secrets",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "OPENAI_API_KEY",
          key: "openai_api_key",
          value: "sk-tenant"
        })
      })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "https://paperclip.internal.local/api/companies/company-1/secrets",
      expect.objectContaining({
        method: "GET"
      })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      4,
      "https://paperclip.internal.local/api/secrets/pc-secret-5/rotate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ value: "sk-tenant" })
      })
    );
  });

  it("re-enables a disabled matching secret before rotating it", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(200, [
          {
            id: "pc-secret-disabled",
            key: "openai_api_key",
            name: "OPENAI_API_KEY",
            status: "disabled",
            latestVersion: "12"
          }
        ])
      )
      .mockResolvedValueOnce(createJsonResponse(200, { id: "pc-secret-disabled", status: "active" }))
      .mockResolvedValueOnce(createJsonResponse(200, { id: "pc-secret-disabled", key: "openai_api_key", latestVersion: "13" }));
    const client = createPaperclipSecretBoardSessionHttpClient({
      baseUrl: "https://paperclip.internal.local/",
      boardSessionCookie: "raw-session-token",
      fetchImpl
    });

    await expect(
      client.upsertSecret({
        companyId: "company-1",
        secretKey: "OPENAI_API_KEY",
        secretValue: "sk-tenant"
      })
    ).resolves.toEqual({
      paperclipSecretId: "pc-secret-disabled",
      paperclipSecretKey: "openai_api_key",
      paperclipSecretVersion: "13"
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://paperclip.internal.local/api/secrets/pc-secret-disabled",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "active" })
      })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "https://paperclip.internal.local/api/secrets/pc-secret-disabled/rotate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ value: "sk-tenant" })
      })
    );
  });

  it("prefers an active secret over a disabled match for the same key", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(200, [
          {
            id: "pc-secret-disabled",
            key: "openai_api_key",
            name: "OPENAI_API_KEY",
            status: "disabled",
            latestVersion: "12"
          },
          {
            id: "pc-secret-active",
            key: "openai_api_key",
            name: "OPENAI_API_KEY",
            status: "active",
            latestVersion: "13"
          }
        ])
      )
      .mockResolvedValueOnce(createJsonResponse(200, { id: "pc-secret-active", key: "openai_api_key", latestVersion: "14" }));
    const client = createPaperclipSecretBoardSessionHttpClient({
      baseUrl: "https://paperclip.internal.local/",
      boardSessionCookie: "raw-session-token",
      fetchImpl
    });

    await expect(
      client.upsertSecret({
        companyId: "company-1",
        secretKey: "OPENAI_API_KEY",
        secretValue: "sk-tenant"
      })
    ).resolves.toEqual({
      paperclipSecretId: "pc-secret-active",
      paperclipSecretKey: "openai_api_key",
      paperclipSecretVersion: "14"
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://paperclip.internal.local/api/secrets/pc-secret-active/rotate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ value: "sk-tenant" })
      })
    );
  });

  it("disables the secret and removes the matching env ref on revoke", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          id: "agent-1",
          adapterConfig: {
            env: {
              OPENAI_API_KEY: {
                type: "secret_ref",
                secretId: "pc-secret-1",
                version: "latest"
              },
              OTHER_KEY: {
                type: "secret_ref",
                secretId: "pc-secret-2",
                version: "latest"
              }
            }
          }
        })
      )
      .mockResolvedValueOnce(createJsonResponse(200, { ok: true }))
      .mockResolvedValueOnce(createJsonResponse(200, { id: "pc-secret-1", status: "disabled" }));
    const client = createPaperclipSecretBoardSessionHttpClient({
      baseUrl: "https://paperclip.internal.local/",
      boardSessionCookie: "paperclip_board_session=abc123",
      fetchImpl
    });

    await expect(
      client.revokeSecretBinding?.({
        companyId: "company-1",
        agentId: "agent-1",
        envKey: "OPENAI_API_KEY",
        paperclipSecretId: "pc-secret-1"
      })
    ).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://paperclip.internal.local/api/agents/agent-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          replaceAdapterConfig: true,
          adapterConfig: {
            env: {
              OTHER_KEY: {
                type: "secret_ref",
                secretId: "pc-secret-2",
                version: "latest"
              }
            }
          }
        })
      })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "https://paperclip.internal.local/api/secrets/pc-secret-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "disabled" })
      })
    );
  });

  it("keeps the deprecated admin client wrapper compatible by forwarding to the board-session contract", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(200, []))
      .mockResolvedValueOnce(createJsonResponse(200, { id: "pc-secret-3", key: "OPENAI_API_KEY" }));
    const client = createPaperclipSecretAdminHttpClient({
      baseUrl: "https://paperclip.internal.local/",
      adminToken: "paperclip_board_session=legacy_cookie",
      fetchImpl
    });

    await expect(
      client.upsertSecret({
        companyId: "company-1",
        secretKey: "OPENAI_API_KEY",
        secretValue: "sk-tenant"
      })
    ).resolves.toEqual({
      paperclipSecretId: "pc-secret-3",
      paperclipSecretKey: "OPENAI_API_KEY",
      paperclipSecretVersion: "latest"
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://paperclip.internal.local/api/companies/company-1/secrets",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          cookie: "paperclip_board_session=legacy_cookie",
          origin: "https://paperclip.internal.local",
          referer: "https://paperclip.internal.local/"
        })
      })
    );
  });
});

function createJsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body)
  } as unknown as Response;
}
