import { useEffect, useMemo, useState, type CSSProperties } from "react";

import {
  createHarnessBoardClient,
  type HarnessBoardActionResult,
  type HarnessBoardResponse
} from "../harness-board-client.js";
import {
  HarnessBoard,
  type HarnessBoardCard,
  type HarnessBoardColumn
} from "../components/HarnessBoard.js";
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
  } satisfies CSSProperties
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

function getContractFieldSeed(
  field: HarnessActionFieldView,
  option?: HarnessActionOptionView
) {
  if (!option?.exampleRequest) {
    return field.suggestedValue ?? "";
  }

  const seededValue = option.exampleRequest[field.name];
  return typeof seededValue === "string" ? seededValue : field.suggestedValue ?? "";
}

function fieldAppliesToOption(field: HarnessActionFieldView, option?: HarnessActionOptionView) {
  if (!option?.exampleRequest) {
    return !field.supportedWhenValue && !field.requiredWhenValue;
  }

  const optionValue =
    typeof option.exampleRequest.decision === "string"
      ? option.exampleRequest.decision
      : typeof option.exampleRequest.command === "string"
        ? option.exampleRequest.command
        : null;

  if (field.requiredWhenValue) {
    return optionValue === field.requiredWhenValue;
  }

  if (field.supportedWhenValue) {
    return optionValue === field.supportedWhenValue;
  }

  return true;
}

export function buildContractActionPayload(input: {
  fields: HarnessActionFieldView[] | undefined;
  option: HarnessActionOptionView;
  draftValues: Record<string, string>;
}) {
  const payload: Record<string, unknown> = { ...(input.option.exampleRequest ?? {}) };

  if (!input.fields || input.fields.length === 0) {
    return payload;
  }

  for (const field of input.fields) {
    if (!fieldAppliesToOption(field, input.option)) {
      continue;
    }

    const draftValue = input.draftValues[field.name];
    if (typeof draftValue !== "string" || draftValue.trim().length === 0) {
      continue;
    }

    payload[field.name] = draftValue.trim();
  }

  return payload;
}

function renderActionConstraintSummary(input: { allowedValues: readonly string[] | undefined; label: string }) {
  if (!input.allowedValues || input.allowedValues.length === 0) {
    return null;
  }

  return <p style={styles.contractMeta}>{`${input.label}: ${input.allowedValues.join(", ")}`}</p>;
}

function formatActionRoute(route: HarnessBoardResponse["pendingApprovals"][number]["actionRoute"] | NonNullable<NonNullable<HarnessBoardResponse["pendingAttention"]>["actionRoute"]> | undefined) {
  if (!route) {
    return null;
  }

  return route.replace(/-/g, " ");
}

function humanizeValue(value: string) {
  return value.replace(/_/g, " ");
}

