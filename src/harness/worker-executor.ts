import type { HarnessRepository } from "./repository.js";
import { createHarnessRuntime } from "./runtime.js";
import { deriveHarnessRunState } from "./state-machine.js";
import {
  describeHarnessPostOutcomeActionKind,
  deriveCurrentHarnessAttentionState,
  determineHarnessPostOutcomeAction,
  isSameAttentionAction,
  type HarnessAttentionSnapshot,
  type HarnessPostOutcomeAction
} from "./post-outcome.js";
import {
  createHarnessCardContinuityRecord,
  createHarnessCardEventRecord,
  type HarnessCardContinuityRecord,
  type HarnessCardRecord,
  type HarnessCardState,
  type HarnessRunRecord,
  type HarnessRuntimeContext
} from "./types.js";
import type { ProviderCapability } from "../packages/package-types.js";

export type HarnessWorkerLaneExecution = {
  cardId: string;
  parentCardId?: string;
  persona: string;
  title: string;
  deliverableType: string;
  state: HarnessCardRecord["state"];
  resumeFocus?: string;
  continuitySource?: HarnessCardContinuityRecord["continuitySource"];
  latestResultSummary?: string;
  absorbedWorkItems?: string[];
};

export type HarnessWorkerDispatchHandoff =
  | {
      kind: "initial_claim";
      kindLabel: "Initial lane claim";
    }
  | {
      kind: "follow_on_dispatch";
      kindLabel: "Follow-on dispatch";
      triggeredByCardId: string;
      triggeredByPersona: string;
      triggeredByOutcomeState: Extract<HarnessCardState, "waiting" | "done" | "blocked" | "cancelled">;
      triggeredByResultSummary?: string;
    };

export type HarnessWorkerOutcomeContract = {
  allowedStates: readonly Extract<HarnessCardState, "waiting" | "done" | "blocked" | "cancelled">[];
  resultSummaryRequiredStates: readonly Extract<HarnessCardState, "done">[];
  resumeSummaryAllowedStates: readonly Extract<HarnessCardState, "waiting" | "blocked" | "cancelled">[];
};

export type HarnessWorkerDispatch = {
  runId: string;
  workflowId: string;
  status: "queued" | "running";
  laneExecution: HarnessWorkerLaneExecution | null;
  dispatchHandoff?: HarnessWorkerDispatchHandoff;
};

export type HarnessWorkerExecutionEnvelope = {
  tenantId: string;
  runId: string;
  workflowId: string;
  requiredCapabilities: readonly ProviderCapability[];
  runtimeContext: HarnessRuntimeContext;
  laneExecution: HarnessWorkerLaneExecution;
  dispatchHandoff?: HarnessWorkerDispatchHandoff;
  outcomeContract: HarnessWorkerOutcomeContract;
};

export type HarnessWorkerLaneOutcome = {
  runId: string;
  workflowId: string;
  status: "committed" | "ignored";
  reason?: "terminal_run" | "lane_not_working";
  attentionTransition?: HarnessWorkerLaneAttentionTransition;
  laneExecution?: {
    cardId: string;
    state: HarnessCardState;
    runState: HarnessRunRecord["state"];
    resumeFocus?: string;
    latestResultSummary?: string;
  };
  postOutcomeAction?: HarnessPostOutcomeAction;
  nextDispatch?: HarnessWorkerDispatch;
};

export type HarnessWorkerLaneAttentionTransition =
  | {
      kind: "none";
    }
  | {
      kind: "requested";
      requestedAction: Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>;
      resolvedAction?: Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>;
    }
  | {
      kind: "resolved";
      resolvedAction: Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>;
    }
  | {
      kind: "unchanged";
      action: Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>;
    };

type HarnessDispatchRepository = Pick<
  HarnessRepository,
  | "getRun"
  | "listCardsForRun"
  | "listProposalsForRun"
  | "listCardContinuityForRun"
  | "claimCardForExecution"
  | "insertEvent"
  | "upsertCardContinuity"
  | "updateRunState"
>;

