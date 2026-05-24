import type { HarnessSubCardProposal } from "./runtime-contract.js";
import type { HarnessCardRecord, HarnessCardState, HarnessRunRecord, HarnessRunState } from "./types.js";

const RUN_TRANSITIONS: Record<HarnessRunState, readonly HarnessRunState[]> = {
  queued: ["planning", "cancelled"],
  planning: ["active", "blocked", "cancelled"],
  active: ["waiting", "assembling", "blocked", "failed", "cancelled"],
  waiting: ["active", "blocked", "cancelled"],
  blocked: ["planning", "active", "waiting", "assembling", "cancelled", "failed"],
  assembling: ["done", "failed", "cancelled"],
  done: [],
  failed: [],
  cancelled: []
};

const CARD_TRANSITIONS: Record<HarnessCardState, readonly HarnessCardState[]> = {
  queued: ["planning", "cancelled"],
  planning: ["approved", "blocked", "cancelled"],
  approved: ["working", "blocked", "cancelled"],
  working: ["waiting", "done", "blocked", "cancelled"],
  waiting: ["working", "blocked", "cancelled"],
  blocked: ["approved", "cancelled"],
  done: ["approved"],
  cancelled: []
};

export function assertValidRunTransition(from: HarnessRunState, to: HarnessRunState): HarnessRunState {
  if (!RUN_TRANSITIONS[from].includes(to)) {
    throw new Error(`Invalid harness run transition: ${from} -> ${to}`);
  }

  return to;
}

export function assertValidCardTransition(from: HarnessCardState, to: HarnessCardState): HarnessCardState {
  if (!CARD_TRANSITIONS[from].includes(to)) {
    throw new Error(`Invalid harness card transition: ${from} -> ${to}`);
  }

  return to;
}

export function transitionHarnessRun(run: HarnessRunRecord, to: HarnessRunState): HarnessRunRecord {
  return {
    ...run,
    state: assertValidRunTransition(run.state, to),
    updatedAt: new Date().toISOString()
  };
}

export function transitionHarnessCard(card: HarnessCardRecord, to: HarnessCardState): HarnessCardRecord {
  return {
    ...card,
    state: assertValidCardTransition(card.state, to),
    updatedAt: new Date().toISOString()
  };
}

export function deriveHarnessRunState(input: {
  run: HarnessRunRecord;
  cards: readonly HarnessCardRecord[];
  proposals?: readonly HarnessSubCardProposal[];
}): HarnessRunState {
  const childCards = input.cards.filter((card) => card.persona !== "ceo");
  const pendingProposals = (input.proposals ?? []).filter((proposal) => proposal.status === "proposed");

  if (childCards.some((card) => card.state === "working")) {
    return "active";
  }
  if (childCards.some((card) => card.state === "waiting")) {
    return "waiting";
  }
  if (childCards.some((card) => card.state === "blocked")) {
    return "blocked";
  }

  const hasDoneChild = childCards.some((card) => card.state === "done");
  const allChildrenTerminal =
    childCards.length > 0 &&
    childCards.every((card) => card.state === "done" || card.state === "cancelled");
  if (allChildrenTerminal && hasDoneChild && pendingProposals.length === 0) {
    return "assembling";
  }
  if (allChildrenTerminal && !hasDoneChild && pendingProposals.length === 0) {
    return "blocked";
  }

  return "active";
}
