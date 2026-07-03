import type { HarnessCardEventRecord, HarnessCardRecord, HarnessCardState, HarnessRunRecord } from "./types.js";
import type { HarnessSubCardProposal } from "./runtime-contract.js";

export type HarnessPostOutcomeAction =
  | {
      kind: "dispatch_next_lane";
      runState: HarnessRunRecord["state"];
      cardId: string;
      persona: string;
    }
  | {
      kind: "queue_ceo_review";
      runState: HarnessRunRecord["state"];
      reason: "final_assembly" | "governance_backlog" | "governance_hold" | "next_lane_decision" | "cycle_closed";
      completedCardId?: string;
      nextCardId?: string;
    }
  | {
      kind: "await_lane_resume";
      runState: "waiting";
      cardId: string;
    }
  | {
      kind: "await_unblock";
      runState: "blocked";
      cardId: string;
    };

export type HarnessAttentionState = {
  action: Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>;
  requestedAt: string;
  requestEventId?: string;
  snapshot: HarnessAttentionSnapshot;
};

export type HarnessAttentionSnapshot = {
  statusLabel: string;
  summary: string;
  reasonLabel?: string;
  targetCardId?: string;
  targetPersona?: string;
  targetTitle?: string;
};

export function determineHarnessPostOutcomeAction(input: {
  runState: HarnessRunRecord["state"];
  fallbackCardId?: string;
  nextDispatchCard?: {
    cardId: string;
    persona: string;
  } | null;
  cards: readonly HarnessCardRecord[];
  proposals: readonly Pick<HarnessSubCardProposal, "status">[];
}): HarnessPostOutcomeAction | null {
  const readyForNextLaneReview =
    input.runState === "active"
      ? deriveNextLaneReviewTarget(input.cards, input.fallbackCardId)
      : null;
  if (readyForNextLaneReview) {
    return {
      kind: "queue_ceo_review",
      runState: input.runState,
      reason: "next_lane_decision",
      completedCardId: readyForNextLaneReview.completedCardId,
      nextCardId: readyForNextLaneReview.nextCardId
    };
  }

  const dispatchedLane = input.nextDispatchCard;
  if (dispatchedLane) {
    return {
      kind: "dispatch_next_lane",
      runState: input.runState,
      cardId: dispatchedLane.cardId,
      persona: dispatchedLane.persona
    };
  }

  const hasOpenGovernance = input.proposals.some(
    (proposal) => proposal.status === "proposed" || proposal.status === "deferred"
  );
  if (input.runState === "assembling") {
    return {
      kind: "queue_ceo_review",
      runState: input.runState,
      reason: hasOpenGovernance ? "governance_hold" : "final_assembly"
    };
  }

  if (input.runState === "done") {
    return {
      kind: "queue_ceo_review",
      runState: input.runState,
      reason: "cycle_closed"
    };
  }

  if (input.runState === "waiting") {
    const waitingLane = selectObservedLaneForState(input.cards, "waiting", input.fallbackCardId);
    if (!waitingLane) {
      return null;
    }
    return {
      kind: "await_lane_resume",
      runState: "waiting",
      cardId: waitingLane.id
    };
  }

  if (input.runState === "blocked") {
    if (hasOpenGovernance) {
      return {
        kind: "queue_ceo_review",
        runState: input.runState,
        reason: "governance_hold"
      };
    }
    const blockedLane = selectObservedLaneForState(input.cards, "blocked", input.fallbackCardId);
    if (!blockedLane) {
      return null;
    }
    return {
      kind: "await_unblock",
      runState: "blocked",
      cardId: blockedLane.id
    };
  }

  if (input.runState === "active" && hasOpenGovernance) {
    const hasActiveChildLane = input.cards.some(
      (card) => card.persona !== "ceo" && (card.state === "working" || card.state === "approved")
    );
    if (!hasActiveChildLane) {
      return {
        kind: "queue_ceo_review",
        runState: input.runState,
        reason: "governance_backlog"
      };
    }
  }

  return null;
}

