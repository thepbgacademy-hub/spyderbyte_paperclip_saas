import { describe, expect, it } from "vitest";

import { createGenericApiProvider, OPENAI_PROVIDER } from "../src/providers/provider-types.js";

describe("provider definitions", () => {
  it("defines the OpenAI lane as a customer BYOK secret plus optional project metadata", () => {
    expect(OPENAI_PROVIDER.kind).toBe("openai");
    expect(OPENAI_PROVIDER.requiredSecrets).toEqual([
      {
        name: "apiKey",
        envName: "OPENAI_API_KEY",
        description: "Customer-provided OpenAI API key stored only by secret reference."
      }
    ]);
    expect(OPENAI_PROVIDER.metadataFields).toEqual(["projectId"]);
  });

  it("creates generic provider definitions for later API providers", () => {
    const provider = createGenericApiProvider({
      label: "Example AI",
      requiredSecrets: [
        {
          name: "apiKey",
          envName: "EXAMPLE_AI_API_KEY",
          description: "Customer-provided provider API key."
        }
      ],
      metadataFields: ["baseUrl"]
    });

    expect(provider).toEqual({
      kind: "generic_api",
      label: "Example AI",
      requiredSecrets: [
        {
          name: "apiKey",
          envName: "EXAMPLE_AI_API_KEY",
          description: "Customer-provided provider API key."
        }
      ],
      metadataFields: ["baseUrl"]
    });
  });

  it("rejects generic providers without declared secrets", () => {
    expect(() => createGenericApiProvider({ label: "Broken", requiredSecrets: [] })).toThrow(
      "Generic provider must declare at least one secret requirement"
    );
  });

  it("rejects secret-like metadata fields for generic providers", () => {
    expect(() =>
      createGenericApiProvider({
        label: "Broken",
        requiredSecrets: [
          {
            name: "apiKey",
            envName: "BROKEN_API_KEY",
            description: "Customer-provided provider API key."
          }
        ],
        metadataFields: ["baseUrl", "authorizationToken"]
      })
    ).toThrow('Provider metadata field "authorizationToken" looks secret-like');
  });
});
