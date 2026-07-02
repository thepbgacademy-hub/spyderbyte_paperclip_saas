import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import {
  createHarnessBoardClient,
  HarnessBoardClientError,
  type HarnessBoardActionResult,
  type HarnessBoardControlMode,
  type HarnessBoardFallbackState,
  type HarnessBoardResponse
} from "../harness-board-client.js";
import {
  HarnessBoard,
  type HarnessBoardCard,
  type HarnessBoardColumn
} from "../components/HarnessBoard.js";
import { HarnessBoardActionPanel } from "../components/HarnessBoardActionPanel.js";
import { HarnessCardDrawer } from "../components/HarnessCardDrawer.js";

const harnessBoardClient = createHarnessBoardClient();

const styles = {
  page: {
    background: "radial-gradient(circle at top, rgba(14, 165, 233, 0.16), transparent 28%), #020617",
    color: "#e2e8f0",
    display: "grid",
    gap: "1.25rem",
    minHeight: "100%",
    padding: "1.5rem"
  } satisfies CSSProperties,
  hero: {
    background: "linear-gradient(135deg, rgba(8, 47, 73, 0.96), rgba(15, 23, 42, 0.94))",
    border: "1px solid rgba(148, 163, 184, 0.16)",
    borderRadius: "32px",
    boxShadow: "0 30px 80px rgba(2, 8, 23, 0.45)",
    display: "grid",
    gap: "1rem",
    padding: "1.6rem"
  } satisfies CSSProperties,
  eyebrow: {
    color: "#7dd3fc",
    fontSize: "0.8rem",
    fontWeight: 700,
    letterSpacing: "0.1em",
    margin: 0,
    textTransform: "uppercase"
  } satisfies CSSProperties,
  heroTitle: {
    color: "#f8fafc",
    fontSize: "2.1rem",
    lineHeight: 1.05,
    margin: 0
  } satisfies CSSProperties,
  heroSummary: {
    color: "#cbd5e1",
    fontSize: "1rem",
    lineHeight: 1.7,
    margin: 0,
    maxWidth: "56rem"
  } satisfies CSSProperties,
  metricGrid: {
    display: "grid",
    gap: "0.9rem",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))"
  } satisfies CSSProperties,
  metricCard: {
    background: "rgba(15, 23, 42, 0.58)",
    border: "1px solid rgba(148, 163, 184, 0.14)",
    borderRadius: "22px",
    display: "grid",
    gap: "0.35rem",
    padding: "1rem"
  } satisfies CSSProperties,
  metricLabel: {
    color: "#94a3b8",
    fontSize: "0.82rem",
    margin: 0
  } satisfies CSSProperties,
  metricValue: {
    color: "#f8fafc",
    fontSize: "1.45rem",
    fontWeight: 700,
    margin: 0
  } satisfies CSSProperties,
  content: {
    display: "grid",
    gap: "1.25rem",
    gridTemplateColumns: "minmax(0, 1.8fr) minmax(320px, 0.95fr)"
  } satisfies CSSProperties,
  rail: {
    display: "grid",
    gap: "1rem"
  } satisfies CSSProperties,
  panel: {
    background: "rgba(7, 15, 24, 0.8)",
    border: "1px solid rgba(148, 163, 184, 0.14)",
    borderRadius: "28px",
    padding: "1.15rem"
  } satisfies CSSProperties,
  panelTitle: {
    color: "#f8fafc",
    fontSize: "1rem",
    fontWeight: 700,
    margin: "0 0 0.4rem"
  } satisfies CSSProperties,
  panelBody: {
    color: "#cbd5e1",
    fontSize: "0.92rem",
    lineHeight: 1.6,
    margin: 0
  } satisfies CSSProperties,
  personaList: {
    display: "grid",
    gap: "0.75rem",
    margin: "0.8rem 0 0",
    padding: 0
  } satisfies CSSProperties,
  personaItem: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    listStyle: "none"
  } satisfies CSSProperties,
  personaName: {
    color: "#e2e8f0",
    fontWeight: 600
  } satisfies CSSProperties,
  personaDetail: {
    color: "#94a3b8",
    fontSize: "0.82rem"
  } satisfies CSSProperties,
  actionList: {
    display: "grid",
    gap: "0.85rem",
    margin: "0.8rem 0 0",
    padding: 0
  } satisfies CSSProperties,
  actionItem: {
    background: "rgba(15, 23, 42, 0.58)",
    border: "1px solid rgba(148, 163, 184, 0.14)",
    borderRadius: "18px",
    display: "grid",
    gap: "0.45rem",
    listStyle: "none",
    padding: "0.9rem"
  } satisfies CSSProperties,
  actionHeading: {
    color: "#f8fafc",
    fontSize: "0.92rem",
    fontWeight: 700,
    margin: 0
  } satisfies CSSProperties,
  actionSummary: {
    color: "#cbd5e1",
    fontSize: "0.84rem",
    lineHeight: 1.5,
    margin: 0
  } satisfies CSSProperties,
  actionMeta: {
    color: "#7dd3fc",
    fontSize: "0.76rem",
    fontWeight: 700,
    letterSpacing: "0.06em",
    margin: 0,
    textTransform: "uppercase"
  } satisfies CSSProperties,
  optionList: {
    display: "grid",
    gap: "0.45rem",
    margin: 0,
    padding: 0
  } satisfies CSSProperties,
  optionItem: {
    display: "grid",
    gap: "0.18rem",
    listStyle: "none"
  } satisfies CSSProperties,
  optionTitle: {
    color: "#e2e8f0",
    fontSize: "0.82rem",
    fontWeight: 600,
    margin: 0
  } satisfies CSSProperties,
  badgeList: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.35rem",
    margin: "0.1rem 0 0"
  } satisfies CSSProperties,
  badge: {
    background: "rgba(14, 165, 233, 0.14)",
    border: "1px solid rgba(125, 211, 252, 0.16)",
    borderRadius: "999px",
    color: "#bae6fd",
    fontSize: "0.7rem",
    fontWeight: 700,
    letterSpacing: "0.04em",
    padding: "0.18rem 0.45rem",
    textTransform: "uppercase"
  } satisfies CSSProperties,
  optionBody: {
    color: "#94a3b8",
    fontSize: "0.78rem",
    lineHeight: 1.45,
    margin: 0
  } satisfies CSSProperties,
  contractMeta: {
    color: "#7dd3fc",
    fontSize: "0.75rem",
    fontWeight: 700,
    letterSpacing: "0.05em",
    margin: 0
  } satisfies CSSProperties,
  fieldList: {
    display: "grid",
    gap: "0.35rem",
    margin: 0,
    padding: 0
  } satisfies CSSProperties,
  fieldItem: {
    display: "grid",
    gap: "0.12rem",
    listStyle: "none"
  } satisfies CSSProperties,
  fieldTitle: {
    color: "#e2e8f0",
    fontSize: "0.78rem",
    fontWeight: 600,
    margin: 0
  } satisfies CSSProperties,
  formField: {
    background: "rgba(2, 6, 23, 0.72)",
    border: "1px solid rgba(148, 163, 184, 0.16)",
    borderRadius: "12px",
    color: "#e2e8f0",
    fontSize: "0.78rem",
    padding: "0.55rem 0.7rem",
    width: "100%"
  } satisfies CSSProperties,
  textAreaField: {
    background: "rgba(2, 6, 23, 0.72)",
    border: "1px solid rgba(125, 211, 252, 0.28)",
    borderRadius: "12px",
    color: "#e2e8f0",
    fontSize: "0.78rem",
    minHeight: "8.5rem",
    padding: "0.65rem 0.75rem",
    resize: "vertical",
    width: "100%"
  } satisfies CSSProperties,
  codeBlock: {
    background: "rgba(2, 6, 23, 0.72)",
    border: "1px solid rgba(148, 163, 184, 0.16)",
    borderRadius: "14px",
    color: "#cbd5e1",
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    fontSize: "0.74rem",
    margin: 0,
    overflowX: "auto",
    padding: "0.7rem 0.8rem",
    whiteSpace: "pre-wrap"
  } satisfies CSSProperties,
  actionButtonRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.55rem",
    marginTop: "0.35rem"
  } satisfies CSSProperties,
  tertiaryButton: {
    background: "rgba(15, 23, 42, 0.58)",
    border: "1px dashed rgba(125, 211, 252, 0.22)",
    borderRadius: "999px",
    color: "#bae6fd",
    cursor: "pointer",
    fontSize: "0.74rem",
    fontWeight: 600,
    padding: "0.46rem 0.72rem"
  } satisfies CSSProperties,
  actionButton: {
    background: "linear-gradient(135deg, rgba(14, 165, 233, 0.22), rgba(8, 47, 73, 0.82))",
    border: "1px solid rgba(125, 211, 252, 0.2)",
    borderRadius: "999px",
    color: "#e0f2fe",
    cursor: "pointer",
    fontSize: "0.78rem",
    fontWeight: 700,
    padding: "0.52rem 0.8rem"
  } satisfies CSSProperties,
  actionButtonDisabled: {
    cursor: "not-allowed",
    opacity: 0.55
  } satisfies CSSProperties,
  secondaryButton: {
    background: "transparent",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    borderRadius: "999px",
    color: "#cbd5e1",
    cursor: "pointer",
    fontSize: "0.74rem",
    fontWeight: 600,
    padding: "0.48rem 0.74rem"
  } satisfies CSSProperties,
  statusNotice: {
    color: "#bae6fd",
    fontSize: "0.78rem",
    lineHeight: 1.45,
    margin: 0
  } satisfies CSSProperties,
  statusSuccess: {
    color: "#86efac",
    fontSize: "0.78rem",
    lineHeight: 1.45,
    margin: 0
  } satisfies CSSProperties,
  statusError: {
    color: "#fca5a5",
    fontSize: "0.78rem",
    lineHeight: 1.45,
    margin: 0
  } satisfies CSSProperties,
  issueList: {
    display: "grid",
    gap: "0.3rem",
    margin: 0,
    paddingLeft: "1rem"
  } satisfies CSSProperties,
  issueItem: {
    color: "#fca5a5",
    fontSize: "0.76rem",
    lineHeight: 1.45
  } satisfies CSSProperties,
  feedbackList: {
    display: "grid",
    gap: "0.25rem",
    margin: "0.35rem 0 0",
    paddingLeft: "1rem"
  } satisfies CSSProperties,
  feedbackItem: {
    color: "#fca5a5",
    fontSize: "0.76rem",
    lineHeight: 1.45
  } satisfies CSSProperties
};

export type HarnessBoardFeedback = {
  message: string;
  recoveryTitle: string;
  recoverySteps: string[];
};

export type HarnessBoardLoadResolution = {
  board: HarnessBoardResponse | null;
  controlMode: HarnessBoardControlMode | null;
  previewVariantLabel: string | null;
  feedback: HarnessBoardFeedback;
};

export type HarnessBoardContractRefreshFeedback = {
  title: string;
  message: string;
  details: string[];
  affectedActions: string[];
  impactCounts: {
    removedActionDrafts: number;
    removedFieldOverrides: number;
    closedComposers: number;
  };
  recoveryTitle: string;
  recoverySteps: string[];
};

function isSameContractRefreshFeedback(
  left: HarnessBoardContractRefreshFeedback | null,
  right: HarnessBoardContractRefreshFeedback | null
) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.title === right.title
    && left.message === right.message
    && left.details.length === right.details.length
    && left.details.every((detail, index) => detail === right.details[index])
    && left.recoveryTitle === right.recoveryTitle
    && left.recoverySteps.length === right.recoverySteps.length
    && left.recoverySteps.every((step, index) => step === right.recoverySteps[index]);
}
export type HarnessBoardActionAttempt = {
  actionKey: string;
  actionPath: string;
  actionRoute?: HarnessBoardResponse["pendingApprovals"][number]["actionRoute"] | NonNullable<HarnessBoardResponse["pendingAttention"]>["actionRoute"];
  actionMethod: "POST";
  actionHandle: string;
  requestBody: Record<string, unknown>;
  noticeLabel: string;
};

function getPersonaMetrics(cards: HarnessBoardCard[]) {
  const personaCounts = new Map<string, number>();

  for (const card of cards) {
    personaCounts.set(card.persona, (personaCounts.get(card.persona) ?? 0) + 1);
  }

  return Array.from(personaCounts.entries()).map(([persona, count]) => ({
    persona,
    count
  }));
}

function renderActionOptions(
  options:
    | NonNullable<NonNullable<HarnessBoardResponse["pendingAttention"]>["actionOptions"]>
    | HarnessBoardResponse["pendingApprovals"][number]["actionOptions"]
    | undefined,
  recommendedOptionValue?: string
) {
  if (!options || options.length === 0) {
    return null;
  }

  return (
    <ul style={styles.optionList}>
      {options.map((option) => {
        const badges: string[] = [];
        if (option.emphasis === "primary") {
          badges.push("Primary");
        } else if (option.emphasis === "secondary") {
          badges.push("Secondary");
        } else if (option.emphasis === "caution") {
          badges.push("Caution");
        }
        if (option.value === recommendedOptionValue) {
          badges.push("Recommended next action");
        }
        if (option.requiresConfirmation) {
          badges.push(option.confirmationLabel ?? "Confirmation required");
        }

        return (
          <li key={option.value} style={styles.optionItem}>
            <p style={styles.optionTitle}>{option.label}</p>
            {badges.length > 0 ? (
              <div style={styles.badgeList}>
                {badges.map((badge) => (
                  <span key={badge} style={styles.badge}>
                    {badge}
                  </span>
                ))}
              </div>
            ) : null}
            <p style={styles.optionBody}>{option.description}</p>
            {option.nextEffectSummary ? <p style={styles.optionBody}>{option.nextEffectSummary}</p> : null}
            {option.exampleRequest ? <pre style={styles.codeBlock}>{JSON.stringify(option.exampleRequest)}</pre> : null}
          </li>
        );
      })}
    </ul>
  );
}

