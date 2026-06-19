import type { DashboardPlatformLoad, DashboardSnapshot, DashboardWorkflow } from "../dashboard-client.js";

export type Role = "member" | "operator";
export type PageKey =
  | "home"
  | "workflows"
  | "results"
  | "team"
  | "profiles"
  | "providers"
  | "insights"
  | "package"
  | "files"
  | "assistant"
  | "billing"
  | "settings";
export type FutureRouteKey = "assistant-studio" | "operations" | "advanced-insights";
export type ThemePreset = "Foundry" | "Midnight" | "Ledger" | "Ember";
export type RunStatus = "ready" | "queued" | "completed" | "paused";
export type ApprovalState = "Awaiting review" | "Approved" | "Revision needed";
export type TeamTab = "Included Team" | "Hired" | "Power Plays";
export type DateRange = "7D" | "30D" | "90D";
export type ProviderKey = "openai" | "anthropic" | "xaiGrok" | "openRouter" | "codex";
export type ProviderCardId = ProviderKey | "drive" | "dropbox";

export interface DashboardRouteDefinition<Key extends string = string> {
  key: Key;
  path: string;
  title: string;
  summary: string;
}

export interface ProviderStateContext {
  connectedProviders: Record<ProviderKey, boolean>;
  googleDriveConnected: boolean;
  dropboxConnected: boolean;
}

export interface WorkflowCard {
  id: string;
  name: string;
  description: string;
  providerTags: readonly string[];
  readiness: string;
  outcome: string;
  inputs: string;
  outputType: string;
  milestone: string;
  startEnabled: boolean;
}

export interface ResultCard {
  id: string;
  title: string;
  workflow: string;
  summary: string;
  timestamp: string;
  status: string;
  exportState: string;
}

export interface FileRow {
  title: string;
  type: string;
  state: string;
  expiry: string;
}

export interface ListItem {
  title: string;
  detail: string;
}

export interface AttentionItem {
  id: string;
  message: string;
}

export interface MetricSummary {
  label: string;
  value: string;
  detail: string;
}

export interface PlatformLoadVisual {
  label: string;
  value: string;
  detail: string;
  gaugePercent: number;
};

export interface WorkQueueItem {
  task: string;
  status: string;
  nextAction: string;
}

export interface ArtifactSummaryRow {
  title: string;
  type: string;
  expires: string;
  delivery: string;
}

export interface CurrentFocusCard {
  title: string;
  summary: string;
  chips: readonly string[];
  primary: "Open Results" | "Open Workflows" | "Open Providers" | "Start workflow";
  secondary: "Open Results" | "Open Files" | "Review package" | "Review workflow";
}

export interface StatusCopyOptions {
  packageReady: boolean;
  workflowStartAvailable: boolean;
  runStatus: RunStatus;
  workflowsPaused: boolean;
}

export interface CurrentFocusOptions {
  packageReady: boolean;
  providerReady: boolean;
  workflowStartAvailable: boolean;
  runStatus: RunStatus;
  workflowsPaused: boolean;
  selectedApprovalState: ApprovalState;
  googleDriveConnected: boolean;
  dropboxConnected: boolean;
}

export interface DashboardSnapshotContext {
  connectedProviders: Record<ProviderKey, boolean>;
  googleDriveConnected: boolean;
  dropboxConnected: boolean;
  workflowStartAvailable: boolean;
  workflowsPaused: boolean;
  resultApprovalStates: Record<string, ApprovalState>;
}

export const themePresets = ["Foundry", "Midnight", "Ledger", "Ember"] as const;

