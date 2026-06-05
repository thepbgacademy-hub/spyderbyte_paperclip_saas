import { describe, expect, it, vi } from "vitest";

import { createDefaultNativeExecutor } from "../src/worker/native-executor.js";

function buildExecutionEnvelope() {
  return {
    tenantId: "tenant-1",
    runId: "run-1",
    workflowId: "wf_connect_first_workflow",
    requiredCapabilities: ["text_generation"] as const,
    runtimeContext: {
      providerKind: "openai_api" as const,
      credentialLabel: "Primary OpenAI"
    },
    executionClaim: {
      kind: "approved_claim" as const,
      token: "claim-cfo-1",
      claimedAt: "2026-05-21T10:04:00.000Z",
      previousClaimedAt: null
    },
    laneExecution: {
      cardId: "card_cfo",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review",
      state: "working" as const,
      resumeFocus: "Check the revised price floor."
    },
    continuityContext: {
      source: "resume_override" as const,
      summary: "Resume the pricing lane from the revised assumptions workbook.",
      latestResultSummary: "Initial pricing floor is stable.",
      absorbedWorkCount: 1,
      latestAbsorbedWork: {
        resolution: "update_existing_lane" as const,
        requestedByPersona: "CFO",
        title: "Re-check discount floor",
        label: "CFO: Re-check discount floor"
      },
      absorbedWorkTrail: [
        {
          resolution: "update_existing_lane" as const,
          requestedByPersona: "CFO",
          title: "Re-check discount floor",
          label: "CFO: Re-check discount floor"
        }
      ]
    },
    outcomeContract: {
      allowedStates: ["waiting", "done", "blocked", "cancelled"] as const,
      resultSummaryRequiredStates: ["done"] as const,
      resumeSummaryAllowedStates: ["waiting", "blocked", "cancelled"] as const
    }
  };
}

describe("default native executor", () => {
  it("completes the connect-first workflow family natively through the provider lane", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: "{\"state\":\"done\",\"summary\":\"Validated the pricing floor and preserved the next action.\"}"
      })
    });
    const executor = createDefaultNativeExecutor({
      fetch: fetch as unknown as typeof globalThis.fetch,
      openAIModel: "gpt-4.1-mini"
    });

    await expect(
      executor.execute({
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        executionEnvelope: buildExecutionEnvelope(),
        providerBinding: {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Primary OpenAI",
          secretRef: "wf_secret_openai",
          metadata: { projectId: "proj_123" },
          secretValues: { apiKey: "sk-tenant" }
        }
      })
    ).resolves.toEqual({
      state: "done",
      resultSummary:
        "Completed the Connect First Workflow pricing review lane for CFO: Pressure-test the pricing lane. " +
        "Validated the pricing floor and preserved the next action."
    });
  });

  it("keeps the connect-first workflow family waiting when the provider says the lane needs more information", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text:
          "{\"state\":\"waiting\",\"summary\":\"Need the updated competitor discount sheet before the pricing recommendation can be finalized.\"}"
      })
    });
    const executor = createDefaultNativeExecutor({
      fetch: fetch as unknown as typeof globalThis.fetch
    });

    await expect(
      executor.execute({
        tenantId: "tenant-1",
        runId: "run-3",
        workflowId: "wf_connect_first_workflow",
        executionEnvelope: buildExecutionEnvelope(),
        providerBinding: {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Primary OpenAI",
          secretRef: "wf_secret_openai",
          metadata: {},
          secretValues: { apiKey: "sk-tenant" }
        }
      })
    ).resolves.toEqual({
      state: "waiting",
      resumeSummary:
        "Connect First Workflow pricing review lane for CFO: Pressure-test the pricing lane needs an explicit resume action. " +
        "Need the updated competitor discount sheet before the pricing recommendation can be finalized."
    });
  });

  it("accepts a fenced workflow decision without truncating or rejecting the structured response", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text:
          "```json\n{\"state\":\"done\",\"summary\":\"Validated the pricing floor after reconciling the latest competitor anchor sheet and preserved the next action for leadership review.\"}\n```"
      })
    });
    const executor = createDefaultNativeExecutor({
      fetch: fetch as unknown as typeof globalThis.fetch
    });

    await expect(
      executor.execute({
        tenantId: "tenant-1",
        runId: "run-4",
        workflowId: "wf_connect_first_workflow",
        executionEnvelope: buildExecutionEnvelope(),
        providerBinding: {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Primary OpenAI",
          secretRef: "wf_secret_openai",
          metadata: {},
          secretValues: { apiKey: "sk-tenant" }
        }
      })
    ).resolves.toEqual({
      state: "done",
      resultSummary:
        "Completed the Connect First Workflow pricing review lane for CFO: Pressure-test the pricing lane. " +
        "Validated the pricing floor after reconciling the latest competitor anchor sheet and preserved the next action for leadership review."
    });
  });

  it("keeps unknown native workflow families fail-closed until they have their own implementation", async () => {
    const fetch = vi.fn();
    const executor = createDefaultNativeExecutor({
      fetch: fetch as unknown as typeof globalThis.fetch
    });

    await expect(
      executor.execute({
        tenantId: "tenant-1",
        runId: "run-2",
        workflowId: "wf_unknown_native_family",
        executionEnvelope: buildExecutionEnvelope(),
        providerBinding: {
          capability: "text_generation",
          providerKind: "openai_api",
          label: "Primary OpenAI",
          secretRef: "wf_secret_openai",
          metadata: {},
          secretValues: { apiKey: "sk-tenant" }
        }
      })
    ).resolves.toEqual({
      state: "blocked",
      resumeSummary:
        "Native execution is enabled for wf_unknown_native_family, but no workflow-family implementation is registered yet. " +
        "Keep this lane blocked until a bounded native executor is added for CFO: Pressure-test the pricing lane."
    });

    expect(fetch).not.toHaveBeenCalled();
  });
});