function getOptionButtonLabel(
  option: {
    label: string;
    value: string;
  },
  recommendedOptionValue?: string
) {
  return option.value === recommendedOptionValue ? `${option.label} (recommended)` : option.label;
}

function renderRequestFields(
  fields:
    | HarnessBoardResponse["pendingApprovals"][number]["requestFields"]
    | NonNullable<NonNullable<HarnessBoardResponse["pendingAttention"]>["requestFields"]>
    | undefined
) {
  if (!fields || fields.length === 0) {
    return null;
  }

  return (
    <ul style={styles.fieldList}>
      {fields.map((field) => (
        <li key={field.name} style={styles.fieldItem}>
          <p style={styles.fieldTitle}>{field.label}</p>
          {field.description ? <p style={styles.optionBody}>{field.description}</p> : null}
          <p style={styles.optionBody}>{field.required ? "Required field" : "Optional field"}</p>
          {field.allowedValues?.length ? (
            <p style={styles.optionBody}>{`Allowed values: ${field.allowedValues.join(", ")}`}</p>
          ) : null}
          {field.supportedWhenValue ? (
            <p style={styles.optionBody}>{`Supported when decision is ${field.supportedWhenValue}.`}</p>
          ) : null}
          {field.requiredWhenValue ? (
            <p style={styles.optionBody}>{`Required when decision is ${field.requiredWhenValue}.`}</p>
          ) : null}
          {field.suggestedValue ? <p style={styles.optionBody}>{`Suggested value: ${field.suggestedValue}`}</p> : null}
        </li>
      ))}
    </ul>
  );
}

type HarnessActionFieldView =
  | NonNullable<HarnessBoardResponse["pendingApprovals"][number]["requestFields"]>[number]
  | NonNullable<NonNullable<HarnessBoardResponse["pendingAttention"]>["requestFields"]>[number];

type HarnessActionOptionView =
  | NonNullable<HarnessBoardResponse["pendingApprovals"][number]["actionOptions"]>[number]
  | NonNullable<NonNullable<HarnessBoardResponse["pendingAttention"]>["actionOptions"]>[number];

type HarnessContractActionIssueReason =
  | "invalid_allowed_value"
  | "hidden_for_option"
  | "removed_from_contract";

type HarnessContractActionIssue = {
  fieldName: string;
  fieldLabel: string;
  reason: HarnessContractActionIssueReason;
};

function getContractFieldSeed(
  field: HarnessActionFieldView,
  option?: HarnessActionOptionView
) {
  if (!option?.exampleRequest) {
    return field.suggestedValue ?? field.allowedValues?.[0] ?? "";
  }

  const seededValue = option.exampleRequest[field.name];
  return typeof seededValue === "string"
    ? seededValue
    : field.suggestedValue ?? field.allowedValues?.[0] ?? "";
}

function fieldAppliesToOption(field: HarnessActionFieldView, option?: HarnessActionOptionView) {
  if (!option?.exampleRequest) {
    return !field.supportedWhenValue && !field.requiredWhenValue;
  }

  const optionValue =
    typeof option.exampleRequest.decision === "string"
      ? option.exampleRequest.decision
      : typeof option.exampleRequest.resolution === "string"
        ? option.exampleRequest.resolution
        : typeof (option.exampleRequest as { command?: unknown }).command === "string"
          ? (option.exampleRequest as { command: string }).command
        : null;

  if (field.requiredWhenValue) {
    return optionValue === field.requiredWhenValue;
  }

  if (field.supportedWhenValue) {
    return optionValue === field.supportedWhenValue;
  }

  return true;
}

function fieldIsRequiredForOption(field: HarnessActionFieldView, option?: HarnessActionOptionView) {
  if (!fieldAppliesToOption(field, option)) {
    return false;
  }

  return field.required || Boolean(field.requiredWhenValue);
}

type HarnessContractFieldAssessment = {
  displayValue: string;
  nextValue: string;
  drifted: boolean;
};

const STALE_SELECT_VALUE = "__wf_stale_select_value__";

function assessContractFieldValue(
  field: HarnessActionFieldView,
  option: HarnessActionOptionView | undefined,
  draftValue: string | undefined
): HarnessContractFieldAssessment {
  const draftText = typeof draftValue === "string" ? draftValue.trim() : "";
  const seedText = getContractFieldSeed(field, option).trim();

  if (!draftText) {
    return {
      displayValue: seedText,
      nextValue: seedText,
      drifted: false
    };
  }

  if (field.allowedValues?.length && !field.allowedValues.includes(draftText)) {
    return {
      displayValue: STALE_SELECT_VALUE,
      nextValue: seedText,
      drifted: true
    };
  }

  return {
    displayValue: draftText,
    nextValue: draftText,
    drifted: false
  };
}

export function getContractActionState(input: {
  fields: HarnessActionFieldView[] | undefined;
  option: HarnessActionOptionView;
  draftValues: Record<string, string>;
}) {
  const payload: Record<string, unknown> = { ...(input.option.exampleRequest ?? {}) };
  const allFields = input.fields ?? [];
  const visibleFields = allFields.filter((field) => fieldAppliesToOption(field, input.option));
  const visibleFieldNames = new Set<string>(visibleFields.map((field) => field.name));
  const contractFieldMap = new Map<string, HarnessActionFieldView>(allFields.map((field) => [field.name, field]));
  const controlFieldNames = new Set<string>(
    ["decision", "resolution"].filter((fieldName) => typeof payload[fieldName] === "string")
  );
  const missingRequiredFields: string[] = [];
  const driftedFields: HarnessContractActionIssue[] = [];
  let activeDraftCount = 0;

  for (const field of visibleFields) {
    const rawDraftValue = input.draftValues[field.name];
    const assessment = assessContractFieldValue(field, input.option, rawDraftValue);
    const nextValue = assessment.nextValue;

    if (assessment.drifted) {
      driftedFields.push({
        fieldName: field.name,
        fieldLabel: field.label,
        reason: "invalid_allowed_value"
      });
    }

    if (typeof rawDraftValue === "string" && rawDraftValue.trim().length > 0 && !assessment.drifted) {
      activeDraftCount += 1;
    }

    if (!nextValue) {
      if (fieldIsRequiredForOption(field, input.option)) {
        missingRequiredFields.push(field.label);
      }
      continue;
    }

    payload[field.name] = nextValue;
  }

  for (const [fieldName, draftValue] of Object.entries(input.draftValues)) {
    if (typeof draftValue !== "string" || draftValue.trim().length === 0) {
      continue;
    }

    if (visibleFieldNames.has(fieldName) || controlFieldNames.has(fieldName)) {
      continue;
    }

    const contractField = contractFieldMap.get(fieldName);
    driftedFields.push({
      fieldName,
      fieldLabel: contractField?.label ?? humanizeValue(fieldName),
      reason: contractField ? "hidden_for_option" : "removed_from_contract"
    });
  }

  return {
    payload,
    visibleFields,
    missingRequiredFields,
    driftedFields,
    driftedFieldLabels: driftedFields.map((issue) => issue.fieldLabel),
    activeDraftCount
  };
}

export function summarizeContractActionState(actionState: {
  visibleFields: HarnessActionFieldView[];
  missingRequiredFields: string[];
  driftedFields: HarnessContractActionIssue[];
  driftedFieldLabels: string[];
  activeDraftCount: number;
}) {
  if (actionState.driftedFieldLabels.length > 0) {
    return {
      tone: "drifted" as const,
      summary: `Reset required: ${actionState.driftedFieldLabels.join(", ")} no longer fits the current contract.`
    };
  }

  if (actionState.missingRequiredFields.length > 0) {
    return {
      tone: "needs_input" as const,
      summary: `Needs input: ${actionState.missingRequiredFields.join(", ")}`
    };
  }

  if (actionState.visibleFields.length === 0) {
    return {
      tone: "ready" as const,
      summary: "Ready with contract payload."
    };
  }

  if (actionState.activeDraftCount === 0) {
    return {
      tone: "defaults" as const,
      summary: "Ready with contract defaults."
    };
  }

  return {
    tone: "ready" as const,
    summary: `Ready with ${actionState.activeDraftCount} field override${actionState.activeDraftCount === 1 ? "" : "s"}.`
  };
}

export function canSubmitContractActionState(actionState: {
  missingRequiredFields: string[];
  driftedFields: HarnessContractActionIssue[];
}) {
  return actionState.missingRequiredFields.length === 0 && actionState.driftedFields.length === 0;
}

function shouldPollAfterActionResult(actionResult: HarnessBoardActionResult): actionResult is Extract<
  HarnessBoardActionResult,
  { cardId: string; state: "approved" | "working" }
> {
  return (
    "cardId" in actionResult
    && "state" in actionResult
    && (actionResult.state === "approved" || actionResult.state === "working")
  );
}

function boardLaneForActionState(state: "approved" | "working") {
  return state === "approved" ? "planning" : "working";
}

function cardMatchesActionState(
  card: HarnessBoardResponse["cards"][number] | undefined,
  actionResult: Extract<HarnessBoardActionResult, { cardId: string; state: "approved" | "working" }>
) {
  if (!card) {
    return false;
  }
  return card.id === actionResult.cardId && card.lane === boardLaneForActionState(actionResult.state);
}

export function describeContractActionIssue(issue: HarnessContractActionIssue) {
  switch (issue.reason) {
    case "invalid_allowed_value":
      return `${issue.fieldLabel}: the current draft is no longer in the allowed values for this contract field.`;
    case "hidden_for_option":
      return `${issue.fieldLabel}: the current draft only applies to a different action option and must be reset before submit.`;
    case "removed_from_contract":
      return `${issue.fieldLabel}: the current draft refers to a field that no longer exists in the live contract.`;
    default:
      return `${issue.fieldLabel}: the current draft no longer fits the live contract.`;
  }
}

function getOptionControlFieldName(option: HarnessActionOptionView) {
  if (typeof option.exampleRequest?.decision === "string") {
    return "decision";
  }

  if (typeof option.exampleRequest?.resolution === "string") {
    return "resolution";
  }

  if (typeof (option.exampleRequest as { command?: unknown } | undefined)?.command === "string") {
    return "resolution";
  }

  return null;
}

export function getBoardContractActionFieldMap(board: HarnessBoardResponse | null) {
  const fieldMap = new Map<string, Set<string>>();

  if (!board) {
    return fieldMap;
  }

  if (board.pendingAttention?.actionOptions?.length) {
    for (const option of board.pendingAttention.actionOptions) {
      const actionKey = `attention:${option.value}`;
      const fieldNames = new Set<string>((board.pendingAttention.requestFields ?? []).map((field) => field.name));
      const controlFieldName = getOptionControlFieldName(option);
      if (controlFieldName) {
        fieldNames.add(controlFieldName);
      }
      fieldMap.set(actionKey, fieldNames);
    }
  }

  for (const approval of board.pendingApprovals) {
    if (!approval.actionOptions?.length) {
      continue;
    }

    for (const option of approval.actionOptions) {
      const actionKey = `approval:${approval.id}:${option.value}`;
      const fieldNames = new Set<string>((approval.requestFields ?? []).map((field) => field.name));
      const controlFieldName = getOptionControlFieldName(option);
      if (controlFieldName) {
        fieldNames.add(controlFieldName);
      }
      fieldMap.set(actionKey, fieldNames);
    }
  }

  return fieldMap;
}

type HarnessBoardContractActionDescriptor = {
  label: string;
  fieldLabels: Map<string, string>;
};

function mergeBoardContractActionDescriptorMaps(
  liveDescriptors: Map<string, HarnessBoardContractActionDescriptor>,
  referenceDescriptors?: Map<string, HarnessBoardContractActionDescriptor>
) {
  const merged = new Map<string, HarnessBoardContractActionDescriptor>();

  for (const [actionKey, descriptor] of referenceDescriptors ?? []) {
    merged.set(actionKey, {
      label: descriptor.label,
      fieldLabels: new Map(descriptor.fieldLabels)
    });
  }

  for (const [actionKey, descriptor] of liveDescriptors) {
    const existing = merged.get(actionKey);
    merged.set(actionKey, {
      label: descriptor.label,
      fieldLabels: new Map([
        ...(existing?.fieldLabels.entries() ?? []),
        ...descriptor.fieldLabels.entries()
      ])
    });
  }

  return merged;
}

export function getBoardContractActionDescriptorMap(board: HarnessBoardResponse | null) {
  const descriptorMap = new Map<string, HarnessBoardContractActionDescriptor>();

  if (!board) {
    return descriptorMap;
  }

  if (board.pendingAttention?.actionOptions?.length) {
    const fieldLabels = new Map<string, string>(
      (board.pendingAttention.requestFields ?? []).map((field) => [field.name, field.label])
    );
    for (const option of board.pendingAttention.actionOptions) {
      descriptorMap.set(`attention:${option.value}`, {
        label: option.label,
        fieldLabels
      });
    }
  }

  for (const approval of board.pendingApprovals) {
    if (!approval.actionOptions?.length) {
      continue;
    }

    const fieldLabels = new Map<string, string>(
      (approval.requestFields ?? []).map((field) => [field.name, field.label])
    );
    for (const option of approval.actionOptions) {
      descriptorMap.set(`approval:${approval.id}:${option.value}`, {
        label: option.label,
        fieldLabels
      });
    }
  }

  return descriptorMap;
}

