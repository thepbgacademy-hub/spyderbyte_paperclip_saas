import type { HarnessRepository } from "./repository.js";
import { createHarnessRuntime } from "./runtime.js";
import { deriveHarnessRunState } from "./state-machine.js";
import {
  describeHarnessPostOutcomeActionKind,
  deriveCurrentHarnessAttentionState,
  determineHarnessPostOutcomeAction,
  humanizePostOutcomeReason,
  isSameAttentionAction,
  type HarnessAttentionSnapshot,
  type HarnessPostOutcomeAction
} from "./post-outcome.js";
import {
  createHarnessCardContinuityRecord,
  createHarnessCardEventRecord,
  type HarnessCardContinuityRecord,
  type HarnessCardEventRecord,
  type HarnessCardRecord,
  type HarnessCardState,
  type HarnessRunRecord,
  type HarnessRuntimeContext,
  type HarnessTaxStrategyPrerequisiteEvidenceItem
} from "./types.js";
import {
  parseContinuityAbsorbedWorkItem,
  type ParsedHarnessContinuityAbsorbedWorkItem
} from "./continuity.js";
import type { HarnessSubCardProposal } from "./runtime-contract.js";
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

export type HarnessWorkerContinuityContext = {
  source: HarnessCardContinuityRecord["continuitySource"];
  summary: string | null;
  latestResultSummary: string | null;
  absorbedWorkCount: number;
  latestAbsorbedWork?: ParsedHarnessContinuityAbsorbedWorkItem;
  absorbedWorkTrail: ParsedHarnessContinuityAbsorbedWorkItem[];
};

export type HarnessWorkerDispatchHandoff =
  | {
      kind: "initial_claim";
      kindLabel: "Initial lane claim";
      executionStage: "initial_lane_start";
      executionStageLabel: "Initial lane start";
    }
  | {
      kind: "follow_on_dispatch";
      kindLabel: "Follow-on dispatch";
      executionStage: "post_outcome_follow_on";
      executionStageLabel: "Post-outcome follow-on";
      reactivatedRun: boolean;
      triggeredByCardId: string;
      triggeredByPersona: string;
      triggeredByOutcomeState: Extract<HarnessCardState, "waiting" | "done" | "blocked" | "cancelled">;
      triggeredByResultSummary?: string;
    };

export type HarnessWorkerOutcomeContract = {
  allowedStates: readonly Extract<HarnessCardState, "waiting" | "done" | "blocked" | "cancelled">[];
  resultSummaryRequiredStates: readonly Extract<HarnessCardState, "done">[];
  resumeSummaryAllowedStates: readonly Extract<HarnessCardState, "waiting" | "blocked" | "cancelled">[];
  postOutcomeDirectives: readonly HarnessWorkerPostOutcomeDirective[];
};

export type HarnessWorkerPostOutcomeDirective = {
  outcomeState: Extract<HarnessCardState, "waiting" | "done" | "blocked" | "cancelled">;
  runState: HarnessRunRecord["state"];
  actionKind: HarnessPostOutcomeAction["kind"] | "none";
  summary: string;
  targetCardId?: string;
  targetPersona?: string;
  reason?: Extract<HarnessPostOutcomeAction, { kind: "queue_ceo_review" }>["reason"];
};

export type HarnessWorkerDispatch = {
  runId: string;
  workflowId: string;
  status: "queued" | "running";
  laneExecution: HarnessWorkerLaneExecution | null;
  dispatchHandoff?: HarnessWorkerDispatchHandoff;
};

export type HarnessWorkerExecutionClaimContext = {
  kind: "approved_claim" | "working_claim_refresh" | "existing_working_claim";
  claimedAt: string;
  previousClaimedAt: string | null;
};

export type HarnessWorkerOrchestratorHandoff = {
  orchestratorPersona: HarnessRunRecord["orchestratorPersona"];
  dispatchReason: string;
  scopeGuard: string;
  completionRule: string;
  resumeDirective: string | null;
};

export type HarnessWorkerBoardContext = {
  runState: HarnessRunRecord["state"];
  activeAttention: {
    actionKind: Exclude<HarnessPostOutcomeAction["kind"], "dispatch_next_lane">;
    summary: string;
    targetCardId?: string;
    targetPersona?: string;
  } | null;
  parentLane: {
    cardId: string;
    persona: string;
    title: string;
    deliverableType: string;
    state: HarnessCardState;
  } | null;
  siblingLanes: readonly {
    cardId: string;
    persona: string;
    title: string;
    deliverableType: string;
    state: HarnessCardState;
  }[];
};

export type HarnessWorkerExecutionEnvelope = {
  tenantId: string;
  runId: string;
  workflowId: string;
  requiredCapabilities: readonly ProviderCapability[];
  runtimeContext: HarnessRuntimeContext;
  executionClaim: {
    kind: "approved_claim" | "working_claim_refresh" | "existing_working_claim";
    token: string;
    claimedAt: string;
    previousClaimedAt: string | null;
  };
  orchestratorHandoff: HarnessWorkerOrchestratorHandoff;
  boardContext: HarnessWorkerBoardContext;
  laneExecution: HarnessWorkerLaneExecution;
  continuityContext?: HarnessWorkerContinuityContext;
  workflowPrerequisites?: {
    taxStrategyEvidence?: readonly HarnessTaxStrategyPrerequisiteEvidenceItem[];
  };
  dispatchHandoff?: HarnessWorkerDispatchHandoff;
  outcomeContract: HarnessWorkerOutcomeContract;
};

type ClaimedHarnessLane = {
  lane: HarnessCardRecord;
  claimKind: "approved_claim" | "working_claim_refresh" | "existing_working_claim";
  previousClaimedAt: string | null;
};

