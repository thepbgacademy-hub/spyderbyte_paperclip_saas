import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  HarnessBoard,
  type HarnessBoardCard,
  type HarnessBoardColumn
} from "../apps/web/src/components/HarnessBoard.js";
import { HarnessCardDrawer } from "../apps/web/src/components/HarnessCardDrawer.js";
import {
  buildContractActionPayload,
  canSubmitContractActionState,
  canResetBoardActionComposerAfterError,
  canRetryBoardActionAfterError,
  describeContractActionIssue,
  describeActionAttemptSupport,
  describeBoardActionFeedback,
  describeBoardContractRefreshImpact,
  describeBoardLoadFeedback,
  getContractActionState,
  getBoardContractActionDescriptorMap,
  getBoardContractActionFieldMap,
  inspectBoardContractRefreshImpact,
  pruneActionDraftsForBoard,
  pruneOpenActionComposerKeysForBoard,
  resolveBoardLoadFailure,
  shouldResyncBoardAfterActionError,
  summarizeContractActionState,
  HarnessBoardPage
} from "../apps/web/src/pages/HarnessBoardPage.js";
import { HarnessBoardClientError } from "../apps/web/src/harness-board-client.js";
import type { HarnessBoardResponse } from "../src/harness/board-service.js";

const cards: HarnessBoardCard[] = [
  {
    id: "card-ceo-plan",
    persona: "CEO",
    title: "Shape the launch plan",
    summary: "Clarify the first three moves, align priorities, and package the next decisions.",
    lane: "planning",
    statusLabel: "Planning",
    priorityLabel: "High",
    deliverableLabel: "Launch plan",
    updatedAtLabel: "Updated 5 minutes ago",
    outcome: "Drafted the first pass of the launch sequence for review.",
    focusPoints: ["Narrow the offer", "Sequence delivery", "Highlight decisions"],
    activity: [
      {
        id: "activity-1",
        label: "CEO reframed the first milestone around sales clarity.",
        timestampLabel: "11:05 AM"
      }
    ],
    detailSections: [
      {
        id: "snapshot",
        title: "Snapshot",
        body: "High-level planning notes stay visible without exposing execution internals."
      },
      {
        id: "continuity-memory",
        title: "Continuity memory",
        body: "Source: Resume override\nUpdated: 11:07 AM\nLatest outcome memory: Keep the launch brief tight."
      }
    ]
  },
  {
    id: "card-cfo-forecast",
    persona: "CFO",
    title: "Pressure-test the pricing lane",
    summary: "Check margin assumptions and flag the revenue sensitivities for the package.",
    lane: "working",
    statusLabel: "Working",
    priorityLabel: "Medium",
    deliverableLabel: "Margin review",
    updatedAtLabel: "Updated 12 minutes ago",
    outcome: "Margin ranges are stable with one pricing decision still pending.",
    focusPoints: ["Review margin floor", "Spot discount risk"],
    activity: [
      {
        id: "activity-2",
        label: "CFO highlighted one discount edge case for approval.",
        timestampLabel: "10:58 AM"
      }
    ],
    detailSections: [
      {
        id: "outcome",
        title: "Outcome",
        body: "The tenant sees the business takeaway, not internal execution noise."
      }
    ]
  }
];

const columns: HarnessBoardColumn[] = [
  { id: "planning", title: "Planning", description: "Cards getting shaped", cardIds: ["card-ceo-plan"] },
  { id: "working", title: "Working", description: "Cards currently advancing", cardIds: ["card-cfo-forecast"] }
];

