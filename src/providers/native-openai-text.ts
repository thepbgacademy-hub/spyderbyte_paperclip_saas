import type { RuntimeProviderExecutionBinding } from "./runtime-provider-execution.js";
import type { HarnessWorkerExecutionEnvelope } from "../harness/worker-executor.js";
import { buildWorkerPromptContextLines } from "../worker/native-prompt-context.js";

const DEFAULT_NATIVE_OPENAI_MODEL = "gpt-4.1-mini";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_RESULT_SUMMARY_LENGTH = 500;

export class NativeOpenAIExecutionError extends Error {
  readonly code = "native_provider_execution_failed";
  readonly publicMessage = "workflow_failed";

  constructor(
    readonly reason:
      | "provider_kind_unsupported"
      | "secret_missing"
      | "request_failed"
      | "response_invalid",
    message: string
  ) {
    super(message);
    this.name = "NativeOpenAIExecutionError";
  }
}

export function createNativeOpenAITextGenerator(options?: {
  fetch?: typeof fetch;
  model?: string;
}) {
  const fetchImpl = options?.fetch ?? globalThis.fetch;
  const model = options?.model ?? DEFAULT_NATIVE_OPENAI_MODEL;

  return {
    async generateText(input: {
      binding: RuntimeProviderExecutionBinding;
      prompt: string;
      maxOutputTokens?: number;
      preserveStructuredOutput?: boolean;
    }): Promise<{
      outputText: string;
      model: string;
    }> {
      if (input.binding.providerKind !== "openai_api" && input.binding.providerKind !== "openai") {
        throw new NativeOpenAIExecutionError(
          "provider_kind_unsupported",
          `Native OpenAI text generator does not support provider kind ${input.binding.providerKind}`
        );
      }

      const apiKey = input.binding.secretValues.apiKey?.trim();
      if (!apiKey) {
        throw new NativeOpenAIExecutionError(
          "secret_missing",
          `Native OpenAI text generator requires a non-empty apiKey secret for ${input.binding.providerKind}`
        );
      }

      const projectId = typeof input.binding.metadata.projectId === "string" && input.binding.metadata.projectId.trim().length > 0
        ? input.binding.metadata.projectId.trim()
        : undefined;

      let response: Response;
      try {
        response = await fetchImpl(OPENAI_RESPONSES_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            ...(projectId ? { "OpenAI-Project": projectId } : {})
          },
          body: JSON.stringify({
            model,
            input: input.prompt,
            max_output_tokens: input.maxOutputTokens ?? 220,
            ...(input.preserveStructuredOutput
              ? {
                  text: {
                    format: {
                      type: "json_object"
                    }
                  }
                }
              : {})
          })
        });
      } catch (error) {
        throw new NativeOpenAIExecutionError(
          "request_failed",
          `Native OpenAI text generation request failed before a response was received: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      if (!response.ok) {
        const body = await safeReadText(response);
        throw new NativeOpenAIExecutionError(
          "request_failed",
          `Native OpenAI text generation failed with status ${response.status}${body ? `: ${body}` : ""}`
        );
      }

      const payload = await response.json();
      const rawOutputText = extractOutputText(payload);
      const outputText = input.preserveStructuredOutput ? rawOutputText.trim() : normalizeOutputTextAscii(rawOutputText);
      if (!outputText) {
        throw new NativeOpenAIExecutionError(
          "response_invalid",
          "Native OpenAI text generation returned no text output."
        );
      }

      return {
        outputText,
        model
      };
    },
    async generateLaneResult(input: {
      binding: RuntimeProviderExecutionBinding;
      workflowId: string;
      executionEnvelope: HarnessWorkerExecutionEnvelope;
    }): Promise<{
      resultSummary: string;
      model: string;
    }> {
      const generated = await this.generateText({
        binding: input.binding,
        prompt: buildLanePrompt({
          workflowId: input.workflowId,
          executionEnvelope: input.executionEnvelope
        })
      });

      return {
        resultSummary: generated.outputText,
        model: generated.model
      };
    }
  };
}

function buildLanePrompt(input: {
  workflowId: string;
  executionEnvelope: HarnessWorkerExecutionEnvelope;
}): string {
  return [
    "You are Wealth Factory's native execution provider for one bounded harness lane.",
    "Return plain text only.",
    "Write one concise execution result summary for the current lane in 1-3 sentences.",
    "Do not mention Paperclip, prompts, tools, hidden system behavior, or internal runtime mechanics.",
    ...buildWorkerPromptContextLines({
      workflowId: input.workflowId,
      executionEnvelope: input.executionEnvelope
    })
  ].join("\n");
}

function extractOutputText(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }

  const outputText = Reflect.get(value, "output_text");
  if (typeof outputText === "string") {
    return outputText;
  }

  const output = Reflect.get(value, "output");
  if (!Array.isArray(output)) {
    return "";
  }

  const textParts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const content = Reflect.get(item, "content");
    if (!Array.isArray(content)) {
      continue;
    }
    for (const block of content) {
      if (!block || typeof block !== "object") {
        continue;
      }
      const textValue = Reflect.get(block, "text");
      if (typeof textValue === "string") {
        textParts.push(textValue);
      }
    }
  }

  return textParts.join("\n");
}

function normalizeOutputText(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= MAX_RESULT_SUMMARY_LENGTH) {
    return collapsed;
  }
  return `${collapsed.slice(0, MAX_RESULT_SUMMARY_LENGTH - 1).trimEnd()}…`;
}

function normalizeOutputTextAscii(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= MAX_RESULT_SUMMARY_LENGTH) {
    return collapsed;
  }
  return `${collapsed.slice(0, MAX_RESULT_SUMMARY_LENGTH - 3).trimEnd()}...`;
}

async function safeReadText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.trim();
  } catch {
    return "";
  }
}
