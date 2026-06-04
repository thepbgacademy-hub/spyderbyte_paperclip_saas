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
  void consumer.start().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
  await consumer.waitUntilReady();

  process.stdout.write("wealth_factory_worker_ready\n");

  let shutdownPromise: Promise<void> | null = null;
  const handleShutdownSignal = () => {
    shutdownPromise ??= consumer.close().then(
      () => runtime.close(),
      async () => {
        await runtime.close();
      }
    ).catch((error) => {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
    void shutdownPromise;
  };

  process.on("SIGINT", handleShutdownSignal);
  process.on("SIGTERM", handleShutdownSignal);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
