import type { HarnessBoardResponse } from "../../../src/harness/board-service.js";
export type { HarnessBoardResponse } from "../../../src/harness/board-service.js";

export type HarnessBoardActionResult =
  | { status: "approved"; cardId: string }
  | { status: "deferred" }
  | { status: "denied" }
  | { status: "done"; runId: string }
  | { status: "fresh_cycle_started"; runId: string; reopenedProposalCount: number }
  | { status: "resumed"; cardId: string; state: "working" }
  | { status: "unblocked"; cardId: string; state: "approved" };

export type HarnessBoardControlMode = "live" | "preview";
export type HarnessBoardFallbackVariant =
  | "review-attention"
  | "resolve-attention"
  | "pending-approvals";
export type HarnessBoardFallbackState = {
  board: HarnessBoardResponse;
  controlMode: HarnessBoardControlMode;
  variant: HarnessBoardFallbackVariant;
  variantLabel: string;
};

export type HarnessBoardClientErrorCode =
  | "conflict"
  | "invalid_request"
  | "not_found"
  | "rate_limited"
  | "request_rejected"
  | "service_unavailable"
  | "stale_contract"
  | "timed_out"
  | "unauthorized"
  | "unknown";

export class HarnessBoardClientError extends Error {
  readonly code: HarnessBoardClientErrorCode;
  readonly status: number;
  readonly retryAfterSeconds: number | null;

  constructor(input: {
    code: HarnessBoardClientErrorCode;
    message: string;
    status: number;
    retryAfterSeconds?: number | null;
  }) {
    super(input.message);
    this.name = "HarnessBoardClientError";
    this.code = input.code;
    this.status = input.status;
    this.retryAfterSeconds = input.retryAfterSeconds ?? null;
  }
}

const fallbackBoardBase: HarnessBoardResponse = {
  runId: "harness-browser-fallback",
  workflowId: "wf_connect_first_workflow",
  packageId: "pkg_bib_connect",
  columns: [
    {
      id: "planning",
      title: "Planning",
      description: "Work being shaped by the orchestrator.",
      cardIds: ["card-ceo-plan"]
    },
    {
      id: "working",
      title: "Working",
      description: "Active persona lanes moving the run forward.",
      cardIds: ["card-cfo-forecast"]
    },
    {
      id: "done",
      title: "Done",
      description: "Completed outputs ready for review.",
      cardIds: ["card-coo-handoff"]
    }
  ],
  cards: [
    {
      id: "card-ceo-plan",
      persona: "CEO",
      title: "Shape the launch plan",
      summary: "Clarify the first three moves, tighten the promise, and hand the team a clear sequence.",
      lane: "planning",
      statusLabel: "Planning",
      priorityLabel: "High priority",
      deliverableLabel: "Launch Plan",
      updatedAtLabel: "Updated recently",
      outcome: "The launch path is narrowed to a clean three-step sequence ready for approval.",
      focusPoints: [
        "Define the opening offer",
        "Keep the next three decisions visible",
        "Avoid extra card fan-out"
      ],
      activity: [
        {
          id: "activity-ceo-fallback",
          label: "CEO is maintaining a bounded launch-planning lane for the current board.",
          timestampLabel: "recently"
        }
      ],
      detailSections: [
        {
          id: "snapshot",
          title: "Snapshot",
          body: "This fallback board keeps the shell usable during static web development without exposing backend mechanics."
        },
        {
          id: "continuity-memory",
          title: "Continuity memory",
          body: "Source: Resume override\nUpdated: recently\nLatest outcome memory: Keep the launch plan narrowed to the first three bounded moves."
        }
      ]
    },
    {
      id: "card-cfo-forecast",
      persona: "CFO",
      title: "Pressure-test the pricing lane",
      summary: "Check margin resilience and isolate the one pricing decision that still needs review.",
      lane: "working",
      statusLabel: "Working",
      priorityLabel: "Active",
      deliverableLabel: "Pricing Review",
      updatedAtLabel: "Updated recently",
      outcome: "Margin assumptions are holding with one discount edge case still waiting on approval.",
      focusPoints: [
        "Review floor price",
        "Flag discount sensitivity",
        "Keep the model summary readable"
      ],
      activity: [
        {
          id: "activity-cfo-fallback",
          label: "CFO is keeping the pricing lane current inside the approved workflow boundary.",
          timestampLabel: "recently"
        }
      ],
      detailSections: [
        {
          id: "readout",
          title: "Readout",
          body: "The business takeaway is stable enough to guide a decision without surfacing tool chatter."
        }
      ]
    },
    {
      id: "card-coo-handoff",
      persona: "COO",
      title: "Prepare the fulfillment handoff",
      summary: "Package the first delivery lane so execution can start without follow-up churn.",
      lane: "done",
      statusLabel: "Done",
      priorityLabel: "Ready",
      deliverableLabel: "Ops Handoff",
      updatedAtLabel: "Updated recently",
      outcome: "Fulfillment steps are packaged into a clean operational checklist for the first client wave.",
      focusPoints: [
        "Confirm owners",
        "Reduce handoff friction",
        "Keep the checklist customer-safe"
      ],
      activity: [
        {
          id: "activity-coo-fallback",
          label: "COO closed the handoff loop and kept the board readable for the tenant.",
          timestampLabel: "recently"
        }
      ],
      detailSections: [
        {
          id: "delivery-summary",
          title: "Delivery summary",
          body: "The handoff is complete and shown as business progress instead of backend process noise."
        }
      ]
    }
  ],
  pendingApprovals: [
    {
      id: "proposal-fallback-1",
      title: "Gather competitor price anchors",
      requestedByPersona: "CFO",
      targetPersona: "RESEARCHER",
      deliverableLabel: "Research Brief",
      statusLabel: "Pending CEO approval",
      actionRoute: "proposal-decision",
      actionPath: "/api/harness/proposals/proposal-fallback-1/decision",
      actionMethod: "POST",
      actionToken: "preview-proposal-fallback-1",
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
      nextReviewTrigger: "Revisit when the CEO is ready to widen the pricing work.",
      lastDecisionAtLabel: "recently"
    }
  ],
  pendingAttention: {
    kind: "queue_ceo_review",
    runState: "assembling",
    statusLabel: "CEO review required",
    summary: "The board is ready for final assembly before the tenant-facing package is closed.",
    actionRoute: "review-attention",
    actionPath: "/api/harness/runs/harness-browser-fallback/review-attention",
    actionMethod: "POST",
    actionToken: "preview-review-attention",
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
    requestedAtLabel: "recently",
    reasonLabel: "Final assembly"
  },
  followThroughItems: [
    {
      id: "follow-through-fallback-1",
      action: "opened_lane",
      summary: "CEO opened a new pricing review lane for CFO.",
      timestampLabel: "recently",
      persona: "CFO",
      deliverableLabel: "Pricing Review",
      policyReasonLabel: "New lane approved",
      recommendationSummary: "Open a dedicated pricing review lane for CFO."
    }
  ],
  recentDecisions: [
    {
      id: "decision-fallback-1",
      decisionKind: "lane_opened",
      label: "CEO opened a new pricing review lane.",
      resolution: "create_lane",
      policyReasonLabel: "New lane approved",
      recommendationSummary: "Open a dedicated pricing review lane for CFO.",
      timestampLabel: "recently"
    }
  ],
  memoryBoundary: {
    summary:
      "Wealth Factory runtime keeps bounded operational lane memory live while governance and package records stay ready for later tenant-owned export.",
    exportSummary: "2 export candidates are ready now, and 2 still wait for board closure.",
    deliverySummary: "No grouped export deliveries have been attempted yet.",
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
    stateSummary:
      "2 runtime buckets stay runtime-only, 2 export candidate buckets are ready for tenant export later, and 2 buckets are still awaiting board closure.",
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
    roleSummary: "2 governance record candidates are ready now, and 2 packaged output candidates still wait on board closure.",
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
    continuityTrioRuntimeItemCount: 1,
    attentionSignalRuntimeItemCount: 1,
    runtimeOnlyLongMemoryItemCount: 2,
    runtimeShapeSummary:
      "1 runtime bucket keeps the bounded continuity trio, and 1 bucket keeps CEO attention as a live control signal.",
    runtimeLongMemoryDispositionSummary:
      "2 runtime buckets stay operational Wealth Factory truth and do not promote directly into tenant-owned long memory.",
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
        count: 1,
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
        runtimeMemoryShape: "bounded_continuity_trio",
        runtimeMemoryShapeLabel: "Bounded continuity trio",
        runtimeMemoryComponents: ["continuity_summary", "latest_result_summary", "absorbed_work_items"],
        runtimeMemoryComponentLabels: ["Continuity summary", "Latest result summary", "Absorbed work items"],
        runtimeLongMemoryDisposition: "stays_runtime_only",
        runtimeLongMemoryDispositionLabel: "Stays runtime only",
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
        runtimeMemoryShape: "bounded_attention_signal",
        runtimeMemoryShapeLabel: "Bounded attention signal",
        runtimeMemoryComponents: ["pending_attention_state"],
        runtimeMemoryComponentLabels: ["Pending attention state"],
        runtimeLongMemoryDisposition: "stays_runtime_only",
        runtimeLongMemoryDispositionLabel: "Stays runtime only",
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
        promotionActionDescription:
          "Board closure still gates this package governance memory before any later tenant export action can apply.",
        nextEligibleSummary:
          "Board closure is still required before this package-shaped governance memory becomes a durable tenant record candidate."
      },
      {
        id: "package_deliverables",
        label: "Packaged deliverables",
        count: 2,
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
        promotionActionDescription:
          "Board closure still gates this packaged deliverable before any later tenant export action can apply.",
        nextEligibleSummary:
          "Board closure is still required before this packaged deliverable becomes a durable tenant record candidate."
      }
    ]
  },
  completionPackage: {
    status: "assembling",
    summary: "The current board package is almost ready, with one bounded governance question still shaping the handoff.",
    deferredApprovalCount: 1,
    deniedApprovalCount: 0,
    hasOpenGovernanceItems: true,
    packageNote: "Keep the pricing handoff readable while the research expansion stays under review.",
    recommendations: [
      "Carry the current pricing review into the tenant-facing handoff.",
      "Revisit research expansion only after the CEO closes the current package."
    ],
    objections: ["Do not widen the board cycle until the current pricing decision is packaged cleanly."],
    governanceItems: [
      {
        proposalId: "proposal-fallback-1",
        statusLabel: "Pending CEO approval",
        persona: "RESEARCHER",
        deliverableLabel: "Research Brief",
        policyReasonLabel: "Review for expansion",
        recommendationSummary: "Approve only when the current pricing board package is stable.",
        nextReviewTrigger: "Revisit when the CEO is ready to widen the pricing work."
      }
    ],
    deliverables: [
      {
        cardId: "card-cfo-forecast",
        persona: "CFO",
        title: "Pressure-test the pricing lane",
        deliverableLabel: "Pricing Review",
        outcome: "Margin assumptions are holding with one discount edge case still waiting on approval."
      },
      {
        cardId: "card-coo-handoff",
        persona: "COO",
        title: "Prepare the fulfillment handoff",
        deliverableLabel: "Ops Handoff",
        outcome: "Fulfillment steps are packaged into a clean operational checklist for the first client wave."
      }
    ]
  }
};

const fallbackPendingApprovalHead = fallbackBoardBase.pendingApprovals[0];

const fallbackBoardResponsesRaw: Record<HarnessBoardFallbackVariant, HarnessBoardResponse> = {
  "review-attention": fallbackBoardBase,
  "resolve-attention": {
    ...fallbackBoardBase,
    runId: "harness-browser-fallback-resolve",
    pendingAttention: {
      kind: "await_lane_resume",
      runState: "waiting",
      statusLabel: "Waiting on lane resume",
      summary: "Resume the pricing lane once the tenant confirms the updated revenue assumption.",
      actionRoute: "resolve-attention",
      actionPath: "/api/harness/runs/harness-browser-fallback-resolve/resolve-attention",
      actionMethod: "POST",
      actionToken: "preview-resolve-attention",
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
      requestedAtLabel: "recently",
      reasonLabel: "Awaiting tenant confirmation",
      targetCardId: "card-cfo-forecast",
      targetPersona: "CFO",
      targetTitle: "Pressure-test the pricing lane",
      targetSummary: "Resume CFO lane: Pressure-test the pricing lane"
    }
  },
  "pending-approvals": {
    ...fallbackBoardBase,
    runId: "harness-browser-fallback-pending-approvals",
    pendingAttention: {
      kind: "queue_ceo_review",
      runState: "active",
      statusLabel: "CEO approval backlog",
      summary: "Clear the bounded proposal queue before widening the current board cycle.",
      actionRoute: "pending-approvals",
      actionLabel: "Review pending approvals",
      actionDescription: "Open the proposal review queue to clear governance backlog before more work starts.",
      pendingApprovalCount: fallbackBoardBase.pendingApprovals.length,
      proposedApprovalCount: 1,
      deferredApprovalCount: 0,
      backlogMode: "new_work_waiting",
      requestedAtLabel: "recently",
      reasonLabel: "Governance backlog",
      ...(fallbackPendingApprovalHead
        ? {
            targetProposalId: fallbackPendingApprovalHead.id,
            targetStatusLabel: fallbackPendingApprovalHead.statusLabel,
            targetPersona: fallbackPendingApprovalHead.targetPersona,
            targetTitle: fallbackPendingApprovalHead.title,
            targetSummary: `Next queue target: ${fallbackPendingApprovalHead.targetPersona} · ${fallbackPendingApprovalHead.title}`
          }
        : {})
    }
  }
};

const fallbackBoardResponses: Record<HarnessBoardFallbackVariant, HarnessBoardResponse> = Object.fromEntries(
  Object.entries(fallbackBoardResponsesRaw).map(([variant, board]) => [
    variant,
    {
      ...board,
      memoryBoundary: normalizeMemoryBoundary(board.memoryBoundary, board)
    }
  ])
) as Record<HarnessBoardFallbackVariant, HarnessBoardResponse>;

const fallbackVariantLabels: Record<HarnessBoardFallbackVariant, string> = {
  "review-attention": "Final assembly review",
  "resolve-attention": "Lane resume",
  "pending-approvals": "Approval backlog"
};

const DEFAULT_HARNESS_BOARD_REQUEST_TIMEOUT_MS = 8_000;

type LegacyHarnessBoardResponse = Omit<HarnessBoardResponse, "memoryBoundary"> & {
  memoryBoundary?: HarnessBoardResponse["memoryBoundary"] | undefined;
};

function humanizeMemoryBoundaryReadiness(
  readiness: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["readiness"]>
) {
  switch (readiness) {
    case "live_runtime_only":
      return "Live runtime only";
    case "ready_now":
      return "Ready now";
    case "after_board_closes":
      return "After board closes";
    default:
      return readiness;
  }
}

