import { describe, expect, it } from "vitest";

import { createInMemoryHarnessRepository } from "../src/harness/repository.js";
import { buildHarnessWorkerDispatch, commitHarnessWorkerLaneOutcome } from "../src/harness/worker-executor.js";
import {
  createHarnessCardEventRecord,
  createHarnessCardContinuityRecord,
  createHarnessCardRecord,
  createHarnessRunRecord
} from "../src/harness/types.js";

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
        })
      ])
    );
    await expect(repository.getCardContinuity(cfoCard.id)).resolves.toEqual(
      expect.objectContaining({
        cardId: cfoCard.id,
        continuitySummary: "CFO should continue this active pricing review lane: Pressure-test the pricing lane.",
        latestResultSummary: "Initial pricing floor is stable."
      })
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
    run.state = "assembling";
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
    cfoCard.state = "working";

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
        state: "done",
        resultSummary: "Validated the pricing model and preserved the final floor."
      })
    ).resolves.toEqual({
      runId: run.id,
      workflowId: "wf_connect_first_workflow",
      status: "committed",
      laneExecution: {
        cardId: cfoCard.id,
        state: "done",
        runState: "assembling",
        latestResultSummary: "Validated the pricing model and preserved the final floor."
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
        })
      ])
    );
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
        state: "waiting",
        resumeSummary: "CFO should resume this lane once the tenant confirms the latest revenue assumption."
      })
    ).resolves.toEqual({
      runId: run.id,
      workflowId: "wf_connect_first_workflow",
      status: "committed",
      laneExecution: {
        cardId: cfoCard.id,
        state: "waiting",
        runState: "waiting",
        resumeFocus: "CFO should resume this lane once the tenant confirms the latest revenue assumption."
      }
    });
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
      reason: "lane_not_working"
    });
  });
});
