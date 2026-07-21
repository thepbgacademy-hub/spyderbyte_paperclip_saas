import { describe, expect, it, vi } from "vitest";

import { executeNativeHarnessLane } from "../src/worker/runtime-native-execution.js";
import { NativeOpenAIExecutionError } from "../src/providers/native-openai-text.js";

describe("runtime native execution failure mapping", () => {
  it("surfaces a truthful blocked summary when Codex subscription auth metadata is missing", async () => {
    const commitNativeOutcome = vi.fn().mockResolvedValue({
      status: "committed",
      workflowId: "wf_connect_first_workflow"
    });

    await executeNativeHarnessLane({
      commitNativeOutcome,
      dispatch: {
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        status: "running",
        laneExecution: {
          cardId: "card-1",
          persona: "cfo",
          title: "Pressure-test the pricing lane",
          deliverableType: "pricing_review",
          state: "working"
        }
      },
      executionEnvelope: {
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        requiredCapabilities: ["text_generation"],
        runtimeContext: {
          providerKind: "openai_chatgpt_codex_subscription",
          credentialLabel: "OpenAI Codex"
        },
        executionClaim: {
          kind: "approved_claim",
          token: "claim-1",
          claimedAt: "2026-07-06T00:00:00.000Z",
          previousClaimedAt: null
        },
        laneExecution: {
          cardId: "card-1",
          persona: "cfo",
          title: "Pressure-test the pricing lane",
          deliverableType: "pricing_review",
          state: "working"
        },
        continuityContext: {
          source: "resume_override",
          summary: "Resume the pricing lane from the refreshed assumptions.",
          latestResultSummary: null,
          absorbedWorkCount: 0,
          absorbedWorkTrail: []
        },
        orchestratorHandoff: {
          orchestratorPersona: "ceo",
          dispatchReason: "The CEO approved this lane for its next bounded execution step.",
          scopeGuard:
            "Stay inside this lane only. Do not open new lanes, widen package scope, or assume new governance approval beyond this execution handoff.",
          completionRule:
            "Return exactly one bounded lane outcome: done only when this lane is complete, waiting when an explicit resume is needed, blocked when a prerequisite is missing, or cancelled when the lane should end without completion.",
          resumeDirective: "Resume the pricing lane from the refreshed assumptions."
        },
        boardContext: {
          runState: "active",
          activeAttention: null,
          parentLane: {
            cardId: "card-ceo",
            persona: "ceo",
            title: "Plan run",
            deliverableType: "plan",
            state: "planning"
          },
          siblingLanes: []
        },
        outcomeContract: {
          allowedStates: ["waiting", "done", "blocked", "cancelled"],
          resultSummaryRequiredStates: ["done"],
          resumeSummaryAllowedStates: ["waiting", "blocked", "cancelled"],
          postOutcomeDirectives: []
        }
      },
      hydrateProviderContext: vi.fn().mockResolvedValue([
        {
          capability: "text_generation",
          providerKind: "openai_chatgpt_codex_subscription",
          label: "OpenAI Codex",
          secretRef: "wf_secret_codex",
          metadata: {
            codexHome: "/home/deploy/wealth-factory-stage/codex-homes/first-subscriber",
            authStateRef: "first-subscriber-openai-device"
          },
          secretValues: {}
        }
      ]),
      loadBoundProviderContext: vi.fn().mockResolvedValue([
        {
          capability: "text_generation",
          providerKind: "openai_chatgpt_codex_subscription",
          label: "OpenAI Codex",
          secretRef: "wf_secret_codex",
          metadata: {
            codexHome: "/home/deploy/wealth-factory-stage/codex-homes/first-subscriber",
            authStateRef: "first-subscriber-openai-device"
          }
        }
      ]),
      nativeExecutor: {
        execute: vi.fn().mockRejectedValue(
          new NativeOpenAIExecutionError(
            "codex_subscription_auth_missing",
            "Native OpenAI Codex subscription execution requires an isolated codexHome and opaque authStateRef metadata."
          )
        )
      },
      payload: {
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf_connect_first_workflow"
      }
    });

    expect(commitNativeOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: {
          state: "blocked",
          resumeSummary:
            "Native execution could not continue because the Codex subscription binding is missing its isolated auth metadata. Keep this lane blocked until the subscription-backed provider binding is repaired."
        }
      })
    );
  });

  it("surfaces a truthful blocked summary when the Codex subscription refresh token is revoked", async () => {
    const commitNativeOutcome = vi.fn().mockResolvedValue({
      status: "committed",
      workflowId: "wf_connect_first_workflow"
    });

    await executeNativeHarnessLane({
      commitNativeOutcome,
      dispatch: {
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        status: "running",
        laneExecution: {
          cardId: "card-1",
          persona: "cfo",
          title: "Pressure-test the pricing lane",
          deliverableType: "pricing_review",
          state: "working"
        }
      },
      executionEnvelope: {
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf_connect_first_workflow",
        requiredCapabilities: ["text_generation"],
        runtimeContext: {
          providerKind: "openai_chatgpt_codex_subscription",
          credentialLabel: "OpenAI Codex"
        },
        executionClaim: {
          kind: "approved_claim",
          token: "claim-1",
          claimedAt: "2026-07-06T00:00:00.000Z",
          previousClaimedAt: null
        },
        laneExecution: {
          cardId: "card-1",
          persona: "cfo",
          title: "Pressure-test the pricing lane",
          deliverableType: "pricing_review",
          state: "working"
        },
        continuityContext: {
          source: "resume_override",
          summary: "Resume the pricing lane from the refreshed assumptions.",
          latestResultSummary: null,
          absorbedWorkCount: 0,
          absorbedWorkTrail: []
        },
        orchestratorHandoff: {
          orchestratorPersona: "ceo",
          dispatchReason: "The CEO approved this lane for its next bounded execution step.",
          scopeGuard:
            "Stay inside this lane only. Do not open new lanes, widen package scope, or assume new governance approval beyond this execution handoff.",
          completionRule:
            "Return exactly one bounded lane outcome: done only when this lane is complete, waiting when an explicit resume is needed, blocked when a prerequisite is missing, or cancelled when the lane should end without completion.",
          resumeDirective: "Resume the pricing lane from the refreshed assumptions."
        },
        boardContext: {
          runState: "active",
          activeAttention: null,
          parentLane: {
            cardId: "card-ceo",
            persona: "ceo",
            title: "Plan run",
            deliverableType: "plan",
            state: "planning"
          },
          siblingLanes: []
        },
        outcomeContract: {
          allowedStates: ["waiting", "done", "blocked", "cancelled"],
          resultSummaryRequiredStates: ["done"],
          resumeSummaryAllowedStates: ["waiting", "blocked", "cancelled"],
          postOutcomeDirectives: []
        }
      },
      hydrateProviderContext: vi.fn().mockResolvedValue([
        {
          capability: "text_generation",
          providerKind: "openai_chatgpt_codex_subscription",
          label: "OpenAI Codex",
          secretRef: "wf_secret_codex",
          metadata: {
            codexHome: "/home/deploy/wealth-factory-stage/codex-homes/first-subscriber",
            authStateRef: "first-subscriber-openai-device"
          },
          secretValues: {}
        }
      ]),
      loadBoundProviderContext: vi.fn().mockResolvedValue([
        {
          capability: "text_generation",
          providerKind: "openai_chatgpt_codex_subscription",
          label: "OpenAI Codex",
          secretRef: "wf_secret_codex",
          metadata: {
            codexHome: "/home/deploy/wealth-factory-stage/codex-homes/first-subscriber",
            authStateRef: "first-subscriber-openai-device"
          }
        }
      ]),
      nativeExecutor: {
        execute: vi.fn().mockRejectedValue(
          new NativeOpenAIExecutionError(
            "codex_subscription_failed",
            "Native OpenAI Codex subscription execution failed: ERROR: Your access token could not be refreshed because your refresh token was revoked. Please log out and sign in again."
          )
        )
      },
      payload: {
        tenantId: "tenant-1",
        runId: "run-1",
        workflowId: "wf_connect_first_workflow"
      }
    });

    expect(commitNativeOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: {
          state: "blocked",
          resumeSummary:
            "Native execution could not continue because the Codex subscription session ended and must be signed in again. Keep this lane blocked until the isolated Codex device login is refreshed for this provider lane."
        }
      })
    );
  });
});
