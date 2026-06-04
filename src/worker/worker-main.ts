import { hostname } from "node:os";
import process from "node:process";

import { createWorkerRuntime, loadWorkerEnv } from "./runtime.js";
import { createBullmqWorkflowConsumer } from "../workflows/bullmq-workflow-queue.js";

async function main() {
  const env = loadWorkerEnv(process.env);
  const workerInstanceId = process.env.WF_WORKER_INSTANCE_ID?.trim() || `${hostname()}:${process.pid}`;
  const runtime = createWorkerRuntime({ env, workerInstanceId });
  const consumer = createBullmqWorkflowConsumer({
    redisUrl: env.redisUrl,
    queueName: env.workflowQueueName,
    concurrency: env.workerConcurrency,
    processPayload: (payload) => runtime.processQueuePayload(payload),
    onJobEvent: (event, details) => {
      process.stdout.write(
        `${JSON.stringify({
          type: "wealth_factory_worker_claim",
          workerInstanceId,
          observedAt: new Date().toISOString(),
          event,
          jobId: details.jobId,
          tenantId: details.payload.tenantId,
          runId: details.payload.runId,
          workflowId: details.payload.workflowId
        })}\n`
      );
    },
    onError: (error) => {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      process.stderr.write(`${message}\n`);
    }
  });

  const writeError = (error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  };

  let shutdownPromise: Promise<void> | null = null;
  let resolveShutdownRequested!: () => void;
  const shutdownRequested = new Promise<void>((resolve) => {
    resolveShutdownRequested = resolve;
  });
  let resolveStartupFailed!: () => void;
  const startupFailed = new Promise<void>((resolve) => {
    resolveStartupFailed = resolve;
  });
  let startupFailureHandled = false;
  let shutdownRequestedFlag = false;
  const ensureShutdown = ({ markClosing }: { markClosing: boolean }) => {
    shutdownPromise ??= (async () => {
      const shutdownErrors: unknown[] = [];

      try {
        await consumer.close();
      } catch (error) {
        shutdownErrors.push(error);
      }

      try {
        await runtime.close();
      } catch (error) {
        shutdownErrors.push(error);
      }

      for (const error of shutdownErrors) {
        writeError(error);
      }
    })();

    if (markClosing) {
      shutdownRequestedFlag = true;
      resolveShutdownRequested();
    }
    void shutdownPromise;
  };
  const handleShutdownSignal = () => {
    ensureShutdown({ markClosing: true });
  };
  const handleStartupFailure = (error: unknown) => {
    if (startupFailureHandled) {
      return;
    }
    if (shutdownRequestedFlag) {
      startupFailureHandled = true;
      return;
    }
    startupFailureHandled = true;
    writeError(error);
    ensureShutdown({ markClosing: false });
    resolveStartupFailed();
  };

  process.on("SIGINT", handleShutdownSignal);
  process.on("SIGTERM", handleShutdownSignal);

  void consumer.start().catch((error) => {
    handleStartupFailure(error);
  });

  const startupState = await Promise.race([
    consumer.waitUntilReady().then(
      () => "ready" as const,
      (error) => {
        handleStartupFailure(error);
        return "startup_failed" as const;
      }
    ),
    shutdownRequested.then(() => "closing" as const),
    startupFailed.then(() => "startup_failed" as const)
  ]);

  if (startupState !== "ready") {
    await shutdownPromise;
    return;
  }

  process.stdout.write("wealth_factory_worker_ready\n");
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