function describeActionKey(
  actionKey: string,
  descriptors?: Map<string, HarnessBoardContractActionDescriptor>
) {
  const descriptor = descriptors?.get(actionKey);
  if (descriptor) {
    return descriptor.label;
  }

  const [family, identifier, optionValue] = actionKey.split(":");
  if (family === "attention" && identifier) {
    return humanizeValue(identifier);
  }

  if (family === "approval" && optionValue) {
    return humanizeValue(optionValue);
  }

  return humanizeValue(actionKey.replace(/:/g, " "));
}

export type HarnessBoardContractRefreshImpact = {
  removedActionDrafts: Array<{
    actionKey: string;
    actionLabel: string;
  }>;
  removedFieldOverrideDetails: Array<{
    actionKey: string;
    actionLabel: string;
    fieldLabels: string[];
  }>;
  removedFieldOverrideCount: number;
  closedComposerActions: Array<{
    actionKey: string;
    actionLabel: string;
  }>;
};

export function inspectBoardContractRefreshImpact(
  board: HarnessBoardResponse | null,
  actionDrafts: Record<string, Record<string, string>>,
  openActionComposerKeys: Record<string, boolean>,
  referenceBoard?: HarnessBoardResponse | null
): HarnessBoardContractRefreshImpact {
  const contractFieldMap = getBoardContractActionFieldMap(board);
  const descriptorMap = mergeBoardContractActionDescriptorMaps(
    getBoardContractActionDescriptorMap(board),
    getBoardContractActionDescriptorMap(referenceBoard ?? null)
  );

  if (contractFieldMap.size === 0) {
    return {
      removedActionDrafts: [],
      removedFieldOverrideDetails: [],
      removedFieldOverrideCount: 0,
      closedComposerActions: []
    };
  }

  const removedActionDrafts: Array<{
    actionKey: string;
    actionLabel: string;
  }> = [];
  const removedFieldOverrideDetails: Array<{
    actionKey: string;
    actionLabel: string;
    fieldLabels: string[];
  }> = [];
  let removedFieldOverrideCount = 0;

  for (const [actionKey, draftValues] of Object.entries(actionDrafts)) {
    const allowedFields = contractFieldMap.get(actionKey);
    if (!allowedFields) {
      removedActionDrafts.push({
        actionKey,
        actionLabel: describeActionKey(actionKey, descriptorMap)
      });
      continue;
    }

    const removedFieldLabels: string[] = [];
    for (const fieldName of Object.keys(draftValues)) {
      if (!allowedFields.has(fieldName)) {
        removedFieldOverrideCount += 1;
        removedFieldLabels.push(
          descriptorMap.get(actionKey)?.fieldLabels.get(fieldName) ?? humanizeValue(fieldName)
        );
      }
    }

    if (removedFieldLabels.length > 0) {
      removedFieldOverrideDetails.push({
        actionKey,
        actionLabel: describeActionKey(actionKey, descriptorMap),
        fieldLabels: removedFieldLabels
      });
    }
  }

  const closedComposerActions = Object.entries(openActionComposerKeys)
    .filter(([actionKey, isOpen]) => Boolean(isOpen) && !contractFieldMap.has(actionKey))
    .map(([actionKey]) => ({
      actionKey,
      actionLabel: describeActionKey(actionKey, descriptorMap)
    }));

  return {
    removedActionDrafts,
    removedFieldOverrideDetails,
    removedFieldOverrideCount,
    closedComposerActions
  };
}

export function pruneActionDraftsForBoard(
  board: HarnessBoardResponse | null,
  actionDrafts: Record<string, Record<string, string>>
) {
  const contractFieldMap = getBoardContractActionFieldMap(board);

  if (contractFieldMap.size === 0) {
    return actionDrafts;
  }

  let changed = false;
  const nextDrafts = Object.fromEntries(
    Object.entries(actionDrafts).flatMap(([actionKey, draftValues]) => {
      const allowedFields = contractFieldMap.get(actionKey);
      if (!allowedFields) {
        changed = true;
        return [];
      }

      const nextDraftValues = Object.fromEntries(
        Object.entries(draftValues).filter(([fieldName]) => allowedFields.has(fieldName))
      );

      if (Object.keys(nextDraftValues).length !== Object.keys(draftValues).length) {
        changed = true;
      }

      return [[actionKey, nextDraftValues]];
    })
  );

  return changed ? nextDrafts : actionDrafts;
}

export function pruneOpenActionComposerKeysForBoard(
  board: HarnessBoardResponse | null,
  openActionComposerKeys: Record<string, boolean>
) {
  const contractFieldMap = getBoardContractActionFieldMap(board);

  if (contractFieldMap.size === 0) {
    return openActionComposerKeys;
  }

  let changed = false;
  const nextComposerKeys = Object.fromEntries(
    Object.entries(openActionComposerKeys).filter(([actionKey]) => {
      const keep = contractFieldMap.has(actionKey);
      if (!keep) {
        changed = true;
      }
      return keep;
    })
  );

  return changed ? nextComposerKeys : openActionComposerKeys;
}

export function describeBoardContractRefreshImpact(
  impact: HarnessBoardContractRefreshImpact
): HarnessBoardContractRefreshFeedback | null {
  const parts: string[] = [];
  const details: string[] = [];

  if (impact.removedActionDrafts.length > 0) {
    parts.push(
      `${impact.removedActionDrafts.length} stale action draft${impact.removedActionDrafts.length === 1 ? "" : "s"} removed`
    );
    details.push(
      `Removed stale drafts for: ${impact.removedActionDrafts.map((item) => item.actionLabel).join(", ")}.`
    );
  }

  if (impact.removedFieldOverrideCount > 0) {
    parts.push(
      `${impact.removedFieldOverrideCount} field override${impact.removedFieldOverrideCount === 1 ? "" : "s"} pruned`
    );
    details.push(
      `Pruned removed fields from: ${impact.removedFieldOverrideDetails
        .map((detail) => `${detail.actionLabel} (${detail.fieldLabels.join(", ")})`)
        .join("; ")}.`
    );
  }

  if (impact.closedComposerActions.length > 0) {
    parts.push(
      `${impact.closedComposerActions.length} stale composer${impact.closedComposerActions.length === 1 ? "" : "s"} closed`
    );
    details.push(
      `Closed stale composers for: ${impact.closedComposerActions.map((item) => item.actionLabel).join(", ")}.`
    );
  }

  if (parts.length === 0) {
    return null;
  }

  const affectedActions = Array.from(
    new Set([
      ...impact.removedActionDrafts.map((item) => item.actionLabel),
      ...impact.removedFieldOverrideDetails.map((detail) => detail.actionLabel),
      ...impact.closedComposerActions.map((item) => item.actionLabel)
    ])
  );

  const recoverySteps: string[] = [];
  if (impact.removedActionDrafts.length > 0) {
    recoverySteps.push("Review the current live board actions before reopening any removed composer or retrying an older action path.");
  }
  if (impact.removedFieldOverrideCount > 0) {
    recoverySteps.push("Reset the affected action composer to the current contract defaults before trying to submit that action again.");
  }
  if (impact.closedComposerActions.length > 0) {
    recoverySteps.push("Reopen only the still-needed composers from the current live board instead of assuming the earlier draft is still valid.");
  }

  const dedupedRecoverySteps = Array.from(new Set(recoverySteps));

  return {
    title: "Contract refresh",
    message: `Live board contract refreshed: ${parts.join(", ")}.`,
    details,
    affectedActions,
    impactCounts: {
      removedActionDrafts: impact.removedActionDrafts.length,
      removedFieldOverrides: impact.removedFieldOverrideCount,
      closedComposers: impact.closedComposerActions.length
    },
    recoveryTitle: "Next safe step",
    recoverySteps: dedupedRecoverySteps
  };
}

export function buildContractActionPayload(input: {
  fields: HarnessActionFieldView[] | undefined;
  option: HarnessActionOptionView;
  draftValues: Record<string, string>;
}) {
  return getContractActionState(input).payload;
}

function renderActionConstraintSummary(input: { allowedValues: readonly string[] | undefined; label: string }) {
  if (!input.allowedValues || input.allowedValues.length === 0) {
    return null;
  }

  return <p style={styles.contractMeta}>{`${input.label}: ${input.allowedValues.join(", ")}`}</p>;
}

function formatActionRoute(
  route:
    | HarnessBoardResponse["pendingApprovals"][number]["actionRoute"]
    | NonNullable<NonNullable<HarnessBoardResponse["pendingAttention"]>["actionRoute"]>
    | NonNullable<NonNullable<HarnessBoardResponse["memoryBoundary"]["exportCandidates"]>[number]["exportActions"]>[number]["actionRoute"]
    | undefined
) {
  if (!route) {
    return null;
  }

  return route.replace(/-/g, " ");
}

function humanizeValue(value: string) {
  return value.replace(/_/g, " ");
}

function describeBacklogMode(
  mode: NonNullable<NonNullable<HarnessBoardResponse["pendingAttention"]>["backlogMode"]> | undefined
) {
  switch (mode) {
    case "new_work_waiting":
      return "New work waiting";
    case "carry_forward_review":
      return "Carry-forward review";
    case "mixed_backlog":
      return "Mixed backlog";
    default:
      return null;
  }
}

function joinHeadingParts(left: string, right: string) {
  return `${left} - ${right}`;
}

function formatLowercaseList(values: string[]) {
  if (values.length === 0) {
    return "";
  }

  if (values.length === 1) {
    return values[0]!.toLowerCase();
  }

  if (values.length === 2) {
    return `${values[0]!.toLowerCase()} and ${values[1]!.toLowerCase()}`;
  }

  return `${values.slice(0, -1).map((value) => value.toLowerCase()).join(", ")}, and ${values.at(-1)!.toLowerCase()}`;
}

function describeNextActionsSummary(
  pendingAttention: HarnessBoardResponse["pendingAttention"] | null,
  pendingApprovals: HarnessBoardResponse["pendingApprovals"]
) {
  if (!pendingAttention && pendingApprovals.length === 0) {
    return "No live review or approval items are shaping the next move.";
  }

  const approvalSummary = `${pendingApprovals.length} pending approval${pendingApprovals.length === 1 ? "" : "s"}`;
  const withApprovals = (lead: string) =>
    pendingApprovals.length > 0 ? `${lead} and ${approvalSummary} are shaping the next move.` : `${lead} is shaping the next move.`;

  if (!pendingAttention) {
    return `${approvalSummary} ${pendingApprovals.length === 1 ? "is" : "are"} shaping the next move.`;
  }

  switch (pendingAttention.kind) {
    case "queue_ceo_review":
      return withApprovals("1 CEO review");
    case "await_lane_resume":
      return withApprovals("1 lane follow-up");
    default:
      return withApprovals("1 live board action");
  }
}

function describeAttentionRecoverySummary(pendingAttention: HarnessBoardResponse["pendingAttention"] | null) {
  if (!pendingAttention) {
    return null;
  }

  switch (pendingAttention.kind) {
    case "queue_ceo_review":
      return {
        pulseSummary: "Recovery path: close CEO review before worker progress resumes.",
        panelSummary: "Worker progress is intentionally paused until the CEO closes this review action from the live board contract.",
        safeStep: "Resolve this review from the Board action panel; do not bypass it with a manual worker restart or stale action token."
      };
    case "await_lane_resume":
      return {
        pulseSummary: "Recovery path: resolve lane follow-up before worker progress resumes.",
        panelSummary: "Worker progress is intentionally paused until this lane resume action is resolved from the live board contract.",
        safeStep: "Resolve the lane follow-up from the Board action panel; do not bypass it with a manual worker restart or stale action token."
      };
    default:
      return null;
  }
}

function describeSubmittedActionResult(result: HarnessBoardActionResult, fallbackLabel: string) {
  switch (result.status) {
    case "approved":
      return result.cardId
        ? `Proposal approved and lane ${result.cardId} is now part of the live board.`
        : "Proposal approved and routed back into the live board.";
    case "deferred":
      return "Proposal deferred and preserved for bounded later review.";
    case "denied":
      return "Proposal denied and closed without widening the current board cycle.";
    case "done":
      return "CEO review completed and the current board cycle closed cleanly.";
    case "fresh_cycle_started":
      return `Fresh cycle started with ${result.reopenedProposalCount} deferred item${result.reopenedProposalCount === 1 ? "" : "s"} reopened.`;
    case "resumed":
      return result.cardId
        ? `Lane ${result.cardId} resumed and re-entered live execution.`
        : "Lane resumed and re-entered live execution.";
    case "unblocked":
      return result.cardId
        ? `Lane ${result.cardId} was unblocked and returned to the board queue.`
        : "Lane was unblocked and returned to the board queue.";
    default:
      return `${fallbackLabel} submitted.`;
  }
}

