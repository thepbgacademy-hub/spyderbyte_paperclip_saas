export const CONNECT_FIRST_WORKFLOW_ID = "wf_connect_first_workflow";
export const TAX_STRATEGY_WORKFLOW_ID = "wf_tax_strategy";
export const PACKAGE_FOLLOWUP_WORKFLOW_ID = "wf_package_followup";
export const EXAMPLE_AUDIT_WORKFLOW_ID = "wf-example-audit";
export const CURRENT_CORE_NATIVE_WORKFLOW_IDS = [
  CONNECT_FIRST_WORKFLOW_ID,
  TAX_STRATEGY_WORKFLOW_ID,
  PACKAGE_FOLLOWUP_WORKFLOW_ID
] as const;
export const NATIVE_DECISION_JSON_SHAPE =
  "{\"state\":\"done|waiting|blocked|cancelled\",\"summary\":\"...\",\"requiredArtifactName?\":\"founder_tax_posture_documents\"}";

export type NativeWorkflowDefinition = {
  executionStrategy: "single_step" | "staged_review";
  familyName: string;
  laneDecisionLine: string;
  doneInstruction: string;
  waitingInstruction: string;
  blockedInstruction: string;
  cancelledInstruction: string;
  completedPrefix: string;
  actionPrefix: string;
  invalidDecisionLabel: string;
  extraGuidance?: string;
  domainContext?: {
    roleInstruction: string;
    interpretationFocus: string;
    draftConstraint: string;
    validationGate: string;
  };
};

export const NATIVE_WORKFLOW_DEFINITIONS: Record<string, NativeWorkflowDefinition> = {
  [CONNECT_FIRST_WORKFLOW_ID]: {
    executionStrategy: "staged_review",
    familyName: "Connect First Workflow",
    laneDecisionLine: "Decide whether the current lane is complete, needs more information, is blocked, or should be cancelled.",
    doneInstruction: "Use state \"done\" only when the lane is actually complete and the next operator can treat it as finished.",
    waitingInstruction: "Use state \"waiting\" when the lane needs more information, confirmation, or a deliberate resume action.",
    blockedInstruction: "Use state \"blocked\" when the lane cannot proceed because a prerequisite, dependency, or required input is missing.",
    cancelledInstruction: "Use state \"cancelled\" when the lane should end without completion and return control to the harness.",
    completedPrefix: "Completed the Connect First Workflow",
    actionPrefix: "Connect First Workflow",
    invalidDecisionLabel: "Connect First Workflow",
    domainContext: {
      roleInstruction: "Operate as a bounded commercial-readiness reviewer for the Connect First family.",
      interpretationFocus:
        "Focus on revised assumptions, competitor anchors, pricing pressure, and the clearest next bounded operator move.",
      draftConstraint:
        "Keep the drafted outcome anchored to the current pricing or commercial-readiness lane and one bounded operator handoff.",
      validationGate:
        "Approve only when the outcome reflects the current lane evidence, stays commercially bounded, and does not imply wider package approval or strategy completion."
    }
  },
  [TAX_STRATEGY_WORKFLOW_ID]: {
    executionStrategy: "staged_review",
    familyName: "Tax Strategy Workflow",
    laneDecisionLine: "Decide whether the current lane is complete, needs more information, is blocked, or should be cancelled.",
    doneInstruction: "Use state \"done\" only when the lane is actually complete and the next operator can treat it as finished.",
    waitingInstruction: "Use state \"waiting\" when the lane needs more information, confirmation, or a deliberate resume action.",
    blockedInstruction: "Use state \"blocked\" when the lane cannot proceed because a prerequisite, dependency, or required input is missing.",
    cancelledInstruction: "Use state \"cancelled\" when the lane should end without completion and return control to the harness.",
    completedPrefix: "Completed the Tax Strategy Workflow",
    actionPrefix: "Tax Strategy Workflow",
    invalidDecisionLabel: "Tax Strategy Workflow",
    extraGuidance:
      "Focus on tax-position readiness, the current restructuring assumptions, and the clearest bounded advisor-ready next step. Do not ask for generic discovery; if a named prerequisite artifact is missing, return blocked and name that artifact.",
    domainContext: {
      roleInstruction: "Operate as a bounded tax-posture reviewer for the Tax Strategy family.",
      interpretationFocus:
        "Focus on tax-position readiness, restructuring assumptions, and one bounded recommendation. Use waiting only for an explicit board-resume decision; if a named prerequisite artifact is missing, treat it as blocked instead of requesting generic intake.",
      draftConstraint:
        "Keep the drafted outcome anchored to the current tax strategy review lane, the current restructuring assumptions, and one bounded advisor-ready next step or named missing artifact.",
      validationGate:
        "Approve only when the outcome stays inside the current tax review lane, does not overstate finalized tax recommendations beyond the evidence, and does not widen into generic tax discovery."
    }
  },
  [PACKAGE_FOLLOWUP_WORKFLOW_ID]: {
    executionStrategy: "staged_review",
    familyName: "Package Follow-up Workflow",
    laneDecisionLine: "Decide whether the current lane is complete, needs more information, is blocked, or should be cancelled.",
    doneInstruction: "Use state \"done\" only when the follow-up lane is ready to hand a bounded customer-facing next step back to the operator.",
    waitingInstruction: "Use state \"waiting\" when the lane needs more information, confirmation, or a deliberate resume action.",
    blockedInstruction: "Use state \"blocked\" when the lane cannot proceed because a prerequisite, dependency, or required input is missing.",
    cancelledInstruction: "Use state \"cancelled\" when the lane should end without completion and return control to the harness.",
    completedPrefix: "Completed the Package Follow-up Workflow",
    actionPrefix: "Package Follow-up Workflow",
    invalidDecisionLabel: "Package Follow-up Workflow",
    extraGuidance: "Focus on the next bounded package follow-up, not on reopening the entire workflow scope.",
    domainContext: {
      roleInstruction: "Operate as a bounded package follow-up operator for the Package Follow-up family.",
      interpretationFocus:
        "Focus on packaged customer-facing outcomes, follow-up positioning, and the next bounded customer-facing action.",
      draftConstraint:
        "Keep the drafted outcome anchored to the current package follow-up lane and one concise customer-facing next step.",
      validationGate:
        "Approve only when the outcome stays inside the current follow-up lane and does not reopen full workflow scope or broader package strategy."
    }
  },
  [EXAMPLE_AUDIT_WORKFLOW_ID]: {
    executionStrategy: "single_step",
    familyName: "Example Audit Workflow",
    laneDecisionLine: "Decide whether the current lane is complete, needs more information, is blocked, or should be cancelled.",
    doneInstruction: "Use state \"done\" only when the example audit lane is ready to hand a bounded findings brief back to the operator.",
    waitingInstruction: "Use state \"waiting\" when the lane needs more evidence, confirmation, or a deliberate resume action.",
    blockedInstruction: "Use state \"blocked\" when the lane cannot proceed because a prerequisite, dependency, or required input is missing.",
    cancelledInstruction: "Use state \"cancelled\" when the lane should end without completion and return control to the harness.",
    completedPrefix: "Completed the Example Audit Workflow",
    actionPrefix: "Example Audit Workflow",
    invalidDecisionLabel: "Example Audit Workflow",
    extraGuidance: "Focus on prioritized findings and the clearest next bounded audit step."
  }
};