type HarnessOutcomeRepository = Pick<
  HarnessRepository,
  | "getRun"
  | "getCard"
  | "getCardContinuity"
  | "listCardsForRun"
  | "listEventsForRun"
  | "listProposalsForRun"
  | "listCardContinuityForRun"
  | "claimCardForExecution"
  | "transitionCardState"
  | "insertEvent"
  | "upsertCardContinuity"
  | "updateRunState"
>;

const ACTIONABLE_CARD_PRIORITIES: Readonly<Record<HarnessCardRecord["state"], number | null>> = {
  working: 0,
  approved: 1,
  queued: null,
  planning: null,
  waiting: null,
  blocked: null,
  done: null,
  cancelled: null
};

const NON_EXECUTABLE_RUN_STATES = new Set(["assembling", "done", "failed", "cancelled"]);
const HARNESS_WORKER_OUTCOME_CONTRACT: HarnessWorkerOutcomeContract = {
  allowedStates: ["waiting", "done", "blocked", "cancelled"],
  resultSummaryRequiredStates: ["done"],
  resumeSummaryAllowedStates: ["waiting", "blocked", "cancelled"]
};

export async function buildHarnessWorkerDispatch(input: {
  repository: HarnessDispatchRepository;
  tenantId: string;
  runId: string;
  workflowId: string;
  dispatchHandoff?: HarnessWorkerDispatchHandoff;
  runAtomically?: <T>(work: (repository: HarnessDispatchRepository) => Promise<T>) => Promise<T>;
}): Promise<HarnessWorkerDispatch> {
  const runWork = input.runAtomically ?? (async <T>(work: (repository: HarnessDispatchRepository) => Promise<T>) => work(input.repository));
  return runWork(async (repository) => {
    const run = await repository.getRun(input.runId);
    if (!run || run.tenantId !== input.tenantId || run.workflowId !== input.workflowId) {
      throw new Error(`Unknown harness run for worker dispatch: ${input.runId}`);
    }
    if (NON_EXECUTABLE_RUN_STATES.has(run.state)) {
      return {
        runId: run.id,
        workflowId: run.workflowId,
        status: "queued",
        laneExecution: null
      };
    }

    const [cards, proposals, continuity] = await Promise.all([
      repository.listCardsForRun(run.id),
      repository.listProposalsForRun(run.id),
      repository.listCardContinuityForRun(run.id)
    ]);

    const runtime = createHarnessRuntime();
    runtime.resumeRun({ run, cards, proposals, continuity });

    const lane = selectNextActionableLane(cards);
    if (!lane) {
      return {
        runId: run.id,
        workflowId: run.workflowId,
        status: "queued",
        laneExecution: null
      };
    }

    const claimedLane = await claimLaneForExecution({
      repository,
      lane
    });
    if (!claimedLane || claimedLane.state !== "working") {
      return {
        runId: run.id,
        workflowId: run.workflowId,
        status: "queued",
        laneExecution: null
      };
    }

    const updatedContinuity = await persistWorkerStartState({
      repository,
      run,
      cards,
      proposals,
      continuity,
      claimedLane,
      previousLaneState: lane.state
    });
    const resumedRuntime = createHarnessRuntime();
    resumedRuntime.resumeRun({
      run,
      cards: cards.map((card) => (card.id === claimedLane.id ? claimedLane : card)),
      proposals,
      continuity: mergeContinuityRecord(continuity, updatedContinuity)
    });

    const resumeFocus = resumedRuntime.getResumeFocus(claimedLane.id);

      return {
        runId: run.id,
        workflowId: run.workflowId,
        status: "running",
        dispatchHandoff: input.dispatchHandoff ?? {
          kind: "initial_claim",
          kindLabel: "Initial lane claim"
        },
        laneExecution: {
          cardId: claimedLane.id,
          persona: claimedLane.persona,
        title: claimedLane.title,
        deliverableType: claimedLane.deliverableType,
        state: claimedLane.state,
        ...(resumeFocus ? { resumeFocus } : {}),
        ...(updatedContinuity.latestResultSummary ? { latestResultSummary: updatedContinuity.latestResultSummary } : {})
      }
    };
  });
}

