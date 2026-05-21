import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  HarnessBoard,
  type HarnessBoardCard,
  type HarnessBoardColumn
} from "../apps/web/src/components/HarnessBoard.js";
import { HarnessCardDrawer } from "../apps/web/src/components/HarnessCardDrawer.js";
import { HarnessBoardPage } from "../apps/web/src/pages/HarnessBoardPage.js";

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
    expect(markup).not.toContain("raw execution log");
    expect(markup).not.toContain("harness-browser-fallback");
  });
});