export const dashboardRoutes: readonly DashboardRouteDefinition<PageKey>[] = [
  {
    key: "home",
    path: "/",
    title: "Home",
    summary: "What matters today, what is moving, and what needs your decision next."
  },
  {
    key: "workflows",
    path: "/workflows",
    title: "Workflows",
    summary: "Run approved workflows inside your installed package boundary."
  },
  {
    key: "results",
    path: "/results",
    title: "Results",
    summary: "Review outcomes, approvals, and delivery steps without exposing run mechanics."
  },
  {
    key: "team",
    path: "/team",
    title: "Team",
    summary: "Manage included roles, hired support, and premium power plays."
  },
  {
    key: "profiles",
    path: "/profiles",
    title: "Profiles",
    summary: "Switch between approved company contexts inside the same package family."
  },
  {
    key: "providers",
    path: "/providers",
    title: "Providers",
    summary: "Set up BYOK providers, subscriptions, and customer-owned storage in a calm, trustworthy way."
  },
  {
    key: "insights",
    path: "/insights",
    title: "Insights",
    summary: "See customer-safe usage, output, and turnaround trends."
  },
  {
    key: "package",
    path: "/package",
    title: "Package",
    summary: "Review the installed business system and the boundaries it creates."
  },
  {
    key: "files",
    path: "/files",
    title: "Files",
    summary: "Move important files into customer-owned storage before temporary delivery expires."
  },
  {
    key: "assistant",
    path: "/assistant",
    title: "Assistant",
    summary: "Get package-grounded help and support intake without opening an unrestricted chatbot."
  },
  {
    key: "billing",
    path: "/billing",
    title: "Billing",
    summary: "Monitor account health, renewals, and add-on charges."
  },
  {
    key: "settings",
    path: "/settings",
    title: "Settings",
    summary: "Manage themes, notifications, support links, and account preferences."
  }
] as const;

export const hiddenFutureRoutes: readonly DashboardRouteDefinition<FutureRouteKey>[] = [
  {
    key: "assistant-studio",
    path: "/assistant-studio",
    title: "Assistant Studio",
    summary: "Hidden future assistant surface."
  },
  {
    key: "operations",
    path: "/operations",
    title: "Operations",
    summary: "Hidden future operations surface."
  },
  {
    key: "advanced-insights",
    path: "/advanced-insights",
    title: "Advanced Insights",
    summary: "Hidden future analytics surface."
  }
] as const;

export const dashboardNavigationGroups = [
  ["home", "workflows", "results", "team", "profiles", "providers", "insights", "package", "files", "assistant"],
  ["billing", "settings"]
] as const satisfies readonly (readonly PageKey[])[];

export const workflowCards = [
  {
    id: "wf-connect-first",
    name: "Connect First Workflow",
    description: "Launches the approved first-workflow setup inside the Wealth Factory harness.",
    providerTags: ["OpenAI required"],
    readiness: "Available now",
    outcome: "A reviewed onboarding plan with next actions ready for approval and delivery.",
    inputs: "Current priorities, business context, and approved package inputs.",
    outputType: "Plan, brief, and handoff steps",
    milestone: "Next milestone: approve the first-workflow handoff before exports are released.",
    startEnabled: true
  },
  {
    id: "wf-tax-strategy",
    name: "Tax Strategy Workflow",
    description: "Runs the bounded tax strategy review inside the Wealth Factory harness.",
    providerTags: ["OpenAI required"],
    readiness: "Connection needed",
    outcome: "A reviewed tax strategy summary with ready-to-approve recommendations.",
    inputs: "Tax priorities, context, and approved package inputs.",
    outputType: "Review memo and action notes",
    milestone: "Next milestone: connect a provider to unlock the run.",
    startEnabled: true
  },
  {
    id: "wf-package-followup",
    name: "Package Follow-up Workflow",
    description: "Advances the bounded package follow-up lane inside the Wealth Factory harness.",
    providerTags: ["OpenAI required"],
    readiness: "Ready to start",
    outcome: "A concise follow-up summary with the next approved owner actions.",
    inputs: "Completed work, open decisions, and delivery notes.",
    outputType: "Follow-up memo",
    milestone: "Next milestone: results will appear in the review desk.",
    startEnabled: true
  }
] as const;

export const includedRoles = [
  {
    id: "team-ceo",
    name: "Growth CEO",
    resume: "Sets direction, priorities, and package-safe decision framing.",
    outcome: "Clarifies what should move first this week.",
    status: "Included with your package",
    action: "View profile",
    providerNeed: "Ready to use"
  },
  {
    id: "team-coo",
    name: "Operations COO",
    resume: "Keeps deliverables, approvals, and due dates moving cleanly.",
    outcome: "Turns backlog into a sequenced execution plan.",
    status: "Included with your package",
    action: "View profile",
    providerNeed: "Needs provider"
  },
  {
    id: "team-cfo",
    name: "Finance CFO",
    resume: "Watches package utilization, renewals, and account health.",
    outcome: "Keeps spend and timing visible without exposing internals.",
    status: "Included with your package",
    action: "View profile",
    providerNeed: "Ready to use"
  }
] as const;