export type HarnessWorkerLaneIgnored =
  | {
      reason: "terminal_run";
      runState: HarnessRunRecord["state"];
    }
  | {
      reason: "lane_not_working";
      currentLaneState: Exclude<HarnessCardState, "working">;
    }
  | {
      reason: "stale_execution_claim";
      currentLaneState: "working";
      activeExecutionClaimPresent: boolean;
      activeExecutionClaimClaimedAt: string | null;
      presentedExecutionClaimState: "missing" | "mismatched";
    };

export type HarnessWorkerLaneOutcome = {
  runId: string;
  workflowId: string;
  status: "committed" | "ignored";
  ignored?: HarnessWorkerLaneIgnored;
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
  nextExecutionStartContext?: {
    lane: HarnessCardRecord;
    executionClaim: HarnessWorkerExecutionClaimContext;
  };
};

type HarnessWorkerDispatchResolution = {
  dispatch: HarnessWorkerDispatch;
  lane?: HarnessCardRecord;
  executionClaim?: HarnessWorkerExecutionClaimContext;
  suppressedReason?: "claim_lost";
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
  | "listEventsForRun"
  | "listProposalsForRun"
  | "listCardContinuityForRun"
  | "claimCardForExecution"
  | "refreshCardExecutionClaim"
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
  | "refreshCardExecutionClaim"
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
  resumeSummaryAllowedStates: ["waiting", "blocked", "cancelled"],
  postOutcomeDirectives: []
};

export async function buildHarnessWorkerDispatch(input: {
  repository: HarnessDispatchRepository;
  tenantId: string;
  runId: string;
  workflowId: string;
  dispatchHandoff?: HarnessWorkerDispatchHandoff;
  runAtomically?: <T>(work: (repository: HarnessDispatchRepository) => Promise<T>) => Promise<T>;
}): Promise<HarnessWorkerDispatch> {
  const resolution = await buildHarnessWorkerDispatchResolution(input);
  return resolution.dispatch;
}

