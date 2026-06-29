import type { HarnessWorkerExecutionEnvelope } from "../harness/worker-executor.js";

export function buildWorkerPromptContextLines(input: {
  workflowId: string;
  executionEnvelope: HarnessWorkerExecutionEnvelope;
}): string[] {
  const { executionEnvelope } = input;
  const continuitySummary = executionEnvelope.continuityContext?.summary ?? executionEnvelope.laneExecution.resumeFocus ?? "No continuity summary recorded.";
  const latestResultSummary =
    executionEnvelope.continuityContext?.latestResultSummary ??
    executionEnvelope.laneExecution.latestResultSummary ??
    "No prior result summary recorded.";
  const absorbedWork = summarizeAbsorbedWork(executionEnvelope);
  const prerequisiteEvidenceLines = formatWorkflowPrerequisiteLines(executionEnvelope);

  return [
    `Workflow: ${input.workflowId}`,
    `Persona: ${executionEnvelope.laneExecution.persona}`,
    `Lane title: ${executionEnvelope.laneExecution.title}`,
    `Deliverable type: ${executionEnvelope.laneExecution.deliverableType}`,
    `Resume focus: ${executionEnvelope.laneExecution.resumeFocus ?? "None"}`,
    `Continuity summary: ${continuitySummary}`,
    `Latest result summary: ${latestResultSummary}`,
    `Absorbed work items: ${absorbedWork}`,
    ...prerequisiteEvidenceLines,
    `Orchestrator persona: ${executionEnvelope.orchestratorHandoff.orchestratorPersona}`,
    `Dispatch reason: ${executionEnvelope.orchestratorHandoff.dispatchReason}`,
    `Scope guard: ${executionEnvelope.orchestratorHandoff.scopeGuard}`,
    `Completion rule: ${executionEnvelope.orchestratorHandoff.completionRule}`,
    `Resume directive: ${executionEnvelope.orchestratorHandoff.resumeDirective ?? "None"}`,
    ...formatBoardContextLines(executionEnvelope),
    "Post-outcome contract:",
    ...formatPostOutcomeContractLines(executionEnvelope)
  ];
}

function formatBoardContextLines(executionEnvelope: HarnessWorkerExecutionEnvelope): string[] {
  const lines = [`Run state: ${executionEnvelope.boardContext.runState}`];
  if (executionEnvelope.boardContext.parentLane) {
    lines.push(
      `Parent lane: ${executionEnvelope.boardContext.parentLane.persona.toUpperCase()} | ` +
        `${executionEnvelope.boardContext.parentLane.title} | ` +
        `${executionEnvelope.boardContext.parentLane.deliverableType} | ` +
        `${executionEnvelope.boardContext.parentLane.state}`
    );
  } else {
    lines.push("Parent lane: None");
  }

  lines.push(
    executionEnvelope.boardContext.activeAttention
      ? `Active board attention: ${executionEnvelope.boardContext.activeAttention.summary}`
      : "Active board attention: None"
  );
  lines.push("Sibling lanes:");
  if (executionEnvelope.boardContext.siblingLanes.length === 0) {
    lines.push("- None");
  } else {
    for (const sibling of executionEnvelope.boardContext.siblingLanes) {
      lines.push(`- ${sibling.persona.toUpperCase()} | ${sibling.title} | ${sibling.deliverableType} | ${sibling.state}`);
    }
  }

  return lines;
}

function formatPostOutcomeContractLines(executionEnvelope: HarnessWorkerExecutionEnvelope): string[] {
  return (executionEnvelope.outcomeContract.postOutcomeDirectives ?? []).map(
    (directive) =>
      `- ${directive.outcomeState} -> ${directive.actionKind} (run state: ${directive.runState}): ${directive.summary}${formatPostOutcomeDirectiveDetails(
        directive
      )}`
  );
}

function formatPostOutcomeDirectiveDetails(
  directive: HarnessWorkerExecutionEnvelope["outcomeContract"]["postOutcomeDirectives"][number]
): string {
  const details: string[] = [];
  if (directive.targetPersona) {
    details.push(`target persona: ${directive.targetPersona}`);
  }
  if (directive.targetCardId) {
    details.push(`target card: ${directive.targetCardId}`);
  }
  if (directive.reason) {
    details.push(`reason: ${directive.reason}`);
  }
  return details.length ? ` [${details.join("; ")}]` : "";
}

function summarizeAbsorbedWork(executionEnvelope: HarnessWorkerExecutionEnvelope): string {
  const continuityItems =
    executionEnvelope.continuityContext?.absorbedWorkTrail
      .map((item) => item.title.trim())
      .filter((item) => item.length > 0) ?? [];
  if (continuityItems.length > 0) {
    return continuityItems.join("; ");
  }

  const laneItems =
    executionEnvelope.laneExecution.absorbedWorkItems
      ?.map((item) => item.trim())
      .filter((item) => item.length > 0) ?? [];
  if (laneItems.length > 0) {
    return laneItems.join("; ");
  }

  return "No absorbed work items recorded.";
}

function formatWorkflowPrerequisiteLines(executionEnvelope: HarnessWorkerExecutionEnvelope): string[] {
  const taxStrategyEvidence = (executionEnvelope.workflowPrerequisites?.taxStrategyEvidence ?? []).slice(0, 3);
  if (taxStrategyEvidence.length === 0) {
    return [];
  }

  return [
    "Workflow prerequisite evidence:",
    ...taxStrategyEvidence.map(
      (item) =>
        `- ${item.artifactName} | status: ${item.status} | confirmed by: ${item.confirmedBy} | tax year: ${item.taxYear} | entity type: ${item.entityType} | confirmed at: ${item.confirmedAt} | summary: ${truncateWorkflowPrerequisiteText(item.summary, 240)}`
    )
  ];
}

function truncateWorkflowPrerequisiteText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}
