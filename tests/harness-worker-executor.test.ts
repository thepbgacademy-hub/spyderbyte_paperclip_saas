import { describe, expect, it } from "vitest";

import { createInMemoryHarnessRepository } from "../src/harness/repository.js";
import { buildHarnessWorkerDispatch } from "../src/harness/worker-executor.js";
import {
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
        resumeFocus: "Resume the pricing lane from the revised assumptions workbook.",
        latestResultSummary: "Initial pricing floor is stable."
      }
    });

    await expect(repository.getCard(cfoCard.id)).resolves.toEqual(
      expect.objectContaining({
        id: cfoCard.id,
        state: "working"
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
});
