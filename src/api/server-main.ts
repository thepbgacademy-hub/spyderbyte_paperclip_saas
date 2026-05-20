import process from "node:process";

import { closeServerGracefully } from "./server-lifecycle.js";
import { createRuntimeSessionAuth, loadRuntimeSessionAuthEnv } from "./runtime-auth.js";
import { createDashboardRuntime, loadRuntimeEnv } from "./runtime-server.js";
import { loadWorkflowQueueEnv, validatePaperclipLaunchEnv } from "../config/env.js";
import { createBullmqWorkflowRunEnqueuer } from "../workflows/bullmq-workflow-queue.js";

async function main() {
  validatePaperclipLaunchEnv(process.env);
  const queueEnv = loadWorkflowQueueEnv(process.env);
  const env = loadRuntimeEnv(process.env);
  const auth = createRuntimeSessionAuth(loadRuntimeSessionAuthEnv(process.env));
  const queueEnqueuer = createBullmqWorkflowRunEnqueuer({
    redisUrl: queueEnv.redisUrl,
    queueName: queueEnv.workflowQueueName
  });
  const runtime = createDashboardRuntime({ env, auth, workflowQueueEnqueuer: queueEnqueuer });

  runtime.server.listen(env.apiPort, "0.0.0.0", () => {
    process.stdout.write(`wealth_factory_api_listening:${env.apiPort}\n`);
  });
  runtime.startWorkers();

  const shutdown = async () => {
    await closeServerGracefully(runtime.server);
    await runtime.close();
    await queueEnqueuer.close();
  };

  const handleShutdownSignal = () => {
    void shutdown().catch((error) => {
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
