import type {
  FactoryProviderKey,
  FactoryProviderTier,
  ProviderCapabilities,
  ProviderModelCapabilities,
  ProviderRequirementMatchRequest,
  TokenUsage
} from "./provider-types.js";
import type { PowerSourceProviderKind } from "../domain/types.js";

export const FACTORY_PROVIDER_REGISTRY_VERSION = "factory-provider-registry-2026-07-12";

const PROVIDER_REGISTRY: Record<FactoryProviderKey, ProviderCapabilities> = {
  openai: {
    providerKey: "openai",
    registryVersion: FACTORY_PROVIDER_REGISTRY_VERSION,
    models: [
      {
        providerKey: "openai",
        modelId: "gpt-4.1-mini",
        contextWindowTokens: 1_000_000,
        capabilities: ["structured_output", "tool_use", "long_context"],
        inputCostPerMillionTokensUsd: 0.4,
        outputCostPerMillionTokensUsd: 1.6,
        tier: "economy"
      },
      {
        providerKey: "openai",
        modelId: "gpt-4.1",
        contextWindowTokens: 1_000_000,
        capabilities: ["structured_output", "tool_use", "long_context"],
        inputCostPerMillionTokensUsd: 2,
        outputCostPerMillionTokensUsd: 8,
        tier: "standard"
      }
    ]
  },
  anthropic: {
    providerKey: "anthropic",
    registryVersion: FACTORY_PROVIDER_REGISTRY_VERSION,
    models: [
      {
        providerKey: "anthropic",
        modelId: "claude-sonnet-4",
        contextWindowTokens: 200_000,
        capabilities: ["structured_output", "tool_use", "long_context"],
        inputCostPerMillionTokensUsd: 3,
        outputCostPerMillionTokensUsd: 15,
        tier: "standard"
      }
    ]
  },
  google: {
    providerKey: "google",
    registryVersion: FACTORY_PROVIDER_REGISTRY_VERSION,
    models: [
      {
        providerKey: "google",
        modelId: "gemini-2.5-pro",
        contextWindowTokens: 1_000_000,
        capabilities: ["structured_output", "tool_use", "long_context"],
        inputCostPerMillionTokensUsd: 1.25,
        outputCostPerMillionTokensUsd: 10,
        tier: "standard"
      }
    ]
  },
  openrouter: {
    providerKey: "openrouter",
    registryVersion: FACTORY_PROVIDER_REGISTRY_VERSION,
    models: [
      {
        providerKey: "openrouter",
        modelId: "openrouter/auto",
        contextWindowTokens: 128_000,
        capabilities: ["structured_output", "tool_use", "long_context"],
        inputCostPerMillionTokensUsd: 2,
        outputCostPerMillionTokensUsd: 8,
        tier: "standard"
      }
    ]
  },
  xai: {
    providerKey: "xai",
    registryVersion: FACTORY_PROVIDER_REGISTRY_VERSION,
    models: [
      {
        providerKey: "xai",
        modelId: "grok-3-mini",
        contextWindowTokens: 128_000,
        capabilities: ["structured_output"],
        inputCostPerMillionTokensUsd: 0.3,
        outputCostPerMillionTokensUsd: 0.5,
        tier: "economy"
      },
      {
        providerKey: "xai",
        modelId: "grok-3",
        contextWindowTokens: 128_000,
        capabilities: ["structured_output", "tool_use"],
        inputCostPerMillionTokensUsd: 3,
        outputCostPerMillionTokensUsd: 15,
        tier: "premium"
      }
    ]
  }
};

const TIER_ORDER: Record<FactoryProviderTier, number> = {
  economy: 0,
  standard: 1,
  premium: 2
};

export function createFactoryProviderRegistry(): Record<FactoryProviderKey, ProviderCapabilities> {
  return structuredClone(PROVIDER_REGISTRY);
}

export function findEligibleFactoryProviderModels(
  requirements: ProviderRequirementMatchRequest
): ProviderModelCapabilities[] {
  const eligibleModels = Object.values(PROVIDER_REGISTRY)
    .flatMap((provider) => provider.models)
    .filter((model) => requirements.requiredCapabilities.every((capability) => model.capabilities.includes(capability)));
  const preferredTierMatches = requirements.preferredTier
    ? eligibleModels.filter((model) => model.tier === requirements.preferredTier)
    : [];
  const modelsToRank = preferredTierMatches.length > 0 ? preferredTierMatches : eligibleModels;

  return modelsToRank
    .sort((a, b) => {
      const preferredDelta = tierPreferenceDistance(a.tier, requirements.preferredTier) - tierPreferenceDistance(b.tier, requirements.preferredTier);
      if (preferredDelta !== 0) {
        return preferredDelta;
      }

      const tierDelta = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
      if (tierDelta !== 0) {
        return tierDelta;
      }

      return totalMillionTokenCost(a) - totalMillionTokenCost(b);
    });
}

export function estimateFactoryProviderCostUsd(providerKey: FactoryProviderKey, modelId: string, usage: TokenUsage): number {
  const model = PROVIDER_REGISTRY[providerKey].models.find((candidate) => candidate.modelId === modelId);
  if (!model) {
    throw new Error(`Unknown factory provider model: ${providerKey}:${modelId}`);
  }

  return roundUsd(
    (usage.inputTokens / 1_000_000) * model.inputCostPerMillionTokensUsd +
      (usage.outputTokens / 1_000_000) * model.outputCostPerMillionTokensUsd
  );
}

export function getFactoryProviderCapabilities(providerKey: FactoryProviderKey): ProviderCapabilities {
  return structuredClone(PROVIDER_REGISTRY[providerKey]);
}

export function mapPowerSourceProviderKindToFactoryProviderKey(providerKind: PowerSourceProviderKind): FactoryProviderKey {
  if (providerKind === "openai_api") {
    return "openai";
  }

  if (providerKind === "anthropic_api") {
    return "anthropic";
  }

  if (providerKind === "gemini_api") {
    return "google";
  }

  if (providerKind === "openrouter_api") {
    return "openrouter";
  }

  if (providerKind === "xai_grok_api") {
    return "xai";
  }

  throw new Error(`Unsupported Power Source provider kind: ${providerKind}`);
}

function tierPreferenceDistance(tier: FactoryProviderTier, preferredTier: FactoryProviderTier | undefined): number {
  if (!preferredTier) {
    return TIER_ORDER[tier];
  }

  return Math.abs(TIER_ORDER[tier] - TIER_ORDER[preferredTier]);
}

function totalMillionTokenCost(model: ProviderModelCapabilities): number {
  return model.inputCostPerMillionTokensUsd + model.outputCostPerMillionTokensUsd;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