export async function commitHarnessWorkerLaneOutcome(input: {
  repository: HarnessOutcomeRepository;
  tenantId: string;
  runId: string;
  workflowId: string;
  cardId: string;
  state: Extract<HarnessCardState, "waiting" | "done" | "blocked" | "cancelled">;
  resultSummary?: string;
  resumeSummary?: string;
  runAtomically?: <T>(work: (repository: HarnessOutcomeRepository) => Promise<T>) => Promise<T>;
}): Promise<HarnessWorkerLaneOutcome> {
  const runWork = input.runAtomically ?? (async <T>(work: (repository: HarnessOutcomeRepository) => Promise<T>) => work(input.repository));
  return runWork(async (repository) => {
    const run = await repository.getRun(input.runId);
    if (!run || run.tenantId !== input.tenantId || run.workflowId !== input.workflowId) {
      throw new Error(`Unknown harness run for worker lane outcome: ${input.runId}`);
    }
    if (NON_EXECUTABLE_RUN_STATES.has(run.state)) {
      return {
        runId: run.id,
        workflowId: run.workflowId,
        status: "ignored",
        reason: "terminal_run"
      };
    }

    const card = await repository.getCard(input.cardId);
    if (!card || card.runId !== run.id || card.persona === "ceo") {
      throw new Error(`Unknown harness child lane for worker outcome: ${input.cardId}`);
    }
    if (card.state !== "working") {
      return {
        runId: run.id,
        workflowId: run.workflowId,
        status: "ignored",
        reason: "lane_not_working"
      };
    }

    const trimmedSummary = input.resultSummary?.trim();
    const trimmedResumeSummary = input.resumeSummary?.trim();
    if (trimmedSummary && input.state !== "done") {
      throw new Error("Worker lane result summaries can only be recorded for done outcomes");
    }
    if (trimmedResumeSummary && input.state === "done") {
      throw new Error("Worker lane resume summaries cannot be recorded for done outcomes");
    }

    const updatedCard = await repository.transitionCardState({
      cardId: card.id,
      expectedState: "working",
      state: input.state
    });
    if (!updatedCard) {
      return {
        runId: run.id,
        workflowId: run.workflowId,
        status: "ignored",
        reason: "lane_not_working"
      };
    }

    await repository.insertEvent(
      createHarnessCardEventRecord({
        cardId: updatedCard.id,
        eventKind: "state_changed",
        payload: { from: card.state, to: updatedCard.state }
      })
    );

    let continuity: HarnessCardContinuityRecord;
    if (trimmedSummary) {
      await repository.insertEvent(
        createHarnessCardEventRecord({
          cardId: updatedCard.id,
          eventKind: "result_recorded",
          payload: { summary: trimmedSummary }
        })
      );
      continuity = await recordLatestResultContinuity({
        repository,
        card: updatedCard,
        resultSummary: trimmedSummary
      });
    } else {
      continuity = await recordCardStateContinuity({
          repository,
          card: updatedCard,
          ...(trimmedResumeSummary ? { resumeSummary: trimmedResumeSummary } : {})
        });
    }

    const reconciledRun = await reconcileHarnessRunState({
      repository,
      run
    });
    const nextRun = reconciledRun ?? run;
    const nextDispatch =
      NON_EXECUTABLE_RUN_STATES.has(nextRun.state)
        ? null
        : await buildHarnessWorkerDispatch({
            repository,
            tenantId: input.tenantId,
            runId: run.id,
            workflowId: run.workflowId,
            dispatchHandoff: {
              kind: "follow_on_dispatch",
              kindLabel: "Follow-on dispatch",
              triggeredByCardId: updatedCard.id,
              triggeredByPersona: updatedCard.persona,
              triggeredByOutcomeState: input.state,
              ...(continuity.latestResultSummary
                ? { triggeredByResultSummary: continuity.latestResultSummary }
                : {})
            }
          });
    const [latestRun, cardsAfterOutcome, proposalsAfterOutcome, eventsAfterOutcome, continuityAfterOutcome] = await Promise.all([
      repository.getRun(run.id),
      repository.listCardsForRun(run.id),
      repository.listProposalsForRun(run.id),
      repository.listEventsForRun(run.id),
      repository.listCardContinuityForRun(run.id)
    ]);
    const latestRunState = latestRun?.state ?? nextRun.state;
    const postOutcomeAction = determinePostOutcomeAction({
      runState: latestRunState,
      fallbackCardId: updatedCard.id,
      nextDispatch,
      cards: cardsAfterOutcome,
      proposals: proposalsAfterOutcome
    });
    const currentAttention = deriveCurrentHarnessAttentionState(eventsAfterOutcome);
    const nextAttention =
      postOutcomeAction && postOutcomeAction.kind !== "dispatch_next_lane"
        ? postOutcomeAction
        : null;
    const attentionTransition = deriveAttentionTransition({
      currentAttention: currentAttention?.action ?? null,
      nextAttention
    });

    if (currentAttention && (!nextAttention || !isSameAttentionAction(currentAttention.action, nextAttention))) {
      await repository.insertEvent(
        createHarnessCardEventRecord({
          cardId: "cardId" in currentAttention.action ? currentAttention.action.cardId : updatedCard.id,
          eventKind: "attention_resolved",
          payload: createAttentionResolvedPayload({
            action: currentAttention.action,
            snapshot: currentAttention.snapshot
          })
        })
      );
    }

    if (
      nextAttention
      && (!currentAttention || !isSameAttentionAction(currentAttention.action, nextAttention))
    ) {
      await repository.insertEvent(
        createHarnessCardEventRecord({
          cardId: "cardId" in nextAttention ? nextAttention.cardId : updatedCard.id,
          eventKind: "attention_requested",
          payload: createAttentionRequestedPayload({
            action: nextAttention,
            cards: cardsAfterOutcome,
            continuity: continuityAfterOutcome
          })
        })
      );
    }
    return {
      runId: run.id,
      workflowId: run.workflowId,
      status: "committed",
      attentionTransition,
      laneExecution: {
        cardId: updatedCard.id,
        state: updatedCard.state,
        runState: latestRunState,
        ...(continuity.continuitySummary ? { resumeFocus: continuity.continuitySummary } : {}),
        ...(continuity.latestResultSummary ? { latestResultSummary: continuity.latestResultSummary } : {})
      },
      ...(postOutcomeAction ? { postOutcomeAction } : {}),
      ...(nextDispatch?.laneExecution ? { nextDispatch } : {})
    };
  });
}

