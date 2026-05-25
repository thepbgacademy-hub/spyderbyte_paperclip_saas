import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  HarnessBoard,
  type HarnessBoardCard,
  type HarnessBoardColumn
} from "../apps/web/src/components/HarnessBoard.js";
import { HarnessCardDrawer } from "../apps/web/src/components/HarnessCardDrawer.js";
import { HarnessBoardPage } from "../apps/web/src/pages/HarnessBoardPage.js";
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
      requestFields: [],
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
      allowedDecisions: ["approve", "defer", "deny"]
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
    requestFields: [],
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
    reasonLabel: "Final assembly"
  },
  recentDecisions: [],
  followThroughItems: []
};

describe("harness board UI", () => {
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
    expect(markup).not.toContain("raw execution log");
    expect(markup).not.toContain("harness-browser-fallback");
  });

  it("renders bounded attention and approval action guidance from the board contract", () => {
    const markup = renderToStaticMarkup(<HarnessBoardPage initialBoard={boardResponse} />);

    expect(markup).toContain("Review final assembly");
    expect(markup).toContain("Complete run");
    expect(markup).toContain("Start a new board cycle from this run?");
    expect(markup).toContain("Review proposal decision");
    expect(markup).toContain("Approve proposal");
    expect(markup).toContain("Deny this proposal and close the follow-on request?");
    expect(markup).toContain("Recommended next action");
    expect(markup).not.toContain("raw execution log");
    expect(markup).not.toContain("tool");
  });
});
