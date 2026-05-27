import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  HarnessBoard,
  type HarnessBoardCard,
  type HarnessBoardColumn
} from "../apps/web/src/components/HarnessBoard.js";
import { HarnessCardDrawer } from "../apps/web/src/components/HarnessCardDrawer.js";
import {
  buildContractActionPayload,
  canSubmitContractActionState,
  canResetBoardActionComposerAfterError,
  canRetryBoardActionAfterError,
  describeContractActionIssue,
  describeActionAttemptSupport,
  describeBoardActionFeedback,
  describeBoardContractRefreshImpact,
  describeBoardLoadFeedback,
  getContractActionState,
  getBoardContractActionDescriptorMap,
  getBoardContractActionFieldMap,
  inspectBoardContractRefreshImpact,
  pruneActionDraftsForBoard,
  pruneOpenActionComposerKeysForBoard,
  resolveBoardLoadFailure,
  shouldResyncBoardAfterActionError,
  summarizeContractActionState,
  HarnessBoardPage
} from "../apps/web/src/pages/HarnessBoardPage.js";
import { HarnessBoardClientError } from "../apps/web/src/harness-board-client.js";
import type { HarnessBoardResponse } from "../src/harness/board-service.js";

const cards: HarnessBoardCard[] = [
  {
    id: "card-ceo-plan",
    persona: "CEO",
    title: "Shape the launch plan",
    summary: "Clarify the first three moves, align priorities, and package the next decisions.",
    lane: "planning",
    statusLabel: "Planning",
    priorityLabel: "High",
    deliverableLabel: "Launch plan",
    updatedAtLabel: "Updated 5 minutes ago",
    outcome: "Drafted the first pass of the launch sequence for review.",
    focusPoints: ["Narrow the offer", "Sequence delivery", "Highlight decisions"],
    activity: [
      {
        id: "activity-1",
        label: "CEO reframed the first milestone around sales clarity.",
        timestampLabel: "11:05 AM"
      }
    ],
    detailSections: [
      {
        id: "snapshot",
        title: "Snapshot",
        body: "High-level planning notes stay visible without exposing execution internals."
      }
    ]
  },
  {
    id: "card-cfo-forecast",
    persona: "CFO",
    title: "Pressure-test the pricing lane",
    summary: "Check margin assumptions and flag the revenue sensitivities for the package.",
    lane: "working",
    statusLabel: "Working",
    priorityLabel: "Medium",
    deliverableLabel: "Margin review",
    updatedAtLabel: "Updated 12 minutes ago",
    outcome: "Margin ranges are stable with one pricing decision still pending.",
    focusPoints: ["Review margin floor", "Spot discount risk"],
    activity: [
      {
        id: "activity-2",
        label: "CFO highlighted one discount edge case for approval.",
        timestampLabel: "10:58 AM"
      }
    ],
    detailSections: [
      {
        id: "outcome",
        title: "Outcome",
        body: "The tenant sees the business takeaway, not internal execution noise."
      }
    ]
  }
];

const columns: HarnessBoardColumn[] = [
  { id: "planning", title: "Planning", description: "Cards getting shaped", cardIds: ["card-ceo-plan"] },
  { id: "working", title: "Working", description: "Cards currently advancing", cardIds: ["card-cfo-forecast"] }
];

const boardResponse: HarnessBoardResponse = {
  runId: "run_ui_test_1",
  workflowId: "wf_connect_first_workflow",
  packageId: "pkg_bib_connect",
  columns,
  cards,
  pendingApprovals: [
    {
      id: "proposal_ui_test_1",
      title: "Gather competitor price anchors",
      requestedByPersona: "CFO",
      targetPersona: "RESEARCHER",
      deliverableLabel: "Research Brief",
      statusLabel: "Pending CEO approval",
      actionRoute: "proposal-decision",
      actionPath: "/api/harness/proposals/proposal_ui_test_1/decision",
      actionMethod: "POST",
      actionLabel: "Review proposal decision",
      actionDescription: "Choose whether this proposed follow-on work should be approved, deferred, or denied.",
      requestFields: [
        {
          name: "decision",
          label: "Proposal decision",
          description: "Choose whether this proposed follow-on work should be approved, deferred, or denied.",
          required: true,
          allowedValues: ["approve", "defer", "deny"]
        },
        {
          name: "decisionNote",
          label: "Decision note",
          description: "Add a short note when the CEO wants the review trail to capture why this proposal changed direction.",
          required: false,
          supportedWhenValue: "defer"
        }
      ],
      actionOptions: [
        {
          value: "approve",
          label: "Approve proposal",
          description: "Approve this work so it can move into the bounded execution flow.",
          emphasis: "primary",
          nextEffectSummary: "This proposal can move into the bounded execution flow and open or advance the intended lane.",
          exampleRequest: { decision: "approve" }
        },
        {
          value: "defer",
          label: "Defer proposal",
          description: "Pause this follow-on work until the current board cycle is ready to widen safely.",
          emphasis: "secondary",
          nextEffectSummary: "This proposal stays visible for later CEO review without opening or advancing a new lane yet.",
          exampleRequest: { decision: "defer" }
        },
        {
          value: "deny",
          label: "Deny proposal",
          description: "Reject this follow-on work when it should not expand the current board cycle.",
          emphasis: "caution",
          nextEffectSummary: "This proposal closes without opening or advancing any new work lane.",
          requiresConfirmation: true,
          confirmationLabel: "Deny this proposal and close the follow-on request?",
          exampleRequest: { decision: "deny" }
        }
      ],
      recommendedOptionValue: "approve",
      allowedDecisions: ["approve", "defer", "deny"],
      policyReasonLabel: "Review for expansion",
      nextReviewTrigger: "Revisit after the CEO closes the current pricing board decisions.",
      lastDecisionAtLabel: "11:11 AM"
    }
  ],
  pendingAttention: {
    kind: "queue_ceo_review",
    runState: "assembling",
    statusLabel: "CEO review required",
    summary: "The board is ready for final assembly before the tenant-facing package is closed.",
    actionRoute: "review-attention",
    actionPath: "/api/harness/runs/run_ui_test_1/review-attention",
    actionMethod: "POST",
    actionLabel: "Review final assembly",
    actionDescription: "Finish the current board cycle or intentionally start the next one.",
    requestFields: [
      {
        name: "decision",
        label: "Review decision",
        description: "Choose whether to close the current board cycle or start the next one.",
        required: true,
        allowedValues: ["complete_run", "start_fresh_cycle"]
      },
      {
        name: "mode",
        label: "Fresh-cycle mode",
        description: "Choose whether the next cycle should reopen deferred work or start clean.",
        required: false,
        supportedWhenValue: "start_fresh_cycle",
        allowedValues: ["reopen_deferred", "clean"],
        suggestedValue: "reopen_deferred"
      }
    ],
    actionOptions: [
      {
        value: "complete_run",
        label: "Complete run",
        description: "Close the current board cycle and package the current business outcome.",
        emphasis: "primary",
        nextEffectSummary: "The current run closes as done and the tenant-facing package stays on this board cycle.",
        exampleRequest: { decision: "complete_run" }
      },
      {
        value: "start_fresh_cycle",
        label: "Start fresh cycle",
        description: "Open the next board cycle from this run, with or without reopening deferred work.",
        emphasis: "secondary",
        nextEffectSummary: "A new run starts from this board, optionally carrying deferred follow-on work into the next cycle.",
        requiresConfirmation: true,
        confirmationLabel: "Start a new board cycle from this run?",
        exampleRequest: { decision: "start_fresh_cycle", mode: "reopen_deferred" }
      }
    ],
    recommendedOptionValue: "complete_run",
    allowedDecisions: ["complete_run", "start_fresh_cycle"],
    requestedAtLabel: "11:24 AM",
    reasonLabel: "Final assembly"
  },
  recentDecisions: [
    {
      id: "decision_ui_test_1",
      decisionKind: "proposal_deferred",
      label: "CEO kept the research expansion under bounded review.",
      resolution: "defer",
      policyReasonLabel: "Review for expansion",
      recommendationSummary: "Hold the research expansion until the pricing package is stable.",
      objectionSummary: "Do not widen the current board cycle yet.",
      timestampLabel: "11:18 AM"
    }
  ],
  followThroughItems: [
    {
      id: "follow_through_ui_test_1",
      action: "packaged_outcome",
      summary: "CEO packaged the current pricing outcome for tenant-facing review.",
      timestampLabel: "11:19 AM",
      persona: "CFO",
      deliverableLabel: "Margin review"
    }
  ],
  completionPackage: {
    status: "assembling",
    summary: "The current package is nearly ready with one bounded governance item still shaping the handoff.",
    deferredApprovalCount: 1,
    hasOpenGovernanceItems: true,
    packageNote: "Keep the pricing package readable while the research expansion stays under review.",
    recommendations: [
      "Carry the current pricing readout into the tenant-facing package.",
      "Revisit the research expansion after the CEO closes the current cycle."
    ],
    objections: ["Do not widen the board cycle until the pricing package is finalized."],
    governanceItems: [
      {
        proposalId: "proposal_ui_test_1",
        statusLabel: "Pending CEO approval",
        persona: "RESEARCHER",
        deliverableLabel: "Research Brief",
        policyReasonLabel: "Review for expansion",
        recommendationSummary: "Approve only after the pricing package is stable.",
        objectionSummary: "Avoid expanding the current board cycle too early.",
        nextReviewTrigger: "Revisit after the current pricing package is completed."
      }
    ],
    deliverables: [
      {
        cardId: "card-cfo-forecast",
        persona: "CFO",
        title: "Pressure-test the pricing lane",
        deliverableLabel: "Margin review",
        outcome: "Margin ranges are stable with one pricing decision still pending."
      }
    ]
  }
};

