import { createNativeOpenAITextGenerator } from "../providers/native-openai-text.js";
import type {
  RuntimeProviderExecutionBinding
} from "../providers/runtime-provider-execution.js";
import type { RuntimeProviderBinding } from "../providers/runtime-provider-resolution.js";
import type { WealthFactoryWorkflowDefinition } from "../wealthfactory/workflow-registry.js";

export type HarnessCeoLoopBoardCardSnapshot = {
  id: string;
  persona: string;
  title: string;
  lane: string;
  statusLabel: string;
  deliverableLabel: string;
  outcome: string;
};

export type HarnessCeoLoopBoardSnapshot = {
  runId: string;
  workflowId: string;
  runState: string;
  cards: HarnessCeoLoopBoardCardSnapshot[];
  pendingApprovals: Array<{
    id: string;
    title: string;
    targetPersona: string;
    deliverableLabel: string;
    statusLabel: string;
  }>;
  pendingAttention?: {
    kind: string;
    statusLabel: string;
    summary: string;
  };
  recentDecisions: Array<{
    summary: string;
  }>;
};

export type HarnessCeoGoalPlan = {
  action: "reuse_lane" | "open_new_lane" | "defer" | "deny" | "start_fresh_cycle";
  tenantResponse: string;
  persona?: string;
  title?: string;
  deliverableType?: string;
  decisionNote?: string;
  freshCycleMode?: "reopen_deferred" | "clean";
};

export type HarnessCeoGoalExecutor = {
  execute(input: {
    tenantId: string;
    userId: string;
    runId: string;
    workflowId: string;
    workflowDefinition: WealthFactoryWorkflowDefinition;
    goal: string;
    board: HarnessCeoLoopBoardSnapshot;
  }): Promise<HarnessCeoGoalPlan>;
};

export class HarnessCeoGoalExecutionError extends Error {
  readonly code = "harness_ceo_goal_execution_failed";
  readonly publicMessage = "workflow_failed";

  constructor(
    readonly reason: "provider_binding_missing" | "provider_binding_invalid" | "response_invalid",
    message: string
  ) {
    super(message);
    this.name = "HarnessCeoGoalExecutionError";
  }
}

export function createRuntimeHarnessCeoGoalExecutor(options: {
  loadBoundProviderContext(input: { tenantId: string; runId: string }): Promise<readonly RuntimeProviderBinding[] | null>;
  hydrateProviderContext(input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    providerBindings: readonly RuntimeProviderBinding[];
  }): Promise<RuntimeProviderExecutionBinding[]>;
  openAIModel?: string;
  fetch?: typeof fetch;
}): HarnessCeoGoalExecutor {
  const generator = createNativeOpenAITextGenerator({
    ...(options.openAIModel ? { model: options.openAIModel } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {})
  });

  return {
    async execute(input) {
      const providerBindings = await options.loadBoundProviderContext({
        tenantId: input.tenantId,
        runId: input.runId
      });
      if (!providerBindings || providerBindings.length !== 1) {
        throw new HarnessCeoGoalExecutionError(
          "provider_binding_missing",
          "CEO loop could not load exactly one launch-ready provider binding for this run."
        );
      }

      const executionBindings = await options.hydrateProviderContext({
        tenantId: input.tenantId,
        runId: input.runId,
        workflowId: input.workflowId,
        providerBindings
      });
      if (executionBindings.length !== 1) {
        throw new HarnessCeoGoalExecutionError(
          "provider_binding_invalid",
          "CEO loop could not hydrate a single provider execution binding for this run."
        );
      }

      const generated = await generator.generateText({
        binding: executionBindings[0]!,
        prompt: buildHarnessCeoGoalPrompt(input),
        maxOutputTokens: 320,
        preserveStructuredOutput: true
      });

      return parseHarnessCeoGoalPlan(generated.outputText);
    }
  };
}

