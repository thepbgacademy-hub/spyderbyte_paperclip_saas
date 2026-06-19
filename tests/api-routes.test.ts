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
      listProviderConnections: vi.fn(),
      listStorageConnectors: vi.fn(),
      getPlatformLoad: vi.fn()
    });

    await expect(api.listDashboard({ authorization: "" })).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("returns Wealth Factory dashboard DTOs after auth and tenant membership checks", async () => {
    const deps = {
      authenticate: vi.fn().mockResolvedValue(session),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      listWorkflows: vi.fn().mockResolvedValue([{ id: "wf-connect-first", name: "Connect First Workflow" }]),
      listPackages: vi.fn().mockResolvedValue([{ id: "pkg-bib-connect", name: "Connect First" }]),
      listArtifacts: vi.fn().mockResolvedValue([{ id: "artifact-1", filename: "post.png", expiresAt: "2026-05-11T00:00:00.000Z" }]),
      listProviderConnections: vi.fn().mockResolvedValue([{ providerKind: "openai_api", label: "OpenAI", connected: true }]),
      listStorageConnectors: vi
        .fn()
        .mockResolvedValue([{ id: "storage-1", providerKind: "google_drive", displayName: "Company Drive", connected: true, publicTarget: { folderLabel: "Exports" } }]),
      getPlatformLoad: vi.fn().mockResolvedValue({
        level: "light",
        summary: "Light traffic",
        detail: "New workflows should begin processing quickly."
      })
    };
    const api = createDashboardApi(deps);

    await expect(api.listDashboard({ authorization: "Bearer valid" })).resolves.toEqual({
      tenantId: "tenant-1",
      role: "member",
      workflows: [{ id: "wf-connect-first", name: "Connect First Workflow", startEnabled: true }],
      packages: [{ id: "pkg-bib-connect", name: "Connect First" }],
      artifacts: [{ id: "artifact-1", filename: "post.png", expiresAt: "2026-05-11T00:00:00.000Z" }],
      providerConnections: [{ providerKind: "openai_api", label: "OpenAI", connected: true }],
      storageConnectors: [{ id: "storage-1", providerKind: "google_drive", displayName: "Company Drive", connected: true, publicTarget: { folderLabel: "Exports" } }],
      platformLoad: {
        level: "light",
        summary: "Light traffic",
        detail: "New workflows should begin processing quickly."
      }
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
      listProviderConnections: vi.fn().mockResolvedValue([]),
      listStorageConnectors: vi.fn().mockResolvedValue([]),
      getPlatformLoad: vi.fn().mockResolvedValue({
        level: "light",
        summary: "Light traffic",
        detail: "New workflows should begin processing quickly."
      })
    });

    await expect(api.listDashboard({ authorization: "Bearer valid" })).rejects.toThrow("Forbidden customer-facing field");
  });

  it("rejects dashboard payloads that leak harness worker envelope metadata", async () => {
    const api = createDashboardApi({
      authenticate: vi.fn().mockResolvedValue(session),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      listWorkflows: vi.fn().mockResolvedValue([
        {
          id: "wf-leak",
          name: "Connect First Workflow",
          boardContext: {
            runState: "working"
          }
        }
      ]),
      listPackages: vi.fn().mockResolvedValue([]),
      listArtifacts: vi.fn().mockResolvedValue([]),
      listProviderConnections: vi.fn().mockResolvedValue([]),
      listStorageConnectors: vi.fn().mockResolvedValue([]),
      getPlatformLoad: vi.fn().mockResolvedValue({
        level: "light",
        summary: "Light traffic",
        detail: "New workflows should begin processing quickly."
      })
    });

    await expect(api.listDashboard({ authorization: "Bearer valid" })).rejects.toThrow("Forbidden customer-facing field");
  });

  it("rejects storage connector summaries that leak private connector handles", async () => {
    const api = createDashboardApi({
      authenticate: vi.fn().mockResolvedValue(session),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      listWorkflows: vi.fn().mockResolvedValue([]),
      listPackages: vi.fn().mockResolvedValue([]),
      listArtifacts: vi.fn().mockResolvedValue([]),
      listProviderConnections: vi.fn().mockResolvedValue([]),
      listStorageConnectors: vi
        .fn()
        .mockResolvedValue([{ id: "storage-1", providerKind: "google_drive", displayName: "Company Drive", connected: true, publicTarget: { oauthTokenRef: "vault://oauth" } }]),
      getPlatformLoad: vi.fn().mockResolvedValue({
        level: "light",
        summary: "Light traffic",
        detail: "New workflows should begin processing quickly."
      })
    });

    await expect(api.listDashboard({ authorization: "Bearer valid" })).rejects.toThrow("Forbidden customer-facing field");
  });

  it("fails closed when a run-start request targets a workflow outside the tenant-visible dashboard catalog", async () => {
    const deps = {
      authenticate: vi.fn().mockResolvedValue(session),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      listWorkflows: vi.fn().mockResolvedValue([{ id: "workflow-template-1", name: "Connect First Workflow", enabled: true }]),
      listPackages: vi.fn().mockResolvedValue([]),
      listArtifacts: vi.fn().mockResolvedValue([]),
      listProviderConnections: vi.fn().mockResolvedValue([]),
      listStorageConnectors: vi.fn().mockResolvedValue([]),
      getPlatformLoad: vi.fn().mockResolvedValue({
        level: "light",
        summary: "Light traffic",
        detail: "New workflows should begin processing quickly."
      }),
      startWorkflowRun: vi.fn()
    };
    const api = createDashboardApi(deps);

    await expect(
      api.startWorkflowRun({ authorization: "Bearer valid", workflowId: "wf-example-audit" })
    ).rejects.toMatchObject({ code: "invalid_request" });

    expect(deps.startWorkflowRun).not.toHaveBeenCalled();
  });

  it("allows a run-start request when the workflow is present in the tenant-visible dashboard catalog", async () => {
    const deps = {
      authenticate: vi.fn().mockResolvedValue(session),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      listWorkflows: vi.fn().mockResolvedValue([{ id: "workflow-template-1", name: "Connect First Workflow", enabled: true }]),
      listPackages: vi.fn().mockResolvedValue([]),
      listArtifacts: vi.fn().mockResolvedValue([]),
      listProviderConnections: vi.fn().mockResolvedValue([]),
      listStorageConnectors: vi.fn().mockResolvedValue([]),
      getPlatformLoad: vi.fn().mockResolvedValue({
        level: "light",
        summary: "Light traffic",
        detail: "New workflows should begin processing quickly."
      }),
      startWorkflowRun: vi.fn().mockResolvedValue({ runId: "run-123", queued: true })
    };
    const api = createDashboardApi(deps);

    await expect(
      api.startWorkflowRun({ authorization: "Bearer valid", workflowId: "workflow-template-1" })
    ).resolves.toEqual({ runId: "run-123", queued: true });

    expect(deps.startWorkflowRun).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: "user-1",
      workflowId: "workflow-template-1"
    });
  });

  it("fails closed when a workflow is visible in the dashboard catalog but not start-enabled on that public seam", async () => {
    const deps = {
      authenticate: vi.fn().mockResolvedValue(session),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      listWorkflows: vi.fn().mockResolvedValue([
        { id: "wf-visible-review-only", name: "Visible Review Only Workflow", enabled: true, startEnabled: false }
      ]),
      listPackages: vi.fn().mockResolvedValue([]),
      listArtifacts: vi.fn().mockResolvedValue([]),
      listProviderConnections: vi.fn().mockResolvedValue([]),
      listStorageConnectors: vi.fn().mockResolvedValue([]),
      getPlatformLoad: vi.fn().mockResolvedValue({
        level: "light",
        summary: "Light traffic",
        detail: "New workflows should begin processing quickly."
      }),
      startWorkflowRun: vi.fn()
    };
    const api = createDashboardApi(deps);

    await expect(
      api.startWorkflowRun({ authorization: "Bearer valid", workflowId: "wf-visible-review-only" })
    ).rejects.toMatchObject({ code: "invalid_request" });

    expect(deps.startWorkflowRun).not.toHaveBeenCalled();
  });
});
