import { describe, expect, it, vi } from "vitest";

import { RuntimeProviderExecutionError, createRuntimeProviderExecutionContextResolver } from "../src/providers/runtime-provider-execution.js";

describe("runtime provider execution context", () => {
  it("hydrates provider bindings with vault-backed secret values just-in-time", async () => {
    const resolver = createRuntimeProviderExecutionContextResolver({
      accessSecretRef: vi.fn().mockResolvedValue({ apiKey: "sk-openai-secret" })
    });

    await expect(
      resolver.resolveForRun({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf-social-calendar",
        providerBindings: [
          {
            capability: "text_generation",
            providerKind: "openai_api",
            label: "Primary OpenAI",
            secretRef: "wf_secret_openai",
            metadata: { projectId: "proj_123" }
          }
        ]
      })
    ).resolves.toEqual([
      {
        capability: "text_generation",
        providerKind: "openai_api",
        label: "Primary OpenAI",
        secretRef: "wf_secret_openai",
        metadata: { projectId: "proj_123" },
        secretValues: { apiKey: "sk-openai-secret" }
      }
    ]);
  });

  it("fails closed when vault access returns a non-record secret payload", async () => {
    const resolver = createRuntimeProviderExecutionContextResolver({
      accessSecretRef: vi.fn().mockResolvedValue("sk-openai-secret")
    });

    await expect(
      resolver.resolveForRun({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf-social-calendar",
        providerBindings: [
          {
            capability: "text_generation",
            providerKind: "openai_api",
            label: "Primary OpenAI",
            secretRef: "wf_secret_openai",
            metadata: {}
          }
        ]
      })
    ).rejects.toEqual(
      new RuntimeProviderExecutionError({
        tenantId: "tenant-1",
        workflowId: "wf-social-calendar",
        providerKind: "openai_api",
        reason: "secret_payload_invalid"
      })
    );
  });

  it("fails closed when runtime execution is asked to hydrate more than one provider binding", async () => {
    const accessSecretRef = vi.fn();
    const resolver = createRuntimeProviderExecutionContextResolver({
      accessSecretRef
    });

    await expect(
      resolver.resolveForRun({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf-social-calendar",
        providerBindings: [
          {
            capability: "text_generation",
            providerKind: "openai_api",
            label: "Primary OpenAI",
            secretRef: "wf_secret_openai",
            metadata: {}
          },
          {
            capability: "image_generation",
            providerKind: "openai_api",
            label: "Primary OpenAI",
            secretRef: "wf_secret_openai",
            metadata: {}
          }
        ]
      })
    ).rejects.toEqual(
      new RuntimeProviderExecutionError({
        tenantId: "tenant-1",
        workflowId: "wf-social-calendar",
        providerKind: "openai_api",
        reason: "multi_provider_binding_unsupported"
      })
    );
    expect(accessSecretRef).not.toHaveBeenCalled();
  });
});