const boardResponse: HarnessBoardResponse = {
  runId: "run_ui_test_1",
  workflowId: "wf_connect_first_workflow",
  packageId: "pkg_bib_connect",
  columns,
  cards,
  pendingApprovals: [
    {
      id: "proposal_ui_test_1",
      title: "Gather competitor price anchors",
      requestedByPersona: "CFO",
      targetPersona: "RESEARCHER",
      deliverableLabel: "Research Brief",
      statusLabel: "Pending CEO approval",
      actionRoute: "proposal-decision",
      actionPath: "/api/harness/proposals/proposal_ui_test_1/decision",
      actionMethod: "POST",
      actionToken: "test-proposal-token",
      actionLabel: "Review proposal decision",
      actionDescription: "Choose whether this proposed follow-on work should be approved, deferred, or denied.",
      requestFields: [
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
          description: "Add a short note when the CEO wants the review trail to capture why this proposal changed direction.",
          required: false,
          supportedWhenValue: "defer"
        }
      ],
      actionOptions: [
        {
          value: "approve",
          label: "Approve proposal",
          description: "Approve this work so it can move into the bounded execution flow.",
          emphasis: "primary",
          nextEffectSummary: "This proposal can move into the bounded execution flow and open or advance the intended lane.",
          exampleRequest: { decision: "approve" }
        },
        {
          value: "defer",
          label: "Defer proposal",
          description: "Pause this follow-on work until the current board cycle is ready to widen safely.",
          emphasis: "secondary",
          nextEffectSummary: "This proposal stays visible for later CEO review without opening or advancing a new lane yet.",
          exampleRequest: { decision: "defer" }
        },
        {
          value: "deny",
          label: "Deny proposal",
          description: "Reject this follow-on work when it should not expand the current board cycle.",
          emphasis: "caution",
          nextEffectSummary: "This proposal closes without opening or advancing any new work lane.",
          requiresConfirmation: true,
          confirmationLabel: "Deny this proposal and close the follow-on request?",
          exampleRequest: { decision: "deny" }
        }
      ],
      recommendedOptionValue: "approve",
      allowedDecisions: ["approve", "defer", "deny"],
      policyReasonLabel: "Review for expansion",
      nextReviewTrigger: "Revisit after the CEO closes the current pricing board decisions.",
      lastDecisionAtLabel: "11:11 AM"
    }
  ],
  pendingAttention: {
    kind: "queue_ceo_review",
    runState: "assembling",
    statusLabel: "CEO review required",
    summary: "The board is ready for final assembly before the tenant-facing package is closed.",
    actionRoute: "review-attention",
    actionPath: "/api/harness/runs/run_ui_test_1/review-attention",
    actionMethod: "POST",
    actionToken: "test-review-token",
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
        name: "mode",
        label: "Fresh-cycle mode",
        description: "Choose whether the next cycle should reopen deferred work or start clean.",
        required: false,
        supportedWhenValue: "start_fresh_cycle",
        allowedValues: ["reopen_deferred", "clean"],
        suggestedValue: "reopen_deferred"
      }
    ],
    actionOptions: [
      {
        value: "complete_run",
        label: "Complete run",
        description: "Close the current board cycle and package the current business outcome.",
        emphasis: "primary",
        nextEffectSummary: "The current run closes as done and the tenant-facing package stays on this board cycle.",
        exampleRequest: { decision: "complete_run" }
      },
      {
        value: "start_fresh_cycle",
        label: "Start fresh cycle",
        description: "Open the next board cycle from this run, with or without reopening deferred work.",
        emphasis: "secondary",
        nextEffectSummary: "A new run starts from this board, optionally carrying deferred follow-on work into the next cycle.",
        requiresConfirmation: true,
        confirmationLabel: "Start a new board cycle from this run?",
        exampleRequest: { decision: "start_fresh_cycle", mode: "reopen_deferred" }
      }
    ],
    recommendedOptionValue: "complete_run",
    allowedDecisions: ["complete_run", "start_fresh_cycle"],
    requestedAtLabel: "11:24 AM",
    reasonLabel: "Final assembly"
  },
  recentDecisions: [
    {
      id: "decision_ui_test_1",
      decisionKind: "proposal_deferred",
      label: "CEO kept the research expansion under bounded review.",
      resolution: "defer",
      policyReasonLabel: "Review for expansion",
      recommendationSummary: "Hold the research expansion until the pricing package is stable.",
      objectionSummary: "Do not widen the current board cycle yet.",
      timestampLabel: "11:18 AM"
    }
  ],
  followThroughItems: [
    {
      id: "follow_through_ui_test_1",
      action: "packaged_outcome",
      summary: "CEO packaged the current pricing outcome for tenant-facing review.",
      timestampLabel: "11:19 AM",
      persona: "CFO",
      deliverableLabel: "Margin review",
      policyReasonLabel: "New lane approved",
      resolutionLabel: "Create Lane",
      recommendationSummary: "Carry the pricing readout into the tenant-facing package.",
      objectionSummary: "Do not widen the board cycle until the pricing package is finalized."
    }
  ],
  completionPackage: {
    status: "assembling",
    summary: "The current package is nearly ready with one bounded governance item still shaping the handoff.",
    deferredApprovalCount: 1,
    deniedApprovalCount: 0,
    hasOpenGovernanceItems: true,
    packageNote: "Keep the pricing package readable while the research expansion stays under review.",
    recommendations: [
      "Carry the current pricing readout into the tenant-facing package.",
      "Revisit the research expansion after the CEO closes the current cycle."
    ],
    objections: ["Do not widen the board cycle until the pricing package is finalized."],
    governanceItems: [
      {
        proposalId: "proposal_ui_test_1",
        statusLabel: "Pending CEO approval",
        persona: "RESEARCHER",
        deliverableLabel: "Research Brief",
        policyReasonLabel: "Review for expansion",
        recommendationSummary: "Approve only after the pricing package is stable.",
        objectionSummary: "Avoid expanding the current board cycle too early.",
        nextReviewTrigger: "Revisit after the current pricing package is completed."
      }
    ],
    deliverables: [
      {
        cardId: "card-cfo-forecast",
        persona: "CFO",
        title: "Pressure-test the pricing lane",
        deliverableLabel: "Margin review",
        outcome: "Margin ranges are stable with one pricing decision still pending."
      }
    ]
  },
  memoryBoundary: {
    summary: "Wealth Factory runtime keeps bounded operational lane memory live while governance and package records stay ready for later tenant-owned export.",
    exportSummary: "2 export candidates are ready now, and 2 still wait for board closure.",
    deliverySummary: "No grouped export deliveries have been attempted yet.",
    roleSummary: "2 governance record candidates are ready now, and 2 packaged output candidates still wait on board closure.",
    ownershipSummary:
      "2 runtime memory buckets stay Wealth Factory-only, while 4 tenant-record candidate buckets may become tenant-owned later.",
    promotionSummary:
      "2 runtime memory buckets never promote, 2 candidate buckets are ready for explicit export later, and 2 candidate buckets still wait on board closure first.",
    recordTargetSummary:
      "2 governance history record candidates are ready, while 2 package record candidates stay package-shaped until board closure completes.",
    blockerSummary:
      "2 export candidate buckets are still blocked by board closure. Runtime memory stays non-promotable by design.",
    authoritySummary:
      "2 export candidate buckets are already tenant-controlled for later explicit export, while 2 buckets still need board closure before tenant export can own the next step.",
    triggerSummary:
      "2 export candidate buckets are waiting only on a later tenant export request, while 2 buckets still need board closure before that request can happen.",
    readyNowCount: 2,
    waitingOnBoardClosureCount: 2,
    governanceReadyCount: 2,
    packagedReadyCount: 0,
    packagedWaitingCount: 2,
    blockedCandidateCount: 2,
    tenantControlledCandidateCount: 2,
    boardControlledCandidateCount: 2,
    tenantExportTriggerCount: 2,
    boardClosureTriggerCount: 2,
    runtimeOnlyStateCount: 2,
    readyForTenantExportStateCount: 2,
    awaitingBoardClosureStateCount: 2,
    runtimeOnlyNextStepCount: 2,
    tenantExportAvailableNextStepCount: 2,
    boardClosureThenTenantExportNextStepCount: 2,
    noPromotionActionCount: 2,
    tenantExportActionFamilyCount: 2,
    boardClosureActionFamilyCount: 2,
    noAssemblyShapeCount: 2,
    standaloneExportRecordCount: 2,
    packageRecordSetCount: 2,
    noExportPhaseCount: 2,
    phaseOneExportCount: 2,
    phaseTwoExportCount: 2,
    runtimeMutableCount: 2,
    appendOnlyHistoryCount: 2,
    replaceableSnapshotCount: 2,
    stableSnapshotCount: 0,
    stateSummary:
      "2 runtime buckets stay runtime-only, 2 export candidate buckets are ready for tenant export later, and 2 buckets are still awaiting board closure.",
    nextStepSummary:
      "2 runtime buckets have no promotion step, 2 export candidate buckets are ready for a later tenant export step, and 2 buckets still need board closure before tenant export becomes the next step.",
    actionFamilySummary:
      "2 runtime buckets expose no promotion action, 2 export candidate buckets sit in the tenant export family, and 2 buckets remain in the board-closure-first family.",
    assemblySummary:
      "2 runtime buckets have no export assembly, 2 export candidate buckets are ready as standalone export records, and 2 buckets still belong to a package record set after board closure.",
    phaseSummary:
      "2 runtime buckets have no export phase, 2 export candidate buckets are ready in the phase-one export lane, and 2 buckets still wait in the phase-two package export lane.",
    mutabilitySummary:
      "2 runtime buckets stay runtime mutable, 2 export candidate buckets are append-only history, and 2 buckets still behave as replaceable package snapshots until board closure.",
    scopeSummary:
      "2 runtime buckets have no promotion scope, 2 export candidate buckets are ready as single-record exports, and 2 buckets still belong to a package record-set export scope.",
    identitySummary:
      "2 runtime buckets keep transient runtime identity, 2 buckets already have stable record identity, and 2 buckets still finalize identity at board closure.",
    auditSummary:
      "2 runtime buckets stay runtime-state-backed, 2 buckets are decision-ledger-backed, and 2 buckets are package-closure-backed.",
    concurrencySummary:
      "2 runtime buckets stay runtime-only, 2 export candidate buckets are safe to promote independently, and 2 buckets still need a board-closure snapshot for concurrency-safe promotion.",
    payloadShapeSummary:
      "2 runtime buckets have no export payload shape, 2 export candidate buckets are shaped as governance history records, and 2 buckets still export as package snapshot bundles.",
    idempotencySummary:
      "2 runtime buckets have no idempotency policy, 2 export candidate buckets use deterministic upsert, and 2 buckets still depend on a board-closure snapshot-once policy.",
    replaySafetySummary:
      "2 runtime buckets stay runtime-only, 2 export candidate buckets are replay-safe, and 2 buckets still require a fresh board-closure snapshot before replay.",
    conflictPolicySummary:
      "2 runtime buckets stay outside export conflicts, 2 export candidate buckets use append-or-upsert conflict handling, and 2 buckets still replace the latest board-closure snapshot when promoted.",
    atomicitySummary:
      "2 runtime buckets have no export atomicity, 2 export candidate buckets commit as record-level atomic exports, and 2 buckets still depend on closure-bundle atomic export once board closure completes.",
    derivationSummary:
      "2 runtime buckets have no export derivation basis, 2 export candidate buckets are derived from decision history, and 2 buckets are derived from the board-closure snapshot.",
    revisionSummary:
      "2 runtime buckets have no export revision policy, 2 export candidate buckets append as new revisions, and 2 buckets still replace the current closure-bundle revision.",
    freshnessSummary:
      "2 runtime buckets have no export freshness source, 2 export candidate buckets use the latest record state, and 2 buckets still depend on the latest board-closure snapshot.",
    validationSummary:
      "2 runtime buckets have no export validation boundary, 2 export candidate buckets validate at record level, and 2 buckets still validate at closure-bundle level.",
    completenessSummary:
      "2 runtime buckets have no export completeness rule, 2 export candidate buckets are self-contained records, and 2 buckets still complete as board-closure bundles.",
    sensitivitySummary:
      "2 runtime buckets have no export sensitivity, 2 export candidate buckets carry tenant business context, and 2 buckets still carry tenant deliverable context.",
    audienceSummary:
      "2 runtime buckets stay Wealth Factory runtime only, 2 export candidate buckets are aimed at tenant governance-history readers, and 2 buckets still target tenant package consumers.",
    sanitizationSummary:
      "2 runtime buckets have no export sanitization, 2 export candidate buckets export as recorded, and 2 buckets still require sanitization before package export.",
    redactionSummary:
      "2 runtime buckets stay runtime internal only, 2 export candidate buckets use governance-safe redaction, and 2 buckets still require package-safe redaction.",
    sourceDisclosureSummary:
      "2 runtime buckets are runtime only, 2 export candidate buckets disclose decision summaries only, and 2 buckets still disclose closure-snapshot summaries only.",
    placementSummary:
      "2 runtime buckets have no tenant memory placement, 2 export candidate buckets land as governance history notes, and 2 buckets still land in package record folders.",
    syncStrategySummary:
      "2 runtime buckets have no tenant sync strategy, 2 export candidate buckets append history entries, and 2 buckets still replace package snapshots after board closure.",
    requestShapeSummary:
      "2 runtime buckets have no export request shape, 2 export candidate buckets use single-record export requests, and 2 buckets still use package-bundle export requests.",
    confirmationSummary:
      "2 runtime buckets have no export confirmation, 2 export candidate buckets require tenant export confirmation, and 2 buckets still require board closure before tenant export confirmation.",
    recoveryPathSummary:
      "2 runtime buckets are runtime only, 2 export candidate buckets retry the latest record export, and 2 buckets still rerun after the board-closure snapshot.",
    exportCandidatePayloadShapeSummary:
      "1 export candidate group uses governance history record payloads, and 1 group still uses package snapshot bundle payloads.",
    exportCandidateIdempotencySummary:
      "1 export candidate group uses deterministic upsert, and 1 group still depends on board-closure snapshot-once idempotency.",
    exportCandidateReplaySafetySummary:
      "1 export candidate group is replay-safe, and 1 group still requires a fresh board-closure snapshot before replay.",
    exportCandidateConflictPolicySummary:
      "1 export candidate group uses append-or-upsert conflict handling, and 1 group still replaces the latest board-closure snapshot on conflict.",
    exportCandidateAtomicitySummary:
      "1 export candidate group commits as record-level atomic exports, and 1 group still depends on closure-bundle atomic export.",
    exportCandidateDerivationSummary:
      "1 export candidate group is derived from decision history, and 1 group is derived from the board-closure snapshot.",
    exportCandidateRevisionSummary:
      "1 export candidate group appends as new revisions, and 1 group still replaces the current closure-bundle revision.",
    exportCandidateFreshnessSummary:
      "1 export candidate group uses the latest record state, and 1 group still depends on the latest board-closure snapshot.",
    exportCandidateValidationSummary:
      "1 export candidate group validates at record level, and 1 group still validates at closure-bundle level.",
    exportCandidateCompletenessSummary:
      "1 export candidate group is a self-contained record, and 1 group still completes as board-closure bundles.",
    noPromotionScopeCount: 2,
    singleRecordExportScopeCount: 2,
    packageRecordSetExportScopeCount: 2,
    transientIdentityCount: 2,
    stableIdentityCount: 2,
    closureFinalizedIdentityCount: 2,
    runtimeStateOnlyAuditCount: 2,
    decisionLedgerAuditCount: 2,
    packageClosureAuditCount: 2,
    runtimeOnlyConcurrencyCount: 2,
    independentExportSafeCount: 2,
    requiresBoardClosureSnapshotCount: 2,
    noExportPayloadShapeCount: 2,
    governanceHistoryPayloadCount: 2,
    packageSnapshotBundleCount: 2,
    noIdempotencyPolicyCount: 2,
    deterministicUpsertCount: 2,
    boardClosureSnapshotOnceCount: 2,
    runtimeOnlyReplaySafetyCount: 2,
    replaySafeCount: 2,
    freshClosureSnapshotReplayCount: 2,
    runtimeOnlyConflictPolicyCount: 2,
    appendOrUpsertConflictCount: 2,
    replaceLatestClosureSnapshotCount: 2,
    noExportAtomicityCount: 2,
    recordLevelAtomicCount: 2,
    closureBundleAtomicCount: 2,
    noExportDerivationBasisCount: 2,
    decisionHistoryDerivedCount: 2,
    boardClosureSnapshotDerivedCount: 2,
    noExportRevisionPolicyCount: 2,
    appendNewRevisionCount: 2,
    replaceClosureBundleRevisionCount: 2,
    noExportFreshnessSourceCount: 2,
    latestRecordStateCount: 2,
    latestBoardClosureSnapshotCount: 2,
    noExportValidationBoundaryCount: 2,
    recordLevelValidationCount: 2,
    closureBundleValidationCount: 2,
    noExportCompletenessRuleCount: 2,
    selfContainedRecordCount: 2,
    boardClosureCompleteBundleCount: 2,
    noExportSensitivityCount: 2,
    tenantBusinessContextCount: 2,
    tenantDeliverableContextCount: 2,
    runtimeOnlyAudienceCount: 2,
    governanceHistoryAudienceCount: 2,
    packageConsumerAudienceCount: 2,
    noExportSanitizationCount: 2,
    exportAsRecordedCount: 2,
    sanitizeBeforePackageExportCount: 2,
    runtimeInternalOnlyRedactionCount: 2,
    governanceSafeRedactionCount: 2,
    packageSafeRedactionCount: 2,
    runtimeOnlySourceDisclosureCount: 2,
    decisionSummaryOnlyCount: 2,
    closureSnapshotSummaryOnlyCount: 2,
    noMemoryPlacementCount: 2,
    governanceHistoryNoteCount: 2,
    packageRecordFolderCount: 2,
    noSyncStrategyCount: 2,
    appendHistoryEntryCount: 2,
    replacePackageSnapshotAfterClosureCount: 2,
    noExportRequestShapeCount: 2,
    singleRecordExportRequestCount: 2,
    packageBundleExportRequestCount: 2,
    noExportConfirmationRequirementCount: 2,
    tenantExportConfirmationCount: 2,
    boardClosureThenTenantExportConfirmationCount: 2,
    runtimeOnlyRecoveryPathCount: 2,
    retryLatestRecordExportCount: 2,
    rerunAfterBoardClosureSnapshotCount: 2,
    partitions: {
      runtime: {
        itemCount: 2,
        summary: "2 runtime memory buckets stay live only inside Wealth Factory orchestration."
      },
      governanceHistoryCandidates: {
        itemCount: 2,
        summary: "2 governance history candidates are stable enough for later tenant-owned export."
      },
      packagedOutputCandidates: {
        itemCount: 2,
        summary: "2 packaged output candidates still wait on board closure before later export."
      }
    },
    operationalItems: [
      {
        id: "lane_continuity",
        label: "Lane continuity",
        count: 2,
        summary: "Continuity snapshots stay in Wealth Factory runtime as live operational memory.",
        destination: "wealth_factory_runtime",
        readiness: "live_runtime_only",
        readinessLabel: "Live runtime only",
        role: "runtime_memory",
        roleLabel: "Runtime memory",
        eligibilityRule: "runtime_only",
        eligibilityRuleLabel: "Runtime only",
        sourceSurface: "continuity_snapshots",
        sourceSurfaceLabel: "Continuity snapshots",
        candidateClass: "runtime_operational",
        candidateClassLabel: "Runtime operational",
        durabilityCondition: "runtime_ephemeral",
        durabilityConditionLabel: "Runtime ephemeral",
        ownershipBoundary: "wealth_factory_only",
        ownershipBoundaryLabel: "Wealth Factory only",
        promotionPath: "never_promotes",
        promotionPathLabel: "Never promotes",
        recordTarget: "none_runtime_only",
        recordTargetLabel: "Runtime only",
        promotionBlocker: "not_applicable_runtime_only",
        promotionBlockerLabel: "Not applicable in runtime",
        promotionAuthority: "wealth_factory_runtime_only",
        promotionAuthorityLabel: "Wealth Factory runtime only",
        promotionTrigger: "not_applicable_runtime",
        promotionTriggerLabel: "No promotion trigger",
        promotionState: "runtime_only",
        promotionStateLabel: "Runtime only",
        promotionNextStep: "none_runtime_only",
        promotionNextStepLabel: "No promotion step",
        promotionActionFamily: "none_runtime_only",
        promotionActionFamilyLabel: "No promotion action",
        assemblyShape: "none_runtime_only",
        assemblyShapeLabel: "No export assembly",
        promotionPhase: "not_exported_runtime",
        promotionPhaseLabel: "No export phase",
        promotionMutability: "runtime_mutable",
        promotionMutabilityLabel: "Runtime mutable",
        promotionScope: "none_runtime_only",
        promotionScopeLabel: "No promotion scope",
        identityStability: "runtime_transient_identity",
        identityStabilityLabel: "Runtime transient identity",
        auditBacking: "runtime_state_only",
        auditBackingLabel: "Runtime-state-backed",
        concurrencyBoundary: "runtime_only",
        concurrencyBoundaryLabel: "Runtime only",
        exportPayloadShape: "none_runtime_only",
        exportPayloadShapeLabel: "No export payload",
        idempotencyPolicy: "not_applicable_runtime",
        idempotencyPolicyLabel: "No idempotency policy",
        replaySafety: "runtime_only",
        replaySafetyLabel: "Runtime only",
        conflictPolicy: "runtime_only",
        conflictPolicyLabel: "Runtime only",
        exportAtomicity: "none_runtime_only",
        exportAtomicityLabel: "No export atomicity",
        exportDerivationBasis: "none_runtime_only",
        exportDerivationBasisLabel: "No export derivation",
        exportRevisionPolicy: "none_runtime_only",
        exportRevisionPolicyLabel: "No export revision policy",
        exportFreshnessSource: "none_runtime_only",
        exportFreshnessSourceLabel: "No export freshness source",
        exportValidationBoundary: "none_runtime_only",
        exportValidationBoundaryLabel: "No export validation",
        exportCompletenessRule: "none_runtime_only",
        exportCompletenessRuleLabel: "No export completeness rule",
        exportSensitivity: "none_runtime_only",
        exportSensitivityLabel: "No export sensitivity",
        exportAudienceBoundary: "wealth_factory_runtime_only",
        exportAudienceBoundaryLabel: "Wealth Factory runtime only",
        exportSanitizationPolicy: "none_runtime_only",
        exportSanitizationPolicyLabel: "No export sanitization",
        exportRedactionBoundary: "runtime_internal_only",
        exportRedactionBoundaryLabel: "Runtime internal only",
        exportSourceDisclosurePolicy: "runtime_only",
        exportSourceDisclosurePolicyLabel: "Runtime only",
        memoryPlacement: "none_runtime_only",
        memoryPlacementLabel: "No tenant memory placement",
        syncStrategy: "none_runtime_only",
        syncStrategyLabel: "No tenant sync strategy",
        exportRequestShape: "none_runtime_only",
        exportRequestShapeLabel: "No export request shape",
        exportConfirmationRequirement: "none_runtime_only",
        exportConfirmationRequirementLabel: "No export confirmation",
        exportRecoveryPath: "runtime_only",
        exportRecoveryPathLabel: "Runtime only",
        promotionActionDescription: "No export action applies. This runtime memory stays inside Wealth Factory orchestration."
      },
      {
        id: "attention_state",
        label: "Attention state",
        count: 1,
        summary: "Current CEO attention stays in runtime truth until the board resolves it explicitly.",
        destination: "wealth_factory_runtime",
        readiness: "live_runtime_only",
        readinessLabel: "Live runtime only",
        role: "runtime_memory",
        roleLabel: "Runtime memory",
        eligibilityRule: "runtime_only",
        eligibilityRuleLabel: "Runtime only",
        sourceSurface: "pending_attention",
        sourceSurfaceLabel: "Pending attention",
        candidateClass: "runtime_operational",
        candidateClassLabel: "Runtime operational",
        durabilityCondition: "runtime_ephemeral",
        durabilityConditionLabel: "Runtime ephemeral",
        ownershipBoundary: "wealth_factory_only",
        ownershipBoundaryLabel: "Wealth Factory only",
        promotionPath: "never_promotes",
        promotionPathLabel: "Never promotes",
        recordTarget: "none_runtime_only",
        recordTargetLabel: "Runtime only",
        promotionBlocker: "not_applicable_runtime_only",
        promotionBlockerLabel: "Not applicable in runtime",
        promotionAuthority: "wealth_factory_runtime_only",
        promotionAuthorityLabel: "Wealth Factory runtime only",
        promotionTrigger: "not_applicable_runtime",
        promotionTriggerLabel: "No promotion trigger",
        promotionState: "runtime_only",
        promotionStateLabel: "Runtime only",
        promotionNextStep: "none_runtime_only",
        promotionNextStepLabel: "No promotion step",
        promotionActionFamily: "none_runtime_only",
        promotionActionFamilyLabel: "No promotion action",
        assemblyShape: "none_runtime_only",
        assemblyShapeLabel: "No export assembly",
        promotionPhase: "not_exported_runtime",
        promotionPhaseLabel: "No export phase",
        promotionMutability: "runtime_mutable",
        promotionMutabilityLabel: "Runtime mutable",
        promotionScope: "none_runtime_only",
        promotionScopeLabel: "No promotion scope",
        identityStability: "runtime_transient_identity",
        identityStabilityLabel: "Runtime transient identity",
        auditBacking: "runtime_state_only",
        auditBackingLabel: "Runtime-state-backed",
        concurrencyBoundary: "runtime_only",
        concurrencyBoundaryLabel: "Runtime only",
        exportPayloadShape: "none_runtime_only",
        exportPayloadShapeLabel: "No export payload",
        idempotencyPolicy: "not_applicable_runtime",
        idempotencyPolicyLabel: "No idempotency policy",
        replaySafety: "runtime_only",
        replaySafetyLabel: "Runtime only",
        conflictPolicy: "runtime_only",
        conflictPolicyLabel: "Runtime only",
        exportAtomicity: "none_runtime_only",
        exportAtomicityLabel: "No export atomicity",
        exportDerivationBasis: "none_runtime_only",
        exportDerivationBasisLabel: "No export derivation",
        exportRevisionPolicy: "none_runtime_only",
        exportRevisionPolicyLabel: "No export revision policy",
        exportFreshnessSource: "none_runtime_only",
        exportFreshnessSourceLabel: "No export freshness source",
        exportValidationBoundary: "none_runtime_only",
        exportValidationBoundaryLabel: "No export validation",
        exportCompletenessRule: "none_runtime_only",
        exportCompletenessRuleLabel: "No export completeness rule",
        exportSensitivity: "none_runtime_only",
        exportSensitivityLabel: "No export sensitivity",
        exportAudienceBoundary: "wealth_factory_runtime_only",
        exportAudienceBoundaryLabel: "Wealth Factory runtime only",
        exportSanitizationPolicy: "none_runtime_only",
        exportSanitizationPolicyLabel: "No export sanitization",
        exportRedactionBoundary: "runtime_internal_only",
        exportRedactionBoundaryLabel: "Runtime internal only",
        exportSourceDisclosurePolicy: "runtime_only",
        exportSourceDisclosurePolicyLabel: "Runtime only",
        memoryPlacement: "none_runtime_only",
        memoryPlacementLabel: "No tenant memory placement",
        syncStrategy: "none_runtime_only",
        syncStrategyLabel: "No tenant sync strategy",
        exportRequestShape: "none_runtime_only",
        exportRequestShapeLabel: "No export request shape",
        exportConfirmationRequirement: "none_runtime_only",
        exportConfirmationRequirementLabel: "No export confirmation",
        exportRecoveryPath: "runtime_only",
        exportRecoveryPathLabel: "Runtime only",
        promotionActionDescription: "No export action applies. This runtime attention state stays inside Wealth Factory orchestration."
      }
    ],
    exportReadyItems: [
      {
        id: "governance_decisions",
        label: "Governance decisions",
        count: 1,
        summary: "Bounded decisions are ready for later tenant-owned board records.",
        destination: "tenant_record_candidate",
        readiness: "ready_now",
        readinessLabel: "Ready now",
        role: "governance_record_candidate",
        roleLabel: "Governance record candidate",
        eligibilityRule: "explicit_export_later",
        eligibilityRuleLabel: "Explicit export later",
        sourceSurface: "recent_decisions",
        sourceSurfaceLabel: "Recent decisions",
        candidateClass: "governance_history",
        candidateClassLabel: "Governance history",
        durabilityCondition: "stable_when_recorded",
        durabilityConditionLabel: "Stable when recorded",
        ownershipBoundary: "tenant_owned_later",
        ownershipBoundaryLabel: "Tenant-owned later",
        promotionPath: "ready_for_explicit_export",
        promotionPathLabel: "Ready for explicit export",
        recordTarget: "governance_history_record",
        recordTargetLabel: "Governance history record",
        promotionBlocker: "none_ready_now",
        promotionBlockerLabel: "No blocker",
        promotionAuthority: "tenant_explicit_export",
        promotionAuthorityLabel: "Tenant explicit export",
        promotionTrigger: "tenant_export_request",
        promotionTriggerLabel: "Tenant export request",
        promotionState: "ready_for_tenant_export",
        promotionStateLabel: "Ready for tenant export",
        promotionNextStep: "tenant_export_available",
        promotionNextStepLabel: "Tenant export available",
        promotionActionFamily: "tenant_export_candidate",
        promotionActionFamilyLabel: "Tenant export family",
        assemblyShape: "standalone_export_record",
        assemblyShapeLabel: "Standalone export record",
        promotionPhase: "phase_one_governance_history",
        promotionPhaseLabel: "Phase-one export",
        promotionMutability: "append_only_history",
        promotionMutabilityLabel: "Append-only history",
        promotionScope: "single_record_export",
        promotionScopeLabel: "Single-record export",
        identityStability: "stable_record_identity",
        identityStabilityLabel: "Stable record identity",
        auditBacking: "decision_ledger_backed",
        auditBackingLabel: "Decision-ledger-backed",
        concurrencyBoundary: "independent_export_safe",
        concurrencyBoundaryLabel: "Independent export safe",
        exportPayloadShape: "governance_history_record",
        exportPayloadShapeLabel: "Governance history record",
        idempotencyPolicy: "deterministic_upsert",
        idempotencyPolicyLabel: "Deterministic upsert",
        replaySafety: "replay_safe",
        replaySafetyLabel: "Replay-safe",
        conflictPolicy: "append_or_upsert",
        conflictPolicyLabel: "Append or upsert",
        exportAtomicity: "record_level_atomic",
        exportAtomicityLabel: "Record-level atomic",
        exportDerivationBasis: "decision_history_derived",
        exportDerivationBasisLabel: "Decision-history-derived",
        exportRevisionPolicy: "append_new_revision",
        exportRevisionPolicyLabel: "Append new revision",
        exportFreshnessSource: "latest_record_state",
        exportFreshnessSourceLabel: "Latest record state",
        exportValidationBoundary: "record_level_validation",
        exportValidationBoundaryLabel: "Record-level validation",
        exportCompletenessRule: "self_contained_record",
        exportCompletenessRuleLabel: "Self-contained record",
        exportSensitivity: "tenant_business_context",
        exportSensitivityLabel: "Tenant business context",
        exportAudienceBoundary: "tenant_governance_history_readers",
        exportAudienceBoundaryLabel: "Tenant governance-history readers",
        exportSanitizationPolicy: "export_as_recorded",
        exportSanitizationPolicyLabel: "Export as recorded",
        exportRedactionBoundary: "governance_safe_redaction",
        exportRedactionBoundaryLabel: "Governance-safe redaction",
        exportSourceDisclosurePolicy: "decision_summary_only",
        exportSourceDisclosurePolicyLabel: "Decision summary only",
        memoryPlacement: "governance_history_note",
        memoryPlacementLabel: "Governance history note",
        syncStrategy: "append_history_entry",
        syncStrategyLabel: "Append history entry",
        exportRequestShape: "single_record_export_request",
        exportRequestShapeLabel: "Single-record export request",
        exportConfirmationRequirement: "tenant_export_confirmation",
        exportConfirmationRequirementLabel: "Tenant export confirmation",
        exportRecoveryPath: "retry_latest_record_export",
        exportRecoveryPathLabel: "Retry latest record export",
        promotionActionDescription: "This governance history is ready to sit behind a later bounded tenant export action."
      },
      {
        id: "implemented_actions",
        label: "Implemented actions",
        count: 1,
        summary: "Implemented governance actions are ready for suggested-versus-implemented history export.",
        destination: "tenant_record_candidate",
        readiness: "ready_now",
        readinessLabel: "Ready now",
        role: "governance_record_candidate",
        roleLabel: "Governance record candidate",
        eligibilityRule: "explicit_export_later",
        eligibilityRuleLabel: "Explicit export later",
        sourceSurface: "follow_through",
        sourceSurfaceLabel: "Follow-through history",
        candidateClass: "governance_history",
        candidateClassLabel: "Governance history",
        durabilityCondition: "stable_when_recorded",
        durabilityConditionLabel: "Stable when recorded",
        ownershipBoundary: "tenant_owned_later",
        ownershipBoundaryLabel: "Tenant-owned later",
        promotionPath: "ready_for_explicit_export",
        promotionPathLabel: "Ready for explicit export",
        recordTarget: "governance_history_record",
        recordTargetLabel: "Governance history record",
        promotionBlocker: "none_ready_now",
        promotionBlockerLabel: "No blocker",
        promotionAuthority: "tenant_explicit_export",
        promotionAuthorityLabel: "Tenant explicit export",
        promotionTrigger: "tenant_export_request",
        promotionTriggerLabel: "Tenant export request",
        promotionState: "ready_for_tenant_export",
        promotionStateLabel: "Ready for tenant export",
        promotionNextStep: "tenant_export_available",
        promotionNextStepLabel: "Tenant export available",
        promotionActionFamily: "tenant_export_candidate",
        promotionActionFamilyLabel: "Tenant export family",
        assemblyShape: "standalone_export_record",
        assemblyShapeLabel: "Standalone export record",
        promotionPhase: "phase_one_governance_history",
        promotionPhaseLabel: "Phase-one export",
        promotionMutability: "append_only_history",
        promotionMutabilityLabel: "Append-only history",
        promotionScope: "single_record_export",
        promotionScopeLabel: "Single-record export",
        identityStability: "stable_record_identity",
        identityStabilityLabel: "Stable record identity",
        auditBacking: "decision_ledger_backed",
        auditBackingLabel: "Decision-ledger-backed",
        concurrencyBoundary: "independent_export_safe",
        concurrencyBoundaryLabel: "Independent export safe",
        exportPayloadShape: "governance_history_record",
        exportPayloadShapeLabel: "Governance history record",
        idempotencyPolicy: "deterministic_upsert",
        idempotencyPolicyLabel: "Deterministic upsert",
        replaySafety: "replay_safe",
        replaySafetyLabel: "Replay-safe",
        conflictPolicy: "append_or_upsert",
        conflictPolicyLabel: "Append or upsert",
        exportAtomicity: "record_level_atomic",
        exportAtomicityLabel: "Record-level atomic",
        exportDerivationBasis: "decision_history_derived",
        exportDerivationBasisLabel: "Decision-history-derived",
        exportRevisionPolicy: "append_new_revision",
        exportRevisionPolicyLabel: "Append new revision",
        exportFreshnessSource: "latest_record_state",
        exportFreshnessSourceLabel: "Latest record state",
        exportValidationBoundary: "record_level_validation",
        exportValidationBoundaryLabel: "Record-level validation",
        exportCompletenessRule: "self_contained_record",
        exportCompletenessRuleLabel: "Self-contained record",
        exportSensitivity: "tenant_business_context",
        exportSensitivityLabel: "Tenant business context",
        exportAudienceBoundary: "tenant_governance_history_readers",
        exportAudienceBoundaryLabel: "Tenant governance-history readers",
        exportSanitizationPolicy: "export_as_recorded",
        exportSanitizationPolicyLabel: "Export as recorded",
        exportRedactionBoundary: "governance_safe_redaction",
        exportRedactionBoundaryLabel: "Governance-safe redaction",
        exportSourceDisclosurePolicy: "decision_summary_only",
        exportSourceDisclosurePolicyLabel: "Decision summary only",
        memoryPlacement: "governance_history_note",
        memoryPlacementLabel: "Governance history note",
        syncStrategy: "append_history_entry",
        syncStrategyLabel: "Append history entry",
        exportRequestShape: "single_record_export_request",
        exportRequestShapeLabel: "Single-record export request",
        exportConfirmationRequirement: "tenant_export_confirmation",
        exportConfirmationRequirementLabel: "Tenant export confirmation",
        exportRecoveryPath: "retry_latest_record_export",
        exportRecoveryPathLabel: "Retry latest record export",
        promotionActionDescription:
          "This implemented follow-through is ready to sit behind a later bounded tenant export action."
      },
      {
        id: "package_governance",
        label: "Package governance",
        count: 1,
        summary: "Package-shaped governance items are ready for later tenant-owned board records.",
        destination: "tenant_record_candidate",
        readiness: "after_board_closes",
        readinessLabel: "After board closes",
        role: "packaged_record_candidate",
        roleLabel: "Packaged record candidate",
        eligibilityRule: "after_board_closes_then_export",
        eligibilityRuleLabel: "After board closes, then export",
        sourceSurface: "completion_package_governance",
        sourceSurfaceLabel: "Completion package governance",
        candidateClass: "packaged_output",
        candidateClassLabel: "Packaged output",
        durabilityCondition: "stable_after_board_closure",
        durabilityConditionLabel: "Stable after board closure",
        ownershipBoundary: "tenant_owned_later",
        ownershipBoundaryLabel: "Tenant-owned later",
        promotionPath: "after_board_closure_then_export",
        promotionPathLabel: "After board closure, then export",
        recordTarget: "package_governance_record",
        recordTargetLabel: "Package governance record",
        promotionBlocker: "board_closure_required",
        promotionBlockerLabel: "Board closure required",
        promotionAuthority: "board_closure_then_tenant_export",
        promotionAuthorityLabel: "Board closure, then tenant export",
        promotionTrigger: "board_closure",
        promotionTriggerLabel: "Board closure",
        promotionState: "awaiting_board_closure",
        promotionStateLabel: "Awaiting board closure",
        promotionNextStep: "board_closure_then_tenant_export",
        promotionNextStepLabel: "Board closure, then tenant export",
        promotionActionFamily: "board_closure_before_export",
        promotionActionFamilyLabel: "Board closure first",
        assemblyShape: "package_record_set",
        assemblyShapeLabel: "Package record set",
        promotionPhase: "phase_two_package_export",
        promotionPhaseLabel: "Phase-two package export",
        promotionMutability: "replaceable_until_board_closure",
        promotionMutabilityLabel: "Replaceable until board closure",
        promotionScope: "package_record_set_export",
        promotionScopeLabel: "Package record-set export",
        identityStability: "finalized_after_board_closure",
        identityStabilityLabel: "Finalized after board closure",
        auditBacking: "package_closure_backed",
        auditBackingLabel: "Package-closure-backed",
        concurrencyBoundary: "requires_board_closure_snapshot",
        concurrencyBoundaryLabel: "Requires board-closure snapshot",
        exportPayloadShape: "package_snapshot_bundle",
        exportPayloadShapeLabel: "Package snapshot bundle",
        idempotencyPolicy: "board_closure_snapshot_once",
        idempotencyPolicyLabel: "Board-closure snapshot once",
        replaySafety: "requires_fresh_board_closure_snapshot",
        replaySafetyLabel: "Requires fresh board-closure snapshot",
        conflictPolicy: "replace_latest_closure_snapshot",
        conflictPolicyLabel: "Replace latest closure snapshot",
        exportAtomicity: "closure_bundle_atomic",
        exportAtomicityLabel: "Closure-bundle atomic",
        exportDerivationBasis: "board_closure_snapshot_derived",
        exportDerivationBasisLabel: "Board-closure-snapshot-derived",
        exportRevisionPolicy: "replace_closure_bundle_revision",
        exportRevisionPolicyLabel: "Replace closure-bundle revision",
        exportFreshnessSource: "latest_board_closure_snapshot",
        exportFreshnessSourceLabel: "Latest board-closure snapshot",
        exportValidationBoundary: "closure_bundle_validation",
        exportValidationBoundaryLabel: "Closure-bundle validation",
        exportCompletenessRule: "board_closure_complete_bundle",
        exportCompletenessRuleLabel: "Board-closure-complete bundle",
        exportSensitivity: "tenant_deliverable_context",
        exportSensitivityLabel: "Tenant deliverable context",
        exportAudienceBoundary: "tenant_package_consumers",
        exportAudienceBoundaryLabel: "Tenant package consumers",
        exportSanitizationPolicy: "sanitize_before_package_export",
        exportSanitizationPolicyLabel: "Sanitize before package export",
        exportRedactionBoundary: "package_safe_redaction",
        exportRedactionBoundaryLabel: "Package-safe redaction",
        exportSourceDisclosurePolicy: "closure_snapshot_summary_only",
        exportSourceDisclosurePolicyLabel: "Closure snapshot summary only",
        memoryPlacement: "package_record_folder",
        memoryPlacementLabel: "Package record folder",
        syncStrategy: "replace_package_snapshot_after_board_closure",
        syncStrategyLabel: "Replace package snapshot after board closure",
        exportRequestShape: "package_bundle_export_request",
        exportRequestShapeLabel: "Package-bundle export request",
        exportConfirmationRequirement: "board_closure_then_tenant_export_confirmation",
        exportConfirmationRequirementLabel: "Board closure, then tenant export confirmation",
        exportRecoveryPath: "rerun_after_board_closure_snapshot",
        exportRecoveryPathLabel: "Rerun after board-closure snapshot",
        promotionActionDescription:
          "Board closure still gates this package governance memory before any later tenant export action can apply.",
        nextEligibleSummary: "Board closure is still required before this package-shaped governance memory becomes a durable tenant record candidate."
      },
      {
        id: "package_deliverables",
        label: "Packaged deliverables",
        count: 1,
        summary: "Tenant-facing deliverables are ready to become long-memory business records later.",
        destination: "tenant_record_candidate",
        readiness: "after_board_closes",
        readinessLabel: "After board closes",
        role: "packaged_record_candidate",
        roleLabel: "Packaged record candidate",
        eligibilityRule: "after_board_closes_then_export",
        eligibilityRuleLabel: "After board closes, then export",
        sourceSurface: "completion_package_deliverables",
        sourceSurfaceLabel: "Completion package deliverables",
        candidateClass: "packaged_output",
        candidateClassLabel: "Packaged output",
        durabilityCondition: "stable_after_board_closure",
        durabilityConditionLabel: "Stable after board closure",
        ownershipBoundary: "tenant_owned_later",
        ownershipBoundaryLabel: "Tenant-owned later",
        promotionPath: "after_board_closure_then_export",
        promotionPathLabel: "After board closure, then export",
        recordTarget: "package_deliverable_record",
        recordTargetLabel: "Package deliverable record",
        promotionBlocker: "board_closure_required",
        promotionBlockerLabel: "Board closure required",
        promotionAuthority: "board_closure_then_tenant_export",
        promotionAuthorityLabel: "Board closure, then tenant export",
        promotionTrigger: "board_closure",
        promotionTriggerLabel: "Board closure",
        promotionState: "awaiting_board_closure",
        promotionStateLabel: "Awaiting board closure",
        promotionNextStep: "board_closure_then_tenant_export",
        promotionNextStepLabel: "Board closure, then tenant export",
        promotionActionFamily: "board_closure_before_export",
        promotionActionFamilyLabel: "Board closure first",
        assemblyShape: "package_record_set",
        assemblyShapeLabel: "Package record set",
        promotionPhase: "phase_two_package_export",
        promotionPhaseLabel: "Phase-two package export",
        promotionMutability: "replaceable_until_board_closure",
        promotionMutabilityLabel: "Replaceable until board closure",
        promotionScope: "package_record_set_export",
        promotionScopeLabel: "Package record-set export",
        identityStability: "finalized_after_board_closure",
        identityStabilityLabel: "Finalized after board closure",
        auditBacking: "package_closure_backed",
        auditBackingLabel: "Package-closure-backed",
        concurrencyBoundary: "requires_board_closure_snapshot",
        concurrencyBoundaryLabel: "Requires board-closure snapshot",
        exportPayloadShape: "package_snapshot_bundle",
        exportPayloadShapeLabel: "Package snapshot bundle",
        idempotencyPolicy: "board_closure_snapshot_once",
        idempotencyPolicyLabel: "Board-closure snapshot once",
        replaySafety: "requires_fresh_board_closure_snapshot",
        replaySafetyLabel: "Requires fresh board-closure snapshot",
        conflictPolicy: "replace_latest_closure_snapshot",
        conflictPolicyLabel: "Replace latest closure snapshot",
        exportAtomicity: "closure_bundle_atomic",
        exportAtomicityLabel: "Closure-bundle atomic",
        exportDerivationBasis: "board_closure_snapshot_derived",
        exportDerivationBasisLabel: "Board-closure-snapshot-derived",
        exportRevisionPolicy: "replace_closure_bundle_revision",
        exportRevisionPolicyLabel: "Replace closure-bundle revision",
        exportFreshnessSource: "latest_board_closure_snapshot",
        exportFreshnessSourceLabel: "Latest board-closure snapshot",
        exportValidationBoundary: "closure_bundle_validation",
        exportValidationBoundaryLabel: "Closure-bundle validation",
        exportCompletenessRule: "board_closure_complete_bundle",
        exportCompletenessRuleLabel: "Board-closure-complete bundle",
        exportSensitivity: "tenant_deliverable_context",
        exportSensitivityLabel: "Tenant deliverable context",
        exportAudienceBoundary: "tenant_package_consumers",
        exportAudienceBoundaryLabel: "Tenant package consumers",
        exportSanitizationPolicy: "sanitize_before_package_export",
        exportSanitizationPolicyLabel: "Sanitize before package export",
        exportRedactionBoundary: "package_safe_redaction",
        exportRedactionBoundaryLabel: "Package-safe redaction",
        exportSourceDisclosurePolicy: "closure_snapshot_summary_only",
        exportSourceDisclosurePolicyLabel: "Closure snapshot summary only",
        memoryPlacement: "package_record_folder",
        memoryPlacementLabel: "Package record folder",
        syncStrategy: "replace_package_snapshot_after_board_closure",
        syncStrategyLabel: "Replace package snapshot after board closure",
        exportRequestShape: "package_bundle_export_request",
        exportRequestShapeLabel: "Package-bundle export request",
        exportConfirmationRequirement: "board_closure_then_tenant_export_confirmation",
        exportConfirmationRequirementLabel: "Board closure, then tenant export confirmation",
        exportRecoveryPath: "rerun_after_board_closure_snapshot",
        exportRecoveryPathLabel: "Rerun after board-closure snapshot",
        promotionActionDescription:
          "Board closure still gates this packaged deliverable before any later tenant export action can apply.",
        nextEligibleSummary: "Board closure is still required before this packaged deliverable becomes a durable tenant record candidate."
      }
    ]
  }
};

