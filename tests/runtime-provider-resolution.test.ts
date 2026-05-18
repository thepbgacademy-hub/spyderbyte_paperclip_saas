import { describe, expect, it } from "vitest";

import { RuntimeProviderResolutionError, createRuntimeProviderResolver } from "../src/providers/runtime-provider-resolution.js";

describe("runtime provider resolution", () => {
  it("prefers the default provider order for a required capability", async () => {
    const resolver = createRuntimeProviderResolver({
      listProviderConnections: async () => [
        {
          tenantId: "tenant-1",
          providerKind: "generic_api",
          label: "Fallback Text",
          secretRef: "wf_secret_generic",
          metadata: {},
          capabilities: ["text_generation"]
        },
        {
          tenantId: "tenant-1",
          providerKind: "openai_api",
          label: "Primary OpenAI",
          secretRef: "wf_secret_openai",
          metadata: { projectId: "proj_123" },
          capabilities: ["text_generation", "image_generation"]
        }
      ]
    });

    await expect(
      resolver.resolveForWorkflow({
        tenantId: "tenant-1",
        workflowId: "wf-social-calendar",
        requiredCapabilities: ["text_generation"]
      })
    ).resolves.toEqual([
      {
        capability: "text_generation",
        providerKind: "openai_api",
        label: "Primary OpenAI",
        secretRef: "wf_secret_openai",
        metadata: { projectId: "proj_123" }
      }
    ]);
  });

  it("returns one active provider binding per required capability", async () => {
    const resolver = createRuntimeProviderResolver({
      listProviderConnections: async () => [
        {
          tenantId: "tenant-1",
          providerKind: "openai_api",
          label: "Primary OpenAI",
          secretRef: "wf_secret_openai",
          metadata: {},
          capabilities: ["text_generation"]
        },
        {
          tenantId: "tenant-1",
          providerKind: "generic_api",
          label: "Media Storage",
          secretRef: "wf_secret_storage",
          metadata: {},
          capabilities: ["media_storage"]
        }
      ]
    });

    await expect(
      resolver.resolveForWorkflow({
        tenantId: "tenant-1",
        workflowId: "wf-social-calendar",
        requiredCapabilities: ["text_generation", "media_storage"]
      })
    ).resolves.toEqual([
      {
        capability: "text_generation",
        providerKind: "openai_api",
        label: "Primary OpenAI",
        secretRef: "wf_secret_openai",
        metadata: {}
      },
      {
        capability: "media_storage",
        providerKind: "generic_api",
        label: "Media Storage",
        secretRef: "wf_secret_storage",
        metadata: {}
      }
    ]);
  });

  it("fails closed when no active provider connection can satisfy a required capability", async () => {
    const resolver = createRuntimeProviderResolver({
      listProviderConnections: async () => [
        {
          tenantId: "tenant-1",
          providerKind: "openai_api",
          label: "Revoked OpenAI",
          secretRef: "wf_secret_openai_old",
          metadata: {},
          capabilities: ["text_generation"],
          revokedAt: "2026-05-18T00:00:00.000Z"
        }
      ]
    });

    await expect(
      resolver.resolveForWorkflow({
        tenantId: "tenant-1",
        workflowId: "wf-social-calendar",
        requiredCapabilities: ["text_generation"]
      })
    ).rejects.toEqual(
      new RuntimeProviderResolutionError({
        tenantId: "tenant-1",
        workflowId: "wf-social-calendar",
        capability: "text_generation"
      })
    );
  });
});
