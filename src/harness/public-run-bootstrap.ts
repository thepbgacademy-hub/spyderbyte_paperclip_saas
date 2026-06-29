import { randomUUID } from "node:crypto";

import type { HarnessRepository } from "./repository.js";
import { createHarnessRuntime } from "./runtime.js";
import { transitionHarnessRun } from "./state-machine.js";
import { createHarnessCardContinuityRecord, createHarnessCardEventRecord } from "./types.js";
import type { ProviderKind } from "../providers/provider-types.js";
import {
  CONNECT_FIRST_WORKFLOW_ID,
  EXAMPLE_AUDIT_WORKFLOW_ID,
  PACKAGE_FOLLOWUP_WORKFLOW_ID,
  TAX_STRATEGY_WORKFLOW_ID
} from "../worker/native-workflow-definitions.js";

type PublicWorkflowBootstrap = {
  persona: string;
  title: string;
  deliverableType: string;
  continuitySummary: string;
};

const PUBLIC_WORKFLOW_BOOTSTRAPS: Readonly<Record<string, PublicWorkflowBootstrap>> = {
  [CONNECT_FIRST_WORKFLOW_ID]: {
    persona: "cfo",
    title: "Pressure-test the pricing lane",
    deliverableType: "pricing_review",
    continuitySummary: "CFO should begin this approved pricing review lane: Pressure-test the pricing lane."
  },
  [TAX_STRATEGY_WORKFLOW_ID]: {
    persona: "cfo",
    title: "Review the founder tax posture",
    deliverableType: "tax_strategy_review",
    continuitySummary:
      "CFO should assess the founder tax posture against the current restructuring assumptions workbook, return one bounded advisor-ready recommendation, or name the single missing artifact blocking completion."
  },
  [PACKAGE_FOLLOWUP_WORKFLOW_ID]: {
    persona: "cmo",
    title: "Draft the package follow-up narrative",
    deliverableType: "launch_copy",
    continuitySummary: "CMO should begin this approved launch copy lane: Draft the package follow-up narrative."
  },
  [EXAMPLE_AUDIT_WORKFLOW_ID]: {
    persona: "cmo",
    title: "Review the example findings brief",
    deliverableType: "research_brief",
    continuitySummary: "CMO should begin this approved research brief lane: Review the example findings brief."
  }
};

export function listPublicWorkflowHarnessBootstrapIds(): string[] {
  return Object.keys(PUBLIC_WORKFLOW_BOOTSTRAPS);
}

export function hasPublicWorkflowHarnessBootstrap(workflowId: string): boolean {
  return workflowId in PUBLIC_WORKFLOW_BOOTSTRAPS;
}

export async function seedPublicWorkflowHarnessRun(input: {
  repository: Pick<HarnessRepository, "insertRun" | "insertCard" | "insertEvent" | "upsertCardContinuity">;
  tenantId: string;
  runId: string;
  workflowId: string;
  packageId: string;
  providerKind: ProviderKind;
  credentialLabel: string;
}): Promise<void> {
  const bootstrap = PUBLIC_WORKFLOW_BOOTSTRAPS[input.workflowId];
  if (!bootstrap) {
    throw new Error(`No public workflow harness bootstrap is registered for ${input.workflowId}`);
  }

  const runtime = createHarnessRuntime({
    createId: createDeterministicBootstrapIdFactory(input.runId)
  });
  const session = runtime.startRun({
    tenantId: input.tenantId,
    workflowId: input.workflowId,
    packageId: input.packageId,
    runtimeContext: {
      providerKind: input.providerKind,
      credentialLabel: input.credentialLabel
    }
  });
  const run = transitionHarnessRun(session.run, "active");
  const lane = runtime.createApprovedChildCard(run.id, {
    persona: bootstrap.persona,
    title: bootstrap.title,
    deliverableType: bootstrap.deliverableType
  });

  await input.repository.insertRun(run);
  for (const card of [session.ceoCard, lane]) {
    await input.repository.insertCard(card);
    for (const event of createBootstrapEvents(card)) {
      await input.repository.insertEvent(event);
    }
  }

  await input.repository.upsertCardContinuity(
    createHarnessCardContinuityRecord({
      cardId: lane.id,
      runId: run.id,
      continuitySummary: bootstrap.continuitySummary,
      latestResultSummary: null,
      absorbedWorkItems: []
    })
  );
}

function createDeterministicBootstrapIdFactory(runId: string): () => string {
  let first = true;
  return () => {
    if (first) {
      first = false;
      return runId;
    }
    return randomUUID();
  };
}

function createBootstrapEvents(card: { id: string; title: string; persona: string; state: string }) {
  const events = [
    createHarnessCardEventRecord({
      cardId: card.id,
      eventKind: "created",
      payload: { title: card.title, persona: card.persona, state: card.state }
    })
  ];

  if (card.state !== "queued") {
    events.push(
      createHarnessCardEventRecord({
        cardId: card.id,
        eventKind: "state_changed",
        payload: { to: card.state }
      })
    );
  }

  return events;
}
