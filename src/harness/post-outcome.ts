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
      reason: "final_assembly" | "governance_backlog" | "governance_hold";
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
    default:
      return reason;
  }
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
          requestedAt: event.createdAt
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
    default:
      return "The board needs CEO review before work can continue.";
  }
}

function selectObservedLaneForState(
  cards: readonly HarnessCardRecord[],
  state: Extract<HarnessCardState, "waiting" | "blocked">,
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
    if (reason === "final_assembly" || reason === "governance_backlog" || reason === "governance_hold") {
      return {
        kind: "queue_ceo_review",
        runState,
        reason
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

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