export const hiredRoles = [
  {
    id: "hire-creative",
    name: "Implementation Director",
    resume: "Shapes rollout timing, handoffs, and premium execution guidance.",
    outcome: "Improves delivery quality before final handoff.",
    status: "Hired and active",
    action: "Activate lane",
    providerNeed: "Needs provider"
  }
] as const;

export const powerPlays = [
  {
    id: "power-launch",
    name: "Priority Execution Window",
    resume: "Unlocks a coordinated sprint for a high-priority business milestone.",
    outcome: "Bundles planning, approvals, and delivery timing.",
    status: "Unlock power play",
    action: "Unlock",
    providerNeed: "OpenAI plus customer storage"
  },
  {
    id: "power-library",
    name: "Reusable Operations Library",
    resume: "Builds a reusable reserve of approved package-safe briefs and handoffs.",
    outcome: "Creates breathing room between active execution cycles.",
    status: "Available",
    action: "Review unlock",
    providerNeed: "Customer-owned storage recommended"
  }
] as const;

export const resultCards = [
  {
    id: "result-241",
    title: "Connect-first onboarding brief",
    workflow: "Connect First Workflow",
    summary: "A reviewed onboarding brief with the first approved actions already translated into customer-safe delivery notes.",
    timestamp: "Updated 18 minutes ago",
    status: "Awaiting review",
    exportState: "Ready to download"
  },
  {
    id: "result-238",
    title: "Tax strategy review summary",
    workflow: "Tax Strategy Workflow",
    summary: "The tax strategy review is ready once the storage destination is reconnected.",
    timestamp: "Updated 2 hours ago",
    status: "Revision needed",
    exportState: "Reconnect storage"
  }
] as const;

export const providerCards = [
  {
    id: "openai",
    label: "OpenAI",
    description: "Recommended text generation path for this package.",
    state: "Connected",
    action: "Update connection",
    kind: "provider"
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Optional writing lane for supported workflows.",
    state: "Not needed for your package",
    action: "Connect",
    kind: "provider"
  },
  {
    id: "xaiGrok",
    label: "xAI / Grok",
    description: "Optional alternate provider for supported workflow families.",
    state: "Not needed for your package",
    action: "Connect",
    kind: "provider"
  },
  {
    id: "openRouter",
    label: "OpenRouter",
    description: "Optional provider lane for approved package-safe model routing.",
    state: "Not needed for your package",
    action: "Connect",
    kind: "provider"
  },
  {
    id: "codex",
    label: "ChatGPT / Codex subscription",
    description: "Advanced company-specific authorization flow.",
    state: "Needs attention",
    action: "Reconnect",
    kind: "provider"
  },
  {
    id: "drive",
    label: "Google Drive",
    description: "Delivers finished files into storage your company controls.",
    state: "Storage ready",
    action: "Connect",
    kind: "storage"
  },
  {
    id: "dropbox",
    label: "Dropbox",
    description: "Backup export lane for approved package outputs.",
    state: "Connected",
    action: "Update connection",
    kind: "storage"
  }
] as const;

export const packageSummary = [
  { label: "Workflows", value: "12 approved" },
  { label: "Base roles", value: "3 included" },
  { label: "Storage", value: "24-hour delivery" },
  { label: "Add-ons", value: "4 available" }
] as const;

export const fileRows = [
  { title: "Onboarding action plan", type: "DOCX", state: "Ready to download", expiry: "Expires in 18 hours" },
  { title: "Tax review summary", type: "PDF", state: "Ready to download", expiry: "Expires in 22 hours" },
  { title: "Follow-up next steps", type: "XLSX", state: "Reconnect storage", expiry: "Needs attention" }
] as const;

export const profileRows = [
  { name: "Northstar Labs", family: "Installed package", state: "Active", note: "Current operating profile" },
  { name: "Harbor Advisory", family: "Alternate package", state: "Available", note: "Owner review complete" }
] as const;

export const billingRows = [
  { label: "Current plan", value: "Installed package" },
  { label: "Account health", value: "Active" },
  { label: "Renewal date", value: "June 01" },
  { label: "Add-on hires", value: "Creative Director" }
] as const;

export function createInitialConnectedProviders(): Record<ProviderKey, boolean> {
  return {
    openai: false,
    anthropic: false,
    xaiGrok: false,
    openRouter: false,
    codex: false
  };
}

