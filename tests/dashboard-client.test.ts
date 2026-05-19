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
          packages: [{ name: "Social Media Agency" }],
          providerConnections: [
            { label: "OpenAI", providerKind: "openai_api", connected: true, required: true },
            { label: "Anthropic", providerKind: "anthropic_api", connected: false, required: false }
          ],
          workflows: [{ id: "wf-social-calendar", name: "Wealth Factory Social Calendar", providerKind: "openai_api", enabled: true }],
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
      packageName: "Social Media Agency",
      requiredProviders: ["OpenAI"],
      optionalProviders: ["Anthropic", "customer-owned storage"],
      artifactTtlHours: 24,
      role: "operator",
      workflows: [{ id: "wf-social-calendar", name: "Wealth Factory Social Calendar", providerKind: "openai_api", enabled: true }],
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

  it("creates a browser client from injected dashboard bootstrap config", () => {
    const browserWindow = {
      __WF_DASHBOARD_BOOTSTRAP__: {
        initialSnapshot: {
          tenantName: "Injected Tenant",
          packageName: "Social Media Agency",
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
    expect(browserClient.client.getSnapshot().tenantName).toBe("Injected Tenant");
    expect(browserClient.client.getSnapshot().role).toBe("member");
  });

  it("uses the bootstrap snapshot role as the authoritative browser role", () => {
    const browserWindow = {
      __WF_DASHBOARD_BOOTSTRAP__: {
        initialSnapshot: {
          tenantName: "Operator Tenant",
          packageName: "Social Media Agency",
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
            initialResponse: {
              tenantId: "tenant-shell",
              role: "operator",
              packages: [{ name: "Social Media Agency" }],
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
});