export function describeHarnessPostOutcomeActionKind(
  action: Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>
): {
  statusLabel: string;
  reasonLabel?: string;
  summary: string;
} {
  switch (action.kind) {
    case "queue_ceo_review":
      return {
        statusLabel: "CEO review required",
        ...(action.reason ? { reasonLabel: humanizePostOutcomeReason(action.reason) } : {}),
        summary: describeCeoReviewSummary(action.reason)
      };
    case "await_lane_resume":
      return {
        statusLabel: "Waiting on lane resume",
        summary: "A child lane is paused and needs a bounded resume decision before work can continue."
      };
    case "await_unblock":
      return {
        statusLabel: "Waiting on unblock",
        summary: "A child lane is blocked and needs an unblock decision before work can continue."
      };
  }
}

export function humanizePostOutcomeReason(
  reason: Extract<HarnessPostOutcomeAction, { kind: "queue_ceo_review" }>["reason"]
): string {
  switch (reason) {
    case "final_assembly":
      return "Final assembly";
    case "governance_backlog":
      return "Governance backlog";
    case "governance_hold":
      return "Governance hold";
    case "next_lane_decision":
      return "Next lane decision";
    case "cycle_closed":
      return "Cycle closed";
    default:
      return reason;
  }
}

export function parseHarnessAttentionSnapshot(
  payload: Record<string, unknown>
): HarnessAttentionSnapshot | null {
  const statusLabel = readOptionalString(payload.statusLabel);
  const summary = readOptionalString(payload.summary);
  if (!statusLabel || !summary) {
    return null;
  }

  const reasonLabel = readOptionalString(payload.reasonLabel);
  const targetCardId = readOptionalString(payload.targetCardId);
  const targetPersona = readOptionalString(payload.targetPersona);
  const targetTitle = readOptionalString(payload.targetTitle);

  return {
    statusLabel,
    summary,
    ...(reasonLabel ? { reasonLabel } : {}),
    ...(targetCardId ? { targetCardId } : {}),
    ...(targetPersona ? { targetPersona } : {}),
    ...(targetTitle ? { targetTitle } : {})
  };
}

export function deriveCurrentHarnessAttentionState(
  events: readonly HarnessCardEventRecord[]
): HarnessAttentionState | null {
  let current: HarnessAttentionState | null = null;

  for (const event of events) {
    if (event.eventKind === "attention_requested") {
      const action = parseAttentionActionPayload(event.payload);
      if (action) {
        current = {
          action,
          requestedAt: event.createdAt,
          requestEventId: event.id,
          snapshot: parseHarnessAttentionSnapshot(event.payload) ?? buildFallbackAttentionSnapshot(action)
        };
      }
      continue;
    }

    if (event.eventKind === "attention_resolved" && current) {
      const resolvedAction = parseAttentionResolvedPayload(event.payload);
      if (!resolvedAction || isSameAttentionAction(current.action, resolvedAction)) {
        current = null;
      }
    }
  }

  return current;
}

export function isSameAttentionAction(
  left: Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>,
  right: Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>
): boolean {
  if (left.kind !== right.kind || left.runState !== right.runState) {
    return false;
  }

  if (left.kind === "queue_ceo_review" && right.kind === "queue_ceo_review") {
    if (left.reason === "next_lane_decision" || right.reason === "next_lane_decision") {
      return (
        left.reason === right.reason
        && left.completedCardId === right.completedCardId
        && left.nextCardId === right.nextCardId
      );
    }
    return left.reason === right.reason;
  }

  if ("cardId" in left && "cardId" in right) {
    return left.cardId === right.cardId;
  }

  return false;
}

function describeCeoReviewSummary(
  reason: Extract<HarnessPostOutcomeAction, { kind: "queue_ceo_review" }>["reason"]
): string {
  switch (reason) {
    case "final_assembly":
      return "The board is ready for final assembly before the tenant-facing package is closed.";
    case "governance_backlog":
      return "The board needs CEO review because deferred governance is now the next bounded move.";
    case "governance_hold":
      return "The board needs CEO review because governance work is still shaping what can move next.";
    case "next_lane_decision":
      return "The board needs CEO review to decide the next bounded lane move after the latest completed child lane.";
    case "cycle_closed":
      return "The board cycle is closed and packaged; CEO can intentionally start the next bounded cycle.";
    default:
      return "The board needs CEO review before work can continue.";
  }
}

