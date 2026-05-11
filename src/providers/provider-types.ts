export type ProviderKind =
  | "openai"
  | "openai_api"
  | "openai_chatgpt_codex_subscription"
  | "anthropic_api"
  | "xai_grok_api"
  | "openrouter_api"
  | "generic_api";

export type SecretRequirement = {
  name: string;
  envName: string;
  description: string;
};

export type OpenAIProviderConfig = {
  kind: "openai";
  label: "OpenAI";
  requiredSecrets: [SecretRequirement];
  metadataFields: readonly ["projectId"];
};

export type GenericApiProviderConfig = {
  kind: "generic_api";
  label: string;
  requiredSecrets: readonly SecretRequirement[];
  metadataFields: readonly string[];
};

export type ApiKeyProviderConfig = {
  kind: "anthropic_api" | "xai_grok_api" | "openrouter_api";
  label: string;
  requiredSecrets: [SecretRequirement];
  metadataFields: readonly string[];
};

export type CodexSubscriptionProviderConfig = {
  kind: "openai_chatgpt_codex_subscription";
  label: "OpenAI ChatGPT/Codex Subscription";
  requiredSecrets: readonly [];
  metadataFields: readonly [];
};

export type ProviderConfig = OpenAIProviderConfig | ApiKeyProviderConfig | CodexSubscriptionProviderConfig | GenericApiProviderConfig;

export const OPENAI_PROVIDER: OpenAIProviderConfig = {
  kind: "openai",
  label: "OpenAI",
  requiredSecrets: [
    {
      name: "apiKey",
      envName: "OPENAI_API_KEY",
      description: "Customer-provided OpenAI API key stored only by secret reference."
    }
  ],
  metadataFields: ["projectId"]
};

export const OPENAI_API_PROVIDER = OPENAI_PROVIDER;

export const ANTHROPIC_PROVIDER: ApiKeyProviderConfig = {
  kind: "anthropic_api",
  label: "Anthropic",
  requiredSecrets: [
    {
      name: "apiKey",
      envName: "ANTHROPIC_API_KEY",
      description: "Customer-provided Anthropic API key stored only by secret reference."
    }
  ],
  metadataFields: ["workspaceLabel"]
};

export const XAI_GROK_PROVIDER: ApiKeyProviderConfig = {
  kind: "xai_grok_api",
  label: "xAI Grok",
  requiredSecrets: [
    {
      name: "apiKey",
      envName: "XAI_API_KEY",
      description: "Customer-provided xAI API key stored only by secret reference."
    }
  ],
  metadataFields: ["defaultModel"]
};

export const OPENROUTER_PROVIDER: ApiKeyProviderConfig = {
  kind: "openrouter_api",
  label: "OpenRouter",
  requiredSecrets: [
    {
      name: "apiKey",
      envName: "OPENROUTER_API_KEY",
      description: "Customer-provided OpenRouter API key stored only by secret reference."
    }
  ],
  metadataFields: ["allowedModels"]
};

export const CODEX_SUBSCRIPTION_PROVIDER: CodexSubscriptionProviderConfig = {
  kind: "openai_chatgpt_codex_subscription",
  label: "OpenAI ChatGPT/Codex Subscription",
  requiredSecrets: [],
  metadataFields: []
};

export function createGenericApiProvider(params: {
  label: string;
  requiredSecrets: readonly SecretRequirement[];
  metadataFields?: readonly string[];
}): GenericApiProviderConfig {
  if (params.label.trim().length === 0) {
    throw new Error("Generic provider label is required");
  }

  if (params.requiredSecrets.length === 0) {
    throw new Error("Generic provider must declare at least one secret requirement");
  }

  const metadataFields = params.metadataFields ?? [];
  const unsafeMetadataField = metadataFields.find(isSecretLikeFieldName);
  if (unsafeMetadataField) {
    throw new Error(`Provider metadata field "${unsafeMetadataField}" looks secret-like and must be modeled as a secret requirement`);
  }

  return {
    kind: "generic_api",
    label: params.label,
    requiredSecrets: params.requiredSecrets,
    metadataFields
  };
}

function isSecretLikeFieldName(fieldName: string): boolean {
  return /api[_-]?key|token|secret|authorization|password|credential/i.test(fieldName);
}

export function validateCodexSubscriptionRegistration(input: {
  tenantId: string;
  codexHome: string;
  authStateRef: string;
  runtimeEnv: Record<string, string | undefined>;
}): void {
  const rawSegments = input.codexHome.replace(/\\/g, "/").split("/").filter(Boolean);
  if (rawSegments.includes("..")) {
    throw new Error("Codex subscription auth must use an isolated tenant auth home");
  }

  const segments = rawSegments.map((segment) => segment.replace(/\/+$/, ""));
  if (!segments.includes(input.tenantId) || segments.some((segment) => segment.toLowerCase() === ".codex")) {
    throw new Error("Codex subscription auth must use an isolated tenant auth home");
  }

  if (input.runtimeEnv.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY must be absent when using Codex subscription auth");
  }

  if (isSecretLikeFieldName(input.authStateRef)) {
    throw new Error("Codex auth state must be referenced by an opaque non-secret handle");
  }
}
