export function buildNativeExecutionAcceptanceOptions(workflowId) {
  const options = {};

  if (workflowId === "wf_tax_strategy" || workflowId === "wf_connect_first_workflow") {
    options.allowFreshExecutionClaimAsTerminal = false;
  }

  if (workflowId === "wf_tax_strategy") {
    options.expectedBlockedArtifactName = "founder_tax_posture_documents";
  }

  return options;
}