export async function buildHarnessWorkerExecutionEnvelope(input: {
  repository: Pick<HarnessRepository, "getRun" | "getCard" | "getCardContinuity">;
  tenantId: string;
  dispatch: HarnessWorkerDispatch;
  requiredCapabilities: readonly ProviderCapability[];
}): Promise<HarnessWorkerExecutionEnvelope | null> {
  if (!input.dispatch.laneExecution) {
    return null;
  }

  const run = await input.repository.getRun(input.dispatch.runId);
  if (!run || run.tenantId !== input.tenantId || run.workflowId !== input.dispatch.workflowId) {
    throw new Error(`Unknown harness run for worker execution envelope: ${input.dispatch.runId}`);
  }
  const lane = await input.repository.getCard(input.dispatch.laneExecution.cardId);
  if (!lane || lane.runId !== run.id || lane.persona === "ceo") {
    throw new Error(`Unknown harness child lane for worker execution envelope: ${input.dispatch.laneExecution.cardId}`);
  }
  const continuity = await input.repository.getCardContinuity(lane.id);

  return {
    tenantId: input.tenantId,
    runId: run.id,
    workflowId: run.workflowId,
    requiredCapabilities: [...input.requiredCapabilities],
    runtimeContext: run.runtimeContext,
    ...(input.dispatch.dispatchHandoff
      ? {
          dispatchHandoff:
            "triggeredByCardId" in input.dispatch.dispatchHandoff
              ? { ...input.dispatch.dispatchHandoff }
              : { ...input.dispatch.dispatchHandoff }
        }
      : {}),
    outcomeContract: {
      allowedStates: [...HARNESS_WORKER_OUTCOME_CONTRACT.allowedStates],
      resultSummaryRequiredStates: [...HARNESS_WORKER_OUTCOME_CONTRACT.resultSummaryRequiredStates],
      resumeSummaryAllowedStates: [...HARNESS_WORKER_OUTCOME_CONTRACT.resumeSummaryAllowedStates]
    },
    laneExecution: {
      cardId: lane.id,
      ...(lane.parentCardId ? { parentCardId: lane.parentCardId } : {}),
      persona: lane.persona,
      title: lane.title,
      deliverableType: lane.deliverableType,
      state: lane.state,
      ...(continuity?.continuitySummary ? { resumeFocus: continuity.continuitySummary } : {}),
      ...(continuity?.continuitySource ? { continuitySource: continuity.continuitySource } : {}),
      ...(continuity?.latestResultSummary ? { latestResultSummary: continuity.latestResultSummary } : {}),
      ...(continuity?.absorbedWorkItems?.length ? { absorbedWorkItems: [...continuity.absorbedWorkItems] } : {})
    }
  };
}