function humanizeMemoryBoundaryRole(
  role: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["role"]>
) {
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

function humanizeMemoryBoundaryEligibilityRule(
  rule: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["eligibilityRule"]>
) {
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

function humanizeMemoryBoundarySourceSurface(
  surface: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["sourceSurface"]>
) {
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

function inferRuntimeMemoryShape(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"]
): NonNullable<NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["runtimeMemoryShape"]>> {
  return itemId === "lane_continuity" ? "bounded_continuity_trio" : "bounded_attention_signal";
}

function humanizeRuntimeMemoryShape(
  shape: NonNullable<NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["runtimeMemoryShape"]>>
) {
  switch (shape) {
    case "bounded_continuity_trio":
      return "Bounded continuity trio";
    case "bounded_attention_signal":
      return "Bounded attention signal";
    default:
      return shape;
  }
}

function inferRuntimeMemoryComponents(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"]
): NonNullable<NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["runtimeMemoryComponents"]>> {
  return itemId === "lane_continuity"
    ? ["continuity_summary", "latest_result_summary", "absorbed_work_items"]
    : ["pending_attention_state"];
}

function humanizeRuntimeMemoryComponent(
  component: NonNullable<NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["runtimeMemoryComponents"]>[number]>
) {
  switch (component) {
    case "continuity_summary":
      return "Continuity summary";
    case "latest_result_summary":
      return "Latest result summary";
    case "absorbed_work_items":
      return "Absorbed work items";
    case "pending_attention_state":
      return "Pending attention state";
    default:
      return component;
  }
}

function inferRuntimeLongMemoryDisposition(): NonNullable<
  NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["runtimeLongMemoryDisposition"]>
> {
  return "stays_runtime_only";
}

function humanizeRuntimeLongMemoryDisposition(
  disposition: NonNullable<NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["runtimeLongMemoryDisposition"]>>
) {
  switch (disposition) {
    case "stays_runtime_only":
      return "Stays runtime only";
    default:
      return disposition;
  }
}

function humanizeMemoryBoundaryCandidateClass(
  candidateClass: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["candidateClass"]>
) {
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

function humanizeMemoryBoundaryDurabilityCondition(
  condition: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["durabilityCondition"]>
) {
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

function humanizeMemoryBoundaryOwnershipBoundary(
  boundary: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["ownershipBoundary"]>
) {
  switch (boundary) {
    case "wealth_factory_only":
      return "Wealth Factory only";
    case "tenant_owned_later":
      return "Tenant-owned later";
    default:
      return boundary;
  }
}

function humanizeMemoryBoundaryPromotionPath(
  path: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["promotionPath"]>
) {
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

function humanizeMemoryBoundaryRecordTarget(
  target: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["recordTarget"]>
) {
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

function humanizeMemoryBoundaryPromotionBlocker(
  blocker: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["promotionBlocker"]>
) {
  switch (blocker) {
    case "not_applicable_runtime_only":
      return "Not applicable in runtime";
    case "none_ready_now":
      return "No blocker";
    case "board_closure_required":
      return "Board closure required";
    default:
      return blocker;
  }
}

function humanizeMemoryBoundaryPromotionAuthority(
  authority: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["promotionAuthority"]>
) {
  switch (authority) {
    case "wealth_factory_runtime_only":
      return "Wealth Factory runtime only";
    case "tenant_explicit_export":
      return "Tenant explicit export";
    case "board_closure_then_tenant_export":
      return "Board closure, then tenant export";
    default:
      return authority;
  }
}

function humanizeMemoryBoundaryPromotionTrigger(
  trigger: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["promotionTrigger"]>
) {
  switch (trigger) {
    case "not_applicable_runtime":
      return "No promotion trigger";
    case "tenant_export_request":
      return "Tenant export request";
    case "board_closure":
      return "Board closure";
    default:
      return trigger;
  }
}

function humanizeMemoryBoundaryPromotionState(
  state: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["promotionState"]>
) {
  switch (state) {
    case "runtime_only":
      return "Runtime only";
    case "ready_for_tenant_export":
      return "Ready for tenant export";
    case "awaiting_board_closure":
      return "Awaiting board closure";
    default:
      return state;
  }
}

function humanizeMemoryBoundaryPromotionNextStep(
  step: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["promotionNextStep"]>
) {
  switch (step) {
    case "none_runtime_only":
      return "No promotion step";
    case "tenant_export_available":
      return "Tenant export available";
    case "board_closure_then_tenant_export":
      return "Board closure, then tenant export";
    default:
      return step;
  }
}

function humanizeMemoryBoundaryPromotionActionFamily(
  family: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["promotionActionFamily"]>
) {
  switch (family) {
    case "none_runtime_only":
      return "No promotion action";
    case "tenant_export_candidate":
      return "Tenant export family";
    case "board_closure_before_export":
      return "Board closure first";
    default:
      return family;
  }
}

function humanizeMemoryBoundaryAssemblyShape(
  shape: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["assemblyShape"]>
) {
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

function humanizeMemoryBoundaryPromotionPhase(
  phase: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["promotionPhase"]>
) {
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

function humanizeMemoryBoundaryPromotionMutability(
  mutability: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["promotionMutability"]>
) {
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

function humanizeMemoryBoundaryPromotionScope(
  scope: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["promotionScope"]>
) {
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

function humanizeMemoryBoundaryIdentityStability(
  stability: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["identityStability"]>
) {
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

function humanizeMemoryBoundaryAuditBacking(
  backing: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["auditBacking"]>
) {
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

function humanizeMemoryBoundaryConcurrencyBoundary(
  boundary: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["concurrencyBoundary"]>
) {
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

function humanizeMemoryBoundaryExportPayloadShape(
  shape: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportPayloadShape"]>
) {
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

function humanizeMemoryBoundaryIdempotencyPolicy(
  policy: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["idempotencyPolicy"]>
) {
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

function humanizeMemoryBoundaryReplaySafety(
  safety: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["replaySafety"]>
) {
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

function humanizeMemoryBoundaryConflictPolicy(
  policy: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["conflictPolicy"]>
) {
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

function humanizeMemoryBoundaryExportAtomicity(
  atomicity: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportAtomicity"]>
) {
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

function humanizeMemoryBoundaryExportDerivationBasis(
  basis: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportDerivationBasis"]>
) {
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

function humanizeMemoryBoundaryExportRevisionPolicy(
  policy: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportRevisionPolicy"]>
) {
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

function humanizeMemoryBoundaryExportFreshnessSource(
  source: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportFreshnessSource"]>
) {
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

function humanizeMemoryBoundaryExportValidationBoundary(
  boundary: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportValidationBoundary"]>
) {
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

function humanizeMemoryBoundaryExportCompletenessRule(
  rule: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportCompletenessRule"]>
) {
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

function humanizeMemoryBoundaryExportSensitivity(
  sensitivity: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportSensitivity"]>
) {
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
  audience: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportAudienceBoundary"]>
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
  policy: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportSanitizationPolicy"]>
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
  boundary: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportRedactionBoundary"]>
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
  policy: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportSourceDisclosurePolicy"]>
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

function humanizeMemoryBoundaryMemoryPlacement(
  placement: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["memoryPlacement"]>
) {
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

function humanizeMemoryBoundarySyncStrategy(
  strategy: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["syncStrategy"]>
) {
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

function humanizeMemoryBoundaryExportRequestShape(
  shape: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportRequestShape"]>
) {
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
  requirement: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportConfirmationRequirement"]>
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

function humanizeMemoryBoundaryExportRecoveryPath(
  path: NonNullable<HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportRecoveryPath"]>
) {
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

function inferMemoryBoundaryReadiness(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"],
  board: Pick<HarnessBoardResponse, "completionPackage">
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["readiness"] {
  if (itemId === "lane_continuity" || itemId === "attention_state") {
    return "live_runtime_only";
  }

  if (itemId === "package_governance" || itemId === "package_deliverables") {
    return board.completionPackage?.hasOpenGovernanceItems ? "after_board_closes" : "ready_now";
  }

  return "ready_now";
}

function inferMemoryBoundaryRole(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"]
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["role"] {
  if (itemId === "lane_continuity" || itemId === "attention_state") {
    return "runtime_memory";
  }

  if (itemId === "package_governance" || itemId === "package_deliverables") {
    return "packaged_record_candidate";
  }

  return "governance_record_candidate";
}

function inferMemoryBoundaryEligibilityRule(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"],
  board: Pick<HarnessBoardResponse, "completionPackage">
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["eligibilityRule"] {
  if (itemId === "lane_continuity" || itemId === "attention_state") {
    return "runtime_only";
  }

  if (itemId === "package_governance" || itemId === "package_deliverables") {
    return board.completionPackage?.hasOpenGovernanceItems
      ? "after_board_closes_then_export"
      : "explicit_export_later";
  }

  return "explicit_export_later";
}

function inferMemoryBoundarySourceSurface(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"]
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["sourceSurface"] {
  switch (itemId) {
    case "lane_continuity":
      return "continuity_snapshots";
    case "attention_state":
      return "pending_attention";
    case "governance_decisions":
      return "recent_decisions";
    case "implemented_actions":
      return "follow_through";
    case "package_governance":
      return "completion_package_governance";
    case "package_deliverables":
      return "completion_package_deliverables";
    default:
      return "recent_decisions";
  }
}

function inferMemoryBoundaryCandidateClass(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"]
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["candidateClass"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "runtime_operational";
    case "governance_decisions":
    case "implemented_actions":
      return "governance_history";
    case "package_governance":
    case "package_deliverables":
      return "packaged_output";
    default:
      return "governance_history";
  }
}

function inferMemoryBoundaryDurabilityCondition(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"],
  board: Pick<HarnessBoardResponse, "completionPackage">
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["durabilityCondition"] {
  if (itemId === "lane_continuity" || itemId === "attention_state") {
    return "runtime_ephemeral";
  }

  if (itemId === "package_governance" || itemId === "package_deliverables") {
    return board.completionPackage?.hasOpenGovernanceItems
      ? "stable_after_board_closure"
      : "stable_when_recorded";
  }

  return "stable_when_recorded";
}

function inferMemoryBoundaryOwnershipBoundary(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"]
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["ownershipBoundary"] {
  if (itemId === "lane_continuity" || itemId === "attention_state") {
    return "wealth_factory_only";
  }

  return "tenant_owned_later";
}

function inferMemoryBoundaryPromotionPath(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"],
  board: Pick<HarnessBoardResponse, "completionPackage">
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["promotionPath"] {
  if (itemId === "lane_continuity" || itemId === "attention_state") {
    return "never_promotes";
  }

  if (itemId === "package_governance" || itemId === "package_deliverables") {
    return board.completionPackage?.hasOpenGovernanceItems
      ? "after_board_closure_then_export"
      : "ready_for_explicit_export";
  }

  return "ready_for_explicit_export";
}

function inferMemoryBoundaryRecordTarget(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"]
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["recordTarget"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "none_runtime_only";
    case "governance_decisions":
    case "implemented_actions":
      return "governance_history_record";
    case "package_governance":
      return "package_governance_record";
    case "package_deliverables":
      return "package_deliverable_record";
    default:
      return "governance_history_record";
  }
}

function inferMemoryBoundaryPromotionBlocker(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"],
  board: Pick<HarnessBoardResponse, "completionPackage">
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["promotionBlocker"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "not_applicable_runtime_only";
    case "package_governance":
    case "package_deliverables":
      return board.completionPackage?.hasOpenGovernanceItems ? "board_closure_required" : "none_ready_now";
    case "governance_decisions":
    case "implemented_actions":
    default:
      return "none_ready_now";
  }
}

function inferMemoryBoundaryPromotionAuthority(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"],
  board: Pick<HarnessBoardResponse, "completionPackage">
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["promotionAuthority"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "wealth_factory_runtime_only";
    case "package_governance":
    case "package_deliverables":
      return board.completionPackage?.hasOpenGovernanceItems
        ? "board_closure_then_tenant_export"
        : "tenant_explicit_export";
    case "governance_decisions":
    case "implemented_actions":
    default:
      return "tenant_explicit_export";
  }
}

function inferMemoryBoundaryPromotionTrigger(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"],
  board: Pick<HarnessBoardResponse, "completionPackage">
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["promotionTrigger"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "not_applicable_runtime";
    case "package_governance":
    case "package_deliverables":
      return board.completionPackage?.hasOpenGovernanceItems ? "board_closure" : "tenant_export_request";
    case "governance_decisions":
    case "implemented_actions":
    default:
      return "tenant_export_request";
  }
}

function inferMemoryBoundaryPromotionState(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"],
  board: Pick<HarnessBoardResponse, "completionPackage">
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["promotionState"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "runtime_only";
    case "package_governance":
    case "package_deliverables":
      return board.completionPackage?.hasOpenGovernanceItems
        ? "awaiting_board_closure"
        : "ready_for_tenant_export";
    case "governance_decisions":
    case "implemented_actions":
    default:
      return "ready_for_tenant_export";
  }
}

function inferMemoryBoundaryPromotionNextStep(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"],
  board: Pick<HarnessBoardResponse, "completionPackage">
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["promotionNextStep"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "none_runtime_only";
    case "package_governance":
    case "package_deliverables":
      return board.completionPackage?.hasOpenGovernanceItems
        ? "board_closure_then_tenant_export"
        : "tenant_export_available";
    case "governance_decisions":
    case "implemented_actions":
    default:
      return "tenant_export_available";
  }
}

function inferMemoryBoundaryPromotionActionFamily(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"],
  board: Pick<HarnessBoardResponse, "completionPackage">
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["promotionActionFamily"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "none_runtime_only";
    case "package_governance":
    case "package_deliverables":
      return board.completionPackage?.hasOpenGovernanceItems
        ? "board_closure_before_export"
        : "tenant_export_candidate";
    case "governance_decisions":
    case "implemented_actions":
    default:
      return "tenant_export_candidate";
  }
}

function inferMemoryBoundaryAssemblyShape(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"]
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["assemblyShape"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "none_runtime_only";
    case "governance_decisions":
    case "implemented_actions":
      return "standalone_export_record";
    case "package_governance":
    case "package_deliverables":
      return "package_record_set";
    default:
      return "standalone_export_record";
  }
}

function inferMemoryBoundaryPromotionPhase(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"]
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["promotionPhase"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "not_exported_runtime";
    case "governance_decisions":
    case "implemented_actions":
      return "phase_one_governance_history";
    case "package_governance":
    case "package_deliverables":
      return "phase_two_package_export";
    default:
      return "phase_one_governance_history";
  }
}

function inferMemoryBoundaryPromotionMutability(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"],
  board: Pick<HarnessBoardResponse, "completionPackage">
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["promotionMutability"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "runtime_mutable";
    case "package_governance":
    case "package_deliverables":
      return board.completionPackage?.hasOpenGovernanceItems
        ? "replaceable_until_board_closure"
        : "stable_snapshot";
    case "governance_decisions":
    case "implemented_actions":
    default:
      return "append_only_history";
  }
}

function inferMemoryBoundaryPromotionScope(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"]
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["promotionScope"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "none_runtime_only";
    case "package_governance":
    case "package_deliverables":
      return "package_record_set_export";
    case "governance_decisions":
    case "implemented_actions":
    default:
      return "single_record_export";
  }
}

function inferMemoryBoundaryIdentityStability(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"],
  board: Pick<HarnessBoardResponse, "completionPackage">
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["identityStability"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "runtime_transient_identity";
    case "package_governance":
    case "package_deliverables":
      return board.completionPackage?.hasOpenGovernanceItems
        ? "finalized_after_board_closure"
        : "stable_record_identity";
    case "governance_decisions":
    case "implemented_actions":
    default:
      return "stable_record_identity";
  }
}

function inferMemoryBoundaryAuditBacking(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"]
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["auditBacking"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "runtime_state_only";
    case "package_governance":
    case "package_deliverables":
      return "package_closure_backed";
    case "governance_decisions":
    case "implemented_actions":
    default:
      return "decision_ledger_backed";
  }
}

function inferMemoryBoundaryConcurrencyBoundary(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"],
  board: Pick<HarnessBoardResponse, "completionPackage">
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["concurrencyBoundary"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "runtime_only";
    case "package_governance":
    case "package_deliverables":
      return board.completionPackage?.hasOpenGovernanceItems
        ? "requires_board_closure_snapshot"
        : "independent_export_safe";
    case "governance_decisions":
    case "implemented_actions":
    default:
      return "independent_export_safe";
  }
}

function inferMemoryBoundaryExportPayloadShape(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"]
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportPayloadShape"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "none_runtime_only";
    case "package_governance":
    case "package_deliverables":
      return "package_snapshot_bundle";
    case "governance_decisions":
    case "implemented_actions":
    default:
      return "governance_history_record";
  }
}

function inferMemoryBoundaryIdempotencyPolicy(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"],
  board: Pick<HarnessBoardResponse, "completionPackage">
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["idempotencyPolicy"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "not_applicable_runtime";
    case "package_governance":
    case "package_deliverables":
      return board.completionPackage?.hasOpenGovernanceItems
        ? "board_closure_snapshot_once"
        : "deterministic_upsert";
    case "governance_decisions":
    case "implemented_actions":
    default:
      return "deterministic_upsert";
  }
}

function inferMemoryBoundaryReplaySafety(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"],
  board: Pick<HarnessBoardResponse, "completionPackage">
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["replaySafety"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "runtime_only";
    case "package_governance":
    case "package_deliverables":
      return board.completionPackage?.hasOpenGovernanceItems
        ? "requires_fresh_board_closure_snapshot"
        : "replay_safe";
    case "governance_decisions":
    case "implemented_actions":
    default:
      return "replay_safe";
  }
}

function inferMemoryBoundaryConflictPolicy(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"],
  board: Pick<HarnessBoardResponse, "completionPackage">
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["conflictPolicy"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "runtime_only";
    case "package_governance":
    case "package_deliverables":
      return board.completionPackage?.hasOpenGovernanceItems
        ? "replace_latest_closure_snapshot"
        : "append_or_upsert";
    case "governance_decisions":
    case "implemented_actions":
      default:
        return "append_or_upsert";
  }
}

function inferMemoryBoundaryExportAtomicity(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"],
  board: Pick<HarnessBoardResponse, "completionPackage">
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportAtomicity"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "none_runtime_only";
    case "package_governance":
    case "package_deliverables":
      return board.completionPackage?.hasOpenGovernanceItems
        ? "closure_bundle_atomic"
        : "record_level_atomic";
    case "governance_decisions":
    case "implemented_actions":
    default:
      return "record_level_atomic";
  }
}

function inferMemoryBoundaryExportDerivationBasis(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"]
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportDerivationBasis"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "none_runtime_only";
    case "package_governance":
    case "package_deliverables":
      return "board_closure_snapshot_derived";
    case "governance_decisions":
    case "implemented_actions":
    default:
      return "decision_history_derived";
  }
}

function inferMemoryBoundaryExportRevisionPolicy(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"],
  board: Pick<HarnessBoardResponse, "completionPackage">
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportRevisionPolicy"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "none_runtime_only";
    case "package_governance":
    case "package_deliverables":
      return board.completionPackage?.hasOpenGovernanceItems
        ? "replace_closure_bundle_revision"
        : "append_new_revision";
    case "governance_decisions":
    case "implemented_actions":
    default:
      return "append_new_revision";
  }
}

function inferMemoryBoundaryExportFreshnessSource(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"]
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportFreshnessSource"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "none_runtime_only";
    case "package_governance":
    case "package_deliverables":
      return "latest_board_closure_snapshot";
    case "governance_decisions":
    case "implemented_actions":
    default:
      return "latest_record_state";
  }
}

function inferMemoryBoundaryExportValidationBoundary(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"]
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportValidationBoundary"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "none_runtime_only";
    case "package_governance":
    case "package_deliverables":
      return "closure_bundle_validation";
    case "governance_decisions":
    case "implemented_actions":
    default:
      return "record_level_validation";
  }
}

function inferMemoryBoundaryExportCompletenessRule(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"]
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportCompletenessRule"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "none_runtime_only";
    case "package_governance":
    case "package_deliverables":
      return "board_closure_complete_bundle";
    case "governance_decisions":
    case "implemented_actions":
    default:
      return "self_contained_record";
  }
}

function inferMemoryBoundaryExportSensitivity(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"]
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportSensitivity"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "none_runtime_only";
    case "governance_decisions":
    case "implemented_actions":
      return "tenant_business_context";
    case "package_governance":
    case "package_deliverables":
    default:
      return "tenant_deliverable_context";
  }
}

function inferMemoryBoundaryExportAudienceBoundary(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"]
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportAudienceBoundary"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "wealth_factory_runtime_only";
    case "governance_decisions":
    case "implemented_actions":
      return "tenant_governance_history_readers";
    case "package_governance":
    case "package_deliverables":
    default:
      return "tenant_package_consumers";
  }
}

function inferMemoryBoundaryExportSanitizationPolicy(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"]
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportSanitizationPolicy"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "none_runtime_only";
    case "governance_decisions":
    case "implemented_actions":
      return "export_as_recorded";
    case "package_governance":
    case "package_deliverables":
    default:
      return "sanitize_before_package_export";
  }
}

function inferMemoryBoundaryExportRedactionBoundary(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"]
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportRedactionBoundary"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "runtime_internal_only";
    case "governance_decisions":
    case "implemented_actions":
      return "governance_safe_redaction";
    case "package_governance":
    case "package_deliverables":
    default:
      return "package_safe_redaction";
  }
}

function inferMemoryBoundaryExportSourceDisclosurePolicy(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"]
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportSourceDisclosurePolicy"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "runtime_only";
    case "governance_decisions":
    case "implemented_actions":
      return "decision_summary_only";
    case "package_governance":
    case "package_deliverables":
    default:
      return "closure_snapshot_summary_only";
  }
}

function inferMemoryBoundaryMemoryPlacement(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"]
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["memoryPlacement"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "none_runtime_only";
    case "governance_decisions":
    case "implemented_actions":
      return "governance_history_note";
    case "package_governance":
    case "package_deliverables":
    default:
      return "package_record_folder";
  }
}

function inferMemoryBoundarySyncStrategy(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"]
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["syncStrategy"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "none_runtime_only";
    case "governance_decisions":
    case "implemented_actions":
      return "append_history_entry";
    case "package_governance":
    case "package_deliverables":
    default:
      return "replace_package_snapshot_after_board_closure";
  }
}

function inferMemoryBoundaryExportRequestShape(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"]
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportRequestShape"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "none_runtime_only";
    case "governance_decisions":
    case "implemented_actions":
      return "single_record_export_request";
    case "package_governance":
    case "package_deliverables":
    default:
      return "package_bundle_export_request";
  }
}

function inferMemoryBoundaryExportConfirmationRequirement(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"]
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportConfirmationRequirement"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "none_runtime_only";
    case "governance_decisions":
    case "implemented_actions":
      return "tenant_export_confirmation";
    case "package_governance":
    case "package_deliverables":
    default:
      return "board_closure_then_tenant_export_confirmation";
  }
}

function inferMemoryBoundaryExportRecoveryPath(
  itemId: HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["id"]
): HarnessBoardResponse["memoryBoundary"]["operationalItems"][number]["exportRecoveryPath"] {
  switch (itemId) {
    case "lane_continuity":
    case "attention_state":
      return "runtime_only";
    case "governance_decisions":
    case "implemented_actions":
      return "retry_latest_record_export";
    case "package_governance":
    case "package_deliverables":
    default:
      return "rerun_after_board_closure_snapshot";
  }
}

function buildExportCandidatesFromMemoryBoundaryItems(
  exportReadyItems: HarnessBoardResponse["memoryBoundary"]["exportReadyItems"]
): NonNullable<HarnessBoardResponse["memoryBoundary"]["exportCandidates"]> {
  const isGovernanceExportReadyItem = (
    item: HarnessBoardResponse["memoryBoundary"]["exportReadyItems"][number]
  ): item is HarnessBoardResponse["memoryBoundary"]["exportReadyItems"][number] & {
    id: "governance_decisions" | "implemented_actions";
  } => item.id === "governance_decisions" || item.id === "implemented_actions";
  const isPackageExportReadyItem = (
    item: HarnessBoardResponse["memoryBoundary"]["exportReadyItems"][number]
  ): item is HarnessBoardResponse["memoryBoundary"]["exportReadyItems"][number] & {
    id: "package_governance" | "package_deliverables";
  } => item.id === "package_governance" || item.id === "package_deliverables";
  const governanceItems = exportReadyItems.filter(
    (item): item is HarnessBoardResponse["memoryBoundary"]["exportReadyItems"][number] & {
      id: "governance_decisions" | "implemented_actions";
    } => item.count > 0 && isGovernanceExportReadyItem(item)
  );
  const packageItems = exportReadyItems.filter(
    (item): item is HarnessBoardResponse["memoryBoundary"]["exportReadyItems"][number] & {
      id: "package_governance" | "package_deliverables";
    } => item.count > 0 && isPackageExportReadyItem(item)
  );
  const candidates: NonNullable<HarnessBoardResponse["memoryBoundary"]["exportCandidates"]> = [];

  if (governanceItems.length > 0) {
    const representative = governanceItems[0]!;
    candidates.push({
      id: "governance_history_export",
      label: "Governance history export",
      itemCount: governanceItems.length,
      itemIds: governanceItems.map((item) => item.id),
      itemLabels: governanceItems.map((item) => item.label),
      summary:
        `${governanceItems.length} governance histor${governanceItems.length === 1 ? "y bucket is" : "y buckets are"} grouped into one later tenant export candidate that appends governance history notes.`,
      readiness: representative.readiness,
      readinessLabel: representative.readinessLabel,
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
      promotionBlockerLabel: "No promotion blocker",
      promotionAuthority: "tenant_explicit_export",
      promotionAuthorityLabel: "Tenant explicit export",
      promotionTrigger: "tenant_export_request",
      promotionTriggerLabel: "Tenant export request",
      promotionState: representative.promotionState,
      promotionStateLabel: representative.promotionStateLabel,
      promotionNextStep: representative.promotionNextStep,
      promotionNextStepLabel: representative.promotionNextStepLabel,
      promotionActionFamily: representative.promotionActionFamily,
      promotionActionFamilyLabel: representative.promotionActionFamilyLabel,
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
      exportSequenceLabel: "Foundational export sequence",
      exportDependencyPolicy: "independent_candidate",
      exportDependencyPolicyLabel: "Independent export candidate",
      dependsOnCandidateIds: [],
      dependsOnCandidateLabels: [],
      dependencySummary:
        "This governance history candidate can promote independently once the tenant requests export."
    });
  }

  if (packageItems.length > 0) {
    const representative = packageItems.find((item) => item.readiness === "after_board_closes") ?? packageItems[0]!;
    candidates.push({
      id: "package_bundle_export",
      label: "Package bundle export",
      itemCount: packageItems.length,
      itemIds: packageItems.map((item) => item.id),
      itemLabels: packageItems.map((item) => item.label),
      summary:
        representative.readiness === "after_board_closes"
          ? `${packageItems.length} packaged-output bucket${packageItems.length === 1 ? " still waits" : "s still wait"} on board closure before the tenant bundle can replace the latest package snapshot.`
          : `${packageItems.length} packaged-output bucket${packageItems.length === 1 ? " is" : "s are"} grouped into one later tenant export candidate for the package bundle.`,
      readiness: representative.readiness,
      readinessLabel: representative.readinessLabel,
      eligibilityRule: "after_board_closes_then_export",
      eligibilityRuleLabel: "After board closes, then export",
      sourceSurface: "completion_package_deliverables",
      sourceSurfaceLabel: "Completion package bundle",
      candidateClass: "packaged_output",
      candidateClassLabel: "Packaged output",
      durabilityCondition: "stable_after_board_closure",
      durabilityConditionLabel: "Stable after board closure",
      ownershipBoundary: "tenant_owned_later",
      ownershipBoundaryLabel: "Tenant-owned later",
      promotionPath: "after_board_closure_then_export",
      promotionPathLabel: "After board closure, then export",
      recordTarget: "package_deliverable_record",
      recordTargetLabel: "Package bundle export records",
      promotionBlocker: "board_closure_required",
      promotionBlockerLabel: "Board closure required",
      promotionAuthority: "board_closure_then_tenant_export",
      promotionAuthorityLabel: "Board closure, then tenant export",
      promotionTrigger: "board_closure",
      promotionTriggerLabel: "Board closure",
      promotionState: representative.promotionState,
      promotionStateLabel: representative.promotionStateLabel,
      promotionNextStep: representative.promotionNextStep,
      promotionNextStepLabel: representative.promotionNextStepLabel,
      promotionActionFamily: representative.promotionActionFamily,
      promotionActionFamilyLabel: representative.promotionActionFamilyLabel,
      assemblyShape: "package_record_set",
      assemblyShapeLabel: "Package record set",
      promotionPhase: "phase_two_package_export",
      promotionPhaseLabel: "Phase-two package export",
      promotionMutability: representative.promotionMutability,
      promotionMutabilityLabel: representative.promotionMutabilityLabel,
      promotionScope: "package_record_set_export",
      promotionScopeLabel: "Package record-set export",
      identityStability: representative.identityStability,
      identityStabilityLabel: representative.identityStabilityLabel,
      auditBacking: "package_closure_backed",
      auditBackingLabel: "Package-closure-backed",
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
      exportSequenceLabel: "Board-closure-following sequence",
      exportDependencyPolicy: "depends_on_governance_history_export",
      exportDependencyPolicyLabel: "Depends on governance history export",
      dependsOnCandidateIds: ["governance_history_export"],
      dependsOnCandidateLabels: ["Governance history export"],
      dependencySummary:
        representative.readiness === "after_board_closes"
          ? "This package bundle candidate still waits on board closure and later follows the governance history export candidate."
          : "This package bundle candidate follows the governance history export candidate once the tenant reaches export time.",
      ...(representative.nextEligibleSummary ? { nextEligibleSummary: representative.nextEligibleSummary } : {})
    });
  }

  return candidates;
}

function normalizeMemoryBoundary(
  memoryBoundary: HarnessBoardResponse["memoryBoundary"],
  board: Pick<HarnessBoardResponse, "completionPackage">
): HarnessBoardResponse["memoryBoundary"] {
  const operationalItems = memoryBoundary.operationalItems.map((item) => {
    const readiness = item.readiness ?? inferMemoryBoundaryReadiness(item.id, board);
    const role = item.role ?? inferMemoryBoundaryRole(item.id);
    const eligibilityRule = item.eligibilityRule ?? inferMemoryBoundaryEligibilityRule(item.id, board);
    const sourceSurface = item.sourceSurface ?? inferMemoryBoundarySourceSurface(item.id);
    const candidateClass = item.candidateClass ?? inferMemoryBoundaryCandidateClass(item.id);
    const durabilityCondition = item.durabilityCondition ?? inferMemoryBoundaryDurabilityCondition(item.id, board);
    const ownershipBoundary = item.ownershipBoundary ?? inferMemoryBoundaryOwnershipBoundary(item.id);
    const promotionPath = item.promotionPath ?? inferMemoryBoundaryPromotionPath(item.id, board);
    const recordTarget = item.recordTarget ?? inferMemoryBoundaryRecordTarget(item.id);
    const promotionBlocker = item.promotionBlocker ?? inferMemoryBoundaryPromotionBlocker(item.id, board);
    const promotionAuthority = item.promotionAuthority ?? inferMemoryBoundaryPromotionAuthority(item.id, board);
    const promotionTrigger = item.promotionTrigger ?? inferMemoryBoundaryPromotionTrigger(item.id, board);
    const promotionState = item.promotionState ?? inferMemoryBoundaryPromotionState(item.id, board);
    const promotionNextStep = item.promotionNextStep ?? inferMemoryBoundaryPromotionNextStep(item.id, board);
    const promotionActionFamily = item.promotionActionFamily ?? inferMemoryBoundaryPromotionActionFamily(item.id, board);
    const assemblyShape = item.assemblyShape ?? inferMemoryBoundaryAssemblyShape(item.id);
    const promotionPhase = item.promotionPhase ?? inferMemoryBoundaryPromotionPhase(item.id);
    const promotionMutability = item.promotionMutability ?? inferMemoryBoundaryPromotionMutability(item.id, board);
    const promotionScope = item.promotionScope ?? inferMemoryBoundaryPromotionScope(item.id);
    const identityStability = item.identityStability ?? inferMemoryBoundaryIdentityStability(item.id, board);
    const auditBacking = item.auditBacking ?? inferMemoryBoundaryAuditBacking(item.id);
    const concurrencyBoundary = item.concurrencyBoundary ?? inferMemoryBoundaryConcurrencyBoundary(item.id, board);
    const exportPayloadShape = item.exportPayloadShape ?? inferMemoryBoundaryExportPayloadShape(item.id);
    const idempotencyPolicy = item.idempotencyPolicy ?? inferMemoryBoundaryIdempotencyPolicy(item.id, board);
    const replaySafety = item.replaySafety ?? inferMemoryBoundaryReplaySafety(item.id, board);
    const conflictPolicy = item.conflictPolicy ?? inferMemoryBoundaryConflictPolicy(item.id, board);
    const exportAtomicity = item.exportAtomicity ?? inferMemoryBoundaryExportAtomicity(item.id, board);
    const exportDerivationBasis = item.exportDerivationBasis ?? inferMemoryBoundaryExportDerivationBasis(item.id);
    const exportRevisionPolicy = item.exportRevisionPolicy ?? inferMemoryBoundaryExportRevisionPolicy(item.id, board);
    const exportFreshnessSource = item.exportFreshnessSource ?? inferMemoryBoundaryExportFreshnessSource(item.id);
    const exportValidationBoundary =
      item.exportValidationBoundary ?? inferMemoryBoundaryExportValidationBoundary(item.id);
    const exportCompletenessRule = item.exportCompletenessRule ?? inferMemoryBoundaryExportCompletenessRule(item.id);
    const exportSensitivity = item.exportSensitivity ?? inferMemoryBoundaryExportSensitivity(item.id);
    const exportAudienceBoundary =
      item.exportAudienceBoundary ?? inferMemoryBoundaryExportAudienceBoundary(item.id);
    const exportSanitizationPolicy =
      item.exportSanitizationPolicy ?? inferMemoryBoundaryExportSanitizationPolicy(item.id);
    const exportRedactionBoundary =
      item.exportRedactionBoundary ?? inferMemoryBoundaryExportRedactionBoundary(item.id);
    const exportSourceDisclosurePolicy =
      item.exportSourceDisclosurePolicy ?? inferMemoryBoundaryExportSourceDisclosurePolicy(item.id);
    const memoryPlacement = item.memoryPlacement ?? inferMemoryBoundaryMemoryPlacement(item.id);
    const syncStrategy = item.syncStrategy ?? inferMemoryBoundarySyncStrategy(item.id);
    const exportRequestShape = item.exportRequestShape ?? inferMemoryBoundaryExportRequestShape(item.id);
    const exportConfirmationRequirement =
      item.exportConfirmationRequirement ?? inferMemoryBoundaryExportConfirmationRequirement(item.id);
    const exportRecoveryPath = item.exportRecoveryPath ?? inferMemoryBoundaryExportRecoveryPath(item.id);
    const runtimeMemoryShape = item.runtimeMemoryShape ?? inferRuntimeMemoryShape(item.id);
    const runtimeMemoryComponents = item.runtimeMemoryComponents ?? inferRuntimeMemoryComponents(item.id);
    const runtimeLongMemoryDisposition =
      item.runtimeLongMemoryDisposition ?? inferRuntimeLongMemoryDisposition();
    return {
      ...item,
      readiness,
      readinessLabel: item.readinessLabel ?? humanizeMemoryBoundaryReadiness(readiness),
      role,
      roleLabel: item.roleLabel ?? humanizeMemoryBoundaryRole(role),
      eligibilityRule,
      eligibilityRuleLabel: item.eligibilityRuleLabel ?? humanizeMemoryBoundaryEligibilityRule(eligibilityRule),
      sourceSurface,
      sourceSurfaceLabel: item.sourceSurfaceLabel ?? humanizeMemoryBoundarySourceSurface(sourceSurface),
      candidateClass,
      candidateClassLabel: item.candidateClassLabel ?? humanizeMemoryBoundaryCandidateClass(candidateClass),
      durabilityCondition,
      durabilityConditionLabel:
        item.durabilityConditionLabel ?? humanizeMemoryBoundaryDurabilityCondition(durabilityCondition),
      ownershipBoundary,
      ownershipBoundaryLabel:
        item.ownershipBoundaryLabel ?? humanizeMemoryBoundaryOwnershipBoundary(ownershipBoundary),
      promotionPath,
      promotionPathLabel:
        item.promotionPathLabel ?? humanizeMemoryBoundaryPromotionPath(promotionPath),
      recordTarget,
      recordTargetLabel:
        item.recordTargetLabel ?? humanizeMemoryBoundaryRecordTarget(recordTarget),
      promotionBlocker,
      promotionBlockerLabel:
        item.promotionBlockerLabel ?? humanizeMemoryBoundaryPromotionBlocker(promotionBlocker),
      promotionAuthority,
      promotionAuthorityLabel:
        item.promotionAuthorityLabel ?? humanizeMemoryBoundaryPromotionAuthority(promotionAuthority),
      promotionTrigger,
      promotionTriggerLabel:
        item.promotionTriggerLabel ?? humanizeMemoryBoundaryPromotionTrigger(promotionTrigger),
      promotionState,
      promotionStateLabel:
        item.promotionStateLabel ?? humanizeMemoryBoundaryPromotionState(promotionState),
      promotionNextStep,
      promotionNextStepLabel:
        item.promotionNextStepLabel ?? humanizeMemoryBoundaryPromotionNextStep(promotionNextStep),
      promotionActionFamily,
      promotionActionFamilyLabel:
        item.promotionActionFamilyLabel ?? humanizeMemoryBoundaryPromotionActionFamily(promotionActionFamily),
      assemblyShape,
      assemblyShapeLabel:
        item.assemblyShapeLabel ?? humanizeMemoryBoundaryAssemblyShape(assemblyShape),
      promotionPhase,
      promotionPhaseLabel:
        item.promotionPhaseLabel ?? humanizeMemoryBoundaryPromotionPhase(promotionPhase),
      promotionMutability,
      promotionMutabilityLabel:
        item.promotionMutabilityLabel ?? humanizeMemoryBoundaryPromotionMutability(promotionMutability),
      promotionScope,
      promotionScopeLabel:
        item.promotionScopeLabel ?? humanizeMemoryBoundaryPromotionScope(promotionScope),
      identityStability,
      identityStabilityLabel:
        item.identityStabilityLabel ?? humanizeMemoryBoundaryIdentityStability(identityStability),
      auditBacking,
      auditBackingLabel:
        item.auditBackingLabel ?? humanizeMemoryBoundaryAuditBacking(auditBacking),
      concurrencyBoundary,
      concurrencyBoundaryLabel:
        item.concurrencyBoundaryLabel ?? humanizeMemoryBoundaryConcurrencyBoundary(concurrencyBoundary),
      exportPayloadShape,
      exportPayloadShapeLabel:
        item.exportPayloadShapeLabel ?? humanizeMemoryBoundaryExportPayloadShape(exportPayloadShape),
      idempotencyPolicy,
      idempotencyPolicyLabel:
        item.idempotencyPolicyLabel ?? humanizeMemoryBoundaryIdempotencyPolicy(idempotencyPolicy),
      replaySafety,
      replaySafetyLabel:
        item.replaySafetyLabel ?? humanizeMemoryBoundaryReplaySafety(replaySafety),
      conflictPolicy,
      conflictPolicyLabel:
        item.conflictPolicyLabel ?? humanizeMemoryBoundaryConflictPolicy(conflictPolicy),
      exportAtomicity,
      exportAtomicityLabel:
        item.exportAtomicityLabel ?? humanizeMemoryBoundaryExportAtomicity(exportAtomicity),
      exportDerivationBasis,
      exportDerivationBasisLabel:
        item.exportDerivationBasisLabel ?? humanizeMemoryBoundaryExportDerivationBasis(exportDerivationBasis),
      exportRevisionPolicy,
      exportRevisionPolicyLabel:
        item.exportRevisionPolicyLabel ?? humanizeMemoryBoundaryExportRevisionPolicy(exportRevisionPolicy),
      exportFreshnessSource,
      exportFreshnessSourceLabel:
        item.exportFreshnessSourceLabel ?? humanizeMemoryBoundaryExportFreshnessSource(exportFreshnessSource),
      exportValidationBoundary,
      exportValidationBoundaryLabel:
        item.exportValidationBoundaryLabel ?? humanizeMemoryBoundaryExportValidationBoundary(exportValidationBoundary),
      exportCompletenessRule,
      exportCompletenessRuleLabel:
        item.exportCompletenessRuleLabel ?? humanizeMemoryBoundaryExportCompletenessRule(exportCompletenessRule),
      exportSensitivity,
      exportSensitivityLabel:
        item.exportSensitivityLabel ?? humanizeMemoryBoundaryExportSensitivity(exportSensitivity),
      exportAudienceBoundary,
      exportAudienceBoundaryLabel:
        item.exportAudienceBoundaryLabel ?? humanizeMemoryBoundaryExportAudienceBoundary(exportAudienceBoundary),
      exportSanitizationPolicy,
      exportSanitizationPolicyLabel:
        item.exportSanitizationPolicyLabel
        ?? humanizeMemoryBoundaryExportSanitizationPolicy(exportSanitizationPolicy),
      exportRedactionBoundary,
      exportRedactionBoundaryLabel:
        item.exportRedactionBoundaryLabel ?? humanizeMemoryBoundaryExportRedactionBoundary(exportRedactionBoundary),
      exportSourceDisclosurePolicy,
      exportSourceDisclosurePolicyLabel:
        item.exportSourceDisclosurePolicyLabel
        ?? humanizeMemoryBoundaryExportSourceDisclosurePolicy(exportSourceDisclosurePolicy),
      memoryPlacement,
      memoryPlacementLabel: item.memoryPlacementLabel ?? humanizeMemoryBoundaryMemoryPlacement(memoryPlacement),
      syncStrategy,
      syncStrategyLabel: item.syncStrategyLabel ?? humanizeMemoryBoundarySyncStrategy(syncStrategy),
      exportRequestShape,
      exportRequestShapeLabel:
        item.exportRequestShapeLabel ?? humanizeMemoryBoundaryExportRequestShape(exportRequestShape),
      exportConfirmationRequirement,
      exportConfirmationRequirementLabel:
        item.exportConfirmationRequirementLabel
        ?? humanizeMemoryBoundaryExportConfirmationRequirement(exportConfirmationRequirement),
      exportRecoveryPath,
      exportRecoveryPathLabel:
        item.exportRecoveryPathLabel ?? humanizeMemoryBoundaryExportRecoveryPath(exportRecoveryPath),
      runtimeMemoryShape,
      runtimeMemoryShapeLabel: item.runtimeMemoryShapeLabel ?? humanizeRuntimeMemoryShape(runtimeMemoryShape),
      runtimeMemoryComponents,
      runtimeMemoryComponentLabels:
        item.runtimeMemoryComponentLabels
        ?? runtimeMemoryComponents.map((component) => humanizeRuntimeMemoryComponent(component)),
      runtimeLongMemoryDisposition,
      runtimeLongMemoryDispositionLabel:
        item.runtimeLongMemoryDispositionLabel
        ?? humanizeRuntimeLongMemoryDisposition(runtimeLongMemoryDisposition),
      promotionActionDescription:
        item.promotionActionDescription
        ?? (promotionActionFamily === "none_runtime_only"
          ? "No export action applies. This runtime memory stays inside Wealth Factory orchestration."
          : promotionActionFamily === "board_closure_before_export"
          ? "Board closure still gates this memory before any later tenant export action can apply."
          : "This memory is ready to sit behind a later bounded tenant export action.")
    };
  });
  const exportReadyItems = memoryBoundary.exportReadyItems.map((item) => {
    const readiness = item.readiness ?? inferMemoryBoundaryReadiness(item.id, board);
    const role = item.role ?? inferMemoryBoundaryRole(item.id);
    const eligibilityRule = item.eligibilityRule ?? inferMemoryBoundaryEligibilityRule(item.id, board);
    const sourceSurface = item.sourceSurface ?? inferMemoryBoundarySourceSurface(item.id);
    const candidateClass = item.candidateClass ?? inferMemoryBoundaryCandidateClass(item.id);
    const durabilityCondition = item.durabilityCondition ?? inferMemoryBoundaryDurabilityCondition(item.id, board);
    const ownershipBoundary = item.ownershipBoundary ?? inferMemoryBoundaryOwnershipBoundary(item.id);
    const promotionPath = item.promotionPath ?? inferMemoryBoundaryPromotionPath(item.id, board);
    const recordTarget = item.recordTarget ?? inferMemoryBoundaryRecordTarget(item.id);
    const promotionBlocker = item.promotionBlocker ?? inferMemoryBoundaryPromotionBlocker(item.id, board);
    const promotionAuthority = item.promotionAuthority ?? inferMemoryBoundaryPromotionAuthority(item.id, board);
    const promotionTrigger = item.promotionTrigger ?? inferMemoryBoundaryPromotionTrigger(item.id, board);
    const promotionState = item.promotionState ?? inferMemoryBoundaryPromotionState(item.id, board);
    const promotionNextStep = item.promotionNextStep ?? inferMemoryBoundaryPromotionNextStep(item.id, board);
    const promotionActionFamily = item.promotionActionFamily ?? inferMemoryBoundaryPromotionActionFamily(item.id, board);
    const assemblyShape = item.assemblyShape ?? inferMemoryBoundaryAssemblyShape(item.id);
    const promotionPhase = item.promotionPhase ?? inferMemoryBoundaryPromotionPhase(item.id);
    const promotionMutability = item.promotionMutability ?? inferMemoryBoundaryPromotionMutability(item.id, board);
    const promotionScope = item.promotionScope ?? inferMemoryBoundaryPromotionScope(item.id);
    const identityStability = item.identityStability ?? inferMemoryBoundaryIdentityStability(item.id, board);
    const auditBacking = item.auditBacking ?? inferMemoryBoundaryAuditBacking(item.id);
    const concurrencyBoundary = item.concurrencyBoundary ?? inferMemoryBoundaryConcurrencyBoundary(item.id, board);
    const exportPayloadShape = item.exportPayloadShape ?? inferMemoryBoundaryExportPayloadShape(item.id);
    const idempotencyPolicy = item.idempotencyPolicy ?? inferMemoryBoundaryIdempotencyPolicy(item.id, board);
    const replaySafety = item.replaySafety ?? inferMemoryBoundaryReplaySafety(item.id, board);
    const conflictPolicy = item.conflictPolicy ?? inferMemoryBoundaryConflictPolicy(item.id, board);
    const exportAtomicity = item.exportAtomicity ?? inferMemoryBoundaryExportAtomicity(item.id, board);
    const exportDerivationBasis = item.exportDerivationBasis ?? inferMemoryBoundaryExportDerivationBasis(item.id);
    const exportRevisionPolicy = item.exportRevisionPolicy ?? inferMemoryBoundaryExportRevisionPolicy(item.id, board);
    const exportFreshnessSource = item.exportFreshnessSource ?? inferMemoryBoundaryExportFreshnessSource(item.id);
    const exportValidationBoundary =
      item.exportValidationBoundary ?? inferMemoryBoundaryExportValidationBoundary(item.id);
    const exportCompletenessRule = item.exportCompletenessRule ?? inferMemoryBoundaryExportCompletenessRule(item.id);
    const exportSensitivity = item.exportSensitivity ?? inferMemoryBoundaryExportSensitivity(item.id);
    const exportAudienceBoundary =
      item.exportAudienceBoundary ?? inferMemoryBoundaryExportAudienceBoundary(item.id);
    const exportSanitizationPolicy =
      item.exportSanitizationPolicy ?? inferMemoryBoundaryExportSanitizationPolicy(item.id);
    const exportRedactionBoundary =
      item.exportRedactionBoundary ?? inferMemoryBoundaryExportRedactionBoundary(item.id);
    const exportSourceDisclosurePolicy =
      item.exportSourceDisclosurePolicy ?? inferMemoryBoundaryExportSourceDisclosurePolicy(item.id);
    const memoryPlacement = item.memoryPlacement ?? inferMemoryBoundaryMemoryPlacement(item.id);
    const syncStrategy = item.syncStrategy ?? inferMemoryBoundarySyncStrategy(item.id);
    const exportRequestShape = item.exportRequestShape ?? inferMemoryBoundaryExportRequestShape(item.id);
    const exportConfirmationRequirement =
      item.exportConfirmationRequirement ?? inferMemoryBoundaryExportConfirmationRequirement(item.id);
    const exportRecoveryPath = item.exportRecoveryPath ?? inferMemoryBoundaryExportRecoveryPath(item.id);
    const nextEligibleSummary = item.nextEligibleSummary
      ?? (readiness === "after_board_closes"
        ? item.id === "package_governance"
          ? "Board closure is still required before this package-shaped governance memory becomes a durable tenant record candidate."
          : item.id === "package_deliverables"
          ? "Board closure is still required before this packaged deliverable becomes a durable tenant record candidate."
          : undefined
        : undefined);
    return {
      ...item,
      readiness,
      readinessLabel: item.readinessLabel ?? humanizeMemoryBoundaryReadiness(readiness),
      role,
      roleLabel: item.roleLabel ?? humanizeMemoryBoundaryRole(role),
      eligibilityRule,
      eligibilityRuleLabel: item.eligibilityRuleLabel ?? humanizeMemoryBoundaryEligibilityRule(eligibilityRule),
      sourceSurface,
      sourceSurfaceLabel: item.sourceSurfaceLabel ?? humanizeMemoryBoundarySourceSurface(sourceSurface),
      candidateClass,
      candidateClassLabel: item.candidateClassLabel ?? humanizeMemoryBoundaryCandidateClass(candidateClass),
      durabilityCondition,
      durabilityConditionLabel:
        item.durabilityConditionLabel ?? humanizeMemoryBoundaryDurabilityCondition(durabilityCondition),
      ownershipBoundary,
      ownershipBoundaryLabel:
        item.ownershipBoundaryLabel ?? humanizeMemoryBoundaryOwnershipBoundary(ownershipBoundary),
      promotionPath,
      promotionPathLabel:
        item.promotionPathLabel ?? humanizeMemoryBoundaryPromotionPath(promotionPath),
      recordTarget,
      recordTargetLabel:
        item.recordTargetLabel ?? humanizeMemoryBoundaryRecordTarget(recordTarget),
      promotionBlocker,
      promotionBlockerLabel:
        item.promotionBlockerLabel ?? humanizeMemoryBoundaryPromotionBlocker(promotionBlocker),
      promotionAuthority,
      promotionAuthorityLabel:
        item.promotionAuthorityLabel ?? humanizeMemoryBoundaryPromotionAuthority(promotionAuthority),
      promotionTrigger,
      promotionTriggerLabel:
        item.promotionTriggerLabel ?? humanizeMemoryBoundaryPromotionTrigger(promotionTrigger),
      promotionState,
      promotionStateLabel:
        item.promotionStateLabel ?? humanizeMemoryBoundaryPromotionState(promotionState),
      promotionNextStep,
      promotionNextStepLabel:
        item.promotionNextStepLabel ?? humanizeMemoryBoundaryPromotionNextStep(promotionNextStep),
      promotionActionFamily,
      promotionActionFamilyLabel:
        item.promotionActionFamilyLabel ?? humanizeMemoryBoundaryPromotionActionFamily(promotionActionFamily),
      assemblyShape,
      assemblyShapeLabel:
        item.assemblyShapeLabel ?? humanizeMemoryBoundaryAssemblyShape(assemblyShape),
      promotionPhase,
      promotionPhaseLabel:
        item.promotionPhaseLabel ?? humanizeMemoryBoundaryPromotionPhase(promotionPhase),
      promotionMutability,
      promotionMutabilityLabel:
        item.promotionMutabilityLabel ?? humanizeMemoryBoundaryPromotionMutability(promotionMutability),
      promotionScope,
      promotionScopeLabel:
        item.promotionScopeLabel ?? humanizeMemoryBoundaryPromotionScope(promotionScope),
      identityStability,
      identityStabilityLabel:
        item.identityStabilityLabel ?? humanizeMemoryBoundaryIdentityStability(identityStability),
      auditBacking,
      auditBackingLabel:
        item.auditBackingLabel ?? humanizeMemoryBoundaryAuditBacking(auditBacking),
      concurrencyBoundary,
      concurrencyBoundaryLabel:
        item.concurrencyBoundaryLabel ?? humanizeMemoryBoundaryConcurrencyBoundary(concurrencyBoundary),
      exportPayloadShape,
      exportPayloadShapeLabel:
        item.exportPayloadShapeLabel ?? humanizeMemoryBoundaryExportPayloadShape(exportPayloadShape),
      idempotencyPolicy,
      idempotencyPolicyLabel:
        item.idempotencyPolicyLabel ?? humanizeMemoryBoundaryIdempotencyPolicy(idempotencyPolicy),
      replaySafety,
      replaySafetyLabel:
        item.replaySafetyLabel ?? humanizeMemoryBoundaryReplaySafety(replaySafety),
      conflictPolicy,
      conflictPolicyLabel:
        item.conflictPolicyLabel ?? humanizeMemoryBoundaryConflictPolicy(conflictPolicy),
      exportAtomicity,
      exportAtomicityLabel:
        item.exportAtomicityLabel ?? humanizeMemoryBoundaryExportAtomicity(exportAtomicity),
      exportDerivationBasis,
      exportDerivationBasisLabel:
        item.exportDerivationBasisLabel ?? humanizeMemoryBoundaryExportDerivationBasis(exportDerivationBasis),
      exportRevisionPolicy,
      exportRevisionPolicyLabel:
        item.exportRevisionPolicyLabel ?? humanizeMemoryBoundaryExportRevisionPolicy(exportRevisionPolicy),
      exportFreshnessSource,
      exportFreshnessSourceLabel:
        item.exportFreshnessSourceLabel ?? humanizeMemoryBoundaryExportFreshnessSource(exportFreshnessSource),
      exportValidationBoundary,
      exportValidationBoundaryLabel:
        item.exportValidationBoundaryLabel ?? humanizeMemoryBoundaryExportValidationBoundary(exportValidationBoundary),
      exportCompletenessRule,
      exportCompletenessRuleLabel:
        item.exportCompletenessRuleLabel ?? humanizeMemoryBoundaryExportCompletenessRule(exportCompletenessRule),
      exportSensitivity,
      exportSensitivityLabel:
        item.exportSensitivityLabel ?? humanizeMemoryBoundaryExportSensitivity(exportSensitivity),
      exportAudienceBoundary,
      exportAudienceBoundaryLabel:
        item.exportAudienceBoundaryLabel ?? humanizeMemoryBoundaryExportAudienceBoundary(exportAudienceBoundary),
      exportSanitizationPolicy,
      exportSanitizationPolicyLabel:
        item.exportSanitizationPolicyLabel
        ?? humanizeMemoryBoundaryExportSanitizationPolicy(exportSanitizationPolicy),
      exportRedactionBoundary,
      exportRedactionBoundaryLabel:
        item.exportRedactionBoundaryLabel ?? humanizeMemoryBoundaryExportRedactionBoundary(exportRedactionBoundary),
      exportSourceDisclosurePolicy,
      exportSourceDisclosurePolicyLabel:
        item.exportSourceDisclosurePolicyLabel
        ?? humanizeMemoryBoundaryExportSourceDisclosurePolicy(exportSourceDisclosurePolicy),
      memoryPlacement,
      memoryPlacementLabel: item.memoryPlacementLabel ?? humanizeMemoryBoundaryMemoryPlacement(memoryPlacement),
      syncStrategy,
      syncStrategyLabel: item.syncStrategyLabel ?? humanizeMemoryBoundarySyncStrategy(syncStrategy),
      exportRequestShape,
      exportRequestShapeLabel:
        item.exportRequestShapeLabel ?? humanizeMemoryBoundaryExportRequestShape(exportRequestShape),
      exportConfirmationRequirement,
      exportConfirmationRequirementLabel:
        item.exportConfirmationRequirementLabel
        ?? humanizeMemoryBoundaryExportConfirmationRequirement(exportConfirmationRequirement),
      exportRecoveryPath,
      exportRecoveryPathLabel:
        item.exportRecoveryPathLabel ?? humanizeMemoryBoundaryExportRecoveryPath(exportRecoveryPath),
      promotionActionDescription:
        item.promotionActionDescription
        ?? (promotionActionFamily === "board_closure_before_export"
          ? "Board closure still gates this memory before any later tenant export action can apply."
          : "This memory is ready to sit behind a later bounded tenant export action."),
      ...(nextEligibleSummary ? { nextEligibleSummary } : {})
    };
  });
  const readyNowCount = memoryBoundary.readyNowCount
    ?? exportReadyItems.filter((item) => item.readiness === "ready_now").length;
  const waitingOnBoardClosureCount = memoryBoundary.waitingOnBoardClosureCount
    ?? exportReadyItems.filter((item) => item.readiness === "after_board_closes").length;
  const governanceReadyCount = memoryBoundary.governanceReadyCount
    ?? exportReadyItems.filter((item) => item.role === "governance_record_candidate" && item.readiness === "ready_now").length;
  const packagedReadyCount = memoryBoundary.packagedReadyCount
    ?? exportReadyItems.filter((item) => item.role === "packaged_record_candidate" && item.readiness === "ready_now").length;
  const packagedWaitingCount = memoryBoundary.packagedWaitingCount
    ?? exportReadyItems.filter((item) => item.role === "packaged_record_candidate" && item.readiness === "after_board_closes").length;
  const blockedCandidateCount = memoryBoundary.blockedCandidateCount
    ?? exportReadyItems.filter((item) => item.promotionBlocker === "board_closure_required").length;
  const tenantControlledCandidateCount = memoryBoundary.tenantControlledCandidateCount
    ?? exportReadyItems.filter((item) => item.promotionAuthority === "tenant_explicit_export").length;
  const boardControlledCandidateCount = memoryBoundary.boardControlledCandidateCount
    ?? exportReadyItems.filter((item) => item.promotionAuthority === "board_closure_then_tenant_export").length;
  const tenantExportTriggerCount = memoryBoundary.tenantExportTriggerCount
    ?? exportReadyItems.filter((item) => item.promotionTrigger === "tenant_export_request").length;
  const boardClosureTriggerCount = memoryBoundary.boardClosureTriggerCount
    ?? exportReadyItems.filter((item) => item.promotionTrigger === "board_closure").length;
  const runtimeOnlyStateCount = memoryBoundary.runtimeOnlyStateCount
    ?? operationalItems.filter((item) => item.promotionState === "runtime_only").length;
  const readyForTenantExportStateCount = memoryBoundary.readyForTenantExportStateCount
    ?? exportReadyItems.filter((item) => item.promotionState === "ready_for_tenant_export").length;
  const awaitingBoardClosureStateCount = memoryBoundary.awaitingBoardClosureStateCount
    ?? exportReadyItems.filter((item) => item.promotionState === "awaiting_board_closure").length;
  const runtimeOnlyNextStepCount = memoryBoundary.runtimeOnlyNextStepCount
    ?? operationalItems.filter((item) => item.promotionNextStep === "none_runtime_only").length;
  const tenantExportAvailableNextStepCount = memoryBoundary.tenantExportAvailableNextStepCount
    ?? exportReadyItems.filter((item) => item.promotionNextStep === "tenant_export_available").length;
  const boardClosureThenTenantExportNextStepCount = memoryBoundary.boardClosureThenTenantExportNextStepCount
    ?? exportReadyItems.filter((item) => item.promotionNextStep === "board_closure_then_tenant_export").length;
  const noPromotionActionCount = memoryBoundary.noPromotionActionCount
    ?? operationalItems.filter((item) => item.promotionActionFamily === "none_runtime_only").length;
  const tenantExportActionFamilyCount = memoryBoundary.tenantExportActionFamilyCount
    ?? exportReadyItems.filter((item) => item.promotionActionFamily === "tenant_export_candidate").length;
  const boardClosureActionFamilyCount = memoryBoundary.boardClosureActionFamilyCount
    ?? exportReadyItems.filter((item) => item.promotionActionFamily === "board_closure_before_export").length;
  const noAssemblyShapeCount = memoryBoundary.noAssemblyShapeCount
    ?? operationalItems.filter((item) => item.assemblyShape === "none_runtime_only").length;
  const standaloneExportRecordCount = memoryBoundary.standaloneExportRecordCount
    ?? exportReadyItems.filter((item) => item.assemblyShape === "standalone_export_record").length;
  const packageRecordSetCount = memoryBoundary.packageRecordSetCount
    ?? exportReadyItems.filter((item) => item.assemblyShape === "package_record_set").length;
  const noExportPhaseCount = memoryBoundary.noExportPhaseCount
    ?? operationalItems.filter((item) => item.promotionPhase === "not_exported_runtime").length;
  const phaseOneExportCount = memoryBoundary.phaseOneExportCount
    ?? exportReadyItems.filter((item) => item.promotionPhase === "phase_one_governance_history").length;
  const phaseTwoExportCount = memoryBoundary.phaseTwoExportCount
    ?? exportReadyItems.filter((item) => item.promotionPhase === "phase_two_package_export").length;
  const runtimeMutableCount = memoryBoundary.runtimeMutableCount
    ?? operationalItems.filter((item) => item.promotionMutability === "runtime_mutable").length;
  const appendOnlyHistoryCount = memoryBoundary.appendOnlyHistoryCount
    ?? exportReadyItems.filter((item) => item.promotionMutability === "append_only_history").length;
  const replaceableSnapshotCount = memoryBoundary.replaceableSnapshotCount
    ?? exportReadyItems.filter((item) => item.promotionMutability === "replaceable_until_board_closure").length;
  const stableSnapshotCount = memoryBoundary.stableSnapshotCount
    ?? exportReadyItems.filter((item) => item.promotionMutability === "stable_snapshot").length;
  const noPromotionScopeCount = memoryBoundary.noPromotionScopeCount
    ?? operationalItems.filter((item) => item.promotionScope === "none_runtime_only").length;
  const singleRecordExportScopeCount = memoryBoundary.singleRecordExportScopeCount
    ?? exportReadyItems.filter((item) => item.promotionScope === "single_record_export").length;
  const packageRecordSetExportScopeCount = memoryBoundary.packageRecordSetExportScopeCount
    ?? exportReadyItems.filter((item) => item.promotionScope === "package_record_set_export").length;
  const transientIdentityCount = memoryBoundary.transientIdentityCount
    ?? operationalItems.filter((item) => item.identityStability === "runtime_transient_identity").length;
  const stableIdentityCount = memoryBoundary.stableIdentityCount
    ?? [...operationalItems, ...exportReadyItems].filter((item) => item.identityStability === "stable_record_identity").length;
  const closureFinalizedIdentityCount = memoryBoundary.closureFinalizedIdentityCount
    ?? exportReadyItems.filter((item) => item.identityStability === "finalized_after_board_closure").length;
  const runtimeStateOnlyAuditCount = memoryBoundary.runtimeStateOnlyAuditCount
    ?? operationalItems.filter((item) => item.auditBacking === "runtime_state_only").length;
  const decisionLedgerAuditCount = memoryBoundary.decisionLedgerAuditCount
    ?? exportReadyItems.filter((item) => item.auditBacking === "decision_ledger_backed").length;
  const packageClosureAuditCount = memoryBoundary.packageClosureAuditCount
    ?? exportReadyItems.filter((item) => item.auditBacking === "package_closure_backed").length;
  const runtimeOnlyConcurrencyCount = memoryBoundary.runtimeOnlyConcurrencyCount
    ?? operationalItems.filter((item) => item.concurrencyBoundary === "runtime_only").length;
  const independentExportSafeCount = memoryBoundary.independentExportSafeCount
    ?? exportReadyItems.filter((item) => item.concurrencyBoundary === "independent_export_safe").length;
  const requiresBoardClosureSnapshotCount = memoryBoundary.requiresBoardClosureSnapshotCount
    ?? exportReadyItems.filter((item) => item.concurrencyBoundary === "requires_board_closure_snapshot").length;
  const noExportPayloadShapeCount = memoryBoundary.noExportPayloadShapeCount
    ?? operationalItems.filter((item) => item.exportPayloadShape === "none_runtime_only").length;
  const governanceHistoryPayloadCount = memoryBoundary.governanceHistoryPayloadCount
    ?? exportReadyItems.filter((item) => item.exportPayloadShape === "governance_history_record").length;
  const packageSnapshotBundleCount = memoryBoundary.packageSnapshotBundleCount
    ?? exportReadyItems.filter((item) => item.exportPayloadShape === "package_snapshot_bundle").length;
  const noIdempotencyPolicyCount = memoryBoundary.noIdempotencyPolicyCount
    ?? operationalItems.filter((item) => item.idempotencyPolicy === "not_applicable_runtime").length;
  const deterministicUpsertCount = memoryBoundary.deterministicUpsertCount
    ?? exportReadyItems.filter((item) => item.idempotencyPolicy === "deterministic_upsert").length;
  const boardClosureSnapshotOnceCount = memoryBoundary.boardClosureSnapshotOnceCount
    ?? exportReadyItems.filter((item) => item.idempotencyPolicy === "board_closure_snapshot_once").length;
  const runtimeOnlyReplaySafetyCount = memoryBoundary.runtimeOnlyReplaySafetyCount
    ?? operationalItems.filter((item) => item.replaySafety === "runtime_only").length;
  const replaySafeCount = memoryBoundary.replaySafeCount
    ?? exportReadyItems.filter((item) => item.replaySafety === "replay_safe").length;
  const freshClosureSnapshotReplayCount = memoryBoundary.freshClosureSnapshotReplayCount
    ?? exportReadyItems.filter((item) => item.replaySafety === "requires_fresh_board_closure_snapshot").length;
  const runtimeOnlyConflictPolicyCount = memoryBoundary.runtimeOnlyConflictPolicyCount
    ?? operationalItems.filter((item) => item.conflictPolicy === "runtime_only").length;
  const appendOrUpsertConflictCount = memoryBoundary.appendOrUpsertConflictCount
    ?? exportReadyItems.filter((item) => item.conflictPolicy === "append_or_upsert").length;
  const replaceLatestClosureSnapshotCount = memoryBoundary.replaceLatestClosureSnapshotCount
    ?? exportReadyItems.filter((item) => item.conflictPolicy === "replace_latest_closure_snapshot").length;
  const noExportAtomicityCount = memoryBoundary.noExportAtomicityCount
    ?? operationalItems.filter((item) => item.exportAtomicity === "none_runtime_only").length;
  const recordLevelAtomicCount = memoryBoundary.recordLevelAtomicCount
    ?? exportReadyItems.filter((item) => item.exportAtomicity === "record_level_atomic").length;
  const closureBundleAtomicCount = memoryBoundary.closureBundleAtomicCount
    ?? exportReadyItems.filter((item) => item.exportAtomicity === "closure_bundle_atomic").length;
  const noExportDerivationBasisCount = memoryBoundary.noExportDerivationBasisCount
    ?? operationalItems.filter((item) => item.exportDerivationBasis === "none_runtime_only").length;
  const decisionHistoryDerivedCount = memoryBoundary.decisionHistoryDerivedCount
    ?? exportReadyItems.filter((item) => item.exportDerivationBasis === "decision_history_derived").length;
  const boardClosureSnapshotDerivedCount = memoryBoundary.boardClosureSnapshotDerivedCount
    ?? exportReadyItems.filter((item) => item.exportDerivationBasis === "board_closure_snapshot_derived").length;
  const noExportRevisionPolicyCount = memoryBoundary.noExportRevisionPolicyCount
    ?? operationalItems.filter((item) => item.exportRevisionPolicy === "none_runtime_only").length;
  const appendNewRevisionCount = memoryBoundary.appendNewRevisionCount
    ?? exportReadyItems.filter((item) => item.exportRevisionPolicy === "append_new_revision").length;
  const replaceClosureBundleRevisionCount = memoryBoundary.replaceClosureBundleRevisionCount
    ?? exportReadyItems.filter((item) => item.exportRevisionPolicy === "replace_closure_bundle_revision").length;
  const noExportFreshnessSourceCount = memoryBoundary.noExportFreshnessSourceCount
    ?? operationalItems.filter((item) => item.exportFreshnessSource === "none_runtime_only").length;
  const latestRecordStateCount = memoryBoundary.latestRecordStateCount
    ?? exportReadyItems.filter((item) => item.exportFreshnessSource === "latest_record_state").length;
  const latestBoardClosureSnapshotCount = memoryBoundary.latestBoardClosureSnapshotCount
    ?? exportReadyItems.filter((item) => item.exportFreshnessSource === "latest_board_closure_snapshot").length;
  const noExportValidationBoundaryCount = memoryBoundary.noExportValidationBoundaryCount
    ?? operationalItems.filter((item) => item.exportValidationBoundary === "none_runtime_only").length;
  const recordLevelValidationCount = memoryBoundary.recordLevelValidationCount
    ?? exportReadyItems.filter((item) => item.exportValidationBoundary === "record_level_validation").length;
  const closureBundleValidationCount = memoryBoundary.closureBundleValidationCount
    ?? exportReadyItems.filter((item) => item.exportValidationBoundary === "closure_bundle_validation").length;
  const noExportCompletenessRuleCount = memoryBoundary.noExportCompletenessRuleCount
    ?? operationalItems.filter((item) => item.exportCompletenessRule === "none_runtime_only").length;
  const selfContainedRecordCount = memoryBoundary.selfContainedRecordCount
    ?? exportReadyItems.filter((item) => item.exportCompletenessRule === "self_contained_record").length;
  const boardClosureCompleteBundleCount = memoryBoundary.boardClosureCompleteBundleCount
    ?? exportReadyItems.filter((item) => item.exportCompletenessRule === "board_closure_complete_bundle").length;
  const noExportSensitivityCount = memoryBoundary.noExportSensitivityCount
    ?? operationalItems.filter((item) => item.exportSensitivity === "none_runtime_only").length;
  const tenantBusinessContextCount = memoryBoundary.tenantBusinessContextCount
    ?? exportReadyItems.filter((item) => item.exportSensitivity === "tenant_business_context").length;
  const tenantDeliverableContextCount = memoryBoundary.tenantDeliverableContextCount
    ?? exportReadyItems.filter((item) => item.exportSensitivity === "tenant_deliverable_context").length;
  const runtimeOnlyAudienceCount = memoryBoundary.runtimeOnlyAudienceCount
    ?? operationalItems.filter((item) => item.exportAudienceBoundary === "wealth_factory_runtime_only").length;
  const governanceHistoryAudienceCount = memoryBoundary.governanceHistoryAudienceCount
    ?? exportReadyItems.filter((item) => item.exportAudienceBoundary === "tenant_governance_history_readers").length;
  const packageConsumerAudienceCount = memoryBoundary.packageConsumerAudienceCount
    ?? exportReadyItems.filter((item) => item.exportAudienceBoundary === "tenant_package_consumers").length;
  const noExportSanitizationCount = memoryBoundary.noExportSanitizationCount
    ?? operationalItems.filter((item) => item.exportSanitizationPolicy === "none_runtime_only").length;
  const exportAsRecordedCount = memoryBoundary.exportAsRecordedCount
    ?? exportReadyItems.filter((item) => item.exportSanitizationPolicy === "export_as_recorded").length;
  const sanitizeBeforePackageExportCount = memoryBoundary.sanitizeBeforePackageExportCount
    ?? exportReadyItems.filter((item) => item.exportSanitizationPolicy === "sanitize_before_package_export").length;
  const runtimeInternalOnlyRedactionCount = memoryBoundary.runtimeInternalOnlyRedactionCount
    ?? operationalItems.filter((item) => item.exportRedactionBoundary === "runtime_internal_only").length;
  const governanceSafeRedactionCount = memoryBoundary.governanceSafeRedactionCount
    ?? exportReadyItems.filter((item) => item.exportRedactionBoundary === "governance_safe_redaction").length;
  const packageSafeRedactionCount = memoryBoundary.packageSafeRedactionCount
    ?? exportReadyItems.filter((item) => item.exportRedactionBoundary === "package_safe_redaction").length;
  const runtimeOnlySourceDisclosureCount = memoryBoundary.runtimeOnlySourceDisclosureCount
    ?? operationalItems.filter((item) => item.exportSourceDisclosurePolicy === "runtime_only").length;
  const decisionSummaryOnlyCount = memoryBoundary.decisionSummaryOnlyCount
    ?? exportReadyItems.filter((item) => item.exportSourceDisclosurePolicy === "decision_summary_only").length;
  const closureSnapshotSummaryOnlyCount = memoryBoundary.closureSnapshotSummaryOnlyCount
    ?? exportReadyItems.filter((item) => item.exportSourceDisclosurePolicy === "closure_snapshot_summary_only").length;
  const noMemoryPlacementCount = memoryBoundary.noMemoryPlacementCount
    ?? operationalItems.filter((item) => item.memoryPlacement === "none_runtime_only").length;
  const governanceHistoryNoteCount = memoryBoundary.governanceHistoryNoteCount
    ?? exportReadyItems.filter((item) => item.memoryPlacement === "governance_history_note").length;
  const packageRecordFolderCount = memoryBoundary.packageRecordFolderCount
    ?? exportReadyItems.filter((item) => item.memoryPlacement === "package_record_folder").length;
  const noSyncStrategyCount = memoryBoundary.noSyncStrategyCount
    ?? operationalItems.filter((item) => item.syncStrategy === "none_runtime_only").length;
  const appendHistoryEntryCount = memoryBoundary.appendHistoryEntryCount
    ?? exportReadyItems.filter((item) => item.syncStrategy === "append_history_entry").length;
  const replacePackageSnapshotAfterClosureCount = memoryBoundary.replacePackageSnapshotAfterClosureCount
    ?? exportReadyItems.filter((item) => item.syncStrategy === "replace_package_snapshot_after_board_closure").length;
  const noExportRequestShapeCount = memoryBoundary.noExportRequestShapeCount
    ?? operationalItems.filter((item) => item.exportRequestShape === "none_runtime_only").length;
  const singleRecordExportRequestCount = memoryBoundary.singleRecordExportRequestCount
    ?? exportReadyItems.filter((item) => item.exportRequestShape === "single_record_export_request").length;
  const packageBundleExportRequestCount = memoryBoundary.packageBundleExportRequestCount
    ?? exportReadyItems.filter((item) => item.exportRequestShape === "package_bundle_export_request").length;
  const noExportConfirmationRequirementCount = memoryBoundary.noExportConfirmationRequirementCount
    ?? operationalItems.filter((item) => item.exportConfirmationRequirement === "none_runtime_only").length;
  const tenantExportConfirmationCount = memoryBoundary.tenantExportConfirmationCount
    ?? exportReadyItems.filter((item) => item.exportConfirmationRequirement === "tenant_export_confirmation").length;
  const boardClosureThenTenantExportConfirmationCount = memoryBoundary.boardClosureThenTenantExportConfirmationCount
    ?? exportReadyItems.filter((item) => item.exportConfirmationRequirement === "board_closure_then_tenant_export_confirmation").length;
  const runtimeOnlyRecoveryPathCount = memoryBoundary.runtimeOnlyRecoveryPathCount
    ?? operationalItems.filter((item) => item.exportRecoveryPath === "runtime_only").length;
  const retryLatestRecordExportCount = memoryBoundary.retryLatestRecordExportCount
    ?? exportReadyItems.filter((item) => item.exportRecoveryPath === "retry_latest_record_export").length;
  const rerunAfterBoardClosureSnapshotCount = memoryBoundary.rerunAfterBoardClosureSnapshotCount
    ?? exportReadyItems.filter((item) => item.exportRecoveryPath === "rerun_after_board_closure_snapshot").length;
  const continuityTrioRuntimeItemCount = memoryBoundary.continuityTrioRuntimeItemCount
    ?? operationalItems.filter((item) => item.runtimeMemoryShape === "bounded_continuity_trio").length;
  const attentionSignalRuntimeItemCount = memoryBoundary.attentionSignalRuntimeItemCount
    ?? operationalItems.filter((item) => item.runtimeMemoryShape === "bounded_attention_signal").length;
  const runtimeOnlyLongMemoryItemCount = memoryBoundary.runtimeOnlyLongMemoryItemCount
    ?? operationalItems.filter((item) => item.runtimeLongMemoryDisposition === "stays_runtime_only").length;
  const exportCandidates = buildExportCandidatesFromMemoryBoundaryItems(exportReadyItems).map(
    (candidate) =>
      candidate.id === "governance_history_export"
        ? {
            ...candidate,
            eligibilityRule: candidate.eligibilityRule ?? "explicit_export_later",
            eligibilityRuleLabel: candidate.eligibilityRuleLabel ?? "Explicit export later",
            sourceSurface: candidate.sourceSurface ?? "recent_decisions",
            sourceSurfaceLabel: candidate.sourceSurfaceLabel ?? "Recent decisions",
            candidateClass: candidate.candidateClass ?? "governance_history",
            candidateClassLabel: candidate.candidateClassLabel ?? "Governance history",
            durabilityCondition: candidate.durabilityCondition ?? "stable_when_recorded",
            durabilityConditionLabel: candidate.durabilityConditionLabel ?? "Stable when recorded",
            ownershipBoundary: candidate.ownershipBoundary ?? "tenant_owned_later",
            ownershipBoundaryLabel: candidate.ownershipBoundaryLabel ?? "Tenant-owned later",
            promotionPath: candidate.promotionPath ?? "ready_for_explicit_export",
            promotionPathLabel: candidate.promotionPathLabel ?? "Ready for explicit export",
            recordTarget: candidate.recordTarget ?? "governance_history_record",
            recordTargetLabel: candidate.recordTargetLabel ?? "Governance history record",
            promotionBlocker: candidate.promotionBlocker ?? "none_ready_now",
            promotionBlockerLabel: candidate.promotionBlockerLabel ?? "No promotion blocker",
            promotionAuthority: candidate.promotionAuthority ?? "tenant_explicit_export",
            promotionAuthorityLabel: candidate.promotionAuthorityLabel ?? "Tenant explicit export",
            promotionTrigger: candidate.promotionTrigger ?? "tenant_export_request",
            promotionTriggerLabel: candidate.promotionTriggerLabel ?? "Tenant export request",
            exportPayloadShape: candidate.exportPayloadShape ?? "governance_history_record",
            exportPayloadShapeLabel: candidate.exportPayloadShapeLabel ?? "Governance history record",
            idempotencyPolicy: candidate.idempotencyPolicy ?? "deterministic_upsert",
            idempotencyPolicyLabel: candidate.idempotencyPolicyLabel ?? "Deterministic upsert",
            replaySafety: candidate.replaySafety ?? "replay_safe",
            replaySafetyLabel: candidate.replaySafetyLabel ?? "Replay-safe",
            conflictPolicy: candidate.conflictPolicy ?? "append_or_upsert",
            conflictPolicyLabel: candidate.conflictPolicyLabel ?? "Append or upsert",
            exportAtomicity: candidate.exportAtomicity ?? "record_level_atomic",
            exportAtomicityLabel: candidate.exportAtomicityLabel ?? "Record-level atomic",
            exportDerivationBasis: candidate.exportDerivationBasis ?? "decision_history_derived",
            exportDerivationBasisLabel: candidate.exportDerivationBasisLabel ?? "Decision-history-derived",
            exportRevisionPolicy: candidate.exportRevisionPolicy ?? "append_new_revision",
            exportRevisionPolicyLabel: candidate.exportRevisionPolicyLabel ?? "Append new revision",
            exportFreshnessSource: candidate.exportFreshnessSource ?? "latest_record_state",
            exportFreshnessSourceLabel: candidate.exportFreshnessSourceLabel ?? "Latest record state",
            exportValidationBoundary: candidate.exportValidationBoundary ?? "record_level_validation",
            exportValidationBoundaryLabel: candidate.exportValidationBoundaryLabel ?? "Record-level validation",
            exportCompletenessRule: candidate.exportCompletenessRule ?? "self_contained_record",
            exportCompletenessRuleLabel: candidate.exportCompletenessRuleLabel ?? "Self-contained record",
            exportSensitivity: candidate.exportSensitivity ?? "tenant_business_context",
            exportSensitivityLabel: candidate.exportSensitivityLabel ?? "Tenant business context",
            exportAudienceBoundary: candidate.exportAudienceBoundary ?? "tenant_governance_history_readers",
            exportAudienceBoundaryLabel:
              candidate.exportAudienceBoundaryLabel ?? "Tenant governance-history readers",
            exportSanitizationPolicy: candidate.exportSanitizationPolicy ?? "export_as_recorded",
            exportSanitizationPolicyLabel: candidate.exportSanitizationPolicyLabel ?? "Export as recorded",
            exportRedactionBoundary: candidate.exportRedactionBoundary ?? "governance_safe_redaction",
            exportRedactionBoundaryLabel: candidate.exportRedactionBoundaryLabel ?? "Governance-safe redaction",
            exportSourceDisclosurePolicy:
              candidate.exportSourceDisclosurePolicy ?? "decision_summary_only",
            exportSourceDisclosurePolicyLabel:
              candidate.exportSourceDisclosurePolicyLabel ?? "Decision summary only",
            assemblyShape: candidate.assemblyShape ?? "standalone_export_record",
            assemblyShapeLabel: candidate.assemblyShapeLabel ?? "Standalone export record",
            promotionPhase: candidate.promotionPhase ?? "phase_one_governance_history",
            promotionPhaseLabel: candidate.promotionPhaseLabel ?? "Phase-one export",
            promotionMutability: candidate.promotionMutability ?? "append_only_history",
            promotionMutabilityLabel: candidate.promotionMutabilityLabel ?? "Append-only history",
            promotionScope: candidate.promotionScope ?? "single_record_export",
            promotionScopeLabel: candidate.promotionScopeLabel ?? "Single-record export",
            identityStability: candidate.identityStability ?? "stable_record_identity",
            identityStabilityLabel: candidate.identityStabilityLabel ?? "Stable record identity",
            auditBacking: candidate.auditBacking ?? "decision_ledger_backed",
            auditBackingLabel: candidate.auditBackingLabel ?? "Decision-ledger-backed",
            concurrencyBoundary: candidate.concurrencyBoundary ?? "independent_export_safe",
            concurrencyBoundaryLabel: candidate.concurrencyBoundaryLabel ?? "Independent export safe",
            exportSequence: candidate.exportSequence ?? "foundational_first",
            exportSequenceLabel: candidate.exportSequenceLabel ?? "Foundational export sequence",
            exportDependencyPolicy: candidate.exportDependencyPolicy ?? "independent_candidate",
            exportDependencyPolicyLabel: candidate.exportDependencyPolicyLabel ?? "Independent export candidate",
            dependsOnCandidateIds: candidate.dependsOnCandidateIds ?? [],
            dependsOnCandidateLabels: candidate.dependsOnCandidateLabels ?? [],
            dependencySummary:
              candidate.dependencySummary
              ?? "This governance history candidate can promote independently once the tenant requests export."
          }
        : {
            ...candidate,
            eligibilityRule: candidate.eligibilityRule ?? "after_board_closes_then_export",
            eligibilityRuleLabel: candidate.eligibilityRuleLabel ?? "After board closes, then export",
            sourceSurface: candidate.sourceSurface ?? "completion_package_deliverables",
            sourceSurfaceLabel: candidate.sourceSurfaceLabel ?? "Completion package bundle",
            candidateClass: candidate.candidateClass ?? "packaged_output",
            candidateClassLabel: candidate.candidateClassLabel ?? "Packaged output",
            durabilityCondition: candidate.durabilityCondition ?? "stable_after_board_closure",
            durabilityConditionLabel: candidate.durabilityConditionLabel ?? "Stable after board closure",
            ownershipBoundary: candidate.ownershipBoundary ?? "tenant_owned_later",
            ownershipBoundaryLabel: candidate.ownershipBoundaryLabel ?? "Tenant-owned later",
            promotionPath: candidate.promotionPath ?? "after_board_closure_then_export",
            promotionPathLabel: candidate.promotionPathLabel ?? "After board closure, then export",
            recordTarget: candidate.recordTarget ?? "package_deliverable_record",
            recordTargetLabel: candidate.recordTargetLabel ?? "Package bundle export records",
            promotionBlocker: candidate.promotionBlocker ?? "board_closure_required",
            promotionBlockerLabel: candidate.promotionBlockerLabel ?? "Board closure required",
            promotionAuthority: candidate.promotionAuthority ?? "board_closure_then_tenant_export",
            promotionAuthorityLabel:
              candidate.promotionAuthorityLabel ?? "Board closure, then tenant export",
            promotionTrigger: candidate.promotionTrigger ?? "board_closure",
            promotionTriggerLabel: candidate.promotionTriggerLabel ?? "Board closure",
            exportPayloadShape: candidate.exportPayloadShape ?? "package_snapshot_bundle",
            exportPayloadShapeLabel: candidate.exportPayloadShapeLabel ?? "Package snapshot bundle",
            idempotencyPolicy: candidate.idempotencyPolicy ?? "board_closure_snapshot_once",
            idempotencyPolicyLabel: candidate.idempotencyPolicyLabel ?? "Board-closure snapshot once",
            replaySafety: candidate.replaySafety ?? "requires_fresh_board_closure_snapshot",
            replaySafetyLabel: candidate.replaySafetyLabel ?? "Requires fresh board-closure snapshot",
            conflictPolicy: candidate.conflictPolicy ?? "replace_latest_closure_snapshot",
            conflictPolicyLabel: candidate.conflictPolicyLabel ?? "Replace latest closure snapshot",
            exportAtomicity: candidate.exportAtomicity ?? "closure_bundle_atomic",
            exportAtomicityLabel: candidate.exportAtomicityLabel ?? "Closure-bundle atomic",
            exportDerivationBasis: candidate.exportDerivationBasis ?? "board_closure_snapshot_derived",
            exportDerivationBasisLabel: candidate.exportDerivationBasisLabel ?? "Board-closure-snapshot-derived",
            exportRevisionPolicy: candidate.exportRevisionPolicy ?? "replace_closure_bundle_revision",
            exportRevisionPolicyLabel: candidate.exportRevisionPolicyLabel ?? "Replace closure-bundle revision",
            exportFreshnessSource: candidate.exportFreshnessSource ?? "latest_board_closure_snapshot",
            exportFreshnessSourceLabel: candidate.exportFreshnessSourceLabel ?? "Latest board-closure snapshot",
            exportValidationBoundary: candidate.exportValidationBoundary ?? "closure_bundle_validation",
            exportValidationBoundaryLabel: candidate.exportValidationBoundaryLabel ?? "Closure-bundle validation",
            exportCompletenessRule: candidate.exportCompletenessRule ?? "board_closure_complete_bundle",
            exportCompletenessRuleLabel: candidate.exportCompletenessRuleLabel ?? "Board-closure-complete bundle",
            exportSensitivity: candidate.exportSensitivity ?? "tenant_deliverable_context",
            exportSensitivityLabel: candidate.exportSensitivityLabel ?? "Tenant deliverable context",
            exportAudienceBoundary: candidate.exportAudienceBoundary ?? "tenant_package_consumers",
            exportAudienceBoundaryLabel: candidate.exportAudienceBoundaryLabel ?? "Tenant package consumers",
            exportSanitizationPolicy:
              candidate.exportSanitizationPolicy ?? "sanitize_before_package_export",
            exportSanitizationPolicyLabel:
              candidate.exportSanitizationPolicyLabel ?? "Sanitize before package export",
            exportRedactionBoundary: candidate.exportRedactionBoundary ?? "package_safe_redaction",
            exportRedactionBoundaryLabel: candidate.exportRedactionBoundaryLabel ?? "Package-safe redaction",
            exportSourceDisclosurePolicy:
              candidate.exportSourceDisclosurePolicy ?? "closure_snapshot_summary_only",
            exportSourceDisclosurePolicyLabel:
              candidate.exportSourceDisclosurePolicyLabel ?? "Closure snapshot summary only",
            assemblyShape: candidate.assemblyShape ?? "package_record_set",
            assemblyShapeLabel: candidate.assemblyShapeLabel ?? "Package record set",
            promotionPhase: candidate.promotionPhase ?? "phase_two_package_export",
            promotionPhaseLabel: candidate.promotionPhaseLabel ?? "Phase-two package export",
            promotionMutability:
              candidate.promotionMutability
              ?? (candidate.readiness === "ready_now" ? "stable_snapshot" : "replaceable_until_board_closure"),
            promotionMutabilityLabel:
              candidate.promotionMutabilityLabel
              ?? (candidate.readiness === "ready_now" ? "Stable snapshot" : "Replaceable until board closure"),
            promotionScope: candidate.promotionScope ?? "package_record_set_export",
            promotionScopeLabel: candidate.promotionScopeLabel ?? "Package record-set export",
            identityStability:
              candidate.identityStability
              ?? (candidate.readiness === "ready_now" ? "stable_record_identity" : "finalized_after_board_closure"),
            identityStabilityLabel:
              candidate.identityStabilityLabel
              ?? (candidate.readiness === "ready_now" ? "Stable record identity" : "Finalized after board closure"),
            auditBacking: candidate.auditBacking ?? "package_closure_backed",
            auditBackingLabel: candidate.auditBackingLabel ?? "Package-closure-backed",
            concurrencyBoundary:
              candidate.concurrencyBoundary
              ?? (candidate.readiness === "ready_now" ? "independent_export_safe" : "requires_board_closure_snapshot"),
            concurrencyBoundaryLabel:
              candidate.concurrencyBoundaryLabel
              ?? (candidate.readiness === "ready_now" ? "Independent export safe" : "Requires board-closure snapshot"),
            exportSequence: candidate.exportSequence ?? "board_closure_following",
            exportSequenceLabel: candidate.exportSequenceLabel ?? "Board-closure-following sequence",
            exportDependencyPolicy:
              candidate.exportDependencyPolicy ?? "depends_on_governance_history_export",
            exportDependencyPolicyLabel:
              candidate.exportDependencyPolicyLabel ?? "Depends on governance history export",
            dependsOnCandidateIds: candidate.dependsOnCandidateIds ?? ["governance_history_export"],
            dependsOnCandidateLabels: candidate.dependsOnCandidateLabels ?? ["Governance history export"],
            dependencySummary:
              candidate.dependencySummary
              ?? (candidate.readiness === "after_board_closes"
                ? "This package bundle candidate still waits on board closure and later follows the governance history export candidate."
                : "This package bundle candidate follows the governance history export candidate once the tenant reaches export time.")
          }
  );
  const exportCandidateGroupCount = memoryBoundary.exportCandidateGroupCount ?? exportCandidates.length;
  const readyExportCandidateGroupCount = memoryBoundary.readyExportCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.readiness === "ready_now").length;
  const waitingExportCandidateGroupCount = memoryBoundary.waitingExportCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.readiness === "after_board_closes").length;
  const foundationalExportCandidateCount = memoryBoundary.foundationalExportCandidateCount
    ?? exportCandidates.filter((candidate) => candidate.exportSequence === "foundational_first").length;
  const boardClosureFollowingExportCandidateCount = memoryBoundary.boardClosureFollowingExportCandidateCount
    ?? exportCandidates.filter((candidate) => candidate.exportSequence === "board_closure_following").length;
  const independentExportCandidateCount = memoryBoundary.independentExportCandidateCount
    ?? exportCandidates.filter((candidate) => candidate.exportDependencyPolicy === "independent_candidate").length;
  const dependentExportCandidateCount = memoryBoundary.dependentExportCandidateCount
    ?? exportCandidates.filter((candidate) => candidate.exportDependencyPolicy === "depends_on_governance_history_export").length;
  const independentExportSafeCandidateGroupCount = memoryBoundary.independentExportSafeCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.concurrencyBoundary === "independent_export_safe").length;
  const requiresClosureSnapshotCandidateGroupCount = memoryBoundary.requiresClosureSnapshotCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.concurrencyBoundary === "requires_board_closure_snapshot").length;
  const tenantBusinessContextCandidateGroupCount = memoryBoundary.tenantBusinessContextCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportSensitivity === "tenant_business_context").length;
  const tenantDeliverableContextCandidateGroupCount = memoryBoundary.tenantDeliverableContextCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportSensitivity === "tenant_deliverable_context").length;
  const governanceHistoryAudienceCandidateGroupCount = memoryBoundary.governanceHistoryAudienceCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportAudienceBoundary === "tenant_governance_history_readers").length;
  const packageConsumerAudienceCandidateGroupCount = memoryBoundary.packageConsumerAudienceCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportAudienceBoundary === "tenant_package_consumers").length;
  const exportAsRecordedCandidateGroupCount = memoryBoundary.exportAsRecordedCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportSanitizationPolicy === "export_as_recorded").length;
  const sanitizeBeforePackageExportCandidateGroupCount = memoryBoundary.sanitizeBeforePackageExportCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportSanitizationPolicy === "sanitize_before_package_export").length;
  const governanceSafeRedactionCandidateGroupCount = memoryBoundary.governanceSafeRedactionCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportRedactionBoundary === "governance_safe_redaction").length;
  const packageSafeRedactionCandidateGroupCount = memoryBoundary.packageSafeRedactionCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportRedactionBoundary === "package_safe_redaction").length;
  const decisionSummaryOnlyCandidateGroupCount = memoryBoundary.decisionSummaryOnlyCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportSourceDisclosurePolicy === "decision_summary_only").length;
  const closureSnapshotSummaryOnlyCandidateGroupCount = memoryBoundary.closureSnapshotSummaryOnlyCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportSourceDisclosurePolicy === "closure_snapshot_summary_only").length;
  const singleRecordExportRequestCandidateGroupCount = memoryBoundary.singleRecordExportRequestCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportRequestShape === "single_record_export_request").length;
  const packageBundleExportRequestCandidateGroupCount = memoryBoundary.packageBundleExportRequestCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportRequestShape === "package_bundle_export_request").length;
  const tenantExportConfirmationCandidateGroupCount = memoryBoundary.tenantExportConfirmationCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportConfirmationRequirement === "tenant_export_confirmation").length;
  const boardClosureThenTenantExportConfirmationCandidateGroupCount = memoryBoundary.boardClosureThenTenantExportConfirmationCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportConfirmationRequirement === "board_closure_then_tenant_export_confirmation").length;
  const retryLatestRecordExportCandidateGroupCount = memoryBoundary.retryLatestRecordExportCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportRecoveryPath === "retry_latest_record_export").length;
  const rerunAfterBoardClosureSnapshotCandidateGroupCount = memoryBoundary.rerunAfterBoardClosureSnapshotCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportRecoveryPath === "rerun_after_board_closure_snapshot").length;
  const governanceHistoryNoteCandidateGroupCount = memoryBoundary.governanceHistoryNoteCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.memoryPlacement === "governance_history_note").length;
  const packageRecordFolderCandidateGroupCount = memoryBoundary.packageRecordFolderCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.memoryPlacement === "package_record_folder").length;
  const appendHistoryEntryCandidateGroupCount = memoryBoundary.appendHistoryEntryCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.syncStrategy === "append_history_entry").length;
  const replacePackageSnapshotAfterClosureCandidateGroupCount = memoryBoundary.replacePackageSnapshotAfterClosureCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.syncStrategy === "replace_package_snapshot_after_board_closure").length;
  const readyForTenantExportCandidateGroupCount = memoryBoundary.readyForTenantExportCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.promotionState === "ready_for_tenant_export").length;
  const awaitingBoardClosureCandidateGroupCount = memoryBoundary.awaitingBoardClosureCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.promotionState === "awaiting_board_closure").length;
  const tenantExportAvailableNextStepCandidateGroupCount = memoryBoundary.tenantExportAvailableNextStepCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.promotionNextStep === "tenant_export_available").length;
  const boardClosureThenTenantExportNextStepCandidateGroupCount = memoryBoundary.boardClosureThenTenantExportNextStepCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.promotionNextStep === "board_closure_then_tenant_export").length;
  const tenantExportActionFamilyCandidateGroupCount = memoryBoundary.tenantExportActionFamilyCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.promotionActionFamily === "tenant_export_candidate").length;
  const boardClosureActionFamilyCandidateGroupCount = memoryBoundary.boardClosureActionFamilyCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.promotionActionFamily === "board_closure_before_export").length;
  const governanceHistoryCandidateGroupCount = memoryBoundary.governanceHistoryCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.candidateClass === "governance_history").length;
  const packagedOutputCandidateGroupCount = memoryBoundary.packagedOutputCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.candidateClass === "packaged_output").length;
  const stableWhenRecordedCandidateGroupCount = memoryBoundary.stableWhenRecordedCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.durabilityCondition === "stable_when_recorded").length;
  const stableAfterBoardClosureCandidateGroupCount = memoryBoundary.stableAfterBoardClosureCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.durabilityCondition === "stable_after_board_closure").length;
  const tenantOwnedLaterCandidateGroupCount = memoryBoundary.tenantOwnedLaterCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.ownershipBoundary === "tenant_owned_later").length;
  const governanceHistoryRecordCandidateGroupCount = memoryBoundary.governanceHistoryRecordCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.recordTarget === "governance_history_record").length;
  const packageBundleRecordCandidateGroupCount = memoryBoundary.packageBundleRecordCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.recordTarget === "package_deliverable_record").length;
  const tenantExplicitExportAuthorityCandidateGroupCount = memoryBoundary.tenantExplicitExportAuthorityCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.promotionAuthority === "tenant_explicit_export").length;
  const boardClosureThenTenantExportAuthorityCandidateGroupCount = memoryBoundary.boardClosureThenTenantExportAuthorityCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.promotionAuthority === "board_closure_then_tenant_export").length;
  const explicitExportLaterCandidateGroupCount = memoryBoundary.explicitExportLaterCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.eligibilityRule === "explicit_export_later").length;
  const afterBoardClosesThenExportCandidateGroupCount = memoryBoundary.afterBoardClosesThenExportCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.eligibilityRule === "after_board_closes_then_export").length;
  const recentDecisionsSourceCandidateGroupCount = memoryBoundary.recentDecisionsSourceCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.sourceSurface === "recent_decisions").length;
  const completionPackageSurfaceCandidateGroupCount = memoryBoundary.completionPackageSurfaceCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.sourceSurface === "completion_package_deliverables").length;
  const readyForExplicitExportCandidateGroupCount = memoryBoundary.readyForExplicitExportCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.promotionPath === "ready_for_explicit_export").length;
  const afterBoardClosureThenExportCandidateGroupCount = memoryBoundary.afterBoardClosureThenExportCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.promotionPath === "after_board_closure_then_export").length;
  const noPromotionBlockerCandidateGroupCount = memoryBoundary.noPromotionBlockerCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.promotionBlocker === "none_ready_now").length;
  const boardClosureRequiredCandidateGroupCount = memoryBoundary.boardClosureRequiredCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.promotionBlocker === "board_closure_required").length;
  const tenantExportRequestCandidateGroupCount = memoryBoundary.tenantExportRequestCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.promotionTrigger === "tenant_export_request").length;
  const boardClosureTriggerCandidateGroupCount = memoryBoundary.boardClosureTriggerCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.promotionTrigger === "board_closure").length;
  const standaloneExportRecordCandidateGroupCount = memoryBoundary.standaloneExportRecordCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.assemblyShape === "standalone_export_record").length;
  const packageRecordSetCandidateGroupCount = memoryBoundary.packageRecordSetCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.assemblyShape === "package_record_set").length;
  const phaseOneExportCandidateGroupCount = memoryBoundary.phaseOneExportCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.promotionPhase === "phase_one_governance_history").length;
  const phaseTwoExportCandidateGroupCount = memoryBoundary.phaseTwoExportCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.promotionPhase === "phase_two_package_export").length;
  const appendOnlyHistoryCandidateGroupCount = memoryBoundary.appendOnlyHistoryCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.promotionMutability === "append_only_history").length;
  const replaceableSnapshotCandidateGroupCount = memoryBoundary.replaceableSnapshotCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.promotionMutability === "replaceable_until_board_closure").length;
  const singleRecordExportScopeCandidateGroupCount = memoryBoundary.singleRecordExportScopeCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.promotionScope === "single_record_export").length;
  const packageRecordSetExportScopeCandidateGroupCount = memoryBoundary.packageRecordSetExportScopeCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.promotionScope === "package_record_set_export").length;
  const stableIdentityCandidateGroupCount = memoryBoundary.stableIdentityCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.identityStability === "stable_record_identity").length;
  const closureFinalizedIdentityCandidateGroupCount = memoryBoundary.closureFinalizedIdentityCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.identityStability === "finalized_after_board_closure").length;
  const governanceHistoryPayloadCandidateGroupCount = memoryBoundary.governanceHistoryPayloadCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportPayloadShape === "governance_history_record").length;
  const packageSnapshotBundleCandidateGroupCount = memoryBoundary.packageSnapshotBundleCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportPayloadShape === "package_snapshot_bundle").length;
  const deterministicUpsertCandidateGroupCount = memoryBoundary.deterministicUpsertCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.idempotencyPolicy === "deterministic_upsert").length;
  const boardClosureSnapshotOnceCandidateGroupCount = memoryBoundary.boardClosureSnapshotOnceCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.idempotencyPolicy === "board_closure_snapshot_once").length;
  const replaySafeCandidateGroupCount = memoryBoundary.replaySafeCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.replaySafety === "replay_safe").length;
  const freshClosureSnapshotReplayCandidateGroupCount = memoryBoundary.freshClosureSnapshotReplayCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.replaySafety === "requires_fresh_board_closure_snapshot").length;
  const appendOrUpsertConflictCandidateGroupCount = memoryBoundary.appendOrUpsertConflictCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.conflictPolicy === "append_or_upsert").length;
  const replaceLatestClosureSnapshotCandidateGroupCount = memoryBoundary.replaceLatestClosureSnapshotCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.conflictPolicy === "replace_latest_closure_snapshot").length;
  const recordLevelAtomicCandidateGroupCount = memoryBoundary.recordLevelAtomicCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportAtomicity === "record_level_atomic").length;
  const closureBundleAtomicCandidateGroupCount = memoryBoundary.closureBundleAtomicCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportAtomicity === "closure_bundle_atomic").length;
  const decisionHistoryDerivedCandidateGroupCount = memoryBoundary.decisionHistoryDerivedCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportDerivationBasis === "decision_history_derived").length;
  const boardClosureSnapshotDerivedCandidateGroupCount = memoryBoundary.boardClosureSnapshotDerivedCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportDerivationBasis === "board_closure_snapshot_derived").length;
  const appendNewRevisionCandidateGroupCount = memoryBoundary.appendNewRevisionCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportRevisionPolicy === "append_new_revision").length;
  const replaceClosureBundleRevisionCandidateGroupCount = memoryBoundary.replaceClosureBundleRevisionCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportRevisionPolicy === "replace_closure_bundle_revision").length;
  const latestRecordStateCandidateGroupCount = memoryBoundary.latestRecordStateCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportFreshnessSource === "latest_record_state").length;
  const latestBoardClosureSnapshotCandidateGroupCount = memoryBoundary.latestBoardClosureSnapshotCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportFreshnessSource === "latest_board_closure_snapshot").length;
  const recordLevelValidationCandidateGroupCount = memoryBoundary.recordLevelValidationCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportValidationBoundary === "record_level_validation").length;
  const closureBundleValidationCandidateGroupCount = memoryBoundary.closureBundleValidationCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportValidationBoundary === "closure_bundle_validation").length;
  const selfContainedRecordCandidateGroupCount = memoryBoundary.selfContainedRecordCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportCompletenessRule === "self_contained_record").length;
  const boardClosureCompleteBundleCandidateGroupCount = memoryBoundary.boardClosureCompleteBundleCandidateGroupCount
    ?? exportCandidates.filter((candidate) => candidate.exportCompletenessRule === "board_closure_complete_bundle").length;

  return {
    ...memoryBoundary,
    exportSummary:
      memoryBoundary.exportSummary
      ?? (waitingOnBoardClosureCount > 0
        ? `${readyNowCount} export candidate${readyNowCount === 1 ? "" : "s"} ${readyNowCount === 1 ? "is" : "are"} ready now, and ${waitingOnBoardClosureCount} ${waitingOnBoardClosureCount === 1 ? "still waits" : "still wait"} for board closure.`
        : `${readyNowCount} export candidate${readyNowCount === 1 ? "" : "s"} ${readyNowCount === 1 ? "is" : "are"} ready now. No export candidates are waiting on board closure.`),
    deliverySummary: memoryBoundary.deliverySummary ?? "No grouped export deliveries have been attempted yet.",
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
      memoryBoundary.roleSummary
      ?? (packagedWaitingCount > 0
        ? `${governanceReadyCount} governance record candidate${governanceReadyCount === 1 ? "" : "s"} ${governanceReadyCount === 1 ? "is" : "are"} ready now, and ${packagedWaitingCount} packaged output candidate${packagedWaitingCount === 1 ? "" : "s"} ${packagedWaitingCount === 1 ? "still waits" : "still wait"} on board closure.`
        : `${governanceReadyCount + packagedReadyCount} tenant-record candidate${governanceReadyCount + packagedReadyCount === 1 ? " is" : "s are"} ready now, including ${governanceReadyCount} governance history candidate${governanceReadyCount === 1 ? "" : "s"} and ${packagedReadyCount} packaged output candidate${packagedReadyCount === 1 ? "" : "s"}.`),
    ownershipSummary:
      memoryBoundary.ownershipSummary
      ?? `${operationalItems.length} runtime memor${operationalItems.length === 1 ? "y bucket stays" : "y buckets stay"} Wealth Factory-only, while ${exportReadyItems.length} tenant-record candidate bucket${exportReadyItems.length === 1 ? "" : "s"} may become tenant-owned later.`,
    promotionSummary:
      memoryBoundary.promotionSummary
      ?? (waitingOnBoardClosureCount > 0
        ? `${operationalItems.length} runtime memor${operationalItems.length === 1 ? "y bucket never promotes" : "y buckets never promote"}, ${readyNowCount} candidate bucket${readyNowCount === 1 ? " is" : "s are"} ready for explicit export later, and ${waitingOnBoardClosureCount} candidate bucket${waitingOnBoardClosureCount === 1 ? " still waits" : "s still wait"} on board closure first.`
        : `${operationalItems.length} runtime memor${operationalItems.length === 1 ? "y bucket never promotes" : "y buckets never promote"}, and ${readyNowCount} candidate bucket${readyNowCount === 1 ? " is" : "s are"} ready for explicit export later.`),
    recordTargetSummary:
      memoryBoundary.recordTargetSummary
      ?? (waitingOnBoardClosureCount > 0
        ? `${governanceReadyCount} governance history record candidate${governanceReadyCount === 1 ? "" : "s"} ${governanceReadyCount === 1 ? "is" : "are"} ready, while ${packagedReadyCount + packagedWaitingCount} package record candidate${packagedReadyCount + packagedWaitingCount === 1 ? "" : "s"} ${packagedReadyCount + packagedWaitingCount === 1 ? "stays" : "stay"} package-shaped${waitingOnBoardClosureCount > 0 ? " until board closure completes" : ""}.`
        : `${governanceReadyCount} governance history record candidate${governanceReadyCount === 1 ? "" : "s"} and ${packagedReadyCount} package record candidate${packagedReadyCount === 1 ? "" : "s"} are ready for later tenant export.`),
    blockerSummary:
      memoryBoundary.blockerSummary
      ?? (blockedCandidateCount > 0
        ? `${blockedCandidateCount} export candidate bucket${blockedCandidateCount === 1 ? " is" : "s are"} still blocked by board closure. Runtime memory stays non-promotable by design.`
        : "No export candidate buckets are currently blocked. Runtime memory stays non-promotable by design."),
    authoritySummary:
      memoryBoundary.authoritySummary
      ?? (boardControlledCandidateCount > 0
        ? `${tenantControlledCandidateCount} export candidate bucket${tenantControlledCandidateCount === 1 ? " is" : "s are"} already tenant-controlled for later explicit export, while ${boardControlledCandidateCount} bucket${boardControlledCandidateCount === 1 ? " still needs" : "s still need"} board closure before tenant export can own the next step.`
        : `${tenantControlledCandidateCount} export candidate bucket${tenantControlledCandidateCount === 1 ? " is" : "s are"} tenant-controlled for later explicit export, while runtime memory remains Wealth Factory-only.`),
    triggerSummary:
      memoryBoundary.triggerSummary
      ?? (boardClosureTriggerCount > 0
        ? `${tenantExportTriggerCount} export candidate bucket${tenantExportTriggerCount === 1 ? " is" : "s are"} waiting only on a later tenant export request, while ${boardClosureTriggerCount} bucket${boardClosureTriggerCount === 1 ? " still needs" : "s still need"} board closure before that request can happen.`
        : `${tenantExportTriggerCount} export candidate bucket${tenantExportTriggerCount === 1 ? " is" : "s are"} ready for a later tenant export request, while runtime memory has no promotion trigger.`),
    stateSummary:
      memoryBoundary.stateSummary
      ?? (awaitingBoardClosureStateCount > 0
        ? `${runtimeOnlyStateCount} runtime bucket${runtimeOnlyStateCount === 1 ? " stays" : "s stay"} runtime-only, ${readyForTenantExportStateCount} export candidate bucket${readyForTenantExportStateCount === 1 ? " is" : "s are"} ready for tenant export later, and ${awaitingBoardClosureStateCount} bucket${awaitingBoardClosureStateCount === 1 ? " is" : "s are"} still awaiting board closure.`
        : `${runtimeOnlyStateCount} runtime bucket${runtimeOnlyStateCount === 1 ? " stays" : "s stay"} runtime-only, and ${readyForTenantExportStateCount} export candidate bucket${readyForTenantExportStateCount === 1 ? " is" : "s are"} ready for tenant export later.`),
    nextStepSummary:
      memoryBoundary.nextStepSummary
      ?? (boardClosureThenTenantExportNextStepCount > 0
        ? `${runtimeOnlyNextStepCount} runtime bucket${runtimeOnlyNextStepCount === 1 ? " has" : "s have"} no promotion step, ${tenantExportAvailableNextStepCount} export candidate bucket${tenantExportAvailableNextStepCount === 1 ? " is" : "s are"} ready for a later tenant export step, and ${boardClosureThenTenantExportNextStepCount} bucket${boardClosureThenTenantExportNextStepCount === 1 ? " still needs" : "s still need"} board closure before tenant export becomes the next step.`
        : `${runtimeOnlyNextStepCount} runtime bucket${runtimeOnlyNextStepCount === 1 ? " has" : "s have"} no promotion step, and ${tenantExportAvailableNextStepCount} export candidate bucket${tenantExportAvailableNextStepCount === 1 ? " is" : "s are"} ready for a later tenant export step.`),
    actionFamilySummary:
      memoryBoundary.actionFamilySummary
      ?? (boardClosureActionFamilyCount > 0
        ? `${noPromotionActionCount} runtime bucket${noPromotionActionCount === 1 ? " exposes" : "s expose"} no promotion action, ${tenantExportActionFamilyCount} export candidate bucket${tenantExportActionFamilyCount === 1 ? " sits" : "s sit"} in the tenant export family, and ${boardClosureActionFamilyCount} bucket${boardClosureActionFamilyCount === 1 ? " remains" : "s remain"} in the board-closure-first family.`
        : `${noPromotionActionCount} runtime bucket${noPromotionActionCount === 1 ? " exposes" : "s expose"} no promotion action, and ${tenantExportActionFamilyCount} export candidate bucket${tenantExportActionFamilyCount === 1 ? " sits" : "s sit"} in the tenant export family.`),
    assemblySummary:
      memoryBoundary.assemblySummary
      ?? (packageRecordSetCount > 0
        ? `${noAssemblyShapeCount} runtime bucket${noAssemblyShapeCount === 1 ? " has" : "s have"} no export assembly, ${standaloneExportRecordCount} export candidate bucket${standaloneExportRecordCount === 1 ? " is" : "s are"} ready as standalone export records, and ${packageRecordSetCount} bucket${packageRecordSetCount === 1 ? " still belongs" : "s still belong"} to a package record set after board closure.`
        : `${noAssemblyShapeCount} runtime bucket${noAssemblyShapeCount === 1 ? " has" : "s have"} no export assembly, and ${standaloneExportRecordCount} export candidate bucket${standaloneExportRecordCount === 1 ? " is" : "s are"} ready as standalone export records.`),
    phaseSummary:
      memoryBoundary.phaseSummary
      ?? (phaseTwoExportCount > 0
        ? `${noExportPhaseCount} runtime bucket${noExportPhaseCount === 1 ? " has" : "s have"} no export phase, ${phaseOneExportCount} export candidate bucket${phaseOneExportCount === 1 ? " is" : "s are"} ready in the phase-one export lane, and ${phaseTwoExportCount} bucket${phaseTwoExportCount === 1 ? " still waits" : "s still wait"} in the phase-two package export lane.`
        : `${noExportPhaseCount} runtime bucket${noExportPhaseCount === 1 ? " has" : "s have"} no export phase, and ${phaseOneExportCount} export candidate bucket${phaseOneExportCount === 1 ? " is" : "s are"} ready in the phase-one export lane.`),
    mutabilitySummary:
      memoryBoundary.mutabilitySummary
      ?? (replaceableSnapshotCount > 0
        ? `${runtimeMutableCount} runtime bucket${runtimeMutableCount === 1 ? " stays" : "s stay"} runtime mutable, ${appendOnlyHistoryCount} export candidate bucket${appendOnlyHistoryCount === 1 ? " is" : "s are"} append-only history, and ${replaceableSnapshotCount} bucket${replaceableSnapshotCount === 1 ? " still behaves" : "s still behave"} as replaceable package snapshots until board closure.`
        : stableSnapshotCount > 0
        ? `${runtimeMutableCount} runtime bucket${runtimeMutableCount === 1 ? " stays" : "s stay"} runtime mutable, ${appendOnlyHistoryCount} export candidate bucket${appendOnlyHistoryCount === 1 ? " is" : "s are"} append-only history, and ${stableSnapshotCount} bucket${stableSnapshotCount === 1 ? " is" : "s are"} now stable package snapshots.`
        : `${runtimeMutableCount} runtime bucket${runtimeMutableCount === 1 ? " stays" : "s stay"} runtime mutable, and ${appendOnlyHistoryCount} export candidate bucket${appendOnlyHistoryCount === 1 ? " is" : "s are"} append-only history.`),
    scopeSummary:
      memoryBoundary.scopeSummary
      ?? (packageRecordSetExportScopeCount > 0
        ? `${noPromotionScopeCount} runtime bucket${noPromotionScopeCount === 1 ? " has" : "s have"} no promotion scope, ${singleRecordExportScopeCount} export candidate bucket${singleRecordExportScopeCount === 1 ? " is" : "s are"} ready as single-record exports, and ${packageRecordSetExportScopeCount} bucket${packageRecordSetExportScopeCount === 1 ? " still belongs" : "s still belong"} to a package record-set export scope.`
        : `${noPromotionScopeCount} runtime bucket${noPromotionScopeCount === 1 ? " has" : "s have"} no promotion scope, and ${singleRecordExportScopeCount} export candidate bucket${singleRecordExportScopeCount === 1 ? " is" : "s are"} ready as single-record exports.`),
    identitySummary:
      memoryBoundary.identitySummary
      ?? (closureFinalizedIdentityCount > 0
        ? `${transientIdentityCount} runtime bucket${transientIdentityCount === 1 ? " keeps" : "s keep"} transient runtime identity, ${stableIdentityCount} bucket${stableIdentityCount === 1 ? " already has" : "s already have"} stable record identity, and ${closureFinalizedIdentityCount} bucket${closureFinalizedIdentityCount === 1 ? " still finalizes" : "s still finalize"} identity at board closure.`
        : `${transientIdentityCount} runtime bucket${transientIdentityCount === 1 ? " keeps" : "s keep"} transient runtime identity, and ${stableIdentityCount} bucket${stableIdentityCount === 1 ? " already has" : "s already have"} stable record identity.`),
    auditSummary:
      memoryBoundary.auditSummary
      ?? (packageClosureAuditCount > 0
        ? `${runtimeStateOnlyAuditCount} runtime bucket${runtimeStateOnlyAuditCount === 1 ? " stays" : "s stay"} runtime-state-backed, ${decisionLedgerAuditCount} bucket${decisionLedgerAuditCount === 1 ? " is" : "s are"} decision-ledger-backed, and ${packageClosureAuditCount} bucket${packageClosureAuditCount === 1 ? " is" : "s are"} package-closure-backed.`
        : `${runtimeStateOnlyAuditCount} runtime bucket${runtimeStateOnlyAuditCount === 1 ? " stays" : "s stay"} runtime-state-backed, and ${decisionLedgerAuditCount} bucket${decisionLedgerAuditCount === 1 ? " is" : "s are"} decision-ledger-backed.`),
    concurrencySummary:
      memoryBoundary.concurrencySummary
      ?? (requiresBoardClosureSnapshotCount > 0
        ? `${runtimeOnlyConcurrencyCount} runtime bucket${runtimeOnlyConcurrencyCount === 1 ? " stays" : "s stay"} runtime-only, ${independentExportSafeCount} export candidate bucket${independentExportSafeCount === 1 ? " is" : "s are"} safe to promote independently, and ${requiresBoardClosureSnapshotCount} bucket${requiresBoardClosureSnapshotCount === 1 ? " still needs" : "s still need"} a board-closure snapshot for concurrency-safe promotion.`
        : `${runtimeOnlyConcurrencyCount} runtime bucket${runtimeOnlyConcurrencyCount === 1 ? " stays" : "s stay"} runtime-only, and ${independentExportSafeCount} export candidate bucket${independentExportSafeCount === 1 ? " is" : "s are"} safe to promote independently.`),
    payloadShapeSummary:
      memoryBoundary.payloadShapeSummary
      ?? (packageSnapshotBundleCount > 0
        ? `${noExportPayloadShapeCount} runtime bucket${noExportPayloadShapeCount === 1 ? " has" : "s have"} no export payload shape, ${governanceHistoryPayloadCount} export candidate bucket${governanceHistoryPayloadCount === 1 ? " is" : "s are"} shaped as governance history records, and ${packageSnapshotBundleCount} bucket${packageSnapshotBundleCount === 1 ? " still exports" : "s still export"} as package snapshot bundles.`
        : `${noExportPayloadShapeCount} runtime bucket${noExportPayloadShapeCount === 1 ? " has" : "s have"} no export payload shape, and ${governanceHistoryPayloadCount} export candidate bucket${governanceHistoryPayloadCount === 1 ? " is" : "s are"} shaped as governance history records.`),
    idempotencySummary:
      memoryBoundary.idempotencySummary
      ?? (boardClosureSnapshotOnceCount > 0
        ? `${noIdempotencyPolicyCount} runtime bucket${noIdempotencyPolicyCount === 1 ? " has" : "s have"} no idempotency policy, ${deterministicUpsertCount} export candidate bucket${deterministicUpsertCount === 1 ? " uses" : "use"} deterministic upsert, and ${boardClosureSnapshotOnceCount} bucket${boardClosureSnapshotOnceCount === 1 ? " still depends" : "s still depend"} on a board-closure snapshot-once policy.`
        : `${noIdempotencyPolicyCount} runtime bucket${noIdempotencyPolicyCount === 1 ? " has" : "s have"} no idempotency policy, and ${deterministicUpsertCount} export candidate bucket${deterministicUpsertCount === 1 ? " uses" : "use"} deterministic upsert.`),
    replaySafetySummary:
      memoryBoundary.replaySafetySummary
      ?? (freshClosureSnapshotReplayCount > 0
        ? `${runtimeOnlyReplaySafetyCount} runtime bucket${runtimeOnlyReplaySafetyCount === 1 ? " stays" : "s stay"} runtime-only, ${replaySafeCount} export candidate bucket${replaySafeCount === 1 ? " is" : "s are"} replay-safe, and ${freshClosureSnapshotReplayCount} bucket${freshClosureSnapshotReplayCount === 1 ? " still requires" : "s still require"} a fresh board-closure snapshot before replay.`
        : `${runtimeOnlyReplaySafetyCount} runtime bucket${runtimeOnlyReplaySafetyCount === 1 ? " stays" : "s stay"} runtime-only, and ${replaySafeCount} export candidate bucket${replaySafeCount === 1 ? " is" : "s are"} replay-safe.`),
      conflictPolicySummary:
        memoryBoundary.conflictPolicySummary
        ?? (replaceLatestClosureSnapshotCount > 0
          ? `${runtimeOnlyConflictPolicyCount} runtime bucket${runtimeOnlyConflictPolicyCount === 1 ? " stays" : "s stay"} outside export conflicts, ${appendOrUpsertConflictCount} export candidate bucket${appendOrUpsertConflictCount === 1 ? " uses" : "use"} append-or-upsert conflict handling, and ${replaceLatestClosureSnapshotCount} bucket${replaceLatestClosureSnapshotCount === 1 ? " still replaces" : "s still replace"} the latest board-closure snapshot when promoted.`
          : `${runtimeOnlyConflictPolicyCount} runtime bucket${runtimeOnlyConflictPolicyCount === 1 ? " stays" : "s stay"} outside export conflicts, and ${appendOrUpsertConflictCount} export candidate bucket${appendOrUpsertConflictCount === 1 ? " uses" : "use"} append-or-upsert conflict handling.`),
      atomicitySummary:
        memoryBoundary.atomicitySummary
        ?? (closureBundleAtomicCount > 0
          ? `${noExportAtomicityCount} runtime bucket${noExportAtomicityCount === 1 ? " has" : "s have"} no export atomicity, ${recordLevelAtomicCount} export candidate bucket${recordLevelAtomicCount === 1 ? " commits" : "commit"} as record-level atomic exports, and ${closureBundleAtomicCount} bucket${closureBundleAtomicCount === 1 ? " still depends" : "s still depend"} on closure-bundle atomic export once board closure completes.`
          : `${noExportAtomicityCount} runtime bucket${noExportAtomicityCount === 1 ? " has" : "s have"} no export atomicity, and ${recordLevelAtomicCount} export candidate bucket${recordLevelAtomicCount === 1 ? " commits" : "commit"} as record-level atomic exports.`),
      derivationSummary:
        memoryBoundary.derivationSummary
        ?? (boardClosureSnapshotDerivedCount > 0
          ? `${noExportDerivationBasisCount} runtime bucket${noExportDerivationBasisCount === 1 ? " has" : "s have"} no export derivation basis, ${decisionHistoryDerivedCount} export candidate bucket${decisionHistoryDerivedCount === 1 ? " is" : "s are"} derived from decision history, and ${boardClosureSnapshotDerivedCount} bucket${boardClosureSnapshotDerivedCount === 1 ? " is" : "s are"} derived from the board-closure snapshot.`
          : `${noExportDerivationBasisCount} runtime bucket${noExportDerivationBasisCount === 1 ? " has" : "s have"} no export derivation basis, and ${decisionHistoryDerivedCount} export candidate bucket${decisionHistoryDerivedCount === 1 ? " is" : "s are"} derived from decision history.`),
      revisionSummary:
        memoryBoundary.revisionSummary
        ?? (replaceClosureBundleRevisionCount > 0
          ? `${noExportRevisionPolicyCount} runtime bucket${noExportRevisionPolicyCount === 1 ? " has" : "s have"} no export revision policy, ${appendNewRevisionCount} export candidate bucket${appendNewRevisionCount === 1 ? " appends" : "append"} as new revisions, and ${replaceClosureBundleRevisionCount} bucket${replaceClosureBundleRevisionCount === 1 ? " still replaces" : "s still replace"} the current closure-bundle revision.`
          : `${noExportRevisionPolicyCount} runtime bucket${noExportRevisionPolicyCount === 1 ? " has" : "s have"} no export revision policy, and ${appendNewRevisionCount} export candidate bucket${appendNewRevisionCount === 1 ? " appends" : "append"} as new revisions.`),
      freshnessSummary:
        memoryBoundary.freshnessSummary
        ?? (latestBoardClosureSnapshotCount > 0
          ? `${noExportFreshnessSourceCount} runtime bucket${noExportFreshnessSourceCount === 1 ? " has" : "s have"} no export freshness source, ${latestRecordStateCount} export candidate bucket${latestRecordStateCount === 1 ? " uses" : "use"} the latest record state, and ${latestBoardClosureSnapshotCount} bucket${latestBoardClosureSnapshotCount === 1 ? " still depends" : "s still depend"} on the latest board-closure snapshot.`
          : `${noExportFreshnessSourceCount} runtime bucket${noExportFreshnessSourceCount === 1 ? " has" : "s have"} no export freshness source, and ${latestRecordStateCount} export candidate bucket${latestRecordStateCount === 1 ? " uses" : "use"} the latest record state.`),
      validationSummary:
        memoryBoundary.validationSummary
        ?? (closureBundleValidationCount > 0
          ? `${noExportValidationBoundaryCount} runtime bucket${noExportValidationBoundaryCount === 1 ? " has" : "s have"} no export validation boundary, ${recordLevelValidationCount} export candidate bucket${recordLevelValidationCount === 1 ? " validates" : "validate"} at record level, and ${closureBundleValidationCount} bucket${closureBundleValidationCount === 1 ? " still validates" : "s still validate"} at closure-bundle level.`
          : `${noExportValidationBoundaryCount} runtime bucket${noExportValidationBoundaryCount === 1 ? " has" : "s have"} no export validation boundary, and ${recordLevelValidationCount} export candidate bucket${recordLevelValidationCount === 1 ? " validates" : "validate"} at record level.`),
      completenessSummary:
        memoryBoundary.completenessSummary
        ?? (boardClosureCompleteBundleCount > 0
          ? `${noExportCompletenessRuleCount} runtime bucket${noExportCompletenessRuleCount === 1 ? " has" : "s have"} no export completeness rule, ${selfContainedRecordCount} export candidate bucket${selfContainedRecordCount === 1 ? " is" : "s are"} self-contained records, and ${boardClosureCompleteBundleCount} bucket${boardClosureCompleteBundleCount === 1 ? " still completes" : "s still complete"} as board-closure bundles.`
          : `${noExportCompletenessRuleCount} runtime bucket${noExportCompletenessRuleCount === 1 ? " has" : "s have"} no export completeness rule, and ${selfContainedRecordCount} export candidate bucket${selfContainedRecordCount === 1 ? " is" : "s are"} self-contained records.`),
      sensitivitySummary:
        memoryBoundary.sensitivitySummary
        ?? (tenantDeliverableContextCount > 0
          ? `${noExportSensitivityCount} runtime bucket${noExportSensitivityCount === 1 ? " has" : "s have"} no export sensitivity, ${tenantBusinessContextCount} export candidate bucket${tenantBusinessContextCount === 1 ? " carries" : "s carry"} tenant business context, and ${tenantDeliverableContextCount} bucket${tenantDeliverableContextCount === 1 ? " still carries" : "s still carry"} tenant deliverable context.`
          : `${noExportSensitivityCount} runtime bucket${noExportSensitivityCount === 1 ? " has" : "s have"} no export sensitivity, and ${tenantBusinessContextCount} export candidate bucket${tenantBusinessContextCount === 1 ? " carries" : "s carry"} tenant business context.`),
      audienceSummary:
        memoryBoundary.audienceSummary
        ?? (packageConsumerAudienceCount > 0
          ? `${runtimeOnlyAudienceCount} runtime bucket${runtimeOnlyAudienceCount === 1 ? " stays" : "s stay"} Wealth Factory runtime only, ${governanceHistoryAudienceCount} export candidate bucket${governanceHistoryAudienceCount === 1 ? " is aimed" : "s are aimed"} at tenant governance-history readers, and ${packageConsumerAudienceCount} bucket${packageConsumerAudienceCount === 1 ? " still targets" : "s still target"} tenant package consumers.`
          : `${runtimeOnlyAudienceCount} runtime bucket${runtimeOnlyAudienceCount === 1 ? " stays" : "s stay"} Wealth Factory runtime only, and ${governanceHistoryAudienceCount} export candidate bucket${governanceHistoryAudienceCount === 1 ? " is aimed" : "s are aimed"} at tenant governance-history readers.`),
      sanitizationSummary:
        memoryBoundary.sanitizationSummary
        ?? (sanitizeBeforePackageExportCount > 0
          ? `${noExportSanitizationCount} runtime bucket${noExportSanitizationCount === 1 ? " has" : "s have"} no export sanitization, ${exportAsRecordedCount} export candidate bucket${exportAsRecordedCount === 1 ? " is exported" : "s are exported"} as recorded, and ${sanitizeBeforePackageExportCount} bucket${sanitizeBeforePackageExportCount === 1 ? " still requires" : "s still require"} sanitization before package export.`
          : `${noExportSanitizationCount} runtime bucket${noExportSanitizationCount === 1 ? " has" : "s have"} no export sanitization, and ${exportAsRecordedCount} export candidate bucket${exportAsRecordedCount === 1 ? " is exported" : "s are exported"} as recorded.`),
      redactionSummary:
        memoryBoundary.redactionSummary
        ?? (packageSafeRedactionCount > 0
          ? `${runtimeInternalOnlyRedactionCount} runtime bucket${runtimeInternalOnlyRedactionCount === 1 ? " stays" : "s stay"} runtime internal only, ${governanceSafeRedactionCount} export candidate bucket${governanceSafeRedactionCount === 1 ? " uses" : "s use"} governance-safe redaction, and ${packageSafeRedactionCount} bucket${packageSafeRedactionCount === 1 ? " still requires" : "s still require"} package-safe redaction.`
          : `${runtimeInternalOnlyRedactionCount} runtime bucket${runtimeInternalOnlyRedactionCount === 1 ? " stays" : "s stay"} runtime internal only, and ${governanceSafeRedactionCount} export candidate bucket${governanceSafeRedactionCount === 1 ? " uses" : "s use"} governance-safe redaction.`),
      sourceDisclosureSummary:
        memoryBoundary.sourceDisclosureSummary
        ?? (closureSnapshotSummaryOnlyCount > 0
          ? `${runtimeOnlySourceDisclosureCount} runtime bucket${runtimeOnlySourceDisclosureCount === 1 ? " is" : "s are"} runtime only, ${decisionSummaryOnlyCount} export candidate bucket${decisionSummaryOnlyCount === 1 ? " discloses" : "s disclose"} decision summaries only, and ${closureSnapshotSummaryOnlyCount} bucket${closureSnapshotSummaryOnlyCount === 1 ? " still discloses" : "s still disclose"} closure-snapshot summaries only.`
          : `${runtimeOnlySourceDisclosureCount} runtime bucket${runtimeOnlySourceDisclosureCount === 1 ? " is" : "s are"} runtime only, and ${decisionSummaryOnlyCount} export candidate bucket${decisionSummaryOnlyCount === 1 ? " discloses" : "s disclose"} decision summaries only.`),
    placementSummary:
      memoryBoundary.placementSummary
      ?? (packageRecordFolderCount > 0
        ? `${noMemoryPlacementCount} runtime buckets have no tenant memory placement, ${governanceHistoryNoteCount} export candidate bucket${governanceHistoryNoteCount === 1 ? " lands" : "s land"} as governance history notes, and ${packageRecordFolderCount} bucket${packageRecordFolderCount === 1 ? " still lands" : "s still land"} in package record folders.`
        : `${noMemoryPlacementCount} runtime buckets have no tenant memory placement, and ${governanceHistoryNoteCount} export candidate bucket${governanceHistoryNoteCount === 1 ? " lands" : "s land"} as governance history notes.`),
    syncStrategySummary:
      memoryBoundary.syncStrategySummary
      ?? (replacePackageSnapshotAfterClosureCount > 0
        ? `${noSyncStrategyCount} runtime buckets have no tenant sync strategy, ${appendHistoryEntryCount} export candidate bucket${appendHistoryEntryCount === 1 ? " appends" : "s append"} history entries, and ${replacePackageSnapshotAfterClosureCount} bucket${replacePackageSnapshotAfterClosureCount === 1 ? " still replaces" : "s still replace"} package snapshots after board closure.`
        : `${noSyncStrategyCount} runtime buckets have no tenant sync strategy, and ${appendHistoryEntryCount} export candidate bucket${appendHistoryEntryCount === 1 ? " appends" : "s append"} history entries.`),
    requestShapeSummary:
      memoryBoundary.requestShapeSummary
      ?? (packageBundleExportRequestCount > 0
        ? `${noExportRequestShapeCount} runtime buckets have no export request shape, ${singleRecordExportRequestCount} export candidate bucket${singleRecordExportRequestCount === 1 ? " uses" : "s use"} single-record export requests, and ${packageBundleExportRequestCount} bucket${packageBundleExportRequestCount === 1 ? " still uses" : "s still use"} package-bundle export requests.`
        : `${noExportRequestShapeCount} runtime buckets have no export request shape, and ${singleRecordExportRequestCount} export candidate bucket${singleRecordExportRequestCount === 1 ? " uses" : "s use"} single-record export requests.`),
    confirmationSummary:
      memoryBoundary.confirmationSummary
      ?? (boardClosureThenTenantExportConfirmationCount > 0
        ? `${noExportConfirmationRequirementCount} runtime buckets have no export confirmation, ${tenantExportConfirmationCount} export candidate bucket${tenantExportConfirmationCount === 1 ? " requires" : "s require"} tenant export confirmation, and ${boardClosureThenTenantExportConfirmationCount} bucket${boardClosureThenTenantExportConfirmationCount === 1 ? " still requires" : "s still require"} board closure before tenant export confirmation.`
        : `${noExportConfirmationRequirementCount} runtime buckets have no export confirmation, and ${tenantExportConfirmationCount} export candidate bucket${tenantExportConfirmationCount === 1 ? " requires" : "s require"} tenant export confirmation.`),
    recoveryPathSummary:
      memoryBoundary.recoveryPathSummary
      ?? (rerunAfterBoardClosureSnapshotCount > 0
        ? `${runtimeOnlyRecoveryPathCount} runtime buckets are runtime only, ${retryLatestRecordExportCount} export candidate bucket${retryLatestRecordExportCount === 1 ? " retries" : "s retry"} the latest record export, and ${rerunAfterBoardClosureSnapshotCount} bucket${rerunAfterBoardClosureSnapshotCount === 1 ? " still reruns" : "s still rerun"} after the board-closure snapshot.`
        : `${runtimeOnlyRecoveryPathCount} runtime buckets are runtime only, and ${retryLatestRecordExportCount} export candidate bucket${retryLatestRecordExportCount === 1 ? " retries" : "s retry"} the latest record export.`),
    runtimeShapeSummary:
      memoryBoundary.runtimeShapeSummary
      ?? (attentionSignalRuntimeItemCount > 0
        ? `${continuityTrioRuntimeItemCount} runtime bucket${continuityTrioRuntimeItemCount === 1 ? " keeps" : "s keep"} the bounded continuity trio, and ${attentionSignalRuntimeItemCount} bucket${attentionSignalRuntimeItemCount === 1 ? " keeps" : "s keep"} CEO attention as a live control signal.`
        : `${continuityTrioRuntimeItemCount} runtime bucket${continuityTrioRuntimeItemCount === 1 ? " keeps" : "s keep"} the bounded continuity trio.`),
    runtimeLongMemoryDispositionSummary:
      memoryBoundary.runtimeLongMemoryDispositionSummary
      ?? `${runtimeOnlyLongMemoryItemCount} runtime bucket${runtimeOnlyLongMemoryItemCount === 1 ? " stays" : "s stay"} operational Wealth Factory truth and do not promote directly into tenant-owned long memory.`,
    exportCandidateSummary:
      memoryBoundary.exportCandidateSummary
      ?? (waitingExportCandidateGroupCount > 0
        ? `${readyExportCandidateGroupCount} export candidate group${readyExportCandidateGroupCount === 1 ? " is" : "s are"} ready for later tenant export, and ${waitingExportCandidateGroupCount} group${waitingExportCandidateGroupCount === 1 ? " still waits" : "s still wait"} on board closure first.`
        : `${readyExportCandidateGroupCount} export candidate group${readyExportCandidateGroupCount === 1 ? " is" : "s are"} ready for later tenant export.`),
    exportCandidateGroupCount,
    readyExportCandidateGroupCount,
    waitingExportCandidateGroupCount,
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
      memoryBoundary.sequenceSummary
      ?? (boardClosureFollowingExportCandidateCount > 0
        ? `${foundationalExportCandidateCount} export candidate group${foundationalExportCandidateCount === 1 ? " forms" : "s form"} the foundational export sequence, and ${boardClosureFollowingExportCandidateCount} group${boardClosureFollowingExportCandidateCount === 1 ? " follows" : "s follow"} after board closure.`
        : `${foundationalExportCandidateCount} export candidate group${foundationalExportCandidateCount === 1 ? " forms" : "s form"} the foundational export sequence. No later board-closure-following candidate groups are waiting right now.`),
    dependencySummary:
      memoryBoundary.dependencySummary
      ?? (dependentExportCandidateCount > 0
        ? `${independentExportCandidateCount} export candidate group${independentExportCandidateCount === 1 ? " stands" : "s stand"} independently, while ${dependentExportCandidateCount} group${dependentExportCandidateCount === 1 ? " still depends" : "s still depend"} on the governance history export candidate.`
        : `${independentExportCandidateCount} export candidate group${independentExportCandidateCount === 1 ? " stands" : "s stand"} independently. No grouped export candidates currently depend on governance history export.`),
    exportCandidateConcurrencySummary:
      memoryBoundary.exportCandidateConcurrencySummary
      ?? (requiresClosureSnapshotCandidateGroupCount > 0
        ? `${independentExportSafeCandidateGroupCount} export candidate group${independentExportSafeCandidateGroupCount === 1 ? " is" : "s are"} concurrency-safe for later independent export, and ${requiresClosureSnapshotCandidateGroupCount} group${requiresClosureSnapshotCandidateGroupCount === 1 ? " still needs" : "s still need"} a board-closure snapshot before export remains concurrency-safe.`
        : `${independentExportSafeCandidateGroupCount} export candidate group${independentExportSafeCandidateGroupCount === 1 ? " is" : "s are"} concurrency-safe for later independent export.`),
    exportCandidateSensitivitySummary:
      memoryBoundary.exportCandidateSensitivitySummary
      ?? (tenantDeliverableContextCandidateGroupCount > 0
        ? `${tenantBusinessContextCandidateGroupCount} export candidate group${tenantBusinessContextCandidateGroupCount === 1 ? " carries" : "s carry"} tenant business context, and ${tenantDeliverableContextCandidateGroupCount} group${tenantDeliverableContextCandidateGroupCount === 1 ? " still carries" : "s still carry"} tenant deliverable context.`
        : `${tenantBusinessContextCandidateGroupCount} export candidate group${tenantBusinessContextCandidateGroupCount === 1 ? " carries" : "s carry"} tenant business context.`),
    exportCandidateAudienceSummary:
      memoryBoundary.exportCandidateAudienceSummary
      ?? (packageConsumerAudienceCandidateGroupCount > 0
        ? `${governanceHistoryAudienceCandidateGroupCount} export candidate group${governanceHistoryAudienceCandidateGroupCount === 1 ? " is aimed" : "s are aimed"} at tenant governance-history readers, and ${packageConsumerAudienceCandidateGroupCount} group${packageConsumerAudienceCandidateGroupCount === 1 ? " still targets" : "s still target"} tenant package consumers.`
        : `${governanceHistoryAudienceCandidateGroupCount} export candidate group${governanceHistoryAudienceCandidateGroupCount === 1 ? " is aimed" : "s are aimed"} at tenant governance-history readers.`),
    exportCandidateSanitizationSummary:
      memoryBoundary.exportCandidateSanitizationSummary
      ?? (sanitizeBeforePackageExportCandidateGroupCount > 0
        ? `${exportAsRecordedCandidateGroupCount} export candidate group${exportAsRecordedCandidateGroupCount === 1 ? " is exported" : "s are exported"} as recorded, and ${sanitizeBeforePackageExportCandidateGroupCount} group${sanitizeBeforePackageExportCandidateGroupCount === 1 ? " still requires" : "s still require"} sanitization before package export.`
        : `${exportAsRecordedCandidateGroupCount} export candidate group${exportAsRecordedCandidateGroupCount === 1 ? " is exported" : "s are exported"} as recorded.`),
    exportCandidateRedactionSummary:
      memoryBoundary.exportCandidateRedactionSummary
      ?? (packageSafeRedactionCandidateGroupCount > 0
        ? `${governanceSafeRedactionCandidateGroupCount} export candidate group${governanceSafeRedactionCandidateGroupCount === 1 ? " uses" : "s use"} governance-safe redaction, and ${packageSafeRedactionCandidateGroupCount} group${packageSafeRedactionCandidateGroupCount === 1 ? " still requires" : "s still require"} package-safe redaction.`
        : `${governanceSafeRedactionCandidateGroupCount} export candidate group${governanceSafeRedactionCandidateGroupCount === 1 ? " uses" : "s use"} governance-safe redaction.`),
    exportCandidateSourceDisclosureSummary:
      memoryBoundary.exportCandidateSourceDisclosureSummary
      ?? (closureSnapshotSummaryOnlyCandidateGroupCount > 0
        ? `${decisionSummaryOnlyCandidateGroupCount} export candidate group${decisionSummaryOnlyCandidateGroupCount === 1 ? " discloses" : "s disclose"} decision summaries only, and ${closureSnapshotSummaryOnlyCandidateGroupCount} group${closureSnapshotSummaryOnlyCandidateGroupCount === 1 ? " still discloses" : "s still disclose"} closure-snapshot summaries only.`
        : `${decisionSummaryOnlyCandidateGroupCount} export candidate group${decisionSummaryOnlyCandidateGroupCount === 1 ? " discloses" : "s disclose"} decision summaries only.`),
    exportCandidateRequestShapeSummary:
      memoryBoundary.exportCandidateRequestShapeSummary
      ?? (packageBundleExportRequestCandidateGroupCount > 0
        ? `${singleRecordExportRequestCandidateGroupCount} export candidate group${singleRecordExportRequestCandidateGroupCount === 1 ? " uses" : "s use"} single-record export requests, and ${packageBundleExportRequestCandidateGroupCount} group${packageBundleExportRequestCandidateGroupCount === 1 ? " still uses" : "s still use"} package-bundle export requests.`
        : `${singleRecordExportRequestCandidateGroupCount} export candidate group${singleRecordExportRequestCandidateGroupCount === 1 ? " uses" : "s use"} single-record export requests.`),
    exportCandidateConfirmationSummary:
      memoryBoundary.exportCandidateConfirmationSummary
      ?? (boardClosureThenTenantExportConfirmationCandidateGroupCount > 0
        ? `${tenantExportConfirmationCandidateGroupCount} export candidate group${tenantExportConfirmationCandidateGroupCount === 1 ? " requires" : "s require"} tenant export confirmation, and ${boardClosureThenTenantExportConfirmationCandidateGroupCount} group${boardClosureThenTenantExportConfirmationCandidateGroupCount === 1 ? " still requires" : "s still require"} board closure before tenant export confirmation.`
        : `${tenantExportConfirmationCandidateGroupCount} export candidate group${tenantExportConfirmationCandidateGroupCount === 1 ? " requires" : "s require"} tenant export confirmation.`),
    exportCandidateRecoveryPathSummary:
      memoryBoundary.exportCandidateRecoveryPathSummary
      ?? (rerunAfterBoardClosureSnapshotCandidateGroupCount > 0
        ? `${retryLatestRecordExportCandidateGroupCount} export candidate group${retryLatestRecordExportCandidateGroupCount === 1 ? " retries" : "s retry"} the latest record export, and ${rerunAfterBoardClosureSnapshotCandidateGroupCount} group${rerunAfterBoardClosureSnapshotCandidateGroupCount === 1 ? " still reruns" : "s still rerun"} after the board-closure snapshot.`
        : `${retryLatestRecordExportCandidateGroupCount} export candidate group${retryLatestRecordExportCandidateGroupCount === 1 ? " retries" : "s retry"} the latest record export.`),
    exportCandidatePlacementSummary:
      memoryBoundary.exportCandidatePlacementSummary
      ?? (packageRecordFolderCandidateGroupCount > 0
        ? `${governanceHistoryNoteCandidateGroupCount} export candidate group${governanceHistoryNoteCandidateGroupCount === 1 ? " lands" : "s land"} as governance history notes, and ${packageRecordFolderCandidateGroupCount} group${packageRecordFolderCandidateGroupCount === 1 ? " still lands" : "s still land"} in package record folders.`
        : `${governanceHistoryNoteCandidateGroupCount} export candidate group${governanceHistoryNoteCandidateGroupCount === 1 ? " lands" : "s land"} as governance history notes.`),
    exportCandidateSyncStrategySummary:
      memoryBoundary.exportCandidateSyncStrategySummary
      ?? (replacePackageSnapshotAfterClosureCandidateGroupCount > 0
        ? `${appendHistoryEntryCandidateGroupCount} export candidate group${appendHistoryEntryCandidateGroupCount === 1 ? " appends" : "s append"} history entries, and ${replacePackageSnapshotAfterClosureCandidateGroupCount} group${replacePackageSnapshotAfterClosureCandidateGroupCount === 1 ? " still replaces" : "s still replace"} package snapshots after board closure.`
        : `${appendHistoryEntryCandidateGroupCount} export candidate group${appendHistoryEntryCandidateGroupCount === 1 ? " appends" : "s append"} history entries.`),
    exportCandidateStateSummary:
      memoryBoundary.exportCandidateStateSummary
      ?? (awaitingBoardClosureCandidateGroupCount > 0
        ? `${readyForTenantExportCandidateGroupCount} export candidate group${readyForTenantExportCandidateGroupCount === 1 ? " is" : "s are"} ready for tenant export later, and ${awaitingBoardClosureCandidateGroupCount} group${awaitingBoardClosureCandidateGroupCount === 1 ? " is" : "s are"} still awaiting board closure.`
        : `${readyForTenantExportCandidateGroupCount} export candidate group${readyForTenantExportCandidateGroupCount === 1 ? " is" : "s are"} ready for tenant export later.`),
    exportCandidateNextStepSummary:
      memoryBoundary.exportCandidateNextStepSummary
      ?? (boardClosureThenTenantExportNextStepCandidateGroupCount > 0
        ? `${tenantExportAvailableNextStepCandidateGroupCount} export candidate group${tenantExportAvailableNextStepCandidateGroupCount === 1 ? " is" : "s are"} ready for a later tenant export step, and ${boardClosureThenTenantExportNextStepCandidateGroupCount} group${boardClosureThenTenantExportNextStepCandidateGroupCount === 1 ? " still needs" : "s still need"} board closure before tenant export becomes the next step.`
        : `${tenantExportAvailableNextStepCandidateGroupCount} export candidate group${tenantExportAvailableNextStepCandidateGroupCount === 1 ? " is" : "s are"} ready for a later tenant export step.`),
    exportCandidateActionFamilySummary:
      memoryBoundary.exportCandidateActionFamilySummary
      ?? (boardClosureActionFamilyCandidateGroupCount > 0
        ? `${tenantExportActionFamilyCandidateGroupCount} export candidate group${tenantExportActionFamilyCandidateGroupCount === 1 ? " sits" : "s sit"} in the tenant export family, and ${boardClosureActionFamilyCandidateGroupCount} group${boardClosureActionFamilyCandidateGroupCount === 1 ? " remains" : "s remain"} in the board-closure-first family.`
        : `${tenantExportActionFamilyCandidateGroupCount} export candidate group${tenantExportActionFamilyCandidateGroupCount === 1 ? " sits" : "s sit"} in the tenant export family.`),
    exportCandidateClassSummary:
      memoryBoundary.exportCandidateClassSummary
      ?? (packagedOutputCandidateGroupCount > 0
        ? `${governanceHistoryCandidateGroupCount} export candidate group${governanceHistoryCandidateGroupCount === 1 ? " stays" : "s stay"} in governance history, and ${packagedOutputCandidateGroupCount} group${packagedOutputCandidateGroupCount === 1 ? " still stays" : "s still stay"} in packaged output.`
        : `${governanceHistoryCandidateGroupCount} export candidate group${governanceHistoryCandidateGroupCount === 1 ? " stays" : "s stay"} in governance history.`),
    exportCandidateDurabilitySummary:
      memoryBoundary.exportCandidateDurabilitySummary
      ?? (stableAfterBoardClosureCandidateGroupCount > 0
        ? `${stableWhenRecordedCandidateGroupCount} export candidate group${stableWhenRecordedCandidateGroupCount === 1 ? " is" : "s are"} stable when recorded, and ${stableAfterBoardClosureCandidateGroupCount} group${stableAfterBoardClosureCandidateGroupCount === 1 ? " still stays" : "s still stay"} stable after board closure.`
        : `${stableWhenRecordedCandidateGroupCount} export candidate group${stableWhenRecordedCandidateGroupCount === 1 ? " is" : "s are"} stable when recorded.`),
    exportCandidateOwnershipSummary:
      memoryBoundary.exportCandidateOwnershipSummary
      ?? `${tenantOwnedLaterCandidateGroupCount} export candidate group${tenantOwnedLaterCandidateGroupCount === 1 ? " remains" : "s remain"} tenant-owned later.`,
    exportCandidateRecordTargetSummary:
      memoryBoundary.exportCandidateRecordTargetSummary
      ?? (packageBundleRecordCandidateGroupCount > 0
        ? `${governanceHistoryRecordCandidateGroupCount} export candidate group${governanceHistoryRecordCandidateGroupCount === 1 ? " becomes" : "s become"} governance history records, and ${packageBundleRecordCandidateGroupCount} group${packageBundleRecordCandidateGroupCount === 1 ? " still becomes" : "s still become"} package bundle export records.`
        : `${governanceHistoryRecordCandidateGroupCount} export candidate group${governanceHistoryRecordCandidateGroupCount === 1 ? " becomes" : "s become"} governance history records.`),
    exportCandidateAuthoritySummary:
      memoryBoundary.exportCandidateAuthoritySummary
      ?? (boardClosureThenTenantExportAuthorityCandidateGroupCount > 0
        ? `${tenantExplicitExportAuthorityCandidateGroupCount} export candidate group${tenantExplicitExportAuthorityCandidateGroupCount === 1 ? " is" : "s are"} tenant-controlled for later explicit export, and ${boardClosureThenTenantExportAuthorityCandidateGroupCount} group${boardClosureThenTenantExportAuthorityCandidateGroupCount === 1 ? " still needs" : "s still need"} board closure before tenant export owns the next move.`
        : `${tenantExplicitExportAuthorityCandidateGroupCount} export candidate group${tenantExplicitExportAuthorityCandidateGroupCount === 1 ? " is" : "s are"} tenant-controlled for later explicit export.`),
    exportCandidateEligibilitySummary:
      memoryBoundary.exportCandidateEligibilitySummary
      ?? (afterBoardClosesThenExportCandidateGroupCount > 0
        ? `${explicitExportLaterCandidateGroupCount} export candidate group${explicitExportLaterCandidateGroupCount === 1 ? " is" : "s are"} eligible for later explicit export, and ${afterBoardClosesThenExportCandidateGroupCount} group${afterBoardClosesThenExportCandidateGroupCount === 1 ? " still becomes" : "s still become"} eligible only after board closure.`
        : `${explicitExportLaterCandidateGroupCount} export candidate group${explicitExportLaterCandidateGroupCount === 1 ? " is" : "s are"} eligible for later explicit export.`),
    exportCandidateSourceSurfaceSummary:
      memoryBoundary.exportCandidateSourceSurfaceSummary
      ?? (completionPackageSurfaceCandidateGroupCount > 0
        ? `${recentDecisionsSourceCandidateGroupCount} export candidate group${recentDecisionsSourceCandidateGroupCount === 1 ? " comes" : "s come"} from recent decisions, and ${completionPackageSurfaceCandidateGroupCount} group${completionPackageSurfaceCandidateGroupCount === 1 ? " still comes" : "s still come"} from the completion package bundle.`
        : `${recentDecisionsSourceCandidateGroupCount} export candidate group${recentDecisionsSourceCandidateGroupCount === 1 ? " comes" : "s come"} from recent decisions.`),
    exportCandidatePathSummary:
      memoryBoundary.exportCandidatePathSummary
      ?? (afterBoardClosureThenExportCandidateGroupCount > 0
        ? `${readyForExplicitExportCandidateGroupCount} export candidate group${readyForExplicitExportCandidateGroupCount === 1 ? " follows" : "s follow"} the ready-for-explicit-export path, and ${afterBoardClosureThenExportCandidateGroupCount} group${afterBoardClosureThenExportCandidateGroupCount === 1 ? " still follows" : "s still follow"} the after-board-closure-then-export path.`
        : `${readyForExplicitExportCandidateGroupCount} export candidate group${readyForExplicitExportCandidateGroupCount === 1 ? " follows" : "s follow"} the ready-for-explicit-export path.`),
    exportCandidateBlockerSummary:
      memoryBoundary.exportCandidateBlockerSummary
      ?? (boardClosureRequiredCandidateGroupCount > 0
        ? `${noPromotionBlockerCandidateGroupCount} export candidate group${noPromotionBlockerCandidateGroupCount === 1 ? " has" : "s have"} no promotion blocker, and ${boardClosureRequiredCandidateGroupCount} group${boardClosureRequiredCandidateGroupCount === 1 ? " still needs" : "s still need"} board closure as the blocker boundary.`
        : `${noPromotionBlockerCandidateGroupCount} export candidate group${noPromotionBlockerCandidateGroupCount === 1 ? " has" : "s have"} no promotion blocker.`),
    exportCandidateTriggerSummary:
      memoryBoundary.exportCandidateTriggerSummary
      ?? (boardClosureTriggerCandidateGroupCount > 0
        ? `${tenantExportRequestCandidateGroupCount} export candidate group${tenantExportRequestCandidateGroupCount === 1 ? " waits" : "s wait"} on a later tenant export request, and ${boardClosureTriggerCandidateGroupCount} group${boardClosureTriggerCandidateGroupCount === 1 ? " still waits" : "s still wait"} on board closure first.`
        : `${tenantExportRequestCandidateGroupCount} export candidate group${tenantExportRequestCandidateGroupCount === 1 ? " waits" : "s wait"} on a later tenant export request.`),
    exportCandidateAssemblySummary:
      memoryBoundary.exportCandidateAssemblySummary
      ?? (packageRecordSetCandidateGroupCount > 0
        ? `${standaloneExportRecordCandidateGroupCount} export candidate group${standaloneExportRecordCandidateGroupCount === 1 ? " assembles" : "s assemble"} as a standalone export record, and ${packageRecordSetCandidateGroupCount} group${packageRecordSetCandidateGroupCount === 1 ? " still assembles" : "s still assemble"} as a package record set.`
        : `${standaloneExportRecordCandidateGroupCount} export candidate group${standaloneExportRecordCandidateGroupCount === 1 ? " assembles" : "s assemble"} as a standalone export record.`),
    exportCandidatePhaseSummary:
      memoryBoundary.exportCandidatePhaseSummary
      ?? (phaseTwoExportCandidateGroupCount > 0
        ? `${phaseOneExportCandidateGroupCount} export candidate group${phaseOneExportCandidateGroupCount === 1 ? " stays" : "s stay"} in phase-one governance export, and ${phaseTwoExportCandidateGroupCount} group${phaseTwoExportCandidateGroupCount === 1 ? " still stays" : "s still stay"} in phase-two package export.`
        : `${phaseOneExportCandidateGroupCount} export candidate group${phaseOneExportCandidateGroupCount === 1 ? " stays" : "s stay"} in phase-one governance export.`),
    exportCandidateMutabilitySummary:
      memoryBoundary.exportCandidateMutabilitySummary
      ?? (replaceableSnapshotCandidateGroupCount > 0
        ? `${appendOnlyHistoryCandidateGroupCount} export candidate group${appendOnlyHistoryCandidateGroupCount === 1 ? " stays" : "s stay"} append-only history, and ${replaceableSnapshotCandidateGroupCount} group${replaceableSnapshotCandidateGroupCount === 1 ? " still stays" : "s still stay"} replaceable until board closure.`
        : `${appendOnlyHistoryCandidateGroupCount} export candidate group${appendOnlyHistoryCandidateGroupCount === 1 ? " stays" : "s stay"} append-only history.`),
    exportCandidateScopeSummary:
      memoryBoundary.exportCandidateScopeSummary
      ?? (packageRecordSetExportScopeCandidateGroupCount > 0
        ? `${singleRecordExportScopeCandidateGroupCount} export candidate group${singleRecordExportScopeCandidateGroupCount === 1 ? " keeps" : "s keep"} a single-record export scope, and ${packageRecordSetExportScopeCandidateGroupCount} group${packageRecordSetExportScopeCandidateGroupCount === 1 ? " still keeps" : "s still keep"} a package record-set export scope.`
        : `${singleRecordExportScopeCandidateGroupCount} export candidate group${singleRecordExportScopeCandidateGroupCount === 1 ? " keeps" : "s keep"} a single-record export scope.`),
    exportCandidateIdentitySummary:
      memoryBoundary.exportCandidateIdentitySummary
      ?? (closureFinalizedIdentityCandidateGroupCount > 0
        ? `${stableIdentityCandidateGroupCount} export candidate group${stableIdentityCandidateGroupCount === 1 ? " already has" : "s already have"} stable record identity, and ${closureFinalizedIdentityCandidateGroupCount} group${closureFinalizedIdentityCandidateGroupCount === 1 ? " still finalizes" : "s still finalize"} identity after board closure.`
        : `${stableIdentityCandidateGroupCount} export candidate group${stableIdentityCandidateGroupCount === 1 ? " already has" : "s already have"} stable record identity.`),
    exportCandidatePayloadShapeSummary:
      memoryBoundary.exportCandidatePayloadShapeSummary
      ?? (packageSnapshotBundleCandidateGroupCount > 0
        ? `${governanceHistoryPayloadCandidateGroupCount} export candidate group${governanceHistoryPayloadCandidateGroupCount === 1 ? " uses" : "s use"} governance history record payloads, and ${packageSnapshotBundleCandidateGroupCount} group${packageSnapshotBundleCandidateGroupCount === 1 ? " still uses" : "s still use"} package snapshot bundle payloads.`
        : `${governanceHistoryPayloadCandidateGroupCount} export candidate group${governanceHistoryPayloadCandidateGroupCount === 1 ? " uses" : "s use"} governance history record payloads.`),
    exportCandidateIdempotencySummary:
      memoryBoundary.exportCandidateIdempotencySummary
      ?? (boardClosureSnapshotOnceCandidateGroupCount > 0
        ? `${deterministicUpsertCandidateGroupCount} export candidate group${deterministicUpsertCandidateGroupCount === 1 ? " uses" : "s use"} deterministic upsert, and ${boardClosureSnapshotOnceCandidateGroupCount} group${boardClosureSnapshotOnceCandidateGroupCount === 1 ? " still depends" : "s still depend"} on board-closure snapshot-once idempotency.`
        : `${deterministicUpsertCandidateGroupCount} export candidate group${deterministicUpsertCandidateGroupCount === 1 ? " uses" : "s use"} deterministic upsert.`),
    exportCandidateReplaySafetySummary:
      memoryBoundary.exportCandidateReplaySafetySummary
      ?? (freshClosureSnapshotReplayCandidateGroupCount > 0
        ? `${replaySafeCandidateGroupCount} export candidate group${replaySafeCandidateGroupCount === 1 ? " is" : "s are"} replay-safe, and ${freshClosureSnapshotReplayCandidateGroupCount} group${freshClosureSnapshotReplayCandidateGroupCount === 1 ? " still requires" : "s still require"} a fresh board-closure snapshot before replay.`
        : `${replaySafeCandidateGroupCount} export candidate group${replaySafeCandidateGroupCount === 1 ? " is" : "s are"} replay-safe.`),
    exportCandidateConflictPolicySummary:
      memoryBoundary.exportCandidateConflictPolicySummary
      ?? (replaceLatestClosureSnapshotCandidateGroupCount > 0
        ? `${appendOrUpsertConflictCandidateGroupCount} export candidate group${appendOrUpsertConflictCandidateGroupCount === 1 ? " uses" : "s use"} append-or-upsert conflict handling, and ${replaceLatestClosureSnapshotCandidateGroupCount} group${replaceLatestClosureSnapshotCandidateGroupCount === 1 ? " still replaces" : "s still replace"} the latest board-closure snapshot on conflict.`
        : `${appendOrUpsertConflictCandidateGroupCount} export candidate group${appendOrUpsertConflictCandidateGroupCount === 1 ? " uses" : "s use"} append-or-upsert conflict handling.`),
    exportCandidateAtomicitySummary:
      memoryBoundary.exportCandidateAtomicitySummary
      ?? (closureBundleAtomicCandidateGroupCount > 0
        ? `${recordLevelAtomicCandidateGroupCount} export candidate group${recordLevelAtomicCandidateGroupCount === 1 ? " commits" : "s commit"} as record-level atomic exports, and ${closureBundleAtomicCandidateGroupCount} group${closureBundleAtomicCandidateGroupCount === 1 ? " still depends" : "s still depend"} on closure-bundle atomic export.`
        : `${recordLevelAtomicCandidateGroupCount} export candidate group${recordLevelAtomicCandidateGroupCount === 1 ? " commits" : "s commit"} as record-level atomic exports.`),
    exportCandidateDerivationSummary:
      memoryBoundary.exportCandidateDerivationSummary
      ?? (boardClosureSnapshotDerivedCandidateGroupCount > 0
        ? `${decisionHistoryDerivedCandidateGroupCount} export candidate group${decisionHistoryDerivedCandidateGroupCount === 1 ? " is" : "s are"} derived from decision history, and ${boardClosureSnapshotDerivedCandidateGroupCount} group${boardClosureSnapshotDerivedCandidateGroupCount === 1 ? " is" : "s are"} derived from the board-closure snapshot.`
        : `${decisionHistoryDerivedCandidateGroupCount} export candidate group${decisionHistoryDerivedCandidateGroupCount === 1 ? " is" : "s are"} derived from decision history.`),
    exportCandidateRevisionSummary:
      memoryBoundary.exportCandidateRevisionSummary
      ?? (replaceClosureBundleRevisionCandidateGroupCount > 0
        ? `${appendNewRevisionCandidateGroupCount} export candidate group${appendNewRevisionCandidateGroupCount === 1 ? " appends" : "s append"} as new revisions, and ${replaceClosureBundleRevisionCandidateGroupCount} group${replaceClosureBundleRevisionCandidateGroupCount === 1 ? " still replaces" : "s still replace"} the current closure-bundle revision.`
        : `${appendNewRevisionCandidateGroupCount} export candidate group${appendNewRevisionCandidateGroupCount === 1 ? " appends" : "s append"} as new revisions.`),
    exportCandidateFreshnessSummary:
      memoryBoundary.exportCandidateFreshnessSummary
      ?? (latestBoardClosureSnapshotCandidateGroupCount > 0
        ? `${latestRecordStateCandidateGroupCount} export candidate group${latestRecordStateCandidateGroupCount === 1 ? " uses" : "s use"} the latest record state, and ${latestBoardClosureSnapshotCandidateGroupCount} group${latestBoardClosureSnapshotCandidateGroupCount === 1 ? " still depends" : "s still depend"} on the latest board-closure snapshot.`
        : `${latestRecordStateCandidateGroupCount} export candidate group${latestRecordStateCandidateGroupCount === 1 ? " uses" : "s use"} the latest record state.`),
    exportCandidateValidationSummary:
      memoryBoundary.exportCandidateValidationSummary
      ?? (closureBundleValidationCandidateGroupCount > 0
        ? `${recordLevelValidationCandidateGroupCount} export candidate group${recordLevelValidationCandidateGroupCount === 1 ? " validates" : "s validate"} at record level, and ${closureBundleValidationCandidateGroupCount} group${closureBundleValidationCandidateGroupCount === 1 ? " still validates" : "s still validate"} at closure-bundle level.`
        : `${recordLevelValidationCandidateGroupCount} export candidate group${recordLevelValidationCandidateGroupCount === 1 ? " validates" : "s validate"} at record level.`),
    exportCandidateCompletenessSummary:
      memoryBoundary.exportCandidateCompletenessSummary
      ?? (boardClosureCompleteBundleCandidateGroupCount > 0
        ? `${selfContainedRecordCandidateGroupCount} export candidate group${selfContainedRecordCandidateGroupCount === 1 ? " is" : "s are"} self-contained records, and ${boardClosureCompleteBundleCandidateGroupCount} group${boardClosureCompleteBundleCandidateGroupCount === 1 ? " still completes" : "s still complete"} as board-closure bundles.`
        : `${selfContainedRecordCandidateGroupCount} export candidate group${selfContainedRecordCandidateGroupCount === 1 ? " is" : "s are"} self-contained records.`),
    partitions: memoryBoundary.partitions ?? {
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
}

function normalizeBoardResponse(
  board: HarnessBoardResponse | LegacyHarnessBoardResponse
): HarnessBoardResponse {
  if (board.memoryBoundary) {
    return {
      ...board,
      memoryBoundary: normalizeMemoryBoundary(board.memoryBoundary, board)
    } as HarnessBoardResponse;
  }

  const exportReadyItems: HarnessBoardResponse["memoryBoundary"]["exportReadyItems"] = [
    {
      id: "governance_decisions",
      label: "Governance decisions",
      count: board.recentDecisions.length,
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
      assemblyShape: "standalone_export_record",
      assemblyShapeLabel: "Standalone export record",
      promotionActionDescription: "This governance history is ready to sit behind a later bounded tenant export action."
    },
    {
      id: "implemented_actions",
      label: "Implemented actions",
      count: board.followThroughItems.length,
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
      assemblyShape: "standalone_export_record",
      assemblyShapeLabel: "Standalone export record",
      promotionActionDescription:
        "This implemented follow-through is ready to sit behind a later bounded tenant export action."
    },
    {
      id: "package_governance",
      label: "Package governance",
      count: board.completionPackage?.governanceItems.length ?? 0,
      summary: "Package-shaped governance items are ready for later tenant-owned board records.",
      destination: "tenant_record_candidate",
      readiness: board.completionPackage?.hasOpenGovernanceItems ? "after_board_closes" : "ready_now",
      readinessLabel: board.completionPackage?.hasOpenGovernanceItems ? "After board closes" : "Ready now",
      role: "packaged_record_candidate",
      roleLabel: "Packaged record candidate",
      eligibilityRule: board.completionPackage?.hasOpenGovernanceItems
        ? "after_board_closes_then_export"
        : "explicit_export_later",
      eligibilityRuleLabel: board.completionPackage?.hasOpenGovernanceItems
        ? "After board closes, then export"
        : "Explicit export later",
      sourceSurface: "completion_package_governance",
      sourceSurfaceLabel: "Completion package governance",
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
      candidateClass: "packaged_output",
      candidateClassLabel: "Packaged output",
      durabilityCondition: board.completionPackage?.hasOpenGovernanceItems
        ? "stable_after_board_closure"
        : "stable_when_recorded",
        durabilityConditionLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Stable after board closure"
          : "Stable when recorded",
        ownershipBoundary: "tenant_owned_later",
        ownershipBoundaryLabel: "Tenant-owned later",
        promotionPath: board.completionPackage?.hasOpenGovernanceItems
          ? "after_board_closure_then_export"
          : "ready_for_explicit_export",
        promotionPathLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "After board closure, then export"
          : "Ready for explicit export",
        recordTarget: "package_governance_record",
        recordTargetLabel: "Package governance record",
        promotionBlocker: board.completionPackage?.hasOpenGovernanceItems
          ? "board_closure_required"
          : "none_ready_now",
        promotionBlockerLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Board closure required"
          : "No blocker",
        promotionAuthority: board.completionPackage?.hasOpenGovernanceItems
          ? "board_closure_then_tenant_export"
          : "tenant_explicit_export",
        promotionAuthorityLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Board closure, then tenant export"
          : "Tenant explicit export",
        promotionTrigger: board.completionPackage?.hasOpenGovernanceItems
          ? "board_closure"
          : "tenant_export_request",
        promotionTriggerLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Board closure"
          : "Tenant export request",
        promotionState: board.completionPackage?.hasOpenGovernanceItems
          ? "awaiting_board_closure"
          : "ready_for_tenant_export",
        promotionStateLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Awaiting board closure"
          : "Ready for tenant export",
        promotionNextStep: board.completionPackage?.hasOpenGovernanceItems
          ? "board_closure_then_tenant_export"
          : "tenant_export_available",
        promotionNextStepLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Board closure, then tenant export"
          : "Tenant export available",
        promotionActionFamily: board.completionPackage?.hasOpenGovernanceItems
          ? "board_closure_before_export"
          : "tenant_export_candidate",
        promotionActionFamilyLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Board closure first"
          : "Tenant export family",
        promotionPhase: "phase_two_package_export",
        promotionPhaseLabel: "Phase-two package export",
        promotionMutability: board.completionPackage?.hasOpenGovernanceItems
          ? "replaceable_until_board_closure"
          : "stable_snapshot",
        promotionMutabilityLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Replaceable until board closure"
          : "Stable snapshot",
        promotionScope: "package_record_set_export",
        promotionScopeLabel: "Package record-set export",
        identityStability: board.completionPackage?.hasOpenGovernanceItems
          ? "finalized_after_board_closure"
          : "stable_record_identity",
        identityStabilityLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Finalized after board closure"
          : "Stable record identity",
        auditBacking: "package_closure_backed",
        auditBackingLabel: "Package-closure-backed",
        concurrencyBoundary: board.completionPackage?.hasOpenGovernanceItems
          ? "requires_board_closure_snapshot"
          : "independent_export_safe",
        concurrencyBoundaryLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Requires board-closure snapshot"
          : "Independent export safe",
        exportPayloadShape: "package_snapshot_bundle",
        exportPayloadShapeLabel: "Package snapshot bundle",
        idempotencyPolicy: board.completionPackage?.hasOpenGovernanceItems
          ? "board_closure_snapshot_once"
          : "deterministic_upsert",
        idempotencyPolicyLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Board-closure snapshot once"
          : "Deterministic upsert",
        replaySafety: board.completionPackage?.hasOpenGovernanceItems
          ? "requires_fresh_board_closure_snapshot"
          : "replay_safe",
        replaySafetyLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Requires fresh board-closure snapshot"
          : "Replay-safe",
        conflictPolicy: board.completionPackage?.hasOpenGovernanceItems
          ? "replace_latest_closure_snapshot"
          : "append_or_upsert",
        conflictPolicyLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Replace latest closure snapshot"
          : "Append or upsert",
        exportAtomicity: board.completionPackage?.hasOpenGovernanceItems
          ? "closure_bundle_atomic"
          : "record_level_atomic",
        exportAtomicityLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Closure-bundle atomic"
          : "Record-level atomic",
        exportDerivationBasis: "board_closure_snapshot_derived",
        exportDerivationBasisLabel: "Board-closure-snapshot-derived",
        exportRevisionPolicy: board.completionPackage?.hasOpenGovernanceItems
          ? "replace_closure_bundle_revision"
          : "append_new_revision",
        exportRevisionPolicyLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Replace closure-bundle revision"
          : "Append new revision",
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
        assemblyShape: "package_record_set",
        assemblyShapeLabel: "Package record set",
        promotionActionDescription: board.completionPackage?.hasOpenGovernanceItems
          ? "Board closure still gates this package governance memory before any later tenant export action can apply."
          : "This package governance memory is ready to sit behind a later bounded tenant export action.",
        ...(board.completionPackage?.hasOpenGovernanceItems
          ? {
            nextEligibleSummary:
              "Board closure is still required before this package-shaped governance memory becomes a durable tenant record candidate."
          }
        : {})
    },
    {
      id: "package_deliverables",
      label: "Packaged deliverables",
      count: board.completionPackage?.deliverables.length ?? 0,
      summary: "Tenant-facing deliverables are ready to become long-memory business records later.",
      destination: "tenant_record_candidate",
      readiness: board.completionPackage?.hasOpenGovernanceItems ? "after_board_closes" : "ready_now",
      readinessLabel: board.completionPackage?.hasOpenGovernanceItems ? "After board closes" : "Ready now",
      role: "packaged_record_candidate",
      roleLabel: "Packaged record candidate",
      eligibilityRule: board.completionPackage?.hasOpenGovernanceItems
        ? "after_board_closes_then_export"
        : "explicit_export_later",
      eligibilityRuleLabel: board.completionPackage?.hasOpenGovernanceItems
        ? "After board closes, then export"
        : "Explicit export later",
      sourceSurface: "completion_package_deliverables",
      sourceSurfaceLabel: "Completion package deliverables",
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
      candidateClass: "packaged_output",
      candidateClassLabel: "Packaged output",
      durabilityCondition: board.completionPackage?.hasOpenGovernanceItems
        ? "stable_after_board_closure"
        : "stable_when_recorded",
        durabilityConditionLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Stable after board closure"
          : "Stable when recorded",
        ownershipBoundary: "tenant_owned_later",
        ownershipBoundaryLabel: "Tenant-owned later",
        promotionPath: board.completionPackage?.hasOpenGovernanceItems
          ? "after_board_closure_then_export"
          : "ready_for_explicit_export",
        promotionPathLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "After board closure, then export"
          : "Ready for explicit export",
        recordTarget: "package_deliverable_record",
        recordTargetLabel: "Package deliverable record",
        promotionBlocker: board.completionPackage?.hasOpenGovernanceItems
          ? "board_closure_required"
          : "none_ready_now",
        promotionBlockerLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Board closure required"
          : "No blocker",
        promotionAuthority: board.completionPackage?.hasOpenGovernanceItems
          ? "board_closure_then_tenant_export"
          : "tenant_explicit_export",
        promotionAuthorityLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Board closure, then tenant export"
          : "Tenant explicit export",
        promotionTrigger: board.completionPackage?.hasOpenGovernanceItems
          ? "board_closure"
          : "tenant_export_request",
        promotionTriggerLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Board closure"
          : "Tenant export request",
        promotionState: board.completionPackage?.hasOpenGovernanceItems
          ? "awaiting_board_closure"
          : "ready_for_tenant_export",
        promotionStateLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Awaiting board closure"
          : "Ready for tenant export",
        promotionNextStep: board.completionPackage?.hasOpenGovernanceItems
          ? "board_closure_then_tenant_export"
          : "tenant_export_available",
        promotionNextStepLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Board closure, then tenant export"
          : "Tenant export available",
        promotionActionFamily: board.completionPackage?.hasOpenGovernanceItems
          ? "board_closure_before_export"
          : "tenant_export_candidate",
        promotionActionFamilyLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Board closure first"
          : "Tenant export family",
        promotionPhase: "phase_two_package_export",
        promotionPhaseLabel: "Phase-two package export",
        promotionMutability: board.completionPackage?.hasOpenGovernanceItems
          ? "replaceable_until_board_closure"
          : "stable_snapshot",
        promotionMutabilityLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Replaceable until board closure"
          : "Stable snapshot",
        promotionScope: "package_record_set_export",
        promotionScopeLabel: "Package record-set export",
        identityStability: board.completionPackage?.hasOpenGovernanceItems
          ? "finalized_after_board_closure"
          : "stable_record_identity",
        identityStabilityLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Finalized after board closure"
          : "Stable record identity",
        auditBacking: "package_closure_backed",
        auditBackingLabel: "Package-closure-backed",
        concurrencyBoundary: board.completionPackage?.hasOpenGovernanceItems
          ? "requires_board_closure_snapshot"
          : "independent_export_safe",
        concurrencyBoundaryLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Requires board-closure snapshot"
          : "Independent export safe",
        exportPayloadShape: "package_snapshot_bundle",
        exportPayloadShapeLabel: "Package snapshot bundle",
        idempotencyPolicy: board.completionPackage?.hasOpenGovernanceItems
          ? "board_closure_snapshot_once"
          : "deterministic_upsert",
        idempotencyPolicyLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Board-closure snapshot once"
          : "Deterministic upsert",
        replaySafety: board.completionPackage?.hasOpenGovernanceItems
          ? "requires_fresh_board_closure_snapshot"
          : "replay_safe",
        replaySafetyLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Requires fresh board-closure snapshot"
          : "Replay-safe",
        conflictPolicy: board.completionPackage?.hasOpenGovernanceItems
          ? "replace_latest_closure_snapshot"
          : "append_or_upsert",
        conflictPolicyLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Replace latest closure snapshot"
          : "Append or upsert",
        exportAtomicity: board.completionPackage?.hasOpenGovernanceItems
          ? "closure_bundle_atomic"
          : "record_level_atomic",
        exportAtomicityLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Closure-bundle atomic"
          : "Record-level atomic",
        exportDerivationBasis: "board_closure_snapshot_derived",
        exportDerivationBasisLabel: "Board-closure-snapshot-derived",
        exportRevisionPolicy: board.completionPackage?.hasOpenGovernanceItems
          ? "replace_closure_bundle_revision"
          : "append_new_revision",
        exportRevisionPolicyLabel: board.completionPackage?.hasOpenGovernanceItems
          ? "Replace closure-bundle revision"
          : "Append new revision",
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
        assemblyShape: "package_record_set",
        assemblyShapeLabel: "Package record set",
        promotionActionDescription: board.completionPackage?.hasOpenGovernanceItems
          ? "Board closure still gates this packaged deliverable before any later tenant export action can apply."
          : "This packaged deliverable is ready to sit behind a later bounded tenant export action.",
        ...(board.completionPackage?.hasOpenGovernanceItems
          ? {
            nextEligibleSummary:
              "Board closure is still required before this packaged deliverable becomes a durable tenant record candidate."
          }
        : {})
    }
  ];
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

  return {
    ...board,
    memoryBoundary: normalizeMemoryBoundary({
      summary:
        "Wealth Factory runtime keeps bounded operational lane memory live while governance and package records stay ready for later tenant-owned export.",
      exportSummary:
        waitingOnBoardClosureCount > 0
          ? `${readyNowCount} export candidate${readyNowCount === 1 ? "" : "s"} ${readyNowCount === 1 ? "is" : "are"} ready now, and ${waitingOnBoardClosureCount} ${waitingOnBoardClosureCount === 1 ? "still waits" : "still wait"} for board closure.`
          : `${readyNowCount} export candidate${readyNowCount === 1 ? "" : "s"} ${readyNowCount === 1 ? "is" : "are"} ready now. No export candidates are waiting on board closure.`,
      deliverySummary: "No grouped export deliveries have been attempted yet.",
      readyNowCount,
      waitingOnBoardClosureCount,
      governanceReadyCount,
      packagedReadyCount,
      packagedWaitingCount,
      blockedCandidateCount: waitingOnBoardClosureCount,
      tenantControlledCandidateCount: exportReadyItems.filter((item) => item.promotionAuthority === "tenant_explicit_export").length,
      boardControlledCandidateCount: exportReadyItems.filter((item) => item.promotionAuthority === "board_closure_then_tenant_export").length,
      tenantExportTriggerCount: exportReadyItems.filter((item) => item.promotionTrigger === "tenant_export_request").length,
      boardClosureTriggerCount: exportReadyItems.filter((item) => item.promotionTrigger === "board_closure").length,
      runtimeOnlyStateCount: 2,
      readyForTenantExportStateCount: exportReadyItems.filter((item) => item.promotionState === "ready_for_tenant_export").length,
      awaitingBoardClosureStateCount: exportReadyItems.filter((item) => item.promotionState === "awaiting_board_closure").length,
      runtimeOnlyNextStepCount: 2,
      tenantExportAvailableNextStepCount: exportReadyItems.filter((item) => item.promotionNextStep === "tenant_export_available").length,
      boardClosureThenTenantExportNextStepCount: exportReadyItems.filter((item) => item.promotionNextStep === "board_closure_then_tenant_export").length,
      noPromotionActionCount: 2,
      tenantExportActionFamilyCount: exportReadyItems.filter((item) => item.promotionActionFamily === "tenant_export_candidate").length,
      boardClosureActionFamilyCount: exportReadyItems.filter((item) => item.promotionActionFamily === "board_closure_before_export").length,
      noAssemblyShapeCount: 2,
      standaloneExportRecordCount: exportReadyItems.filter((item) => item.assemblyShape === "standalone_export_record").length,
      packageRecordSetCount: exportReadyItems.filter((item) => item.assemblyShape === "package_record_set").length,
      noExportPhaseCount: 2,
      phaseOneExportCount: exportReadyItems.filter((item) => item.promotionPhase === "phase_one_governance_history").length,
      phaseTwoExportCount: exportReadyItems.filter((item) => item.promotionPhase === "phase_two_package_export").length,
      runtimeMutableCount: 2,
      appendOnlyHistoryCount: exportReadyItems.filter((item) => item.promotionMutability === "append_only_history").length,
      replaceableSnapshotCount: exportReadyItems.filter((item) => item.promotionMutability === "replaceable_until_board_closure").length,
      stableSnapshotCount: exportReadyItems.filter((item) => item.promotionMutability === "stable_snapshot").length,
      noPromotionScopeCount: 2,
      singleRecordExportScopeCount: exportReadyItems.filter((item) => item.promotionScope === "single_record_export").length,
      packageRecordSetExportScopeCount: exportReadyItems.filter((item) => item.promotionScope === "package_record_set_export").length,
      transientIdentityCount: 2,
      stableIdentityCount: exportReadyItems.filter((item) => item.identityStability === "stable_record_identity").length,
      closureFinalizedIdentityCount: exportReadyItems.filter((item) => item.identityStability === "finalized_after_board_closure").length,
      runtimeStateOnlyAuditCount: 2,
      decisionLedgerAuditCount: exportReadyItems.filter((item) => item.auditBacking === "decision_ledger_backed").length,
      packageClosureAuditCount: exportReadyItems.filter((item) => item.auditBacking === "package_closure_backed").length,
      runtimeOnlyConcurrencyCount: 2,
      independentExportSafeCount: exportReadyItems.filter((item) => item.concurrencyBoundary === "independent_export_safe").length,
      requiresBoardClosureSnapshotCount: exportReadyItems.filter((item) => item.concurrencyBoundary === "requires_board_closure_snapshot").length,
      noExportPayloadShapeCount: 2,
      governanceHistoryPayloadCount: exportReadyItems.filter((item) => item.exportPayloadShape === "governance_history_record").length,
      packageSnapshotBundleCount: exportReadyItems.filter((item) => item.exportPayloadShape === "package_snapshot_bundle").length,
      noIdempotencyPolicyCount: 2,
      deterministicUpsertCount: exportReadyItems.filter((item) => item.idempotencyPolicy === "deterministic_upsert").length,
      boardClosureSnapshotOnceCount: exportReadyItems.filter((item) => item.idempotencyPolicy === "board_closure_snapshot_once").length,
      runtimeOnlyReplaySafetyCount: 2,
      replaySafeCount: exportReadyItems.filter((item) => item.replaySafety === "replay_safe").length,
      freshClosureSnapshotReplayCount: exportReadyItems.filter((item) => item.replaySafety === "requires_fresh_board_closure_snapshot").length,
      runtimeOnlyConflictPolicyCount: 2,
      appendOrUpsertConflictCount: exportReadyItems.filter((item) => item.conflictPolicy === "append_or_upsert").length,
      replaceLatestClosureSnapshotCount: exportReadyItems.filter((item) => item.conflictPolicy === "replace_latest_closure_snapshot").length,
      noExportAtomicityCount: 2,
      recordLevelAtomicCount: exportReadyItems.filter((item) => item.exportAtomicity === "record_level_atomic").length,
      closureBundleAtomicCount: exportReadyItems.filter((item) => item.exportAtomicity === "closure_bundle_atomic").length,
      noExportDerivationBasisCount: 2,
      decisionHistoryDerivedCount: exportReadyItems.filter((item) => item.exportDerivationBasis === "decision_history_derived").length,
      boardClosureSnapshotDerivedCount: exportReadyItems.filter((item) => item.exportDerivationBasis === "board_closure_snapshot_derived").length,
      noExportRevisionPolicyCount: 2,
      appendNewRevisionCount: exportReadyItems.filter((item) => item.exportRevisionPolicy === "append_new_revision").length,
      replaceClosureBundleRevisionCount: exportReadyItems.filter((item) => item.exportRevisionPolicy === "replace_closure_bundle_revision").length,
      noExportFreshnessSourceCount: 2,
      latestRecordStateCount: exportReadyItems.filter((item) => item.exportFreshnessSource === "latest_record_state").length,
      latestBoardClosureSnapshotCount: exportReadyItems.filter((item) => item.exportFreshnessSource === "latest_board_closure_snapshot").length,
      noExportValidationBoundaryCount: 2,
      recordLevelValidationCount: exportReadyItems.filter((item) => item.exportValidationBoundary === "record_level_validation").length,
      closureBundleValidationCount: exportReadyItems.filter((item) => item.exportValidationBoundary === "closure_bundle_validation").length,
      noExportCompletenessRuleCount: 2,
      selfContainedRecordCount: exportReadyItems.filter((item) => item.exportCompletenessRule === "self_contained_record").length,
      boardClosureCompleteBundleCount: exportReadyItems.filter((item) => item.exportCompletenessRule === "board_closure_complete_bundle").length,
      roleSummary:
        packagedWaitingCount > 0
          ? `${governanceReadyCount} governance record candidate${governanceReadyCount === 1 ? "" : "s"} ${governanceReadyCount === 1 ? "is" : "are"} ready now, and ${packagedWaitingCount} packaged output candidate${packagedWaitingCount === 1 ? "" : "s"} ${packagedWaitingCount === 1 ? "still waits" : "still wait"} on board closure.`
          : `${governanceReadyCount + packagedReadyCount} tenant-record candidate${governanceReadyCount + packagedReadyCount === 1 ? " is" : "s are"} ready now, including ${governanceReadyCount} governance history candidate${governanceReadyCount === 1 ? "" : "s"} and ${packagedReadyCount} packaged output candidate${packagedReadyCount === 1 ? "" : "s"}.`,
      ownershipSummary:
        `2 runtime memory buckets stay Wealth Factory-only, while ${exportReadyItems.length} tenant-record candidate bucket${exportReadyItems.length === 1 ? "" : "s"} may become tenant-owned later.`,
      promotionSummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime memory buckets never promote, ${readyNowCount} candidate bucket${readyNowCount === 1 ? " is" : "s are"} ready for explicit export later, and ${waitingOnBoardClosureCount} candidate bucket${waitingOnBoardClosureCount === 1 ? " still waits" : "s still wait"} on board closure first.`
          : `2 runtime memory buckets never promote, and ${readyNowCount} candidate bucket${readyNowCount === 1 ? " is" : "s are"} ready for explicit export later.`,
      recordTargetSummary:
        waitingOnBoardClosureCount > 0
          ? `${governanceReadyCount} governance history record candidate${governanceReadyCount === 1 ? "" : "s"} ${governanceReadyCount === 1 ? "is" : "are"} ready, while ${packagedReadyCount + packagedWaitingCount} package record candidate${packagedReadyCount + packagedWaitingCount === 1 ? "" : "s"} ${packagedReadyCount + packagedWaitingCount === 1 ? "stays" : "stay"} package-shaped until board closure completes.`
          : `${governanceReadyCount} governance history record candidate${governanceReadyCount === 1 ? "" : "s"} and ${packagedReadyCount} package record candidate${packagedReadyCount === 1 ? "" : "s"} are ready for later tenant export.`,
      blockerSummary:
        waitingOnBoardClosureCount > 0
          ? `${waitingOnBoardClosureCount} export candidate bucket${waitingOnBoardClosureCount === 1 ? " is" : "s are"} still blocked by board closure. Runtime memory stays non-promotable by design.`
          : "No export candidate buckets are currently blocked. Runtime memory stays non-promotable by design.",
      authoritySummary:
        waitingOnBoardClosureCount > 0
          ? `${governanceReadyCount + packagedReadyCount} export candidate bucket${governanceReadyCount + packagedReadyCount === 1 ? " is" : "s are"} already tenant-controlled for later explicit export, while ${waitingOnBoardClosureCount} bucket${waitingOnBoardClosureCount === 1 ? " still needs" : "s still need"} board closure before tenant export can own the next step.`
          : `${governanceReadyCount + packagedReadyCount} export candidate bucket${governanceReadyCount + packagedReadyCount === 1 ? " is" : "s are"} tenant-controlled for later explicit export, while runtime memory remains Wealth Factory-only.`,
      triggerSummary:
        waitingOnBoardClosureCount > 0
          ? `${readyNowCount} export candidate bucket${readyNowCount === 1 ? " is" : "s are"} waiting only on a later tenant export request, while ${waitingOnBoardClosureCount} bucket${waitingOnBoardClosureCount === 1 ? " still needs" : "s still need"} board closure before that request can happen.`
          : `${readyNowCount} export candidate bucket${readyNowCount === 1 ? " is" : "s are"} ready for a later tenant export request, while runtime memory has no promotion trigger.`,
      nextStepSummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets have no promotion step, ${exportReadyItems.filter((item) => item.promotionNextStep === "tenant_export_available").length} export candidate bucket${exportReadyItems.filter((item) => item.promotionNextStep === "tenant_export_available").length === 1 ? " is" : "s are"} ready for a later tenant export step, and ${exportReadyItems.filter((item) => item.promotionNextStep === "board_closure_then_tenant_export").length} bucket${exportReadyItems.filter((item) => item.promotionNextStep === "board_closure_then_tenant_export").length === 1 ? " still needs" : "s still need"} board closure before tenant export becomes the next step.`
          : `2 runtime buckets have no promotion step, and ${exportReadyItems.filter((item) => item.promotionNextStep === "tenant_export_available").length} export candidate bucket${exportReadyItems.filter((item) => item.promotionNextStep === "tenant_export_available").length === 1 ? " is" : "s are"} ready for a later tenant export step.`,
      actionFamilySummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets expose no promotion action, ${exportReadyItems.filter((item) => item.promotionActionFamily === "tenant_export_candidate").length} export candidate bucket${exportReadyItems.filter((item) => item.promotionActionFamily === "tenant_export_candidate").length === 1 ? " sits" : "s sit"} in the tenant export family, and ${exportReadyItems.filter((item) => item.promotionActionFamily === "board_closure_before_export").length} bucket${exportReadyItems.filter((item) => item.promotionActionFamily === "board_closure_before_export").length === 1 ? " remains" : "s remain"} in the board-closure-first family.`
          : `2 runtime buckets expose no promotion action, and ${exportReadyItems.filter((item) => item.promotionActionFamily === "tenant_export_candidate").length} export candidate bucket${exportReadyItems.filter((item) => item.promotionActionFamily === "tenant_export_candidate").length === 1 ? " sits" : "s sit"} in the tenant export family.`,
      assemblySummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets have no export assembly, ${exportReadyItems.filter((item) => item.assemblyShape === "standalone_export_record").length} export candidate bucket${exportReadyItems.filter((item) => item.assemblyShape === "standalone_export_record").length === 1 ? " is" : "s are"} ready as standalone export records, and ${exportReadyItems.filter((item) => item.assemblyShape === "package_record_set").length} bucket${exportReadyItems.filter((item) => item.assemblyShape === "package_record_set").length === 1 ? " still belongs" : "s still belong"} to a package record set after board closure.`
          : `2 runtime buckets have no export assembly, and ${exportReadyItems.filter((item) => item.assemblyShape === "standalone_export_record").length} export candidate bucket${exportReadyItems.filter((item) => item.assemblyShape === "standalone_export_record").length === 1 ? " is" : "s are"} ready as standalone export records.`,
      phaseSummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets have no export phase, ${exportReadyItems.filter((item) => item.promotionPhase === "phase_one_governance_history").length} export candidate bucket${exportReadyItems.filter((item) => item.promotionPhase === "phase_one_governance_history").length === 1 ? " is" : "s are"} ready in the phase-one export lane, and ${exportReadyItems.filter((item) => item.promotionPhase === "phase_two_package_export").length} bucket${exportReadyItems.filter((item) => item.promotionPhase === "phase_two_package_export").length === 1 ? " still waits" : "s still wait"} in the phase-two package export lane.`
          : `2 runtime buckets have no export phase, and ${exportReadyItems.filter((item) => item.promotionPhase === "phase_one_governance_history").length} export candidate bucket${exportReadyItems.filter((item) => item.promotionPhase === "phase_one_governance_history").length === 1 ? " is" : "s are"} ready in the phase-one export lane.`,
      mutabilitySummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets stay runtime mutable, ${exportReadyItems.filter((item) => item.promotionMutability === "append_only_history").length} export candidate bucket${exportReadyItems.filter((item) => item.promotionMutability === "append_only_history").length === 1 ? " is" : "s are"} append-only history, and ${exportReadyItems.filter((item) => item.promotionMutability === "replaceable_until_board_closure").length} bucket${exportReadyItems.filter((item) => item.promotionMutability === "replaceable_until_board_closure").length === 1 ? " still behaves" : "s still behave"} as replaceable package snapshots until board closure.`
          : `2 runtime buckets stay runtime mutable, ${exportReadyItems.filter((item) => item.promotionMutability === "append_only_history").length} export candidate bucket${exportReadyItems.filter((item) => item.promotionMutability === "append_only_history").length === 1 ? " is" : "s are"} append-only history, and ${exportReadyItems.filter((item) => item.promotionMutability === "stable_snapshot").length} bucket${exportReadyItems.filter((item) => item.promotionMutability === "stable_snapshot").length === 1 ? " is" : "s are"} now stable package snapshots.`,
      scopeSummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets have no promotion scope, ${exportReadyItems.filter((item) => item.promotionScope === "single_record_export").length} export candidate bucket${exportReadyItems.filter((item) => item.promotionScope === "single_record_export").length === 1 ? " is" : "s are"} ready as single-record exports, and ${exportReadyItems.filter((item) => item.promotionScope === "package_record_set_export").length} bucket${exportReadyItems.filter((item) => item.promotionScope === "package_record_set_export").length === 1 ? " still belongs" : "s still belong"} to a package record-set export scope.`
          : `2 runtime buckets have no promotion scope, and ${exportReadyItems.filter((item) => item.promotionScope === "single_record_export").length} export candidate bucket${exportReadyItems.filter((item) => item.promotionScope === "single_record_export").length === 1 ? " is" : "s are"} ready as single-record exports.`,
      identitySummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets keep transient runtime identity, ${exportReadyItems.filter((item) => item.identityStability === "stable_record_identity").length} bucket${exportReadyItems.filter((item) => item.identityStability === "stable_record_identity").length === 1 ? " already has" : "s already have"} stable record identity, and ${exportReadyItems.filter((item) => item.identityStability === "finalized_after_board_closure").length} bucket${exportReadyItems.filter((item) => item.identityStability === "finalized_after_board_closure").length === 1 ? " still finalizes" : "s still finalize"} identity at board closure.`
          : `2 runtime buckets keep transient runtime identity, and ${exportReadyItems.filter((item) => item.identityStability === "stable_record_identity").length} bucket${exportReadyItems.filter((item) => item.identityStability === "stable_record_identity").length === 1 ? " already has" : "s already have"} stable record identity.`,
      auditSummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets stay runtime-state-backed, ${exportReadyItems.filter((item) => item.auditBacking === "decision_ledger_backed").length} bucket${exportReadyItems.filter((item) => item.auditBacking === "decision_ledger_backed").length === 1 ? " is" : "s are"} decision-ledger-backed, and ${exportReadyItems.filter((item) => item.auditBacking === "package_closure_backed").length} bucket${exportReadyItems.filter((item) => item.auditBacking === "package_closure_backed").length === 1 ? " is" : "s are"} package-closure-backed.`
          : `2 runtime buckets stay runtime-state-backed, and ${exportReadyItems.filter((item) => item.auditBacking === "decision_ledger_backed").length} bucket${exportReadyItems.filter((item) => item.auditBacking === "decision_ledger_backed").length === 1 ? " is" : "s are"} decision-ledger-backed.`,
      concurrencySummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets stay runtime-only, ${exportReadyItems.filter((item) => item.concurrencyBoundary === "independent_export_safe").length} export candidate bucket${exportReadyItems.filter((item) => item.concurrencyBoundary === "independent_export_safe").length === 1 ? " is" : "s are"} safe to promote independently, and ${exportReadyItems.filter((item) => item.concurrencyBoundary === "requires_board_closure_snapshot").length} bucket${exportReadyItems.filter((item) => item.concurrencyBoundary === "requires_board_closure_snapshot").length === 1 ? " still needs" : "s still need"} a board-closure snapshot for concurrency-safe promotion.`
          : `2 runtime buckets stay runtime-only, and ${exportReadyItems.filter((item) => item.concurrencyBoundary === "independent_export_safe").length} export candidate bucket${exportReadyItems.filter((item) => item.concurrencyBoundary === "independent_export_safe").length === 1 ? " is" : "s are"} safe to promote independently.`,
      payloadShapeSummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets have no export payload shape, ${exportReadyItems.filter((item) => item.exportPayloadShape === "governance_history_record").length} export candidate bucket${exportReadyItems.filter((item) => item.exportPayloadShape === "governance_history_record").length === 1 ? " is" : "s are"} shaped as governance history records, and ${exportReadyItems.filter((item) => item.exportPayloadShape === "package_snapshot_bundle").length} bucket${exportReadyItems.filter((item) => item.exportPayloadShape === "package_snapshot_bundle").length === 1 ? " still exports" : "s still export"} as package snapshot bundles.`
          : `2 runtime buckets have no export payload shape, and ${exportReadyItems.filter((item) => item.exportPayloadShape === "governance_history_record").length} export candidate bucket${exportReadyItems.filter((item) => item.exportPayloadShape === "governance_history_record").length === 1 ? " is" : "s are"} shaped as governance history records.`,
      idempotencySummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets have no idempotency policy, ${exportReadyItems.filter((item) => item.idempotencyPolicy === "deterministic_upsert").length} export candidate bucket${exportReadyItems.filter((item) => item.idempotencyPolicy === "deterministic_upsert").length === 1 ? " uses" : "use"} deterministic upsert, and ${exportReadyItems.filter((item) => item.idempotencyPolicy === "board_closure_snapshot_once").length} bucket${exportReadyItems.filter((item) => item.idempotencyPolicy === "board_closure_snapshot_once").length === 1 ? " still depends" : "s still depend"} on a board-closure snapshot-once policy.`
          : `2 runtime buckets have no idempotency policy, and ${exportReadyItems.filter((item) => item.idempotencyPolicy === "deterministic_upsert").length} export candidate bucket${exportReadyItems.filter((item) => item.idempotencyPolicy === "deterministic_upsert").length === 1 ? " uses" : "use"} deterministic upsert.`,
      replaySafetySummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets stay runtime-only, ${exportReadyItems.filter((item) => item.replaySafety === "replay_safe").length} export candidate bucket${exportReadyItems.filter((item) => item.replaySafety === "replay_safe").length === 1 ? " is" : "s are"} replay-safe, and ${exportReadyItems.filter((item) => item.replaySafety === "requires_fresh_board_closure_snapshot").length} bucket${exportReadyItems.filter((item) => item.replaySafety === "requires_fresh_board_closure_snapshot").length === 1 ? " still requires" : "s still require"} a fresh board-closure snapshot before replay.`
          : `2 runtime buckets stay runtime-only, and ${exportReadyItems.filter((item) => item.replaySafety === "replay_safe").length} export candidate bucket${exportReadyItems.filter((item) => item.replaySafety === "replay_safe").length === 1 ? " is" : "s are"} replay-safe.`,
      conflictPolicySummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets stay outside export conflicts, ${exportReadyItems.filter((item) => item.conflictPolicy === "append_or_upsert").length} export candidate bucket${exportReadyItems.filter((item) => item.conflictPolicy === "append_or_upsert").length === 1 ? " uses" : "use"} append-or-upsert conflict handling, and ${exportReadyItems.filter((item) => item.conflictPolicy === "replace_latest_closure_snapshot").length} bucket${exportReadyItems.filter((item) => item.conflictPolicy === "replace_latest_closure_snapshot").length === 1 ? " still replaces" : "s still replace"} the latest board-closure snapshot when promoted.`
          : `2 runtime buckets stay outside export conflicts, and ${exportReadyItems.filter((item) => item.conflictPolicy === "append_or_upsert").length} export candidate bucket${exportReadyItems.filter((item) => item.conflictPolicy === "append_or_upsert").length === 1 ? " uses" : "use"} append-or-upsert conflict handling.`,
      atomicitySummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets have no export atomicity, ${exportReadyItems.filter((item) => item.exportAtomicity === "record_level_atomic").length} export candidate bucket${exportReadyItems.filter((item) => item.exportAtomicity === "record_level_atomic").length === 1 ? " commits" : "commit"} as record-level atomic exports, and ${exportReadyItems.filter((item) => item.exportAtomicity === "closure_bundle_atomic").length} bucket${exportReadyItems.filter((item) => item.exportAtomicity === "closure_bundle_atomic").length === 1 ? " still depends" : "s still depend"} on closure-bundle atomic export once board closure completes.`
          : `2 runtime buckets have no export atomicity, and ${exportReadyItems.filter((item) => item.exportAtomicity === "record_level_atomic").length} export candidate bucket${exportReadyItems.filter((item) => item.exportAtomicity === "record_level_atomic").length === 1 ? " commits" : "commit"} as record-level atomic exports.`,
      derivationSummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets have no export derivation basis, ${exportReadyItems.filter((item) => item.exportDerivationBasis === "decision_history_derived").length} export candidate bucket${exportReadyItems.filter((item) => item.exportDerivationBasis === "decision_history_derived").length === 1 ? " is" : "s are"} derived from decision history, and ${exportReadyItems.filter((item) => item.exportDerivationBasis === "board_closure_snapshot_derived").length} bucket${exportReadyItems.filter((item) => item.exportDerivationBasis === "board_closure_snapshot_derived").length === 1 ? " is" : "s are"} derived from the board-closure snapshot.`
          : `2 runtime buckets have no export derivation basis, and ${exportReadyItems.filter((item) => item.exportDerivationBasis === "decision_history_derived").length} export candidate bucket${exportReadyItems.filter((item) => item.exportDerivationBasis === "decision_history_derived").length === 1 ? " is" : "s are"} derived from decision history.`,
      revisionSummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets have no export revision policy, ${exportReadyItems.filter((item) => item.exportRevisionPolicy === "append_new_revision").length} export candidate bucket${exportReadyItems.filter((item) => item.exportRevisionPolicy === "append_new_revision").length === 1 ? " appends" : "append"} as new revisions, and ${exportReadyItems.filter((item) => item.exportRevisionPolicy === "replace_closure_bundle_revision").length} bucket${exportReadyItems.filter((item) => item.exportRevisionPolicy === "replace_closure_bundle_revision").length === 1 ? " still replaces" : "s still replace"} the current closure-bundle revision.`
          : `2 runtime buckets have no export revision policy, and ${exportReadyItems.filter((item) => item.exportRevisionPolicy === "append_new_revision").length} export candidate bucket${exportReadyItems.filter((item) => item.exportRevisionPolicy === "append_new_revision").length === 1 ? " appends" : "append"} as new revisions.`,
      freshnessSummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets have no export freshness source, ${exportReadyItems.filter((item) => item.exportFreshnessSource === "latest_record_state").length} export candidate bucket${exportReadyItems.filter((item) => item.exportFreshnessSource === "latest_record_state").length === 1 ? " uses" : "use"} the latest record state, and ${exportReadyItems.filter((item) => item.exportFreshnessSource === "latest_board_closure_snapshot").length} bucket${exportReadyItems.filter((item) => item.exportFreshnessSource === "latest_board_closure_snapshot").length === 1 ? " still depends" : "s still depend"} on the latest board-closure snapshot.`
          : `2 runtime buckets have no export freshness source, and ${exportReadyItems.filter((item) => item.exportFreshnessSource === "latest_record_state").length} export candidate bucket${exportReadyItems.filter((item) => item.exportFreshnessSource === "latest_record_state").length === 1 ? " uses" : "use"} the latest record state.`,
      validationSummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets have no export validation boundary, ${exportReadyItems.filter((item) => item.exportValidationBoundary === "record_level_validation").length} export candidate bucket${exportReadyItems.filter((item) => item.exportValidationBoundary === "record_level_validation").length === 1 ? " validates" : "validate"} at record level, and ${exportReadyItems.filter((item) => item.exportValidationBoundary === "closure_bundle_validation").length} bucket${exportReadyItems.filter((item) => item.exportValidationBoundary === "closure_bundle_validation").length === 1 ? " still validates" : "s still validate"} at closure-bundle level.`
          : `2 runtime buckets have no export validation boundary, and ${exportReadyItems.filter((item) => item.exportValidationBoundary === "record_level_validation").length} export candidate bucket${exportReadyItems.filter((item) => item.exportValidationBoundary === "record_level_validation").length === 1 ? " validates" : "validate"} at record level.`,
      completenessSummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets have no export completeness rule, ${exportReadyItems.filter((item) => item.exportCompletenessRule === "self_contained_record").length} export candidate bucket${exportReadyItems.filter((item) => item.exportCompletenessRule === "self_contained_record").length === 1 ? " is" : "s are"} self-contained records, and ${exportReadyItems.filter((item) => item.exportCompletenessRule === "board_closure_complete_bundle").length} bucket${exportReadyItems.filter((item) => item.exportCompletenessRule === "board_closure_complete_bundle").length === 1 ? " still completes" : "s still complete"} as board-closure bundles.`
          : `2 runtime buckets have no export completeness rule, and ${exportReadyItems.filter((item) => item.exportCompletenessRule === "self_contained_record").length} export candidate bucket${exportReadyItems.filter((item) => item.exportCompletenessRule === "self_contained_record").length === 1 ? " is" : "s are"} self-contained records.`,
      noExportSensitivityCount: 2,
      tenantBusinessContextCount: exportReadyItems.filter((item) => item.exportSensitivity === "tenant_business_context").length,
      tenantDeliverableContextCount: exportReadyItems.filter((item) => item.exportSensitivity === "tenant_deliverable_context").length,
      runtimeOnlyAudienceCount: 2,
      governanceHistoryAudienceCount: exportReadyItems.filter((item) => item.exportAudienceBoundary === "tenant_governance_history_readers").length,
      packageConsumerAudienceCount: exportReadyItems.filter((item) => item.exportAudienceBoundary === "tenant_package_consumers").length,
      noExportSanitizationCount: 2,
      exportAsRecordedCount: exportReadyItems.filter((item) => item.exportSanitizationPolicy === "export_as_recorded").length,
      sanitizeBeforePackageExportCount: exportReadyItems.filter((item) => item.exportSanitizationPolicy === "sanitize_before_package_export").length,
      runtimeInternalOnlyRedactionCount: 2,
      governanceSafeRedactionCount: exportReadyItems.filter((item) => item.exportRedactionBoundary === "governance_safe_redaction").length,
      packageSafeRedactionCount: exportReadyItems.filter((item) => item.exportRedactionBoundary === "package_safe_redaction").length,
      runtimeOnlySourceDisclosureCount: 2,
      decisionSummaryOnlyCount: exportReadyItems.filter((item) => item.exportSourceDisclosurePolicy === "decision_summary_only").length,
      closureSnapshotSummaryOnlyCount: exportReadyItems.filter((item) => item.exportSourceDisclosurePolicy === "closure_snapshot_summary_only").length,
      noMemoryPlacementCount: 2,
      governanceHistoryNoteCount: exportReadyItems.filter((item) => item.memoryPlacement === "governance_history_note").length,
      packageRecordFolderCount: exportReadyItems.filter((item) => item.memoryPlacement === "package_record_folder").length,
      noSyncStrategyCount: 2,
      appendHistoryEntryCount: exportReadyItems.filter((item) => item.syncStrategy === "append_history_entry").length,
      replacePackageSnapshotAfterClosureCount: exportReadyItems.filter((item) => item.syncStrategy === "replace_package_snapshot_after_board_closure").length,
      noExportRequestShapeCount: 2,
      singleRecordExportRequestCount: exportReadyItems.filter((item) => item.exportRequestShape === "single_record_export_request").length,
      packageBundleExportRequestCount: exportReadyItems.filter((item) => item.exportRequestShape === "package_bundle_export_request").length,
      noExportConfirmationRequirementCount: 2,
      tenantExportConfirmationCount: exportReadyItems.filter((item) => item.exportConfirmationRequirement === "tenant_export_confirmation").length,
      boardClosureThenTenantExportConfirmationCount:
        exportReadyItems.filter((item) => item.exportConfirmationRequirement === "board_closure_then_tenant_export_confirmation").length,
      runtimeOnlyRecoveryPathCount: 2,
      retryLatestRecordExportCount: exportReadyItems.filter((item) => item.exportRecoveryPath === "retry_latest_record_export").length,
      rerunAfterBoardClosureSnapshotCount:
        exportReadyItems.filter((item) => item.exportRecoveryPath === "rerun_after_board_closure_snapshot").length,
      sensitivitySummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets have no export sensitivity, ${exportReadyItems.filter((item) => item.exportSensitivity === "tenant_business_context").length} export candidate bucket${exportReadyItems.filter((item) => item.exportSensitivity === "tenant_business_context").length === 1 ? " carries" : "s carry"} tenant business context, and ${exportReadyItems.filter((item) => item.exportSensitivity === "tenant_deliverable_context").length} bucket${exportReadyItems.filter((item) => item.exportSensitivity === "tenant_deliverable_context").length === 1 ? " still carries" : "s still carry"} tenant deliverable context.`
          : `2 runtime buckets have no export sensitivity, and ${exportReadyItems.filter((item) => item.exportSensitivity === "tenant_business_context").length} export candidate bucket${exportReadyItems.filter((item) => item.exportSensitivity === "tenant_business_context").length === 1 ? " carries" : "s carry"} tenant business context.`,
      audienceSummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets stay Wealth Factory runtime only, ${exportReadyItems.filter((item) => item.exportAudienceBoundary === "tenant_governance_history_readers").length} export candidate bucket${exportReadyItems.filter((item) => item.exportAudienceBoundary === "tenant_governance_history_readers").length === 1 ? " is aimed" : "s are aimed"} at tenant governance-history readers, and ${exportReadyItems.filter((item) => item.exportAudienceBoundary === "tenant_package_consumers").length} bucket${exportReadyItems.filter((item) => item.exportAudienceBoundary === "tenant_package_consumers").length === 1 ? " still targets" : "s still target"} tenant package consumers.`
          : `2 runtime buckets stay Wealth Factory runtime only, and ${exportReadyItems.filter((item) => item.exportAudienceBoundary === "tenant_governance_history_readers").length} export candidate bucket${exportReadyItems.filter((item) => item.exportAudienceBoundary === "tenant_governance_history_readers").length === 1 ? " is aimed" : "s are aimed"} at tenant governance-history readers.`,
      sanitizationSummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets have no export sanitization, ${exportReadyItems.filter((item) => item.exportSanitizationPolicy === "export_as_recorded").length} export candidate bucket${exportReadyItems.filter((item) => item.exportSanitizationPolicy === "export_as_recorded").length === 1 ? " is exported" : "s are exported"} as recorded, and ${exportReadyItems.filter((item) => item.exportSanitizationPolicy === "sanitize_before_package_export").length} bucket${exportReadyItems.filter((item) => item.exportSanitizationPolicy === "sanitize_before_package_export").length === 1 ? " still requires" : "s still require"} sanitization before package export.`
          : `2 runtime buckets have no export sanitization, and ${exportReadyItems.filter((item) => item.exportSanitizationPolicy === "export_as_recorded").length} export candidate bucket${exportReadyItems.filter((item) => item.exportSanitizationPolicy === "export_as_recorded").length === 1 ? " is exported" : "s are exported"} as recorded.`,
      redactionSummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets stay runtime internal only, ${exportReadyItems.filter((item) => item.exportRedactionBoundary === "governance_safe_redaction").length} export candidate bucket${exportReadyItems.filter((item) => item.exportRedactionBoundary === "governance_safe_redaction").length === 1 ? " uses" : "s use"} governance-safe redaction, and ${exportReadyItems.filter((item) => item.exportRedactionBoundary === "package_safe_redaction").length} bucket${exportReadyItems.filter((item) => item.exportRedactionBoundary === "package_safe_redaction").length === 1 ? " still requires" : "s still require"} package-safe redaction.`
          : `2 runtime buckets stay runtime internal only, and ${exportReadyItems.filter((item) => item.exportRedactionBoundary === "governance_safe_redaction").length} export candidate bucket${exportReadyItems.filter((item) => item.exportRedactionBoundary === "governance_safe_redaction").length === 1 ? " uses" : "s use"} governance-safe redaction.`,
      sourceDisclosureSummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets are runtime only, ${exportReadyItems.filter((item) => item.exportSourceDisclosurePolicy === "decision_summary_only").length} export candidate bucket${exportReadyItems.filter((item) => item.exportSourceDisclosurePolicy === "decision_summary_only").length === 1 ? " discloses" : "s disclose"} decision summaries only, and ${exportReadyItems.filter((item) => item.exportSourceDisclosurePolicy === "closure_snapshot_summary_only").length} bucket${exportReadyItems.filter((item) => item.exportSourceDisclosurePolicy === "closure_snapshot_summary_only").length === 1 ? " still discloses" : "s still disclose"} closure-snapshot summaries only.`
          : `2 runtime buckets are runtime only, and ${exportReadyItems.filter((item) => item.exportSourceDisclosurePolicy === "decision_summary_only").length} export candidate bucket${exportReadyItems.filter((item) => item.exportSourceDisclosurePolicy === "decision_summary_only").length === 1 ? " discloses" : "s disclose"} decision summaries only.`,
      placementSummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets have no tenant memory placement, ${exportReadyItems.filter((item) => item.memoryPlacement === "governance_history_note").length} export candidate bucket${exportReadyItems.filter((item) => item.memoryPlacement === "governance_history_note").length === 1 ? " lands" : "s land"} as governance history notes, and ${exportReadyItems.filter((item) => item.memoryPlacement === "package_record_folder").length} bucket${exportReadyItems.filter((item) => item.memoryPlacement === "package_record_folder").length === 1 ? " still lands" : "s still land"} in package record folders.`
          : `2 runtime buckets have no tenant memory placement, and ${exportReadyItems.filter((item) => item.memoryPlacement === "governance_history_note").length} export candidate bucket${exportReadyItems.filter((item) => item.memoryPlacement === "governance_history_note").length === 1 ? " lands" : "s land"} as governance history notes.`,
      syncStrategySummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets have no tenant sync strategy, ${exportReadyItems.filter((item) => item.syncStrategy === "append_history_entry").length} export candidate bucket${exportReadyItems.filter((item) => item.syncStrategy === "append_history_entry").length === 1 ? " appends" : "s append"} history entries, and ${exportReadyItems.filter((item) => item.syncStrategy === "replace_package_snapshot_after_board_closure").length} bucket${exportReadyItems.filter((item) => item.syncStrategy === "replace_package_snapshot_after_board_closure").length === 1 ? " still replaces" : "s still replace"} package snapshots after board closure.`
          : `2 runtime buckets have no tenant sync strategy, and ${exportReadyItems.filter((item) => item.syncStrategy === "append_history_entry").length} export candidate bucket${exportReadyItems.filter((item) => item.syncStrategy === "append_history_entry").length === 1 ? " appends" : "s append"} history entries.`,
      requestShapeSummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets have no export request shape, ${exportReadyItems.filter((item) => item.exportRequestShape === "single_record_export_request").length} export candidate bucket${exportReadyItems.filter((item) => item.exportRequestShape === "single_record_export_request").length === 1 ? " uses" : "s use"} single-record export requests, and ${exportReadyItems.filter((item) => item.exportRequestShape === "package_bundle_export_request").length} bucket${exportReadyItems.filter((item) => item.exportRequestShape === "package_bundle_export_request").length === 1 ? " still uses" : "s still use"} package-bundle export requests.`
          : `2 runtime buckets have no export request shape, and ${exportReadyItems.filter((item) => item.exportRequestShape === "single_record_export_request").length} export candidate bucket${exportReadyItems.filter((item) => item.exportRequestShape === "single_record_export_request").length === 1 ? " uses" : "s use"} single-record export requests.`,
      confirmationSummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets have no export confirmation, ${exportReadyItems.filter((item) => item.exportConfirmationRequirement === "tenant_export_confirmation").length} export candidate bucket${exportReadyItems.filter((item) => item.exportConfirmationRequirement === "tenant_export_confirmation").length === 1 ? " requires" : "s require"} tenant export confirmation, and ${exportReadyItems.filter((item) => item.exportConfirmationRequirement === "board_closure_then_tenant_export_confirmation").length} bucket${exportReadyItems.filter((item) => item.exportConfirmationRequirement === "board_closure_then_tenant_export_confirmation").length === 1 ? " still requires" : "s still require"} board closure before tenant export confirmation.`
          : `2 runtime buckets have no export confirmation, and ${exportReadyItems.filter((item) => item.exportConfirmationRequirement === "tenant_export_confirmation").length} export candidate bucket${exportReadyItems.filter((item) => item.exportConfirmationRequirement === "tenant_export_confirmation").length === 1 ? " requires" : "s require"} tenant export confirmation.`,
      recoveryPathSummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets are runtime only, ${exportReadyItems.filter((item) => item.exportRecoveryPath === "retry_latest_record_export").length} export candidate bucket${exportReadyItems.filter((item) => item.exportRecoveryPath === "retry_latest_record_export").length === 1 ? " retries" : "s retry"} the latest record export, and ${exportReadyItems.filter((item) => item.exportRecoveryPath === "rerun_after_board_closure_snapshot").length} bucket${exportReadyItems.filter((item) => item.exportRecoveryPath === "rerun_after_board_closure_snapshot").length === 1 ? " still reruns" : "s still rerun"} after the board-closure snapshot.`
          : `2 runtime buckets are runtime only, and ${exportReadyItems.filter((item) => item.exportRecoveryPath === "retry_latest_record_export").length} export candidate bucket${exportReadyItems.filter((item) => item.exportRecoveryPath === "retry_latest_record_export").length === 1 ? " retries" : "s retry"} the latest record export.`,
      stateSummary:
        waitingOnBoardClosureCount > 0
          ? `2 runtime buckets stay runtime-only, ${exportReadyItems.filter((item) => item.promotionState === "ready_for_tenant_export").length} export candidate bucket${exportReadyItems.filter((item) => item.promotionState === "ready_for_tenant_export").length === 1 ? " is" : "s are"} ready for tenant export later, and ${exportReadyItems.filter((item) => item.promotionState === "awaiting_board_closure").length} bucket${exportReadyItems.filter((item) => item.promotionState === "awaiting_board_closure").length === 1 ? " is" : "s are"} still awaiting board closure.`
          : `2 runtime buckets stay runtime-only, and ${exportReadyItems.filter((item) => item.promotionState === "ready_for_tenant_export").length} export candidate bucket${exportReadyItems.filter((item) => item.promotionState === "ready_for_tenant_export").length === 1 ? " is" : "s are"} ready for tenant export later.`,
      partitions: {
        runtime: {
          itemCount: 2,
          summary: "2 runtime memory buckets stay live only inside Wealth Factory orchestration."
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
      operationalItems: [
        {
          id: "lane_continuity",
          label: "Lane continuity",
          count: board.cards.filter((card) =>
            card.detailSections.some((section) => section.id === "continuity-memory")
          ).length,
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
          promotionActionDescription: "No export action applies. This runtime memory stays inside Wealth Factory orchestration."
        },
        {
          id: "attention_state",
          label: "Attention state",
          count: board.pendingAttention ? 1 : 0,
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
          promotionActionDescription: "No export action applies. This runtime attention state stays inside Wealth Factory orchestration."
        }
      ],
      exportReadyItems
    }, board)
  };
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function parseHarnessFallbackVariant(search: string | undefined): HarnessBoardFallbackVariant {
  if (typeof search !== "string" || search.length === 0) {
    return "review-attention";
  }

  const params = new URLSearchParams(search);
  const requestedVariant = params.get("harnessPreview");
  if (requestedVariant === "resolve-attention") {
    return "resolve-attention";
  }
  if (requestedVariant === "pending-approvals") {
    return "pending-approvals";
  }
  return "review-attention";
}

function isHarnessBoardErrorCode(value: unknown): value is HarnessBoardClientErrorCode {
  return [
    "conflict",
    "invalid_request",
    "not_found",
    "rate_limited",
    "request_rejected",
    "service_unavailable",
    "stale_contract",
    "unauthorized",
    "unknown"
  ].includes(String(value));
}

async function readHarnessError(response: Response, fallbackMessage: string) {
  let parsedCode: HarnessBoardClientErrorCode = "unknown";

  try {
    const errorBody = (await response.json()) as { code?: unknown };
    if (isHarnessBoardErrorCode(errorBody?.code)) {
      parsedCode = errorBody.code;
    }
  } catch {
    parsedCode = "unknown";
  }

  const retryAfterValue = response.headers.get("retry-after");
  const retryAfterSeconds =
    typeof retryAfterValue === "string" && retryAfterValue.trim().length > 0
      ? Number.parseInt(retryAfterValue, 10)
      : Number.NaN;

  throw new HarnessBoardClientError({
    code: parsedCode,
    message: fallbackMessage,
    status: response.status,
    retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null
  });
}

export function createHarnessBoardClient(
  fetchImpl: typeof fetch = fetch,
  browserWindow: Pick<Window, "location"> | undefined = typeof window === "undefined" ? undefined : window,
  options: { requestTimeoutMs?: number } = {}
) {
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_HARNESS_BOARD_REQUEST_TIMEOUT_MS;
  const fallbackVariant = parseHarnessFallbackVariant(browserWindow?.location.search);
  const fallbackState: HarnessBoardFallbackState = {
    board: fallbackBoardResponses[fallbackVariant],
    controlMode: "preview",
    variant: fallbackVariant,
    variantLabel: fallbackVariantLabels[fallbackVariant]
  };

  async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      return await fetchImpl(input, {
        ...init,
        signal: controller.signal
      });
    } catch (error) {
      if (
        typeof error === "object"
        && error !== null
        && "name" in error
        && error.name === "AbortError"
      ) {
        throw new HarnessBoardClientError({
          code: "timed_out",
          message: "Harness board request timed out",
          status: 408
        });
      }

      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  async function submitAction(
    actionPath: string,
    body: Record<string, unknown>,
    actionMethod: "POST" = "POST"
  ): Promise<HarnessBoardActionResult> {
    const response = await fetchWithTimeout(actionPath, {
      method: actionMethod,
      credentials: "include",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      await readHarnessError(response, "Unable to update harness board");
    }

    return (await response.json()) as HarnessBoardActionResult;
  }

  function isBrowserFallbackEnabled(): boolean {
    return Boolean(browserWindow && isLoopbackHost(browserWindow.location.hostname));
  }

  return {
    isBrowserFallbackEnabled,

    getFallback(): HarnessBoardResponse {
      return fallbackState.board;
    },

    getFallbackState(): HarnessBoardFallbackState {
      return fallbackState;
    },

    async fetchBoard(workflowId?: string): Promise<HarnessBoardResponse> {
      const selectedWorkflowId = workflowId ?? readSelectedWorkflowId(browserWindow);
      const requestPath = selectedWorkflowId
        ? `/api/harness/board?workflowId=${encodeURIComponent(selectedWorkflowId)}`
        : "/api/harness/board";
      const response = await fetchWithTimeout(requestPath, {
        credentials: "include"
      });
      if (!response.ok) {
        await readHarnessError(response, "Unable to load harness board");
      }

      return normalizeBoardResponse(
        await response.json() as HarnessBoardResponse | LegacyHarnessBoardResponse
      );
    },

    submitAction
  };
}

function readSelectedWorkflowId(browserWindow?: Pick<Window, "location">): string | undefined {
  const search = browserWindow?.location?.search;
  if (typeof search !== "string" || search.trim().length === 0) {
    return undefined;
  }
  const params = new URLSearchParams(search);
  const workflowId = params.get("workflowId");
  return workflowId && workflowId.trim().length > 0 ? workflowId.trim() : undefined;
}

