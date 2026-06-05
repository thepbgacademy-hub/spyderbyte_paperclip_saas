export const WORKER_RUNTIME_CLOSING_MESSAGE = "Worker runtime is closing";
const WORKER_RUNTIME_CLOSING_MARKER = Symbol.for("wfpc.worker_runtime_closing");

export class WorkerRuntimeClosingError extends Error {
  readonly [WORKER_RUNTIME_CLOSING_MARKER] = true;

  constructor(message = WORKER_RUNTIME_CLOSING_MESSAGE) {
    super(message);
    this.name = "WorkerRuntimeClosingError";
  }
}

export function isWorkerRuntimeClosingError(error: unknown): error is WorkerRuntimeClosingError {
  return Boolean(
    error
    && typeof error === "object"
    && WORKER_RUNTIME_CLOSING_MARKER in error
    && (error as Record<PropertyKey, unknown>)[WORKER_RUNTIME_CLOSING_MARKER] === true
  );
}