function describeActionResultEffect(result: HarnessBoardActionResult) {
  switch (result.status) {
    case "approved":
      return "Effect: the approved lane is now eligible to continue through the bounded board workflow.";
    case "deferred":
      return "Effect: the request stays visible for later CEO review without widening the current board cycle yet.";
    case "denied":
      return "Effect: the request is closed without opening a new lane.";
    case "done":
      return `Effect: run ${result.runId} is now the closed tenant-facing package.`;
    case "fresh_cycle_started":
      return `Effect: run ${result.runId} is now the active board cycle.`;
    case "resumed":
      return `Effect: lane ${result.cardId} is back in live execution with state ${result.state}.`;
    case "unblocked":
      return `Effect: lane ${result.cardId} returned to state ${result.state} and can re-enter the bounded queue.`;
    default:
      return null;
  }
}

function describeBoardLoadError(error: unknown) {
  if (!(error instanceof HarnessBoardClientError)) {
    return "Unable to load the harness board right now.";
  }

  switch (error.code) {
    case "unauthorized":
      return "Your session can’t access the live harness board right now.";
    case "rate_limited":
      return error.retryAfterSeconds && error.retryAfterSeconds > 0
        ? `Live harness board traffic is throttled for ${error.retryAfterSeconds} more second${error.retryAfterSeconds === 1 ? "" : "s"}.`
        : "Live harness board traffic is throttled for a moment. Try again shortly.";
    case "timed_out":
      return "The live harness board took too long to respond.";
    case "service_unavailable":
      return "The live harness board is temporarily unavailable right now.";
    case "request_rejected":
      return "This browser request was rejected before the live harness board could respond.";
    case "not_found":
      return "The live harness board route is unavailable right now.";
    default:
      return "Unable to load the harness board right now.";
  }
}

export function describeBoardLoadFeedback(error: unknown): HarnessBoardFeedback {
  if (!(error instanceof HarnessBoardClientError)) {
    return {
      message: "Unable to load the harness board right now.",
      recoveryTitle: "Next safe step",
      recoverySteps: [
        "Retry the board load after a brief pause.",
        "Stay on the bounded board route instead of falling back to a manual refresh loop."
      ]
    };
  }

  switch (error.code) {
    case "unauthorized":
      return {
        message: describeBoardLoadError(error),
        recoveryTitle: "Next safe step",
        recoverySteps: [
          "Re-authenticate your tenant session.",
          "Reload the live harness board after access is restored."
        ]
      };
    case "rate_limited":
      return {
        message: describeBoardLoadError(error),
        recoveryTitle: "Safe retry",
        recoverySteps: [
          "Wait for the bounded retry window to clear.",
          "Reload the live harness board after the throttle window expires."
        ]
      };
    case "timed_out":
      return {
        message: describeBoardLoadError(error),
        recoveryTitle: "Safe retry",
        recoverySteps: [
          "Retry the live board load through the bounded reload control.",
          "If the timeout repeats, pause before retrying again so the board does not slip into a manual refresh loop."
        ]
      };
    case "not_found":
      return {
        message: describeBoardLoadError(error),
        recoveryTitle: "Next safe step",
        recoverySteps: [
          "Confirm the live board route is still enabled for this tenant workflow.",
          "Retry only after the bounded harness board route is available again."
        ]
      };
    case "request_rejected":
    case "service_unavailable":
      return {
        message: describeBoardLoadError(error),
        recoveryTitle: "Safe retry",
        recoverySteps: [
          "Retry the live board load after the current service interruption clears.",
          "Avoid switching to a shadow control path while the harness boundary is unavailable."
        ]
      };
    default:
      return {
        message: describeBoardLoadError(error),
        recoveryTitle: "Next safe step",
        recoverySteps: [
          "Reload the live harness board to recover the bounded board contract.",
          "If the same load failure repeats, pause before retrying again."
        ]
      };
  }
}

export function resolveBoardLoadFailure(input: {
  error: unknown;
  browserFallbackEnabled: boolean;
  fallbackState: HarnessBoardFallbackState | null;
}): HarnessBoardLoadResolution {
  const feedback = describeBoardLoadFeedback(input.error);
  if (input.browserFallbackEnabled && input.fallbackState) {
    return {
      board: input.fallbackState.board,
      controlMode: input.fallbackState.controlMode,
      previewVariantLabel: input.fallbackState.variantLabel,
      feedback
    };
  }

  return {
    board: null,
    controlMode: null,
    previewVariantLabel: null,
    feedback
  };
}

function describeBoardActionError(error: unknown, fallbackLabel: string) {
  if (!(error instanceof HarnessBoardClientError)) {
    return `Unable to ${fallbackLabel.toLowerCase()} right now.`;
  }

  switch (error.code) {
    case "unauthorized":
      return "Your session can’t submit this live board action right now.";
    case "conflict":
      return "The live harness board changed before this action could be applied. Refresh the board and try again.";
    case "stale_contract":
      return "This live board action no longer matches the current harness contract.";
    case "invalid_request":
      return "This action payload no longer matches the live board contract.";
    case "rate_limited":
      return error.retryAfterSeconds && error.retryAfterSeconds > 0
        ? `Live board actions are throttled for ${error.retryAfterSeconds} more second${error.retryAfterSeconds === 1 ? "" : "s"}.`
        : "Live board actions are throttled for a moment. Try again shortly.";
    case "timed_out":
      return "The live harness board took too long to respond to this action.";
    case "request_rejected":
      return "This live board action was rejected before it reached the harness boundary.";
    case "service_unavailable":
      return "The live harness board can’t accept this action right now.";
    case "not_found":
      return "This live board action route is no longer available.";
    default:
      return `Unable to ${fallbackLabel.toLowerCase()} right now.`;
  }
}

export function describeBoardActionFeedback(
  error: unknown,
  context: {
    actionRoute?: HarnessBoardResponse["pendingApprovals"][number]["actionRoute"] | NonNullable<HarnessBoardResponse["pendingAttention"]>["actionRoute"];
    actionLabel: string;
  }
): HarnessBoardFeedback {
  const fallbackMessage = describeBoardActionError(error, context.actionLabel);
  if (!(error instanceof HarnessBoardClientError)) {
    return {
      message: fallbackMessage,
      recoveryTitle: "Next safe step",
      recoverySteps: [
        "Refresh the board before retrying this bounded action.",
        "Stay on the engine-owned action path instead of improvising a manual workaround."
      ]
    };
  }

  if (error.code === "invalid_request") {
    return {
      message: fallbackMessage,
      recoveryTitle: "Contract recovery",
      recoverySteps: [
        "Reset this action composer to the contract defaults.",
        context.actionRoute === "resolve-attention"
          ? "Review the required fields again before retrying the lane recovery step."
          : "Review the required fields again before retrying this bounded board action."
      ]
    };
  }

  if (error.code === "stale_contract") {
    return {
      message: fallbackMessage,
      recoveryTitle: "Contract refresh",
      recoverySteps: [
        "Reload the live board to fetch the current engine-owned action contract.",
        "Choose the next bounded action from the refreshed board instead of replaying the stale request token."
      ]
    };
  }

  if (error.code === "rate_limited") {
    return {
      message: fallbackMessage,
      recoveryTitle: "Safe retry",
      recoverySteps: [
        "Wait for the bounded retry window to clear.",
        "Retry the same board action after the throttle window expires."
      ]
    };
  }

  if (error.code === "timed_out") {
    return {
      message: fallbackMessage,
      recoveryTitle: "Safe retry",
      recoverySteps: [
        "Retry the same bounded board action through the explicit replay control.",
        "If the timeout repeats, reload the board before trying again so the control surface stays current."
      ]
    };
  }

  if (error.code === "unauthorized") {
    return {
      message: fallbackMessage,
      recoveryTitle: "Next safe step",
      recoverySteps: [
        "Re-authenticate your tenant session.",
        "Reload the board before retrying this live action."
      ]
    };
  }

  if (error.code === "conflict") {
    const recoverySteps =
      context.actionRoute === "proposal-decision"
        ? [
            "Refresh the board and confirm the proposal is still pending CEO review.",
            "Check the latest approval queue before trying to widen or defer the lane again."
          ]
        : context.actionRoute === "resolve-attention"
          ? [
              "Refresh the board and confirm the lane still needs resume or unblock attention.",
              "Retry the lane recovery step only if the same bounded attention is still active."
            ]
          : context.actionRoute === "review-attention"
            ? [
                "Refresh the board and confirm final assembly is still waiting on CEO review.",
                "Retry completion or fresh-cycle review only if the same bounded review gate is still active."
              ]
            : [
                "Refresh the board before retrying this bounded action.",
                "Confirm the current board state still needs the same control decision."
              ];

    return {
      message: fallbackMessage,
      recoveryTitle: "Next safe step",
      recoverySteps
    };
  }

  return {
    message: fallbackMessage,
    recoveryTitle: "Safe retry",
    recoverySteps: [
      "Retry this bounded board action after the current interruption clears.",
      "Avoid switching to an unbounded manual workaround while the harness boundary is unstable."
    ]
  };
}

export function shouldResyncBoardAfterActionError(error: unknown) {
  return error instanceof HarnessBoardClientError
    && (error.code === "conflict" || error.code === "invalid_request" || error.code === "not_found" || error.code === "stale_contract");
}

export function canRetryBoardActionAfterError(error: unknown) {
  return error instanceof HarnessBoardClientError
    && (error.code === "rate_limited" || error.code === "service_unavailable" || error.code === "request_rejected" || error.code === "timed_out");
}

export function canResetBoardActionComposerAfterError(error: unknown) {
  return error instanceof HarnessBoardClientError && error.code === "invalid_request";
}

type HarnessBoardActionAttemptSupport = "unavailable" | "missing" | "contract_changed" | "reset_only" | "replay_safe";

type HarnessBoardActionAttemptSupportDescription = {
  label: string;
  summary: string;
};

function getActionAttemptControlValue(requestBody: Record<string, unknown>) {
  if (typeof requestBody.decision === "string") {
    return requestBody.decision;
  }

  if (typeof requestBody.resolution === "string") {
    return requestBody.resolution;
  }

  if (typeof requestBody.command === "string") {
    return requestBody.command;
  }

  return null;
}

export function buildLiveActionRequest(input: {
  requestBody: Record<string, unknown>;
  actionHandle: string;
}) {
  const normalizedRequestBody = normalizeCurrentActionRequestBody(input.requestBody);
  return {
    ...normalizedRequestBody,
    actionHandle: input.actionHandle
  };
}

export function normalizeCurrentActionRequestBody(requestBody: Record<string, unknown>) {
  const {
    actionHandle: _actionHandle,
    actionToken: _actionToken,
    command,
    resolution,
    ...rest
  } = requestBody;

  if (typeof resolution === "string") {
    return {
      ...rest,
      resolution
    };
  }

  if (typeof command === "string") {
    return {
      ...rest,
      resolution: command
    };
  }

  return rest;
}

export function describeActionAttemptSupport(
  support: HarnessBoardActionAttemptSupport,
  noticeLabel: string
): HarnessBoardActionAttemptSupportDescription {
  const normalizedLabel = noticeLabel.toLowerCase();

  switch (support) {
    case "replay_safe":
      return {
        label: "Replay-safe action",
        summary: `${noticeLabel} is still exposed by the current board contract, and the last payload still fits that bounded request shape.`
      };
    case "reset_only":
      return {
        label: "Payload drifted",
        summary: `${noticeLabel} is still exposed by the current board contract, but the last payload for ${normalizedLabel} no longer fits the current request rules.`
      };
    case "contract_changed":
      return {
        label: "Contract changed",
        summary: `${noticeLabel} is still present at this route, but the current board contract issued a newer action handle for it, so replay would push stale operator intent.`
      };
    case "missing":
      return {
        label: "Action removed",
        summary: `${noticeLabel} is no longer exposed by the current board contract, so replay would push stale operator intent.`
      };
    case "unavailable":
      return {
        label: "Board unavailable",
        summary: `The live board contract is not currently available, so ${normalizedLabel} cannot be classified as replay-safe or stale yet.`
      };
  }
}

function actionPayloadMatchesCurrentContract(input: {
  fields:
    | HarnessBoardResponse["pendingApprovals"][number]["requestFields"]
    | NonNullable<NonNullable<HarnessBoardResponse["pendingAttention"]>["requestFields"]>
    | undefined;
  option: HarnessActionOptionView;
  requestBody: Record<string, unknown>;
}) {
  const visibleFields = (input.fields ?? []).filter((field) => fieldAppliesToOption(field, input.option));
  const visibleFieldNames = new Set<string>(visibleFields.map((field) => field.name));
  const optionExampleRequest = (input.option.exampleRequest ?? {}) as Record<string, unknown>;
  const controlFieldNames = new Set<string>(
    ["decision", "resolution", "command"].filter((fieldName) => typeof optionExampleRequest[fieldName] === "string")
  );

  for (const [fieldName, fieldValue] of Object.entries(input.requestBody)) {
    if (controlFieldNames.has(fieldName)) {
      if (fieldValue !== optionExampleRequest[fieldName]) {
        return false;
      }
      continue;
    }

    const field = visibleFields.find((candidate) => candidate.name === fieldName);
    if (!field || typeof fieldValue !== "string") {
      return false;
    }

    const trimmedValue = fieldValue.trim();
    if (!trimmedValue) {
      if (fieldIsRequiredForOption(field, input.option)) {
        return false;
      }
      continue;
    }

    if (field.allowedValues?.length && !field.allowedValues.some((allowedValue) => allowedValue === trimmedValue)) {
      return false;
    }
  }

  for (const field of visibleFields) {
    if (!fieldIsRequiredForOption(field, input.option)) {
      continue;
    }

    const requestValue = input.requestBody[field.name];
    if (typeof requestValue !== "string" || requestValue.trim().length === 0) {
      return false;
    }
  }

  for (const fieldName of Object.keys(optionExampleRequest)) {
    if (!controlFieldNames.has(fieldName) && !visibleFieldNames.has(fieldName)) {
      return false;
    }
  }

  return true;
}

