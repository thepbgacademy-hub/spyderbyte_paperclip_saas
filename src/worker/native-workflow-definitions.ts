export const CONNECT_FIRST_WORKFLOW_ID = "wf_connect_first_workflow";
export const TAX_STRATEGY_WORKFLOW_ID = "wf_tax_strategy";
export const PACKAGE_FOLLOWUP_WORKFLOW_ID = "wf_package_followup";
export const EXAMPLE_AUDIT_WORKFLOW_ID = "wf-example-audit";
export const NATIVE_DECISION_JSON_SHAPE = "{\"state\":\"done|waiting|blocked|cancelled\",\"summary\":\"...\"}";

export type NativeWorkflowDefinition = {
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
};

export const NATIVE_WORKFLOW_DEFINITIONS: Record<string, NativeWorkflowDefinition> = {
  [CONNECT_FIRST_WORKFLOW_ID]: {
    familyName: "Connect First Workflow",
    laneDecisionLine: "Decide whether the current lane is complete, needs more information, is blocked, or should be cancelled.",
    doneInstruction: "Use state \"done\" only when the lane is actually complete and the next operator can treat it as finished.",
    waitingInstruction: "Use state \"waiting\" when the lane needs more information, confirmation, or a deliberate resume action.",
    blockedInstruction: "Use state \"blocked\" when the lane cannot proceed because a prerequisite, dependency, or required input is missing.",
    cancelledInstruction: "Use state \"cancelled\" when the lane should end without completion and return control to the harness.",
    completedPrefix: "Completed the Connect First Workflow",
    actionPrefix: "Connect First Workflow",
    invalidDecisionLabel: "Connect First Workflow"
  },
  [TAX_STRATEGY_WORKFLOW_ID]: {
    familyName: "Tax Strategy Workflow",
    laneDecisionLine: "Decide whether the current lane is complete, needs more information, is blocked, or should be cancelled.",
    doneInstruction: "Use state \"done\" only when the lane is actually complete and the next operator can treat it as finished.",
    waitingInstruction: "Use state \"waiting\" when the lane needs more information, confirmation, or a deliberate resume action.",
    blockedInstruction: "Use state \"blocked\" when the lane cannot proceed because a prerequisite, dependency, or required input is missing.",
    cancelledInstruction: "Use state \"cancelled\" when the lane should end without completion and return control to the harness.",
    completedPrefix: "Completed the Tax Strategy Workflow",
    actionPrefix: "Tax Strategy Workflow",
    invalidDecisionLabel: "Tax Strategy Workflow",
    extraGuidance: "Focus on tax-position readiness, open assumptions, and the clearest next bounded operator action."
  },
  [PACKAGE_FOLLOWUP_WORKFLOW_ID]: {
    familyName: "Package Follow-up Workflow",
    laneDecisionLine: "Decide whether the current lane is complete, needs more information, is blocked, or should be cancelled.",
    doneInstruction: "Use state \"done\" only when the follow-up lane is ready to hand a bounded customer-facing next step back to the operator.",
    waitingInstruction: "Use state \"waiting\" when the lane needs more information, confirmation, or a deliberate resume action.",
    blockedInstruction: "Use state \"blocked\" when the lane cannot proceed because a prerequisite, dependency, or required input is missing.",
    cancelledInstruction: "Use state \"cancelled\" when the lane should end without completion and return control to the harness.",
    completedPrefix: "Completed the Package Follow-up Workflow",
    actionPrefix: "Package Follow-up Workflow",
    invalidDecisionLabel: "Package Follow-up Workflow",
    extraGuidance: "Focus on the next bounded package follow-up, not on reopening the entire workflow scope."
  },
  [EXAMPLE_AUDIT_WORKFLOW_ID]: {
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
