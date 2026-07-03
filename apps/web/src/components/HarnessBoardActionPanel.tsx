import type { CSSProperties, ReactNode } from "react";

import type { HarnessBoardResponse } from "../harness-board-client.js";

type ApprovalItem = HarnessBoardResponse["pendingApprovals"][number];
type PendingAttentionItem = NonNullable<HarnessBoardResponse["pendingAttention"]>;
type ActionOption = NonNullable<ApprovalItem["actionOptions"]>[number] | NonNullable<PendingAttentionItem["actionOptions"]>[number];
type ActionField = NonNullable<ApprovalItem["requestFields"]>[number] | NonNullable<PendingAttentionItem["requestFields"]>[number];
type ActionRoute = ApprovalItem["actionRoute"] | PendingAttentionItem["actionRoute"];

type ActionOptionState = {
  actionKey: string;
  disabled: boolean;
  payload: Record<string, unknown>;
};

type ActionPanelStyles = {
  actionButtonRow: CSSProperties;
  actionButton: CSSProperties;
  recommendedActionButton: CSSProperties;
  actionButtonDisabled: CSSProperties;
  actionSummary: CSSProperties;
  contractMeta: CSSProperties;
  statusNotice: CSSProperties;
};

export function HarnessBoardActionPanel(props: {
  actionHandle: string | undefined;
  actionMethod: "POST" | undefined;
  actionOptions: ActionOption[] | undefined;
  actionPath: string | undefined;
  actionRoute: ActionRoute | undefined;
  actionRouteLabel: string | undefined;
  allowedValues: readonly string[] | undefined;
  allowedValuesLabel: string;
  getOptionButtonLabel: (option: ActionOption, recommendedOptionValue?: string) => string;
  liveActionsEnabled: boolean;
  noticeLabelFallback: string | undefined;
  onSubmit: (input: {
    actionHandle: string | undefined;
    actionKey: string;
    actionMethod: "POST" | undefined;
    actionPath: string;
    actionRoute: ActionRoute | undefined;
    confirmationLabel: string | undefined;
    exampleRequest: Record<string, unknown> | undefined;
    noticeLabel: string;
  }) => void;
  recommendedOptionValue: string | undefined;
  renderActionConstraintSummary: (input: { allowedValues: readonly string[] | undefined; label: string }) => ReactNode;
  renderActionOptions: (options: ActionOption[] | undefined, recommendedOptionValue?: string) => ReactNode;
  renderComposer: (input: { actionKey: string; fields: ActionField[] | undefined; option: ActionOption; recommendedOptionValue?: string }) => ReactNode;
  renderRequestFields: (fields: ActionField[] | undefined) => ReactNode;
  requestFields: ActionField[] | undefined;
  resolveOptionState: (option: ActionOption) => ActionOptionState;
  styles: ActionPanelStyles;
  submittingActionKey: string | null;
}) {
  const {
    actionHandle,
    actionMethod,
    actionOptions,
    actionPath,
    actionRoute,
    actionRouteLabel,
    allowedValues,
    allowedValuesLabel,
    getOptionButtonLabel,
    liveActionsEnabled,
    noticeLabelFallback,
    onSubmit,
    recommendedOptionValue,
    renderActionConstraintSummary,
    renderActionOptions,
    renderComposer,
    renderRequestFields,
    requestFields,
    resolveOptionState,
    styles,
    submittingActionKey
  } = props;

  return (
    <>
      {actionMethod && actionPath ? (
        <p style={styles.contractMeta}>{`${actionMethod} ${actionPath}`}</p>
      ) : null}
      {actionRouteLabel ? (
        <p style={styles.contractMeta}>{`Action family: ${actionRouteLabel}`}</p>
      ) : null}
      {renderActionConstraintSummary({
        allowedValues,
        label: allowedValuesLabel
      })}
      {renderRequestFields(requestFields)}
      {renderActionOptions(actionOptions, recommendedOptionValue)}
      {actionOptions?.length ? (
        <>
          <div style={styles.actionButtonRow}>
            {actionOptions.map((option) => {
              const optionState = resolveOptionState(option);
              const isRecommended = option.value === recommendedOptionValue;

              return (
                <button
                  key={option.value}
                  style={{
                    ...styles.actionButton,
                    ...(isRecommended ? styles.recommendedActionButton : {}),
                    ...(optionState.disabled ? styles.actionButtonDisabled : {})
                  }}
                  type="button"
                  aria-label={isRecommended ? `${getOptionButtonLabel(option, recommendedOptionValue)} primary action` : undefined}
                  title={optionState.disabled ? "This action is waiting for the current board contract fields before it can submit." : undefined}
                  disabled={optionState.disabled}
                  onClick={() =>
                    actionPath
                      ? onSubmit({
                          actionKey: optionState.actionKey,
                          actionPath,
                          actionRoute,
                          actionMethod,
                          actionHandle,
                          exampleRequest: optionState.payload,
                          confirmationLabel: option.requiresConfirmation ? option.confirmationLabel : undefined,
                          noticeLabel: option.label || noticeLabelFallback || "Board action"
                        })
                      : undefined
                  }
                >
                  {submittingActionKey === optionState.actionKey
                    ? "Submitting..."
                    : getOptionButtonLabel(option, recommendedOptionValue)}
                </button>
              );
            })}
          </div>
          {actionOptions.map((option) => {
            const optionState = resolveOptionState(option);

            return (
              <div key={`${option.value}-fields`} style={{ display: "grid", gap: "0.45rem" }}>
                {renderComposer({
                  actionKey: optionState.actionKey,
                  fields: requestFields,
                  option,
                  ...(typeof recommendedOptionValue === "string" ? { recommendedOptionValue } : {})
                })}
              </div>
            );
          })}
          {!liveActionsEnabled ? (
            <p style={styles.statusNotice}>Live board actions are unavailable in preview mode.</p>
          ) : null}
        </>
      ) : null}
    </>
  );
}

export default HarnessBoardActionPanel;
