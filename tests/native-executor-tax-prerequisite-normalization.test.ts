import { describe, expect, it, vi } from "vitest";

import { createDefaultNativeExecutor } from "../src/worker/native-executor.js";

function buildExecutionEnvelope() {
  return {
    tenantId: "tenant-1",
    runId: "run-1",
    workflowId: "wf_tax_strategy",
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
      persona: "cfo" as const,
      title: "Review the founder posture recommendation",
      deliverableType: "tax_strategy_review" as const,
      state: "working" as const,
      resumeFocus: "Check the revised founder posture assumptions.",
      latestResultSummary: "The draft tax posture is directionally viable.",
      absorbedWorkCount: 0,
      latestAbsorbedWork: null,
      absorbedWorkTrail: []
    },
    continuityContext: {
      source: "resume_override" as const,
      summary: "Resume from the latest tax-review assumptions.",
      latestResultSummary: "The draft tax posture is directionally viable.",
      absorbedWorkTrail: [
        {
          resolution: "update_existing_lane" as const,
          requestedByPersona: "CFO",
          title: "Check restructuring assumptions",
          label: "CFO: Check restructuring assumptions"
        }
      ],
      latestAbsorbedWork: {
        resolution: "update_existing_lane" as const,
        requestedByPersona: "CFO",
        title: "Check restructuring assumptions",
        label: "CFO: Check restructuring assumptions"
      },
      absorbedWorkCount: 1
    },
    orchestratorHandoff: {
      orchestratorPersona: "ceo" as const,
      dispatchReason: "The CEO approved this lane for its next bounded execution step.",
      scopeGuard:
        "Stay inside this lane only. Do not open new lanes, widen package scope, or assume new governance approval beyond this execution handoff.",
      completionRule:
        "Return exactly one bounded lane outcome: done only when this lane is complete, waiting when an explicit resume is needed, blocked when a prerequisite is missing, or cancelled when the lane should end without completion.",
      resumeDirective: "Resume the tax strategy lane from the revised assumptions workbook."
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
      siblingLanes: []
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
          outcomeState: "done" as const,
          runState: "done" as const,
          actionKind: "none" as const,
          summary: "If this lane ends done, no automatic post-outcome action will be scheduled."
        },
        {
          outcomeState: "blocked" as const,
          runState: "blocked" as const,
          actionKind: "await_unblock" as const,
          summary: "If this lane ends blocked, the board will require an explicit unblock decision on this lane.",
          targetCardId: "card_cfo",
          targetPersona: "cfo" as const
        },
        {
          outcomeState: "cancelled" as const,
          runState: "cancelled" as const,
          actionKind: "none" as const,
          summary: "If this lane ends cancelled, no automatic post-outcome action will be scheduled."
        }
      ]
    },
    workflowPrerequisites: {
      taxStrategyEvidence: [
        {
          artifactName: "founder_tax_posture_documents" as const,
          status: "confirmed" as const,
          summary: "Founder tax posture documents were confirmed for bounded tax review.",
          confirmedBy: "operator",
          taxYear: "2025",
          entityType: "llc",
          confirmedAt: "2026-06-23T16:00:00.000Z"
        }
      ]
    }
  };
}

describe("native executor tax prerequisite normalization", () => {
  it("names the blocked founder tax posture artifact even when the live lane title drifts", async () => {
    const fetch = vi.fn().mockImplementation(async (_url: string, request?: RequestInit) => {
      const body = JSON.parse(String(request?.body));
      const prompt = String(body.input ?? "");
      expect(prompt).toContain("Workflow prerequisite evidence:");
      expect(prompt).toContain("founder_tax_posture_documents");
      expect(prompt).toContain("confirmed by: operator");
      if (prompt.includes("Step 1 of 3: interpret the lane")) {
        return {
          ok: true,
          json: async () => ({
            output_text: JSON.stringify({
              state: "blocked",
              analysis: "The founder posture review is blocked until the required documents are supplied.",
              nextAction: "Collect the missing founder documentation.",
              requiredArtifactName: "founder_tax_posture_documents"
            })
          })
        };
      }
      throw new Error(`Unexpected prompt: ${prompt}`);
    });

    const executor = createDefaultNativeExecutor({
      fetch: fetch as unknown as typeof globalThis.fetch
    });

    await expect(
      executor.execute({
        tenantId: "tenant-1",
        runId: "run-tax-normalization-title-drift",
        workflowId: "wf_tax_strategy",
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
      requiredArtifactName: "founder_tax_posture_documents",
      resumeSummary:
        "Tax Strategy Workflow tax strategy review lane for CFO: Review the founder posture recommendation needs an explicit unblock action. " +
        "The founder posture review is blocked until the required documents are supplied. " +
        "The named prerequisite artifact is founder_tax_posture_documents."
    });
  });
});