export function getPageTitle(page: PageKey): string {
  return dashboardRoutes.find((route) => route.key === page)?.title ?? "Home";
}

export function getPageSummary(page: PageKey, fallback = ""): string {
  return dashboardRoutes.find((route) => route.key === page)?.summary ?? fallback;
}

export function getPagePath(page: PageKey): string {
  return dashboardRoutes.find((route) => route.key === page)?.path ?? "/";
}

export function getPageTestId(page: PageKey): string {
  return `page-${page}`;
}

export function getThemeDescription(theme: ThemePreset): string {
  switch (theme) {
    case "Foundry":
      return "Dark green-black textured baseline with cream controls.";
    case "Midnight":
      return "Cool charcoal surfaces with sharper blue accents.";
    case "Ledger":
      return "Graphite and ivory surfaces with restrained contrast.";
    case "Ember":
      return "Warm dark panels with bronze-leaning action accents.";
  }
}

export function getProviderKey(provider: string): ProviderKey {
  if (provider === "Anthropic") {
    return "anthropic";
  }
  if (provider === "xAI Grok") {
    return "xaiGrok";
  }
  if (provider === "OpenRouter") {
    return "openRouter";
  }
  return "openai";
}

export function createInitialConnectedProvidersFromSnapshot(snapshot: DashboardSnapshot): Record<ProviderKey, boolean> {
  const connectedProviders = createInitialConnectedProviders();

  for (const provider of snapshot.providerConnections) {
    const key = mapProviderKindToKey(provider.providerKind);
    if (key) {
      connectedProviders[key] = provider.connected !== false;
    }
  }

  return connectedProviders;
}

export function hasConnectedStorage(snapshot: DashboardSnapshot, providerKind: "google_drive" | "dropbox"): boolean {
  return snapshot.storageConnectors.some((connector) => connector.providerKind === providerKind && connector.connected !== false);
}

export function getWorkflowCards(snapshot: DashboardSnapshot, input: {
  connectedProviders: Record<ProviderKey, boolean>;
  allowFallbackCatalog?: boolean;
}): WorkflowCard[] {
  if (snapshot.workflows.length === 0) {
    if (input.allowFallbackCatalog === false) {
      return [];
    }
    return [...workflowCards];
  }

  return snapshot.workflows.map((workflow) => {
    const providerLabel = getProviderLabelForWorkflow(workflow);
    const providerConnected = isWorkflowProviderConnected(workflow, input.connectedProviders);
    const ready = providerConnected;

    return {
      id: workflow.id,
      name: workflow.name,
      description: `Runs the approved ${workflow.name} workflow inside your installed package boundary.`,
      providerTags: buildWorkflowProviderTags(providerLabel),
      readiness: workflow.startEnabled === false ? "Review only" : ready ? "Available now" : "Connection needed",
      outcome: `A customer-safe ${workflow.name.toLowerCase()} result ready for review and delivery.`,
      inputs: "Approved package inputs and current business context.",
      outputType: "Review-ready deliverables",
      milestone:
        workflow.startEnabled === false
          ? "Next milestone: review this workflow from the dashboard or use an approved non-public start surface."
          : ready
            ? "Next milestone: review the result before export."
            : "Next milestone: connect the required provider to unlock this workflow.",
      startEnabled: workflow.startEnabled !== false
    };
  });
}

export function getResultCards(snapshot: DashboardSnapshot, input: { googleDriveConnected: boolean; dropboxConnected: boolean }): ResultCard[] {
  if (snapshot.artifacts.length === 0) {
    return [...resultCards];
  }

  return snapshot.artifacts.map((artifact) => {
    return {
      id: artifact.id,
      title: toDisplayTitle(artifact.filename),
      workflow: snapshot.workflows.length === 1 ? snapshot.workflows[0]!.name : "Approved workflow output",
      summary: `A ${artifact.artifactType} deliverable named ${artifact.filename} is ready for review and export.`,
      timestamp: `Available until ${formatTimestamp(artifact.expiresAt)}`,
      status: "Ready to review",
      exportState: input.googleDriveConnected || input.dropboxConnected ? "Ready to export" : "Reconnect storage"
    };
  });
}