function selectObservedLaneForState(
  cards: readonly HarnessCardRecord[],
  state: Extract<HarnessCardState, "waiting" | "blocked" | "approved">,
  fallbackCardId?: string
): HarnessCardRecord | null {
  const matchingLanes = cards
    .filter((card) => card.persona !== "ceo" && card.state === state)
    .sort(compareObservedLanes);
  if (fallbackCardId) {
    return matchingLanes.find((card) => card.id === fallbackCardId) ?? matchingLanes[0] ?? null;
  }
  return matchingLanes[0] ?? null;
}

function compareObservedLanes(left: HarnessCardRecord, right: HarnessCardRecord): number {
  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt.localeCompare(right.updatedAt);
  }
  return left.createdAt.localeCompare(right.createdAt);
}

function parseAttentionActionPayload(
  payload: Record<string, unknown>
): Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }> | null {
  const actionKind = readOptionalString(payload.actionKind);
  const runState = readOptionalString(payload.runState) as HarnessRunRecord["state"] | undefined;

  if (!actionKind || !runState) {
    return null;
  }

  if (actionKind === "queue_ceo_review") {
    const reason = readOptionalString(payload.reason);
    const completedCardId = readOptionalString(payload.completedCardId);
    const nextCardId = readOptionalString(payload.nextCardId);
    if (
      reason === "final_assembly"
      || reason === "governance_backlog"
      || reason === "governance_hold"
      || reason === "next_lane_decision"
      || reason === "cycle_closed"
    ) {
      return {
        kind: "queue_ceo_review",
        runState,
        reason,
        ...(reason === "next_lane_decision"
          ? {
              ...(completedCardId ? { completedCardId } : {}),
              ...(nextCardId ? { nextCardId } : {})
            }
          : {})
      };
    }
    return null;
  }

  if (actionKind === "await_lane_resume") {
    const targetCardId = readOptionalString(payload.targetCardId);
    if (!targetCardId) {
      return null;
    }
    return {
      kind: "await_lane_resume",
      runState: "waiting",
      cardId: targetCardId
    };
  }

  if (actionKind === "await_unblock") {
    const targetCardId = readOptionalString(payload.targetCardId);
    if (!targetCardId) {
      return null;
    }
    return {
      kind: "await_unblock",
      runState: "blocked",
      cardId: targetCardId
    };
  }

  return null;
}

function parseAttentionResolvedPayload(
  payload: Record<string, unknown>
): Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }> | null {
  return parseAttentionActionPayload(payload);
}

function buildFallbackAttentionSnapshot(
  action: Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>
): HarnessAttentionSnapshot {
  const described = describeHarnessPostOutcomeActionKind(action);

  if (action.kind === "queue_ceo_review") {
    return {
      statusLabel: described.statusLabel,
      summary: described.summary,
      ...(described.reasonLabel ? { reasonLabel: described.reasonLabel } : {}),
      ...(action.nextCardId ? { targetCardId: action.nextCardId } : {}),
      targetPersona: "ceo"
    };
  }

  return {
    statusLabel: described.statusLabel,
    summary: described.summary,
    targetCardId: action.cardId
  };
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function deriveNextLaneReviewTarget(
  cards: readonly HarnessCardRecord[],
  fallbackCardId?: string
): { completedCardId: string; nextCardId: string } | null {
  const hasInFlightChildLane = cards.some(
    (card) =>
      card.persona !== "ceo"
      && (card.state === "working" || card.state === "waiting" || card.state === "blocked")
  );
  if (hasInFlightChildLane) {
    return null;
  }
  const nextApprovedLane = selectObservedLaneForState(cards, "approved");
  const completedLane = selectMostRecentlyCompletedLane(cards, fallbackCardId);
  if (!nextApprovedLane || !completedLane) {
    return null;
  }
  return {
    completedCardId: completedLane.id,
    nextCardId: nextApprovedLane.id
  };
}

function selectMostRecentlyCompletedLane(
  cards: readonly HarnessCardRecord[],
  fallbackCardId?: string
): HarnessCardRecord | null {
  const completedLanes = cards
    .filter((card) => card.persona !== "ceo" && card.state === "done")
    .sort((left, right) => {
      if (left.updatedAt !== right.updatedAt) {
        return right.updatedAt.localeCompare(left.updatedAt);
      }
      return right.createdAt.localeCompare(left.createdAt);
    });
  if (fallbackCardId) {
    return completedLanes.find((card) => card.id === fallbackCardId) ?? completedLanes[0] ?? null;
  }
  return completedLanes[0] ?? null;
}
