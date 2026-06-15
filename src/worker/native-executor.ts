import type { HarnessWorkerExecutionEnvelope } from "../harness/worker-executor.js";
import type { RuntimeProviderExecutionBinding } from "../providers/runtime-provider-execution.js";
import { createNativeOpenAITextGenerator, NativeOpenAIExecutionError } from "../providers/native-openai-text.js";
import {
  CONNECT_FIRST_WORKFLOW_ID,
  NATIVE_DECISION_JSON_SHAPE,
  NATIVE_WORKFLOW_DEFINITIONS,
  type NativeWorkflowDefinition
} from "./native-workflow-definitions.js";
import { tryParseWorkflowDecision } from "./native-workflow-decision-parser.js";
import { buildWorkerPromptContextLines } from "./native-prompt-context.js";

type NativeDecisionState = NativeExecutionOutcome["state"];
type LaneExecution = HarnessWorkerExecutionEnvelope["laneExecution"];
type ConnectFirstInterpretation = {
  state: NativeDecisionState;
  analysis: string;
  nextAction: string;
};
type ConnectFirstValidation = {
  approved: boolean;
  reason: string;
};

export type NativeExecutionOutcome = {
  state: "waiting" | "done" | "blocked" | "cancelled";
  resultSummary?: string;
  resumeSummary?: string;
};

export type NativeExecutionInput = {
  tenantId: string;
  runId: string;
  workflowId: string;
  executionEnvelope: HarnessWorkerExecutionEnvelope;
  providerBinding: RuntimeProviderExecutionBinding;
};

export type NativeExecutor = {
  execute(input: NativeExecutionInput): Promise<NativeExecutionOutcome>;
};

export { NativeOpenAIExecutionError as NativeExecutionError };

export function createDefaultNativeExecutor(options?: {
  openAIModel?: string;
  fetch?: typeof fetch;
}): NativeExecutor {
  const openAITextGenerator = createNativeOpenAITextGenerator({
    ...(options?.openAIModel ? { model: options.openAIModel } : {}),
    ...(options?.fetch ? { fetch: options.fetch } : {})
  });

  return {
    async execute(input) {
      const workflowDefinition = NATIVE_WORKFLOW_DEFINITIONS[input.workflowId];
      if (workflowDefinition) {
        if (input.workflowId === CONNECT_FIRST_WORKFLOW_ID) {
          return executeConnectFirstMultiStep({
            workflowDefinition,
            workflowId: input.workflowId,
            executionEnvelope: input.executionEnvelope,
            providerBinding: input.providerBinding,
            generateText: openAITextGenerator.generateText
          });
        }

        const generated = await openAITextGenerator.generateText({
          binding: input.providerBinding,
          prompt: buildNativeWorkflowPrompt({
            workflowDefinition,
            workflowId: input.workflowId,
            executionEnvelope: input.executionEnvelope
          }),
          maxOutputTokens: 260,
          preserveStructuredOutput: true
        });

        return parseNativeWorkflowOutcome({
          workflowId: input.workflowId,
          outputText: generated.outputText,
          laneExecution: input.executionEnvelope.laneExecution
        });
      }

      return {
        state: "blocked",
        resumeSummary:
          `Native execution is enabled for ${input.workflowId}, but no workflow-family implementation is registered yet. ` +
          `Keep this lane blocked until a bounded native executor is added for ${input.executionEnvelope.laneExecution.persona.toUpperCase()}: ${input.executionEnvelope.laneExecution.title}.`
      };
    }
  };
}