const resolveAttentionBoardResponse: HarnessBoardResponse = {
  ...boardResponse,
  runId: "run_ui_test_2",
  pendingAttention: {
    kind: "await_lane_resume",
    runState: "waiting",
    statusLabel: "Waiting on lane resume",
    summary: "Resume the pricing lane once the tenant confirms the updated revenue assumption.",
    actionRoute: "resolve-attention",
    actionPath: "/api/harness/runs/run_ui_test_2/resolve-attention",
    actionMethod: "POST",
    actionToken: "test-resolve-token",
    actionLabel: "Resume lane",
    actionDescription: "Resume the waiting lane when the required board input is ready.",
    requestFields: [
      {
        name: "command",
        label: "Resolution command",
        description: "Choose the single bounded command that resolves this attention state.",
        required: true,
        allowedValues: ["resume_lane"]
      },
      {
        name: "resumeSummary",
        label: "Resume summary",
        description: "Optional tenant-safe note describing what changed before execution resumes.",
        required: false
      }
    ],
    actionOptions: [
      {
        value: "resume_lane",
        label: "Resume lane",
        description: "Return the lane to active execution with an optional bounded resume note.",
        emphasis: "primary",
        nextEffectSummary: "The lane returns to active execution and re-enters the worker queue through the existing harness path.",
        exampleRequest: { command: "resume_lane" }
      }
    ],
    recommendedOptionValue: "resume_lane",
    allowedCommands: ["resume_lane"],
    requestedAtLabel: "11:41 AM",
    reasonLabel: "Awaiting tenant confirmation",
    targetCardId: "card-cfo-forecast",
    targetPersona: "CFO",
    targetTitle: "Pressure-test the pricing lane",
    targetSummary: "Resume CFO lane: Pressure-test the pricing lane"
  }
};