export async function buildHarnessWorkerDispatchResolution(input: {
  repository: HarnessDispatchRepository;
  tenantId: string;
  runId: string;
  workflowId: string;
  dispatchHandoff?: HarnessWorkerDispatchHandoff;
  targetCardId?: string;
  runAtomically?: <T>(work: (repository: HarnessDispatchRepository) => Promise<T>) => Promise<T>;
}): Promise<HarnessWorkerDispatchResolution> {
  const runWork = input.runAtomically ?? (async <T>(work: (repository: HarnessDispatchRepository) => Promise<T>) => work(input.repository));
  return runWork(async (repository) => {
    const run = await repository.getRun(input.runId);
    if (!run || run.tenantId !== input.tenantId || run.workflowId !== input.workflowId) {
      throw new Error(`Unknown harness run for worker dispatch: ${input.runId}`);
    }
    if (NON_EXECUTABLE_RUN_STATES.has(run.state)) {
      return {
        dispatch: {
          runId: run.id,
          workflowId: run.workflowId,
          status: "queued",
          laneExecution: null
        }
      };
    }

    const [cards, events, proposals, continuity] = await Promise.all([
      repository.listCardsForRun(run.id),
      repository.listEventsForRun(run.id),
      repository.listProposalsForRun(run.id),
      repository.listCardContinuityForRun(run.id)
    ]);

    const runtime = createHarnessRuntime();
    runtime.resumeRun({ run, cards, proposals, continuity });

    const currentAttention = deriveCurrentHarnessAttentionState(events);
    const currentRunState = deriveHarnessRunState({ run, cards, proposals });
    const currentlyPendingAttention = determineHarnessPostOutcomeAction({
      runState: currentRunState,
      cards,
      proposals,
      nextDispatchCard: null
    });
    if (
      !input.targetCardId
      && currentAttention?.action.kind === "queue_ceo_review"
      && currentlyPendingAttention?.kind === "queue_ceo_review"
      && isSameAttentionAction(currentAttention.action, currentlyPendingAttention)
    ) {
      // Generic workers must not outrun unresolved CEO review. A null pending action means
      // the current board posture no longer requires the historical ledger attention.
      return {
        dispatch: {
          runId: run.id,
          workflowId: run.workflowId,
          status: "queued",
          laneExecution: null
        }
      };
    }

    const targetedCardId =
      input.targetCardId
      ?? deriveLatestResolvedAttentionTargetCardId({
        cards,
        events
      });
    const lane =
      targetedCardId
        ? cards.find((card) => card.id === targetedCardId && card.persona !== "ceo") ?? null
        : selectNextActionableLane(cards);
    if (!lane) {
      return {
        dispatch: {
          runId: run.id,
          workflowId: run.workflowId,
          status: "queued",
          laneExecution: null
        }
      };
    }

    const claimedExecution = await claimLaneForExecution({
      repository,
      lane
    });
    if (!claimedExecution || claimedExecution.lane.state !== "working") {
      return {
        dispatch: {
          runId: run.id,
          workflowId: run.workflowId,
          status: "queued",
          laneExecution: null
        },
        suppressedReason: "claim_lost"
      };
    }
    const claimedLane = claimedExecution.lane;
    const dispatchHandoff = deriveDispatchHandoffForClaimedLane({
      ...(input.dispatchHandoff ? { explicitDispatchHandoff: input.dispatchHandoff } : {}),
      claimKind: claimedExecution.claimKind,
      laneId: claimedLane.id,
      events
    });

    const updatedContinuity = await persistWorkerStartState({
      repository,
      run,
      cards,
      proposals,
      continuity,
      claimedLane,
      claimKind: claimedExecution.claimKind,
      previousClaimedAt: claimedExecution.previousClaimedAt,
      previousLaneState: lane.state,
      dispatchHandoff
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
      dispatch: {
        runId: run.id,
        workflowId: run.workflowId,
        status: "running",
        dispatchHandoff,
        laneExecution: {
          cardId: claimedLane.id,
          persona: claimedLane.persona,
          title: claimedLane.title,
          deliverableType: claimedLane.deliverableType,
          state: claimedLane.state,
          ...(resumeFocus ? { resumeFocus } : {}),
          ...(updatedContinuity.latestResultSummary ? { latestResultSummary: updatedContinuity.latestResultSummary } : {})
        }
      },
      lane: claimedLane,
      executionClaim: {
        kind: claimedExecution.claimKind,
        claimedAt: claimedLane.executionClaimedAt!,
        previousClaimedAt: claimedExecution.previousClaimedAt
      }
    };
  });
}

function createInitialLaneClaimHandoff(): Extract<HarnessWorkerDispatchHandoff, { kind: "initial_claim" }> {
  return {
    kind: "initial_claim",
    kindLabel: "Initial lane claim",
    executionStage: "initial_lane_start",
    executionStageLabel: "Initial lane start"
  };
}

function deriveLatestResolvedAttentionTargetCardId(input: {
  cards: readonly HarnessCardRecord[];
  events: readonly HarnessCardEventRecord[];
}): string | null {
  const latestAttentionEvent = [...input.events]
    .filter((event) => event.eventKind === "attention_requested" || event.eventKind === "attention_resolved")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

  if (!latestAttentionEvent || latestAttentionEvent.eventKind !== "attention_resolved") {
    return null;
  }

  const actionKind = readWorkerEventStringField(latestAttentionEvent.payload, "actionKind");
  if (actionKind !== "await_unblock") {
    return null;
  }

  const targetCardId = readWorkerEventStringField(latestAttentionEvent.payload, "targetCardId");
  if (!targetCardId) {
    return null;
  }

  const targetCard =
    input.cards.find((card) => card.id === targetCardId && card.persona !== "ceo")
    ?? null;
  if (!targetCard || ACTIONABLE_CARD_PRIORITIES[targetCard.state] === null) {
    return null;
  }

  const laterDispatchExists = input.events.some(
    (event) =>
      event.cardId === targetCardId
      && event.eventKind === "execution_dispatched"
      && event.createdAt.localeCompare(latestAttentionEvent.createdAt) > 0
  );
  if (laterDispatchExists) {
    return null;
  }

  return targetCardId;
}

function deriveDispatchHandoffForClaimedLane(input: {
  explicitDispatchHandoff?: HarnessWorkerDispatchHandoff;
  claimKind: ClaimedHarnessLane["claimKind"];
  laneId: string;
  events: readonly HarnessCardEventRecord[];
}): HarnessWorkerDispatchHandoff {
  if (input.explicitDispatchHandoff) {
    return input.explicitDispatchHandoff;
  }

  if (input.claimKind === "approved_claim") {
    return createInitialLaneClaimHandoff();
  }

  return findLatestPersistedFollowOnDispatchHandoff({
    cardId: input.laneId,
    events: input.events
  }) ?? createInitialLaneClaimHandoff();
}

function findLatestPersistedFollowOnDispatchHandoff(input: {
  cardId: string;
  events: readonly HarnessCardEventRecord[];
}): Extract<HarnessWorkerDispatchHandoff, { kind: "follow_on_dispatch" }> | null {
  const dispatchEvents = input.events
    .filter((event) => event.cardId === input.cardId && event.eventKind === "execution_dispatched")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  for (const event of dispatchEvents) {
    const handoff = readFollowOnDispatchHandoffFromEventPayload(event.payload);
    if (handoff) {
      return handoff;
    }
  }

  return null;
}

function readFollowOnDispatchHandoffFromEventPayload(
  payload: Record<string, unknown>
): Extract<HarnessWorkerDispatchHandoff, { kind: "follow_on_dispatch" }> | null {
  const kind = readWorkerEventStringField(payload, "kind");
  const kindLabel = readWorkerEventStringField(payload, "kindLabel");
  const executionStage = readWorkerEventStringField(payload, "executionStage");
  const executionStageLabel = readWorkerEventStringField(payload, "executionStageLabel");
  const triggeredByCardId = readWorkerEventStringField(payload, "triggeredByCardId");
  const triggeredByPersona = readWorkerEventStringField(payload, "triggeredByPersona");
  const triggeredByOutcomeState = readWorkerEventStringField(payload, "triggeredByOutcomeState");
  const reactivatedRun = payload.reactivatedRun;
  const triggeredByResultSummary = readWorkerEventOptionalStringField(payload, "triggeredByResultSummary");

  if (
    kind !== "follow_on_dispatch"
    || kindLabel !== "Follow-on dispatch"
    || executionStage !== "post_outcome_follow_on"
    || executionStageLabel !== "Post-outcome follow-on"
    || !triggeredByCardId
    || !triggeredByPersona
    || !isHarnessFollowOnOutcomeState(triggeredByOutcomeState)
    || typeof reactivatedRun !== "boolean"
    || (triggeredByResultSummary && triggeredByOutcomeState !== "done")
  ) {
    return null;
  }

  return {
    kind,
    kindLabel,
    executionStage,
    executionStageLabel,
    reactivatedRun,
    triggeredByCardId,
    triggeredByPersona,
    triggeredByOutcomeState,
    ...(triggeredByResultSummary ? { triggeredByResultSummary } : {})
  };
}

function readWorkerEventStringField(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readWorkerEventOptionalStringField(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isHarnessFollowOnOutcomeState(
  value: string | null
): value is Extract<HarnessCardState, "waiting" | "done" | "blocked" | "cancelled"> {
  return value === "waiting" || value === "done" || value === "blocked" || value === "cancelled";
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
  requiredArtifactName?: string;
  executionClaimToken?: string;
  runAtomically?: <T>(work: (repository: HarnessOutcomeRepository) => Promise<T>) => Promise<T>;
}): Promise<HarnessWorkerLaneOutcome> {
  const runWork = input.runAtomically ?? (async <T>(work: (repository: HarnessOutcomeRepository) => Promise<T>) => work(input.repository));
  return runWork(async (repository) => {
    const run = await repository.getRun(input.runId);
    if (!run || run.tenantId !== input.tenantId || run.workflowId !== input.workflowId) {
      throw new Error(`Unknown harness run for worker lane outcome: ${input.runId}`);
    }
    if (NON_EXECUTABLE_RUN_STATES.has(run.state)) {
      const card = await repository.getCard(input.cardId);
      if (card && card.runId === run.id && card.persona !== "ceo") {
        await repository.insertEvent(
          buildIgnoredOutcomeEvent({
            cardId: card.id,
            ignored: {
              reason: "terminal_run",
              runState: run.state
            }
          })
        );
      }
      return {
        runId: run.id,
        workflowId: run.workflowId,
        status: "ignored",
        ignored: {
          reason: "terminal_run",
          runState: run.state
        }
      };
    }

    const card = await repository.getCard(input.cardId);
    if (!card || card.runId !== run.id || card.persona === "ceo") {
      throw new Error(`Unknown harness child lane for worker outcome: ${input.cardId}`);
    }
    if (card.state !== "working") {
      const ignored = {
        reason: "lane_not_working" as const,
        currentLaneState: card.state
      };
      await repository.insertEvent(
        buildIgnoredOutcomeEvent({
          cardId: card.id,
          ignored
        })
      );
      return {
        runId: run.id,
        workflowId: run.workflowId,
        status: "ignored",
        ignored
      };
    }
    if (!card.executionClaimToken || !card.executionClaimedAt) {
      const ignored = {
        reason: "stale_execution_claim" as const,
        currentLaneState: "working" as const,
        activeExecutionClaimPresent: false,
        activeExecutionClaimClaimedAt: null,
        presentedExecutionClaimState: input.executionClaimToken ? "mismatched" as const : "missing" as const
      };
      await repository.insertEvent(
        buildIgnoredOutcomeEvent({
          cardId: card.id,
          ignored
        })
      );
      return {
        runId: run.id,
        workflowId: run.workflowId,
        status: "ignored",
        ignored
      };
    }
    if (card.executionClaimToken && input.executionClaimToken !== card.executionClaimToken) {
      const ignored = {
        reason: "stale_execution_claim" as const,
        currentLaneState: "working" as const,
        activeExecutionClaimPresent: true,
        activeExecutionClaimClaimedAt: card.executionClaimedAt,
        presentedExecutionClaimState: input.executionClaimToken ? "mismatched" as const : "missing" as const
      };
      await repository.insertEvent(
        buildIgnoredOutcomeEvent({
          cardId: card.id,
          ignored
        })
      );
      return {
        runId: run.id,
        workflowId: run.workflowId,
        status: "ignored",
        ignored
      };
    }

    const trimmedSummary = input.resultSummary?.trim();
    const trimmedResumeSummary = input.resumeSummary?.trim();
    if (trimmedSummary && input.state !== "done") {
      throw new Error("Worker lane result summaries can only be recorded for done outcomes");
    }
    if (input.state === "done" && !trimmedSummary) {
      throw new Error("Worker lane result summaries are required for done outcomes");
    }
    if (trimmedResumeSummary && input.state === "done") {
      throw new Error("Worker lane resume summaries cannot be recorded for done outcomes");
    }

    const updatedCard = await repository.transitionCardState({
      cardId: card.id,
      expectedState: "working",
      state: input.state,
      ...(input.executionClaimToken ? { expectedExecutionClaimToken: input.executionClaimToken } : {})
    });
    if (!updatedCard) {
      const ignored = {
        reason: "stale_execution_claim" as const,
        currentLaneState: "working" as const,
        activeExecutionClaimPresent: true,
        activeExecutionClaimClaimedAt: card.executionClaimedAt,
        presentedExecutionClaimState: input.executionClaimToken ? "mismatched" as const : "missing" as const
      };
      await repository.insertEvent(
        buildIgnoredOutcomeEvent({
          cardId: card.id,
          ignored
        })
      );
      return {
        runId: run.id,
        workflowId: run.workflowId,
        status: "ignored",
        ignored
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
    let shouldHoldForCeoNextLaneReview = false;
    if (input.state === "done" && !NON_EXECUTABLE_RUN_STATES.has(nextRun.state)) {
      const [cardsBeforeDispatch, proposalsBeforeDispatch] = await Promise.all([
        repository.listCardsForRun(run.id),
        repository.listProposalsForRun(run.id)
      ]);
      const preDispatchAction = determineHarnessPostOutcomeAction({
        runState: nextRun.state,
        fallbackCardId: updatedCard.id,
        nextDispatchCard: null,
        cards: cardsBeforeDispatch,
        proposals: proposalsBeforeDispatch
      });
      shouldHoldForCeoNextLaneReview =
        preDispatchAction?.kind === "queue_ceo_review"
        && preDispatchAction.reason === "next_lane_decision";
    }
    const nextDispatchResolution =
      NON_EXECUTABLE_RUN_STATES.has(nextRun.state) || shouldHoldForCeoNextLaneReview
        ? null
        : await buildHarnessWorkerDispatchResolution({
            repository,
            tenantId: input.tenantId,
            runId: run.id,
            workflowId: run.workflowId,
            dispatchHandoff: {
              kind: "follow_on_dispatch",
              kindLabel: "Follow-on dispatch",
              executionStage: "post_outcome_follow_on",
              executionStageLabel: "Post-outcome follow-on",
              reactivatedRun: run.state === "waiting" && nextRun.state === "active",
              triggeredByCardId: updatedCard.id,
              triggeredByPersona: updatedCard.persona,
              triggeredByOutcomeState: input.state,
              ...(continuity.latestResultSummary
                ? { triggeredByResultSummary: continuity.latestResultSummary }
                : {})
            }
          });
    const nextDispatch = nextDispatchResolution?.dispatch ?? null;
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
    await repository.insertEvent(
      buildCommittedOutcomeEvent({
        cardId: updatedCard.id,
        outcomeState: input.state,
        runState: latestRunState,
        attentionTransitionKind: attentionTransition.kind,
        ...(postOutcomeAction ? { postOutcomeAction } : {}),
        ...(continuity.latestResultSummary ? { latestResultSummary: continuity.latestResultSummary } : {}),
        ...(continuity.continuitySummary ? { continuitySummary: continuity.continuitySummary } : {}),
        ...(input.requiredArtifactName ? { requiredArtifactName: input.requiredArtifactName } : {}),
        ...(nextDispatch ? { nextDispatch } : {})
      })
    );
    const nextExecutionStartContext =
      nextDispatchResolution?.lane && nextDispatchResolution.executionClaim
        ? {
            lane: nextDispatchResolution.lane,
            executionClaim: nextDispatchResolution.executionClaim
          }
        : null;
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
      ...(nextDispatch?.laneExecution ? { nextDispatch } : {}),
      ...(nextExecutionStartContext ? { nextExecutionStartContext } : {})
    };
  });
}

export async function buildHarnessWorkerExecutionEnvelope(input: {
  repository: Pick<HarnessRepository, "getRun" | "getCard" | "getCardContinuity" | "listCardsForRun" | "listProposalsForRun" | "listEventsForRun">;
  tenantId: string;
  dispatch: HarnessWorkerDispatch;
  requiredCapabilities: readonly ProviderCapability[];
  laneContext?: HarnessCardRecord;
  executionClaimContext?: HarnessWorkerExecutionClaimContext;
}): Promise<HarnessWorkerExecutionEnvelope | null> {
  if (!input.dispatch.laneExecution) {
    return null;
  }

  const run = await input.repository.getRun(input.dispatch.runId);
  if (!run || run.tenantId !== input.tenantId || run.workflowId !== input.dispatch.workflowId) {
    throw new Error(`Unknown harness run for worker execution envelope: ${input.dispatch.runId}`);
  }
  const lane =
    input.laneContext && input.laneContext.id === input.dispatch.laneExecution.cardId
      ? input.laneContext
      : await input.repository.getCard(input.dispatch.laneExecution.cardId);
  if (!lane || lane.runId !== run.id || lane.persona === "ceo") {
    throw new Error(`Unknown harness child lane for worker execution envelope: ${input.dispatch.laneExecution.cardId}`);
  }
  const continuity = await input.repository.getCardContinuity(lane.id);
  const [cardsForRun, proposalsForRun, eventsForRun] = await Promise.all([
    input.repository.listCardsForRun(run.id),
    input.repository.listProposalsForRun(run.id),
    input.repository.listEventsForRun(run.id)
  ]);
  if (!lane.executionClaimToken || !lane.executionClaimedAt) {
    throw new Error(`Missing harness execution claim for worker execution envelope: ${lane.id}`);
  }
  if (!input.executionClaimContext) {
    throw new Error(`Missing harness execution claim context for worker execution envelope: ${lane.id}`);
  }

  return {
    tenantId: input.tenantId,
    runId: run.id,
    workflowId: run.workflowId,
    requiredCapabilities: [...input.requiredCapabilities],
    runtimeContext: run.runtimeContext,
    executionClaim: {
      kind: input.executionClaimContext.kind,
      token: lane.executionClaimToken,
      claimedAt: lane.executionClaimedAt,
      previousClaimedAt: input.executionClaimContext.previousClaimedAt ?? null
    },
    orchestratorHandoff: buildWorkerOrchestratorHandoff({
      run,
      lane,
      continuity,
      dispatchHandoff: input.dispatch.dispatchHandoff ?? {
        kind: "initial_claim",
        kindLabel: "Initial lane claim",
        executionStage: "initial_lane_start",
        executionStageLabel: "Initial lane start"
      }
    }),
    boardContext: buildWorkerBoardContext({
      run,
      lane,
      cards: cardsForRun,
      proposals: proposalsForRun,
      events: eventsForRun
    }),
    ...(continuity
      ? {
          continuityContext: buildWorkerContinuityContext(continuity)
        }
      : {}),
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
      resumeSummaryAllowedStates: [...HARNESS_WORKER_OUTCOME_CONTRACT.resumeSummaryAllowedStates],
      postOutcomeDirectives: buildWorkerPostOutcomeDirectives({
        run,
        lane,
        cards: cardsForRun,
        proposals: proposalsForRun
      })
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

function buildWorkerBoardContext(input: {
  run: HarnessRunRecord;
  lane: HarnessCardRecord;
  cards: readonly HarnessCardRecord[];
  proposals: readonly HarnessSubCardProposal[];
  events: readonly HarnessCardEventRecord[];
}): HarnessWorkerBoardContext {
  const parentLane =
    input.lane.parentCardId
      ? input.cards.find((card) => card.id === input.lane.parentCardId) ?? null
      : null;
  const siblingLanes = input.cards
    .filter((card) =>
      card.id !== input.lane.id
      && card.persona !== "ceo"
      && card.parentCardId === input.lane.parentCardId
      && (card.state === "working" || card.state === "approved" || card.state === "waiting" || card.state === "blocked")
    )
    .sort(compareWorkerBoardContextLanes)
    .map((card) => ({
      cardId: card.id,
      persona: card.persona,
      title: card.title,
      deliverableType: card.deliverableType,
      state: card.state
    }));

  const persistedAttention = deriveCurrentHarnessAttentionState(input.events);
  const derivedAttention =
    persistedAttention
    ?? (() => {
      const action = determineHarnessPostOutcomeAction({
        runState: input.run.state,
        fallbackCardId: input.lane.id,
        nextDispatchCard: null,
        cards: input.cards,
        proposals: input.proposals
      });
      if (!action || action.kind === "dispatch_next_lane") {
        return null;
      }
      return {
        action,
        requestedAt: input.run.updatedAt,
        snapshot: buildWorkerDerivedAttentionSnapshot({ action, cards: input.cards })
      };
    })();

  return {
    runState: input.run.state,
    activeAttention: derivedAttention
      ? {
          actionKind: derivedAttention.action.kind,
          summary: describeWorkerBoardAttentionSummary(derivedAttention.action, derivedAttention.snapshot),
          ...(derivedAttention.snapshot.targetCardId ? { targetCardId: derivedAttention.snapshot.targetCardId } : {}),
          ...(derivedAttention.snapshot.targetPersona ? { targetPersona: derivedAttention.snapshot.targetPersona } : {})
        }
      : null,
    parentLane: parentLane
      ? {
          cardId: parentLane.id,
          persona: parentLane.persona,
          title: parentLane.title,
          deliverableType: parentLane.deliverableType,
          state: parentLane.state
        }
      : null,
    siblingLanes
  };
}

function buildWorkerOrchestratorHandoff(input: {
  run: HarnessRunRecord;
  lane: HarnessCardRecord;
  continuity: HarnessCardContinuityRecord | null;
  dispatchHandoff: HarnessWorkerDispatchHandoff;
}): HarnessWorkerOrchestratorHandoff {
  return {
    orchestratorPersona: input.run.orchestratorPersona,
    dispatchReason: describeWorkerDispatchReason(input.dispatchHandoff),
    scopeGuard:
      "Stay inside this lane only. Do not open new lanes, widen package scope, or assume new governance approval beyond this execution handoff.",
    completionRule:
      "Return exactly one bounded lane outcome: done only when this lane is complete, waiting when an explicit resume is needed, blocked when a prerequisite is missing, or cancelled when the lane should end without completion.",
    resumeDirective: input.continuity?.continuitySummary ?? createActiveResumeSummary(input.lane)
  };
}

function buildWorkerPostOutcomeDirectives(input: {
  run: HarnessRunRecord;
  lane: HarnessCardRecord;
  cards: readonly HarnessCardRecord[];
  proposals: readonly HarnessSubCardProposal[];
}): HarnessWorkerPostOutcomeDirective[] {
  return HARNESS_WORKER_OUTCOME_CONTRACT.allowedStates.map((outcomeState) =>
    deriveWorkerPostOutcomeDirective({
      run: input.run,
      lane: input.lane,
      cards: input.cards,
      proposals: input.proposals,
      outcomeState
    })
  );
}

function deriveWorkerPostOutcomeDirective(input: {
  run: HarnessRunRecord;
  lane: HarnessCardRecord;
  cards: readonly HarnessCardRecord[];
  proposals: readonly HarnessSubCardProposal[];
  outcomeState: Extract<HarnessCardState, "waiting" | "done" | "blocked" | "cancelled">;
}): HarnessWorkerPostOutcomeDirective {
  const simulatedCards = input.cards.map((card) => (
    card.id === input.lane.id
      ? {
          ...card,
          state: input.outcomeState
        }
      : card
  ));
  const runState = deriveHarnessRunState({
    run: input.run,
    cards: simulatedCards,
    proposals: input.proposals
  });
  const nextLane =
    NON_EXECUTABLE_RUN_STATES.has(runState)
      ? null
      : selectNextActionableLane(simulatedCards);
  const action = determineHarnessPostOutcomeAction({
    runState,
    fallbackCardId: input.lane.id,
    nextDispatchCard: nextLane
      ? {
          cardId: nextLane.id,
          persona: nextLane.persona
        }
      : null,
    cards: simulatedCards,
    proposals: input.proposals
  });
  const targetCard =
    action && "cardId" in action
      ? simulatedCards.find((card) => card.id === action.cardId) ?? null
      : null;

  return {
    outcomeState: input.outcomeState,
    runState,
    actionKind: action?.kind ?? "none",
    summary: describeWorkerPostOutcomeDirectiveSummary({
      currentLaneId: input.lane.id,
      outcomeState: input.outcomeState,
      action,
      targetCard
    }),
    ...("cardId" in (action ?? {})
      ? { targetCardId: (action as Extract<HarnessPostOutcomeAction, { cardId: string }>).cardId }
      : action?.kind === "queue_ceo_review" && action.nextCardId
        ? { targetCardId: action.nextCardId }
        : {}),
    ...("persona" in (action ?? {}) ? { targetPersona: (action as Extract<HarnessPostOutcomeAction, { persona: string }>).persona } : {}),
    ...(action?.kind === "queue_ceo_review" ? { reason: action.reason } : {})
  };
}

function describeWorkerPostOutcomeDirectiveSummary(input: {
  currentLaneId: string;
  outcomeState: Extract<HarnessCardState, "waiting" | "done" | "blocked" | "cancelled">;
  action: HarnessPostOutcomeAction | null;
  targetCard: HarnessCardRecord | null;
}): string {
  if (!input.action) {
    return `If this lane ends ${input.outcomeState}, no automatic post-outcome action will be scheduled.`;
  }

  switch (input.action.kind) {
    case "dispatch_next_lane":
      return `If this lane ends ${input.outcomeState}, the next bounded handoff will dispatch ${input.action.persona.toUpperCase()} on card ${input.action.cardId}.`;
    case "queue_ceo_review":
      return `If this lane ends ${input.outcomeState}, the board will queue CEO review (${humanizePostOutcomeReason(input.action.reason)}).`;
    case "await_lane_resume":
      return input.action.cardId === input.currentLaneId
        ? `If this lane ends ${input.outcomeState}, the board will require an explicit resume decision on this lane.`
        : `If this lane ends ${input.outcomeState}, the board will require an explicit resume decision on ${input.targetCard?.persona?.toUpperCase() ?? "the target"} card ${input.action.cardId}.`;
    case "await_unblock":
      return input.action.cardId === input.currentLaneId
        ? `If this lane ends ${input.outcomeState}, the board will require an explicit unblock decision on this lane.`
        : `If this lane ends ${input.outcomeState}, the board will require an explicit unblock decision on ${input.targetCard?.persona?.toUpperCase() ?? "the target"} card ${input.action.cardId}.`;
  }
}

function describeWorkerDispatchReason(dispatchHandoff: HarnessWorkerDispatchHandoff): string {
  if (dispatchHandoff.kind === "initial_claim") {
    return "The CEO approved this lane for its next bounded execution step.";
  }

  const triggeredByPersona = dispatchHandoff.triggeredByPersona.toUpperCase();
  const outcomeState = dispatchHandoff.triggeredByOutcomeState.replaceAll("_", " ");
  return dispatchHandoff.triggeredByResultSummary
    ? `${triggeredByPersona} finished a ${outcomeState} lane, so the CEO handed this next bounded step forward: ${dispatchHandoff.triggeredByResultSummary}`
    : `${triggeredByPersona} finished a ${outcomeState} lane, so the CEO handed this next bounded step forward.`;
}

function buildWorkerDerivedAttentionSnapshot(input: {
  action: Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>;
  cards: readonly HarnessCardRecord[];
}): HarnessAttentionSnapshot {
  const targetCardId =
    "cardId" in input.action
      ? input.action.cardId
      : input.action.kind === "queue_ceo_review"
        ? input.action.nextCardId ?? null
        : null;
  const targetCard =
    targetCardId
      ? input.cards.find((card) => card.id === targetCardId) ?? null
      : null;
  const described = describeHarnessPostOutcomeActionKind(input.action);

  return {
    statusLabel: described.statusLabel,
    summary: described.summary,
    ...(described.reasonLabel ? { reasonLabel: described.reasonLabel } : {}),
    ...(targetCardId ? { targetCardId } : {}),
    ...(targetCard?.persona ? { targetPersona: targetCard.persona } : {}),
    ...(targetCard?.title ? { targetTitle: targetCard.title } : {})
  };
}

function describeWorkerBoardAttentionSummary(
  action: Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>,
  snapshot: HarnessAttentionSnapshot
): string {
  if (snapshot.targetCardId && snapshot.targetPersona) {
    if (action.kind === "await_lane_resume") {
      return `The board is currently waiting on an explicit resume decision for ${snapshot.targetPersona.toUpperCase()} card ${snapshot.targetCardId}.`;
    }
    if (action.kind === "await_unblock") {
      return `The board is currently waiting on an explicit unblock decision for ${snapshot.targetPersona.toUpperCase()} card ${snapshot.targetCardId}.`;
    }
  }
  return snapshot.summary;
}

function compareWorkerBoardContextLanes(left: HarnessCardRecord, right: HarnessCardRecord): number {
  const priority = (card: HarnessCardRecord) => {
    switch (card.state) {
      case "working":
        return 0;
      case "approved":
        return 1;
      case "waiting":
        return 2;
      case "blocked":
        return 3;
      default:
        return 4;
    }
  };

  const priorityDelta = priority(left) - priority(right);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }
  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt.localeCompare(right.updatedAt);
  }
  return left.createdAt.localeCompare(right.createdAt);
}

function buildIgnoredOutcomeEvent(input: {
  cardId: string;
  ignored: Exclude<HarnessWorkerLaneOutcome["ignored"], undefined>;
}) {
  return createHarnessCardEventRecord({
    cardId: input.cardId,
    eventKind: "execution_outcome_ignored",
    payload: { ...input.ignored }
  });
}

function buildCommittedOutcomeEvent(input: {
  cardId: string;
  outcomeState: Extract<HarnessCardState, "waiting" | "done" | "blocked" | "cancelled">;
  runState: HarnessRunRecord["state"];
  attentionTransitionKind: HarnessWorkerLaneAttentionTransition["kind"];
  postOutcomeAction?: HarnessPostOutcomeAction;
  latestResultSummary?: string | null;
  continuitySummary?: string | null;
  requiredArtifactName?: string | null;
  nextDispatch?: HarnessWorkerDispatch;
}) {
  return createHarnessCardEventRecord({
    cardId: input.cardId,
    eventKind: "execution_outcome_committed",
    payload: {
      outcomeState: input.outcomeState,
      runState: input.runState,
      attentionTransitionKind: input.attentionTransitionKind,
      ...(input.postOutcomeAction
        ? {
            postOutcomeActionKind: input.postOutcomeAction.kind,
            ...(input.postOutcomeAction.kind === "queue_ceo_review"
              ? { postOutcomeReason: input.postOutcomeAction.reason }
              : {}),
            ...("cardId" in input.postOutcomeAction ? { targetCardId: input.postOutcomeAction.cardId } : {}),
            ...("persona" in input.postOutcomeAction ? { targetPersona: input.postOutcomeAction.persona } : {})
          }
        : {}),
      ...(input.nextDispatch?.laneExecution
        ? {
            nextDispatchCardId: input.nextDispatch.laneExecution.cardId,
            nextDispatchPersona: input.nextDispatch.laneExecution.persona
          }
        : {}),
      ...(input.latestResultSummary ? { resultSummary: input.latestResultSummary } : {}),
      ...(input.continuitySummary ? { continuitySummary: input.continuitySummary } : {}),
      ...(input.requiredArtifactName ? { requiredArtifactName: input.requiredArtifactName } : {})
    }
  });
}

function buildExecutionDispatchedEvent(input: {
  cardId: string;
  dispatchHandoff: HarnessWorkerDispatchHandoff;
}) {
  return createHarnessCardEventRecord({
    cardId: input.cardId,
    eventKind: "execution_dispatched",
    payload:
      input.dispatchHandoff.kind === "follow_on_dispatch"
        ? {
            kind: input.dispatchHandoff.kind,
            kindLabel: input.dispatchHandoff.kindLabel,
            executionStage: input.dispatchHandoff.executionStage,
            executionStageLabel: input.dispatchHandoff.executionStageLabel,
            reactivatedRun: input.dispatchHandoff.reactivatedRun,
            triggeredByCardId: input.dispatchHandoff.triggeredByCardId,
            triggeredByPersona: input.dispatchHandoff.triggeredByPersona,
            triggeredByOutcomeState: input.dispatchHandoff.triggeredByOutcomeState,
            ...(input.dispatchHandoff.triggeredByResultSummary
              ? { triggeredByResultSummary: input.dispatchHandoff.triggeredByResultSummary }
              : {})
          }
        : {
            kind: input.dispatchHandoff.kind,
            kindLabel: input.dispatchHandoff.kindLabel,
            executionStage: input.dispatchHandoff.executionStage,
            executionStageLabel: input.dispatchHandoff.executionStageLabel
          }
  });
}

function buildWorkerContinuityContext(
  continuity: HarnessCardContinuityRecord
): HarnessWorkerContinuityContext {
  const absorbedWorkTrail = continuity.absorbedWorkItems.map((item) => parseContinuityAbsorbedWorkItem(item));
  return {
    source: continuity.continuitySource,
    summary: continuity.continuitySummary,
    latestResultSummary: continuity.latestResultSummary,
    absorbedWorkCount: absorbedWorkTrail.length,
    ...(absorbedWorkTrail.length > 0
      ? {
          latestAbsorbedWork: absorbedWorkTrail[absorbedWorkTrail.length - 1]!,
          absorbedWorkTrail
        }
      : {
          absorbedWorkTrail
        })
  };
}

async function claimLaneForExecution(input: {
  repository: HarnessDispatchRepository;
  lane: HarnessCardRecord;
}): Promise<ClaimedHarnessLane | null> {
  if (input.lane.state === "working") {
    if (input.lane.executionClaimToken && input.lane.executionClaimedAt) {
      return {
        lane: input.lane,
        claimKind: "existing_working_claim",
        previousClaimedAt: input.lane.executionClaimedAt
      };
    }
    const refreshedLane = await input.repository.refreshCardExecutionClaim({
      cardId: input.lane.id,
      expectedState: "working"
    });
    return refreshedLane
      ? {
          lane: refreshedLane,
          claimKind: "working_claim_refresh",
          previousClaimedAt: input.lane.executionClaimedAt
        }
      : null;
  }
  if (input.lane.state !== "approved") {
    return null;
  }
  const claimedLane = await input.repository.claimCardForExecution({
    cardId: input.lane.id,
    expectedState: "approved"
  });
  return claimedLane
    ? {
        lane: claimedLane,
        claimKind: "approved_claim",
        previousClaimedAt: input.lane.executionClaimedAt
      }
    : null;
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
  claimKind: ClaimedHarnessLane["claimKind"];
  previousClaimedAt: string | null;
  previousLaneState: HarnessCardRecord["state"];
  dispatchHandoff: HarnessWorkerDispatchHandoff;
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
  await input.repository.insertEvent(
    buildExecutionDispatchedEvent({
      cardId: input.claimedLane.id,
      dispatchHandoff: input.dispatchHandoff
    })
  );

  if (input.claimKind !== "existing_working_claim") {
    await input.repository.insertEvent(
      createHarnessCardEventRecord({
        cardId: input.claimedLane.id,
        eventKind: input.claimKind === "working_claim_refresh" ? "execution_claim_refreshed" : "execution_claimed",
        payload: {
          claimKind: input.claimKind,
          claimedAt: input.claimedLane.executionClaimedAt,
          previousClaimedAt: input.previousClaimedAt
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
        ...(input.action.completedCardId ? { completedCardId: input.action.completedCardId } : {}),
        ...(input.action.nextCardId ? { nextCardId: input.action.nextCardId } : {}),
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
        ...(input.action.completedCardId ? { completedCardId: input.action.completedCardId } : {}),
        ...(input.action.nextCardId ? { nextCardId: input.action.nextCardId } : {}),
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
  const nextCardId = "nextCardId" in input.action ? input.action.nextCardId : undefined;
  if (input.action.kind === "await_lane_resume" || input.action.kind === "await_unblock") {
    const targetCardId = input.action.cardId;
    targetCard = input.cards.find((card) => card.id === targetCardId) ?? null;
  } else if (input.action.kind === "queue_ceo_review" && nextCardId) {
    targetCard = input.cards.find((card) => card.id === nextCardId) ?? null;
  }
  const continuitySummary =
    targetCard ? input.continuity.find((record) => record.cardId === targetCard.id)?.continuitySummary ?? null : null;

  return {
    statusLabel: described.statusLabel,
    summary:
      input.action.kind === "queue_ceo_review"
        ? described.summary
        : continuitySummary ?? described.summary,
    ...(described.reasonLabel ? { reasonLabel: described.reasonLabel } : {}),
    ...(input.action.kind === "queue_ceo_review" && !targetCard ? { targetPersona: "ceo" } : {}),
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
