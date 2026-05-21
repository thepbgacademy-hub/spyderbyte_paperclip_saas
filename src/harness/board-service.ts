import { ApiAuthError, type ApiSession } from "../api/dashboard-api.js";
import type { HarnessCardEventRecord, HarnessCardRecord, HarnessRunRecord } from "./types.js";
import { createHarnessCardEventRecord, type HarnessCardState } from "./types.js";
import { transitionHarnessCard, transitionHarnessRun } from "./state-machine.js";
import { createHarnessRuntime } from "./runtime.js";
import type { HarnessRepository } from "./repository.js";
import type { WealthFactoryWorkflowDefinition } from "../wealthfactory/workflow-registry.js";
import {
  ActivePackageInstallRequiredError,
  TenantMembershipRequiredError
} from "../db/supabase-repositories.js";

export type HarnessBoardActivityItem = {
  id: string;
  label: string;
  timestampLabel: string;
};

export type HarnessBoardDetailSection = {
  id: string;
  title: string;
  body: string;
};

export type HarnessBoardCardView = {
  id: string;
  persona: string;
  title: string;
  summary: string;
  lane: string;
  statusLabel: string;
  priorityLabel: string;
  deliverableLabel: string;
  updatedAtLabel: string;
  outcome: string;
  focusPoints: string[];
  activity: HarnessBoardActivityItem[];
  detailSections: HarnessBoardDetailSection[];
};

export type HarnessBoardColumnView = {
  id: string;
  title: string;
  description: string;
  cardIds: string[];
};

export type HarnessBoardResponse = {
  runId: string;
  workflowId: string;
  packageId: string;
  columns: HarnessBoardColumnView[];
  cards: HarnessBoardCardView[];
};

type HarnessWorkflowRegistry = {
  listHarnessEligibleWorkflowIds(): string[];
  getDefinition(publicWorkflowId: string): WealthFactoryWorkflowDefinition;
};

export function createHarnessBoardService(options: {
  authenticate(input: { authorization: string; cookie?: string }): Promise<ApiSession | null>;
  requireTenantMember(input: { tenantId: string; userId: string }): Promise<void>;
  requireActivePackageInstall(input: { tenantId: string; packageId: string }): Promise<void>;
  repository: HarnessRepository;
  workflowRegistry: HarnessWorkflowRegistry;
  runAtomically?<T>(work: (repository: HarnessRepository) => Promise<T>): Promise<T>;
}) {
  const runtime = createHarnessRuntime();

  return {
    async listBoardState(request: { authorization: string; cookie?: string }): Promise<HarnessBoardResponse> {
      const session = await options.authenticate({
        authorization: request.authorization,
        ...(request.cookie ? { cookie: request.cookie } : {})
      });
      if (!session) {
        throw new ApiAuthError();
      }

      const workflowId = options.workflowRegistry.listHarnessEligibleWorkflowIds()[0];
      if (!workflowId) {
        throw new Error("Harness workflow is not enabled");
      }

      const workflowDefinition = options.workflowRegistry.getDefinition(workflowId);
      try {
        await options.requireTenantMember({ tenantId: session.tenantId, userId: session.userId });
        await options.requireActivePackageInstall({
          tenantId: session.tenantId,
          packageId: workflowDefinition.packageId
        });
      } catch (error) {
        if (
          error instanceof TenantMembershipRequiredError ||
          error instanceof ActivePackageInstallRequiredError
        ) {
          throw new ApiAuthError();
        }

        throw error;
      }

      const run =
        (await options.repository.findLatestRunForTenantWorkflow({
          tenantId: session.tenantId,
          workflowId
        })) ??
        (await ensureSeededHarnessRun({
          repository: options.repository,
          runtime,
          tenantId: session.tenantId,
          workflowDefinition,
          ...(options.runAtomically ? { runAtomically: options.runAtomically } : {})
        }));

      const [cards, events] = await Promise.all([
        options.repository.listCardsForRun(run.id),
        options.repository.listEventsForRun(run.id)
      ]);

      return buildHarnessBoardResponse({ run, cards, events });
    }
  };
}

