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
export type PowerSourceProviderKind = "openai_api" | "anthropic_api" | "gemini_api" | "openrouter_api" | "xai_grok_api";
export type CredentialValidationStatus = "pending" | "valid" | "invalid";
export type CredentialValidationJobReason = "credential_created" | "weekly_revalidation";
export type CredentialValidationJobStatus = "queued" | "processing" | "succeeded" | "failed";

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
  packageId: string;
  key: string;
  version: string;
  packageVersionId: string;
  title: string;
  kind: Extract<PackageKind, "blueprint">;
  permissions: PackagePermissionSnapshot["permissions"];
  budgets: PackagePermissionSnapshot["budgets"];
  source?: {
    kind: "manifest" | "twfpkg";
    contentHash: string;
  };
  personas: BlueprintPersonaDefinition[];
  stations: StationDefinition[];
}

export interface PackagePermissionSnapshot {
  permissions: {
    tools: string[];
    externalActions: Record<string, "approval_required" | "denied">;
    dataAccess: {
      tenantScopeOnly: boolean;
      packageScopeOnly: boolean;
      readableDeliverables: "own_package" | "declared_dependencies";
    };
  };
  budgets: {
    maxRunCostUsd: number;
    maxRunMinutes: number;
    maxStepCostUsd: number;
    approvalRequiredAboveUsd: number;
  };
}

export interface PackagePermissionDiff {
  addedTools: string[];
  widenedExternalActions: Array<{
    action: string;
    from: "approval_required" | "denied" | null;
    to: "approval_required" | "denied";
  }>;
  budgetIncreases: Array<{
    budget: keyof PackagePermissionSnapshot["budgets"];
    from: number;
    to: number;
  }>;
}

export type PackageInstallAuditAction =
  | "package_installed"
  | "package_disabled"
  | "package_enabled"
  | "package_updated"
  | "package_rolled_back"
  | "package_uninstalled";

export interface PackageInstallAuditIntent {
  action: PackageInstallAuditAction;
  workspaceId: string;
  packageInstallId: string;
  packageId: string;
  packageVersionId: string;
  occurredAt: string;
  metadata: {
    previousPackageVersionId?: string;
    permissionDiff?: PackagePermissionDiff;
  };
}

export interface PackageInstall {
  id: string;
  workspaceId: string;
  packageId: string;
  packageVersionId: string;
  previousPackageVersionId: string | null;
  status: "enabled" | "disabled" | "uninstalled";
  installedAt: string;
  updatedAt: string | null;
  disabledAt: string | null;
  uninstalledAt: string | null;
  enabled: boolean;
  permissionSnapshot: PackagePermissionSnapshot;
  permissionDiff: PackagePermissionDiff | null;
}

export interface PowerSourceCredential {
  id: string;
  workspaceId: string;
  providerKind: PowerSourceProviderKind;
  label: string;
  last4: string;
  keyVersion: string;
  validationStatus: CredentialValidationStatus;
  validationMessage: string;
  lastValidatedAt: string | null;
  encryptedPayload: {
    ciphertext: string;
    iv: string;
    tag: string;
    wrappedDataKey: string;
    wrappedDataKeyIv: string;
    wrappedDataKeyTag: string;
  };
  createdAt: string;
  deletedAt: string | null;
}

export interface MaskedPowerSourceCredential {
  id: string;
  workspaceId: string;
  providerKind: PowerSourceProviderKind;
  label: string;
  last4: string;
  keyVersion: string;
  validationStatus: CredentialValidationStatus;
  validationMessage: string;
  lastValidatedAt: string | null;
  createdAt: string;
  deletedAt: string | null;
  masked: true;
}

export interface CredentialValidationJob {
  id: string;
  workspaceId: string;
  credentialId: string;
  reason: CredentialValidationJobReason;
  status: CredentialValidationJobStatus;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  message: string | null;
}

export interface CredentialAccessAuditIntent {
  id: string;
  workspaceId: string;
  credentialId: string;
  runId: string;
  purpose: string;
  accessedAt: string;
}

export type ApprovalStatus = "pending" | "approved" | "changes_requested";

export interface Approval {
  id: string;
  workspaceId: string;
  runId: string;
  packageId: string;
  packageVersionId: string;
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
