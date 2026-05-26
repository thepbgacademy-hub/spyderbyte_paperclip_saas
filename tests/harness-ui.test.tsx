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
  getContractActionState,
  HarnessBoardPage
} from "../apps/web/src/pages/HarnessBoardPage.js";
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
      deliverableLabel: "Margin review"
    }
  ],
  completionPackage: {
    status: "assembling",
    summary: "The current package is nearly ready with one bounded governance item still shaping the handoff.",
    deferredApprovalCount: 1,
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

  it("renders a simple drawer with only high-level details", () => {
    const markup = renderToStaticMarkup(
      <HarnessCardDrawer card={cards[0]!} open onClose={() => undefined} />
    );

    expect(markup).toContain("Card details");
    expect(markup).toContain("High-level planning notes stay visible");
    expect(markup).not.toContain("skill");
    expect(markup).not.toContain("trace");
  });

  it("renders the Hermes-style board page with persona overview metrics", () => {
    const markup = renderToStaticMarkup(<HarnessBoardPage />);

    expect(markup).toContain("Harness board");
    expect(markup).toContain("Persona workload");
    expect(markup).toContain("CEO approvals");
    expect(markup).toContain("Control mode");
    expect(markup).toContain("Preview");
    expect(markup).not.toContain("raw execution log");
    expect(markup).not.toContain("harness-browser-fallback");
  });

  it("renders bounded attention and approval action guidance from the board contract", () => {
    const markup = renderToStaticMarkup(<HarnessBoardPage initialBoard={boardResponse} />);

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
    expect(markup).toContain("Live request fields for Start fresh cycle");
    expect(markup).toContain("Live request fields for Approve proposal");
    expect(markup).toContain("Live request fields for Defer proposal");
    expect(markup).toContain("Live request fields for Deny proposal");
    expect(markup).toContain("Live payload preview");
    expect(markup).toContain("Live payload is ready.");
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
    expect(markup).toContain("Package - Assembling");
    expect(markup).toContain("1 deliverable, 1 governance item, 2 recommendations, 1 objection.");
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
    expect(markup).toContain("Completion package");
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
});
