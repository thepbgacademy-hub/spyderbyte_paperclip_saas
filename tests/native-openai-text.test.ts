import { describe, expect, it, vi } from "vitest";

import { createNativeOpenAITextGenerator, NativeOpenAIExecutionError } from "../src/providers/native-openai-text.js";

describe("native OpenAI text generator", () => {
  it("calls the Responses API with the bound api key and optional project header", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: "Validated the pricing floor and preserved the next action." })
    });
    const generator = createNativeOpenAITextGenerator({
      fetch: fetch as unknown as typeof globalThis.fetch,
      model: "gpt-4.1-mini"
    });

    await expect(
      generator.generateLaneResult({
        workflowId: "wf_connect_first_workflow",
        binding: {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Primary OpenAI",
          secretRef: "wf_secret_openai",
          metadata: { projectId: "proj_123" },
          secretValues: { apiKey: "sk-tenant" }
        },
        executionEnvelope: {
          tenantId: "tenant-1",
          runId: "run-1",
          workflowId: "wf_connect_first_workflow",
          requiredCapabilities: ["text_generation"],
          runtimeContext: {
            providerKind: "openai_api",
            credentialLabel: "Primary OpenAI"
          },
          executionClaim: {
            kind: "approved_claim",
            token: "claim-cfo-1",
            claimedAt: "2026-05-21T10:04:00.000Z",
            previousClaimedAt: null
          },
          laneExecution: {
            cardId: "card_cfo",
            persona: "cfo",
            title: "Pressure-test the pricing lane",
            deliverableType: "pricing_review",
            state: "working",
            resumeFocus: "Check the revised price floor."
          },
          continuityContext: {
            source: "resume_override",
            summary: "Resume the pricing lane from the revised assumptions workbook.",
            latestResultSummary: "Initial pricing floor is stable.",
            absorbedWorkCount: 1,
            latestAbsorbedWork: {
              resolution: "update_existing_lane",
              requestedByPersona: "CFO",
              title: "Re-check discount floor",
              label: "CFO: Re-check discount floor"
            },
            absorbedWorkTrail: [
              {
                resolution: "update_existing_lane",
                requestedByPersona: "CFO",
                title: "Re-check discount floor",
                label: "CFO: Re-check discount floor"
              }
            ]
          },
          outcomeContract: {
            allowedStates: ["waiting", "done", "blocked", "cancelled"],
            resultSummaryRequiredStates: ["done"],
            resumeSummaryAllowedStates: ["waiting", "blocked", "cancelled"]
          }
        }
      })
    ).resolves.toEqual({
      resultSummary: "Validated the pricing floor and preserved the next action.",
      model: "gpt-4.1-mini"
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-tenant",
          "Content-Type": "application/json",
          "OpenAI-Project": "proj_123"
        })
      })
    );
  });

  it("fails closed when the binding is not an OpenAI text lane", async () => {
    const generator = createNativeOpenAITextGenerator({
      fetch: vi.fn() as unknown as typeof globalThis.fetch
    });

    await expect(
      generator.generateLaneResult({
        workflowId: "wf_connect_first_workflow",
        binding: {
          capability: "text_generation",
          providerKind: "anthropic_api",
          label: "Anthropic",
          secretRef: "wf_secret_anthropic",
          metadata: {},
          secretValues: { apiKey: "sk-ant" }
        },
        executionEnvelope: {
          tenantId: "tenant-1",
          runId: "run-1",
          workflowId: "wf_connect_first_workflow",
          requiredCapabilities: ["text_generation"],
          runtimeContext: {
            providerKind: "openai_api",
            credentialLabel: "Primary OpenAI"
          },
          executionClaim: {
            kind: "approved_claim",
            token: "claim-cfo-1",
            claimedAt: "2026-05-21T10:04:00.000Z",
            previousClaimedAt: null
          },
          laneExecution: {
            cardId: "card_cfo",
            persona: "cfo",
            title: "Pressure-test the pricing lane",
            deliverableType: "pricing_review",
            state: "working"
          },
          outcomeContract: {
            allowedStates: ["waiting", "done", "blocked", "cancelled"],
            resultSummaryRequiredStates: ["done"],
            resumeSummaryAllowedStates: ["waiting", "blocked", "cancelled"]
          }
        }
      })
    ).rejects.toMatchObject({
      name: "NativeOpenAIExecutionError",
      reason: "provider_kind_unsupported"
    } satisfies Partial<NativeOpenAIExecutionError>);
  });

  it("fails closed when the provider request returns a non-ok response", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized"
    });
    const generator = createNativeOpenAITextGenerator({
      fetch: fetch as unknown as typeof globalThis.fetch
    });

    await expect(
      generator.generateLaneResult({
        workflowId: "wf_connect_first_workflow",
        binding: {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Primary OpenAI",
          secretRef: "wf_secret_openai",
          metadata: {},
          secretValues: { apiKey: "sk-tenant" }
        },
        executionEnvelope: {
          tenantId: "tenant-1",
          runId: "run-1",
          workflowId: "wf_connect_first_workflow",
          requiredCapabilities: ["text_generation"],
          runtimeContext: {
            providerKind: "openai_api",
            credentialLabel: "Primary OpenAI"
          },
          executionClaim: {
            kind: "approved_claim",
            token: "claim-cfo-1",
            claimedAt: "2026-05-21T10:04:00.000Z",
            previousClaimedAt: null
          },
          laneExecution: {
            cardId: "card_cfo",
            persona: "cfo",
            title: "Pressure-test the pricing lane",
            deliverableType: "pricing_review",
            state: "working"
          },
          outcomeContract: {
            allowedStates: ["waiting", "done", "blocked", "cancelled"],
            resultSummaryRequiredStates: ["done"],
            resumeSummaryAllowedStates: ["waiting", "blocked", "cancelled"]
          }
        }
      })
    ).rejects.toMatchObject({
      name: "NativeOpenAIExecutionError",
      reason: "request_failed"
    } satisfies Partial<NativeOpenAIExecutionError>);
  });

  it("fails closed when the provider response contains no usable text", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ output: [] })
    });
    const generator = createNativeOpenAITextGenerator({
      fetch: fetch as unknown as typeof globalThis.fetch
    });

    await expect(
      generator.generateLaneResult({
        workflowId: "wf_connect_first_workflow",
        binding: {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Primary OpenAI",
          secretRef: "wf_secret_openai",
          metadata: {},
          secretValues: { apiKey: "sk-tenant" }
        },
        executionEnvelope: {
          tenantId: "tenant-1",
          runId: "run-1",
          workflowId: "wf_connect_first_workflow",
          requiredCapabilities: ["text_generation"],
          runtimeContext: {
            providerKind: "openai_api",
            credentialLabel: "Primary OpenAI"
          },
          executionClaim: {
            kind: "approved_claim",
            token: "claim-cfo-1",
            claimedAt: "2026-05-21T10:04:00.000Z",
            previousClaimedAt: null
          },
          laneExecution: {
            cardId: "card_cfo",
            persona: "cfo",
            title: "Pressure-test the pricing lane",
            deliverableType: "pricing_review",
            state: "working"
          },
          outcomeContract: {
            allowedStates: ["waiting", "done", "blocked", "cancelled"],
            resultSummaryRequiredStates: ["done"],
            resumeSummaryAllowedStates: ["waiting", "blocked", "cancelled"]
          }
        }
      })
    ).rejects.toMatchObject({
      name: "NativeOpenAIExecutionError",
      reason: "response_invalid"
    } satisfies Partial<NativeOpenAIExecutionError>);
  });
});
