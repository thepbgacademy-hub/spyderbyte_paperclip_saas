import { describe, expect, it, vi } from "vitest";

import {
  createRuntimeHarnessCeoGoalExecutor,
  HarnessCeoGoalExecutionError
} from "../src/harness/ceo-goal-executor.js";

describe("harness CEO goal executor", () => {
  it("hydrates a run-bound provider context and parses a bounded CEO lane plan", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          action: "open_new_lane",
          persona: "researcher",
          title: "Gather competitor pricing anchors",
          deliverableType: "research_brief",
          tenantResponse: "I opened a bounded research lane so we can answer this goal without widening the workflow."
        })
      })
    });
    const executor = createRuntimeHarnessCeoGoalExecutor({
      loadBoundProviderContext: vi.fn().mockResolvedValue([
        {
          providerKind: "openai_api",
          secretRef: "wf_secret_demo_openai",
          metadata: {}
        }
      ]),
      hydrateProviderContext: vi.fn().mockResolvedValue([
        {
          providerKind: "openai_api",
          secretRef: "wf_secret_demo_openai",
          metadata: {},
          secretValues: { apiKey: "test-openai-key" }
        }
      ]),
      fetch
    });

    const result = await executor.execute({
      tenantId: "tenant_123",
      userId: "user_123",
      runId: "run_123",
      workflowId: "wf_connect_first_workflow",
      workflowDefinition: {
        publicId: "wf_connect_first_workflow",
        packageId: "pkg_bib_connect",
        publicName: "Connect First Workflow",
        description: "CEO-led first-workflow setup run inside the Wealth Factory harness.",
        allowedDeliverableTypes: ["research_brief", "pricing_review"],
        requiredCapabilities: ["text_generation"]
      },
      goal: "Find the competitor pricing gap before we change the offer.",
      board: {
        runId: "run_123",
        workflowId: "wf_connect_first_workflow",
        runState: "active",
        cards: [
          {
            id: "card_ceo_1",
            persona: "CEO",
            title: "Shape the launch plan",
            lane: "planning",
            statusLabel: "Planning",
            deliverableLabel: "Launch Plan",
            outcome: "The board is shaping the next move."
          }
        ],
        pendingApprovals: [],
        recentDecisions: []
      }
    });

    expect(result).toEqual({
      action: "open_new_lane",
      persona: "researcher",
      title: "Gather competitor pricing anchors",
      deliverableType: "research_brief",
      tenantResponse: "I opened a bounded research lane so we can answer this goal without widening the workflow."
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]?.[1]?.body)).toContain("Find the competitor pricing gap before we change the offer.");
    expect(String(fetch.mock.calls[0]?.[1]?.body)).toContain("Allowed deliverable types: research_brief, pricing_review");
  });

  it("fails closed when the CEO loop returns invalid structured JSON", async () => {
    const executor = createRuntimeHarnessCeoGoalExecutor({
      loadBoundProviderContext: vi.fn().mockResolvedValue([
        {
          providerKind: "openai_api",
          secretRef: "wf_secret_demo_openai",
          metadata: {}
        }
      ]),
      hydrateProviderContext: vi.fn().mockResolvedValue([
        {
          providerKind: "openai_api",
          secretRef: "wf_secret_demo_openai",
          metadata: {},
          secretValues: { apiKey: "test-openai-key" }
        }
      ]),
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          output_text: "{\"action\":\"open_new_lane\""
        })
      })
    });

    await expect(
      executor.execute({
        tenantId: "tenant_123",
        userId: "user_123",
        runId: "run_123",
        workflowId: "wf_connect_first_workflow",
        workflowDefinition: {
          publicId: "wf_connect_first_workflow",
          packageId: "pkg_bib_connect",
          publicName: "Connect First Workflow",
          description: "CEO-led first-workflow setup run inside the Wealth Factory harness.",
          allowedDeliverableTypes: ["research_brief"],
          requiredCapabilities: ["text_generation"]
        },
        goal: "Find the competitor pricing gap before we change the offer.",
        board: {
          runId: "run_123",
          workflowId: "wf_connect_first_workflow",
          runState: "active",
          cards: [],
          pendingApprovals: [],
          recentDecisions: []
        }
      })
    ).rejects.toMatchObject({
      code: "harness_ceo_goal_execution_failed",
      reason: "response_invalid"
    } satisfies Partial<HarnessCeoGoalExecutionError>);
  });
});
