import {
  ANTHROPIC_PROVIDER,
  CODEX_SUBSCRIPTION_PROVIDER,
  OPENAI_API_PROVIDER,
  OPENROUTER_PROVIDER,
  XAI_GROK_PROVIDER,
  createGenericApiProvider,
  validateCodexSubscriptionRegistration,
  type ProviderConfig,
  type ProviderKind
} from "../providers/provider-types.js";
import { createSecretService } from "./secret-service.js";

type SecretService = ReturnType<typeof createSecretService>;

export type PublicProviderConnection = {
  providerKind: ProviderKind;
  label: string;
  connected: true;
  metadata: Record<string, unknown>;
};

export function createProviderCredentialService(options: { secrets: SecretService; runtimeEnv?: Record<string, string | undefined> }) {
  return {
    async register(input: {
      tenantId: string;
      actorUserId: string;
      providerKind: ProviderKind;
      label: string;
      secretValues: Record<string, string>;
      metadata: Record<string, unknown>;
    }): Promise<PublicProviderConnection> {
      const provider = resolveProvider(input.providerKind, input.label, input.secretValues, input.metadata);
      validateProviderCredentialInput({
        provider,
        tenantId: input.tenantId,
        secretValues: input.secretValues,
        metadata: input.metadata,
        runtimeEnv: options.runtimeEnv ?? {}
      });
      const connection = await options.secrets.registerProviderCredential({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        label: input.label,
        registration: {
          provider,
          secretValues: input.secretValues,
          metadata: input.metadata
        }
      });

      return connection;
    }
  };
}

function validateProviderCredentialInput(input: {
  provider: ProviderConfig;
  tenantId: string;
  secretValues: Record<string, string>;
  metadata: Record<string, unknown>;
  runtimeEnv: Record<string, string | undefined>;
}) {
  for (const requirement of input.provider.requiredSecrets) {
    const value = input.secretValues[requirement.name];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`Provider credential is missing required secret "${requirement.name}"`);
    }
  }

  if (input.provider.kind === "openai_chatgpt_codex_subscription") {
    validateCodexSubscriptionRegistration({
      tenantId: input.tenantId,
      codexHome: readMetadataString(input.metadata, "codexHome"),
      authStateRef: readMetadataString(input.metadata, "authStateRef"),
      runtimeEnv: input.runtimeEnv
    });
  }
}

function readMetadataString(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Provider metadata "${key}" is required`);
  }
  return value;
}

function resolveProvider(kind: ProviderKind, label: string, secretValues: Record<string, string>, metadata: Record<string, unknown>): ProviderConfig {
  if (kind === "openai" || kind === "openai_api") return OPENAI_API_PROVIDER;
  if (kind === "anthropic_api") return ANTHROPIC_PROVIDER;
  if (kind === "xai_grok_api") return XAI_GROK_PROVIDER;
  if (kind === "openrouter_api") return OPENROUTER_PROVIDER;
  if (kind === "openai_chatgpt_codex_subscription") return CODEX_SUBSCRIPTION_PROVIDER;
  return createGenericApiProvider({
    label,
    requiredSecrets: Object.keys(secretValues).map((name) => ({
      name,
      envName: `${label.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_${name.toUpperCase()}`,
      description: `Customer-provided ${label} ${name}.`
    })),
    metadataFields: Object.keys(metadata)
  });
}
