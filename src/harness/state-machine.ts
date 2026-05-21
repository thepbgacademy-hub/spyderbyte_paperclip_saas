import type { HarnessCardRecord, HarnessCardState, HarnessRunRecord, HarnessRunState } from "./types.js";

const RUN_TRANSITIONS: Record<HarnessRunState, readonly HarnessRunState[]> = {
  queued: ["planning", "cancelled"],
  planning: ["active", "blocked", "cancelled"],
  active: ["waiting", "assembling", "blocked", "failed", "cancelled"],
  waiting: ["active", "blocked", "cancelled"],
  blocked: ["planning", "cancelled", "failed"],
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
  done: [],
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
