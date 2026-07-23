import { describe, expect, it } from "vitest";

import { createStubLLMProvider } from "../src/factory/providers/stub-provider.js";
import type { CompletionRequest } from "../src/factory/providers/provider-types.js";

const baseRequest: CompletionRequest = {
  model: "stub-deterministic-v1",
  system: "You are the positioning specialist.",
  messages: [{ role: "user", content: "Draft a positioning brief for Acme Advisory." }]
};

describe("stub LLM provider", () => {
  it("never touches the network and requires no real credential to validate", async () => {
    const provider = createStubLLMProvider();
    const result = await provider.validateCredential("not-a-real-secret");
    expect(result).toEqual({ valid: true });
  });

  it("is deterministic: identical requests produce identical completions", async () => {
    const provider = createStubLLMProvider();
    const first = await provider.complete(baseRequest, "unused-secret");
    const second = await provider.complete(baseRequest, "unused-secret");
    expect(second).toEqual(first);
  });

  it("varies output when the request content varies", async () => {
    const provider = createStubLLMProvider();
    const first = await provider.complete(baseRequest, "unused-secret");
    const second = await provider.complete(
      { ...baseRequest, messages: [{ role: "user", content: "Draft a positioning brief for Beta Studio." }] },
      "unused-secret"
    );
    expect(second.text).not.toBe(first.text);
    expect(second.providerRequestId).not.toBe(first.providerRequestId);
  });

  it("derives a stable providerRequestId shaped like stub-<hash> and zero cost", async () => {
    const provider = createStubLLMProvider();
    const result = await provider.complete(baseRequest, "unused-secret");
    expect(result.providerRequestId).toMatch(/^stub-[0-9a-f]{16}$/);
    expect(result.costUsd).toBe(0);
    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.outputTokens).toBeGreaterThan(0);
  });

  it("lists capabilities under the requested provider key", () => {
    const provider = createStubLLMProvider({ key: "openai" });
    const capabilities = provider.listCapabilities();
    expect(capabilities.providerKey).toBe("openai");
    expect(capabilities.models).toHaveLength(1);
    expect(capabilities.models[0]?.providerKey).toBe("openai");
  });

  it("estimateCost stays deterministic and zero for the stub", () => {
    const provider = createStubLLMProvider();
    expect(provider.estimateCost("stub-deterministic-v1", { inputTokens: 1000, outputTokens: 500 })).toBe(0);
  });
});
