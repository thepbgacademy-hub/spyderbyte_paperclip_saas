import { describe, expect, it } from "vitest";

import {
  createInitialConnectedProviders,
  getHomeWorkQueue,
  getInsightStats,
  getPlatformLoadVisual,
  getRecentArtifacts,
  getResultCards
} from "../apps/web/src/pages/dashboard-data.js";
import type { DashboardSnapshot } from "../apps/web/src/dashboard-client.js";

const snapshot: DashboardSnapshot = {
  tenantName: "Northstar Labs",
  packageName: "Social Media Agency",
  requiredProviders: ["OpenAI"],
  optionalProviders: ["customer-owned storage"],
  artifactTtlHours: 24,
  role: "member",
  workflows: [{ id: "wf-1", name: "Media Calendar", providerKind: "openai_api", enabled: true }],
  artifacts: [{ id: "artifact-1", filename: "campaign_asset_list.pdf", artifactType: "pdf", expiresAt: "2026-05-20T00:00:00.000Z" }],
  providerConnections: [{ providerKind: "openai_api", label: "OpenAI", connected: false, required: true }],
  storageConnectors: [{ id: "storage-1", providerKind: "google_drive", displayName: "Google Drive", connected: false, publicTarget: {} }],
  platformLoad: {
    level: "moderate",
    summary: "Normal traffic",
    detail: "Slight delays are possible while current work clears."
  }
};

describe("dashboard data helpers", () => {
  it("defaults dto-backed result cards to awaiting review", () => {
    const resultCards = getResultCards(snapshot, {
      googleDriveConnected: false,
      dropboxConnected: false
    });

    expect(resultCards).toEqual([
      expect.objectContaining({
        id: "artifact-1",
        title: "Campaign Asset List",
        status: "Ready to review",
        exportState: "Reconnect storage"
      })
    ]);
  });

  it("builds a home queue from snapshot blockers and available work", () => {
    const queue = getHomeWorkQueue(snapshot, {
      connectedProviders: createInitialConnectedProviders(),
      googleDriveConnected: false,
      dropboxConnected: false,
      workflowsPaused: false,
      resultApprovalStates: {}
    });

    expect(queue).toEqual([
      expect.objectContaining({ task: "Review Campaign Asset List", status: "Ready to review", nextAction: "Open Results" }),
      expect.objectContaining({ task: "Connect OpenAI", status: "Needs connection", nextAction: "Open Providers" }),
      expect.objectContaining({ task: "Reconnect export destination", status: "Needs connection", nextAction: "Open Files" }),
      expect.objectContaining({ task: "Launch the next approved workflow", status: "Blocked", nextAction: "Open Workflows" })
    ]);
  });

  it("only surfaces approval work when a local approval state exists", () => {
    const queue = getHomeWorkQueue(snapshot, {
      connectedProviders: createInitialConnectedProviders(),
      googleDriveConnected: false,
      dropboxConnected: false,
      workflowsPaused: false,
      resultApprovalStates: { "artifact-1": "Awaiting review" }
    });

    expect(queue[0]).toEqual(
      expect.objectContaining({ task: "Review Campaign Asset List", status: "Ready to review", nextAction: "Open Results" })
    );
  });

  it("reports current snapshot counts for insights", () => {
    expect(getInsightStats(snapshot)).toEqual([
      { label: "Approved workflows", value: "1", delta: "1 available now" },
      { label: "Available artifacts", value: "1", delta: "Temporary retention: 24 hours" },
      { label: "Connected providers", value: "0", delta: "Provider setup needed" },
      { label: "Connected storage", value: "0", delta: "Connect an export lane" }
    ]);
  });

  it("keeps disabled dto workflows at zero available instead of falling back to demo counts", () => {
    const disabledSnapshot: DashboardSnapshot = {
      ...snapshot,
      workflows: [{ id: "wf-2", name: "Disabled Workflow", providerKind: "openai_api", enabled: false }]
    };

    expect(getInsightStats(disabledSnapshot)[0]).toEqual({
      label: "Approved workflows",
      value: "1",
      delta: "0 available now"
    });
  });

  it("summarizes recent artifacts from dto fields only", () => {
    const recentArtifacts = getRecentArtifacts(snapshot, {
      googleDriveConnected: true,
      dropboxConnected: false
    });

    expect(recentArtifacts).toEqual([
      {
        title: "Campaign Asset List",
        type: "PDF",
        expires: "Available until May 19",
        delivery: "Google Drive"
      }
    ]);
  });

  it("builds a customer-safe platform load visual", () => {
    expect(getPlatformLoadVisual(snapshot.platformLoad)).toEqual({
      label: "Platform traffic",
      value: "Normal traffic",
      detail: "Slight delays are possible while current work clears.",
      gaugePercent: 56
    });
  });
});
