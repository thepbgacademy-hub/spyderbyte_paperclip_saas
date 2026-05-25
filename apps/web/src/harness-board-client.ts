import type { HarnessBoardResponse } from "../../../src/harness/board-service.js";
export type { HarnessBoardResponse } from "../../../src/harness/board-service.js";

const defaultBoardResponse: HarnessBoardResponse = {
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
      deliverableLabel: "Pricing Review"
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
  ]
};

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function createHarnessBoardClient(
  fetchImpl: typeof fetch = fetch,
  browserWindow: Pick<Window, "location"> | undefined = typeof window === "undefined" ? undefined : window
) {
  function isBrowserFallbackEnabled(): boolean {
    return Boolean(browserWindow && isLoopbackHost(browserWindow.location.hostname));
  }

  return {
    isBrowserFallbackEnabled,

    getFallback(): HarnessBoardResponse {
      return defaultBoardResponse;
    },

    async fetchBoard(): Promise<HarnessBoardResponse> {
      const response = await fetchImpl("/api/harness/board", {
        credentials: "include"
      });
      if (!response.ok) {
        throw new Error("Unable to load harness board");
      }

      return (await response.json()) as HarnessBoardResponse;
    }
  };
}
