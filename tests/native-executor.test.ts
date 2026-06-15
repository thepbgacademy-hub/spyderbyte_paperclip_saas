import { describe, expect, it, vi } from "vitest";

import { createDefaultNativeExecutor } from "../src/worker/native-executor.js";

function createConnectFirstMultiStepFetch(input: {
  interpretationState: "done" | "waiting" | "blocked" | "cancelled";
  interpretationAnalysis: string;
  interpretationNextAction: string;
  draftedSummary: string;
  validationApproved: boolean;
  validationReason: string;
}) {
  return vi.fn().mockImplementation(async (_url: string, request?: RequestInit) => {
    const body = JSON.parse(String(request?.body));
    const prompt = String(body.input ?? "");
    if (prompt.includes("Step 1 of 3: interpret the lane")) {
      return {
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            state: input.interpretationState,
            analysis: input.interpretationAnalysis,
            nextAction: input.interpretationNextAction
          })
        })
      };
    }
    if (prompt.includes("Step 2 of 3: draft the lane outcome")) {
      return {
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            state: input.interpretationState,
            summary: input.draftedSummary
          })
        })
      };
    }
    if (prompt.includes("Step 3 of 3: validate the drafted lane outcome")) {
      return {
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            approved: input.validationApproved,
            reason: input.validationReason
          })
        })
      };
    }
    throw new Error(`Unexpected prompt: ${prompt}`);
  });
}

function createConnectFirstRawMultiStepFetch(input: {
  step1Output: string;
  step2Output: string;
  step3Output: string;
}) {
  return vi.fn().mockImplementation(async (_url: string, request?: RequestInit) => {
    const body = JSON.parse(String(request?.body));
    const prompt = String(body.input ?? "");
    if (prompt.includes("Step 1 of 3: interpret the lane")) {
      return {
        ok: true,
        json: async () => ({
          output_text: input.step1Output
        })
      };
    }
    if (prompt.includes("Step 2 of 3: draft the lane outcome")) {
      return {
        ok: true,
        json: async () => ({
          output_text: input.step2Output
        })
      };
    }
    if (prompt.includes("Step 3 of 3: validate the drafted lane outcome")) {
      return {
        ok: true,
        json: async () => ({
          output_text: input.step3Output
        })
      };
    }
    throw new Error(`Unexpected prompt: ${prompt}`);
  });
}

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
          runState: "done" as const,
          actionKind: "none" as const,
          summary: "If this lane ends cancelled, no automatic post-outcome action will be scheduled."
        }
      ]
    }
  };
}

function buildTaxExecutionEnvelope() {
  return {
    ...buildExecutionEnvelope(),
    workflowId: "wf_tax_strategy",
    laneExecution: {
      ...buildExecutionEnvelope().laneExecution,
      title: "Review the founder tax posture",
      deliverableType: "tax_strategy_review",
      resumeFocus: "Confirm whether the Q3 restructuring assumptions are ready for recommendation."
    },
    continuityContext: {
      ...buildExecutionEnvelope().continuityContext,
      summary: "Resume the tax strategy lane from the latest restructuring assumptions workbook.",
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
    }
  };
}

function buildPackageFollowupExecutionEnvelope() {
  return {
    ...buildExecutionEnvelope(),
    workflowId: "wf_package_followup",
    laneExecution: {
      ...buildExecutionEnvelope().laneExecution,
      persona: "cmo",
      title: "Draft the package follow-up narrative",
      deliverableType: "launch_copy",
      resumeFocus: "Turn the latest package outcome into a concise follow-up brief."
    },
    continuityContext: {
      ...buildExecutionEnvelope().continuityContext,
      summary: "Resume the package follow-up lane from the packaged customer-facing outcome.",
      latestResultSummary: "The latest package outcome is ready for follow-up positioning.",
      absorbedWorkTrail: [
        {
          resolution: "update_existing_lane" as const,
          requestedByPersona: "CEO",
          title: "Frame the next bounded package follow-up",
          label: "CEO: Frame the next bounded package follow-up"
        }
      ],
      latestAbsorbedWork: {
        resolution: "update_existing_lane" as const,
        requestedByPersona: "CEO",
        title: "Frame the next bounded package follow-up",
        label: "CEO: Frame the next bounded package follow-up"
      },
      absorbedWorkCount: 1
    }
  };
}

