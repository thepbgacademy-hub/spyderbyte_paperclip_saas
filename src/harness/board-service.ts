import { ApiAuthError, type ApiSession } from "../api/dashboard-api.js";
import { createHash, randomUUID } from "node:crypto";
import type { DurableAuditEvent } from "../audit/durable-audit.js";
import type {
  HarnessBoardDecisionRecord,
  HarnessCardContinuityRecord,
  HarnessCardEventRecord,
  HarnessCardRecord,
  HarnessCompletionPackageSnapshot,
  HarnessCompletionPackageSnapshotRecord,
  HarnessExportDeliveryRecord,
  HarnessGovernanceHistorySnapshotRecord,
  HarnessRunRecord
} from "./types.js";
import { createHarnessBoardDecisionRecord, createHarnessCardContinuityRecord, createHarnessCardEventRecord } from "./types.js";
import {
  isHarnessExportDeliveryClaimExpired,
  isHarnessCardState,
  isHarnessChildPersona,
  isHarnessDeliverableType,
  normalizeHarnessDeliverableType,
  normalizeHarnessPersona
} from "./types.js";
import { deriveHarnessRunState, transitionHarnessCard, transitionHarnessRun } from "./state-machine.js";
import { createHarnessRuntime } from "./runtime.js";
import { buildHarnessWorkerDispatchResolution, type HarnessWorkerDispatchHandoff } from "./worker-executor.js";
import type { HarnessRepository } from "./repository.js";
import {
  deriveCurrentHarnessAttentionState,
  describeHarnessPostOutcomeActionKind,
  determineHarnessPostOutcomeAction,
  isSameAttentionAction,
  parseHarnessAttentionSnapshot,
  type HarnessAttentionState,
  type HarnessPostOutcomeAction
} from "./post-outcome.js";
import type { WealthFactoryWorkflowDefinition } from "../wealthfactory/workflow-registry.js";
import {
  ActivePackageInstallRequiredError,
  TenantMembershipRequiredError
} from "../db/supabase-repositories.js";
import type { HarnessProposalStatus, HarnessSubCardProposal } from "./runtime-contract.js";
import {
  createContinuityAbsorbedWorkItem,
  mergeContinuityAbsorbedWorkItems,
  parseContinuityAbsorbedWorkItem
} from "./continuity.js";
import type {
  HarnessCeoGoalExecutor,
  HarnessCeoLoopBoardSnapshot,
  HarnessCeoGoalPlan
} from "./ceo-goal-executor.js";

export type HarnessBoardActivityItem = {
  id: string;
  label: string;
  timestampLabel: string;
};

export type HarnessBoardDetailSection = {
  id: string;
  title: string;
  body: string;
};

export type HarnessBoardCardView = {
  id: string;
  persona: string;
  title: string;
  summary: string;
  lane: string;
  statusLabel: string;
  priorityLabel: string;
  deliverableLabel: string;
  updatedAtLabel: string;
  outcome: string;
  focusPoints: string[];
  activity: HarnessBoardActivityItem[];
  detailSections: HarnessBoardDetailSection[];
};

export type HarnessBoardColumnView = {
  id: string;
  title: string;
  description: string;
  cardIds: string[];
};

export type HarnessBoardResponse = {
  runId: string;
  workflowId: string;
  packageId: string;
  columns: HarnessBoardColumnView[];
  cards: HarnessBoardCardView[];
  pendingApprovals: HarnessPendingApprovalView[];
  pendingAttention?: HarnessPendingAttentionView;
  recentDecisions: HarnessRecentDecisionView[];
  followThroughItems: HarnessFollowThroughView[];
  memoryBoundary: HarnessMemoryBoundaryView;
  completionPackage?: HarnessCompletionPackageView;
};

export type HarnessMemoryBoundaryDestination = "wealth_factory_runtime" | "tenant_record_candidate";

export type HarnessMemoryBoundaryReadiness =
  | "live_runtime_only"
  | "ready_now"
  | "after_board_closes";

export type HarnessMemoryBoundaryRole =
  | "runtime_memory"
  | "governance_record_candidate"
  | "packaged_record_candidate";

export type HarnessRuntimeMemoryShape =
  | "bounded_continuity_trio"
  | "bounded_attention_signal";

export type HarnessRuntimeMemoryComponent =
  | "continuity_summary"
  | "latest_result_summary"
  | "absorbed_work_items"
  | "pending_attention_state";

export type HarnessRuntimeLongMemoryDisposition =
  | "stays_runtime_only";

export type HarnessMemoryBoundaryEligibilityRule =
  | "runtime_only"
  | "explicit_export_later"
  | "after_board_closes_then_export";

export type HarnessMemoryBoundarySourceSurface =
  | "continuity_snapshots"
  | "pending_attention"
  | "recent_decisions"
  | "follow_through"
  | "completion_package_governance"
  | "completion_package_deliverables";

export type HarnessMemoryBoundaryCandidateClass =
  | "runtime_operational"
  | "governance_history"
  | "packaged_output";

export type HarnessMemoryBoundaryDurabilityCondition =
  | "runtime_ephemeral"
  | "stable_when_recorded"
  | "stable_after_board_closure";

export type HarnessMemoryBoundaryOwnershipBoundary =
  | "wealth_factory_only"
  | "tenant_owned_later";

export type HarnessMemoryBoundaryPromotionPath =
  | "never_promotes"
  | "ready_for_explicit_export"
  | "after_board_closure_then_export";

export type HarnessMemoryBoundaryRecordTarget =
  | "none_runtime_only"
  | "governance_history_record"
  | "package_governance_record"
  | "package_deliverable_record";

export type HarnessMemoryBoundaryPromotionBlocker =
  | "not_applicable_runtime_only"
  | "none_ready_now"
  | "board_closure_required";

export type HarnessMemoryBoundaryPromotionAuthority =
  | "wealth_factory_runtime_only"
  | "tenant_explicit_export"
  | "board_closure_then_tenant_export";

export type HarnessMemoryBoundaryPromotionTrigger =
  | "not_applicable_runtime"
  | "tenant_export_request"
  | "board_closure";

export type HarnessMemoryBoundaryPromotionState =
  | "runtime_only"
  | "ready_for_tenant_export"
  | "awaiting_board_closure";

export type HarnessMemoryBoundaryPromotionNextStep =
  | "none_runtime_only"
  | "tenant_export_available"
  | "board_closure_then_tenant_export";

export type HarnessMemoryBoundaryPromotionActionFamily =
  | "none_runtime_only"
  | "tenant_export_candidate"
  | "board_closure_before_export";
export type HarnessMemoryBoundaryExportSequence =
  | "foundational_first"
  | "board_closure_following";
export type HarnessMemoryBoundaryExportDependencyPolicy =
  | "independent_candidate"
  | "depends_on_governance_history_export";

export type HarnessMemoryBoundaryAssemblyShape =
  | "none_runtime_only"
  | "standalone_export_record"
  | "package_record_set";

export type HarnessMemoryBoundaryPromotionPhase =
  | "not_exported_runtime"
  | "phase_one_governance_history"
  | "phase_two_package_export";

export type HarnessMemoryBoundaryPromotionMutability =
  | "runtime_mutable"
  | "append_only_history"
  | "replaceable_until_board_closure"
  | "stable_snapshot";

export type HarnessMemoryBoundaryPromotionScope =
  | "none_runtime_only"
  | "single_record_export"
  | "package_record_set_export";

export type HarnessMemoryBoundaryIdentityStability =
  | "runtime_transient_identity"
  | "stable_record_identity"
  | "finalized_after_board_closure";

export type HarnessMemoryBoundaryAuditBacking =
  | "runtime_state_only"
  | "decision_ledger_backed"
  | "package_closure_backed";

export type HarnessMemoryBoundaryConcurrencyBoundary =
  | "runtime_only"
  | "independent_export_safe"
  | "requires_board_closure_snapshot";

export type HarnessMemoryBoundaryExportPayloadShape =
  | "none_runtime_only"
  | "governance_history_record"
  | "package_snapshot_bundle";

export type HarnessMemoryBoundaryIdempotencyPolicy =
  | "not_applicable_runtime"
  | "deterministic_upsert"
  | "board_closure_snapshot_once";

export type HarnessMemoryBoundaryReplaySafety =
  | "runtime_only"
  | "replay_safe"
  | "requires_fresh_board_closure_snapshot";

export type HarnessMemoryBoundaryConflictPolicy =
  | "runtime_only"
  | "append_or_upsert"
  | "replace_latest_closure_snapshot";

export type HarnessMemoryBoundaryExportAtomicity =
  | "none_runtime_only"
  | "record_level_atomic"
  | "closure_bundle_atomic";

export type HarnessMemoryBoundaryExportDerivationBasis =
  | "none_runtime_only"
  | "decision_history_derived"
  | "board_closure_snapshot_derived";

export type HarnessMemoryBoundaryExportRevisionPolicy =
  | "none_runtime_only"
  | "append_new_revision"
  | "replace_closure_bundle_revision";

export type HarnessMemoryBoundaryExportFreshnessSource =
  | "none_runtime_only"
  | "latest_record_state"
  | "latest_board_closure_snapshot";

export type HarnessMemoryBoundaryExportValidationBoundary =
  | "none_runtime_only"
  | "record_level_validation"
  | "closure_bundle_validation";

export type HarnessMemoryBoundaryExportCompletenessRule =
  | "none_runtime_only"
  | "self_contained_record"
  | "board_closure_complete_bundle";

export type HarnessMemoryBoundaryExportSensitivity =
  | "none_runtime_only"
  | "tenant_business_context"
  | "tenant_deliverable_context";

export type HarnessMemoryBoundaryExportAudienceBoundary =
  | "wealth_factory_runtime_only"
  | "tenant_governance_history_readers"
  | "tenant_package_consumers";

export type HarnessMemoryBoundaryExportSanitizationPolicy =
  | "none_runtime_only"
  | "export_as_recorded"
  | "sanitize_before_package_export";

export type HarnessMemoryBoundaryExportRedactionBoundary =
  | "runtime_internal_only"
  | "governance_safe_redaction"
  | "package_safe_redaction";

export type HarnessMemoryBoundaryExportSourceDisclosurePolicy =
  | "runtime_only"
  | "decision_summary_only"
  | "closure_snapshot_summary_only";

export type HarnessMemoryBoundaryMemoryPlacement =
  | "none_runtime_only"
  | "governance_history_note"
  | "package_record_folder";

export type HarnessMemoryBoundarySyncStrategy =
  | "none_runtime_only"
  | "append_history_entry"
  | "replace_package_snapshot_after_board_closure";

export type HarnessMemoryBoundaryExportRequestShape =
  | "none_runtime_only"
  | "single_record_export_request"
  | "package_bundle_export_request";

export type HarnessMemoryBoundaryExportConfirmationRequirement =
  | "none_runtime_only"
  | "tenant_export_confirmation"
  | "board_closure_then_tenant_export_confirmation";

export type HarnessMemoryBoundaryExportRecoveryPath =
  | "runtime_only"
  | "retry_latest_record_export"
  | "rerun_after_board_closure_snapshot";

export type HarnessMemoryBoundaryItemView = {
  id:
    | "lane_continuity"
    | "attention_state"
    | "governance_decisions"
    | "implemented_actions"
    | "package_deliverables"
    | "package_governance";
  label: string;
  count: number;
  summary: string;
  destination: HarnessMemoryBoundaryDestination;
  readiness: HarnessMemoryBoundaryReadiness;
  readinessLabel: string;
  role: HarnessMemoryBoundaryRole;
  roleLabel: string;
  eligibilityRule: HarnessMemoryBoundaryEligibilityRule;
  eligibilityRuleLabel: string;
  sourceSurface: HarnessMemoryBoundarySourceSurface;
  sourceSurfaceLabel: string;
  candidateClass: HarnessMemoryBoundaryCandidateClass;
  candidateClassLabel: string;
  durabilityCondition: HarnessMemoryBoundaryDurabilityCondition;
  durabilityConditionLabel: string;
  ownershipBoundary: HarnessMemoryBoundaryOwnershipBoundary;
  ownershipBoundaryLabel: string;
  promotionPath: HarnessMemoryBoundaryPromotionPath;
  promotionPathLabel: string;
  recordTarget: HarnessMemoryBoundaryRecordTarget;
  recordTargetLabel: string;
  promotionBlocker: HarnessMemoryBoundaryPromotionBlocker;
  promotionBlockerLabel: string;
  promotionAuthority: HarnessMemoryBoundaryPromotionAuthority;
  promotionAuthorityLabel: string;
  promotionTrigger: HarnessMemoryBoundaryPromotionTrigger;
  promotionTriggerLabel: string;
  promotionState: HarnessMemoryBoundaryPromotionState;
  promotionStateLabel: string;
  promotionNextStep: HarnessMemoryBoundaryPromotionNextStep;
  promotionNextStepLabel: string;
  promotionActionFamily: HarnessMemoryBoundaryPromotionActionFamily;
  promotionActionFamilyLabel: string;
  assemblyShape: HarnessMemoryBoundaryAssemblyShape;
  assemblyShapeLabel: string;
  promotionPhase: HarnessMemoryBoundaryPromotionPhase;
  promotionPhaseLabel: string;
  promotionMutability: HarnessMemoryBoundaryPromotionMutability;
  promotionMutabilityLabel: string;
  promotionScope: HarnessMemoryBoundaryPromotionScope;
  promotionScopeLabel: string;
  identityStability: HarnessMemoryBoundaryIdentityStability;
  identityStabilityLabel: string;
  auditBacking: HarnessMemoryBoundaryAuditBacking;
  auditBackingLabel: string;
  concurrencyBoundary: HarnessMemoryBoundaryConcurrencyBoundary;
  concurrencyBoundaryLabel: string;
  exportPayloadShape: HarnessMemoryBoundaryExportPayloadShape;
  exportPayloadShapeLabel: string;
  idempotencyPolicy: HarnessMemoryBoundaryIdempotencyPolicy;
  idempotencyPolicyLabel: string;
  replaySafety: HarnessMemoryBoundaryReplaySafety;
  replaySafetyLabel: string;
  conflictPolicy: HarnessMemoryBoundaryConflictPolicy;
  conflictPolicyLabel: string;
  exportAtomicity: HarnessMemoryBoundaryExportAtomicity;
  exportAtomicityLabel: string;
  exportDerivationBasis: HarnessMemoryBoundaryExportDerivationBasis;
  exportDerivationBasisLabel: string;
  exportRevisionPolicy: HarnessMemoryBoundaryExportRevisionPolicy;
  exportRevisionPolicyLabel: string;
  exportFreshnessSource: HarnessMemoryBoundaryExportFreshnessSource;
  exportFreshnessSourceLabel: string;
  exportValidationBoundary: HarnessMemoryBoundaryExportValidationBoundary;
  exportValidationBoundaryLabel: string;
  exportCompletenessRule: HarnessMemoryBoundaryExportCompletenessRule;
  exportCompletenessRuleLabel: string;
  exportSensitivity: HarnessMemoryBoundaryExportSensitivity;
  exportSensitivityLabel: string;
  exportAudienceBoundary: HarnessMemoryBoundaryExportAudienceBoundary;
  exportAudienceBoundaryLabel: string;
  exportSanitizationPolicy: HarnessMemoryBoundaryExportSanitizationPolicy;
  exportSanitizationPolicyLabel: string;
  exportRedactionBoundary: HarnessMemoryBoundaryExportRedactionBoundary;
  exportRedactionBoundaryLabel: string;
  exportSourceDisclosurePolicy: HarnessMemoryBoundaryExportSourceDisclosurePolicy;
  exportSourceDisclosurePolicyLabel: string;
  memoryPlacement: HarnessMemoryBoundaryMemoryPlacement;
  memoryPlacementLabel: string;
  syncStrategy: HarnessMemoryBoundarySyncStrategy;
  syncStrategyLabel: string;
  exportRequestShape: HarnessMemoryBoundaryExportRequestShape;
  exportRequestShapeLabel: string;
  exportConfirmationRequirement: HarnessMemoryBoundaryExportConfirmationRequirement;
  exportConfirmationRequirementLabel: string;
  exportRecoveryPath: HarnessMemoryBoundaryExportRecoveryPath;
  exportRecoveryPathLabel: string;
  runtimeMemoryShape?: HarnessRuntimeMemoryShape;
  runtimeMemoryShapeLabel?: string;
  runtimeMemoryComponents?: HarnessRuntimeMemoryComponent[];
  runtimeMemoryComponentLabels?: string[];
  runtimeLongMemoryDisposition?: HarnessRuntimeLongMemoryDisposition;
  runtimeLongMemoryDispositionLabel?: string;
  promotionActionDescription: string;
  nextEligibleSummary?: string;
};

export type HarnessMemoryBoundaryPartitionView = {
  itemCount: number;
  summary: string;
};

export type HarnessMemoryBoundaryExportCandidateView = {
  id: "governance_history_export" | "package_bundle_export";
  label: string;
  itemCount: number;
  itemIds: Array<
    "governance_decisions" | "implemented_actions" | "package_governance" | "package_deliverables"
  >;
  itemLabels: string[];
  summary: string;
  readiness: HarnessMemoryBoundaryReadiness;
  readinessLabel: string;
  eligibilityRule: HarnessMemoryBoundaryEligibilityRule;
  eligibilityRuleLabel: string;
  sourceSurface: HarnessMemoryBoundarySourceSurface;
  sourceSurfaceLabel: string;
  candidateClass: HarnessMemoryBoundaryCandidateClass;
  candidateClassLabel: string;
  durabilityCondition: HarnessMemoryBoundaryDurabilityCondition;
  durabilityConditionLabel: string;
  ownershipBoundary: HarnessMemoryBoundaryOwnershipBoundary;
  ownershipBoundaryLabel: string;
  promotionPath: HarnessMemoryBoundaryPromotionPath;
  promotionPathLabel: string;
  recordTarget: HarnessMemoryBoundaryRecordTarget;
  recordTargetLabel: string;
  promotionBlocker: HarnessMemoryBoundaryPromotionBlocker;
  promotionBlockerLabel: string;
  promotionAuthority: HarnessMemoryBoundaryPromotionAuthority;
  promotionAuthorityLabel: string;
  promotionTrigger: HarnessMemoryBoundaryPromotionTrigger;
  promotionTriggerLabel: string;
  promotionState: HarnessMemoryBoundaryPromotionState;
  promotionStateLabel: string;
  promotionNextStep: HarnessMemoryBoundaryPromotionNextStep;
  promotionNextStepLabel: string;
  promotionActionFamily: HarnessMemoryBoundaryPromotionActionFamily;
  promotionActionFamilyLabel: string;
  assemblyShape: HarnessMemoryBoundaryAssemblyShape;
  assemblyShapeLabel: string;
  promotionPhase: HarnessMemoryBoundaryPromotionPhase;
  promotionPhaseLabel: string;
  promotionMutability: HarnessMemoryBoundaryPromotionMutability;
  promotionMutabilityLabel: string;
  promotionScope: HarnessMemoryBoundaryPromotionScope;
  promotionScopeLabel: string;
  identityStability: HarnessMemoryBoundaryIdentityStability;
  identityStabilityLabel: string;
  auditBacking: HarnessMemoryBoundaryAuditBacking;
  auditBackingLabel: string;
  concurrencyBoundary: HarnessMemoryBoundaryConcurrencyBoundary;
  concurrencyBoundaryLabel: string;
  memoryPlacement: HarnessMemoryBoundaryMemoryPlacement;
  memoryPlacementLabel: string;
  syncStrategy: HarnessMemoryBoundarySyncStrategy;
  syncStrategyLabel: string;
  exportRequestShape: HarnessMemoryBoundaryExportRequestShape;
  exportRequestShapeLabel: string;
  exportConfirmationRequirement: HarnessMemoryBoundaryExportConfirmationRequirement;
  exportConfirmationRequirementLabel: string;
  exportRecoveryPath: HarnessMemoryBoundaryExportRecoveryPath;
  exportRecoveryPathLabel: string;
  governanceItemCount?: number;
  deferredGovernanceItemCount?: number;
  deniedGovernanceItemCount?: number;
  governanceExportDisposition?: "included_in_existing_candidates";
  governanceExportDispositionLabel?: string;
  exportPayloadShape: HarnessMemoryBoundaryExportPayloadShape;
  exportPayloadShapeLabel: string;
  idempotencyPolicy: HarnessMemoryBoundaryIdempotencyPolicy;
  idempotencyPolicyLabel: string;
  replaySafety: HarnessMemoryBoundaryReplaySafety;
  replaySafetyLabel: string;
  conflictPolicy: HarnessMemoryBoundaryConflictPolicy;
  conflictPolicyLabel: string;
  exportAtomicity: HarnessMemoryBoundaryExportAtomicity;
  exportAtomicityLabel: string;
  exportDerivationBasis: HarnessMemoryBoundaryExportDerivationBasis;
  exportDerivationBasisLabel: string;
  exportRevisionPolicy: HarnessMemoryBoundaryExportRevisionPolicy;
  exportRevisionPolicyLabel: string;
  exportFreshnessSource: HarnessMemoryBoundaryExportFreshnessSource;
  exportFreshnessSourceLabel: string;
  exportValidationBoundary: HarnessMemoryBoundaryExportValidationBoundary;
  exportValidationBoundaryLabel: string;
  exportCompletenessRule: HarnessMemoryBoundaryExportCompletenessRule;
  exportCompletenessRuleLabel: string;
  exportSensitivity: HarnessMemoryBoundaryExportSensitivity;
  exportSensitivityLabel: string;
  exportAudienceBoundary: HarnessMemoryBoundaryExportAudienceBoundary;
  exportAudienceBoundaryLabel: string;
  exportSanitizationPolicy: HarnessMemoryBoundaryExportSanitizationPolicy;
  exportSanitizationPolicyLabel: string;
  exportRedactionBoundary: HarnessMemoryBoundaryExportRedactionBoundary;
  exportRedactionBoundaryLabel: string;
  exportSourceDisclosurePolicy: HarnessMemoryBoundaryExportSourceDisclosurePolicy;
  exportSourceDisclosurePolicyLabel: string;
  exportSequence?: HarnessMemoryBoundaryExportSequence;
  exportSequenceLabel?: string;
  exportDependencyPolicy?: HarnessMemoryBoundaryExportDependencyPolicy;
  exportDependencyPolicyLabel?: string;
  dependsOnCandidateIds?: Array<"governance_history_export" | "package_bundle_export">;
  dependsOnCandidateLabels?: string[];
  dependencySummary?: string;
  nextEligibleSummary?: string;
  latestDelivery?: HarnessExportCandidateDeliveryView;
  exportActions?: HarnessExportCandidateActionView[];
};

export type HarnessMemoryBoundaryView = {
  summary: string;
  exportSummary: string;
  deliverySummary: string;
  readyNowCount: number;
  waitingOnBoardClosureCount: number;
  governanceReadyCount: number;
  packagedReadyCount: number;
  packagedWaitingCount: number;
  blockedCandidateCount: number;
  tenantControlledCandidateCount: number;
  boardControlledCandidateCount: number;
  tenantExportTriggerCount: number;
  boardClosureTriggerCount: number;
  runtimeOnlyStateCount: number;
  readyForTenantExportStateCount: number;
  awaitingBoardClosureStateCount: number;
  runtimeOnlyNextStepCount: number;
  tenantExportAvailableNextStepCount: number;
  boardClosureThenTenantExportNextStepCount: number;
  noPromotionActionCount: number;
  tenantExportActionFamilyCount: number;
  boardClosureActionFamilyCount: number;
  noAssemblyShapeCount: number;
  standaloneExportRecordCount: number;
  packageRecordSetCount: number;
  noExportPhaseCount: number;
  phaseOneExportCount: number;
  phaseTwoExportCount: number;
  runtimeMutableCount: number;
  appendOnlyHistoryCount: number;
  replaceableSnapshotCount: number;
  stableSnapshotCount: number;
  noPromotionScopeCount: number;
  singleRecordExportScopeCount: number;
  packageRecordSetExportScopeCount: number;
  transientIdentityCount: number;
  stableIdentityCount: number;
  closureFinalizedIdentityCount: number;
  runtimeStateOnlyAuditCount: number;
  decisionLedgerAuditCount: number;
  packageClosureAuditCount: number;
  runtimeOnlyConcurrencyCount: number;
  independentExportSafeCount: number;
  requiresBoardClosureSnapshotCount: number;
  noExportPayloadShapeCount: number;
  governanceHistoryPayloadCount: number;
  packageSnapshotBundleCount: number;
  noIdempotencyPolicyCount: number;
  deterministicUpsertCount: number;
  boardClosureSnapshotOnceCount: number;
  runtimeOnlyReplaySafetyCount: number;
  replaySafeCount: number;
  freshClosureSnapshotReplayCount: number;
  runtimeOnlyConflictPolicyCount: number;
  appendOrUpsertConflictCount: number;
  replaceLatestClosureSnapshotCount: number;
  noExportAtomicityCount: number;
  recordLevelAtomicCount: number;
  closureBundleAtomicCount: number;
  noExportDerivationBasisCount: number;
  decisionHistoryDerivedCount: number;
  boardClosureSnapshotDerivedCount: number;
  noExportRevisionPolicyCount: number;
  appendNewRevisionCount: number;
  replaceClosureBundleRevisionCount: number;
  noExportFreshnessSourceCount: number;
  latestRecordStateCount: number;
  latestBoardClosureSnapshotCount: number;
  noExportValidationBoundaryCount: number;
  recordLevelValidationCount: number;
  closureBundleValidationCount: number;
  noExportCompletenessRuleCount: number;
  selfContainedRecordCount: number;
  boardClosureCompleteBundleCount: number;
  noExportSensitivityCount: number;
  tenantBusinessContextCount: number;
  tenantDeliverableContextCount: number;
  runtimeOnlyAudienceCount: number;
  governanceHistoryAudienceCount: number;
  packageConsumerAudienceCount: number;
  noExportSanitizationCount: number;
  exportAsRecordedCount: number;
  sanitizeBeforePackageExportCount: number;
  runtimeInternalOnlyRedactionCount: number;
  governanceSafeRedactionCount: number;
  packageSafeRedactionCount: number;
  runtimeOnlySourceDisclosureCount: number;
  decisionSummaryOnlyCount: number;
  closureSnapshotSummaryOnlyCount: number;
  noMemoryPlacementCount: number;
  governanceHistoryNoteCount: number;
  packageRecordFolderCount: number;
  noSyncStrategyCount: number;
  appendHistoryEntryCount: number;
  replacePackageSnapshotAfterClosureCount: number;
  noExportRequestShapeCount: number;
  singleRecordExportRequestCount: number;
  packageBundleExportRequestCount: number;
  noExportConfirmationRequirementCount: number;
  tenantExportConfirmationCount: number;
  boardClosureThenTenantExportConfirmationCount: number;
  runtimeOnlyRecoveryPathCount: number;
  retryLatestRecordExportCount: number;
  rerunAfterBoardClosureSnapshotCount: number;
  roleSummary: string;
  ownershipSummary: string;
  promotionSummary: string;
  recordTargetSummary: string;
  blockerSummary: string;
  authoritySummary: string;
  triggerSummary: string;
  stateSummary: string;
  nextStepSummary: string;
  actionFamilySummary: string;
  assemblySummary: string;
  phaseSummary: string;
  mutabilitySummary: string;
  scopeSummary: string;
  identitySummary: string;
  auditSummary: string;
  concurrencySummary: string;
  payloadShapeSummary: string;
  idempotencySummary: string;
  replaySafetySummary: string;
  conflictPolicySummary: string;
  atomicitySummary: string;
  derivationSummary: string;
  revisionSummary: string;
  freshnessSummary: string;
  validationSummary: string;
  completenessSummary: string;
  sensitivitySummary: string;
  audienceSummary: string;
  sanitizationSummary: string;
  redactionSummary: string;
  sourceDisclosureSummary: string;
  placementSummary: string;
  syncStrategySummary: string;
  requestShapeSummary: string;
  confirmationSummary: string;
  recoveryPathSummary: string;
  continuityTrioRuntimeItemCount?: number;
  attentionSignalRuntimeItemCount?: number;
  runtimeOnlyLongMemoryItemCount?: number;
  runtimeShapeSummary?: string;
  runtimeLongMemoryDispositionSummary?: string;
  exportCandidateSummary?: string;
  exportCandidateGroupCount?: number;
  readyExportCandidateGroupCount?: number;
  waitingExportCandidateGroupCount?: number;
  exportReadyDeliveryCandidateGroupCount?: number;
  deliveredCandidateGroupCount?: number;
  failedDeliveryCandidateGroupCount?: number;
  foundationalExportCandidateCount?: number;
  boardClosureFollowingExportCandidateCount?: number;
  independentExportCandidateCount?: number;
  dependentExportCandidateCount?: number;
  independentExportSafeCandidateGroupCount?: number;
  requiresClosureSnapshotCandidateGroupCount?: number;
  tenantBusinessContextCandidateGroupCount?: number;
  tenantDeliverableContextCandidateGroupCount?: number;
  governanceHistoryAudienceCandidateGroupCount?: number;
  packageConsumerAudienceCandidateGroupCount?: number;
  exportAsRecordedCandidateGroupCount?: number;
  sanitizeBeforePackageExportCandidateGroupCount?: number;
  governanceSafeRedactionCandidateGroupCount?: number;
  packageSafeRedactionCandidateGroupCount?: number;
  decisionSummaryOnlyCandidateGroupCount?: number;
  closureSnapshotSummaryOnlyCandidateGroupCount?: number;
  singleRecordExportRequestCandidateGroupCount?: number;
  packageBundleExportRequestCandidateGroupCount?: number;
  tenantExportConfirmationCandidateGroupCount?: number;
  boardClosureThenTenantExportConfirmationCandidateGroupCount?: number;
  retryLatestRecordExportCandidateGroupCount?: number;
  rerunAfterBoardClosureSnapshotCandidateGroupCount?: number;
  governanceHistoryNoteCandidateGroupCount?: number;
  packageRecordFolderCandidateGroupCount?: number;
  appendHistoryEntryCandidateGroupCount?: number;
  replacePackageSnapshotAfterClosureCandidateGroupCount?: number;
  readyForTenantExportCandidateGroupCount?: number;
  awaitingBoardClosureCandidateGroupCount?: number;
  tenantExportAvailableNextStepCandidateGroupCount?: number;
  boardClosureThenTenantExportNextStepCandidateGroupCount?: number;
  tenantExportActionFamilyCandidateGroupCount?: number;
  boardClosureActionFamilyCandidateGroupCount?: number;
  governanceHistoryCandidateGroupCount?: number;
  packagedOutputCandidateGroupCount?: number;
  stableWhenRecordedCandidateGroupCount?: number;
  stableAfterBoardClosureCandidateGroupCount?: number;
  tenantOwnedLaterCandidateGroupCount?: number;
  governanceHistoryRecordCandidateGroupCount?: number;
  packageBundleRecordCandidateGroupCount?: number;
  tenantExplicitExportAuthorityCandidateGroupCount?: number;
  boardClosureThenTenantExportAuthorityCandidateGroupCount?: number;
  explicitExportLaterCandidateGroupCount?: number;
  afterBoardClosesThenExportCandidateGroupCount?: number;
  recentDecisionsSourceCandidateGroupCount?: number;
  completionPackageSurfaceCandidateGroupCount?: number;
  readyForExplicitExportCandidateGroupCount?: number;
  afterBoardClosureThenExportCandidateGroupCount?: number;
  noPromotionBlockerCandidateGroupCount?: number;
  boardClosureRequiredCandidateGroupCount?: number;
  tenantExportRequestCandidateGroupCount?: number;
  boardClosureTriggerCandidateGroupCount?: number;
  standaloneExportRecordCandidateGroupCount?: number;
  packageRecordSetCandidateGroupCount?: number;
  phaseOneExportCandidateGroupCount?: number;
  phaseTwoExportCandidateGroupCount?: number;
  appendOnlyHistoryCandidateGroupCount?: number;
  replaceableSnapshotCandidateGroupCount?: number;
  singleRecordExportScopeCandidateGroupCount?: number;
  packageRecordSetExportScopeCandidateGroupCount?: number;
  stableIdentityCandidateGroupCount?: number;
  closureFinalizedIdentityCandidateGroupCount?: number;
  governanceHistoryPayloadCandidateGroupCount?: number;
  packageSnapshotBundleCandidateGroupCount?: number;
  deterministicUpsertCandidateGroupCount?: number;
  boardClosureSnapshotOnceCandidateGroupCount?: number;
  replaySafeCandidateGroupCount?: number;
  freshClosureSnapshotReplayCandidateGroupCount?: number;
  appendOrUpsertConflictCandidateGroupCount?: number;
  replaceLatestClosureSnapshotCandidateGroupCount?: number;
  recordLevelAtomicCandidateGroupCount?: number;
  closureBundleAtomicCandidateGroupCount?: number;
  decisionHistoryDerivedCandidateGroupCount?: number;
  boardClosureSnapshotDerivedCandidateGroupCount?: number;
  appendNewRevisionCandidateGroupCount?: number;
  replaceClosureBundleRevisionCandidateGroupCount?: number;
  latestRecordStateCandidateGroupCount?: number;
  latestBoardClosureSnapshotCandidateGroupCount?: number;
  recordLevelValidationCandidateGroupCount?: number;
  closureBundleValidationCandidateGroupCount?: number;
  selfContainedRecordCandidateGroupCount?: number;
  boardClosureCompleteBundleCandidateGroupCount?: number;
  sequenceSummary?: string;
  dependencySummary?: string;
  exportCandidateConcurrencySummary?: string;
  exportCandidateSensitivitySummary?: string;
  exportCandidateAudienceSummary?: string;
  exportCandidateSanitizationSummary?: string;
  exportCandidateRedactionSummary?: string;
  exportCandidateSourceDisclosureSummary?: string;
  exportCandidateRequestShapeSummary?: string;
  exportCandidateConfirmationSummary?: string;
  exportCandidateRecoveryPathSummary?: string;
  exportCandidatePlacementSummary?: string;
  exportCandidateSyncStrategySummary?: string;
  exportCandidateStateSummary?: string;
  exportCandidateNextStepSummary?: string;
  exportCandidateActionFamilySummary?: string;
  exportCandidateClassSummary?: string;
  exportCandidateDurabilitySummary?: string;
  exportCandidateOwnershipSummary?: string;
  exportCandidateRecordTargetSummary?: string;
  exportCandidateAuthoritySummary?: string;
  exportCandidateEligibilitySummary?: string;
  exportCandidateSourceSurfaceSummary?: string;
  exportCandidatePathSummary?: string;
  exportCandidateBlockerSummary?: string;
  exportCandidateTriggerSummary?: string;
  exportCandidateAssemblySummary?: string;
  exportCandidatePhaseSummary?: string;
  exportCandidateMutabilitySummary?: string;
  exportCandidateScopeSummary?: string;
  exportCandidateIdentitySummary?: string;
  exportCandidatePayloadShapeSummary?: string;
  exportCandidateIdempotencySummary?: string;
  exportCandidateReplaySafetySummary?: string;
  exportCandidateConflictPolicySummary?: string;
  exportCandidateAtomicitySummary?: string;
  exportCandidateDerivationSummary?: string;
  exportCandidateRevisionSummary?: string;
  exportCandidateFreshnessSummary?: string;
  exportCandidateValidationSummary?: string;
  exportCandidateCompletenessSummary?: string;
  partitions: {
    runtime: HarnessMemoryBoundaryPartitionView;
    governanceHistoryCandidates: HarnessMemoryBoundaryPartitionView;
    packagedOutputCandidates: HarnessMemoryBoundaryPartitionView;
  };
  operationalItems: HarnessMemoryBoundaryItemView[];
  exportReadyItems: HarnessMemoryBoundaryItemView[];
  exportCandidates?: HarnessMemoryBoundaryExportCandidateView[];
};

export type HarnessActionRequestFieldView = {
  name: "decision" | "decisionNote" | "targetCardId" | "resolution" | "resumeSummary" | "completionSummary" | "mode";
  label: string;
  description?: string;
  required: boolean;
  allowedValues?: string[];
  requiredWhenValue?: string;
  supportedWhenValue?: string;
  suggestedValue?: string;
};

export type HarnessActionRequestExampleView = Partial<
  Record<HarnessActionRequestFieldView["name"], string>
>;

export type HarnessExportCandidateActionRoute =
  | "export-preflight"
  | "export-dry-run"
  | "governance-history-export"
  | "governance-history-export-replay"
  | "package-bundle-export"
  | "package-bundle-export-replay";

export type HarnessActionOptionView = {
  value: string;
  label: string;
  description: string;
  emphasis?: "primary" | "secondary" | "caution";
  nextEffectSummary?: string;
  requiresConfirmation?: boolean;
  confirmationLabel?: string;
  exampleRequest?: HarnessActionRequestExampleView;
};

export type HarnessExportCandidateActionView = {
  actionRoute: HarnessExportCandidateActionRoute;
  actionPath: string;
  actionMethod: "POST";
  actionHandle: string;
  actionLabel: string;
  actionDescription: string;
  nextEffectSummary?: string;
};

export type HarnessPendingAttentionView = {
  kind: Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>["kind"];
  runState: HarnessRunRecord["state"];
  statusLabel: string;
  summary: string;
  actionRoute?: "review-attention" | "resolve-attention" | "pending-approvals";
  actionPath?: string;
  actionMethod?: "POST";
  actionHandle?: string;
  actionLabel?: string;
  actionDescription?: string;
  requestFields?: HarnessActionRequestFieldView[];
  actionOptions?: HarnessActionOptionView[];
  recommendedOptionValue?: string;
  allowedDecisions?: HarnessAttentionReviewDecision[];
  allowedResolutions?: HarnessAttentionResolutionCommand[];
  pendingApprovalCount?: number;
  proposedApprovalCount?: number;
  deferredApprovalCount?: number;
  backlogMode?: "new_work_waiting" | "carry_forward_review" | "mixed_backlog";
  requestedAtLabel?: string;
  reasonLabel?: string;
  targetProposalId?: string;
  targetStatusLabel?: string;
  targetCardId?: string;
  targetPersona?: string;
  targetTitle?: string;
  targetSummary?: string;
};

export type HarnessFollowThroughView = {
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
  nextReviewTrigger?: string;
};

export type HarnessPendingApprovalView = {
  id: string;
  title: string;
  requestedByPersona: string;
  targetPersona: string;
  deliverableLabel: string;
  statusLabel: string;
  actionRoute: "proposal-decision";
  actionPath: string;
  actionMethod: "POST";
  actionHandle: string;
  actionLabel: string;
  actionDescription: string;
  requestFields: HarnessActionRequestFieldView[];
  actionOptions: HarnessActionOptionView[];
  recommendedOptionValue?: "approve" | "defer" | "deny";
  allowedDecisions: Array<"approve" | "defer" | "deny">;
  policyReasonLabel?: string;
  nextReviewTrigger?: string;
  lastDecisionAtLabel?: string;
  handoffTargetCardId?: string;
  handoffTargetPersona?: string;
  handoffTargetTitle?: string;
  targetSummary?: string;
};

export type HarnessCompletionPackageView = HarnessCompletionPackageSnapshot;

export type HarnessFreshCycleMode = "reopen_deferred" | "clean";
export type HarnessAttentionReviewDecision =
  | "complete_run"
  | "start_fresh_cycle"
  | "start_next_lane"
  | "request_changes"
  | "defer"
  | "move_to_assembly";
export type HarnessAttentionResolutionCommand = "resume_lane" | "unblock_lane";
export type HarnessResolvedAttentionDispatch = {
  tenantId: string;
  userId: string;
  runId: string;
  workflowId: string;
  cardId: string;
  actionToken: string;
  command: HarnessAttentionResolutionCommand;
  state: "working" | "approved";
};
export type HarnessFreshCycleDispatch = {
  tenantId: string;
  userId: string;
  runId: string;
  workflowId: string;
  actionToken: string;
  mode: HarnessFreshCycleMode;
  reopenedProposalCount: number;
};
export type HarnessReviewedNextLaneDispatch = {
  tenantId: string;
  userId: string;
  runId: string;
  workflowId: string;
  cardId: string;
  actionToken: string;
  decision: "start_next_lane" | "request_changes";
  state: "working";
};
export type HarnessTenantGoalResponse = {
  runId: string;
  workflowId: string;
  decision: "reused_lane" | "opened_lane" | "deferred" | "denied" | "fresh_cycle_started";
  message: string;
  cardId?: string;
  proposalId?: string;
  reopenedProposalCount?: number;
};
export type HarnessGovernanceHistoryExportReadyDispatch = {
  tenantId: string;
  userId: string;
  runId: string;
  workflowId: string;
  packageId: string;
  candidateId: "governance_history_export";
  bundleId: string;
  bundleRevision: string;
  exportFormat: "obsidian_markdown_bundle";
  recordTarget: "governance_history_record";
  idempotencyKey: string;
  noteTitle: string;
  noteFileName: string;
  placement: HarnessExportPlacementManifest;
  files: HarnessExportPackageFile[];
  recordCount: number;
  disclosureSummary: string;
  redactionSummary: string;
};

export type HarnessPackageBundleExportReadyDispatch = {
  tenantId: string;
  userId: string;
  runId: string;
  workflowId: string;
  packageId: string;
  candidateId: "package_bundle_export";
  bundleId: string;
  bundleRevision: string;
  exportFormat: "obsidian_markdown_bundle";
  recordTarget: "package_deliverable_record";
  idempotencyKey: string;
  noteTitle: string;
  noteFileName: string;
  placement: HarnessExportPlacementManifest;
  files: HarnessExportPackageFile[];
  recordCount: number;
  disclosureSummary: string;
  redactionSummary: string;
};

export type HarnessExportCandidateId = HarnessMemoryBoundaryExportCandidateView["id"];

export type HarnessExportCandidateDeliveryStatus =
  | "export_ready"
  | "delivery_in_progress"
  | "delivered"
  | "delivery_failed";

export type HarnessExportCandidateDeliveryView = {
  status: HarnessExportCandidateDeliveryStatus;
  statusLabel: string;
  summary: string;
  attemptCount: number;
  claimRecoverySupported?: boolean;
  contractFreshness: "current_bundle" | "stale_bundle";
  contractFreshnessLabel: string;
  contractFreshnessSummary: string;
  lastAttemptedAtLabel?: string;
  deliveredAtLabel?: string;
  writerKindLabel?: string;
  primaryNotePath?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
};

export type HarnessExportPreflightResult = {
  candidateId: HarnessExportCandidateId;
  status: "ready" | "blocked";
  readiness: HarnessMemoryBoundaryReadiness;
  readinessLabel: string;
  summary: string;
  nextStepLabel: string;
  supportsDryRun: boolean;
  supportsExport: boolean;
  supportsReplay: boolean;
  latestDelivery?: HarnessExportCandidateDeliveryView;
  blockerLabel?: string;
};

export type HarnessExportPackageFile = {
  path: string;
  mediaType: "text/markdown" | "application/json";
  byteSize: number;
  checksum: string;
  content: string;
};

export type HarnessExportPlacementManifest = {
  targetSystem: "obsidian_vault";
  vaultFolder: string;
  primaryNotePath: string;
  syncStrategy: HarnessMemoryBoundarySyncStrategy;
  confirmationRequirement: HarnessMemoryBoundaryExportConfirmationRequirement;
};

export type HarnessExportDryRunResult = {
  candidateId: "governance_history_export" | "package_bundle_export";
  status: "ready";
  exportFormat: "obsidian_markdown_bundle";
  recordTarget: "governance_history_record" | "package_deliverable_record";
  bundleId: string;
  bundleRevision: string;
  noteTitle: string;
  noteFileName: string;
  content: string;
  placement: HarnessExportPlacementManifest;
  files: HarnessExportPackageFile[];
  recordCount: number;
  disclosureSummary: string;
  redactionSummary: string;
  governanceItemCount?: number;
  deferredGovernanceItemCount?: number;
  deniedGovernanceItemCount?: number;
  governanceExportDisposition?: "included_in_existing_candidates";
  governanceExportDispositionLabel?: string;
};

export type HarnessGovernanceHistoryExportResult = Omit<HarnessExportDryRunResult, "status"> & {
  candidateId: "governance_history_export";
  recordTarget: "governance_history_record";
  status: "export_ready";
  idempotencyKey: string;
  summary: string;
  latestDelivery: HarnessExportCandidateDeliveryView;
};

export type HarnessPackageBundleExportResult = Omit<HarnessExportDryRunResult, "status"> & {
  candidateId: "package_bundle_export";
  recordTarget: "package_deliverable_record";
  status: "export_ready";
  idempotencyKey: string;
  summary: string;
  latestDelivery: HarnessExportCandidateDeliveryView;
};

export type HarnessGovernanceHistoryDeliveryReplayResult = {
  candidateId: "governance_history_export";
  status: "delivery_replayed";
  idempotencyKey: string;
  summary: string;
  latestDelivery: HarnessExportCandidateDeliveryView;
};

export type HarnessPackageBundleDeliveryReplayResult = {
  candidateId: "package_bundle_export";
  status: "delivery_replayed";
  idempotencyKey: string;
  summary: string;
  latestDelivery: HarnessExportCandidateDeliveryView;
};

export type HarnessRecentDecisionView = {
  id: string;
  decisionKind: string;
  label: string;
  resolution?: string;
  policyReasonLabel?: string;
  recommendationSummary?: string;
  objectionSummary?: string;
  timestampLabel: string;
};

type HarnessWorkflowRegistry = {
  listBoardExposedWorkflowIds(): string[];
  getDefinition(publicWorkflowId: string): WealthFactoryWorkflowDefinition;
  resolveBoardWorkflowDefinition?(publicWorkflowId?: string): WealthFactoryWorkflowDefinition;
};

const MAX_OPEN_CHILD_CARDS = 6;

export class HarnessCardCreationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarnessCardCreationConflictError";
  }
}

export class HarnessCardProgressionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarnessCardProgressionConflictError";
  }
}

export class HarnessRunCompletionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarnessRunCompletionConflictError";
  }
}

export class HarnessWorkflowSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarnessWorkflowSelectionError";
  }
}

export class HarnessRunCycleConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarnessRunCycleConflictError";
  }
}

export class HarnessActionContractConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarnessActionContractConflictError";
  }
}

type HarnessAudit = (event: DurableAuditEvent) => Promise<void>;

export function createHarnessBoardService(options: {
  authenticate(input: { authorization: string; cookie?: string }): Promise<ApiSession | null>;
  requireTenantMember(input: { tenantId: string; userId: string }): Promise<void>;
  requireActivePackageInstall(input: { tenantId: string; packageId: string }): Promise<void>;
  repository: HarnessRepository;
  workflowRegistry: HarnessWorkflowRegistry;
  resolveWorkflowRegistry?(input: { tenantId: string; userId: string }): Promise<HarnessWorkflowRegistry>;
  runAtomically?<T>(work: (repository: HarnessRepository) => Promise<T>): Promise<T>;
  audit?: HarnessAudit;
  ceoGoalExecutor?: HarnessCeoGoalExecutor;
  onResolvedAttentionDispatch?: (dispatch: HarnessResolvedAttentionDispatch) => Promise<void> | void;
  onFreshCycleDispatch?: (dispatch: HarnessFreshCycleDispatch) => Promise<void> | void;
  onReviewedNextLaneDispatch?: (dispatch: HarnessReviewedNextLaneDispatch) => Promise<void> | void;
  onGovernanceHistoryExportReady?: (dispatch: HarnessGovernanceHistoryExportReadyDispatch) => Promise<void> | void;
  onPackageBundleExportReady?: (dispatch: HarnessPackageBundleExportReadyDispatch) => Promise<void> | void;
}) {
  const runtime = createHarnessRuntime();

  return {
    async listBoardState(request: { authorization: string; cookie?: string; workflowId?: string }): Promise<HarnessBoardResponse> {
      const access = await authorizeHarnessRequest({
        authenticate: options.authenticate,
        requireTenantMember: options.requireTenantMember,
        requireActivePackageInstall: options.requireActivePackageInstall,
        workflowRegistry: options.workflowRegistry,
        ...(options.resolveWorkflowRegistry ? { resolveWorkflowRegistry: options.resolveWorkflowRegistry } : {}),
        authorization: request.authorization,
        ...(request.workflowId ? { requestedWorkflowId: request.workflowId } : {}),
        ...(request.cookie ? { cookie: request.cookie } : {})
      });
      const run = await getOrCreateCurrentRun({
        repository: options.repository,
        runtime,
        tenantId: access.session.tenantId,
        workflowDefinition: access.workflowDefinition,
        ...(options.runAtomically ? { runAtomically: options.runAtomically } : {})
      });

      const [cards, continuity, events, decisions, exportDeliveries, completionPackageSnapshot, governanceHistorySnapshot] = await Promise.all([
        options.repository.listCardsForRun(run.id),
        options.repository.listCardContinuityForRun(run.id),
        options.repository.listEventsForRun(run.id),
        options.repository.listDecisionsForRun(run.id),
        options.repository.listExportDeliveriesForRun(run.id),
        options.repository.getCompletionPackageSnapshot(run.id),
        options.repository.getGovernanceHistorySnapshot(run.id)
      ]);
      const proposals = await options.repository.listProposalsForRun(run.id);

      return buildHarnessBoardResponse({
        run,
        cards,
        continuity,
        events,
        decisions,
        proposals,
        exportDeliveries,
        ...(completionPackageSnapshot ? { completionPackageSnapshot } : {}),
        ...(governanceHistorySnapshot ? { governanceHistorySnapshot } : {})
      });
    },

    async submitTenantGoal(request: {
      authorization: string;
      cookie?: string;
      workflowId?: string;
      goal: string;
    }): Promise<HarnessTenantGoalResponse> {
      const access = await authorizeHarnessRequest({
        authenticate: options.authenticate,
        requireTenantMember: options.requireTenantMember,
        requireActivePackageInstall: options.requireActivePackageInstall,
        workflowRegistry: options.workflowRegistry,
        ...(options.resolveWorkflowRegistry ? { resolveWorkflowRegistry: options.resolveWorkflowRegistry } : {}),
        authorization: request.authorization,
        ...(request.workflowId ? { requestedWorkflowId: request.workflowId } : {}),
        ...(request.cookie ? { cookie: request.cookie } : {})
      });

      if (!options.ceoGoalExecutor) {
        throw new Error("Harness CEO goal executor is not configured");
      }
      if (!options.runAtomically) {
        throw new Error("Harness CEO goal mutations require atomic execution");
      }

      const initialBoard = await this.listBoardState({
        authorization: request.authorization,
        ...(request.cookie ? { cookie: request.cookie } : {}),
        ...(request.workflowId ? { workflowId: request.workflowId } : {})
      });
      const initialRun = await options.repository.getRun(initialBoard.runId);
      if (!initialRun || initialRun.tenantId !== access.session.tenantId) {
        throw new ApiAuthError();
      }

      const plan = await options.ceoGoalExecutor.execute({
        tenantId: access.session.tenantId,
        userId: access.session.userId,
        runId: initialBoard.runId,
        workflowId: access.workflowDefinition.publicId,
        workflowDefinition: access.workflowDefinition,
        goal: request.goal,
        board: toHarnessCeoLoopBoardSnapshot(initialBoard, initialRun.state)
      });

      if (plan.action === "start_fresh_cycle") {
        const reviewed = await this.reviewPendingAttention({
          authorization: request.authorization,
          ...(request.cookie ? { cookie: request.cookie } : {}),
          runId: initialBoard.runId,
          decision: "start_fresh_cycle",
          ...(initialBoard.pendingAttention?.actionHandle
            ? { actionToken: initialBoard.pendingAttention.actionHandle }
            : {}),
          mode: plan.freshCycleMode ?? "clean"
        });
        return {
          runId: reviewed.runId,
          workflowId: access.workflowDefinition.publicId,
          decision: "fresh_cycle_started",
          message: selectTenantGoalResponseMessage({
            plan,
            actualDecision: "fresh_cycle_started"
          }),
          ...(reviewed.status === "fresh_cycle_started"
            ? { reopenedProposalCount: reviewed.reopenedProposalCount }
            : {})
        };
      }

      const normalizedPersona = normalizeHarnessPersona(plan.persona ?? "");
      const normalizedDeliverableType = normalizeHarnessDeliverableType(plan.deliverableType ?? "");
      const normalizedTitle = plan.title?.trim() ?? "";
      if (
        !isHarnessChildPersona(normalizedPersona) ||
        !isHarnessDeliverableType(normalizedDeliverableType) ||
        !normalizedTitle ||
        !access.workflowDefinition.allowedDeliverableTypes.includes(normalizedDeliverableType)
      ) {
        throw new HarnessCardCreationConflictError("Harness child-card request is outside the approved workflow boundary");
      }

      const proposalId = await options.runAtomically(async (repository) => {
        const run = await getOrCreateCurrentRun({
          repository,
          runtime,
          tenantId: access.session.tenantId,
          workflowDefinition: access.workflowDefinition
        });
        if (run.tenantId !== access.session.tenantId) {
          throw new ApiAuthError();
        }
        const cards = await repository.listCardsForRun(run.id);
        const ceoCard = cards.find((card) => card.persona === "ceo" && card.parentCardId === null);
        if (!ceoCard) {
          throw new Error("Harness CEO card missing for tenant goal submission");
        }
        const proposal = runtime.proposeSubCard(ceoCard.id, {
          persona: normalizedPersona,
          title: normalizedTitle,
          deliverableType: normalizedDeliverableType
        });
        await repository.insertProposal(proposal);
        return proposal.id;
      });

      const decisionResult = await this.decideProposal({
        authorization: request.authorization,
        ...(request.cookie ? { cookie: request.cookie } : {}),
        proposalId,
        decision: plan.action === "deny" ? "deny" : plan.action === "defer" ? "defer" : "approve",
        ...(plan.decisionNote ? { decisionNote: plan.decisionNote } : {})
      });
      const proposal = await options.repository.getProposal(proposalId);
      const currentRun = await options.repository.getRun(initialBoard.runId);
      if (!proposal || !currentRun) {
        throw new Error("Harness CEO goal mutation did not persist correctly");
      }
      const decisions = await options.repository.listDecisionsForRun(currentRun.id);
      const latestDecision = decisions.find((decision) => decision.proposalId === proposalId) ?? null;
      const actualDecision = classifyTenantGoalDecision({
        status: decisionResult.status,
        latestDecision,
        requestedAction: plan.action
      });

      return {
        runId: currentRun.id,
        workflowId: access.workflowDefinition.publicId,
        decision: actualDecision,
        message: selectTenantGoalResponseMessage({
          plan,
          actualDecision,
          deliverableType: proposal.deliverableType
        }),
        ...(decisionResult.cardId ? { cardId: decisionResult.cardId } : {}),
        ...(!decisionResult.cardId ? { proposalId } : {})
      };
    },

    async createTopLevelChildCard(request: {
      authorization: string;
      cookie?: string;
      workflowId?: string;
      persona: string;
      title: string;
      deliverableType: string;
    }): Promise<{ cardId: string } | { status: "deferred"; proposalId: string }> {
      const access = await authorizeHarnessRequest({
        authenticate: options.authenticate,
        requireTenantMember: options.requireTenantMember,
        requireActivePackageInstall: options.requireActivePackageInstall,
        workflowRegistry: options.workflowRegistry,
        ...(options.resolveWorkflowRegistry ? { resolveWorkflowRegistry: options.resolveWorkflowRegistry } : {}),
        authorization: request.authorization,
        ...(request.workflowId ? { requestedWorkflowId: request.workflowId } : {}),
        ...(request.cookie ? { cookie: request.cookie } : {})
      });

      if (!options.runAtomically) {
        throw new Error("Harness card creation mutations require atomic execution");
      }

      const normalizedPersona = normalizeHarnessPersona(request.persona);
      const normalizedDeliverableType = normalizeHarnessDeliverableType(request.deliverableType);
      if (!isHarnessChildPersona(normalizedPersona) || !isHarnessDeliverableType(normalizedDeliverableType)) {
        throw new HarnessCardCreationConflictError("Harness child-card request is outside the approved workflow boundary");
      }
      if (!access.workflowDefinition.allowedDeliverableTypes.includes(normalizedDeliverableType)) {
        throw new HarnessCardCreationConflictError("Harness child-card request is outside the approved workflow boundary");
      }

      const result: { cardId: string; auditEvents?: Awaited<ReturnType<typeof createHarnessAuditEvent>>[] } | {
        status: "deferred";
        proposalId: string;
        auditEvents?: Awaited<ReturnType<typeof createHarnessAuditEvent>>[];
      } = await options.runAtomically(async (repository) => {
        const run = await getOrCreateCurrentRun({
          repository,
          runtime,
          tenantId: access.session.tenantId,
          workflowDefinition: access.workflowDefinition
        });
        if (run.tenantId !== access.session.tenantId) {
          throw new ApiAuthError();
        }
        if (run.state === "failed" || run.state === "cancelled") {
          throw new HarnessCardCreationConflictError("Harness direct child-card creation is closed for terminal runs");
        }

        const [cards, proposals, continuity] = await Promise.all([
          repository.listCardsForRun(run.id),
          repository.listProposalsForRun(run.id),
          repository.listCardContinuityForRun(run.id)
        ]);
        runtime.resumeRun({ run, cards, proposals, continuity });
        const ceoCard = cards.find((card) => card.persona === "ceo" && card.parentCardId === null);
        const latestUnresolvedTopLevelRequest = ceoCard
          ? findLatestUnresolvedTopLevelProposalForAssignment(proposals, {
              ceoCardId: ceoCard.id,
              persona: normalizedPersona,
              title: request.title,
              deliverableType: normalizedDeliverableType
            })
          : null;
        const earlierUnresolvedDirectRequest =
          latestUnresolvedTopLevelRequest?.requestedByPersona === "ceo" ? latestUnresolvedTopLevelRequest : null;
        const carriedForwardReviewRequest =
          latestUnresolvedTopLevelRequest && latestUnresolvedTopLevelRequest.requestedByPersona !== "ceo"
            ? latestUnresolvedTopLevelRequest
            : null;

        async function approveEarlierDirectRequestIntoExistingLane(input: {
          proposal: HarnessSubCardProposal;
          card: HarnessCardRecord;
          resolution: "update_existing_lane";
          reopenedCompletedLane?: boolean;
          reuseMessage: string;
          parentMessage: string;
        }): Promise<{
          cardId: string;
          auditEvents: Awaited<ReturnType<typeof createHarnessAuditEvent>>[];
        }> {
          const approvalUpdate = await repository.markProposalApproved({
            proposalId: input.proposal.id,
            approvedCardId: input.card.id,
            resolution: input.resolution
          });
          if (!approvalUpdate.updated) {
            throw new Error("Harness direct child-card approval conflicted");
          }
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: input.card.id,
              eventKind: "proposal_absorbed",
              payload: {
                proposalId: input.proposal.id,
                parentCardId: input.proposal.parentCardId,
                requestedByPersona: input.proposal.requestedByPersona,
                requestedTitle: input.proposal.title,
                deliverableType: input.proposal.deliverableType,
                resolution: input.resolution
              }
            })
          );
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: input.card.id,
              eventKind: "comment_added",
              payload: {
                message: input.reuseMessage
              }
            })
          );
          if (input.proposal.parentCardId !== input.card.id) {
            await repository.insertEvent(
              createHarnessCardEventRecord({
                cardId: input.proposal.parentCardId,
                eventKind: "comment_added",
                payload: {
                  message: input.parentMessage
                }
              })
            );
          }
          await recordAbsorbedLaneContinuity({
            repository,
            card: input.card,
            proposal: input.proposal,
            resolution: input.resolution
          });
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: "proposal_approved",
              cardId: input.proposal.parentCardId,
              proposalId: input.proposal.id,
              targetCardId: input.card.id,
              persona: input.proposal.persona,
              deliverableType: input.proposal.deliverableType,
              policyReason: "reused_existing_lane",
              resolution: input.resolution,
              recommendationSummary: createLaneRecommendationSummary({
                persona: input.proposal.persona,
                deliverableType: input.proposal.deliverableType,
                policyReason: "reused_existing_lane"
              })
            })
          );

          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            cardId: input.card.id,
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_proposal_approved",
                entityId: input.proposal.id,
                metadata: {
                  runId: run.id,
                  approvedCardId: input.card.id,
                  resolution: input.resolution,
                  reopenedCompletedLane: Boolean(input.reopenedCompletedLane),
                  requestedByPersona: input.proposal.requestedByPersona,
                  targetPersona: input.proposal.persona,
                  deliverableType: input.proposal.deliverableType,
                  hasDecisionNote: false
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }

        async function approveEarlierDirectRequestIntoNewLane(input: {
          proposal: HarnessSubCardProposal;
          card: HarnessCardRecord;
        }): Promise<{
          cardId: string;
          auditEvents: Awaited<ReturnType<typeof createHarnessAuditEvent>>[];
        }> {
          const approvalUpdate = await repository.markProposalApproved({
            proposalId: input.proposal.id,
            approvedCardId: input.card.id,
            resolution: "create_lane"
          });
          if (!approvalUpdate.updated) {
            throw new Error("Harness direct child-card approval conflicted");
          }

          await repository.insertCard(input.card);
          for (const event of createBootstrapEvents(input.card)) {
            await repository.insertEvent(event);
          }
          await recordCardStateContinuity({
            repository,
            card: input.card
          });
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: input.proposal.parentCardId,
              eventKind: "result_recorded",
              payload: {
                title: input.proposal.title,
                targetPersona: input.proposal.persona,
                approvedCardId: input.card.id
              }
            })
          );
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: "proposal_approved",
              cardId: input.proposal.parentCardId,
              proposalId: input.proposal.id,
              targetCardId: input.card.id,
              persona: input.proposal.persona,
              deliverableType: input.proposal.deliverableType,
              policyReason: "created_new_lane",
              resolution: "create_lane",
              recommendationSummary: createLaneRecommendationSummary({
                persona: input.proposal.persona,
                deliverableType: input.proposal.deliverableType,
                policyReason: "created_new_lane"
              })
            })
          );

          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            cardId: input.card.id,
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_proposal_approved",
                entityId: input.proposal.id,
                metadata: {
                  runId: run.id,
                  approvedCardId: input.card.id,
                  resolution: "create_lane",
                  requestedByPersona: input.proposal.requestedByPersona,
                  targetPersona: input.proposal.persona,
                  deliverableType: input.proposal.deliverableType,
                  hasDecisionNote: false
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }

        async function deferDirectChildRequest(input: {
          policyReason: "persona_lane_cap" | "deliverable_owner_conflict" | "lane_cap" | "completed_lanes_only";
          decisionNote: string;
        }): Promise<{
          status: "deferred";
          proposalId: string;
          auditEvents: Awaited<ReturnType<typeof createHarnessAuditEvent>>[];
        }> {
          if (!ceoCard) {
            throw new Error("Harness CEO card missing for direct child-card defer");
          }

          if (earlierUnresolvedDirectRequest) {
            return {
              status: "deferred",
              proposalId: earlierUnresolvedDirectRequest.id,
              auditEvents: []
            };
          }

          const proposal = runtime.proposeSubCard(ceoCard.id, {
            persona: normalizedPersona,
            title: request.title,
            deliverableType: normalizedDeliverableType
          });
          await repository.insertProposal(proposal);
          const decisionUpdate = await repository.markProposalStatus({
            proposalId: proposal.id,
            status: "deferred",
            decisionNote: input.decisionNote
          });
          if (!decisionUpdate.updated) {
            throw new Error("Harness direct child-card defer conflicted");
          }
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: proposal.parentCardId,
              eventKind: "comment_added",
              payload: {
                message: createPublicProposalDecisionMessage({
                  status: "deferred",
                  deliverableType: proposal.deliverableType,
                  policyReason: input.policyReason
                })
              }
            })
          );
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: "proposal_deferred",
              cardId: proposal.parentCardId,
              proposalId: proposal.id,
              persona: proposal.persona,
              deliverableType: proposal.deliverableType,
              policyReason: input.policyReason,
              decisionNote: input.decisionNote,
              recommendationSummary: createGovernanceRecommendationSummary({
                deliverableType: proposal.deliverableType,
                policyReason: input.policyReason,
                status: "deferred"
              }),
              objectionSummary: createGovernanceObjectionSummary({
                deliverableType: proposal.deliverableType,
                policyReason: input.policyReason
              })
            })
          );
          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            status: "deferred",
            proposalId: proposal.id,
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_proposal_decided",
                entityId: proposal.id,
                metadata: {
                  runId: run.id,
                  decision: "deferred",
                  reason: input.policyReason,
                  hasDecisionNote: true,
                  requestedByPersona: proposal.requestedByPersona,
                  targetPersona: proposal.persona,
                  deliverableType: proposal.deliverableType
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }

        if (run.state === "assembling" || run.state === "done") {
          return deferDirectChildRequest({
            policyReason: "completed_lanes_only",
            decisionNote: "CEO deferred this proposal because the board is already packaging completed work for this run."
          });
        }

        if (carriedForwardReviewRequest) {
          return {
            status: "deferred",
            proposalId: carriedForwardReviewRequest.id
          };
        }

        const existingCard = findMatchingOpenChildCard(cards, {
          persona: normalizedPersona,
          title: request.title,
          deliverableType: normalizedDeliverableType
        });
        if (existingCard) {
          if (earlierUnresolvedDirectRequest) {
            return approveEarlierDirectRequestIntoExistingLane({
              proposal: earlierUnresolvedDirectRequest,
              card: existingCard,
              resolution: "update_existing_lane",
              reuseMessage: `CEO resolved the earlier ${humanizeDeliverableType(
                normalizedDeliverableType
              ).toLowerCase()} request by folding it into this active ${normalizedPersona.toUpperCase()} lane.`,
              parentMessage: `CEO approved the earlier ${humanizeDeliverableType(
                normalizedDeliverableType
              ).toLowerCase()} request by folding it into the active ${normalizedPersona.toUpperCase()} lane.`
            });
          }
          return { cardId: existingCard.id };
        }
        const existingPersonaLane = findOpenChildCardByPersonaDeliverable(cards, {
          persona: normalizedPersona,
          deliverableType: normalizedDeliverableType
        });
        if (
          existingPersonaLane &&
          isBoundedCardRefinement({
            title: request.title,
            candidateCard: existingPersonaLane
          })
        ) {
          if (earlierUnresolvedDirectRequest) {
            return approveEarlierDirectRequestIntoExistingLane({
              proposal: earlierUnresolvedDirectRequest,
              card: existingPersonaLane,
              resolution: "update_existing_lane",
              reuseMessage: `CEO resolved the earlier ${humanizeDeliverableType(
                normalizedDeliverableType
              ).toLowerCase()} request by adding it to the existing ${normalizedPersona.toUpperCase()} lane.`,
              parentMessage: `CEO approved the earlier ${humanizeDeliverableType(
                normalizedDeliverableType
              ).toLowerCase()} request and attached it to the existing ${normalizedPersona.toUpperCase()} lane.`
            });
          }
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: existingPersonaLane.id,
              eventKind: "comment_added",
              payload: {
                message: `CEO folded this follow-on ${humanizeDeliverableType(
                  normalizedDeliverableType
                ).toLowerCase()} request into the existing ${normalizedPersona.toUpperCase()} lane.`
              }
            })
          );
          await recordDirectChildLaneReuseContinuity({
            repository,
            card: existingPersonaLane,
            title: request.title
          });
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: "lane_opened",
              cardId: existingPersonaLane.id,
              targetCardId: existingPersonaLane.id,
              persona: existingPersonaLane.persona,
              deliverableType: existingPersonaLane.deliverableType,
              policyReason: "reused_existing_lane",
              resolution: "update_existing_lane",
              recommendationSummary: createLaneRecommendationSummary({
                persona: existingPersonaLane.persona,
                deliverableType: existingPersonaLane.deliverableType,
                policyReason: "reused_existing_lane"
              })
            })
          );

          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            cardId: existingPersonaLane.id,
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_card_reused",
                entityId: existingPersonaLane.id,
                metadata: {
                  runId: run.id,
                  parentCardId: existingPersonaLane.parentCardId,
                  persona: existingPersonaLane.persona,
                  deliverableType: existingPersonaLane.deliverableType
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }
        const latestDoneLane = findLatestDoneChildCardByPersonaDeliverable(cards, {
          persona: normalizedPersona,
          deliverableType: normalizedDeliverableType
        });
        if (
          latestDoneLane &&
          !findOpenChildCardByDeliverableType(cards, normalizedDeliverableType) &&
          isBoundedCardRefinement({
            title: request.title,
            candidateCard: latestDoneLane
          })
        ) {
          const reopenedCard = await repository.transitionCardState({
            cardId: latestDoneLane.id,
            expectedState: "done",
            state: "approved"
          });
          if (!reopenedCard) {
            throw new HarnessCardCreationConflictError("Harness completed lane reopen conflicted");
          }
          if (earlierUnresolvedDirectRequest) {
            await repository.insertEvent(
              createHarnessCardEventRecord({
                cardId: reopenedCard.id,
                eventKind: "state_changed",
                payload: { from: "done", to: "approved" }
              })
            );
            await repository.insertEvent(
              createHarnessCardEventRecord({
                cardId: reopenedCard.id,
                eventKind: "comment_added",
                payload: {
                  message: `CEO reopened this completed ${humanizeDeliverableType(
                    normalizedDeliverableType
                  ).toLowerCase()} lane and resolved the earlier bounded follow-on request into it.`
                }
              })
            );
            await recordCardStateContinuity({
              repository,
              card: reopenedCard
            });
            return approveEarlierDirectRequestIntoExistingLane({
              proposal: earlierUnresolvedDirectRequest,
              card: reopenedCard,
              resolution: "update_existing_lane",
              reopenedCompletedLane: true,
              reuseMessage: `CEO resolved the earlier ${humanizeDeliverableType(
                normalizedDeliverableType
              ).toLowerCase()} request by reopening this completed ${normalizedPersona.toUpperCase()} lane.`,
              parentMessage: `CEO approved the earlier ${humanizeDeliverableType(
                normalizedDeliverableType
              ).toLowerCase()} request by reopening the existing ${normalizedPersona.toUpperCase()} lane.`
            });
          }
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: reopenedCard.id,
              eventKind: "state_changed",
              payload: { from: "done", to: "approved" }
            })
          );
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: reopenedCard.id,
              eventKind: "comment_added",
              payload: {
                message: `CEO reopened this completed ${humanizeDeliverableType(
                  normalizedDeliverableType
                ).toLowerCase()} lane for a bounded refinement.`
              }
            })
          );
          await recordCardStateContinuity({
            repository,
            card: reopenedCard
          });
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: "lane_opened",
              cardId: reopenedCard.id,
              targetCardId: reopenedCard.id,
              persona: reopenedCard.persona,
              deliverableType: reopenedCard.deliverableType,
              policyReason: "reused_existing_lane",
              resolution: "update_existing_lane",
              recommendationSummary: createLaneRecommendationSummary({
                persona: reopenedCard.persona,
                deliverableType: reopenedCard.deliverableType,
                policyReason: "reused_existing_lane"
              })
            })
          );

          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            cardId: reopenedCard.id,
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_card_reopened",
                entityId: reopenedCard.id,
                metadata: {
                  runId: run.id,
                  parentCardId: reopenedCard.parentCardId,
                  persona: reopenedCard.persona,
                  deliverableType: reopenedCard.deliverableType
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }
        const conflictingDeliverableOwner = findOpenChildCardByDeliverableType(cards, normalizedDeliverableType);
        if (conflictingDeliverableOwner && conflictingDeliverableOwner.persona !== normalizedPersona) {
          return deferDirectChildRequest({
            policyReason: "deliverable_owner_conflict",
            decisionNote: "CEO deferred this proposal because another active persona already owns that deliverable lane."
          });
        }
        if (findOpenChildCardByPersona(cards, normalizedPersona)) {
          return deferDirectChildRequest({
            policyReason: "persona_lane_cap",
            decisionNote: `CEO deferred this proposal because ${normalizedPersona.toUpperCase()} already has another active lane.`
          });
        }
        if (countOpenChildCards(cards) >= MAX_OPEN_CHILD_CARDS) {
          return deferDirectChildRequest({
            policyReason: "lane_cap",
            decisionNote: "CEO deferred this proposal because the current run is at its active lane cap."
          });
        }
        const card = runtime.createApprovedChildCard(run.id, {
          persona: normalizedPersona,
          title: request.title,
          deliverableType: normalizedDeliverableType
        });
        if (earlierUnresolvedDirectRequest) {
          return approveEarlierDirectRequestIntoNewLane({
            proposal: earlierUnresolvedDirectRequest,
            card
          });
        }

        await repository.insertCard(card);
        for (const event of createBootstrapEvents(card)) {
          await repository.insertEvent(event);
        }
        await recordCardStateContinuity({
          repository,
          card
        });
        await repository.insertDecision(
          createHarnessBoardDecisionRecord({
            runId: run.id,
            tenantId: access.session.tenantId,
            actorUserId: access.session.userId,
            decisionKind: "lane_opened",
            cardId: card.id,
            targetCardId: card.id,
            persona: card.persona,
            deliverableType: card.deliverableType,
            policyReason: "created_new_lane",
            resolution: "create_lane",
            recommendationSummary: createLaneRecommendationSummary({
              persona: card.persona,
              deliverableType: card.deliverableType,
              policyReason: "created_new_lane"
            })
          })
        );

        const reconciledRun = await reconcileHarnessRunState({ repository, run });

        return {
          cardId: card.id,
          auditEvents: [
            createHarnessAuditEvent({
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              eventType: "harness_card_created",
              entityId: card.id,
              metadata: {
                runId: run.id,
                parentCardId: card.parentCardId,
                persona: card.persona,
                deliverableType: card.deliverableType
              }
            }),
            ...toRunAuditEvents({
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              runId: run.id,
              previousState: run.state,
              nextRun: reconciledRun
            })
          ]
        };
      });

      await publishHarnessAuditEvents(options.audit, result.auditEvents ?? []);
      if ("status" in result && result.status === "deferred") {
        return { status: "deferred", proposalId: result.proposalId };
      }
      return { cardId: (result as { cardId: string }).cardId };
    },

    async decideProposal(request: {
      authorization: string;
      cookie?: string;
      proposalId: string;
      decision: "approve" | "defer" | "deny";
      actionToken?: string;
      decisionNote?: string;
      targetCardId?: string;
    }): Promise<{ status: HarnessProposalStatus; cardId?: string }> {
      const access = await authorizeHarnessProposalRequest({
        authenticate: options.authenticate,
        requireTenantMember: options.requireTenantMember,
        requireActivePackageInstall: options.requireActivePackageInstall,
        repository: options.repository,
        workflowRegistry: options.workflowRegistry,
        ...(options.resolveWorkflowRegistry ? { resolveWorkflowRegistry: options.resolveWorkflowRegistry } : {}),
        authorization: request.authorization,
        ...(request.cookie ? { cookie: request.cookie } : {}),
        proposalId: request.proposalId
      });

      if (!options.runAtomically) {
        throw new Error("Harness approval mutations require atomic execution");
      }

      const runApproval = async (
        repository: HarnessRepository
      ): Promise<{ status: HarnessProposalStatus; cardId?: string; auditEvents?: DurableAuditEvent[] }> => {
        const proposal = await repository.getProposal(request.proposalId);
        if (!proposal) {
          throw new Error("Harness proposal was not found");
        }

        const run = await repository.getRun(proposal.runId);
        if (!run || run.tenantId !== access.session.tenantId) {
          throw new ApiAuthError();
        }
        if (proposal.status === "approved" || proposal.status === "denied") {
          return {
            status: proposal.status,
            ...(proposal.approvedCardId ? { cardId: proposal.approvedCardId } : {})
          };
        }
        if (
          !isHarnessChildPersona(normalizeHarnessPersona(proposal.persona)) ||
          !isHarnessDeliverableType(normalizeHarnessDeliverableType(proposal.deliverableType))
        ) {
          throw new HarnessCardCreationConflictError("Harness proposal is outside the approved workflow boundary");
        }
        if (!access.workflowDefinition.allowedDeliverableTypes.includes(normalizeHarnessDeliverableType(proposal.deliverableType))) {
          throw new HarnessCardCreationConflictError("Harness proposal is outside the approved workflow boundary");
        }

        const [cards, proposals, decisions, continuity] = await Promise.all([
          repository.listCardsForRun(run.id),
          repository.listProposalsForRun(run.id),
          repository.listDecisionsForRun(run.id),
          repository.listCardContinuityForRun(run.id)
        ]);
        const trimmedDecisionNote = request.decisionNote?.trim();
        const trimmedTargetCardId = request.targetCardId?.trim();
        const latestDecisionByProposalId = new Map<string, HarnessBoardDecisionRecord>();
        for (const decision of decisions) {
          if (decision.proposalId && !latestDecisionByProposalId.has(decision.proposalId)) {
            latestDecisionByProposalId.set(decision.proposalId, decision);
          }
        }
        const proposalPolicyReason = determineProposalPolicyReason({
          run,
          cards,
          proposal
        });
        const latestDecisionForProposal = latestDecisionByProposalId.get(proposal.id) ?? null;
        if (request.actionToken) {
          assertHarnessActionToken(
            createPendingApprovalActionToken({
              proposal,
              policyReason: proposalPolicyReason,
              ...(selectDeliverableOwnerConflictTarget({
                cards,
                proposal
              })?.id
                ? {
                    handoffTargetCardId: selectDeliverableOwnerConflictTarget({
                      cards,
                      proposal
                    })!.id
                  }
                : {}),
              ...(latestDecisionForProposal?.createdAt ? { latestDecisionCreatedAt: latestDecisionForProposal.createdAt } : {})
            }),
            request.actionToken
          );
        }
        if (proposal.status === "deferred" && request.decision === "defer") {
          const unchangedDecisionNote =
            !trimmedDecisionNote ||
            trimmedDecisionNote === proposal.decisionNote?.trim();
          const unchangedPolicyReason =
            latestDecisionForProposal?.policyReason === proposalPolicyReason;
          if (unchangedDecisionNote && unchangedPolicyReason) {
            return { status: "deferred" };
          }
        }

        if (request.decision === "defer" || request.decision === "deny") {
          const status: HarnessProposalStatus = request.decision === "defer" ? "deferred" : "denied";
          const defaultDecisionNote =
            status === "deferred"
              ? "CEO deferred this proposal to keep the current lane set bounded."
              : "CEO denied this proposal because it would widen the workflow beyond the current boundary.";
          const decisionNote = trimmedDecisionNote ?? defaultDecisionNote;
          const decisionUpdate = await repository.markProposalStatus({
            proposalId: proposal.id,
            status,
            decisionNote
          });
          if (!decisionUpdate.updated) {
            throw new Error("Harness proposal decision conflicted");
          }
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: proposal.parentCardId,
              eventKind: "comment_added",
              payload: {
                message: createPublicProposalDecisionMessage({
                  status,
                  deliverableType: proposal.deliverableType,
                  policyReason: proposalPolicyReason
                })
              }
            })
          );
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: status === "deferred" ? "proposal_deferred" : "proposal_denied",
              cardId: proposal.parentCardId,
              proposalId: proposal.id,
              persona: proposal.persona,
              deliverableType: proposal.deliverableType,
              policyReason: proposalPolicyReason,
              decisionNote,
              recommendationSummary: createGovernanceRecommendationSummary({
                deliverableType: proposal.deliverableType,
                policyReason: proposalPolicyReason,
                status
              }),
              objectionSummary: createGovernanceObjectionSummary({
                deliverableType: proposal.deliverableType,
                policyReason: proposalPolicyReason
              })
            })
          );
          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            status,
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_proposal_decided",
                entityId: proposal.id,
                metadata: {
                  runId: run.id,
                  decision: status,
                  reason: proposalPolicyReason,
                  hasDecisionNote: Boolean(trimmedDecisionNote),
                  requestedByPersona: proposal.requestedByPersona,
                  targetPersona: proposal.persona,
                  deliverableType: proposal.deliverableType
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }

        if (trimmedTargetCardId) {
          const targetCard = cards.find((card) => card.id === trimmedTargetCardId) ?? null;
          const canHandOff =
            targetCard &&
            targetCard.persona !== "ceo" &&
            isOpenCardState(targetCard.state) &&
            targetCard.deliverableType === proposal.deliverableType &&
            targetCard.persona !== proposal.persona &&
            proposalPolicyReason === "deliverable_owner_conflict";
          if (canHandOff) {
            const previousPersona = targetCard.persona;
            const previousTitle = targetCard.title;
            const reassignedCard = await repository.updateCardAssignment({
              cardId: targetCard.id,
              persona: proposal.persona,
              title: proposal.title
            });
            if (!reassignedCard) {
              throw new HarnessCardCreationConflictError("Harness lane handoff conflicted");
            }

            const approvalUpdate = await repository.markProposalApproved({
              proposalId: proposal.id,
              approvedCardId: reassignedCard.id,
              resolution: "handoff_existing_lane",
              ...(trimmedDecisionNote ? { decisionNote: trimmedDecisionNote } : {})
            });
            if (!approvalUpdate.updated) {
              throw new Error("Harness proposal approval conflicted");
            }

            await repository.insertEvent(
              createHarnessCardEventRecord({
                cardId: reassignedCard.id,
                eventKind: "lane_handed_off",
                payload: {
                  proposalId: proposal.id,
                  parentCardId: proposal.parentCardId,
                  fromPersona: previousPersona,
                  toPersona: proposal.persona,
                  previousTitle,
                  nextTitle: proposal.title,
                  deliverableType: proposal.deliverableType
                }
              })
            );
            await repository.insertEvent(
              createHarnessCardEventRecord({
                cardId: reassignedCard.id,
                eventKind: "proposal_absorbed",
                payload: {
                  proposalId: proposal.id,
                  parentCardId: proposal.parentCardId,
                  requestedByPersona: proposal.requestedByPersona,
                  requestedTitle: proposal.title,
                  deliverableType: proposal.deliverableType,
                  resolution: "handoff_existing_lane"
                }
              })
            );
            await repository.insertEvent(
              createHarnessCardEventRecord({
                cardId: reassignedCard.id,
                eventKind: "comment_added",
                payload: {
                  message: `CEO handed this active ${humanizeDeliverableType(proposal.deliverableType).toLowerCase()} lane from ${previousPersona.toUpperCase()} to ${proposal.persona.toUpperCase()}.`
                }
              })
            );
            if (proposal.parentCardId !== reassignedCard.id) {
              await repository.insertEvent(
                createHarnessCardEventRecord({
                  cardId: proposal.parentCardId,
                  eventKind: "comment_added",
                  payload: {
                    message: `CEO approved this request by handing the active ${humanizeDeliverableType(
                      proposal.deliverableType
                    ).toLowerCase()} lane to ${proposal.persona.toUpperCase()}.`
                  }
                })
              );
            }
            await recordAbsorbedLaneContinuity({
              repository,
              card: reassignedCard,
              proposal,
              resolution: "handoff_existing_lane",
              continuitySourcePersona: previousPersona,
              continuitySourceTitle: previousTitle
            });
            await repository.insertDecision(
              createHarnessBoardDecisionRecord({
                runId: run.id,
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                decisionKind: "proposal_approved",
                cardId: proposal.parentCardId,
                proposalId: proposal.id,
                targetCardId: reassignedCard.id,
                persona: proposal.persona,
                deliverableType: proposal.deliverableType,
                policyReason: "deliverable_owner_conflict",
                resolution: "handoff_existing_lane",
                ...(trimmedDecisionNote ? { decisionNote: trimmedDecisionNote } : {}),
                recommendationSummary: createHandoffRecommendationSummary({
                  persona: proposal.persona,
                  deliverableType: proposal.deliverableType
                })
              })
            );
            const reconciledRun = await reconcileHarnessRunState({ repository, run });

            return {
              status: "approved",
              cardId: reassignedCard.id,
              auditEvents: [
                createHarnessAuditEvent({
                  tenantId: access.session.tenantId,
                  actorUserId: access.session.userId,
                  eventType: "harness_proposal_approved",
                  entityId: proposal.id,
                  metadata: {
                    runId: run.id,
                    approvedCardId: reassignedCard.id,
                    resolution: "handoff_existing_lane",
                    requestedByPersona: proposal.requestedByPersona,
                    targetPersona: proposal.persona,
                    previousPersona,
                    deliverableType: proposal.deliverableType,
                    hasDecisionNote: Boolean(trimmedDecisionNote)
                  }
                }),
                ...toRunAuditEvents({
                  tenantId: access.session.tenantId,
                  actorUserId: access.session.userId,
                  runId: run.id,
                  previousState: run.state,
                  nextRun: reconciledRun
                })
              ]
            };
          }
        }

        const exactExistingCard = findMatchingOpenChildCard(cards, {
          persona: proposal.persona,
          title: proposal.title,
          deliverableType: proposal.deliverableType
        });
        if (exactExistingCard) {
          const approvalUpdate = await repository.markProposalApproved({
            proposalId: proposal.id,
            approvedCardId: exactExistingCard.id,
            resolution: "update_existing_lane",
            ...(trimmedDecisionNote ? { decisionNote: trimmedDecisionNote } : {})
          });
          if (!approvalUpdate.updated) {
            throw new Error("Harness proposal approval conflicted");
          }
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: exactExistingCard.id,
              eventKind: "proposal_absorbed",
              payload: {
                proposalId: proposal.id,
                parentCardId: proposal.parentCardId,
                requestedByPersona: proposal.requestedByPersona,
                requestedTitle: proposal.title,
                deliverableType: proposal.deliverableType,
                resolution: "update_existing_lane"
              }
            })
          );
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: exactExistingCard.id,
              eventKind: "comment_added",
              payload: {
                message: `${proposal.requestedByPersona.toUpperCase()} folded this request into the existing ${humanizeDeliverableType(
                  proposal.deliverableType
                ).toLowerCase()} lane.`
              }
            })
          );
          if (proposal.parentCardId !== exactExistingCard.id) {
            await repository.insertEvent(
              createHarnessCardEventRecord({
                cardId: proposal.parentCardId,
                eventKind: "comment_added",
                payload: {
                  message: `${proposal.requestedByPersona.toUpperCase()} approved this request and folded it into the existing ${humanizeDeliverableType(
                    proposal.deliverableType
                  ).toLowerCase()} lane.`
                }
              })
            );
          }
          await recordAbsorbedLaneContinuity({
            repository,
            card: exactExistingCard,
            proposal,
            resolution: "update_existing_lane"
          });
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: "proposal_approved",
              cardId: proposal.parentCardId,
              proposalId: proposal.id,
              targetCardId: exactExistingCard.id,
              persona: proposal.persona,
              deliverableType: proposal.deliverableType,
              policyReason: "reused_existing_lane",
              resolution: "update_existing_lane",
              ...(trimmedDecisionNote ? { decisionNote: trimmedDecisionNote } : {}),
              recommendationSummary: createLaneRecommendationSummary({
                persona: proposal.persona,
                deliverableType: proposal.deliverableType,
                policyReason: "reused_existing_lane"
              })
            })
          );
          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            status: "approved",
            cardId: exactExistingCard.id,
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_proposal_approved",
                entityId: proposal.id,
                metadata: {
                  runId: run.id,
                  approvedCardId: exactExistingCard.id,
                  resolution: "update_existing_lane",
                  requestedByPersona: proposal.requestedByPersona,
                  targetPersona: proposal.persona,
                  deliverableType: proposal.deliverableType,
                  hasDecisionNote: Boolean(trimmedDecisionNote)
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }

        const earlierUnresolvedSiblingProposal = findEarlierUnresolvedSiblingProposal(proposals, proposal);
        if (earlierUnresolvedSiblingProposal) {
          const siblingDecision = latestDecisionByProposalId.get(earlierUnresolvedSiblingProposal.id) ?? null;
          const repeatedRequestPolicyReason =
            earlierUnresolvedSiblingProposal.status === "deferred" &&
            (
              siblingDecision?.policyReason === "persona_lane_cap" ||
              siblingDecision?.policyReason === "deliverable_owner_conflict" ||
              siblingDecision?.policyReason === "lane_cap" ||
              siblingDecision?.policyReason === "completed_lanes_only"
            )
              ? siblingDecision.policyReason
              : "scope_guardrail";
          const repeatedRequestStatus: HarnessProposalStatus =
            repeatedRequestPolicyReason === "scope_guardrail" ? "denied" : "deferred";
          const repeatedRequestDecisionNote =
            trimmedDecisionNote ??
            createRepeatedRequestDecisionNote({
              status: repeatedRequestStatus,
              policyReason: repeatedRequestPolicyReason,
              deliverableType: proposal.deliverableType
            });
          const decisionUpdate = await repository.markProposalStatus({
            proposalId: proposal.id,
            status: repeatedRequestStatus,
            decisionNote: repeatedRequestDecisionNote
          });
          if (!decisionUpdate.updated) {
            throw new Error("Harness proposal decision conflicted");
          }
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: proposal.parentCardId,
              eventKind: "comment_added",
              payload: {
                message: createPublicProposalDecisionMessage({
                  status: repeatedRequestStatus,
                  deliverableType: proposal.deliverableType,
                  policyReason: repeatedRequestPolicyReason
                })
              }
            })
          );
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: repeatedRequestStatus === "deferred" ? "proposal_deferred" : "proposal_denied",
              cardId: proposal.parentCardId,
              proposalId: proposal.id,
              persona: proposal.persona,
              deliverableType: proposal.deliverableType,
              policyReason: repeatedRequestPolicyReason,
              decisionNote: repeatedRequestDecisionNote,
              recommendationSummary: createGovernanceRecommendationSummary({
                deliverableType: proposal.deliverableType,
                policyReason: repeatedRequestPolicyReason,
                status: repeatedRequestStatus
              }),
              objectionSummary: createGovernanceObjectionSummary({
                deliverableType: proposal.deliverableType,
                policyReason: repeatedRequestPolicyReason
              })
            })
          );
          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            status: repeatedRequestStatus,
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_proposal_decided",
                entityId: proposal.id,
                metadata: {
                  runId: run.id,
                  decision: repeatedRequestStatus,
                  reason: repeatedRequestPolicyReason,
                  hasDecisionNote: Boolean(trimmedDecisionNote),
                  requestedByPersona: proposal.requestedByPersona,
                  targetPersona: proposal.persona,
                  deliverableType: proposal.deliverableType
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }
        const existingPersonaLane = findOpenChildCardByPersonaDeliverable(cards, {
          persona: proposal.persona,
          deliverableType: proposal.deliverableType
        });
        if (
          existingPersonaLane &&
          isBoundedLaneRefinement({
            proposal,
            candidateCard: existingPersonaLane
          })
        ) {
          const approvalUpdate = await repository.markProposalApproved({
            proposalId: proposal.id,
            approvedCardId: existingPersonaLane.id,
            resolution: "update_existing_lane",
            ...(trimmedDecisionNote ? { decisionNote: trimmedDecisionNote } : {})
          });
          if (!approvalUpdate.updated) {
            throw new Error("Harness proposal approval conflicted");
          }
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: existingPersonaLane.id,
              eventKind: "proposal_absorbed",
              payload: {
                proposalId: proposal.id,
                parentCardId: proposal.parentCardId,
                requestedByPersona: proposal.requestedByPersona,
                requestedTitle: proposal.title,
                deliverableType: proposal.deliverableType,
                resolution: "update_existing_lane"
              }
            })
          );
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: existingPersonaLane.id,
              eventKind: "comment_added",
              payload: {
                message: `${proposal.requestedByPersona.toUpperCase()} added follow-on work to the existing ${humanizeDeliverableType(
                  proposal.deliverableType
                ).toLowerCase()} lane instead of opening a new card.`
              }
            })
          );
          if (proposal.parentCardId !== existingPersonaLane.id) {
            await repository.insertEvent(
              createHarnessCardEventRecord({
                cardId: proposal.parentCardId,
                eventKind: "comment_added",
                payload: {
                  message: `${proposal.requestedByPersona.toUpperCase()} approved this request and attached it to the existing ${humanizeDeliverableType(
                    proposal.deliverableType
                  ).toLowerCase()} lane.`
                }
              })
            );
          }
          await recordAbsorbedLaneContinuity({
            repository,
            card: existingPersonaLane,
            proposal,
            resolution: "update_existing_lane"
          });
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: "proposal_approved",
              cardId: proposal.parentCardId,
              proposalId: proposal.id,
              targetCardId: existingPersonaLane.id,
              persona: proposal.persona,
              deliverableType: proposal.deliverableType,
              policyReason: "reused_existing_lane",
              resolution: "update_existing_lane",
              ...(trimmedDecisionNote ? { decisionNote: trimmedDecisionNote } : {}),
              recommendationSummary: createLaneRecommendationSummary({
                persona: proposal.persona,
                deliverableType: proposal.deliverableType,
                policyReason: "reused_existing_lane"
              })
            })
          );
          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            status: "approved",
            cardId: existingPersonaLane.id,
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_proposal_approved",
                entityId: proposal.id,
                metadata: {
                  runId: run.id,
                  approvedCardId: existingPersonaLane.id,
                  resolution: "update_existing_lane",
                  requestedByPersona: proposal.requestedByPersona,
                  targetPersona: proposal.persona,
                  deliverableType: proposal.deliverableType,
                  hasDecisionNote: Boolean(trimmedDecisionNote)
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }
        const latestDoneLane = findLatestDoneChildCardByPersonaDeliverable(cards, {
          persona: proposal.persona,
          deliverableType: proposal.deliverableType
        });
        if (
          latestDoneLane &&
          !findOpenChildCardByDeliverableType(cards, proposal.deliverableType) &&
          run.state !== "assembling" &&
          run.state !== "done" &&
          isBoundedLaneRefinement({
            proposal,
            candidateCard: latestDoneLane
          })
        ) {
          const reopenedCard = await repository.transitionCardState({
            cardId: latestDoneLane.id,
            expectedState: "done",
            state: "approved"
          });
          if (!reopenedCard) {
            throw new HarnessCardCreationConflictError("Harness completed lane refinement conflicted");
          }
          const approvalUpdate = await repository.markProposalApproved({
            proposalId: proposal.id,
            approvedCardId: reopenedCard.id,
            resolution: "update_existing_lane",
            ...(trimmedDecisionNote ? { decisionNote: trimmedDecisionNote } : {})
          });
          if (!approvalUpdate.updated) {
            throw new Error("Harness proposal approval conflicted");
          }
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: reopenedCard.id,
              eventKind: "state_changed",
              payload: { from: "done", to: "approved" }
            })
          );
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: reopenedCard.id,
              eventKind: "proposal_absorbed",
              payload: {
                proposalId: proposal.id,
                parentCardId: proposal.parentCardId,
                requestedByPersona: proposal.requestedByPersona,
                requestedTitle: proposal.title,
                deliverableType: proposal.deliverableType,
                resolution: "update_existing_lane"
              }
            })
          );
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: reopenedCard.id,
              eventKind: "comment_added",
              payload: {
                message: `${proposal.requestedByPersona.toUpperCase()} reopened this completed ${humanizeDeliverableType(
                  proposal.deliverableType
                ).toLowerCase()} lane for a bounded refinement instead of starting a fresh card.`
              }
            })
          );
          if (proposal.parentCardId !== reopenedCard.id) {
            await repository.insertEvent(
              createHarnessCardEventRecord({
                cardId: proposal.parentCardId,
                eventKind: "comment_added",
                payload: {
                  message: `${proposal.requestedByPersona.toUpperCase()} approved this refinement and reopened the existing ${humanizeDeliverableType(
                    proposal.deliverableType
                  ).toLowerCase()} lane.`
                }
              })
            );
          }
          await recordAbsorbedLaneContinuity({
            repository,
            card: reopenedCard,
            proposal,
            resolution: "update_existing_lane"
          });
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: "proposal_approved",
              cardId: proposal.parentCardId,
              proposalId: proposal.id,
              targetCardId: reopenedCard.id,
              persona: proposal.persona,
              deliverableType: proposal.deliverableType,
              policyReason: "reused_existing_lane",
              resolution: "update_existing_lane",
              ...(trimmedDecisionNote ? { decisionNote: trimmedDecisionNote } : {}),
              recommendationSummary: createLaneRecommendationSummary({
                persona: proposal.persona,
                deliverableType: proposal.deliverableType,
                policyReason: "reused_existing_lane"
              })
            })
          );
          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            status: "approved",
            cardId: reopenedCard.id,
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_proposal_approved",
                entityId: proposal.id,
                metadata: {
                  runId: run.id,
                  approvedCardId: reopenedCard.id,
                  resolution: "update_existing_lane",
                  reopenedCompletedLane: true,
                  requestedByPersona: proposal.requestedByPersona,
                  targetPersona: proposal.persona,
                  deliverableType: proposal.deliverableType,
                  hasDecisionNote: Boolean(trimmedDecisionNote)
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }
        if (proposalPolicyReason === "deliverable_owner_conflict") {
          const decisionNote =
            trimmedDecisionNote ??
            "CEO deferred this proposal because another active persona already owns that deliverable lane.";
          const decisionUpdate = await repository.markProposalStatus({
            proposalId: proposal.id,
            status: "deferred",
            decisionNote
          });
          if (!decisionUpdate.updated) {
            throw new Error("Harness proposal decision conflicted");
          }
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: proposal.parentCardId,
              eventKind: "comment_added",
              payload: {
                message: createPublicProposalDecisionMessage({
                  status: "deferred",
                  deliverableType: proposal.deliverableType,
                  policyReason: "deliverable_owner_conflict"
                })
              }
            })
          );
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: "proposal_deferred",
              cardId: proposal.parentCardId,
              proposalId: proposal.id,
              persona: proposal.persona,
              deliverableType: proposal.deliverableType,
              policyReason: "deliverable_owner_conflict",
              decisionNote,
              recommendationSummary: createGovernanceRecommendationSummary({
                deliverableType: proposal.deliverableType,
                policyReason: "deliverable_owner_conflict",
                status: "deferred"
              }),
              objectionSummary: createGovernanceObjectionSummary({
                deliverableType: proposal.deliverableType,
                policyReason: "deliverable_owner_conflict"
              })
            })
          );
          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            status: "deferred",
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_proposal_decided",
                entityId: proposal.id,
                metadata: {
                  runId: run.id,
                  decision: "deferred",
                  reason: "deliverable_owner_conflict",
                  hasDecisionNote: Boolean(trimmedDecisionNote),
                  requestedByPersona: proposal.requestedByPersona,
                  targetPersona: proposal.persona,
                  deliverableType: proposal.deliverableType
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }
        if (proposalPolicyReason === "completed_lanes_only") {
          const decisionNote =
            trimmedDecisionNote ??
            "CEO deferred this proposal because the board is already packaging completed work for this run.";
          const decisionUpdate = await repository.markProposalStatus({
            proposalId: proposal.id,
            status: "deferred",
            decisionNote
          });
          if (!decisionUpdate.updated) {
            throw new Error("Harness proposal decision conflicted");
          }
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: proposal.parentCardId,
              eventKind: "comment_added",
              payload: {
                message: createPublicProposalDecisionMessage({
                  status: "deferred",
                  deliverableType: proposal.deliverableType,
                  policyReason: "completed_lanes_only"
                })
              }
            })
          );
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: "proposal_deferred",
              cardId: proposal.parentCardId,
              proposalId: proposal.id,
              persona: proposal.persona,
              deliverableType: proposal.deliverableType,
              policyReason: "completed_lanes_only",
              decisionNote,
              recommendationSummary: createGovernanceRecommendationSummary({
                deliverableType: proposal.deliverableType,
                policyReason: "completed_lanes_only",
                status: "deferred"
              }),
              objectionSummary: createGovernanceObjectionSummary({
                deliverableType: proposal.deliverableType,
                policyReason: "completed_lanes_only"
              })
            })
          );
          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            status: "deferred",
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_proposal_decided",
                entityId: proposal.id,
                metadata: {
                  runId: run.id,
                  decision: "deferred",
                  reason: "completed_lanes_only",
                  hasDecisionNote: Boolean(trimmedDecisionNote),
                  requestedByPersona: proposal.requestedByPersona,
                  targetPersona: proposal.persona,
                  deliverableType: proposal.deliverableType
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }
        if (proposalPolicyReason === "persona_lane_cap") {
          const decisionNote =
            trimmedDecisionNote ??
            `CEO deferred this proposal because ${proposal.persona.toUpperCase()} already has another active lane.`;
          const decisionUpdate = await repository.markProposalStatus({
            proposalId: proposal.id,
            status: "deferred",
            decisionNote
          });
          if (!decisionUpdate.updated) {
            throw new Error("Harness proposal decision conflicted");
          }
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: proposal.parentCardId,
              eventKind: "comment_added",
              payload: {
                message: createPublicProposalDecisionMessage({
                  status: "deferred",
                  deliverableType: proposal.deliverableType,
                  policyReason: "persona_lane_cap"
                })
              }
            })
          );
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: "proposal_deferred",
              cardId: proposal.parentCardId,
              proposalId: proposal.id,
              persona: proposal.persona,
              deliverableType: proposal.deliverableType,
              policyReason: "persona_lane_cap",
              decisionNote,
              recommendationSummary: createGovernanceRecommendationSummary({
                deliverableType: proposal.deliverableType,
                policyReason: "persona_lane_cap",
                status: "deferred"
              }),
              objectionSummary: createGovernanceObjectionSummary({
                deliverableType: proposal.deliverableType,
                policyReason: "persona_lane_cap"
              })
            })
          );
          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            status: "deferred",
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_proposal_decided",
                entityId: proposal.id,
                metadata: {
                  runId: run.id,
                  decision: "deferred",
                  reason: "persona_lane_cap",
                  hasDecisionNote: Boolean(trimmedDecisionNote),
                  requestedByPersona: proposal.requestedByPersona,
                  targetPersona: proposal.persona,
                  deliverableType: proposal.deliverableType
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }
        if (countOpenChildCards(cards) >= MAX_OPEN_CHILD_CARDS) {
          const decisionNote =
            trimmedDecisionNote ?? "CEO deferred this proposal because the current run is at its active lane cap.";
          const decisionUpdate = await repository.markProposalStatus({
            proposalId: proposal.id,
            status: "deferred",
            decisionNote
          });
          if (!decisionUpdate.updated) {
            throw new Error("Harness proposal decision conflicted");
          }
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: proposal.parentCardId,
              eventKind: "comment_added",
              payload: {
                message: createPublicProposalDecisionMessage({
                  status: "deferred",
                  deliverableType: proposal.deliverableType,
                  policyReason: "lane_cap"
                })
              }
            })
          );
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: "proposal_deferred",
              cardId: proposal.parentCardId,
              proposalId: proposal.id,
              persona: proposal.persona,
              deliverableType: proposal.deliverableType,
              policyReason: "lane_cap",
              decisionNote,
              recommendationSummary: createGovernanceRecommendationSummary({
                deliverableType: proposal.deliverableType,
                policyReason: "lane_cap",
                status: "deferred"
              }),
              objectionSummary: createGovernanceObjectionSummary({
                deliverableType: proposal.deliverableType,
                policyReason: "lane_cap"
              })
            })
          );
          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            status: "deferred",
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_proposal_decided",
                entityId: proposal.id,
                metadata: {
                  runId: run.id,
                  decision: "deferred",
                  reason: "lane_cap",
                  hasDecisionNote: Boolean(trimmedDecisionNote),
                  requestedByPersona: proposal.requestedByPersona,
                  targetPersona: proposal.persona,
                  deliverableType: proposal.deliverableType
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }

        runtime.resumeRun({
          run,
          cards,
          proposals,
          continuity
        });
        const approvedCard = runtime.approveSubCard(request.proposalId, {
          cardId: randomUUID()
        });
        const approvalUpdate = await repository.markProposalApproved({
          proposalId: proposal.id,
          approvedCardId: approvedCard.id,
          resolution: "create_lane",
          ...(trimmedDecisionNote ? { decisionNote: trimmedDecisionNote } : {})
        });
        if (!approvalUpdate.updated) {
          const updatedProposal = await repository.getProposal(proposal.id);
          if (updatedProposal?.approvedCardId) {
            return { status: updatedProposal.status, cardId: updatedProposal.approvedCardId };
          }
          throw new Error("Harness proposal approval conflicted");
        }

        await repository.insertCard(approvedCard);
        await recordCardStateContinuity({
          repository,
          card: approvedCard
        });
        await repository.insertEvent(
          createHarnessCardEventRecord({
            cardId: proposal.parentCardId,
            eventKind: "result_recorded",
            payload: {
              title: proposal.title,
              targetPersona: proposal.persona,
              approvedCardId: approvedCard.id
            }
          })
        );
        await repository.insertEvent(
          createHarnessCardEventRecord({
            cardId: approvedCard.id,
            eventKind: "created",
            payload: {
              title: approvedCard.title,
              persona: approvedCard.persona,
              state: approvedCard.state
            }
          })
        );
        await repository.insertDecision(
          createHarnessBoardDecisionRecord({
            runId: run.id,
            tenantId: access.session.tenantId,
            actorUserId: access.session.userId,
            decisionKind: "proposal_approved",
            cardId: proposal.parentCardId,
            proposalId: proposal.id,
            targetCardId: approvedCard.id,
            persona: proposal.persona,
            deliverableType: proposal.deliverableType,
            policyReason: "created_new_lane",
            resolution: "create_lane",
            ...(trimmedDecisionNote ? { decisionNote: trimmedDecisionNote } : {}),
            recommendationSummary: createLaneRecommendationSummary({
              persona: proposal.persona,
              deliverableType: proposal.deliverableType,
              policyReason: "created_new_lane"
            })
          })
        );

        const reconciledRun = await reconcileHarnessRunState({ repository, run });

        return {
          status: "approved",
          cardId: approvedCard.id,
          auditEvents: [
            createHarnessAuditEvent({
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              eventType: "harness_proposal_approved",
              entityId: proposal.id,
              metadata: {
                runId: run.id,
                approvedCardId: approvedCard.id,
                resolution: "create_lane",
                parentCardId: proposal.parentCardId,
                requestedByPersona: proposal.requestedByPersona,
                targetPersona: proposal.persona,
                deliverableType: proposal.deliverableType
              }
            }),
            ...toRunAuditEvents({
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              runId: run.id,
              previousState: run.state,
              nextRun: reconciledRun
            })
          ]
        };
      };

      const result = await options.runAtomically(runApproval);

      await publishHarnessAuditEvents(options.audit, result.auditEvents ?? []);
      return {
        status: result.status,
        ...(result.cardId ? { cardId: result.cardId } : {})
      };
    },

    async approveProposal(request: { authorization: string; cookie?: string; proposalId: string }): Promise<{ cardId: string }> {
      const result = await this.decideProposal({
        ...request,
        decision: "approve"
      });
      if (!result.cardId) {
        throw new HarnessCardCreationConflictError("Harness proposal approval did not produce a lane target");
      }
      return { cardId: result.cardId };
    },

    async advanceChildCard(request: {
      authorization: string;
      cookie?: string;
      cardId: string;
      state: HarnessCardRecord["state"];
      resultSummary?: string;
      resumeSummary?: string;
    }): Promise<{ cardId: string; state: HarnessCardRecord["state"] }> {
      const access = await authorizeHarnessCardRequest({
        authenticate: options.authenticate,
        requireTenantMember: options.requireTenantMember,
        requireActivePackageInstall: options.requireActivePackageInstall,
        repository: options.repository,
        authorization: request.authorization,
        ...(request.cookie ? { cookie: request.cookie } : {}),
        cardId: request.cardId
      });

      if (!options.runAtomically) {
        throw new Error("Harness card progression mutations require atomic execution");
      }

      const result = await options.runAtomically(async (repository) => {
        const card = await repository.getCard(request.cardId);
        if (!card) {
          throw new HarnessCardProgressionConflictError("Harness child card was not found");
        }
        if (card.persona === "ceo") {
          throw new HarnessCardProgressionConflictError("CEO cards cannot be advanced through the child-card seam");
        }
        const run = await repository.getRun(card.runId);
        if (!run || run.tenantId !== access.session.tenantId) {
          throw new ApiAuthError();
        }
        if (isTerminalHarnessRunState(run.state)) {
          throw new HarnessCardProgressionConflictError("Harness terminal runs are read-only through the child-card seam");
        }
        if (!isHarnessCardState(request.state)) {
          throw new HarnessCardProgressionConflictError("Harness child card requested an unsupported state");
        }

        const nextCard = transitionHarnessCard(card, request.state);
        const trimmedSummary = request.resultSummary?.trim();
        const trimmedResumeSummary = request.resumeSummary?.trim();
        if (trimmedSummary && nextCard.state !== "done") {
          throw new HarnessCardProgressionConflictError("Outcome summaries can only be recorded when a card reaches done");
        }
        if (trimmedResumeSummary && nextCard.state === "done") {
          throw new HarnessCardProgressionConflictError("Resume summaries cannot be recorded when a card reaches done");
        }

        const updatedCard = await repository.transitionCardState({
          cardId: card.id,
          expectedState: card.state,
          state: nextCard.state
        });
        if (!updatedCard) {
          throw new HarnessCardProgressionConflictError("Harness child card progression conflicted");
        }

        await repository.insertEvent(
          createHarnessCardEventRecord({
            cardId: updatedCard.id,
            eventKind: "state_changed",
            payload: { from: card.state, to: updatedCard.state }
          })
        );

        if (trimmedSummary) {
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: updatedCard.id,
              eventKind: "result_recorded",
              payload: { summary: trimmedSummary }
            })
          );
          await recordLatestResultContinuity({
            repository,
            card: updatedCard,
            resultSummary: trimmedSummary
          });
        } else {
          await recordCardStateContinuity({
            repository,
            card: updatedCard,
            ...(trimmedResumeSummary ? { resumeSummary: trimmedResumeSummary } : {})
          });
        }

        const reconciledRun = await reconcileHarnessRunState({ repository, run });

        return {
          cardId: updatedCard.id,
          state: updatedCard.state,
          auditEvents: [
            createHarnessAuditEvent({
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              eventType: "harness_card_advanced",
              entityId: updatedCard.id,
              metadata: {
                runId: run.id,
                persona: updatedCard.persona,
                deliverableType: updatedCard.deliverableType,
                fromState: card.state,
                toState: updatedCard.state,
                hasResultSummary: Boolean(trimmedSummary)
              }
            }),
            ...toRunAuditEvents({
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              runId: run.id,
              previousState: run.state,
              nextRun: reconciledRun
            })
          ]
        };
      });

      await publishHarnessAuditEvents(options.audit, result.auditEvents ?? []);
      return { cardId: result.cardId, state: result.state };
    },

    async completeRun(request: {
      authorization: string;
      cookie?: string;
      runId: string;
      completionSummary: string;
      actionToken?: string;
      resolvedAttention?: HarnessAttentionState;
    }): Promise<{ runId: string; state: "done" }> {
      const access = await authorizeHarnessRunRequest({
        authenticate: options.authenticate,
        requireTenantMember: options.requireTenantMember,
        requireActivePackageInstall: options.requireActivePackageInstall,
        repository: options.repository,
        authorization: request.authorization,
        ...(request.cookie ? { cookie: request.cookie } : {}),
        runId: request.runId
      });

      if (!options.runAtomically) {
        throw new Error("Harness completion mutations require atomic execution");
      }

      const result = await options.runAtomically(async (repository) => {
        const trimmedCompletionSummary = request.completionSummary.trim();
        if (trimmedCompletionSummary.length === 0) {
          throw new HarnessRunCompletionConflictError("Harness run completion summary is required");
        }
        const run = await repository.getRun(request.runId);
        if (!run || run.tenantId !== access.session.tenantId) {
          throw new ApiAuthError();
        }
        if (run.state === "done") {
          return { runId: run.id, state: "done" as const };
        }

        const [cards, proposals, events, latestRun] = await Promise.all([
          repository.listCardsForRun(run.id),
          repository.listProposalsForRun(run.id),
          request.actionToken || request.resolvedAttention?.action.kind === "queue_ceo_review"
            ? repository.listEventsForRun(run.id)
            : Promise.resolve([]),
          repository.findLatestRunForTenantWorkflow({
            tenantId: run.tenantId,
            workflowId: run.workflowId
          })
        ]);
        if (!latestRun || latestRun.id !== run.id) {
          throw new HarnessRunCompletionConflictError("Harness run completion must target the latest board cycle");
        }
        const derivedState = deriveHarnessRunState({
          run,
          cards,
          proposals
        });
        if (request.actionToken || request.resolvedAttention?.action.kind === "queue_ceo_review") {
          const pendingAttention = determineHarnessPostOutcomeAction({
            runState: run.state,
            cards,
            proposals,
            nextDispatchCard: null
          });
          const currentAttention = deriveCurrentHarnessAttentionState(events);
          if (
            !pendingAttention
            || pendingAttention.kind !== "queue_ceo_review"
            || (currentAttention && !isSameAttentionAction(currentAttention.action, pendingAttention))
          ) {
            throw new HarnessRunCompletionConflictError("Harness run is not waiting on CEO review");
          }
          if (request.actionToken) {
            assertHarnessActionToken(
              createPendingAttentionActionToken({
                runId: run.id,
                action: pendingAttention
              }),
              request.actionToken
            );
          }
          if (
            request.resolvedAttention
            && !isSameAttentionAction(request.resolvedAttention.action, pendingAttention)
          ) {
            throw new HarnessRunCompletionConflictError("Harness run CEO review changed before completion");
          }
        }
        if (derivedState !== "assembling") {
          throw new HarnessRunCompletionConflictError("Harness run is not ready for final assembly");
        }

        let currentRun = run;
        if (run.state !== "assembling") {
          const assemblingRun = transitionHarnessRun(run, "assembling");
          const reconciledRun = await repository.updateRunState({
            runId: run.id,
            state: assemblingRun.state
          });
          if (!reconciledRun) {
            throw new HarnessRunCompletionConflictError("Harness run reconciliation conflicted before completion");
          }
          currentRun = reconciledRun;
        }

        const ceoCard = cards.find((card) => card.persona === "ceo" && card.parentCardId === null);
        if (!ceoCard) {
          throw new HarnessRunCompletionConflictError("Harness run is missing the CEO assembly lane");
        }

        if (request.resolvedAttention?.action.kind === "queue_ceo_review") {
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: ceoCard.id,
              eventKind: "attention_resolved",
              payload: buildResolvedAttentionPayload(request.resolvedAttention)
            })
          );
        }

        await repository.insertEvent(
          createHarnessCardEventRecord({
            cardId: ceoCard.id,
            eventKind: "result_recorded",
            payload: { summary: trimmedCompletionSummary }
          })
        );
        await recordLatestResultContinuity({
          repository,
          card: ceoCard,
          resultSummary: trimmedCompletionSummary
        });
        const completionDecision = createHarnessBoardDecisionRecord({
          runId: run.id,
          tenantId: access.session.tenantId,
          actorUserId: access.session.userId,
          decisionKind: "run_completed",
          cardId: ceoCard.id,
          persona: ceoCard.persona,
          policyReason: "completed_lanes_only",
          recommendationSummary: "Package only completed lanes into the tenant-facing board outcome."
        });
        await repository.insertDecision(completionDecision);
        const completedRun = await repository.updateRunState({
          runId: run.id,
          state: "done"
        });
        if (!completedRun) {
          throw new HarnessRunCompletionConflictError("Harness run completion conflicted");
        }
        const [completionContinuity, completionDecisions] = await Promise.all([
          repository.listCardContinuityForRun(run.id),
          repository.listDecisionsForRun(run.id)
        ]);
        const latestResultSummaryByCardId = new Map<string, string>();
        for (const continuityRecord of completionContinuity) {
          if (continuityRecord.latestResultSummary) {
            latestResultSummaryByCardId.set(continuityRecord.cardId, continuityRecord.latestResultSummary);
          }
        }
        const completionPackage = buildCompletionPackage({
          run: completedRun,
          cards,
          latestResultSummaryByCardId,
          proposals,
          decisions: completionDecisions
        });
        const governanceHistorySnapshot = buildGovernanceHistorySnapshot(completionDecisions);
        if (!completionPackage) {
          throw new HarnessRunCompletionConflictError("Harness completion package could not be persisted");
        }
        await repository.upsertCompletionPackageSnapshot({
          runId: completedRun.id,
          tenantId: completedRun.tenantId,
          workflowId: completedRun.workflowId,
          packageId: completedRun.packageId,
          ...completionPackage,
          createdAt: completedRun.updatedAt,
          updatedAt: completedRun.updatedAt
        });
        await repository.upsertGovernanceHistorySnapshot({
          runId: completedRun.id,
          tenantId: completedRun.tenantId,
          workflowId: completedRun.workflowId,
          packageId: completedRun.packageId,
          recentDecisions: governanceHistorySnapshot.recentDecisions,
          followThroughItems: governanceHistorySnapshot.followThroughItems,
          createdAt: completedRun.updatedAt,
          updatedAt: completedRun.updatedAt
        });

        return {
          runId: completedRun.id,
          state: "done" as const,
          auditEvents: [
            createHarnessAuditEvent({
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              eventType: "harness_run_completed",
              entityId: completedRun.id,
              metadata: {
                fromState: currentRun.state,
                toState: completedRun.state,
                ceoCardId: ceoCard.id,
                hasCompletionSummary: true
              }
            })
          ]
        };
      });

      await publishHarnessAuditEvents(options.audit, result.auditEvents ?? []);
      return { runId: result.runId, state: result.state };
    },

    async reviewPendingAttention(request: {
      authorization: string;
      cookie?: string;
      runId: string;
      decision: HarnessAttentionReviewDecision;
      actionToken?: string;
      completionSummary?: string;
      mode?: HarnessFreshCycleMode;
    }): Promise<
      | { status: "done"; runId: string }
      | { status: "fresh_cycle_started"; runId: string; reopenedProposalCount: number }
      | { status: "next_lane_started"; runId: string; cardId: string; state: "working" }
      | { status: "changes_requested"; runId: string; cardId: string; state: "working" }
      | { status: "deferred"; runId: string; cardId: string }
      | { status: "moved_to_assembly"; runId: string; runState: "assembling" }
    > {
      const access = await authorizeHarnessRunRequest({
        authenticate: options.authenticate,
        requireTenantMember: options.requireTenantMember,
        requireActivePackageInstall: options.requireActivePackageInstall,
        repository: options.repository,
        authorization: request.authorization,
        ...(request.cookie ? { cookie: request.cookie } : {}),
        runId: request.runId
      });

      const run = await options.repository.getRun(request.runId);
      if (!run || run.tenantId !== access.session.tenantId) {
        throw new ApiAuthError();
      }

      const [cards, proposals, events] = await Promise.all([
        options.repository.listCardsForRun(run.id),
        options.repository.listProposalsForRun(run.id),
        options.repository.listEventsForRun(run.id)
      ]);
      const pendingAttention = determineHarnessPostOutcomeAction({
        runState: run.state,
        cards,
        proposals,
        nextDispatchCard: null
      });
      const currentAttention = deriveCurrentHarnessAttentionState(events);
      if (
        !pendingAttention
        || pendingAttention.kind !== "queue_ceo_review"
        || (currentAttention && !isSameAttentionAction(currentAttention.action, pendingAttention))
      ) {
        throw new HarnessRunCompletionConflictError("Harness run is not waiting on CEO review");
      }
      if (request.actionToken) {
        assertHarnessActionToken(
          createPendingAttentionActionToken({
            runId: run.id,
            action: pendingAttention
          }),
          request.actionToken
        );
      }
      const resolvedAttention = currentAttention ?? buildDerivedAttentionState(pendingAttention);

      if (pendingAttention.reason === "next_lane_decision") {
        if (request.decision === "defer") {
          return {
            status: "deferred",
            runId: run.id,
            cardId: pendingAttention.nextCardId ?? pendingAttention.completedCardId ?? "unknown"
          };
        }
        if (!options.runAtomically) {
          throw new Error("Harness next-lane review mutations require atomic execution");
        }
        const result = await options.runAtomically(async (repository) => {
          const atomicRun = await repository.getRun(request.runId);
          if (!atomicRun || atomicRun.tenantId !== access.session.tenantId) {
            throw new ApiAuthError();
          }
          const [atomicCards, atomicProposals, atomicEvents, atomicContinuity] = await Promise.all([
            repository.listCardsForRun(atomicRun.id),
            repository.listProposalsForRun(atomicRun.id),
            repository.listEventsForRun(atomicRun.id),
            repository.listCardContinuityForRun(atomicRun.id)
          ]);
          const atomicPendingAttention = determineHarnessPostOutcomeAction({
            runState: atomicRun.state,
            cards: atomicCards,
            proposals: atomicProposals,
            nextDispatchCard: null
          });
          const atomicCurrentAttention = deriveCurrentHarnessAttentionState(atomicEvents);
          if (
            !atomicPendingAttention
            || atomicPendingAttention.kind !== "queue_ceo_review"
            || atomicPendingAttention.reason !== "next_lane_decision"
            || (atomicCurrentAttention && !isSameAttentionAction(atomicCurrentAttention.action, atomicPendingAttention))
          ) {
            throw new HarnessRunCompletionConflictError("Harness run is not waiting on CEO next-lane review");
          }
          if (request.actionToken) {
            assertHarnessActionToken(
              createPendingAttentionActionToken({
                runId: atomicRun.id,
                action: atomicPendingAttention
              }),
              request.actionToken
            );
          }
          const resolvedAttentionActionToken =
            request.actionToken
            ?? createPendingAttentionActionToken({
              runId: atomicRun.id,
              action: atomicPendingAttention
            });

          const ceoCard = atomicCards.find((card) => card.persona === "ceo" && card.parentCardId === null) ?? null;
          const completedCard =
            atomicPendingAttention.completedCardId
              ? atomicCards.find((card) => card.id === atomicPendingAttention.completedCardId) ?? null
              : null;
          const nextLaneCard =
            atomicPendingAttention.nextCardId
              ? atomicCards.find((card) => card.id === atomicPendingAttention.nextCardId) ?? null
              : null;

          let dispatchCardId: string | null = null;
          let dispatchDecision: HarnessReviewedNextLaneDispatch["decision"] | null = null;
          let nextRun: HarnessRunRecord;

          if (request.decision === "start_next_lane") {
            if (!nextLaneCard || nextLaneCard.state !== "approved") {
              throw new HarnessRunCompletionConflictError("Harness next lane is no longer approved for explicit start");
            }
            const dispatchResolution = await buildHarnessWorkerDispatchResolution({
              repository,
              tenantId: access.session.tenantId,
              runId: atomicRun.id,
              workflowId: atomicRun.workflowId,
              targetCardId: nextLaneCard.id,
              dispatchHandoff: createReviewedNextLaneHandoff({
                completedCard: completedCard ?? nextLaneCard,
                continuity: atomicContinuity.find((record) => record.cardId === (completedCard?.id ?? nextLaneCard.id)) ?? null
              })
            });
            if (!dispatchResolution?.lane || dispatchResolution.lane.state !== "working") {
              throw new HarnessRunCompletionConflictError("Harness next lane start conflicted");
            }
            dispatchCardId = dispatchResolution.lane.id;
            dispatchDecision = "start_next_lane";
            nextRun = await repository.getRun(atomicRun.id) ?? atomicRun;
          } else if (request.decision === "request_changes") {
            if (!completedCard || completedCard.state !== "done") {
              throw new HarnessRunCompletionConflictError("Completed lane is no longer available for requested changes");
            }
            const reopenedCard = await repository.transitionCardState({
              cardId: completedCard.id,
              expectedState: "done",
              state: "approved"
            });
            if (!reopenedCard) {
              throw new HarnessRunCompletionConflictError("Requested changes conflicted while reopening the completed lane");
            }
            await repository.insertEvent(
              createHarnessCardEventRecord({
                cardId: reopenedCard.id,
                eventKind: "state_changed",
                payload: { from: completedCard.state, to: reopenedCard.state }
              })
            );
            const dispatchResolution = await buildHarnessWorkerDispatchResolution({
              repository,
              tenantId: access.session.tenantId,
              runId: atomicRun.id,
              workflowId: atomicRun.workflowId,
              targetCardId: reopenedCard.id,
              dispatchHandoff: createReviewedNextLaneHandoff({
                completedCard: reopenedCard,
                continuity: atomicContinuity.find((record) => record.cardId === reopenedCard.id) ?? null
              })
            });
            if (!dispatchResolution?.lane || dispatchResolution.lane.state !== "working") {
              throw new HarnessRunCompletionConflictError("Requested changes conflicted while restarting the completed lane");
            }
            dispatchCardId = dispatchResolution.lane.id;
            dispatchDecision = "request_changes";
            nextRun = await repository.getRun(atomicRun.id) ?? atomicRun;
          } else if (request.decision === "move_to_assembly") {
            for (const approvedLane of atomicCards.filter((card) => card.persona !== "ceo" && card.state === "approved")) {
              const cancelledLane = await repository.transitionCardState({
                cardId: approvedLane.id,
                expectedState: "approved",
                state: "cancelled"
              });
              if (!cancelledLane) {
                throw new HarnessRunCompletionConflictError("Harness assembly move conflicted while cancelling an unstarted lane");
              }
              await repository.insertEvent(
                createHarnessCardEventRecord({
                  cardId: cancelledLane.id,
                  eventKind: "state_changed",
                  payload: { from: approvedLane.state, to: cancelledLane.state }
                })
              );
            }
            nextRun = await reconcileHarnessRunState({ repository, run: atomicRun }) ?? atomicRun;
            if (nextRun.state !== "assembling") {
              throw new HarnessRunCompletionConflictError("Harness board did not move into assembly after deferring the remaining approved lanes");
            }
          } else {
            throw new HarnessRunCompletionConflictError("Harness run is not waiting on that CEO review decision");
          }

          const [cardsAfterReview, proposalsAfterReview, continuityAfterReview] = await Promise.all([
            repository.listCardsForRun(atomicRun.id),
            repository.listProposalsForRun(atomicRun.id),
            repository.listCardContinuityForRun(atomicRun.id)
          ]);
          const nextAttentionCandidate = determineHarnessPostOutcomeAction({
            runState: nextRun.state,
            cards: cardsAfterReview,
            proposals: proposalsAfterReview,
            nextDispatchCard: null
          });
          const nextAttention =
            nextAttentionCandidate && nextAttentionCandidate.kind !== "dispatch_next_lane"
              ? nextAttentionCandidate
              : null;

          if (
            atomicCurrentAttention
            && (!nextAttention || !isSameAttentionAction(atomicCurrentAttention.action, nextAttention))
          ) {
            await repository.insertEvent(
              createHarnessCardEventRecord({
                cardId: ceoCard?.id ?? completedCard?.id ?? nextLaneCard?.id ?? atomicRun.id,
                eventKind: "attention_resolved",
                payload: buildResolvedAttentionPayload(atomicCurrentAttention)
              })
            );
          }

          if (
            nextAttention
            && (!atomicCurrentAttention || !isSameAttentionAction(atomicCurrentAttention.action, nextAttention))
          ) {
            const describedAttention = describeHarnessPostOutcomeActionKind(nextAttention);
            const nextAttentionTarget =
              nextAttention.kind === "await_lane_resume" || nextAttention.kind === "await_unblock"
                ? cardsAfterReview.find((card) => card.id === nextAttention.cardId) ?? null
                : nextAttention.kind === "queue_ceo_review" && nextAttention.nextCardId
                  ? cardsAfterReview.find((card) => card.id === nextAttention.nextCardId) ?? null
                  : null;
            const nextAttentionContinuitySummary =
              nextAttentionTarget
                ? continuityAfterReview.find((record) => record.cardId === nextAttentionTarget.id)?.continuitySummary
                : null;
            await repository.insertEvent(
              createHarnessCardEventRecord({
                cardId: ceoCard?.id ?? nextAttentionTarget?.id ?? atomicRun.id,
                eventKind: "attention_requested",
                payload: {
                  actionKind: nextAttention.kind,
                  runState: nextAttention.runState,
                  ...(nextAttention.kind === "queue_ceo_review"
                    ? {
                        reason: nextAttention.reason,
                        ...(nextAttention.completedCardId ? { completedCardId: nextAttention.completedCardId } : {}),
                        ...(nextAttention.nextCardId ? { nextCardId: nextAttention.nextCardId } : {}),
                        targetPersona: "ceo"
                      }
                    : { targetCardId: nextAttention.cardId }),
                  statusLabel: describedAttention.statusLabel,
                  summary: nextAttentionContinuitySummary ?? describedAttention.summary,
                  ...(describedAttention.reasonLabel ? { reasonLabel: describedAttention.reasonLabel } : {}),
                  ...(nextAttentionTarget
                    ? {
                        targetCardId: nextAttentionTarget.id,
                        targetPersona: nextAttentionTarget.persona,
                        targetTitle: nextAttentionTarget.title
                      }
                    : {})
                }
              })
            );
          }

          if (dispatchCardId && dispatchDecision) {
            return {
              status: dispatchDecision === "start_next_lane" ? "next_lane_started" as const : "changes_requested" as const,
              tenantId: access.session.tenantId,
              userId: access.session.userId,
              runId: atomicRun.id,
              workflowId: atomicRun.workflowId,
              cardId: dispatchCardId,
              actionToken: resolvedAttentionActionToken,
              decision: dispatchDecision,
              state: "working" as const
            };
          }

          return {
            status: "moved_to_assembly" as const,
            runId: atomicRun.id,
            runState: "assembling" as const
          };
        });

        if (result.status === "next_lane_started" || result.status === "changes_requested") {
          try {
            await options.onReviewedNextLaneDispatch?.({
              tenantId: result.tenantId,
              userId: result.userId,
              runId: result.runId,
              workflowId: result.workflowId,
              cardId: result.cardId,
              actionToken: result.actionToken,
              decision: result.decision,
              state: result.state
            });
          } catch (error) {
            console.warn("Reviewed harness next-lane dispatch hook failed after durable board mutation", {
              runId: result.runId,
              workflowId: result.workflowId,
              cardId: result.cardId,
              decision: result.decision,
              error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
            });
          }
          return {
            status: result.status,
            runId: result.runId,
            cardId: result.cardId,
            state: result.state
          };
        }
        return result;
      }

      if (request.decision === "complete_run") {
        const completionSummary = request.completionSummary?.trim();
        if (!completionSummary) {
          throw new HarnessRunCompletionConflictError("Harness run completion summary is required");
        }
        const completed = await this.completeRun({
          authorization: request.authorization,
          ...(request.cookie ? { cookie: request.cookie } : {}),
          runId: request.runId,
          completionSummary,
          ...(request.actionToken ? { actionToken: request.actionToken } : {}),
          resolvedAttention
        });
        return {
          status: "done",
          runId: completed.runId
        };
      }

      if (request.decision !== "start_fresh_cycle") {
        throw new HarnessRunCompletionConflictError("Harness run is not waiting on that CEO review decision");
      }

      const reopened = await this.startFreshCycle({
        authorization: request.authorization,
        ...(request.cookie ? { cookie: request.cookie } : {}),
        runId: request.runId,
        ...(request.actionToken ? { actionToken: request.actionToken } : {}),
        resolvedAttention,
        ...(request.mode ? { mode: request.mode } : {})
      });
      return {
        status: "fresh_cycle_started",
        runId: reopened.runId,
        reopenedProposalCount: reopened.reopenedProposalCount
      };
    },

    async resolvePendingAttention(request: {
      authorization: string;
      cookie?: string;
      runId: string;
      command: HarnessAttentionResolutionCommand;
      actionToken?: string;
      resumeSummary?: string;
    }): Promise<{ status: "resumed"; cardId: string; state: "working" } | { status: "unblocked"; cardId: string; state: "approved" }> {
      const access = await authorizeHarnessRunRequest({
        authenticate: options.authenticate,
        requireTenantMember: options.requireTenantMember,
        requireActivePackageInstall: options.requireActivePackageInstall,
        repository: options.repository,
        authorization: request.authorization,
        ...(request.cookie ? { cookie: request.cookie } : {}),
        runId: request.runId
      });

      if (!options.runAtomically) {
        throw new Error("Harness attention resolution mutations require atomic execution");
      }

      const result = await options.runAtomically(async (repository) => {
        const run = await repository.getRun(request.runId);
        if (!run || run.tenantId !== access.session.tenantId) {
          throw new ApiAuthError();
        }

        const [cards, proposals, events] = await Promise.all([
          repository.listCardsForRun(run.id),
          repository.listProposalsForRun(run.id),
          repository.listEventsForRun(run.id)
        ]);
        const pendingAttention = determineHarnessPostOutcomeAction({
          runState: run.state,
          cards,
          proposals,
          nextDispatchCard: null
        });
        const currentAttention = deriveCurrentHarnessAttentionState(events);
        if (
          !pendingAttention
          || pendingAttention.kind === "dispatch_next_lane"
          || (currentAttention && !isSameAttentionAction(currentAttention.action, pendingAttention))
        ) {
          throw new HarnessCardProgressionConflictError("Harness run has no active attention to resolve");
        }
        if (request.actionToken) {
          assertHarnessActionToken(
            createPendingAttentionActionToken({
              runId: run.id,
              action: pendingAttention
            }),
            request.actionToken
          );
        }

        if (
          (request.command === "resume_lane" && pendingAttention.kind !== "await_lane_resume")
          || (request.command === "unblock_lane" && pendingAttention.kind !== "await_unblock")
        ) {
          throw new HarnessCardProgressionConflictError("Harness run is not waiting on that attention command");
        }
        const resolvedAttentionActionToken =
          request.actionToken ??
          createPendingAttentionActionToken({
            runId: run.id,
            action: pendingAttention
          });

        const targetCardId = "cardId" in pendingAttention ? pendingAttention.cardId : null;
        if (!targetCardId) {
          throw new HarnessCardProgressionConflictError("Harness attention target is missing");
        }
        const targetCard = cards.find((card) => card.id === targetCardId);
        if (!targetCard) {
          throw new HarnessCardProgressionConflictError("Harness attention target lane was not found");
        }

        const nextState = request.command === "resume_lane" ? "working" : "approved";
        const expectedState = request.command === "resume_lane" ? "waiting" : "blocked";
        if (targetCard.state !== expectedState) {
          throw new HarnessCardProgressionConflictError("Harness attention target is no longer waiting on that state");
        }

        const updatedCard = await repository.transitionCardState({
          cardId: targetCard.id,
          expectedState,
          state: nextState
        });
        if (!updatedCard) {
          throw new HarnessCardProgressionConflictError("Harness attention target progression conflicted");
        }

        await repository.insertEvent(
          createHarnessCardEventRecord({
            cardId: updatedCard.id,
            eventKind: "state_changed",
            payload: { from: targetCard.state, to: updatedCard.state }
          })
        );

        const trimmedResumeSummary = request.resumeSummary?.trim();
        await recordCardStateContinuity({
          repository,
          card: updatedCard,
          ...(trimmedResumeSummary ? { resumeSummary: trimmedResumeSummary } : {})
        });
        const reconciledRun = await reconcileHarnessRunState({ repository, run });
        const nextRun = reconciledRun ?? run;
        const [cardsAfterResolution, proposalsAfterResolution, continuityAfterResolution] = await Promise.all([
          repository.listCardsForRun(run.id),
          repository.listProposalsForRun(run.id),
          repository.listCardContinuityForRun(run.id)
        ]);
        const nextAttentionCandidate = determineHarnessPostOutcomeAction({
          runState: nextRun.state,
          fallbackCardId: updatedCard.id,
          nextDispatchCard: null,
          cards: cardsAfterResolution,
          proposals: proposalsAfterResolution
        });
        const nextAttention =
          nextAttentionCandidate && nextAttentionCandidate.kind !== "dispatch_next_lane"
            ? nextAttentionCandidate
            : null;

        if (currentAttention && (!nextAttention || !isSameAttentionAction(currentAttention.action, nextAttention))) {
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: "cardId" in currentAttention.action ? currentAttention.action.cardId : updatedCard.id,
              eventKind: "attention_resolved",
              payload: {
                actionKind: currentAttention.action.kind,
                runState: currentAttention.action.runState,
                ...(currentAttention.action.kind === "queue_ceo_review"
                  ? { reason: currentAttention.action.reason }
                  : { targetCardId: currentAttention.action.cardId }),
                ...currentAttention.snapshot
              }
            })
          );
        }

        if (
          nextAttention
          && (!currentAttention || !isSameAttentionAction(currentAttention.action, nextAttention))
        ) {
          const describedAttention = describeHarnessPostOutcomeActionKind(nextAttention);
          const nextAttentionTarget =
            nextAttention.kind === "await_lane_resume" || nextAttention.kind === "await_unblock"
              ? cardsAfterResolution.find((card) => card.id === nextAttention.cardId) ?? null
              : null;
          const nextAttentionContinuitySummary =
            nextAttentionTarget
              ? continuityAfterResolution.find((record) => record.cardId === nextAttentionTarget.id)?.continuitySummary
              : null;
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: "cardId" in nextAttention ? nextAttention.cardId : updatedCard.id,
              eventKind: "attention_requested",
              payload: {
                actionKind: nextAttention.kind,
                runState: nextAttention.runState,
                ...(nextAttention.kind === "queue_ceo_review"
                  ? { reason: nextAttention.reason, targetPersona: "ceo" }
                  : { targetCardId: nextAttention.cardId }),
                statusLabel: describedAttention.statusLabel,
                summary: nextAttentionContinuitySummary ?? describedAttention.summary,
                ...(describedAttention.reasonLabel ? { reasonLabel: describedAttention.reasonLabel } : {}),
                ...(nextAttentionTarget
                  ? {
                      targetCardId: nextAttentionTarget.id,
                      targetPersona: nextAttentionTarget.persona,
                      targetTitle: nextAttentionTarget.title
                    }
                  : {})
              }
            })
          );
        }

        const resolvedState = request.command === "resume_lane" ? "working" as const : "approved" as const;
        return {
          tenantId: access.session.tenantId,
          userId: access.session.userId,
          runId: run.id,
          workflowId: run.workflowId,
          cardId: updatedCard.id,
          actionToken: resolvedAttentionActionToken,
          command: request.command,
          state: resolvedState,
          status: request.command === "resume_lane" ? "resumed" as const : "unblocked" as const,
          auditEvents: [
            createHarnessAuditEvent({
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              eventType: request.command === "resume_lane" ? "harness_lane_resumed" : "harness_lane_unblocked",
              entityId: updatedCard.id,
              metadata: {
                runId: run.id,
                persona: updatedCard.persona,
                deliverableType: updatedCard.deliverableType,
                fromState: targetCard.state,
                toState: updatedCard.state,
                hasResumeSummary: Boolean(trimmedResumeSummary)
              }
            }),
            ...toRunAuditEvents({
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              runId: run.id,
              previousState: run.state,
              nextRun
            })
          ]
        };
      });

      await publishHarnessAuditEvents(options.audit, result.auditEvents ?? []);
      try {
        await options.onResolvedAttentionDispatch?.({
          tenantId: result.tenantId,
          userId: result.userId,
          runId: result.runId,
          workflowId: result.workflowId,
          cardId: result.cardId,
          actionToken: result.actionToken,
          command: result.command,
          state: result.state
        });
      } catch (error) {
        console.warn("Resolved harness attention dispatch hook failed after durable board mutation", {
          runId: result.runId,
          workflowId: result.workflowId,
          cardId: result.cardId,
          command: result.command,
          error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
        });
      }
      if (result.status === "resumed") {
        return { status: "resumed", cardId: result.cardId, state: "working" };
      }
      return { status: "unblocked", cardId: result.cardId, state: "approved" };
    },

    async startFreshCycle(request: {
      authorization: string;
      cookie?: string;
      runId: string;
      actionToken?: string;
      mode?: HarnessFreshCycleMode;
      resolvedAttention?: HarnessAttentionState;
    }): Promise<{ runId: string; reopenedProposalCount: number }> {
      const access = await authorizeHarnessRunRequest({
        authenticate: options.authenticate,
        requireTenantMember: options.requireTenantMember,
        requireActivePackageInstall: options.requireActivePackageInstall,
        repository: options.repository,
        authorization: request.authorization,
        ...(request.cookie ? { cookie: request.cookie } : {}),
        runId: request.runId
      });

      if (!options.runAtomically) {
        throw new Error("Harness cycle mutations require atomic execution");
      }

      const result = await options.runAtomically(async (repository) => {
        const run = await repository.getRun(request.runId);
        if (!run || run.tenantId !== access.session.tenantId) {
          throw new ApiAuthError();
        }
        if (run.state !== "assembling" && run.state !== "done") {
          throw new HarnessRunCycleConflictError("Harness fresh cycle can only start from a packaged run");
        }
        const latestRun = await repository.findLatestRunForTenantWorkflow({
          tenantId: run.tenantId,
          workflowId: run.workflowId
        });
        if (!latestRun || latestRun.id !== run.id) {
          throw new HarnessRunCycleConflictError("Harness fresh cycle must start from the latest packaged run");
        }

        const freshCycleMode = request.mode ?? "reopen_deferred";

        const [cards, proposals, decisions, events] = await Promise.all([
          repository.listCardsForRun(run.id),
          repository.listProposalsForRun(run.id),
          repository.listDecisionsForRun(run.id),
          request.actionToken || request.resolvedAttention?.action.kind === "queue_ceo_review"
            ? repository.listEventsForRun(run.id)
            : Promise.resolve([])
        ]);
        if (request.actionToken || request.resolvedAttention?.action.kind === "queue_ceo_review") {
          const pendingAttention = determineHarnessPostOutcomeAction({
            runState: run.state,
            cards,
            proposals,
            nextDispatchCard: null
          });
          const currentAttention = deriveCurrentHarnessAttentionState(events);
          if (
            !pendingAttention
            || pendingAttention.kind !== "queue_ceo_review"
            || (currentAttention && !isSameAttentionAction(currentAttention.action, pendingAttention))
          ) {
            throw new HarnessRunCycleConflictError("Harness run is not waiting on CEO review");
          }
          if (request.actionToken) {
            assertHarnessActionToken(
              createPendingAttentionActionToken({
                runId: run.id,
                action: pendingAttention
              }),
              request.actionToken
            );
          }
          if (
            request.resolvedAttention
            && !isSameAttentionAction(request.resolvedAttention.action, pendingAttention)
          ) {
            throw new HarnessRunCycleConflictError("Harness run CEO review changed before the fresh cycle started");
          }
        }
        const ceoCard = cards.find((card) => card.persona === "ceo" && card.parentCardId === null);
        if (!ceoCard) {
          throw new HarnessRunCycleConflictError("Harness packaged run is missing the CEO card");
        }

        if (request.resolvedAttention?.action.kind === "queue_ceo_review") {
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: ceoCard.id,
              eventKind: "attention_resolved",
              payload: buildResolvedAttentionPayload(request.resolvedAttention)
            })
          );
        }

        const nextRun = await seedFreshHarnessRun({
          repository,
          runtime,
          fromRun: run
        });
        const nextRunCards = await repository.listCardsForRun(nextRun.id);
        const nextRunCeoCard = nextRunCards.find((card) => card.persona === "ceo" && card.parentCardId === null);
        if (!nextRunCeoCard) {
          throw new HarnessRunCycleConflictError("Harness fresh cycle is missing the CEO card");
        }

        const latestDecisionByProposalId = new Map<string, HarnessBoardDecisionRecord>();
        for (const decision of decisions) {
          if (decision.proposalId && !latestDecisionByProposalId.has(decision.proposalId)) {
            latestDecisionByProposalId.set(decision.proposalId, decision);
          }
        }

        const carryForwardProposals =
          freshCycleMode === "clean"
            ? []
            : proposals.filter((proposal) => {
                if (proposal.status !== "deferred") {
                  return false;
                }
                return latestDecisionByProposalId.get(proposal.id)?.policyReason === "completed_lanes_only";
              });

        for (const proposal of carryForwardProposals) {
          await repository.insertProposal({
            id: randomUUID(),
            runId: nextRun.id,
            parentCardId: nextRunCeoCard.id,
            requestedByCardId: nextRunCeoCard.id,
            requestedByPersona: proposal.requestedByPersona,
            persona: proposal.persona,
            title: proposal.title,
            deliverableType: proposal.deliverableType,
            status: "proposed"
          });
        }

        await repository.insertEvent(
          createHarnessCardEventRecord({
            cardId: ceoCard.id,
            eventKind: "comment_added",
            payload: {
              message:
                freshCycleMode === "clean"
                  ? "CEO started a completely clean board cycle without carrying deferred follow-on requests forward."
                  : carryForwardProposals.length > 0
                    ? `CEO started a fresh board cycle and carried ${carryForwardProposals.length} deferred follow-on request${carryForwardProposals.length === 1 ? "" : "s"} forward.`
                    : "CEO started a fresh board cycle for the next round of board work."
            }
          })
        );
        await repository.insertEvent(
          createHarnessCardEventRecord({
            cardId: nextRunCeoCard.id,
            eventKind: "comment_added",
            payload: {
              message:
                freshCycleMode === "clean"
                  ? "CEO opened a clean board cycle with no carried follow-on work."
                  : carryForwardProposals.length > 0
                    ? `CEO reopened ${carryForwardProposals.length} deferred follow-on request${carryForwardProposals.length === 1 ? "" : "s"} for this new board cycle.`
                    : "CEO opened a fresh board cycle for the next round of work."
            }
          })
        );

        return {
          tenantId: access.session.tenantId,
          userId: access.session.userId,
          runId: nextRun.id,
          workflowId: nextRun.workflowId,
          actionToken: request.actionToken ?? nextRun.id,
          mode: freshCycleMode,
          reopenedProposalCount: carryForwardProposals.length,
          auditEvents: [
            createHarnessAuditEvent({
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              eventType: "harness_fresh_cycle_started",
              entityId: nextRun.id,
              metadata: {
                previousRunId: run.id,
                previousRunState: run.state,
                mode: freshCycleMode,
                reopenedProposalCount: carryForwardProposals.length
              }
            })
          ]
        };
      });

      await publishHarnessAuditEvents(options.audit, result.auditEvents ?? []);
      try {
        await options.onFreshCycleDispatch?.({
          tenantId: result.tenantId,
          userId: result.userId,
          runId: result.runId,
          workflowId: result.workflowId,
          actionToken: result.actionToken,
          mode: result.mode,
          reopenedProposalCount: result.reopenedProposalCount
        });
      } catch (error) {
        console.warn("Fresh harness cycle dispatch hook failed after durable board mutation", {
          runId: result.runId,
          workflowId: result.workflowId,
          mode: result.mode,
          reopenedProposalCount: result.reopenedProposalCount,
          error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
        });
      }
      return {
        runId: result.runId,
        reopenedProposalCount: result.reopenedProposalCount
      };
    },

    async preflightExportCandidate(request: {
      authorization: string;
      cookie?: string;
      runId: string;
      candidateId: HarnessExportCandidateId;
      actionToken?: string;
    }): Promise<HarnessExportPreflightResult> {
      const board = await loadExportBoardContext({
        repository: options.repository,
        authenticate: options.authenticate,
        requireTenantMember: options.requireTenantMember,
        requireActivePackageInstall: options.requireActivePackageInstall,
        workflowRegistry: options.workflowRegistry,
        ...(options.resolveWorkflowRegistry ? { resolveWorkflowRegistry: options.resolveWorkflowRegistry } : {}),
        authorization: request.authorization,
        ...(request.cookie ? { cookie: request.cookie } : {}),
        runId: request.runId
      });
      const candidate = findExportCandidateOrThrow(board.response.memoryBoundary.exportCandidates, request.candidateId);
      const action = findExportActionOrThrow(candidate, "export-preflight");
      if (request.actionToken) {
        assertHarnessActionToken(action.actionHandle, request.actionToken);
      }

      const result: HarnessExportPreflightResult = {
        candidateId: candidate.id,
        status:
          candidate.readiness === "ready_now" &&
          (
            candidate.id !== "package_bundle_export" ||
            isGovernanceHistoryExportDependencySatisfied(
              board.response.memoryBoundary.exportCandidates?.find((entry) => entry.id === "governance_history_export")
                ?.latestDelivery
            )
          )
            ? "ready"
            : "blocked",
        readiness: candidate.readiness,
        readinessLabel: candidate.readinessLabel,
        summary: candidate.summary,
        nextStepLabel: candidate.promotionNextStepLabel,
        supportsDryRun: Boolean(candidate.exportActions?.some((entry) => entry.actionRoute === "export-dry-run")),
        supportsExport: Boolean(candidate.exportActions?.some((entry) => (
          entry.actionRoute === "governance-history-export" || entry.actionRoute === "package-bundle-export"
        ))),
        supportsReplay: Boolean(candidate.exportActions?.some((entry) => (
          entry.actionRoute === "governance-history-export-replay" || entry.actionRoute === "package-bundle-export-replay"
        ))),
        ...(candidate.latestDelivery ? { latestDelivery: candidate.latestDelivery } : {}),
        ...(
          candidate.readiness !== "ready_now"
            ? { blockerLabel: candidate.promotionBlockerLabel }
            : candidate.id === "package_bundle_export" &&
              !isGovernanceHistoryExportDependencySatisfied(
                board.response.memoryBoundary.exportCandidates?.find((entry) => entry.id === "governance_history_export")
                  ?.latestDelivery
              )
            ? { blockerLabel: "Governance history delivery must complete first" }
            : {}
        )
      };
      await publishHarnessAuditEvents(options.audit, [
        createHarnessExportAuditEvent({
          tenantId: board.access.session.tenantId,
          actorUserId: board.access.session.userId,
          runId: board.response.runId,
          candidateId: candidate.id,
          eventType: "harness.export_candidate_preflight_ready",
          metadata: {
            status: result.status,
            readiness: result.readiness,
            supportsDryRun: result.supportsDryRun,
            supportsExport: result.supportsExport,
            supportsReplay: result.supportsReplay,
            nextStepLabel: result.nextStepLabel,
            ...(result.blockerLabel ? { blockerLabel: result.blockerLabel } : {})
          }
        })
      ]);
      return result;
    },

    async dryRunExportCandidate(request: {
      authorization: string;
      cookie?: string;
      runId: string;
      candidateId: HarnessExportCandidateId;
      actionToken?: string;
    }): Promise<HarnessExportDryRunResult> {
      const board = await loadExportBoardContext({
        repository: options.repository,
        authenticate: options.authenticate,
        requireTenantMember: options.requireTenantMember,
        requireActivePackageInstall: options.requireActivePackageInstall,
        workflowRegistry: options.workflowRegistry,
        ...(options.resolveWorkflowRegistry ? { resolveWorkflowRegistry: options.resolveWorkflowRegistry } : {}),
        authorization: request.authorization,
        ...(request.cookie ? { cookie: request.cookie } : {}),
        runId: request.runId
      });
      const candidate = findExportCandidateOrThrow(board.response.memoryBoundary.exportCandidates, request.candidateId);
      const action = findExportActionOrThrow(candidate, "export-dry-run");
      if (request.actionToken) {
        assertHarnessActionToken(action.actionHandle, request.actionToken);
      }

      const result = candidate.id === "governance_history_export"
        ? buildGovernanceHistoryExportDryRun(board.response, candidate)
        : candidate.id === "package_bundle_export"
          ? buildPackageBundleExportDryRun(board.response, candidate)
          : (() => {
              throw new HarnessRunCompletionConflictError("Harness export dry-run only supports grouped export candidates");
            })();
      await publishHarnessAuditEvents(options.audit, [
        createHarnessExportAuditEvent({
          tenantId: board.access.session.tenantId,
          actorUserId: board.access.session.userId,
          runId: board.response.runId,
          candidateId: candidate.id,
          eventType: "harness.export_candidate_dry_run_built",
          metadata: {
            bundleId: result.bundleId,
            exportFormat: result.exportFormat,
            recordTarget: result.recordTarget,
            noteFileName: result.noteFileName,
            primaryNotePath: result.placement.primaryNotePath,
            fileCount: result.files.length,
            recordCount: result.recordCount,
            disclosureSummary: result.disclosureSummary,
            redactionSummary: result.redactionSummary
          }
        })
      ]);
      return result;
    },

    async exportGovernanceHistoryCandidate(request: {
      authorization: string;
      cookie?: string;
      runId: string;
      candidateId: HarnessExportCandidateId;
      actionToken?: string;
    }): Promise<HarnessGovernanceHistoryExportResult> {
      const board = await loadExportBoardContext({
        repository: options.repository,
        authenticate: options.authenticate,
        requireTenantMember: options.requireTenantMember,
        requireActivePackageInstall: options.requireActivePackageInstall,
        workflowRegistry: options.workflowRegistry,
        ...(options.resolveWorkflowRegistry ? { resolveWorkflowRegistry: options.resolveWorkflowRegistry } : {}),
        authorization: request.authorization,
        ...(request.cookie ? { cookie: request.cookie } : {}),
        runId: request.runId
      });
      const candidate = findExportCandidateOrThrow(board.response.memoryBoundary.exportCandidates, request.candidateId);
      if (candidate.id !== "governance_history_export") {
        throw new HarnessRunCompletionConflictError("Harness export action only supports governance history candidates");
      }
      const action = findExportActionOrThrow(candidate, "governance-history-export");
      if (request.actionToken) {
        assertHarnessActionToken(action.actionHandle, request.actionToken);
      }

      const dryRun = buildGovernanceHistoryExportDryRun(board.response, candidate);
      const result: HarnessGovernanceHistoryExportResult = {
        ...dryRun,
        candidateId: "governance_history_export",
        recordTarget: "governance_history_record",
        status: "export_ready",
        idempotencyKey: createHarnessActionToken([
          "governance-history-export",
          board.response.runId,
          candidate.id,
          dryRun.bundleId
        ]),
        summary: "Governance history export is ready as a tenant-safe Obsidian markdown bundle.",
        latestDelivery: {
          status: "export_ready",
          statusLabel: humanizeExportDeliveryStatus("export_ready"),
          summary: "The governance history bundle is export-ready and waiting for bounded delivery through the configured tenant-safe writer seam.",
          attemptCount: 0,
          contractFreshness: "current_bundle",
          contractFreshnessLabel: "Current bundle",
          contractFreshnessSummary: "The latest stored delivery bundle still matches the current export contract."
        }
      };
      await options.onGovernanceHistoryExportReady?.({
        tenantId: board.access.session.tenantId,
        userId: board.access.session.userId,
        runId: board.response.runId,
        workflowId: board.response.workflowId,
        packageId: board.response.packageId,
        candidateId: result.candidateId,
        bundleId: result.bundleId,
        bundleRevision: result.bundleRevision,
        exportFormat: result.exportFormat,
        recordTarget: result.recordTarget,
        idempotencyKey: result.idempotencyKey,
        noteTitle: result.noteTitle,
        noteFileName: result.noteFileName,
        placement: cloneHarnessExportPlacementManifest(result.placement),
        files: result.files.map(cloneHarnessExportPackageFile),
        recordCount: result.recordCount,
        disclosureSummary: result.disclosureSummary,
        redactionSummary: result.redactionSummary
      });
      await publishHarnessAuditEvents(options.audit, [
        createHarnessExportAuditEvent({
          tenantId: board.access.session.tenantId,
          actorUserId: board.access.session.userId,
          runId: board.response.runId,
          candidateId: candidate.id,
          eventType: "harness.governance_history_export_ready",
          metadata: {
            bundleId: result.bundleId,
            idempotencyKey: result.idempotencyKey,
            exportFormat: result.exportFormat,
            recordTarget: result.recordTarget,
            primaryNotePath: result.placement.primaryNotePath,
            fileCount: result.files.length,
            recordCount: result.recordCount,
            disclosureSummary: result.disclosureSummary,
            redactionSummary: result.redactionSummary
          }
        })
      ]);
      return result;
    },

    async exportPackageBundleCandidate(request: {
      authorization: string;
      cookie?: string;
      runId: string;
      candidateId: HarnessExportCandidateId;
      actionToken?: string;
    }): Promise<HarnessPackageBundleExportResult> {
      const board = await loadExportBoardContext({
        repository: options.repository,
        authenticate: options.authenticate,
        requireTenantMember: options.requireTenantMember,
        requireActivePackageInstall: options.requireActivePackageInstall,
        workflowRegistry: options.workflowRegistry,
        ...(options.resolveWorkflowRegistry ? { resolveWorkflowRegistry: options.resolveWorkflowRegistry } : {}),
        authorization: request.authorization,
        ...(request.cookie ? { cookie: request.cookie } : {}),
        runId: request.runId
      });
      const candidate = findExportCandidateOrThrow(board.response.memoryBoundary.exportCandidates, request.candidateId);
      if (candidate.id !== "package_bundle_export") {
        throw new HarnessRunCompletionConflictError("Harness export action only supports package bundle candidates");
      }
      const governanceHistoryCandidate = findExportCandidateOrThrow(
        board.response.memoryBoundary.exportCandidates,
        "governance_history_export"
      );
      if (!isGovernanceHistoryExportDependencySatisfied(governanceHistoryCandidate.latestDelivery)) {
        throw new HarnessRunCompletionConflictError(
          "Harness package bundle export is not available until governance history delivery completes for the current bundle"
        );
      }
      const action = findExportActionOrThrow(candidate, "package-bundle-export");
      if (request.actionToken) {
        assertHarnessActionToken(action.actionHandle, request.actionToken);
      }

      const dryRun = buildPackageBundleExportDryRun(board.response, candidate);
      const result: HarnessPackageBundleExportResult = {
        ...dryRun,
        candidateId: "package_bundle_export",
        recordTarget: "package_deliverable_record",
        status: "export_ready",
        idempotencyKey: createHarnessActionToken([
          "package-bundle-export",
          board.response.runId,
          candidate.id,
          dryRun.bundleId
        ]),
        summary: "Package bundle export is ready as a tenant-safe Obsidian markdown bundle.",
        latestDelivery: {
          status: "export_ready",
          statusLabel: humanizeExportDeliveryStatus("export_ready"),
          summary: "The package bundle is export-ready and waiting for bounded delivery through the configured tenant-safe writer seam.",
          attemptCount: 0,
          contractFreshness: "current_bundle",
          contractFreshnessLabel: "Current bundle",
          contractFreshnessSummary: "The latest stored delivery bundle still matches the current export contract."
        }
      };
      await options.onPackageBundleExportReady?.({
        tenantId: board.access.session.tenantId,
        userId: board.access.session.userId,
        runId: board.response.runId,
        workflowId: board.response.workflowId,
        packageId: board.response.packageId,
        candidateId: result.candidateId,
        bundleId: result.bundleId,
        bundleRevision: result.bundleRevision,
        exportFormat: result.exportFormat,
        recordTarget: result.recordTarget,
        idempotencyKey: result.idempotencyKey,
        noteTitle: result.noteTitle,
        noteFileName: result.noteFileName,
        placement: cloneHarnessExportPlacementManifest(result.placement),
        files: result.files.map(cloneHarnessExportPackageFile),
        recordCount: result.recordCount,
        disclosureSummary: result.disclosureSummary,
        redactionSummary: result.redactionSummary
      });
      await publishHarnessAuditEvents(options.audit, [
        createHarnessExportAuditEvent({
          tenantId: board.access.session.tenantId,
          actorUserId: board.access.session.userId,
          runId: board.response.runId,
          candidateId: candidate.id,
          eventType: "harness.package_bundle_export_ready",
          metadata: {
            bundleId: result.bundleId,
            idempotencyKey: result.idempotencyKey,
            exportFormat: result.exportFormat,
            recordTarget: result.recordTarget,
            primaryNotePath: result.placement.primaryNotePath,
            fileCount: result.files.length,
            recordCount: result.recordCount,
            disclosureSummary: result.disclosureSummary,
            redactionSummary: result.redactionSummary
          }
        })
      ]);
      return result;
    },

    async replayGovernanceHistoryDeliveryCandidate(request: {
      authorization: string;
      cookie?: string;
      runId: string;
      candidateId: HarnessExportCandidateId;
      actionToken?: string;
    }): Promise<HarnessGovernanceHistoryDeliveryReplayResult> {
      const board = await loadExportBoardContext({
        repository: options.repository,
        authenticate: options.authenticate,
        requireTenantMember: options.requireTenantMember,
        requireActivePackageInstall: options.requireActivePackageInstall,
        workflowRegistry: options.workflowRegistry,
        ...(options.resolveWorkflowRegistry ? { resolveWorkflowRegistry: options.resolveWorkflowRegistry } : {}),
        authorization: request.authorization,
        ...(request.cookie ? { cookie: request.cookie } : {}),
        runId: request.runId
      });
      const candidate = findExportCandidateOrThrow(board.response.memoryBoundary.exportCandidates, request.candidateId);
      if (candidate.id !== "governance_history_export") {
        throw new HarnessRunCompletionConflictError("Harness delivery replay only supports governance history candidates");
      }
      const action = findExportActionOrThrow(candidate, "governance-history-export-replay");
      if (request.actionToken) {
        assertHarnessActionToken(action.actionHandle, request.actionToken);
      }
      const exportDelivery = findLatestExportDeliveryRecordOrThrow(board.exportDeliveries, candidate.id);
      if (exportDelivery.status === "delivered") {
        throw new HarnessRunCompletionConflictError("Harness governance history delivery is already complete");
      }
      const currentDryRun = buildGovernanceHistoryExportDryRun(board.response, candidate);
      assertExportReplayBundleCurrent({
        candidateLabel: "governance history",
        currentBundleId: currentDryRun.bundleId,
        exportDelivery
      });

      await options.onGovernanceHistoryExportReady?.({
        tenantId: board.access.session.tenantId,
        userId: board.access.session.userId,
        runId: board.response.runId,
        workflowId: board.response.workflowId,
        packageId: board.response.packageId,
        candidateId: "governance_history_export",
        bundleId: exportDelivery.bundleId,
        bundleRevision: exportDelivery.bundleRevision,
        exportFormat: exportDelivery.exportFormat,
        recordTarget: "governance_history_record",
        idempotencyKey: exportDelivery.idempotencyKey,
        noteTitle: exportDelivery.noteTitle,
        noteFileName: exportDelivery.noteFileName,
        placement: {
          targetSystem: exportDelivery.placementTargetSystem as "obsidian_vault",
          vaultFolder: exportDelivery.vaultFolder,
          primaryNotePath: exportDelivery.primaryNotePath,
          syncStrategy: exportDelivery.syncStrategy as HarnessMemoryBoundarySyncStrategy,
          confirmationRequirement:
            exportDelivery.confirmationRequirement as HarnessMemoryBoundaryExportConfirmationRequirement
        },
        files: exportDelivery.files.map(cloneHarnessExportPackageFile),
        recordCount: exportDelivery.recordCount,
        disclosureSummary: exportDelivery.disclosureSummary,
        redactionSummary: exportDelivery.redactionSummary
      });

      const latestDelivery: HarnessExportCandidateDeliveryView = {
        status: "export_ready",
        statusLabel: humanizeExportDeliveryStatus("export_ready"),
        summary: "The governance history bundle was replayed back into the bounded tenant-safe writer seam and is waiting for delivery.",
        attemptCount: exportDelivery.attemptCount,
        contractFreshness: "current_bundle",
        contractFreshnessLabel: "Current bundle",
        contractFreshnessSummary: "The replayed delivery bundle still matches the current export contract.",
        ...(exportDelivery.writerKind ? { writerKindLabel: humanizeExportDeliveryWriterKind(exportDelivery.writerKind) } : {}),
        ...(exportDelivery.primaryNotePath ? { primaryNotePath: exportDelivery.primaryNotePath } : {})
      };

      await publishHarnessAuditEvents(options.audit, [
        createHarnessExportAuditEvent({
          tenantId: board.access.session.tenantId,
          actorUserId: board.access.session.userId,
          runId: board.response.runId,
          candidateId: candidate.id,
          eventType: "harness.governance_history_export_delivery_replay_requested",
          metadata: {
            bundleId: exportDelivery.bundleId,
            idempotencyKey: exportDelivery.idempotencyKey,
            previousStatus: exportDelivery.status,
            attemptCount: exportDelivery.attemptCount,
            primaryNotePath: exportDelivery.primaryNotePath,
            fileCount: exportDelivery.files.length,
            recordCount: exportDelivery.recordCount
          }
        })
      ]);

      return {
        candidateId: "governance_history_export",
        status: "delivery_replayed",
        idempotencyKey: exportDelivery.idempotencyKey,
        summary: "Governance history delivery replay has been re-queued through the bounded tenant-safe writer seam.",
        latestDelivery
      };
    },

    async replayPackageBundleDeliveryCandidate(request: {
      authorization: string;
      cookie?: string;
      runId: string;
      candidateId: HarnessExportCandidateId;
      actionToken?: string;
    }): Promise<HarnessPackageBundleDeliveryReplayResult> {
      const board = await loadExportBoardContext({
        repository: options.repository,
        authenticate: options.authenticate,
        requireTenantMember: options.requireTenantMember,
        requireActivePackageInstall: options.requireActivePackageInstall,
        workflowRegistry: options.workflowRegistry,
        ...(options.resolveWorkflowRegistry ? { resolveWorkflowRegistry: options.resolveWorkflowRegistry } : {}),
        authorization: request.authorization,
        ...(request.cookie ? { cookie: request.cookie } : {}),
        runId: request.runId
      });
      const candidate = findExportCandidateOrThrow(board.response.memoryBoundary.exportCandidates, request.candidateId);
      if (candidate.id !== "package_bundle_export") {
        throw new HarnessRunCompletionConflictError("Harness delivery replay only supports package bundle candidates");
      }
      const governanceHistoryCandidate = findExportCandidateOrThrow(
        board.response.memoryBoundary.exportCandidates,
        "governance_history_export"
      );
      if (!isGovernanceHistoryExportDependencySatisfied(governanceHistoryCandidate.latestDelivery)) {
        throw new HarnessRunCompletionConflictError(
          "Harness package bundle delivery replay is not available until governance history delivery completes for the current bundle"
        );
      }
      const action = findExportActionOrThrow(candidate, "package-bundle-export-replay");
      if (request.actionToken) {
        assertHarnessActionToken(action.actionHandle, request.actionToken);
      }
      const exportDelivery = findLatestExportDeliveryRecordOrThrow(board.exportDeliveries, candidate.id);
      if (exportDelivery.status === "delivered") {
        throw new HarnessRunCompletionConflictError("Harness package bundle delivery is already complete");
      }
      const currentDryRun = buildPackageBundleExportDryRun(board.response, candidate);
      assertExportReplayBundleCurrent({
        candidateLabel: "package bundle",
        currentBundleId: currentDryRun.bundleId,
        exportDelivery
      });

      await options.onPackageBundleExportReady?.({
        tenantId: board.access.session.tenantId,
        userId: board.access.session.userId,
        runId: board.response.runId,
        workflowId: board.response.workflowId,
        packageId: board.response.packageId,
        candidateId: "package_bundle_export",
        bundleId: exportDelivery.bundleId,
        bundleRevision: exportDelivery.bundleRevision,
        exportFormat: exportDelivery.exportFormat,
        recordTarget: "package_deliverable_record",
        idempotencyKey: exportDelivery.idempotencyKey,
        noteTitle: exportDelivery.noteTitle,
        noteFileName: exportDelivery.noteFileName,
        placement: {
          targetSystem: exportDelivery.placementTargetSystem as "obsidian_vault",
          vaultFolder: exportDelivery.vaultFolder,
          primaryNotePath: exportDelivery.primaryNotePath,
          syncStrategy: exportDelivery.syncStrategy as HarnessMemoryBoundarySyncStrategy,
          confirmationRequirement:
            exportDelivery.confirmationRequirement as HarnessMemoryBoundaryExportConfirmationRequirement
        },
        files: exportDelivery.files.map(cloneHarnessExportPackageFile),
        recordCount: exportDelivery.recordCount,
        disclosureSummary: exportDelivery.disclosureSummary,
        redactionSummary: exportDelivery.redactionSummary
      });

      const latestDelivery: HarnessExportCandidateDeliveryView = {
        status: "export_ready",
        statusLabel: humanizeExportDeliveryStatus("export_ready"),
        summary: "The package bundle was replayed back into the bounded tenant-safe writer seam and is waiting for delivery.",
        attemptCount: exportDelivery.attemptCount,
        contractFreshness: "current_bundle",
        contractFreshnessLabel: "Current bundle",
        contractFreshnessSummary: "The replayed delivery bundle still matches the current export contract.",
        ...(exportDelivery.writerKind ? { writerKindLabel: humanizeExportDeliveryWriterKind(exportDelivery.writerKind) } : {}),
        ...(exportDelivery.primaryNotePath ? { primaryNotePath: exportDelivery.primaryNotePath } : {})
      };

      await publishHarnessAuditEvents(options.audit, [
        createHarnessExportAuditEvent({
          tenantId: board.access.session.tenantId,
          actorUserId: board.access.session.userId,
          runId: board.response.runId,
          candidateId: candidate.id,
          eventType: "harness.package_bundle_export_delivery_replay_requested",
          metadata: {
            bundleId: exportDelivery.bundleId,
            idempotencyKey: exportDelivery.idempotencyKey,
            previousStatus: exportDelivery.status,
            attemptCount: exportDelivery.attemptCount,
            primaryNotePath: exportDelivery.primaryNotePath,
            fileCount: exportDelivery.files.length,
            recordCount: exportDelivery.recordCount
          }
        })
      ]);

      return {
        candidateId: "package_bundle_export",
        status: "delivery_replayed",
        idempotencyKey: exportDelivery.idempotencyKey,
        summary: "Package bundle delivery replay has been re-queued through the bounded tenant-safe writer seam.",
        latestDelivery
      };
    }
  };
}

async function loadExportBoardContext(input: {
  repository: HarnessRepository;
  authenticate(input: { authorization: string; cookie?: string }): Promise<ApiSession | null>;
  requireTenantMember(input: { tenantId: string; userId: string }): Promise<void>;
  requireActivePackageInstall(input: { tenantId: string; packageId: string }): Promise<void>;
  workflowRegistry: HarnessWorkflowRegistry;
  resolveWorkflowRegistry?(input: { tenantId: string; userId: string }): Promise<HarnessWorkflowRegistry>;
  authorization: string;
  cookie?: string;
  runId: string;
}) {
  const access = await authorizeHarnessRunRequest({
    authenticate: input.authenticate,
    requireTenantMember: input.requireTenantMember,
    requireActivePackageInstall: input.requireActivePackageInstall,
    repository: input.repository,
    authorization: input.authorization,
    ...(input.cookie ? { cookie: input.cookie } : {}),
    runId: input.runId
  });
  const { run } = access;
  const [cards, continuity, events, decisions, proposals, exportDeliveries, completionPackageSnapshot, governanceHistorySnapshot] = await Promise.all([
    input.repository.listCardsForRun(run.id),
    input.repository.listCardContinuityForRun(run.id),
    input.repository.listEventsForRun(run.id),
    input.repository.listDecisionsForRun(run.id),
    input.repository.listProposalsForRun(run.id),
    input.repository.listExportDeliveriesForRun(run.id),
    input.repository.getCompletionPackageSnapshot(run.id),
    input.repository.getGovernanceHistorySnapshot(run.id)
  ]);

  return {
    access,
    run,
    exportDeliveries,
    response: buildHarnessBoardResponse({
      run,
      cards,
      continuity,
      events,
      decisions,
      proposals,
      exportDeliveries,
      ...(completionPackageSnapshot ? { completionPackageSnapshot } : {}),
      ...(governanceHistorySnapshot ? { governanceHistorySnapshot } : {})
    })
  };
}

async function authorizeHarnessRunRequest(input: {
  authenticate(input: { authorization: string; cookie?: string }): Promise<ApiSession | null>;
  requireTenantMember(input: { tenantId: string; userId: string }): Promise<void>;
  requireActivePackageInstall(input: { tenantId: string; packageId: string }): Promise<void>;
  repository: HarnessRepository;
  authorization: string;
  cookie?: string;
  runId: string;
}): Promise<{ session: ApiSession; run: HarnessRunRecord }> {
  const session = await authenticateHarnessSession({
    authenticate: input.authenticate,
    requireTenantMember: input.requireTenantMember,
    authorization: input.authorization,
    ...(input.cookie ? { cookie: input.cookie } : {})
  });

  const run = await input.repository.getRun(input.runId);
  if (!run || run.tenantId !== session.tenantId) {
    throw new ApiAuthError();
  }

  await requireHarnessPackageAccess({
    requireActivePackageInstall: input.requireActivePackageInstall,
    tenantId: session.tenantId,
    packageId: run.packageId
  });

  return { session, run };
}

async function authorizeHarnessCardRequest(input: {
  authenticate(input: { authorization: string; cookie?: string }): Promise<ApiSession | null>;
  requireTenantMember(input: { tenantId: string; userId: string }): Promise<void>;
  requireActivePackageInstall(input: { tenantId: string; packageId: string }): Promise<void>;
  repository: HarnessRepository;
  authorization: string;
  cookie?: string;
  cardId: string;
}): Promise<{ session: ApiSession; run: HarnessRunRecord; card: HarnessCardRecord }> {
  const session = await authenticateHarnessSession({
    authenticate: input.authenticate,
    requireTenantMember: input.requireTenantMember,
    authorization: input.authorization,
    ...(input.cookie ? { cookie: input.cookie } : {})
  });

  const card = await input.repository.getCard(input.cardId);
  if (!card) {
    throw new HarnessCardProgressionConflictError("Harness child card was not found");
  }
  const run = await input.repository.getRun(card.runId);
  if (!run || run.tenantId !== session.tenantId) {
    throw new ApiAuthError();
  }

  await requireHarnessPackageAccess({
    requireActivePackageInstall: input.requireActivePackageInstall,
    tenantId: session.tenantId,
    packageId: run.packageId
  });

  return { session, run, card };
}

async function authorizeHarnessProposalRequest(input: {
  authenticate(input: { authorization: string; cookie?: string }): Promise<ApiSession | null>;
  requireTenantMember(input: { tenantId: string; userId: string }): Promise<void>;
  requireActivePackageInstall(input: { tenantId: string; packageId: string }): Promise<void>;
  repository: HarnessRepository;
  workflowRegistry: HarnessWorkflowRegistry;
  resolveWorkflowRegistry?(input: { tenantId: string; userId: string }): Promise<HarnessWorkflowRegistry>;
  authorization: string;
  cookie?: string;
  proposalId: string;
}): Promise<{
  session: ApiSession;
  run: HarnessRunRecord;
  proposal: HarnessSubCardProposal;
  workflowDefinition: WealthFactoryWorkflowDefinition;
}> {
  const session = await authenticateHarnessSession({
    authenticate: input.authenticate,
    requireTenantMember: input.requireTenantMember,
    authorization: input.authorization,
    ...(input.cookie ? { cookie: input.cookie } : {})
  });

  const proposal = await input.repository.getProposal(input.proposalId);
  if (!proposal) {
    throw new Error("Harness proposal was not found");
  }
  const run = await input.repository.getRun(proposal.runId);
  if (!run || run.tenantId !== session.tenantId) {
    throw new ApiAuthError();
  }

  await requireHarnessPackageAccess({
    requireActivePackageInstall: input.requireActivePackageInstall,
    tenantId: session.tenantId,
    packageId: run.packageId
  });

  const workflowRegistry = input.resolveWorkflowRegistry
    ? await input.resolveWorkflowRegistry({ tenantId: session.tenantId, userId: session.userId })
    : input.workflowRegistry;

  let workflowDefinition: WealthFactoryWorkflowDefinition;
  try {
    workflowDefinition = workflowRegistry.getDefinition(run.workflowId);
  } catch (error) {
    if (error instanceof Error) {
      throw new HarnessWorkflowSelectionError(error.message);
    }
    throw error;
  }

  return { session, run, proposal, workflowDefinition };
}

async function authorizeHarnessRequest(input: {
  authenticate(input: { authorization: string; cookie?: string }): Promise<ApiSession | null>;
  requireTenantMember(input: { tenantId: string; userId: string }): Promise<void>;
  requireActivePackageInstall(input: { tenantId: string; packageId: string }): Promise<void>;
  workflowRegistry: HarnessWorkflowRegistry;
  resolveWorkflowRegistry?(input: { tenantId: string; userId: string }): Promise<HarnessWorkflowRegistry>;
  authorization: string;
  requestedWorkflowId?: string;
  cookie?: string;
}): Promise<{ session: ApiSession; workflowDefinition: WealthFactoryWorkflowDefinition }> {
  const session = await authenticateHarnessSession({
    authenticate: input.authenticate,
    requireTenantMember: input.requireTenantMember,
    authorization: input.authorization,
    ...(input.cookie ? { cookie: input.cookie } : {})
  });

  const workflowRegistry = input.resolveWorkflowRegistry
    ? await input.resolveWorkflowRegistry({ tenantId: session.tenantId, userId: session.userId })
    : input.workflowRegistry;

  let workflowDefinition: WealthFactoryWorkflowDefinition;
  try {
    workflowDefinition = workflowRegistry.resolveBoardWorkflowDefinition
      ? workflowRegistry.resolveBoardWorkflowDefinition(input.requestedWorkflowId)
      : resolveBoardWorkflowDefinitionFallback(workflowRegistry, input.requestedWorkflowId);
  } catch (error) {
    if (error instanceof Error) {
      throw new HarnessWorkflowSelectionError(error.message);
    }
    throw error;
  }
  await requireHarnessPackageAccess({
    requireActivePackageInstall: input.requireActivePackageInstall,
    tenantId: session.tenantId,
    packageId: workflowDefinition.packageId
  });

  return { session, workflowDefinition };
}

async function authenticateHarnessSession(input: {
  authenticate(input: { authorization: string; cookie?: string }): Promise<ApiSession | null>;
  requireTenantMember(input: { tenantId: string; userId: string }): Promise<void>;
  authorization: string;
  cookie?: string;
}): Promise<ApiSession> {
  const session = await input.authenticate({
    authorization: input.authorization,
    ...(input.cookie ? { cookie: input.cookie } : {})
  });
  if (!session) {
    throw new ApiAuthError();
  }
  try {
    await input.requireTenantMember({ tenantId: session.tenantId, userId: session.userId });
  } catch (error) {
    if (error instanceof TenantMembershipRequiredError) {
      throw new ApiAuthError();
    }
    throw error;
  }
  return session;
}

async function requireHarnessPackageAccess(input: {
  requireActivePackageInstall(input: { tenantId: string; packageId: string }): Promise<void>;
  tenantId: string;
  packageId: string;
}) {
  try {
    await input.requireActivePackageInstall({
      tenantId: input.tenantId,
      packageId: input.packageId
    });
  } catch (error) {
    if (error instanceof ActivePackageInstallRequiredError) {
      throw new ApiAuthError();
    }
    throw error;
  }
}

function resolveBoardWorkflowDefinitionFallback(
  workflowRegistry: HarnessWorkflowRegistry,
  requestedWorkflowId?: string
): WealthFactoryWorkflowDefinition {
  const workflowIds = workflowRegistry.listBoardExposedWorkflowIds();
  if (workflowIds.length === 0) {
    throw new Error("Harness workflow is not enabled");
  }
  if (requestedWorkflowId) {
    if (!workflowIds.includes(requestedWorkflowId)) {
      throw new Error("Harness workflow is not enabled");
    }
    return workflowRegistry.getDefinition(requestedWorkflowId);
  }
  if (workflowIds.length > 1) {
    throw new Error("Harness workflow selector is ambiguous");
  }
  const workflowId = workflowIds[0];
  if (!workflowId) {
    throw new Error("Harness workflow is not enabled");
  }
  return workflowRegistry.getDefinition(workflowId);
}

async function getOrCreateCurrentRun(input: {
  repository: HarnessRepository;
  runAtomically?<T>(work: (repository: HarnessRepository) => Promise<T>): Promise<T>;
  runtime: ReturnType<typeof createHarnessRuntime>;
  tenantId: string;
  workflowDefinition: WealthFactoryWorkflowDefinition;
}): Promise<HarnessRunRecord> {
  return (
    (await input.repository.findLatestRunForTenantWorkflow({
      tenantId: input.tenantId,
      workflowId: input.workflowDefinition.publicId
    })) ??
    (await ensureSeededHarnessRun({
      repository: input.repository,
      runtime: input.runtime,
      tenantId: input.tenantId,
      workflowDefinition: input.workflowDefinition,
      ...(input.runAtomically ? { runAtomically: input.runAtomically } : {})
    }))
  );
}

async function ensureSeededHarnessRun(input: {
  repository: HarnessRepository;
  runAtomically?<T>(work: (repository: HarnessRepository) => Promise<T>): Promise<T>;
  runtime: ReturnType<typeof createHarnessRuntime>;
  tenantId: string;
  workflowDefinition: WealthFactoryWorkflowDefinition;
}): Promise<HarnessRunRecord> {
  const seedWork = async (repository: HarnessRepository) => {
    const existing = await repository.findLatestRunForTenantWorkflow({
      tenantId: input.tenantId,
      workflowId: input.workflowDefinition.publicId
    });
    if (existing) {
      return existing;
    }

    return seedHarnessRun({
      repository,
      runtime: input.runtime,
      tenantId: input.tenantId,
      workflowDefinition: input.workflowDefinition
    });
  };

  try {
    if (input.runAtomically) {
      return await input.runAtomically(seedWork);
    }

    return await seedWork(input.repository);
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      const existing = await input.repository.findLatestRunForTenantWorkflow({
        tenantId: input.tenantId,
        workflowId: input.workflowDefinition.publicId
      });
      if (existing) {
        return existing;
      }
    }

    throw error;
  }
}

async function seedHarnessRun(input: {
  repository: HarnessRepository;
  runtime: ReturnType<typeof createHarnessRuntime>;
  tenantId: string;
  workflowDefinition: WealthFactoryWorkflowDefinition;
}): Promise<HarnessRunRecord> {
  const session = input.runtime.startRun({
    tenantId: input.tenantId,
    workflowId: input.workflowDefinition.publicId,
    packageId: input.workflowDefinition.packageId,
    runtimeContext: {
      providerKind: "openai_api",
      credentialLabel: "Connected provider"
    }
  });

  const run = transitionHarnessRun(session.run, "active");
  const ceoCard = session.ceoCard;
  const cards = [ceoCard];

  await input.repository.insertRun(run);
  for (const card of cards) {
    await input.repository.insertCard(card);
    for (const event of createBootstrapEvents(card)) {
      await input.repository.insertEvent(event);
    }
  }

  return run;
}

async function seedFreshHarnessRun(input: {
  repository: HarnessRepository;
  runtime: ReturnType<typeof createHarnessRuntime>;
  fromRun: HarnessRunRecord;
}): Promise<HarnessRunRecord> {
  const session = input.runtime.startRun({
    tenantId: input.fromRun.tenantId,
    workflowId: input.fromRun.workflowId,
    packageId: input.fromRun.packageId,
    runtimeContext: {
      providerKind: input.fromRun.runtimeContext.providerKind,
      credentialLabel: input.fromRun.runtimeContext.credentialLabel
    }
  });

  const run = transitionHarnessRun(session.run, "active");
  const ceoCard = session.ceoCard;

  await input.repository.insertRun(run);
  await input.repository.insertCard(ceoCard);
  for (const event of createBootstrapEvents(ceoCard)) {
    await input.repository.insertEvent(event);
  }

  return run;
}

function createBootstrapEvents(card: HarnessCardRecord): HarnessCardEventRecord[] {
  const events = [
    createHarnessCardEventRecord({
      cardId: card.id,
      eventKind: "created",
      payload: { title: card.title, persona: card.persona, state: card.state }
    })
  ];

  if (card.state !== "queued") {
    events.push(
      createHarnessCardEventRecord({
        cardId: card.id,
        eventKind: "state_changed",
        payload: { to: card.state }
      })
    );
  }

  return events;
}

async function reconcileHarnessRunState(input: {
  repository: HarnessRepository;
  run: HarnessRunRecord;
}): Promise<HarnessRunRecord | null> {
  if (isTerminalHarnessRunState(input.run.state)) {
    return null;
  }

  const [cards, proposals] = await Promise.all([
    input.repository.listCardsForRun(input.run.id),
    input.repository.listProposalsForRun(input.run.id)
  ]);
  const nextState = deriveHarnessRunState({
    run: input.run,
    cards,
    proposals
  });
  if (nextState === input.run.state) {
    return null;
  }

  const transitionedRun = transitionHarnessRun(input.run, nextState);
  return input.repository.updateRunState({
    runId: input.run.id,
    state: transitionedRun.state
  });
}

function createHarnessAuditEvent(input: {
  tenantId: string;
  actorUserId: string;
  eventType: string;
  entityId: string;
  metadata: Record<string, unknown>;
}): DurableAuditEvent {
  return {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    eventType: input.eventType,
    entityType: "harness",
    entityId: input.entityId,
    metadata: input.metadata
  };
}

function createHarnessExportAuditEvent(input: {
  tenantId: string;
  actorUserId: string;
  runId: string;
  candidateId: HarnessExportCandidateId;
  eventType: string;
  metadata: Record<string, unknown>;
}): DurableAuditEvent {
  return {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    eventType: input.eventType,
    entityType: "harness_export_candidate",
    entityId: input.candidateId,
    metadata: {
      runId: input.runId,
      candidateId: input.candidateId,
      ...input.metadata
    }
  };
}

function toRunAuditEvents(input: {
  tenantId: string;
  actorUserId: string;
  runId: string;
  previousState: HarnessRunRecord["state"];
  nextRun: HarnessRunRecord | null;
}): DurableAuditEvent[] {
  if (!input.nextRun || input.nextRun.state === input.previousState) {
    return [];
  }

  return [
    createHarnessAuditEvent({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      eventType: "harness_run_reconciled",
      entityId: input.runId,
      metadata: {
        fromState: input.previousState,
        toState: input.nextRun.state
      }
    })
  ];
}

async function publishHarnessAuditEvents(audit: HarnessAudit | undefined, events: readonly DurableAuditEvent[]) {
  if (!audit || events.length === 0) {
    return;
  }

  for (const event of events) {
    try {
      await audit(event);
    } catch (error) {
      console.warn("Harness audit publish failed after mutation commit", {
        eventType: event.eventType,
        entityId: event.entityId,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

function findMatchingOpenChildCard(
  cards: readonly HarnessCardRecord[],
  target: { persona: string; title: string; deliverableType: string }
): HarnessCardRecord | undefined {
  return cards.find(
    (card) =>
      card.persona !== "ceo" &&
      isOpenCardState(card.state) &&
      card.persona === target.persona &&
      titlesLikelySameAssignment(card.title, target.title) &&
      card.deliverableType === target.deliverableType
  );
}

function findOpenChildCardByDeliverableType(
  cards: readonly HarnessCardRecord[],
  deliverableType: string
): HarnessCardRecord | undefined {
  return cards.find(
    (card) =>
      card.persona !== "ceo" &&
      isOpenCardState(card.state) &&
      card.deliverableType === deliverableType
  );
}

function findOpenChildCardByPersonaDeliverable(
  cards: readonly HarnessCardRecord[],
  target: { persona: string; deliverableType: string }
): HarnessCardRecord | undefined {
  return cards.find(
    (card) =>
      card.persona !== "ceo" &&
      isOpenCardState(card.state) &&
      card.persona === target.persona &&
      card.deliverableType === target.deliverableType
  );
}

function findOpenChildCardByPersona(
  cards: readonly HarnessCardRecord[],
  persona: string
): HarnessCardRecord | undefined {
  return cards.find(
    (card) =>
      card.persona !== "ceo" &&
      isOpenCardState(card.state) &&
      card.persona === persona
  );
}

function findLatestDoneChildCardByPersonaDeliverable(
  cards: readonly HarnessCardRecord[],
  target: { persona: string; deliverableType: string }
): HarnessCardRecord | undefined {
  for (let index = cards.length - 1; index >= 0; index -= 1) {
    const card = cards[index];
    if (
      card &&
      card.persona !== "ceo" &&
      card.state === "done" &&
      card.persona === target.persona &&
      card.deliverableType === target.deliverableType
    ) {
      return card;
    }
  }

  return undefined;
}

function isBoundedLaneRefinement(input: {
  proposal: Pick<HarnessSubCardProposal, "title" | "parentCardId" | "requestedByCardId">;
  candidateCard: HarnessCardRecord;
}): boolean {
  return (
    isBoundedAssignmentContinuation(input.proposal.title, input.candidateCard.title) ||
    input.proposal.parentCardId === input.candidateCard.id ||
    input.proposal.requestedByCardId === input.candidateCard.id
  );
}

function isBoundedCardRefinement(input: {
  title: string;
  candidateCard: HarnessCardRecord;
}): boolean {
  return isBoundedAssignmentContinuation(input.title, input.candidateCard.title);
}

function isBoundedAssignmentContinuation(left: string, right: string): boolean {
  return titlesLikelySameAssignment(left, right) || hasMeaningfulAssignmentTokenOverlap(left, right);
}

function hasMeaningfulAssignmentTokenOverlap(left: string, right: string): boolean {
  const leftMeaningfulTokens = uniqueMeaningfulAssignmentTokens(left);
  const rightMeaningfulTokens = uniqueMeaningfulAssignmentTokens(right);
  const leftSet = new Set(leftMeaningfulTokens);
  const sharedTokens = rightMeaningfulTokens.filter((token) => leftSet.has(token));

  if (sharedTokens.length >= 2) {
    return true;
  }
  return (
    sharedTokens.length === 1 &&
    sharedTokens[0]!.length >= 6 &&
    leftMeaningfulTokens.length === 1 &&
    rightMeaningfulTokens.length === 1
  );
}

function titlesLikelySameAssignment(left: string, right: string): boolean {
  const leftTokens = tokenizeAssignmentTitle(left);
  const rightTokens = tokenizeAssignmentTitle(right);

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return left.trim().toLowerCase() === right.trim().toLowerCase();
  }

  const leftCanonical = leftTokens.join(" ");
  const rightCanonical = rightTokens.join(" ");
  if (leftCanonical === rightCanonical) {
    return true;
  }

  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  const overlapCount = [...leftSet].filter((token) => rightSet.has(token)).length;
  const overlapRatio = overlapCount / Math.max(leftSet.size, rightSet.size);
  const firstTokenMatches = leftTokens[0] === rightTokens[0];
  const lastTokenMatches = leftTokens.at(-1) === rightTokens.at(-1);

  return Math.min(leftSet.size, rightSet.size) >= 3 && overlapRatio >= 0.75 && (firstTokenMatches || lastTokenMatches);
}

function tokenizeAssignmentTitle(title: string): string[] {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((token) => normalizeAssignmentToken(token))
    .filter((token) => token.length > 0);
}

function normalizeAssignmentToken(token: string): string {
  if (token.endsWith("ing") && token.length > 5) {
    const base = token.slice(0, -3);
    return base.endsWith("c") ? `${base}e` : base;
  }
  if (token.endsWith("es") && token.length > 4) {
    return token.slice(0, -2);
  }
  if (token.endsWith("s") && token.length > 4) {
    return token.slice(0, -1);
  }
  return token;
}

const GENERIC_ASSIGNMENT_TOKENS = new Set([
  "add",
  "build",
  "check",
  "create",
  "draft",
  "gather",
  "improve",
  "make",
  "memo",
  "note",
  "plan",
  "prepare",
  "refresh",
  "review",
  "revise",
  "summary",
  "task",
  "update",
  "work",
  "write"
]);

function uniqueMeaningfulAssignmentTokens(title: string): string[] {
  return [...new Set(tokenizeAssignmentTitle(title).filter((token) => !GENERIC_ASSIGNMENT_TOKENS.has(token)))];
}

function findEarlierUnresolvedSiblingProposal(
  proposals: readonly HarnessSubCardProposal[],
  currentProposal: HarnessSubCardProposal
): HarnessSubCardProposal | null {
  const currentIndex = proposals.findIndex((proposal) => proposal.id === currentProposal.id);
  if (currentIndex <= 0) {
    return null;
  }

  const earlierProposals = proposals.slice(0, currentIndex);
  for (let index = earlierProposals.length - 1; index >= 0; index -= 1) {
    const proposal = earlierProposals[index];
    if (!proposal) {
      continue;
    }

    if (
      proposal.requestedByCardId === currentProposal.requestedByCardId &&
      proposal.persona === currentProposal.persona &&
      titlesLikelySameAssignment(proposal.title, currentProposal.title) &&
      proposal.deliverableType === currentProposal.deliverableType &&
      (proposal.status === "proposed" || proposal.status === "deferred")
    ) {
      return proposal;
    }
  }

  return null;
}

function findLatestUnresolvedTopLevelProposalForAssignment(
  proposals: readonly HarnessSubCardProposal[],
  target: { ceoCardId: string; persona: string; title: string; deliverableType: string }
): HarnessSubCardProposal | null {
  for (let index = proposals.length - 1; index >= 0; index -= 1) {
    const proposal = proposals[index];
    if (!proposal) {
      continue;
    }

    if (
      proposal.parentCardId === target.ceoCardId &&
      proposal.requestedByCardId === target.ceoCardId &&
      proposal.persona === target.persona &&
      proposal.deliverableType === target.deliverableType &&
      titlesLikelySameAssignment(proposal.title, target.title) &&
      (proposal.status === "proposed" || proposal.status === "deferred")
    ) {
      return proposal;
    }
  }

  return null;
}

function countOpenChildCards(cards: readonly HarnessCardRecord[]): number {
  return cards.filter((card) => card.persona !== "ceo" && isOpenCardState(card.state)).length;
}

function isOpenCardState(state: HarnessCardRecord["state"]): boolean {
  return state !== "done" && state !== "cancelled";
}

async function recordAbsorbedLaneContinuity(input: {
  repository: HarnessRepository;
  card: HarnessCardRecord;
  proposal: HarnessSubCardProposal;
  resolution: "update_existing_lane" | "handoff_existing_lane";
  continuitySourcePersona?: string;
  continuitySourceTitle?: string;
}): Promise<void> {
  const existing = await input.repository.getCardContinuity(input.card.id);
  const absorbedWorkItem = createContinuityAbsorbedWorkItem({
    resolution: input.resolution,
    requestedByPersona: input.continuitySourcePersona ?? input.proposal.requestedByPersona,
    title: input.continuitySourceTitle ?? input.proposal.title
  });
  const absorbedWorkItems = mergeContinuityAbsorbedWorkItems(existing?.absorbedWorkItems ?? [], absorbedWorkItem);

  await input.repository.upsertCardContinuity(
    createHarnessCardContinuityRecord({
      cardId: input.card.id,
      runId: input.card.runId,
      continuitySource: input.resolution === "handoff_existing_lane" ? "lane_handoff" : "proposal_absorbed",
      latestResultSummary: existing?.latestResultSummary ?? null,
      continuitySummary: createAbsorbedLaneResumeSummary({
        card: input.card,
        absorbedWorkItem,
        resolution: input.resolution
      }),
      absorbedWorkItems
    })
  );
}

async function recordDirectChildLaneReuseContinuity(input: {
  repository: HarnessRepository;
  card: HarnessCardRecord;
  title: string;
}): Promise<void> {
  const existing = await input.repository.getCardContinuity(input.card.id);
  const absorbedWorkItem = createContinuityAbsorbedWorkItem({
    resolution: "update_existing_lane",
    requestedByPersona: "ceo",
    title: input.title
  });
  const absorbedWorkItems = mergeContinuityAbsorbedWorkItems(existing?.absorbedWorkItems ?? [], absorbedWorkItem);

  await input.repository.upsertCardContinuity(
    createHarnessCardContinuityRecord({
      cardId: input.card.id,
      runId: input.card.runId,
      continuitySource: "proposal_absorbed",
      latestResultSummary: existing?.latestResultSummary ?? null,
      continuitySummary: createAbsorbedLaneResumeSummary({
        card: input.card,
        absorbedWorkItem,
        resolution: "update_existing_lane"
      }),
      absorbedWorkItems
    })
  );
}

async function recordCardStateContinuity(input: {
  repository: HarnessRepository;
  card: HarnessCardRecord;
  resumeSummary?: string;
}): Promise<void> {
  const existing = await input.repository.getCardContinuity(input.card.id);
  await input.repository.upsertCardContinuity(
    createHarnessCardContinuityRecord({
      cardId: input.card.id,
      runId: input.card.runId,
      continuitySource: input.resumeSummary ? "resume_override" : "state_transition",
      continuitySummary: input.resumeSummary ?? createDefaultResumeSummary(input.card),
      latestResultSummary: existing?.latestResultSummary ?? null,
      absorbedWorkItems: existing?.absorbedWorkItems ?? []
    })
  );
}

async function recordLatestResultContinuity(input: {
  repository: HarnessRepository;
  card: HarnessCardRecord;
  resultSummary: string;
  resumeSummary?: string;
}): Promise<void> {
  const existing = await input.repository.getCardContinuity(input.card.id);
  await input.repository.upsertCardContinuity(
    createHarnessCardContinuityRecord({
      cardId: input.card.id,
      runId: input.card.runId,
      continuitySource: "result_recorded",
      continuitySummary: input.resumeSummary ?? createDefaultResumeSummary(input.card),
      latestResultSummary: input.resultSummary,
      absorbedWorkItems: existing?.absorbedWorkItems ?? []
    })
  );
}

function buildHarnessBoardResponse(input: {
  run: HarnessRunRecord;
  cards: readonly HarnessCardRecord[];
  continuity: readonly HarnessCardContinuityRecord[];
  events: readonly HarnessCardEventRecord[];
  decisions: readonly HarnessBoardDecisionRecord[];
  proposals: readonly HarnessSubCardProposal[];
  exportDeliveries?: readonly HarnessExportDeliveryRecord[];
  completionPackageSnapshot?: HarnessCompletionPackageSnapshotRecord;
  governanceHistorySnapshot?: HarnessGovernanceHistorySnapshotRecord;
}): HarnessBoardResponse {
  const eventsByCardId = new Map<string, HarnessCardEventRecord[]>();
  const activityByCardId = new Map<string, HarnessBoardActivityItem[]>();
  const latestResultSummaryByCardId = new Map<string, string>();
  for (const event of input.events) {
    const cardEvents = eventsByCardId.get(event.cardId) ?? [];
    eventsByCardId.set(event.cardId, [...cardEvents, event]);
    const items = activityByCardId.get(event.cardId) ?? [];
    activityByCardId.set(event.cardId, [...items, toBoardActivityItem(event)]);
    if (event.eventKind === "result_recorded") {
      const summary = readOptionalString(event.payload.summary);
      if (summary) {
        latestResultSummaryByCardId.set(event.cardId, summary);
      }
    }
  }
  const continuityByCardId = new Map<string, HarnessCardContinuityRecord>();
  for (const record of input.continuity) {
    continuityByCardId.set(record.cardId, record);
    if (record.latestResultSummary) {
      latestResultSummaryByCardId.set(record.cardId, record.latestResultSummary);
    }
  }

  const cards = input.cards.map((card) =>
    toBoardCardView({
      card,
      cardEvents: eventsByCardId.get(card.id) ?? [],
      activity: activityByCardId.get(card.id) ?? [],
      continuity: continuityByCardId.get(card.id) ?? null,
      ...(latestResultSummaryByCardId.has(card.id)
        ? { resultSummary: latestResultSummaryByCardId.get(card.id)! }
        : {})
    })
  );

  const columns = createBoardColumns(cards);
  const completionPackage =
    input.completionPackageSnapshot
      ? toCompletionPackageView(input.completionPackageSnapshot)
      : buildCompletionPackage({
          run: input.run,
          cards: input.cards,
          latestResultSummaryByCardId,
          proposals: input.proposals,
          decisions: input.decisions
        });
  const governanceHistory =
    input.governanceHistorySnapshot
      ? toGovernanceHistoryView(input.governanceHistorySnapshot)
      : buildGovernanceHistorySnapshot(input.decisions);
  const recentDecisions = governanceHistory.recentDecisions;
  const followThroughItems = governanceHistory.followThroughItems;
  const pendingAttention = buildPendingAttentionView({
    run: input.run,
    cards: input.cards,
    continuityByCardId,
    proposals: input.proposals,
    events: input.events
  });
  const memoryBoundary = buildMemoryBoundaryView({
    runId: input.run.id,
    workflowId: input.run.workflowId,
    packageId: input.run.packageId,
    continuity: input.continuity,
    hasPendingAttention: Boolean(pendingAttention),
    recentDecisions,
    followThroughItems,
    completionPackage,
    decisionRecords: input.decisions,
    exportDeliveries: input.exportDeliveries ?? []
  });
  const sortedPendingProposals = input.proposals
    .filter((proposal) => proposal.status === "proposed" || proposal.status === "deferred")
    .sort(comparePendingProposalQueue);
  const latestDecisionByProposalId = new Map<string, HarnessBoardDecisionRecord>();
  for (const decision of input.decisions) {
    if (decision.proposalId && !latestDecisionByProposalId.has(decision.proposalId)) {
      latestDecisionByProposalId.set(decision.proposalId, decision);
    }
  }

  return {
    runId: input.run.id,
    workflowId: input.run.workflowId,
    packageId: input.run.packageId,
    columns,
    cards,
    pendingApprovals: sortedPendingProposals.map((proposal) => {
        const siblingProposal = proposal.status === "proposed"
          ? findEarlierUnresolvedSiblingProposal(input.proposals, proposal)
          : null;
        const siblingDecision = siblingProposal
          ? latestDecisionByProposalId.get(siblingProposal.id) ?? null
          : null;
        const livePolicyReason = determineProposalPolicyReason({
          run: input.run,
          cards: input.cards,
          proposal
        });
        const proposalPolicyReason = proposal.status === "proposed" &&
          isPendingApprovalPolicyReason(siblingDecision?.policyReason) &&
          siblingDecision.policyReason === livePolicyReason
          ? siblingDecision.policyReason
          : livePolicyReason;
        const policyView = toPendingApprovalPolicyView({
          cards: input.cards,
          proposal,
          policyReason: proposalPolicyReason,
          latestDecision: latestDecisionByProposalId.get(proposal.id) ?? null
        });

        return {
          id: proposal.id,
          title: proposal.title,
          requestedByPersona: proposal.requestedByPersona.toUpperCase(),
          targetPersona: proposal.persona.toUpperCase(),
          deliverableLabel: humanizeDeliverableType(proposal.deliverableType),
          statusLabel: proposal.status === "deferred" ? "Deferred for later CEO review" : "Pending CEO approval",
          actionRoute: "proposal-decision",
          actionPath: `/api/harness/proposals/${encodeURIComponent(proposal.id)}/decision`,
          actionMethod: "POST" as const,
          actionHandle: createPendingApprovalActionToken({
            proposal,
            policyReason: proposalPolicyReason,
            ...(policyView.handoffTargetCardId ? { handoffTargetCardId: policyView.handoffTargetCardId } : {}),
            ...(latestDecisionByProposalId.get(proposal.id)?.createdAt
              ? { latestDecisionCreatedAt: latestDecisionByProposalId.get(proposal.id)!.createdAt }
              : {})
          }),
          actionLabel: "Review proposal decision",
          actionDescription: "Choose whether this proposed follow-on work should be approved, deferred, or denied.",
          requestFields: buildPendingApprovalRequestFields(policyView.handoffTargetCardId),
          actionOptions: buildPendingApprovalActionOptions(policyView),
          ...(proposal.status === "proposed"
            ? {
                recommendedOptionValue: determinePendingApprovalRecommendedOption({
                  policyReason: proposalPolicyReason,
                  ...(policyView.handoffTargetCardId
                    ? { handoffTargetCardId: policyView.handoffTargetCardId }
                    : {})
                })
              }
            : {}),
          allowedDecisions: ["approve", "defer", "deny"],
          ...(policyView.handoffTargetPersona && policyView.handoffTargetTitle
            ? {
                targetSummary: `Reuse ${policyView.handoffTargetPersona} lane: ${policyView.handoffTargetTitle}`
              }
            : {}),
          ...policyView
        };
      }),
    ...(pendingAttention ? { pendingAttention } : {}),
    recentDecisions,
    followThroughItems,
    memoryBoundary,
    ...(completionPackage ? { completionPackage } : {})
  };
}

function buildMemoryBoundaryView(input: {
  runId: string;
  workflowId: string;
  packageId: string;
  continuity: readonly HarnessCardContinuityRecord[];
  hasPendingAttention: boolean;
  recentDecisions: readonly HarnessRecentDecisionView[];
  followThroughItems: readonly HarnessFollowThroughView[];
  completionPackage: HarnessCompletionPackageView | undefined;
  decisionRecords: readonly HarnessBoardDecisionRecord[];
  exportDeliveries: readonly HarnessExportDeliveryRecord[];
}): HarnessMemoryBoundaryView {
  const isGovernanceExportReadyItem = (
    item: HarnessMemoryBoundaryItemView
  ): item is HarnessMemoryBoundaryItemView & { id: "governance_decisions" | "implemented_actions" } =>
    item.id === "governance_decisions" || item.id === "implemented_actions";
  const isPackageExportReadyItem = (
    item: HarnessMemoryBoundaryItemView
  ): item is HarnessMemoryBoundaryItemView & { id: "package_governance" | "package_deliverables" } =>
    item.id === "package_governance" || item.id === "package_deliverables";
  const operationalItems: HarnessMemoryBoundaryItemView[] = [
    {
      id: "lane_continuity",
      label: "Lane continuity",
      count: input.continuity.length,
      summary: "Continuity snapshots stay in Wealth Factory runtime as live operational memory.",
      destination: "wealth_factory_runtime",
      readiness: "live_runtime_only",
      readinessLabel: "Live runtime only",
      role: "runtime_memory",
      roleLabel: humanizeMemoryBoundaryRole("runtime_memory"),
      eligibilityRule: "runtime_only",
      eligibilityRuleLabel: humanizeMemoryBoundaryEligibilityRule("runtime_only"),
      sourceSurface: "continuity_snapshots",
      sourceSurfaceLabel: humanizeMemoryBoundarySourceSurface("continuity_snapshots"),
      candidateClass: "runtime_operational",
      candidateClassLabel: humanizeMemoryBoundaryCandidateClass("runtime_operational"),
      durabilityCondition: "runtime_ephemeral",
      durabilityConditionLabel: humanizeMemoryBoundaryDurabilityCondition("runtime_ephemeral"),
      ownershipBoundary: "wealth_factory_only",
      ownershipBoundaryLabel: humanizeMemoryBoundaryOwnershipBoundary("wealth_factory_only"),
      promotionPath: "never_promotes",
      promotionPathLabel: humanizeMemoryBoundaryPromotionPath("never_promotes"),
      recordTarget: "none_runtime_only",
      recordTargetLabel: humanizeMemoryBoundaryRecordTarget("none_runtime_only"),
      promotionBlocker: "not_applicable_runtime_only",
      promotionBlockerLabel: humanizeMemoryBoundaryPromotionBlocker("not_applicable_runtime_only"),
      promotionAuthority: "wealth_factory_runtime_only",
      promotionAuthorityLabel: humanizeMemoryBoundaryPromotionAuthority("wealth_factory_runtime_only"),
      promotionTrigger: "not_applicable_runtime",
      promotionTriggerLabel: humanizeMemoryBoundaryPromotionTrigger("not_applicable_runtime"),
      promotionState: "runtime_only",
      promotionStateLabel: humanizeMemoryBoundaryPromotionState("runtime_only"),
      promotionNextStep: "none_runtime_only",
      promotionNextStepLabel: humanizeMemoryBoundaryPromotionNextStep("none_runtime_only"),
      promotionActionFamily: "none_runtime_only",
      promotionActionFamilyLabel: humanizeMemoryBoundaryPromotionActionFamily("none_runtime_only"),
      assemblyShape: "none_runtime_only",
      assemblyShapeLabel: humanizeMemoryBoundaryAssemblyShape("none_runtime_only"),
      promotionPhase: "not_exported_runtime",
      promotionPhaseLabel: humanizeMemoryBoundaryPromotionPhase("not_exported_runtime"),
      promotionMutability: "runtime_mutable",
      promotionMutabilityLabel: humanizeMemoryBoundaryPromotionMutability("runtime_mutable"),
      promotionScope: "none_runtime_only",
      promotionScopeLabel: humanizeMemoryBoundaryPromotionScope("none_runtime_only"),
      identityStability: "runtime_transient_identity",
      identityStabilityLabel: humanizeMemoryBoundaryIdentityStability("runtime_transient_identity"),
      auditBacking: "runtime_state_only",
      auditBackingLabel: humanizeMemoryBoundaryAuditBacking("runtime_state_only"),
      concurrencyBoundary: "runtime_only",
      concurrencyBoundaryLabel: humanizeMemoryBoundaryConcurrencyBoundary("runtime_only"),
      exportPayloadShape: "none_runtime_only",
      exportPayloadShapeLabel: humanizeMemoryBoundaryExportPayloadShape("none_runtime_only"),
      idempotencyPolicy: "not_applicable_runtime",
      idempotencyPolicyLabel: humanizeMemoryBoundaryIdempotencyPolicy("not_applicable_runtime"),
      replaySafety: "runtime_only",
      replaySafetyLabel: humanizeMemoryBoundaryReplaySafety("runtime_only"),
      conflictPolicy: "runtime_only",
      conflictPolicyLabel: humanizeMemoryBoundaryConflictPolicy("runtime_only"),
      exportAtomicity: "none_runtime_only",
      exportAtomicityLabel: humanizeMemoryBoundaryExportAtomicity("none_runtime_only"),
      exportDerivationBasis: "none_runtime_only",
      exportDerivationBasisLabel: humanizeMemoryBoundaryExportDerivationBasis("none_runtime_only"),
      exportRevisionPolicy: "none_runtime_only",
      exportRevisionPolicyLabel: humanizeMemoryBoundaryExportRevisionPolicy("none_runtime_only"),
      exportFreshnessSource: "none_runtime_only",
      exportFreshnessSourceLabel: humanizeMemoryBoundaryExportFreshnessSource("none_runtime_only"),
      exportValidationBoundary: "none_runtime_only",
      exportValidationBoundaryLabel: humanizeMemoryBoundaryExportValidationBoundary("none_runtime_only"),
      exportCompletenessRule: "none_runtime_only",
      exportCompletenessRuleLabel: humanizeMemoryBoundaryExportCompletenessRule("none_runtime_only"),
      exportSensitivity: "none_runtime_only",
      exportSensitivityLabel: humanizeMemoryBoundaryExportSensitivity("none_runtime_only"),
      exportAudienceBoundary: "wealth_factory_runtime_only",
      exportAudienceBoundaryLabel: humanizeMemoryBoundaryExportAudienceBoundary("wealth_factory_runtime_only"),
      exportSanitizationPolicy: "none_runtime_only",
      exportSanitizationPolicyLabel: humanizeMemoryBoundaryExportSanitizationPolicy("none_runtime_only"),
      exportRedactionBoundary: "runtime_internal_only",
      exportRedactionBoundaryLabel: humanizeMemoryBoundaryExportRedactionBoundary("runtime_internal_only"),
      exportSourceDisclosurePolicy: "runtime_only",
      exportSourceDisclosurePolicyLabel: humanizeMemoryBoundaryExportSourceDisclosurePolicy("runtime_only"),
      memoryPlacement: "none_runtime_only",
      memoryPlacementLabel: humanizeMemoryBoundaryMemoryPlacement("none_runtime_only"),
      syncStrategy: "none_runtime_only",
      syncStrategyLabel: humanizeMemoryBoundarySyncStrategy("none_runtime_only"),
      exportRequestShape: "none_runtime_only",
      exportRequestShapeLabel: humanizeMemoryBoundaryExportRequestShape("none_runtime_only"),
      exportConfirmationRequirement: "none_runtime_only",
      exportConfirmationRequirementLabel: humanizeMemoryBoundaryExportConfirmationRequirement("none_runtime_only"),
      exportRecoveryPath: "runtime_only",
      exportRecoveryPathLabel: humanizeMemoryBoundaryExportRecoveryPath("runtime_only"),
      runtimeMemoryShape: "bounded_continuity_trio",
      runtimeMemoryShapeLabel: "Bounded continuity trio",
      runtimeMemoryComponents: [
        "continuity_summary",
        "latest_result_summary",
        "absorbed_work_items"
      ],
      runtimeMemoryComponentLabels: [
        "Continuity summary",
        "Latest result summary",
        "Absorbed work items"
      ],
      runtimeLongMemoryDisposition: "stays_runtime_only",
      runtimeLongMemoryDispositionLabel: "Stays runtime only",
      promotionActionDescription: "No export action applies. This runtime memory stays inside Wealth Factory orchestration."
    },
    {
      id: "attention_state",
      label: "Attention state",
      count: input.hasPendingAttention ? 1 : 0,
      summary: "Current CEO attention stays in runtime truth until the board resolves it explicitly.",
      destination: "wealth_factory_runtime",
      readiness: "live_runtime_only",
      readinessLabel: "Live runtime only",
      role: "runtime_memory",
      roleLabel: humanizeMemoryBoundaryRole("runtime_memory"),
      eligibilityRule: "runtime_only",
      eligibilityRuleLabel: humanizeMemoryBoundaryEligibilityRule("runtime_only"),
      sourceSurface: "pending_attention",
      sourceSurfaceLabel: humanizeMemoryBoundarySourceSurface("pending_attention"),
      candidateClass: "runtime_operational",
      candidateClassLabel: humanizeMemoryBoundaryCandidateClass("runtime_operational"),
      durabilityCondition: "runtime_ephemeral",
      durabilityConditionLabel: humanizeMemoryBoundaryDurabilityCondition("runtime_ephemeral"),
      ownershipBoundary: "wealth_factory_only",
      ownershipBoundaryLabel: humanizeMemoryBoundaryOwnershipBoundary("wealth_factory_only"),
      promotionPath: "never_promotes",
      promotionPathLabel: humanizeMemoryBoundaryPromotionPath("never_promotes"),
      recordTarget: "none_runtime_only",
      recordTargetLabel: humanizeMemoryBoundaryRecordTarget("none_runtime_only"),
      promotionBlocker: "not_applicable_runtime_only",
      promotionBlockerLabel: humanizeMemoryBoundaryPromotionBlocker("not_applicable_runtime_only"),
      promotionAuthority: "wealth_factory_runtime_only",
      promotionAuthorityLabel: humanizeMemoryBoundaryPromotionAuthority("wealth_factory_runtime_only"),
      promotionTrigger: "not_applicable_runtime",
      promotionTriggerLabel: humanizeMemoryBoundaryPromotionTrigger("not_applicable_runtime"),
      promotionState: "runtime_only",
      promotionStateLabel: humanizeMemoryBoundaryPromotionState("runtime_only"),
      promotionNextStep: "none_runtime_only",
      promotionNextStepLabel: humanizeMemoryBoundaryPromotionNextStep("none_runtime_only"),
      promotionActionFamily: "none_runtime_only",
      promotionActionFamilyLabel: humanizeMemoryBoundaryPromotionActionFamily("none_runtime_only"),
      assemblyShape: "none_runtime_only",
      assemblyShapeLabel: humanizeMemoryBoundaryAssemblyShape("none_runtime_only"),
      promotionPhase: "not_exported_runtime",
      promotionPhaseLabel: humanizeMemoryBoundaryPromotionPhase("not_exported_runtime"),
      promotionMutability: "runtime_mutable",
      promotionMutabilityLabel: humanizeMemoryBoundaryPromotionMutability("runtime_mutable"),
      promotionScope: "none_runtime_only",
      promotionScopeLabel: humanizeMemoryBoundaryPromotionScope("none_runtime_only"),
      identityStability: "runtime_transient_identity",
      identityStabilityLabel: humanizeMemoryBoundaryIdentityStability("runtime_transient_identity"),
      auditBacking: "runtime_state_only",
      auditBackingLabel: humanizeMemoryBoundaryAuditBacking("runtime_state_only"),
      concurrencyBoundary: "runtime_only",
      concurrencyBoundaryLabel: humanizeMemoryBoundaryConcurrencyBoundary("runtime_only"),
      exportPayloadShape: "none_runtime_only",
      exportPayloadShapeLabel: humanizeMemoryBoundaryExportPayloadShape("none_runtime_only"),
      idempotencyPolicy: "not_applicable_runtime",
      idempotencyPolicyLabel: humanizeMemoryBoundaryIdempotencyPolicy("not_applicable_runtime"),
      replaySafety: "runtime_only",
      replaySafetyLabel: humanizeMemoryBoundaryReplaySafety("runtime_only"),
      conflictPolicy: "runtime_only",
      conflictPolicyLabel: humanizeMemoryBoundaryConflictPolicy("runtime_only"),
      exportAtomicity: "none_runtime_only",
      exportAtomicityLabel: humanizeMemoryBoundaryExportAtomicity("none_runtime_only"),
      exportDerivationBasis: "none_runtime_only",
      exportDerivationBasisLabel: humanizeMemoryBoundaryExportDerivationBasis("none_runtime_only"),
      exportRevisionPolicy: "none_runtime_only",
      exportRevisionPolicyLabel: humanizeMemoryBoundaryExportRevisionPolicy("none_runtime_only"),
      exportFreshnessSource: "none_runtime_only",
      exportFreshnessSourceLabel: humanizeMemoryBoundaryExportFreshnessSource("none_runtime_only"),
      exportValidationBoundary: "none_runtime_only",
      exportValidationBoundaryLabel: humanizeMemoryBoundaryExportValidationBoundary("none_runtime_only"),
      exportCompletenessRule: "none_runtime_only",
      exportCompletenessRuleLabel: humanizeMemoryBoundaryExportCompletenessRule("none_runtime_only"),
      exportSensitivity: "none_runtime_only",
      exportSensitivityLabel: humanizeMemoryBoundaryExportSensitivity("none_runtime_only"),
      exportAudienceBoundary: "wealth_factory_runtime_only",
      exportAudienceBoundaryLabel: humanizeMemoryBoundaryExportAudienceBoundary("wealth_factory_runtime_only"),
      exportSanitizationPolicy: "none_runtime_only",
      exportSanitizationPolicyLabel: humanizeMemoryBoundaryExportSanitizationPolicy("none_runtime_only"),
      exportRedactionBoundary: "runtime_internal_only",
      exportRedactionBoundaryLabel: humanizeMemoryBoundaryExportRedactionBoundary("runtime_internal_only"),
      exportSourceDisclosurePolicy: "runtime_only",
      exportSourceDisclosurePolicyLabel: humanizeMemoryBoundaryExportSourceDisclosurePolicy("runtime_only"),
      memoryPlacement: "none_runtime_only",
      memoryPlacementLabel: humanizeMemoryBoundaryMemoryPlacement("none_runtime_only"),
      syncStrategy: "none_runtime_only",
      syncStrategyLabel: humanizeMemoryBoundarySyncStrategy("none_runtime_only"),
      exportRequestShape: "none_runtime_only",
      exportRequestShapeLabel: humanizeMemoryBoundaryExportRequestShape("none_runtime_only"),
      exportConfirmationRequirement: "none_runtime_only",
      exportConfirmationRequirementLabel: humanizeMemoryBoundaryExportConfirmationRequirement("none_runtime_only"),
      exportRecoveryPath: "runtime_only",
      exportRecoveryPathLabel: humanizeMemoryBoundaryExportRecoveryPath("runtime_only"),
      runtimeMemoryShape: "bounded_attention_signal",
      runtimeMemoryShapeLabel: "Bounded attention signal",
      runtimeMemoryComponents: ["pending_attention_state"],
      runtimeMemoryComponentLabels: ["Pending attention state"],
      runtimeLongMemoryDisposition: "stays_runtime_only",
      runtimeLongMemoryDispositionLabel: "Stays runtime only",
      promotionActionDescription: "No export action applies. This runtime attention state stays inside Wealth Factory orchestration."
    }
  ];

  const exportReadyItems: HarnessMemoryBoundaryItemView[] = [
    {
      id: "governance_decisions",
      label: "Governance decisions",
      count: input.recentDecisions.length,
      summary: "Bounded decisions are ready for later tenant-owned board records.",
      destination: "tenant_record_candidate",
      readiness: "ready_now",
      readinessLabel: "Ready now",
      role: "governance_record_candidate",
      roleLabel: humanizeMemoryBoundaryRole("governance_record_candidate"),
      eligibilityRule: "explicit_export_later",
      eligibilityRuleLabel: humanizeMemoryBoundaryEligibilityRule("explicit_export_later"),
      sourceSurface: "recent_decisions",
      sourceSurfaceLabel: humanizeMemoryBoundarySourceSurface("recent_decisions"),
      candidateClass: "governance_history",
      candidateClassLabel: humanizeMemoryBoundaryCandidateClass("governance_history"),
      durabilityCondition: "stable_when_recorded",
      durabilityConditionLabel: humanizeMemoryBoundaryDurabilityCondition("stable_when_recorded"),
      ownershipBoundary: "tenant_owned_later",
      ownershipBoundaryLabel: humanizeMemoryBoundaryOwnershipBoundary("tenant_owned_later"),
      promotionPath: "ready_for_explicit_export",
      promotionPathLabel: humanizeMemoryBoundaryPromotionPath("ready_for_explicit_export"),
      recordTarget: "governance_history_record",
      recordTargetLabel: humanizeMemoryBoundaryRecordTarget("governance_history_record"),
      promotionBlocker: "none_ready_now",
      promotionBlockerLabel: humanizeMemoryBoundaryPromotionBlocker("none_ready_now"),
      promotionAuthority: "tenant_explicit_export",
      promotionAuthorityLabel: humanizeMemoryBoundaryPromotionAuthority("tenant_explicit_export"),
      promotionTrigger: "tenant_export_request",
      promotionTriggerLabel: humanizeMemoryBoundaryPromotionTrigger("tenant_export_request"),
      promotionState: "ready_for_tenant_export",
      promotionStateLabel: humanizeMemoryBoundaryPromotionState("ready_for_tenant_export"),
      promotionNextStep: "tenant_export_available",
      promotionNextStepLabel: humanizeMemoryBoundaryPromotionNextStep("tenant_export_available"),
      promotionActionFamily: "tenant_export_candidate",
      promotionActionFamilyLabel: humanizeMemoryBoundaryPromotionActionFamily("tenant_export_candidate"),
      assemblyShape: "standalone_export_record",
      assemblyShapeLabel: humanizeMemoryBoundaryAssemblyShape("standalone_export_record"),
      promotionPhase: "phase_one_governance_history",
      promotionPhaseLabel: humanizeMemoryBoundaryPromotionPhase("phase_one_governance_history"),
      promotionMutability: "append_only_history",
      promotionMutabilityLabel: humanizeMemoryBoundaryPromotionMutability("append_only_history"),
      promotionScope: "single_record_export",
      promotionScopeLabel: humanizeMemoryBoundaryPromotionScope("single_record_export"),
      identityStability: "stable_record_identity",
      identityStabilityLabel: humanizeMemoryBoundaryIdentityStability("stable_record_identity"),
      auditBacking: "decision_ledger_backed",
      auditBackingLabel: humanizeMemoryBoundaryAuditBacking("decision_ledger_backed"),
      concurrencyBoundary: "independent_export_safe",
      concurrencyBoundaryLabel: humanizeMemoryBoundaryConcurrencyBoundary("independent_export_safe"),
      exportPayloadShape: "governance_history_record",
      exportPayloadShapeLabel: humanizeMemoryBoundaryExportPayloadShape("governance_history_record"),
      idempotencyPolicy: "deterministic_upsert",
      idempotencyPolicyLabel: humanizeMemoryBoundaryIdempotencyPolicy("deterministic_upsert"),
      replaySafety: "replay_safe",
      replaySafetyLabel: humanizeMemoryBoundaryReplaySafety("replay_safe"),
      conflictPolicy: "append_or_upsert",
      conflictPolicyLabel: humanizeMemoryBoundaryConflictPolicy("append_or_upsert"),
      exportAtomicity: "record_level_atomic",
      exportAtomicityLabel: humanizeMemoryBoundaryExportAtomicity("record_level_atomic"),
      exportDerivationBasis: "decision_history_derived",
      exportDerivationBasisLabel: humanizeMemoryBoundaryExportDerivationBasis("decision_history_derived"),
      exportRevisionPolicy: "append_new_revision",
      exportRevisionPolicyLabel: humanizeMemoryBoundaryExportRevisionPolicy("append_new_revision"),
      exportFreshnessSource: "latest_record_state",
      exportFreshnessSourceLabel: humanizeMemoryBoundaryExportFreshnessSource("latest_record_state"),
      exportValidationBoundary: "record_level_validation",
      exportValidationBoundaryLabel: humanizeMemoryBoundaryExportValidationBoundary("record_level_validation"),
      exportCompletenessRule: "self_contained_record",
      exportCompletenessRuleLabel: humanizeMemoryBoundaryExportCompletenessRule("self_contained_record"),
      exportSensitivity: "tenant_business_context",
      exportSensitivityLabel: humanizeMemoryBoundaryExportSensitivity("tenant_business_context"),
      exportAudienceBoundary: "tenant_governance_history_readers",
      exportAudienceBoundaryLabel: humanizeMemoryBoundaryExportAudienceBoundary("tenant_governance_history_readers"),
      exportSanitizationPolicy: "export_as_recorded",
      exportSanitizationPolicyLabel: humanizeMemoryBoundaryExportSanitizationPolicy("export_as_recorded"),
      exportRedactionBoundary: "governance_safe_redaction",
      exportRedactionBoundaryLabel: humanizeMemoryBoundaryExportRedactionBoundary("governance_safe_redaction"),
      exportSourceDisclosurePolicy: "decision_summary_only",
      exportSourceDisclosurePolicyLabel: humanizeMemoryBoundaryExportSourceDisclosurePolicy("decision_summary_only"),
      memoryPlacement: "governance_history_note",
      memoryPlacementLabel: humanizeMemoryBoundaryMemoryPlacement("governance_history_note"),
      syncStrategy: "append_history_entry",
      syncStrategyLabel: humanizeMemoryBoundarySyncStrategy("append_history_entry"),
      exportRequestShape: "single_record_export_request",
      exportRequestShapeLabel: humanizeMemoryBoundaryExportRequestShape("single_record_export_request"),
      exportConfirmationRequirement: "tenant_export_confirmation",
      exportConfirmationRequirementLabel: humanizeMemoryBoundaryExportConfirmationRequirement("tenant_export_confirmation"),
      exportRecoveryPath: "retry_latest_record_export",
      exportRecoveryPathLabel: humanizeMemoryBoundaryExportRecoveryPath("retry_latest_record_export"),
      promotionActionDescription: "This governance history is ready to sit behind a later bounded tenant export action."
    },
    {
      id: "implemented_actions",
      label: "Implemented actions",
      count: input.followThroughItems.length,
      summary: "Implemented governance actions are ready for suggested-versus-implemented history export.",
      destination: "tenant_record_candidate",
      readiness: "ready_now",
      readinessLabel: "Ready now",
      role: "governance_record_candidate",
      roleLabel: humanizeMemoryBoundaryRole("governance_record_candidate"),
      eligibilityRule: "explicit_export_later",
      eligibilityRuleLabel: humanizeMemoryBoundaryEligibilityRule("explicit_export_later"),
      sourceSurface: "follow_through",
      sourceSurfaceLabel: humanizeMemoryBoundarySourceSurface("follow_through"),
      candidateClass: "governance_history",
      candidateClassLabel: humanizeMemoryBoundaryCandidateClass("governance_history"),
      durabilityCondition: "stable_when_recorded",
      durabilityConditionLabel: humanizeMemoryBoundaryDurabilityCondition("stable_when_recorded"),
      ownershipBoundary: "tenant_owned_later",
      ownershipBoundaryLabel: humanizeMemoryBoundaryOwnershipBoundary("tenant_owned_later"),
      promotionPath: "ready_for_explicit_export",
      promotionPathLabel: humanizeMemoryBoundaryPromotionPath("ready_for_explicit_export"),
      recordTarget: "governance_history_record",
      recordTargetLabel: humanizeMemoryBoundaryRecordTarget("governance_history_record"),
      promotionBlocker: "none_ready_now",
      promotionBlockerLabel: humanizeMemoryBoundaryPromotionBlocker("none_ready_now"),
      promotionAuthority: "tenant_explicit_export",
      promotionAuthorityLabel: humanizeMemoryBoundaryPromotionAuthority("tenant_explicit_export"),
      promotionTrigger: "tenant_export_request",
      promotionTriggerLabel: humanizeMemoryBoundaryPromotionTrigger("tenant_export_request"),
      promotionState: "ready_for_tenant_export",
      promotionStateLabel: humanizeMemoryBoundaryPromotionState("ready_for_tenant_export"),
      promotionNextStep: "tenant_export_available",
      promotionNextStepLabel: humanizeMemoryBoundaryPromotionNextStep("tenant_export_available"),
      promotionActionFamily: "tenant_export_candidate",
      promotionActionFamilyLabel: humanizeMemoryBoundaryPromotionActionFamily("tenant_export_candidate"),
      assemblyShape: "standalone_export_record",
      assemblyShapeLabel: humanizeMemoryBoundaryAssemblyShape("standalone_export_record"),
      promotionPhase: "phase_one_governance_history",
      promotionPhaseLabel: humanizeMemoryBoundaryPromotionPhase("phase_one_governance_history"),
      promotionMutability: "append_only_history",
      promotionMutabilityLabel: humanizeMemoryBoundaryPromotionMutability("append_only_history"),
      promotionScope: "single_record_export",
      promotionScopeLabel: humanizeMemoryBoundaryPromotionScope("single_record_export"),
      identityStability: "stable_record_identity",
      identityStabilityLabel: humanizeMemoryBoundaryIdentityStability("stable_record_identity"),
      auditBacking: "decision_ledger_backed",
      auditBackingLabel: humanizeMemoryBoundaryAuditBacking("decision_ledger_backed"),
      concurrencyBoundary: "independent_export_safe",
      concurrencyBoundaryLabel: humanizeMemoryBoundaryConcurrencyBoundary("independent_export_safe"),
      exportPayloadShape: "governance_history_record",
      exportPayloadShapeLabel: humanizeMemoryBoundaryExportPayloadShape("governance_history_record"),
      idempotencyPolicy: "deterministic_upsert",
      idempotencyPolicyLabel: humanizeMemoryBoundaryIdempotencyPolicy("deterministic_upsert"),
      replaySafety: "replay_safe",
      replaySafetyLabel: humanizeMemoryBoundaryReplaySafety("replay_safe"),
      conflictPolicy: "append_or_upsert",
      conflictPolicyLabel: humanizeMemoryBoundaryConflictPolicy("append_or_upsert"),
      exportAtomicity: "record_level_atomic",
      exportAtomicityLabel: humanizeMemoryBoundaryExportAtomicity("record_level_atomic"),
      exportDerivationBasis: "decision_history_derived",
      exportDerivationBasisLabel: humanizeMemoryBoundaryExportDerivationBasis("decision_history_derived"),
      exportRevisionPolicy: "append_new_revision",
      exportRevisionPolicyLabel: humanizeMemoryBoundaryExportRevisionPolicy("append_new_revision"),
      exportFreshnessSource: "latest_record_state",
      exportFreshnessSourceLabel: humanizeMemoryBoundaryExportFreshnessSource("latest_record_state"),
      exportValidationBoundary: "record_level_validation",
      exportValidationBoundaryLabel: humanizeMemoryBoundaryExportValidationBoundary("record_level_validation"),
      exportCompletenessRule: "self_contained_record",
      exportCompletenessRuleLabel: humanizeMemoryBoundaryExportCompletenessRule("self_contained_record"),
      exportSensitivity: "tenant_business_context",
      exportSensitivityLabel: humanizeMemoryBoundaryExportSensitivity("tenant_business_context"),
      exportAudienceBoundary: "tenant_governance_history_readers",
      exportAudienceBoundaryLabel: humanizeMemoryBoundaryExportAudienceBoundary("tenant_governance_history_readers"),
      exportSanitizationPolicy: "export_as_recorded",
      exportSanitizationPolicyLabel: humanizeMemoryBoundaryExportSanitizationPolicy("export_as_recorded"),
      exportRedactionBoundary: "governance_safe_redaction",
      exportRedactionBoundaryLabel: humanizeMemoryBoundaryExportRedactionBoundary("governance_safe_redaction"),
      exportSourceDisclosurePolicy: "decision_summary_only",
      exportSourceDisclosurePolicyLabel: humanizeMemoryBoundaryExportSourceDisclosurePolicy("decision_summary_only"),
      memoryPlacement: "governance_history_note",
      memoryPlacementLabel: humanizeMemoryBoundaryMemoryPlacement("governance_history_note"),
      syncStrategy: "append_history_entry",
      syncStrategyLabel: humanizeMemoryBoundarySyncStrategy("append_history_entry"),
      exportRequestShape: "single_record_export_request",
      exportRequestShapeLabel: humanizeMemoryBoundaryExportRequestShape("single_record_export_request"),
      exportConfirmationRequirement: "tenant_export_confirmation",
      exportConfirmationRequirementLabel: humanizeMemoryBoundaryExportConfirmationRequirement("tenant_export_confirmation"),
      exportRecoveryPath: "retry_latest_record_export",
      exportRecoveryPathLabel: humanizeMemoryBoundaryExportRecoveryPath("retry_latest_record_export"),
      promotionActionDescription:
        "This implemented follow-through is ready to sit behind a later bounded tenant export action."
    }
  ];

  if (input.completionPackage) {
    const packageReadiness: HarnessMemoryBoundaryReadiness = input.completionPackage.hasOpenGovernanceItems
      ? "after_board_closes"
      : "ready_now";
    exportReadyItems.push(
      {
        id: "package_governance",
        label: "Package governance",
        count: input.completionPackage.governanceItems.length,
        summary: "Package-shaped governance items are ready for later tenant-owned board records.",
        destination: "tenant_record_candidate",
        readiness: packageReadiness,
        readinessLabel: humanizeMemoryBoundaryReadiness(packageReadiness),
        role: "packaged_record_candidate",
        roleLabel: humanizeMemoryBoundaryRole("packaged_record_candidate"),
        eligibilityRule: input.completionPackage.hasOpenGovernanceItems
          ? "after_board_closes_then_export"
          : "explicit_export_later",
        eligibilityRuleLabel: humanizeMemoryBoundaryEligibilityRule(
          input.completionPackage.hasOpenGovernanceItems
            ? "after_board_closes_then_export"
            : "explicit_export_later"
        ),
        sourceSurface: "completion_package_governance",
        sourceSurfaceLabel: humanizeMemoryBoundarySourceSurface("completion_package_governance"),
        candidateClass: "packaged_output",
        candidateClassLabel: humanizeMemoryBoundaryCandidateClass("packaged_output"),
        durabilityCondition: input.completionPackage.hasOpenGovernanceItems
          ? "stable_after_board_closure"
          : "stable_when_recorded",
        durabilityConditionLabel: humanizeMemoryBoundaryDurabilityCondition(
          input.completionPackage.hasOpenGovernanceItems
            ? "stable_after_board_closure"
            : "stable_when_recorded"
        ),
        ownershipBoundary: "tenant_owned_later",
        ownershipBoundaryLabel: humanizeMemoryBoundaryOwnershipBoundary("tenant_owned_later"),
        promotionPath: input.completionPackage.hasOpenGovernanceItems
          ? "after_board_closure_then_export"
          : "ready_for_explicit_export",
        promotionPathLabel: humanizeMemoryBoundaryPromotionPath(
          input.completionPackage.hasOpenGovernanceItems
            ? "after_board_closure_then_export"
            : "ready_for_explicit_export"
        ),
        recordTarget: "package_governance_record",
        recordTargetLabel: humanizeMemoryBoundaryRecordTarget("package_governance_record"),
        promotionBlocker: input.completionPackage.hasOpenGovernanceItems
          ? "board_closure_required"
          : "none_ready_now",
        promotionBlockerLabel: humanizeMemoryBoundaryPromotionBlocker(
          input.completionPackage.hasOpenGovernanceItems
            ? "board_closure_required"
            : "none_ready_now"
        ),
        promotionAuthority: input.completionPackage.hasOpenGovernanceItems
          ? "board_closure_then_tenant_export"
          : "tenant_explicit_export",
        promotionAuthorityLabel: humanizeMemoryBoundaryPromotionAuthority(
          input.completionPackage.hasOpenGovernanceItems
            ? "board_closure_then_tenant_export"
            : "tenant_explicit_export"
        ),
        promotionTrigger: input.completionPackage.hasOpenGovernanceItems
          ? "board_closure"
          : "tenant_export_request",
        promotionTriggerLabel: humanizeMemoryBoundaryPromotionTrigger(
          input.completionPackage.hasOpenGovernanceItems
            ? "board_closure"
            : "tenant_export_request"
        ),
        promotionState: input.completionPackage.hasOpenGovernanceItems
          ? "awaiting_board_closure"
          : "ready_for_tenant_export",
        promotionStateLabel: humanizeMemoryBoundaryPromotionState(
          input.completionPackage.hasOpenGovernanceItems
            ? "awaiting_board_closure"
            : "ready_for_tenant_export"
        ),
        promotionNextStep: input.completionPackage.hasOpenGovernanceItems
          ? "board_closure_then_tenant_export"
          : "tenant_export_available",
        promotionNextStepLabel: humanizeMemoryBoundaryPromotionNextStep(
          input.completionPackage.hasOpenGovernanceItems
            ? "board_closure_then_tenant_export"
            : "tenant_export_available"
        ),
        promotionActionFamily: input.completionPackage.hasOpenGovernanceItems
          ? "board_closure_before_export"
          : "tenant_export_candidate",
        promotionActionFamilyLabel: humanizeMemoryBoundaryPromotionActionFamily(
          input.completionPackage.hasOpenGovernanceItems
            ? "board_closure_before_export"
            : "tenant_export_candidate"
        ),
        assemblyShape: "package_record_set",
        assemblyShapeLabel: humanizeMemoryBoundaryAssemblyShape("package_record_set"),
        promotionPhase: "phase_two_package_export",
        promotionPhaseLabel: humanizeMemoryBoundaryPromotionPhase("phase_two_package_export"),
        promotionMutability: input.completionPackage.hasOpenGovernanceItems
          ? "replaceable_until_board_closure"
          : "stable_snapshot",
        promotionMutabilityLabel: humanizeMemoryBoundaryPromotionMutability(
          input.completionPackage.hasOpenGovernanceItems
            ? "replaceable_until_board_closure"
            : "stable_snapshot"
        ),
        promotionScope: "package_record_set_export",
        promotionScopeLabel: humanizeMemoryBoundaryPromotionScope("package_record_set_export"),
        identityStability: input.completionPackage.hasOpenGovernanceItems
          ? "finalized_after_board_closure"
          : "stable_record_identity",
        identityStabilityLabel: humanizeMemoryBoundaryIdentityStability(
          input.completionPackage.hasOpenGovernanceItems
            ? "finalized_after_board_closure"
            : "stable_record_identity"
        ),
        auditBacking: "package_closure_backed",
        auditBackingLabel: humanizeMemoryBoundaryAuditBacking("package_closure_backed"),
        concurrencyBoundary: input.completionPackage.hasOpenGovernanceItems
          ? "requires_board_closure_snapshot"
          : "independent_export_safe",
        concurrencyBoundaryLabel: humanizeMemoryBoundaryConcurrencyBoundary(
          input.completionPackage.hasOpenGovernanceItems
            ? "requires_board_closure_snapshot"
            : "independent_export_safe"
        ),
        exportPayloadShape: "package_snapshot_bundle",
        exportPayloadShapeLabel: humanizeMemoryBoundaryExportPayloadShape("package_snapshot_bundle"),
        idempotencyPolicy: input.completionPackage.hasOpenGovernanceItems
          ? "board_closure_snapshot_once"
          : "deterministic_upsert",
        idempotencyPolicyLabel: humanizeMemoryBoundaryIdempotencyPolicy(
          input.completionPackage.hasOpenGovernanceItems
            ? "board_closure_snapshot_once"
            : "deterministic_upsert"
        ),
        replaySafety: input.completionPackage.hasOpenGovernanceItems
          ? "requires_fresh_board_closure_snapshot"
          : "replay_safe",
        replaySafetyLabel: humanizeMemoryBoundaryReplaySafety(
          input.completionPackage.hasOpenGovernanceItems
            ? "requires_fresh_board_closure_snapshot"
            : "replay_safe"
        ),
        conflictPolicy: input.completionPackage.hasOpenGovernanceItems
          ? "replace_latest_closure_snapshot"
          : "append_or_upsert",
        conflictPolicyLabel: humanizeMemoryBoundaryConflictPolicy(
          input.completionPackage.hasOpenGovernanceItems
            ? "replace_latest_closure_snapshot"
            : "append_or_upsert"
        ),
        exportAtomicity: input.completionPackage.hasOpenGovernanceItems
          ? "closure_bundle_atomic"
          : "record_level_atomic",
        exportAtomicityLabel: humanizeMemoryBoundaryExportAtomicity(
          input.completionPackage.hasOpenGovernanceItems
            ? "closure_bundle_atomic"
            : "record_level_atomic"
        ),
        exportDerivationBasis: "board_closure_snapshot_derived",
        exportDerivationBasisLabel: humanizeMemoryBoundaryExportDerivationBasis("board_closure_snapshot_derived"),
        exportRevisionPolicy: input.completionPackage.hasOpenGovernanceItems
          ? "replace_closure_bundle_revision"
          : "append_new_revision",
        exportRevisionPolicyLabel: humanizeMemoryBoundaryExportRevisionPolicy(
          input.completionPackage.hasOpenGovernanceItems
            ? "replace_closure_bundle_revision"
            : "append_new_revision"
        ),
        exportFreshnessSource: "latest_board_closure_snapshot",
        exportFreshnessSourceLabel: humanizeMemoryBoundaryExportFreshnessSource("latest_board_closure_snapshot"),
        exportValidationBoundary: "closure_bundle_validation",
        exportValidationBoundaryLabel: humanizeMemoryBoundaryExportValidationBoundary("closure_bundle_validation"),
        exportCompletenessRule: "board_closure_complete_bundle",
        exportCompletenessRuleLabel: humanizeMemoryBoundaryExportCompletenessRule("board_closure_complete_bundle"),
        exportSensitivity: "tenant_deliverable_context",
        exportSensitivityLabel: humanizeMemoryBoundaryExportSensitivity("tenant_deliverable_context"),
        exportAudienceBoundary: "tenant_package_consumers",
        exportAudienceBoundaryLabel: humanizeMemoryBoundaryExportAudienceBoundary("tenant_package_consumers"),
        exportSanitizationPolicy: "sanitize_before_package_export",
        exportSanitizationPolicyLabel: humanizeMemoryBoundaryExportSanitizationPolicy("sanitize_before_package_export"),
        exportRedactionBoundary: "package_safe_redaction",
        exportRedactionBoundaryLabel: humanizeMemoryBoundaryExportRedactionBoundary("package_safe_redaction"),
        exportSourceDisclosurePolicy: "closure_snapshot_summary_only",
        exportSourceDisclosurePolicyLabel: humanizeMemoryBoundaryExportSourceDisclosurePolicy("closure_snapshot_summary_only"),
        memoryPlacement: "package_record_folder",
        memoryPlacementLabel: humanizeMemoryBoundaryMemoryPlacement("package_record_folder"),
        syncStrategy: "replace_package_snapshot_after_board_closure",
        syncStrategyLabel: humanizeMemoryBoundarySyncStrategy("replace_package_snapshot_after_board_closure"),
        exportRequestShape: "package_bundle_export_request",
        exportRequestShapeLabel: humanizeMemoryBoundaryExportRequestShape("package_bundle_export_request"),
        exportConfirmationRequirement: "board_closure_then_tenant_export_confirmation",
        exportConfirmationRequirementLabel: humanizeMemoryBoundaryExportConfirmationRequirement("board_closure_then_tenant_export_confirmation"),
        exportRecoveryPath: "rerun_after_board_closure_snapshot",
        exportRecoveryPathLabel: humanizeMemoryBoundaryExportRecoveryPath("rerun_after_board_closure_snapshot"),
        promotionActionDescription: input.completionPackage.hasOpenGovernanceItems
          ? "Board closure still gates this package governance memory before any later tenant export action can apply."
          : "This package governance memory is ready to sit behind a later bounded tenant export action.",
        ...(packageReadiness === "after_board_closes"
          ? {
              nextEligibleSummary:
                "Board closure is still required before this package-shaped governance memory becomes a durable tenant record candidate."
            }
          : {})
      },
      {
        id: "package_deliverables",
        label: "Packaged deliverables",
        count: input.completionPackage.deliverables.length,
        summary: "Tenant-facing deliverables are ready to become long-memory business records later.",
        destination: "tenant_record_candidate",
        readiness: packageReadiness,
        readinessLabel: humanizeMemoryBoundaryReadiness(packageReadiness),
        role: "packaged_record_candidate",
        roleLabel: humanizeMemoryBoundaryRole("packaged_record_candidate"),
        eligibilityRule: input.completionPackage.hasOpenGovernanceItems
          ? "after_board_closes_then_export"
          : "explicit_export_later",
        eligibilityRuleLabel: humanizeMemoryBoundaryEligibilityRule(
          input.completionPackage.hasOpenGovernanceItems
            ? "after_board_closes_then_export"
            : "explicit_export_later"
        ),
        sourceSurface: "completion_package_deliverables",
        sourceSurfaceLabel: humanizeMemoryBoundarySourceSurface("completion_package_deliverables"),
        candidateClass: "packaged_output",
        candidateClassLabel: humanizeMemoryBoundaryCandidateClass("packaged_output"),
        durabilityCondition: input.completionPackage.hasOpenGovernanceItems
          ? "stable_after_board_closure"
          : "stable_when_recorded",
        durabilityConditionLabel: humanizeMemoryBoundaryDurabilityCondition(
          input.completionPackage.hasOpenGovernanceItems
            ? "stable_after_board_closure"
            : "stable_when_recorded"
        ),
        ownershipBoundary: "tenant_owned_later",
        ownershipBoundaryLabel: humanizeMemoryBoundaryOwnershipBoundary("tenant_owned_later"),
        promotionPath: input.completionPackage.hasOpenGovernanceItems
          ? "after_board_closure_then_export"
          : "ready_for_explicit_export",
        promotionPathLabel: humanizeMemoryBoundaryPromotionPath(
          input.completionPackage.hasOpenGovernanceItems
            ? "after_board_closure_then_export"
            : "ready_for_explicit_export"
        ),
        recordTarget: "package_deliverable_record",
        recordTargetLabel: humanizeMemoryBoundaryRecordTarget("package_deliverable_record"),
        promotionBlocker: input.completionPackage.hasOpenGovernanceItems
          ? "board_closure_required"
          : "none_ready_now",
        promotionBlockerLabel: humanizeMemoryBoundaryPromotionBlocker(
          input.completionPackage.hasOpenGovernanceItems
            ? "board_closure_required"
            : "none_ready_now"
        ),
        promotionAuthority: input.completionPackage.hasOpenGovernanceItems
          ? "board_closure_then_tenant_export"
          : "tenant_explicit_export",
        promotionAuthorityLabel: humanizeMemoryBoundaryPromotionAuthority(
          input.completionPackage.hasOpenGovernanceItems
            ? "board_closure_then_tenant_export"
            : "tenant_explicit_export"
        ),
        promotionTrigger: input.completionPackage.hasOpenGovernanceItems
          ? "board_closure"
          : "tenant_export_request",
        promotionTriggerLabel: humanizeMemoryBoundaryPromotionTrigger(
          input.completionPackage.hasOpenGovernanceItems
            ? "board_closure"
            : "tenant_export_request"
        ),
        promotionState: input.completionPackage.hasOpenGovernanceItems
          ? "awaiting_board_closure"
          : "ready_for_tenant_export",
        promotionStateLabel: humanizeMemoryBoundaryPromotionState(
          input.completionPackage.hasOpenGovernanceItems
            ? "awaiting_board_closure"
            : "ready_for_tenant_export"
        ),
        promotionNextStep: input.completionPackage.hasOpenGovernanceItems
          ? "board_closure_then_tenant_export"
          : "tenant_export_available",
        promotionNextStepLabel: humanizeMemoryBoundaryPromotionNextStep(
          input.completionPackage.hasOpenGovernanceItems
            ? "board_closure_then_tenant_export"
            : "tenant_export_available"
        ),
        promotionActionFamily: input.completionPackage.hasOpenGovernanceItems
          ? "board_closure_before_export"
          : "tenant_export_candidate",
        promotionActionFamilyLabel: humanizeMemoryBoundaryPromotionActionFamily(
          input.completionPackage.hasOpenGovernanceItems
            ? "board_closure_before_export"
            : "tenant_export_candidate"
        ),
        assemblyShape: "package_record_set",
        assemblyShapeLabel: humanizeMemoryBoundaryAssemblyShape("package_record_set"),
        promotionPhase: "phase_two_package_export",
        promotionPhaseLabel: humanizeMemoryBoundaryPromotionPhase("phase_two_package_export"),
        promotionMutability: input.completionPackage.hasOpenGovernanceItems
          ? "replaceable_until_board_closure"
          : "stable_snapshot",
        promotionMutabilityLabel: humanizeMemoryBoundaryPromotionMutability(
          input.completionPackage.hasOpenGovernanceItems
            ? "replaceable_until_board_closure"
            : "stable_snapshot"
        ),
        promotionScope: "package_record_set_export",
        promotionScopeLabel: humanizeMemoryBoundaryPromotionScope("package_record_set_export"),
        identityStability: input.completionPackage.hasOpenGovernanceItems
          ? "finalized_after_board_closure"
          : "stable_record_identity",
        identityStabilityLabel: humanizeMemoryBoundaryIdentityStability(
          input.completionPackage.hasOpenGovernanceItems
            ? "finalized_after_board_closure"
            : "stable_record_identity"
        ),
        auditBacking: "package_closure_backed",
        auditBackingLabel: humanizeMemoryBoundaryAuditBacking("package_closure_backed"),
        concurrencyBoundary: input.completionPackage.hasOpenGovernanceItems
          ? "requires_board_closure_snapshot"
          : "independent_export_safe",
        concurrencyBoundaryLabel: humanizeMemoryBoundaryConcurrencyBoundary(
          input.completionPackage.hasOpenGovernanceItems
            ? "requires_board_closure_snapshot"
            : "independent_export_safe"
        ),
        exportPayloadShape: "package_snapshot_bundle",
        exportPayloadShapeLabel: humanizeMemoryBoundaryExportPayloadShape("package_snapshot_bundle"),
        idempotencyPolicy: input.completionPackage.hasOpenGovernanceItems
          ? "board_closure_snapshot_once"
          : "deterministic_upsert",
        idempotencyPolicyLabel: humanizeMemoryBoundaryIdempotencyPolicy(
          input.completionPackage.hasOpenGovernanceItems
            ? "board_closure_snapshot_once"
            : "deterministic_upsert"
        ),
        replaySafety: input.completionPackage.hasOpenGovernanceItems
          ? "requires_fresh_board_closure_snapshot"
          : "replay_safe",
        replaySafetyLabel: humanizeMemoryBoundaryReplaySafety(
          input.completionPackage.hasOpenGovernanceItems
            ? "requires_fresh_board_closure_snapshot"
            : "replay_safe"
        ),
        conflictPolicy: input.completionPackage.hasOpenGovernanceItems
          ? "replace_latest_closure_snapshot"
          : "append_or_upsert",
        conflictPolicyLabel: humanizeMemoryBoundaryConflictPolicy(
          input.completionPackage.hasOpenGovernanceItems
            ? "replace_latest_closure_snapshot"
            : "append_or_upsert"
        ),
        exportAtomicity: input.completionPackage.hasOpenGovernanceItems
          ? "closure_bundle_atomic"
          : "record_level_atomic",
        exportAtomicityLabel: humanizeMemoryBoundaryExportAtomicity(
          input.completionPackage.hasOpenGovernanceItems
            ? "closure_bundle_atomic"
            : "record_level_atomic"
        ),
        exportDerivationBasis: "board_closure_snapshot_derived",
        exportDerivationBasisLabel: humanizeMemoryBoundaryExportDerivationBasis("board_closure_snapshot_derived"),
        exportRevisionPolicy: input.completionPackage.hasOpenGovernanceItems
          ? "replace_closure_bundle_revision"
          : "append_new_revision",
        exportRevisionPolicyLabel: humanizeMemoryBoundaryExportRevisionPolicy(
          input.completionPackage.hasOpenGovernanceItems
            ? "replace_closure_bundle_revision"
            : "append_new_revision"
        ),
        exportFreshnessSource: "latest_board_closure_snapshot",
        exportFreshnessSourceLabel: humanizeMemoryBoundaryExportFreshnessSource("latest_board_closure_snapshot"),
        exportValidationBoundary: "closure_bundle_validation",
        exportValidationBoundaryLabel: humanizeMemoryBoundaryExportValidationBoundary("closure_bundle_validation"),
        exportCompletenessRule: "board_closure_complete_bundle",
        exportCompletenessRuleLabel: humanizeMemoryBoundaryExportCompletenessRule("board_closure_complete_bundle"),
        exportSensitivity: "tenant_deliverable_context",
        exportSensitivityLabel: humanizeMemoryBoundaryExportSensitivity("tenant_deliverable_context"),
        exportAudienceBoundary: "tenant_package_consumers",
        exportAudienceBoundaryLabel: humanizeMemoryBoundaryExportAudienceBoundary("tenant_package_consumers"),
        exportSanitizationPolicy: "sanitize_before_package_export",
        exportSanitizationPolicyLabel: humanizeMemoryBoundaryExportSanitizationPolicy("sanitize_before_package_export"),
        exportRedactionBoundary: "package_safe_redaction",
        exportRedactionBoundaryLabel: humanizeMemoryBoundaryExportRedactionBoundary("package_safe_redaction"),
        exportSourceDisclosurePolicy: "closure_snapshot_summary_only",
        exportSourceDisclosurePolicyLabel: humanizeMemoryBoundaryExportSourceDisclosurePolicy("closure_snapshot_summary_only"),
        memoryPlacement: "package_record_folder",
        memoryPlacementLabel: humanizeMemoryBoundaryMemoryPlacement("package_record_folder"),
        syncStrategy: "replace_package_snapshot_after_board_closure",
        syncStrategyLabel: humanizeMemoryBoundarySyncStrategy("replace_package_snapshot_after_board_closure"),
        exportRequestShape: "package_bundle_export_request",
        exportRequestShapeLabel: humanizeMemoryBoundaryExportRequestShape("package_bundle_export_request"),
        exportConfirmationRequirement: "board_closure_then_tenant_export_confirmation",
        exportConfirmationRequirementLabel: humanizeMemoryBoundaryExportConfirmationRequirement("board_closure_then_tenant_export_confirmation"),
        exportRecoveryPath: "rerun_after_board_closure_snapshot",
        exportRecoveryPathLabel: humanizeMemoryBoundaryExportRecoveryPath("rerun_after_board_closure_snapshot"),
        promotionActionDescription: input.completionPackage.hasOpenGovernanceItems
          ? "Board closure still gates this packaged deliverable before any later tenant export action can apply."
          : "This packaged deliverable is ready to sit behind a later bounded tenant export action.",
        ...(packageReadiness === "after_board_closes"
          ? {
              nextEligibleSummary:
                "Board closure is still required before this packaged deliverable becomes a durable tenant record candidate."
            }
          : {})
      }
    );
  }

  const readyNowCount = exportReadyItems.filter((item) => item.readiness === "ready_now").length;
  const waitingOnBoardClosureCount = exportReadyItems.filter((item) => item.readiness === "after_board_closes").length;
  const governanceReadyCount = exportReadyItems.filter(
    (item) => item.role === "governance_record_candidate" && item.readiness === "ready_now"
  ).length;
  const packagedReadyCount = exportReadyItems.filter(
    (item) => item.role === "packaged_record_candidate" && item.readiness === "ready_now"
  ).length;
  const packagedWaitingCount = exportReadyItems.filter(
    (item) => item.role === "packaged_record_candidate" && item.readiness === "after_board_closes"
  ).length;
  const blockedCandidateCount = exportReadyItems.filter(
    (item) => item.promotionBlocker === "board_closure_required"
  ).length;
  const tenantControlledCandidateCount = exportReadyItems.filter(
    (item) => item.promotionAuthority === "tenant_explicit_export"
  ).length;
  const boardControlledCandidateCount = exportReadyItems.filter(
    (item) => item.promotionAuthority === "board_closure_then_tenant_export"
  ).length;
  const tenantExportTriggerCount = exportReadyItems.filter(
    (item) => item.promotionTrigger === "tenant_export_request"
  ).length;
  const boardClosureTriggerCount = exportReadyItems.filter(
    (item) => item.promotionTrigger === "board_closure"
  ).length;
  const runtimeOnlyStateCount = operationalItems.filter((item) => item.promotionState === "runtime_only").length;
  const continuityTrioRuntimeItemCount = operationalItems.filter(
    (item) => item.runtimeMemoryShape === "bounded_continuity_trio"
  ).length;
  const attentionSignalRuntimeItemCount = operationalItems.filter(
    (item) => item.runtimeMemoryShape === "bounded_attention_signal"
  ).length;
  const runtimeOnlyLongMemoryItemCount = operationalItems.filter(
    (item) => item.runtimeLongMemoryDisposition === "stays_runtime_only"
  ).length;
  const readyForTenantExportStateCount = exportReadyItems.filter(
    (item) => item.promotionState === "ready_for_tenant_export"
  ).length;
  const awaitingBoardClosureStateCount = exportReadyItems.filter(
    (item) => item.promotionState === "awaiting_board_closure"
  ).length;
  const runtimeOnlyNextStepCount = operationalItems.filter(
    (item) => item.promotionNextStep === "none_runtime_only"
  ).length;
  const tenantExportAvailableNextStepCount = exportReadyItems.filter(
    (item) => item.promotionNextStep === "tenant_export_available"
  ).length;
  const boardClosureThenTenantExportNextStepCount = exportReadyItems.filter(
    (item) => item.promotionNextStep === "board_closure_then_tenant_export"
  ).length;
  const noPromotionActionCount = operationalItems.filter(
    (item) => item.promotionActionFamily === "none_runtime_only"
  ).length;
  const tenantExportActionFamilyCount = exportReadyItems.filter(
    (item) => item.promotionActionFamily === "tenant_export_candidate"
  ).length;
  const boardClosureActionFamilyCount = exportReadyItems.filter(
    (item) => item.promotionActionFamily === "board_closure_before_export"
  ).length;
  const noAssemblyShapeCount = operationalItems.filter(
    (item) => item.assemblyShape === "none_runtime_only"
  ).length;
  const standaloneExportRecordCount = exportReadyItems.filter(
    (item) => item.assemblyShape === "standalone_export_record"
  ).length;
  const packageRecordSetCount = exportReadyItems.filter(
    (item) => item.assemblyShape === "package_record_set"
  ).length;
  const noExportPhaseCount = operationalItems.filter(
    (item) => item.promotionPhase === "not_exported_runtime"
  ).length;
  const phaseOneExportCount = exportReadyItems.filter(
    (item) => item.promotionPhase === "phase_one_governance_history"
  ).length;
  const phaseTwoExportCount = exportReadyItems.filter(
    (item) => item.promotionPhase === "phase_two_package_export"
  ).length;
  const runtimeMutableCount = operationalItems.filter(
    (item) => item.promotionMutability === "runtime_mutable"
  ).length;
  const appendOnlyHistoryCount = exportReadyItems.filter(
    (item) => item.promotionMutability === "append_only_history"
  ).length;
  const replaceableSnapshotCount = exportReadyItems.filter(
    (item) => item.promotionMutability === "replaceable_until_board_closure"
  ).length;
  const stableSnapshotCount = exportReadyItems.filter(
    (item) => item.promotionMutability === "stable_snapshot"
  ).length;
  const noPromotionScopeCount = operationalItems.filter(
    (item) => item.promotionScope === "none_runtime_only"
  ).length;
  const singleRecordExportScopeCount = exportReadyItems.filter(
    (item) => item.promotionScope === "single_record_export"
  ).length;
  const packageRecordSetExportScopeCount = exportReadyItems.filter(
    (item) => item.promotionScope === "package_record_set_export"
  ).length;
  const transientIdentityCount = operationalItems.filter(
    (item) => item.identityStability === "runtime_transient_identity"
  ).length;
  const stableIdentityCount = [...operationalItems, ...exportReadyItems].filter(
    (item) => item.identityStability === "stable_record_identity"
  ).length;
  const closureFinalizedIdentityCount = exportReadyItems.filter(
    (item) => item.identityStability === "finalized_after_board_closure"
  ).length;
  const runtimeStateOnlyAuditCount = operationalItems.filter(
    (item) => item.auditBacking === "runtime_state_only"
  ).length;
  const decisionLedgerAuditCount = exportReadyItems.filter(
    (item) => item.auditBacking === "decision_ledger_backed"
  ).length;
  const packageClosureAuditCount = exportReadyItems.filter(
    (item) => item.auditBacking === "package_closure_backed"
  ).length;
  const runtimeOnlyConcurrencyCount = operationalItems.filter(
    (item) => item.concurrencyBoundary === "runtime_only"
  ).length;
  const independentExportSafeCount = exportReadyItems.filter(
    (item) => item.concurrencyBoundary === "independent_export_safe"
  ).length;
  const requiresBoardClosureSnapshotCount = exportReadyItems.filter(
    (item) => item.concurrencyBoundary === "requires_board_closure_snapshot"
  ).length;
  const noExportPayloadShapeCount = operationalItems.filter(
    (item) => item.exportPayloadShape === "none_runtime_only"
  ).length;
  const governanceHistoryPayloadCount = exportReadyItems.filter(
    (item) => item.exportPayloadShape === "governance_history_record"
  ).length;
  const packageSnapshotBundleCount = exportReadyItems.filter(
    (item) => item.exportPayloadShape === "package_snapshot_bundle"
  ).length;
  const noIdempotencyPolicyCount = operationalItems.filter(
    (item) => item.idempotencyPolicy === "not_applicable_runtime"
  ).length;
  const deterministicUpsertCount = exportReadyItems.filter(
    (item) => item.idempotencyPolicy === "deterministic_upsert"
  ).length;
  const boardClosureSnapshotOnceCount = exportReadyItems.filter(
    (item) => item.idempotencyPolicy === "board_closure_snapshot_once"
  ).length;
  const runtimeOnlyReplaySafetyCount = operationalItems.filter(
    (item) => item.replaySafety === "runtime_only"
  ).length;
  const replaySafeCount = exportReadyItems.filter(
    (item) => item.replaySafety === "replay_safe"
  ).length;
  const freshClosureSnapshotReplayCount = exportReadyItems.filter(
    (item) => item.replaySafety === "requires_fresh_board_closure_snapshot"
  ).length;
  const runtimeOnlyConflictPolicyCount = operationalItems.filter(
    (item) => item.conflictPolicy === "runtime_only"
  ).length;
  const appendOrUpsertConflictCount = exportReadyItems.filter(
    (item) => item.conflictPolicy === "append_or_upsert"
  ).length;
  const replaceLatestClosureSnapshotCount = exportReadyItems.filter(
    (item) => item.conflictPolicy === "replace_latest_closure_snapshot"
  ).length;
  const noExportAtomicityCount = operationalItems.filter(
    (item) => item.exportAtomicity === "none_runtime_only"
  ).length;
  const recordLevelAtomicCount = exportReadyItems.filter(
    (item) => item.exportAtomicity === "record_level_atomic"
  ).length;
  const closureBundleAtomicCount = exportReadyItems.filter(
    (item) => item.exportAtomicity === "closure_bundle_atomic"
  ).length;
  const noExportDerivationBasisCount = operationalItems.filter(
    (item) => item.exportDerivationBasis === "none_runtime_only"
  ).length;
  const decisionHistoryDerivedCount = exportReadyItems.filter(
    (item) => item.exportDerivationBasis === "decision_history_derived"
  ).length;
  const boardClosureSnapshotDerivedCount = exportReadyItems.filter(
    (item) => item.exportDerivationBasis === "board_closure_snapshot_derived"
  ).length;
  const noExportRevisionPolicyCount = operationalItems.filter(
    (item) => item.exportRevisionPolicy === "none_runtime_only"
  ).length;
  const appendNewRevisionCount = exportReadyItems.filter(
    (item) => item.exportRevisionPolicy === "append_new_revision"
  ).length;
  const replaceClosureBundleRevisionCount = exportReadyItems.filter(
    (item) => item.exportRevisionPolicy === "replace_closure_bundle_revision"
  ).length;
  const noExportFreshnessSourceCount = operationalItems.filter(
    (item) => item.exportFreshnessSource === "none_runtime_only"
  ).length;
  const latestRecordStateCount = exportReadyItems.filter(
    (item) => item.exportFreshnessSource === "latest_record_state"
  ).length;
  const latestBoardClosureSnapshotCount = exportReadyItems.filter(
    (item) => item.exportFreshnessSource === "latest_board_closure_snapshot"
  ).length;
  const noExportValidationBoundaryCount = operationalItems.filter(
    (item) => item.exportValidationBoundary === "none_runtime_only"
  ).length;
  const recordLevelValidationCount = exportReadyItems.filter(
    (item) => item.exportValidationBoundary === "record_level_validation"
  ).length;
  const closureBundleValidationCount = exportReadyItems.filter(
    (item) => item.exportValidationBoundary === "closure_bundle_validation"
  ).length;
  const noExportCompletenessRuleCount = operationalItems.filter(
    (item) => item.exportCompletenessRule === "none_runtime_only"
  ).length;
  const selfContainedRecordCount = exportReadyItems.filter(
    (item) => item.exportCompletenessRule === "self_contained_record"
  ).length;
  const boardClosureCompleteBundleCount = exportReadyItems.filter(
    (item) => item.exportCompletenessRule === "board_closure_complete_bundle"
  ).length;
  const noExportSensitivityCount = operationalItems.filter(
    (item) => item.exportSensitivity === "none_runtime_only"
  ).length;
  const tenantBusinessContextCount = exportReadyItems.filter(
    (item) => item.exportSensitivity === "tenant_business_context"
  ).length;
  const tenantDeliverableContextCount = exportReadyItems.filter(
    (item) => item.exportSensitivity === "tenant_deliverable_context"
  ).length;
  const runtimeOnlyAudienceCount = operationalItems.filter(
    (item) => item.exportAudienceBoundary === "wealth_factory_runtime_only"
  ).length;
  const governanceHistoryAudienceCount = exportReadyItems.filter(
    (item) => item.exportAudienceBoundary === "tenant_governance_history_readers"
  ).length;
  const packageConsumerAudienceCount = exportReadyItems.filter(
    (item) => item.exportAudienceBoundary === "tenant_package_consumers"
  ).length;
  const noExportSanitizationCount = operationalItems.filter(
    (item) => item.exportSanitizationPolicy === "none_runtime_only"
  ).length;
  const exportAsRecordedCount = exportReadyItems.filter(
    (item) => item.exportSanitizationPolicy === "export_as_recorded"
  ).length;
  const sanitizeBeforePackageExportCount = exportReadyItems.filter(
    (item) => item.exportSanitizationPolicy === "sanitize_before_package_export"
  ).length;
  const runtimeInternalOnlyRedactionCount = operationalItems.filter(
    (item) => item.exportRedactionBoundary === "runtime_internal_only"
  ).length;
  const governanceSafeRedactionCount = exportReadyItems.filter(
    (item) => item.exportRedactionBoundary === "governance_safe_redaction"
  ).length;
  const packageSafeRedactionCount = exportReadyItems.filter(
    (item) => item.exportRedactionBoundary === "package_safe_redaction"
  ).length;
  const runtimeOnlySourceDisclosureCount = operationalItems.filter(
    (item) => item.exportSourceDisclosurePolicy === "runtime_only"
  ).length;
  const decisionSummaryOnlyCount = exportReadyItems.filter(
    (item) => item.exportSourceDisclosurePolicy === "decision_summary_only"
  ).length;
  const closureSnapshotSummaryOnlyCount = exportReadyItems.filter(
    (item) => item.exportSourceDisclosurePolicy === "closure_snapshot_summary_only"
  ).length;
  const noMemoryPlacementCount = operationalItems.filter(
    (item) => item.memoryPlacement === "none_runtime_only"
  ).length;
  const governanceHistoryNoteCount = exportReadyItems.filter(
    (item) => item.memoryPlacement === "governance_history_note"
  ).length;
  const packageRecordFolderCount = exportReadyItems.filter(
    (item) => item.memoryPlacement === "package_record_folder"
  ).length;
  const noSyncStrategyCount = operationalItems.filter(
    (item) => item.syncStrategy === "none_runtime_only"
  ).length;
  const appendHistoryEntryCount = exportReadyItems.filter(
    (item) => item.syncStrategy === "append_history_entry"
  ).length;
  const replacePackageSnapshotAfterClosureCount = exportReadyItems.filter(
    (item) => item.syncStrategy === "replace_package_snapshot_after_board_closure"
  ).length;
  const noExportRequestShapeCount = operationalItems.filter(
    (item) => item.exportRequestShape === "none_runtime_only"
  ).length;
  const singleRecordExportRequestCount = exportReadyItems.filter(
    (item) => item.exportRequestShape === "single_record_export_request"
  ).length;
  const packageBundleExportRequestCount = exportReadyItems.filter(
    (item) => item.exportRequestShape === "package_bundle_export_request"
  ).length;
  const noExportConfirmationRequirementCount = operationalItems.filter(
    (item) => item.exportConfirmationRequirement === "none_runtime_only"
  ).length;
  const tenantExportConfirmationCount = exportReadyItems.filter(
    (item) => item.exportConfirmationRequirement === "tenant_export_confirmation"
  ).length;
  const boardClosureThenTenantExportConfirmationCount = exportReadyItems.filter(
    (item) => item.exportConfirmationRequirement === "board_closure_then_tenant_export_confirmation"
  ).length;
  const runtimeOnlyRecoveryPathCount = operationalItems.filter(
    (item) => item.exportRecoveryPath === "runtime_only"
  ).length;
  const retryLatestRecordExportCount = exportReadyItems.filter(
    (item) => item.exportRecoveryPath === "retry_latest_record_export"
  ).length;
  const rerunAfterBoardClosureSnapshotCount = exportReadyItems.filter(
    (item) => item.exportRecoveryPath === "rerun_after_board_closure_snapshot"
  ).length;
  const governanceHistoryCandidateItems = exportReadyItems.filter(
    (item): item is HarnessMemoryBoundaryItemView & { id: "governance_decisions" | "implemented_actions" } =>
      item.count > 0 && isGovernanceExportReadyItem(item)
  );
  const packageBundleCandidateItems = exportReadyItems.filter(
    (item): item is HarnessMemoryBoundaryItemView & { id: "package_governance" | "package_deliverables" } =>
      item.count > 0 && isPackageExportReadyItem(item)
  );
  const latestExportDeliveryRecordByCandidateId = new Map<HarnessExportCandidateId, HarnessExportDeliveryRecord>();
  for (const delivery of input.exportDeliveries ?? []) {
    const existing = latestExportDeliveryRecordByCandidateId.get(delivery.candidateId);
    if (!existing || delivery.updatedAt > existing.updatedAt) {
      latestExportDeliveryRecordByCandidateId.set(delivery.candidateId, delivery);
    }
  }
  const exportCandidates: HarnessMemoryBoundaryExportCandidateView[] = [];
  let latestGovernanceDelivery: HarnessExportCandidateDeliveryView | undefined;

  if (governanceHistoryCandidateItems.length > 0) {
    const representative = governanceHistoryCandidateItems[0]!;
    const governanceItemCount = input.completionPackage?.governanceItems.length ?? 0;
    const deferredGovernanceItemCount = input.completionPackage?.deferredApprovalCount ?? 0;
    const deniedGovernanceItemCount = input.completionPackage?.deniedApprovalCount ?? 0;
    const governanceCandidateBase: HarnessMemoryBoundaryExportCandidateView = {
      id: "governance_history_export",
      label: "Governance history export",
      itemCount: governanceHistoryCandidateItems.length,
      itemIds: governanceHistoryCandidateItems.map((item) => item.id),
      itemLabels: governanceHistoryCandidateItems.map((item) => item.label),
      summary:
        `${governanceHistoryCandidateItems.length} governance histor${governanceHistoryCandidateItems.length === 1 ? "y bucket is" : "y buckets are"} grouped into one later tenant export candidate that appends governance history notes.`,
      readiness: representative.readiness,
      readinessLabel: representative.readinessLabel,
      eligibilityRule: "explicit_export_later",
      eligibilityRuleLabel: humanizeMemoryBoundaryEligibilityRule("explicit_export_later"),
      sourceSurface: "recent_decisions",
      sourceSurfaceLabel: humanizeMemoryBoundarySourceSurface("recent_decisions"),
      candidateClass: "governance_history",
      candidateClassLabel: humanizeMemoryBoundaryCandidateClass("governance_history"),
      durabilityCondition: "stable_when_recorded",
      durabilityConditionLabel: humanizeMemoryBoundaryDurabilityCondition("stable_when_recorded"),
      ownershipBoundary: "tenant_owned_later",
      ownershipBoundaryLabel: humanizeMemoryBoundaryOwnershipBoundary("tenant_owned_later"),
      promotionPath: "ready_for_explicit_export",
      promotionPathLabel: humanizeMemoryBoundaryPromotionPath("ready_for_explicit_export"),
      recordTarget: "governance_history_record",
      recordTargetLabel: humanizeMemoryBoundaryRecordTarget("governance_history_record"),
      promotionBlocker: "none_ready_now",
      promotionBlockerLabel: humanizeMemoryBoundaryPromotionBlocker("none_ready_now"),
      promotionAuthority: "tenant_explicit_export",
      promotionAuthorityLabel: humanizeMemoryBoundaryPromotionAuthority("tenant_explicit_export"),
      promotionTrigger: "tenant_export_request",
      promotionTriggerLabel: humanizeMemoryBoundaryPromotionTrigger("tenant_export_request"),
      promotionState: representative.promotionState,
      promotionStateLabel: representative.promotionStateLabel,
      promotionNextStep: representative.promotionNextStep,
      promotionNextStepLabel: representative.promotionNextStepLabel,
      promotionActionFamily: representative.promotionActionFamily,
      promotionActionFamilyLabel: representative.promotionActionFamilyLabel,
      assemblyShape: "standalone_export_record",
      assemblyShapeLabel: humanizeMemoryBoundaryAssemblyShape("standalone_export_record"),
      promotionPhase: "phase_one_governance_history",
      promotionPhaseLabel: humanizeMemoryBoundaryPromotionPhase("phase_one_governance_history"),
      promotionMutability: "append_only_history",
      promotionMutabilityLabel: humanizeMemoryBoundaryPromotionMutability("append_only_history"),
      promotionScope: "single_record_export",
      promotionScopeLabel: humanizeMemoryBoundaryPromotionScope("single_record_export"),
      identityStability: "stable_record_identity",
      identityStabilityLabel: humanizeMemoryBoundaryIdentityStability("stable_record_identity"),
      auditBacking: "decision_ledger_backed",
      auditBackingLabel: humanizeMemoryBoundaryAuditBacking("decision_ledger_backed"),
      concurrencyBoundary: "independent_export_safe",
      concurrencyBoundaryLabel: humanizeMemoryBoundaryConcurrencyBoundary("independent_export_safe"),
      memoryPlacement: representative.memoryPlacement,
      memoryPlacementLabel: representative.memoryPlacementLabel,
      syncStrategy: representative.syncStrategy,
      syncStrategyLabel: representative.syncStrategyLabel,
      exportRequestShape: representative.exportRequestShape,
      exportRequestShapeLabel: representative.exportRequestShapeLabel,
      exportConfirmationRequirement: representative.exportConfirmationRequirement,
      exportConfirmationRequirementLabel: representative.exportConfirmationRequirementLabel,
      exportRecoveryPath: representative.exportRecoveryPath,
      exportRecoveryPathLabel: representative.exportRecoveryPathLabel,
      ...(governanceItemCount > 0
        ? {
            governanceItemCount,
            deferredGovernanceItemCount,
            deniedGovernanceItemCount,
            governanceExportDisposition: "included_in_existing_candidates" as const,
            governanceExportDispositionLabel: "Included in governance history and package exports"
          }
        : {}),
      exportPayloadShape: representative.exportPayloadShape,
      exportPayloadShapeLabel: representative.exportPayloadShapeLabel,
      idempotencyPolicy: representative.idempotencyPolicy,
      idempotencyPolicyLabel: representative.idempotencyPolicyLabel,
      replaySafety: representative.replaySafety,
      replaySafetyLabel: representative.replaySafetyLabel,
      conflictPolicy: representative.conflictPolicy,
      conflictPolicyLabel: representative.conflictPolicyLabel,
      exportAtomicity: representative.exportAtomicity,
      exportAtomicityLabel: representative.exportAtomicityLabel,
      exportDerivationBasis: representative.exportDerivationBasis,
      exportDerivationBasisLabel: representative.exportDerivationBasisLabel,
      exportRevisionPolicy: representative.exportRevisionPolicy,
      exportRevisionPolicyLabel: representative.exportRevisionPolicyLabel,
      exportFreshnessSource: representative.exportFreshnessSource,
      exportFreshnessSourceLabel: representative.exportFreshnessSourceLabel,
      exportValidationBoundary: representative.exportValidationBoundary,
      exportValidationBoundaryLabel: representative.exportValidationBoundaryLabel,
      exportCompletenessRule: representative.exportCompletenessRule,
      exportCompletenessRuleLabel: representative.exportCompletenessRuleLabel,
      exportSensitivity: representative.exportSensitivity,
      exportSensitivityLabel: representative.exportSensitivityLabel,
      exportAudienceBoundary: representative.exportAudienceBoundary,
      exportAudienceBoundaryLabel: representative.exportAudienceBoundaryLabel,
      exportSanitizationPolicy: representative.exportSanitizationPolicy,
      exportSanitizationPolicyLabel: representative.exportSanitizationPolicyLabel,
      exportRedactionBoundary: representative.exportRedactionBoundary,
      exportRedactionBoundaryLabel: representative.exportRedactionBoundaryLabel,
      exportSourceDisclosurePolicy: representative.exportSourceDisclosurePolicy,
      exportSourceDisclosurePolicyLabel: representative.exportSourceDisclosurePolicyLabel,
      exportSequence: "foundational_first",
      exportSequenceLabel: humanizeMemoryBoundaryExportSequence("foundational_first"),
      exportDependencyPolicy: "independent_candidate",
      exportDependencyPolicyLabel: humanizeMemoryBoundaryExportDependencyPolicy("independent_candidate"),
      dependsOnCandidateIds: [],
      dependsOnCandidateLabels: [],
      dependencySummary:
        "This governance history candidate can promote independently once the tenant requests export."
    };
    const currentGovernanceDryRun =
      representative.readiness === "ready_now"
        ? buildGovernanceHistoryExportDryRun(input as unknown as HarnessBoardResponse, governanceCandidateBase)
        : null;
    latestGovernanceDelivery =
      latestExportDeliveryRecordByCandidateId.get("governance_history_export")
        ? toExportCandidateDeliveryView(
            latestExportDeliveryRecordByCandidateId.get("governance_history_export")!,
            currentGovernanceDryRun?.bundleId
          )
        : undefined;
    exportCandidates.push({
      ...governanceCandidateBase,
      ...(latestGovernanceDelivery ? { latestDelivery: latestGovernanceDelivery } : {}),
      exportActions: buildExportCandidateActions({
        runId: input.runId,
        candidateId: "governance_history_export",
        decisions: input.decisionRecords,
        governanceHistoryDependencySatisfied: true,
        candidate: {
          id: "governance_history_export",
          readiness: representative.readiness,
          promotionState: representative.promotionState,
          promotionNextStep: representative.promotionNextStep,
          itemIds: governanceHistoryCandidateItems.map((item) => item.id),
          ...(latestGovernanceDelivery ? { latestDelivery: latestGovernanceDelivery } : {})
        }
      })
    });
  }

  if (packageBundleCandidateItems.length > 0) {
    const representative = packageBundleCandidateItems.find((item) => item.readiness === "after_board_closes")
      ?? packageBundleCandidateItems[0]!;
    const governanceItemCount = input.completionPackage?.governanceItems.length ?? 0;
    const deferredGovernanceItemCount = input.completionPackage?.deferredApprovalCount ?? 0;
    const deniedGovernanceItemCount = input.completionPackage?.deniedApprovalCount ?? 0;
    const currentPackageDryRun =
      representative.readiness === "ready_now"
        ? buildPackageBundleExportDryRun(input as unknown as HarnessBoardResponse, {
            id: "package_bundle_export",
            label: "Package bundle export",
            itemCount: packageBundleCandidateItems.length,
            readiness: representative.readiness,
            readinessLabel: representative.readinessLabel,
            syncStrategy: representative.syncStrategy,
            exportConfirmationRequirement: representative.exportConfirmationRequirement,
            exportSourceDisclosurePolicyLabel: representative.exportSourceDisclosurePolicyLabel,
            exportRedactionBoundaryLabel: representative.exportRedactionBoundaryLabel
          } as HarnessMemoryBoundaryExportCandidateView)
        : null;
    const latestPackageDelivery =
      latestExportDeliveryRecordByCandidateId.get("package_bundle_export")
        ? toExportCandidateDeliveryView(
            latestExportDeliveryRecordByCandidateId.get("package_bundle_export")!,
            currentPackageDryRun?.bundleId
          )
        : undefined;
    exportCandidates.push({
      id: "package_bundle_export",
      label: "Package bundle export",
      itemCount: packageBundleCandidateItems.length,
      itemIds: packageBundleCandidateItems.map((item) => item.id),
      itemLabels: packageBundleCandidateItems.map((item) => item.label),
      summary:
        representative.readiness === "after_board_closes"
          ? `${packageBundleCandidateItems.length} packaged-output bucket${packageBundleCandidateItems.length === 1 ? " still waits" : "s still wait"} on board closure before the tenant bundle can replace the latest package snapshot.`
          : `${packageBundleCandidateItems.length} packaged-output bucket${packageBundleCandidateItems.length === 1 ? " is" : "s are"} grouped into one later tenant export candidate for the package bundle.`,
      readiness: representative.readiness,
      readinessLabel: representative.readinessLabel,
      eligibilityRule: "after_board_closes_then_export",
      eligibilityRuleLabel: humanizeMemoryBoundaryEligibilityRule("after_board_closes_then_export"),
      sourceSurface: "completion_package_deliverables",
      sourceSurfaceLabel: "Completion package bundle",
      candidateClass: "packaged_output",
      candidateClassLabel: humanizeMemoryBoundaryCandidateClass("packaged_output"),
      durabilityCondition: "stable_after_board_closure",
      durabilityConditionLabel: humanizeMemoryBoundaryDurabilityCondition("stable_after_board_closure"),
      ownershipBoundary: "tenant_owned_later",
      ownershipBoundaryLabel: humanizeMemoryBoundaryOwnershipBoundary("tenant_owned_later"),
      promotionPath: "after_board_closure_then_export",
      promotionPathLabel: humanizeMemoryBoundaryPromotionPath("after_board_closure_then_export"),
      recordTarget: "package_deliverable_record",
      recordTargetLabel: "Package bundle export records",
      promotionBlocker: "board_closure_required",
      promotionBlockerLabel: humanizeMemoryBoundaryPromotionBlocker("board_closure_required"),
      promotionAuthority: "board_closure_then_tenant_export",
      promotionAuthorityLabel: humanizeMemoryBoundaryPromotionAuthority("board_closure_then_tenant_export"),
      promotionTrigger: "board_closure",
      promotionTriggerLabel: humanizeMemoryBoundaryPromotionTrigger("board_closure"),
      promotionState: representative.promotionState,
      promotionStateLabel: representative.promotionStateLabel,
      promotionNextStep: representative.promotionNextStep,
      promotionNextStepLabel: representative.promotionNextStepLabel,
      promotionActionFamily: representative.promotionActionFamily,
      promotionActionFamilyLabel: representative.promotionActionFamilyLabel,
      assemblyShape: "package_record_set",
      assemblyShapeLabel: humanizeMemoryBoundaryAssemblyShape("package_record_set"),
      promotionPhase: "phase_two_package_export",
      promotionPhaseLabel: humanizeMemoryBoundaryPromotionPhase("phase_two_package_export"),
      promotionMutability: representative.promotionMutability,
      promotionMutabilityLabel: representative.promotionMutabilityLabel,
      promotionScope: "package_record_set_export",
      promotionScopeLabel: humanizeMemoryBoundaryPromotionScope("package_record_set_export"),
      identityStability: representative.identityStability,
      identityStabilityLabel: representative.identityStabilityLabel,
      auditBacking: "package_closure_backed",
      auditBackingLabel: humanizeMemoryBoundaryAuditBacking("package_closure_backed"),
      concurrencyBoundary: representative.concurrencyBoundary,
      concurrencyBoundaryLabel: representative.concurrencyBoundaryLabel,
      memoryPlacement: representative.memoryPlacement,
      memoryPlacementLabel: representative.memoryPlacementLabel,
      syncStrategy: representative.syncStrategy,
      syncStrategyLabel: representative.syncStrategyLabel,
      exportRequestShape: representative.exportRequestShape,
      exportRequestShapeLabel: representative.exportRequestShapeLabel,
      exportConfirmationRequirement: representative.exportConfirmationRequirement,
      exportConfirmationRequirementLabel: representative.exportConfirmationRequirementLabel,
      exportRecoveryPath: representative.exportRecoveryPath,
      exportRecoveryPathLabel: representative.exportRecoveryPathLabel,
      ...(governanceItemCount > 0
        ? {
            governanceItemCount,
            deferredGovernanceItemCount,
            deniedGovernanceItemCount,
            governanceExportDisposition: "included_in_existing_candidates" as const,
            governanceExportDispositionLabel: "Included in governance history and package exports"
          }
        : {}),
      exportPayloadShape: representative.exportPayloadShape,
      exportPayloadShapeLabel: representative.exportPayloadShapeLabel,
      idempotencyPolicy: representative.idempotencyPolicy,
      idempotencyPolicyLabel: representative.idempotencyPolicyLabel,
      replaySafety: representative.replaySafety,
      replaySafetyLabel: representative.replaySafetyLabel,
      conflictPolicy: representative.conflictPolicy,
      conflictPolicyLabel: representative.conflictPolicyLabel,
      exportAtomicity: representative.exportAtomicity,
      exportAtomicityLabel: representative.exportAtomicityLabel,
      exportDerivationBasis: representative.exportDerivationBasis,
      exportDerivationBasisLabel: representative.exportDerivationBasisLabel,
      exportRevisionPolicy: representative.exportRevisionPolicy,
      exportRevisionPolicyLabel: representative.exportRevisionPolicyLabel,
      exportFreshnessSource: representative.exportFreshnessSource,
      exportFreshnessSourceLabel: representative.exportFreshnessSourceLabel,
      exportValidationBoundary: representative.exportValidationBoundary,
      exportValidationBoundaryLabel: representative.exportValidationBoundaryLabel,
      exportCompletenessRule: representative.exportCompletenessRule,
      exportCompletenessRuleLabel: representative.exportCompletenessRuleLabel,
      exportSensitivity: representative.exportSensitivity,
      exportSensitivityLabel: representative.exportSensitivityLabel,
      exportAudienceBoundary: representative.exportAudienceBoundary,
      exportAudienceBoundaryLabel: representative.exportAudienceBoundaryLabel,
      exportSanitizationPolicy: representative.exportSanitizationPolicy,
      exportSanitizationPolicyLabel: representative.exportSanitizationPolicyLabel,
      exportRedactionBoundary: representative.exportRedactionBoundary,
      exportRedactionBoundaryLabel: representative.exportRedactionBoundaryLabel,
      exportSourceDisclosurePolicy: representative.exportSourceDisclosurePolicy,
      exportSourceDisclosurePolicyLabel: representative.exportSourceDisclosurePolicyLabel,
      exportSequence: "board_closure_following",
      exportSequenceLabel: humanizeMemoryBoundaryExportSequence("board_closure_following"),
      exportDependencyPolicy: "depends_on_governance_history_export",
      exportDependencyPolicyLabel: humanizeMemoryBoundaryExportDependencyPolicy("depends_on_governance_history_export"),
      dependsOnCandidateIds: ["governance_history_export"],
      dependsOnCandidateLabels: ["Governance history export"],
      dependencySummary:
        representative.readiness === "after_board_closes"
          ? "This package bundle candidate still waits on board closure and later follows the governance history export candidate."
          : "This package bundle candidate follows the governance history export candidate once the tenant reaches export time.",
      ...(latestPackageDelivery ? { latestDelivery: latestPackageDelivery } : {}),
      exportActions: buildExportCandidateActions({
        runId: input.runId,
        candidateId: "package_bundle_export",
        decisions: input.decisionRecords,
        governanceHistoryDependencySatisfied: isGovernanceHistoryExportDependencySatisfied(latestGovernanceDelivery),
        candidate: {
          id: "package_bundle_export",
          readiness: representative.readiness,
          promotionState: representative.promotionState,
          promotionNextStep: representative.promotionNextStep,
          itemIds: packageBundleCandidateItems.map((item) => item.id),
          ...(latestPackageDelivery ? { latestDelivery: latestPackageDelivery } : {})
        }
      }),
      ...(representative.nextEligibleSummary ? { nextEligibleSummary: representative.nextEligibleSummary } : {})
    });
  }
  const exportCandidateGroupCount = exportCandidates.length;
  const readyExportCandidateGroupCount = exportCandidates.filter((candidate) => candidate.readiness === "ready_now").length;
  const waitingExportCandidateGroupCount = exportCandidates.filter((candidate) => candidate.readiness === "after_board_closes").length;
  const exportReadyDeliveryCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.latestDelivery?.status === "export_ready"
  ).length;
  const deliveredCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.latestDelivery?.status === "delivered"
  ).length;
  const failedDeliveryCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.latestDelivery?.status === "delivery_failed"
  ).length;
  const inProgressDeliveryCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.latestDelivery?.status === "delivery_in_progress"
  ).length;
  const foundationalExportCandidateCount = exportCandidates.filter(
    (candidate) => candidate.exportSequence === "foundational_first"
  ).length;
  const boardClosureFollowingExportCandidateCount = exportCandidates.filter(
    (candidate) => candidate.exportSequence === "board_closure_following"
  ).length;
  const independentExportCandidateCount = exportCandidates.filter(
    (candidate) => candidate.exportDependencyPolicy === "independent_candidate"
  ).length;
  const dependentExportCandidateCount = exportCandidates.filter(
    (candidate) => candidate.exportDependencyPolicy === "depends_on_governance_history_export"
  ).length;
  const independentExportSafeCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.concurrencyBoundary === "independent_export_safe"
  ).length;
  const requiresClosureSnapshotCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.concurrencyBoundary === "requires_board_closure_snapshot"
  ).length;
  const tenantBusinessContextCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportSensitivity === "tenant_business_context"
  ).length;
  const tenantDeliverableContextCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportSensitivity === "tenant_deliverable_context"
  ).length;
  const governanceHistoryAudienceCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportAudienceBoundary === "tenant_governance_history_readers"
  ).length;
  const packageConsumerAudienceCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportAudienceBoundary === "tenant_package_consumers"
  ).length;
  const exportAsRecordedCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportSanitizationPolicy === "export_as_recorded"
  ).length;
  const sanitizeBeforePackageExportCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportSanitizationPolicy === "sanitize_before_package_export"
  ).length;
  const governanceSafeRedactionCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportRedactionBoundary === "governance_safe_redaction"
  ).length;
  const packageSafeRedactionCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportRedactionBoundary === "package_safe_redaction"
  ).length;
  const decisionSummaryOnlyCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportSourceDisclosurePolicy === "decision_summary_only"
  ).length;
  const closureSnapshotSummaryOnlyCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportSourceDisclosurePolicy === "closure_snapshot_summary_only"
  ).length;
  const singleRecordExportRequestCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportRequestShape === "single_record_export_request"
  ).length;
  const packageBundleExportRequestCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportRequestShape === "package_bundle_export_request"
  ).length;
  const tenantExportConfirmationCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportConfirmationRequirement === "tenant_export_confirmation"
  ).length;
  const boardClosureThenTenantExportConfirmationCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportConfirmationRequirement === "board_closure_then_tenant_export_confirmation"
  ).length;
  const retryLatestRecordExportCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportRecoveryPath === "retry_latest_record_export"
  ).length;
  const rerunAfterBoardClosureSnapshotCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportRecoveryPath === "rerun_after_board_closure_snapshot"
  ).length;
  const governanceHistoryNoteCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.memoryPlacement === "governance_history_note"
  ).length;
  const packageRecordFolderCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.memoryPlacement === "package_record_folder"
  ).length;
  const appendHistoryEntryCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.syncStrategy === "append_history_entry"
  ).length;
  const replacePackageSnapshotAfterClosureCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.syncStrategy === "replace_package_snapshot_after_board_closure"
  ).length;
  const readyForTenantExportCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.promotionState === "ready_for_tenant_export"
  ).length;
  const awaitingBoardClosureCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.promotionState === "awaiting_board_closure"
  ).length;
  const tenantExportAvailableNextStepCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.promotionNextStep === "tenant_export_available"
  ).length;
  const boardClosureThenTenantExportNextStepCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.promotionNextStep === "board_closure_then_tenant_export"
  ).length;
  const tenantExportActionFamilyCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.promotionActionFamily === "tenant_export_candidate"
  ).length;
  const boardClosureActionFamilyCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.promotionActionFamily === "board_closure_before_export"
  ).length;
  const governanceHistoryCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.candidateClass === "governance_history"
  ).length;
  const packagedOutputCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.candidateClass === "packaged_output"
  ).length;
  const stableWhenRecordedCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.durabilityCondition === "stable_when_recorded"
  ).length;
  const stableAfterBoardClosureCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.durabilityCondition === "stable_after_board_closure"
  ).length;
  const tenantOwnedLaterCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.ownershipBoundary === "tenant_owned_later"
  ).length;
  const governanceHistoryRecordCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.recordTarget === "governance_history_record"
  ).length;
  const packageBundleRecordCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.recordTarget === "package_deliverable_record"
  ).length;
  const tenantExplicitExportAuthorityCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.promotionAuthority === "tenant_explicit_export"
  ).length;
  const boardClosureThenTenantExportAuthorityCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.promotionAuthority === "board_closure_then_tenant_export"
  ).length;
  const explicitExportLaterCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.eligibilityRule === "explicit_export_later"
  ).length;
  const afterBoardClosesThenExportCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.eligibilityRule === "after_board_closes_then_export"
  ).length;
  const recentDecisionsSourceCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.sourceSurface === "recent_decisions"
  ).length;
  const completionPackageSurfaceCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.sourceSurface === "completion_package_deliverables"
  ).length;
  const readyForExplicitExportCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.promotionPath === "ready_for_explicit_export"
  ).length;
  const afterBoardClosureThenExportCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.promotionPath === "after_board_closure_then_export"
  ).length;
  const noPromotionBlockerCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.promotionBlocker === "none_ready_now"
  ).length;
  const boardClosureRequiredCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.promotionBlocker === "board_closure_required"
  ).length;
  const tenantExportRequestCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.promotionTrigger === "tenant_export_request"
  ).length;
  const boardClosureTriggerCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.promotionTrigger === "board_closure"
  ).length;
  const standaloneExportRecordCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.assemblyShape === "standalone_export_record"
  ).length;
  const packageRecordSetCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.assemblyShape === "package_record_set"
  ).length;
  const phaseOneExportCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.promotionPhase === "phase_one_governance_history"
  ).length;
  const phaseTwoExportCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.promotionPhase === "phase_two_package_export"
  ).length;
  const appendOnlyHistoryCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.promotionMutability === "append_only_history"
  ).length;
  const replaceableSnapshotCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.promotionMutability === "replaceable_until_board_closure"
  ).length;
  const singleRecordExportScopeCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.promotionScope === "single_record_export"
  ).length;
  const packageRecordSetExportScopeCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.promotionScope === "package_record_set_export"
  ).length;
  const stableIdentityCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.identityStability === "stable_record_identity"
  ).length;
  const closureFinalizedIdentityCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.identityStability === "finalized_after_board_closure"
  ).length;
  const governanceHistoryPayloadCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportPayloadShape === "governance_history_record"
  ).length;
  const packageSnapshotBundleCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportPayloadShape === "package_snapshot_bundle"
  ).length;
  const deterministicUpsertCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.idempotencyPolicy === "deterministic_upsert"
  ).length;
  const boardClosureSnapshotOnceCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.idempotencyPolicy === "board_closure_snapshot_once"
  ).length;
  const replaySafeCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.replaySafety === "replay_safe"
  ).length;
  const freshClosureSnapshotReplayCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.replaySafety === "requires_fresh_board_closure_snapshot"
  ).length;
  const appendOrUpsertConflictCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.conflictPolicy === "append_or_upsert"
  ).length;
  const replaceLatestClosureSnapshotCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.conflictPolicy === "replace_latest_closure_snapshot"
  ).length;
  const recordLevelAtomicCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportAtomicity === "record_level_atomic"
  ).length;
  const closureBundleAtomicCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportAtomicity === "closure_bundle_atomic"
  ).length;
  const decisionHistoryDerivedCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportDerivationBasis === "decision_history_derived"
  ).length;
  const boardClosureSnapshotDerivedCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportDerivationBasis === "board_closure_snapshot_derived"
  ).length;
  const appendNewRevisionCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportRevisionPolicy === "append_new_revision"
  ).length;
  const replaceClosureBundleRevisionCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportRevisionPolicy === "replace_closure_bundle_revision"
  ).length;
  const latestRecordStateCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportFreshnessSource === "latest_record_state"
  ).length;
  const latestBoardClosureSnapshotCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportFreshnessSource === "latest_board_closure_snapshot"
  ).length;
  const recordLevelValidationCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportValidationBoundary === "record_level_validation"
  ).length;
  const closureBundleValidationCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportValidationBoundary === "closure_bundle_validation"
  ).length;
  const selfContainedRecordCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportCompletenessRule === "self_contained_record"
  ).length;
  const boardClosureCompleteBundleCandidateGroupCount = exportCandidates.filter(
    (candidate) => candidate.exportCompletenessRule === "board_closure_complete_bundle"
  ).length;

  const fullView: HarnessMemoryBoundaryView = {
    summary:
      "Wealth Factory runtime keeps bounded operational lane memory live while governance and package records stay ready for later tenant-owned export.",
    exportSummary:
      waitingOnBoardClosureCount > 0
        ? `${readyNowCount} export candidate${readyNowCount === 1 ? "" : "s"} ${readyNowCount === 1 ? "is" : "are"} ready now, and ${waitingOnBoardClosureCount} ${waitingOnBoardClosureCount === 1 ? "still waits" : "still wait"} for board closure.`
        : waitingOnBoardClosureCount === 0
        ? `${readyNowCount} export candidate${readyNowCount === 1 ? "" : "s"} ${readyNowCount === 1 ? "is" : "are"} ready now. No export candidates are waiting on board closure.`
        : "Export readiness will become visible once the board produces tenant-record candidates.",
    deliverySummary:
      failedDeliveryCandidateGroupCount > 0
        ? `${deliveredCandidateGroupCount} export candidate group${deliveredCandidateGroupCount === 1 ? " is" : "s are"} already delivered, ${exportReadyDeliveryCandidateGroupCount} group${exportReadyDeliveryCandidateGroupCount === 1 ? " is" : "s are"} export-ready but not delivered yet${inProgressDeliveryCandidateGroupCount > 0 ? `, and ${inProgressDeliveryCandidateGroupCount} group${inProgressDeliveryCandidateGroupCount === 1 ? " is" : "s are"} currently delivering` : ""}, and ${failedDeliveryCandidateGroupCount} group${failedDeliveryCandidateGroupCount === 1 ? " last failed" : " last failed"} delivery and can be replayed safely.`
        : inProgressDeliveryCandidateGroupCount > 0
        ? `${deliveredCandidateGroupCount} export candidate group${deliveredCandidateGroupCount === 1 ? " is" : "s are"} already delivered, ${exportReadyDeliveryCandidateGroupCount} group${exportReadyDeliveryCandidateGroupCount === 1 ? " is" : "s are"} export-ready but not delivered yet, and ${inProgressDeliveryCandidateGroupCount} group${inProgressDeliveryCandidateGroupCount === 1 ? " is" : "s are"} currently delivering.`
        : exportReadyDeliveryCandidateGroupCount > 0
        ? `${deliveredCandidateGroupCount} export candidate group${deliveredCandidateGroupCount === 1 ? " is" : "s are"} already delivered, and ${exportReadyDeliveryCandidateGroupCount} group${exportReadyDeliveryCandidateGroupCount === 1 ? " is" : "s are"} export-ready but not delivered yet.`
        : deliveredCandidateGroupCount > 0
        ? `${deliveredCandidateGroupCount} export candidate group${deliveredCandidateGroupCount === 1 ? " is" : "s are"} already delivered. No grouped export deliveries are currently pending replay.`
        : "No grouped export deliveries have been attempted yet.",
    readyNowCount,
    waitingOnBoardClosureCount,
    governanceReadyCount,
    packagedReadyCount,
    packagedWaitingCount,
    blockedCandidateCount,
    tenantControlledCandidateCount,
    boardControlledCandidateCount,
    tenantExportTriggerCount,
    boardClosureTriggerCount,
    runtimeOnlyStateCount,
    readyForTenantExportStateCount,
    awaitingBoardClosureStateCount,
    runtimeOnlyNextStepCount,
    tenantExportAvailableNextStepCount,
    boardClosureThenTenantExportNextStepCount,
    noPromotionActionCount,
    tenantExportActionFamilyCount,
    boardClosureActionFamilyCount,
    noAssemblyShapeCount,
    standaloneExportRecordCount,
    packageRecordSetCount,
    noExportPhaseCount,
    phaseOneExportCount,
    phaseTwoExportCount,
    runtimeMutableCount,
    appendOnlyHistoryCount,
    replaceableSnapshotCount,
    stableSnapshotCount,
    noPromotionScopeCount,
    singleRecordExportScopeCount,
    packageRecordSetExportScopeCount,
    transientIdentityCount,
    stableIdentityCount,
    closureFinalizedIdentityCount,
    runtimeStateOnlyAuditCount,
    decisionLedgerAuditCount,
    packageClosureAuditCount,
    runtimeOnlyConcurrencyCount,
    independentExportSafeCount,
    requiresBoardClosureSnapshotCount,
    noExportPayloadShapeCount,
    governanceHistoryPayloadCount,
    packageSnapshotBundleCount,
    noIdempotencyPolicyCount,
    deterministicUpsertCount,
    boardClosureSnapshotOnceCount,
    runtimeOnlyReplaySafetyCount,
    replaySafeCount,
    freshClosureSnapshotReplayCount,
    runtimeOnlyConflictPolicyCount,
    appendOrUpsertConflictCount,
    replaceLatestClosureSnapshotCount,
    noExportAtomicityCount,
    recordLevelAtomicCount,
    closureBundleAtomicCount,
    noExportDerivationBasisCount,
    decisionHistoryDerivedCount,
    boardClosureSnapshotDerivedCount,
    noExportRevisionPolicyCount,
    appendNewRevisionCount,
    replaceClosureBundleRevisionCount,
    noExportFreshnessSourceCount,
    latestRecordStateCount,
    latestBoardClosureSnapshotCount,
    noExportValidationBoundaryCount,
    recordLevelValidationCount,
    closureBundleValidationCount,
    noExportCompletenessRuleCount,
    selfContainedRecordCount,
    boardClosureCompleteBundleCount,
    noExportSensitivityCount,
    tenantBusinessContextCount,
    tenantDeliverableContextCount,
    runtimeOnlyAudienceCount,
    governanceHistoryAudienceCount,
    packageConsumerAudienceCount,
    noExportSanitizationCount,
    exportAsRecordedCount,
    sanitizeBeforePackageExportCount,
    runtimeInternalOnlyRedactionCount,
    governanceSafeRedactionCount,
    packageSafeRedactionCount,
    runtimeOnlySourceDisclosureCount,
    decisionSummaryOnlyCount,
    closureSnapshotSummaryOnlyCount,
    noMemoryPlacementCount,
    governanceHistoryNoteCount,
    packageRecordFolderCount,
    noSyncStrategyCount,
    appendHistoryEntryCount,
    replacePackageSnapshotAfterClosureCount,
    noExportRequestShapeCount,
    singleRecordExportRequestCount,
    packageBundleExportRequestCount,
    noExportConfirmationRequirementCount,
    tenantExportConfirmationCount,
    boardClosureThenTenantExportConfirmationCount,
    runtimeOnlyRecoveryPathCount,
    retryLatestRecordExportCount,
    rerunAfterBoardClosureSnapshotCount,
    continuityTrioRuntimeItemCount,
    attentionSignalRuntimeItemCount,
    runtimeOnlyLongMemoryItemCount,
    roleSummary:
      packagedWaitingCount > 0
        ? `${governanceReadyCount} governance record candidate${governanceReadyCount === 1 ? "" : "s"} ${governanceReadyCount === 1 ? "is" : "are"} ready now, and ${packagedWaitingCount} packaged output candidate${packagedWaitingCount === 1 ? "" : "s"} ${packagedWaitingCount === 1 ? "still waits" : "still wait"} on board closure.`
        : `${governanceReadyCount + packagedReadyCount} tenant-record candidate${governanceReadyCount + packagedReadyCount === 1 ? " is" : "s are"} ready now, including ${governanceReadyCount} governance history candidate${governanceReadyCount === 1 ? "" : "s"} and ${packagedReadyCount} packaged output candidate${packagedReadyCount === 1 ? "" : "s"}.`,
    ownershipSummary:
      `${operationalItems.length} runtime memor${operationalItems.length === 1 ? "y bucket stays" : "y buckets stay"} Wealth Factory-only, while ${exportReadyItems.length} tenant-record candidate bucket${exportReadyItems.length === 1 ? "" : "s"} may become tenant-owned later.`,
    promotionSummary:
      waitingOnBoardClosureCount > 0
        ? `${operationalItems.length} runtime memor${operationalItems.length === 1 ? "y bucket never promotes" : "y buckets never promote"}, ${readyNowCount} candidate bucket${readyNowCount === 1 ? " is" : "s are"} ready for explicit export later, and ${waitingOnBoardClosureCount} candidate bucket${waitingOnBoardClosureCount === 1 ? " still waits" : "s still wait"} on board closure first.`
        : `${operationalItems.length} runtime memor${operationalItems.length === 1 ? "y bucket never promotes" : "y buckets never promote"}, and ${readyNowCount} candidate bucket${readyNowCount === 1 ? " is" : "s are"} ready for explicit export later.`,
    recordTargetSummary:
      waitingOnBoardClosureCount > 0
        ? `${governanceReadyCount} governance history record candidate${governanceReadyCount === 1 ? "" : "s"} ${governanceReadyCount === 1 ? "is" : "are"} ready, while ${packagedReadyCount + packagedWaitingCount} package record candidate${packagedReadyCount + packagedWaitingCount === 1 ? "" : "s"} ${packagedReadyCount + packagedWaitingCount === 1 ? "stays" : "stay"} package-shaped${packagedWaitingCount > 0 ? " until board closure completes" : ""}.`
        : `${governanceReadyCount} governance history record candidate${governanceReadyCount === 1 ? "" : "s"} and ${packagedReadyCount} package record candidate${packagedReadyCount === 1 ? "" : "s"} are ready for later tenant export.`,
    blockerSummary:
      blockedCandidateCount > 0
        ? `${blockedCandidateCount} export candidate bucket${blockedCandidateCount === 1 ? " is" : "s are"} still blocked by board closure. Runtime memory stays non-promotable by design.`
        : "No export candidate buckets are currently blocked. Runtime memory stays non-promotable by design.",
    authoritySummary:
      boardControlledCandidateCount > 0
        ? `${tenantControlledCandidateCount} export candidate bucket${tenantControlledCandidateCount === 1 ? " is" : "s are"} already tenant-controlled for later explicit export, while ${boardControlledCandidateCount} bucket${boardControlledCandidateCount === 1 ? " still needs" : "s still need"} board closure before tenant export can own the next step.`
        : `${tenantControlledCandidateCount} export candidate bucket${tenantControlledCandidateCount === 1 ? " is" : "s are"} tenant-controlled for later explicit export, while runtime memory remains Wealth Factory-only.`,
    triggerSummary:
      boardClosureTriggerCount > 0
        ? `${tenantExportTriggerCount} export candidate bucket${tenantExportTriggerCount === 1 ? " is" : "s are"} waiting only on a later tenant export request, while ${boardClosureTriggerCount} bucket${boardClosureTriggerCount === 1 ? " still needs" : "s still need"} board closure before that request can happen.`
        : `${tenantExportTriggerCount} export candidate bucket${tenantExportTriggerCount === 1 ? " is" : "s are"} ready for a later tenant export request, while runtime memory has no promotion trigger.`,
    stateSummary:
      awaitingBoardClosureStateCount > 0
        ? `${runtimeOnlyStateCount} runtime bucket${runtimeOnlyStateCount === 1 ? " stays" : "s stay"} runtime-only, ${readyForTenantExportStateCount} export candidate bucket${readyForTenantExportStateCount === 1 ? " is" : "s are"} ready for tenant export later, and ${awaitingBoardClosureStateCount} bucket${awaitingBoardClosureStateCount === 1 ? " is" : "s are"} still awaiting board closure.`
        : `${runtimeOnlyStateCount} runtime bucket${runtimeOnlyStateCount === 1 ? " stays" : "s stay"} runtime-only, and ${readyForTenantExportStateCount} export candidate bucket${readyForTenantExportStateCount === 1 ? " is" : "s are"} ready for tenant export later.`,
    nextStepSummary:
      boardClosureThenTenantExportNextStepCount > 0
        ? `${runtimeOnlyNextStepCount} runtime bucket${runtimeOnlyNextStepCount === 1 ? " has" : "s have"} no promotion step, ${tenantExportAvailableNextStepCount} export candidate bucket${tenantExportAvailableNextStepCount === 1 ? " is" : "s are"} ready for a later tenant export step, and ${boardClosureThenTenantExportNextStepCount} bucket${boardClosureThenTenantExportNextStepCount === 1 ? " still needs" : "s still need"} board closure before tenant export becomes the next step.`
        : `${runtimeOnlyNextStepCount} runtime bucket${runtimeOnlyNextStepCount === 1 ? " has" : "s have"} no promotion step, and ${tenantExportAvailableNextStepCount} export candidate bucket${tenantExportAvailableNextStepCount === 1 ? " is" : "s are"} ready for a later tenant export step.`,
    actionFamilySummary:
      boardClosureActionFamilyCount > 0
        ? `${noPromotionActionCount} runtime bucket${noPromotionActionCount === 1 ? " exposes" : "s expose"} no promotion action, ${tenantExportActionFamilyCount} export candidate bucket${tenantExportActionFamilyCount === 1 ? " sits" : "s sit"} in the tenant export family, and ${boardClosureActionFamilyCount} bucket${boardClosureActionFamilyCount === 1 ? " remains" : "s remain"} in the board-closure-first family.`
        : `${noPromotionActionCount} runtime bucket${noPromotionActionCount === 1 ? " exposes" : "s expose"} no promotion action, and ${tenantExportActionFamilyCount} export candidate bucket${tenantExportActionFamilyCount === 1 ? " sits" : "s sit"} in the tenant export family.`,
    assemblySummary:
      packageRecordSetCount > 0
        ? `${noAssemblyShapeCount} runtime bucket${noAssemblyShapeCount === 1 ? " has" : "s have"} no export assembly, ${standaloneExportRecordCount} export candidate bucket${standaloneExportRecordCount === 1 ? " is" : "s are"} ready as standalone export records, and ${packageRecordSetCount} bucket${packageRecordSetCount === 1 ? " still belongs" : "s still belong"} to a package record set after board closure.`
        : `${noAssemblyShapeCount} runtime bucket${noAssemblyShapeCount === 1 ? " has" : "s have"} no export assembly, and ${standaloneExportRecordCount} export candidate bucket${standaloneExportRecordCount === 1 ? " is" : "s are"} ready as standalone export records.`,
    phaseSummary:
      phaseTwoExportCount > 0
        ? `${noExportPhaseCount} runtime bucket${noExportPhaseCount === 1 ? " has" : "s have"} no export phase, ${phaseOneExportCount} export candidate bucket${phaseOneExportCount === 1 ? " is" : "s are"} ready in the phase-one export lane, and ${phaseTwoExportCount} bucket${phaseTwoExportCount === 1 ? " still waits" : "s still wait"} in the phase-two package export lane.`
        : `${noExportPhaseCount} runtime bucket${noExportPhaseCount === 1 ? " has" : "s have"} no export phase, and ${phaseOneExportCount} export candidate bucket${phaseOneExportCount === 1 ? " is" : "s are"} ready in the phase-one export lane.`,
    mutabilitySummary:
      replaceableSnapshotCount > 0
        ? `${runtimeMutableCount} runtime bucket${runtimeMutableCount === 1 ? " stays" : "s stay"} runtime mutable, ${appendOnlyHistoryCount} export candidate bucket${appendOnlyHistoryCount === 1 ? " is" : "s are"} append-only history, and ${replaceableSnapshotCount} bucket${replaceableSnapshotCount === 1 ? " still behaves" : "s still behave"} as replaceable package snapshots until board closure.`
        : stableSnapshotCount > 0
        ? `${runtimeMutableCount} runtime bucket${runtimeMutableCount === 1 ? " stays" : "s stay"} runtime mutable, ${appendOnlyHistoryCount} export candidate bucket${appendOnlyHistoryCount === 1 ? " is" : "s are"} append-only history, and ${stableSnapshotCount} bucket${stableSnapshotCount === 1 ? " is" : "s are"} now stable package snapshots.`
        : `${runtimeMutableCount} runtime bucket${runtimeMutableCount === 1 ? " stays" : "s stay"} runtime mutable, and ${appendOnlyHistoryCount} export candidate bucket${appendOnlyHistoryCount === 1 ? " is" : "s are"} append-only history.`,
    scopeSummary:
      packageRecordSetExportScopeCount > 0
        ? `${noPromotionScopeCount} runtime bucket${noPromotionScopeCount === 1 ? " has" : "s have"} no promotion scope, ${singleRecordExportScopeCount} export candidate bucket${singleRecordExportScopeCount === 1 ? " is" : "s are"} ready as single-record exports, and ${packageRecordSetExportScopeCount} bucket${packageRecordSetExportScopeCount === 1 ? " still belongs" : "s still belong"} to a package record-set export scope.`
        : `${noPromotionScopeCount} runtime bucket${noPromotionScopeCount === 1 ? " has" : "s have"} no promotion scope, and ${singleRecordExportScopeCount} export candidate bucket${singleRecordExportScopeCount === 1 ? " is" : "s are"} ready as single-record exports.`,
    identitySummary:
      closureFinalizedIdentityCount > 0
        ? `${transientIdentityCount} runtime bucket${transientIdentityCount === 1 ? " keeps" : "s keep"} transient runtime identity, ${stableIdentityCount} bucket${stableIdentityCount === 1 ? " already has" : "s already have"} stable record identity, and ${closureFinalizedIdentityCount} bucket${closureFinalizedIdentityCount === 1 ? " still finalizes" : "s still finalize"} identity at board closure.`
        : `${transientIdentityCount} runtime bucket${transientIdentityCount === 1 ? " keeps" : "s keep"} transient runtime identity, and ${stableIdentityCount} bucket${stableIdentityCount === 1 ? " already has" : "s already have"} stable record identity.`,
    auditSummary:
      packageClosureAuditCount > 0
        ? `${runtimeStateOnlyAuditCount} runtime bucket${runtimeStateOnlyAuditCount === 1 ? " stays" : "s stay"} runtime-state-backed, ${decisionLedgerAuditCount} bucket${decisionLedgerAuditCount === 1 ? " is" : "s are"} decision-ledger-backed, and ${packageClosureAuditCount} bucket${packageClosureAuditCount === 1 ? " is" : "s are"} package-closure-backed.`
        : `${runtimeStateOnlyAuditCount} runtime bucket${runtimeStateOnlyAuditCount === 1 ? " stays" : "s stay"} runtime-state-backed, and ${decisionLedgerAuditCount} bucket${decisionLedgerAuditCount === 1 ? " is" : "s are"} decision-ledger-backed.`,
    concurrencySummary:
      requiresBoardClosureSnapshotCount > 0
        ? `${runtimeOnlyConcurrencyCount} runtime bucket${runtimeOnlyConcurrencyCount === 1 ? " stays" : "s stay"} runtime-only, ${independentExportSafeCount} export candidate bucket${independentExportSafeCount === 1 ? " is" : "s are"} safe to promote independently, and ${requiresBoardClosureSnapshotCount} bucket${requiresBoardClosureSnapshotCount === 1 ? " still needs" : "s still need"} a board-closure snapshot for concurrency-safe promotion.`
        : `${runtimeOnlyConcurrencyCount} runtime bucket${runtimeOnlyConcurrencyCount === 1 ? " stays" : "s stay"} runtime-only, and ${independentExportSafeCount} export candidate bucket${independentExportSafeCount === 1 ? " is" : "s are"} safe to promote independently.`,
    payloadShapeSummary:
      packageSnapshotBundleCount > 0
        ? `${noExportPayloadShapeCount} runtime bucket${noExportPayloadShapeCount === 1 ? " has" : "s have"} no export payload shape, ${governanceHistoryPayloadCount} export candidate bucket${governanceHistoryPayloadCount === 1 ? " is" : "s are"} shaped as governance history records, and ${packageSnapshotBundleCount} bucket${packageSnapshotBundleCount === 1 ? " still exports" : "s still export"} as package snapshot bundles.`
        : `${noExportPayloadShapeCount} runtime bucket${noExportPayloadShapeCount === 1 ? " has" : "s have"} no export payload shape, and ${governanceHistoryPayloadCount} export candidate bucket${governanceHistoryPayloadCount === 1 ? " is" : "s are"} shaped as governance history records.`,
    idempotencySummary:
      boardClosureSnapshotOnceCount > 0
        ? `${noIdempotencyPolicyCount} runtime bucket${noIdempotencyPolicyCount === 1 ? " has" : "s have"} no idempotency policy, ${deterministicUpsertCount} export candidate bucket${deterministicUpsertCount === 1 ? " uses" : "use"} deterministic upsert, and ${boardClosureSnapshotOnceCount} bucket${boardClosureSnapshotOnceCount === 1 ? " still depends" : "s still depend"} on a board-closure snapshot-once policy.`
        : `${noIdempotencyPolicyCount} runtime bucket${noIdempotencyPolicyCount === 1 ? " has" : "s have"} no idempotency policy, and ${deterministicUpsertCount} export candidate bucket${deterministicUpsertCount === 1 ? " uses" : "use"} deterministic upsert.`,
    replaySafetySummary:
      freshClosureSnapshotReplayCount > 0
        ? `${runtimeOnlyReplaySafetyCount} runtime bucket${runtimeOnlyReplaySafetyCount === 1 ? " stays" : "s stay"} runtime-only, ${replaySafeCount} export candidate bucket${replaySafeCount === 1 ? " is" : "s are"} replay-safe, and ${freshClosureSnapshotReplayCount} bucket${freshClosureSnapshotReplayCount === 1 ? " still requires" : "s still require"} a fresh board-closure snapshot before replay.`
        : `${runtimeOnlyReplaySafetyCount} runtime bucket${runtimeOnlyReplaySafetyCount === 1 ? " stays" : "s stay"} runtime-only, and ${replaySafeCount} export candidate bucket${replaySafeCount === 1 ? " is" : "s are"} replay-safe.`,
    conflictPolicySummary:
      replaceLatestClosureSnapshotCount > 0
        ? `${runtimeOnlyConflictPolicyCount} runtime bucket${runtimeOnlyConflictPolicyCount === 1 ? " stays" : "s stay"} outside export conflicts, ${appendOrUpsertConflictCount} export candidate bucket${appendOrUpsertConflictCount === 1 ? " uses" : "use"} append-or-upsert conflict handling, and ${replaceLatestClosureSnapshotCount} bucket${replaceLatestClosureSnapshotCount === 1 ? " still replaces" : "s still replace"} the latest board-closure snapshot when promoted.`
        : `${runtimeOnlyConflictPolicyCount} runtime bucket${runtimeOnlyConflictPolicyCount === 1 ? " stays" : "s stay"} outside export conflicts, and ${appendOrUpsertConflictCount} export candidate bucket${appendOrUpsertConflictCount === 1 ? " uses" : "use"} append-or-upsert conflict handling.`,
    atomicitySummary:
      closureBundleAtomicCount > 0
        ? `${noExportAtomicityCount} runtime bucket${noExportAtomicityCount === 1 ? " has" : "s have"} no export atomicity, ${recordLevelAtomicCount} export candidate bucket${recordLevelAtomicCount === 1 ? " commits" : "commit"} as record-level atomic exports, and ${closureBundleAtomicCount} bucket${closureBundleAtomicCount === 1 ? " still depends" : "s still depend"} on closure-bundle atomic export once board closure completes.`
        : `${noExportAtomicityCount} runtime bucket${noExportAtomicityCount === 1 ? " has" : "s have"} no export atomicity, and ${recordLevelAtomicCount} export candidate bucket${recordLevelAtomicCount === 1 ? " commits" : "commit"} as record-level atomic exports.`,
    derivationSummary:
      boardClosureSnapshotDerivedCount > 0
        ? `${noExportDerivationBasisCount} runtime bucket${noExportDerivationBasisCount === 1 ? " has" : "s have"} no export derivation basis, ${decisionHistoryDerivedCount} export candidate bucket${decisionHistoryDerivedCount === 1 ? " is" : "s are"} derived from decision history, and ${boardClosureSnapshotDerivedCount} bucket${boardClosureSnapshotDerivedCount === 1 ? " is" : "s are"} derived from the board-closure snapshot.`
        : `${noExportDerivationBasisCount} runtime bucket${noExportDerivationBasisCount === 1 ? " has" : "s have"} no export derivation basis, and ${decisionHistoryDerivedCount} export candidate bucket${decisionHistoryDerivedCount === 1 ? " is" : "s are"} derived from decision history.`,
    revisionSummary:
      replaceClosureBundleRevisionCount > 0
        ? `${noExportRevisionPolicyCount} runtime bucket${noExportRevisionPolicyCount === 1 ? " has" : "s have"} no export revision policy, ${appendNewRevisionCount} export candidate bucket${appendNewRevisionCount === 1 ? " appends" : "append"} as new revisions, and ${replaceClosureBundleRevisionCount} bucket${replaceClosureBundleRevisionCount === 1 ? " still replaces" : "s still replace"} the current closure-bundle revision.`
        : `${noExportRevisionPolicyCount} runtime bucket${noExportRevisionPolicyCount === 1 ? " has" : "s have"} no export revision policy, and ${appendNewRevisionCount} export candidate bucket${appendNewRevisionCount === 1 ? " appends" : "append"} as new revisions.`,
    freshnessSummary:
      latestBoardClosureSnapshotCount > 0
        ? `${noExportFreshnessSourceCount} runtime bucket${noExportFreshnessSourceCount === 1 ? " has" : "s have"} no export freshness source, ${latestRecordStateCount} export candidate bucket${latestRecordStateCount === 1 ? " uses" : "use"} the latest record state, and ${latestBoardClosureSnapshotCount} bucket${latestBoardClosureSnapshotCount === 1 ? " still depends" : "s still depend"} on the latest board-closure snapshot.`
        : `${noExportFreshnessSourceCount} runtime bucket${noExportFreshnessSourceCount === 1 ? " has" : "s have"} no export freshness source, and ${latestRecordStateCount} export candidate bucket${latestRecordStateCount === 1 ? " uses" : "use"} the latest record state.`,
    validationSummary:
      closureBundleValidationCount > 0
        ? `${noExportValidationBoundaryCount} runtime bucket${noExportValidationBoundaryCount === 1 ? " has" : "s have"} no export validation boundary, ${recordLevelValidationCount} export candidate bucket${recordLevelValidationCount === 1 ? " validates" : "validate"} at record level, and ${closureBundleValidationCount} bucket${closureBundleValidationCount === 1 ? " still validates" : "s still validate"} at closure-bundle level.`
        : `${noExportValidationBoundaryCount} runtime bucket${noExportValidationBoundaryCount === 1 ? " has" : "s have"} no export validation boundary, and ${recordLevelValidationCount} export candidate bucket${recordLevelValidationCount === 1 ? " validates" : "validate"} at record level.`,
    completenessSummary:
      boardClosureCompleteBundleCount > 0
        ? `${noExportCompletenessRuleCount} runtime bucket${noExportCompletenessRuleCount === 1 ? " has" : "s have"} no export completeness rule, ${selfContainedRecordCount} export candidate bucket${selfContainedRecordCount === 1 ? " is" : "s are"} self-contained records, and ${boardClosureCompleteBundleCount} bucket${boardClosureCompleteBundleCount === 1 ? " still completes" : "s still complete"} as board-closure bundles.`
        : `${noExportCompletenessRuleCount} runtime bucket${noExportCompletenessRuleCount === 1 ? " has" : "s have"} no export completeness rule, and ${selfContainedRecordCount} export candidate bucket${selfContainedRecordCount === 1 ? " is" : "s are"} self-contained records.`,
    sensitivitySummary:
      tenantDeliverableContextCount > 0
        ? `${noExportSensitivityCount} runtime bucket${noExportSensitivityCount === 1 ? " has" : "s have"} no export sensitivity, ${tenantBusinessContextCount} export candidate bucket${tenantBusinessContextCount === 1 ? " carries" : "s carry"} tenant business context, and ${tenantDeliverableContextCount} bucket${tenantDeliverableContextCount === 1 ? " still carries" : "s still carry"} tenant deliverable context.`
        : `${noExportSensitivityCount} runtime bucket${noExportSensitivityCount === 1 ? " has" : "s have"} no export sensitivity, and ${tenantBusinessContextCount} export candidate bucket${tenantBusinessContextCount === 1 ? " carries" : "s carry"} tenant business context.`,
    audienceSummary:
      packageConsumerAudienceCount > 0
        ? `${runtimeOnlyAudienceCount} runtime bucket${runtimeOnlyAudienceCount === 1 ? " stays" : "s stay"} Wealth Factory runtime only, ${governanceHistoryAudienceCount} export candidate bucket${governanceHistoryAudienceCount === 1 ? " is aimed" : "s are aimed"} at tenant governance-history readers, and ${packageConsumerAudienceCount} bucket${packageConsumerAudienceCount === 1 ? " still targets" : "s still target"} tenant package consumers.`
        : `${runtimeOnlyAudienceCount} runtime bucket${runtimeOnlyAudienceCount === 1 ? " stays" : "s stay"} Wealth Factory runtime only, and ${governanceHistoryAudienceCount} export candidate bucket${governanceHistoryAudienceCount === 1 ? " is aimed" : "s are aimed"} at tenant governance-history readers.`,
    sanitizationSummary:
      sanitizeBeforePackageExportCount > 0
        ? `${noExportSanitizationCount} runtime bucket${noExportSanitizationCount === 1 ? " has" : "s have"} no export sanitization, ${exportAsRecordedCount} export candidate bucket${exportAsRecordedCount === 1 ? " is exported" : "s are exported"} as recorded, and ${sanitizeBeforePackageExportCount} bucket${sanitizeBeforePackageExportCount === 1 ? " still requires" : "s still require"} sanitization before package export.`
        : `${noExportSanitizationCount} runtime bucket${noExportSanitizationCount === 1 ? " has" : "s have"} no export sanitization, and ${exportAsRecordedCount} export candidate bucket${exportAsRecordedCount === 1 ? " is exported" : "s are exported"} as recorded.`,
    redactionSummary:
      packageSafeRedactionCount > 0
        ? `${runtimeInternalOnlyRedactionCount} runtime bucket${runtimeInternalOnlyRedactionCount === 1 ? " stays" : "s stay"} runtime internal only, ${governanceSafeRedactionCount} export candidate bucket${governanceSafeRedactionCount === 1 ? " uses" : "s use"} governance-safe redaction, and ${packageSafeRedactionCount} bucket${packageSafeRedactionCount === 1 ? " still requires" : "s still require"} package-safe redaction.`
        : `${runtimeInternalOnlyRedactionCount} runtime bucket${runtimeInternalOnlyRedactionCount === 1 ? " stays" : "s stay"} runtime internal only, and ${governanceSafeRedactionCount} export candidate bucket${governanceSafeRedactionCount === 1 ? " uses" : "s use"} governance-safe redaction.`,
    sourceDisclosureSummary:
      closureSnapshotSummaryOnlyCount > 0
        ? `${runtimeOnlySourceDisclosureCount} runtime bucket${runtimeOnlySourceDisclosureCount === 1 ? " is" : "s are"} runtime only, ${decisionSummaryOnlyCount} export candidate bucket${decisionSummaryOnlyCount === 1 ? " discloses" : "s disclose"} decision summaries only, and ${closureSnapshotSummaryOnlyCount} bucket${closureSnapshotSummaryOnlyCount === 1 ? " still discloses" : "s still disclose"} closure-snapshot summaries only.`
        : `${runtimeOnlySourceDisclosureCount} runtime bucket${runtimeOnlySourceDisclosureCount === 1 ? " is" : "s are"} runtime only, and ${decisionSummaryOnlyCount} export candidate bucket${decisionSummaryOnlyCount === 1 ? " discloses" : "s disclose"} decision summaries only.`,
    placementSummary:
      packageRecordFolderCount > 0
        ? `${noMemoryPlacementCount} runtime buckets have no tenant memory placement, ${governanceHistoryNoteCount} export candidate bucket${governanceHistoryNoteCount === 1 ? " lands" : "s land"} as governance history notes, and ${packageRecordFolderCount} bucket${packageRecordFolderCount === 1 ? " still lands" : "s still land"} in package record folders.`
        : `${noMemoryPlacementCount} runtime buckets have no tenant memory placement, and ${governanceHistoryNoteCount} export candidate bucket${governanceHistoryNoteCount === 1 ? " lands" : "s land"} as governance history notes.`,
    syncStrategySummary:
      replacePackageSnapshotAfterClosureCount > 0
        ? `${noSyncStrategyCount} runtime buckets have no tenant sync strategy, ${appendHistoryEntryCount} export candidate bucket${appendHistoryEntryCount === 1 ? " appends" : "s append"} history entries, and ${replacePackageSnapshotAfterClosureCount} bucket${replacePackageSnapshotAfterClosureCount === 1 ? " still replaces" : "s still replace"} package snapshots after board closure.`
        : `${noSyncStrategyCount} runtime buckets have no tenant sync strategy, and ${appendHistoryEntryCount} export candidate bucket${appendHistoryEntryCount === 1 ? " appends" : "s append"} history entries.`,
    requestShapeSummary:
      packageBundleExportRequestCount > 0
        ? `${noExportRequestShapeCount} runtime buckets have no export request shape, ${singleRecordExportRequestCount} export candidate bucket${singleRecordExportRequestCount === 1 ? " uses" : "s use"} single-record export requests, and ${packageBundleExportRequestCount} bucket${packageBundleExportRequestCount === 1 ? " still uses" : "s still use"} package-bundle export requests.`
        : `${noExportRequestShapeCount} runtime buckets have no export request shape, and ${singleRecordExportRequestCount} export candidate bucket${singleRecordExportRequestCount === 1 ? " uses" : "s use"} single-record export requests.`,
    confirmationSummary:
      boardClosureThenTenantExportConfirmationCount > 0
        ? `${noExportConfirmationRequirementCount} runtime buckets have no export confirmation, ${tenantExportConfirmationCount} export candidate bucket${tenantExportConfirmationCount === 1 ? " requires" : "s require"} tenant export confirmation, and ${boardClosureThenTenantExportConfirmationCount} bucket${boardClosureThenTenantExportConfirmationCount === 1 ? " still requires" : "s still require"} board closure before tenant export confirmation.`
        : `${noExportConfirmationRequirementCount} runtime buckets have no export confirmation, and ${tenantExportConfirmationCount} export candidate bucket${tenantExportConfirmationCount === 1 ? " requires" : "s require"} tenant export confirmation.`,
    recoveryPathSummary:
      rerunAfterBoardClosureSnapshotCount > 0
        ? `${runtimeOnlyRecoveryPathCount} runtime buckets are runtime only, ${retryLatestRecordExportCount} export candidate bucket${retryLatestRecordExportCount === 1 ? " retries" : "s retry"} the latest record export, and ${rerunAfterBoardClosureSnapshotCount} bucket${rerunAfterBoardClosureSnapshotCount === 1 ? " still reruns" : "s still rerun"} after the board-closure snapshot.`
        : `${runtimeOnlyRecoveryPathCount} runtime buckets are runtime only, and ${retryLatestRecordExportCount} export candidate bucket${retryLatestRecordExportCount === 1 ? " retries" : "s retry"} the latest record export.`,
    runtimeShapeSummary:
      attentionSignalRuntimeItemCount > 0
        ? `${continuityTrioRuntimeItemCount} runtime bucket${continuityTrioRuntimeItemCount === 1 ? " keeps" : "s keep"} the bounded continuity trio, and ${attentionSignalRuntimeItemCount} bucket${attentionSignalRuntimeItemCount === 1 ? " keeps" : "s keep"} CEO attention as a live control signal.`
        : `${continuityTrioRuntimeItemCount} runtime bucket${continuityTrioRuntimeItemCount === 1 ? " keeps" : "s keep"} the bounded continuity trio.`,
    runtimeLongMemoryDispositionSummary:
      `${runtimeOnlyLongMemoryItemCount} runtime bucket${runtimeOnlyLongMemoryItemCount === 1 ? " stays" : "s stay"} operational Wealth Factory truth and do not promote directly into tenant-owned long memory.`,
    exportCandidateSummary:
      waitingExportCandidateGroupCount > 0
        ? `${readyExportCandidateGroupCount} export candidate group${readyExportCandidateGroupCount === 1 ? " is" : "s are"} ready for later tenant export, and ${waitingExportCandidateGroupCount} group${waitingExportCandidateGroupCount === 1 ? " still waits" : "s still wait"} on board closure first.`
        : `${readyExportCandidateGroupCount} export candidate group${readyExportCandidateGroupCount === 1 ? " is" : "s are"} ready for later tenant export.`,
    exportCandidateGroupCount,
    readyExportCandidateGroupCount,
    waitingExportCandidateGroupCount,
    exportReadyDeliveryCandidateGroupCount,
    deliveredCandidateGroupCount,
    failedDeliveryCandidateGroupCount,
    foundationalExportCandidateCount,
    boardClosureFollowingExportCandidateCount,
    independentExportCandidateCount,
    dependentExportCandidateCount,
    independentExportSafeCandidateGroupCount,
    requiresClosureSnapshotCandidateGroupCount,
    tenantBusinessContextCandidateGroupCount,
    tenantDeliverableContextCandidateGroupCount,
    governanceHistoryAudienceCandidateGroupCount,
    packageConsumerAudienceCandidateGroupCount,
    exportAsRecordedCandidateGroupCount,
    sanitizeBeforePackageExportCandidateGroupCount,
    governanceSafeRedactionCandidateGroupCount,
    packageSafeRedactionCandidateGroupCount,
    decisionSummaryOnlyCandidateGroupCount,
    closureSnapshotSummaryOnlyCandidateGroupCount,
    singleRecordExportRequestCandidateGroupCount,
    packageBundleExportRequestCandidateGroupCount,
    tenantExportConfirmationCandidateGroupCount,
    boardClosureThenTenantExportConfirmationCandidateGroupCount,
    retryLatestRecordExportCandidateGroupCount,
    rerunAfterBoardClosureSnapshotCandidateGroupCount,
    governanceHistoryNoteCandidateGroupCount,
    packageRecordFolderCandidateGroupCount,
    appendHistoryEntryCandidateGroupCount,
    replacePackageSnapshotAfterClosureCandidateGroupCount,
    readyForTenantExportCandidateGroupCount,
    awaitingBoardClosureCandidateGroupCount,
    tenantExportAvailableNextStepCandidateGroupCount,
    boardClosureThenTenantExportNextStepCandidateGroupCount,
    tenantExportActionFamilyCandidateGroupCount,
    boardClosureActionFamilyCandidateGroupCount,
    governanceHistoryCandidateGroupCount,
    packagedOutputCandidateGroupCount,
    stableWhenRecordedCandidateGroupCount,
    stableAfterBoardClosureCandidateGroupCount,
    tenantOwnedLaterCandidateGroupCount,
    governanceHistoryRecordCandidateGroupCount,
    packageBundleRecordCandidateGroupCount,
    tenantExplicitExportAuthorityCandidateGroupCount,
    boardClosureThenTenantExportAuthorityCandidateGroupCount,
    explicitExportLaterCandidateGroupCount,
    afterBoardClosesThenExportCandidateGroupCount,
    recentDecisionsSourceCandidateGroupCount,
    completionPackageSurfaceCandidateGroupCount,
    readyForExplicitExportCandidateGroupCount,
    afterBoardClosureThenExportCandidateGroupCount,
    noPromotionBlockerCandidateGroupCount,
    boardClosureRequiredCandidateGroupCount,
    tenantExportRequestCandidateGroupCount,
    boardClosureTriggerCandidateGroupCount,
    standaloneExportRecordCandidateGroupCount,
    packageRecordSetCandidateGroupCount,
    phaseOneExportCandidateGroupCount,
    phaseTwoExportCandidateGroupCount,
    appendOnlyHistoryCandidateGroupCount,
    replaceableSnapshotCandidateGroupCount,
    singleRecordExportScopeCandidateGroupCount,
    packageRecordSetExportScopeCandidateGroupCount,
    stableIdentityCandidateGroupCount,
    closureFinalizedIdentityCandidateGroupCount,
    governanceHistoryPayloadCandidateGroupCount,
    packageSnapshotBundleCandidateGroupCount,
    deterministicUpsertCandidateGroupCount,
    boardClosureSnapshotOnceCandidateGroupCount,
    replaySafeCandidateGroupCount,
    freshClosureSnapshotReplayCandidateGroupCount,
    appendOrUpsertConflictCandidateGroupCount,
    replaceLatestClosureSnapshotCandidateGroupCount,
    recordLevelAtomicCandidateGroupCount,
    closureBundleAtomicCandidateGroupCount,
    decisionHistoryDerivedCandidateGroupCount,
    boardClosureSnapshotDerivedCandidateGroupCount,
    appendNewRevisionCandidateGroupCount,
    replaceClosureBundleRevisionCandidateGroupCount,
    latestRecordStateCandidateGroupCount,
    latestBoardClosureSnapshotCandidateGroupCount,
    recordLevelValidationCandidateGroupCount,
    closureBundleValidationCandidateGroupCount,
    selfContainedRecordCandidateGroupCount,
    boardClosureCompleteBundleCandidateGroupCount,
    sequenceSummary:
      boardClosureFollowingExportCandidateCount > 0
        ? `${foundationalExportCandidateCount} export candidate group${foundationalExportCandidateCount === 1 ? " forms" : "s form"} the foundational export sequence, and ${boardClosureFollowingExportCandidateCount} group${boardClosureFollowingExportCandidateCount === 1 ? " follows" : "s follow"} after board closure.`
        : `${foundationalExportCandidateCount} export candidate group${foundationalExportCandidateCount === 1 ? " forms" : "s form"} the foundational export sequence. No later board-closure-following candidate groups are waiting right now.`,
    dependencySummary:
      dependentExportCandidateCount > 0
        ? `${independentExportCandidateCount} export candidate group${independentExportCandidateCount === 1 ? " stands" : "s stand"} independently, while ${dependentExportCandidateCount} group${dependentExportCandidateCount === 1 ? " still depends" : "s still depend"} on the governance history export candidate.`
        : `${independentExportCandidateCount} export candidate group${independentExportCandidateCount === 1 ? " stands" : "s stand"} independently. No grouped export candidates currently depend on governance history export.`,
    exportCandidateConcurrencySummary:
      requiresClosureSnapshotCandidateGroupCount > 0
        ? `${independentExportSafeCandidateGroupCount} export candidate group${independentExportSafeCandidateGroupCount === 1 ? " is" : "s are"} concurrency-safe for later independent export, and ${requiresClosureSnapshotCandidateGroupCount} group${requiresClosureSnapshotCandidateGroupCount === 1 ? " still needs" : "s still need"} a board-closure snapshot before export remains concurrency-safe.`
        : `${independentExportSafeCandidateGroupCount} export candidate group${independentExportSafeCandidateGroupCount === 1 ? " is" : "s are"} concurrency-safe for later independent export.`,
    exportCandidateSensitivitySummary:
      tenantDeliverableContextCandidateGroupCount > 0
        ? `${tenantBusinessContextCandidateGroupCount} export candidate group${tenantBusinessContextCandidateGroupCount === 1 ? " carries" : "s carry"} tenant business context, and ${tenantDeliverableContextCandidateGroupCount} group${tenantDeliverableContextCandidateGroupCount === 1 ? " still carries" : "s still carry"} tenant deliverable context.`
        : `${tenantBusinessContextCandidateGroupCount} export candidate group${tenantBusinessContextCandidateGroupCount === 1 ? " carries" : "s carry"} tenant business context.`,
    exportCandidateAudienceSummary:
      packageConsumerAudienceCandidateGroupCount > 0
        ? `${governanceHistoryAudienceCandidateGroupCount} export candidate group${governanceHistoryAudienceCandidateGroupCount === 1 ? " is aimed" : "s are aimed"} at tenant governance-history readers, and ${packageConsumerAudienceCandidateGroupCount} group${packageConsumerAudienceCandidateGroupCount === 1 ? " still targets" : "s still target"} tenant package consumers.`
        : `${governanceHistoryAudienceCandidateGroupCount} export candidate group${governanceHistoryAudienceCandidateGroupCount === 1 ? " is aimed" : "s are aimed"} at tenant governance-history readers.`,
    exportCandidateSanitizationSummary:
      sanitizeBeforePackageExportCandidateGroupCount > 0
        ? `${exportAsRecordedCandidateGroupCount} export candidate group${exportAsRecordedCandidateGroupCount === 1 ? " is exported" : "s are exported"} as recorded, and ${sanitizeBeforePackageExportCandidateGroupCount} group${sanitizeBeforePackageExportCandidateGroupCount === 1 ? " still requires" : "s still require"} sanitization before package export.`
        : `${exportAsRecordedCandidateGroupCount} export candidate group${exportAsRecordedCandidateGroupCount === 1 ? " is exported" : "s are exported"} as recorded.`,
    exportCandidateRedactionSummary:
      packageSafeRedactionCandidateGroupCount > 0
        ? `${governanceSafeRedactionCandidateGroupCount} export candidate group${governanceSafeRedactionCandidateGroupCount === 1 ? " uses" : "s use"} governance-safe redaction, and ${packageSafeRedactionCandidateGroupCount} group${packageSafeRedactionCandidateGroupCount === 1 ? " still requires" : "s still require"} package-safe redaction.`
        : `${governanceSafeRedactionCandidateGroupCount} export candidate group${governanceSafeRedactionCandidateGroupCount === 1 ? " uses" : "s use"} governance-safe redaction.`,
    exportCandidateSourceDisclosureSummary:
      closureSnapshotSummaryOnlyCandidateGroupCount > 0
        ? `${decisionSummaryOnlyCandidateGroupCount} export candidate group${decisionSummaryOnlyCandidateGroupCount === 1 ? " discloses" : "s disclose"} decision summaries only, and ${closureSnapshotSummaryOnlyCandidateGroupCount} group${closureSnapshotSummaryOnlyCandidateGroupCount === 1 ? " still discloses" : "s still disclose"} closure-snapshot summaries only.`
        : `${decisionSummaryOnlyCandidateGroupCount} export candidate group${decisionSummaryOnlyCandidateGroupCount === 1 ? " discloses" : "s disclose"} decision summaries only.`,
    exportCandidateRequestShapeSummary:
      packageBundleExportRequestCandidateGroupCount > 0
        ? `${singleRecordExportRequestCandidateGroupCount} export candidate group${singleRecordExportRequestCandidateGroupCount === 1 ? " uses" : "s use"} single-record export requests, and ${packageBundleExportRequestCandidateGroupCount} group${packageBundleExportRequestCandidateGroupCount === 1 ? " still uses" : "s still use"} package-bundle export requests.`
        : `${singleRecordExportRequestCandidateGroupCount} export candidate group${singleRecordExportRequestCandidateGroupCount === 1 ? " uses" : "s use"} single-record export requests.`,
    exportCandidateConfirmationSummary:
      boardClosureThenTenantExportConfirmationCandidateGroupCount > 0
        ? `${tenantExportConfirmationCandidateGroupCount} export candidate group${tenantExportConfirmationCandidateGroupCount === 1 ? " requires" : "s require"} tenant export confirmation, and ${boardClosureThenTenantExportConfirmationCandidateGroupCount} group${boardClosureThenTenantExportConfirmationCandidateGroupCount === 1 ? " still requires" : "s still require"} board closure before tenant export confirmation.`
        : `${tenantExportConfirmationCandidateGroupCount} export candidate group${tenantExportConfirmationCandidateGroupCount === 1 ? " requires" : "s require"} tenant export confirmation.`,
    exportCandidateRecoveryPathSummary:
      rerunAfterBoardClosureSnapshotCandidateGroupCount > 0
        ? `${retryLatestRecordExportCandidateGroupCount} export candidate group${retryLatestRecordExportCandidateGroupCount === 1 ? " retries" : "s retry"} the latest record export, and ${rerunAfterBoardClosureSnapshotCandidateGroupCount} group${rerunAfterBoardClosureSnapshotCandidateGroupCount === 1 ? " still reruns" : "s still rerun"} after the board-closure snapshot.`
        : `${retryLatestRecordExportCandidateGroupCount} export candidate group${retryLatestRecordExportCandidateGroupCount === 1 ? " retries" : "s retry"} the latest record export.`,
    exportCandidatePlacementSummary:
      packageRecordFolderCandidateGroupCount > 0
        ? `${governanceHistoryNoteCandidateGroupCount} export candidate group${governanceHistoryNoteCandidateGroupCount === 1 ? " lands" : "s land"} as governance history notes, and ${packageRecordFolderCandidateGroupCount} group${packageRecordFolderCandidateGroupCount === 1 ? " still lands" : "s still land"} in package record folders.`
        : `${governanceHistoryNoteCandidateGroupCount} export candidate group${governanceHistoryNoteCandidateGroupCount === 1 ? " lands" : "s land"} as governance history notes.`,
    exportCandidateSyncStrategySummary:
      replacePackageSnapshotAfterClosureCandidateGroupCount > 0
        ? `${appendHistoryEntryCandidateGroupCount} export candidate group${appendHistoryEntryCandidateGroupCount === 1 ? " appends" : "s append"} history entries, and ${replacePackageSnapshotAfterClosureCandidateGroupCount} group${replacePackageSnapshotAfterClosureCandidateGroupCount === 1 ? " still replaces" : "s still replace"} package snapshots after board closure.`
        : `${appendHistoryEntryCandidateGroupCount} export candidate group${appendHistoryEntryCandidateGroupCount === 1 ? " appends" : "s append"} history entries.`,
    exportCandidateStateSummary:
      awaitingBoardClosureCandidateGroupCount > 0
        ? `${readyForTenantExportCandidateGroupCount} export candidate group${readyForTenantExportCandidateGroupCount === 1 ? " is" : "s are"} ready for tenant export later, and ${awaitingBoardClosureCandidateGroupCount} group${awaitingBoardClosureCandidateGroupCount === 1 ? " is" : "s are"} still awaiting board closure.`
        : `${readyForTenantExportCandidateGroupCount} export candidate group${readyForTenantExportCandidateGroupCount === 1 ? " is" : "s are"} ready for tenant export later.`,
    exportCandidateNextStepSummary:
      boardClosureThenTenantExportNextStepCandidateGroupCount > 0
        ? `${tenantExportAvailableNextStepCandidateGroupCount} export candidate group${tenantExportAvailableNextStepCandidateGroupCount === 1 ? " is" : "s are"} ready for a later tenant export step, and ${boardClosureThenTenantExportNextStepCandidateGroupCount} group${boardClosureThenTenantExportNextStepCandidateGroupCount === 1 ? " still needs" : "s still need"} board closure before tenant export becomes the next step.`
        : `${tenantExportAvailableNextStepCandidateGroupCount} export candidate group${tenantExportAvailableNextStepCandidateGroupCount === 1 ? " is" : "s are"} ready for a later tenant export step.`,
    exportCandidateActionFamilySummary:
      boardClosureActionFamilyCandidateGroupCount > 0
        ? `${tenantExportActionFamilyCandidateGroupCount} export candidate group${tenantExportActionFamilyCandidateGroupCount === 1 ? " sits" : "s sit"} in the tenant export family, and ${boardClosureActionFamilyCandidateGroupCount} group${boardClosureActionFamilyCandidateGroupCount === 1 ? " remains" : "s remain"} in the board-closure-first family.`
        : `${tenantExportActionFamilyCandidateGroupCount} export candidate group${tenantExportActionFamilyCandidateGroupCount === 1 ? " sits" : "s sit"} in the tenant export family.`,
    exportCandidateClassSummary:
      packagedOutputCandidateGroupCount > 0
        ? `${governanceHistoryCandidateGroupCount} export candidate group${governanceHistoryCandidateGroupCount === 1 ? " stays" : "s stay"} in governance history, and ${packagedOutputCandidateGroupCount} group${packagedOutputCandidateGroupCount === 1 ? " still stays" : "s still stay"} in packaged output.`
        : `${governanceHistoryCandidateGroupCount} export candidate group${governanceHistoryCandidateGroupCount === 1 ? " stays" : "s stay"} in governance history.`,
    exportCandidateDurabilitySummary:
      stableAfterBoardClosureCandidateGroupCount > 0
        ? `${stableWhenRecordedCandidateGroupCount} export candidate group${stableWhenRecordedCandidateGroupCount === 1 ? " is" : "s are"} stable when recorded, and ${stableAfterBoardClosureCandidateGroupCount} group${stableAfterBoardClosureCandidateGroupCount === 1 ? " still stays" : "s still stay"} stable after board closure.`
        : `${stableWhenRecordedCandidateGroupCount} export candidate group${stableWhenRecordedCandidateGroupCount === 1 ? " is" : "s are"} stable when recorded.`,
    exportCandidateOwnershipSummary:
      `${tenantOwnedLaterCandidateGroupCount} export candidate group${tenantOwnedLaterCandidateGroupCount === 1 ? " remains" : "s remain"} tenant-owned later.`,
    exportCandidateRecordTargetSummary:
      packageBundleRecordCandidateGroupCount > 0
        ? `${governanceHistoryRecordCandidateGroupCount} export candidate group${governanceHistoryRecordCandidateGroupCount === 1 ? " becomes" : "s become"} governance history records, and ${packageBundleRecordCandidateGroupCount} group${packageBundleRecordCandidateGroupCount === 1 ? " still becomes" : "s still become"} package bundle export records.`
        : `${governanceHistoryRecordCandidateGroupCount} export candidate group${governanceHistoryRecordCandidateGroupCount === 1 ? " becomes" : "s become"} governance history records.`,
    exportCandidateAuthoritySummary:
      boardClosureThenTenantExportAuthorityCandidateGroupCount > 0
        ? `${tenantExplicitExportAuthorityCandidateGroupCount} export candidate group${tenantExplicitExportAuthorityCandidateGroupCount === 1 ? " is" : "s are"} tenant-controlled for later explicit export, and ${boardClosureThenTenantExportAuthorityCandidateGroupCount} group${boardClosureThenTenantExportAuthorityCandidateGroupCount === 1 ? " still needs" : "s still need"} board closure before tenant export owns the next move.`
        : `${tenantExplicitExportAuthorityCandidateGroupCount} export candidate group${tenantExplicitExportAuthorityCandidateGroupCount === 1 ? " is" : "s are"} tenant-controlled for later explicit export.`,
    exportCandidateEligibilitySummary:
      afterBoardClosesThenExportCandidateGroupCount > 0
        ? `${explicitExportLaterCandidateGroupCount} export candidate group${explicitExportLaterCandidateGroupCount === 1 ? " is" : "s are"} eligible for later explicit export, and ${afterBoardClosesThenExportCandidateGroupCount} group${afterBoardClosesThenExportCandidateGroupCount === 1 ? " still becomes" : "s still become"} eligible only after board closure.`
        : `${explicitExportLaterCandidateGroupCount} export candidate group${explicitExportLaterCandidateGroupCount === 1 ? " is" : "s are"} eligible for later explicit export.`,
    exportCandidateSourceSurfaceSummary:
      completionPackageSurfaceCandidateGroupCount > 0
        ? `${recentDecisionsSourceCandidateGroupCount} export candidate group${recentDecisionsSourceCandidateGroupCount === 1 ? " comes" : "s come"} from recent decisions, and ${completionPackageSurfaceCandidateGroupCount} group${completionPackageSurfaceCandidateGroupCount === 1 ? " still comes" : "s still come"} from the completion package bundle.`
        : `${recentDecisionsSourceCandidateGroupCount} export candidate group${recentDecisionsSourceCandidateGroupCount === 1 ? " comes" : "s come"} from recent decisions.`,
    exportCandidatePathSummary:
      afterBoardClosureThenExportCandidateGroupCount > 0
        ? `${readyForExplicitExportCandidateGroupCount} export candidate group${readyForExplicitExportCandidateGroupCount === 1 ? " follows" : "s follow"} the ready-for-explicit-export path, and ${afterBoardClosureThenExportCandidateGroupCount} group${afterBoardClosureThenExportCandidateGroupCount === 1 ? " still follows" : "s still follow"} the after-board-closure-then-export path.`
        : `${readyForExplicitExportCandidateGroupCount} export candidate group${readyForExplicitExportCandidateGroupCount === 1 ? " follows" : "s follow"} the ready-for-explicit-export path.`,
    exportCandidateBlockerSummary:
      boardClosureRequiredCandidateGroupCount > 0
        ? `${noPromotionBlockerCandidateGroupCount} export candidate group${noPromotionBlockerCandidateGroupCount === 1 ? " has" : "s have"} no promotion blocker, and ${boardClosureRequiredCandidateGroupCount} group${boardClosureRequiredCandidateGroupCount === 1 ? " still needs" : "s still need"} board closure as the blocker boundary.`
        : `${noPromotionBlockerCandidateGroupCount} export candidate group${noPromotionBlockerCandidateGroupCount === 1 ? " has" : "s have"} no promotion blocker.`,
    exportCandidateTriggerSummary:
      boardClosureTriggerCandidateGroupCount > 0
        ? `${tenantExportRequestCandidateGroupCount} export candidate group${tenantExportRequestCandidateGroupCount === 1 ? " waits" : "s wait"} on a later tenant export request, and ${boardClosureTriggerCandidateGroupCount} group${boardClosureTriggerCandidateGroupCount === 1 ? " still waits" : "s still wait"} on board closure first.`
        : `${tenantExportRequestCandidateGroupCount} export candidate group${tenantExportRequestCandidateGroupCount === 1 ? " waits" : "s wait"} on a later tenant export request.`,
    exportCandidateAssemblySummary:
      packageRecordSetCandidateGroupCount > 0
        ? `${standaloneExportRecordCandidateGroupCount} export candidate group${standaloneExportRecordCandidateGroupCount === 1 ? " assembles" : "s assemble"} as a standalone export record, and ${packageRecordSetCandidateGroupCount} group${packageRecordSetCandidateGroupCount === 1 ? " still assembles" : "s still assemble"} as a package record set.`
        : `${standaloneExportRecordCandidateGroupCount} export candidate group${standaloneExportRecordCandidateGroupCount === 1 ? " assembles" : "s assemble"} as a standalone export record.`,
    exportCandidatePhaseSummary:
      phaseTwoExportCandidateGroupCount > 0
        ? `${phaseOneExportCandidateGroupCount} export candidate group${phaseOneExportCandidateGroupCount === 1 ? " stays" : "s stay"} in phase-one governance export, and ${phaseTwoExportCandidateGroupCount} group${phaseTwoExportCandidateGroupCount === 1 ? " still stays" : "s still stay"} in phase-two package export.`
        : `${phaseOneExportCandidateGroupCount} export candidate group${phaseOneExportCandidateGroupCount === 1 ? " stays" : "s stay"} in phase-one governance export.`,
    exportCandidateMutabilitySummary:
      replaceableSnapshotCandidateGroupCount > 0
        ? `${appendOnlyHistoryCandidateGroupCount} export candidate group${appendOnlyHistoryCandidateGroupCount === 1 ? " stays" : "s stay"} append-only history, and ${replaceableSnapshotCandidateGroupCount} group${replaceableSnapshotCandidateGroupCount === 1 ? " still stays" : "s still stay"} replaceable until board closure.`
        : `${appendOnlyHistoryCandidateGroupCount} export candidate group${appendOnlyHistoryCandidateGroupCount === 1 ? " stays" : "s stay"} append-only history.`,
    exportCandidateScopeSummary:
      packageRecordSetExportScopeCandidateGroupCount > 0
        ? `${singleRecordExportScopeCandidateGroupCount} export candidate group${singleRecordExportScopeCandidateGroupCount === 1 ? " keeps" : "s keep"} a single-record export scope, and ${packageRecordSetExportScopeCandidateGroupCount} group${packageRecordSetExportScopeCandidateGroupCount === 1 ? " still keeps" : "s still keep"} a package record-set export scope.`
        : `${singleRecordExportScopeCandidateGroupCount} export candidate group${singleRecordExportScopeCandidateGroupCount === 1 ? " keeps" : "s keep"} a single-record export scope.`,
    exportCandidateIdentitySummary:
      closureFinalizedIdentityCandidateGroupCount > 0
        ? `${stableIdentityCandidateGroupCount} export candidate group${stableIdentityCandidateGroupCount === 1 ? " already has" : "s already have"} stable record identity, and ${closureFinalizedIdentityCandidateGroupCount} group${closureFinalizedIdentityCandidateGroupCount === 1 ? " still finalizes" : "s still finalize"} identity after board closure.`
        : `${stableIdentityCandidateGroupCount} export candidate group${stableIdentityCandidateGroupCount === 1 ? " already has" : "s already have"} stable record identity.`,
    exportCandidatePayloadShapeSummary:
      packageSnapshotBundleCandidateGroupCount > 0
        ? `${governanceHistoryPayloadCandidateGroupCount} export candidate group${governanceHistoryPayloadCandidateGroupCount === 1 ? " uses" : "s use"} governance history record payloads, and ${packageSnapshotBundleCandidateGroupCount} group${packageSnapshotBundleCandidateGroupCount === 1 ? " still uses" : "s still use"} package snapshot bundle payloads.`
        : `${governanceHistoryPayloadCandidateGroupCount} export candidate group${governanceHistoryPayloadCandidateGroupCount === 1 ? " uses" : "s use"} governance history record payloads.`,
    exportCandidateIdempotencySummary:
      boardClosureSnapshotOnceCandidateGroupCount > 0
        ? `${deterministicUpsertCandidateGroupCount} export candidate group${deterministicUpsertCandidateGroupCount === 1 ? " uses" : "s use"} deterministic upsert, and ${boardClosureSnapshotOnceCandidateGroupCount} group${boardClosureSnapshotOnceCandidateGroupCount === 1 ? " still depends" : "s still depend"} on board-closure snapshot-once idempotency.`
        : `${deterministicUpsertCandidateGroupCount} export candidate group${deterministicUpsertCandidateGroupCount === 1 ? " uses" : "s use"} deterministic upsert.`,
    exportCandidateReplaySafetySummary:
      freshClosureSnapshotReplayCandidateGroupCount > 0
        ? `${replaySafeCandidateGroupCount} export candidate group${replaySafeCandidateGroupCount === 1 ? " is" : "s are"} replay-safe, and ${freshClosureSnapshotReplayCandidateGroupCount} group${freshClosureSnapshotReplayCandidateGroupCount === 1 ? " still requires" : "s still require"} a fresh board-closure snapshot before replay.`
        : `${replaySafeCandidateGroupCount} export candidate group${replaySafeCandidateGroupCount === 1 ? " is" : "s are"} replay-safe.`,
    exportCandidateConflictPolicySummary:
      replaceLatestClosureSnapshotCandidateGroupCount > 0
        ? `${appendOrUpsertConflictCandidateGroupCount} export candidate group${appendOrUpsertConflictCandidateGroupCount === 1 ? " uses" : "s use"} append-or-upsert conflict handling, and ${replaceLatestClosureSnapshotCandidateGroupCount} group${replaceLatestClosureSnapshotCandidateGroupCount === 1 ? " still replaces" : "s still replace"} the latest board-closure snapshot on conflict.`
        : `${appendOrUpsertConflictCandidateGroupCount} export candidate group${appendOrUpsertConflictCandidateGroupCount === 1 ? " uses" : "s use"} append-or-upsert conflict handling.`,
    exportCandidateAtomicitySummary:
      closureBundleAtomicCandidateGroupCount > 0
        ? `${recordLevelAtomicCandidateGroupCount} export candidate group${recordLevelAtomicCandidateGroupCount === 1 ? " commits" : "s commit"} as record-level atomic exports, and ${closureBundleAtomicCandidateGroupCount} group${closureBundleAtomicCandidateGroupCount === 1 ? " still depends" : "s still depend"} on closure-bundle atomic export.`
        : `${recordLevelAtomicCandidateGroupCount} export candidate group${recordLevelAtomicCandidateGroupCount === 1 ? " commits" : "s commit"} as record-level atomic exports.`,
    exportCandidateDerivationSummary:
      boardClosureSnapshotDerivedCandidateGroupCount > 0
        ? `${decisionHistoryDerivedCandidateGroupCount} export candidate group${decisionHistoryDerivedCandidateGroupCount === 1 ? " is" : "s are"} derived from decision history, and ${boardClosureSnapshotDerivedCandidateGroupCount} group${boardClosureSnapshotDerivedCandidateGroupCount === 1 ? " is" : "s are"} derived from the board-closure snapshot.`
        : `${decisionHistoryDerivedCandidateGroupCount} export candidate group${decisionHistoryDerivedCandidateGroupCount === 1 ? " is" : "s are"} derived from decision history.`,
    exportCandidateRevisionSummary:
      replaceClosureBundleRevisionCandidateGroupCount > 0
        ? `${appendNewRevisionCandidateGroupCount} export candidate group${appendNewRevisionCandidateGroupCount === 1 ? " appends" : "s append"} as new revisions, and ${replaceClosureBundleRevisionCandidateGroupCount} group${replaceClosureBundleRevisionCandidateGroupCount === 1 ? " still replaces" : "s still replace"} the current closure-bundle revision.`
        : `${appendNewRevisionCandidateGroupCount} export candidate group${appendNewRevisionCandidateGroupCount === 1 ? " appends" : "s append"} as new revisions.`,
    exportCandidateFreshnessSummary:
      latestBoardClosureSnapshotCandidateGroupCount > 0
        ? `${latestRecordStateCandidateGroupCount} export candidate group${latestRecordStateCandidateGroupCount === 1 ? " uses" : "s use"} the latest record state, and ${latestBoardClosureSnapshotCandidateGroupCount} group${latestBoardClosureSnapshotCandidateGroupCount === 1 ? " still depends" : "s still depend"} on the latest board-closure snapshot.`
        : `${latestRecordStateCandidateGroupCount} export candidate group${latestRecordStateCandidateGroupCount === 1 ? " uses" : "s use"} the latest record state.`,
    exportCandidateValidationSummary:
      closureBundleValidationCandidateGroupCount > 0
        ? `${recordLevelValidationCandidateGroupCount} export candidate group${recordLevelValidationCandidateGroupCount === 1 ? " validates" : "s validate"} at record level, and ${closureBundleValidationCandidateGroupCount} group${closureBundleValidationCandidateGroupCount === 1 ? " still validates" : "s still validate"} at closure-bundle level.`
        : `${recordLevelValidationCandidateGroupCount} export candidate group${recordLevelValidationCandidateGroupCount === 1 ? " validates" : "s validate"} at record level.`,
    exportCandidateCompletenessSummary:
      boardClosureCompleteBundleCandidateGroupCount > 0
        ? `${selfContainedRecordCandidateGroupCount} export candidate group${selfContainedRecordCandidateGroupCount === 1 ? " is" : "s are"} self-contained records, and ${boardClosureCompleteBundleCandidateGroupCount} group${boardClosureCompleteBundleCandidateGroupCount === 1 ? " still completes" : "s still complete"} as board-closure bundles.`
        : `${selfContainedRecordCandidateGroupCount} export candidate group${selfContainedRecordCandidateGroupCount === 1 ? " is" : "s are"} self-contained records.`,
    partitions: {
      runtime: {
        itemCount: operationalItems.length,
        summary: `${operationalItems.length} runtime memor${operationalItems.length === 1 ? "y bucket stays" : "y buckets stay"} live only inside Wealth Factory orchestration.`
      },
      governanceHistoryCandidates: {
        itemCount: governanceReadyCount,
        summary: `${governanceReadyCount} governance history candidate${governanceReadyCount === 1 ? "" : "s"} ${governanceReadyCount === 1 ? "is" : "are"} stable enough for later tenant-owned export.`
      },
      packagedOutputCandidates: {
        itemCount: packagedReadyCount + packagedWaitingCount,
        summary:
          packagedWaitingCount > 0
            ? `${packagedWaitingCount} packaged output candidate${packagedWaitingCount === 1 ? "" : "s"} ${packagedWaitingCount === 1 ? "still waits" : "still wait"} on board closure before later export.`
            : `${packagedReadyCount} packaged output candidate${packagedReadyCount === 1 ? "" : "s"} ${packagedReadyCount === 1 ? "is" : "are"} ready for later tenant-owned export.`
      }
    },
    operationalItems,
    exportReadyItems,
    exportCandidates
  };
  const collapsedExportCandidates = (fullView.exportCandidates ?? []).map((candidate) =>
    collapseMemoryBoundaryExportCandidate(candidate)
  );
  return {
    summary:
      waitingOnBoardClosureCount > 0
        ? `${operationalItems.length} runtime ${operationalItems.length === 1 ? "memory bucket stays" : "memory buckets stay"} inside Wealth Factory while ${collapsedExportCandidates.length} export candidate${collapsedExportCandidates.length === 1 ? " remains" : "s remain"} bounded for later tenant export; ${waitingOnBoardClosureCount} still wait${waitingOnBoardClosureCount === 1 ? "s" : ""} on board closure.`
        : `${operationalItems.length} runtime ${operationalItems.length === 1 ? "memory bucket stays" : "memory buckets stay"} inside Wealth Factory while ${collapsedExportCandidates.length} export candidate${collapsedExportCandidates.length === 1 ? " remains" : "s remain"} bounded for later tenant export.`,
    exportCandidates: collapsedExportCandidates
  } as HarnessMemoryBoundaryView;
}

function collapseMemoryBoundaryExportCandidate(
  candidate: HarnessMemoryBoundaryExportCandidateView
): HarnessMemoryBoundaryExportCandidateView {
  return {
    id: candidate.id,
    label: candidate.label,
    itemCount: candidate.itemCount,
    itemIds: [...candidate.itemIds],
    itemLabels: [...candidate.itemLabels],
    summary: candidate.summary,
    readiness: candidate.readiness,
    readinessLabel: candidate.readinessLabel,
    eligibilityRule: candidate.eligibilityRule,
    eligibilityRuleLabel: candidate.eligibilityRuleLabel,
    promotionBlocker: candidate.promotionBlocker,
    promotionBlockerLabel: candidate.promotionBlockerLabel,
    promotionState: candidate.promotionState,
    promotionStateLabel: candidate.promotionStateLabel,
    promotionNextStep: candidate.promotionNextStep,
    promotionNextStepLabel: candidate.promotionNextStepLabel,
    syncStrategy: candidate.syncStrategy,
    syncStrategyLabel: candidate.syncStrategyLabel,
    exportConfirmationRequirement: candidate.exportConfirmationRequirement,
    exportConfirmationRequirementLabel: candidate.exportConfirmationRequirementLabel,
    exportRedactionBoundary: candidate.exportRedactionBoundary,
    exportRedactionBoundaryLabel: candidate.exportRedactionBoundaryLabel,
    exportSourceDisclosurePolicy: candidate.exportSourceDisclosurePolicy,
    exportSourceDisclosurePolicyLabel: candidate.exportSourceDisclosurePolicyLabel,
    ...(candidate.latestDelivery ? { latestDelivery: { ...candidate.latestDelivery } } : {}),
    ...(candidate.exportActions
      ? {
          exportActions: candidate.exportActions.map((action) => ({ ...action }))
        }
      : {})
  } as HarnessMemoryBoundaryExportCandidateView;
}

function toExportCandidateDeliveryView(
  delivery: HarnessExportDeliveryRecord,
  currentBundleId?: string
): HarnessExportCandidateDeliveryView {
  const primaryNotePath =
    typeof delivery.deliveryReceipt.primaryNotePath === "string" && delivery.deliveryReceipt.primaryNotePath.length > 0
      ? delivery.deliveryReceipt.primaryNotePath
      : delivery.primaryNotePath;
  const claimRecoverySupported = isHarnessExportDeliveryClaimExpired({
    status: delivery.status,
    lastAttemptedAt: delivery.lastAttemptedAt
  });
  const contractFreshness =
    currentBundleId && delivery.bundleId !== currentBundleId ? "stale_bundle" : "current_bundle";
  return {
    status: delivery.status,
    statusLabel: humanizeExportDeliveryStatus(delivery.status),
    summary:
      contractFreshness === "stale_bundle"
        ? "The latest stored export bundle belongs to an older revision and should be rebuilt before any bounded delivery replay."
        : delivery.status === "delivered"
        ? "The latest tenant-safe export bundle was delivered through the bounded private writer seam."
        : delivery.status === "delivery_failed"
        ? "The latest tenant-safe export delivery failed and can be replayed safely through the same bounded export action."
        : delivery.status === "delivery_in_progress"
        ? claimRecoverySupported
          ? "The latest tenant-safe export delivery claim looks stale and can be recovered through the same bounded delivery action."
          : "The latest tenant-safe export bundle is currently being delivered through the bounded private writer seam."
        : "The latest tenant-safe export bundle is export-ready and waiting for bounded delivery.",
    attemptCount: delivery.attemptCount,
    ...(claimRecoverySupported ? { claimRecoverySupported } : {}),
    contractFreshness,
    contractFreshnessLabel: humanizeExportDeliveryContractFreshness(contractFreshness),
    contractFreshnessSummary:
      contractFreshness === "stale_bundle"
        ? "The stored delivery bundle no longer matches the current export contract. Build a fresh export bundle before replaying delivery."
        : "The latest stored delivery bundle still matches the current export contract.",
    ...(delivery.lastAttemptedAt ? { lastAttemptedAtLabel: formatBoardTimestamp(delivery.lastAttemptedAt) } : {}),
    ...(delivery.deliveredAt ? { deliveredAtLabel: formatBoardTimestamp(delivery.deliveredAt) } : {}),
    ...(delivery.writerKind ? { writerKindLabel: humanizeExportDeliveryWriterKind(delivery.writerKind) } : {}),
    ...(primaryNotePath ? { primaryNotePath } : {}),
    ...(delivery.lastErrorCode ? { lastErrorCode: delivery.lastErrorCode } : {}),
    ...(delivery.lastErrorMessage ? { lastErrorMessage: delivery.lastErrorMessage } : {})
  };
}

function humanizeExportDeliveryStatus(status: HarnessExportCandidateDeliveryStatus) {
  switch (status) {
    case "export_ready":
      return "Export ready";
    case "delivered":
      return "Delivered";
    case "delivery_in_progress":
      return "Delivery in progress";
    case "delivery_failed":
      return "Delivery failed";
    default:
      return humanizeLabel(status);
  }
}

function humanizeExportDeliveryContractFreshness(freshness: HarnessExportCandidateDeliveryView["contractFreshness"]) {
  switch (freshness) {
    case "current_bundle":
      return "Current bundle";
    case "stale_bundle":
      return "Stale bundle";
    default:
      return humanizeLabel(freshness);
  }
}

function humanizeExportDeliveryWriterKind(writerKind: NonNullable<HarnessExportDeliveryRecord["writerKind"]>) {
  switch (writerKind) {
    case "obsidian_filesystem":
      return "Obsidian filesystem";
    default:
      return humanizeLabel(writerKind);
  }
}

function isGovernanceHistoryExportDependencySatisfied(
  governanceHistoryDelivery: HarnessExportCandidateDeliveryView | undefined
): boolean {
  return Boolean(
    governanceHistoryDelivery &&
      governanceHistoryDelivery.status === "delivered" &&
      governanceHistoryDelivery.contractFreshness === "current_bundle"
  );
}

function humanizeMemoryBoundaryReadiness(readiness: HarnessMemoryBoundaryReadiness) {
  switch (readiness) {
    case "live_runtime_only":
      return "Live runtime only";
    case "ready_now":
      return "Ready now";
    case "after_board_closes":
      return "After board closes";
    default:
      return humanizeLabel(readiness);
  }
}

function humanizeMemoryBoundaryRole(role: HarnessMemoryBoundaryRole) {
  switch (role) {
    case "runtime_memory":
      return "Runtime memory";
    case "governance_record_candidate":
      return "Governance record candidate";
    case "packaged_record_candidate":
      return "Packaged record candidate";
    default:
      return role;
  }
}

function humanizeMemoryBoundaryEligibilityRule(rule: HarnessMemoryBoundaryEligibilityRule) {
  switch (rule) {
    case "runtime_only":
      return "Runtime only";
    case "explicit_export_later":
      return "Explicit export later";
    case "after_board_closes_then_export":
      return "After board closes, then export";
    default:
      return rule;
  }
}

function humanizeMemoryBoundarySourceSurface(surface: HarnessMemoryBoundarySourceSurface) {
  switch (surface) {
    case "continuity_snapshots":
      return "Continuity snapshots";
    case "pending_attention":
      return "Pending attention";
    case "recent_decisions":
      return "Recent decisions";
    case "follow_through":
      return "Follow-through history";
    case "completion_package_governance":
      return "Completion package governance";
    case "completion_package_deliverables":
      return "Completion package deliverables";
    default:
      return surface;
  }
}

function humanizeMemoryBoundaryCandidateClass(candidateClass: HarnessMemoryBoundaryCandidateClass) {
  switch (candidateClass) {
    case "runtime_operational":
      return "Runtime operational";
    case "governance_history":
      return "Governance history";
    case "packaged_output":
      return "Packaged output";
    default:
      return candidateClass;
  }
}

function humanizeMemoryBoundaryDurabilityCondition(condition: HarnessMemoryBoundaryDurabilityCondition) {
  switch (condition) {
    case "runtime_ephemeral":
      return "Runtime ephemeral";
    case "stable_when_recorded":
      return "Stable when recorded";
    case "stable_after_board_closure":
      return "Stable after board closure";
    default:
      return condition;
  }
}

function humanizeMemoryBoundaryOwnershipBoundary(boundary: HarnessMemoryBoundaryOwnershipBoundary) {
  switch (boundary) {
    case "wealth_factory_only":
      return "Wealth Factory only";
    case "tenant_owned_later":
      return "Tenant-owned later";
    default:
      return boundary;
  }
}

function humanizeMemoryBoundaryPromotionPath(path: HarnessMemoryBoundaryPromotionPath) {
  switch (path) {
    case "never_promotes":
      return "Never promotes";
    case "ready_for_explicit_export":
      return "Ready for explicit export";
    case "after_board_closure_then_export":
      return "After board closure, then export";
    default:
      return path;
  }
}

function humanizeMemoryBoundaryRecordTarget(target: HarnessMemoryBoundaryRecordTarget) {
  switch (target) {
    case "none_runtime_only":
      return "Runtime only";
    case "governance_history_record":
      return "Governance history record";
    case "package_governance_record":
      return "Package governance record";
    case "package_deliverable_record":
      return "Package deliverable record";
    default:
      return target;
  }
}

function humanizeMemoryBoundaryPromotionBlocker(blocker: HarnessMemoryBoundaryPromotionBlocker) {
  switch (blocker) {
    case "not_applicable_runtime_only":
      return "Not applicable in runtime";
    case "none_ready_now":
      return "No blocker";
    case "board_closure_required":
      return "Board closure required";
    default:
      return humanizeLabel(blocker);
  }
}

function humanizeMemoryBoundaryPromotionAuthority(authority: HarnessMemoryBoundaryPromotionAuthority) {
  switch (authority) {
    case "wealth_factory_runtime_only":
      return "Wealth Factory runtime only";
    case "tenant_explicit_export":
      return "Tenant explicit export";
    case "board_closure_then_tenant_export":
      return "Board closure, then tenant export";
    default:
      return humanizeLabel(authority);
  }
}

function humanizeMemoryBoundaryPromotionTrigger(trigger: HarnessMemoryBoundaryPromotionTrigger) {
  switch (trigger) {
    case "not_applicable_runtime":
      return "No promotion trigger";
    case "tenant_export_request":
      return "Tenant export request";
    case "board_closure":
      return "Board closure";
    default:
      return humanizeLabel(trigger);
  }
}

function humanizeMemoryBoundaryPromotionState(state: HarnessMemoryBoundaryPromotionState) {
  switch (state) {
    case "runtime_only":
      return "Runtime only";
    case "ready_for_tenant_export":
      return "Ready for tenant export";
    case "awaiting_board_closure":
      return "Awaiting board closure";
    default:
      return humanizeLabel(state);
  }
}

function humanizeMemoryBoundaryPromotionNextStep(step: HarnessMemoryBoundaryPromotionNextStep) {
  switch (step) {
    case "none_runtime_only":
      return "No promotion step";
    case "tenant_export_available":
      return "Tenant export available";
    case "board_closure_then_tenant_export":
      return "Board closure, then tenant export";
    default:
      return humanizeLabel(step);
  }
}

function humanizeMemoryBoundaryPromotionActionFamily(family: HarnessMemoryBoundaryPromotionActionFamily) {
  switch (family) {
    case "none_runtime_only":
      return "No promotion action";
    case "tenant_export_candidate":
      return "Tenant export family";
    case "board_closure_before_export":
      return "Board closure first";
    default:
      return humanizeLabel(family);
  }
}

function humanizeMemoryBoundaryExportSequence(sequence: HarnessMemoryBoundaryExportSequence) {
  switch (sequence) {
    case "foundational_first":
      return "Foundational export sequence";
    case "board_closure_following":
      return "Board-closure-following sequence";
    default:
      return humanizeLabel(sequence);
  }
}

function humanizeMemoryBoundaryExportDependencyPolicy(policy: HarnessMemoryBoundaryExportDependencyPolicy) {
  switch (policy) {
    case "independent_candidate":
      return "Independent export candidate";
    case "depends_on_governance_history_export":
      return "Depends on governance history export";
    default:
      return humanizeLabel(policy);
  }
}

function humanizeMemoryBoundaryAssemblyShape(shape: HarnessMemoryBoundaryAssemblyShape) {
  switch (shape) {
    case "none_runtime_only":
      return "No export assembly";
    case "standalone_export_record":
      return "Standalone export record";
    case "package_record_set":
      return "Package record set";
    default:
      return shape;
  }
}

function humanizeMemoryBoundaryPromotionPhase(phase: HarnessMemoryBoundaryPromotionPhase) {
  switch (phase) {
    case "not_exported_runtime":
      return "No export phase";
    case "phase_one_governance_history":
      return "Phase-one export";
    case "phase_two_package_export":
      return "Phase-two package export";
    default:
      return phase;
  }
}

function humanizeMemoryBoundaryPromotionMutability(mutability: HarnessMemoryBoundaryPromotionMutability) {
  switch (mutability) {
    case "runtime_mutable":
      return "Runtime mutable";
    case "append_only_history":
      return "Append-only history";
    case "replaceable_until_board_closure":
      return "Replaceable until board closure";
    case "stable_snapshot":
      return "Stable snapshot";
    default:
      return mutability;
  }
}

function humanizeMemoryBoundaryPromotionScope(scope: HarnessMemoryBoundaryPromotionScope) {
  switch (scope) {
    case "none_runtime_only":
      return "No promotion scope";
    case "single_record_export":
      return "Single-record export";
    case "package_record_set_export":
      return "Package record-set export";
    default:
      return scope;
  }
}

function humanizeMemoryBoundaryIdentityStability(stability: HarnessMemoryBoundaryIdentityStability) {
  switch (stability) {
    case "runtime_transient_identity":
      return "Runtime transient identity";
    case "stable_record_identity":
      return "Stable record identity";
    case "finalized_after_board_closure":
      return "Finalized after board closure";
    default:
      return stability;
  }
}

function humanizeMemoryBoundaryAuditBacking(backing: HarnessMemoryBoundaryAuditBacking) {
  switch (backing) {
    case "runtime_state_only":
      return "Runtime-state-backed";
    case "decision_ledger_backed":
      return "Decision-ledger-backed";
    case "package_closure_backed":
      return "Package-closure-backed";
    default:
      return backing;
  }
}

function humanizeMemoryBoundaryConcurrencyBoundary(boundary: HarnessMemoryBoundaryConcurrencyBoundary) {
  switch (boundary) {
    case "runtime_only":
      return "Runtime only";
    case "independent_export_safe":
      return "Independent export safe";
    case "requires_board_closure_snapshot":
      return "Requires board-closure snapshot";
    default:
      return boundary;
  }
}

function humanizeMemoryBoundaryExportPayloadShape(shape: HarnessMemoryBoundaryExportPayloadShape) {
  switch (shape) {
    case "none_runtime_only":
      return "No export payload";
    case "governance_history_record":
      return "Governance history record";
    case "package_snapshot_bundle":
      return "Package snapshot bundle";
    default:
      return shape;
  }
}

function humanizeMemoryBoundaryIdempotencyPolicy(policy: HarnessMemoryBoundaryIdempotencyPolicy) {
  switch (policy) {
    case "not_applicable_runtime":
      return "No idempotency policy";
    case "deterministic_upsert":
      return "Deterministic upsert";
    case "board_closure_snapshot_once":
      return "Board-closure snapshot once";
    default:
      return policy;
  }
}

function humanizeMemoryBoundaryReplaySafety(safety: HarnessMemoryBoundaryReplaySafety) {
  switch (safety) {
    case "runtime_only":
      return "Runtime only";
    case "replay_safe":
      return "Replay-safe";
    case "requires_fresh_board_closure_snapshot":
      return "Requires fresh board-closure snapshot";
    default:
      return safety;
  }
}

function humanizeMemoryBoundaryConflictPolicy(policy: HarnessMemoryBoundaryConflictPolicy) {
  switch (policy) {
    case "runtime_only":
      return "Runtime only";
    case "append_or_upsert":
      return "Append or upsert";
    case "replace_latest_closure_snapshot":
      return "Replace latest closure snapshot";
    default:
      return policy;
  }
}

function humanizeMemoryBoundaryExportAtomicity(atomicity: HarnessMemoryBoundaryExportAtomicity) {
  switch (atomicity) {
    case "none_runtime_only":
      return "No export atomicity";
    case "record_level_atomic":
      return "Record-level atomic";
    case "closure_bundle_atomic":
      return "Closure-bundle atomic";
    default:
      return atomicity;
  }
}

function humanizeMemoryBoundaryExportDerivationBasis(basis: HarnessMemoryBoundaryExportDerivationBasis) {
  switch (basis) {
    case "none_runtime_only":
      return "No export derivation";
    case "decision_history_derived":
      return "Decision-history-derived";
    case "board_closure_snapshot_derived":
      return "Board-closure-snapshot-derived";
    default:
      return basis;
  }
}

function humanizeMemoryBoundaryExportRevisionPolicy(policy: HarnessMemoryBoundaryExportRevisionPolicy) {
  switch (policy) {
    case "none_runtime_only":
      return "No export revision policy";
    case "append_new_revision":
      return "Append new revision";
    case "replace_closure_bundle_revision":
      return "Replace closure-bundle revision";
    default:
      return policy;
  }
}

function humanizeMemoryBoundaryExportFreshnessSource(source: HarnessMemoryBoundaryExportFreshnessSource) {
  switch (source) {
    case "none_runtime_only":
      return "No export freshness source";
    case "latest_record_state":
      return "Latest record state";
    case "latest_board_closure_snapshot":
      return "Latest board-closure snapshot";
    default:
      return source;
  }
}

function humanizeMemoryBoundaryExportValidationBoundary(boundary: HarnessMemoryBoundaryExportValidationBoundary) {
  switch (boundary) {
    case "none_runtime_only":
      return "No export validation";
    case "record_level_validation":
      return "Record-level validation";
    case "closure_bundle_validation":
      return "Closure-bundle validation";
    default:
      return boundary;
  }
}

function humanizeMemoryBoundaryExportCompletenessRule(rule: HarnessMemoryBoundaryExportCompletenessRule) {
  switch (rule) {
    case "none_runtime_only":
      return "No export completeness rule";
    case "self_contained_record":
      return "Self-contained record";
    case "board_closure_complete_bundle":
      return "Board-closure-complete bundle";
    default:
      return rule;
  }
}

function humanizeMemoryBoundaryExportSensitivity(sensitivity: HarnessMemoryBoundaryExportSensitivity) {
  switch (sensitivity) {
    case "none_runtime_only":
      return "No export sensitivity";
    case "tenant_business_context":
      return "Tenant business context";
    case "tenant_deliverable_context":
      return "Tenant deliverable context";
    default:
      return sensitivity;
  }
}

function humanizeMemoryBoundaryExportAudienceBoundary(
  audience: HarnessMemoryBoundaryExportAudienceBoundary
) {
  switch (audience) {
    case "wealth_factory_runtime_only":
      return "Wealth Factory runtime only";
    case "tenant_governance_history_readers":
      return "Tenant governance-history readers";
    case "tenant_package_consumers":
      return "Tenant package consumers";
    default:
      return audience;
  }
}

function humanizeMemoryBoundaryExportSanitizationPolicy(
  policy: HarnessMemoryBoundaryExportSanitizationPolicy
) {
  switch (policy) {
    case "none_runtime_only":
      return "No export sanitization";
    case "export_as_recorded":
      return "Export as recorded";
    case "sanitize_before_package_export":
      return "Sanitize before package export";
    default:
      return policy;
  }
}

function humanizeMemoryBoundaryExportRedactionBoundary(
  boundary: HarnessMemoryBoundaryExportRedactionBoundary
) {
  switch (boundary) {
    case "runtime_internal_only":
      return "Runtime internal only";
    case "governance_safe_redaction":
      return "Governance-safe redaction";
    case "package_safe_redaction":
      return "Package-safe redaction";
    default:
      return boundary;
  }
}

function humanizeMemoryBoundaryExportSourceDisclosurePolicy(
  policy: HarnessMemoryBoundaryExportSourceDisclosurePolicy
) {
  switch (policy) {
    case "runtime_only":
      return "Runtime only";
    case "decision_summary_only":
      return "Decision summary only";
    case "closure_snapshot_summary_only":
      return "Closure snapshot summary only";
    default:
      return policy;
  }
}

function humanizeMemoryBoundaryMemoryPlacement(placement: HarnessMemoryBoundaryMemoryPlacement) {
  switch (placement) {
    case "none_runtime_only":
      return "No tenant memory placement";
    case "governance_history_note":
      return "Governance history note";
    case "package_record_folder":
      return "Package record folder";
    default:
      return placement;
  }
}

function humanizeMemoryBoundarySyncStrategy(strategy: HarnessMemoryBoundarySyncStrategy) {
  switch (strategy) {
    case "none_runtime_only":
      return "No tenant sync strategy";
    case "append_history_entry":
      return "Append history entry";
    case "replace_package_snapshot_after_board_closure":
      return "Replace package snapshot after board closure";
    default:
      return strategy;
  }
}

function humanizeMemoryBoundaryExportRequestShape(shape: HarnessMemoryBoundaryExportRequestShape) {
  switch (shape) {
    case "none_runtime_only":
      return "No export request shape";
    case "single_record_export_request":
      return "Single-record export request";
    case "package_bundle_export_request":
      return "Package-bundle export request";
    default:
      return shape;
  }
}

function humanizeMemoryBoundaryExportConfirmationRequirement(
  requirement: HarnessMemoryBoundaryExportConfirmationRequirement
) {
  switch (requirement) {
    case "none_runtime_only":
      return "No export confirmation";
    case "tenant_export_confirmation":
      return "Tenant export confirmation";
    case "board_closure_then_tenant_export_confirmation":
      return "Board closure, then tenant export confirmation";
    default:
      return requirement;
  }
}

function humanizeMemoryBoundaryExportRecoveryPath(path: HarnessMemoryBoundaryExportRecoveryPath) {
  switch (path) {
    case "runtime_only":
      return "Runtime only";
    case "retry_latest_record_export":
      return "Retry latest record export";
    case "rerun_after_board_closure_snapshot":
      return "Rerun after board-closure snapshot";
    default:
      return path;
  }
}

function toBoardActivityItem(event: HarnessCardEventRecord): HarnessBoardActivityItem {
  const payloadTitle = readOptionalString(event.payload.title);
  const payloadState = readOptionalString(event.payload.to) ?? readOptionalString(event.payload.state);
  const payloadSummary = readOptionalString(event.payload.summary) ?? readOptionalString(event.payload.resultSummary) ?? null;
  const payloadMessage = readOptionalString(event.payload.message);
  const payloadRequestedTitle = readOptionalString(event.payload.requestedTitle);
  const payloadRequestedByPersona = readOptionalString(event.payload.requestedByPersona);
  const payloadFromPersona = readOptionalString(event.payload.fromPersona);
  const payloadToPersona = readOptionalString(event.payload.toPersona);
  const payloadActionKind = readOptionalString(event.payload.actionKind);
  const payloadAttentionReason = readOptionalString(event.payload.reason);
  const payloadDispatchKind = readOptionalString(event.payload.kind);
  const payloadExecutionStage = readOptionalString(event.payload.executionStage);
  const payloadClaimKind = readOptionalString(event.payload.claimKind);
  const payloadTriggeredByPersona = readOptionalString(event.payload.triggeredByPersona);
  const payloadReactivatedRun = readOptionalBoolean(event.payload.reactivatedRun);
  const payloadIgnoredReason = readOptionalString(event.payload.reason);
  const payloadIgnoredLaneState = readOptionalString(event.payload.currentLaneState);
  const payloadOutcomeState = readOptionalString(event.payload.outcomeState);
  const payloadPostOutcomeActionKind = readOptionalString(event.payload.postOutcomeActionKind);
  const payloadPostOutcomeReason = readOptionalString(event.payload.postOutcomeReason);
  const payloadTargetPersona = readOptionalString(event.payload.targetPersona);
  const payloadContinuitySummary = readOptionalString(event.payload.continuitySummary);
  const attentionSnapshot = parseHarnessAttentionSnapshot(event.payload);
  const labelByKind: Record<HarnessCardEventRecord["eventKind"], string> = {
    created: `${payloadTitle ?? "Card"} was opened for this persona lane.`,
    state_changed: `Lane status moved to ${humanizeLabel(payloadState ?? "updated")}.`,
    execution_dispatched: describeExecutionDispatchActivity({
      dispatchKind: payloadDispatchKind ?? null,
      executionStage: payloadExecutionStage ?? null,
      triggeredByPersona: payloadTriggeredByPersona ?? null,
      triggeredByOutcomeState: readOptionalString(event.payload.triggeredByOutcomeState) ?? null,
      reactivatedRun: payloadReactivatedRun ?? null
    }),
    execution_start_ready:
      readOptionalString(event.payload.claimKind) === "existing_working_claim"
      && payloadDispatchKind !== "follow_on_dispatch"
      && payloadExecutionStage === "initial_lane_start"
        ? "Worker execution start was re-prepared for this already-claimed active lane."
        : (
      payloadDispatchKind === "follow_on_dispatch"
        ? "Worker execution start was prepared for the next lane after the prior lane outcome."
        : "Worker execution start was prepared for this lane after claim."
        ),
    execution_start_suppressed:
      payloadDispatchKind === "follow_on_dispatch"
        ? "Worker execution start could not be rebuilt after the next lane was already dispatched."
        : "Worker execution start could not be rebuilt after this lane was already claimed.",
    execution_hook_failed: describeExecutionHookFailureActivity({
      hookFamily: readOptionalString(event.payload.hookFamily) ?? null,
      deliveryMode: readOptionalString(event.payload.deliveryMode) ?? null,
      hookKindLabel: readOptionalString(event.payload.hookKindLabel) ?? null,
      outcomeState: payloadOutcomeState ?? null,
      actionKind: payloadActionKind ?? null,
      attentionDelivery: readOptionalString(event.payload.attentionDelivery) ?? null
    }),
    execution_claimed: describeExecutionClaimActivity({
      claimKind: payloadClaimKind ?? null,
      refreshed: false
    }),
    execution_claim_refreshed: describeExecutionClaimActivity({
      claimKind: payloadClaimKind ?? null,
      refreshed: true
    }),
    execution_outcome_committed: describeCommittedExecutionOutcomeActivity({
        outcomeState: payloadOutcomeState ?? null,
        postOutcomeActionKind: payloadPostOutcomeActionKind ?? null,
        postOutcomeReason: payloadPostOutcomeReason ?? null,
        targetPersona: payloadTargetPersona ?? null,
        summary: payloadSummary ?? null,
        continuitySummary: payloadContinuitySummary ?? null
      }),
    execution_outcome_ignored: describeIgnoredExecutionOutcomeActivity({
      reason: payloadIgnoredReason ?? null,
      currentLaneState: payloadIgnoredLaneState ?? null
    }),
    comment_added: payloadMessage ?? "A new progress note was added to this lane.",
    subcard_proposed: "A supporting sub-card was proposed for CEO review.",
    proposal_absorbed:
      payloadRequestedTitle && payloadRequestedByPersona
        ? `${payloadRequestedByPersona.toUpperCase()} folded "${payloadRequestedTitle}" into this active lane.`
        : "The CEO folded a supporting request into this active lane.",
    lane_handed_off:
      payloadFromPersona && payloadToPersona
        ? `CEO handed this lane from ${payloadFromPersona.toUpperCase()} to ${payloadToPersona.toUpperCase()}.`
        : "CEO handed this active lane to a new persona owner.",
    attention_requested:
      attentionSnapshot
        ? formatAttentionActivityLabel({
            kind: "attention_requested",
            snapshot: attentionSnapshot
          })
        : describeAttentionRequestedActivity({
            actionKind: payloadActionKind,
            reason: payloadAttentionReason
          }),
    attention_resolved:
      attentionSnapshot
        ? formatAttentionActivityLabel({
            kind: "attention_resolved",
            snapshot: attentionSnapshot
          })
        : describeAttentionResolvedActivity({
            actionKind: payloadActionKind,
            reason: payloadAttentionReason
          }),
    result_recorded: payloadSummary
      ? `A new outcome snapshot was recorded for this lane: ${payloadSummary}`
      : "A new outcome snapshot was recorded for this lane."
  };

  return {
    id: event.id,
    label: labelByKind[event.eventKind],
    timestampLabel: formatBoardTimestamp(event.createdAt)
  };
}

function describeIgnoredExecutionOutcomeActivity(input: {
  reason: string | null;
  currentLaneState: string | null;
}): string {
  switch (input.reason) {
    case "stale_execution_claim":
      return "A stale worker callback was ignored because this lane had already moved to a newer execution claim.";
    case "lane_not_working":
      return `A worker callback was ignored because the lane had already left active execution and was ${humanizeLabel(input.currentLaneState ?? "not working")}.`;
    case "terminal_run":
      return "A worker callback was ignored because this run had already closed.";
    default:
      return "A stale or superseded worker callback was ignored.";
  }
}

function describeExecutionDispatchActivity(input: {
  dispatchKind: string | null;
  executionStage: string | null;
  triggeredByPersona: string | null;
  triggeredByOutcomeState: string | null;
  reactivatedRun: boolean | null;
}): string {
  if (input.dispatchKind === "follow_on_dispatch") {
    if (input.triggeredByPersona) {
      if (input.reactivatedRun) {
        if (input.triggeredByOutcomeState === "cancelled") {
          return `A worker reactivated this run and started this lane after ${input.triggeredByPersona.toUpperCase()} cancelled the prior lane.`;
        }
        return `A worker reactivated this run and started this lane from ${input.triggeredByPersona.toUpperCase()}'s follow-on handoff.`;
      }
      if (input.triggeredByOutcomeState === "done") {
        return `A worker started this lane from ${input.triggeredByPersona.toUpperCase()}'s completed-lane handoff.`;
      }
      return `A worker started this lane from ${input.triggeredByPersona.toUpperCase()}'s follow-on handoff.`;
    }
    return input.reactivatedRun
      ? "A worker reactivated this run and started this lane from a follow-on handoff."
      : "A worker started this lane from a follow-on handoff.";
  }
  if (input.executionStage === "initial_lane_start") {
    return "A worker started this lane from the initial execution claim.";
  }
  return "A worker started this lane from the current execution queue.";
}

function describeExecutionClaimActivity(input: {
  claimKind: string | null;
  refreshed: boolean;
}): string {
  if (input.refreshed) {
    return input.claimKind === "working_claim_refresh"
      ? "A worker refreshed a recovered execution claim for this lane."
      : "A worker refreshed the active execution claim for this lane.";
  }
  if (input.claimKind === "existing_working_claim") {
    return "A worker resumed this lane from an already-active execution claim.";
  }
  return input.claimKind === "approved_claim"
    ? "A worker claimed this lane from the approved execution queue."
    : "A worker claimed this lane for execution.";
}

function describeExecutionHookFailureActivity(input: {
  hookFamily: string | null;
  deliveryMode: string | null;
  hookKindLabel: string | null;
  outcomeState: string | null;
  actionKind: string | null;
  attentionDelivery?: string | null;
}): string {
  const deliveryLabel = input.deliveryMode === "specific" ? "specific private hook" : "private hook";
  switch (input.hookFamily) {
    case "lane_outcome_ignored":
      return input.hookKindLabel
        ? `A ${deliveryLabel} for ignored worker outcomes failed after the callback was already rejected (${input.hookKindLabel}).`
        : `A ${deliveryLabel} for ignored worker outcomes failed after the callback was already rejected.`;
    case "lane_outcome_committed":
      return input.outcomeState
        ? `A ${deliveryLabel} for the committed ${humanizeLabel(input.outcomeState)} worker outcome failed after the outcome was already recorded.`
        : `A ${deliveryLabel} for a committed worker outcome failed after the outcome was already recorded.`;
    case "attention_resolved":
      return "A private attention-resolved handoff failed after the worker outcome was already recorded.";
    case "post_outcome_action":
      if (input.attentionDelivery === "reasserted") {
        return input.actionKind
          ? `A replay-safe reasserted ${deliveryLabel} for the ${humanizeLabel(input.actionKind)} post-outcome handoff failed after the worker outcome was already recorded.`
          : `A replay-safe reasserted ${deliveryLabel} for a post-outcome handoff failed after the worker outcome was already recorded.`;
      }
      if (input.attentionDelivery === "requested") {
        return input.actionKind
          ? `A first-request ${deliveryLabel} for the ${humanizeLabel(input.actionKind)} post-outcome handoff failed after the worker outcome was already recorded.`
          : `A first-request ${deliveryLabel} for a post-outcome handoff failed after the worker outcome was already recorded.`;
      }
      return input.actionKind
        ? `A ${deliveryLabel} for the ${humanizeLabel(input.actionKind)} post-outcome handoff failed after the worker outcome was already recorded.`
        : `A ${deliveryLabel} for a post-outcome handoff failed after the worker outcome was already recorded.`;
    case "execution_start_ready":
      return `A ${deliveryLabel} for execution start failed after this lane was already durably prepared.`;
    case "execution_start_suppressed":
      if (input.hookKindLabel === "Reactivated follow-on dispatch") {
        return `A ${deliveryLabel} for reactivated follow-on start suppression failed after this lane was already durably marked as suppressed.`;
      }
      if (input.hookKindLabel === "Follow-on dispatch") {
        return `A ${deliveryLabel} for follow-on start suppression failed after this lane was already durably marked as suppressed.`;
      }
      return `A ${deliveryLabel} for execution-start suppression failed after this lane was already durably marked as suppressed.`;
    case "execution_claimed":
      return `A ${deliveryLabel} for execution claim failed after this lane was already durably claimed.`;
    case "execution_dispatched":
      if (input.hookKindLabel === "Reactivated follow-on dispatch") {
        return `A ${deliveryLabel} for reactivated follow-on execution dispatch failed after this lane was already durably dispatched.`;
      }
      if (input.hookKindLabel === "Follow-on dispatch") {
        return `A ${deliveryLabel} for follow-on execution dispatch failed after this lane was already durably dispatched.`;
      }
      return `A ${deliveryLabel} for execution dispatch failed after this lane was already durably dispatched.`;
    default:
      return "A private worker-execution handoff failed after the durable harness state was already recorded.";
  }
}

function describeCommittedExecutionOutcomeActivity(input: {
  outcomeState: string | null;
  postOutcomeActionKind: string | null;
  postOutcomeReason: string | null;
  targetPersona: string | null;
  summary: string | null;
  continuitySummary: string | null;
}): string {
  if (input.outcomeState === "done") {
    if (input.postOutcomeActionKind === "dispatch_next_lane" && input.targetPersona) {
      return input.summary
        ? `A worker finished this lane and handed the next lane to ${input.targetPersona.toUpperCase()}: ${input.summary}`
        : `A worker finished this lane and handed the next lane to ${input.targetPersona.toUpperCase()}.`;
    }
    if (input.postOutcomeActionKind === "queue_ceo_review") {
      return input.summary
        ? `A worker finished this lane and queued CEO review${input.postOutcomeReason ? ` for ${humanizeLabel(input.postOutcomeReason)}` : ""}: ${input.summary}`
        : `A worker finished this lane and queued CEO review${input.postOutcomeReason ? ` for ${humanizeLabel(input.postOutcomeReason)}` : ""}.`;
    }
      return input.summary ? `A worker finished this lane: ${input.summary}` : "A worker finished this lane.";
  }
  if (input.outcomeState === "waiting") {
      return input.continuitySummary
        ? `A worker paused this lane and is waiting for an explicit resume: ${input.continuitySummary}`
        : input.summary
          ? `A worker paused this lane and is waiting for an explicit resume: ${input.summary}`
          : "A worker paused this lane and is waiting for an explicit resume.";
  }
  if (input.outcomeState === "blocked") {
      return input.continuitySummary
        ? `A worker marked this lane blocked and is waiting for an explicit unblock: ${input.continuitySummary}`
        : input.summary
          ? `A worker marked this lane blocked and is waiting for an explicit unblock: ${input.summary}`
          : "A worker marked this lane blocked and is waiting for an explicit unblock.";
  }
  if (input.outcomeState === "cancelled") {
      if (input.postOutcomeActionKind === "dispatch_next_lane" && input.targetPersona) {
        return input.continuitySummary
          ? `A worker cancelled this lane and handed control to ${input.targetPersona.toUpperCase()}: ${input.continuitySummary}`
          : `A worker cancelled this lane and handed control to ${input.targetPersona.toUpperCase()}.`;
      }
      return input.continuitySummary
        ? `A worker cancelled this lane and returned control to the harness: ${input.continuitySummary}`
        : input.summary
          ? `A worker cancelled this lane and returned control to the harness: ${input.summary}`
        : "A worker cancelled this lane and returned control to the harness.";
  }
  return "A worker committed a new lane outcome.";
}

function buildResolvedAttentionPayload(attention: HarnessAttentionState): Record<string, unknown> {
  return {
    actionKind: attention.action.kind,
    runState: attention.action.runState,
    ...(attention.action.kind === "queue_ceo_review"
      ? {
          reason: attention.action.reason,
          ...(attention.action.completedCardId ? { completedCardId: attention.action.completedCardId } : {}),
          ...(attention.action.nextCardId ? { nextCardId: attention.action.nextCardId } : {})
        }
      : { targetCardId: attention.action.cardId }),
    ...attention.snapshot
  };
}

function buildDerivedAttentionState(
  action: Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>
): HarnessAttentionState {
  const described = describeHarnessPostOutcomeActionKind(action);
  return {
    action,
    requestedAt: new Date().toISOString(),
    snapshot: {
      statusLabel: described.statusLabel,
      summary: described.summary,
      ...(described.reasonLabel ? { reasonLabel: described.reasonLabel } : {}),
      ...(action.kind === "queue_ceo_review" && action.nextCardId ? { targetCardId: action.nextCardId } : {})
    }
  };
}

function createReviewedNextLaneHandoff(input: {
  completedCard: HarnessCardRecord;
  continuity: HarnessCardContinuityRecord | null;
}): HarnessWorkerDispatchHandoff {
  return {
    kind: "follow_on_dispatch",
    kindLabel: "Follow-on dispatch",
    executionStage: "post_outcome_follow_on",
    executionStageLabel: "Post-outcome follow-on",
    reactivatedRun: false,
    triggeredByCardId: input.completedCard.id,
    triggeredByPersona: input.completedCard.persona,
    triggeredByOutcomeState: "done",
    ...(input.continuity?.latestResultSummary
      ? { triggeredByResultSummary: input.continuity.latestResultSummary }
      : {})
  };
}

function buildPendingAttentionView(input: {
  run: HarnessRunRecord;
  cards: readonly HarnessCardRecord[];
  continuityByCardId: ReadonlyMap<string, HarnessCardContinuityRecord>;
  proposals: readonly HarnessSubCardProposal[];
  events: readonly HarnessCardEventRecord[];
}): HarnessPendingAttentionView | null {
  const action = determineHarnessPostOutcomeAction({
    runState: input.run.state,
    cards: input.cards,
    proposals: input.proposals,
    nextDispatchCard: null
  });
  if (!action || action.kind === "dispatch_next_lane") {
    return null;
  }

  const described = describeHarnessPostOutcomeActionKind(action);
  const currentAttention = deriveCurrentHarnessAttentionState(input.events);
  const persistedSnapshot =
    currentAttention && isSameAttentionAction(currentAttention.action, action)
      ? currentAttention.snapshot
      : null;
  const targetCardId =
    "cardId" in action
      ? action.cardId
      : action.kind === "queue_ceo_review"
        ? action.nextCardId ?? null
        : null;
  const targetCard = targetCardId
    ? input.cards.find((card) => card.id === targetCardId) ?? null
    : null;
  const continuitySummary =
    targetCard ? input.continuityByCardId.get(targetCard.id)?.continuitySummary ?? null : null;
  const attentionReasonLabel = persistedSnapshot?.reasonLabel ?? described.reasonLabel;
  const attentionTargetCardId = persistedSnapshot?.targetCardId ?? targetCard?.id;
  const attentionTargetPersona =
    persistedSnapshot?.targetPersona
      ? persistedSnapshot.targetPersona.toUpperCase()
      : (targetCard ? targetCard.persona.toUpperCase() : undefined);
  const attentionTargetTitle = persistedSnapshot?.targetTitle ?? targetCard?.title;
  const pendingApprovalCount = input.proposals.filter(
    (proposal) => proposal.status === "proposed" || proposal.status === "deferred"
  ).length;
  const proposedApprovalCount = input.proposals.filter((proposal) => proposal.status === "proposed").length;
  const deferredApprovalCount = input.proposals.filter((proposal) => proposal.status === "deferred").length;
  const firstPendingProposal = input.proposals
    .filter((proposal) => proposal.status === "proposed" || proposal.status === "deferred")
    .sort(comparePendingProposalQueue)[0];
  const backlogMode =
    proposedApprovalCount > 0 && deferredApprovalCount > 0
      ? "mixed_backlog"
      : deferredApprovalCount > 0
        ? "carry_forward_review"
        : proposedApprovalCount > 0
          ? "new_work_waiting"
          : undefined;

  return {
    kind: action.kind,
    runState: action.runState,
    statusLabel: persistedSnapshot?.statusLabel ?? described.statusLabel,
    summary:
      persistedSnapshot?.summary
      ?? (action.kind === "queue_ceo_review" ? described.summary : continuitySummary ?? described.summary),
    ...(action.kind === "queue_ceo_review"
      ? (action.reason === "next_lane_decision"
          ? {
              actionRoute: "review-attention" as const,
              actionPath: `/api/harness/runs/${encodeURIComponent(input.run.id)}/review-attention`,
              actionMethod: "POST" as const,
              actionHandle: createPendingAttentionActionToken({
                runId: input.run.id,
                action
              }),
              actionLabel: "Sequence next lane",
              actionDescription: "Choose the next bounded move before another child lane starts.",
              requestFields: [
                {
                  name: "decision",
                  label: "Review decision",
                  description: "Choose how the CEO wants the board to proceed after this completed child lane.",
                  required: true,
                  allowedValues: ["start_next_lane", "request_changes", "defer", "move_to_assembly"]
                }
              ] satisfies HarnessActionRequestFieldView[],
              actionOptions: [
                {
                  value: "start_next_lane",
                  label: "Start next lane",
                  description: "Approve the waiting child lane and send it into execution now.",
                  emphasis: "primary",
                  nextEffectSummary: "The next approved lane becomes active and re-enters the worker queue through the guarded runtime path.",
                  exampleRequest: {
                    decision: "start_next_lane"
                  }
                },
                {
                  value: "request_changes",
                  label: "Request changes",
                  description: "Send the completed child lane back into execution for one more bounded revision pass.",
                  emphasis: "secondary",
                  nextEffectSummary: "The completed lane is reopened and re-dispatched as the next bounded work item.",
                  exampleRequest: {
                    decision: "request_changes"
                  }
                },
                {
                  value: "defer",
                  label: "Defer decision",
                  description: "Hold the board at this review checkpoint without starting new work yet.",
                  emphasis: "secondary",
                  nextEffectSummary: "No additional lane starts until the CEO comes back and chooses the next bounded move.",
                  exampleRequest: {
                    decision: "defer"
                  }
                },
                {
                  value: "move_to_assembly",
                  label: "Move to assembly",
                  description: "Stop the remaining unstarted approved lanes and push the board toward packaging.",
                  emphasis: "secondary",
                  requiresConfirmation: true,
                  confirmationLabel: "Skip the remaining approved lanes and move this board toward assembly?",
                  nextEffectSummary: "The board cancels the remaining unstarted approved lanes and enters the assembly review path.",
                  exampleRequest: {
                    decision: "move_to_assembly"
                  }
                }
              ] satisfies HarnessActionOptionView[],
              recommendedOptionValue: "start_next_lane" as const,
              allowedDecisions: ["start_next_lane", "request_changes", "defer", "move_to_assembly"] as HarnessAttentionReviewDecision[]
            }
          : action.runState === "assembling"
          ? {
              actionRoute: "review-attention" as const,
              actionPath: `/api/harness/runs/${encodeURIComponent(input.run.id)}/review-attention`,
              actionMethod: "POST" as const,
              actionHandle: createPendingAttentionActionToken({
                runId: input.run.id,
                action
              }),
              actionLabel: "Review final assembly",
              actionDescription: "Finish the current board cycle or intentionally start the next one.",
              requestFields: [
                {
                  name: "decision",
                  label: "Review decision",
                  description: "Choose whether to close the current board cycle or start the next one.",
                  required: true,
                  allowedValues: ["complete_run", "start_fresh_cycle"]
                },
                {
                  name: "completionSummary",
                  label: "Completion summary",
                  description: "Optional tenant-facing summary to package with the completed run.",
                  required: false,
                  requiredWhenValue: "complete_run"
                },
                {
                  name: "mode",
                  label: "Fresh-cycle mode",
                  description: "Choose whether the next cycle should reopen deferred work or start clean.",
                  required: false,
                  supportedWhenValue: "start_fresh_cycle",
                  allowedValues: ["reopen_deferred", "clean"]
                }
              ] satisfies HarnessActionRequestFieldView[],
              actionOptions: [
                {
                  value: "complete_run",
                  label: "Complete run",
                  description: "Close the current board cycle and package the current business outcome.",
                  emphasis: "primary",
                  nextEffectSummary: "The current run closes as done and the tenant-facing package stays on this board cycle.",
                  exampleRequest: {
                    decision: "complete_run"
                  }
                },
                {
                  value: "start_fresh_cycle",
                  label: "Start fresh cycle",
                  description: "Open the next board cycle from this run, with or without reopening deferred work.",
                  emphasis: "secondary",
                  nextEffectSummary: "A new run starts from this board, optionally carrying deferred follow-on work into the next cycle.",
                  requiresConfirmation: true,
                  confirmationLabel: "Start a new board cycle from this run?",
                  exampleRequest: {
                    decision: "start_fresh_cycle",
                    mode: "reopen_deferred"
                  }
                }
              ] satisfies HarnessActionOptionView[],
              recommendedOptionValue: "complete_run" as const,
              allowedDecisions: ["complete_run", "start_fresh_cycle"] as HarnessAttentionReviewDecision[]
            }
          : {
              actionRoute: "pending-approvals" as const,
              actionLabel: "Review pending approvals",
              actionDescription: "Open the proposal review queue to clear governance backlog before more work starts.",
              pendingApprovalCount,
              ...(typeof backlogMode === "string"
                ? {
                    proposedApprovalCount,
                    deferredApprovalCount,
                    backlogMode
                  }
                : {}),
              ...(firstPendingProposal
                ? {
                    targetProposalId: firstPendingProposal.id,
                    targetStatusLabel:
                      firstPendingProposal.status === "deferred"
                        ? "Deferred for later CEO review"
                        : "Pending CEO approval",
                    targetPersona: firstPendingProposal.persona.toUpperCase(),
                    targetTitle: firstPendingProposal.title,
                    targetSummary: `Next queue target: ${firstPendingProposal.persona.toUpperCase()} · ${firstPendingProposal.title}`
                  }
                : {})
            })
      : {
          actionRoute: "resolve-attention" as const,
          actionPath: `/api/harness/runs/${encodeURIComponent(input.run.id)}/resolve-attention`,
          actionMethod: "POST" as const,
          actionHandle: createPendingAttentionActionToken({
            runId: input.run.id,
            action
          }),
          actionLabel: action.kind === "await_lane_resume" ? "Resume lane" : "Unblock lane",
          actionDescription:
            action.kind === "await_lane_resume"
              ? "Resume the waiting lane when the required board input is ready."
              : "Clear the blocked lane when the missing dependency has been resolved.",
          requestFields: [
            {
              name: "resolution",
              label: "Resolution choice",
              description: "Choose the single bounded step that resolves this attention state.",
              required: true,
              allowedValues: [action.kind === "await_lane_resume" ? "resume_lane" : "unblock_lane"]
            },
            {
              name: "resumeSummary",
              label: action.kind === "await_lane_resume" ? "Resume summary" : "Unblock summary",
              description: "Optional tenant-safe note describing what changed before execution resumes.",
              required: false
            }
          ] satisfies HarnessActionRequestFieldView[],
          actionOptions: [
            {
              value: action.kind === "await_lane_resume" ? "resume_lane" : "unblock_lane",
              label: action.kind === "await_lane_resume" ? "Resume lane" : "Unblock lane",
              description:
                action.kind === "await_lane_resume"
                  ? "Return the lane to active execution with an optional bounded resume note."
                  : "Move the lane out of its blocked state so execution can continue.",
              emphasis: "primary",
              nextEffectSummary:
                action.kind === "await_lane_resume"
                  ? "The lane returns to active execution and re-enters the worker queue through the existing harness path."
                  : "The lane leaves its blocked state and re-enters the worker queue through the existing harness path.",
              exampleRequest:
                action.kind === "await_lane_resume"
                  ? { resolution: "resume_lane" }
                  : { resolution: "unblock_lane" }
            }
          ] satisfies HarnessActionOptionView[],
          recommendedOptionValue: action.kind === "await_lane_resume" ? "resume_lane" : "unblock_lane",
          allowedResolutions: [action.kind === "await_lane_resume" ? "resume_lane" : "unblock_lane"] as HarnessAttentionResolutionCommand[]
        }),
    ...(currentAttention && isSameAttentionAction(currentAttention.action, action)
      ? { requestedAtLabel: formatBoardTimestamp(currentAttention.requestedAt) }
      : {}),
    ...(attentionReasonLabel
      ? { reasonLabel: attentionReasonLabel }
      : {}),
    ...(attentionTargetCardId
      ? {
          targetCardId: attentionTargetCardId,
          ...(attentionTargetPersona
            ? { targetPersona: attentionTargetPersona }
            : {}),
          ...(attentionTargetTitle
            ? { targetTitle: attentionTargetTitle }
            : {}),
          ...(attentionTargetPersona && attentionTargetTitle
            ? {
                targetSummary:
                  action.kind === "await_lane_resume"
                    ? `Resume ${attentionTargetPersona} lane: ${attentionTargetTitle}`
                    : action.kind === "await_unblock"
                      ? `Unblock ${attentionTargetPersona} lane: ${attentionTargetTitle}`
                      : `Next lane target: ${attentionTargetPersona} · ${attentionTargetTitle}`
              }
            : {})
        }
      : {})
  };
}

function buildPendingApprovalRequestFields(handoffTargetCardId?: string): HarnessActionRequestFieldView[] {
  const fields: HarnessActionRequestFieldView[] = [
    {
      name: "decision",
      label: "Proposal decision",
      description: "Choose whether this proposed follow-on work should be approved, deferred, or denied.",
      required: true,
      allowedValues: ["approve", "defer", "deny"]
    },
    {
      name: "decisionNote",
      label: "Decision note",
      description: "Optional bounded note explaining the decision or what should change before review resumes.",
      required: false
    }
  ];

  if (handoffTargetCardId) {
    fields.push({
      name: "targetCardId",
      label: "Handoff target lane",
      description: "Optional existing lane to reuse when approval should fold this work into an active owner-conflict handoff.",
      required: false,
      supportedWhenValue: "approve",
      suggestedValue: handoffTargetCardId
    });
  }

  return fields;
}

function buildPendingApprovalActionOptions(input: {
  handoffTargetCardId?: string;
  handoffTargetPersona?: string;
  handoffTargetTitle?: string;
}): HarnessActionOptionView[] {
  return [
    {
      value: "approve",
      label: "Approve proposal",
      description: input.handoffTargetCardId
        ? `Approve this work and optionally fold it into ${input.handoffTargetPersona ?? "the existing"} lane${input.handoffTargetTitle ? ` (${input.handoffTargetTitle})` : ""}.`
        : "Approve this work so it can move into the bounded execution flow.",
      emphasis: "primary",
      nextEffectSummary: input.handoffTargetCardId
        ? `This proposal can move forward by reusing the existing lane instead of opening a duplicate card.`
        : "This proposal can move into the bounded execution flow and open or advance the intended lane.",
      exampleRequest: input.handoffTargetCardId
        ? {
            decision: "approve",
            targetCardId: input.handoffTargetCardId
          }
        : {
            decision: "approve"
          }
    },
    {
      value: "defer",
      label: "Defer proposal",
      description: "Pause this follow-on work without dropping it so the CEO can revisit it later.",
      emphasis: "secondary",
      nextEffectSummary: "This proposal stays visible in the pending-approval queue for later CEO review.",
      exampleRequest: {
        decision: "defer"
      }
    },
    {
      value: "deny",
      label: "Deny proposal",
      description: "Reject this follow-on work when it should not expand the current board cycle.",
      emphasis: "caution",
      nextEffectSummary: "This proposal closes without opening or advancing any new work lane.",
      requiresConfirmation: true,
      confirmationLabel: "Deny this proposal and close the follow-on request?",
      exampleRequest: {
        decision: "deny"
      }
    }
  ];
}

function comparePendingProposalQueue(left: HarnessSubCardProposal, right: HarnessSubCardProposal) {
  const leftRank = left.status === "proposed" ? 0 : 1;
  const rightRank = right.status === "proposed" ? 0 : 1;
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  return left.id.localeCompare(right.id);
}

function buildExportCandidateActions(input: {
  runId: string;
  candidateId: HarnessExportCandidateId;
  decisions: readonly HarnessBoardDecisionRecord[];
  governanceHistoryDependencySatisfied?: boolean;
  candidate: {
    id: HarnessExportCandidateId;
    readiness: HarnessMemoryBoundaryReadiness;
    promotionState: HarnessMemoryBoundaryPromotionState;
    promotionNextStep: HarnessMemoryBoundaryPromotionNextStep;
    itemIds: readonly string[];
    latestDelivery?: HarnessExportCandidateDeliveryView;
  };
}): HarnessExportCandidateActionView[] {
  const contentVersion = input.decisions
    .slice(0, 8)
    .map((decision) => `${decision.id}:${decision.createdAt}`)
    .join(",");
  const baseParts = [
    input.runId,
    input.candidate.id,
    input.candidate.readiness,
    input.candidate.promotionState,
    input.candidate.promotionNextStep,
    input.candidate.itemIds.join(","),
    contentVersion,
    input.candidate.latestDelivery?.status ?? "",
    String(input.candidate.latestDelivery?.attemptCount ?? 0),
    input.candidate.latestDelivery?.lastAttemptedAtLabel ?? "",
    input.candidate.latestDelivery?.deliveredAtLabel ?? "",
    input.candidate.latestDelivery?.lastErrorMessage ?? ""
  ] as const;
  const actions: HarnessExportCandidateActionView[] = [
    {
      actionRoute: "export-preflight",
      actionPath: `/api/harness/runs/${encodeURIComponent(input.runId)}/export-candidates/${encodeURIComponent(input.candidateId)}/preflight`,
      actionMethod: "POST",
      actionHandle: createHarnessActionToken(["export-preflight", ...baseParts]),
      actionLabel: "Run export preflight",
      actionDescription: "Validate the current export candidate against the live board contract before any dry-run or tenant-facing export bundle is produced.",
      nextEffectSummary:
        input.candidate.readiness === "ready_now"
          ? "This candidate can be checked for a tenant-safe export without changing live runtime state."
          : "This candidate will report its current blocker without widening into a live export write path."
    }
  ];
  const deliveryInProgress = input.candidate.latestDelivery?.status === "delivery_in_progress";
  const claimRecoverySupported = input.candidate.latestDelivery?.claimRecoverySupported === true;

  if (
    input.candidate.id === "governance_history_export" &&
    input.candidate.readiness === "ready_now" &&
    (!deliveryInProgress || claimRecoverySupported)
  ) {
    actions.push(
      {
        actionRoute: "export-dry-run",
        actionPath: `/api/harness/runs/${encodeURIComponent(input.runId)}/export-candidates/${encodeURIComponent(input.candidateId)}/dry-run`,
        actionMethod: "POST",
        actionHandle: createHarnessActionToken(["export-dry-run", ...baseParts]),
        actionLabel: "Preview Obsidian export bundle",
        actionDescription: "Render the tenant-safe governance-history markdown bundle without writing it anywhere yet.",
        nextEffectSummary: "This returns the exact bounded note content and metadata that a later tenant export would use."
      },
      {
        actionRoute: "governance-history-export",
        actionPath: `/api/harness/runs/${encodeURIComponent(input.runId)}/export-candidates/${encodeURIComponent(input.candidateId)}/export`,
        actionMethod: "POST",
        actionHandle: createHarnessActionToken(["governance-history-export", ...baseParts]),
        actionLabel: "Build governance history export",
        actionDescription: "Produce the first real Obsidian-facing governance-history export bundle from the current board contract, including bounded denied or deferred governance items when the closed-board package carries them.",
        nextEffectSummary: "This returns a tenant-safe markdown bundle for later vault placement without turning Obsidian into live runtime state."
      }
    );

    if (
      input.candidate.latestDelivery &&
      input.candidate.latestDelivery.status !== "delivered" &&
      (input.candidate.latestDelivery.status !== "delivery_in_progress" || claimRecoverySupported) &&
      input.candidate.latestDelivery.contractFreshness !== "stale_bundle"
    ) {
      actions.push({
        actionRoute: "governance-history-export-replay",
        actionPath: `/api/harness/runs/${encodeURIComponent(input.runId)}/export-candidates/${encodeURIComponent(input.candidateId)}/delivery-replay`,
        actionMethod: "POST",
        actionHandle: createHarnessActionToken(["governance-history-export-replay", ...baseParts]),
        actionLabel:
          claimRecoverySupported
            ? "Recover governance history delivery"
            : input.candidate.latestDelivery.status === "delivery_failed"
            ? "Replay governance history delivery"
            : "Deliver governance history export",
        actionDescription:
          claimRecoverySupported
            ? "Recover a stale in-progress governance history delivery claim through the same bounded private writer seam."
            : input.candidate.latestDelivery.status === "delivery_failed"
            ? "Re-dispatch the persisted tenant-safe governance-history bundle through the bounded private writer seam."
            : "Dispatch the persisted tenant-safe governance-history bundle through the bounded private writer seam.",
        nextEffectSummary:
          claimRecoverySupported
            ? "This reclaims a stale delivery attempt and reuses the current export-ready bundle without rebuilding it."
            : input.candidate.latestDelivery.status === "delivery_failed"
            ? "This reuses the stored export-ready bundle instead of rebuilding a new tenant package."
            : "This uses the existing export-ready bundle and attempts bounded delivery without rebuilding it."
      });
    }
  }

  if (
    input.candidate.id === "package_bundle_export" &&
    input.candidate.readiness === "ready_now" &&
    (!deliveryInProgress || claimRecoverySupported)
  ) {
    actions.push(
      {
        actionRoute: "export-dry-run",
        actionPath: `/api/harness/runs/${encodeURIComponent(input.runId)}/export-candidates/${encodeURIComponent(input.candidateId)}/dry-run`,
        actionMethod: "POST",
        actionHandle: createHarnessActionToken(["export-dry-run", ...baseParts]),
        actionLabel: "Preview package bundle export",
        actionDescription: "Render the tenant-safe package-bundle export without writing it anywhere yet.",
        nextEffectSummary: "This returns the exact bounded package bundle that a later tenant export would deliver."
      }
    );

    if (input.governanceHistoryDependencySatisfied) {
      actions.push({
        actionRoute: "package-bundle-export",
        actionPath: `/api/harness/runs/${encodeURIComponent(input.runId)}/export-candidates/${encodeURIComponent(input.candidateId)}/export`,
        actionMethod: "POST",
        actionHandle: createHarnessActionToken(["package-bundle-export", ...baseParts]),
        actionLabel: "Build package bundle export",
        actionDescription: "Produce the first real Obsidian-facing package bundle export from the current closed-board contract, keeping denied governance inside the existing package-governance surface instead of branching into a separate export path.",
        nextEffectSummary: "This returns a tenant-safe package bundle for later vault placement without turning Obsidian into live runtime state."
      });
    }

    if (
      input.governanceHistoryDependencySatisfied &&
      input.candidate.latestDelivery &&
      input.candidate.latestDelivery.status !== "delivered" &&
      (input.candidate.latestDelivery.status !== "delivery_in_progress" || claimRecoverySupported) &&
      input.candidate.latestDelivery.contractFreshness !== "stale_bundle"
    ) {
      actions.push({
        actionRoute: "package-bundle-export-replay",
        actionPath: `/api/harness/runs/${encodeURIComponent(input.runId)}/export-candidates/${encodeURIComponent(input.candidateId)}/delivery-replay`,
        actionMethod: "POST",
        actionHandle: createHarnessActionToken(["package-bundle-export-replay", ...baseParts]),
        actionLabel:
          claimRecoverySupported
            ? "Recover package bundle delivery"
            : input.candidate.latestDelivery.status === "delivery_failed"
            ? "Replay package bundle delivery"
            : "Deliver package bundle export",
        actionDescription:
          claimRecoverySupported
            ? "Recover a stale in-progress package bundle delivery claim through the same bounded private writer seam."
            : input.candidate.latestDelivery.status === "delivery_failed"
            ? "Re-dispatch the persisted tenant-safe package bundle through the bounded private writer seam."
            : "Dispatch the persisted tenant-safe package bundle through the bounded private writer seam.",
        nextEffectSummary:
          claimRecoverySupported
            ? "This reclaims a stale delivery attempt and reuses the current export-ready package bundle without rebuilding it."
            : input.candidate.latestDelivery.status === "delivery_failed"
            ? "This reuses the stored package bundle instead of rebuilding a new tenant package."
            : "This uses the existing export-ready bundle and attempts bounded delivery without rebuilding it."
      });
    }
  }

  return actions;
}

function createHarnessActionToken(parts: readonly string[]) {
  return createHash("sha256")
    .update(parts.join("|"))
    .digest("hex")
    .slice(0, 24);
}

function toHarnessCeoLoopBoardSnapshot(
  board: HarnessBoardResponse,
  runState: HarnessRunRecord["state"]
): HarnessCeoLoopBoardSnapshot {
  return {
    runId: board.runId,
    workflowId: board.workflowId,
    runState,
    cards: board.cards.map((card) => ({
      id: card.id,
      persona: card.persona,
      title: card.title,
      lane: card.lane,
      statusLabel: card.statusLabel,
      deliverableLabel: card.deliverableLabel,
      outcome: card.outcome
    })),
    pendingApprovals: board.pendingApprovals.map((proposal) => ({
      id: proposal.id,
      title: proposal.title,
      targetPersona: proposal.targetPersona,
      deliverableLabel: proposal.deliverableLabel,
      statusLabel: proposal.statusLabel
    })),
    ...(board.pendingAttention
      ? {
          pendingAttention: {
            kind: board.pendingAttention.kind,
            statusLabel: board.pendingAttention.statusLabel,
            summary: board.pendingAttention.summary
          }
        }
      : {}),
    recentDecisions: board.recentDecisions.map((decision) => ({
      summary: decision.label
    }))
  };
}

function classifyTenantGoalDecision(input: {
  status: HarnessProposalStatus;
  latestDecision: HarnessBoardDecisionRecord | null;
  requestedAction: HarnessCeoGoalPlan["action"];
}): HarnessTenantGoalResponse["decision"] {
  if (input.status === "deferred") {
    return "deferred";
  }
  if (input.status === "denied") {
    return "denied";
  }
  if (input.latestDecision?.resolution === "create_lane") {
    return "opened_lane";
  }
  if (
    input.latestDecision?.resolution === "update_existing_lane" ||
    input.latestDecision?.resolution === "reopen_completed_lane" ||
    input.latestDecision?.resolution === "handoff_existing_lane"
  ) {
    return "reused_lane";
  }
  return input.requestedAction === "open_new_lane" ? "opened_lane" : "reused_lane";
}

function selectTenantGoalResponseMessage(input: {
  plan: HarnessCeoGoalPlan;
  actualDecision: HarnessTenantGoalResponse["decision"];
  deliverableType?: string;
}): string {
  const tenantResponse = input.plan.tenantResponse.trim();
  if (tenantResponse.length > 0 && responseMatchesTenantGoalDecision(input.plan.action, input.actualDecision)) {
    return tenantResponse;
  }

  const deliverable =
    input.deliverableType && input.deliverableType.length > 0
      ? humanizeDeliverableType(input.deliverableType).toLowerCase()
      : "workflow";

  switch (input.actualDecision) {
    case "opened_lane":
      return `I opened a bounded ${deliverable} lane so we can address this goal inside the current workflow.`;
    case "reused_lane":
      return `I folded this into the existing ${deliverable} lane so the current run stays focused.`;
    case "deferred":
      return "I’m deferring this request for now so the board stays inside the current workflow boundary.";
    case "denied":
      return "I’m not approving this request in the current workflow because it would widen the boundary.";
    case "fresh_cycle_started":
      return "I started a fresh cycle so we can take this up without distorting the packaged run.";
  }
}

function responseMatchesTenantGoalDecision(
  requestedAction: HarnessCeoGoalPlan["action"],
  actualDecision: HarnessTenantGoalResponse["decision"]
): boolean {
  switch (requestedAction) {
    case "reuse_lane":
      return actualDecision === "reused_lane";
    case "open_new_lane":
      return actualDecision === "opened_lane";
    case "defer":
      return actualDecision === "deferred";
    case "deny":
      return actualDecision === "denied";
    case "start_fresh_cycle":
      return actualDecision === "fresh_cycle_started";
  }
}

function createPendingApprovalActionToken(input: {
  proposal: HarnessSubCardProposal;
  policyReason: string;
  handoffTargetCardId?: string;
  latestDecisionCreatedAt?: string;
}) {
  return createHarnessActionToken([
    "proposal-decision",
    input.proposal.id,
    input.proposal.status,
    input.proposal.persona,
    input.proposal.title,
    input.proposal.deliverableType,
    input.policyReason,
    input.handoffTargetCardId ?? "",
    input.latestDecisionCreatedAt ?? ""
  ]);
}

function createPendingAttentionActionToken(input: {
  runId: string;
  action: Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>;
}) {
  return createHarnessActionToken([
    "pending-attention",
    input.runId,
    input.action.kind,
    input.action.runState,
    "reason" in input.action ? input.action.reason : "",
    "cardId" in input.action ? input.action.cardId : "",
    "completedCardId" in input.action ? input.action.completedCardId ?? "" : "",
    "nextCardId" in input.action ? input.action.nextCardId ?? "" : ""
  ]);
}

function assertHarnessActionToken(expectedToken: string, providedToken: string | undefined) {
  if (!providedToken || providedToken !== expectedToken) {
    throw new HarnessActionContractConflictError("Harness action token no longer matches the current board contract");
  }
}

function findExportCandidateOrThrow(
  candidates: readonly HarnessMemoryBoundaryExportCandidateView[] | undefined,
  candidateId: HarnessExportCandidateId
) {
  const candidate = candidates?.find((entry) => entry.id === candidateId) ?? null;
  if (!candidate) {
    throw new HarnessRunCompletionConflictError("Harness export candidate is no longer available on this board");
  }
  return candidate;
}

function findExportActionOrThrow(
  candidate: HarnessMemoryBoundaryExportCandidateView,
  actionRoute: HarnessExportCandidateActionRoute
) {
  const action = candidate.exportActions?.find((entry) => entry.actionRoute === actionRoute) ?? null;
  if (!action) {
    throw new HarnessRunCompletionConflictError("Harness export action is not available for the current candidate contract");
  }
  return action;
}

function findLatestExportDeliveryRecordOrThrow(
  deliveries: readonly HarnessExportDeliveryRecord[],
  candidateId: HarnessExportCandidateId
) {
  const latest = deliveries
    .filter((delivery) => delivery.candidateId === candidateId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
  if (!latest) {
    throw new HarnessRunCompletionConflictError("Harness export delivery bundle is no longer available for replay");
  }
  return latest;
}

function assertExportReplayBundleCurrent(input: {
  candidateLabel: string;
  currentBundleId: string;
  exportDelivery: HarnessExportDeliveryRecord;
}) {
  if (input.exportDelivery.bundleId !== input.currentBundleId) {
    throw new HarnessRunCompletionConflictError(
      `Harness ${input.candidateLabel} delivery replay is stale against the current export contract; build a fresh export bundle instead`
    );
  }
}

function buildGovernanceHistoryExportDryRun(
  board: HarnessBoardResponse,
  candidate: HarnessMemoryBoundaryExportCandidateView
): HarnessExportDryRunResult {
  const noteTitle = `${humanizeDeliverableType(board.packageId.replace(/^pkg_/u, "").replace(/_/gu, " "))} governance history`;
  const safeWorkflowId = board.workflowId.replace(/[^a-z0-9_-]+/giu, "-").toLowerCase();
  const vaultFolder = `wealth-factory/governance-history/${safeWorkflowId}`;
  const noteFileName = `${safeWorkflowId}-governance-history.md`;
  const primaryNotePath = `${vaultFolder}/${noteFileName}`;
  const decisionLines = board.recentDecisions.map((decision) => (
    `- ${decision.label}${decision.recommendationSummary ? `\n  - Recommendation: ${decision.recommendationSummary}` : ""}${decision.objectionSummary ? `\n  - Objection: ${decision.objectionSummary}` : ""}`
  ));
  const followThroughLines = board.followThroughItems.map((item) => (
    `- ${item.summary}${item.policyReasonLabel ? `\n  - Policy reason: ${item.policyReasonLabel}` : ""}${item.resolutionLabel ? `\n  - Resolution: ${item.resolutionLabel}` : ""}`
  ));
  const governanceItems = board.completionPackage?.governanceItems ?? [];
  const governanceLines = governanceItems.map((item) => (
    `- ${item.persona} ${item.deliverableLabel} (${item.statusLabel})${item.policyReasonLabel ? `\n  - Policy reason: ${item.policyReasonLabel}` : ""}${item.recommendationSummary ? `\n  - Recommendation: ${item.recommendationSummary}` : ""}${item.objectionSummary ? `\n  - Objection: ${item.objectionSummary}` : ""}${item.nextReviewTrigger ? `\n  - Next review: ${item.nextReviewTrigger}` : ""}`
  ));
  const deferredGovernanceItemCount = governanceItems.filter((item) => item.statusLabel === "Deferred for later CEO review").length;
  const deniedGovernanceItemCount = governanceItems.filter((item) => item.statusLabel === "Denied by the CEO").length;
  const recordCount = Math.max(1, board.recentDecisions.length + board.followThroughItems.length + governanceItems.length);
  const content = [
    `# ${noteTitle}`,
    "",
    `- Workflow: ${board.workflowId}`,
    `- Package: ${board.packageId}`,
    `- Candidate: ${candidate.label}`,
    `- Readiness: ${candidate.readinessLabel}`,
    `- Disclosure: ${candidate.exportSourceDisclosurePolicyLabel}`,
    `- Redaction: ${candidate.exportRedactionBoundaryLabel}`,
    "",
    "## Governance Decisions",
    ...(decisionLines.length > 0 ? decisionLines : ["- No recent governance decisions are currently available."]),
    "",
    "## Implemented Follow-Through",
    ...(followThroughLines.length > 0 ? followThroughLines : ["- No implemented follow-through items are currently available."]),
    ...(governanceLines.length > 0
      ? [
          "",
          "## Governance Holds",
          ...governanceLines
        ]
      : [])
  ].join("\n");
  const placement: HarnessExportPlacementManifest = {
    targetSystem: "obsidian_vault",
    vaultFolder,
    primaryNotePath,
    syncStrategy: candidate.syncStrategy,
    confirmationRequirement: candidate.exportConfirmationRequirement
  };
  const payloadFiles: HarnessExportPackageFile[] = [
    buildExportPackageFile({
      path: primaryNotePath,
      mediaType: "text/markdown",
      content
    })
  ];
  const bundleRevision = createExportBundleRevision({
    runId: board.runId,
    candidateId: candidate.id,
    noteTitle,
    noteFileName,
    placement,
    recordCount,
    disclosureSummary: candidate.exportSourceDisclosurePolicyLabel,
    redactionSummary: candidate.exportRedactionBoundaryLabel,
    files: payloadFiles
  });
  const bundleId = createHarnessActionToken([
    "governance-history-bundle",
    board.runId,
    candidate.id,
    bundleRevision
  ]);
  const manifestContent = JSON.stringify(
    {
      bundleId,
      bundleRevision,
      exportFormat: "obsidian_markdown_bundle",
      recordTarget: "governance_history_record",
      runId: board.runId,
      workflowId: board.workflowId,
      packageId: board.packageId,
      candidateId: candidate.id,
      noteTitle,
      noteFileName,
      placement,
      disclosureSummary: candidate.exportSourceDisclosurePolicyLabel,
      redactionSummary: candidate.exportRedactionBoundaryLabel,
      recordCount,
      governanceItemCount: governanceItems.length,
      deferredGovernanceItemCount,
      deniedGovernanceItemCount,
      governanceExportDisposition: "included_in_existing_candidates"
    },
    null,
    2
  );
  const files: HarnessExportPackageFile[] = [
    ...payloadFiles,
    buildExportPackageFile({
      path: `${vaultFolder}/export-manifest.json`,
      mediaType: "application/json",
      content: manifestContent
    })
  ];

  return {
    candidateId: "governance_history_export",
    status: "ready",
    exportFormat: "obsidian_markdown_bundle",
    recordTarget: "governance_history_record",
    bundleId,
    bundleRevision,
    noteTitle,
    noteFileName,
    content,
    placement,
    files,
    recordCount,
    disclosureSummary: candidate.exportSourceDisclosurePolicyLabel,
    redactionSummary: candidate.exportRedactionBoundaryLabel,
    ...(governanceItems.length > 0
      ? {
          governanceItemCount: governanceItems.length,
          deferredGovernanceItemCount,
          deniedGovernanceItemCount,
          governanceExportDisposition: "included_in_existing_candidates",
          governanceExportDispositionLabel: "Included in governance history and package exports"
        }
      : {})
  };
}

function buildPackageBundleExportDryRun(
  board: HarnessBoardResponse,
  candidate: HarnessMemoryBoundaryExportCandidateView
): HarnessExportDryRunResult {
  const completionPackage = board.completionPackage;
  if (!completionPackage || completionPackage.hasOpenGovernanceItems) {
    throw new HarnessRunCompletionConflictError("Harness package bundle export is not ready before board closure");
  }

  const safeWorkflowId = board.workflowId.replace(/[^a-z0-9_-]+/giu, "-").toLowerCase();
  const vaultFolder = `wealth-factory/package-bundles/${safeWorkflowId}`;
  const noteTitle = `${humanizeDeliverableType(board.packageId.replace(/^pkg_/u, "").replace(/_/gu, " "))} package bundle`;
  const noteFileName = `${safeWorkflowId}-package-bundle.md`;
  const primaryNotePath = `${vaultFolder}/${noteFileName}`;
  const deliverablesFilePath = `${vaultFolder}/${safeWorkflowId}-deliverables.md`;
  const governanceFilePath = `${vaultFolder}/${safeWorkflowId}-governance.md`;
  const deliverableLines = completionPackage.deliverables.map((deliverable) => (
    `- ${deliverable.title} (${deliverable.persona}, ${deliverable.deliverableLabel})\n  - Outcome: ${deliverable.outcome}`
  ));
  const governanceLines = completionPackage.governanceItems.map((item) => (
    `- ${item.persona} ${item.deliverableLabel} (${item.statusLabel})${item.policyReasonLabel ? `\n  - Policy reason: ${item.policyReasonLabel}` : ""}${item.recommendationSummary ? `\n  - Recommendation: ${item.recommendationSummary}` : ""}${item.objectionSummary ? `\n  - Objection: ${item.objectionSummary}` : ""}`
  ));
  const deferredGovernanceItemCount = completionPackage.governanceItems.filter((item) => item.statusLabel === "Deferred for later CEO review").length;
  const deniedGovernanceItemCount = completionPackage.governanceItems.filter((item) => item.statusLabel === "Denied by the CEO").length;
  const content = [
    `# ${noteTitle}`,
    "",
    `- Workflow: ${board.workflowId}`,
    `- Package: ${board.packageId}`,
    `- Candidate: ${candidate.label}`,
    `- Readiness: ${candidate.readinessLabel}`,
    `- Disclosure: ${candidate.exportSourceDisclosurePolicyLabel}`,
    `- Redaction: ${candidate.exportRedactionBoundaryLabel}`,
    `- Deliverables: ${completionPackage.deliverables.length}`,
    `- Governance items: ${completionPackage.governanceItems.length}`,
    "",
    "## Summary",
    completionPackage.summary ?? "Closed-board deliverables are ready to promote into a tenant-owned package bundle.",
    ...(completionPackage.packageNote ? ["", "## Package Note", completionPackage.packageNote] : []),
    "",
    "## Package Files",
    `- Primary note: ${noteFileName}`,
    `- Deliverables detail: ${safeWorkflowId}-deliverables.md`,
    `- Governance detail: ${safeWorkflowId}-governance.md`
  ].join("\n");
  const deliverablesContent = [
    `# ${noteTitle} deliverables`,
    "",
    ...(deliverableLines.length > 0 ? deliverableLines : ["- No deliverables were packaged in this closed-board export bundle."])
  ].join("\n");
  const governanceContent = [
    `# ${noteTitle} governance`,
    "",
    ...(governanceLines.length > 0 ? governanceLines : ["- No governance items were carried into this closed-board export bundle."])
  ].join("\n");
  const placement: HarnessExportPlacementManifest = {
    targetSystem: "obsidian_vault",
    vaultFolder,
    primaryNotePath,
    syncStrategy: candidate.syncStrategy,
    confirmationRequirement: candidate.exportConfirmationRequirement
  };
  const payloadFiles: HarnessExportPackageFile[] = [
    buildExportPackageFile({
      path: primaryNotePath,
      mediaType: "text/markdown",
      content
    }),
    buildExportPackageFile({
      path: deliverablesFilePath,
      mediaType: "text/markdown",
      content: deliverablesContent
    }),
    buildExportPackageFile({
      path: governanceFilePath,
      mediaType: "text/markdown",
      content: governanceContent
    })
  ];
  const bundleRevision = createExportBundleRevision({
    runId: board.runId,
    candidateId: candidate.id,
    noteTitle,
    noteFileName,
    placement,
    recordCount: Math.max(1, completionPackage.deliverables.length + completionPackage.governanceItems.length),
    disclosureSummary: candidate.exportSourceDisclosurePolicyLabel,
    redactionSummary: candidate.exportRedactionBoundaryLabel,
    files: payloadFiles
  });
  const bundleId = createHarnessActionToken([
    "package-bundle",
    board.runId,
    candidate.id,
    bundleRevision
  ]);
  const manifestContent = JSON.stringify(
    {
      bundleId,
      bundleRevision,
      exportFormat: "obsidian_markdown_bundle",
      recordTarget: "package_deliverable_record",
      runId: board.runId,
      workflowId: board.workflowId,
      packageId: board.packageId,
      candidateId: candidate.id,
      noteTitle,
      noteFileName,
      placement,
      disclosureSummary: candidate.exportSourceDisclosurePolicyLabel,
      redactionSummary: candidate.exportRedactionBoundaryLabel,
      recordCount: Math.max(1, completionPackage.deliverables.length + completionPackage.governanceItems.length),
      governanceItemCount: completionPackage.governanceItems.length,
      deferredGovernanceItemCount,
      deniedGovernanceItemCount,
      governanceExportDisposition: "included_in_existing_candidates"
    },
    null,
    2
  );
  const files: HarnessExportPackageFile[] = [
    ...payloadFiles,
    buildExportPackageFile({
      path: `${vaultFolder}/export-manifest.json`,
      mediaType: "application/json",
      content: manifestContent
    })
  ];

  return {
    candidateId: "package_bundle_export",
    status: "ready",
    exportFormat: "obsidian_markdown_bundle",
    recordTarget: "package_deliverable_record",
    bundleId,
    bundleRevision,
    noteTitle,
    noteFileName,
    content,
    placement,
    files,
    recordCount: Math.max(1, completionPackage.deliverables.length + completionPackage.governanceItems.length),
    disclosureSummary: candidate.exportSourceDisclosurePolicyLabel,
    redactionSummary: candidate.exportRedactionBoundaryLabel,
    ...(completionPackage.governanceItems.length > 0
      ? {
          governanceItemCount: completionPackage.governanceItems.length,
          deferredGovernanceItemCount,
          deniedGovernanceItemCount,
          governanceExportDisposition: "included_in_existing_candidates",
          governanceExportDispositionLabel: "Included in governance history and package exports"
        }
      : {})
  };
}

function buildExportPackageFile(input: {
  path: string;
  mediaType: HarnessExportPackageFile["mediaType"];
  content: string;
}): HarnessExportPackageFile {
  return {
    path: input.path,
    mediaType: input.mediaType,
    byteSize: Buffer.byteLength(input.content, "utf8"),
    checksum: createHash("sha256").update(input.content).digest("hex"),
    content: input.content
  };
}

function cloneHarnessExportPlacementManifest(
  placement: HarnessExportPlacementManifest
): HarnessExportPlacementManifest {
  return {
    targetSystem: placement.targetSystem,
    vaultFolder: placement.vaultFolder,
    primaryNotePath: placement.primaryNotePath,
    syncStrategy: placement.syncStrategy,
    confirmationRequirement: placement.confirmationRequirement
  };
}

function cloneHarnessExportPackageFile(file: HarnessExportPackageFile): HarnessExportPackageFile {
  return {
    path: file.path,
    mediaType: file.mediaType,
    byteSize: file.byteSize,
    checksum: file.checksum,
    content: file.content
  };
}

function createExportBundleRevision(input: {
  runId: string;
  candidateId: HarnessExportCandidateId;
  noteTitle: string;
  noteFileName: string;
  placement: HarnessExportPlacementManifest;
  recordCount: number;
  disclosureSummary: string;
  redactionSummary: string;
  files: readonly HarnessExportPackageFile[];
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        runId: input.runId,
        candidateId: input.candidateId,
        noteTitle: input.noteTitle,
        noteFileName: input.noteFileName,
        placement: input.placement,
        recordCount: input.recordCount,
        disclosureSummary: input.disclosureSummary,
        redactionSummary: input.redactionSummary,
        files: input.files.map((file) => ({
          path: file.path,
          mediaType: file.mediaType,
          checksum: file.checksum
        }))
      })
    )
    .digest("hex");
}

function formatAttentionActivityLabel(input: {
  kind: "attention_requested" | "attention_resolved";
  snapshot: {
    statusLabel: string;
    summary: string;
    reasonLabel?: string;
  };
}): string {
  const status = input.snapshot.reasonLabel
    ? `${input.snapshot.statusLabel} (${input.snapshot.reasonLabel})`
    : input.snapshot.statusLabel;
  if (input.kind === "attention_requested") {
    return `${status}: ${input.snapshot.summary}`;
  }
  return `${status} resolved: ${input.snapshot.summary}`;
}

function describeAttentionRequestedActivity(input: {
  actionKind: string | undefined;
  reason: string | undefined;
}): string {
  switch (input.actionKind) {
    case "queue_ceo_review":
      if (input.reason === "final_assembly") {
        return "Board attention is now waiting on CEO final assembly review.";
      }
      if (input.reason === "governance_backlog") {
        return "Board attention is now waiting on CEO governance backlog review.";
      }
      if (input.reason === "governance_hold") {
        return "Board attention is now waiting on CEO governance-hold review.";
      }
      return "Board attention is now waiting on CEO review.";
    case "await_lane_resume":
      return "Board attention is now waiting on a lane resume decision.";
    case "await_unblock":
      return "Board attention is now waiting on a lane unblock decision.";
    default:
      return "Board attention is waiting on the next bounded orchestration step.";
  }
}

function describeAttentionResolvedActivity(input: {
  actionKind: string | undefined;
  reason: string | undefined;
}): string {
  switch (input.actionKind) {
    case "queue_ceo_review":
      if (input.reason === "final_assembly") {
        return "Board attention no longer needs CEO final assembly review.";
      }
      if (input.reason === "governance_backlog") {
        return "Board attention no longer needs CEO governance backlog review.";
      }
      if (input.reason === "governance_hold") {
        return "Board attention no longer needs CEO governance-hold review.";
      }
      return "Board attention no longer needs CEO review.";
    case "await_lane_resume":
      return "Board attention no longer needs a lane resume decision.";
    case "await_unblock":
      return "Board attention no longer needs a lane unblock decision.";
    default:
      return "Board attention has moved past the prior orchestration hold.";
  }
}

function toBoardCardView(input: {
  card: HarnessCardRecord;
  cardEvents: readonly HarnessCardEventRecord[];
  activity: readonly HarnessBoardActivityItem[];
  continuity: HarnessCardContinuityRecord | null;
  resultSummary?: string;
}): HarnessBoardCardView {
  const personaLabel = input.card.persona.toUpperCase();
  const lane = mapCardStateToLane(input.card.state);
  const deliverableLabel = humanizeDeliverableType(input.card.deliverableType);
  const activity = input.activity.length > 0 ? [...input.activity] : [defaultActivityForCard(input.card)];
  const absorbedWorkItems = input.continuity?.absorbedWorkItems.length
    ? input.continuity.absorbedWorkItems.map((item) => parseContinuityAbsorbedWorkItem(item).label)
    : extractAbsorbedWorkItems(input.cardEvents);
  const detailSections: HarnessBoardDetailSection[] = [
    {
      id: "snapshot",
      title: "Snapshot",
      body: describeContinuitySnapshot(input.card, input.continuity)
    }
  ];
  if (input.resultSummary) {
    detailSections.push({
      id: "latest-outcome",
      title: "Latest Outcome",
      body: input.resultSummary
    });
  }
  if (absorbedWorkItems.length > 0) {
    detailSections.push({
      id: "absorbed-work",
      title: "Absorbed Work",
      body: absorbedWorkItems.map((item) => `- ${item}`).join("\n")
    });
  }
  const continuityMemorySection = buildContinuityMemorySection({
    continuity: input.continuity,
    absorbedWorkItems,
    resultSummary: input.resultSummary
  });
  if (continuityMemorySection) {
    detailSections.push(continuityMemorySection);
  }

  return {
    id: input.card.id,
    persona: personaLabel,
    title: input.card.title,
    summary: `${personaLabel} is moving this deliverable forward inside a bounded assignment lane.`,
    lane,
    statusLabel: humanizeLabel(input.card.state),
    priorityLabel: input.card.persona === "ceo" ? "High priority" : lane === "done" ? "Ready" : "Active",
    deliverableLabel,
    updatedAtLabel: `Updated ${formatBoardTimestamp(input.card.updatedAt)}`,
    outcome: describeCardOutcome(input.card, input.resultSummary),
    focusPoints: [
      "Keep the tenant-facing update concise",
      "Advance the deliverable without backend noise",
      "Respect the package boundary before expanding scope"
    ],
    activity,
    detailSections
  };
}

function buildCompletionPackage(input: {
  run: HarnessRunRecord;
  cards: readonly HarnessCardRecord[];
  latestResultSummaryByCardId: ReadonlyMap<string, string>;
  proposals: readonly HarnessSubCardProposal[];
  decisions: readonly HarnessBoardDecisionRecord[];
}): HarnessCompletionPackageView | undefined {
  if (input.run.state !== "assembling" && input.run.state !== "done") {
    return undefined;
  }

  const deliverables = input.cards
    .filter((card) => card.persona !== "ceo" && card.state === "done")
    .map((card) => ({
      cardId: card.id,
      persona: card.persona.toUpperCase(),
      title: card.title,
      deliverableLabel: humanizeDeliverableType(card.deliverableType),
      outcome: describeCardOutcome(card, input.latestResultSummaryByCardId.get(card.id))
    }));

  if (deliverables.length === 0) {
    return undefined;
  }

  const ceoCard = input.cards.find((card) => card.persona === "ceo" && card.parentCardId === null);
  const summary = ceoCard ? input.latestResultSummaryByCardId.get(ceoCard.id) : undefined;
  const latestDecisionByProposalId = new Map<string, HarnessBoardDecisionRecord>();
  for (const decision of input.decisions) {
    if (decision.proposalId && !latestDecisionByProposalId.has(decision.proposalId)) {
      latestDecisionByProposalId.set(decision.proposalId, decision);
    }
  }
  const latestRunCompletedDecision = input.decisions.find((decision) => decision.decisionKind === "run_completed") ?? null;
  const deferredApprovalCount = input.proposals.filter((proposal) => proposal.status === "deferred").length;
  const deniedApprovalCount = input.proposals.filter((proposal) => proposal.status === "denied").length;
  const governanceEntries = input.proposals
    .filter((proposal) => proposal.status === "deferred" || proposal.status === "denied")
    .map((proposal) => {
      const latestDecision = latestDecisionByProposalId.get(proposal.id) ?? null;
      return {
        proposalId: proposal.id,
        status: proposal.status,
        createdAt: latestDecision?.createdAt ?? "",
        item: {
          proposalId: proposal.id,
          statusLabel:
            proposal.status === "deferred" ? "Deferred for later CEO review" : "Denied by the CEO",
          persona: proposal.persona.toUpperCase(),
          deliverableLabel: humanizeDeliverableType(proposal.deliverableType),
          ...(latestDecision?.policyReason ? { policyReasonLabel: humanizePolicyReason(latestDecision.policyReason) } : {}),
          ...(latestDecision?.recommendationSummary
            ? { recommendationSummary: latestDecision.recommendationSummary }
            : {}),
          ...(latestDecision?.objectionSummary ? { objectionSummary: latestDecision.objectionSummary } : {}),
          ...(proposal.status === "deferred"
            ? { nextReviewTrigger: describeNextReviewTrigger(latestDecision?.policyReason ?? null) }
            : {})
        }
      };
    })
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "deferred" ? -1 : 1;
      }
      return right.createdAt.localeCompare(left.createdAt);
    });
  const governanceItems = governanceEntries.map((entry) => entry.item).slice(0, 6);
  const recommendations = [
    ...(latestRunCompletedDecision?.recommendationSummary ? [latestRunCompletedDecision.recommendationSummary] : []),
    ...governanceEntries
      .map((entry) => entry.item.recommendationSummary ?? null)
      .filter((summary): summary is string => Boolean(summary))
  ]
    .filter((summary, index, values) => values.indexOf(summary) === index)
    .slice(0, 4);
  const objections = governanceEntries
    .map((entry) => entry.item.objectionSummary ?? null)
    .filter((summary): summary is string => Boolean(summary))
    .filter((summary, index, values) => values.indexOf(summary) === index)
    .slice(0, 4);
  const hasOpenGovernanceItems = governanceEntries.length > 0;
  const packageNote = buildCompletionPackageNote({
    deferredApprovalCount,
    deniedApprovalCount,
    recommendationCount: recommendations.length,
    objectionCount: objections.length
  });

  return {
    status: input.run.state,
    ...(summary ? { summary } : {}),
    deferredApprovalCount,
    deniedApprovalCount,
    hasOpenGovernanceItems,
    ...(packageNote ? { packageNote } : {}),
    recommendations,
    objections,
    governanceItems,
    deliverables
  };
}

function toCompletionPackageView(record: HarnessCompletionPackageSnapshotRecord): HarnessCompletionPackageView {
  return {
    status: record.status,
    ...(record.summary ? { summary: record.summary } : {}),
    deferredApprovalCount: record.deferredApprovalCount,
    deniedApprovalCount: record.deniedApprovalCount,
    hasOpenGovernanceItems: record.hasOpenGovernanceItems,
    ...(record.packageNote ? { packageNote: record.packageNote } : {}),
    recommendations: [...record.recommendations],
    objections: [...record.objections],
    governanceItems: record.governanceItems.map((item) => ({ ...item })),
    deliverables: record.deliverables.map((item) => ({ ...item }))
  };
}

function buildGovernanceHistorySnapshot(decisions: readonly HarnessBoardDecisionRecord[]) {
  return {
    recentDecisions: decisions.slice(0, 8).map(toRecentDecisionView),
    followThroughItems: decisions
      .filter(isFollowThroughDecision)
      .slice(0, 8)
      .map(toFollowThroughView)
  };
}

function toGovernanceHistoryView(record: HarnessGovernanceHistorySnapshotRecord) {
  return {
    recentDecisions: record.recentDecisions.map((item) => ({ ...item })),
    followThroughItems: record.followThroughItems.map((item) => ({ ...item }))
  };
}

function createBoardColumns(cards: readonly HarnessBoardCardView[]): HarnessBoardColumnView[] {
  const laneOrder = [
    { id: "planning", title: "Planning", description: "Work being shaped by the orchestrator." },
    { id: "working", title: "Working", description: "Active persona lanes moving the run forward." },
    { id: "waiting", title: "Waiting", description: "Lanes paused on a dependency or decision." },
    { id: "blocked", title: "Blocked", description: "Visible blockers that need resolution before progress continues." },
    { id: "done", title: "Done", description: "Completed outputs ready for review." }
  ] as const;

  return laneOrder.map((lane) => ({
    id: lane.id,
    title: lane.title,
    description: lane.description,
    cardIds: cards.filter((card) => card.lane === lane.id).map((card) => card.id)
  }));
}

function mapCardStateToLane(state: HarnessCardRecord["state"]): string {
  switch (state) {
    case "queued":
    case "planning":
    case "approved":
      return "planning";
    case "working":
      return "working";
    case "waiting":
      return "waiting";
    case "blocked":
    case "cancelled":
      return "blocked";
    case "done":
      return "done";
    default:
      return "planning";
  }
}

function describeCardOutcome(card: HarnessCardRecord, resultSummary?: string): string {
  if (resultSummary) {
    return resultSummary;
  }
  const deliverable = humanizeDeliverableType(card.deliverableType).toLowerCase();
  if (card.state === "done") {
    return `This ${deliverable} is packaged and ready for the tenant-facing next step.`;
  }
  if (card.state === "working") {
    return `This ${deliverable} is actively being advanced in the current persona lane.`;
  }
  if (card.state === "waiting") {
    return `This ${deliverable} is paused on a dependency while preserving its bounded scope.`;
  }
  if (card.state === "blocked" || card.state === "cancelled") {
    return `This ${deliverable} is blocked and needs a deliberate unblock before more work starts.`;
  }
  return `This ${deliverable} is being shaped into the next clean business-facing move.`;
}

function defaultActivityForCard(card: HarnessCardRecord): HarnessBoardActivityItem {
  return {
    id: `${card.id}-default-activity`,
    label: `${card.persona.toUpperCase()} is maintaining this lane inside the approved workflow boundary.`,
    timestampLabel: formatBoardTimestamp(card.updatedAt)
  };
}

function extractAbsorbedWorkItems(events: readonly HarnessCardEventRecord[]): string[] {
  return events
    .filter((event) => event.eventKind === "proposal_absorbed")
    .map((event) => {
      const requestedTitle = readOptionalString(event.payload.requestedTitle) ?? "follow-on work";
      const requestedByPersona = readOptionalString(event.payload.requestedByPersona)?.toUpperCase() ?? "A BOARD PERSONA";
      return `${requestedByPersona}: ${requestedTitle}`;
    });
}

function createAbsorbedLaneResumeSummary(input: {
  card: HarnessCardRecord;
  absorbedWorkItem: string;
  resolution: "update_existing_lane" | "handoff_existing_lane";
}): string {
  const parsedItem = parseContinuityAbsorbedWorkItem(input.absorbedWorkItem);
  const deliverableLabel = humanizeDeliverableType(input.card.deliverableType).toLowerCase();
  const personaLabel = input.card.persona.toUpperCase();
  if (input.resolution === "handoff_existing_lane") {
    return `${personaLabel} should resume this handed-off ${deliverableLabel} lane from ${parsedItem.label}.`;
  }
  return `${personaLabel} should fold the absorbed follow-on work from ${parsedItem.label} into this ${deliverableLabel} lane.`;
}

function createDefaultResumeSummary(card: HarnessCardRecord): string | null {
  const personaLabel = card.persona.toUpperCase();
  const deliverableLabel = humanizeDeliverableType(card.deliverableType).toLowerCase();
  switch (card.state) {
    case "queued":
      return `${personaLabel} should start this queued ${deliverableLabel} lane from the approved assignment "${card.title}".`;
    case "planning":
      return `${personaLabel} should shape the next bounded move for "${card.title}".`;
    case "approved":
      return `${personaLabel} should begin this approved ${deliverableLabel} lane: ${card.title}.`;
    case "working":
      return `${personaLabel} should continue this active ${deliverableLabel} lane: ${card.title}.`;
    case "waiting":
      return `${personaLabel} should resolve the waiting dependency before restarting "${card.title}".`;
    case "blocked":
      return `${personaLabel} should unblock this ${deliverableLabel} lane before more work starts.`;
    case "done":
    case "cancelled":
      return null;
    default:
      return `${personaLabel} should resume this ${deliverableLabel} lane from persisted state.`;
  }
}

function describeContinuitySnapshot(
  card: HarnessCardRecord,
  continuity: HarnessCardContinuityRecord | null
): string {
  if (continuity?.continuitySummary) {
    return continuity.continuitySummary;
  }
  if (continuity?.continuitySource === "result_recorded") {
    return `${card.persona.toUpperCase()} completed this ${humanizeDeliverableType(
      card.deliverableType
    ).toLowerCase()} lane and preserved the latest outcome for later review.`;
  }
  const personaLabel = card.persona.toUpperCase();
  const deliverableLabel = humanizeDeliverableType(card.deliverableType).toLowerCase();
  if (card.state === "done") {
    return `${personaLabel} completed this ${deliverableLabel} lane and preserved the latest outcome for later review.`;
  }
  if (card.state === "cancelled") {
    return `${personaLabel} closed this ${deliverableLabel} lane without reopening work in the current board cycle.`;
  }
  const latestAbsorbedWorkItem = continuity?.absorbedWorkItems.at(-1);
  if (latestAbsorbedWorkItem) {
    const parsedItem = parseContinuityAbsorbedWorkItem(latestAbsorbedWorkItem);
    if (continuity?.continuitySource === "lane_handoff" || parsedItem.resolution === "handoff_existing_lane") {
      return `${personaLabel} can resume this ${deliverableLabel} lane after a CEO handoff from ${parsedItem.label}.`;
    }
    return `${personaLabel} can resume this ${deliverableLabel} lane with absorbed follow-on work from ${parsedItem.label}.`;
  }
  return `${personaLabel} owns a deliverable-focused card that can resume from persisted state after interruption.`;
}

function buildContinuityMemorySection(input: {
  continuity: HarnessCardContinuityRecord | null;
  absorbedWorkItems: readonly string[];
  resultSummary?: string | undefined;
}): HarnessBoardDetailSection | null {
  if (!input.continuity) {
    return null;
  }

  const lines = [
    `Source: ${humanizeContinuitySource(input.continuity.continuitySource)}`,
    `Updated: ${formatBoardTimestamp(input.continuity.updatedAt)}`
  ];

  const latestOutcome = input.resultSummary ?? input.continuity.latestResultSummary;
  if (latestOutcome) {
    lines.push(`Latest outcome memory: ${latestOutcome}`);
  }

  const latestAbsorbedWorkItem = input.absorbedWorkItems.at(-1);
  if (latestAbsorbedWorkItem) {
    lines.push(`Latest absorbed work: ${latestAbsorbedWorkItem}`);
  }

  if (input.absorbedWorkItems.length > 1) {
    lines.push(`Absorbed work items tracked: ${input.absorbedWorkItems.length}`);
  }

  return {
    id: "continuity-memory",
    title: "Continuity memory",
    body: lines.join("\n")
  };
}

function humanizeContinuitySource(value: HarnessCardContinuityRecord["continuitySource"]): string {
  switch (value) {
    case "state_transition":
      return "State transition";
    case "resume_override":
      return "Resume override";
    case "proposal_absorbed":
      return "Proposal absorbed";
    case "lane_handoff":
      return "Lane handoff";
    case "result_recorded":
      return "Result recorded";
    default:
      return humanizeValue(value);
  }
}

function humanizeDeliverableType(value: string): string {
  return humanizeLabel(value.replace(/_/gu, " "));
}

function humanizeValue(value: string): string {
  return humanizeLabel(value.replace(/_/gu, " "));
}

function humanizeLabel(value: string): string {
  return value
    .split(/[\s_-]+/u)
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function formatBoardTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "recently";
  }

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC"
  });
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function toRecentDecisionView(decision: HarnessBoardDecisionRecord): HarnessRecentDecisionView {
  return {
    id: decision.id,
    decisionKind: decision.decisionKind,
    label: describeBoardDecision(decision),
    ...(decision.resolution ? { resolution: decision.resolution } : {}),
    ...(decision.policyReason ? { policyReasonLabel: humanizePolicyReason(decision.policyReason) } : {}),
    ...(decision.recommendationSummary ? { recommendationSummary: decision.recommendationSummary } : {}),
    ...(decision.objectionSummary ? { objectionSummary: decision.objectionSummary } : {}),
    timestampLabel: formatBoardTimestamp(decision.createdAt)
  };
}

function isFollowThroughDecision(decision: HarnessBoardDecisionRecord): boolean {
  return decision.decisionKind === "lane_opened" || decision.decisionKind === "proposal_approved" || decision.decisionKind === "run_completed";
}

function toFollowThroughView(decision: HarnessBoardDecisionRecord): HarnessFollowThroughView {
  return {
    id: decision.id,
    action: classifyFollowThroughAction(decision),
    summary: describeBoardDecision(decision),
    timestampLabel: formatBoardTimestamp(decision.createdAt),
    ...(decision.targetCardId ? { targetCardId: decision.targetCardId } : {}),
    ...(decision.proposalId ? { proposalId: decision.proposalId } : {}),
    ...(decision.persona ? { persona: decision.persona.toUpperCase() } : {}),
    ...(decision.deliverableType ? { deliverableLabel: humanizeDeliverableType(decision.deliverableType) } : {}),
    ...(decision.resolution ? { resolutionLabel: humanizeValue(decision.resolution) } : {}),
    ...(decision.policyReason ? { policyReasonLabel: humanizePolicyReason(decision.policyReason) } : {}),
    ...(decision.recommendationSummary ? { recommendationSummary: decision.recommendationSummary } : {}),
    ...(decision.objectionSummary ? { objectionSummary: decision.objectionSummary } : {})
  };
}

function classifyFollowThroughAction(decision: HarnessBoardDecisionRecord): HarnessFollowThroughView["action"] {
  if (decision.decisionKind === "lane_opened") {
    return "opened_lane";
  }
  if (decision.decisionKind === "run_completed") {
    return "packaged_outcome";
  }
  if (decision.resolution === "create_lane") {
    return "opened_lane";
  }
  if (decision.resolution === "handoff_existing_lane") {
    return "handed_off_lane";
  }
  return "reused_lane";
}

function describeBoardDecision(decision: HarnessBoardDecisionRecord): string {
  const persona = decision.persona ? decision.persona.toUpperCase() : "CEO";
  const deliverable = decision.deliverableType
    ? humanizeDeliverableType(decision.deliverableType).toLowerCase()
    : "lane";

  switch (decision.decisionKind) {
    case "lane_opened":
      return `CEO opened a new ${deliverable} lane for ${persona}.`;
    case "proposal_approved":
      if (decision.resolution === "handoff_existing_lane") {
        return `CEO handed the active ${deliverable} lane to ${persona}.`;
      }
      if (decision.resolution === "update_existing_lane") {
        return `CEO folded a proposal into the existing ${deliverable} lane.`;
      }
      return `CEO approved a new ${deliverable} lane for ${persona}.`;
    case "proposal_deferred":
      return `CEO deferred a ${deliverable} request for ${persona}.`;
    case "proposal_denied":
      return `CEO denied a ${deliverable} request for ${persona}.`;
    case "run_completed":
      return "CEO packaged the final board outcome for the tenant.";
    default:
      return "A board decision was recorded.";
  }
}

function toPendingApprovalPolicyView(input: {
  cards: readonly HarnessCardRecord[];
  proposal: HarnessSubCardProposal;
  policyReason: "persona_lane_cap" | "deliverable_owner_conflict" | "lane_cap" | "scope_guardrail" | "completed_lanes_only";
  latestDecision: HarnessBoardDecisionRecord | null;
}): Partial<HarnessPendingApprovalView> {
  const handoffTarget = selectDeliverableOwnerConflictTarget({
    cards: input.cards,
    proposal: input.proposal
  });
  if (input.proposal.status !== "deferred") {
    return {
      ...(input.policyReason !== "scope_guardrail"
        ? {
            policyReasonLabel: humanizePolicyReason(input.policyReason),
            nextReviewTrigger: describeNextReviewTrigger(input.policyReason)
          }
        : {}),
      ...(handoffTarget
        ? {
            handoffTargetCardId: handoffTarget.id,
            handoffTargetPersona: handoffTarget.persona.toUpperCase(),
            handoffTargetTitle: handoffTarget.title
          }
        : {})
    };
  }

  const decision = input.latestDecision;
  return {
    ...(decision?.policyReason ? { policyReasonLabel: humanizePolicyReason(decision.policyReason) } : {}),
    nextReviewTrigger: describeNextReviewTrigger(decision?.policyReason ?? null),
    ...(decision ? { lastDecisionAtLabel: formatBoardTimestamp(decision.createdAt) } : {}),
    ...(handoffTarget
      ? {
          handoffTargetCardId: handoffTarget.id,
          handoffTargetPersona: handoffTarget.persona.toUpperCase(),
          handoffTargetTitle: handoffTarget.title
        }
      : {})
  };
}

function determinePendingApprovalRecommendedOption(
  input: {
    policyReason: "persona_lane_cap" | "deliverable_owner_conflict" | "lane_cap" | "scope_guardrail" | "completed_lanes_only";
    handoffTargetCardId?: string;
  }
): "approve" | "defer" | "deny" {
  switch (input.policyReason) {
    case "completed_lanes_only":
    case "persona_lane_cap":
    case "lane_cap":
      return "defer";
    case "deliverable_owner_conflict":
      return input.handoffTargetCardId ? "approve" : "defer";
    case "scope_guardrail":
    default:
      return "approve";
  }
}

function isPendingApprovalPolicyReason(
  value: HarnessBoardDecisionRecord["policyReason"] | undefined | null
): value is "persona_lane_cap" | "deliverable_owner_conflict" | "lane_cap" | "scope_guardrail" | "completed_lanes_only" {
  return (
    value === "persona_lane_cap" ||
    value === "deliverable_owner_conflict" ||
    value === "lane_cap" ||
    value === "scope_guardrail" ||
    value === "completed_lanes_only"
  );
}

function selectDeliverableOwnerConflictTarget(input: {
  cards: readonly HarnessCardRecord[];
  proposal: Pick<HarnessSubCardProposal, "persona" | "deliverableType">;
}): HarnessCardRecord | null {
  return (
    input.cards.find(
      (card) =>
        card.persona !== "ceo" &&
        isOpenCardState(card.state) &&
        card.deliverableType === input.proposal.deliverableType &&
        card.persona !== input.proposal.persona
    ) ?? null
  );
}

function buildCompletionPackageNote(input: {
  deferredApprovalCount: number;
  deniedApprovalCount: number;
  recommendationCount: number;
  objectionCount: number;
}): string | undefined {
  if (input.deferredApprovalCount > 0) {
    return "The board is packaging completed work while keeping deferred follow-up requests visible for later CEO review.";
  }
  if (input.deniedApprovalCount > 0) {
    return "The board outcome keeps denied governance requests visible so the tenant can see where the CEO held the workflow boundary.";
  }
  if (input.objectionCount > 0) {
    return "The board outcome includes completed work alongside bounded objections that still need attention.";
  }
  if (input.recommendationCount > 0) {
    return "The board outcome includes clear next-step recommendations for the tenant-facing handoff.";
  }
  return undefined;
}

function createLaneRecommendationSummary(input: {
  persona: string;
  deliverableType: string;
  policyReason: "created_new_lane" | "reused_existing_lane" | "completed_lanes_only";
}): string {
  const deliverable = humanizeDeliverableType(input.deliverableType).toLowerCase();
  const persona = input.persona.toUpperCase();
  if (input.policyReason === "reused_existing_lane") {
    return `Advance this ${deliverable} inside the existing ${persona} lane.`;
  }
  if (input.policyReason === "completed_lanes_only") {
    return "Package only completed lanes into the tenant-facing board outcome.";
  }
  return `Open a dedicated ${deliverable} lane for ${persona}.`;
}

function createHandoffRecommendationSummary(input: {
  persona: string;
  deliverableType: string;
}): string {
  const deliverable = humanizeDeliverableType(input.deliverableType).toLowerCase();
  const persona = input.persona.toUpperCase();
  return `Hand this ${deliverable} lane to ${persona} and continue the work inside the existing board lane.`;
}

function createGovernanceObjectionSummary(input: {
  deliverableType: string;
  policyReason: "persona_lane_cap" | "deliverable_owner_conflict" | "lane_cap" | "scope_guardrail" | "completed_lanes_only";
}): string {
  const deliverable = humanizeDeliverableType(input.deliverableType).toLowerCase();
  switch (input.policyReason) {
    case "persona_lane_cap":
      return `Keep this persona focused on the current ${deliverable} lane until that work closes or is handed off.`;
    case "deliverable_owner_conflict":
      return `Wait for the current ${deliverable} owner to clear or hand off that lane first.`;
    case "lane_cap":
      return `Hold this ${deliverable} request until the active lane count drops.`;
    case "completed_lanes_only":
      return `Do not reopen new ${deliverable} work until the CEO deliberately starts a fresh board cycle.`;
    case "scope_guardrail":
    default:
      return `Do not widen this run beyond the approved ${deliverable} workflow boundary.`;
  }
}

function determineProposalPolicyReason(input: {
  run: Pick<HarnessRunRecord, "state">;
  cards: readonly HarnessCardRecord[];
  proposal: Pick<HarnessSubCardProposal, "persona" | "deliverableType" | "title" | "parentCardId" | "requestedByCardId">;
}): "persona_lane_cap" | "deliverable_owner_conflict" | "lane_cap" | "scope_guardrail" | "completed_lanes_only" {
  if (input.run.state === "assembling" || input.run.state === "done") {
    return "completed_lanes_only";
  }
  const samePersonaLane = findOpenChildCardByPersonaDeliverable(input.cards, {
    persona: input.proposal.persona,
    deliverableType: input.proposal.deliverableType
  });
  if (
    samePersonaLane &&
    !isBoundedLaneRefinement({
      proposal: input.proposal,
      candidateCard: samePersonaLane
    })
  ) {
    return "persona_lane_cap";
  }
  if (
    findOpenChildCardByDeliverableType(input.cards, input.proposal.deliverableType) &&
    !findOpenChildCardByPersonaDeliverable(input.cards, {
      persona: input.proposal.persona,
      deliverableType: input.proposal.deliverableType
    })
  ) {
    return "deliverable_owner_conflict";
  }
  if (
    findOpenChildCardByPersona(input.cards, input.proposal.persona) &&
    !findOpenChildCardByPersonaDeliverable(input.cards, {
      persona: input.proposal.persona,
      deliverableType: input.proposal.deliverableType
    })
  ) {
    return "persona_lane_cap";
  }
  if (countOpenChildCards(input.cards) >= MAX_OPEN_CHILD_CARDS) {
    return "lane_cap";
  }
  return "scope_guardrail";
}

function createGovernanceRecommendationSummary(input: {
  deliverableType: string;
  policyReason: "persona_lane_cap" | "deliverable_owner_conflict" | "lane_cap" | "scope_guardrail" | "completed_lanes_only";
  status: "deferred" | "denied";
}): string {
  const deliverable = humanizeDeliverableType(input.deliverableType).toLowerCase();
  switch (input.policyReason) {
    case "persona_lane_cap":
      return `Finish, close, or hand off the current ${deliverable} lane before opening another active lane for this persona.`;
    case "deliverable_owner_conflict":
      return `Keep advancing the current ${deliverable} lane and revisit this request after a clear handoff.`;
    case "lane_cap":
      return `Finish or close one active lane before reopening this ${deliverable} request.`;
    case "completed_lanes_only":
      return `Package only completed lanes into the tenant-facing board outcome until the CEO deliberately starts a fresh board cycle.`;
    case "scope_guardrail":
    default:
      return input.status === "denied"
        ? `Keep this ${deliverable} work inside the current approved package boundary unless the CEO deliberately widens scope.`
        : `Revisit this ${deliverable} request only if the CEO deliberately widens the approved workflow boundary.`;
  }
}

function createRepeatedRequestDecisionNote(input: {
  status: "deferred" | "denied";
  policyReason: "persona_lane_cap" | "deliverable_owner_conflict" | "lane_cap" | "scope_guardrail" | "completed_lanes_only";
  deliverableType: string;
}): string {
  const deliverable = humanizeDeliverableType(input.deliverableType).toLowerCase();
  switch (input.policyReason) {
    case "persona_lane_cap":
      return "CEO deferred this proposal because an equivalent request is already waiting on the same persona's active lane focus.";
    case "deliverable_owner_conflict":
      return `CEO deferred this proposal because an equivalent request is already waiting on the current ${deliverable} owner.`;
    case "lane_cap":
      return `CEO deferred this proposal because an equivalent request is already waiting for lane capacity.`;
    case "completed_lanes_only":
      return `CEO deferred this proposal because an equivalent request is already waiting for a fresh board cycle.`;
    case "scope_guardrail":
    default:
      return input.status === "denied"
        ? "CEO denied this proposal because an equivalent request is already pending CEO review."
        : `CEO deferred this proposal because an equivalent ${deliverable} request is already pending CEO review.`;
  }
}

function createPublicProposalDecisionMessage(input: {
  status: "deferred" | "denied";
  deliverableType: string;
  policyReason: "persona_lane_cap" | "deliverable_owner_conflict" | "lane_cap" | "scope_guardrail" | "completed_lanes_only";
}): string {
  const deliverable = humanizeDeliverableType(input.deliverableType).toLowerCase();
  switch (input.policyReason) {
    case "persona_lane_cap":
      return input.status === "denied"
        ? `CEO denied this ${deliverable} request because that persona already has another active lane.`
        : `CEO deferred this ${deliverable} request because that persona already has another active lane.`;
    case "deliverable_owner_conflict":
      return input.status === "denied"
        ? `CEO denied this ${deliverable} request because the current lane owner still controls that work.`
        : `CEO deferred this ${deliverable} request until the current lane owner clears or hands off the work.`;
    case "lane_cap":
      return input.status === "denied"
        ? `CEO denied this ${deliverable} request because the current run is already carrying its maximum active lane count.`
        : `CEO deferred this ${deliverable} request because the current run is already carrying its maximum active lane count.`;
    case "completed_lanes_only":
      return input.status === "denied"
        ? `CEO denied this ${deliverable} request because this board cycle is already packaging completed work.`
        : `CEO deferred this ${deliverable} request because this board cycle is already packaging completed work.`;
    case "scope_guardrail":
    default:
      return input.status === "denied"
        ? `CEO denied this ${deliverable} request to keep the board inside the approved workflow boundary.`
        : `CEO deferred this ${deliverable} request until the approved workflow boundary is widened.`;
  }
}

function humanizePolicyReason(value: NonNullable<HarnessBoardDecisionRecord["policyReason"]>): string {
  switch (value) {
    case "created_new_lane":
      return "New lane approved";
    case "reused_existing_lane":
      return "Existing lane reused";
    case "persona_lane_cap":
      return "Persona focus protection";
    case "deliverable_owner_conflict":
      return "Waiting on current lane owner";
    case "lane_cap":
      return "Lane cap protection";
    case "scope_guardrail":
      return "Scope guardrail";
    case "completed_lanes_only":
      return "Completed lanes only";
    default:
      return humanizeLabel(value);
  }
}

function describeNextReviewTrigger(policyReason: HarnessBoardDecisionRecord["policyReason"]): string {
  switch (policyReason) {
    case "persona_lane_cap":
      return "Review again when that persona's current active lane closes or is handed off.";
    case "deliverable_owner_conflict":
      return "Review again when the current deliverable owner clears or hands off the lane.";
    case "lane_cap":
      return "Review again when one of the active child lanes closes.";
    case "completed_lanes_only":
      return "Review again only if the CEO deliberately starts a fresh board cycle for follow-on work.";
    case "scope_guardrail":
      return "Review again only if the CEO widens the approved workflow boundary.";
    default:
      return "Review again when the CEO reopens this request for board consideration.";
  }
}

function isTerminalHarnessRunState(state: HarnessRunRecord["state"]): boolean {
  return state === "done" || state === "failed" || state === "cancelled";
}

function isUniqueConstraintViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as { code?: string; message?: string };
  return (
    record.code === "23505" ||
    (typeof record.message === "string" && record.message.includes("harness_runs_tenant_workflow_unique_idx"))
  );
}
