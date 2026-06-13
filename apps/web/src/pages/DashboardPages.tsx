import {
  CircleAlert,
  Download,
  Lock,
  Play,
  Send,
  ToggleLeft
} from "lucide-react";
import type { FormEvent } from "react";

import type { DashboardSnapshot } from "../dashboard-client.js";
import {
  billingRows,
  getExpiringDownloadItems,
  getFileRows,
  getCurrentFocus,
  getHomeNextSteps,
  getHomeWorkQueue,
  getInsightStats,
  getNeedsAttentionItems,
  getPageTestId,
  getPlatformLoadVisual,
  getOperatingSnapshotMetrics,
  getRecentArtifacts,
  getResultCards,
  getSelectedRole,
  getStatusCopy,
  getTeamCollection,
  getThemeDescription,
  getWorkflowCards,
  includedRoles,
  packageSummary,
  profileRows,
  providerCards,
  resolveProviderState,
  themePresets,
  type ApprovalState,
  type PageKey,
  type ProviderCardId,
  type ProviderKey,
  type Role,
  type RunStatus,
  type TeamTab,
} from "./dashboard-data.js";

export interface DashboardPageState {
  theme: (typeof themePresets)[number];
  provider: string;
  apiKeyInput: string;
  projectIdInput: string;
  keySaved: boolean;
  connectedProviders: Record<ProviderKey, boolean>;
  mediaProviderSaved: boolean;
  googleDriveConnected: boolean;
  dropboxConnected: boolean;
  runtimeShellEnabled: boolean;
  runStatus: RunStatus;
  workflowStartAvailable: boolean;
  workflowsPaused: boolean;
  selectedWorkflowId: string;
  selectedResultId: string;
  teamTab: TeamTab;
  selectedRoleId: string;
  resultApprovalStates: Record<string, ApprovalState>;
}

export interface DashboardPageActions {
  onNavigate: (page: PageKey) => void;
  onThemeChange: (theme: DashboardPageState["theme"]) => void;
  onProviderChange: (provider: string) => void;
  onApiKeyInputChange: (value: string) => void;
  onProjectIdInputChange: (value: string) => void;
  onSaveKey: (event: FormEvent<HTMLFormElement>) => void;
  onConnectImageProvider: () => void;
  onProviderCardAction: (providerId: ProviderCardId) => void;
  onQueueRun: () => void;
  onSelectWorkflow: (workflowId: string) => void;
  onSelectResult: (resultId: string) => void;
  onApproveResult: (resultId: string) => void;
  onRequestRevision: (resultId: string) => void;
  onUpdateTeamTab: (teamTab: TeamTab) => void;
  onSelectRole: (roleId: string) => void;
  onToggleWorkflowsPaused: () => void;
}

export interface DashboardPagesProps {
  dashboard: DashboardSnapshot;
  role: Role;
  pageKey: PageKey;
  state: DashboardPageState;
  actions: DashboardPageActions;
}

