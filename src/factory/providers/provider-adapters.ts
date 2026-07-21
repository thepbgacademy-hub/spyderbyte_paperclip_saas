import { estimateFactoryProviderCostUsd, getFactoryProviderCapabilities } from "./provider-registry.js";
import { buildProviderCompletionRequest, normalizeProviderCompletionResponse } from "./provider-completion-mappers.js";
import type {
  CompletionRequest,
  CompletionResult,
  FactoryProviderErrorClass,
  FactoryProviderKey,
  LLMProvider,
  ProviderHttpClient,
  TokenUsage,
  ValidationResult
} from "./provider-types.js";

export interface FactoryProviderAdapterOptions {
  request: ProviderHttpClient;
}

type ProviderAdapterConfig = {
  key: FactoryProviderKey;
  validationUrl: string;
};

const PROVIDER_ADAPTER_CONFIGS: Record<FactoryProviderKey, ProviderAdapterConfig> = {
  openai: {
    key: "openai",
    validationUrl: "https://api.openai.com/v1/models"
  },
  anthropic: {
    key: "anthropic",
    validationUrl: "https://api.anthropic.com/v1/messages"
  },
  openrouter: {
    key: "openrouter",
    validationUrl: "https://openrouter.ai/api/v1/models"
  },
  google: {
    key: "google",
    validationUrl: "https://generativelanguage.googleapis.com/v1beta/models"
  },
  xai: {
    key: "xai",
    validationUrl: "https://api.x.ai/v1/models"
  }
};

export function createFactoryProviderAdapters(options: FactoryProviderAdapterOptions): Record<FactoryProviderKey, LLMProvider> {
  return {
    openai: createProviderAdapter(PROVIDER_ADAPTER_CONFIGS.openai, options.request),
    anthropic: createProviderAdapter(PROVIDER_ADAPTER_CONFIGS.anthropic, options.request),
    openrouter: createProviderAdapter(PROVIDER_ADAPTER_CONFIGS.openrouter, options.request),
    google: createProviderAdapter(PROVIDER_ADAPTER_CONFIGS.google, options.request),
    xai: createProviderAdapter(PROVIDER_ADAPTER_CONFIGS.xai, options.request)
  };
}

function createProviderAdapter(config: ProviderAdapterConfig, request: ProviderHttpClient): LLMProvider {
  return {
    key: config.key,
    async validateCredential(secret: string): Promise<ValidationResult> {
      const response = await request({
        providerKey: config.key,
        operation: "validateCredential",
        url: config.validationUrl,
        method: config.key === "anthropic" ? "POST" : "GET",
        headers: createProviderHeaders(config.key, secret),
        body: config.key === "anthropic" ? createValidationProbeBody(config.key) : undefined
      });

      if (response.status >= 200 && response.status < 300) {
        return { valid: true };
      }

      const errorClass = classifyProviderError(response.status);
      return {
        valid: false,
        errorClass,
        message: messageForErrorClass(errorClass)
      };
    },
    listCapabilities() {
      return getFactoryProviderCapabilities(config.key);
    },
    async complete(req: CompletionRequest, secret: string): Promise<CompletionResult> {
      const response = await request(
        buildProviderCompletionRequest({
          providerKey: config.key,
          request: req,
          headers: createProviderHeaders(config.key, secret)
        })
      );

      if (response.status < 200 || response.status >= 300) {
        const errorClass = classifyProviderError(response.status);
        throw new Error(messageForErrorClass(errorClass));
      }

      const normalized = normalizeProviderCompletionResponse(config.key, response);
      return {
        ...normalized,
        costUsd: estimateFactoryProviderCostUsd(config.key, req.model, normalized.usage)
      };
    },
    estimateCost(model: string, usage: TokenUsage): number {
      return estimateFactoryProviderCostUsd(config.key, model, usage);
    }
  };
}

function createProviderHeaders(providerKey: FactoryProviderKey, secret: string): Record<string, string> {
  if (providerKey === "google") {
    return {
      "x-goog-api-key": secret
    };
  }

  if (providerKey === "anthropic") {
    return {
      "x-api-key": secret,
      "anthropic-version": "2023-06-01"
    };
  }

  return {
    authorization: `Bearer ${secret}`
  };
}

function createValidationProbeBody(providerKey: FactoryProviderKey): unknown {
  if (providerKey !== "anthropic") {
    return undefined;
  }

  return {
    model: "claude-sonnet-4",
    max_tokens: 1,
    messages: [{ role: "user", content: "credential validation probe" }]
  };
}

function classifyProviderError(status: number): FactoryProviderErrorClass {
  if (status === 401 || status === 403) {
    return "auth";
  }

  if (status === 429) {
    return "rate_limit";
  }

  if (status === 400) {
    return "request_invalid";
  }

  if (status === 422) {
    return "content_refusal";
  }

  if (status >= 500) {
    return "provider_outage";
  }

  return "transient";
}

function messageForErrorClass(errorClass: FactoryProviderErrorClass): string {
  if (errorClass === "auth") {
    return "Power Source credential was rejected by the provider.";
  }

  if (errorClass === "rate_limit") {
    return "Provider rate limit reached; the run can retry later.";
  }

  if (errorClass === "content_refusal") {
    return "Provider blocked this station output and needs customer-safe guidance.";
  }

  if (errorClass === "request_invalid") {
    return "Provider request shape was rejected before generation; check the adapter mapping.";
  }

  if (errorClass === "provider_outage") {
    return "Provider appears unavailable; the run can pause and retry later.";
  }

  return "Provider request failed transiently; the run can retry.";
}
