import type { RunStatus } from "./types.js";

export const DEFAULT_RUN_STATUS_ORDER: readonly RunStatus[] = [
  "draft",
  "ready",
  "running",
  "waiting_for_input",
  "waiting_for_approval",
  "completed",
  "failed"
];

const TERMINAL_RUN_STATUSES = new Set<RunStatus>(["completed", "failed"]);

export function isTerminalRunStatus(status: RunStatus): boolean {
  return TERMINAL_RUN_STATUSES.has(status);
}
