import { isApprovalState, type ApprovalState } from "./result-approval-types.js";

export const RESULT_APPROVAL_STATES_STORAGE_KEY = "wealth-factory.resultApprovalStates.v1";

export function getBrowserResultApprovalStorage(): Pick<Storage, "getItem" | "setItem"> | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function createDefaultResultApprovalStates(): Record<string, ApprovalState> {
  // These mirror the current shell fixture results until backend-backed result state lands.
  return {
    "result-241": "Awaiting review",
    "result-238": "Revision needed"
  };
}

export function readStoredResultApprovalStates(storage: Pick<Storage, "getItem"> | undefined): Record<string, ApprovalState> {
  if (!storage) {
    return createDefaultResultApprovalStates();
  }

  try {
    const raw = storage.getItem(RESULT_APPROVAL_STATES_STORAGE_KEY);
    if (!raw) {
      return createDefaultResultApprovalStates();
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return createDefaultResultApprovalStates();
    }
    return {
      ...createDefaultResultApprovalStates(),
      ...Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, ApprovalState] => {
          const [key, value] = entry;
          return typeof key === "string" && isApprovalState(value);
        })
      )
    };
  } catch {
    return createDefaultResultApprovalStates();
  }
}

export function mergeResultApprovalStates(input: {
  storedStates: Record<string, ApprovalState>;
  backendStates?: Record<string, ApprovalState>;
}): Record<string, ApprovalState> {
  return {
    ...input.storedStates,
    ...(input.backendStates ?? {})
  };
}

export function writeStoredResultApprovalStates(
  storage: Pick<Storage, "setItem"> | undefined,
  states: Record<string, ApprovalState>
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(RESULT_APPROVAL_STATES_STORAGE_KEY, JSON.stringify(states));
  } catch {
    // Storage is best-effort only; the visible state remains updated in memory.
  }
}