async function claimLaneForExecution(input: {
  repository: HarnessDispatchRepository;
  lane: HarnessCardRecord;
}): Promise<HarnessCardRecord | null> {
  if (input.lane.state === "working") {
    return input.lane;
  }
  if (input.lane.state !== "approved") {
    return null;
  }
  return input.repository.claimCardForExecution({
    cardId: input.lane.id,
    expectedState: "approved"
  });
}

function selectNextActionableLane(cards: readonly HarnessCardRecord[]): HarnessCardRecord | null {
  const actionable = cards
    .filter((card) => card.persona !== "ceo")
    .filter((card) => ACTIONABLE_CARD_PRIORITIES[card.state] !== null)
    .sort(compareActionableCards);

  return actionable[0] ?? null;
}

function compareActionableCards(left: HarnessCardRecord, right: HarnessCardRecord): number {
  const leftPriority = ACTIONABLE_CARD_PRIORITIES[left.state];
  const rightPriority = ACTIONABLE_CARD_PRIORITIES[right.state];
  if (leftPriority === null || rightPriority === null) {
    return 0;
  }
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }
  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt.localeCompare(right.updatedAt);
  }
  return left.createdAt.localeCompare(right.createdAt);
}

async function persistWorkerStartState(input: {
  repository: HarnessDispatchRepository;
  run: HarnessRunRecord;
  cards: readonly HarnessCardRecord[];
  proposals: Awaited<ReturnType<HarnessDispatchRepository["listProposalsForRun"]>>;
  continuity: Awaited<ReturnType<HarnessDispatchRepository["listCardContinuityForRun"]>>;
  claimedLane: HarnessCardRecord;
  previousLaneState: HarnessCardRecord["state"];
}): Promise<HarnessCardContinuityRecord> {
  const existingContinuity = input.continuity.find((record) => record.cardId === input.claimedLane.id) ?? null;
  const laneStateChanged = input.previousLaneState !== input.claimedLane.state;
  if (laneStateChanged) {
    await input.repository.insertEvent(
      createHarnessCardEventRecord({
        cardId: input.claimedLane.id,
        eventKind: "state_changed",
        payload: {
          from: input.previousLaneState,
          to: input.claimedLane.state
        }
      })
    );
  }

  const updatedContinuity = laneStateChanged
    ? createHarnessCardContinuityRecord({
        cardId: input.claimedLane.id,
        runId: input.run.id,
        continuitySource: "state_transition",
        continuitySummary: createActiveResumeSummary(input.claimedLane),
        latestResultSummary: existingContinuity?.latestResultSummary ?? null,
        absorbedWorkItems: existingContinuity?.absorbedWorkItems ?? []
      })
    : existingContinuity ??
      createHarnessCardContinuityRecord({
        cardId: input.claimedLane.id,
        runId: input.run.id,
        continuitySource: "state_transition",
        continuitySummary: createActiveResumeSummary(input.claimedLane),
        latestResultSummary: null,
        absorbedWorkItems: []
      });
  if (laneStateChanged || !existingContinuity) {
    await input.repository.upsertCardContinuity(updatedContinuity);
  }

  const nextRunState = deriveHarnessRunState({
    run: input.run,
    cards: input.cards.map((card) => (card.id === input.claimedLane.id ? input.claimedLane : card)),
    proposals: input.proposals
  });
  if (nextRunState !== input.run.state) {
    await input.repository.updateRunState({
      runId: input.run.id,
      state: nextRunState
    });
  }

  return updatedContinuity;
}