function buildExampleExecutionEnvelope() {
  return {
    ...buildExecutionEnvelope(),
    workflowId: "wf-example-audit",
    laneExecution: {
      ...buildExecutionEnvelope().laneExecution,
      persona: "cmo",
      title: "Review the example findings brief",
      deliverableType: "research_brief",
      resumeFocus: "Turn the findings into a bounded example audit next step."
    },
    continuityContext: {
      ...buildExecutionEnvelope().continuityContext,
      summary: "Resume the example audit lane from the latest findings brief.",
      latestResultSummary: "The latest example findings are ready for prioritization.",
      absorbedWorkTrail: [
        {
          resolution: "update_existing_lane" as const,
          requestedByPersona: "CEO",
          title: "Prioritize the next example audit move",
          label: "CEO: Prioritize the next example audit move"
        }
      ],
      latestAbsorbedWork: {
        resolution: "update_existing_lane" as const,
        requestedByPersona: "CEO",
        title: "Prioritize the next example audit move",
        label: "CEO: Prioritize the next example audit move"
      },
      absorbedWorkCount: 1
    }
  };
}

describe("default native executor", () => {
  it("completes the connect-first workflow family natively through the provider lane", async () => {
    const fetch = createConnectFirstMultiStepFetch({
      interpretationState: "done",
      interpretationAnalysis: "The pricing lane can finish once the revised floor is confirmed against the competitor anchor sheet.",
      interpretationNextAction: "Deliver the bounded pricing review result to leadership.",
      draftedSummary: "Validated the pricing floor and preserved the next action.",
      validationApproved: true,
      validationReason: "The drafted outcome stays bounded and tenant-safe."
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

    const request = fetch.mock.calls[0]?.[1];
    expect(typeof request?.body).toBe("string");
    const body = JSON.parse(String(request?.body));
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(body.input).toContain("Step 1 of 3: interpret the lane");
    expect(body.input).toContain("Orchestrator persona: ceo");
    expect(body.input).toContain("Dispatch reason: The CEO approved this lane for its next bounded execution step.");
    expect(body.input).toContain("Completion rule: Return exactly one bounded lane outcome: done only when this lane is complete, waiting when an explicit resume is needed, blocked when a prerequisite is missing, or cancelled when the lane should end without completion.");
    expect(body.input).toContain("Run state: active");
    expect(body.input).toContain("Parent lane: CEO | Plan run | plan | planning");
    expect(body.input).toContain("Sibling lanes:");
    expect(body.input).toContain("- CMO | Draft the launch narrative | launch_copy | waiting");
    expect(body.input).toContain("Active board attention: The board is currently waiting on an explicit resume decision for CMO card card_cmo.");
    expect(body.input).toContain("Post-outcome contract:");
    expect(body.input).toContain("- blocked -> await_unblock (run state: blocked): If this lane ends blocked, the board will require an explicit unblock decision on this lane. [target persona: cfo; target card: card_cfo]");
    expect(String(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body)).input)).toContain("Step 2 of 3: draft the lane outcome");
    expect(String(JSON.parse(String(fetch.mock.calls[2]?.[1]?.body)).input)).toContain("Step 3 of 3: validate the drafted lane outcome");
  });

  it("keeps the connect-first workflow family waiting when the provider says the lane needs more information", async () => {
    const fetch = createConnectFirstMultiStepFetch({
      interpretationState: "waiting",
      interpretationAnalysis: "The lane needs one missing pricing input before a bounded recommendation can be finalized.",
      interpretationNextAction: "Request the updated competitor discount sheet.",
      draftedSummary: "Need the updated competitor discount sheet before the pricing recommendation can be finalized.",
      validationApproved: true,
      validationReason: "The waiting outcome accurately reflects the missing input."
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
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("fails closed when connect-first validation rejects the drafted multi-step outcome", async () => {
    const fetch = createConnectFirstMultiStepFetch({
      interpretationState: "done",
      interpretationAnalysis: "The lane looks close to done but the drafted outcome might overclaim the finished work.",
      interpretationNextAction: "Re-check the summary wording against the bounded lane evidence.",
      draftedSummary: "Validated the pricing floor, opened the next package lane, and finalized the broader strategy.",
      validationApproved: false,
      validationReason: "The drafted summary widens scope beyond the current lane."
    });
    const executor = createDefaultNativeExecutor({
      fetch: fetch as unknown as typeof globalThis.fetch
    });

    await expect(
      executor.execute({
        tenantId: "tenant-1",
        runId: "run-phase-d-invalid-1",
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
      state: "blocked",
      resumeSummary:
        "Connect First Workflow pricing review lane for CFO: Pressure-test the pricing lane needs an explicit unblock action. " +
        "Native multi-step validation rejected the drafted lane outcome: The drafted summary widens scope beyond the current lane."
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("honors cancelled native workflow outcomes instead of collapsing them into invalid blocked fallbacks", async () => {
    const fetch = createConnectFirstMultiStepFetch({
      interpretationState: "cancelled",
      interpretationAnalysis: "The tenant explicitly withdrew this pricing request.",
      interpretationNextAction: "End the lane without completion and return control to the harness.",
      draftedSummary: "The tenant withdrew this pricing request, so the lane should end without completion.",
      validationApproved: true,
      validationReason: "The cancellation stays bounded to this lane."
    });
    const executor = createDefaultNativeExecutor({
      fetch: fetch as unknown as typeof globalThis.fetch
    });

    await expect(
      executor.execute({
        tenantId: "tenant-1",
        runId: "run-cancelled-1",
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
      state: "cancelled",
      resumeSummary:
        "Connect First Workflow pricing review lane for CFO: Pressure-test the pricing lane needs an explicit cancel action. " +
        "The tenant withdrew this pricing request, so the lane should end without completion."
    });

    const request = fetch.mock.calls[0]?.[1];
    expect(typeof request?.body).toBe("string");
    const body = JSON.parse(String(request?.body));
    expect(body.input).toContain("Step 1 of 3: interpret the lane");
    expect(String(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body)).input)).toContain("Return strict JSON only with this shape: {\"state\":\"done|waiting|blocked|cancelled\",\"summary\":\"...\"}.");
    expect(String(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body)).input)).toContain("Use state \"cancelled\" when the lane should end without completion and return control to the harness.");
  });

  it("accepts fenced structured payloads across the connect-first multi-step path", async () => {
    const fetch = createConnectFirstRawMultiStepFetch({
      step1Output:
        "```json\n{\"state\":\"done\",\"analysis\":\"The pricing lane is complete once the revised floor is reconciled against the competitor anchor sheet.\",\"nextAction\":\"Return the bounded pricing review result to leadership.\"}\n```",
      step2Output:
        "```json\n{\"state\":\"done\",\"summary\":\"Validated the pricing floor and preserved the next action.\"}\n```",
      step3Output:
        "```json\n{\"approved\":true,\"reason\":\"The drafted lane outcome stays bounded and tenant-safe.\"}\n```"
    });
    const executor = createDefaultNativeExecutor({
      fetch: fetch as unknown as typeof globalThis.fetch
    });

    await expect(
      executor.execute({
        tenantId: "tenant-1",
        runId: "run-fenced-connect-first-1",
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
        "Validated the pricing floor and preserved the next action."
    });
  });

  it("fails closed when connect-first interpretation returns invalid structured JSON", async () => {
    const fetch = createConnectFirstRawMultiStepFetch({
      step1Output:
        "{\"state\":\"done\",\"analysis\":\"The lane is ready.\",\"nextAction\":\"Return the result.\",\"debug\":\"extra\"}",
      step2Output: "{\"state\":\"done\",\"summary\":\"Validated the pricing floor and preserved the next action.\"}",
      step3Output: "{\"approved\":true,\"reason\":\"The drafted lane outcome stays bounded and tenant-safe.\"}"
    });
    const executor = createDefaultNativeExecutor({
      fetch: fetch as unknown as typeof globalThis.fetch
    });

    await expect(
      executor.execute({
        tenantId: "tenant-1",
        runId: "run-invalid-interpretation-1",
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
      state: "blocked",
      resumeSummary:
        "Connect First Workflow pricing review lane for CFO: Pressure-test the pricing lane needs an explicit unblock action. " +
        "Native multi-step interpretation returned an invalid Connect First Workflow decision. Keep this lane blocked until the native multi-step decision contract is repaired."
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("fails closed when connect-first draft returns invalid structured JSON", async () => {
    const fetch = createConnectFirstRawMultiStepFetch({
      step1Output:
        "{\"state\":\"done\",\"analysis\":\"The pricing lane is ready for a bounded result.\",\"nextAction\":\"Return the result to leadership.\"}",
      step2Output:
        "{\"state\":\"done\",\"summary\":\"Validated the pricing floor.\",\"debug\":\"extra\"}",
      step3Output: "{\"approved\":true,\"reason\":\"The drafted lane outcome stays bounded and tenant-safe.\"}"
    });
    const executor = createDefaultNativeExecutor({
      fetch: fetch as unknown as typeof globalThis.fetch
    });

    await expect(
      executor.execute({
        tenantId: "tenant-1",
        runId: "run-invalid-draft-1",
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
      state: "blocked",
      resumeSummary:
        "Connect First Workflow pricing review lane for CFO: Pressure-test the pricing lane needs an explicit unblock action. " +
        "Native multi-step draft returned an invalid Connect First Workflow decision. Keep this lane blocked until the native multi-step decision contract is repaired."
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("fails closed when connect-first validation returns invalid structured JSON", async () => {
    const fetch = createConnectFirstRawMultiStepFetch({
      step1Output:
        "{\"state\":\"done\",\"analysis\":\"The pricing lane is ready for a bounded result.\",\"nextAction\":\"Return the result to leadership.\"}",
      step2Output:
        "{\"state\":\"done\",\"summary\":\"Validated the pricing floor and preserved the next action.\"}",
      step3Output:
        "{\"approved\":true,\"reason\":\"The drafted lane outcome stays bounded and tenant-safe.\",\"debug\":\"extra\"}"
    });
    const executor = createDefaultNativeExecutor({
      fetch: fetch as unknown as typeof globalThis.fetch
    });

    await expect(
      executor.execute({
        tenantId: "tenant-1",
        runId: "run-invalid-validation-1",
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
      state: "blocked",
      resumeSummary:
        "Connect First Workflow pricing review lane for CFO: Pressure-test the pricing lane needs an explicit unblock action. " +
        "Native multi-step validation returned an invalid Connect First Workflow decision. Keep this lane blocked until the native multi-step decision contract is repaired."
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("fails closed when connect-first drafting changes the interpreted lane state", async () => {
    const fetch = createConnectFirstRawMultiStepFetch({
      step1Output:
        "{\"state\":\"done\",\"analysis\":\"The pricing lane is ready for a bounded result.\",\"nextAction\":\"Return the result to leadership.\"}",
      step2Output:
        "{\"state\":\"waiting\",\"summary\":\"Need one more input before the lane can finish.\"}",
      step3Output:
        "{\"approved\":true,\"reason\":\"The drafted lane outcome stays bounded and tenant-safe.\"}"
    });
    const executor = createDefaultNativeExecutor({
      fetch: fetch as unknown as typeof globalThis.fetch
    });

    await expect(
      executor.execute({
        tenantId: "tenant-1",
        runId: "run-state-divergence-1",
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
      state: "blocked",
      resumeSummary:
        "Connect First Workflow pricing review lane for CFO: Pressure-test the pricing lane needs an explicit unblock action. " +
        "Native multi-step drafting changed the lane state from done to waiting. Keep the lane blocked until the native multi-step state contract is repaired."
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("completes the tax-strategy workflow family natively through the provider lane", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: "{\"state\":\"done\",\"summary\":\"Validated the restructuring assumptions and framed the tax recommendation for review.\"}"
      })
    });
    const executor = createDefaultNativeExecutor({
      fetch: fetch as unknown as typeof globalThis.fetch
    });

    await expect(
      executor.execute({
        tenantId: "tenant-1",
        runId: "run-tax-1",
        workflowId: "wf_tax_strategy",
        executionEnvelope: buildTaxExecutionEnvelope(),
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
        "Completed the Tax Strategy Workflow tax strategy review lane for CFO: Review the founder tax posture. " +
        "Validated the restructuring assumptions and framed the tax recommendation for review."
    });
  });

  it("completes the package-followup workflow family natively through the provider lane", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: "{\"state\":\"done\",\"summary\":\"Turned the packaged outcome into a concise follow-up brief for the next customer-facing step.\"}"
      })
    });
    const executor = createDefaultNativeExecutor({
      fetch: fetch as unknown as typeof globalThis.fetch
    });

    await expect(
      executor.execute({
        tenantId: "tenant-1",
        runId: "run-followup-1",
        workflowId: "wf_package_followup",
        executionEnvelope: buildPackageFollowupExecutionEnvelope(),
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
        "Completed the Package Follow-up Workflow launch copy lane for CMO: Draft the package follow-up narrative. " +
        "Turned the packaged outcome into a concise follow-up brief for the next customer-facing step."
    });
  });

  it("keeps the example audit workflow family registry and formatter aligned after extraction", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: "{\"state\":\"waiting\",\"summary\":\"Need one more pass on the priority order before the example findings brief can be finalized.\"}"
      })
    });
    const executor = createDefaultNativeExecutor({
      fetch: fetch as unknown as typeof globalThis.fetch
    });

    await expect(
      executor.execute({
        tenantId: "tenant-1",
        runId: "run-example-1",
        workflowId: "wf-example-audit",
        executionEnvelope: buildExampleExecutionEnvelope(),
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
        "Example Audit Workflow research brief lane for CMO: Review the example findings brief needs an explicit resume action. " +
        "Need one more pass on the priority order before the example findings brief can be finalized."
    });

    const request = fetch.mock.calls[0]?.[1];
    expect(typeof request?.body).toBe("string");
    const body = JSON.parse(String(request?.body));
    expect(body.input).toContain("You are Wealth Factory's native executor for the Example Audit Workflow family.");
    expect(body.input).toContain("Focus on prioritized findings and the clearest next bounded audit step.");
  });

  it("accepts a fenced workflow decision without truncating or rejecting the structured response", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text:
          "```json\n{\"state\":\"done\",\"summary\":\"Validated the restructuring assumptions and framed the tax recommendation for review.\"}\n```"
      })
    });
    const executor = createDefaultNativeExecutor({
      fetch: fetch as unknown as typeof globalThis.fetch
    });

    await expect(
      executor.execute({
        tenantId: "tenant-1",
        runId: "run-4",
        workflowId: "wf_tax_strategy",
        executionEnvelope: buildTaxExecutionEnvelope(),
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
        "Completed the Tax Strategy Workflow tax strategy review lane for CFO: Review the founder tax posture. " +
        "Validated the restructuring assumptions and framed the tax recommendation for review."
    });
  });

  it("fails closed when the provider returns extra top-level fields outside the strict native decision shape", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text:
          "{\"state\":\"done\",\"summary\":\"Validated the pricing floor and preserved the next action.\",\"debug\":\"internal-trace\"}"
      })
    });
    const executor = createDefaultNativeExecutor({
      fetch: fetch as unknown as typeof globalThis.fetch
    });

    await expect(
      executor.execute({
        tenantId: "tenant-1",
        runId: "run-invalid-shape-1",
        workflowId: "wf_tax_strategy",
        executionEnvelope: buildTaxExecutionEnvelope(),
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
        "Native execution returned an invalid Tax Strategy Workflow decision for CFO: Review the founder tax posture. " +
        "Keep this lane blocked until the native workflow decision contract is repaired."
    });
  });

  it("fails closed when the provider wraps the native decision in surrounding prose", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text:
          "Here is the result you asked for: {\"state\":\"done\",\"summary\":\"Validated the pricing floor and preserved the next action.\"}"
      })
    });
    const executor = createDefaultNativeExecutor({
      fetch: fetch as unknown as typeof globalThis.fetch
    });

    await expect(
      executor.execute({
        tenantId: "tenant-1",
        runId: "run-invalid-envelope-1",
        workflowId: "wf_tax_strategy",
        executionEnvelope: buildTaxExecutionEnvelope(),
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
        "Native execution returned an invalid Tax Strategy Workflow decision for CFO: Review the founder tax posture. " +
        "Keep this lane blocked until the native workflow decision contract is repaired."
    });
  });

  it("fails closed when the provider returns more than one JSON object in the native decision response", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text:
          "{\"state\":\"done\",\"summary\":\"Validated the pricing floor and preserved the next action.\"}\n{\"state\":\"waiting\",\"summary\":\"Need approval.\"}"
      })
    });
    const executor = createDefaultNativeExecutor({
      fetch: fetch as unknown as typeof globalThis.fetch
    });

    await expect(
      executor.execute({
        tenantId: "tenant-1",
        runId: "run-invalid-multi-json-1",
        workflowId: "wf_tax_strategy",
        executionEnvelope: buildTaxExecutionEnvelope(),
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
        "Native execution returned an invalid Tax Strategy Workflow decision for CFO: Review the founder tax posture. " +
        "Keep this lane blocked until the native workflow decision contract is repaired."
    });
  });

  it("fails closed when the provider emits a valid fenced decision followed by trailing JSON in a second Responses block", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            content: [
              {
                text:
                  "```json\n{\"state\":\"done\",\"summary\":\"Validated the pricing floor and preserved the next action.\"}\n```"
              },
              {
                text: "{\"debug\":\"extra\"}"
              }
            ]
          }
        ]
      })
    });
    const executor = createDefaultNativeExecutor({
      fetch: fetch as unknown as typeof globalThis.fetch
    });

    await expect(
      executor.execute({
        tenantId: "tenant-1",
        runId: "run-invalid-trailing-json-1",
        workflowId: "wf_tax_strategy",
        executionEnvelope: buildTaxExecutionEnvelope(),
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
        "Native execution returned an invalid Tax Strategy Workflow decision for CFO: Review the founder tax posture. " +
        "Keep this lane blocked until the native workflow decision contract is repaired."
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
