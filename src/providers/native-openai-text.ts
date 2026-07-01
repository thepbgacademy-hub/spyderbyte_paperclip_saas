import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RuntimeProviderExecutionBinding } from "./runtime-provider-execution.js";
import type { HarnessWorkerExecutionEnvelope } from "../harness/worker-executor.js";
import { buildWorkerPromptContextLines } from "../worker/native-prompt-context.js";

const DEFAULT_NATIVE_OPENAI_MODEL = "gpt-4.1-mini";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_RESULT_SUMMARY_LENGTH = 500;

export class NativeOpenAIExecutionError extends Error {
  readonly code = "native_provider_execution_failed";
  readonly publicMessage = "workflow_failed";
  readonly statusCode: number | undefined;

  constructor(
    readonly reason:
      | "provider_kind_unsupported"
      | "codex_subscription_auth_missing"
      | "codex_subscription_failed"
      | "secret_missing"
      | "request_failed"
      | "response_invalid",
    message: string,
    options?: {
      statusCode?: number;
    }
  ) {
    super(message);
    this.name = "NativeOpenAIExecutionError";
    this.statusCode = Number.isInteger(options?.statusCode) ? options?.statusCode : undefined;
  }
}

export type CodexSubscriptionTextRunner = (input: {
  prompt: string;
  maxOutputTokens?: number;
  preserveStructuredOutput?: boolean;
  codexHome: string;
  authStateRef: string;
}) => Promise<{
  outputText: string;
  model: string;
}>;

export function createNativeOpenAITextGenerator(options?: {
  fetch?: typeof fetch;
  model?: string;
  codexSubscriptionTextRunner?: CodexSubscriptionTextRunner;
}) {
  const fetchImpl = options?.fetch ?? globalThis.fetch;
  const model = options?.model ?? DEFAULT_NATIVE_OPENAI_MODEL;
  const codexSubscriptionTextRunner = options?.codexSubscriptionTextRunner ?? createCodexCliSubscriptionTextRunner();

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
      if (input.binding.providerKind === "openai_chatgpt_codex_subscription") {
        const codexHome = readRequiredMetadataString(input.binding.metadata, "codexHome");
        const authStateRef = readRequiredMetadataString(input.binding.metadata, "authStateRef");

        if (!codexHome || !authStateRef) {
          throw new NativeOpenAIExecutionError(
            "codex_subscription_auth_missing",
            "Native OpenAI Codex subscription execution requires an isolated codexHome and opaque authStateRef metadata."
          );
        }

        try {
          const generated = await codexSubscriptionTextRunner({
            prompt: input.prompt,
            codexHome,
            authStateRef,
            ...(typeof input.maxOutputTokens === "number" ? { maxOutputTokens: input.maxOutputTokens } : {}),
            ...(typeof input.preserveStructuredOutput === "boolean" ? { preserveStructuredOutput: input.preserveStructuredOutput } : {})
          });
          const outputText = input.preserveStructuredOutput
            ? generated.outputText.trim()
            : normalizeOutputTextAscii(generated.outputText);

          if (!outputText) {
            throw new NativeOpenAIExecutionError(
              "response_invalid",
              "Native OpenAI Codex subscription execution returned no text output."
            );
          }

          return {
            outputText,
            model: generated.model
          };
        } catch (error) {
          if (error instanceof NativeOpenAIExecutionError) {
            throw error;
          }
          throw new NativeOpenAIExecutionError(
            "codex_subscription_failed",
            `Native OpenAI Codex subscription execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

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
          `Native OpenAI text generation failed with status ${response.status}${body ? `: ${body}` : ""}`,
          { statusCode: response.status }
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

export function createCodexCliSubscriptionTextRunner(options?: {
  command?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}): CodexSubscriptionTextRunner {
  const command = options?.command ?? "codex";
  const timeoutMs = options?.timeoutMs ?? 120_000;
  const baseEnv = options?.env ?? process.env;

  return async ({ prompt, codexHome }) => {
    // authStateRef is validated before this point; Codex reads the selected auth state from CODEX_HOME.
    const tempDir = await mkdtemp(join(tmpdir(), "wf-codex-subscription-"));
    const outputPath = join(tempDir, "last-message.txt");

    try {
      const outputText = await new Promise<string>((resolve, reject) => {
        const env: NodeJS.ProcessEnv = {
          ...baseEnv,
          CODEX_HOME: codexHome
        };
        delete env.OPENAI_API_KEY;

        const child = spawn(
          command,
          [
            "exec",
            "--skip-git-repo-check",
            "--ephemeral",
            "--ignore-user-config",
            "--ignore-rules",
            "--color",
            "never",
            "--output-last-message",
            outputPath,
            "-"
          ],
          {
            cwd: tempDir,
            env,
            stdio: ["pipe", "pipe", "pipe"]
          }
        );

        let stdout = "";
        let stderr = "";
        let settled = false;
        const timeout = setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          child.kill("SIGKILL");
          reject(new Error(`Codex subscription execution timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        child.stdout.on("data", (chunk) => {
          stdout += String(chunk);
        });
        child.stderr.on("data", (chunk) => {
          stderr += String(chunk);
        });
        child.on("error", (error) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timeout);
          reject(error);
        });
        child.on("exit", async (code) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timeout);
          if (code !== 0) {
            reject(new Error(stderr.trim() || `codex exec exited with code ${code ?? "unknown"}`));
            return;
          }

          try {
            resolve((await readFile(outputPath, "utf8")).trim() || stdout.trim());
          } catch {
            resolve(stdout.trim());
          }
        });

        child.stdin.end(prompt);
      });

      return {
        outputText,
        model: "openai_chatgpt_codex_subscription"
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
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

function readRequiredMetadataString(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
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

function _normalizeOutputText(text: string): string {
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