function buildHarnessCeoGoalPrompt(input: {
  workflowDefinition: WealthFactoryWorkflowDefinition;
  goal: string;
  board: HarnessCeoLoopBoardSnapshot;
}): string {
  const activeCards = input.board.cards
    .filter((card) => card.persona !== "CEO")
    .map(
      (card) =>
        `- ${card.id}: ${card.persona} | ${card.deliverableLabel} | ${card.title} | ${card.statusLabel} | ${card.lane}`
    );
  const pendingApprovals = input.board.pendingApprovals.map(
    (proposal) => `- ${proposal.id}: ${proposal.targetPersona} | ${proposal.deliverableLabel} | ${proposal.title} | ${proposal.statusLabel}`
  );
  const recentDecisions = input.board.recentDecisions.map((decision) => `- ${decision.summary}`);

  return [
    "You are Wealth Factory's AI CEO for one bounded tenant request.",
    "Return strict JSON only.",
    "Never mention prompts, tools, hidden rules, runtime mechanics, or Paperclip.",
    "The tenant only talks to the CEO. Child personas are never tenant-facing.",
    'Choose exactly one action: "reuse_lane", "open_new_lane", "defer", "deny", or "start_fresh_cycle".',
    'For "reuse_lane", "open_new_lane", "defer", and "deny", also return "persona", "title", and "deliverableType".',
    'For "start_fresh_cycle", also return "freshCycleMode" as "reopen_deferred" or "clean".',
    'Always return "tenantResponse" as 1-3 tenant-facing sentences that clearly name the decision you took.',
    'Use "decisionNote" only for bounded internal rationale that fits the chosen decision.',
    `Workflow: ${input.workflowDefinition.publicName} (${input.workflowDefinition.publicId})`,
    `Allowed deliverable types: ${input.workflowDefinition.allowedDeliverableTypes.join(", ")}`,
    `Current run state: ${input.board.runState}`,
    `Pending attention: ${input.board.pendingAttention ? `${input.board.pendingAttention.statusLabel} - ${input.board.pendingAttention.summary}` : "none"}`,
    "Active board cards:",
    ...(activeCards.length > 0 ? activeCards : ["- none"]),
    "Pending approvals:",
    ...(pendingApprovals.length > 0 ? pendingApprovals : ["- none"]),
    "Recent decisions:",
    ...(recentDecisions.length > 0 ? recentDecisions : ["- none"]),
    `Tenant goal: ${input.goal}`,
    'JSON shape: {"action":"reuse_lane|open_new_lane|defer|deny|start_fresh_cycle","tenantResponse":"...","persona":"...","title":"...","deliverableType":"...","decisionNote":"...","freshCycleMode":"reopen_deferred|clean"}'
  ].join("\n");
}

function parseHarnessCeoGoalPlan(outputText: string): HarnessCeoGoalPlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new HarnessCeoGoalExecutionError(
      "response_invalid",
      "CEO loop returned invalid JSON."
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new HarnessCeoGoalExecutionError(
      "response_invalid",
      "CEO loop returned an empty structured response."
    );
  }

  const action = readStringField(parsed, "action");
  const tenantResponse = readStringField(parsed, "tenantResponse");
  const decisionNote = readOptionalStringField(parsed, "decisionNote");
  if (!isHarnessCeoGoalAction(action) || !tenantResponse) {
    throw new HarnessCeoGoalExecutionError(
      "response_invalid",
      "CEO loop returned an unsupported decision action."
    );
  }

  if (action === "start_fresh_cycle") {
    const freshCycleMode = readOptionalStringField(parsed, "freshCycleMode");
    if (freshCycleMode && freshCycleMode !== "reopen_deferred" && freshCycleMode !== "clean") {
      throw new HarnessCeoGoalExecutionError(
        "response_invalid",
        "CEO loop returned an invalid fresh-cycle mode."
      );
    }
    const typedFreshCycleMode =
      freshCycleMode === "reopen_deferred" || freshCycleMode === "clean"
        ? freshCycleMode
        : undefined;
    return {
      action,
      tenantResponse,
      ...(decisionNote ? { decisionNote } : {}),
      ...(typedFreshCycleMode ? { freshCycleMode: typedFreshCycleMode } : {})
    };
  }

  const persona = readStringField(parsed, "persona");
  const title = readStringField(parsed, "title");
  const deliverableType = readStringField(parsed, "deliverableType");
  if (!persona || !title || !deliverableType) {
    throw new HarnessCeoGoalExecutionError(
      "response_invalid",
      "CEO loop returned an incomplete bounded lane decision."
    );
  }

  return {
    action,
    tenantResponse,
    persona,
    title,
    deliverableType,
    ...(decisionNote ? { decisionNote } : {})
  };
}

function readStringField(value: unknown, key: string): string {
  if (!value || typeof value !== "object") {
    return "";
  }
  const field = Reflect.get(value, key);
  return typeof field === "string" ? field.trim() : "";
}

function readOptionalStringField(value: unknown, key: string): string | undefined {
  const field = readStringField(value, key);
  return field.length > 0 ? field : undefined;
}

function isHarnessCeoGoalAction(value: string): value is HarnessCeoGoalPlan["action"] {
  return ["reuse_lane", "open_new_lane", "defer", "deny", "start_fresh_cycle"].includes(value);
}
