export const approvalStates = ["Awaiting review", "Approved", "Revision needed"] as const;

export type ApprovalState = (typeof approvalStates)[number];

export function isApprovalState(value: unknown): value is ApprovalState {
  return typeof value === "string" && (approvalStates as readonly string[]).includes(value);
}
