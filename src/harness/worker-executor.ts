import type { HarnessRepository } from "./repository.js";
import { createHarnessRuntime } from "./runtime.js";
import type { HarnessCardRecord } from "./types.js";

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
  "getRun" | "listCardsForRun" | "listProposalsForRun" | "listCardContinuityForRun" | "claimCardForExecution"
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
}): Promise<HarnessWorkerDispatch> {
  const run = await input.repository.getRun(input.runId);
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
    input.repository.listCardsForRun(run.id),
    input.repository.listProposalsForRun(run.id),
    input.repository.listCardContinuityForRun(run.id)
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
    repository: input.repository,
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

  const resumeFocus = runtime.getResumeFocus(claimedLane.id);
  const laneContinuity = continuity.find((record) => record.cardId === claimedLane.id) ?? null;

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
      ...(laneContinuity?.latestResultSummary ? { latestResultSummary: laneContinuity.latestResultSummary } : {})
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