export function getFileRows(snapshot: DashboardSnapshot, input: { googleDriveConnected: boolean; dropboxConnected: boolean }): FileRow[] {
  if (snapshot.artifacts.length === 0) {
    return [...fileRows];
  }

  return snapshot.artifacts.map((artifact) => ({
    title: toDisplayTitle(artifact.filename),
    type: artifact.artifactType.toUpperCase(),
    state: input.googleDriveConnected || input.dropboxConnected ? "Ready to download" : "Reconnect storage",
    expiry: `Expires ${formatTimestamp(artifact.expiresAt)}`
  }));
}

export function getHomeNextSteps(snapshot: DashboardSnapshot, context: DashboardSnapshotContext): ListItem[] {
  const items: ListItem[] = [];
  const reviewOpportunity = getReviewOpportunityResult(snapshot, context);

  if (reviewOpportunity) {
    items.push({
      title: `Review ${reviewOpportunity.title}`,
      detail: reviewOpportunity.timestamp
    });
  }

  const missingProvider = getMissingRequiredProvider(snapshot, context.connectedProviders);
  if (missingProvider) {
    items.push({
      title: `Connect ${missingProvider.label}`,
      detail: "Required before the next package workflow can run"
    });
  }

  if (snapshot.artifacts.length > 0) {
    items.push({
      title: hasConnectedExportLane(context) ? "Move approved files into customer storage" : "Reconnect an export destination",
      detail: hasConnectedExportLane(context) ? "Files are ready to send" : "Temporary files are waiting for a storage lane"
    });
  }

  if (items.length === 0) {
    items.push({
      title: context.workflowStartAvailable ? "Launch the next approved workflow" : "Open the runtime shell to launch workflows",
      detail: snapshot.workflows.some((workflow) => workflow.enabled !== false)
        ? context.workflowStartAvailable
          ? "The package boundary is ready for the next run"
          : "Preview mode is available for review, but authenticated runtime access is required to queue a real run"
        : "No workflow runs are available yet"
    });
  }

  return items.slice(0, 3);
}

export function getExpiringDownloadItems(snapshot: DashboardSnapshot, input: { googleDriveConnected: boolean; dropboxConnected: boolean }): ListItem[] {
  return getFileRows(snapshot, input)
    .slice(0, 3)
    .map((file) => ({
      title: file.title,
      detail: file.expiry
    }));
}

export function getNeedsAttentionItems(snapshot: DashboardSnapshot, context: DashboardSnapshotContext): AttentionItem[] {
  const items: AttentionItem[] = [];
  const reviewOpportunity = getReviewOpportunityResult(snapshot, context);
  const missingProvider = getMissingRequiredProvider(snapshot, context.connectedProviders);

  if (reviewOpportunity) {
    items.push({
      id: `review-${reviewOpportunity.id}`,
      message: `Review available for ${reviewOpportunity.title}`
    });
  }

  if (missingProvider) {
    items.push({
      id: `provider-${missingProvider.id}`,
      message: `${missingProvider.label} connection still needed`
    });
  }

  if (snapshot.artifacts.length > 0 && !hasConnectedExportLane(context)) {
    items.push({
      id: "storage",
      message: "Connect customer-owned storage before temporary files expire"
    });
  }

  if (context.workflowsPaused) {
    items.push({
      id: "paused",
      message: "Workflow launches are paused for this tenant"
    });
  }

  if (items.length === 0) {
    items.push({
      id: "clear",
      message: "No urgent blockers right now"
    });
  }

  return items;
}

export function getOperatingSnapshotMetrics(snapshot: DashboardSnapshot, context: DashboardSnapshotContext): MetricSummary[] {
  const enabledWorkflows = snapshot.workflows.filter((workflow) => workflow.enabled !== false).length;
  const connectedProviders = snapshot.providerConnections.filter((provider) => provider.connected !== false).length;
  const connectedStorage = snapshot.storageConnectors.filter((connector) => connector.connected !== false).length;
  const awaitingReviewCount = getResultCards(snapshot, {
    googleDriveConnected: context.googleDriveConnected,
    dropboxConnected: context.dropboxConnected
  }).filter((result) => context.resultApprovalStates[result.id] === "Awaiting review").length;
  const totalWorkflowCount = snapshot.workflows.length > 0 ? snapshot.workflows.length : workflowCards.length;
  const availableWorkflowCount = snapshot.workflows.length > 0 ? enabledWorkflows : workflowCards.length;

  return [
    {
      label: "Approved workflows",
      value: String(totalWorkflowCount),
      detail: `${availableWorkflowCount} available now`
    },
    {
      label: "Results ready",
      value: String(snapshot.artifacts.length || resultCards.length),
      detail: awaitingReviewCount > 0 ? `${awaitingReviewCount} awaiting review` : "Nothing waiting on approval"
    },
    {
      label: "Connected providers",
      value: String(connectedProviders),
      detail: getMissingRequiredProvider(snapshot, context.connectedProviders) ? "Required setup still needed" : "Required lanes connected"
    },
    {
      label: "Storage lanes",
      value: String(connectedStorage),
      detail: connectedStorage > 0 ? "Customer-owned export path ready" : "No export lane connected"
    }
  ];
}

