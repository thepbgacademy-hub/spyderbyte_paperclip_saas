import type { HarnessRepository } from "./repository.js";
import { createHarnessRuntime } from "./runtime.js";
import { deriveHarnessRunState } from "./state-machine.js";
import {
  createHarnessCardContinuityRecord,
  createHarnessCardEventRecord,
  type HarnessCardContinuityRecord,
  type HarnessCardRecord,
  type HarnessRunRecord
} from "./types.js";

export type HarnessWorkerLaneExecution = {
  cardId: string;
  persona: string;
  title: string;
  deliverableType: string;
  state: HarnessCardRecord["state"];
  resumeFocus?: string;
  latestResultSummary?: string;
};

export type HarnessWorkerDispatch = {
  runId: string;
  workflowId: string;
  status: "queued" | "running";
  laneExecution: HarnessWorkerLaneExecution | null;
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

export async function buildHarnessWorkerDispatch(input: {
  repository: HarnessDispatchRepository;
  tenantId: string;
  runId: string;
  workflowId: string;
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

  const existingContinuity = input.continuity.find((record) => record.cardId === input.claimedLane.id) ?? null;
  const updatedContinuity = createHarnessCardContinuityRecord({
    cardId: input.claimedLane.id,
    runId: input.run.id,
    continuitySummary: createActiveResumeSummary(input.claimedLane),
    latestResultSummary: existingContinuity?.latestResultSummary ?? null,
    absorbedWorkItems: existingContinuity?.absorbedWorkItems ?? []
  });
  await input.repository.upsertCardContinuity(updatedContinuity);

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

function createActiveResumeSummary(card: HarnessCardRecord): string {
  return `${card.persona.toUpperCase()} should continue this active ${humanizeDeliverableType(card.deliverableType).toLowerCase()} lane: ${card.title}.`;
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