async function ensureSeededHarnessRun(input: {
  repository: HarnessRepository;
  runAtomically?<T>(work: (repository: HarnessRepository) => Promise<T>): Promise<T>;
  runtime: ReturnType<typeof createHarnessRuntime>;
  tenantId: string;
  workflowDefinition: WealthFactoryWorkflowDefinition;
}): Promise<HarnessRunRecord> {
  const seedWork = async (repository: HarnessRepository) => {
    const existing = await repository.findLatestRunForTenantWorkflow({
      tenantId: input.tenantId,
      workflowId: input.workflowDefinition.publicId
    });
    if (existing) {
      return existing;
    }

    return seedHarnessRun({
      repository,
      runtime: input.runtime,
      tenantId: input.tenantId,
      workflowDefinition: input.workflowDefinition
    });
  };

  try {
    if (input.runAtomically) {
      return await input.runAtomically(seedWork);
    }

    return await seedWork(input.repository);
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      const existing = await input.repository.findLatestRunForTenantWorkflow({
        tenantId: input.tenantId,
        workflowId: input.workflowDefinition.publicId
      });
      if (existing) {
        return existing;
      }
    }

    throw error;
  }
}

async function seedHarnessRun(input: {
  repository: HarnessRepository;
  runtime: ReturnType<typeof createHarnessRuntime>;
  tenantId: string;
  workflowDefinition: WealthFactoryWorkflowDefinition;
}): Promise<HarnessRunRecord> {
  const session = input.runtime.startRun({
    tenantId: input.tenantId,
    workflowId: input.workflowDefinition.publicId,
    packageId: input.workflowDefinition.packageId,
    runtimeContext: {
      providerKind: "openai_api",
      credentialLabel: "Connected provider"
    }
  });

  const run = transitionHarnessRun(session.run, "active");
  const ceoCard = session.ceoCard;
  const cfoCard = advanceCardState(
    input.runtime.createApprovedChildCard(run.id, {
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    }),
    "working"
  );
  const cooCard = advanceCardState(
    input.runtime.createApprovedChildCard(run.id, {
      persona: "coo",
      title: "Prepare the fulfillment handoff",
      deliverableType: "ops_handoff"
    }),
    "done"
  );
  const cards = [ceoCard, cfoCard, cooCard];

  await input.repository.insertRun(run);
  for (const card of cards) {
    await input.repository.insertCard(card);
    for (const event of createBootstrapEvents(card)) {
      await input.repository.insertEvent(event);
    }
  }

  return run;
}

function advanceCardState(card: HarnessCardRecord, targetState: HarnessCardState): HarnessCardRecord {
  if (card.state === targetState) {
    return card;
  }

  const pathByState: Partial<Record<HarnessCardState, HarnessCardState[]>> = {
    working: ["working"],
    waiting: ["working", "waiting"],
    blocked: ["blocked"],
    done: ["working", "done"]
  };
  const path = pathByState[targetState] ?? [];

  return path.reduce((current, nextState) => transitionHarnessCard(current, nextState), card);
}

function createBootstrapEvents(card: HarnessCardRecord): HarnessCardEventRecord[] {
  const events = [
    createHarnessCardEventRecord({
      cardId: card.id,
      eventKind: "created",
      payload: { title: card.title, persona: card.persona, state: card.state }
    })
  ];

  if (card.state !== "queued") {
    events.push(
      createHarnessCardEventRecord({
        cardId: card.id,
        eventKind: "state_changed",
        payload: { to: card.state }
      })
    );
  }

  return events;
}

function buildHarnessBoardResponse(input: {
  run: HarnessRunRecord;
  cards: readonly HarnessCardRecord[];
  events: readonly HarnessCardEventRecord[];
}): HarnessBoardResponse {
  const activityByCardId = new Map<string, HarnessBoardActivityItem[]>();
  for (const event of input.events) {
    const items = activityByCardId.get(event.cardId) ?? [];
    activityByCardId.set(event.cardId, [...items, toBoardActivityItem(event)]);
  }

  const cards = input.cards.map((card) =>
    toBoardCardView({
      card,
      activity: activityByCardId.get(card.id) ?? []
    })
  );

  const columns = createBoardColumns(cards);

  return {
    runId: input.run.id,
    workflowId: input.run.workflowId,
    packageId: input.run.packageId,
    columns,
    cards
  };
}

function toBoardActivityItem(event: HarnessCardEventRecord): HarnessBoardActivityItem {
  const payloadTitle = readOptionalString(event.payload.title);
  const payloadState = readOptionalString(event.payload.to) ?? readOptionalString(event.payload.state);
  const labelByKind: Record<HarnessCardEventRecord["eventKind"], string> = {
    created: `${payloadTitle ?? "Card"} was opened for this persona lane.`,
    state_changed: `Lane status moved to ${humanizeLabel(payloadState ?? "updated")}.`,
    comment_added: "A new progress note was added to this lane.",
    subcard_proposed: "A supporting sub-card was proposed for CEO review.",
    result_recorded: "A new outcome snapshot was recorded for this lane."
  };

  return {
    id: event.id,
    label: labelByKind[event.eventKind],
    timestampLabel: formatBoardTimestamp(event.createdAt)
  };
}

