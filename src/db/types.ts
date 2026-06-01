export type TenantRole = "owner" | "admin" | "member" | "operator";
export type WorkflowRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type HarnessRunStatus = "queued" | "planning" | "active" | "waiting" | "blocked" | "assembling" | "done" | "failed" | "cancelled";
export type HarnessCardStatus = "queued" | "planning" | "approved" | "working" | "waiting" | "blocked" | "done" | "cancelled";
export type HarnessCardEventKind =
  | "created"
  | "state_changed"
  | "comment_added"
  | "subcard_proposed"
  | "proposal_absorbed"
  | "lane_handed_off"
  | "attention_requested"
  | "attention_resolved"
  | "result_recorded";
export type HarnessBoardDecisionKind = "lane_opened" | "proposal_approved" | "proposal_deferred" | "proposal_denied" | "run_completed";
export type HarnessBoardPolicyReason =
  | "created_new_lane"
  | "reused_existing_lane"
  | "deliverable_owner_conflict"
  | "lane_cap"
  | "scope_guardrail"
  | "completed_lanes_only";
export type HarnessCardContinuitySource =
  | "state_transition"
  | "resume_override"
  | "proposal_absorbed"
  | "lane_handoff"
  | "result_recorded";
export type ProviderKind = "openai" | "openai_api" | "openai_chatgpt_codex_subscription" | "anthropic_api" | "xai_grok_api" | "openrouter_api" | "generic_api";

export type TenantRow = {
  id: string;
  name: string;
  slug: string;
  pausedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TenantMembershipRow = {
  tenantId: string;
  userId: string;
  role: TenantRole;
  createdAt: string;
};

export type WorkflowTemplateRow = {
  id: string;
  tenantId: string;
  name: string;
  providerKind: ProviderKind;
  enabled: boolean;
};

export type WorkflowRunRow = {
  id: string;
  tenantId: string;
  workflowTemplateId: string;
  createdByUserId: string;
  status: WorkflowRunStatus;
  publicResult: Record<string, unknown>;
  errorCode: string | null;
};

export type HarnessRuntimeContextRow = {
  providerKind: ProviderKind;
  credentialLabel: string;
};

export type HarnessRunRow = {
  id: string;
  tenantId: string;
  workflowId: string;
  packageId: string;
  orchestratorPersona: string;
  state: HarnessRunStatus;
  runtimeContext: HarnessRuntimeContextRow;
  createdAt: string;
  updatedAt: string;
};

export type HarnessCardRow = {
  id: string;
  runId: string;
  parentCardId: string | null;
  persona: string;
  title: string;
  deliverableType: string;
  state: HarnessCardStatus;
  createdAt: string;
  updatedAt: string;
};

export type HarnessCardEventRow = {
  id: string;
  cardId: string;
  eventKind: HarnessCardEventKind;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type HarnessCardContinuityRow = {
  cardId: string;
  runId: string;
  continuitySource: HarnessCardContinuitySource;
  continuitySummary: string | null;
  latestResultSummary: string | null;
  absorbedWorkItems: string[];
  updatedAt: string;
};

export type HarnessProposalStatus = "proposed" | "approved" | "deferred" | "denied";
export type HarnessProposalResolution = "create_lane" | "update_existing_lane" | "handoff_existing_lane";

export type HarnessProposalRow = {
  id: string;
  runId: string;
  parentCardId: string;
  requestedByCardId: string;
  requestedByPersona: string;
  persona: string;
  title: string;
  deliverableType: string;
  status: HarnessProposalStatus;
  resolution: HarnessProposalResolution | null;
  decisionNote: string | null;
  approvedCardId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HarnessBoardDecisionRow = {
  id: string;
  runId: string;
  tenantId: string;
  actorUserId: string;
  decisionKind: HarnessBoardDecisionKind;
  cardId: string | null;
  proposalId: string | null;
  targetCardId: string | null;
  persona: string | null;
  deliverableType: string | null;
  policyReason: HarnessBoardPolicyReason | null;
  resolution: string | null;
  decisionNote: string | null;
  recommendationSummary: string | null;
  objectionSummary: string | null;
  createdAt: string;
};

export type SecretReferenceRow = {
  id: string;
  tenantId: string;
  providerKind: ProviderKind;
  label: string;
  secretRef: string;
  metadata: Record<string, unknown>;
  revokedAt: string | null;
};

export type WealthFactoryPackageRow = {
  id: string;
  packageKey: string;
  name: string;
  kind: "industry" | "blank_canvas";
  metadata: Record<string, unknown>;
};

export type TenantPackageInstallRow = {
  id: string;
  tenantId: string;
  packageId: string;
  installedByUserId: string;
  status: "active" | "paused" | "removed";
  installedAt: string;
};

export type ArtifactMetadataRow = {
  id: string;
  tenantId: string;
  workflowRunId: string;
  packageId: string | null;
  artifactType: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  checksum: string;
  expiresAt: string;
  purgedAt: string | null;
  exportStatus: "not_exported" | "exported";
};

export type HarnessExportDeliveryRow = {
  id: string;
  runId: string;
  tenantId: string;
  workflowId: string;
  packageId: string;
  candidateId: "governance_history_export" | "package_bundle_export";
  status: "export_ready" | "delivery_in_progress" | "delivered" | "delivery_failed";
  exportFormat: "obsidian_markdown_bundle";
  recordTarget: "governance_history_record" | "package_deliverable_record";
  bundleId: string;
  idempotencyKey: string;
  noteTitle: string;
  noteFileName: string;
  placementManifest: unknown;
  files: unknown;
  recordCount: number;
  disclosureSummary: string;
  redactionSummary: string;
  attemptCount: number;
  lastAttemptedAt: string | null;
  deliveredAt: string | null;
  writerKind: string | null;
  deliveryReceipt: unknown;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StorageConnectorRow = {
  id: string;
  tenantId: string;
  providerKind: string;
  displayName: string;
  publicTarget: Record<string, unknown>;
  revokedAt: string | null;
};
