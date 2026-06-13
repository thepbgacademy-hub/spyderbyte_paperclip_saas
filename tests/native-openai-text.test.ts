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
          orchestratorHandoff: {
            orchestratorPersona: "ceo",
            dispatchReason: "The CEO approved this lane for its next bounded execution step.",
            scopeGuard:
              "Stay inside this lane only. Do not open new lanes, widen package scope, or assume new governance approval beyond this execution handoff.",
            completionRule:
              "Return exactly one bounded lane outcome: done only when this lane is complete, waiting when an explicit resume is needed, blocked when a prerequisite is missing, or cancelled when the lane should end without completion.",
            resumeDirective: "Resume the pricing lane from the revised assumptions workbook."
          },
          outcomeContract: {
            allowedStates: ["waiting", "done", "blocked", "cancelled"],
            resultSummaryRequiredStates: ["done"],
            resumeSummaryAllowedStates: ["waiting", "blocked", "cancelled"],
            postOutcomeDirectives: [
              {
                outcomeState: "waiting",
                runState: "waiting",
                actionKind: "await_lane_resume",
                summary: "If this lane ends waiting, the board will require an explicit resume decision on this lane.",
                targetCardId: "card_cfo",
                targetPersona: "cfo"
              },
              {
                outcomeState: "done",
                runState: "done",
                actionKind: "none",
                summary: "If this lane ends done, no automatic post-outcome action will be scheduled."
              },
              {
                outcomeState: "blocked",
                runState: "blocked",
                actionKind: "await_unblock",
                summary: "If this lane ends blocked, the board will require an explicit unblock decision on this lane.",
                targetCardId: "card_cfo",
                targetPersona: "cfo"
              },
              {
                outcomeState: "cancelled",
                runState: "done",
                actionKind: "none",
                summary: "If this lane ends cancelled, no automatic post-outcome action will be scheduled."
              }
            ]
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
    const request = fetch.mock.calls[0]?.[1];
    expect(typeof request?.body).toBe("string");
    const body = JSON.parse(String(request?.body));
    expect(body.input).toContain("Orchestrator persona: ceo");
    expect(body.input).toContain("Dispatch reason: The CEO approved this lane for its next bounded execution step.");
    expect(body.input).toContain("Scope guard: Stay inside this lane only. Do not open new lanes, widen package scope, or assume new governance approval beyond this execution handoff.");
    expect(body.input).toContain("Post-outcome contract:");
    expect(body.input).toContain("- waiting -> await_lane_resume (run state: waiting): If this lane ends waiting, the board will require an explicit resume decision on this lane. [target persona: cfo; target card: card_cfo]");
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
          orchestratorHandoff: {
            orchestratorPersona: "ceo",
            dispatchReason: "The CEO approved this lane for its next bounded execution step.",
            scopeGuard:
              "Stay inside this lane only. Do not open new lanes, widen package scope, or assume new governance approval beyond this execution handoff.",
            completionRule:
              "Return exactly one bounded lane outcome: done only when this lane is complete, waiting when an explicit resume is needed, blocked when a prerequisite is missing, or cancelled when the lane should end without completion.",
            resumeDirective: null
          },
          outcomeContract: {
            allowedStates: ["waiting", "done", "blocked", "cancelled"],
            resultSummaryRequiredStates: ["done"],
            resumeSummaryAllowedStates: ["waiting", "blocked", "cancelled"],
            postOutcomeDirectives: []
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
          orchestratorHandoff: {
            orchestratorPersona: "ceo",
            dispatchReason: "The CEO approved this lane for its next bounded execution step.",
            scopeGuard:
              "Stay inside this lane only. Do not open new lanes, widen package scope, or assume new governance approval beyond this execution handoff.",
            completionRule:
              "Return exactly one bounded lane outcome: done only when this lane is complete, waiting when an explicit resume is needed, blocked when a prerequisite is missing, or cancelled when the lane should end without completion.",
            resumeDirective: null
          },
          outcomeContract: {
            allowedStates: ["waiting", "done", "blocked", "cancelled"],
            resultSummaryRequiredStates: ["done"],
            resumeSummaryAllowedStates: ["waiting", "blocked", "cancelled"],
            postOutcomeDirectives: []
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
          orchestratorHandoff: {
            orchestratorPersona: "ceo",
            dispatchReason: "The CEO approved this lane for its next bounded execution step.",
            scopeGuard:
              "Stay inside this lane only. Do not open new lanes, widen package scope, or assume new governance approval beyond this execution handoff.",
            completionRule:
              "Return exactly one bounded lane outcome: done only when this lane is complete, waiting when an explicit resume is needed, blocked when a prerequisite is missing, or cancelled when the lane should end without completion.",
            resumeDirective: null
          },
          outcomeContract: {
            allowedStates: ["waiting", "done", "blocked", "cancelled"],
            resultSummaryRequiredStates: ["done"],
            resumeSummaryAllowedStates: ["waiting", "blocked", "cancelled"],
            postOutcomeDirectives: []
          }
        }
      })
    ).rejects.toMatchObject({
      name: "NativeOpenAIExecutionError",
      reason: "response_invalid"
    } satisfies Partial<NativeOpenAIExecutionError>);
  });
});
