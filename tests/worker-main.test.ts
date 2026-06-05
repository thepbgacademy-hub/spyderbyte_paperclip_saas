import process from "node:process";

import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkerRuntimeClosingError } from "../src/worker/runtime-closing-error.js";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllEnvs();
  process.exitCode = undefined;
});

async function importWorkerMainWithMocks(input?: {
  startPromise?: Promise<void>;
  startError?: Error;
  waitUntilReadyPromise?: Promise<void>;
  waitUntilReadyError?: Error;
  closePromise?: Promise<void>;
  closeError?: Error;
  closeOnError?: Error;
  runtimeClosePromise?: Promise<void>;
  runtimeCloseError?: Error;
}) {
  let consumerOptions:
    | {
        onError?: (error: unknown) => void;
      }
    | undefined;
  const consumerStart = input?.startError
    ? vi.fn().mockImplementation(() => Promise.reject(input.startError))
    : vi.fn().mockReturnValue(input?.startPromise ?? Promise.resolve());
  const consumerWaitUntilReady = input?.waitUntilReadyError
    ? vi.fn().mockImplementation(() => Promise.reject(input.waitUntilReadyError))
    : vi.fn().mockReturnValue(input?.waitUntilReadyPromise ?? Promise.resolve());
  const consumerClose = input?.closeError
    ? vi.fn().mockImplementation(() => Promise.reject(input.closeError))
    : input?.closeOnError
      ? vi.fn().mockImplementation(() => {
          consumerOptions?.onError?.(input.closeOnError);
          return input?.closePromise ?? Promise.resolve();
        })
      : vi.fn().mockReturnValue(input?.closePromise ?? Promise.resolve());
  const runtimeClose = input?.runtimeCloseError
    ? vi.fn().mockImplementation(() => Promise.reject(input.runtimeCloseError))
    : vi.fn().mockReturnValue(input?.runtimeClosePromise ?? Promise.resolve());
  const createWorkerRuntime = vi.fn(() => ({
    processQueuePayload: vi.fn(),
    close: runtimeClose
  }));
  const createBullmqWorkflowConsumer = vi.fn((options: { onError?: (error: unknown) => void }) => {
    consumerOptions = options;
    return {
      start: consumerStart,
      waitUntilReady: consumerWaitUntilReady,
      close: consumerClose
    };
  });

  const signalHandlers = new Map<string, () => void>();
  vi.spyOn(process, "on").mockImplementation(((event: string, handler: () => void) => {
    signalHandlers.set(event, handler);
    return process;
  }) as typeof process.on);
  const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

  vi.doMock("../src/worker/runtime.js", () => ({
    loadWorkerEnv: vi.fn(() => ({
      redisUrl: "redis://localhost:6379",
      workflowQueueName: "wfpc-workflow-runs",
      workerConcurrency: 2
    })),
    createWorkerRuntime
  }));

  vi.doMock("../src/workflows/bullmq-workflow-queue.js", () => ({
    createBullmqWorkflowConsumer
  }));

  vi.stubEnv("WF_WORKER_INSTANCE_ID", "worker-test-main");

  await import("../src/worker/worker-main.js");
  await Promise.resolve();

  return {
    consumerStart,
    consumerWaitUntilReady,
    consumerClose,
    runtimeClose,
    createBullmqWorkflowConsumer,
    createWorkerRuntime,
    signalHandlers,
    stdoutWrite,
    stderrWrite
  };
}

