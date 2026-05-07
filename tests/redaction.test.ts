import { describe, expect, it } from "vitest";

import { redactSecrets, safeAuditMetadata } from "../src/secrets/redaction.js";

describe("redactSecrets", () => {
  it("redacts common API keys, tokens, and secret-looking values", () => {
    expect(
      redactSecrets({
        apiKey: "sk-test-secret",
        nested: { authorization: "Bearer abc123", projectId: "proj_123" },
        message: "OPENAI_API_KEY=sk-live-value"
      })
    ).toEqual({
      apiKey: "[REDACTED]",
      nested: { authorization: "[REDACTED]", projectId: "proj_123" },
      message: "OPENAI_API_KEY=[REDACTED]"
    });
  });

  it("builds audit metadata without raw secret references or values", () => {
    expect(
      safeAuditMetadata({
        providerKind: "openai",
        secretRef: "vault://tenant/openai",
        rawSecretValue: "sk-live-value",
        projectId: "proj_123"
      })
    ).toEqual({
      providerKind: "openai",
      projectId: "proj_123"
    });
  });
});