export function getHomeWorkQueue(snapshot: DashboardSnapshot, context: DashboardSnapshotContext): WorkQueueItem[] {
  const queue: WorkQueueItem[] = [];
  const reviewOpportunity = getReviewOpportunityResult(snapshot, context);
  const missingProvider = getMissingRequiredProvider(snapshot, context.connectedProviders);

  if (reviewOpportunity) {
    queue.push({
      task: `Review ${reviewOpportunity.title}`,
      status: "Ready to review",
      nextAction: "Open Results"
    });
  }

  if (missingProvider) {
    queue.push({
      task: `Connect ${missingProvider.label}`,
      status: "Needs connection",
      nextAction: "Open Providers"
    });
  }

  if (snapshot.artifacts.length > 0) {
    queue.push({
      task: hasConnectedExportLane(context) ? "Send approved files to customer storage" : "Reconnect export destination",
      status: hasConnectedExportLane(context) ? "Ready" : "Needs connection",
      nextAction: "Open Files"
    });
  }

  if (!context.workflowsPaused && snapshot.workflows.some((workflow) => workflow.enabled !== false)) {
    queue.push({
      task: context.workflowStartAvailable ? "Launch the next approved workflow" : "Open the runtime shell to launch workflows",
      status: missingProvider ? "Blocked" : context.workflowStartAvailable ? "Ready" : "Preview only",
      nextAction: "Open Workflows"
    });
  }

  return queue.slice(0, 4);
}

export function resolveProviderState(id: ProviderCardId, state: ProviderStateContext): string {
  if (id === "openai") {
    return state.connectedProviders.openai ? "Connected" : "Missing";
  }
  if (id === "anthropic") {
    return state.connectedProviders.anthropic ? "Connected" : "Not needed for your package";
  }
  if (id === "xaiGrok") {
    return state.connectedProviders.xaiGrok ? "Connected" : "Not needed for your package";
  }
  if (id === "openRouter") {
    return state.connectedProviders.openRouter ? "Connected" : "Not needed for your package";
  }
  if (id === "codex") {
    return state.connectedProviders.codex ? "Connected" : "Needs attention";
  }
  if (id === "drive") {
    return state.googleDriveConnected ? "Storage ready" : "Connect";
  }
  if (id === "dropbox") {
    return state.dropboxConnected ? "Connected" : "Connect";
  }
  return providerCards.find((card) => card.id === id)?.state ?? "Needs attention";
}

export function getStatusCopy(options: StatusCopyOptions): string {
  if (options.workflowsPaused) {
    return "Tenant workflows are disabled.";
  }
  if (options.runStatus === "completed") {
    return "Workflow completed. Wealth Factory result is ready for review and delivery.";
  }
  if (options.runStatus === "queued") {
    return "Workflow queued. Secure worker is preparing the approved result.";
  }
  if (options.packageReady && !options.workflowStartAvailable) {
    return "Preview mode is review-only. Open the authenticated runtime shell to queue a real workflow run.";
  }
  return options.packageReady
    ? "Ready to run the installed package workflow."
    : "Connect package providers to unlock approved workflows.";
}

