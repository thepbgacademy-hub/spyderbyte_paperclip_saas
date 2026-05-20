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

  const handleShutdownSignal = () => {
    void consumer.close().then(
      () => runtime.close(),
      async () => {
        await runtime.close();
      }
    ).catch((error) => {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
  };

  process.on("SIGINT", handleShutdownSignal);
  process.on("SIGTERM", handleShutdownSignal);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
