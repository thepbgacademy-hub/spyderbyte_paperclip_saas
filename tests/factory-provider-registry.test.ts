import { describe, expect, it } from "vitest";

import {
  createFactoryProviderRegistry,
  estimateFactoryProviderCostUsd,
  FACTORY_PROVIDER_REGISTRY_VERSION,
  findEligibleFactoryProviderModels,
  mapPowerSourceProviderKindToFactoryProviderKey
} from "../src/factory/providers/provider-registry.js";
import { createFactoryProviderAdapters } from "../src/factory/providers/provider-adapters.js";
import type { FactoryProviderKey, LLMProvider } from "../src/factory/providers/provider-types.js";

describe("factory provider registry", () => {
  it("defines a versioned capability registry for every blueprint provider", () => {
    const registry = createFactoryProviderRegistry();

    expect(FACTORY_PROVIDER_REGISTRY_VERSION).toMatch(/^factory-provider-registry-/);
    expect(Object.keys(registry).sort()).toEqual(["anthropic", "google", "openai", "openrouter", "xai"]);

    for (const provider of Object.values(registry)) {
      expect(provider.models.length).toBeGreaterThan(0);
      for (const model of provider.models) {
        expect(model.contextWindowTokens).toBeGreaterThan(0);
        expect(model.inputCostPerMillionTokensUsd).toBeGreaterThanOrEqual(0);
        expect(model.outputCostPerMillionTokensUsd).toBeGreaterThanOrEqual(0);
        expect(["economy", "standard", "premium"]).toContain(model.tier);
      }
    }
  });

  it("matches package provider requirements to eligible provider/model pairs as a pure function", () => {
    const matches = findEligibleFactoryProviderModels({
      requiredCapabilities: ["structured_output", "tool_use", "long_context"],
      preferredTier: "standard"
    });

    expect(matches.map((match) => `${match.providerKey}:${match.modelId}`)).toEqual([
      "openai:gpt-4.1",
      "openrouter:openrouter/auto",
      "google:gemini-2.5-pro",
      "anthropic:claude-sonnet-4"
    ]);
  });

  it("orders cheaper tiers before premium fallbacks when no preferred tier is requested", () => {
    const matches = findEligibleFactoryProviderModels({
      requiredCapabilities: ["structured_output"]
    });

    expect(matches[0]).toMatchObject({
      providerKey: "xai",
      modelId: "grok-3-mini",
      tier: "economy"
    });
  });

  it("estimates completion cost from registry rates", () => {
    expect(
      estimateFactoryProviderCostUsd("openai", "gpt-4.1", {
        inputTokens: 1_000_000,
        outputTokens: 500_000
      })
    ).toBe(6);
  });

  it("fails closed for unknown provider/model cost requests", () => {
    expect(() =>
      estimateFactoryProviderCostUsd("openai", "missing-model", {
        inputTokens: 1,
        outputTokens: 1
      })
    ).toThrow("Unknown factory provider model");
  });

  it("maps Ticket 10 Power Source credential kinds to blueprint provider keys", () => {
    expect(mapPowerSourceProviderKindToFactoryProviderKey("openai_api")).toBe("openai");
    expect(mapPowerSourceProviderKindToFactoryProviderKey("anthropic_api")).toBe("anthropic");
    expect(mapPowerSourceProviderKindToFactoryProviderKey("gemini_api")).toBe("google");
    expect(mapPowerSourceProviderKindToFactoryProviderKey("openrouter_api")).toBe("openrouter");
    expect(mapPowerSourceProviderKindToFactoryProviderKey("xai_grok_api")).toBe("xai");
  });

  it("fails closed when a Power Source credential kind is not explicitly mapped", () => {
    expect(() => mapPowerSourceProviderKindToFactoryProviderKey("future_api" as never)).toThrow(
      "Unsupported Power Source provider kind"
    );
  });
});

describe("factory provider adapters", () => {
  it("creates all blueprint provider adapters behind the shared LLMProvider interface", async () => {
    const adapters = createFactoryProviderAdapters({
      request: async ({ providerKey }) => ({
        status: 200,
        body: validationBodyFor(providerKey)
      })
    });

    expect(Object.keys(adapters).sort()).toEqual(["anthropic", "google", "openai", "openrouter", "xai"]);

    const providers: LLMProvider[] = Object.values(adapters);
    for (const provider of providers) {
      expect(provider.listCapabilities().providerKey).toBe(provider.key);
      await expect(provider.validateCredential(`${provider.key}-secret`)).resolves.toEqual({ valid: true });
      expect(
        provider.estimateCost(provider.listCapabilities().models[0]?.modelId ?? "", {
          inputTokens: 1_000,
          outputTokens: 1_000
        })
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it("normalizes provider auth failures without leaking raw response bodies", async () => {
    const adapters = createFactoryProviderAdapters({
      request: async () => ({
        status: 401,
        body: { error: { message: "raw provider says sk-live-secret is invalid" } }
      })
    });

    await expect(adapters.openai.validateCredential("sk-live-secret")).resolves.toEqual({
      valid: false,
      errorClass: "auth",
      message: "Power Source credential was rejected by the provider."
    });
  });

  it("routes completion execution through the injected provider HTTP client after B30", async () => {
    const adapters = createFactoryProviderAdapters({
      request: async () => ({
        status: 200,
        providerRequestId: "anthropic-request-1",
        body: {
          content: [{ type: "text", text: "Factory output" }],
          usage: { input_tokens: 11, output_tokens: 7 }
        }
      })
    });

    await expect(
      adapters.anthropic.complete(
        {
          model: "claude-sonnet-4",
          system: "Stay bounded.",
          messages: [{ role: "user", content: "Draft the station output." }],
          responseFormat: {
            type: "json_schema",
            schemaName: "station_output",
            schema: { type: "object" }
          },
          tools: [
            {
              name: "deliverable_write",
              description: "Write a deliverable.",
              inputSchema: { type: "object" }
            }
          ]
        },
        "anthropic-secret"
      )
    ).resolves.toEqual({
      text: "Factory output",
      providerRequestId: "anthropic-request-1",
      usage: {
        inputTokens: 11,
        outputTokens: 7
      },
      costUsd: 0.000138
    });
  });
});

function validationBodyFor(providerKey: FactoryProviderKey): unknown {
  if (providerKey === "openai") {
    return { data: [] };
  }

  if (providerKey === "anthropic") {
    return { id: "msg_validation_probe" };
  }

  if (providerKey === "openrouter") {
    return { data: [{ id: "openrouter/auto" }] };
  }

  if (providerKey === "google") {
    return { models: [] };
  }

  return { id: "xai-validation-probe" };
}
