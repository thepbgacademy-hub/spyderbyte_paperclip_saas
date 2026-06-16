import process from "node:process";

import { Redis } from "ioredis";

import { loadEnv } from "../config/env.js";

export type WorkerHealthcheckDependencies = {
  pingRedis(): Promise<void>;
};

export function createWorkerHealthcheck(dependencies: WorkerHealthcheckDependencies) {
  return async () => {
    await dependencies.pingRedis();
  };
}

async function main() {
  const env = loadEnv(process.env);
  const redis = new Redis(env.redisUrl, {
    maxRetriesPerRequest: 1,
    lazyConnect: true
  });

  const check = createWorkerHealthcheck({
    pingRedis: async () => {
      await redis.connect();
      const pong = await redis.ping();
      if (pong !== "PONG") {
        throw new Error(`Unexpected Redis ping response: ${pong}`);
      }
    }
  });

  try {
    await check();
    process.stdout.write("wealth_factory_worker_healthy\n");
  } finally {
    redis.disconnect();
  }
}

if (isExecutedAsScript(import.meta.url)) {
  main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}

function isExecutedAsScript(moduleUrl: string) {
  const entrypoint = process.argv[1];
  if (!entrypoint) {
    return false;
  }

  return moduleUrl === new URL(`file://${entrypoint.replace(/\\/g, "/")}`).href;
}
