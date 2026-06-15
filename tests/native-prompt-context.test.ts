import { describe, expect, it } from "vitest";

import type { HarnessWorkerExecutionEnvelope } from "../src/harness/worker-executor.js";
import { buildWorkerPromptContextLines } from "../src/worker/native-prompt-context.js";

function buildExecutionEnvelope(): HarnessWorkerExecutionEnvelope {
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
      resumeFocus: "Check the revised price floor.",
      latestResultSummary: "Lane-level fallback summary.",
      absorbedWorkItems: ["Trim lane item", "Check margin floor"]
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
    orchestratorHandoff: {
      orchestratorPersona: "ceo" as const,
      dispatchReason: "The CEO approved this lane for its next bounded execution step.",
      scopeGuard:
        "Stay inside this lane only. Do not open new lanes, widen package scope, or assume new governance approval beyond this execution handoff.",
      completionRule:
        "Return exactly one bounded lane outcome: done only when this lane is complete, waiting when an explicit resume is needed, blocked when a prerequisite is missing, or cancelled when the lane should end without completion.",
      resumeDirective: "Resume the pricing lane from the revised assumptions workbook."
    },
    boardContext: {
      runState: "active" as const,
      activeAttention: {
        actionKind: "await_lane_resume" as const,
        summary: "The board is currently waiting on an explicit resume decision for CMO card card_cmo.",
        targetCardId: "card_cmo",
        targetPersona: "cmo" as const
      },
      parentLane: {
        cardId: "card_ceo",
        persona: "ceo" as const,
        title: "Plan run",
        deliverableType: "plan",
        state: "planning" as const
      },
      siblingLanes: [
        {
          cardId: "card_cmo",
          persona: "cmo" as const,
          title: "Draft the launch narrative",
          deliverableType: "launch_copy",
          state: "waiting" as const
        }
      ]
    },
    outcomeContract: {
      allowedStates: ["waiting", "done", "blocked", "cancelled"] as const,
      resultSummaryRequiredStates: ["done"] as const,
      resumeSummaryAllowedStates: ["waiting", "blocked", "cancelled"] as const,
      postOutcomeDirectives: [
        {
          outcomeState: "waiting" as const,
          runState: "waiting" as const,
          actionKind: "await_lane_resume" as const,
          summary: "If this lane ends waiting, the board will require an explicit resume decision on this lane.",
          targetCardId: "card_cfo",
          targetPersona: "cfo" as const
        },
        {
          outcomeState: "blocked" as const,
          runState: "blocked" as const,
          actionKind: "await_unblock" as const,
          summary: "If this lane ends blocked, the board will require an explicit unblock decision on this lane.",
          targetCardId: "card_cfo",
          targetPersona: "cfo" as const,
          reason: "governance_hold" as const
        }
      ]
    }
  };
}

describe("worker native prompt context", () => {
  it("builds shared context, board posture, and directive lines from continuity-backed data", () => {
    expect(
      buildWorkerPromptContextLines({
        workflowId: "wf_connect_first_workflow",
        executionEnvelope: buildExecutionEnvelope()
      })
    ).toEqual([
      "Workflow: wf_connect_first_workflow",
      "Persona: cfo",
      "Lane title: Pressure-test the pricing lane",
      "Deliverable type: pricing_review",
      "Resume focus: Check the revised price floor.",
      "Continuity summary: Resume the pricing lane from the revised assumptions workbook.",
      "Latest result summary: Initial pricing floor is stable.",
      "Absorbed work items: Re-check discount floor",
      "Orchestrator persona: ceo",
      "Dispatch reason: The CEO approved this lane for its next bounded execution step.",
      "Scope guard: Stay inside this lane only. Do not open new lanes, widen package scope, or assume new governance approval beyond this execution handoff.",
      "Completion rule: Return exactly one bounded lane outcome: done only when this lane is complete, waiting when an explicit resume is needed, blocked when a prerequisite is missing, or cancelled when the lane should end without completion.",
      "Resume directive: Resume the pricing lane from the revised assumptions workbook.",
      "Run state: active",
      "Parent lane: CEO | Plan run | plan | planning",
      "Active board attention: The board is currently waiting on an explicit resume decision for CMO card card_cmo.",
      "Sibling lanes:",
      "- CMO | Draft the launch narrative | launch_copy | waiting",
      "Post-outcome contract:",
      "- waiting -> await_lane_resume (run state: waiting): If this lane ends waiting, the board will require an explicit resume decision on this lane. [target persona: cfo; target card: card_cfo]",
      "- blocked -> await_unblock (run state: blocked): If this lane ends blocked, the board will require an explicit unblock decision on this lane. [target persona: cfo; target card: card_cfo; reason: governance_hold]"
    ]);
  });

  it("falls back to lane-level summaries and empty board markers when continuity details are absent", () => {
    const { continuityContext: _continuityContext, ...baseEnvelope } = buildExecutionEnvelope();
    const envelope: HarnessWorkerExecutionEnvelope = {
      ...baseEnvelope,
      orchestratorHandoff: {
        ...baseEnvelope.orchestratorHandoff,
        resumeDirective: null
      },
      boardContext: {
        ...baseEnvelope.boardContext,
        activeAttention: null,
        parentLane: null,
        siblingLanes: []
      },
      outcomeContract: {
        ...baseEnvelope.outcomeContract,
        postOutcomeDirectives: []
      }
    };

    expect(
      buildWorkerPromptContextLines({
        workflowId: "wf_connect_first_workflow",
        executionEnvelope: envelope
      })
    ).toEqual([
      "Workflow: wf_connect_first_workflow",
      "Persona: cfo",
      "Lane title: Pressure-test the pricing lane",
      "Deliverable type: pricing_review",
      "Resume focus: Check the revised price floor.",
      "Continuity summary: Check the revised price floor.",
      "Latest result summary: Lane-level fallback summary.",
      "Absorbed work items: Trim lane item; Check margin floor",
      "Orchestrator persona: ceo",
      "Dispatch reason: The CEO approved this lane for its next bounded execution step.",
      "Scope guard: Stay inside this lane only. Do not open new lanes, widen package scope, or assume new governance approval beyond this execution handoff.",
      "Completion rule: Return exactly one bounded lane outcome: done only when this lane is complete, waiting when an explicit resume is needed, blocked when a prerequisite is missing, or cancelled when the lane should end without completion.",
      "Resume directive: None",
      "Run state: active",
      "Parent lane: None",
      "Active board attention: None",
      "Sibling lanes:",
      "- None",
      "Post-outcome contract:"
    ]);
  });
});