describe("worker main", () => {
  it("installs shutdown handlers before worker readiness completes", async () => {
    const waitUntilReady = createDeferred<void>();

    const { signalHandlers, consumerClose, runtimeClose, stdoutWrite } = await importWorkerMainWithMocks({
      waitUntilReadyPromise: waitUntilReady.promise
    });

    expect(signalHandlers.has("SIGINT")).toBe(true);
    expect(signalHandlers.has("SIGTERM")).toBe(true);

    signalHandlers.get("SIGTERM")?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(consumerClose).toHaveBeenCalledOnce();
    expect(runtimeClose).toHaveBeenCalledOnce();
    expect(
      stdoutWrite.mock.calls.some(([message]) => String(message).includes("wealth_factory_worker_ready"))
    ).toBe(false);

    waitUntilReady.resolve();
    await Promise.resolve();
  });

  it("deduplicates repeated shutdown signals during startup", async () => {
    const waitUntilReady = createDeferred<void>();

    const { signalHandlers, consumerClose, runtimeClose } = await importWorkerMainWithMocks({
      waitUntilReadyPromise: waitUntilReady.promise
    });

    signalHandlers.get("SIGINT")?.();
    signalHandlers.get("SIGTERM")?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(consumerClose).toHaveBeenCalledOnce();
    expect(runtimeClose).toHaveBeenCalledOnce();

    waitUntilReady.resolve();
    await Promise.resolve();
  });

  it("emits the ready banner when startup completes without shutdown", async () => {
    const { stdoutWrite, consumerStart, consumerWaitUntilReady } = await importWorkerMainWithMocks();

    expect(consumerStart).toHaveBeenCalledOnce();
    expect(consumerWaitUntilReady).toHaveBeenCalledOnce();
    expect(stdoutWrite).toHaveBeenCalledWith("wealth_factory_worker_ready\n");
  });

  it("still closes the runtime and logs when consumer shutdown fails", async () => {
    const waitUntilReady = createDeferred<void>();
    const closeFailure = new Error("consumer close failed");

    const { signalHandlers, consumerClose, runtimeClose, stderrWrite } = await importWorkerMainWithMocks({
      waitUntilReadyPromise: waitUntilReady.promise,
      closeError: closeFailure
    });

    signalHandlers.get("SIGINT")?.();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(consumerClose).toHaveBeenCalledOnce();
    expect(runtimeClose).toHaveBeenCalledOnce();
    expect(
      stderrWrite.mock.calls.some(([message]) => String(message).includes("consumer close failed"))
    ).toBe(true);

    waitUntilReady.resolve();
    await Promise.resolve();
  });

  it("shuts down cleanly when startup fails before readiness", async () => {
    const waitUntilReady = createDeferred<void>();
    const startFailure = new Error("worker start failed");

    const { consumerClose, runtimeClose, stderrWrite, stdoutWrite } = await importWorkerMainWithMocks({
      startError: startFailure,
      waitUntilReadyPromise: waitUntilReady.promise
    });

    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(consumerClose).toHaveBeenCalledOnce();
    expect(runtimeClose).toHaveBeenCalledOnce();
    expect(
      stderrWrite.mock.calls.some(([message]) => String(message).includes("worker start failed"))
    ).toBe(true);
    expect(
      stdoutWrite.mock.calls.some(([message]) => String(message).includes("wealth_factory_worker_ready"))
    ).toBe(false);

    waitUntilReady.resolve();
    await Promise.resolve();
  });

  it("logs both consumer and runtime shutdown failures", async () => {
    const waitUntilReady = createDeferred<void>();
    const closeFailure = new Error("consumer close failed");
    const runtimeCloseFailure = new Error("runtime close failed");

    const { signalHandlers, stderrWrite } = await importWorkerMainWithMocks({
      waitUntilReadyPromise: waitUntilReady.promise,
      closeError: closeFailure,
      runtimeCloseError: runtimeCloseFailure
    });

    signalHandlers.get("SIGTERM")?.();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      stderrWrite.mock.calls.some(([message]) => String(message).includes("consumer close failed"))
    ).toBe(true);
    expect(
      stderrWrite.mock.calls.some(([message]) => String(message).includes("runtime close failed"))
    ).toBe(true);

    waitUntilReady.resolve();
    await Promise.resolve();
  });

  it("shuts down cleanly when waitUntilReady rejects before readiness", async () => {
    const readyFailure = new Error("worker readiness failed");

    const { consumerClose, runtimeClose, stderrWrite, stdoutWrite } = await importWorkerMainWithMocks({
      waitUntilReadyError: readyFailure
    });

    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(consumerClose).toHaveBeenCalledOnce();
    expect(runtimeClose).toHaveBeenCalledOnce();
    expect(
      stderrWrite.mock.calls.some(([message]) => String(message).includes("worker readiness failed"))
    ).toBe(true);
    expect(
      stdoutWrite.mock.calls.some(([message]) => String(message).includes("wealth_factory_worker_ready"))
    ).toBe(false);
  });

  it("logs a combined startup failure only once when both startup surfaces reject", async () => {
    const startupFailure = new Error("worker bootstrap failed");

    const {
      consumerClose,
      runtimeClose,
      stderrWrite
    } = await importWorkerMainWithMocks({
      startError: startupFailure,
      waitUntilReadyError: startupFailure
    });

    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(consumerClose).toHaveBeenCalledOnce();
    expect(runtimeClose).toHaveBeenCalledOnce();
    expect(
      stderrWrite.mock.calls.filter(([message]) => String(message).includes("worker bootstrap failed"))
    ).toHaveLength(1);
  });

  it("does not log or fail exit when startup rejects after shutdown was already requested", async () => {
    const startDeferred = createDeferred<void>();
    const waitUntilReady = createDeferred<void>();
    const startFailure = new Error("worker start interrupted by shutdown");

    const { signalHandlers, consumerClose, runtimeClose, stderrWrite } = await importWorkerMainWithMocks({
      startPromise: startDeferred.promise,
      waitUntilReadyPromise: waitUntilReady.promise
    });

    signalHandlers.get("SIGTERM")?.();
    startDeferred.reject(startFailure);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(consumerClose).toHaveBeenCalledOnce();
    expect(runtimeClose).toHaveBeenCalledOnce();
    expect(
      stderrWrite.mock.calls.some(([message]) => String(message).includes("worker start interrupted by shutdown"))
    ).toBe(false);
    expect(process.exitCode).not.toBe(1);

    waitUntilReady.resolve();
    await Promise.resolve();
  });

  it("does not log or fail exit when readiness rejects after shutdown was already requested", async () => {
    const waitUntilReady = createDeferred<void>();
    const readinessFailure = new Error("worker readiness interrupted by shutdown");

    const { signalHandlers, consumerClose, runtimeClose, stderrWrite } = await importWorkerMainWithMocks({
      waitUntilReadyPromise: waitUntilReady.promise
    });

    signalHandlers.get("SIGINT")?.();
    waitUntilReady.reject(readinessFailure);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(consumerClose).toHaveBeenCalledOnce();
    expect(runtimeClose).toHaveBeenCalledOnce();
    expect(
      stderrWrite.mock.calls.some(([message]) => String(message).includes("worker readiness interrupted by shutdown"))
    ).toBe(false);
    expect(process.exitCode).not.toBe(1);
  });

  it("suppresses BullMQ closing-noise errors after shutdown was already requested", async () => {
    const waitUntilReady = createDeferred<void>();

    const {
      signalHandlers,
      createBullmqWorkflowConsumer,
      stderrWrite
    } = await importWorkerMainWithMocks({
      waitUntilReadyPromise: waitUntilReady.promise
    });

    signalHandlers.get("SIGTERM")?.();
    const consumerCall = vi.mocked(createBullmqWorkflowConsumer).mock.calls.at(0) as
      | [{ onError?: (error: unknown) => void }]
      | undefined;
    const onError = consumerCall?.[0].onError;
    onError?.(new WorkerRuntimeClosingError());
    await Promise.resolve();

    expect(
      stderrWrite.mock.calls.some(([message]) => String(message).includes("Worker runtime is closing"))
    ).toBe(false);

    waitUntilReady.resolve();
    await Promise.resolve();
  });

  it("suppresses BullMQ closing-noise errors emitted synchronously during consumer close", async () => {
    const waitUntilReady = createDeferred<void>();

    const {
      signalHandlers,
      stderrWrite
    } = await importWorkerMainWithMocks({
      waitUntilReadyPromise: waitUntilReady.promise,
      closeOnError: new WorkerRuntimeClosingError()
    });

    signalHandlers.get("SIGTERM")?.();
    await Promise.resolve();

    expect(
      stderrWrite.mock.calls.some(([message]) => String(message).includes("Worker runtime is closing"))
    ).toBe(false);

    waitUntilReady.resolve();
    await Promise.resolve();
  });

  it("still logs BullMQ errors after shutdown when the error is not the bounded closing sentinel", async () => {
    const waitUntilReady = createDeferred<void>();

    const {
      signalHandlers,
      createBullmqWorkflowConsumer,
      stderrWrite
    } = await importWorkerMainWithMocks({
      waitUntilReadyPromise: waitUntilReady.promise
    });

    signalHandlers.get("SIGTERM")?.();
    const consumerCall = vi.mocked(createBullmqWorkflowConsumer).mock.calls.at(0) as
      | [{ onError?: (error: unknown) => void }]
      | undefined;
    const onError = consumerCall?.[0].onError;
    onError?.(new Error("bullmq connection dropped during shutdown"));
    await Promise.resolve();

    expect(
      stderrWrite.mock.calls.some(([message]) => String(message).includes("bullmq connection dropped during shutdown"))
    ).toBe(true);

    waitUntilReady.resolve();
    await Promise.resolve();
  });

  it("does not suppress a plain Error that only happens to reuse the closing message", async () => {
    const waitUntilReady = createDeferred<void>();

    const {
      signalHandlers,
      createBullmqWorkflowConsumer,
      stderrWrite
    } = await importWorkerMainWithMocks({
      waitUntilReadyPromise: waitUntilReady.promise
    });

    signalHandlers.get("SIGTERM")?.();
    const consumerCall = vi.mocked(createBullmqWorkflowConsumer).mock.calls.at(0) as
      | [{ onError?: (error: unknown) => void }]
      | undefined;
    const onError = consumerCall?.[0].onError;
    onError?.(new Error("Worker runtime is closing"));
    await Promise.resolve();

    expect(
      stderrWrite.mock.calls.some(([message]) => String(message).includes("Worker runtime is closing"))
    ).toBe(true);

    waitUntilReady.resolve();
    await Promise.resolve();
  });
});
