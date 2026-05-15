import type { DashboardSnapshot } from "../dashboard-client.js";

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

export interface CurrentFocusCard {
  title: string;
  summary: string;
  chips: readonly string[];
  primary: "Open Results" | "Open Workflows" | "Open Providers" | "Start workflow";
  secondary: "Open Results" | "Open Files" | "Review package" | "Review workflow";
}

export interface StatusCopyOptions {
  packageReady: boolean;
  runStatus: RunStatus;
  workflowsPaused: boolean;
}

export interface CurrentFocusOptions {
  packageReady: boolean;
  providerReady: boolean;
  runStatus: RunStatus;
  workflowsPaused: boolean;
  selectedApprovalState: ApprovalState;
  googleDriveConnected: boolean;
  dropboxConnected: boolean;
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
    id: "wf-calendar",
    name: "Media calendar",
    description: "Plans a package-approved week of channel-ready campaign work.",
    providerTags: ["OpenAI required", "Media provider required"],
    readiness: "Available now",
    outcome: "A reviewed content calendar with deliverables ready to approve and send.",
    inputs: "Brand priorities, current offer, and campaign timing.",
    outputType: "Calendar, captions, and asset requests",
    milestone: "Next milestone: approve the draft before exports are released."
  },
  {
    id: "wf-refresh",
    name: "Promotion refresh",
    description: "Reworks an active offer into package-safe launch copy and support assets.",
    providerTags: ["OpenAI required", "Storage optional"],
    readiness: "Connection needed",
    outcome: "Updated launch messaging with ready-to-review deliverables.",
    inputs: "Offer details, deadlines, and any required proof points.",
    outputType: "Copy deck and launch notes",
    milestone: "Next milestone: connect a provider to unlock the run."
  },
  {
    id: "wf-recap",
    name: "Weekly recap",
    description: "Packages completed work into a calm owner-facing update.",
    providerTags: ["OpenAI required"],
    readiness: "Ready to start",
    outcome: "A concise weekly summary for review and export.",
    inputs: "Completed work, highlights, and delivery notes.",
    outputType: "Summary memo",
    milestone: "Next milestone: results will appear in the review desk."
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
    name: "Creative Director",
    resume: "Shapes campaign voice and premium asset guidance.",
    outcome: "Improves content quality before delivery.",
    status: "Hired and active",
    action: "Activate lane",
    providerNeed: "Needs provider"
  }
] as const;

export const powerPlays = [
  {
    id: "power-launch",
    name: "Launch Week Push",
    resume: "Unlocks a coordinated sprint for high-priority launch windows.",
    outcome: "Bundles planning, approvals, and delivery timing.",
    status: "Unlock power play",
    action: "Unlock",
    providerNeed: "OpenAI plus media provider"
  },
  {
    id: "power-library",
    name: "Evergreen Library",
    resume: "Builds a reusable reserve of approved package-safe content.",
    outcome: "Creates breathing room between active launch cycles.",
    status: "Available",
    action: "Review unlock",
    providerNeed: "Customer-owned storage recommended"
  }
] as const;

export const resultCards = [
  {
    id: "result-241",
    title: "Summer campaign calendar",
    workflow: "Media calendar",
    summary: "Seven channel-ready posts with matching asset prompts already translated into customer-safe delivery notes.",
    timestamp: "Updated 18 minutes ago",
    status: "Awaiting review",
    exportState: "Ready to download"
  },
  {
    id: "result-238",
    title: "Offer refresh summary",
    workflow: "Promotion refresh",
    summary: "Launch copy package is ready once the storage destination is reconnected.",
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
  { title: "Campaign asset list", type: "XLSX", state: "Ready to download", expiry: "Expires in 18 hours" },
  { title: "Approval deck", type: "PDF", state: "Ready to download", expiry: "Expires in 22 hours" },
  { title: "Post previews", type: "PNG", state: "Reconnect storage", expiry: "Needs attention" }
] as const;

export const profileRows = [
  { name: "Northstar Labs", family: "Social Media", state: "Active", note: "Current operating profile" },
  { name: "Harbor Advisory", family: "Social Media", state: "Available", note: "Owner review complete" }
] as const;

export const billingRows = [
  { label: "Current plan", value: "Social Media Agency package" },
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
  return options.packageReady
    ? "Ready to run the installed package workflow."
    : "Connect package providers to unlock media workflows.";
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
    return {
      title: "Launch the media calendar",
      summary: "The package-approved workflow is ready. Start now to keep next week's plan on schedule.",
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

export function getInsightStats(dateRange: DateRange) {
  return [
    {
      label: "Used this period",
      value: dateRange === "7D" ? "18 workflows" : dateRange === "30D" ? "74 workflows" : "212 workflows",
      delta: "+12%"
    },
    {
      label: "Output volume",
      value: dateRange === "7D" ? "46 deliverables" : dateRange === "30D" ? "188 deliverables" : "534 deliverables",
      delta: "+9%"
    },
    {
      label: "Average turnaround",
      value: dateRange === "7D" ? "3h 20m" : dateRange === "30D" ? "4h 05m" : "4h 42m",
      delta: "-11%"
    },
    { label: "Package status", value: "On track", delta: "Renews in 17 days" }
  ] as const;
}

export function getRecentWork(
  resultApprovalStates: Record<string, ApprovalState>,
  googleDriveConnected: boolean,
  dropboxConnected: boolean
) {
  return [
    {
      date: "May 14",
      type: "Media calendar",
      status: resultApprovalStates["result-241"],
      turnaround: "2h 14m",
      deliveredVia: googleDriveConnected ? "Google Drive" : "Download"
    },
    {
      date: "May 13",
      type: "Offer refresh",
      status: resultApprovalStates["result-238"],
      turnaround: "4h 08m",
      deliveredVia: dropboxConnected ? "Dropbox" : "Download"
    },
    {
      date: "May 12",
      type: "Weekly recap",
      status: "Needs connection",
      turnaround: "Delayed",
      deliveredVia: "Reconnect storage"
    }
  ] as const;
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
    runStatus: "ready" as const,
    workflowsPaused: false,
    selectedWorkflowId: workflowCards[0]!.id,
    selectedResultId: resultCards[0]!.id,
    teamTab: "Included Team" as const,
    selectedRoleId: includedRoles[0]!.id,
    dateRange: "30D" as const,
    resultApprovalStates: {
      "result-241": "Awaiting review" as const,
      "result-238": "Revision needed" as const
    }
  };
}