export function getCurrentFocus(options: CurrentFocusOptions): CurrentFocusCard {
  if (options.workflowsPaused) {
    return {
      title: "Workflows are paused",
      summary: "An operator paused workflow launches for this tenant. You can still review results and files while access is restored.",
      chips: ["Paused", "Action required", "Review status"],
      primary: "Open Workflows",
      secondary: "Open Results"
    };
  }

  if (options.runStatus === "completed") {
    return {
      title: "Send this week's approved assets",
      summary: "Your latest package deliverables are ready to review, approve, and move into customer-owned storage.",
      chips: [
        "Ready to send",
        options.selectedApprovalState,
        options.googleDriveConnected || options.dropboxConnected ? "Storage ready" : "Needs connection"
      ],
      primary: "Open Results",
      secondary: "Open Files"
    };
  }

  if (options.packageReady) {
    if (!options.workflowStartAvailable) {
      return {
        title: "Open the runtime shell to launch workflows",
        summary: "This preview is useful for review, but real workflow starts are available only from the authenticated runtime shell.",
        chips: ["Preview mode", "Runtime shell required", "No fake runs"],
        primary: "Open Workflows",
        secondary: "Review workflow"
      };
    }

    return {
      title: "Launch the next approved workflow",
      summary: "The package-approved workflow is ready. Start now to keep work moving inside the approved runtime boundary.",
      chips: ["Due today", "Ready to start", "No blockers"],
      primary: "Start workflow",
      secondary: "Review workflow"
    };
  }

  return {
    title: "Finish provider setup",
    summary: "Connect the required package providers so the next workflow can move without delay.",
    chips: ["Action required", options.providerReady ? "Creative provider needed" : "OpenAI required", "Package setup"],
    primary: "Open Providers",
    secondary: "Review package"
  };
}

export function getTeamCollection(teamTab: TeamTab) {
  if (teamTab === "Included Team") {
    return includedRoles;
  }
  if (teamTab === "Hired") {
    return hiredRoles;
  }
  return powerPlays;
}

export function getInitialSelectedRoleId(teamTab: TeamTab): string {
  return getTeamCollection(teamTab)[0]?.id ?? includedRoles[0].id;
}

export function getSelectedWorkflow(selectedWorkflowId: string) {
  return workflowCards.find((workflow) => workflow.id === selectedWorkflowId) ?? workflowCards[0];
}

export function getSelectedResult(selectedResultId: string) {
  return resultCards.find((result) => result.id === selectedResultId) ?? resultCards[0];
}

export function getSelectedRole(teamTab: TeamTab, selectedRoleId: string) {
  const teamCollection = getTeamCollection(teamTab);
  return teamCollection.find((role) => role.id === selectedRoleId) ?? teamCollection[0];
}

export function getInsightStats(snapshot: DashboardSnapshot) {
  const enabledWorkflows = snapshot.workflows.filter((workflow) => workflow.enabled !== false).length;
  const connectedProviders = snapshot.providerConnections.filter((provider) => provider.connected !== false).length;
  const connectedStorage = snapshot.storageConnectors.filter((connector) => connector.connected !== false).length;
  const totalWorkflowCount = snapshot.workflows.length > 0 ? snapshot.workflows.length : workflowCards.length;
  const availableWorkflowCount = snapshot.workflows.length > 0 ? enabledWorkflows : workflowCards.length;

  return [
    {
      label: "Approved workflows",
      value: String(totalWorkflowCount),
      delta: `${availableWorkflowCount} available now`
    },
    {
      label: "Available artifacts",
      value: String(snapshot.artifacts.length || resultCards.length),
      delta: `Temporary retention: ${snapshot.artifactTtlHours} hours`
    },
    {
      label: "Connected providers",
      value: String(connectedProviders),
      delta: connectedProviders > 0 ? "BYOK lanes active" : "Provider setup needed"
    },
    {
      label: "Connected storage",
      value: String(connectedStorage),
      delta: connectedStorage > 0 ? "Customer-owned export path ready" : "Connect an export lane"
    }
  ] as const;
}

export function getPlatformLoadVisual(platformLoad: DashboardPlatformLoad): PlatformLoadVisual {
  const gaugePercent = platformLoad.level === "heavy" ? 88 : platformLoad.level === "moderate" ? 56 : 22;

  return {
    label: "Platform traffic",
    value: platformLoad.summary,
    detail: platformLoad.detail,
    gaugePercent
  };
}

export function getRecentArtifacts(snapshot: DashboardSnapshot, input: { googleDriveConnected: boolean; dropboxConnected: boolean }): ArtifactSummaryRow[] {
  if (snapshot.artifacts.length === 0) {
    return getFileRows(snapshot, input).map((file) => ({
      title: file.title,
      type: file.type,
      expires: file.expiry,
      delivery: input.googleDriveConnected ? "Google Drive" : input.dropboxConnected ? "Dropbox" : "Download"
    }));
  }

  const delivery = input.googleDriveConnected ? "Google Drive" : input.dropboxConnected ? "Dropbox" : "Download";

  return [...snapshot.artifacts]
    .sort((left, right) => toTimestamp(left.expiresAt) - toTimestamp(right.expiresAt))
    .slice(0, 4)
    .map((artifact) => ({
      title: toDisplayTitle(artifact.filename),
      type: artifact.artifactType.toUpperCase(),
      expires: `Available until ${formatTimestamp(artifact.expiresAt)}`,
      delivery
    }));
}

