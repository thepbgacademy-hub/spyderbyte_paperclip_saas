import process from "node:process";

import { inspectQueueSnapshot } from "./lib/queue-inspection.mjs";
import { loadScriptEnv } from "./lib/script-env.mjs";

const env = loadScriptEnv();

const snapshot = await inspectQueueSnapshot({
  redisUrl: env.REDIS_URL,
  queueName: env.WF_WORKFLOW_QUEUE_NAME?.trim() || "wfpc-workflow-runs"
});

process.stdout.write(
  JSON.stringify(
    {
      observedAt: new Date().toISOString(),
      ...snapshot
    }
  ) + "\n"
);
