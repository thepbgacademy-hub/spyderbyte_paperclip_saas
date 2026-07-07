export type PackageKind = "blueprint" | "expansion";

export type RunStatus =
  | "draft"
  | "ready"
  | "running"
  | "waiting_for_input"
  | "waiting_for_approval"
  | "completed"
  | "failed";

export type StationKind = "structured_interview" | "analysis" | "checkpoint" | "assembly";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  status: "active";
  createdAt: string;
}

export interface StationDefinition {
  key: string;
  title: string;
  kind: StationKind;
}

interface FactoryStationOutputBase {
  id: string;
  workspaceId: string;
  runId: string;
  stationKey: string;
  status: "ready";
}

export interface BlueprintPackageDefinition {
  id: string;
  key: string;
  title: string;
  kind: Extract<PackageKind, "blueprint">;
  stations: StationDefinition[];
}

export interface PackageInstall {
  id: string;
  workspaceId: string;
  packageId: string;
  installedAt: string;
  enabled: boolean;
}

export type ApprovalStatus = "pending" | "approved" | "changes_requested";

export interface Approval {
  id: string;
  workspaceId: string;
  runId: string;
  packageId: string;
  packageInstallId: string;
  stationKey: "positioning";
  deliverableId: string;
  status: ApprovalStatus;
  requestedAt: string;
  resolvedAt: string | null;
  resolutionSummary: string | null;
}

export interface FounderProfileDeliverable extends FactoryStationOutputBase {
  stationKey: "intake";
  kind: "founder_profile";
  title: "Founder Profile";
  body: {
    founderName: string;
    businessName: string;
    primaryGoal: string;
    targetAudience: string;
    summary: string;
  };
}

export interface PositioningBriefDeliverable extends FactoryStationOutputBase {
  stationKey: "positioning";
  kind: "positioning_brief";
  title: "Positioning Brief";
  body: {
    headline: string;
    audience: string;
    primaryGoal: string;
    positioningSummary: string;
  };
}