function getBoardActionAttemptSupport(
  board: HarnessBoardResponse | null,
  controlMode: HarnessBoardControlMode,
  attempt: HarnessBoardActionAttempt | null
) : HarnessBoardActionAttemptSupport {
  if (!attempt) {
    return "missing";
  }

  if (!board || controlMode !== "live") {
    return "unavailable";
  }

  const attemptControlValue = getActionAttemptControlValue(attempt.requestBody);
  if (!attemptControlValue) {
    return "missing";
  }

  const matchingAttentionOption =
    board.pendingAttention?.actionPath === attempt.actionPath
    && board.pendingAttention.actionMethod === attempt.actionMethod
    && board.pendingAttention.actionRoute === attempt.actionRoute
      ? board.pendingAttention.actionOptions?.find((option) => option.value === attemptControlValue)
      : undefined;

  if (matchingAttentionOption) {
    if (board.pendingAttention?.actionHandle !== attempt.actionHandle) {
      return "contract_changed";
    }
    return actionPayloadMatchesCurrentContract({
      fields: board.pendingAttention?.requestFields,
      option: matchingAttentionOption,
      requestBody: attempt.requestBody
    })
      ? "replay_safe"
      : "reset_only";
  }

  for (const approval of board.pendingApprovals) {
    if (
      approval.actionPath !== attempt.actionPath
      || approval.actionMethod !== attempt.actionMethod
      || approval.actionRoute !== attempt.actionRoute
    ) {
      continue;
    }

    const matchingOption = approval.actionOptions?.find((option) => option.value === attemptControlValue);
    if (!matchingOption) {
      continue;
    }

    if (approval.actionHandle !== attempt.actionHandle) {
      return "contract_changed";
    }

    return actionPayloadMatchesCurrentContract({
      fields: approval.requestFields,
      option: matchingOption,
      requestBody: attempt.requestBody
    })
      ? "replay_safe"
      : "reset_only";
  }

  return "missing";
}

function decorateActionFeedbackForCurrentContract(
  feedback: HarnessBoardFeedback | null,
  support: HarnessBoardActionAttemptSupport,
  noticeLabel: string | null
) {
  if (!feedback || !noticeLabel) {
    return feedback;
  }

  if (support === "replay_safe" || support === "unavailable") {
    return feedback;
  }

  if (support === "reset_only") {
    return {
      ...feedback,
      recoverySteps: [
        ...feedback.recoverySteps,
        `The current board still supports ${noticeLabel.toLowerCase()}, but the last payload no longer fits the bounded contract. Reset the composer to the current defaults before trying again.`
      ]
    };
  }

  if (support === "contract_changed") {
    return {
      ...feedback,
      recoverySteps: [
        ...feedback.recoverySteps,
        `The current board still exposes ${noticeLabel.toLowerCase()}, but it now carries a newer engine-issued action handle. Reload and choose the refreshed contract action instead of replaying the stale request.`
      ]
    };
  }

  return {
    ...feedback,
    recoverySteps: [
      ...feedback.recoverySteps,
      `The current board no longer exposes ${noticeLabel.toLowerCase()}. Reload or choose a fresh bounded action from the current contract instead of replaying the stale request.`
    ]
  };
}

function renderBoardFeedback(
  title: string,
  feedback: HarnessBoardFeedback | null,
  detail?: ReactNode,
  actions?: ReactNode
) {
  if (!feedback) {
    return null;
  }

  return (
    <section style={styles.panel}>
      <h2 style={styles.panelTitle}>{title}</h2>
      <p style={styles.statusError}>{feedback.message}</p>
      <p style={styles.contractMeta}>{feedback.recoveryTitle}</p>
      <ul style={styles.feedbackList}>
        {feedback.recoverySteps.map((step) => (
          <li key={step} style={styles.feedbackItem}>
            {step}
          </li>
        ))}
      </ul>
      {detail ? <div style={{ display: "grid", gap: "0.45rem" }}>{detail}</div> : null}
      {actions ? <div style={styles.actionButtonRow}>{actions}</div> : null}
    </section>
  );
}

function renderActionAttemptSupportDetail(
  attempt: HarnessBoardActionAttempt | null,
  support: HarnessBoardActionAttemptSupport
) {
  if (!attempt) {
    return null;
  }

  const description = describeActionAttemptSupport(support, attempt.noticeLabel);
  const actionFamily = formatActionRoute(attempt.actionRoute);

  return (
    <div style={{ display: "grid", gap: "0.35rem" }}>
      <p style={styles.contractMeta}>{description.label}</p>
      <p style={styles.actionSummary}>{description.summary}</p>
      {actionFamily ? <p style={styles.actionSummary}>{`Action family: ${actionFamily}`}</p> : null}
      <p style={styles.actionSummary}>{`${attempt.actionMethod} ${attempt.actionPath}`}</p>
    </div>
  );
}

function describeActionReloadNotice(
  attempt: HarnessBoardActionAttempt,
  support: HarnessBoardActionAttemptSupport
) {
  switch (support) {
    case "replay_safe":
      return `Live board re-synced and ${attempt.noticeLabel.toLowerCase()} can be retried safely from the current contract.`;
    case "reset_only":
      return `Live board re-synced and ${attempt.noticeLabel.toLowerCase()} now needs the current contract defaults before trying again.`;
    case "contract_changed":
      return `Live board re-synced and ${attempt.noticeLabel.toLowerCase()} now carries a newer contract token. Re-open it from the refreshed board before submitting again.`;
    case "missing":
      return `Live board re-synced and ${attempt.noticeLabel.toLowerCase()} is no longer available on the current contract.`;
    case "unavailable":
      return "Live board reload did not restore the current harness contract.";
  }
}