const resolveAttentionBoardResponse: HarnessBoardResponse = {
  ...boardResponse,
  runId: "run_ui_test_2",
  pendingAttention: {
    kind: "await_lane_resume",
    runState: "waiting",
    statusLabel: "Waiting on lane resume",
    summary: "Resume the pricing lane once the tenant confirms the updated revenue assumption.",
    actionRoute: "resolve-attention",
    actionPath: "/api/harness/runs/run_ui_test_2/resolve-attention",
    actionMethod: "POST",
    actionLabel: "Resume lane",
    actionDescription: "Resume the waiting lane when the required board input is ready.",
    requestFields: [
      {
        name: "command",
        label: "Resolution command",
        description: "Choose the single bounded command that resolves this attention state.",
        required: true,
        allowedValues: ["resume_lane"]
      },
      {
        name: "resumeSummary",
        label: "Resume summary",
        description: "Optional tenant-safe note describing what changed before execution resumes.",
        required: false
      }
    ],
    actionOptions: [
      {
        value: "resume_lane",
        label: "Resume lane",
        description: "Return the lane to active execution with an optional bounded resume note.",
        emphasis: "primary",
        nextEffectSummary: "The lane returns to active execution and re-enters the worker queue through the existing harness path.",
        exampleRequest: { command: "resume_lane" }
      }
    ],
    recommendedOptionValue: "resume_lane",
    allowedCommands: ["resume_lane"],
    requestedAtLabel: "11:41 AM",
    reasonLabel: "Awaiting tenant confirmation",
    targetCardId: "card-cfo-forecast",
    targetPersona: "CFO",
    targetTitle: "Pressure-test the pricing lane",
    targetSummary: "Resume CFO lane: Pressure-test the pricing lane"
  }
};

