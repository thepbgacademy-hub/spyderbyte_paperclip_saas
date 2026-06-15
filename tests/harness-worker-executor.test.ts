import { describe, expect, it } from "vitest";

import { createInMemoryHarnessRepository } from "../src/harness/repository.js";
import {
  buildHarnessWorkerDispatch,
  buildHarnessWorkerDispatchResolution,
  buildHarnessWorkerExecutionEnvelope,
  commitHarnessWorkerLaneOutcome
} from "../src/harness/worker-executor.js";
import {
  createHarnessCardEventRecord,
  createHarnessCardContinuityRecord,
  createHarnessCardRecord,
  createHarnessRunRecord
} from "../src/harness/types.js";

function markCardWorkingWithClaim(
  card: ReturnType<typeof createHarnessCardRecord>,
  claimToken = "claim-cfo-1",
  claimedAt = "2026-05-21T10:04:30.000Z"
): void {
  card.state = "working";
  card.executionClaimToken = claimToken;
  card.executionClaimedAt = claimedAt;
}

describe("harness worker executor", () => {
  it("hydrates continuity-backed resume focus into the next actionable lane dispatch", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });
    cfoCard.state = "approved";

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);
    await repository.upsertCardContinuity(
      createHarnessCardContinuityRecord({
        cardId: cfoCard.id,
        runId: run.id,
        continuitySource: "proposal_absorbed",
        continuitySummary: "Resume the pricing lane from the revised assumptions workbook.",
        latestResultSummary: "Initial pricing floor is stable.",
        absorbedWorkItems: ["Re-check discount floor", "Verify competitor anchor notes"]
      })
    );
    await repository.upsertCardContinuity(
      createHarnessCardContinuityRecord({
        cardId: cfoCard.id,
        runId: run.id,
        continuitySummary: "Resume the pricing lane from the revised assumptions workbook.",
        latestResultSummary: "Initial pricing floor is stable."
      })
    );

    await expect(
      buildHarnessWorkerDispatch({
        repository,
        tenantId: "tenant-1",
        runId: run.id,
        workflowId: "wf_connect_first_workflow"
      })
    ).resolves.toEqual({
      runId: run.id,
      workflowId: "wf_connect_first_workflow",
      status: "running",
      dispatchHandoff: {
        kind: "initial_claim",
        kindLabel: "Initial lane claim",
        executionStage: "initial_lane_start",
        executionStageLabel: "Initial lane start"
      },
      laneExecution: {
        cardId: cfoCard.id,
        persona: "cfo",
        title: "Pressure-test the pricing lane",
        deliverableType: "pricing_review",
        state: "working",
        resumeFocus: "CFO should continue this active pricing review lane: Pressure-test the pricing lane.",
        latestResultSummary: "Initial pricing floor is stable."
      }
    });

    await expect(repository.getCard(cfoCard.id)).resolves.toEqual(
      expect.objectContaining({
        id: cfoCard.id,
        state: "working"
      })
    );
    await expect(repository.getRun(run.id)).resolves.toEqual(
      expect.objectContaining({
        id: run.id,
        state: "active"
      })
    );
    await expect(repository.listEventsForCard(cfoCard.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventKind: "state_changed",
          payload: {
            from: "approved",
            to: "working"
          }
        }),
        expect.objectContaining({
          eventKind: "execution_dispatched",
          payload: {
            kind: "initial_claim",
            kindLabel: "Initial lane claim",
            executionStage: "initial_lane_start",
            executionStageLabel: "Initial lane start"
          }
        }),
        expect.objectContaining({
          eventKind: "execution_claimed",
          payload: {
            claimKind: "approved_claim",
            claimedAt: expect.any(String),
            previousClaimedAt: null
          }
        })
      ])
    );
    await expect(repository.getCardContinuity(cfoCard.id)).resolves.toEqual(
      expect.objectContaining({
        cardId: cfoCard.id,
        continuitySource: "state_transition",
        continuitySummary: "CFO should continue this active pricing review lane: Pressure-test the pricing lane.",
        latestResultSummary: "Initial pricing floor is stable."
      })
    );
  });

  it("builds a private execution envelope without widening dispatch telemetry", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });
    cfoCard.state = "approved";

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);
    await repository.upsertCardContinuity(
      createHarnessCardContinuityRecord({
        cardId: cfoCard.id,
        runId: run.id,
        continuitySource: "proposal_absorbed",
        continuitySummary: "Resume the pricing lane from the revised assumptions workbook.",
        latestResultSummary: "Initial pricing floor is stable.",
        absorbedWorkItems: ["Re-check discount floor", "Verify competitor anchor notes"]
      })
    );

    const dispatchResolution = await buildHarnessWorkerDispatchResolution({
      repository,
      tenantId: "tenant-1",
      runId: run.id,
      workflowId: "wf_connect_first_workflow"
    });
    const dispatch = dispatchResolution.dispatch;
    const envelope = await buildHarnessWorkerExecutionEnvelope({
      repository,
      tenantId: "tenant-1",
      dispatch,
      requiredCapabilities: ["text_generation"],
      ...(dispatchResolution.lane ? { laneContext: dispatchResolution.lane } : {}),
      ...(dispatchResolution.executionClaim ? { executionClaimContext: dispatchResolution.executionClaim } : {})
    });

    expect(dispatch).toEqual({
      runId: run.id,
      workflowId: "wf_connect_first_workflow",
      status: "running",
      dispatchHandoff: {
        kind: "initial_claim",
        kindLabel: "Initial lane claim",
        executionStage: "initial_lane_start",
        executionStageLabel: "Initial lane start"
      },
      laneExecution: expect.objectContaining({
        cardId: cfoCard.id,
        persona: "cfo"
      })
    });
    expect(envelope).toEqual({
      tenantId: "tenant-1",
      runId: run.id,
      workflowId: "wf_connect_first_workflow",
      requiredCapabilities: ["text_generation"],
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      },
      executionClaim: {
        kind: "approved_claim",
        token: expect.any(String),
        claimedAt: expect.any(String),
        previousClaimedAt: null
      },
      continuityContext: {
        source: "state_transition",
        summary: "CFO should continue this active pricing review lane: Pressure-test the pricing lane.",
        latestResultSummary: "Initial pricing floor is stable.",
        absorbedWorkCount: 2,
        latestAbsorbedWork: {
          resolution: "update_existing_lane",
          requestedByPersona: null,
          title: "Verify competitor anchor notes",
          label: "Verify competitor anchor notes"
        },
        absorbedWorkTrail: [
          {
            resolution: "update_existing_lane",
            requestedByPersona: null,
            title: "Re-check discount floor",
            label: "Re-check discount floor"
          },
          {
            resolution: "update_existing_lane",
            requestedByPersona: null,
            title: "Verify competitor anchor notes",
            label: "Verify competitor anchor notes"
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
        resumeDirective: "CFO should continue this active pricing review lane: Pressure-test the pricing lane."
      },
      boardContext: {
        runState: "active",
        activeAttention: null,
        parentLane: {
          cardId: ceoCard.id,
          persona: "ceo",
          title: "Plan run",
          deliverableType: "plan",
          state: "queued"
        },
        siblingLanes: []
      },
      dispatchHandoff: {
        kind: "initial_claim",
        kindLabel: "Initial lane claim",
        executionStage: "initial_lane_start",
        executionStageLabel: "Initial lane start"
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
            targetCardId: cfoCard.id
          },
          {
            outcomeState: "done",
            runState: "assembling",
            actionKind: "queue_ceo_review",
            summary: "If this lane ends done, the board will queue CEO review (Final assembly).",
            reason: "final_assembly"
          },
          {
            outcomeState: "blocked",
            runState: "blocked",
            actionKind: "await_unblock",
            summary: "If this lane ends blocked, the board will require an explicit unblock decision on this lane.",
            targetCardId: cfoCard.id
          },
          {
            outcomeState: "cancelled",
            runState: "blocked",
            actionKind: "none",
            summary: "If this lane ends cancelled, no automatic post-outcome action will be scheduled."
          }
        ]
      },
      laneExecution: expect.objectContaining({
        cardId: cfoCard.id,
        parentCardId: ceoCard.id,
        persona: "cfo",
        title: "Pressure-test the pricing lane",
        deliverableType: "pricing_review",
        state: "working",
        continuitySource: "state_transition",
        latestResultSummary: "Initial pricing floor is stable.",
        absorbedWorkItems: ["Re-check discount floor", "Verify competitor anchor notes"]
      })
    });
  });

  it("refreshes a missing execution claim for an already-working lane and records a bounded refresh event", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Resume the pricing lane",
      deliverableType: "pricing_review"
    });
    markCardWorkingWithClaim(cfoCard);
    cfoCard.executionClaimToken = null;
    cfoCard.executionClaimedAt = null;

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);
    await repository.upsertCardContinuity(
      createHarnessCardContinuityRecord({
        cardId: cfoCard.id,
        runId: run.id,
        continuitySource: "resume_override",
        continuitySummary: "Resume from the board-approved pricing override note.",
        latestResultSummary: null,
        absorbedWorkItems: []
      })
    );

    const dispatch = await buildHarnessWorkerDispatch({
      repository,
      tenantId: "tenant-1",
      runId: run.id,
      workflowId: "wf_connect_first_workflow"
    });

    expect(dispatch).toEqual({
      runId: run.id,
      workflowId: "wf_connect_first_workflow",
      status: "running",
      dispatchHandoff: {
        kind: "initial_claim",
        kindLabel: "Initial lane claim",
        executionStage: "initial_lane_start",
        executionStageLabel: "Initial lane start"
      },
      laneExecution: expect.objectContaining({
        cardId: cfoCard.id,
        state: "working",
        resumeFocus: "Resume from the board-approved pricing override note."
      })
    });
    await expect(repository.getCard(cfoCard.id)).resolves.toEqual(
      expect.objectContaining({
        id: cfoCard.id,
        state: "working",
        executionClaimToken: expect.any(String),
        executionClaimedAt: expect.any(String)
      })
    );
    await expect(repository.listEventsForCard(cfoCard.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventKind: "execution_claim_refreshed",
          payload: {
            claimKind: "working_claim_refresh",
            claimedAt: expect.any(String),
            previousClaimedAt: null
          }
        })
      ])
    );
  });

  it("returns a fresh private outcome contract for each execution envelope", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });
    cfoCard.state = "approved";

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);

    const dispatchResolution = await buildHarnessWorkerDispatchResolution({
      repository,
      tenantId: "tenant-1",
      runId: run.id,
      workflowId: "wf_connect_first_workflow"
    });
    const dispatch = dispatchResolution.dispatch;
    const firstEnvelope = await buildHarnessWorkerExecutionEnvelope({
      repository,
      tenantId: "tenant-1",
      dispatch,
      requiredCapabilities: ["text_generation"],
      ...(dispatchResolution.lane ? { laneContext: dispatchResolution.lane } : {}),
      ...(dispatchResolution.executionClaim ? { executionClaimContext: dispatchResolution.executionClaim } : {})
    });
    const secondEnvelope = await buildHarnessWorkerExecutionEnvelope({
      repository,
      tenantId: "tenant-1",
      dispatch,
      requiredCapabilities: ["text_generation"],
      ...(dispatchResolution.lane ? { laneContext: dispatchResolution.lane } : {}),
      ...(dispatchResolution.executionClaim ? { executionClaimContext: dispatchResolution.executionClaim } : {})
    });

    expect(firstEnvelope).not.toBeNull();
    expect(secondEnvelope).not.toBeNull();
    if (!firstEnvelope || !secondEnvelope) {
      return;
    }

    const mutableAllowedStates = firstEnvelope.outcomeContract.allowedStates as Array<
      "waiting" | "done" | "blocked" | "cancelled"
    >;
    mutableAllowedStates.pop();
    const mutableDirectives = firstEnvelope.outcomeContract.postOutcomeDirectives as Array<unknown>;
    mutableDirectives.pop();

    expect(secondEnvelope.outcomeContract.allowedStates).toEqual(["waiting", "done", "blocked", "cancelled"]);
    expect(secondEnvelope.outcomeContract.postOutcomeDirectives).toHaveLength(4);
    expect(secondEnvelope.executionClaim).toEqual(firstEnvelope.executionClaim);
  });

  it("derives a bounded board context with parent lane, sibling posture, and active attention", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });
    const cmoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cmo",
      title: "Draft launch messaging",
      deliverableType: "launch_copy"
    });
    const cooCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "coo",
      title: "Unblock delivery dependency",
      deliverableType: "ops_handoff"
    });
    cfoCard.state = "approved";
    cmoCard.state = "waiting";
    cooCard.state = "blocked";

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);
    await repository.insertCard(cmoCard);
    await repository.insertCard(cooCard);

    const dispatchResolution = await buildHarnessWorkerDispatchResolution({
      repository,
      tenantId: "tenant-1",
      runId: run.id,
      workflowId: "wf_connect_first_workflow"
    });
    const envelope = await buildHarnessWorkerExecutionEnvelope({
      repository,
      tenantId: "tenant-1",
      dispatch: dispatchResolution.dispatch,
      requiredCapabilities: ["text_generation"],
      ...(dispatchResolution.lane ? { laneContext: dispatchResolution.lane } : {}),
      ...(dispatchResolution.executionClaim ? { executionClaimContext: dispatchResolution.executionClaim } : {})
    });

    expect(envelope?.boardContext).toEqual({
      runState: "active",
      activeAttention: null,
      parentLane: {
        cardId: ceoCard.id,
        persona: "ceo",
        title: "Plan run",
        deliverableType: "plan",
        state: "queued"
      },
      siblingLanes: [
        {
          cardId: cmoCard.id,
          persona: "cmo",
          title: "Draft launch messaging",
          deliverableType: "launch_copy",
          state: "waiting"
        },
        {
          cardId: cooCard.id,
          persona: "coo",
          title: "Unblock delivery dependency",
          deliverableType: "ops_handoff",
          state: "blocked"
        }
      ]
    });
  });

  it("derives private post-outcome directives for the current lane and next bounded dispatch", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });
    const cmoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cmo",
      title: "Draft the launch narrative",
      deliverableType: "launch_copy"
    });
    cfoCard.state = "approved";
    cmoCard.state = "approved";
    cmoCard.updatedAt = new Date(Date.parse(cfoCard.updatedAt) + 1_000).toISOString();

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);
    await repository.insertCard(cmoCard);

    const dispatchResolution = await buildHarnessWorkerDispatchResolution({
      repository,
      tenantId: "tenant-1",
      runId: run.id,
      workflowId: "wf_connect_first_workflow"
    });
    const dispatch = dispatchResolution.dispatch;
    const envelope = await buildHarnessWorkerExecutionEnvelope({
      repository,
      tenantId: "tenant-1",
      dispatch,
      requiredCapabilities: ["text_generation"],
      ...(dispatchResolution.lane ? { laneContext: dispatchResolution.lane } : {}),
      ...(dispatchResolution.executionClaim ? { executionClaimContext: dispatchResolution.executionClaim } : {})
    });

    expect(envelope).not.toBeNull();
    if (!envelope) {
      return;
    }

    expect(envelope.outcomeContract.postOutcomeDirectives).toEqual([
      {
        outcomeState: "waiting",
        runState: "waiting",
        actionKind: "dispatch_next_lane",
        summary: `If this lane ends waiting, the next bounded handoff will dispatch CMO on card ${cmoCard.id}.`,
        targetCardId: cmoCard.id,
        targetPersona: "cmo"
      },
      {
        outcomeState: "done",
        runState: "active",
        actionKind: "queue_ceo_review",
        summary: "If this lane ends done, the board will queue CEO review (Next lane decision).",
        targetCardId: cmoCard.id,
        reason: "next_lane_decision"
      },
      {
        outcomeState: "blocked",
        runState: "blocked",
        actionKind: "dispatch_next_lane",
        summary: `If this lane ends blocked, the next bounded handoff will dispatch CMO on card ${cmoCard.id}.`,
        targetCardId: cmoCard.id,
        targetPersona: "cmo"
      },
      {
        outcomeState: "cancelled",
        runState: "active",
        actionKind: "dispatch_next_lane",
        summary: `If this lane ends cancelled, the next bounded handoff will dispatch CMO on card ${cmoCard.id}.`,
        targetCardId: cmoCard.id,
        targetPersona: "cmo"
      }
    ]);
  });

  it("keeps cross-lane resume directives truthful when another child lane is the actual waiting target", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Finalize pricing review",
      deliverableType: "pricing_review"
    });
    const cmoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cmo",
      title: "Waiting on market brief",
      deliverableType: "marketing_plan"
    });
    cfoCard.state = "approved";
    cmoCard.state = "waiting";

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);
    await repository.insertCard(cmoCard);

    const dispatchResolution = await buildHarnessWorkerDispatchResolution({
      repository,
      tenantId: "tenant-1",
      runId: run.id,
      workflowId: "wf_connect_first_workflow"
    });
    const envelope = await buildHarnessWorkerExecutionEnvelope({
      repository,
      tenantId: "tenant-1",
      dispatch: dispatchResolution.dispatch,
      requiredCapabilities: ["text_generation"],
      ...(dispatchResolution.lane ? { laneContext: dispatchResolution.lane } : {}),
      ...(dispatchResolution.executionClaim ? { executionClaimContext: dispatchResolution.executionClaim } : {})
    });

    expect(envelope?.outcomeContract.postOutcomeDirectives).toEqual(
      expect.arrayContaining([
        {
          outcomeState: "done",
          runState: "waiting",
          actionKind: "await_lane_resume",
          summary: `If this lane ends done, the board will require an explicit resume decision on CMO card ${cmoCard.id}.`,
          targetCardId: cmoCard.id
        }
      ])
    );
  });

  it("returns no lane execution when all child lanes are terminal or blocked", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    run.state = "done";
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Closed lane",
      deliverableType: "pricing_review"
    });
    cfoCard.state = "done";

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);

    await expect(
      buildHarnessWorkerDispatch({
        repository,
        tenantId: "tenant-1",
        runId: run.id,
        workflowId: "wf_connect_first_workflow"
      })
    ).resolves.toEqual({
      runId: run.id,
      workflowId: "wf_connect_first_workflow",
      status: "queued",
      laneExecution: null
    });
  });

  it("does not fabricate a working-to-working transition when dispatch resumes an already active lane", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });
    markCardWorkingWithClaim(cfoCard);

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);
    await repository.upsertCardContinuity(
      createHarnessCardContinuityRecord({
        cardId: cfoCard.id,
        runId: run.id,
        continuitySource: "resume_override",
        continuitySummary: "Resume from the board-approved pricing override note.",
        latestResultSummary: null,
        absorbedWorkItems: []
      })
    );

    const beforeEvents = await repository.listEventsForCard(cfoCard.id);
    const dispatch = await buildHarnessWorkerDispatch({
      repository,
      tenantId: "tenant-1",
      runId: run.id,
      workflowId: "wf_connect_first_workflow"
    });
    const afterEvents = await repository.listEventsForCard(cfoCard.id);
    const continuity = await repository.getCardContinuity(cfoCard.id);

    expect(dispatch).toEqual({
      runId: run.id,
      workflowId: "wf_connect_first_workflow",
      status: "running",
      dispatchHandoff: {
        kind: "initial_claim",
        kindLabel: "Initial lane claim",
        executionStage: "initial_lane_start",
        executionStageLabel: "Initial lane start"
      },
      laneExecution: expect.objectContaining({
        cardId: cfoCard.id,
        state: "working",
        resumeFocus: "Resume from the board-approved pricing override note."
      })
    });
    expect(afterEvents).toEqual(
      beforeEvents.concat([
        expect.objectContaining({
          eventKind: "execution_dispatched",
          payload: {
            kind: "initial_claim",
            kindLabel: "Initial lane claim",
            executionStage: "initial_lane_start",
            executionStageLabel: "Initial lane start"
          }
        })
      ])
    );
    expect(continuity).toEqual(
      expect.objectContaining({
        cardId: cfoCard.id,
        continuitySource: "resume_override",
        continuitySummary: "Resume from the board-approved pricing override note."
      })
    );
  });

  it("persists dispatch provenance when resuming an already-claimed working lane", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });
    markCardWorkingWithClaim(cfoCard);
    cfoCard.executionClaimToken = "claim-cfo-active";
    cfoCard.executionClaimedAt = "2026-05-21T10:04:30.000Z";

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);
    await repository.upsertCardContinuity(
      createHarnessCardContinuityRecord({
        cardId: cfoCard.id,
        runId: run.id,
        continuitySource: "resume_override",
        continuitySummary: "Resume from the board-approved pricing override note.",
        latestResultSummary: null,
        absorbedWorkItems: []
      })
    );

    const beforeEvents = await repository.listEventsForCard(cfoCard.id);
    const dispatch = await buildHarnessWorkerDispatch({
      repository,
      tenantId: "tenant-1",
      runId: run.id,
      workflowId: "wf_connect_first_workflow"
    });
    const afterEvents = await repository.listEventsForCard(cfoCard.id);

    expect(dispatch).toEqual({
      runId: run.id,
      workflowId: "wf_connect_first_workflow",
      status: "running",
      dispatchHandoff: {
        kind: "initial_claim",
        kindLabel: "Initial lane claim",
        executionStage: "initial_lane_start",
        executionStageLabel: "Initial lane start"
      },
      laneExecution: expect.objectContaining({
        cardId: cfoCard.id,
        state: "working",
        resumeFocus: "Resume from the board-approved pricing override note."
      })
    });
    expect(afterEvents).toEqual(
      beforeEvents.concat([
        expect.objectContaining({
          eventKind: "execution_dispatched",
          payload: {
            kind: "initial_claim",
            kindLabel: "Initial lane claim",
            executionStage: "initial_lane_start",
            executionStageLabel: "Initial lane start"
          }
        })
      ])
    );
  });

  it("does not dispatch child lanes that are still in planning", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Shape the pricing lane",
      deliverableType: "pricing_review"
    });
    cfoCard.state = "planning";

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);

    await expect(
      buildHarnessWorkerDispatch({
        repository,
        tenantId: "tenant-1",
        runId: run.id,
        workflowId: "wf_connect_first_workflow"
      })
    ).resolves.toEqual({
      runId: run.id,
      workflowId: "wf_connect_first_workflow",
      status: "queued",
      laneExecution: null
    });
  });

  it("fails closed and stays queued when the next approved lane loses its execution claim", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });
    cfoCard.state = "approved";

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);
    await repository.updateCardState({
      cardId: cfoCard.id,
      state: "blocked"
    });

    await expect(
      buildHarnessWorkerDispatch({
        repository,
        tenantId: "tenant-1",
        runId: run.id,
        workflowId: "wf_connect_first_workflow"
      })
    ).resolves.toEqual({
      runId: run.id,
      workflowId: "wf_connect_first_workflow",
      status: "queued",
      laneExecution: null
    });
  });

  it("deliberately leaves queued child lanes undispatched until another path promotes them", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const researcherCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief"
    });

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(researcherCard);

    await expect(
      buildHarnessWorkerDispatch({
        repository,
        tenantId: "tenant-1",
        runId: run.id,
        workflowId: "wf_connect_first_workflow"
      })
    ).resolves.toEqual({
      runId: run.id,
      workflowId: "wf_connect_first_workflow",
      status: "queued",
      laneExecution: null
    });
  });

  it("fails closed for terminal run states even if child cards still look actionable", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    run.state = "done";
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Assemble run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });
    markCardWorkingWithClaim(cfoCard);

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);

    await expect(
      buildHarnessWorkerDispatch({
        repository,
        tenantId: "tenant-1",
        runId: run.id,
        workflowId: "wf_connect_first_workflow"
      })
    ).resolves.toEqual({
      runId: run.id,
      workflowId: "wf_connect_first_workflow",
      status: "queued",
      laneExecution: null
    });
  });

  it("reconciles a previously waiting run back to active when the worker starts the next approved lane", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    run.state = "waiting";
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Resume the pricing lane",
      deliverableType: "pricing_review"
    });
    cfoCard.state = "approved";

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);
    await repository.insertEvent(
      createHarnessCardEventRecord({
        cardId: cfoCard.id,
        eventKind: "state_changed",
        payload: { from: "working", to: "waiting" }
      })
    );

    await expect(
      buildHarnessWorkerDispatch({
        repository,
        tenantId: "tenant-1",
        runId: run.id,
        workflowId: "wf_connect_first_workflow"
      })
    ).resolves.toEqual(
      expect.objectContaining({
        status: "running",
        laneExecution: expect.objectContaining({
          cardId: cfoCard.id,
          state: "working"
        })
      })
    );

    await expect(repository.getRun(run.id)).resolves.toEqual(
      expect.objectContaining({
        id: run.id,
        state: "active"
      })
    );
  });

  it("commits a done worker outcome through the private lane seam and reconciles the run to assembling", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });
    markCardWorkingWithClaim(cfoCard);

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);

    await expect(
      commitHarnessWorkerLaneOutcome({
        repository,
        tenantId: "tenant-1",
        runId: run.id,
        workflowId: "wf_connect_first_workflow",
        cardId: cfoCard.id,
        executionClaimToken: cfoCard.executionClaimToken!,
        state: "done",
        resultSummary: "Validated the pricing model and preserved the final floor."
      })
    ).resolves.toEqual({
      runId: run.id,
      workflowId: "wf_connect_first_workflow",
      status: "committed",
      attentionTransition: {
        kind: "requested",
        requestedAction: {
          kind: "queue_ceo_review",
          runState: "assembling",
          reason: "final_assembly"
        }
      },
      laneExecution: {
        cardId: cfoCard.id,
        state: "done",
        runState: "assembling",
        latestResultSummary: "Validated the pricing model and preserved the final floor."
      },
      postOutcomeAction: {
        kind: "queue_ceo_review",
        runState: "assembling",
        reason: "final_assembly"
      }
    });

    await expect(repository.getCard(cfoCard.id)).resolves.toEqual(
      expect.objectContaining({
        id: cfoCard.id,
        state: "done"
      })
    );
    await expect(repository.getRun(run.id)).resolves.toEqual(
      expect.objectContaining({
        id: run.id,
        state: "assembling"
      })
    );
    await expect(repository.listEventsForCard(cfoCard.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventKind: "state_changed",
          payload: {
            from: "working",
            to: "done"
          }
        }),
        expect.objectContaining({
          eventKind: "result_recorded",
          payload: {
            summary: "Validated the pricing model and preserved the final floor."
          }
        }),
        expect.objectContaining({
          eventKind: "execution_outcome_committed",
          payload: {
            attentionTransitionKind: "requested",
            outcomeState: "done",
            runState: "assembling",
            postOutcomeActionKind: "queue_ceo_review",
            postOutcomeReason: "final_assembly",
            resultSummary: "Validated the pricing model and preserved the final floor."
          }
        }),
        expect.objectContaining({
          eventKind: "attention_requested",
          payload: {
            actionKind: "queue_ceo_review",
            runState: "assembling",
            reason: "final_assembly",
            statusLabel: "CEO review required",
            summary: "The board is ready for final assembly before the tenant-facing package is closed.",
            reasonLabel: "Final assembly",
            targetPersona: "ceo"
          }
        })
      ])
    );
  });

  it("classifies assembling runs with deferred governance as a CEO governance hold", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Finalize pricing review",
      deliverableType: "pricing_review"
    });
    markCardWorkingWithClaim(cfoCard);

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);
    await repository.insertProposal({
      id: "proposal_deferred_marketing_followup",
      runId: run.id,
      parentCardId: ceoCard.id,
      requestedByCardId: ceoCard.id,
      requestedByPersona: "ceo",
      persona: "cmo",
      title: "Revisit launch messaging after packaging",
      deliverableType: "marketing_plan",
      status: "deferred"
    });

    await expect(
      commitHarnessWorkerLaneOutcome({
        repository,
        tenantId: "tenant-1",
        runId: run.id,
        workflowId: "wf_connect_first_workflow",
        cardId: cfoCard.id,
        executionClaimToken: cfoCard.executionClaimToken!,
        state: "done",
        resultSummary: "Pricing review is complete and the deferred messaging follow-up remains open."
      })
    ).resolves.toEqual(
      expect.objectContaining({
        attentionTransition: {
          kind: "requested",
          requestedAction: {
            kind: "queue_ceo_review",
            runState: "assembling",
            reason: "governance_hold"
          }
        },
        laneExecution: expect.objectContaining({
          cardId: cfoCard.id,
          runState: "assembling"
        }),
        postOutcomeAction: {
          kind: "queue_ceo_review",
          runState: "assembling",
          reason: "governance_hold"
        }
      })
    );
  });

  it("queues explicit CEO next-lane review after a worker commits a done outcome with another approved lane waiting", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Finalize pricing review",
      deliverableType: "pricing_review"
    });
    markCardWorkingWithClaim(cfoCard);
    const cmoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cmo",
      title: "Prepare launch messaging",
      deliverableType: "marketing_plan"
    });
    cmoCard.state = "approved";

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);
    await repository.insertCard(cmoCard);
    await repository.upsertCardContinuity(
      createHarnessCardContinuityRecord({
        cardId: cmoCard.id,
        runId: run.id,
        continuitySummary: "Resume the launch messaging lane from the approved positioning draft."
      })
    );

    await expect(
      commitHarnessWorkerLaneOutcome({
        repository,
        tenantId: "tenant-1",
        runId: run.id,
        workflowId: "wf_connect_first_workflow",
        cardId: cfoCard.id,
        executionClaimToken: cfoCard.executionClaimToken!,
        state: "done",
        resultSummary: "Pricing review is complete and ready for board packaging."
      })
    ).resolves.toEqual(
      expect.objectContaining({
        runId: run.id,
        workflowId: "wf_connect_first_workflow",
        status: "committed",
        attentionTransition: {
          kind: "requested",
          requestedAction: {
            kind: "queue_ceo_review",
            runState: "active",
            reason: "next_lane_decision",
            completedCardId: cfoCard.id,
            nextCardId: cmoCard.id
          }
        },
        laneExecution: {
          cardId: cfoCard.id,
          state: "done",
          runState: "active",
          latestResultSummary: "Pricing review is complete and ready for board packaging."
        },
        postOutcomeAction: {
          kind: "queue_ceo_review",
          runState: "active",
          reason: "next_lane_decision",
          completedCardId: cfoCard.id,
          nextCardId: cmoCard.id
        }
      })
    );

    await expect(repository.getCard(cfoCard.id)).resolves.toEqual(
      expect.objectContaining({
        id: cfoCard.id,
        state: "done"
      })
    );
    await expect(repository.getCard(cmoCard.id)).resolves.toEqual(
      expect.objectContaining({
        id: cmoCard.id,
        state: "approved"
      })
    );
    await expect(repository.getRun(run.id)).resolves.toEqual(
      expect.objectContaining({
        id: run.id,
        state: "active"
      })
    );
  });

  it("reports an active post-outcome dispatch after follow-on lane claim reactivates a waiting run", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    run.state = "waiting";
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Finalize pricing review",
      deliverableType: "pricing_review"
    });
    markCardWorkingWithClaim(cfoCard);
    const cmoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cmo",
      title: "Prepare launch messaging",
      deliverableType: "marketing_plan"
    });
    cmoCard.state = "approved";

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);
    await repository.insertCard(cmoCard);

    const result = await commitHarnessWorkerLaneOutcome({
      repository,
      tenantId: "tenant-1",
      runId: run.id,
      workflowId: "wf_connect_first_workflow",
      cardId: cfoCard.id,
      executionClaimToken: cfoCard.executionClaimToken!,
      state: "done",
      resultSummary: "Pricing review is complete and the messaging lane can begin."
    });

    expect(result).toEqual(
      expect.objectContaining({
        attentionTransition: {
          kind: "requested",
          requestedAction: {
            kind: "queue_ceo_review",
            runState: "active",
            reason: "next_lane_decision",
            completedCardId: cfoCard.id,
            nextCardId: cmoCard.id
          }
        },
        laneExecution: expect.objectContaining({
          cardId: cfoCard.id,
          state: "done",
          runState: "active",
          latestResultSummary: "Pricing review is complete and the messaging lane can begin."
        }),
        postOutcomeAction: {
          kind: "queue_ceo_review",
          runState: "active",
          reason: "next_lane_decision",
          completedCardId: cfoCard.id,
          nextCardId: cmoCard.id
        }
      })
    );
    expect(result.nextDispatch).toBeUndefined();
  });

  it("commits a waiting worker outcome with a bounded resume summary", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Wait for revenue assumptions",
      deliverableType: "pricing_review"
    });
    markCardWorkingWithClaim(cfoCard);

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);

    await expect(
      commitHarnessWorkerLaneOutcome({
        repository,
        tenantId: "tenant-1",
        runId: run.id,
        workflowId: "wf_connect_first_workflow",
        cardId: cfoCard.id,
        executionClaimToken: cfoCard.executionClaimToken!,
        state: "waiting",
        resumeSummary: "CFO should resume this lane once the tenant confirms the latest revenue assumption."
      })
    ).resolves.toEqual({
      runId: run.id,
      workflowId: "wf_connect_first_workflow",
      status: "committed",
      attentionTransition: {
        kind: "requested",
        requestedAction: {
          kind: "await_lane_resume",
          runState: "waiting",
          cardId: cfoCard.id
        }
      },
      laneExecution: {
        cardId: cfoCard.id,
        state: "waiting",
        runState: "waiting",
        resumeFocus: "CFO should resume this lane once the tenant confirms the latest revenue assumption."
      },
      postOutcomeAction: {
        kind: "await_lane_resume",
        runState: "waiting",
        cardId: cfoCard.id
      }
    });

    await expect(repository.listEventsForCard(cfoCard.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventKind: "execution_outcome_committed",
          payload: {
            attentionTransitionKind: "requested",
            outcomeState: "waiting",
            runState: "waiting",
            postOutcomeActionKind: "await_lane_resume",
            targetCardId: cfoCard.id,
            continuitySummary: "CFO should resume this lane once the tenant confirms the latest revenue assumption."
          }
        }),
        expect.objectContaining({
          eventKind: "attention_requested",
          payload: {
            actionKind: "await_lane_resume",
            runState: "waiting",
            targetCardId: cfoCard.id,
            statusLabel: "Waiting on lane resume",
            summary: "CFO should resume this lane once the tenant confirms the latest revenue assumption.",
            targetPersona: "cfo",
            targetTitle: "Wait for revenue assumptions"
          }
        })
      ])
    );
  });

  it("rejects a done worker outcome without a bounded result summary", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Finalize pricing review",
      deliverableType: "pricing_review"
    });
    markCardWorkingWithClaim(cfoCard);

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);

    await expect(
      commitHarnessWorkerLaneOutcome({
        repository,
        tenantId: "tenant-1",
        runId: run.id,
        workflowId: "wf_connect_first_workflow",
        cardId: cfoCard.id,
        executionClaimToken: cfoCard.executionClaimToken!,
        state: "done"
      })
    ).rejects.toThrow("Worker lane result summaries are required for done outcomes");
  });

  it("reports new attention requested in worker outcome metadata", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Wait for revenue assumptions",
      deliverableType: "pricing_review"
    });
    markCardWorkingWithClaim(cfoCard);

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);

    await expect(
      commitHarnessWorkerLaneOutcome({
        repository,
        tenantId: "tenant-1",
        runId: run.id,
        workflowId: "wf_connect_first_workflow",
        cardId: cfoCard.id,
        executionClaimToken: cfoCard.executionClaimToken!,
        state: "waiting",
        resumeSummary: "CFO should resume this lane once the tenant confirms the latest revenue assumption."
      })
    ).resolves.toEqual(
      expect.objectContaining({
        attentionTransition: {
          kind: "requested",
          requestedAction: {
            kind: "await_lane_resume",
            runState: "waiting",
            cardId: cfoCard.id
          }
        }
      })
    );
  });

  it("points await_lane_resume at the actual waiting lane when another child lane is paused", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Finalize pricing review",
      deliverableType: "pricing_review"
    });
    markCardWorkingWithClaim(cfoCard);
    const cmoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cmo",
      title: "Waiting on market brief",
      deliverableType: "marketing_plan"
    });
    cmoCard.state = "waiting";

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);
    await repository.insertCard(cmoCard);

    await expect(
      commitHarnessWorkerLaneOutcome({
        repository,
        tenantId: "tenant-1",
        runId: run.id,
        workflowId: "wf_connect_first_workflow",
        cardId: cfoCard.id,
        executionClaimToken: cfoCard.executionClaimToken!,
        state: "done",
        resultSummary: "Pricing review is complete and waiting on the CMO brief."
      })
    ).resolves.toEqual(
      expect.objectContaining({
        postOutcomeAction: {
          kind: "await_lane_resume",
          runState: "waiting",
          cardId: cmoCard.id
        }
      })
    );
  });

  it("resolves prior CEO review attention when follow-on lane dispatch resumes active work", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Finalize pricing review",
      deliverableType: "pricing_review"
    });
    markCardWorkingWithClaim(cfoCard);
    const cmoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cmo",
      title: "Prepare launch messaging",
      deliverableType: "marketing_plan"
    });
    cmoCard.state = "approved";

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);
    await repository.insertCard(cmoCard);
    await repository.insertEvent(
      createHarnessCardEventRecord({
        cardId: cfoCard.id,
        eventKind: "attention_requested",
        payload: {
          actionKind: "queue_ceo_review",
          runState: "assembling",
          reason: "final_assembly"
        }
      })
    );

    await expect(
      commitHarnessWorkerLaneOutcome({
        repository,
        tenantId: "tenant-1",
        runId: run.id,
        workflowId: "wf_connect_first_workflow",
        cardId: cfoCard.id,
        executionClaimToken: cfoCard.executionClaimToken!,
        state: "done",
        resultSummary: "Pricing review is complete and ready for board packaging."
      })
    ).resolves.toEqual(
      expect.objectContaining({
        attentionTransition: {
          kind: "requested",
          resolvedAction: {
            kind: "queue_ceo_review",
            runState: "assembling",
            reason: "final_assembly"
          },
          requestedAction: {
            kind: "queue_ceo_review",
            runState: "active",
            reason: "next_lane_decision",
            completedCardId: cfoCard.id,
            nextCardId: cmoCard.id
          }
        },
        postOutcomeAction: {
          kind: "queue_ceo_review",
          runState: "active",
          reason: "next_lane_decision",
          completedCardId: cfoCard.id,
          nextCardId: cmoCard.id
        }
      })
    );

    await expect(repository.listEventsForCard(cfoCard.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventKind: "attention_resolved",
          payload: {
            actionKind: "queue_ceo_review",
            runState: "assembling",
            reason: "final_assembly",
            statusLabel: "CEO review required",
            summary: "The board is ready for final assembly before the tenant-facing package is closed.",
            reasonLabel: "Final assembly",
            targetPersona: "ceo"
          }
        }),
        expect.objectContaining({
          eventKind: "attention_requested",
          payload: expect.objectContaining({
            actionKind: "queue_ceo_review",
            runState: "active",
            reason: "next_lane_decision",
            completedCardId: cfoCard.id,
            nextCardId: cmoCard.id
          })
        })
      ])
    );
  });

  it("reports prior attention resolved by follow-on dispatch in worker outcome metadata", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Finalize pricing review",
      deliverableType: "pricing_review"
    });
    markCardWorkingWithClaim(cfoCard);
    const cmoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cmo",
      title: "Resume launch messaging",
      deliverableType: "marketing_plan"
    });
    cmoCard.state = "approved";

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);
    await repository.insertCard(cmoCard);
    await repository.insertEvent(
      createHarnessCardEventRecord({
        cardId: cmoCard.id,
        eventKind: "attention_requested",
        payload: {
          actionKind: "await_lane_resume",
          runState: "waiting",
          targetCardId: cmoCard.id,
          statusLabel: "Waiting on lane resume",
          summary: "A child lane is paused and needs a bounded resume decision before work can continue.",
          targetPersona: "cmo",
          targetTitle: "Resume launch messaging"
        }
      })
    );

    await expect(
      commitHarnessWorkerLaneOutcome({
        repository,
        tenantId: "tenant-1",
        runId: run.id,
        workflowId: "wf_connect_first_workflow",
        cardId: cfoCard.id,
        executionClaimToken: cfoCard.executionClaimToken!,
        state: "done",
        resultSummary: "Pricing review is complete and ready for board packaging."
      })
    ).resolves.toEqual(
      expect.objectContaining({
        attentionTransition: {
          kind: "requested",
          resolvedAction: {
            kind: "await_lane_resume",
            runState: "waiting",
            cardId: cmoCard.id
          },
          requestedAction: {
            kind: "queue_ceo_review",
            runState: "active",
            reason: "next_lane_decision",
            completedCardId: cfoCard.id,
            nextCardId: cmoCard.id
          }
        }
      })
    );

    await expect(repository.listEventsForCard(cmoCard.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventKind: "attention_resolved",
          payload: {
            actionKind: "await_lane_resume",
            runState: "waiting",
            targetCardId: cmoCard.id,
            statusLabel: "Waiting on lane resume",
            summary: "A child lane is paused and needs a bounded resume decision before work can continue.",
            targetPersona: "cmo",
            targetTitle: "Resume launch messaging"
          }
        })
      ])
    );
    await expect(repository.listEventsForCard(cfoCard.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventKind: "attention_requested",
          payload: expect.objectContaining({
            actionKind: "queue_ceo_review",
            runState: "active",
            reason: "next_lane_decision",
            completedCardId: cfoCard.id,
            nextCardId: cmoCard.id
          })
        })
      ])
    );
  });

  it("does not duplicate CEO review attention when the same unresolved review is already active", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Finalize pricing review",
      deliverableType: "pricing_review"
    });
    markCardWorkingWithClaim(cfoCard);
    const cmoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cmo",
      title: "Waiting on market brief",
      deliverableType: "marketing_plan"
    });
    cmoCard.state = "waiting";

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);
    await repository.insertCard(cmoCard);
    await repository.insertEvent(
      createHarnessCardEventRecord({
        cardId: cmoCard.id,
        eventKind: "attention_requested",
        payload: {
          actionKind: "await_lane_resume",
          runState: "waiting",
          targetCardId: cmoCard.id
        }
      })
    );

    await expect(
      commitHarnessWorkerLaneOutcome({
        repository,
        tenantId: "tenant-1",
        runId: run.id,
        workflowId: "wf_connect_first_workflow",
        cardId: cfoCard.id,
        executionClaimToken: cfoCard.executionClaimToken!,
        state: "done",
        resultSummary: "Pricing review is complete and ready for board packaging."
      })
    ).resolves.toEqual(
      expect.objectContaining({
        attentionTransition: {
          kind: "unchanged",
          action: {
            kind: "await_lane_resume",
            runState: "waiting",
            cardId: cmoCard.id
          }
        }
      })
    );

    const runEvents = await repository.listEventsForRun(run.id);
    expect(runEvents.filter((event) => event.eventKind === "attention_requested")).toHaveLength(1);
    expect(runEvents.filter((event) => event.eventKind === "attention_resolved")).toHaveLength(0);
  });

  it("reports repeated unresolved attention as unchanged in worker outcome metadata", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Finalize pricing review",
      deliverableType: "pricing_review"
    });
    markCardWorkingWithClaim(cfoCard);
    const cmoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cmo",
      title: "Waiting on market brief",
      deliverableType: "marketing_plan"
    });
    cmoCard.state = "waiting";

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);
    await repository.insertCard(cmoCard);
    await repository.insertEvent(
      createHarnessCardEventRecord({
        cardId: cmoCard.id,
        eventKind: "attention_requested",
        payload: {
          actionKind: "await_lane_resume",
          runState: "waiting",
          targetCardId: cmoCard.id
        }
      })
    );

    await expect(
      commitHarnessWorkerLaneOutcome({
        repository,
        tenantId: "tenant-1",
        runId: run.id,
        workflowId: "wf_connect_first_workflow",
        cardId: cfoCard.id,
        executionClaimToken: cfoCard.executionClaimToken!,
        state: "done",
        resultSummary: "Pricing review is complete and ready for board packaging."
      })
    ).resolves.toEqual(
      expect.objectContaining({
        attentionTransition: {
          kind: "unchanged",
          action: {
            kind: "await_lane_resume",
            runState: "waiting",
            cardId: cmoCard.id
          }
        }
      })
    );

    await expect(repository.listEventsForCard(cfoCard.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventKind: "execution_outcome_committed",
          payload: expect.objectContaining({
            attentionTransitionKind: "unchanged",
            outcomeState: "done",
            resultSummary: "Pricing review is complete and ready for board packaging."
          })
        })
      ])
    );
  });

  it("reports repeated unresolved CEO review attention as unchanged in worker outcome metadata", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Finalize pricing review",
      deliverableType: "pricing_review"
    });
    markCardWorkingWithClaim(cfoCard);

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);
    await repository.insertEvent(
      createHarnessCardEventRecord({
        cardId: cfoCard.id,
        eventKind: "attention_requested",
        payload: {
          actionKind: "queue_ceo_review",
          runState: "assembling",
          reason: "final_assembly"
        }
      })
    );

    await expect(
      commitHarnessWorkerLaneOutcome({
        repository,
        tenantId: "tenant-1",
        runId: run.id,
        workflowId: "wf_connect_first_workflow",
        cardId: cfoCard.id,
        executionClaimToken: cfoCard.executionClaimToken!,
        state: "done",
        resultSummary: "Pricing review is complete and ready for board packaging."
      })
    ).resolves.toEqual(
      expect.objectContaining({
        attentionTransition: {
          kind: "unchanged",
          action: {
            kind: "queue_ceo_review",
            runState: "assembling",
            reason: "final_assembly"
          }
        }
      })
    );
  });

  it("ignores worker outcome commits for lanes that are no longer working", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Already paused",
      deliverableType: "pricing_review"
    });
    cfoCard.state = "waiting";

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);

    await expect(
      commitHarnessWorkerLaneOutcome({
        repository,
        tenantId: "tenant-1",
        runId: run.id,
        workflowId: "wf_connect_first_workflow",
        cardId: cfoCard.id,
        state: "done",
        resultSummary: "This should not commit."
      })
    ).resolves.toEqual({
      runId: run.id,
      workflowId: "wf_connect_first_workflow",
      status: "ignored",
      ignored: {
        reason: "lane_not_working",
        currentLaneState: "waiting"
      }
    });
    await expect(repository.listEventsForCard(cfoCard.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventKind: "execution_outcome_ignored",
          payload: {
            reason: "lane_not_working",
            currentLaneState: "waiting"
          }
        })
      ])
    );
  });

  it("persists a bounded ignored-outcome event when a worker callback arrives after the run is already terminal", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    run.state = "done";
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Finalize pricing review",
      deliverableType: "pricing_review"
    });
    cfoCard.state = "working";

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);

    await expect(
      commitHarnessWorkerLaneOutcome({
        repository,
        tenantId: "tenant-1",
        runId: run.id,
        workflowId: "wf_connect_first_workflow",
        cardId: cfoCard.id,
        executionClaimToken: "claim-cfo-1",
        state: "done",
        resultSummary: "This should not commit."
      })
    ).resolves.toEqual({
      runId: run.id,
      workflowId: "wf_connect_first_workflow",
      status: "ignored",
      ignored: {
        reason: "terminal_run",
        runState: "done"
      }
    });
    await expect(repository.listEventsForCard(cfoCard.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventKind: "execution_outcome_ignored",
          payload: {
            reason: "terminal_run",
            runState: "done"
          }
        })
      ])
    );
  });

  it("ignores worker outcome commits that present a stale execution claim token", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });
    cfoCard.state = "approved";

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);

    const dispatchResolution = await buildHarnessWorkerDispatchResolution({
      repository,
      tenantId: "tenant-1",
      runId: run.id,
      workflowId: "wf_connect_first_workflow"
    });
    const dispatch = dispatchResolution.dispatch;
    const envelope = await buildHarnessWorkerExecutionEnvelope({
      repository,
      tenantId: "tenant-1",
      dispatch,
      requiredCapabilities: ["text_generation"],
      ...(dispatchResolution.lane ? { laneContext: dispatchResolution.lane } : {}),
      ...(dispatchResolution.executionClaim ? { executionClaimContext: dispatchResolution.executionClaim } : {})
    });
    expect(envelope).not.toBeNull();
    if (!envelope) {
      return;
    }

    await expect(
      commitHarnessWorkerLaneOutcome({
        repository,
        tenantId: "tenant-1",
        runId: run.id,
        workflowId: "wf_connect_first_workflow",
        cardId: cfoCard.id,
        executionClaimToken: "stale-claim-token",
        state: "done",
        resultSummary: "This should not commit."
      })
    ).resolves.toEqual({
      runId: run.id,
      workflowId: "wf_connect_first_workflow",
      status: "ignored",
      ignored: {
        reason: "stale_execution_claim",
        currentLaneState: "working",
        activeExecutionClaimPresent: true,
        activeExecutionClaimClaimedAt: expect.any(String),
        presentedExecutionClaimState: "mismatched"
      }
    });
    await expect(repository.listEventsForCard(cfoCard.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventKind: "execution_outcome_ignored",
          payload: {
            reason: "stale_execution_claim",
            currentLaneState: "working",
            activeExecutionClaimPresent: true,
            activeExecutionClaimClaimedAt: expect.any(String),
            presentedExecutionClaimState: "mismatched"
          }
        })
      ])
    );
  });

  it("fails closed when a working lane lost its persisted execution claim", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });
    cfoCard.state = "working";
    cfoCard.executionClaimToken = null;
    cfoCard.executionClaimedAt = null;

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);

    await expect(
      commitHarnessWorkerLaneOutcome({
        repository,
        tenantId: "tenant-1",
        runId: run.id,
        workflowId: "wf_connect_first_workflow",
        cardId: cfoCard.id,
        state: "done",
        resultSummary: "This should not commit."
      })
    ).resolves.toEqual({
      runId: run.id,
      workflowId: "wf_connect_first_workflow",
      status: "ignored",
      ignored: {
        reason: "stale_execution_claim",
        currentLaneState: "working",
        activeExecutionClaimPresent: false,
        activeExecutionClaimClaimedAt: null,
        presentedExecutionClaimState: "missing"
      }
    });
    await expect(repository.listEventsForCard(cfoCard.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventKind: "execution_outcome_ignored",
          payload: {
            reason: "stale_execution_claim",
            currentLaneState: "working",
            activeExecutionClaimPresent: false,
            activeExecutionClaimClaimedAt: null,
            presentedExecutionClaimState: "missing"
          }
        })
      ])
    );
  });

  it("fails closed when another worker already claimed the approved lane before dispatch persisted", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });
    cfoCard.state = "approved";

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);
    const claimCardForExecution = repository.claimCardForExecution.bind(repository);
    repository.claimCardForExecution = async () => null;

    await expect(
      buildHarnessWorkerDispatchResolution({
        repository,
        tenantId: "tenant-1",
        runId: run.id,
        workflowId: "wf_connect_first_workflow"
      })
    ).resolves.toEqual({
      dispatch: {
        runId: run.id,
        workflowId: "wf_connect_first_workflow",
        status: "queued",
        laneExecution: null
      }
    });

    expect(repository.claimCardForExecution).not.toBe(claimCardForExecution);
    await expect(repository.getCard(cfoCard.id)).resolves.toEqual(
      expect.objectContaining({
        id: cfoCard.id,
        state: "approved",
        executionClaimToken: null,
        executionClaimedAt: null
      })
    );
    await expect(repository.listEventsForCard(cfoCard.id)).resolves.toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ eventKind: "execution_dispatched" }),
        expect.objectContaining({ eventKind: "execution_claimed" }),
        expect.objectContaining({ eventKind: "state_changed" })
      ])
    );
    await expect(repository.getCardContinuity(cfoCard.id)).resolves.toBeNull();
  });

  it("fails closed when a working lane loses the claim-refresh race before dispatch persisted", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });
    cfoCard.state = "working";
    cfoCard.executionClaimToken = null;
    cfoCard.executionClaimedAt = null;

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);
    repository.refreshCardExecutionClaim = async () => null;

    await expect(
      buildHarnessWorkerDispatchResolution({
        repository,
        tenantId: "tenant-1",
        runId: run.id,
        workflowId: "wf_connect_first_workflow"
      })
    ).resolves.toEqual({
      dispatch: {
        runId: run.id,
        workflowId: "wf_connect_first_workflow",
        status: "queued",
        laneExecution: null
      }
    });

    await expect(repository.getCard(cfoCard.id)).resolves.toEqual(
      expect.objectContaining({
        id: cfoCard.id,
        state: "working",
        executionClaimToken: null,
        executionClaimedAt: null
      })
    );
    await expect(repository.listEventsForCard(cfoCard.id)).resolves.toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ eventKind: "execution_dispatched" }),
        expect.objectContaining({ eventKind: "execution_claim_refreshed" }),
        expect.objectContaining({ eventKind: "state_changed" })
      ])
    );
    await expect(repository.getCardContinuity(cfoCard.id)).resolves.toBeNull();
  });

  it("prefers an already-working lane over approved lanes when picking the next actionable dispatch", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const cfoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });
    markCardWorkingWithClaim(cfoCard, "claim-cfo-active");
    const cmoCard = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cmo",
      title: "Prepare launch messaging",
      deliverableType: "marketing_plan"
    });
    cmoCard.state = "approved";

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(cfoCard);
    await repository.insertCard(cmoCard);

    const resolution = await buildHarnessWorkerDispatchResolution({
      repository,
      tenantId: "tenant-1",
      runId: run.id,
      workflowId: "wf_connect_first_workflow"
    });

    expect(resolution.dispatch.status).toBe("running");
    expect(resolution.dispatch?.laneExecution).toEqual(
      expect.objectContaining({
        cardId: cfoCard.id,
        persona: "cfo",
        state: "working"
      })
    );
    expect(resolution.executionClaim).toEqual(
      expect.objectContaining({
        kind: "existing_working_claim",
        claimedAt: "2026-05-21T10:04:30.000Z",
        previousClaimedAt: "2026-05-21T10:04:30.000Z"
      })
    );
  });

  it("orders equally actionable lanes by updatedAt first and createdAt second", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const ceoCard = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan run",
      deliverableType: "plan"
    });
    const olderApproved = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cfo",
      title: "Older approved lane",
      deliverableType: "pricing_review"
    });
    olderApproved.state = "approved";
    olderApproved.createdAt = "2026-05-21T10:01:00.000Z";
    olderApproved.updatedAt = "2026-05-21T10:05:00.000Z";

    const sameUpdatedEarlierCreated = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "cmo",
      title: "Same update, earlier create",
      deliverableType: "marketing_plan"
    });
    sameUpdatedEarlierCreated.state = "approved";
    sameUpdatedEarlierCreated.createdAt = "2026-05-21T10:00:30.000Z";
    sameUpdatedEarlierCreated.updatedAt = "2026-05-21T10:05:00.000Z";

    const newestApproved = createHarnessCardRecord({
      runId: run.id,
      parentCardId: ceoCard.id,
      persona: "researcher",
      title: "Newest approved lane",
      deliverableType: "research_brief"
    });
    newestApproved.state = "approved";
    newestApproved.createdAt = "2026-05-21T10:02:00.000Z";
    newestApproved.updatedAt = "2026-05-21T10:06:00.000Z";

    await repository.insertRun(run);
    await repository.insertCard(ceoCard);
    await repository.insertCard(olderApproved);
    await repository.insertCard(sameUpdatedEarlierCreated);
    await repository.insertCard(newestApproved);

    const firstResolution = await buildHarnessWorkerDispatchResolution({
      repository,
      tenantId: "tenant-1",
      runId: run.id,
      workflowId: "wf_connect_first_workflow"
    });
    expect(firstResolution.dispatch?.laneExecution).toEqual(
      expect.objectContaining({
        cardId: sameUpdatedEarlierCreated.id
      })
    );

    const firstClaimedCard = await repository.getCard(sameUpdatedEarlierCreated.id);
    expect(firstClaimedCard?.state).toBe("working");
    await repository.transitionCardState({
      cardId: sameUpdatedEarlierCreated.id,
      expectedState: "working",
      state: "done"
    });

    const secondResolution = await buildHarnessWorkerDispatchResolution({
      repository,
      tenantId: "tenant-1",
      runId: run.id,
      workflowId: "wf_connect_first_workflow"
    });
    expect(secondResolution.dispatch?.laneExecution).toEqual(
      expect.objectContaining({
        cardId: olderApproved.id
      })
    );
  });
});