function toBoardCardView(input: { card: HarnessCardRecord; activity: readonly HarnessBoardActivityItem[] }): HarnessBoardCardView {
  const personaLabel = input.card.persona.toUpperCase();
  const lane = mapCardStateToLane(input.card.state);
  const deliverableLabel = humanizeDeliverableType(input.card.deliverableType);
  const activity = input.activity.length > 0 ? [...input.activity] : [defaultActivityForCard(input.card)];

  return {
    id: input.card.id,
    persona: personaLabel,
    title: input.card.title,
    summary: `${personaLabel} is moving this deliverable forward inside a bounded assignment lane.`,
    lane,
    statusLabel: humanizeLabel(input.card.state),
    priorityLabel: input.card.persona === "ceo" ? "High priority" : lane === "done" ? "Ready" : "Active",
    deliverableLabel,
    updatedAtLabel: `Updated ${formatBoardTimestamp(input.card.updatedAt)}`,
    outcome: describeCardOutcome(input.card),
    focusPoints: [
      "Keep the tenant-facing update concise",
      "Advance the deliverable without backend noise",
      "Respect the package boundary before expanding scope"
    ],
    activity,
    detailSections: [
      {
        id: "snapshot",
        title: "Snapshot",
        body: `${personaLabel} owns a deliverable-focused card that can resume from persisted state after interruption.`
      }
    ]
  };
}

function createBoardColumns(cards: readonly HarnessBoardCardView[]): HarnessBoardColumnView[] {
  const laneOrder = [
    { id: "planning", title: "Planning", description: "Work being shaped by the orchestrator." },
    { id: "working", title: "Working", description: "Active persona lanes moving the run forward." },
    { id: "waiting", title: "Waiting", description: "Lanes paused on a dependency or decision." },
    { id: "blocked", title: "Blocked", description: "Visible blockers that need resolution before progress continues." },
    { id: "done", title: "Done", description: "Completed outputs ready for review." }
  ] as const;

  return laneOrder.map((lane) => ({
    id: lane.id,
    title: lane.title,
    description: lane.description,
    cardIds: cards.filter((card) => card.lane === lane.id).map((card) => card.id)
  }));
}

function mapCardStateToLane(state: HarnessCardRecord["state"]): string {
  switch (state) {
    case "queued":
    case "planning":
    case "approved":
      return "planning";
    case "working":
      return "working";
    case "waiting":
      return "waiting";
    case "blocked":
    case "cancelled":
      return "blocked";
    case "done":
      return "done";
    default:
      return "planning";
  }
}

function describeCardOutcome(card: HarnessCardRecord): string {
  const deliverable = humanizeDeliverableType(card.deliverableType).toLowerCase();
  if (card.state === "done") {
    return `This ${deliverable} is packaged and ready for the tenant-facing next step.`;
  }
  if (card.state === "working") {
    return `This ${deliverable} is actively being advanced in the current persona lane.`;
  }
  if (card.state === "waiting") {
    return `This ${deliverable} is paused on a dependency while preserving its bounded scope.`;
  }
  if (card.state === "blocked" || card.state === "cancelled") {
    return `This ${deliverable} is blocked and needs a deliberate unblock before more work starts.`;
  }
  return `This ${deliverable} is being shaped into the next clean business-facing move.`;
}

function defaultActivityForCard(card: HarnessCardRecord): HarnessBoardActivityItem {
  return {
    id: `${card.id}-default-activity`,
    label: `${card.persona.toUpperCase()} is maintaining this lane inside the approved workflow boundary.`,
    timestampLabel: formatBoardTimestamp(card.updatedAt)
  };
}

function humanizeDeliverableType(value: string): string {
  return humanizeLabel(value.replace(/_/gu, " "));
}

function humanizeLabel(value: string): string {
  return value
    .split(/[\s_-]+/u)
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function formatBoardTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "recently";
  }

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC"
  });
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as { code?: string; message?: string };
  return (
    record.code === "23505" ||
    (typeof record.message === "string" && record.message.includes("harness_runs_tenant_workflow_unique_idx"))
  );
}
