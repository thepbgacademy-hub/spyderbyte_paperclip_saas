import { randomUUID } from "node:crypto";

import type { ProviderKind } from "../db/types.js";

export type HarnessRunState = "queued" | "planning" | "active" | "waiting" | "blocked" | "assembling" | "done" | "failed" | "cancelled";
export type HarnessCardState = "queued" | "planning" | "approved" | "working" | "waiting" | "blocked" | "done" | "cancelled";
export type HarnessResultApprovalState = "Awaiting review" | "Approved" | "Revision needed";
export type HarnessPersona = string;
export type HarnessDeliverableType = string;
export type HarnessCardEventKind =
  | "created"
  | "state_changed"
  | "execution_dispatched"
  | "execution_start_ready"
  | "execution_start_suppressed"
  | "execution_hook_failed"
  | "execution_claimed"
  | "execution_claim_refreshed"
  | "execution_outcome_committed"
  | "execution_outcome_ignored"
  | "comment_added"
  | "subcard_proposed"
  | "proposal_absorbed"
  | "lane_handed_off"
  | "attention_requested"
  | "attention_resolved"
  | "result_recorded";
export type HarnessBoardDecisionKind =
  | "lane_opened"
  | "proposal_approved"
  | "proposal_deferred"
  | "proposal_denied"
  | "run_completed";
export type HarnessBoardPolicyReason =
  | "created_new_lane"
  | "reused_existing_lane"
  | "persona_lane_cap"
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

export const HARNESS_CHILD_PERSONAS = ["cfo", "coo", "researcher", "cto", "cmo", "analyst"] as const;
export const HARNESS_DELIVERABLE_TYPES = [
  "plan",
  "pricing_review",
  "research_brief",
  "ops_handoff",
  "technical_review",
  "launch_copy",
  "forecast_model",
  "finance_review",
  "legal_review",
  "tax_strategy_review"
] as const;

export interface HarnessRuntimeContext {
  providerKind: ProviderKind;
  credentialLabel: string;
  previousRunId?: string;
  secretValues?: never;
}

export interface HarnessRunRecord {
  id: string;
  tenantId: string;
  workflowId: string;
  packageId: string;
  orchestratorPersona: HarnessPersona;
  state: HarnessRunState;
  runtimeContext: HarnessRuntimeContext;
  createdAt: string;
  updatedAt: string;
}