function renderCompletionPackage(board: HarnessBoardResponse) {
  const completionPackage = board.completionPackage;
  if (!completionPackage) {
    return null;
  }

  const packagePosture = completionPackage.hasOpenGovernanceItems
    ? "Governance is still shaping the current tenant-facing handoff."
    : "The tenant-facing handoff is clear of open governance items.";

  return (
    <section style={styles.panel}>
      <h2 style={styles.panelTitle}>Completion package</h2>
      <p style={styles.panelBody}>
        {completionPackage.summary ?? "The board is shaping a bounded tenant-facing outcome package."}
      </p>
      <ul style={styles.actionList}>
        <li style={styles.actionItem}>
          <p style={styles.actionMeta}>{completionPackage.status === "done" ? "Package ready" : "Package assembling"}</p>
          <h3 style={styles.actionHeading}>Tenant-facing package state</h3>
          {completionPackage.packageNote ? (
            <p style={styles.actionSummary}>{completionPackage.packageNote}</p>
          ) : null}
          <p style={styles.actionSummary}>{`Deferred approvals: ${completionPackage.deferredApprovalCount}`}</p>
          <p style={styles.actionSummary}>{`Governance items: ${completionPackage.governanceItems.length}`}</p>
          <p style={styles.actionSummary}>{`Deliverables: ${completionPackage.deliverables.length}`}</p>
          <p style={styles.actionSummary}>{`Recommendations: ${completionPackage.recommendations.length}`}</p>
          <p style={styles.actionSummary}>{`Objections: ${completionPackage.objections.length}`}</p>
          <p style={styles.actionSummary}>{packagePosture}</p>
          <p style={styles.actionSummary}>
            {completionPackage.hasOpenGovernanceItems
              ? "Open governance items still shape this package."
              : "No open governance items are shaping this package."}
          </p>
          {completionPackage.recommendations.length > 0 ? (
            <>
              <p style={styles.contractMeta}>Recommendations</p>
              <ul style={styles.fieldList}>
                {completionPackage.recommendations.map((recommendation) => (
                  <li key={recommendation} style={styles.fieldItem}>
                    <p style={styles.optionBody}>{recommendation}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {completionPackage.objections.length > 0 ? (
            <>
              <p style={styles.contractMeta}>Objections</p>
              <ul style={styles.fieldList}>
                {completionPackage.objections.map((objection) => (
                  <li key={objection} style={styles.fieldItem}>
                    <p style={styles.optionBody}>{objection}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </li>
      </ul>
      {completionPackage.governanceItems.length > 0 ? (
        <>
          <p style={{ ...styles.panelTitle, fontSize: "0.95rem", marginTop: "1rem" }}>
            {`Governance items (${completionPackage.governanceItems.length})`}
          </p>
          <ul style={styles.actionList}>
            {completionPackage.governanceItems.map((item) => (
              <li key={item.proposalId} style={styles.actionItem}>
                <p style={styles.actionMeta}>{item.statusLabel}</p>
                <h3 style={styles.actionHeading}>{`${item.persona} · ${item.deliverableLabel}`}</h3>
                {item.policyReasonLabel ? <p style={styles.actionSummary}>{`Policy reason: ${item.policyReasonLabel}`}</p> : null}
                {item.recommendationSummary ? (
                  <p style={styles.actionSummary}>{`Recommendation: ${item.recommendationSummary}`}</p>
                ) : null}
                {item.objectionSummary ? <p style={styles.actionSummary}>{`Objection: ${item.objectionSummary}`}</p> : null}
                {item.nextReviewTrigger ? (
                  <p style={styles.actionSummary}>{`Next review trigger: ${item.nextReviewTrigger}`}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {completionPackage.deliverables.length > 0 ? (
        <>
          <p style={{ ...styles.panelTitle, fontSize: "0.95rem", marginTop: "1rem" }}>
            {`Deliverables (${completionPackage.deliverables.length})`}
          </p>
          <ul style={styles.actionList}>
            {completionPackage.deliverables.map((deliverable) => (
              <li key={deliverable.cardId} style={styles.actionItem}>
                <p style={styles.actionMeta}>{deliverable.deliverableLabel}</p>
                <h3 style={styles.actionHeading}>{`${deliverable.persona} · ${deliverable.title}`}</h3>
                <p style={styles.actionSummary}>{deliverable.outcome}</p>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

export function HarnessBoardPage(props: {
  initialBoard?: HarnessBoardResponse | null;
  initialControlMode?: HarnessBoardControlMode;
  initialPreviewVariantLabel?: string | null;
  initialLoadFeedback?: HarnessBoardFeedback | null;
  initialActionFeedback?: HarnessBoardFeedback | null;
  initialActionAttempt?: HarnessBoardActionAttempt | null;
  initialActionFailureCause?: unknown;
  initialActionDrafts?: Record<string, Record<string, string>>;
  initialContractRefreshNotice?: HarnessBoardContractRefreshFeedback | null;
} = {}) {
  const browserFallbackEnabled = harnessBoardClient.isBrowserFallbackEnabled();
  const fallbackState = browserFallbackEnabled ? harnessBoardClient.getFallbackState() : null;
  const [board, setBoard] = useState(() => props.initialBoard ?? fallbackState?.board ?? null);
  const [controlMode, setControlMode] = useState<HarnessBoardControlMode>(() =>
    props.initialControlMode
      ?? (props.initialBoard ? "preview" : fallbackState?.controlMode ?? "live")
  );
  const [previewVariantLabel, setPreviewVariantLabel] = useState<string | null>(() =>
    props.initialPreviewVariantLabel
      ?? (props.initialBoard ? null : fallbackState?.variantLabel ?? null)
  );
  const [openCardId, setOpenCardId] = useState<string>("");
  const [loadError, setLoadError] = useState<HarnessBoardFeedback | null>(props.initialLoadFeedback ?? null);
  const [actionError, setActionError] = useState<HarnessBoardFeedback | null>(props.initialActionFeedback ?? null);
  const [actionFailureCause, setActionFailureCause] = useState<unknown>(props.initialActionFailureCause ?? null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [contractRefreshNotice, setContractRefreshNotice] = useState<HarnessBoardContractRefreshFeedback | null>(
    props.initialContractRefreshNotice ?? null
  );
  const [lastActionResult, setLastActionResult] = useState<HarnessBoardActionResult | null>(null);
  const [lastActionLabel, setLastActionLabel] = useState<string | null>(null);
  const [actionDrafts, setActionDrafts] = useState<Record<string, Record<string, string>>>(props.initialActionDrafts ?? {});
  const [openActionComposerKeys, setOpenActionComposerKeys] = useState<Record<string, boolean>>({});
  const [submittingActionKey, setSubmittingActionKey] = useState<string | null>(null);
  const [reloadingBoard, setReloadingBoard] = useState(false);
  const [pendingActionAttempt, setPendingActionAttempt] = useState<HarnessBoardActionAttempt | null>(
    props.initialActionAttempt ?? null
  );

  function applyBoardState(
    nextBoard: HarnessBoardResponse,
    preferredCardId?: string | null,
    nextControlMode: HarnessBoardControlMode = "live",
    nextPreviewVariantLabel: string | null = null
  ) {
    setLoadError(null);
    setBoard(nextBoard);
    setControlMode(nextControlMode);
    setPreviewVariantLabel(nextControlMode === "preview" ? nextPreviewVariantLabel : null);
    setActionDrafts((current) => pruneActionDraftsForBoard(nextBoard, current));
    setOpenActionComposerKeys((current) => pruneOpenActionComposerKeysForBoard(nextBoard, current));
    setOpenCardId((current: string) =>
      preferredCardId && nextBoard.cards.some((card) => card.id === preferredCardId)
        ? preferredCardId
        : nextBoard.cards.some((card) => card.id === current)
          ? current
          : ""
    );
  }

  async function reloadBoard(input: {
    actionAttempt?: HarnessBoardActionAttempt | null;
    successNotice?: string | null;
    preserveActionError?: boolean;
  } = {}) {
    setReloadingBoard(true);

    try {
      const nextBoard = await harnessBoardClient.fetchBoard();
      const refreshImpact = inspectBoardContractRefreshImpact(
        nextBoard,
        actionDrafts,
        openActionComposerKeys,
        board
      );
      applyBoardState(nextBoard, null, "live");
      if (!input.preserveActionError) {
        setActionError(null);
        setActionFailureCause(null);
      }
      const derivedNotice = input.actionAttempt
        ? describeActionReloadNotice(
            input.actionAttempt,
            getBoardActionAttemptSupport(nextBoard, "live", input.actionAttempt)
          )
        : null;
      const contractNotice = describeBoardContractRefreshImpact(refreshImpact);
      setContractRefreshNotice((current) => {
        if (contractNotice) {
          return isSameContractRefreshFeedback(current, contractNotice) ? current : contractNotice;
        }

        return current;
      });
      if (input.successNotice || derivedNotice) {
        setActionNotice(input.successNotice ?? derivedNotice);
      }
      return true;
    } catch (error) {
      const resolution = resolveBoardLoadFailure({
        error,
        browserFallbackEnabled,
        fallbackState: browserFallbackEnabled ? harnessBoardClient.getFallbackState() : null
      });

      if (resolution.board && resolution.controlMode) {
        applyBoardState(resolution.board, null, resolution.controlMode, resolution.previewVariantLabel);
        setLoadError(resolution.feedback);
      } else {
        setLoadError(resolution.feedback);
        setBoard(null);
        setOpenCardId("");
      }

      return false;
    } finally {
      setReloadingBoard(false);
    }
  }

  async function performBoardActionAttempt(
    attempt: HarnessBoardActionAttempt,
    input: {
      preserveDraftOnSuccess?: boolean;
    } = {}
  ) {
    setSubmittingActionKey(attempt.actionKey);
    setActionError(null);
    setActionFailureCause(null);
    setActionNotice(null);

    try {
      const actionResult = await harnessBoardClient.submitAction(
        attempt.actionPath,
        buildLiveActionRequest({
          requestBody: attempt.requestBody,
          actionHandle: attempt.actionHandle
        }),
        attempt.actionMethod
      );
      const nextBoard = shouldPollAfterActionResult(actionResult)
        ? await pollBoardAfterActionResult(actionResult)
        : await harnessBoardClient.fetchBoard();
      const preferredCardId = "cardId" in actionResult ? actionResult.cardId : null;
      applyBoardState(nextBoard, preferredCardId, "live");
      if (!input.preserveDraftOnSuccess) {
        resetDraftValues(attempt.actionKey);
      }
      setPendingActionAttempt(null);
      setLastActionResult(actionResult);
      setLastActionLabel(attempt.noticeLabel);
      setActionNotice(describeSubmittedActionResult(actionResult, attempt.noticeLabel));
      setContractRefreshNotice(null);
      setActionFailureCause(null);
      return true;
    } catch (error) {
      setPendingActionAttempt(attempt);
      setActionFailureCause(error);
      setActionError(
        describeBoardActionFeedback(error, {
          actionRoute: attempt.actionRoute,
          actionLabel: attempt.noticeLabel
        })
      );
      if (shouldResyncBoardAfterActionError(error)) {
        await reloadBoard({
          actionAttempt: attempt,
          successNotice: null,
          preserveActionError: true
        });
      }
      return false;
    } finally {
      setSubmittingActionKey(null);
    }
  }

  async function pollBoardAfterActionResult(
    actionResult: Extract<HarnessBoardActionResult, { cardId: string; state: "approved" | "working" }>
  ) {
    let latestBoard = await harnessBoardClient.fetchBoard();
    for (let attemptIndex = 0; attemptIndex < 8; attemptIndex += 1) {
      const latestCard = latestBoard.cards.find((card) => card.id === actionResult.cardId);
      if (!cardMatchesActionState(latestCard, actionResult)) {
        return latestBoard;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_250));
      latestBoard = await harnessBoardClient.fetchBoard();
    }
    return latestBoard;
  }

  useEffect(() => {
    if (props.initialBoard) {
      return;
    }

    let cancelled = false;

    harnessBoardClient
      .fetchBoard()
      .then((nextBoard: HarnessBoardResponse) => {
        if (cancelled) {
          return;
        }
        applyBoardState(nextBoard, null, "live");
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        const resolution = resolveBoardLoadFailure({
          error,
          browserFallbackEnabled,
          fallbackState: browserFallbackEnabled ? harnessBoardClient.getFallbackState() : null
        });

        if (resolution.board && resolution.controlMode) {
          applyBoardState(resolution.board, null, resolution.controlMode, resolution.previewVariantLabel);
          setLoadError(resolution.feedback);
          return;
        }

        setLoadError(resolution.feedback);
        setBoard(null);
        setOpenCardId("");
      });

    return () => {
      cancelled = true;
    };
  }, [props.initialBoard]);

  const cards = board?.cards ?? [];
  const columns = board?.columns ?? [];
  const pendingApprovals = board?.pendingApprovals ?? [];
  const pendingAttention = board?.pendingAttention ?? null;
  const activeCard = cards.find((card) => card.id === openCardId) ?? null;
  const focusCard =
    cards.find((card) => card.lane === "working")
    ?? activeCard
    ?? cards[0]
    ?? null;
  const personaMetrics = useMemo(() => getPersonaMetrics(cards), [cards]);
  const currentFocus = focusCard?.title ?? "Preparing the next move";
  const recentDecisionCount = board?.recentDecisions.length ?? 0;
  const followThroughCount = board?.followThroughItems.length ?? 0;
  const completionPackage = board?.completionPackage;
  const packageState = completionPackage?.status === "done" ? "Ready" : completionPackage ? "Assembling" : "Idle";
  const packageDeliverableCount = completionPackage?.deliverables.length ?? 0;
  const packageGovernanceCount = completionPackage?.governanceItems.length ?? 0;
  const activeLanes = columns.filter((column) => column.cardIds.length > 0);
  const activeLaneTitles = activeLanes.map((column) => column.title);
  const activeLaneSummary = activeLanes.length > 0
    ? `${activeLanes.length} visible lane${activeLanes.length === 1 ? " is" : "s are"} active across ${formatLowercaseList(activeLaneTitles)}.`
    : "No visible lanes are active yet.";
  const nextActionsSummary = describeNextActionsSummary(pendingAttention, pendingApprovals);
  const attentionRecoverySummary = describeAttentionRecoverySummary(pendingAttention);
  const governancePostureSummary = completionPackage
    ? `Package ${packageState.toLowerCase()} with ${packageGovernanceCount} open governance item${packageGovernanceCount === 1 ? "" : "s"} still shaping the handoff.`
    : "No package governance items are shaping the current handoff.";
  const progressSummary = `${packageDeliverableCount} deliverable${packageDeliverableCount === 1 ? " is" : "s are"} packaged, ${followThroughCount} follow-through action${followThroughCount === 1 ? "" : "s"} landed, and ${recentDecisionCount} decision${recentDecisionCount === 1 ? " is" : "s are"} preserved.`;
  const isPreviewMode = controlMode === "preview";
  const liveActionsEnabled = Boolean(board && controlMode === "live");
  const pendingActionAttemptSupport = getBoardActionAttemptSupport(board, controlMode, pendingActionAttempt);
  const canReplayPendingActionAttempt = liveActionsEnabled && pendingActionAttemptSupport === "replay_safe";
  const canResetPendingActionAttempt = liveActionsEnabled && pendingActionAttemptSupport === "reset_only";
  const actionFeedback = decorateActionFeedbackForCurrentContract(
    actionError,
    pendingActionAttemptSupport,
    pendingActionAttempt?.noticeLabel ?? null
  );
  const actionFeedbackDetail = actionError
    ? renderActionAttemptSupportDetail(pendingActionAttempt, pendingActionAttemptSupport)
    : null;
  const lastActionEffect = lastActionResult ? describeActionResultEffect(lastActionResult) : null;
  const boardPulseItems = [
    {
      key: "current-focus",
      heading: "Current focus",
      summary: focusCard
        ? `${focusCard.title} is carrying the clearest live business move right now.`
        : "The board is preparing the next move."
    },
    {
      key: "active-lanes",
      heading: "Active lanes",
      summary: activeLaneSummary
    },
    {
      key: "next-actions",
      heading: "Next actions",
      summary: nextActionsSummary
    },
    ...(attentionRecoverySummary
      ? [
          {
            key: "attention-recovery",
            heading: "Attention recovery",
            summary: attentionRecoverySummary.pulseSummary
          }
        ]
      : []),
    {
      key: "governance-posture",
      heading: "Governance posture",
      summary: governancePostureSummary
    },
    {
      key: "progress",
      heading: "Progress",
      summary: progressSummary
    },
    ...(contractRefreshNotice
      ? [
          {
            key: "contract-refresh",
            heading: joinHeadingParts("Contract refresh", "Active"),
            summary: contractRefreshNotice.affectedActions.length > 0
              ? `${contractRefreshNotice.message} Affected actions: ${contractRefreshNotice.affectedActions.join(", ")}. ${contractRefreshNotice.recoveryTitle}: ${contractRefreshNotice.recoverySteps[0] ?? "Review the current live board contract."}`
              : `${contractRefreshNotice.message} ${contractRefreshNotice.recoveryTitle}: ${contractRefreshNotice.recoverySteps[0] ?? "Review the current live board contract."}`
          }
        ]
      : [])
  ];
  const canReloadLiveBoard = Boolean(board || browserFallbackEnabled);
  const loadFeedbackActions = canReloadLiveBoard ? (
    <button
      type="button"
      style={{
        ...styles.secondaryButton,
        ...(reloadingBoard ? styles.actionButtonDisabled : {})
      }}
      disabled={reloadingBoard}
      onClick={() => {
        void reloadBoard({
          successNotice: "Live board reloaded from the current harness contract."
        });
      }}
    >
      {reloadingBoard ? "Reloading live board..." : "Retry live board load"}
    </button>
  ) : null;
  const actionFeedbackActions = canReloadLiveBoard || (pendingActionAttempt && actionError) ? (
    <>
      {canReloadLiveBoard ? (
        <button
          type="button"
          style={{
            ...styles.secondaryButton,
            ...(reloadingBoard ? styles.actionButtonDisabled : {})
          }}
          disabled={reloadingBoard}
          onClick={() => {
            void reloadBoard({
              actionAttempt: pendingActionAttempt,
              successNotice: pendingActionAttempt
                ? null
                : "Live board reloaded from the current harness contract."
            });
          }}
        >
          {reloadingBoard ? "Reloading live board..." : "Reload live board"}
        </button>
      ) : null}
      {pendingActionAttempt && actionError && canReplayPendingActionAttempt && canRetryBoardActionAfterError(actionFailureCause) ? (
        <button
          type="button"
          style={{
            ...styles.secondaryButton,
            ...(submittingActionKey !== null ? styles.actionButtonDisabled : {})
          }}
          disabled={submittingActionKey !== null}
          onClick={() => {
            void performBoardActionAttempt(pendingActionAttempt, {
              preserveDraftOnSuccess: true
            });
          }}
        >
          {submittingActionKey === pendingActionAttempt.actionKey
            ? "Retrying action..."
            : `Retry ${pendingActionAttempt.noticeLabel}`}
        </button>
      ) : null}
      {pendingActionAttempt && actionError && canResetPendingActionAttempt && canResetBoardActionComposerAfterError(actionFailureCause) ? (
        <button
          type="button"
          style={styles.secondaryButton}
          onClick={() => {
            resetDraftValues(pendingActionAttempt.actionKey);
            setPendingActionAttempt(null);
            setActionError(null);
            setActionFailureCause(null);
            setActionNotice(`Reset ${pendingActionAttempt.noticeLabel.toLowerCase()} to the current contract defaults.`);
          }}
        >
          Reset to current contract defaults
        </button>
      ) : null}
      {pendingActionAttempt
      && actionError
      && (pendingActionAttemptSupport === "missing" || pendingActionAttemptSupport === "unavailable" || pendingActionAttemptSupport === "contract_changed") ? (
        <button
          type="button"
          style={styles.secondaryButton}
          onClick={() => {
            setPendingActionAttempt(null);
            setActionError(null);
            setActionFailureCause(null);
            setActionNotice(
              pendingActionAttemptSupport === "missing"
                ? `Dismissed stale recovery guidance for ${pendingActionAttempt.noticeLabel.toLowerCase()}.`
                : pendingActionAttemptSupport === "contract_changed"
                  ? `Dismissed stale contract guidance for ${pendingActionAttempt.noticeLabel.toLowerCase()}.`
                : `Dismissed recovery guidance for ${pendingActionAttempt.noticeLabel.toLowerCase()}.`
            );
          }}
        >
          {pendingActionAttemptSupport === "missing"
            ? "Dismiss stale action issue"
            : pendingActionAttemptSupport === "contract_changed"
              ? "Dismiss stale contract issue"
              : "Dismiss action issue"}
        </button>
      ) : null}
    </>
  ) : null;

  function setDraftValue(actionKey: string, fieldName: string, value: string) {
    setActionDrafts((current) => ({
      ...current,
      [actionKey]: {
        ...(current[actionKey] ?? {}),
        [fieldName]: value
      }
    }));
  }

  function resetDraftValues(actionKey: string) {
    setActionDrafts((current) => {
      if (!current[actionKey]) {
        return current;
      }

      const nextDrafts = { ...current };
      delete nextDrafts[actionKey];
      return nextDrafts;
    });
  }

  function toggleActionComposer(actionKey: string) {
    setOpenActionComposerKeys((current) => ({
      ...current,
      [actionKey]: !current[actionKey]
    }));
  }

  function isActionComposerOpen(actionKey: string, isRecommended: boolean) {
    const explicit = openActionComposerKeys[actionKey];
    if (typeof explicit === "boolean") {
      return explicit;
    }

    return isRecommended;
  }

  async function handleContractAction(input: {
    actionKey: string;
    actionPath: string;
    actionRoute?: HarnessBoardResponse["pendingApprovals"][number]["actionRoute"] | NonNullable<HarnessBoardResponse["pendingAttention"]>["actionRoute"];
    actionMethod: "POST" | undefined;
    actionHandle: string | undefined;
    exampleRequest: Record<string, unknown> | undefined;
    confirmationLabel: string | undefined;
    noticeLabel: string;
  }) {
    if (!liveActionsEnabled || !input.exampleRequest || !input.actionHandle) {
      return;
    }

    if (
      input.confirmationLabel
      && typeof window !== "undefined"
      && typeof window.confirm === "function"
      && !window.confirm(input.confirmationLabel)
    ) {
      return;
    }

    await performBoardActionAttempt({
      actionKey: input.actionKey,
      actionPath: input.actionPath,
      actionRoute: input.actionRoute,
      actionMethod: input.actionMethod ?? "POST",
      actionHandle: input.actionHandle,
      requestBody: normalizeCurrentActionRequestBody(input.exampleRequest),
      noticeLabel: input.noticeLabel
    });
  }

  function renderLiveRequestFields(input: {
    actionKey: string;
    fields: HarnessActionFieldView[] | undefined;
    option?: HarnessActionOptionView;
  }) {
    if (!input.fields || input.fields.length === 0) {
      return null;
    }

    const visibleFields = input.option
      ? input.fields.filter((field) => fieldAppliesToOption(field, input.option))
      : input.fields;

    if (visibleFields.length === 0) {
      return null;
    }

    return (
      <ul style={styles.fieldList}>
        {visibleFields.map((field) => {
          const assessment = assessContractFieldValue(
            field,
            input.option,
            actionDrafts[input.actionKey]?.[field.name]
          );
          const value = assessment.displayValue;

          return (
            <li key={field.name} style={styles.fieldItem}>
              <p style={styles.fieldTitle}>{field.label}</p>
              {field.description ? <p style={styles.optionBody}>{field.description}</p> : null}
              {field.allowedValues?.length ? (
                <>
                  <select
                    style={styles.formField}
                    value={value}
                    onChange={(event) => setDraftValue(input.actionKey, field.name, event.target.value)}
                  >
                    {value === STALE_SELECT_VALUE ? (
                      <option value={STALE_SELECT_VALUE}>
                        Current draft no longer allowed. Reset recommended.
                      </option>
                    ) : null}
                    {field.allowedValues.map((allowedValue) => (
                      <option key={allowedValue} value={allowedValue}>
                        {allowedValue}
                      </option>
                    ))}
                  </select>
                  {assessment.drifted ? (
                    <p style={styles.statusError}>
                      {`${field.label} no longer matches the allowed values for this live contract field.`}
                    </p>
                  ) : null}
                </>
              ) : field.label === "Resume summary" || field.name === "resumeSummary" || field.name === "resume_summary" ? (
                <>
                  <textarea
                    style={styles.textAreaField}
                    value={value}
                    placeholder={
                      field.suggestedValue
                      ?? "Add the missing business inputs or assumptions that let this lane continue."
                    }
                    onChange={(event) => setDraftValue(input.actionKey, field.name, event.target.value)}
                  />
                  <p style={styles.statusNotice}>
                    Add the concrete tenant-safe context the worker needs before this lane resumes.
                  </p>
                </>
              ) : (
                <input
                  style={styles.formField}
                  type="text"
                  value={value}
                  placeholder={field.suggestedValue ?? field.label}
                  onChange={(event) => setDraftValue(input.actionKey, field.name, event.target.value)}
                />
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  function renderLiveActionComposer(input: {
    actionKey: string;
    fields: HarnessActionFieldView[] | undefined;
    option: HarnessActionOptionView;
    recommendedOptionValue?: string;
  }) {
    const actionState = getContractActionState({
      fields: input.fields,
      option: input.option,
      draftValues: actionDrafts[input.actionKey] ?? {}
    });
    const actionSummary = summarizeContractActionState(actionState);
    const composerOpen = isActionComposerOpen(input.actionKey, input.option.value === input.recommendedOptionValue);

    return (
      <div style={{ display: "grid", gap: "0.45rem" }}>
        <div style={styles.actionButtonRow}>
          <button
            type="button"
            style={styles.tertiaryButton}
            onClick={() => toggleActionComposer(input.actionKey)}
          >
            {composerOpen ? `Hide composer for ${input.option.label}` : `Open composer for ${input.option.label}`}
          </button>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={() => resetDraftValues(input.actionKey)}
          >
            Reset to contract defaults
          </button>
        </div>
        {actionSummary.tone === "needs_input" ? (
          <p style={styles.statusError}>{actionSummary.summary}</p>
        ) : actionSummary.tone === "drifted" ? (
          <p style={styles.statusError}>{actionSummary.summary}</p>
        ) : actionSummary.tone === "defaults" ? (
          <p style={styles.statusNotice}>{actionSummary.summary}</p>
        ) : (
          <p style={styles.statusSuccess}>{actionSummary.summary}</p>
        )}
        {actionState.driftedFields.length > 0 ? (
          <ul style={styles.issueList}>
            {actionState.driftedFields.map((issue) => (
              <li key={`${issue.fieldName}:${issue.reason}`} style={styles.issueItem}>
                {describeContractActionIssue(issue)}
              </li>
            ))}
          </ul>
        ) : null}
        {composerOpen ? (
          <>
            <p style={styles.contractMeta}>{`Live request fields for ${input.option.label}`}</p>
            {renderLiveRequestFields({
              actionKey: input.actionKey,
              fields: actionState.visibleFields,
              option: input.option
            })}
            <p style={styles.contractMeta}>Live payload preview</p>
            <pre style={styles.codeBlock}>{JSON.stringify(actionState.payload, null, 2)}</pre>
          </>
        ) : (
          <p style={styles.contractMeta}>Composer hidden until needed.</p>
        )}
      </div>
    );
  }

  const actionPanelStyles = {
    actionButtonRow: styles.actionButtonRow,
    actionButton: styles.actionButton,
    actionButtonDisabled: styles.actionButtonDisabled,
    actionSummary: styles.actionSummary,
    contractMeta: styles.contractMeta,
    statusNotice: styles.statusNotice
  };

  return (
    <main data-testid="page-board" style={styles.page}>
      <section style={styles.hero}>
        <div>
          <p style={styles.eyebrow}>Harness board</p>
          <h1 style={styles.heroTitle}>Orchestrator board for clean tenant-facing progress</h1>
          <p style={styles.heroSummary}>
            Persona cards stay concise, high-level, and readable. The board shows what each lane is advancing
            without exposing backend mechanics or internal run chatter.
          </p>
        </div>
        <div style={styles.metricGrid}>
          <article style={styles.metricCard}>
            <p style={styles.metricLabel}>Active lanes</p>
            <p style={styles.metricValue}>{activeLanes.length}</p>
            <p style={styles.metricLabel}>{activeLaneSummary}</p>
          </article>
          <article style={styles.metricCard}>
            <p style={styles.metricLabel}>Current focus</p>
            <p style={styles.metricValue}>{currentFocus}</p>
          </article>
          <article style={styles.metricCard}>
            <p style={styles.metricLabel}>Persona workload</p>
            <p style={styles.metricValue}>{personaMetrics.length > 1 ? "Balanced" : "Focused"}</p>
          </article>
          <article style={styles.metricCard}>
            <p style={styles.metricLabel}>CEO approvals</p>
            <p style={styles.metricValue}>{pendingApprovals.length}</p>
          </article>
          <article style={styles.metricCard}>
            <p style={styles.metricLabel}>Control mode</p>
            <p style={styles.metricValue}>{controlMode === "live" ? "Live" : "Preview"}</p>
            {isPreviewMode && previewVariantLabel ? (
              <p style={styles.metricLabel}>{previewVariantLabel}</p>
            ) : null}
          </article>
          <article style={styles.metricCard}>
            <p style={styles.metricLabel}>Governance posture</p>
            <p style={styles.metricValue}>{completionPackage?.hasOpenGovernanceItems ? "Open item" : "Clear"}</p>
            <p style={styles.metricLabel}>{`${packageGovernanceCount} governance item${packageGovernanceCount === 1 ? "" : "s"}`}</p>
          </article>
          <article style={styles.metricCard}>
            <p style={styles.metricLabel}>Progress</p>
            <p style={styles.metricValue}>{packageDeliverableCount}</p>
            <p style={styles.metricLabel}>{`${followThroughCount} follow-through action${followThroughCount === 1 ? "" : "s"} landed`}</p>
          </article>
        </div>
      </section>

      <section style={styles.content}>
        <HarnessBoard
          activeCardId={openCardId}
          cards={cards as HarnessBoardCard[]}
          columns={columns as HarnessBoardColumn[]}
          onCardOpen={setOpenCardId}
        />

        <aside style={styles.rail}>
          {isPreviewMode ? (
            <section style={styles.panel}>
              <h2 style={styles.panelTitle}>Preview mode</h2>
              <p style={styles.panelBody}>
                This board is in preview mode, so action guidance stays visible but live mutations remain disabled.
              </p>
              {previewVariantLabel ? (
                <p style={{ ...styles.contractMeta, marginTop: "0.55rem" }}>{`Preview variant: ${previewVariantLabel}`}</p>
              ) : null}
            </section>
          ) : null}
          <section style={styles.panel}>
            <h2 style={styles.panelTitle}>Board pulse</h2>
            <p style={styles.panelBody}>A bounded launch cockpit summary of focus, lane state, next actions, governance, and progress.</p>
            <ul style={styles.actionList}>
              {boardPulseItems.map((item) => (
                <li key={item.key} style={styles.actionItem}>
                  <h3 style={styles.actionHeading}>{item.heading}</h3>
                  <p style={styles.actionSummary}>{item.summary}</p>
                </li>
              ))}
            </ul>
          </section>

          <section style={styles.panel}>
            <h2 style={styles.panelTitle}>Persona workload</h2>
            <p style={styles.panelBody}>A quick view of which business personas are currently carrying visible work.</p>
            <ul style={styles.personaList}>
              {personaMetrics.map((metric) => (
                <li key={metric.persona} style={styles.personaItem}>
                  <span style={styles.personaName}>{metric.persona}</span>
                  <span style={styles.personaDetail}>{metric.count} card</span>
                </li>
              ))}
            </ul>
            {!board && loadError ? <p style={{ ...styles.panelBody, marginTop: "0.8rem" }}>{loadError.message}</p> : null}
          </section>

          {loadError ? renderBoardFeedback("Board load issue", loadError, undefined, loadFeedbackActions) : null}

          <section style={styles.panel}>
            <h2 style={styles.panelTitle}>CEO approvals</h2>
            <p style={styles.panelBody}>Pending sub-card requests that still need CEO approval before new lanes open.</p>
            <ul style={styles.personaList}>
              {pendingApprovals.length === 0 ? (
                <li style={styles.personaItem}>
                  <span style={styles.personaName}>No pending approvals</span>
                  <span style={styles.personaDetail}>Board is staying bounded</span>
                </li>
              ) : (
                pendingApprovals.map((approval) => (
                  <li key={approval.id} style={styles.personaItem}>
                    <span style={styles.personaName}>{approval.targetPersona}</span>
                    <span style={styles.personaDetail}>{approval.statusLabel}</span>
                  </li>
                ))
              )}
            </ul>
          </section>

          {pendingAttention ? (
            <section style={styles.panel}>
              <h2 style={styles.panelTitle}>Board action</h2>
              <p style={styles.panelBody}>{pendingAttention.summary}</p>
              <ul style={styles.actionList}>
                <li style={styles.actionItem}>
                  <p style={styles.actionMeta}>{pendingAttention.statusLabel}</p>
                  <h3 style={styles.actionHeading}>{pendingAttention.actionLabel ?? "Board action"}</h3>
                  {pendingAttention.actionDescription ? (
                    <p style={styles.actionSummary}>{pendingAttention.actionDescription}</p>
                  ) : null}
                  {pendingAttention.reasonLabel ? (
                    <p style={styles.actionSummary}>{`Reason: ${pendingAttention.reasonLabel}`}</p>
                  ) : null}
                  {pendingAttention.requestedAtLabel ? (
                    <p style={styles.actionSummary}>{`Requested: ${pendingAttention.requestedAtLabel}`}</p>
                  ) : null}
                  {typeof pendingAttention.pendingApprovalCount === "number" ? (
                    <p style={styles.actionSummary}>{`Pending approvals in queue: ${pendingAttention.pendingApprovalCount}`}</p>
                  ) : null}
                  {describeBacklogMode(pendingAttention.backlogMode) ? (
                    <p style={styles.actionSummary}>{`Backlog mode: ${describeBacklogMode(pendingAttention.backlogMode)}`}</p>
                  ) : null}
                  {typeof pendingAttention.proposedApprovalCount === "number" && typeof pendingAttention.deferredApprovalCount === "number" ? (
                    <p style={styles.actionSummary}>{`Queue composition: ${pendingAttention.proposedApprovalCount} proposed, ${pendingAttention.deferredApprovalCount} deferred`}</p>
                  ) : null}
                  {pendingAttention.targetSummary ? (
                    <p style={styles.actionSummary}>{pendingAttention.targetSummary}</p>
                  ) : null}
                  {pendingAttention.targetStatusLabel ? (
                    <p style={styles.actionSummary}>{`Queue target status: ${pendingAttention.targetStatusLabel}`}</p>
                  ) : null}
                  {attentionRecoverySummary ? (
                    <>
                      <p style={styles.actionSummary}>{attentionRecoverySummary.panelSummary}</p>
                      <p style={styles.actionSummary}>{attentionRecoverySummary.safeStep}</p>
                    </>
                  ) : null}
                  <HarnessBoardActionPanel
                    actionHandle={pendingAttention.actionHandle}
                    actionMethod={pendingAttention.actionMethod}
                    actionOptions={pendingAttention.actionOptions}
                    actionPath={pendingAttention.actionPath}
                    actionRoute={pendingAttention.actionRoute}
                    actionRouteLabel={pendingAttention.actionRoute ? (formatActionRoute(pendingAttention.actionRoute) ?? undefined) : undefined}
                    allowedValues={pendingAttention.allowedDecisions ?? pendingAttention.allowedResolutions}
                    allowedValuesLabel={pendingAttention.allowedDecisions ? "Allowed decisions" : "Allowed resolutions"}
                    getOptionButtonLabel={getOptionButtonLabel}
                    liveActionsEnabled={liveActionsEnabled}
                    noticeLabelFallback={pendingAttention.actionLabel ?? "Board action"}
                    onSubmit={handleContractAction}
                    recommendedOptionValue={pendingAttention.recommendedOptionValue}
                    renderActionConstraintSummary={renderActionConstraintSummary}
                    renderActionOptions={renderActionOptions}
                    renderComposer={renderLiveActionComposer}
                    renderRequestFields={renderRequestFields}
                    requestFields={pendingAttention.requestFields}
                    resolveOptionState={(option) => {
                      const actionKey = `attention:${option.value}`;
                      const actionState = getContractActionState({
                        fields: pendingAttention.requestFields,
                        option,
                        draftValues: actionDrafts[actionKey] ?? {}
                      });

                      return {
                        actionKey,
                        disabled:
                          !liveActionsEnabled
                          || !pendingAttention.actionPath
                          || !canSubmitContractActionState(actionState)
                          || submittingActionKey !== null,
                        payload: actionState.payload
                      };
                    }}
                    styles={actionPanelStyles}
                    submittingActionKey={submittingActionKey}
                  />
                </li>
              </ul>
            </section>
          ) : null}

          {pendingApprovals.length > 0 ? (
            <section style={styles.panel}>
              <h2 style={styles.panelTitle}>Approval actions</h2>
              <p style={styles.panelBody}>Bounded decision options coming directly from the harness action contract.</p>
              <ul style={styles.actionList}>
                {pendingApprovals.map((approval: HarnessBoardResponse["pendingApprovals"][number]) => (
                  <li
                    key={approval.id}
                    style={{
                      ...styles.actionItem,
                      ...(pendingAttention?.targetProposalId === approval.id
                        ? {
                            border: "1px solid rgba(125, 211, 252, 0.48)",
                            boxShadow: "0 0 0 1px rgba(125, 211, 252, 0.18)"
                          }
                        : {})
                    }}
                  >
                    <p style={styles.actionMeta}>
                      {pendingAttention?.targetProposalId === approval.id ? `Next queue target · ${approval.statusLabel}` : approval.statusLabel}
                    </p>
                    <h3 style={styles.actionHeading}>{approval.actionLabel}</h3>
                    <p style={styles.actionSummary}>{approval.actionDescription}</p>
                    <p style={styles.actionSummary}>{`Requested by ${approval.requestedByPersona} for ${approval.targetPersona}`}</p>
                    {approval.policyReasonLabel ? (
                      <p style={styles.actionSummary}>{`Policy reason: ${approval.policyReasonLabel}`}</p>
                    ) : null}
                    {approval.nextReviewTrigger ? (
                      <p style={styles.actionSummary}>{`Next review trigger: ${approval.nextReviewTrigger}`}</p>
                    ) : null}
                    {approval.lastDecisionAtLabel ? (
                      <p style={styles.actionSummary}>{`Last decision: ${approval.lastDecisionAtLabel}`}</p>
                    ) : null}
                    {approval.targetSummary ? <p style={styles.actionSummary}>{approval.targetSummary}</p> : null}
                    <HarnessBoardActionPanel
                      actionHandle={approval.actionHandle}
                      actionMethod={approval.actionMethod}
                      actionOptions={approval.actionOptions}
                      actionPath={approval.actionPath}
                      actionRoute={approval.actionRoute}
                      actionRouteLabel={formatActionRoute(approval.actionRoute) ?? undefined}
                      allowedValues={approval.allowedDecisions}
                      allowedValuesLabel="Allowed decisions"
                      getOptionButtonLabel={getOptionButtonLabel}
                      liveActionsEnabled={liveActionsEnabled}
                      noticeLabelFallback={approval.actionLabel ?? undefined}
                      onSubmit={handleContractAction}
                      recommendedOptionValue={approval.recommendedOptionValue}
                      renderActionConstraintSummary={renderActionConstraintSummary}
                      renderActionOptions={renderActionOptions}
                      renderComposer={renderLiveActionComposer}
                      renderRequestFields={renderRequestFields}
                      requestFields={approval.requestFields}
                      resolveOptionState={(option) => {
                        const actionKey = `approval:${approval.id}:${option.value}`;
                        const actionState = getContractActionState({
                          fields: approval.requestFields,
                          option,
                          draftValues: actionDrafts[actionKey] ?? {}
                        });

                        return {
                          actionKey,
                          disabled:
                            !liveActionsEnabled
                            || !approval.actionPath
                            || !canSubmitContractActionState(actionState)
                            || submittingActionKey !== null,
                          payload: actionState.payload
                        };
                      }}
                      styles={actionPanelStyles}
                      submittingActionKey={submittingActionKey}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {board?.recentDecisions.length ? (
            <section style={styles.panel}>
              <h2 style={styles.panelTitle}>Recent decisions</h2>
              <p style={styles.panelBody}>Recent bounded governance decisions preserved from the board contract.</p>
              <p style={styles.contractMeta}>{`${board.recentDecisions.length} preserved decision${board.recentDecisions.length === 1 ? "" : "s"}`}</p>
              <ul style={styles.actionList}>
                {board.recentDecisions.map((decision) => (
                  <li key={decision.id} style={styles.actionItem}>
                    <p style={styles.actionMeta}>{decision.timestampLabel}</p>
                    <h3 style={styles.actionHeading}>{decision.label}</h3>
                    <p style={styles.actionSummary}>{`Decision kind: ${humanizeValue(decision.decisionKind)}`}</p>
                    {decision.resolution ? <p style={styles.actionSummary}>{`Resolution: ${humanizeValue(decision.resolution)}`}</p> : null}
                    {decision.policyReasonLabel ? <p style={styles.actionSummary}>{`Policy reason: ${decision.policyReasonLabel}`}</p> : null}
                    {decision.recommendationSummary ? (
                      <p style={styles.actionSummary}>{`Recommendation: ${decision.recommendationSummary}`}</p>
                    ) : null}
                    {decision.objectionSummary ? <p style={styles.actionSummary}>{`Objection: ${decision.objectionSummary}`}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {board?.followThroughItems.length ? (
            <section style={styles.panel}>
              <h2 style={styles.panelTitle}>Follow-through</h2>
              <p style={styles.panelBody}>Implemented board actions that already made it through the governance seam.</p>
              <p style={styles.contractMeta}>{`${board.followThroughItems.length} implemented action${board.followThroughItems.length === 1 ? "" : "s"}`}</p>
              <ul style={styles.actionList}>
                {board.followThroughItems.map((item) => (
                  <li key={item.id} style={styles.actionItem}>
                    <p style={styles.actionMeta}>{item.timestampLabel}</p>
                    <h3 style={styles.actionHeading}>{item.summary}</h3>
                    <p style={styles.actionSummary}>{`Action: ${humanizeValue(item.action)}`}</p>
                    {item.persona ? <p style={styles.actionSummary}>{`Persona: ${item.persona}`}</p> : null}
                    {item.deliverableLabel ? <p style={styles.actionSummary}>{`Deliverable: ${item.deliverableLabel}`}</p> : null}
                    {item.policyReasonLabel ? <p style={styles.actionSummary}>{`Policy reason: ${item.policyReasonLabel}`}</p> : null}
                    {item.recommendationSummary ? (
                      <p style={styles.actionSummary}>{`Recommendation: ${item.recommendationSummary}`}</p>
                    ) : null}
                    {item.objectionSummary ? <p style={styles.actionSummary}>{`Objection: ${item.objectionSummary}`}</p> : null}
                    {item.nextReviewTrigger ? <p style={styles.actionSummary}>{`Next review: ${item.nextReviewTrigger}`}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {board ? renderCompletionPackage(board) : null}

          {actionNotice ? <p style={styles.statusSuccess}>{actionNotice}</p> : null}
          {contractRefreshNotice ? (
            <div style={{ display: "grid", gap: "0.45rem" }}>
              <p style={styles.actionMeta}>{contractRefreshNotice.title}</p>
              <p style={styles.statusNotice}>{contractRefreshNotice.message}</p>
              {contractRefreshNotice.affectedActions.length > 0 ? (
                <p style={styles.contractMeta}>{`Affected actions: ${contractRefreshNotice.affectedActions.join(", ")}`}</p>
              ) : null}
              <p style={styles.contractMeta}>
                {`Impact counts: drafts ${contractRefreshNotice.impactCounts.removedActionDrafts}, fields ${contractRefreshNotice.impactCounts.removedFieldOverrides}, composers ${contractRefreshNotice.impactCounts.closedComposers}`}
              </p>
              {contractRefreshNotice.recoverySteps.length > 0 ? (
                <>
                  <p style={styles.actionMeta}>{contractRefreshNotice.recoveryTitle}</p>
                  <ul style={styles.feedbackList}>
                    {contractRefreshNotice.recoverySteps.map((step) => (
                      <li key={step} style={{ ...styles.feedbackItem, color: "#fef3c7" }}>
                        {step}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {contractRefreshNotice.details.length > 0 ? (
                <ul style={styles.feedbackList}>
                  {contractRefreshNotice.details.map((detail) => (
                    <li key={detail} style={{ ...styles.feedbackItem, color: "#bae6fd" }}>
                      {detail}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div style={styles.actionButtonRow}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => setContractRefreshNotice(null)}
                >
                  Dismiss contract refresh note
                </button>
              </div>
            </div>
          ) : null}
          {actionError ? renderBoardFeedback("Latest board action issue", actionFeedback, actionFeedbackDetail, actionFeedbackActions) : null}

          {lastActionResult && lastActionLabel ? (
            <section style={styles.panel}>
              <h2 style={styles.panelTitle}>Latest board action</h2>
              <p style={styles.panelBody}>The most recent live harness action and its bounded engine outcome.</p>
              <ul style={styles.actionList}>
                <li style={styles.actionItem}>
                  <p style={styles.actionMeta}>{humanizeValue(lastActionResult.status)}</p>
                  <h3 style={styles.actionHeading}>{lastActionLabel}</h3>
                  <p style={styles.actionSummary}>{describeSubmittedActionResult(lastActionResult, lastActionLabel)}</p>
                  {lastActionEffect ? <p style={styles.actionSummary}>{lastActionEffect}</p> : null}
                  {"cardId" in lastActionResult ? (
                    <p style={styles.contractMeta}>{`Affected lane: ${lastActionResult.cardId}`}</p>
                  ) : null}
                  {"runId" in lastActionResult ? (
                    <p style={styles.contractMeta}>{`Affected run: ${lastActionResult.runId}`}</p>
                  ) : null}
                  {"reopenedProposalCount" in lastActionResult ? (
                    <p style={styles.contractMeta}>{`Deferred items reopened: ${lastActionResult.reopenedProposalCount}`}</p>
                  ) : null}
                </li>
              </ul>
            </section>
          ) : null}

          <HarnessCardDrawer card={activeCard} onClose={() => setOpenCardId("")} open={Boolean(activeCard)} />
        </aside>
      </section>
    </main>
  );
}

export default HarnessBoardPage;
