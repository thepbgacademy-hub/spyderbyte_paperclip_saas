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
    readyNowCount: 2,
    waitingOnBoardClosureCount: 2,
    governanceReadyCount: 2,
    packagedReadyCount: 0,
    packagedWaitingCount: 2,
    blockedCandidateCount: 2,
    tenantControlledCandidateCount: 2,
    boardControlledCandidateCount: 2,
    roleSummary: "2 governance record candidates are ready now, and 2 packaged output candidates still wait on board closure.",
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
        promotionAuthorityLabel: "Wealth Factory runtime only"
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
        promotionAuthorityLabel: "Wealth Factory runtime only"
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
        promotionAuthorityLabel: "Tenant explicit export"
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
        promotionAuthorityLabel: "Tenant explicit export"
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
        nextEligibleSummary:
          "Board closure is still required before this packaged deliverable becomes a durable tenant record candidate."
      }
    ]
  },
  completionPackage: {
    status: "assembling",
    summary: "The current board package is almost ready, with one bounded governance question still shaping the handoff.",
    deferredApprovalCount: 1,
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

const fallbackBoardResponses: Record<HarnessBoardFallbackVariant, HarnessBoardResponse> = {
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
        item.promotionAuthorityLabel ?? humanizeMemoryBoundaryPromotionAuthority(promotionAuthority)
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

  return {
    ...memoryBoundary,
    exportSummary:
      memoryBoundary.exportSummary
      ?? (waitingOnBoardClosureCount > 0
        ? `${readyNowCount} export candidate${readyNowCount === 1 ? "" : "s"} ${readyNowCount === 1 ? "is" : "are"} ready now, and ${waitingOnBoardClosureCount} ${waitingOnBoardClosureCount === 1 ? "still waits" : "still wait"} for board closure.`
        : `${readyNowCount} export candidate${readyNowCount === 1 ? "" : "s"} ${readyNowCount === 1 ? "is" : "are"} ready now. No export candidates are waiting on board closure.`),
    readyNowCount,
    waitingOnBoardClosureCount,
    governanceReadyCount,
    packagedReadyCount,
    packagedWaitingCount,
    blockedCandidateCount,
    tenantControlledCandidateCount,
    boardControlledCandidateCount,
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
    exportReadyItems
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
      promotionAuthorityLabel: "Tenant explicit export"
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
      promotionAuthorityLabel: "Tenant explicit export"
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
    memoryBoundary: {
      summary:
        "Wealth Factory runtime keeps bounded operational lane memory live while governance and package records stay ready for later tenant-owned export.",
      exportSummary:
        waitingOnBoardClosureCount > 0
          ? `${readyNowCount} export candidate${readyNowCount === 1 ? "" : "s"} ${readyNowCount === 1 ? "is" : "are"} ready now, and ${waitingOnBoardClosureCount} ${waitingOnBoardClosureCount === 1 ? "still waits" : "still wait"} for board closure.`
          : `${readyNowCount} export candidate${readyNowCount === 1 ? "" : "s"} ${readyNowCount === 1 ? "is" : "are"} ready now. No export candidates are waiting on board closure.`,
      readyNowCount,
      waitingOnBoardClosureCount,
      governanceReadyCount,
      packagedReadyCount,
      packagedWaitingCount,
      blockedCandidateCount: waitingOnBoardClosureCount,
      tenantControlledCandidateCount: exportReadyItems.filter((item) => item.promotionAuthority === "tenant_explicit_export").length,
      boardControlledCandidateCount: exportReadyItems.filter((item) => item.promotionAuthority === "board_closure_then_tenant_export").length,
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
          promotionAuthorityLabel: "Wealth Factory runtime only"
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
          promotionAuthorityLabel: "Wealth Factory runtime only"
        }
      ],
      exportReadyItems
    }
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

    async fetchBoard(): Promise<HarnessBoardResponse> {
      const response = await fetchWithTimeout("/api/harness/board", {
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

