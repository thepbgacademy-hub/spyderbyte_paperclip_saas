import { createHash } from "node:crypto";

import type {
  CompletionRequest,
  CompletionResult,
  FactoryProviderKey,
  LLMProvider,
  ProviderCapabilities,
  TokenUsage,
  ValidationResult
} from "./provider-types.js";

const STUB_MODEL_ID = "stub-deterministic-v1";
const STUB_INPUT_COST_PER_MILLION_USD = 0;
const STUB_OUTPUT_COST_PER_MILLION_USD = 0;

function hashCompletionRequest(req: CompletionRequest): string {
  const hash = createHash("sha256");
  hash.update(req.model);
  hash.update(req.system ?? "");
  for (const message of req.messages) {
    hash.update(message.role);
    hash.update(message.content);
  }
  return hash.digest("hex").slice(0, 16);
}

function estimateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * A no-network, no-credential, deterministic LLMProvider used by the walking
 * skeleton (TASK-055 / DEC-040) to prove the station -> deliverable seam
 * without a live provider call. TASK-066 swaps in a real provider behind the
 * same interface.
 */
export function createStubLLMProvider(input?: { key?: FactoryProviderKey }): LLMProvider {
  const key = input?.key ?? "anthropic";

  const provider: LLMProvider = {
    key,

    async validateCredential(_secret: string): Promise<ValidationResult> {
      return { valid: true };
    },

    listCapabilities(): ProviderCapabilities {
      return {
        providerKey: key,
        registryVersion: "stub-1",
        models: [
          {
            providerKey: key,
            modelId: STUB_MODEL_ID,
            contextWindowTokens: 200_000,
            capabilities: ["structured_output", "long_context"],
            inputCostPerMillionTokensUsd: STUB_INPUT_COST_PER_MILLION_USD,
            outputCostPerMillionTokensUsd: STUB_OUTPUT_COST_PER_MILLION_USD,
            tier: "standard"
          }
        ]
      };
    },

    async complete(req: CompletionRequest, _secret: string): Promise<CompletionResult> {
      const requestHash = hashCompletionRequest(req);
      const lastUserMessage = [...req.messages].reverse().find((message) => message.role === "user");
      const text = `[stub:${requestHash}] ${lastUserMessage?.content ?? req.system ?? "no input"}`;
      const usage: TokenUsage = {
        inputTokens: estimateTokenCount(req.messages.map((message) => message.content).join("\n") + (req.system ?? "")),
        outputTokens: estimateTokenCount(text)
      };
      return {
        text,
        providerRequestId: `stub-${requestHash}`,
        usage,
        costUsd: provider.estimateCost(req.model, usage)
      };
    },

    estimateCost(_model: string, usage: TokenUsage): number {
      return (
        (usage.inputTokens / 1_000_000) * STUB_INPUT_COST_PER_MILLION_USD +
        (usage.outputTokens / 1_000_000) * STUB_OUTPUT_COST_PER_MILLION_USD
      );
    }
  };

  return provider;
}