async function reconcileHarnessRunState(input: {
  repository: Pick<HarnessRepository, "listCardsForRun" | "listProposalsForRun" | "updateRunState">;
  run: HarnessRunRecord;
}): Promise<HarnessRunRecord | null> {
  const [cards, proposals] = await Promise.all([
    input.repository.listCardsForRun(input.run.id),
    input.repository.listProposalsForRun(input.run.id)
  ]);
  const nextState = deriveHarnessRunState({
    run: input.run,
    cards,
    proposals
  });
  if (nextState === input.run.state) {
    return null;
  }
  return input.repository.updateRunState({
    runId: input.run.id,
    state: nextState
  });
}

function determinePostOutcomeAction(input: {
  runState: HarnessRunRecord["state"];
  fallbackCardId?: string;
  nextDispatch: HarnessWorkerDispatch | null;
  cards: readonly HarnessCardRecord[];
  proposals: Awaited<ReturnType<HarnessOutcomeRepository["listProposalsForRun"]>>;
}): HarnessPostOutcomeAction | null {
  return determineHarnessPostOutcomeAction({
    runState: input.runState,
    ...(input.fallbackCardId ? { fallbackCardId: input.fallbackCardId } : {}),
    nextDispatchCard: input.nextDispatch?.laneExecution
      ? {
          cardId: input.nextDispatch.laneExecution.cardId,
          persona: input.nextDispatch.laneExecution.persona
        }
      : null,
    cards: input.cards,
    proposals: input.proposals
  });
}

function createAttentionRequestedPayload(input: {
  action: Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>;
  cards: readonly HarnessCardRecord[];
  continuity: readonly HarnessCardContinuityRecord[];
}): Record<string, unknown> {
  const snapshot = buildAttentionSnapshot({
    action: input.action,
    cards: input.cards,
    continuity: input.continuity
  });

  switch (input.action.kind) {
    case "queue_ceo_review":
      return {
        actionKind: input.action.kind,
        runState: input.action.runState,
        reason: input.action.reason,
        ...snapshot
      };
    case "await_lane_resume":
    case "await_unblock":
      return {
        actionKind: input.action.kind,
        runState: input.action.runState,
        targetCardId: input.action.cardId,
        ...snapshot
      };
  }
}

function createAttentionResolvedPayload(input: {
  action: Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>;
  snapshot: HarnessAttentionSnapshot;
}): Record<string, unknown> {
  switch (input.action.kind) {
    case "queue_ceo_review":
      return {
        actionKind: input.action.kind,
        runState: input.action.runState,
        reason: input.action.reason,
        ...input.snapshot
      };
    case "await_lane_resume":
    case "await_unblock":
      return {
        actionKind: input.action.kind,
        runState: input.action.runState,
        targetCardId: input.action.cardId,
        ...input.snapshot
      };
  }
}

function buildAttentionSnapshot(input: {
  action: Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>;
  cards: readonly HarnessCardRecord[];
  continuity: readonly HarnessCardContinuityRecord[];
}): HarnessAttentionSnapshot {
  const described = describeHarnessPostOutcomeActionKind(input.action);
  let targetCard: HarnessCardRecord | null = null;
  if (input.action.kind === "await_lane_resume" || input.action.kind === "await_unblock") {
    const targetCardId = input.action.cardId;
    targetCard = input.cards.find((card) => card.id === targetCardId) ?? null;
  }
  const continuitySummary =
    targetCard ? input.continuity.find((record) => record.cardId === targetCard.id)?.continuitySummary ?? null : null;

  return {
    statusLabel: described.statusLabel,
    summary: continuitySummary ?? described.summary,
    ...(described.reasonLabel ? { reasonLabel: described.reasonLabel } : {}),
    ...(input.action.kind === "queue_ceo_review" ? { targetPersona: "ceo" } : {}),
    ...(targetCard
      ? {
          targetCardId: targetCard.id,
          targetPersona: targetCard.persona,
          targetTitle: targetCard.title
        }
      : {})
  };
}

