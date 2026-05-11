import { describe, expect, it, vi } from "vitest";

import { createDashboardClient } from "../apps/web/src/dashboard-client.js";

describe("dashboard client", () => {
  it("fetches and maps the Wealth Factory dashboard snapshot from the API", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          packages: [{ name: "Social Media Agency" }],
          providerConnections: [
            { label: "OpenAI", connected: true },
            { label: "Anthropic", connected: false }
          ],
          workflows: [{ name: "Wealth Factory Social Calendar" }],
          artifacts: [{ expiresAt: "2026-05-11T00:00:00.000Z" }]
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
      optionalProviders: ["customer-owned storage"],
      artifactTtlHours: 24
    });
    expect(fetchImpl).toHaveBeenCalledWith("https://api.wealthfactory.test/api/dashboard", {
      headers: { authorization: "Bearer valid" }
    });
  });
});