async function executeConnectFirstMultiStep(input: {
  workflowDefinition: NativeWorkflowDefinition;
  workflowId: string;
  executionEnvelope: HarnessWorkerExecutionEnvelope;
  providerBinding: RuntimeProviderExecutionBinding;
  generateText: ReturnType<typeof createNativeOpenAITextGenerator>["generateText"];
}): Promise<NativeExecutionOutcome> {
  const interpretationResponse = await input.generateText({
    binding: input.providerBinding,
    prompt: buildConnectFirstInterpretationPrompt(input),
    maxOutputTokens: 260,
    preserveStructuredOutput: true
  });
  const interpretation = tryParseConnectFirstInterpretation(interpretationResponse.outputText);
  if (!interpretation) {
    return buildInvalidConnectFirstStageOutcome({
      workflowDefinition: input.workflowDefinition,
      laneExecution: input.executionEnvelope.laneExecution,
      stageLabel: "interpretation"
    });
  }

  const draftedDecisionResponse = await input.generateText({
    binding: input.providerBinding,
    prompt: buildConnectFirstDraftPrompt({
      ...input,
      interpretation
    }),
    maxOutputTokens: 260,
    preserveStructuredOutput: true
  });
  const draftedDecision = tryParseWorkflowDecision(draftedDecisionResponse.outputText);
  if (!draftedDecision) {
    return buildInvalidConnectFirstStageOutcome({
      workflowDefinition: input.workflowDefinition,
      laneExecution: input.executionEnvelope.laneExecution,
      stageLabel: "draft"
    });
  }
  if (draftedDecision.state !== interpretation.state) {
    return buildBlockedNativeWorkflowOutcome({
      workflowDefinition: input.workflowDefinition,
      laneExecution: input.executionEnvelope.laneExecution,
      reason:
        `Native multi-step drafting changed the lane state from ${interpretation.state} to ${draftedDecision.state}. ` +
        "Keep the lane blocked until the native multi-step state contract is repaired."
    });
  }

  const validationResponse = await input.generateText({
    binding: input.providerBinding,
    prompt: buildConnectFirstValidationPrompt({
      ...input,
      interpretation,
      draftedDecision
    }),
    maxOutputTokens: 180,
    preserveStructuredOutput: true
  });
  const validation = tryParseConnectFirstValidation(validationResponse.outputText);
  if (!validation) {
    return buildInvalidConnectFirstStageOutcome({
      workflowDefinition: input.workflowDefinition,
      laneExecution: input.executionEnvelope.laneExecution,
      stageLabel: "validation"
    });
  }
  if (!validation.approved) {
    return buildBlockedNativeWorkflowOutcome({
      workflowDefinition: input.workflowDefinition,
      laneExecution: input.executionEnvelope.laneExecution,
      reason: `Native multi-step validation rejected the drafted lane outcome: ${validation.reason}`
    });
  }

  return parseNativeWorkflowOutcome({
    workflowId: input.workflowId,
    outputText: JSON.stringify(draftedDecision),
    laneExecution: input.executionEnvelope.laneExecution
  });
}

function buildNativeWorkflowPrompt(input: {
  workflowDefinition: NativeWorkflowDefinition;
  workflowId: string;
  executionEnvelope: HarnessWorkerExecutionEnvelope;
}): string {
  const { workflowDefinition } = input;

  const lines = [
    `You are Wealth Factory's native executor for the ${workflowDefinition.familyName} family.`,
    workflowDefinition.laneDecisionLine,
    `Return strict JSON only with this shape: ${NATIVE_DECISION_JSON_SHAPE}.`,
    workflowDefinition.doneInstruction,
    workflowDefinition.waitingInstruction,
    workflowDefinition.blockedInstruction,
    workflowDefinition.cancelledInstruction,
    "Keep summary tenant-safe, concise, and specific to the lane. Do not mention Paperclip, prompts, tools, or internal runtime mechanics.",
    ...(workflowDefinition.extraGuidance ? [workflowDefinition.extraGuidance] : []),
    ...buildWorkerPromptContextLines({
      workflowId: input.workflowId,
      executionEnvelope: input.executionEnvelope
    })
  ];

  return lines.join("\n");
}

function buildConnectFirstInterpretationPrompt(input: {
  workflowDefinition: NativeWorkflowDefinition;
  workflowId: string;
  executionEnvelope: HarnessWorkerExecutionEnvelope;
}): string {
  return [
    `You are Wealth Factory's native executor for the ${input.workflowDefinition.familyName} family.`,
    "Step 1 of 3: interpret the lane.",
    input.workflowDefinition.laneDecisionLine,
    "Return strict JSON only with this shape: {\"state\":\"done|waiting|blocked|cancelled\",\"analysis\":\"...\",\"nextAction\":\"...\"}.",
    input.workflowDefinition.doneInstruction,
    input.workflowDefinition.waitingInstruction,
    input.workflowDefinition.blockedInstruction,
    input.workflowDefinition.cancelledInstruction,
    "Choose the single truthful lane state first, then explain why and the next bounded action inside this lane only.",
    "Keep analysis and nextAction tenant-safe, concise, and specific to the lane. Do not mention Paperclip, prompts, tools, or internal runtime mechanics.",
    ...buildWorkerPromptContextLines({
      workflowId: input.workflowId,
      executionEnvelope: input.executionEnvelope
    })
  ].join("\n");
}

