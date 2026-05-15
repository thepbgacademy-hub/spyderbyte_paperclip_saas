import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { createBrowserDashboardClient, type DashboardSnapshot } from "./dashboard-client.js";
import DashboardPages, { type DashboardPageActions, type DashboardPageState } from "./pages/DashboardPages.js";
import {
  createInitialConnectedProvidersFromSnapshot,
  getInitialSelectedRoleId,
  getPagePath,
  getWorkflowCards,
  hasConnectedStorage,
  includedRoles,
  resultCards,
  workflowCards,
  type ApprovalState,
  type PageKey,
  type ProviderCardId,
  type Role,
  type TeamTab
} from "./pages/dashboard-data.js";
import { ShellLayout } from "./shell/ShellLayout.js";
import { HIDDEN_SHELL_FLAGS } from "./shell/feature-flags.js";
import { useTheme } from "./shell/theme-context.js";
import { HIDDEN_FUTURE_ROUTES, VISIBLE_WEALTH_FACTORY_ROUTES, resolveShellRoute } from "./shell/navigation.js";

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const shellFeatureFlags = HIDDEN_SHELL_FLAGS;
  const dashboardRuntime = useMemo(() => createBrowserDashboardClient(), []);
  const [dashboard] = useState<DashboardSnapshot>(() => dashboardRuntime.client.getSnapshot());
  const role: Role = dashboard.role;
  const [provider, setProvider] = useState("OpenAI");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [projectIdInput, setProjectIdInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [keySaved, setKeySaved] = useState(false);
  const [connectedProviders, setConnectedProviders] = useState(() => createInitialConnectedProvidersFromSnapshot(dashboardRuntime.client.getSnapshot()));
  const [mediaProviderSaved, setMediaProviderSaved] = useState(false);
  const [googleDriveConnected, setGoogleDriveConnected] = useState(() => hasConnectedStorage(dashboardRuntime.client.getSnapshot(), "google_drive"));
  const [dropboxConnected, setDropboxConnected] = useState(() => hasConnectedStorage(dashboardRuntime.client.getSnapshot(), "dropbox"));
  const [runStatus, setRunStatus] = useState<DashboardPageState["runStatus"]>("ready");
  const [workflowsPaused, setWorkflowsPaused] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(dashboardRuntime.client.getSnapshot().workflows[0]?.id ?? workflowCards[0]!.id);
  const [selectedResultId, setSelectedResultId] = useState<string>(dashboardRuntime.client.getSnapshot().artifacts[0]?.id ?? resultCards[0]!.id);
  const [teamTab, setTeamTab] = useState<TeamTab>("Included Team");
  const [selectedRoleId, setSelectedRoleId] = useState<string>(includedRoles[0]!.id);
  const [resultApprovalStates, setResultApprovalStates] = useState<Record<string, ApprovalState>>({
    "result-241": "Awaiting review",
    "result-238": "Revision needed"
  });

  const activeRoute = resolveShellRoute(location.pathname, shellFeatureFlags);
  const providerReady = connectedProviders.openai;
  const requiresMediaProvider = dashboard.workflows.length === 0;
  const packageReady = providerReady && (!requiresMediaProvider || mediaProviderSaved);

  useEffect(() => {
    setConnectedProviders(createInitialConnectedProvidersFromSnapshot(dashboard));
    setGoogleDriveConnected(hasConnectedStorage(dashboard, "google_drive"));
    setDropboxConnected(hasConnectedStorage(dashboard, "dropbox"));
    setMediaProviderSaved(false);
    if (dashboard.workflows.length > 0 && !dashboard.workflows.some((workflow) => workflow.id === selectedWorkflowId)) {
      setSelectedWorkflowId(dashboard.workflows[0]!.id);
    }
    if (dashboard.artifacts.length > 0 && !dashboard.artifacts.some((artifact) => artifact.id === selectedResultId)) {
      setSelectedResultId(dashboard.artifacts[0]!.id);
    }
  }, [dashboard, selectedResultId, selectedWorkflowId]);

  const dashboardState = useMemo<DashboardPageState>(
    () => ({
      connectedProviders,
      dropboxConnected,
      googleDriveConnected,
      apiKeyInput,
      keySaved,
      mediaProviderSaved,
      provider,
      projectIdInput,
      resultApprovalStates,
      runStatus,
      selectedResultId,
      selectedRoleId,
      selectedWorkflowId,
      teamTab,
      theme,
      workflowsPaused
    }),
    [
      connectedProviders,
      dropboxConnected,
      googleDriveConnected,
      apiKeyInput,
      keySaved,
      mediaProviderSaved,
      provider,
      projectIdInput,
      resultApprovalStates,
      runStatus,
      selectedResultId,
      selectedRoleId,
      selectedWorkflowId,
      teamTab,
      theme,
      workflowsPaused
    ]
  );

  function handleNavigate(page: PageKey) {
    navigate(getPagePath(page));
  }

  function handleSaveKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const apiKey = String(new FormData(event.currentTarget).get("apiKey") ?? "");
    if (!apiKey.trim()) {
      return;
    }

    setKeySaved(true);
    setConnectedProviders((current) => ({
      ...current,
      [provider === "Anthropic" ? "anthropic" : provider === "xAI Grok" ? "xaiGrok" : provider === "OpenRouter" ? "openRouter" : "openai"]: true
    }));
    setApiKeyInput("");
    setProjectIdInput("");
  }

  function handleProviderCardAction(providerId: ProviderCardId) {
    if (providerId === "drive") {
      setGoogleDriveConnected(true);
      return;
    }
    if (providerId === "dropbox") {
      setDropboxConnected(true);
      return;
    }
    if (providerId === "openai") {
      setProvider("OpenAI");
    } else if (providerId === "anthropic") {
      setProvider("Anthropic");
    } else if (providerId === "xaiGrok") {
      setProvider("xAI Grok");
    } else if (providerId === "openRouter") {
      setProvider("OpenRouter");
    }
    setApiKeyInput("");
    setProjectIdInput("");
    setKeySaved(false);
  }

  function handleQueueRun() {
    const selectedWorkflow = getWorkflowCards(dashboard, { connectedProviders }).find((workflow) => workflow.id === selectedWorkflowId);
    const selectedWorkflowReady = selectedWorkflow?.readiness === "Available now";

    if (workflowsPaused) {
      setRunStatus("paused");
      return;
    }
    if (!packageReady || !selectedWorkflowReady) {
      return;
    }
    setRunStatus("queued");
    navigate("/results");
  }

  function handleUpdateTeamTab(nextTab: TeamTab) {
    setTeamTab(nextTab);
    setSelectedRoleId(getInitialSelectedRoleId(nextTab));
  }

  const actions: DashboardPageActions = {
    onApproveResult(resultId) {
      setResultApprovalStates((current) => ({
        ...current,
        [resultId]: "Approved"
      }));
      setRunStatus("completed");
    },
    onConnectImageProvider() {
      setMediaProviderSaved(true);
    },
    onApiKeyInputChange(value) {
      setApiKeyInput(value);
    },
    onNavigate: handleNavigate,
    onProviderCardAction: handleProviderCardAction,
    onProviderChange(nextProvider) {
      setProvider(nextProvider);
      setApiKeyInput("");
      setProjectIdInput("");
      setKeySaved(false);
    },
    onProjectIdInputChange(value) {
      setProjectIdInput(value);
    },
    onQueueRun: handleQueueRun,
    onRequestRevision(resultId) {
      setResultApprovalStates((current) => ({
        ...current,
        [resultId]: "Revision needed"
      }));
    },
    onSaveKey: handleSaveKey,
    onSelectResult(resultId) {
      setSelectedResultId(resultId);
    },
    onSelectRole(roleId) {
      setSelectedRoleId(roleId);
    },
    onSelectWorkflow(workflowId) {
      setSelectedWorkflowId(workflowId);
    },
    onThemeChange(nextTheme) {
      setTheme(nextTheme);
    },
    onToggleWorkflowsPaused() {
      setWorkflowsPaused((current) => !current);
    },
    onUpdateTeamTab: handleUpdateTeamTab
  };

  if (!activeRoute) {
    return <Navigate replace to="/" />;
  }

  return (
    <ShellLayout
      activePath={location.pathname}
      featureFlags={shellFeatureFlags}
      onNavigate={(path) => navigate(path)}
      packageName={dashboard.packageName}
      roleLabel={role === "operator" ? "Operator" : "Member"}
      searchValue={searchQuery}
      tenantName={dashboard.tenantName}
      onSearchChange={setSearchQuery}
    >
      <Routes>
        {VISIBLE_WEALTH_FACTORY_ROUTES.map((route) => (
          <Route
            key={route.key}
            path={route.path}
            element={<DashboardPages actions={actions} dashboard={dashboard} pageKey={route.key as PageKey} role={role} state={dashboardState} />}
          />
        ))}
        {HIDDEN_FUTURE_ROUTES.map((route) => (
          <Route
            key={route.key}
            path={route.path}
            element={
              <section className="pageGrid singlePage" data-testid={route.pageTestId}>
                <section className="panel">
                  <div className="panelHeader">
                    <p className="eyebrow">Future Surface</p>
                  </div>
                  <h2>{route.label}</h2>
                  <p className="bodyCopy">{route.header.summary}</p>
                </section>
              </section>
            }
          />
        ))}
        <Route path="/home" element={<Navigate replace to="/" />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </ShellLayout>
  );
}