export function DashboardPages(props: DashboardPagesProps) {
  const providerReady = props.state.connectedProviders.openai;
  const requiresMediaProvider = props.dashboard.workflows.length === 0;
  const packageReady = providerReady && (!requiresMediaProvider || props.state.mediaProviderSaved);
  const workflowItems = getWorkflowCards(props.dashboard, {
    connectedProviders: props.state.connectedProviders,
    allowFallbackCatalog: !props.state.runtimeShellEnabled
  });
  const resultItems = getResultCards(props.dashboard, {
    googleDriveConnected: props.state.googleDriveConnected,
    dropboxConnected: props.state.dropboxConnected
  });
  const selectedWorkflow = workflowItems.find((workflow) => workflow.id === props.state.selectedWorkflowId) ?? workflowItems[0] ?? null;
  const selectedResult = resultItems.find((result) => result.id === props.state.selectedResultId) ?? resultItems[0]!;
  const fileItems = getFileRows(props.dashboard, {
    googleDriveConnected: props.state.googleDriveConnected,
    dropboxConnected: props.state.dropboxConnected
  });
  const snapshotContext = {
    connectedProviders: props.state.connectedProviders,
    googleDriveConnected: props.state.googleDriveConnected,
    dropboxConnected: props.state.dropboxConnected,
    workflowStartAvailable: props.state.workflowStartAvailable,
    workflowsPaused: props.state.workflowsPaused,
    resultApprovalStates: props.state.resultApprovalStates
  };
  const selectedApprovalState = props.state.resultApprovalStates[selectedResult.id] ?? "Awaiting review";
  const selectedRole = getSelectedRole(props.state.teamTab, props.state.selectedRoleId);
  const statusCopy = getStatusCopy({
    packageReady,
    workflowStartAvailable: props.state.workflowStartAvailable,
    runStatus: props.state.runStatus,
    workflowsPaused: props.state.workflowsPaused
  });
  const currentFocus = getCurrentFocus({
    packageReady,
    providerReady,
    workflowStartAvailable: props.state.workflowStartAvailable,
    runStatus: props.state.runStatus,
    workflowsPaused: props.state.workflowsPaused,
    selectedApprovalState,
    googleDriveConnected: props.state.googleDriveConnected,
    dropboxConnected: props.state.dropboxConnected
  });
  const workflowLaunchReady =
    selectedWorkflow !== null &&
    selectedWorkflow.readiness === "Available now" &&
    selectedWorkflow.startEnabled &&
    packageReady &&
    !props.state.workflowsPaused &&
    props.state.workflowStartAvailable;
  const homeNextSteps = getHomeNextSteps(props.dashboard, snapshotContext);
  const expiringDownloads = getExpiringDownloadItems(props.dashboard, {
    googleDriveConnected: props.state.googleDriveConnected,
    dropboxConnected: props.state.dropboxConnected
  });
  const attentionItems = getNeedsAttentionItems(props.dashboard, snapshotContext);
  const operatingSnapshot = getOperatingSnapshotMetrics(props.dashboard, snapshotContext);
  const homeWorkQueue = getHomeWorkQueue(props.dashboard, snapshotContext);
  const insightStats = getInsightStats(props.dashboard);
  const platformLoad = getPlatformLoadVisual(props.dashboard.platformLoad);
  const recentArtifacts = getRecentArtifacts(props.dashboard, {
    googleDriveConnected: props.state.googleDriveConnected,
    dropboxConnected: props.state.dropboxConnected
  });

  function openCurrentFocusPrimary() {
    if (currentFocus.primary === "Open Results") {
      props.actions.onNavigate("results");
      return;
    }
    if (currentFocus.primary === "Open Workflows") {
      props.actions.onNavigate("workflows");
      return;
    }
    if (currentFocus.primary === "Open Providers") {
      props.actions.onNavigate("providers");
      return;
    }
    props.actions.onQueueRun();
  }

  function openCurrentFocusSecondary() {
    if (currentFocus.secondary === "Open Results") {
      props.actions.onNavigate("results");
      return;
    }
    if (currentFocus.secondary === "Open Files") {
      props.actions.onNavigate("files");
      return;
    }
    if (currentFocus.secondary === "Review package") {
      props.actions.onNavigate("package");
      return;
    }
    props.actions.onNavigate("workflows");
  }

  if (props.pageKey === "home") {
    return (
      <section className="pageGrid homeLayout" data-testid={getPageTestId("home")}>
        <article className="heroPanel">
          <div className="panelHeader">
            <p className="eyebrow">Current Focus</p>
            <span className="contextBadge">{props.dashboard.tenantName}</span>
          </div>
          <h2>{currentFocus.title}</h2>
          <p className="bodyCopy">{currentFocus.summary}</p>
          <div className="chipRow">
            {currentFocus.chips.map((chip) => (
              <span key={chip} className="statusChip">
                {chip}
              </span>
            ))}
          </div>
          <div className="actionRow">
            <button className="primaryButton" onClick={openCurrentFocusPrimary} type="button">
              <Play size={16} />
              {currentFocus.primary}
            </button>
            <button className="secondaryButton" onClick={openCurrentFocusSecondary} type="button">
              {currentFocus.secondary}
            </button>
          </div>
        </article>

        <aside className="contextRail">
          <section className="panel compact">
            <div className="panelHeader">
              <p className="eyebrow">Next Steps</p>
            </div>
            <ul className="simpleList">
              {homeNextSteps.map((item) => (
                <li key={item.title}>
                  {item.title} | {item.detail}
                </li>
              ))}
            </ul>
          </section>
          <section className="panel compact">
            <div className="panelHeader">
              <p className="eyebrow">Expiring Downloads</p>
            </div>
            <ul className="simpleList">
              {expiringDownloads.map((item) => (
                <li key={item.title}>
                  {item.title} | {item.detail}
                </li>
              ))}
            </ul>
          </section>
        </aside>

        <section className="panel">
          <div className="panelHeader">
            <p className="eyebrow">Needs Attention</p>
          </div>
          <ul className="attentionList">
            {attentionItems.map((item) => (
              <li key={item.id}>
                <CircleAlert size={16} />
                {item.message}
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <div className="panelHeader">
            <p className="eyebrow">Operating Snapshot</p>
          </div>
          <div className="metricGrid">
            {operatingSnapshot.map((metric) => (
              <MetricCard key={metric.label} label={metric.label} value={metric.value} detail={metric.detail} />
            ))}
          </div>
        </section>

        <section className="panel wide">
          <div className="panelHeader">
            <p className="eyebrow">Work Queue</p>
          </div>
          <div className="tableShell">
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Status</th>
                  <th>Next action</th>
                </tr>
              </thead>
              <tbody>
                {homeWorkQueue.map((row) => (
                  <tr key={row.task}>
                    <td>{row.task}</td>
                    <td>{row.status}</td>
                    <td>{row.nextAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {props.role === "operator" ? (
          <section className="panel wide">
            <div className="panelHeader">
              <p className="eyebrow">Operator Oversight</p>
            </div>
            <div className="operatorStrip">
              <p className="bodyCopy">
                This readout is visible only in the operator-authorized session and keeps customer-facing copy sanitized.
              </p>
              <button className="secondaryButton" onClick={props.actions.onToggleWorkflowsPaused} type="button">
                <ToggleLeft size={16} />
                {props.state.workflowsPaused ? "Enable tenant workflows" : "Disable tenant workflows"}
              </button>
            </div>
          </section>
        ) : null}
      </section>
    );
  }

  if (props.pageKey === "workflows") {
    return (
      <section className="pageGrid focusedLayout" data-testid={getPageTestId("workflows")}>
        <section className="panel listPanel">
          <div className="panelHeader">
            <p className="eyebrow">Workflow Catalog</p>
          </div>
          {workflowItems.length === 0 ? (
            <div className="emptyState">
              <strong>No workflows are available on this runtime shell yet.</strong>
              <p>Installed package visibility is active, but no customer-startable or reviewable workflow catalog entries are exposed here right now.</p>
            </div>
          ) : null}
          {workflowItems.map((workflow) => (
            <button
              key={workflow.id}
              className={`listCard${selectedWorkflow?.id === workflow.id ? " selected" : ""}`}
              onClick={() => props.actions.onSelectWorkflow(workflow.id)}
              type="button"
            >
              <div>
                <strong>{workflow.name}</strong>
                <p>{workflow.description}</p>
              </div>
              <span className="statusChip">{workflow.readiness}</span>
            </button>
          ))}
        </section>

        <section className="panel detailPanel">
          <div className="panelHeader">
            <p className="eyebrow">Selected Workflow</p>
            <span className="contextBadge">{selectedWorkflow?.readiness ?? "Unavailable"}</span>
          </div>
          {selectedWorkflow ? (
            <>
              <h2>{selectedWorkflow.name}</h2>
              <p className="bodyCopy">{selectedWorkflow.outcome}</p>
              <div className="detailGrid">
                <InfoBlock label="Be ready with" value={selectedWorkflow.inputs} />
                <InfoBlock label="Required providers" value={selectedWorkflow.providerTags.join(" | ")} />
                <InfoBlock label="Output type" value={selectedWorkflow.outputType} />
                <InfoBlock label="Next milestone" value={selectedWorkflow.milestone} />
              </div>
              <div className="readinessCard">
                <strong>{props.state.workflowsPaused ? "Try again in a moment" : selectedWorkflow.readiness}</strong>
                <p>
                  {props.state.workflowsPaused
                    ? "Workflow launches are paused for this tenant right now."
                    : !props.state.runtimeShellEnabled
                      ? "Start workflow is available only from the authenticated runtime shell. Preview mode does not queue real runs."
                    : !selectedWorkflow.startEnabled
                      ? "This workflow is visible for review in the dashboard, but it cannot be started from this public surface."
                    : selectedWorkflow.readiness === "Available now"
                      ? "The installed package is ready to launch this workflow."
                      : "Finish the required provider setup before starting this workflow."}
                </p>
                <button className="primaryButton" disabled={!workflowLaunchReady} onClick={props.actions.onQueueRun} type="button">
                  <Play size={16} />
                  Start workflow
                </button>
              </div>
            </>
          ) : (
            <>
              <h2>No workflow selected</h2>
              <p className="bodyCopy">This runtime shell is authenticated, but there are no customer-visible workflow entries available here yet.</p>
            </>
          )}
        </section>

        <aside className="panel compact">
          <div className="panelHeader">
            <p className="eyebrow">Before You Start</p>
          </div>
          <ul className="simpleList">
            <li>OpenAI connection should be saved by reference.</li>
            <li>Image provider is package-specific, not a global permission.</li>
            <li>Results will appear in a calm review desk, not a run console.</li>
          </ul>
        </aside>
      </section>
    );
  }

  if (props.pageKey === "results") {
    return (
      <section className="pageGrid focusedLayout" data-testid={getPageTestId("results")}>
        <section className="panel listPanel">
          <div className="panelHeader">
            <p className="eyebrow">Result List</p>
          </div>
          {resultItems.map((result) => (
            <button
              key={result.id}
              className={`listCard${selectedResult.id === result.id ? " selected" : ""}`}
              onClick={() => props.actions.onSelectResult(result.id)}
              type="button"
            >
              <div>
                <strong>{result.title}</strong>
                <p>
                  {result.workflow} | {result.timestamp}
                </p>
              </div>
              <span className="statusChip">{props.state.resultApprovalStates[result.id] ?? result.status}</span>
            </button>
          ))}
        </section>

        <section className="panel detailPanel">
          <div className="panelHeader">
            <p className="eyebrow">Selected Result</p>
            <span className="contextBadge">{selectedApprovalState}</span>
          </div>
          <h2>{selectedResult.title}</h2>
          <p className="bodyCopy">{selectedResult.summary}</p>
          <div className="previewPanel">
            <strong>Preview area</strong>
            <p>Package-safe summary, approved copy guidance, and delivery notes are centered here for calm review.</p>
          </div>
          <div className="detailGrid">
            <InfoBlock label="Workflow" value={selectedResult.workflow} />
            <InfoBlock label="History" value="Draft reviewed | Export prep complete | Awaiting final owner decision" />
            <InfoBlock label="Current state" value={statusCopy} />
            <InfoBlock label="Visible terms only" value="No prompts, tool traces, or backend activity are exposed here." />
          </div>
          <div className="actionRow">
            <button className="primaryButton" onClick={() => props.actions.onApproveResult(selectedResult.id)} type="button">
              Approve result
            </button>
            <button className="secondaryButton" onClick={() => props.actions.onRequestRevision(selectedResult.id)} type="button">
              Request revision
            </button>
          </div>
          <div className="resultBanner" data-testid="workflow-result">
            {statusCopy}
          </div>
        </section>

        <aside className="panel compact">
          <div className="panelHeader">
            <p className="eyebrow">Export And Expiry</p>
          </div>
          <ul className="simpleList">
            <li>{props.state.googleDriveConnected ? "Sent to Google Drive" : "Google Drive available to connect"}</li>
            <li>{props.state.dropboxConnected ? "Dropbox ready" : "Dropbox available to connect"}</li>
            <li>Download readiness: {selectedApprovalState === "Approved" ? "Ready to download" : selectedApprovalState}</li>
            <li>Expires in {props.dashboard.artifactTtlHours} hours</li>
          </ul>
          <div className="stackedActions">
            <button className="secondaryButton" onClick={() => props.actions.onProviderCardAction("drive")} type="button">
              <Send size={16} />
              Send to Google Drive
            </button>
            <button className="secondaryButton" type="button">
              <Download size={16} />
              Download artifact
            </button>
          </div>
        </aside>
      </section>
    );
  }

  if (props.pageKey === "team") {
    const teamCollection = getTeamCollection(props.state.teamTab);

    return (
      <section className="pageGrid focusedLayout" data-testid={getPageTestId("team")}>
        <section className="panel listPanel">
          <div className="panelHeader">
            <p className="eyebrow">Team Coverage</p>
          </div>
          <div className="metricGrid compactMetrics">
            <MetricCard label="Included roles" value={String(includedRoles.length)} detail="Core operators" />
            <MetricCard label="Hired" value="1" detail="Premium support" />
            <MetricCard label="Power Plays" value="2" detail="Available unlocks" />
            <MetricCard label="Needs connection" value={props.state.mediaProviderSaved ? "0" : "2"} detail="Provider-dependent" />
          </div>
          <div className="tabRow" role="group" aria-label="Team tabs">
            {(["Included Team", "Hired", "Power Plays"] as const).map((tab) => (
              <button
                aria-pressed={props.state.teamTab === tab}
                key={tab}
                className={`tabButton${props.state.teamTab === tab ? " active" : ""}`}
                onClick={() => props.actions.onUpdateTeamTab(tab)}
                type="button"
              >
                {tab}
              </button>
            ))}
          </div>
          {teamCollection.map((roleItem) => (
            <button
              key={roleItem.id}
              className={`listCard${selectedRole.id === roleItem.id ? " selected" : ""}`}
              onClick={() => props.actions.onSelectRole(roleItem.id)}
              type="button"
            >
              <div>
                <strong>{roleItem.name}</strong>
                <p>{roleItem.resume}</p>
              </div>
              <span className="statusChip">{roleItem.status}</span>
            </button>
          ))}
        </section>

        <section className="panel detailPanel">
          <div className="panelHeader">
            <p className="eyebrow">Role Detail</p>
            <span className="contextBadge">{selectedRole.providerNeed}</span>
          </div>
          <h2>{selectedRole.name}</h2>
          <p className="bodyCopy">{selectedRole.resume}</p>
          <div className="detailGrid">
            <InfoBlock label="What this helps with" value={selectedRole.outcome} />
            <InfoBlock label="Package fit" value="Available in this package family" />
            <InfoBlock label="Provider requirements" value={selectedRole.providerNeed} />
            <InfoBlock label="Action area" value="Roles stay outcome-oriented and never expose hidden capability bundles." />
          </div>
          <div className="actionRow">
            <button className="primaryButton" type="button">
              {selectedRole.action}
            </button>
            <button className="secondaryButton" onClick={() => props.actions.onNavigate("providers")} type="button">
              Connect required provider
            </button>
          </div>
        </section>

        <aside className="panel compact">
          <div className="panelHeader">
            <p className="eyebrow">Unlock Guidance</p>
          </div>
          <ul className="simpleList">
            <li>Included roles stay inside package boundaries.</li>
            <li>Hires remain package-specific and never imply cross-package access.</li>
            <li>Power Plays feel premium, but still require approved providers and entitlements.</li>
          </ul>
        </aside>
      </section>
    );
  }

  if (props.pageKey === "profiles") {
    return (
      <section className="pageGrid singlePage" data-testid={getPageTestId("profiles")}>
        <section className="panel">
          <div className="panelHeader">
            <p className="eyebrow">Operating Profiles</p>
          </div>
          <div className="tableShell">
            <table>
              <thead>
                <tr>
                  <th>Profile</th>
                  <th>Package family</th>
                  <th>Status</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {profileRows.map((profile) => (
                  <tr key={profile.name}>
                    <td>{profile.name}</td>
                    <td>{profile.family}</td>
                    <td>{profile.state}</td>
                    <td>{profile.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    );
  }

  if (props.pageKey === "providers") {
    return (
      <section className="pageGrid singlePage" data-testid={getPageTestId("providers")}>
        <section className="panel providerHero">
          <div className="panelHeader">
            <p className="eyebrow">Setup Checklist</p>
            <span className="contextBadge">{packageReady ? "Storage ready" : "Needs attention"}</span>
          </div>
          <h2>Connect only what this package needs</h2>
          <p className="bodyCopy">
            Wealth Factory uses only the access needed to keep workflows moving. Secrets are saved by reference and never shown again.
          </p>
          <div className="metricGrid compactMetrics">
            <MetricCard label="Required now" value="OpenAI" detail={providerReady ? "Connected" : "Missing"} />
            <MetricCard label="Creative lane" value={props.state.mediaProviderSaved ? "Connected" : "Needed"} detail="Package-specific" />
            <MetricCard
              label="Storage"
              value={props.state.googleDriveConnected || props.state.dropboxConnected ? "Ready" : "Optional"}
              detail="Customer-owned"
            />
            <MetricCard label="Defaults" value="Balanced" detail="Settings controlled" />
          </div>
        </section>

        <section className="panel providerForm">
          <div className="panelHeader">
            <p className="eyebrow">Save Provider Reference</p>
          </div>
          <form onSubmit={props.actions.onSaveKey}>
            <label>
              Provider
              <select onChange={(event) => props.actions.onProviderChange(event.target.value)} value={props.state.provider}>
                <option>OpenAI</option>
                <option>Anthropic</option>
                <option>xAI Grok</option>
                <option>OpenRouter</option>
              </select>
            </label>
            <label>
              API key
              <input
                aria-label="API key"
                name="apiKey"
                onChange={(event) => props.actions.onApiKeyInputChange(event.target.value)}
                placeholder="Saved by reference only"
                type="password"
                value={props.state.apiKeyInput}
              />
            </label>
            <label>
              Project ID
              <input
                name="projectId"
                onChange={(event) => props.actions.onProjectIdInputChange(event.target.value)}
                placeholder="Optional non-secret metadata"
                value={props.state.projectIdInput}
              />
            </label>
            <div className="actionRow">
              <button className="primaryButton" type="submit">
                <Lock size={16} />
                Save reference
              </button>
              <button className="secondaryButton" onClick={props.actions.onConnectImageProvider} type="button">
                Connect image provider
              </button>
            </div>
            {props.state.keySaved ? <p className="resultBanner" role="status">Credential reference saved. The key will not be shown again.</p> : null}
          </form>
        </section>

        <section className="providerGrid">
          {providerCards.map((item) => (
            <article key={item.id} className="panel providerCard" data-testid={`provider-card-${item.id}`}>
              <div className="panelHeader">
                <p className="eyebrow">{item.kind === "storage" ? "Storage" : "Provider"}</p>
                <span className="contextBadge">
                  {resolveProviderState(item.id, {
                    connectedProviders: props.state.connectedProviders,
                    googleDriveConnected: props.state.googleDriveConnected,
                    dropboxConnected: props.state.dropboxConnected
                  })}
                </span>
              </div>
              <h2>{item.label}</h2>
              <p className="bodyCopy">{item.description}</p>
              <p className="mutedLine">Last updated today</p>
              <button className="secondaryButton" onClick={() => props.actions.onProviderCardAction(item.id)} type="button">
                {item.action}
              </button>
            </article>
          ))}
        </section>
      </section>
    );
  }

  if (props.pageKey === "insights") {
    return (
      <section className="pageGrid singlePage" data-testid={getPageTestId("insights")}>
        <section className="panel">
          <div className="panelHeader">
            <p className="eyebrow">Current Snapshot</p>
          </div>
          <div className="metricGrid">
            {insightStats.map((stat) => (
              <MetricCard key={stat.label} label={stat.label} value={stat.value} detail={stat.delta} />
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panelHeader">
            <p className="eyebrow">Platform Traffic</p>
          </div>
          <div className="metricCard">
            <p>{platformLoad.label}</p>
            <strong>{platformLoad.value}</strong>
            <span>{platformLoad.detail}</span>
            <div aria-hidden="true" style={{ marginTop: "12px" }}>
              <div
                style={{
                  height: "10px",
                  borderRadius: "999px",
                  background: "rgba(255,255,255,0.12)",
                  overflow: "hidden"
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${platformLoad.gaugePercent}%`,
                    borderRadius: "999px",
                    background:
                      platformLoad.gaugePercent >= 80
                        ? "linear-gradient(90deg, #f2b35b 0%, #d97045 100%)"
                        : platformLoad.gaugePercent >= 50
                          ? "linear-gradient(90deg, #d8c56a 0%, #d79f4f 100%)"
                          : "linear-gradient(90deg, #7bcf9f 0%, #4aa17b 100%)"
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="panel wide">
          <div className="panelHeader">
            <p className="eyebrow">Available Artifacts</p>
          </div>
          <div className="tableShell">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Work type</th>
                  <th>Available until</th>
                  <th>Delivered via</th>
                </tr>
              </thead>
              <tbody>
                {recentArtifacts.map((row) => (
                  <tr key={`${row.title}-${row.type}`}>
                    <td>{row.title}</td>
                    <td>{row.type}</td>
                    <td>{row.expires}</td>
                    <td>{row.delivery}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    );
  }

  if (props.pageKey === "package") {
    return (
      <section className="pageGrid singlePage" data-testid={getPageTestId("package")}>
        <section className="panel">
          <div className="panelHeader">
            <p className="eyebrow">Installed Package</p>
          </div>
          <h2>{props.dashboard.packageName}</h2>
          <p className="bodyCopy">
            This package defines the workflow boundary, required provider lanes, included roles, and approved deliverables for this business.
          </p>
          <div className="metricGrid">
            {packageSummary.map((summary) => (
              <MetricCard key={summary.label} label={summary.label} value={summary.value} detail="Customer-safe summary" />
            ))}
          </div>
        </section>
      </section>
    );
  }

  if (props.pageKey === "files") {
    return (
      <section className="pageGrid singlePage" data-testid={getPageTestId("files")}>
        <section className="panel">
          <div className="panelHeader">
            <p className="eyebrow">Temporary Files</p>
          </div>
          <div className="tableShell">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Retention</th>
                </tr>
              </thead>
              <tbody>
                {fileItems.map((row) => (
                  <tr key={row.title}>
                    <td>{row.title}</td>
                    <td>{row.type}</td>
                    <td>{row.state}</td>
                    <td>{row.expiry}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    );
  }

  if (props.pageKey === "assistant") {
    return (
      <section className="pageGrid singlePage" data-testid={getPageTestId("assistant")}>
        <section className="panel assistantPanel">
          <div className="panelHeader">
            <p className="eyebrow">Bounded Assistant</p>
          </div>
          <h2>Ask for package-safe help</h2>
          <p className="bodyCopy">
            This assistant stays grounded in your installed package, approved workflows, current results, and connection states. It does not act as a general chatbot.
          </p>
          <div className="promptList">
            <button className="secondaryButton" type="button">
              What should I review next?
            </button>
            <button className="secondaryButton" type="button">
              Why is this result delayed?
            </button>
            <button className="secondaryButton" type="button">
              Open a support request
            </button>
          </div>
        </section>
      </section>
    );
  }

  if (props.pageKey === "billing") {
    return (
      <section className="pageGrid singlePage" data-testid={getPageTestId("billing")}>
        <section className="panel">
          <div className="panelHeader">
            <p className="eyebrow">Billing Health</p>
          </div>
          <div className="metricGrid">
            {billingRows.map((row) => (
              <MetricCard key={row.label} label={row.label} value={row.value} detail="Customer-safe account summary" />
            ))}
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="pageGrid singlePage" data-testid={getPageTestId("settings")}>
      <section className="panel">
        <div className="panelHeader">
          <p className="eyebrow">Preferences</p>
        </div>
        <h2>Theme and account settings</h2>
        <p className="bodyCopy">
          Theme presets are quick to switch here, while support links, notifications, and tenant-visible audit summaries stay customer-safe.
        </p>
        <div className="themeSettings">
          {themePresets.map((preset) => (
            <button
              aria-label={preset}
              key={preset}
              className={`themeSettingCard${props.state.theme === preset ? " active" : ""}`}
              onClick={() => props.actions.onThemeChange(preset)}
              type="button"
            >
              <strong>{preset}</strong>
              <span>{getThemeDescription(preset)}</span>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}

function MetricCard(props: { label: string; value: string; detail: string }) {
  return (
    <article className="metricCard">
      <p>{props.label}</p>
      <strong>{props.value}</strong>
      <span>{props.detail}</span>
    </article>
  );
}

function InfoBlock(props: { label: string; value: string }) {
  return (
    <div className="infoBlock">
      <p>{props.label}</p>
      <strong>{props.value}</strong>
    </div>
  );
}

export default DashboardPages;