function deriveAttentionTransition(input: {
  currentAttention: Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }> | null;
  nextAttention: Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }> | null;
}): HarnessWorkerLaneAttentionTransition {
  const { currentAttention, nextAttention } = input;

  if (!currentAttention && !nextAttention) {
    return { kind: "none" };
  }
  if (!currentAttention && nextAttention) {
    return {
      kind: "requested",
      requestedAction: nextAttention
    };
  }
  if (currentAttention && !nextAttention) {
    return {
      kind: "resolved",
      resolvedAction: currentAttention
    };
  }
  if (currentAttention && nextAttention && isSameAttentionAction(currentAttention, nextAttention)) {
    return {
      kind: "unchanged",
      action: nextAttention
    };
  }
  return {
    kind: "requested",
    requestedAction: nextAttention!,
    ...(currentAttention ? { resolvedAction: currentAttention } : {})
  };
}

function createActiveResumeSummary(card: HarnessCardRecord): string {
  return `${card.persona.toUpperCase()} should continue this active ${humanizeDeliverableType(card.deliverableType).toLowerCase()} lane: ${card.title}.`;
}

function createDefaultResumeSummary(card: HarnessCardRecord): string | null {
  const personaLabel = card.persona.toUpperCase();
  const deliverableLabel = humanizeDeliverableType(card.deliverableType).toLowerCase();
  switch (card.state) {
    case "queued":
      return `${personaLabel} should start this queued ${deliverableLabel} lane from the approved assignment "${card.title}".`;
    case "planning":
      return `${personaLabel} should shape the next bounded move for "${card.title}".`;
    case "approved":
      return `${personaLabel} should begin this approved ${deliverableLabel} lane: ${card.title}.`;
    case "working":
      return createActiveResumeSummary(card);
    case "waiting":
      return `${personaLabel} should resolve the waiting dependency before restarting "${card.title}".`;
    case "blocked":
      return `${personaLabel} should unblock this ${deliverableLabel} lane before more work starts.`;
    case "done":
    case "cancelled":
      return null;
    default:
      return `${personaLabel} should resume this ${deliverableLabel} lane from persisted state.`;
  }
}

function humanizeDeliverableType(value: string): string {
  return value
    .split(/[\s_-]+/u)
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function mergeContinuityRecord(
  existing: readonly HarnessCardContinuityRecord[],
  record: HarnessCardContinuityRecord
): HarnessCardContinuityRecord[] {
  return [
    ...existing.filter((candidate) => candidate.cardId !== record.cardId),
    record
  ];
}

async function recordCardStateContinuity(input: {
  repository: Pick<HarnessRepository, "getCardContinuity" | "upsertCardContinuity">;
  card: HarnessCardRecord;
  resumeSummary?: string;
}): Promise<HarnessCardContinuityRecord> {
  const existing = await input.repository.getCardContinuity(input.card.id);
  const record = createHarnessCardContinuityRecord({
    cardId: input.card.id,
    runId: input.card.runId,
    continuitySource: input.resumeSummary ? "resume_override" : "state_transition",
    continuitySummary: input.resumeSummary ?? createDefaultResumeSummary(input.card),
    latestResultSummary: existing?.latestResultSummary ?? null,
    absorbedWorkItems: existing?.absorbedWorkItems ?? []
  });
  await input.repository.upsertCardContinuity(record);
  return record;
}

async function recordLatestResultContinuity(input: {
  repository: Pick<HarnessRepository, "getCardContinuity" | "upsertCardContinuity">;
  card: HarnessCardRecord;
  resultSummary: string;
  resumeSummary?: string;
}): Promise<HarnessCardContinuityRecord> {
  const existing = await input.repository.getCardContinuity(input.card.id);
  const record = createHarnessCardContinuityRecord({
    cardId: input.card.id,
    runId: input.card.runId,
    continuitySource: "result_recorded",
    continuitySummary: input.resumeSummary ?? createDefaultResumeSummary(input.card),
    latestResultSummary: input.resultSummary,
    absorbedWorkItems: existing?.absorbedWorkItems ?? []
  });
  await input.repository.upsertCardContinuity(record);
  return record;
}