describe("harness board UI", () => {
  it("builds bounded live action payloads from contract fields plus user drafts", () => {
    const attentionOption = boardResponse.pendingAttention?.actionOptions?.find((option) => option.value === "start_fresh_cycle");
    expect(attentionOption).toBeTruthy();

    const payload = buildContractActionPayload({
      fields: boardResponse.pendingAttention?.requestFields,
      option: attentionOption!,
      draftValues: {
        mode: "clean"
      }
    });

    expect(payload).toEqual({
      decision: "start_fresh_cycle",
      mode: "clean"
    });
  });

  it("tracks missing required live fields from the contract instead of guessing", () => {
    const actionState = getContractActionState({
      fields: [
        {
          name: "completionSummary",
          label: "Completion summary",
          description: "Explain the finished board outcome.",
          required: true
        }
      ],
      option: {
        value: "complete_run",
        label: "Complete run",
        description: "Close the current run.",
        exampleRequest: {
          decision: "complete_run"
        }
      },
      draftValues: {}
    });

    expect(actionState.payload).toEqual({
      decision: "complete_run"
    });
    expect(actionState.missingRequiredFields).toEqual(["Completion summary"]);
    expect(actionState.driftedFieldLabels).toEqual([]);
  });

  it("summarizes whether a live action is using defaults or needs input", () => {
    expect(
      summarizeContractActionState({
        visibleFields: [
          {
            name: "mode",
            label: "Fresh-cycle mode",
            description: "Choose the next cycle mode.",
            required: false
          }
        ],
        missingRequiredFields: [],
        driftedFields: [],
        driftedFieldLabels: [],
        activeDraftCount: 0
      })
    ).toEqual({
      tone: "defaults",
      summary: "Ready with contract defaults."
    });

    expect(
      summarizeContractActionState({
        visibleFields: [],
        missingRequiredFields: ["Decision note"],
        driftedFields: [],
        driftedFieldLabels: [],
        activeDraftCount: 0
      })
    ).toEqual({
      tone: "needs_input",
      summary: "Needs input: Decision note"
    });
  });

  it("falls back to current contract defaults and blocks submit when a stored draft value no longer fits allowed values", () => {
    const attentionOption = boardResponse.pendingAttention?.actionOptions?.find((option) => option.value === "start_fresh_cycle");
    expect(attentionOption).toBeTruthy();

    const actionState = getContractActionState({
      fields: boardResponse.pendingAttention?.requestFields,
      option: attentionOption!,
      draftValues: {
        mode: "invalid_mode"
      }
    });

    expect(actionState.payload).toEqual({
      decision: "start_fresh_cycle",
      mode: "reopen_deferred"
    });
    expect(actionState.driftedFieldLabels).toEqual(["Fresh-cycle mode"]);
    expect(actionState.driftedFields).toEqual([
      {
        fieldName: "mode",
        fieldLabel: "Fresh-cycle mode",
        reason: "invalid_allowed_value"
      }
    ]);
    expect(summarizeContractActionState(actionState)).toEqual({
      tone: "drifted",
      summary: "Reset required: Fresh-cycle mode no longer fits the current contract."
    });
    expect(canSubmitContractActionState(actionState)).toBe(false);
  });

  it("prioritizes reset-required drift messaging over missing-input messaging when both are present", () => {
    expect(
      summarizeContractActionState({
        visibleFields: [
          {
            name: "completionSummary",
            label: "Completion summary",
            description: "Explain the finished board outcome.",
            required: true
          }
        ],
        missingRequiredFields: ["Completion summary"],
        driftedFields: [
          {
            fieldName: "mode",
            fieldLabel: "Fresh-cycle mode",
            reason: "invalid_allowed_value"
          }
        ],
        driftedFieldLabels: ["Fresh-cycle mode"],
        activeDraftCount: 0
      })
    ).toEqual({
      tone: "drifted",
      summary: "Reset required: Fresh-cycle mode no longer fits the current contract."
    });
  });

  it("treats hidden stale draft fields as drift that must be reset before submit", () => {
    const approvalOption = boardResponse.pendingApprovals[0]?.actionOptions?.find((option) => option.value === "approve");
    expect(approvalOption).toBeTruthy();
    const actionState = getContractActionState({
      fields: boardResponse.pendingApprovals[0]?.requestFields,
      option: approvalOption!,
      draftValues: {
        decisionNote: "Hold for later"
      }
    });

    expect(summarizeContractActionState(actionState)).toEqual({
      tone: "drifted",
      summary: "Reset required: Decision note no longer fits the current contract."
    });
    expect(actionState.driftedFields).toEqual([
      {
        fieldName: "decisionNote",
        fieldLabel: "Decision note",
        reason: "hidden_for_option"
      }
    ]);
    expect(canSubmitContractActionState(actionState)).toBe(false);
  });

  it("counts only current visible field overrides when summarizing a bounded live action", () => {
    const attentionOption = boardResponse.pendingAttention?.actionOptions?.find((option) => option.value === "start_fresh_cycle");
    expect(attentionOption).toBeTruthy();

    const actionState = getContractActionState({
      fields: boardResponse.pendingAttention?.requestFields,
      option: attentionOption!,
      draftValues: {
        mode: "clean",
        ignoredBlank: "   "
      }
    });

    expect(summarizeContractActionState(actionState)).toEqual({
      tone: "ready",
      summary: "Ready with 1 field override."
    });
    expect(canSubmitContractActionState(actionState)).toBe(true);
  });

  it("describes drifted composer fields by bounded contract reason", () => {
    expect(
      describeContractActionIssue({
        fieldName: "mode",
        fieldLabel: "Fresh-cycle mode",
        reason: "invalid_allowed_value"
      })
    ).toBe("Fresh-cycle mode: the current draft is no longer in the allowed values for this contract field.");
    expect(
      describeContractActionIssue({
        fieldName: "decisionNote",
        fieldLabel: "Decision note",
        reason: "hidden_for_option"
      })
    ).toBe("Decision note: the current draft only applies to a different action option and must be reset before submit.");
    expect(
      describeContractActionIssue({
        fieldName: "legacyField",
        fieldLabel: "Legacy field",
        reason: "removed_from_contract"
      })
    ).toBe("Legacy field: the current draft refers to a field that no longer exists in the live contract.");
  });

  it("maps the current board contract to bounded action keys and request fields", () => {
    const fieldMap = getBoardContractActionFieldMap(boardResponse);

    expect(Array.from(fieldMap.keys())).toEqual([
      "attention:complete_run",
      "attention:start_fresh_cycle",
      "approval:proposal_ui_test_1:approve",
      "approval:proposal_ui_test_1:defer",
      "approval:proposal_ui_test_1:deny"
    ]);
    expect(Array.from(fieldMap.get("attention:start_fresh_cycle") ?? [])).toEqual(["decision", "mode"]);
    expect(Array.from(fieldMap.get("approval:proposal_ui_test_1:defer") ?? [])).toEqual(["decision", "decisionNote"]);
  });

  it("maps the current board contract to bounded action labels and field labels", () => {
    const descriptorMap = getBoardContractActionDescriptorMap(boardResponse);

    expect(descriptorMap.get("attention:start_fresh_cycle")).toEqual({
      label: "Start fresh cycle",
      fieldLabels: new Map([
        ["decision", "Review decision"],
        ["mode", "Fresh-cycle mode"]
      ])
    });
    expect(descriptorMap.get("approval:proposal_ui_test_1:approve")).toEqual({
      label: "Approve proposal",
      fieldLabels: new Map([
        ["decision", "Proposal decision"],
        ["decisionNote", "Decision note"]
      ])
    });
  });

  it("prunes stale action drafts when the refreshed board contract removes an action or field entirely", () => {
    const prunedDrafts = pruneActionDraftsForBoard(boardResponse, {
      "attention:start_fresh_cycle": {
        decision: "start_fresh_cycle",
        mode: "clean",
        legacyField: "remove me"
      },
      "approval:proposal_ui_test_1:approve": {
        decision: "approve",
        decisionNote: "keep as drift until reset"
      },
      "approval:proposal_old:approve": {
        decision: "approve"
      }
    });

    expect(prunedDrafts).toEqual({
      "attention:start_fresh_cycle": {
        decision: "start_fresh_cycle",
        mode: "clean"
      },
      "approval:proposal_ui_test_1:approve": {
        decision: "approve",
        decisionNote: "keep as drift until reset"
      }
    });
  });

  it("prunes stale open composers when the refreshed board contract removes an action", () => {
    const nextOpenKeys = pruneOpenActionComposerKeysForBoard(boardResponse, {
      "attention:start_fresh_cycle": true,
      "approval:proposal_ui_test_1:approve": true,
      "approval:proposal_old:approve": true
    });

    expect(nextOpenKeys).toEqual({
      "attention:start_fresh_cycle": true,
      "approval:proposal_ui_test_1:approve": true
    });
  });

  it("inspects bounded contract refresh impact before pruning local composer state", () => {
    const refreshedBoard: HarnessBoardResponse = {
      ...boardResponse,
      pendingApprovals: [],
      pendingAttention: {
        ...boardResponse.pendingAttention!,
        requestFields: (boardResponse.pendingAttention?.requestFields ?? []).filter((field) => field.name !== "mode")
      }
    };

    const impact = inspectBoardContractRefreshImpact(
      refreshedBoard,
      {
        "attention:start_fresh_cycle": {
          decision: "start_fresh_cycle",
          mode: "clean"
        },
        "approval:proposal_ui_test_1:approve": {
          decision: "approve"
        }
      },
      {
        "attention:start_fresh_cycle": true,
        "approval:proposal_ui_test_1:approve": true
      },
      boardResponse
    );

    expect(impact).toEqual({
      removedActionDrafts: [
        {
          actionKey: "approval:proposal_ui_test_1:approve",
          actionLabel: "Approve proposal"
        }
      ],
      removedFieldOverrideDetails: [
        {
          actionKey: "attention:start_fresh_cycle",
          actionLabel: "Start fresh cycle",
          fieldLabels: ["Fresh-cycle mode"]
        }
      ],
      removedFieldOverrideCount: 1,
      closedComposerActions: [
        {
          actionKey: "approval:proposal_ui_test_1:approve",
          actionLabel: "Approve proposal"
        }
      ]
    });
    expect(describeBoardContractRefreshImpact(impact)).toEqual({
      title: "Contract refresh",
      message: "Live board contract refreshed: 1 stale action draft removed, 1 field override pruned, 1 stale composer closed.",
      affectedActions: ["Approve proposal", "Start fresh cycle"],
      impactCounts: {
        removedActionDrafts: 1,
        removedFieldOverrides: 1,
        closedComposers: 1
      },
      recoveryTitle: "Next safe step",
      recoverySteps: [
        "Review the current live board actions before reopening any removed composer or retrying an older action path.",
        "Reset the affected action composer to the current contract defaults before trying to submit that action again.",
        "Reopen only the still-needed composers from the current live board instead of assuming the earlier draft is still valid."
      ],
      details: [
        "Removed stale drafts for: Approve proposal.",
        "Pruned removed fields from: Start fresh cycle (Fresh-cycle mode).",
        "Closed stale composers for: Approve proposal."
      ]
    });
  });

  it("returns no refresh notice when a bounded contract reload leaves local composer state intact", () => {
    expect(
      describeBoardContractRefreshImpact(
        inspectBoardContractRefreshImpact(
          boardResponse,
          {
            "attention:start_fresh_cycle": {
              decision: "start_fresh_cycle",
              mode: "clean"
            }
          },
          {
            "attention:start_fresh_cycle": true
          }
        )
      )
    ).toBeNull();
  });

  it("describes bounded action support states without collapsing drift, stale, and unavailable paths", () => {
    expect(describeActionAttemptSupport("replay_safe", "Approve proposal")).toEqual({
      label: "Replay-safe action",
      summary: "Approve proposal is still exposed by the current board contract, and the last payload still fits that bounded request shape."
    });
    expect(describeActionAttemptSupport("reset_only", "Start fresh cycle")).toEqual({
      label: "Payload drifted",
      summary: "Start fresh cycle is still exposed by the current board contract, but the last payload for start fresh cycle no longer fits the current request rules."
    });
    expect(describeActionAttemptSupport("missing", "Approve proposal")).toEqual({
      label: "Action removed",
      summary: "Approve proposal is no longer exposed by the current board contract, so replay would push stale operator intent."
    });
    expect(describeActionAttemptSupport("unavailable", "Approve proposal")).toEqual({
      label: "Board unavailable",
      summary: "The live board contract is not currently available, so approve proposal cannot be classified as replay-safe or stale yet."
    });
  });

  it("renders clean persona cards without backend execution noise", () => {
    const markup = renderToStaticMarkup(
      <HarnessBoard
        activeCardId="card-ceo-plan"
        cards={cards}
        columns={columns}
        onCardOpen={() => undefined}
      />
    );

    expect(markup).toContain("CEO");
    expect(markup).toContain("Shape the launch plan");
    expect(markup).toContain("Margin review");
    expect(markup).not.toContain("tool");
    expect(markup).not.toContain("prompt");
    expect(markup).not.toContain("token");
  });

  it("renders a simple drawer with only high-level details", () => {
    const markup = renderToStaticMarkup(
      <HarnessCardDrawer card={cards[0]!} open onClose={() => undefined} />
    );

    expect(markup).toContain("Card details");
    expect(markup).toContain("High-level planning notes stay visible");
    expect(markup).not.toContain("skill");
    expect(markup).not.toContain("trace");
  });

  it("renders the Hermes-style board page with persona overview metrics", () => {
    const markup = renderToStaticMarkup(<HarnessBoardPage />);

    expect(markup).toContain("Harness board");
    expect(markup).toContain("Persona workload");
    expect(markup).toContain("CEO approvals");
    expect(markup).toContain("Control mode");
    expect(markup).toContain("Live");
    expect(markup).not.toContain("Preview mode");
    expect(markup).not.toContain("localhost fallback data");
    expect(markup).not.toContain("raw execution log");
    expect(markup).not.toContain("harness-browser-fallback");
  });

  it("renders bounded attention and approval action guidance from the board contract", () => {
    const markup = renderToStaticMarkup(
      <HarnessBoardPage initialBoard={boardResponse} initialControlMode="live" />
    );

    expect(markup).toContain("Review final assembly");
    expect(markup).toContain("Complete run");
    expect(markup).toContain("Primary");
    expect(markup).toContain("Secondary");
    expect(markup).toContain("Caution");
    expect(markup).toContain("Controls - Live");
    expect(markup).toContain("Control mode");
    expect(markup).toContain("Live");
    expect(markup).toContain("Board actions are bound to live harness mutations through the engine contract.");
    expect(markup).toContain("Start a new board cycle from this run?");
    expect(markup).toContain("Review proposal decision");
    expect(markup).toContain("Approve proposal");
    expect(markup).toContain("Defer proposal");
    expect(markup).toContain("Deny this proposal and close the follow-on request?");
    expect(markup).toContain("Approve proposal (recommended)");
    expect(markup).toContain("Complete run (recommended)");
    expect(markup).toContain("Recommended next action");
    expect(markup).toContain("POST /api/harness/runs/run_ui_test_1/review-attention");
    expect(markup).toContain("POST /api/harness/proposals/proposal_ui_test_1/decision");
    expect(markup).toContain("Action family: review attention");
    expect(markup).toContain("Action family: proposal decision");
    expect(markup).toContain("Allowed decisions: complete_run, start_fresh_cycle");
    expect(markup).toContain("Allowed decisions: approve, defer, deny");
    expect(markup).toContain("Review decision");
    expect(markup).toContain("Fresh-cycle mode");
    expect(markup).toContain("Proposal decision");
    expect(markup).toContain("Live request fields for Complete run");
    expect(markup).toContain("Open composer for Start fresh cycle");
    expect(markup).toContain("Composer hidden until needed.");
    expect(markup).toContain("Live request fields for Approve proposal");
    expect(markup).toContain("Open composer for Defer proposal");
    expect(markup).toContain("Open composer for Deny proposal");
    expect(markup).toContain("Live payload preview");
    expect(markup).toContain("Ready with contract defaults.");
    expect(markup).toContain("Reset to contract defaults");
    expect(markup).toContain("Reason: Final assembly");
    expect(markup).toContain("Requested: 11:24 AM");
    expect(markup).toContain("Required field");
    expect(markup).toContain("Optional field");
    expect(markup).toContain("Allowed values: complete_run, start_fresh_cycle");
    expect(markup).toContain("Allowed values: reopen_deferred, clean");
    expect(markup).toContain("Supported when decision is start_fresh_cycle.");
    expect(markup).toContain("Suggested value: reopen_deferred");
    expect(markup).toContain("Supported when decision is defer.");
    expect(markup).toContain("Requested by CFO for RESEARCHER");
    expect(markup).toContain("Policy reason: Review for expansion");
    expect(markup).toContain("Next review trigger: Revisit after the CEO closes the current pricing board decisions.");
    expect(markup).toContain("Last decision: 11:11 AM");
    expect(markup).toContain("Board pulse");
    expect(markup).toContain("Attention - CEO review required");
    expect(markup).toContain("Approvals - 1");
    expect(markup).toContain("Package - Assembling");
    expect(markup).toContain("1 deliverable, 1 governance item, 2 recommendations, 1 objection.");
    expect(markup).toContain("Recent decisions");
    expect(markup).toContain("CEO kept the research expansion under bounded review.");
    expect(markup).toContain("1 preserved decision");
    expect(markup).toContain("Decision kind: proposal deferred");
    expect(markup).toContain("Resolution: defer");
    expect(markup).toContain("Recommendation: Hold the research expansion until the pricing package is stable.");
    expect(markup).toContain("Objection: Do not widen the current board cycle yet.");
    expect(markup).toContain("Follow-through");
    expect(markup).toContain("CEO packaged the current pricing outcome for tenant-facing review.");
    expect(markup).toContain("1 implemented action");
    expect(markup).toContain("Action: packaged outcome");
    expect(markup).toContain("Persona: CFO");
    expect(markup).toContain("Deliverable: Margin review");
    expect(markup).toContain("Completion package");
    expect(markup).toContain("Tenant-facing package state");
    expect(markup).toContain("Keep the pricing package readable while the research expansion stays under review.");
    expect(markup).toContain("Deferred approvals: 1");
    expect(markup).toContain("Governance items: 1");
    expect(markup).toContain("Deliverables: 1");
    expect(markup).toContain("Recommendations: 2");
    expect(markup).toContain("Objections: 1");
    expect(markup).toContain("Open governance items still shape this package.");
    expect(markup).toContain("Recommendations");
    expect(markup).toContain("Objections");
    expect(markup).toContain("Governance items (1)");
    expect(markup).toContain("Deliverables (1)");
    expect(markup).toContain("Approve only after the pricing package is stable.");
    expect(markup).toContain("Revisit after the current pricing package is completed.");
    expect(markup).toContain("Package state");
    expect(markup).toContain("Assembling");
    expect(markup).toContain("1 deliverable");
    expect(markup).toContain("CFO · Pressure-test the pricing lane");
    expect(markup).toContain("&quot;decision&quot;:&quot;complete_run&quot;");
    expect(markup).toContain("&quot;decision&quot;:&quot;approve&quot;");
    expect(markup).toContain("&quot;decision&quot;:&quot;defer&quot;");
    expect(markup).toContain("&quot;decision&quot;:&quot;deny&quot;");
    expect(markup).toContain("&quot;decision&quot;:&quot;start_fresh_cycle&quot;,&quot;mode&quot;:&quot;reopen_deferred&quot;");
    expect(markup).not.toContain("raw execution log");
    expect(markup).not.toContain("tool");
  });

  it("renders bounded resolve-attention guidance directly from the harness contract", () => {
    const markup = renderToStaticMarkup(<HarnessBoardPage initialBoard={resolveAttentionBoardResponse} />);

    expect(markup).toContain("Resume lane");
    expect(markup).toContain("Waiting on lane resume");
    expect(markup).toContain("Resume the pricing lane once the tenant confirms the updated revenue assumption.");
    expect(markup).toContain("POST /api/harness/runs/run_ui_test_2/resolve-attention");
    expect(markup).toContain("Action family: resolve attention");
    expect(markup).toContain("Allowed commands: resume_lane");
    expect(markup).toContain("Resolution command");
    expect(markup).toContain("Resume summary");
    expect(markup).toContain("Resume CFO lane: Pressure-test the pricing lane");
    expect(markup).toContain("Hide composer for Resume lane");
    expect(markup).toContain("Live request fields for Resume lane");
    expect(markup).toContain("&quot;command&quot;:&quot;resume_lane&quot;");
  });

  it("renders bounded composer drift diagnostics when seeded drafts no longer fit the live contract", () => {
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={boardResponse}
        initialControlMode="live"
        initialActionDrafts={{
          "attention:start_fresh_cycle": {
            mode: "invalid_mode"
          },
          "approval:proposal_ui_test_1:approve": {
            decisionNote: "Hold for later"
          }
        }}
      />
    );

    expect(markup).toContain("Reset required: Fresh-cycle mode no longer fits the current contract.");
    expect(markup).toContain("Fresh-cycle mode: the current draft is no longer in the allowed values for this contract field.");
    expect(markup).toContain("Open composer for Start fresh cycle");
    expect(markup).toContain("Reset required: Decision note no longer fits the current contract.");
    expect(markup).toContain("Decision note: the current draft only applies to a different action option and must be reset before submit.");
  });

  it("renders a dismissible contract refresh note when the page is seeded with bounded prune guidance", () => {
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={boardResponse}
        initialControlMode="live"
        initialContractRefreshNotice={{
          title: "Contract refresh",
          message: "Live board contract refreshed: 1 stale action draft removed.",
          details: ["Removed stale drafts for: Approve proposal."],
          affectedActions: ["Approve proposal"],
          impactCounts: {
            removedActionDrafts: 1,
            removedFieldOverrides: 0,
            closedComposers: 0
          },
          recoveryTitle: "Next safe step",
          recoverySteps: [
            "Review the current live board actions before reopening any removed composer or retrying an older action path."
          ]
        }}
      />
    );

    expect(markup).toContain("Contract refresh");
    expect(markup).toContain("Live board contract refreshed: 1 stale action draft removed.");
    expect(markup).toContain("Removed stale drafts for: Approve proposal.");
    expect(markup).toContain("Affected actions: Approve proposal");
    expect(markup).toContain("Impact counts: drafts 1, fields 0, composers 0");
    expect(markup).toContain("Next safe step");
    expect(markup).toContain("Review the current live board actions before reopening any removed composer or retrying an older action path.");
    expect(markup).toContain("Dismiss contract refresh note");
    expect(markup).toContain("Contract refresh - Active");
  });

  it("keeps an active contract-refresh pulse summary visible when refresh guidance is present", () => {
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={boardResponse}
        initialControlMode="live"
        initialContractRefreshNotice={{
          title: "Contract refresh",
          message: "Live board contract refreshed: 1 stale action draft removed.",
          details: ["Removed stale drafts for: Approve proposal."],
          affectedActions: ["Approve proposal"],
          impactCounts: {
            removedActionDrafts: 1,
            removedFieldOverrides: 0,
            closedComposers: 0
          },
          recoveryTitle: "Next safe step",
          recoverySteps: [
            "Review the current live board actions before reopening any removed composer or retrying an older action path."
          ]
        }}
      />
    );

    expect(markup).toContain("Contract refresh - Active");
    expect(markup).toContain("Live board contract refreshed: 1 stale action draft removed.");
    expect(markup).toContain("Affected actions: Approve proposal.");
    expect(markup).toContain("Next safe step: Review the current live board actions before reopening any removed composer or retrying an older action path.");
  });

  it("keeps a prop-seeded preview board read-only when the control mode says preview", () => {
    const markup = renderToStaticMarkup(
      <HarnessBoardPage initialBoard={boardResponse} initialControlMode="preview" />
    );

    expect(markup).toContain("Control mode");
    expect(markup).toContain("Preview");
    expect(markup).toContain("Preview mode");
    expect(markup).toContain("live mutations remain disabled");
    expect(markup).toContain("Live board actions are unavailable in localhost fallback mode.");
    expect(markup).toContain("Controls - Preview");
  });

  it("defaults prop-seeded board props to preview mode when no explicit control mode is provided", () => {
    const markup = renderToStaticMarkup(<HarnessBoardPage initialBoard={boardResponse} />);

    expect(markup).toContain("Control mode");
    expect(markup).toContain("Preview");
    expect(markup).toContain("Controls - Preview");
    expect(markup).toContain("Live board actions are unavailable in localhost fallback mode.");
  });

  it("describes proposal-decision conflicts with contract-aware recovery guidance", () => {
    const feedback = describeBoardActionFeedback(
      new HarnessBoardClientError({
        code: "conflict",
        message: "Unable to update harness board",
        status: 409
      }),
      {
        actionRoute: "proposal-decision",
        actionLabel: "Approve proposal"
      }
    );

    expect(feedback.message).toContain("changed before this action could be applied");
    expect(feedback.recoveryTitle).toBe("Next safe step");
    expect(feedback.recoverySteps).toEqual([
      "Refresh the board and confirm the proposal is still pending CEO review.",
      "Check the latest approval queue before trying to widen or defer the lane again."
    ]);
  });

  it("describes invalid resolve-attention payloads with composer reset guidance", () => {
    const feedback = describeBoardActionFeedback(
      new HarnessBoardClientError({
        code: "invalid_request",
        message: "Unable to update harness board",
        status: 400
      }),
      {
        actionRoute: "resolve-attention",
        actionLabel: "Resume lane"
      }
    );

    expect(feedback.message).toContain("no longer matches the live board contract");
    expect(feedback.recoverySteps).toEqual([
      "Reset this action composer to the contract defaults.",
      "Review the required fields again before retrying the lane recovery command."
    ]);
  });

  it("describes throttled board loads with bounded retry guidance", () => {
    const feedback = describeBoardLoadFeedback(
      new HarnessBoardClientError({
        code: "rate_limited",
        message: "Unable to load harness board",
        status: 429,
        retryAfterSeconds: 12
      })
    );

    expect(feedback.message).toContain("12 more seconds");
    expect(feedback.recoveryTitle).toBe("Safe retry");
    expect(feedback.recoverySteps).toEqual([
      "Wait for the bounded retry window to clear.",
      "Reload the live harness board after the throttle window expires."
    ]);
  });

  it("describes timed-out board loads with bounded reload guidance", () => {
    const feedback = describeBoardLoadFeedback(
      new HarnessBoardClientError({
        code: "timed_out",
        message: "Harness board request timed out",
        status: 408
      })
    );

    expect(feedback.message).toContain("took too long to respond");
    expect(feedback.recoverySteps).toEqual([
      "Retry the live board load through the bounded reload control.",
      "If the timeout repeats, pause before retrying again so the board does not slip into a manual refresh loop."
    ]);
  });

  it("renders initial action feedback guidance when the page is seeded with a live-action failure", () => {
    const feedback = describeBoardActionFeedback(
      new HarnessBoardClientError({
        code: "conflict",
        message: "Unable to update harness board",
        status: 409
      }),
      {
        actionRoute: "proposal-decision",
        actionLabel: "Approve proposal"
      }
    );
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={boardResponse}
        initialControlMode="live"
        initialActionFeedback={feedback}
      />
    );

    expect(markup).toContain("Latest board action issue");
    expect(markup).toContain("Next safe step");
    expect(markup).toContain("Refresh the board and confirm the proposal is still pending CEO review.");
    expect(markup).toContain("Reload live board");
  });

  it("renders retry controls for retryable live action failures when the failed attempt is known", () => {
    const feedback = describeBoardActionFeedback(
      new HarnessBoardClientError({
        code: "service_unavailable",
        message: "Unable to update harness board",
        status: 503
      }),
      {
        actionRoute: "proposal-decision",
        actionLabel: "Approve proposal"
      }
    );
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={boardResponse}
        initialControlMode="live"
        initialActionFeedback={feedback}
        initialActionFailureCause={
          new HarnessBoardClientError({
            code: "service_unavailable",
            message: "Unable to update harness board",
            status: 503
          })
        }
        initialActionAttempt={{
          actionKey: "approval:proposal_ui_test_1:approve",
          actionPath: "/api/harness/proposals/proposal_ui_test_1/decision",
          actionRoute: "proposal-decision",
          actionMethod: "POST",
          requestBody: { decision: "approve" },
          noticeLabel: "Approve proposal"
        }}
      />
    );

    expect(markup).toContain("Retry Approve proposal");
    expect(markup).not.toContain("Reset composer defaults");
  });

  it("hides retry controls when the failed attempt is no longer part of the current live board contract", () => {
    const feedback = describeBoardActionFeedback(
      new HarnessBoardClientError({
        code: "service_unavailable",
        message: "Unable to update harness board",
        status: 503
      }),
      {
        actionRoute: "proposal-decision",
        actionLabel: "Approve proposal"
      }
    );
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={boardResponse}
        initialControlMode="live"
        initialActionFeedback={feedback}
        initialActionFailureCause={
          new HarnessBoardClientError({
            code: "service_unavailable",
            message: "Unable to update harness board",
            status: 503
          })
        }
        initialActionAttempt={{
          actionKey: "approval:proposal_old:approve",
          actionPath: "/api/harness/proposals/proposal_old/decision",
          actionRoute: "proposal-decision",
          actionMethod: "POST",
          requestBody: { decision: "approve" },
          noticeLabel: "Approve proposal"
        }}
      />
    );

    expect(markup).not.toContain("Retry Approve proposal");
    expect(markup).toContain("Dismiss stale action issue");
    expect(markup).toContain(
      "The current board no longer exposes approve proposal. Reload or choose a fresh bounded action from the current contract instead of replaying the stale request."
    );
  });

  it("keeps invalid-request recovery on reload-only when the payload still fits the live contract", () => {
    const feedback = describeBoardActionFeedback(
      new HarnessBoardClientError({
        code: "invalid_request",
        message: "Unable to update harness board",
        status: 400
      }),
      {
        actionRoute: "resolve-attention",
        actionLabel: "Resume lane"
      }
    );
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={resolveAttentionBoardResponse}
        initialControlMode="live"
        initialActionFeedback={feedback}
        initialActionFailureCause={
          new HarnessBoardClientError({
            code: "invalid_request",
            message: "Unable to update harness board",
            status: 400
          })
        }
        initialActionAttempt={{
          actionKey: "attention:resume_lane",
          actionPath: "/api/harness/runs/run_ui_test_2/resolve-attention",
          actionRoute: "resolve-attention",
          actionMethod: "POST",
          requestBody: { command: "resume_lane", resumeSummary: "Resume CFO lane" },
          noticeLabel: "Resume lane"
        }}
      />
    );

    expect(markup).not.toContain("Reset to current contract defaults");
    expect(markup).not.toContain("Retry Resume lane");
    expect(markup).toContain("Replay-safe action");
  });

  it("keeps reset controls but suppresses replay when the action still exists and only the payload drifted away from the current contract", () => {
    const feedback = describeBoardActionFeedback(
      new HarnessBoardClientError({
        code: "invalid_request",
        message: "Unable to update harness board",
        status: 400
      }),
      {
        actionRoute: "review-attention",
        actionLabel: "Start fresh cycle"
      }
    );
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={boardResponse}
        initialControlMode="live"
        initialActionFeedback={feedback}
        initialActionFailureCause={
          new HarnessBoardClientError({
            code: "invalid_request",
            message: "Unable to update harness board",
            status: 400
          })
        }
        initialActionAttempt={{
          actionKey: "attention:start_fresh_cycle",
          actionPath: "/api/harness/runs/run_ui_test_1/review-attention",
          actionRoute: "review-attention",
          actionMethod: "POST",
          requestBody: { decision: "start_fresh_cycle", mode: "invalid_mode" },
          noticeLabel: "Start fresh cycle"
        }}
      />
    );

    expect(markup).toContain("Reset to current contract defaults");
    expect(markup).not.toContain("Retry Start fresh cycle");
    expect(markup).toContain("Payload drifted");
    expect(markup).toContain(
      "The current board still supports start fresh cycle, but the last payload no longer fits the bounded contract. Reset the composer to the current defaults before trying again."
    );
  });

  it("hides composer reset controls when the failed request is no longer supported by the current attention contract", () => {
    const feedback = describeBoardActionFeedback(
      new HarnessBoardClientError({
        code: "invalid_request",
        message: "Unable to update harness board",
        status: 400
      }),
      {
        actionRoute: "resolve-attention",
        actionLabel: "Unblock lane"
      }
    );
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={resolveAttentionBoardResponse}
        initialControlMode="live"
        initialActionFeedback={feedback}
        initialActionFailureCause={
          new HarnessBoardClientError({
            code: "invalid_request",
            message: "Unable to update harness board",
            status: 400
          })
        }
        initialActionAttempt={{
          actionKey: "attention:unblock_lane",
          actionPath: "/api/harness/runs/run_ui_test_2/resolve-attention",
          actionRoute: "resolve-attention",
          actionMethod: "POST",
          requestBody: { command: "unblock_lane" },
          noticeLabel: "Unblock lane"
        }}
      />
    );

    expect(markup).not.toContain("Reset to current contract defaults");
    expect(markup).not.toContain("Retry Unblock lane");
    expect(markup).toContain("Dismiss stale action issue");
  });

  it("does not mislabel a missing live board as a stale action and still allows dismissing the failed attempt", () => {
    const feedback = describeBoardActionFeedback(
      new HarnessBoardClientError({
        code: "conflict",
        message: "Unable to update harness board",
        status: 409
      }),
      {
        actionRoute: "proposal-decision",
        actionLabel: "Approve proposal"
      }
    );
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={null}
        initialControlMode="preview"
        initialActionFeedback={feedback}
        initialActionFailureCause={
          new HarnessBoardClientError({
            code: "conflict",
            message: "Unable to update harness board",
            status: 409
          })
        }
        initialActionAttempt={{
          actionKey: "approval:proposal_ui_test_1:approve",
          actionPath: "/api/harness/proposals/proposal_ui_test_1/decision",
          actionRoute: "proposal-decision",
          actionMethod: "POST",
          requestBody: { decision: "approve" },
          noticeLabel: "Approve proposal"
        }}
      />
    );

    expect(markup).toContain("Dismiss action issue");
    expect(markup).not.toContain(
      "The current board no longer exposes approve proposal. Reload or choose a fresh bounded action from the current contract instead of replaying the stale request."
    );
  });

  it("treats preview fallback board data as unavailable for live action recovery classification", () => {
    const feedback = describeBoardActionFeedback(
      new HarnessBoardClientError({
        code: "conflict",
        message: "Unable to update harness board",
        status: 409
      }),
      {
        actionRoute: "proposal-decision",
        actionLabel: "Approve proposal"
      }
    );
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={boardResponse}
        initialControlMode="preview"
        initialActionFeedback={feedback}
        initialActionFailureCause={
          new HarnessBoardClientError({
            code: "conflict",
            message: "Unable to update harness board",
            status: 409
          })
        }
        initialActionAttempt={{
          actionKey: "approval:proposal_ui_test_1:approve",
          actionPath: "/api/harness/proposals/proposal_ui_test_1/decision",
          actionRoute: "proposal-decision",
          actionMethod: "POST",
          requestBody: { decision: "approve" },
          noticeLabel: "Approve proposal"
        }}
      />
    );

    expect(markup).toContain("Dismiss action issue");
    expect(markup).not.toContain("Dismiss stale action issue");
    expect(markup).not.toContain("Replay-safe action");
    expect(markup).not.toContain("Action removed");
  });

  it("keeps preview board content visible while surfacing bounded live-load recovery guidance", () => {
    const feedback = describeBoardLoadFeedback(
      new HarnessBoardClientError({
        code: "service_unavailable",
        message: "Unable to load harness board",
        status: 503
      })
    );
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={boardResponse}
        initialControlMode="preview"
        initialLoadFeedback={feedback}
      />
    );

    expect(markup).toContain("Board load issue");
    expect(markup).toContain("The live harness board is temporarily unavailable right now.");
    expect(markup).toContain("Retry the live board load after the current service interruption clears.");
    expect(markup).toContain("Retry live board load");
    expect(markup).toContain("Preview");
    expect(markup).toContain("Pressure-test the pricing lane");
  });

  it("surfaces the preview variant label when a resolve-attention preview board is seeded explicitly", () => {
    const markup = renderToStaticMarkup(
      <HarnessBoardPage
        initialBoard={resolveAttentionBoardResponse}
        initialControlMode="preview"
        initialPreviewVariantLabel="Lane resume"
      />
    );

    expect(markup).toContain("Preview variant: Lane resume");
    expect(markup).toContain("while previewing lane resume.");
    expect(markup).toContain("Resume lane");
  });

  it("marks stale bounded action errors for board resync", () => {
    expect(
      shouldResyncBoardAfterActionError(
        new HarnessBoardClientError({
          code: "conflict",
          message: "Unable to update harness board",
          status: 409
        })
      )
    ).toBe(true);
    expect(
      shouldResyncBoardAfterActionError(
        new HarnessBoardClientError({
          code: "invalid_request",
          message: "Unable to update harness board",
          status: 400
        })
      )
    ).toBe(true);
    expect(
      shouldResyncBoardAfterActionError(
        new HarnessBoardClientError({
          code: "rate_limited",
          message: "Unable to update harness board",
          status: 429
        })
      )
    ).toBe(false);
  });

  it("marks retryable bounded action failures for safe replay", () => {
    expect(
      canRetryBoardActionAfterError(
        new HarnessBoardClientError({
          code: "service_unavailable",
          message: "Unable to update harness board",
          status: 503
        })
      )
    ).toBe(true);
    expect(
      canRetryBoardActionAfterError(
        new HarnessBoardClientError({
          code: "request_rejected",
          message: "Unable to update harness board",
          status: 502
        })
      )
    ).toBe(true);
    expect(
      canRetryBoardActionAfterError(
        new HarnessBoardClientError({
          code: "timed_out",
          message: "Harness board request timed out",
          status: 408
        })
      )
    ).toBe(true);
    expect(
      canRetryBoardActionAfterError(
        new HarnessBoardClientError({
          code: "conflict",
          message: "Unable to update harness board",
          status: 409
        })
      )
    ).toBe(false);
  });

  it("describes timed-out board actions with bounded replay guidance", () => {
    const feedback = describeBoardActionFeedback(
      new HarnessBoardClientError({
        code: "timed_out",
        message: "Harness board request timed out",
        status: 408
      }),
      {
        actionRoute: "proposal-decision",
        actionLabel: "Approve proposal"
      }
    );

    expect(feedback.message).toContain("took too long to respond");
    expect(feedback.recoverySteps).toEqual([
      "Retry the same bounded board action through the explicit replay control.",
      "If the timeout repeats, reload the board before trying again so the control surface stays current."
    ]);
  });

  it("marks invalid-request failures for composer reset instead of replay", () => {
    expect(
      canResetBoardActionComposerAfterError(
        new HarnessBoardClientError({
          code: "invalid_request",
          message: "Unable to update harness board",
          status: 400
        })
      )
    ).toBe(true);
    expect(
      canResetBoardActionComposerAfterError(
        new HarnessBoardClientError({
          code: "service_unavailable",
          message: "Unable to update harness board",
          status: 503
        })
      )
    ).toBe(false);
  });

  it("keeps localhost fallback usable while preserving bounded live-load feedback", () => {
    const feedback = describeBoardLoadFeedback(
      new HarnessBoardClientError({
        code: "service_unavailable",
        message: "Unable to load harness board",
        status: 503
      })
    );
    const resolution = resolveBoardLoadFailure({
      error: new HarnessBoardClientError({
        code: "service_unavailable",
        message: "Unable to load harness board",
        status: 503
      }),
      browserFallbackEnabled: true,
      fallbackState: {
        board: boardResponse,
        controlMode: "preview",
        variant: "review-attention",
        variantLabel: "Final assembly review"
      }
    });

    expect(resolution).toEqual({
      board: boardResponse,
      controlMode: "preview",
      previewVariantLabel: "Final assembly review",
      feedback
    });
  });
});