function buildConnectFirstDraftPrompt(input: {
  workflowDefinition: NativeWorkflowDefinition;
  workflowId: string;
  executionEnvelope: HarnessWorkerExecutionEnvelope;
  interpretation: ConnectFirstInterpretation;
}): string {
  return [
    `You are Wealth Factory's native executor for the ${input.workflowDefinition.familyName} family.`,
    "Step 2 of 3: draft the lane outcome.",
    "Use the interpretation below to draft the final bounded lane outcome for this same lane only.",
    `Return strict JSON only with this shape: ${NATIVE_DECISION_JSON_SHAPE}.`,
    input.workflowDefinition.doneInstruction,
    input.workflowDefinition.waitingInstruction,
    input.workflowDefinition.blockedInstruction,
    input.workflowDefinition.cancelledInstruction,
    "Preserve the interpreted state. Do not widen scope, open new lanes, or imply governance outside this lane.",
    `Interpreted state: ${input.interpretation.state}`,
    `Interpreted analysis: ${input.interpretation.analysis}`,
    `Interpreted next action: ${input.interpretation.nextAction}`,
    ...buildWorkerPromptContextLines({
      workflowId: input.workflowId,
      executionEnvelope: input.executionEnvelope
    })
  ].join("\n");
}

function buildConnectFirstValidationPrompt(input: {
  workflowDefinition: NativeWorkflowDefinition;
  workflowId: string;
  executionEnvelope: HarnessWorkerExecutionEnvelope;
  interpretation: ConnectFirstInterpretation;
  draftedDecision: {
    state: NativeDecisionState;
    summary: string;
  };
}): string {
  return [
    `You are Wealth Factory's native executor for the ${input.workflowDefinition.familyName} family.`,
    "Step 3 of 3: validate the drafted lane outcome.",
    "Return strict JSON only with this shape: {\"approved\":true|false,\"reason\":\"...\"}.",
    "Approve only when the drafted lane outcome stays tenant-safe, reflects the same bounded lane state, and does not widen scope beyond this lane.",
    `Interpreted state: ${input.interpretation.state}`,
    `Interpreted analysis: ${input.interpretation.analysis}`,
    `Interpreted next action: ${input.interpretation.nextAction}`,
    `Drafted state: ${input.draftedDecision.state}`,
    `Drafted summary: ${input.draftedDecision.summary}`,
    ...buildWorkerPromptContextLines({
      workflowId: input.workflowId,
      executionEnvelope: input.executionEnvelope
    })
  ].join("\n");
}

function parseNativeWorkflowOutcome(input: {
  workflowId: string;
  outputText: string;
  laneExecution: LaneExecution;
}): NativeExecutionOutcome {
  const workflowDefinition = NATIVE_WORKFLOW_DEFINITIONS[input.workflowId];
  if (!workflowDefinition) {
    return buildUnknownNativeWorkflowFallback({
      workflowId: input.workflowId,
      laneExecution: input.laneExecution
    });
  }
  const parsed = tryParseWorkflowDecision(input.outputText);
  if (!parsed) {
    return {
      state: "blocked",
      resumeSummary:
        `Native execution returned an invalid ${workflowDefinition.invalidDecisionLabel} decision for ${input.laneExecution.persona.toUpperCase()}: ${input.laneExecution.title}. ` +
        "Keep this lane blocked until the native workflow decision contract is repaired."
    };
  }

  if (parsed.state === "done") {
    return {
      state: "done",
      resultSummary: formatNativeWorkflowResult({
        workflowDefinition,
        generatedResultSummary: parsed.summary,
        laneExecution: input.laneExecution
      })
    };
  }

  return {
    state: parsed.state,
    resumeSummary: formatNativeWorkflowResumeSummary({
      workflowDefinition,
      state: parsed.state,
      generatedSummary: parsed.summary,
      laneExecution: input.laneExecution
    })
  };
}

function buildInvalidConnectFirstStageOutcome(input: {
  workflowDefinition: NativeWorkflowDefinition;
  laneExecution: LaneExecution;
  stageLabel: "interpretation" | "draft" | "validation";
}): NativeExecutionOutcome {
  return buildBlockedNativeWorkflowOutcome({
    workflowDefinition: input.workflowDefinition,
    laneExecution: input.laneExecution,
    reason:
      `Native multi-step ${input.stageLabel} returned an invalid ${input.workflowDefinition.invalidDecisionLabel} decision. ` +
      "Keep this lane blocked until the native multi-step decision contract is repaired."
  });
}

