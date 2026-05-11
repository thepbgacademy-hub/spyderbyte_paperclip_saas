import { describe, expect, it } from "vitest";

import {
  ANTHROPIC_PROVIDER,
  CODEX_SUBSCRIPTION_PROVIDER,
  OPENROUTER_PROVIDER,
  XAI_GROK_PROVIDER,
  validateCodexSubscriptionRegistration
} from "../src/providers/provider-types.js";

describe("expanded provider credential lanes", () => {
  it("defines Anthropic, xAI/Grok, and OpenRouter as company-specific API-key lanes", () => {
    expect(ANTHROPIC_PROVIDER.requiredSecrets[0].envName).toBe("ANTHROPIC_API_KEY");
    expect(XAI_GROK_PROVIDER.requiredSecrets[0].envName).toBe("XAI_API_KEY");
    expect(OPENROUTER_PROVIDER.requiredSecrets[0].envName).toBe("OPENROUTER_API_KEY");
  });

  it("defines Codex subscription auth as isolated auth state, not API key billing", () => {
    expect(CODEX_SUBSCRIPTION_PROVIDER.kind).toBe("openai_chatgpt_codex_subscription");
    expect(CODEX_SUBSCRIPTION_PROVIDER.metadataFields).toEqual([]);
    expect(() =>
      validateCodexSubscriptionRegistration({
        tenantId: "tenant-1",
        codexHome: "C:/Users/operator/.codex/tenant-1",
        authStateRef: "secret_ref_1",
        runtimeEnv: {}
      })
    ).toThrow("Codex subscription auth must use an isolated tenant auth home");

    expect(() =>
      validateCodexSubscriptionRegistration({
        tenantId: "tenant-1",
        codexHome: "E:/wf-auth/tenant-10",
        authStateRef: "secret_ref_1",
        runtimeEnv: {}
      })
    ).toThrow("Codex subscription auth must use an isolated tenant auth home");

    expect(() =>
      validateCodexSubscriptionRegistration({
        tenantId: "tenant-1",
        codexHome: "E:/wf-auth/tenant-1/../tenant-2",
        authStateRef: "secret_ref_1",
        runtimeEnv: {}
      })
    ).toThrow("Codex subscription auth must use an isolated tenant auth home");

    expect(() =>
      validateCodexSubscriptionRegistration({
        tenantId: "tenant-1",
        codexHome: "E:/wf-auth/tenant-1",
        authStateRef: "secret_ref_1",
        runtimeEnv: { OPENAI_API_KEY: "sk-secret" }
      })
    ).toThrow("OPENAI_API_KEY must be absent");
  });
});
