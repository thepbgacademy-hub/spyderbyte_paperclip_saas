import { describe, expect, it, vi } from "vitest";

import { createDashboardApi } from "../src/api/dashboard-api.js";

const session = { userId: "user-1", tenantId: "tenant-1", role: "member" as const };

describe("authenticated dashboard API", () => {
  it("rejects requests without a valid session before resolving tenant data", async () => {
    const api = createDashboardApi({
      authenticate: vi.fn().mockResolvedValue(null),
      requireTenantMember: vi.fn(),
      listWorkflows: vi.fn(),
      listPackages: vi.fn(),
      listArtifacts: vi.fn(),
      listProviderConnections: vi.fn()
    });

    await expect(api.listDashboard({ authorization: "" })).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("returns Wealth Factory dashboard DTOs after auth and tenant membership checks", async () => {
    const deps = {
      authenticate: vi.fn().mockResolvedValue(session),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      listWorkflows: vi.fn().mockResolvedValue([{ id: "wf-social-calendar", name: "Wealth Factory Social Calendar" }]),
      listPackages: vi.fn().mockResolvedValue([{ id: "pkg-social", name: "Social Media Agency" }]),
      listArtifacts: vi.fn().mockResolvedValue([{ id: "artifact-1", filename: "post.png", expiresAt: "2026-05-11T00:00:00.000Z" }]),
      listProviderConnections: vi.fn().mockResolvedValue([{ providerKind: "openai_api", label: "OpenAI", connected: true }])
    };
    const api = createDashboardApi(deps);

    await expect(api.listDashboard({ authorization: "Bearer valid" })).resolves.toEqual({
      tenantId: "tenant-1",
      role: "member",
      workflows: [{ id: "wf-social-calendar", name: "Wealth Factory Social Calendar" }],
      packages: [{ id: "pkg-social", name: "Social Media Agency" }],
      artifacts: [{ id: "artifact-1", filename: "post.png", expiresAt: "2026-05-11T00:00:00.000Z" }],
      providerConnections: [{ providerKind: "openai_api", label: "OpenAI", connected: true }]
    });

    expect(deps.requireTenantMember).toHaveBeenCalledWith({ tenantId: "tenant-1", userId: "user-1" });
  });

  it("runs response guard over dashboard payloads", async () => {
    const api = createDashboardApi({
      authenticate: vi.fn().mockResolvedValue(session),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      listWorkflows: vi.fn().mockResolvedValue([{ id: "wf-leak", paperclip_run_id: "pc-run-1" }]),
      listPackages: vi.fn().mockResolvedValue([]),
      listArtifacts: vi.fn().mockResolvedValue([]),
      listProviderConnections: vi.fn().mockResolvedValue([])
    });

    await expect(api.listDashboard({ authorization: "Bearer valid" })).rejects.toThrow("Forbidden customer-facing field");
  });
});
