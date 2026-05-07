export type OperatorRouteName =
  | "pauseTenant"
  | "resumeTenant"
  | "inspectJob"
  | "retryJob"
  | "cancelJob"
  | "listDeadLetters"
  | "rotateSecret"
  | "revokeSecret"
  | "disablePaperclip";

export const OPERATOR_ROUTES: readonly OperatorRouteName[] = [
  "pauseTenant",
  "resumeTenant",
  "inspectJob",
  "retryJob",
  "cancelJob",
  "listDeadLetters",
  "rotateSecret",
  "revokeSecret",
  "disablePaperclip"
];