export function getRouteForPath(pathname: string): DashboardRouteDefinition {
  return (
    dashboardRoutes.find((route) => route.path === pathname) ??
    hiddenFutureRoutes.find((route) => route.path === pathname) ??
    dashboardRoutes[0]!
  );
}

export function getDefaultDashboardPageProps(snapshot: DashboardSnapshot) {
  return {
    dashboard: snapshot,
    pageKey: dashboardRoutes[0]!.key,
    role: "member" as const,
    theme: themePresets[0]!,
    provider: "OpenAI",
    keySaved: false,
    connectedProviders: createInitialConnectedProviders(),
    mediaProviderSaved: false,
    googleDriveConnected: false,
    dropboxConnected: false,
    runtimeShellEnabled: true,
    runStatus: "ready" as const,
    workflowStartAvailable: true,
    workflowsPaused: false,
    selectedWorkflowId: workflowCards[0]!.id,
    selectedResultId: resultCards[0]!.id,
    teamTab: "Included Team" as const,
    selectedRoleId: includedRoles[0]!.id,
    resultApprovalStates: {
      "result-241": "Awaiting review" as const,
      "result-238": "Revision needed" as const
    }
  };
}

function mapProviderKindToKey(providerKind: string): ProviderKey | null {
  switch (providerKind) {
    case "openai_api":
    case "openai":
      return "openai";
    case "anthropic_api":
    case "anthropic":
      return "anthropic";
    case "xai_grok_api":
    case "xai_grok":
      return "xaiGrok";
    case "openrouter_api":
    case "openrouter":
      return "openRouter";
    case "openai_chatgpt_codex_subscription":
    case "codex":
      return "codex";
    default:
      return null;
  }
}

function getProviderLabelForWorkflow(workflow: DashboardWorkflow): string {
  switch (workflow.providerKind) {
    case "openai_api":
      return "OpenAI";
    case "anthropic_api":
      return "Anthropic";
    case "xai_grok_api":
      return "xAI / Grok";
    case "openrouter_api":
      return "OpenRouter";
    case "openai_chatgpt_codex_subscription":
      return "ChatGPT / Codex subscription";
    default:
      return "Approved provider";
  }
}

function isWorkflowProviderConnected(workflow: DashboardWorkflow, connectedProviders: Record<ProviderKey, boolean>): boolean {
  const providerKey = mapProviderKindToKey(workflow.providerKind);
  return providerKey ? connectedProviders[providerKey] : false;
}

function buildWorkflowProviderTags(providerLabel: string) {
  return [`${providerLabel} required`];
}

function getReviewOpportunityResult(snapshot: DashboardSnapshot, context: DashboardSnapshotContext): ResultCard | null {
  return (
    getResultCards(snapshot, {
      googleDriveConnected: context.googleDriveConnected,
      dropboxConnected: context.dropboxConnected
    }).find((result) => context.resultApprovalStates[result.id] !== "Approved") ?? null
  );
}

function getMissingRequiredProvider(
  snapshot: DashboardSnapshot,
  connectedProviders: Record<ProviderKey, boolean>
): { id: ProviderKey; label: string } | null {
  for (const provider of snapshot.providerConnections) {
    if (provider.required === false) {
      continue;
    }

    const key = mapProviderKindToKey(provider.providerKind);
    if (key && !connectedProviders[key]) {
      return { id: key, label: provider.label };
    }
  }

  if (!connectedProviders.openai) {
    return { id: "openai", label: "OpenAI" };
  }

  return null;
}

function hasConnectedExportLane(input: { googleDriveConnected: boolean; dropboxConnected: boolean }): boolean {
  return input.googleDriveConnected || input.dropboxConnected;
}

function toDisplayTitle(filename: string): string {
  const withoutExtension = filename.replace(/\.[^.]+$/u, "");
  return withoutExtension
    .split(/[_-]/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function toTimestamp(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}
