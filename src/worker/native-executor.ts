import type { HarnessWorkerExecutionEnvelope } from "../harness/worker-executor.js";
import type { RuntimeProviderExecutionBinding } from "../providers/runtime-provider-execution.js";
import { createNativeOpenAITextGenerator, NativeOpenAIExecutionError } from "../providers/native-openai-text.js";

const CONNECT_FIRST_WORKFLOW_ID = "wf_connect_first_workflow";
const TAX_STRATEGY_WORKFLOW_ID = "wf_tax_strategy";
const PACKAGE_FOLLOWUP_WORKFLOW_ID = "wf_package_followup";

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
      if (input.workflowId === CONNECT_FIRST_WORKFLOW_ID) {
        const generated = await openAITextGenerator.generateText({
          binding: input.providerBinding,
          prompt: buildConnectFirstWorkflowPrompt({
            workflowId: input.workflowId,
            executionEnvelope: input.executionEnvelope
          }),
          maxOutputTokens: 260,
          preserveStructuredOutput: true
        });

        return parseConnectFirstWorkflowOutcome({
          outputText: generated.outputText,
          laneExecution: input.executionEnvelope.laneExecution
        });
      }

      if (input.workflowId === TAX_STRATEGY_WORKFLOW_ID) {
        const generated = await openAITextGenerator.generateText({
          binding: input.providerBinding,
          prompt: buildTaxStrategyWorkflowPrompt({
            workflowId: input.workflowId,
            executionEnvelope: input.executionEnvelope
          }),
          maxOutputTokens: 260,
          preserveStructuredOutput: true
        });

        return parseTaxStrategyWorkflowOutcome({
          outputText: generated.outputText,
          laneExecution: input.executionEnvelope.laneExecution
        });
      }

      if (input.workflowId === PACKAGE_FOLLOWUP_WORKFLOW_ID) {
        const generated = await openAITextGenerator.generateText({
          binding: input.providerBinding,
          prompt: buildPackageFollowupWorkflowPrompt({
            workflowId: input.workflowId,
            executionEnvelope: input.executionEnvelope
          }),
          maxOutputTokens: 260,
          preserveStructuredOutput: true
        });

        return parsePackageFollowupWorkflowOutcome({
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

function buildConnectFirstWorkflowPrompt(input: {
  workflowId: string;
  executionEnvelope: HarnessWorkerExecutionEnvelope;
}): string {
  const { executionEnvelope } = input;
  const continuitySummary = executionEnvelope.continuityContext?.summary ?? executionEnvelope.laneExecution.resumeFocus ?? "No continuity summary recorded.";
  const latestResultSummary = executionEnvelope.continuityContext?.latestResultSummary ?? executionEnvelope.laneExecution.latestResultSummary ?? "No prior result summary recorded.";
  const absorbedWork =
    executionEnvelope.continuityContext?.absorbedWorkTrail.map((item) => item.title).join("; ") ??
    executionEnvelope.laneExecution.absorbedWorkItems?.join("; ") ??
    "No absorbed work items recorded.";

  return [
    "You are Wealth Factory's native executor for the Connect First Workflow family.",
    "Decide whether the current lane is complete, needs more information, or is blocked.",
    "Return strict JSON only with this shape: {\"state\":\"done|waiting|blocked\",\"summary\":\"...\"}.",
    "Use state \"done\" only when the lane is actually complete and the next operator can treat it as finished.",
    "Use state \"waiting\" when the lane needs more information, confirmation, or a deliberate resume action.",
    "Use state \"blocked\" when the lane cannot proceed because a prerequisite, dependency, or required input is missing.",
    "Keep summary tenant-safe, concise, and specific to the lane. Do not mention Paperclip, prompts, tools, or internal runtime mechanics.",
    `Workflow: ${input.workflowId}`,
    `Persona: ${executionEnvelope.laneExecution.persona}`,
    `Lane title: ${executionEnvelope.laneExecution.title}`,
    `Deliverable type: ${executionEnvelope.laneExecution.deliverableType}`,
    `Resume focus: ${executionEnvelope.laneExecution.resumeFocus ?? "None"}`,
    `Continuity summary: ${continuitySummary}`,
    `Latest result summary: ${latestResultSummary}`,
    `Absorbed work items: ${absorbedWork}`
  ].join("\n");
}

function buildTaxStrategyWorkflowPrompt(input: {
  workflowId: string;
  executionEnvelope: HarnessWorkerExecutionEnvelope;
}): string {
  const { executionEnvelope } = input;
  const continuitySummary = executionEnvelope.continuityContext?.summary ?? executionEnvelope.laneExecution.resumeFocus ?? "No continuity summary recorded.";
  const latestResultSummary = executionEnvelope.continuityContext?.latestResultSummary ?? executionEnvelope.laneExecution.latestResultSummary ?? "No prior result summary recorded.";
  const absorbedWork =
    executionEnvelope.continuityContext?.absorbedWorkTrail.map((item) => item.title).join("; ") ??
    executionEnvelope.laneExecution.absorbedWorkItems?.join("; ") ??
    "No absorbed work items recorded.";

  return [
    "You are Wealth Factory's native executor for the Tax Strategy Workflow family.",
    "Decide whether the current lane is complete, needs more information, or is blocked.",
    "Return strict JSON only with this shape: {\"state\":\"done|waiting|blocked\",\"summary\":\"...\"}.",
    "Use state \"done\" only when the lane is actually complete and the next operator can treat it as finished.",
    "Use state \"waiting\" when the lane needs more information, confirmation, or a deliberate resume action.",
    "Use state \"blocked\" when the lane cannot proceed because a prerequisite, dependency, or required input is missing.",
    "Keep summary tenant-safe, concise, and specific to the lane. Do not mention Paperclip, prompts, tools, or internal runtime mechanics.",
    "Focus on tax-position readiness, open assumptions, and the clearest next bounded operator action.",
    `Workflow: ${input.workflowId}`,
    `Persona: ${executionEnvelope.laneExecution.persona}`,
    `Lane title: ${executionEnvelope.laneExecution.title}`,
    `Deliverable type: ${executionEnvelope.laneExecution.deliverableType}`,
    `Resume focus: ${executionEnvelope.laneExecution.resumeFocus ?? "None"}`,
    `Continuity summary: ${continuitySummary}`,
    `Latest result summary: ${latestResultSummary}`,
    `Absorbed work items: ${absorbedWork}`
  ].join("\n");
}

function buildPackageFollowupWorkflowPrompt(input: {
  workflowId: string;
  executionEnvelope: HarnessWorkerExecutionEnvelope;
}): string {
  const { executionEnvelope } = input;
  const continuitySummary = executionEnvelope.continuityContext?.summary ?? executionEnvelope.laneExecution.resumeFocus ?? "No continuity summary recorded.";
  const latestResultSummary = executionEnvelope.continuityContext?.latestResultSummary ?? executionEnvelope.laneExecution.latestResultSummary ?? "No prior result summary recorded.";
  const absorbedWork =
    executionEnvelope.continuityContext?.absorbedWorkTrail.map((item) => item.title).join("; ") ??
    executionEnvelope.laneExecution.absorbedWorkItems?.join("; ") ??
    "No absorbed work items recorded.";

  return [
    "You are Wealth Factory's native executor for the Package Follow-up Workflow family.",
    "Decide whether the current lane is complete, needs more information, or is blocked.",
    "Return strict JSON only with this shape: {\"state\":\"done|waiting|blocked\",\"summary\":\"...\"}.",
    "Use state \"done\" only when the follow-up lane is ready to hand a bounded customer-facing next step back to the operator.",
    "Use state \"waiting\" when the lane needs more information, confirmation, or a deliberate resume action.",
    "Use state \"blocked\" when the lane cannot proceed because a prerequisite, dependency, or required input is missing.",
    "Keep summary tenant-safe, concise, and specific to the lane. Do not mention Paperclip, prompts, tools, or internal runtime mechanics.",
    "Focus on the next bounded package follow-up, not on reopening the entire workflow scope.",
    `Workflow: ${input.workflowId}`,
    `Persona: ${executionEnvelope.laneExecution.persona}`,
    `Lane title: ${executionEnvelope.laneExecution.title}`,
    `Deliverable type: ${executionEnvelope.laneExecution.deliverableType}`,
    `Resume focus: ${executionEnvelope.laneExecution.resumeFocus ?? "None"}`,
    `Continuity summary: ${continuitySummary}`,
    `Latest result summary: ${latestResultSummary}`,
    `Absorbed work items: ${absorbedWork}`
  ].join("\n");
}

function parseConnectFirstWorkflowOutcome(input: {
  outputText: string;
  laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
}): NativeExecutionOutcome {
  const parsed = tryParseWorkflowDecision(input.outputText);
  if (!parsed) {
    return {
      state: "blocked",
      resumeSummary:
        `Native execution returned an invalid Connect First Workflow decision for ${input.laneExecution.persona.toUpperCase()}: ${input.laneExecution.title}. ` +
        "Keep this lane blocked until the native workflow decision contract is repaired."
    };
  }

  if (parsed.state === "done") {
    return {
      state: "done",
      resultSummary: formatConnectFirstWorkflowResult({
        generatedResultSummary: parsed.summary,
        laneExecution: input.laneExecution
      })
    };
  }

  return {
    state: parsed.state,
    resumeSummary: formatConnectFirstWorkflowResumeSummary({
      state: parsed.state,
      generatedSummary: parsed.summary,
      laneExecution: input.laneExecution
    })
  };
}

function parseTaxStrategyWorkflowOutcome(input: {
  outputText: string;
  laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
}): NativeExecutionOutcome {
  const parsed = tryParseWorkflowDecision(input.outputText);
  if (!parsed) {
    return {
      state: "blocked",
      resumeSummary:
        `Native execution returned an invalid Tax Strategy Workflow decision for ${input.laneExecution.persona.toUpperCase()}: ${input.laneExecution.title}. ` +
        "Keep this lane blocked until the native workflow decision contract is repaired."
    };
  }

  if (parsed.state === "done") {
    return {
      state: "done",
      resultSummary: formatTaxStrategyWorkflowResult({
        generatedResultSummary: parsed.summary,
        laneExecution: input.laneExecution
      })
    };
  }

  return {
    state: parsed.state,
    resumeSummary: formatTaxStrategyWorkflowResumeSummary({
      state: parsed.state,
      generatedSummary: parsed.summary,
      laneExecution: input.laneExecution
    })
  };
}

function parsePackageFollowupWorkflowOutcome(input: {
  outputText: string;
  laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
}): NativeExecutionOutcome {
  const parsed = tryParseWorkflowDecision(input.outputText);
  if (!parsed) {
    return {
      state: "blocked",
      resumeSummary:
        `Native execution returned an invalid Package Follow-up Workflow decision for ${input.laneExecution.persona.toUpperCase()}: ${input.laneExecution.title}. ` +
        "Keep this lane blocked until the native workflow decision contract is repaired."
    };
  }

  if (parsed.state === "done") {
    return {
      state: "done",
      resultSummary: formatPackageFollowupWorkflowResult({
        generatedResultSummary: parsed.summary,
        laneExecution: input.laneExecution
      })
    };
  }

  return {
    state: parsed.state,
    resumeSummary: formatPackageFollowupWorkflowResumeSummary({
      state: parsed.state,
      generatedSummary: parsed.summary,
      laneExecution: input.laneExecution
    })
  };
}

function tryParseWorkflowDecision(text: string): { state: "done" | "waiting" | "blocked"; summary: string } | null {
  const normalized = extractJsonObjectText(text);
  if (!normalized) {
    return null;
  }

  try {
    const parsed = JSON.parse(normalized);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const state = Reflect.get(parsed, "state");
    const summary = Reflect.get(parsed, "summary");
    if ((state !== "done" && state !== "waiting" && state !== "blocked") || typeof summary !== "string") {
      return null;
    }

    const trimmedSummary = summary.trim();
    if (!trimmedSummary) {
      return null;
    }

    return {
      state,
      summary: trimmedSummary
    };
  } catch {
    return null;
  }
}

function extractJsonObjectText(text: string): string | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) {
    return null;
  }
  return trimmed.slice(start, end + 1);
}

function formatConnectFirstWorkflowResult(input: {
  generatedResultSummary: string;
  laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
}): string {
  return [
    `Completed the Connect First Workflow ${humanizeDeliverableType(input.laneExecution.deliverableType).toLowerCase()} lane for ${input.laneExecution.persona.toUpperCase()}: ${input.laneExecution.title}.`,
    input.generatedResultSummary
  ].join(" ");
}

function formatConnectFirstWorkflowResumeSummary(input: {
  state: "waiting" | "blocked";
  generatedSummary: string;
  laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
}): string {
  const action = input.state === "waiting" ? "resume" : "unblock";
  return [
    `Connect First Workflow ${humanizeDeliverableType(input.laneExecution.deliverableType).toLowerCase()} lane for ${input.laneExecution.persona.toUpperCase()}: ${input.laneExecution.title} needs an explicit ${action} action.`,
    input.generatedSummary
  ].join(" ");
}

function formatTaxStrategyWorkflowResult(input: {
  generatedResultSummary: string;
  laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
}): string {
  return [
    `Completed the Tax Strategy Workflow ${humanizeDeliverableType(input.laneExecution.deliverableType).toLowerCase()} lane for ${input.laneExecution.persona.toUpperCase()}: ${input.laneExecution.title}.`,
    input.generatedResultSummary
  ].join(" ");
}

function formatTaxStrategyWorkflowResumeSummary(input: {
  state: "waiting" | "blocked";
  generatedSummary: string;
  laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
}): string {
  const action = input.state === "waiting" ? "resume" : "unblock";
  return [
    `Tax Strategy Workflow ${humanizeDeliverableType(input.laneExecution.deliverableType).toLowerCase()} lane for ${input.laneExecution.persona.toUpperCase()}: ${input.laneExecution.title} needs an explicit ${action} action.`,
    input.generatedSummary
  ].join(" ");
}

function formatPackageFollowupWorkflowResult(input: {
  generatedResultSummary: string;
  laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
}): string {
  return [
    `Completed the Package Follow-up Workflow ${humanizeDeliverableType(input.laneExecution.deliverableType).toLowerCase()} lane for ${input.laneExecution.persona.toUpperCase()}: ${input.laneExecution.title}.`,
    input.generatedResultSummary
  ].join(" ");
}

function formatPackageFollowupWorkflowResumeSummary(input: {
  state: "waiting" | "blocked";
  generatedSummary: string;
  laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
}): string {
  const action = input.state === "waiting" ? "resume" : "unblock";
  return [
    `Package Follow-up Workflow ${humanizeDeliverableType(input.laneExecution.deliverableType).toLowerCase()} lane for ${input.laneExecution.persona.toUpperCase()}: ${input.laneExecution.title} needs an explicit ${action} action.`,
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