export interface HarnessCardRecord {
  id: string;
  runId: string;
  parentCardId: string | null;
  persona: HarnessPersona;
  title: string;
  deliverableType: HarnessDeliverableType;
  state: HarnessCardState;
  executionClaimToken: string | null;
  executionClaimedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HarnessCardEventRecord {
  id: string;
  cardId: string;
  eventKind: HarnessCardEventKind;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface HarnessExecutionStartEventPayload {
  kind: string;
  kindLabel: string;
  executionStage: string;
  executionStageLabel: string;
  reactivatedRun?: boolean;
  triggeredByCardId?: string;
  triggeredByPersona?: string;
  triggeredByOutcomeState?: string;
  triggeredByResultSummary?: string;
  claimKind?: string;
  claimedAt?: string;
  previousClaimedAt?: string;
  failureKind?: "execution_envelope_reconstruction_failed";
  failureMessage?: string;
}

export interface HarnessExecutionHookFailurePayload {
  hookFamily:
    | "lane_outcome_ignored"
    | "lane_outcome_committed"
    | "attention_resolved"
    | "post_outcome_action"
    | "execution_start_ready"
    | "execution_start_suppressed"
    | "execution_claimed"
    | "execution_dispatched";
  hookFamilyLabel: string;
  deliveryMode: "generic" | "specific";
  deliveryModeLabel: string;
  hookKind?: string | undefined;
  hookKindLabel?: string | undefined;
  dispatchKind?: string | undefined;
  executionStage?: string | undefined;
  claimKind?: string | undefined;
  outcomeState?: string | undefined;
  actionKind?: string | undefined;
  attentionDelivery?: "requested" | "reasserted" | undefined;
  reason?: string | undefined;
  currentLaneState?: string | undefined;
  failureMessage: string;
}

type HarnessKnownCardEventPayloadMap = {
  execution_start_ready: HarnessExecutionStartEventPayload;
  execution_start_suppressed: HarnessExecutionStartEventPayload;
  execution_hook_failed: HarnessExecutionHookFailurePayload;
};

export type HarnessCardEventPayloadFor<K extends HarnessCardEventKind> =
  K extends keyof HarnessKnownCardEventPayloadMap ? HarnessKnownCardEventPayloadMap[K] : Record<string, unknown>;

export interface HarnessCardContinuityRecord {
  cardId: string;
  runId: string;
  continuitySource: HarnessCardContinuitySource;
  continuitySummary: string | null;
  latestResultSummary: string | null;
  absorbedWorkItems: string[];
  updatedAt: string;
}

export interface HarnessBoardDecisionRecord {
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
}

export interface HarnessResultApprovalStateRecord {
  tenantId: string;
  runId: string;
  resultId: string;
  approvalState: HarnessResultApprovalState;
  actorUserId: string | null;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HarnessCompletionPackageGovernanceItem {
  proposalId: string;
  statusLabel: string;
  persona: string;
  deliverableLabel: string;
  policyReasonLabel?: string;
  recommendationSummary?: string;
  objectionSummary?: string;
  nextReviewTrigger?: string;
}

export interface HarnessCompletionPackageDeliverable {
  cardId: string;
  persona: string;
  title: string;
  deliverableLabel: string;
  outcome: string;
}

export interface HarnessCompletionPackageSnapshot {
  status: "assembling" | "done";
  summary?: string;
  deferredApprovalCount: number;
  deniedApprovalCount: number;
  hasOpenGovernanceItems: boolean;
  packageNote?: string;
  recommendations: string[];
  objections: string[];
  governanceItems: HarnessCompletionPackageGovernanceItem[];
  deliverables: HarnessCompletionPackageDeliverable[];
}

export interface HarnessCompletionPackageSnapshotRecord extends HarnessCompletionPackageSnapshot {
  runId: string;
  tenantId: string;
  workflowId: string;
  packageId: string;
  createdAt: string;
  updatedAt: string;
}

export interface HarnessGovernanceHistoryRecentDecision {
  id: string;
  decisionKind: string;
  label: string;
  resolution?: string;
  policyReasonLabel?: string;
  recommendationSummary?: string;
  objectionSummary?: string;
  timestampLabel: string;
}

export interface HarnessGovernanceHistoryFollowThroughItem {
  id: string;
  action: "opened_lane" | "reused_lane" | "handed_off_lane" | "packaged_outcome";
  summary: string;
  timestampLabel: string;
  targetCardId?: string;
  proposalId?: string;
  persona?: string;
  deliverableLabel?: string;
  resolutionLabel?: string;
  policyReasonLabel?: string;
  recommendationSummary?: string;
  objectionSummary?: string;
}

export interface HarnessGovernanceHistorySnapshot {
  recentDecisions: HarnessGovernanceHistoryRecentDecision[];
  followThroughItems: HarnessGovernanceHistoryFollowThroughItem[];
}

export interface HarnessGovernanceHistorySnapshotRecord extends HarnessGovernanceHistorySnapshot {
  runId: string;
  tenantId: string;
  workflowId: string;
  packageId: string;
  createdAt: string;
  updatedAt: string;
}

export interface HarnessTaxStrategyPrerequisiteEvidenceItem {
  artifactName: "founder_tax_posture_documents";
  status: "confirmed";
  summary: string;
  confirmedBy: string;
  taxYear: string;
  entityType: string;
  confirmedAt: string;
}

export interface HarnessTaxStrategyPrerequisiteEvidenceInput {
  summary: string;
  confirmedBy: string;
  taxYear: string;
  entityType: string;
}

export interface HarnessTaxStrategyPrerequisiteSnapshot {
  evidence: HarnessTaxStrategyPrerequisiteEvidenceItem[];
}

export interface HarnessTaxStrategyPrerequisiteSnapshotRecord extends HarnessTaxStrategyPrerequisiteSnapshot {
  runId: string;
  tenantId: string;
  workflowId: string;
  packageId: string;
  createdAt: string;
  updatedAt: string;
}

export interface HarnessExportPackageFileRecord {
  path: string;
  mediaType: "text/markdown" | "application/json";
  byteSize: number;
  checksum: string;
  content: string;
}

export interface HarnessExportDeliveryReceipt {
  primaryNotePath?: string;
  manifestPath?: string | null;
  writtenFileCount?: number;
  writtenPaths?: string[];
  lastAttemptedPath?: string;
}

export interface HarnessExportDeliveryRecord {
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
  bundleRevision: string;
  idempotencyKey: string;
  noteTitle: string;
  noteFileName: string;
  placementTargetSystem: "obsidian_vault";
  vaultFolder: string;
  primaryNotePath: string;
  syncStrategy: string;
  confirmationRequirement: string;
  files: HarnessExportPackageFileRecord[];
  recordCount: number;
  disclosureSummary: string;
  redactionSummary: string;
  attemptCount: number;
  lastAttemptedAt: string | null;
  deliveredAt: string | null;
  writerKind: null | "obsidian_filesystem";
  deliveryReceipt: HarnessExportDeliveryReceipt;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HarnessExportDeliveryOutcomeUpdate {
  idempotencyKey: string;
  expectedLastAttemptedAt: string;
  status: "delivered" | "delivery_failed";
  writerKind: null | "obsidian_filesystem";
  deliveryReceipt: HarnessExportDeliveryReceipt;
  attemptCount: number;
  lastAttemptedAt: string;
  deliveredAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  updatedAt: string;
}

export interface HarnessExportDeliveryAttemptClaim {
  idempotencyKey: string;
  writerKind: null | "obsidian_filesystem";
  claimedAt: string;
  updatedAt: string;
}

export const HARNESS_EXPORT_DELIVERY_LEASE_MS = 10 * 60 * 1000;

export function isHarnessExportDeliveryClaimExpired(input: {
  status: HarnessExportDeliveryRecord["status"];
  lastAttemptedAt: string | null;
  now?: number;
}): boolean {
  if (input.status !== "delivery_in_progress" || !input.lastAttemptedAt) {
    return false;
  }

  const attemptedAt = Date.parse(input.lastAttemptedAt);
  if (!Number.isFinite(attemptedAt)) {
    return false;
  }

  const now = input.now ?? Date.now();
  return now - attemptedAt >= HARNESS_EXPORT_DELIVERY_LEASE_MS;
}

export const HARNESS_CARD_STATES = [
  "queued",
  "planning",
  "approved",
  "working",
  "waiting",
  "blocked",
  "done",
  "cancelled"
] as const satisfies readonly HarnessCardState[];

export function isHarnessCardState(value: string): value is HarnessCardState {
  return HARNESS_CARD_STATES.includes(value as HarnessCardState);
}

export function normalizeHarnessPersona(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeHarnessDeliverableType(value: string): string {
  return value.trim().toLowerCase();
}

export function isHarnessChildPersona(value: string): value is (typeof HARNESS_CHILD_PERSONAS)[number] {
  return HARNESS_CHILD_PERSONAS.includes(value as (typeof HARNESS_CHILD_PERSONAS)[number]);
}

export function isHarnessDeliverableType(value: string): value is (typeof HARNESS_DELIVERABLE_TYPES)[number] {
  return HARNESS_DELIVERABLE_TYPES.includes(value as (typeof HARNESS_DELIVERABLE_TYPES)[number]);
}

export function createHarnessRuntimeContext(input: {
  providerKind: ProviderKind;
  credentialLabel: string;
  previousRunId?: string;
} & Record<string, unknown>): HarnessRuntimeContext {
  return {
    providerKind: input.providerKind,
    credentialLabel: input.credentialLabel,
    ...(typeof input.previousRunId === "string" && input.previousRunId.length > 0
      ? { previousRunId: input.previousRunId }
      : {})
  };
}

export function createHarnessRunRecord(input: {
  tenantId: string;
  workflowId: string;
  packageId: string;
  orchestratorPersona: HarnessPersona;
  runtimeContext: {
    providerKind: ProviderKind;
    credentialLabel: string;
    previousRunId?: string;
  } & Record<string, unknown>;
}): HarnessRunRecord {
  const timestamp = new Date().toISOString();

  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    workflowId: input.workflowId,
    packageId: input.packageId,
    orchestratorPersona: input.orchestratorPersona,
    state: "queued",
    runtimeContext: createHarnessRuntimeContext(input.runtimeContext),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createHarnessCardRecord(input: {
  runId: string;
  persona: HarnessPersona;
  title: string;
  deliverableType: HarnessDeliverableType;
  parentCardId?: string | null;
}): HarnessCardRecord {
  const timestamp = new Date().toISOString();

  return {
    id: randomUUID(),
    runId: input.runId,
    parentCardId: input.parentCardId ?? null,
    persona: input.persona,
    title: input.title,
    deliverableType: input.deliverableType,
    state: "queued",
    executionClaimToken: null,
    executionClaimedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createHarnessCardEventRecord<K extends HarnessCardEventKind>(input: {
  cardId: string;
  eventKind: K;
  payload?: HarnessCardEventPayloadFor<K>;
}): HarnessCardEventRecord {
  return {
    id: randomUUID(),
    cardId: input.cardId,
    eventKind: input.eventKind,
    payload: (input.payload ?? {}) as Record<string, unknown>,
    createdAt: new Date().toISOString()
  };
}

export function createHarnessCardContinuityRecord(input: {
  cardId: string;
  runId: string;
  continuitySource?: HarnessCardContinuitySource;
  continuitySummary?: string | null;
  latestResultSummary?: string | null;
  absorbedWorkItems?: readonly string[];
}): HarnessCardContinuityRecord {
  return {
    cardId: input.cardId,
    runId: input.runId,
    continuitySource: input.continuitySource ?? "state_transition",
    continuitySummary: input.continuitySummary ?? null,
    latestResultSummary: input.latestResultSummary ?? null,
    absorbedWorkItems: [...(input.absorbedWorkItems ?? [])],
    updatedAt: new Date().toISOString()
  };
}

export function createHarnessBoardDecisionRecord(input: {
  runId: string;
  tenantId: string;
  actorUserId: string;
  decisionKind: HarnessBoardDecisionKind;
  cardId?: string | null;
  proposalId?: string | null;
  targetCardId?: string | null;
  persona?: string | null;
  deliverableType?: string | null;
  policyReason?: HarnessBoardPolicyReason | null;
  resolution?: string | null;
  decisionNote?: string | null;
  recommendationSummary?: string | null;
  objectionSummary?: string | null;
}): HarnessBoardDecisionRecord {
  return {
    id: randomUUID(),
    runId: input.runId,
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    decisionKind: input.decisionKind,
    cardId: input.cardId ?? null,
    proposalId: input.proposalId ?? null,
    targetCardId: input.targetCardId ?? null,
    persona: input.persona ?? null,
    deliverableType: input.deliverableType ?? null,
    policyReason: input.policyReason ?? null,
    resolution: input.resolution ?? null,
    decisionNote: input.decisionNote ?? null,
    recommendationSummary: input.recommendationSummary ?? null,
    objectionSummary: input.objectionSummary ?? null,
    createdAt: new Date().toISOString()
  };
}