const pendingApprovalsAttentionBoardResponse: HarnessBoardResponse = {
  ...boardResponse,
  runId: "run_ui_test_3",
  pendingAttention: {
    kind: "queue_ceo_review",
    runState: "active",
    statusLabel: "CEO approval backlog",
    summary: "Clear the bounded proposal queue before widening the current board cycle.",
    actionRoute: "pending-approvals",
    actionLabel: "Review pending approvals",
    actionDescription: "Open the proposal review queue to clear governance backlog before more work starts.",
    pendingApprovalCount: 1,
    proposedApprovalCount: 1,
    deferredApprovalCount: 0,
    backlogMode: "new_work_waiting",
    requestedAtLabel: "11:52 AM",
    reasonLabel: "Governance backlog",
    targetProposalId: "proposal-research",
    targetStatusLabel: "Pending CEO approval",
    targetPersona: "RESEARCHER",
    targetTitle: "Gather competitor price anchors",
    targetSummary: "Next queue target: RESEARCHER · Gather competitor price anchors"
  }
};

describe("harness board UI", () => {
  it("builds bounded live action payloads from contract fields plus user drafts", () => {
    const attentionOption = boardResponse.pendingAttention?.actionOptions?.find((option) => option.value === "start_fresh_cycle");
    expect(attentionOption).toBeTruthy();

    const payload = buildContractActionPayload({
      fields: boardResponse.pendingAttention?.requestFields,
      option: attentionOption!,
      draftValues: {
        mode: "clean"
      }
    });

    expect(payload).toEqual({
      decision: "start_fresh_cycle",
      mode: "clean"
    });
  });

  it("tracks missing required live fields from the contract instead of guessing", () => {
    const actionState = getContractActionState({
      fields: [
        {
          name: "completionSummary",
          label: "Completion summary",
          description: "Explain the finished board outcome.",
          required: true
        }
      ],
      option: {
        value: "complete_run",
        label: "Complete run",
        description: "Close the current run.",
        exampleRequest: {
          decision: "complete_run"
        }
      },
      draftValues: {}
    });

    expect(actionState.payload).toEqual({
      decision: "complete_run"
    });
    expect(actionState.missingRequiredFields).toEqual(["Completion summary"]);
    expect(actionState.driftedFieldLabels).toEqual([]);
  });

  it("summarizes whether a live action is using defaults or needs input", () => {
    expect(
      summarizeContractActionState({
        visibleFields: [
          {
            name: "mode",
            label: "Fresh-cycle mode",
            description: "Choose the next cycle mode.",
            required: false
          }
        ],
        missingRequiredFields: [],
        driftedFields: [],
        driftedFieldLabels: [],
        activeDraftCount: 0
      })
    ).toEqual({
      tone: "defaults",
      summary: "Ready with contract defaults."
    });

    expect(
      summarizeContractActionState({
        visibleFields: [],
        missingRequiredFields: ["Decision note"],
        driftedFields: [],
        driftedFieldLabels: [],
        activeDraftCount: 0
      })
    ).toEqual({
      tone: "needs_input",
      summary: "Needs input: Decision note"
    });
  });

  it("falls back to current contract defaults and blocks submit when a stored draft value no longer fits allowed values", () => {
    const attentionOption = boardResponse.pendingAttention?.actionOptions?.find((option) => option.value === "start_fresh_cycle");
    expect(attentionOption).toBeTruthy();

    const actionState = getContractActionState({
      fields: boardResponse.pendingAttention?.requestFields,
      option: attentionOption!,
      draftValues: {
        mode: "invalid_mode"
      }
    });

    expect(actionState.payload).toEqual({
      decision: "start_fresh_cycle",
      mode: "reopen_deferred"
    });
    expect(actionState.driftedFieldLabels).toEqual(["Fresh-cycle mode"]);
    expect(actionState.driftedFields).toEqual([
      {
        fieldName: "mode",
        fieldLabel: "Fresh-cycle mode",
        reason: "invalid_allowed_value"
      }
    ]);
    expect(summarizeContractActionState(actionState)).toEqual({
      tone: "drifted",
      summary: "Reset required: Fresh-cycle mode no longer fits the current contract."
    });
    expect(canSubmitContractActionState(actionState)).toBe(false);
  });

  it("prioritizes reset-required drift messaging over missing-input messaging when both are present", () => {
    expect(
      summarizeContractActionState({
        visibleFields: [
          {
            name: "completionSummary",
            label: "Completion summary",
            description: "Explain the finished board outcome.",
            required: true
          }
        ],
        missingRequiredFields: ["Completion summary"],
        driftedFields: [
          {
            fieldName: "mode",
            fieldLabel: "Fresh-cycle mode",
            reason: "invalid_allowed_value"
          }
        ],
        driftedFieldLabels: ["Fresh-cycle mode"],
        activeDraftCount: 0
      })
    ).toEqual({
      tone: "drifted",
      summary: "Reset required: Fresh-cycle mode no longer fits the current contract."
    });
  });

  it("treats hidden stale draft fields as drift that must be reset before submit", () => {
    const approvalOption = boardResponse.pendingApprovals[0]?.actionOptions?.find((option) => option.value === "approve");
    expect(approvalOption).toBeTruthy();
    const actionState = getContractActionState({
      fields: boardResponse.pendingApprovals[0]?.requestFields,
      option: approvalOption!,
      draftValues: {
        decisionNote: "Hold for later"
      }
    });

    expect(summarizeContractActionState(actionState)).toEqual({
      tone: "drifted",
      summary: "Reset required: Decision note no longer fits the current contract."
    });
    expect(actionState.driftedFields).toEqual([
      {
        fieldName: "decisionNote",
        fieldLabel: "Decision note",
        reason: "hidden_for_option"
      }
    ]);
    expect(canSubmitContractActionState(actionState)).toBe(false);
  });

  it("counts only current visible field overrides when summarizing a bounded live action", () => {
    const attentionOption = boardResponse.pendingAttention?.actionOptions?.find((option) => option.value === "start_fresh_cycle");
    expect(attentionOption).toBeTruthy();

    const actionState = getContractActionState({
      fields: boardResponse.pendingAttention?.requestFields,
      option: attentionOption!,
      draftValues: {
        mode: "clean",
        ignoredBlank: "   "
      }
    });

    expect(summarizeContractActionState(actionState)).toEqual({
      tone: "ready",
      summary: "Ready with 1 field override."
    });
    expect(canSubmitContractActionState(actionState)).toBe(true);
  });

  it("describes drifted composer fields by bounded contract reason", () => {
    expect(
      describeContractActionIssue({
        fieldName: "mode",
        fieldLabel: "Fresh-cycle mode",
        reason: "invalid_allowed_value"
      })
    ).toBe("Fresh-cycle mode: the current draft is no longer in the allowed values for this contract field.");
    expect(
      describeContractActionIssue({
        fieldName: "decisionNote",
        fieldLabel: "Decision note",
        reason: "hidden_for_option"
      })
    ).toBe("Decision note: the current draft only applies to a different action option and must be reset before submit.");
    expect(
      describeContractActionIssue({
        fieldName: "legacyField",
        fieldLabel: "Legacy field",
        reason: "removed_from_contract"
      })
    ).toBe("Legacy field: the current draft refers to a field that no longer exists in the live contract.");
  });

  it("maps the current board contract to bounded action keys and request fields", () => {
    const fieldMap = getBoardContractActionFieldMap(boardResponse);

    expect(Array.from(fieldMap.keys())).toEqual([
      "attention:complete_run",
      "attention:start_fresh_cycle",
      "approval:proposal_ui_test_1:approve",
      "approval:proposal_ui_test_1:defer",
      "approval:proposal_ui_test_1:deny"
    ]);
    expect(Array.from(fieldMap.get("attention:start_fresh_cycle") ?? [])).toEqual(["decision", "mode"]);
    expect(Array.from(fieldMap.get("approval:proposal_ui_test_1:defer") ?? [])).toEqual(["decision", "decisionNote"]);
  });

  it("maps the current board contract to bounded action labels and field labels", () => {
    const descriptorMap = getBoardContractActionDescriptorMap(boardResponse);

    expect(descriptorMap.get("attention:start_fresh_cycle")).toEqual({
      label: "Start fresh cycle",
      fieldLabels: new Map([
        ["decision", "Review decision"],
        ["mode", "Fresh-cycle mode"]
      ])
    });
    expect(descriptorMap.get("approval:proposal_ui_test_1:approve")).toEqual({
      label: "Approve proposal",
      fieldLabels: new Map([
        ["decision", "Proposal decision"],
        ["decisionNote", "Decision note"]
      ])
    });
  });

  it("prunes stale action drafts when the refreshed board contract removes an action or field entirely", () => {
    const prunedDrafts = pruneActionDraftsForBoard(boardResponse, {
      "attention:start_fresh_cycle": {
        decision: "start_fresh_cycle",
        mode: "clean",
        legacyField: "remove me"
      },
      "approval:proposal_ui_test_1:approve": {
        decision: "approve",
        decisionNote: "keep as drift until reset"
      },
      "approval:proposal_old:approve": {
        decision: "approve"
      }
    });

    expect(prunedDrafts).toEqual({
      "attention:start_fresh_cycle": {
        decision: "start_fresh_cycle",
        mode: "clean"
      },
      "approval:proposal_ui_test_1:approve": {
        decision: "approve",
        decisionNote: "keep as drift until reset"
      }
    });
  });

  it("prunes stale open composers when the refreshed board contract removes an action", () => {
    const nextOpenKeys = pruneOpenActionComposerKeysForBoard(boardResponse, {
      "attention:start_fresh_cycle": true,
      "approval:proposal_ui_test_1:approve": true,
      "approval:proposal_old:approve": true
    });

    expect(nextOpenKeys).toEqual({
      "attention:start_fresh_cycle": true,
      "approval:proposal_ui_test_1:approve": true
    });
  });

  it("inspects bounded contract refresh impact before pruning local composer state", () => {
    const refreshedBoard: HarnessBoardResponse = {
      ...boardResponse,
      pendingApprovals: [],
      pendingAttention: {
        ...boardResponse.pendingAttention!,
        requestFields: (boardResponse.pendingAttention?.requestFields ?? []).filter((field) => field.name !== "mode")
      }
    };

    const impact = inspectBoardContractRefreshImpact(
      refreshedBoard,
      {
        "attention:start_fresh_cycle": {
          decision: "start_fresh_cycle",
          mode: "clean"
        },
        "approval:proposal_ui_test_1:approve": {
          decision: "approve"
        }
      },
      {
        "attention:start_fresh_cycle": true,
        "approval:proposal_ui_test_1:approve": true
      },
      boardResponse
    );

    expect(impact).toEqual({
      removedActionDrafts: [
        {
          actionKey: "approval:proposal_ui_test_1:approve",
          actionLabel: "Approve proposal"
        }
      ],
      removedFieldOverrideDetails: [
        {
          actionKey: "attention:start_fresh_cycle",
          actionLabel: "Start fresh cycle",
          fieldLabels: ["Fresh-cycle mode"]
        }
      ],
      removedFieldOverrideCount: 1,
      closedComposerActions: [
        {
          actionKey: "approval:proposal_ui_test_1:approve",
          actionLabel: "Approve proposal"
        }
      ]
    });
    expect(describeBoardContractRefreshImpact(impact)).toEqual({
      title: "Contract refresh",
      message: "Live board contract refreshed: 1 stale action draft removed, 1 field override pruned, 1 stale composer closed.",
      affectedActions: ["Approve proposal", "Start fresh cycle"],
      impactCounts: {
        removedActionDrafts: 1,
        removedFieldOverrides: 1,
        closedComposers: 1
      },
      recoveryTitle: "Next safe step",
      recoverySteps: [
        "Review the current live board actions before reopening any removed composer or retrying an older action path.",
        "Reset the affected action composer to the current contract defaults before trying to submit that action again.",
        "Reopen only the still-needed composers from the current live board instead of assuming the earlier draft is still valid."
      ],
      details: [
        "Removed stale drafts for: Approve proposal.",
        "Pruned removed fields from: Start fresh cycle (Fresh-cycle mode).",
        "Closed stale composers for: Approve proposal."
      ]
    });
  });

  it("returns no refresh notice when a bounded contract reload leaves local composer state intact", () => {
    expect(
      describeBoardContractRefreshImpact(
        inspectBoardContractRefreshImpact(
          boardResponse,
          {
            "attention:start_fresh_cycle": {
              decision: "start_fresh_cycle",
              mode: "clean"
            }
          },
          {
            "attention:start_fresh_cycle": true
          }
        )
      )
    ).toBeNull();
  });

  it("describes bounded action support states without collapsing drift, stale, and unavailable paths", () => {
    expect(describeActionAttemptSupport("replay_safe", "Approve proposal")).toEqual({
      label: "Replay-safe action",
      summary: "Approve proposal is still exposed by the current board contract, and the last payload still fits that bounded request shape."
    });
    expect(describeActionAttemptSupport("reset_only", "Start fresh cycle")).toEqual({
      label: "Payload drifted",
      summary: "Start fresh cycle is still exposed by the current board contract, but the last payload for start fresh cycle no longer fits the current request rules."
    });
    expect(describeActionAttemptSupport("missing", "Approve proposal")).toEqual({
      label: "Action removed",
      summary: "Approve proposal is no longer exposed by the current board contract, so replay would push stale operator intent."
    });
    expect(describeActionAttemptSupport("unavailable", "Approve proposal")).toEqual({
      label: "Board unavailable",
      summary: "The live board contract is not currently available, so approve proposal cannot be classified as replay-safe or stale yet."
    });
  });

  it("renders clean persona cards without backend execution noise", () => {
    const markup = renderToStaticMarkup(
      <HarnessBoard
        activeCardId="card-ceo-plan"
        cards={cards}
        columns={columns}
        onCardOpen={() => undefined}
      />
    );

    expect(markup).toContain("CEO");
    expect(markup).toContain("Shape the launch plan");
    expect(markup).toContain("Margin review");
    expect(markup).not.toContain("tool");
    expect(markup).not.toContain("prompt");
    expect(markup).not.toContain("token");
  });

  it("renders bounded governance-history delivery replay actions from the board contract", () => {
    const exportCandidates = [
      {
        id: "governance_history_export",
        label: "Governance history export",
        itemCount: 2,
        itemIds: ["governance_decisions", "implemented_actions"],
        itemLabels: ["Governance decisions", "Implemented follow-through"],
        summary: "Governance history is ready for bounded tenant export later.",
        readiness: "ready_now",
        readinessLabel: "Ready now",
        latestDelivery: {
          status: "delivery_failed" as const,
          statusLabel: "Delivery failed",
          summary: "The last governance history delivery attempt failed inside the bounded tenant-safe writer seam.",
          attemptCount: 2,
          contractFreshness: "current_bundle" as const,
          contractFreshnessLabel: "Current bundle",
          contractFreshnessSummary: "The latest stored delivery bundle still matches the current export contract.",
          lastAttemptedAtLabel: "May 29, 2026 01:00",
          writerKindLabel: "Obsidian filesystem writer",
          primaryNotePath:
            "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
          lastErrorCode: "writer_failed",
          lastErrorMessage: "Disk was temporarily unavailable."
        },
        exportActions: [
          {
            actionRoute: "export-preflight" as const,
            actionPath: "/api/harness/runs/run_ui_test_1/export-candidates/governance_history_export/preflight",
            actionMethod: "POST" as const,
            actionToken: "preview-governance-history-export-preflight",
            actionLabel: "Run export preflight",
            actionDescription: "Validate the current export candidate against the live board contract before any dry-run or tenant-facing export bundle is produced."
          },
          {
            actionRoute: "governance-history-export-replay" as const,
            actionPath: "/api/harness/runs/run_ui_test_1/export-candidates/governance_history_export/delivery-replay",
            actionMethod: "POST" as const,
            actionToken: "preview-governance-history-export-replay",
            actionLabel: "Replay governance history delivery",
            actionDescription: "Re-dispatch the persisted tenant-safe governance-history bundle through the bounded private writer seam.",
            nextEffectSummary: "This reuses the stored export-ready bundle instead of rebuilding a new tenant package."
          }
        ]
      }
    ] as NonNullable<HarnessBoardResponse["memoryBoundary"]["exportCandidates"]>;

    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={{
          ...boardResponse,
          memoryBoundary: {
            ...boardResponse.memoryBoundary,
            exportCandidates: exportCandidates ?? []
          }
        }}
        initialControlMode="live"
      />
    );

    expect(markup).toContain("Replay governance history delivery");
    expect(markup).toContain("Action family: governance history export replay");
    expect(markup).toContain("Delivery freshness: Current bundle");
    expect(markup).toContain("Last delivery error: Disk was temporarily unavailable.");
    expect(markup).toContain("/api/harness/runs/run_ui_test_1/export-candidates/governance_history_export/delivery-replay");
  });

  it("renders bounded package-bundle delivery replay actions from the board contract", () => {
    const exportCandidates = [
      {
        id: "package_bundle_export",
        label: "Package bundle export",
        itemCount: 2,
        itemIds: ["package_governance", "package_deliverables"],
        itemLabels: ["Package governance", "Packaged deliverables"],
        summary: "Package bundle export is ready for bounded tenant delivery.",
        readiness: "ready_now",
        readinessLabel: "Ready now",
        latestDelivery: {
          status: "delivery_failed" as const,
          statusLabel: "Delivery failed",
          summary: "The last package bundle delivery attempt failed inside the bounded tenant-safe writer seam.",
          attemptCount: 1,
          contractFreshness: "current_bundle" as const,
          contractFreshnessLabel: "Current bundle",
          contractFreshnessSummary: "The latest stored delivery bundle still matches the current export contract.",
          lastAttemptedAtLabel: "May 30, 2026 01:00",
          writerKindLabel: "Obsidian filesystem writer",
          primaryNotePath:
            "wealth-factory/package-bundles/wf_connect_first_workflow/wf_connect_first_workflow-package-bundle.md",
          lastErrorCode: "writer_failed",
          lastErrorMessage: "Disk was temporarily unavailable."
        },
        exportActions: [
          {
            actionRoute: "package-bundle-export-replay" as const,
            actionPath: "/api/harness/runs/run_ui_test_1/export-candidates/package_bundle_export/delivery-replay",
            actionMethod: "POST" as const,
            actionToken: "preview-package-bundle-export-replay",
            actionLabel: "Replay package bundle delivery",
            actionDescription: "Re-dispatch the persisted tenant-safe package bundle through the bounded private writer seam.",
            nextEffectSummary: "This reuses the stored package bundle instead of rebuilding a new tenant package."
          }
        ]
      }
    ] as NonNullable<HarnessBoardResponse["memoryBoundary"]["exportCandidates"]>;

    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={{
          ...boardResponse,
          memoryBoundary: {
            ...boardResponse.memoryBoundary,
            exportCandidates
          }
        }}
        initialControlMode="live"
      />
    );

    expect(markup).toContain("Replay package bundle delivery");
    expect(markup).toContain("Action family: package bundle export replay");
    expect(markup).toContain("/api/harness/runs/run_ui_test_1/export-candidates/package_bundle_export/delivery-replay");
  });

  it("does not render delivery replay controls while a governance-history export is already in progress", () => {
    const exportCandidates = [
      {
        id: "governance_history_export",
        label: "Governance history export",
        itemCount: 2,
        itemIds: ["governance_decisions", "implemented_actions"],
        itemLabels: ["Governance decisions", "Implemented follow-through"],
        summary: "Governance history is ready for bounded tenant export later.",
        readiness: "ready_now",
        readinessLabel: "Ready now",
        latestDelivery: {
          status: "delivery_in_progress" as const,
          statusLabel: "Delivery in progress",
          summary: "The latest tenant-safe export bundle is currently being delivered through the bounded private writer seam.",
          attemptCount: 2,
          contractFreshness: "current_bundle" as const,
          contractFreshnessLabel: "Current bundle",
          contractFreshnessSummary: "The latest stored delivery bundle still matches the current export contract.",
          lastAttemptedAtLabel: "Jun 1, 2026 00:05",
          writerKindLabel: "Obsidian filesystem"
        },
        exportActions: [
          {
            actionRoute: "export-preflight" as const,
            actionPath: "/api/harness/runs/run_ui_test_1/export-candidates/governance_history_export/preflight",
            actionMethod: "POST" as const,
            actionToken: "preview-governance-history-export-preflight",
            actionLabel: "Run export preflight",
            actionDescription: "Validate the current export candidate against the live board contract before any dry-run or tenant-facing export bundle is produced."
          }
        ]
      }
    ] as NonNullable<HarnessBoardResponse["memoryBoundary"]["exportCandidates"]>;

    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={{
          ...boardResponse,
          memoryBoundary: {
            ...boardResponse.memoryBoundary,
            exportCandidates
          }
        }}
        initialControlMode="live"
      />
    );

    expect(markup).toContain("Delivery in progress");
    expect(markup).not.toContain("Replay governance history delivery");
    expect(markup).not.toContain("Build governance history export");
  });

  it("renders a simple drawer with only high-level details", () => {
    const markup = renderToStaticMarkup(
      <HarnessCardDrawer card={cards[0]!} open onClose={() => undefined} />
    );

    expect(markup).toContain("Card details");
    expect(markup).toContain("High-level planning notes stay visible");
    expect(markup).toContain("Continuity memory");
    expect(markup).toContain("Source: Resume override");
    expect(markup).toContain("Latest outcome memory: Keep the launch brief tight.");
    expect(markup).not.toContain("skill");
    expect(markup).not.toContain("trace");
  });

  it("renders the Hermes-style board page with persona overview metrics", () => {
    const markup = renderToStaticMarkup(<HarnessBoardPage />);

    expect(markup).toContain("Harness board");
    expect(markup).toContain("Persona workload");
    expect(markup).toContain("CEO approvals");
    expect(markup).toContain("Control mode");
    expect(markup).toContain("Live");
    expect(markup).not.toContain("Preview mode");
    expect(markup).not.toContain("localhost fallback data");
    expect(markup).not.toContain("raw execution log");
    expect(markup).not.toContain("harness-browser-fallback");
  });

  it("renders bounded attention and approval action guidance from the board contract", () => {
    const markup = renderToStaticMarkup(
      <HarnessBoardPage initialBoard={boardResponse} initialControlMode="live" />
    );

    expect(markup).toContain("Review final assembly");
    expect(markup).toContain("Complete run");
    expect(markup).toContain("Primary");
    expect(markup).toContain("Secondary");
    expect(markup).toContain("Caution");
    expect(markup).toContain("Controls - Live");
    expect(markup).toContain("Control mode");
    expect(markup).toContain("Live");
    expect(markup).toContain("Board actions are bound to live harness mutations through the engine contract.");
    expect(markup).toContain("Start a new board cycle from this run?");
    expect(markup).toContain("Review proposal decision");
    expect(markup).toContain("Approve proposal");
    expect(markup).toContain("Defer proposal");
    expect(markup).toContain("Deny this proposal and close the follow-on request?");
    expect(markup).toContain("Approve proposal (recommended)");
    expect(markup).toContain("Complete run (recommended)");
    expect(markup).toContain("Recommended next action");
    expect(markup).toContain("POST /api/harness/runs/run_ui_test_1/review-attention");
    expect(markup).toContain("POST /api/harness/proposals/proposal_ui_test_1/decision");
    expect(markup).toContain("Action family: review attention");
    expect(markup).toContain("Action family: proposal decision");
    expect(markup).toContain("Allowed decisions: complete_run, start_fresh_cycle");
    expect(markup).toContain("Allowed decisions: approve, defer, deny");
    expect(markup).toContain("Review decision");
    expect(markup).toContain("Fresh-cycle mode");
    expect(markup).toContain("Proposal decision");
    expect(markup).toContain("Live request fields for Complete run");
    expect(markup).toContain("Open composer for Start fresh cycle");
    expect(markup).toContain("Composer hidden until needed.");
    expect(markup).toContain("Live request fields for Approve proposal");
    expect(markup).toContain("Open composer for Defer proposal");
    expect(markup).toContain("Open composer for Deny proposal");
    expect(markup).toContain("Live payload preview");
    expect(markup).toContain("Ready with contract defaults.");
    expect(markup).toContain("Reset to contract defaults");
    expect(markup).toContain("Reason: Final assembly");
    expect(markup).toContain("Requested: 11:24 AM");
    expect(markup).toContain("Required field");
    expect(markup).toContain("Optional field");
    expect(markup).toContain("Allowed values: complete_run, start_fresh_cycle");
    expect(markup).toContain("Allowed values: reopen_deferred, clean");
    expect(markup).toContain("Supported when decision is start_fresh_cycle.");
    expect(markup).toContain("Suggested value: reopen_deferred");
    expect(markup).toContain("Supported when decision is defer.");
    expect(markup).toContain("Requested by CFO for RESEARCHER");
    expect(markup).toContain("Policy reason: Review for expansion");
    expect(markup).toContain("Next review trigger: Revisit after the CEO closes the current pricing board decisions.");
    expect(markup).toContain("Last decision: 11:11 AM");
    expect(markup).toContain("Board pulse");
    expect(markup).toContain("Attention - CEO review required");
    expect(markup).toContain("Approvals - 1");
    expect(markup).toContain("Export - 2 ready");
    expect(markup).toContain("Package - Assembling");
    expect(markup).toContain("1 deliverable, 1 governance item, 2 recommendations, 1 objection.");
    expect(markup).toContain("2 export candidates are ready now, and 2 still wait for board closure.");
    expect(markup).toContain("2 governance record candidates are ready now, and 2 packaged output candidates still wait on board closure.");
    expect(markup).toContain("2 runtime memory buckets stay Wealth Factory-only, while 4 tenant-record candidate buckets may become tenant-owned later.");
    expect(markup).toContain("2 runtime memory buckets never promote, 2 candidate buckets are ready for explicit export later, and 2 candidate buckets still wait on board closure first.");
    expect(markup).toContain("2 governance history record candidates are ready, while 2 package record candidates stay package-shaped until board closure completes.");
    expect(markup).toContain("Recent decisions");
    expect(markup).toContain("CEO kept the research expansion under bounded review.");
    expect(markup).toContain("1 preserved decision");
    expect(markup).toContain("Decision kind: proposal deferred");
    expect(markup).toContain("Resolution: defer");
    expect(markup).toContain("Recommendation: Hold the research expansion until the pricing package is stable.");
    expect(markup).toContain("Objection: Do not widen the current board cycle yet.");
    expect(markup).toContain("Follow-through");
    expect(markup).toContain("CEO packaged the current pricing outcome for tenant-facing review.");
    expect(markup).toContain("1 implemented action");
    expect(markup).toContain("Action: packaged outcome");
    expect(markup).toContain("Persona: CFO");
    expect(markup).toContain("Deliverable: Margin review");
    expect(markup).toContain("Policy reason: New lane approved");
    expect(markup).toContain("Resolution: Create Lane");
    expect(markup).toContain("Recommendation: Carry the pricing readout into the tenant-facing package.");
    expect(markup).toContain("Objection: Do not widen the board cycle until the pricing package is finalized.");
    expect(markup).toContain("Completion package");
    expect(markup).toContain("Memory boundary");
    expect(markup).toContain("Wealth Factory runtime keeps bounded operational lane memory live");
    expect(markup).toContain("Lane continuity");
    expect(markup).toContain("Attention state");
    expect(markup).toContain("Governance decisions");
    expect(markup).toContain("Implemented actions");
    expect(markup).toContain("Package governance");
    expect(markup).toContain("Packaged deliverables");
    expect(markup).toContain("Stays in runtime");
    expect(markup).toContain("Ready for export later");
    expect(markup).toContain("Live runtime only");
    expect(markup).toContain("Ready now");
    expect(markup).toContain("After board closes");
    expect(markup).toContain("Runtime partition");
    expect(markup).toContain("Governance history candidates");
    expect(markup).toContain("Packaged output candidates");
    expect(markup).toContain("Export candidate groups");
    expect(markup).toContain("Governance history export");
    expect(markup).toContain("Package bundle export");
    expect(markup).toContain("Available export actions");
    expect(markup).toContain("Run export preflight");
    expect(markup).toContain("Preview Obsidian export bundle");
    expect(markup).toContain("Build governance history export");
    expect(markup).toContain("POST /api/harness/runs/run_ui_test_1/export-candidates/governance_history_export/preflight");
    expect(markup).toContain("POST /api/harness/runs/run_ui_test_1/export-candidates/governance_history_export/dry-run");
    expect(markup).toContain("POST /api/harness/runs/run_ui_test_1/export-candidates/governance_history_export/export");
    expect(markup).toContain("Foundational export sequence");
    expect(markup).toContain("Board-closure-following sequence");
    expect(markup).toContain("Independent export candidate");
    expect(markup).toContain("Depends on governance history export");
    expect(markup).toContain("Deterministic upsert");
    expect(markup).toContain("Board-closure snapshot once");
    expect(markup).toContain("Replay-safe");
    expect(markup).toContain("Requires fresh board-closure snapshot");
    expect(markup).toContain("Append or upsert");
    expect(markup).toContain("Replace latest closure snapshot");
    expect(markup).toContain("Record-level atomic");
    expect(markup).toContain("Closure-bundle atomic");
    expect(markup).toContain("Decision-history-derived");
    expect(markup).toContain("Board-closure-snapshot-derived");
    expect(markup).toContain("Append new revision");
    expect(markup).toContain("Replace closure-bundle revision");
    expect(markup).toContain("Latest record state");
    expect(markup).toContain("Latest board-closure snapshot");
    expect(markup).toContain("Record-level validation");
    expect(markup).toContain("Closure-bundle validation");
    expect(markup).toContain("Self-contained record");
    expect(markup).toContain("Board-closure-complete bundle");
    expect(markup).toContain("Tenant business context");
    expect(markup).toContain("Tenant deliverable context");
    expect(markup).toContain("Tenant governance-history readers");
    expect(markup).toContain("Tenant package consumers");
    expect(markup).toContain("Export as recorded");
    expect(markup).toContain("Sanitize before package export");
    expect(markup).toContain("Governance-safe redaction");
    expect(markup).toContain("Package-safe redaction");
    expect(markup).toContain("Decision summary only");
    expect(markup).toContain("Closure snapshot summary only");
    expect(markup).toContain("Governance history");
    expect(markup).toContain("Packaged output");
    expect(markup).toContain("Stable when recorded");
    expect(markup).toContain("Stable after board closure");
    expect(markup).toContain("Tenant-owned later");
    expect(markup).toContain("Governance history record");
    expect(markup).toContain("Package bundle export records");
    expect(markup).toContain("Tenant explicit export");
    expect(markup).toContain("Board closure, then tenant export");
    expect(markup).toContain("Tenant export request");
    expect(markup).toContain("Board closure");
    expect(markup).toContain("Depends on: Governance history export");
    expect(markup).toContain("2 runtime memory buckets stay live only inside Wealth Factory orchestration.");
    expect(markup).toContain("2 governance history candidates are stable enough for later tenant-owned export.");
    expect(markup).toContain("2 packaged output candidates still wait on board closure before later export.");
    expect(markup).toContain("Runtime memory");
    expect(markup).toContain("Governance record candidate");
    expect(markup).toContain("Packaged record candidate");
    expect(markup).toContain("Runtime only");
    expect(markup).toContain("Explicit export later");
    expect(markup).toContain("After board closes, then export");
    expect(markup).toContain("Runtime operational");
    expect(markup).toContain("Governance history");
    expect(markup).toContain("Packaged output");
    expect(markup).toContain("Runtime ephemeral");
    expect(markup).toContain("Stable when recorded");
    expect(markup).toContain("Stable after board closure");
    expect(markup).toContain("Wealth Factory only");
    expect(markup).toContain("Tenant-owned later");
    expect(markup).toContain("Never promotes");
    expect(markup).toContain("Ready for explicit export");
    expect(markup).toContain("After board closure, then export");
    expect(markup).toContain("Append-only history");
    expect(markup).toContain("Replaceable until board closure");
    expect(markup).toContain("Single-record export");
    expect(markup).toContain("Package record-set export");
    expect(markup).toContain("Stable record identity");
    expect(markup).toContain("Finalized after board closure");
    expect(markup).toContain("Decision-ledger-backed");
    expect(markup).toContain("Package-closure-backed");
    expect(markup).toContain("Independent export safe");
    expect(markup).toContain("Requires board-closure snapshot");
    expect(markup).toContain("concurrency-safe for later independent export");
    expect(markup).toContain("1 export candidate group carries tenant business context, and 1 group still carries tenant deliverable context.");
    expect(markup).toContain("1 export candidate group is aimed at tenant governance-history readers, and 1 group still targets tenant package consumers.");
    expect(markup).toContain("1 export candidate group is exported as recorded, and 1 group still requires sanitization before package export.");
    expect(markup).toContain("1 export candidate group uses governance-safe redaction, and 1 group still requires package-safe redaction.");
    expect(markup).toContain("1 export candidate group discloses decision summaries only, and 1 group still discloses closure-snapshot summaries only.");
    expect(markup).toContain("1 export candidate group uses single-record export requests, and 1 group still uses package-bundle export requests.");
    expect(markup).toContain("1 export candidate group requires tenant export confirmation, and 1 group still requires board closure before tenant export confirmation.");
    expect(markup).toContain("1 export candidate group retries the latest record export, and 1 group still reruns after the board-closure snapshot.");
    expect(markup).toContain("1 export candidate group lands as governance history notes, and 1 group still lands in package record folders.");
    expect(markup).toContain("1 export candidate group appends history entries, and 1 group still replaces package snapshots after board closure.");
    expect(markup).toContain("1 export candidate group is ready for tenant export later, and 1 group is still awaiting board closure.");
    expect(markup).toContain("1 export candidate group is ready for a later tenant export step, and 1 group still needs board closure before tenant export becomes the next step.");
    expect(markup).toContain("1 export candidate group sits in the tenant export family, and 1 group remains in the board-closure-first family.");
    expect(markup).toContain("1 export candidate group stays in governance history, and 1 group still stays in packaged output.");
    expect(markup).toContain("1 export candidate group is stable when recorded, and 1 group still stays stable after board closure.");
    expect(markup).toContain("2 export candidate groups remain tenant-owned later.");
    expect(markup).toContain("1 export candidate group becomes governance history records, and 1 group still becomes package bundle export records.");
    expect(markup).toContain("1 export candidate group is tenant-controlled for later explicit export, and 1 group still needs board closure before tenant export owns the next move.");
    expect(markup).toContain("1 export candidate group is eligible for later explicit export, and 1 group still becomes eligible only after board closure.");
    expect(markup).toContain("1 export candidate group comes from recent decisions, and 1 group still comes from the completion package bundle.");
    expect(markup).toContain("1 export candidate group follows the ready-for-explicit-export path, and 1 group still follows the after-board-closure-then-export path.");
    expect(markup).toContain("1 export candidate group has no promotion blocker, and 1 group still needs board closure as the blocker boundary.");
    expect(markup).toContain("1 export candidate group waits on a later tenant export request, and 1 group still waits on board closure first.");
    expect(markup).toContain("1 export candidate group assembles as a standalone export record, and 1 group still assembles as a package record set.");
    expect(markup).toContain("1 export candidate group stays in phase-one governance export, and 1 group still stays in phase-two package export.");
    expect(markup).toContain("1 export candidate group stays append-only history, and 1 group still stays replaceable until board closure.");
    expect(markup).toContain("1 export candidate group keeps a single-record export scope, and 1 group still keeps a package record-set export scope.");
    expect(markup).toContain("1 export candidate group already has stable record identity, and 1 group still finalizes identity after board closure.");
    expect(markup).toContain("1 export candidate group uses governance history record payloads, and 1 group still uses package snapshot bundle payloads.");
    expect(markup).toContain("1 export candidate group uses deterministic upsert, and 1 group still depends on board-closure snapshot-once idempotency.");
    expect(markup).toContain("1 export candidate group is replay-safe, and 1 group still requires a fresh board-closure snapshot before replay.");
    expect(markup).toContain("1 export candidate group uses append-or-upsert conflict handling, and 1 group still replaces the latest board-closure snapshot on conflict.");
    expect(markup).toContain("1 export candidate group commits as record-level atomic exports, and 1 group still depends on closure-bundle atomic export.");
    expect(markup).toContain("1 export candidate group is derived from decision history, and 1 group is derived from the board-closure snapshot.");
    expect(markup).toContain("1 export candidate group appends as new revisions, and 1 group still replaces the current closure-bundle revision.");
    expect(markup).toContain("1 export candidate group uses the latest record state, and 1 group still depends on the latest board-closure snapshot.");
    expect(markup).toContain("1 export candidate group validates at record level, and 1 group still validates at closure-bundle level.");
    expect(markup).toContain("1 export candidate group is a self-contained record, and 1 group still completes as board-closure bundles.");
    expect(markup).toContain("Runtime only");
    expect(markup).toContain("Governance history record");
    expect(markup).toContain("Package governance record");
    expect(markup).toContain("Package deliverable record");
    expect(markup).toContain("2 export candidate buckets are still blocked by board closure. Runtime memory stays non-promotable by design.");
    expect(markup).toContain("2 export candidate buckets are already tenant-controlled for later explicit export, while 2 buckets still need board closure before tenant export can own the next step.");
    expect(markup).toContain("2 export candidate buckets are waiting only on a later tenant export request, while 2 buckets still need board closure before that request can happen.");
    expect(markup).toContain("2 runtime buckets have no promotion step, 2 export candidate buckets are ready for a later tenant export step, and 2 buckets still need board closure before tenant export becomes the next step.");
    expect(markup).toContain("2 runtime buckets expose no promotion action, 2 export candidate buckets sit in the tenant export family, and 2 buckets remain in the board-closure-first family.");
    expect(markup).toContain("2 runtime buckets have no promotion scope, 2 export candidate buckets are ready as single-record exports, and 2 buckets still belong to a package record-set export scope.");
    expect(markup).toContain("2 runtime buckets keep transient runtime identity, 2 buckets already have stable record identity, and 2 buckets still finalize identity at board closure.");
    expect(markup).toContain("2 runtime buckets stay runtime-state-backed, 2 buckets are decision-ledger-backed, and 2 buckets are package-closure-backed.");
    expect(markup).toContain("2 runtime buckets stay runtime-only, 2 export candidate buckets are safe to promote independently, and 2 buckets still need a board-closure snapshot for concurrency-safe promotion.");
    expect(markup).toContain("2 runtime buckets have no export payload shape, 2 export candidate buckets are shaped as governance history records, and 2 buckets still export as package snapshot bundles.");
    expect(markup).toContain("2 runtime buckets have no idempotency policy, 2 export candidate buckets use deterministic upsert, and 2 buckets still depend on a board-closure snapshot-once policy.");
    expect(markup).toContain("2 runtime buckets stay runtime-only, 2 export candidate buckets are replay-safe, and 2 buckets still require a fresh board-closure snapshot before replay.");
    expect(markup).toContain("2 runtime buckets stay outside export conflicts, 2 export candidate buckets use append-or-upsert conflict handling, and 2 buckets still replace the latest board-closure snapshot when promoted.");
    expect(markup).toContain("Not applicable in runtime");
    expect(markup).toContain("No blocker");
    expect(markup).toContain("Board closure required");
    expect(markup).toContain("Wealth Factory runtime only");
    expect(markup).toContain("Tenant explicit export");
    expect(markup).toContain("Board closure, then tenant export");
    expect(markup).toContain("No promotion trigger");
    expect(markup).toContain("Tenant export request");
    expect(markup).toContain("Board closure");
    expect(markup).toContain("No promotion action");
    expect(markup).toContain("Tenant export family");
    expect(markup).toContain("Board closure first");
    expect(markup).toContain("No promotion scope");
    expect(markup).toContain("Single-record export");
    expect(markup).toContain("Package record-set export");
    expect(markup).toContain("Runtime transient identity");
    expect(markup).toContain("Stable record identity");
    expect(markup).toContain("Finalized after board closure");
    expect(markup).toContain("Runtime-state-backed");
    expect(markup).toContain("Decision-ledger-backed");
    expect(markup).toContain("Package-closure-backed");
    expect(markup).toContain("Independent export safe");
    expect(markup).toContain("Requires board-closure snapshot");
    expect(markup).toContain("No export payload");
    expect(markup).toContain("Governance history record");
    expect(markup).toContain("Package snapshot bundle");
    expect(markup).toContain("No idempotency policy");
    expect(markup).toContain("Deterministic upsert");
    expect(markup).toContain("Board-closure snapshot once");
    expect(markup).toContain("Replay-safe");
    expect(markup).toContain("Requires fresh board-closure snapshot");
    expect(markup).toContain("Append or upsert");
    expect(markup).toContain("Replace latest closure snapshot");
    expect(markup).toContain("No export atomicity");
    expect(markup).toContain("Record-level atomic");
    expect(markup).toContain("Closure-bundle atomic");
    expect(markup).toContain("No export derivation");
    expect(markup).toContain("Decision-history-derived");
    expect(markup).toContain("Board-closure-snapshot-derived");
    expect(markup).toContain("No export revision policy");
    expect(markup).toContain("Append new revision");
    expect(markup).toContain("Replace closure-bundle revision");
    expect(markup).toContain("No export freshness source");
    expect(markup).toContain("Latest record state");
    expect(markup).toContain("Latest board-closure snapshot");
    expect(markup).toContain("No export validation");
    expect(markup).toContain("Record-level validation");
    expect(markup).toContain("Closure-bundle validation");
    expect(markup).toContain("No export completeness rule");
    expect(markup).toContain("Self-contained record");
    expect(markup).toContain("Board-closure-complete bundle");
    expect(markup).toContain("No export sensitivity");
    expect(markup).toContain("Tenant business context");
    expect(markup).toContain("Tenant deliverable context");
    expect(markup).toContain("Tenant governance-history readers");
    expect(markup).toContain("Tenant package consumers");
    expect(markup).toContain("No export sanitization");
    expect(markup).toContain("Export as recorded");
    expect(markup).toContain("Sanitize before package export");
    expect(markup).toContain("Runtime internal only");
    expect(markup).toContain("Governance-safe redaction");
    expect(markup).toContain("Package-safe redaction");
    expect(markup).toContain("Decision summary only");
    expect(markup).toContain("Closure snapshot summary only");
    expect(markup).toContain("No tenant memory placement");
    expect(markup).toContain("Governance history note");
    expect(markup).toContain("Package record folder");
    expect(markup).toContain("No tenant sync strategy");
    expect(markup).toContain("Append history entry");
    expect(markup).toContain("Replace package snapshot after board closure");
    expect(markup).toContain("No export request shape");
    expect(markup).toContain("Single-record export request");
    expect(markup).toContain("Package-bundle export request");
    expect(markup).toContain("No export confirmation");
    expect(markup).toContain("Tenant export confirmation");
    expect(markup).toContain("Board closure, then tenant export confirmation");
    expect(markup).toContain("Retry latest record export");
    expect(markup).toContain("Rerun after board-closure snapshot");
    expect(markup).toContain("This governance history is ready to sit behind a later bounded tenant export action.");
    expect(markup).toContain("Board closure still gates this packaged deliverable before any later tenant export action can apply.");
    expect(markup).toContain("Source surface: Continuity snapshots");
    expect(markup).toContain("Source surface: Pending attention");
    expect(markup).toContain("Source surface: Recent decisions");
    expect(markup).toContain("Source surface: Follow-through history");
    expect(markup).toContain("Source surface: Completion package governance");
    expect(markup).toContain("Source surface: Completion package deliverables");
    expect(markup).toContain("Board closure is still required before this package-shaped governance memory becomes a durable tenant record candidate.");
    expect(markup).toContain("Board closure is still required before this packaged deliverable becomes a durable tenant record candidate.");
    expect(markup).toContain("Tenant-facing package state");
    expect(markup).toContain("Keep the pricing package readable while the research expansion stays under review.");
    expect(markup).toContain("Deferred approvals: 1");
    expect(markup).toContain("Governance items: 1");
    expect(markup).toContain("Deliverables: 1");
    expect(markup).toContain("Recommendations: 2");
    expect(markup).toContain("Objections: 1");
    expect(markup).toContain("Open governance items still shape this package.");
    expect(markup).toContain("Recommendations");
    expect(markup).toContain("Objections");
    expect(markup).toContain("Governance items (1)");
    expect(markup).toContain("Deliverables (1)");
    expect(markup).toContain("Approve only after the pricing package is stable.");
    expect(markup).toContain("Revisit after the current pricing package is completed.");
    expect(markup).toContain("Package state");
    expect(markup).toContain("Assembling");
    expect(markup).toContain("1 deliverable");
    expect(markup).toContain("CFO · Pressure-test the pricing lane");
    expect(markup).toContain("&quot;decision&quot;:&quot;complete_run&quot;");
    expect(markup).toContain("&quot;decision&quot;:&quot;approve&quot;");
    expect(markup).toContain("&quot;decision&quot;:&quot;defer&quot;");
    expect(markup).toContain("&quot;decision&quot;:&quot;deny&quot;");
    expect(markup).toContain("&quot;decision&quot;:&quot;start_fresh_cycle&quot;,&quot;mode&quot;:&quot;reopen_deferred&quot;");
    expect(markup).not.toContain("raw execution log");
    expect(markup).not.toContain("tool");
  });

  it("renders bounded resolve-attention guidance directly from the harness contract", () => {
    const markup = renderToStaticMarkup(<HarnessBoardPage initialBoard={resolveAttentionBoardResponse} />);

    expect(markup).toContain("Resume lane");
    expect(markup).toContain("Waiting on lane resume");
    expect(markup).toContain("Resume the pricing lane once the tenant confirms the updated revenue assumption.");
    expect(markup).toContain("POST /api/harness/runs/run_ui_test_2/resolve-attention");
    expect(markup).toContain("Action family: resolve attention");
    expect(markup).toContain("Allowed commands: resume_lane");
    expect(markup).toContain("Resolution command");
    expect(markup).toContain("Resume summary");
    expect(markup).toContain("Resume CFO lane: Pressure-test the pricing lane");
    expect(markup).toContain("Hide composer for Resume lane");
    expect(markup).toContain("Live request fields for Resume lane");
    expect(markup).toContain("&quot;command&quot;:&quot;resume_lane&quot;");
  });

  it("renders bounded composer drift diagnostics when seeded drafts no longer fit the live contract", () => {
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={boardResponse}
        initialControlMode="live"
        initialActionDrafts={{
          "attention:start_fresh_cycle": {
            mode: "invalid_mode"
          },
          "approval:proposal_ui_test_1:approve": {
            decisionNote: "Hold for later"
          }
        }}
      />
    );

    expect(markup).toContain("Reset required: Fresh-cycle mode no longer fits the current contract.");
    expect(markup).toContain("Fresh-cycle mode: the current draft is no longer in the allowed values for this contract field.");
    expect(markup).toContain("Open composer for Start fresh cycle");
    expect(markup).toContain("Reset required: Decision note no longer fits the current contract.");
    expect(markup).toContain("Decision note: the current draft only applies to a different action option and must be reset before submit.");
  });

  it("renders a dismissible contract refresh note when the page is seeded with bounded prune guidance", () => {
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={boardResponse}
        initialControlMode="live"
        initialContractRefreshNotice={{
          title: "Contract refresh",
          message: "Live board contract refreshed: 1 stale action draft removed.",
          details: ["Removed stale drafts for: Approve proposal."],
          affectedActions: ["Approve proposal"],
          impactCounts: {
            removedActionDrafts: 1,
            removedFieldOverrides: 0,
            closedComposers: 0
          },
          recoveryTitle: "Next safe step",
          recoverySteps: [
            "Review the current live board actions before reopening any removed composer or retrying an older action path."
          ]
        }}
      />
    );

    expect(markup).toContain("Contract refresh");
    expect(markup).toContain("Live board contract refreshed: 1 stale action draft removed.");
    expect(markup).toContain("Removed stale drafts for: Approve proposal.");
    expect(markup).toContain("Affected actions: Approve proposal");
    expect(markup).toContain("Impact counts: drafts 1, fields 0, composers 0");
    expect(markup).toContain("Next safe step");
    expect(markup).toContain("Review the current live board actions before reopening any removed composer or retrying an older action path.");
    expect(markup).toContain("Dismiss contract refresh note");
    expect(markup).toContain("Contract refresh - Active");
  });

  it("keeps an active contract-refresh pulse summary visible when refresh guidance is present", () => {
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={boardResponse}
        initialControlMode="live"
        initialContractRefreshNotice={{
          title: "Contract refresh",
          message: "Live board contract refreshed: 1 stale action draft removed.",
          details: ["Removed stale drafts for: Approve proposal."],
          affectedActions: ["Approve proposal"],
          impactCounts: {
            removedActionDrafts: 1,
            removedFieldOverrides: 0,
            closedComposers: 0
          },
          recoveryTitle: "Next safe step",
          recoverySteps: [
            "Review the current live board actions before reopening any removed composer or retrying an older action path."
          ]
        }}
      />
    );

    expect(markup).toContain("Contract refresh - Active");
    expect(markup).toContain("Live board contract refreshed: 1 stale action draft removed.");
    expect(markup).toContain("Affected actions: Approve proposal.");
    expect(markup).toContain("Next safe step: Review the current live board actions before reopening any removed composer or retrying an older action path.");
  });

  it("keeps a prop-seeded preview board read-only when the control mode says preview", () => {
    const markup = renderToStaticMarkup(
      <HarnessBoardPage initialBoard={boardResponse} initialControlMode="preview" />
    );

    expect(markup).toContain("Control mode");
    expect(markup).toContain("Preview");
    expect(markup).toContain("Preview mode");
    expect(markup).toContain("live mutations remain disabled");
    expect(markup).toContain("Live board actions are unavailable in localhost fallback mode.");
    expect(markup).toContain("2 runtime memory buckets stay Wealth Factory-only, while 4 tenant-record candidate buckets may become tenant-owned later.");
    expect(markup).toContain("Controls - Preview");
  });

  it("defaults prop-seeded board props to preview mode when no explicit control mode is provided", () => {
    const markup = renderToStaticMarkup(<HarnessBoardPage initialBoard={boardResponse} />);

    expect(markup).toContain("Control mode");
    expect(markup).toContain("Preview");
    expect(markup).toContain("Controls - Preview");
    expect(markup).toContain("Live board actions are unavailable in localhost fallback mode.");
  });

  it("describes proposal-decision conflicts with contract-aware recovery guidance", () => {
    const feedback = describeBoardActionFeedback(
      new HarnessBoardClientError({
        code: "conflict",
        message: "Unable to update harness board",
        status: 409
      }),
      {
        actionRoute: "proposal-decision",
        actionLabel: "Approve proposal"
      }
    );

    expect(feedback.message).toContain("changed before this action could be applied");
    expect(feedback.recoveryTitle).toBe("Next safe step");
    expect(feedback.recoverySteps).toEqual([
      "Refresh the board and confirm the proposal is still pending CEO review.",
      "Check the latest approval queue before trying to widen or defer the lane again."
    ]);
  });

  it("describes invalid resolve-attention payloads with composer reset guidance", () => {
    const feedback = describeBoardActionFeedback(
      new HarnessBoardClientError({
        code: "invalid_request",
        message: "Unable to update harness board",
        status: 400
      }),
      {
        actionRoute: "resolve-attention",
        actionLabel: "Resume lane"
      }
    );

    expect(feedback.message).toContain("no longer matches the live board contract");
    expect(feedback.recoverySteps).toEqual([
      "Reset this action composer to the contract defaults.",
      "Review the required fields again before retrying the lane recovery command."
    ]);
  });

  it("describes throttled board loads with bounded retry guidance", () => {
    const feedback = describeBoardLoadFeedback(
      new HarnessBoardClientError({
        code: "rate_limited",
        message: "Unable to load harness board",
        status: 429,
        retryAfterSeconds: 12
      })
    );

    expect(feedback.message).toContain("12 more seconds");
    expect(feedback.recoveryTitle).toBe("Safe retry");
    expect(feedback.recoverySteps).toEqual([
      "Wait for the bounded retry window to clear.",
      "Reload the live harness board after the throttle window expires."
    ]);
  });

  it("describes timed-out board loads with bounded reload guidance", () => {
    const feedback = describeBoardLoadFeedback(
      new HarnessBoardClientError({
        code: "timed_out",
        message: "Harness board request timed out",
        status: 408
      })
    );

    expect(feedback.message).toContain("took too long to respond");
    expect(feedback.recoverySteps).toEqual([
      "Retry the live board load through the bounded reload control.",
      "If the timeout repeats, pause before retrying again so the board does not slip into a manual refresh loop."
    ]);
  });

  it("renders initial action feedback guidance when the page is seeded with a live-action failure", () => {
    const feedback = describeBoardActionFeedback(
      new HarnessBoardClientError({
        code: "conflict",
        message: "Unable to update harness board",
        status: 409
      }),
      {
        actionRoute: "proposal-decision",
        actionLabel: "Approve proposal"
      }
    );
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={boardResponse}
        initialControlMode="live"
        initialActionFeedback={feedback}
      />
    );

    expect(markup).toContain("Latest board action issue");
    expect(markup).toContain("Next safe step");
    expect(markup).toContain("Refresh the board and confirm the proposal is still pending CEO review.");
    expect(markup).toContain("Reload live board");
  });

  it("renders retry controls for retryable live action failures when the failed attempt is known", () => {
    const feedback = describeBoardActionFeedback(
      new HarnessBoardClientError({
        code: "service_unavailable",
        message: "Unable to update harness board",
        status: 503
      }),
      {
        actionRoute: "proposal-decision",
        actionLabel: "Approve proposal"
      }
    );
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={boardResponse}
        initialControlMode="live"
        initialActionFeedback={feedback}
        initialActionFailureCause={
          new HarnessBoardClientError({
            code: "service_unavailable",
            message: "Unable to update harness board",
            status: 503
          })
        }
        initialActionAttempt={{
          actionKey: "approval:proposal_ui_test_1:approve",
          actionPath: "/api/harness/proposals/proposal_ui_test_1/decision",
          actionRoute: "proposal-decision",
          actionMethod: "POST",
          actionToken: "test-proposal-token",
          requestBody: { decision: "approve" },
          noticeLabel: "Approve proposal"
        }}
      />
    );

    expect(markup).toContain("Retry Approve proposal");
    expect(markup).not.toContain("Reset composer defaults");
  });

  it("hides retry controls when the failed attempt is no longer part of the current live board contract", () => {
    const feedback = describeBoardActionFeedback(
      new HarnessBoardClientError({
        code: "service_unavailable",
        message: "Unable to update harness board",
        status: 503
      }),
      {
        actionRoute: "proposal-decision",
        actionLabel: "Approve proposal"
      }
    );
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={boardResponse}
        initialControlMode="live"
        initialActionFeedback={feedback}
        initialActionFailureCause={
          new HarnessBoardClientError({
            code: "service_unavailable",
            message: "Unable to update harness board",
            status: 503
          })
        }
        initialActionAttempt={{
          actionKey: "approval:proposal_old:approve",
          actionPath: "/api/harness/proposals/proposal_old/decision",
          actionRoute: "proposal-decision",
          actionMethod: "POST",
          actionToken: "test-proposal-old-token",
          requestBody: { decision: "approve" },
          noticeLabel: "Approve proposal"
        }}
      />
    );

    expect(markup).not.toContain("Retry Approve proposal");
    expect(markup).toContain("Dismiss stale action issue");
    expect(markup).toContain(
      "The current board no longer exposes approve proposal. Reload or choose a fresh bounded action from the current contract instead of replaying the stale request."
    );
  });

  it("keeps invalid-request recovery on reload-only when the payload still fits the live contract", () => {
    const feedback = describeBoardActionFeedback(
      new HarnessBoardClientError({
        code: "invalid_request",
        message: "Unable to update harness board",
        status: 400
      }),
      {
        actionRoute: "resolve-attention",
        actionLabel: "Resume lane"
      }
    );
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={resolveAttentionBoardResponse}
        initialControlMode="live"
        initialActionFeedback={feedback}
        initialActionFailureCause={
          new HarnessBoardClientError({
            code: "invalid_request",
            message: "Unable to update harness board",
            status: 400
          })
        }
        initialActionAttempt={{
          actionKey: "attention:resume_lane",
          actionPath: "/api/harness/runs/run_ui_test_2/resolve-attention",
          actionRoute: "resolve-attention",
          actionMethod: "POST",
          actionToken: "test-resolve-token",
          requestBody: { command: "resume_lane", resumeSummary: "Resume CFO lane" },
          noticeLabel: "Resume lane"
        }}
      />
    );

    expect(markup).not.toContain("Reset to current contract defaults");
    expect(markup).not.toContain("Retry Resume lane");
    expect(markup).toContain("Replay-safe action");
  });

  it("keeps reset controls but suppresses replay when the action still exists and only the payload drifted away from the current contract", () => {
    const feedback = describeBoardActionFeedback(
      new HarnessBoardClientError({
        code: "invalid_request",
        message: "Unable to update harness board",
        status: 400
      }),
      {
        actionRoute: "review-attention",
        actionLabel: "Start fresh cycle"
      }
    );
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={boardResponse}
        initialControlMode="live"
        initialActionFeedback={feedback}
        initialActionFailureCause={
          new HarnessBoardClientError({
            code: "invalid_request",
            message: "Unable to update harness board",
            status: 400
          })
        }
        initialActionAttempt={{
          actionKey: "attention:start_fresh_cycle",
          actionPath: "/api/harness/runs/run_ui_test_1/review-attention",
          actionRoute: "review-attention",
          actionMethod: "POST",
          actionToken: "test-review-token",
          requestBody: { decision: "start_fresh_cycle", mode: "invalid_mode" },
          noticeLabel: "Start fresh cycle"
        }}
      />
    );

    expect(markup).toContain("Reset to current contract defaults");
    expect(markup).not.toContain("Retry Start fresh cycle");
    expect(markup).toContain("Payload drifted");
    expect(markup).toContain(
      "The current board still supports start fresh cycle, but the last payload no longer fits the bounded contract. Reset the composer to the current defaults before trying again."
    );
  });

  it("hides composer reset controls when the failed request is no longer supported by the current attention contract", () => {
    const feedback = describeBoardActionFeedback(
      new HarnessBoardClientError({
        code: "invalid_request",
        message: "Unable to update harness board",
        status: 400
      }),
      {
        actionRoute: "resolve-attention",
        actionLabel: "Unblock lane"
      }
    );
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={resolveAttentionBoardResponse}
        initialControlMode="live"
        initialActionFeedback={feedback}
        initialActionFailureCause={
          new HarnessBoardClientError({
            code: "invalid_request",
            message: "Unable to update harness board",
            status: 400
          })
        }
        initialActionAttempt={{
          actionKey: "attention:unblock_lane",
          actionPath: "/api/harness/runs/run_ui_test_2/resolve-attention",
          actionRoute: "resolve-attention",
          actionMethod: "POST",
          actionToken: "test-resolve-token",
          requestBody: { command: "unblock_lane" },
          noticeLabel: "Unblock lane"
        }}
      />
    );

    expect(markup).not.toContain("Reset to current contract defaults");
    expect(markup).not.toContain("Retry Unblock lane");
    expect(markup).toContain("Dismiss stale action issue");
  });

  it("does not mislabel a missing live board as a stale action and still allows dismissing the failed attempt", () => {
    const feedback = describeBoardActionFeedback(
      new HarnessBoardClientError({
        code: "conflict",
        message: "Unable to update harness board",
        status: 409
      }),
      {
        actionRoute: "proposal-decision",
        actionLabel: "Approve proposal"
      }
    );
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={null}
        initialControlMode="preview"
        initialActionFeedback={feedback}
        initialActionFailureCause={
          new HarnessBoardClientError({
            code: "conflict",
            message: "Unable to update harness board",
            status: 409
          })
        }
        initialActionAttempt={{
          actionKey: "approval:proposal_ui_test_1:approve",
          actionPath: "/api/harness/proposals/proposal_ui_test_1/decision",
          actionRoute: "proposal-decision",
          actionMethod: "POST",
          actionToken: "test-proposal-token",
          requestBody: { decision: "approve" },
          noticeLabel: "Approve proposal"
        }}
      />
    );

    expect(markup).toContain("Dismiss action issue");
    expect(markup).not.toContain(
      "The current board no longer exposes approve proposal. Reload or choose a fresh bounded action from the current contract instead of replaying the stale request."
    );
  });

  it("treats preview fallback board data as unavailable for live action recovery classification", () => {
    const feedback = describeBoardActionFeedback(
      new HarnessBoardClientError({
        code: "conflict",
        message: "Unable to update harness board",
        status: 409
      }),
      {
        actionRoute: "proposal-decision",
        actionLabel: "Approve proposal"
      }
    );
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={boardResponse}
        initialControlMode="preview"
        initialActionFeedback={feedback}
        initialActionFailureCause={
          new HarnessBoardClientError({
            code: "conflict",
            message: "Unable to update harness board",
            status: 409
          })
        }
        initialActionAttempt={{
          actionKey: "approval:proposal_ui_test_1:approve",
          actionPath: "/api/harness/proposals/proposal_ui_test_1/decision",
          actionRoute: "proposal-decision",
          actionMethod: "POST",
          actionToken: "test-proposal-token",
          requestBody: { decision: "approve" },
          noticeLabel: "Approve proposal"
        }}
      />
    );

    expect(markup).toContain("Dismiss action issue");
    expect(markup).not.toContain("Dismiss stale action issue");
    expect(markup).not.toContain("Replay-safe action");
    expect(markup).not.toContain("Action removed");
  });

  it("keeps preview board content visible while surfacing bounded live-load recovery guidance", () => {
    const feedback = describeBoardLoadFeedback(
      new HarnessBoardClientError({
        code: "service_unavailable",
        message: "Unable to load harness board",
        status: 503
      })
    );
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={boardResponse}
        initialControlMode="preview"
        initialLoadFeedback={feedback}
      />
    );

    expect(markup).toContain("Board load issue");
    expect(markup).toContain("The live harness board is temporarily unavailable right now.");
    expect(markup).toContain("Retry the live board load after the current service interruption clears.");
    expect(markup).toContain("Retry live board load");
    expect(markup).toContain("Preview");
    expect(markup).toContain("Pressure-test the pricing lane");
  });

  it("surfaces the preview variant label when a resolve-attention preview board is seeded explicitly", () => {
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={resolveAttentionBoardResponse}
        initialControlMode="preview"
        initialPreviewVariantLabel="Lane resume"
      />
    );

    expect(markup).toContain("Preview variant: Lane resume");
    expect(markup).toContain("while previewing lane resume.");
    expect(markup).toContain("Resume lane");
  });

  it("surfaces the approval-backlog preview variant with bounded governance guidance", () => {
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={pendingApprovalsAttentionBoardResponse}
        initialControlMode="preview"
        initialPreviewVariantLabel="Approval backlog"
      />
    );

    expect(markup).toContain("Preview variant: Approval backlog");
    expect(markup).toContain("while previewing approval backlog.");
    expect(markup).toContain("Review pending approvals");
    expect(markup).toContain("Pending approvals in queue: 1");
    expect(markup).toContain("Backlog mode: New work waiting");
    expect(markup).toContain("Queue composition: 1 proposed, 0 deferred");
    expect(markup).toContain("Action family: pending approvals");
    expect(markup).toContain("Next queue target: RESEARCHER · Gather competitor price anchors");
    expect(markup).toContain("Queue target status: Pending CEO approval");
  });

  it("marks stale bounded action errors for board resync", () => {
    expect(
      shouldResyncBoardAfterActionError(
        new HarnessBoardClientError({
          code: "conflict",
          message: "Unable to update harness board",
          status: 409
        })
      )
    ).toBe(true);
    expect(
      shouldResyncBoardAfterActionError(
        new HarnessBoardClientError({
          code: "invalid_request",
          message: "Unable to update harness board",
          status: 400
        })
      )
    ).toBe(true);
    expect(
      shouldResyncBoardAfterActionError(
        new HarnessBoardClientError({
          code: "rate_limited",
          message: "Unable to update harness board",
          status: 429
        })
      )
    ).toBe(false);
  });

  it("marks retryable bounded action failures for safe replay", () => {
    expect(
      canRetryBoardActionAfterError(
        new HarnessBoardClientError({
          code: "service_unavailable",
          message: "Unable to update harness board",
          status: 503
        })
      )
    ).toBe(true);
    expect(
      canRetryBoardActionAfterError(
        new HarnessBoardClientError({
          code: "request_rejected",
          message: "Unable to update harness board",
          status: 502
        })
      )
    ).toBe(true);
    expect(
      canRetryBoardActionAfterError(
        new HarnessBoardClientError({
          code: "timed_out",
          message: "Harness board request timed out",
          status: 408
        })
      )
    ).toBe(true);
    expect(
      canRetryBoardActionAfterError(
        new HarnessBoardClientError({
          code: "conflict",
          message: "Unable to update harness board",
          status: 409
        })
      )
    ).toBe(false);
  });

  it("describes timed-out board actions with bounded replay guidance", () => {
    const feedback = describeBoardActionFeedback(
      new HarnessBoardClientError({
        code: "timed_out",
        message: "Harness board request timed out",
        status: 408
      }),
      {
        actionRoute: "proposal-decision",
        actionLabel: "Approve proposal"
      }
    );

    expect(feedback.message).toContain("took too long to respond");
    expect(feedback.recoverySteps).toEqual([
      "Retry the same bounded board action through the explicit replay control.",
      "If the timeout repeats, reload the board before trying again so the control surface stays current."
    ]);
  });

  it("marks invalid-request failures for composer reset instead of replay", () => {
    expect(
      canResetBoardActionComposerAfterError(
        new HarnessBoardClientError({
          code: "invalid_request",
          message: "Unable to update harness board",
          status: 400
        })
      )
    ).toBe(true);
    expect(
      canResetBoardActionComposerAfterError(
        new HarnessBoardClientError({
          code: "service_unavailable",
          message: "Unable to update harness board",
          status: 503
        })
      )
    ).toBe(false);
  });

  it("keeps localhost fallback usable while preserving bounded live-load feedback", () => {
    const feedback = describeBoardLoadFeedback(
      new HarnessBoardClientError({
        code: "service_unavailable",
        message: "Unable to load harness board",
        status: 503
      })
    );
    const resolution = resolveBoardLoadFailure({
      error: new HarnessBoardClientError({
        code: "service_unavailable",
        message: "Unable to load harness board",
        status: 503
      }),
      browserFallbackEnabled: true,
      fallbackState: {
        board: boardResponse,
        controlMode: "preview",
        variant: "review-attention",
        variantLabel: "Final assembly review"
      }
    });

    expect(resolution).toEqual({
      board: boardResponse,
      controlMode: "preview",
      previewVariantLabel: "Final assembly review",
      feedback
    });
  });
});
