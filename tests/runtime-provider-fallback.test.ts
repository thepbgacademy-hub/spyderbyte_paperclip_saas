import { describe, expect, it } from "vitest";

import { RuntimeProviderFallbackError, createDebugSharedProviderFallbackResolver } from "../src/providers/runtime-provider-fallback.js";

describe("runtime provider fallback", () => {
  it("builds debug shared provider execution context from operator credentials", async () => {
    const resolver = createDebugSharedProviderFallbackResolver({
      providerKind: "openai_api",
      apiKey: "sk-operator-debug",
      projectId: "proj_debug",
      label: "Operator OpenAI"
    });

    await expect(resolver.resolveForRun({ requiredCapabilities: ["text_generation"] })).resolves.toEqual([
      {
        capability: "text_generation",
        providerKind: "openai_api",
        label: "Operator OpenAI",
        secretRef: "wf_debug_shared_provider",
        metadata: { projectId: "proj_debug" },
        secretValues: { apiKey: "sk-operator-debug" }
      }
    ]);
  });

  it("fails closed when debug shared credentials are missing", async () => {
    const resolver = createDebugSharedProviderFallbackResolver({});

    await expect(resolver.resolveForRun({ requiredCapabilities: ["text_generation"] })).rejects.toEqual(
      new RuntimeProviderFallbackError("shared_secret_missing")
    );
  });
});