function buildBlockedNativeWorkflowOutcome(input: {
  workflowDefinition: NativeWorkflowDefinition;
  laneExecution: LaneExecution;
  reason: string;
}): NativeExecutionOutcome {
  return {
    state: "blocked",
    resumeSummary: formatNativeWorkflowResumeSummary({
      workflowDefinition: input.workflowDefinition,
      state: "blocked",
      generatedSummary: input.reason,
      laneExecution: input.laneExecution
    })
  };
}

function buildUnknownNativeWorkflowFallback(input: {
  workflowId: string;
  laneExecution: LaneExecution;
}): NativeExecutionOutcome {
  return {
    state: "blocked",
    resumeSummary:
      `Native execution is enabled for ${input.workflowId}, but no workflow-family implementation is registered yet. ` +
      `Keep this lane blocked until a bounded native executor is added for ${input.laneExecution.persona.toUpperCase()}: ${input.laneExecution.title}.`
  };
}

function formatNativeWorkflowResult(input: {
  workflowDefinition: NativeWorkflowDefinition;
  generatedResultSummary: string;
  laneExecution: LaneExecution;
}): string {
  return [
    `${input.workflowDefinition.completedPrefix} ${humanizeDeliverableType(input.laneExecution.deliverableType).toLowerCase()} lane for ${input.laneExecution.persona.toUpperCase()}: ${input.laneExecution.title}.`,
    input.generatedResultSummary
  ].join(" ");
}

function formatNativeWorkflowResumeSummary(input: {
  workflowDefinition: NativeWorkflowDefinition;
  state: Exclude<NativeDecisionState, "done">;
  generatedSummary: string;
  laneExecution: LaneExecution;
}): string {
  const action =
    input.state === "waiting"
      ? "resume"
      : input.state === "blocked"
        ? "unblock"
        : "cancel";
  return [
    `${input.workflowDefinition.actionPrefix} ${humanizeDeliverableType(input.laneExecution.deliverableType).toLowerCase()} lane for ${input.laneExecution.persona.toUpperCase()}: ${input.laneExecution.title} needs an explicit ${action} action.`,
    input.generatedSummary
  ].join(" ");
}

function humanizeDeliverableType(value: string): string {
  return value
    .split(/[\s_-]+/u)
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function tryParseConnectFirstInterpretation(text: string): ConnectFirstInterpretation | null {
  try {
    const normalized = normalizeStructuredJsonObjectText(text);
    if (!normalized) {
      return null;
    }

    const parsed = JSON.parse(normalized);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const keys = Object.keys(parsed);
    if (keys.length !== 3 || !keys.includes("state") || !keys.includes("analysis") || !keys.includes("nextAction")) {
      return null;
    }

    const state = Reflect.get(parsed, "state");
    const analysis = Reflect.get(parsed, "analysis");
    const nextAction = Reflect.get(parsed, "nextAction");
    if (
      (state !== "done" && state !== "waiting" && state !== "blocked" && state !== "cancelled") ||
      typeof analysis !== "string" ||
      typeof nextAction !== "string"
    ) {
      return null;
    }

    const trimmedAnalysis = analysis.trim();
    const trimmedNextAction = nextAction.trim();
    if (!trimmedAnalysis || !trimmedNextAction) {
      return null;
    }

    return {
      state,
      analysis: trimmedAnalysis,
      nextAction: trimmedNextAction
    };
  } catch {
    return null;
  }
}

function tryParseConnectFirstValidation(text: string): ConnectFirstValidation | null {
  try {
    const normalized = normalizeStructuredJsonObjectText(text);
    if (!normalized) {
      return null;
    }

    const parsed = JSON.parse(normalized);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const keys = Object.keys(parsed);
    if (keys.length !== 2 || !keys.includes("approved") || !keys.includes("reason")) {
      return null;
    }

    const approved = Reflect.get(parsed, "approved");
    const reason = Reflect.get(parsed, "reason");
    if (typeof approved !== "boolean" || typeof reason !== "string") {
      return null;
    }

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      return null;
    }

    return {
      approved,
      reason: trimmedReason
    };
  } catch {
    return null;
  }
}

function normalizeStructuredJsonObjectText(text: string): string | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "");
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }
  return trimmed;
}
