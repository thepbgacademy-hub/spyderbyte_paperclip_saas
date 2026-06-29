import { describe, expect, it } from "vitest";

import {
  listPublicWorkflowHarnessBootstrapIds,
  seedPublicWorkflowHarnessRun
} from "../src/harness/public-run-bootstrap.js";
import { createInMemoryHarnessRepository } from "../src/harness/repository.js";
import { CURRENT_CORE_NATIVE_WORKFLOW_IDS } from "../src/worker/native-workflow-definitions.js";

describe("public run bootstrap", () => {
  it("covers the canonical current core family set and keeps the explicit example-audit host as the only extra bootstrap id", () => {
    expect(listPublicWorkflowHarnessBootstrapIds()).toEqual([
      ...CURRENT_CORE_NATIVE_WORKFLOW_IDS,
      "wf-example-audit"
    ]);
  });

  it("seeds the connect-first native public start with the queued run id and first actionable lane", async () => {
    const repository = createInMemoryHarnessRepository();

    await seedPublicWorkflowHarnessRun({
      repository,
      tenantId: "tenant-1",
      runId: "run-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      providerKind: "openai_api",
      credentialLabel: "Primary OpenAI"
    });

    const run = await repository.getRun("run-1");
    const cards = await repository.listCardsForRun("run-1");
    const childLane = cards.find((card) => card.persona !== "ceo") ?? null;
    const continuity = childLane ? await repository.getCardContinuity(childLane.id) : null;

    expect(run).toMatchObject({
      id: "run-1",
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      state: "active"
    });
    expect(cards.map((card) => ({ persona: card.persona, title: card.title, deliverableType: card.deliverableType, state: card.state }))).toEqual([
      {
        persona: "ceo",
        title: "Plan run",
        deliverableType: "plan",
        state: "planning"
      },
      {
        persona: "cfo",
        title: "Pressure-test the pricing lane",
        deliverableType: "pricing_review",
        state: "approved"
      }
    ]);
    expect(continuity).toMatchObject({
      cardId: childLane?.id,
      runId: "run-1",
      continuitySummary: "CFO should begin this approved pricing review lane: Pressure-test the pricing lane."
    });
  });

  it("seeds the tax-strategy native public start with the bounded tax lane", async () => {
    const repository = createInMemoryHarnessRepository();

    await seedPublicWorkflowHarnessRun({
      repository,
      tenantId: "tenant-1",
      runId: "run-tax-1",
      workflowId: "wf_tax_strategy",
      packageId: "pkg_tax_strategy",
      providerKind: "openai_api",
      credentialLabel: "Primary OpenAI"
    });

    const cards = await repository.listCardsForRun("run-tax-1");
    const childLane = cards.find((card) => card.persona !== "ceo") ?? null;
    const continuity = childLane ? await repository.getCardContinuity(childLane.id) : null;

    expect(cards.map((card) => ({ persona: card.persona, title: card.title, deliverableType: card.deliverableType, state: card.state }))).toEqual([
      {
        persona: "ceo",
        title: "Plan run",
        deliverableType: "plan",
        state: "planning"
      },
      {
        persona: "cfo",
        title: "Review the founder tax posture",
        deliverableType: "tax_strategy_review",
        state: "approved"
      }
    ]);
    expect(continuity).toMatchObject({
      cardId: childLane?.id,
      runId: "run-tax-1",
      continuitySummary:
        "CFO should assess the founder tax posture against the current restructuring assumptions workbook, return one bounded advisor-ready recommendation, or name the single missing artifact blocking completion."
    });
  });

  it("seeds the package-followup native public start with the bounded launch-copy lane", async () => {
    const repository = createInMemoryHarnessRepository();

    await seedPublicWorkflowHarnessRun({
      repository,
      tenantId: "tenant-1",
      runId: "run-followup-1",
      workflowId: "wf_package_followup",
      packageId: "pkg_package_followup",
      providerKind: "openai_api",
      credentialLabel: "Primary OpenAI"
    });

    const cards = await repository.listCardsForRun("run-followup-1");

    expect(cards.map((card) => ({ persona: card.persona, title: card.title, deliverableType: card.deliverableType, state: card.state }))).toEqual([
      {
        persona: "ceo",
        title: "Plan run",
        deliverableType: "plan",
        state: "planning"
      },
      {
        persona: "cmo",
        title: "Draft the package follow-up narrative",
        deliverableType: "launch_copy",
        state: "approved"
      }
    ]);
  });

  it("seeds the example-audit native public start with the bounded research-brief lane", async () => {
    const repository = createInMemoryHarnessRepository();

    await seedPublicWorkflowHarnessRun({
      repository,
      tenantId: "tenant-1",
      runId: "run-audit-1",
      workflowId: "wf-example-audit",
      packageId: "pkg-example-audit",
      providerKind: "openai_api",
      credentialLabel: "Primary OpenAI"
    });

    const cards = await repository.listCardsForRun("run-audit-1");

    expect(cards.map((card) => ({ persona: card.persona, title: card.title, deliverableType: card.deliverableType, state: card.state }))).toEqual([
      {
        persona: "ceo",
        title: "Plan run",
        deliverableType: "plan",
        state: "planning"
      },
      {
        persona: "cmo",
        title: "Review the example findings brief",
        deliverableType: "research_brief",
        state: "approved"
      }
    ]);
  });
});
