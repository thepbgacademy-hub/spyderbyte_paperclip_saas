import { describe, expect, it, vi } from "vitest";

import { createBrowserDashboardClient, createDashboardClient } from "../apps/web/src/dashboard-client.js";

describe("dashboard client", () => {
  it("fetches and maps the Wealth Factory dashboard snapshot from the API", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          tenantName: "Wealth Factory Company",
          role: "operator",
          packages: [{ name: "Installed Package" }],
          providerConnections: [
            { label: "OpenAI", providerKind: "openai_api", connected: true, required: true },
            { label: "Anthropic", providerKind: "anthropic_api", connected: false, required: false }
          ],
          workflows: [{ id: "wf-connect-first", name: "Connect First Workflow", providerKind: "openai_api", enabled: true, startEnabled: false }],
          artifacts: [{ id: "artifact-1", filename: "post.png", artifactType: "image", expiresAt: "2026-05-11T00:00:00.000Z" }],
          storageConnectors: [
            { id: "storage-1", providerKind: "google_drive", displayName: "Company Drive", connected: true, publicTarget: { folderLabel: "Exports" } }
          ],
          platformLoad: {
            level: "moderate",
            summary: "Normal traffic",
            detail: "Slight delays are possible while current work clears."
          }
        })
    });
    const client = createDashboardClient({
      apiBaseUrl: "https://api.wealthfactory.test",
      fetchImpl
    });

    await expect(client.fetchSnapshot({ authorization: "Bearer valid" })).resolves.toEqual({
      tenantName: "Wealth Factory Company",
      packageName: "Installed Package",
      requiredProviders: ["OpenAI"],
      optionalProviders: ["Anthropic", "customer-owned storage"],
      artifactTtlHours: 24,
      role: "operator",
      workflows: [{ id: "wf-connect-first", name: "Connect First Workflow", providerKind: "openai_api", enabled: true, startEnabled: false }],
      artifacts: [{ id: "artifact-1", filename: "post.png", artifactType: "image", expiresAt: "2026-05-11T00:00:00.000Z" }],
      providerConnections: [
        { label: "OpenAI", providerKind: "openai_api", connected: true, required: true },
        { label: "Anthropic", providerKind: "anthropic_api", connected: false, required: false }
      ],
      storageConnectors: [
        { id: "storage-1", providerKind: "google_drive", displayName: "Company Drive", connected: true, publicTarget: { folderLabel: "Exports" } }
      ],
      platformLoad: {
        level: "moderate",
        summary: "Normal traffic",
        detail: "Slight delays are possible while current work clears."
      }
    });
    expect(fetchImpl).toHaveBeenCalledWith("https://api.wealthfactory.test/api/dashboard", {
      headers: { authorization: "Bearer valid" }
    });
  });

  it("starts workflow runs through the dashboard runtime API", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: () => Promise.resolve({ runId: "run-123", queued: true })
    });
    const client = createDashboardClient({
      apiBaseUrl: "https://api.wealthfactory.test",
      fetchImpl
    });

    await expect(client.startWorkflowRun({ authorization: "Bearer valid", workflowId: "workflow-template-1" })).resolves.toEqual({
      runId: "run-123",
      queued: true
    });
    expect(fetchImpl).toHaveBeenCalledWith("https://api.wealthfactory.test/api/dashboard/runs", {
      method: "POST",
      headers: {
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      body: JSON.stringify({ workflowId: "workflow-template-1" })
    });
  });

  it("preserves bounded dashboard run-start conflicts for the caller", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ code: "conflict" })
    });
    const client = createDashboardClient({
      apiBaseUrl: "https://api.wealthfactory.test",
      fetchImpl
    });

    await expect(client.startWorkflowRun({ authorization: "Bearer valid", workflowId: "workflow-template-1" })).rejects.toMatchObject({
      code: "conflict",
      status: 409
    });
  });

  it("creates a browser client from injected dashboard bootstrap config", () => {
    const browserWindow = {
      __WF_DASHBOARD_BOOTSTRAP__: {
        initialSnapshot: {
          tenantName: "Injected Tenant",
          packageName: "Installed Package",
          requiredProviders: ["OpenAI"],
          optionalProviders: ["customer-owned storage"],
          artifactTtlHours: 24,
          role: "member" as const,
          workflows: [],
          artifacts: [],
          providerConnections: [],
          storageConnectors: [],
          platformLoad: {
            level: "light" as const,
            summary: "Light traffic",
            detail: "New workflows should begin processing quickly."
          }
        }
      },
      fetch: vi.fn()
    } as unknown as Window;

    const browserClient = createBrowserDashboardClient(browserWindow);

    expect(browserClient.authorization).toBeNull();
    expect(browserClient.mode).toBe("bootstrap_only");
    expect(browserClient.client.getSnapshot().tenantName).toBe("Injected Tenant");
    expect(browserClient.client.getSnapshot().role).toBe("member");
  });

  it("starts workflow runs when a runtime shell explicitly enables the runtime API", async () => {
    const browserWindow = {
      __WF_DASHBOARD_BOOTSTRAP__: {
        runtimeApiEnabled: true,
        initialSnapshot: {
          tenantName: "Injected Tenant",
          packageName: "Installed Package",
          requiredProviders: ["OpenAI"],
          optionalProviders: ["customer-owned storage"],
          artifactTtlHours: 24,
          role: "member" as const,
          workflows: [],
          artifacts: [],
          providerConnections: [],
          storageConnectors: [],
          platformLoad: {
            level: "light" as const,
            summary: "Light traffic",
            detail: "New workflows should begin processing quickly."
          }
        }
      },
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        status: 202,
        json: () => Promise.resolve({ runId: "run-from-shell", queued: true })
      })
    } as unknown as Window;

    const browserClient = createBrowserDashboardClient(browserWindow);

    await expect(
      browserClient.client.startWorkflowRun({
        authorization: "",
        workflowId: "workflow-template-1"
      })
    ).resolves.toEqual({
      runId: "run-from-shell",
      queued: true
    });
  });

  it("uses the bootstrap snapshot role as the authoritative browser role", () => {
    const browserWindow = {
      __WF_DASHBOARD_BOOTSTRAP__: {
        initialSnapshot: {
          tenantName: "Operator Tenant",
          packageName: "Installed Package",
          requiredProviders: ["OpenAI"],
          optionalProviders: ["customer-owned storage"],
          artifactTtlHours: 24,
          role: "operator" as const,
          workflows: [],
          artifacts: [],
          providerConnections: [],
          storageConnectors: [],
          platformLoad: {
            level: "light" as const,
            summary: "Light traffic",
            detail: "New workflows should begin processing quickly."
          }
        }
      },
      fetch: vi.fn()
    } as unknown as Window;

    const browserClient = createBrowserDashboardClient(browserWindow);

    expect(browserClient.client.getSnapshot().role).toBe("operator");
  });

  it("reads bootstrap JSON from the document shell when no window global is present", () => {
    const browserWindow = {
      document: {
        getElementById: vi.fn().mockReturnValue({
          textContent: JSON.stringify({
            runtimeApiEnabled: true,
            initialResponse: {
              tenantId: "tenant-shell",
              role: "operator",
              packages: [{ name: "Installed Package" }],
              providerConnections: [],
              workflows: [],
              artifacts: [],
              storageConnectors: [],
              platformLoad: {
                level: "light",
                summary: "Light traffic",
                detail: "New workflows should begin processing quickly."
              }
            }
          })
        })
      },
      fetch: vi.fn()
    } as unknown as Window;

    const browserClient = createBrowserDashboardClient(browserWindow);

    expect(browserClient.mode).toBe("runtime_api");
    expect(browserClient.client.getSnapshot().tenantName).toBe("tenant-shell");
    expect(browserClient.client.getSnapshot().role).toBe("operator");
  });

  it("fails closed when the shell bootstrap JSON is malformed", () => {
    const browserWindow = {
      document: {
        getElementById: vi.fn().mockReturnValue({
          textContent: "{bad json"
        })
      },
      fetch: vi.fn()
    } as unknown as Window;

    expect(() => createBrowserDashboardClient(browserWindow)).toThrow(/Invalid dashboard bootstrap/);
  });

  it("fails closed on workflow start when no runtime bootstrap or fetch path exists", async () => {
    const browserWindow = {
      document: {
        getElementById: vi.fn().mockReturnValue(null)
      }
    } as unknown as Window;

    const browserClient = createBrowserDashboardClient(browserWindow);

    expect(browserClient.mode).toBe("bootstrap_only");
    await expect(
      browserClient.client.startWorkflowRun({
        authorization: "",
        workflowId: "workflow-template-1"
      })
    ).rejects.toMatchObject({
      code: "service_unavailable",
      status: 503
    });
  });
});
