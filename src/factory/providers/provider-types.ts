export type FactoryProviderKey = "anthropic" | "openai" | "openrouter" | "google" | "xai";

export type FactoryProviderCapability = "structured_output" | "tool_use" | "long_context";

export type FactoryProviderTier = "economy" | "standard" | "premium";

export type FactoryProviderErrorClass =
  | "auth"
  | "rate_limit"
  | "transient"
  | "request_invalid"
  | "content_refusal"
  | "provider_outage";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ValidationResult {
  valid: boolean;
  errorClass?: FactoryProviderErrorClass;
  message?: string;
}

export interface ProviderModelCapabilities {
  providerKey: FactoryProviderKey;
  modelId: string;
  contextWindowTokens: number;
  capabilities: readonly FactoryProviderCapability[];
  inputCostPerMillionTokensUsd: number;
  outputCostPerMillionTokensUsd: number;
  tier: FactoryProviderTier;
}

export interface ProviderCapabilities {
  providerKey: FactoryProviderKey;
  registryVersion: string;
  models: readonly ProviderModelCapabilities[];
}

export type CompletionMessageRole = "user" | "assistant" | "tool";

export interface CompletionMessage {
  role: CompletionMessageRole;
  content: string;
  toolCallId?: string;
  toolName?: string;
}

export interface CompletionToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface CompletionRequest {
  model: string;
  system?: string;
  messages: readonly CompletionMessage[];
  tools?: readonly CompletionToolDefinition[];
  responseFormat?: {
    type: "json_schema";
    schemaName: string;
    schema: Record<string, unknown>;
  };
}

export interface CompletionResult {
  text: string;
  providerRequestId: string | null;
  usage: TokenUsage;
  costUsd: number;
}

export interface LLMProvider {
  key: FactoryProviderKey;
  validateCredential(secret: string): Promise<ValidationResult>;
  listCapabilities(): ProviderCapabilities;
  complete(req: CompletionRequest, secret: string): Promise<CompletionResult>;
  estimateCost(model: string, usage: TokenUsage): number;
}

export interface ProviderRequirementMatchRequest {
  requiredCapabilities: readonly FactoryProviderCapability[];
  preferredTier?: FactoryProviderTier;
}

export interface ProviderHttpRequest {
  providerKey: FactoryProviderKey;
  operation: "validateCredential" | "complete";
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: unknown;
}

export interface ProviderHttpResponse {
  status: number;
  providerRequestId?: string;
  body?: unknown;
}

export type ProviderHttpClient = (request: ProviderHttpRequest) => Promise<ProviderHttpResponse>;
