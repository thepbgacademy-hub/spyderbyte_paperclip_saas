import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import DashboardPages from "../apps/web/src/pages/DashboardPages.js";
import { createInitialConnectedProviders } from "../apps/web/src/pages/dashboard-data.js";
import type { DashboardSnapshot } from "../apps/web/src/dashboard-client.js";

const snapshot: DashboardSnapshot = {
  tenantName: "Northstar Labs",
  packageName: "Installed Package",
  requiredProviders: ["OpenAI"],
  optionalProviders: ["customer-owned storage"],
  artifactTtlHours: 24,
  role: "member",
  workflows: [{ id: "wf_tax_strategy", name: "Tax Strategy Workflow", providerKind: "openai_api", enabled: true }],
  artifacts: [],
  providerConnections: [{ providerKind: "openai_api", label: "OpenAI", connected: true, required: true }],
  storageConnectors: [],
  platformLoad: {
    level: "light",
    summary: "Light traffic",
    detail: "New workflows should begin processing quickly."
  }
};

describe("dashboard pages", () => {
  it("keeps the home current-focus CTA truthful in bootstrap-only preview shells", () => {
    const markup = renderToStaticMarkup(
      <DashboardPages
        dashboard={snapshot}
        role="member"
        pageKey="home"
        state={{
          theme: "Foundry",
          provider: "OpenAI",
          apiKeyInput: "",
          projectIdInput: "",
          keySaved: false,
          connectedProviders: {
            ...createInitialConnectedProviders(),
            openai: true
          },
          mediaProviderSaved: false,
          googleDriveConnected: false,
          dropboxConnected: false,
          runtimeShellEnabled: false,
          runStatus: "ready",
          workflowStartAvailable: false,
          workflowsPaused: false,
          selectedWorkflowId: "wf_tax_strategy",
          selectedResultId: "result-241",
          teamTab: "Included Team",
          selectedRoleId: "team-ceo",
          resultApprovalStates: {}
        }}
        actions={{
          onNavigate: vi.fn(),
          onThemeChange: vi.fn(),
          onProviderChange: vi.fn(),
          onApiKeyInputChange: vi.fn(),
          onProjectIdInputChange: vi.fn(),
          onSaveKey: vi.fn(),
          onConnectImageProvider: vi.fn(),
          onProviderCardAction: vi.fn(),
          onQueueRun: vi.fn(),
          onSelectWorkflow: vi.fn(),
          onSelectResult: vi.fn(),
          onApproveResult: vi.fn(),
          onRequestRevision: vi.fn(),
          onUpdateTeamTab: vi.fn(),
          onSelectRole: vi.fn(),
          onToggleWorkflowsPaused: vi.fn()
        }}
      />
    );

    expect(markup).toContain("Open the runtime shell to launch workflows");
    expect(markup).toContain("real workflow starts are available only from the authenticated runtime shell");
    expect(markup).not.toContain("Start workflow");
    expect(markup).not.toContain("Launch the next approved workflow");
    expect(markup).toContain("Preview only");
  });

  it("keeps workflow start disabled in bootstrap-only preview shells", () => {
    const markup = renderToStaticMarkup(
      <DashboardPages
        dashboard={snapshot}
        role="member"
        pageKey="workflows"
        state={{
          theme: "Foundry",
          provider: "OpenAI",
          apiKeyInput: "",
          projectIdInput: "",
          keySaved: false,
          connectedProviders: {
            ...createInitialConnectedProviders(),
            openai: true
          },
          mediaProviderSaved: false,
          googleDriveConnected: false,
          dropboxConnected: false,
          runtimeShellEnabled: false,
          runStatus: "ready",
          workflowStartAvailable: false,
          workflowsPaused: false,
          selectedWorkflowId: "wf_tax_strategy",
          selectedResultId: "result-241",
          teamTab: "Included Team",
          selectedRoleId: "team-ceo",
          resultApprovalStates: {}
        }}
        actions={{
          onNavigate: vi.fn(),
          onThemeChange: vi.fn(),
          onProviderChange: vi.fn(),
          onApiKeyInputChange: vi.fn(),
          onProjectIdInputChange: vi.fn(),
          onSaveKey: vi.fn(),
          onConnectImageProvider: vi.fn(),
          onProviderCardAction: vi.fn(),
          onQueueRun: vi.fn(),
          onSelectWorkflow: vi.fn(),
          onSelectResult: vi.fn(),
          onApproveResult: vi.fn(),
          onRequestRevision: vi.fn(),
          onUpdateTeamTab: vi.fn(),
          onSelectRole: vi.fn(),
          onToggleWorkflowsPaused: vi.fn()
        }}
      />
    );

    expect(markup).toContain("Start workflow is available only from the authenticated runtime shell. Preview mode does not queue real runs.");
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*Start workflow/);
  });

  it("keeps runtime-ready current-focus copy framework-agnostic", () => {
    const markup = renderToStaticMarkup(
      <DashboardPages
        dashboard={snapshot}
        role="member"
        pageKey="home"
        state={{
          theme: "Foundry",
          provider: "OpenAI",
          apiKeyInput: "",
          projectIdInput: "",
          keySaved: false,
          connectedProviders: {
            ...createInitialConnectedProviders(),
            openai: true
          },
          mediaProviderSaved: false,
          googleDriveConnected: false,
          dropboxConnected: false,
          runtimeShellEnabled: true,
          runStatus: "ready",
          workflowStartAvailable: true,
          workflowsPaused: false,
          selectedWorkflowId: "wf_tax_strategy",
          selectedResultId: "result-241",
          teamTab: "Included Team",
          selectedRoleId: "team-ceo",
          resultApprovalStates: {}
        }}
        actions={{
          onNavigate: vi.fn(),
          onThemeChange: vi.fn(),
          onProviderChange: vi.fn(),
          onApiKeyInputChange: vi.fn(),
          onProjectIdInputChange: vi.fn(),
          onSaveKey: vi.fn(),
          onConnectImageProvider: vi.fn(),
          onProviderCardAction: vi.fn(),
          onQueueRun: vi.fn(),
          onSelectWorkflow: vi.fn(),
          onSelectResult: vi.fn(),
          onApproveResult: vi.fn(),
          onRequestRevision: vi.fn(),
          onUpdateTeamTab: vi.fn(),
          onSelectRole: vi.fn(),
          onToggleWorkflowsPaused: vi.fn()
        }}
      />
    );

    expect(markup).toContain("Launch the next approved workflow");
    expect(markup).not.toContain("Launch the media calendar");
  });

  it("keeps a dashboard-visible workflow disabled when runtime shell is present but public start is not allowed", () => {
    const reviewOnlySnapshot: DashboardSnapshot = {
      ...snapshot,
      workflows: [
        {
          id: "wf_review_only",
          name: "Review Only Workflow",
          providerKind: "openai_api",
          enabled: true,
          startEnabled: false
        }
      ]
    };

    const markup = renderToStaticMarkup(
      <DashboardPages
        dashboard={reviewOnlySnapshot}
        role="member"
        pageKey="workflows"
        state={{
          theme: "Foundry",
          provider: "OpenAI",
          apiKeyInput: "",
          projectIdInput: "",
          keySaved: false,
          connectedProviders: {
            ...createInitialConnectedProviders(),
            openai: true
          },
          mediaProviderSaved: false,
          googleDriveConnected: false,
          dropboxConnected: false,
          runtimeShellEnabled: true,
          runStatus: "ready",
          workflowStartAvailable: true,
          workflowsPaused: false,
          selectedWorkflowId: "wf_review_only",
          selectedResultId: "result-241",
          teamTab: "Included Team",
          selectedRoleId: "team-ceo",
          resultApprovalStates: {}
        }}
        actions={{
          onNavigate: vi.fn(),
          onThemeChange: vi.fn(),
          onProviderChange: vi.fn(),
          onApiKeyInputChange: vi.fn(),
          onProjectIdInputChange: vi.fn(),
          onSaveKey: vi.fn(),
          onConnectImageProvider: vi.fn(),
          onProviderCardAction: vi.fn(),
          onQueueRun: vi.fn(),
          onSelectWorkflow: vi.fn(),
          onSelectResult: vi.fn(),
          onApproveResult: vi.fn(),
          onRequestRevision: vi.fn(),
          onUpdateTeamTab: vi.fn(),
          onSelectRole: vi.fn(),
          onToggleWorkflowsPaused: vi.fn()
        }}
      />
    );

    expect(markup).toContain("This workflow is visible for review in the dashboard, but it cannot be started from this public surface.");
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*Start workflow/);
  });

  it("shows an empty workflow state instead of local fallback cards when the authenticated runtime shell exposes no workflows", () => {
    const emptyRuntimeSnapshot: DashboardSnapshot = {
      ...snapshot,
      workflows: []
    };

    const markup = renderToStaticMarkup(
      <DashboardPages
        dashboard={emptyRuntimeSnapshot}
        role="member"
        pageKey="workflows"
        state={{
          theme: "Foundry",
          provider: "OpenAI",
          apiKeyInput: "",
          projectIdInput: "",
          keySaved: false,
          connectedProviders: {
            ...createInitialConnectedProviders(),
            openai: true
          },
          mediaProviderSaved: false,
          googleDriveConnected: false,
          dropboxConnected: false,
          runtimeShellEnabled: true,
          runStatus: "ready",
          workflowStartAvailable: false,
          workflowsPaused: false,
          selectedWorkflowId: "",
          selectedResultId: "result-241",
          teamTab: "Included Team",
          selectedRoleId: "team-ceo",
          resultApprovalStates: {}
        }}
        actions={{
          onNavigate: vi.fn(),
          onThemeChange: vi.fn(),
          onProviderChange: vi.fn(),
          onApiKeyInputChange: vi.fn(),
          onProjectIdInputChange: vi.fn(),
          onSaveKey: vi.fn(),
          onConnectImageProvider: vi.fn(),
          onProviderCardAction: vi.fn(),
          onQueueRun: vi.fn(),
          onSelectWorkflow: vi.fn(),
          onSelectResult: vi.fn(),
          onApproveResult: vi.fn(),
          onRequestRevision: vi.fn(),
          onUpdateTeamTab: vi.fn(),
          onSelectRole: vi.fn(),
          onToggleWorkflowsPaused: vi.fn()
        }}
      />
    );

    expect(markup).toContain("No workflows are available on this runtime shell yet.");
    expect(markup).not.toContain("Media calendar");
  });
});