function joinHeadingParts(left: string, right: string) {
  return `${left} - ${right}`;
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

export function HarnessBoardPage(props: { initialBoard?: HarnessBoardResponse | null } = {}) {
  const browserFallbackEnabled = harnessBoardClient.isBrowserFallbackEnabled();
  const [board, setBoard] = useState(() => props.initialBoard ?? (browserFallbackEnabled ? harnessBoardClient.getFallback() : null));
  const [openCardId, setOpenCardId] = useState<string>(() =>
    (props.initialBoard ?? (browserFallbackEnabled ? harnessBoardClient.getFallback() : null))?.cards[0]?.id ?? ""
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [lastActionResult, setLastActionResult] = useState<HarnessBoardActionResult | null>(null);
  const [lastActionLabel, setLastActionLabel] = useState<string | null>(null);
  const [actionDrafts, setActionDrafts] = useState<Record<string, Record<string, string>>>({});
  const [submittingActionKey, setSubmittingActionKey] = useState<string | null>(null);

  function applyBoardState(nextBoard: HarnessBoardResponse, preferredCardId?: string | null) {
    setLoadError(null);
    setBoard(nextBoard);
    setOpenCardId((current: string) =>
      preferredCardId && nextBoard.cards.some((card) => card.id === preferredCardId)
        ? preferredCardId
        : nextBoard.cards.some((card) => card.id === current)
          ? current
          : nextBoard.cards[0]?.id || ""
    );
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
        applyBoardState(nextBoard);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        if (browserFallbackEnabled) {
          const fallbackBoard = harnessBoardClient.getFallback();
          applyBoardState(fallbackBoard);
          return;
        }

        setLoadError("Unable to load the harness board right now.");
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
  const personaMetrics = useMemo(() => getPersonaMetrics(cards), [cards]);
  const currentFocus = activeCard?.title ?? cards[0]?.title ?? "Preparing the next move";
  const recentDecisionCount = board?.recentDecisions.length ?? 0;
  const followThroughCount = board?.followThroughItems.length ?? 0;
  const completionPackage = board?.completionPackage;
  const packageState = completionPackage?.status === "done" ? "Ready" : completionPackage ? "Assembling" : "Idle";
  const packageDeliverableCount = completionPackage?.deliverables.length ?? 0;
  const packageGovernanceCount = completionPackage?.governanceItems.length ?? 0;
  const packageRecommendationCount = completionPackage?.recommendations.length ?? 0;
  const packageObjectionCount = completionPackage?.objections.length ?? 0;
  const liveActionsEnabled = Boolean(board && board.runId !== "harness-browser-fallback");
  const lastActionEffect = lastActionResult ? describeActionResultEffect(lastActionResult) : null;
  const boardPulseItems = [
    {
      key: "controls",
      heading: joinHeadingParts("Controls", liveActionsEnabled ? "Live" : "Preview"),
      summary: liveActionsEnabled
        ? "Board actions are bound to live harness mutations through the engine contract."
        : "Board actions stay read-only in localhost fallback mode."
    },
    {
      key: "attention",
      heading: joinHeadingParts("Attention", pendingAttention?.statusLabel ?? "Clear"),
      summary: pendingAttention?.summary ?? "No active board attention is currently waiting on the CEO."
    },
    {
      key: "approvals",
      heading: joinHeadingParts("Approvals", String(pendingApprovals.length)),
      summary:
        pendingApprovals.length > 0
          ? `${pendingApprovals.length} bounded approval request${pendingApprovals.length === 1 ? "" : "s"} still need CEO review.`
          : "No pending approval requests are widening the board."
    },
    {
      key: "package",
      heading: joinHeadingParts("Package", packageState),
      summary: completionPackage
        ? `${packageDeliverableCount} deliverable${packageDeliverableCount === 1 ? "" : "s"}, ${packageGovernanceCount} governance item${packageGovernanceCount === 1 ? "" : "s"}, ${packageRecommendationCount} recommendation${packageRecommendationCount === 1 ? "" : "s"}, ${packageObjectionCount} objection${packageObjectionCount === 1 ? "" : "s"}.`
        : "No tenant-facing package is currently being assembled."
    }
  ];

  function getDraftValue(
    actionKey: string,
    field: HarnessActionFieldView,
    option?: HarnessActionOptionView
  ) {
    return actionDrafts[actionKey]?.[field.name] ?? getContractFieldSeed(field, option);
  }

  function setDraftValue(actionKey: string, fieldName: string, value: string) {
    setActionDrafts((current) => ({
      ...current,
      [actionKey]: {
        ...(current[actionKey] ?? {}),
        [fieldName]: value
      }
    }));
  }

  async function handleContractAction(input: {
    actionKey: string;
    actionPath: string;
    actionMethod: "POST" | undefined;
    exampleRequest: Record<string, unknown> | undefined;
    confirmationLabel: string | undefined;
    noticeLabel: string;
  }) {
    if (!liveActionsEnabled || !input.exampleRequest) {
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

    setSubmittingActionKey(input.actionKey);
    setActionError(null);
    setActionNotice(null);

    try {
      const actionResult = await harnessBoardClient.submitAction(
        input.actionPath,
        input.exampleRequest,
        input.actionMethod ?? "POST"
      );
      const nextBoard = await harnessBoardClient.fetchBoard();
      const preferredCardId = "cardId" in actionResult ? actionResult.cardId : null;
      applyBoardState(nextBoard, preferredCardId);
      setLastActionResult(actionResult);
      setLastActionLabel(input.noticeLabel);
      setActionNotice(describeSubmittedActionResult(actionResult, input.noticeLabel));
    } catch {
      setActionError("Unable to update the live harness board right now.");
    } finally {
      setSubmittingActionKey(null);
    }
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
          const value = getDraftValue(input.actionKey, field, input.option);

          return (
            <li key={field.name} style={styles.fieldItem}>
              <p style={styles.fieldTitle}>{field.label}</p>
              {field.description ? <p style={styles.optionBody}>{field.description}</p> : null}
              {field.allowedValues?.length ? (
                <select
                  style={styles.formField}
                  value={value}
                  onChange={(event) => setDraftValue(input.actionKey, field.name, event.target.value)}
                >
                  {field.allowedValues.map((allowedValue) => (
                    <option key={allowedValue} value={allowedValue}>
                      {allowedValue}
                    </option>
                  ))}
                </select>
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
            <p style={styles.metricLabel}>Active cards</p>
            <p style={styles.metricValue}>{cards.length}</p>
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
            <p style={styles.metricValue}>{liveActionsEnabled ? "Live" : "Preview"}</p>
          </article>
          <article style={styles.metricCard}>
            <p style={styles.metricLabel}>Recent decisions</p>
            <p style={styles.metricValue}>{recentDecisionCount}</p>
          </article>
          <article style={styles.metricCard}>
            <p style={styles.metricLabel}>Follow-through</p>
            <p style={styles.metricValue}>{followThroughCount}</p>
          </article>
          <article style={styles.metricCard}>
            <p style={styles.metricLabel}>Package state</p>
            <p style={styles.metricValue}>{packageState}</p>
            <p style={styles.metricLabel}>{`${packageDeliverableCount} deliverable${packageDeliverableCount === 1 ? "" : "s"}`}</p>
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
          <section style={styles.panel}>
            <h2 style={styles.panelTitle}>Board pulse</h2>
            <p style={styles.panelBody}>A bounded summary of what the board is waiting on, packaging, and carrying forward.</p>
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
            {!board && loadError ? <p style={{ ...styles.panelBody, marginTop: "0.8rem" }}>{loadError}</p> : null}
          </section>

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
                  {pendingAttention.targetSummary ? (
                    <p style={styles.actionSummary}>{pendingAttention.targetSummary}</p>
                  ) : null}
                  {pendingAttention.actionMethod && pendingAttention.actionPath ? (
                    <p style={styles.contractMeta}>{`${pendingAttention.actionMethod} ${pendingAttention.actionPath}`}</p>
                  ) : null}
                  {pendingAttention.actionRoute ? (
                    <p style={styles.contractMeta}>{`Action family: ${formatActionRoute(pendingAttention.actionRoute)}`}</p>
                  ) : null}
                  {renderActionConstraintSummary({
                    allowedValues: pendingAttention.allowedDecisions ?? pendingAttention.allowedCommands,
                    label: pendingAttention.allowedDecisions ? "Allowed decisions" : "Allowed commands"
                  })}
                  {renderRequestFields(pendingAttention.requestFields)}
                  {renderActionOptions(pendingAttention.actionOptions, pendingAttention.recommendedOptionValue)}
                  {pendingAttention.actionOptions?.length ? (
                    <>
                      <div style={styles.actionButtonRow}>
                        {pendingAttention.actionOptions.map((option) => {
                          const actionKey = `attention:${option.value}`;
                          const exampleRequest = buildContractActionPayload({
                            fields: pendingAttention.requestFields,
                            option,
                            draftValues: actionDrafts[actionKey] ?? {}
                          });
                          const disabled =
                            !liveActionsEnabled
                            || !pendingAttention.actionPath
                            || submittingActionKey !== null;

                          return (
                            <button
                              key={option.value}
                              style={{
                                ...styles.actionButton,
                                ...(disabled ? styles.actionButtonDisabled : {})
                              }}
                              type="button"
                              disabled={disabled}
                              onClick={() =>
                                handleContractAction({
                                  actionKey,
                                  actionPath: pendingAttention.actionPath!,
                                  actionMethod: pendingAttention.actionMethod,
                                  exampleRequest,
                                  confirmationLabel: option.requiresConfirmation ? option.confirmationLabel : undefined,
                                  noticeLabel: option.label
                                })}
                            >
                              {submittingActionKey === actionKey ? "Submitting..." : getOptionButtonLabel(option, pendingAttention.recommendedOptionValue)}
                            </button>
                          );
                        })}
                      </div>
                      {pendingAttention.actionOptions.map((option) => {
                        const actionKey = `attention:${option.value}`;
                        return (
                          <div key={`${option.value}-fields`} style={{ display: "grid", gap: "0.45rem" }}>
                            <p style={styles.contractMeta}>{`Live request fields for ${option.label}`}</p>
                            {renderLiveRequestFields({
                              actionKey,
                              fields: pendingAttention.requestFields,
                              option
                            })}
                          </div>
                        );
                      })}
                      {!liveActionsEnabled ? (
                        <p style={styles.statusNotice}>Live board actions are unavailable in localhost fallback mode.</p>
                      ) : null}
                    </>
                  ) : null}
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
                  <li key={approval.id} style={styles.actionItem}>
                    <p style={styles.actionMeta}>{approval.statusLabel}</p>
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
                    <p style={styles.contractMeta}>{`${approval.actionMethod} ${approval.actionPath}`}</p>
                    <p style={styles.contractMeta}>{`Action family: ${formatActionRoute(approval.actionRoute)}`}</p>
                    {renderActionConstraintSummary({
                      allowedValues: approval.allowedDecisions,
                      label: "Allowed decisions"
                    })}
                    {renderRequestFields(approval.requestFields)}
                    {renderActionOptions(approval.actionOptions, approval.recommendedOptionValue)}
                    {approval.actionOptions?.length ? (
                      <>
                        <div style={styles.actionButtonRow}>
                          {approval.actionOptions.map((option) => {
                            const actionKey = `approval:${approval.id}:${option.value}`;
                            const exampleRequest = buildContractActionPayload({
                              fields: approval.requestFields,
                              option,
                              draftValues: actionDrafts[actionKey] ?? {}
                            });
                            const disabled =
                              !liveActionsEnabled
                              || !approval.actionPath
                              || submittingActionKey !== null;

                            return (
                              <button
                                key={option.value}
                                style={{
                                  ...styles.actionButton,
                                  ...(disabled ? styles.actionButtonDisabled : {})
                                }}
                                type="button"
                                disabled={disabled}
                                onClick={() =>
                                  handleContractAction({
                                    actionKey,
                                    actionPath: approval.actionPath,
                                    actionMethod: approval.actionMethod,
                                    exampleRequest,
                                    confirmationLabel: option.requiresConfirmation ? option.confirmationLabel : undefined,
                                    noticeLabel: option.label
                                  })}
                              >
                                {submittingActionKey === actionKey ? "Submitting..." : getOptionButtonLabel(option, approval.recommendedOptionValue)}
                              </button>
                            );
                          })}
                        </div>
                        {approval.actionOptions.map((option) => {
                          const actionKey = `approval:${approval.id}:${option.value}`;
                          return (
                            <div key={`${option.value}-fields`} style={{ display: "grid", gap: "0.45rem" }}>
                              <p style={styles.contractMeta}>{`Live request fields for ${option.label}`}</p>
                              {renderLiveRequestFields({
                                actionKey,
                                fields: approval.requestFields,
                                option
                              })}
                            </div>
                          );
                        })}
                        {!liveActionsEnabled ? (
                          <p style={styles.statusNotice}>Live board actions are unavailable in localhost fallback mode.</p>
                        ) : null}
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {actionNotice ? <p style={styles.statusSuccess}>{actionNotice}</p> : null}
          {actionError ? <p style={styles.statusError}>{actionError}</p> : null}

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
                    {decision.policyReasonLabel ? (
                      <p style={styles.actionSummary}>{`Policy reason: ${decision.policyReasonLabel}`}</p>
                    ) : null}
                    {decision.recommendationSummary ? (
                      <p style={styles.actionSummary}>{`Recommendation: ${decision.recommendationSummary}`}</p>
                    ) : null}
                    {decision.objectionSummary ? (
                      <p style={styles.actionSummary}>{`Objection: ${decision.objectionSummary}`}</p>
                    ) : null}
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
                    {item.deliverableLabel ? (
                      <p style={styles.actionSummary}>{`Deliverable: ${item.deliverableLabel}`}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {board ? renderCompletionPackage(board) : null}

          <HarnessCardDrawer card={activeCard} onClose={() => setOpenCardId("")} open={Boolean(activeCard)} />
        </aside>
      </section>
    </main>
  );
}

export default HarnessBoardPage;
