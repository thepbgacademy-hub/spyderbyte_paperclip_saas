export type PackageKind = "blueprint" | "expansion";
export type SpecialistKey = "direction" | "finance" | "market" | "operations" | "offer";
export type StationFamilyKey =
  | "intake"
  | "founder_profile_synthesis"
  | "strategic_priorities"
  | "decision_checkpoints"
  | "launch_direction_review"
  | "pricing_analysis"
  | "margin_review"
  | "cost_structure_review"
  | "revenue_sensitivity_review"
  | "financial_approval_checkpoints"
  | "positioning"
  | "messaging_refinement"
  | "audience_clarity_review"
  | "market_offer_framing"
  | "campaign_direction_review"
  | "delivery_design"
  | "workflow_sequencing"
  | "sop_drafting"
  | "implementation_readiness_review"
  | "handoff_packaging"
  | "offer_shaping"
  | "package_design"
  | "objection_handling_review"
  | "conversion_review"
  | "launch_offer_validation";
export type DeliverableKind = "founder_profile" | "positioning_brief";

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

export interface BlueprintPersonaDefinition {
  key: string;
  name: string;
  tagline: string;
  specialistKey: SpecialistKey;
  allowedStationKeys: string[];
}

export interface StationDefinition {
  key: string;
  familyKey: StationFamilyKey;
  personaKey: string;
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
  personas: BlueprintPersonaDefinition[];
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
  kind: Extract<DeliverableKind, "founder_profile">;
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
  kind: Extract<DeliverableKind, "positioning_brief">;
  title: "Positioning Brief";
  body: {
    headline: string;
    audience: string;
    primaryGoal: string;
    positioningSummary: string;
  };
}
