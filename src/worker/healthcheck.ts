import process from "node:process";

import { Redis } from "ioredis";

import { loadEnv, requiresPaperclipLaunchEnv } from "../config/env.js";
import { createPaperclipClient } from "../paperclip/client.js";

export type WorkerHealthcheckDependencies = {
  pingRedis(): Promise<void>;
  checkPaperclip?(): Promise<boolean>;
  verifyPaperclipAuth?(): Promise<void>;
};

export function createWorkerHealthcheck(dependencies: WorkerHealthcheckDependencies) {
  return async () => {
    await dependencies.pingRedis();

    if (dependencies.checkPaperclip) {
      const paperclip = await dependencies.checkPaperclip();
      if (!paperclip) {
        throw new Error("Paperclip healthcheck returned not ok");
      }
    }

    if (dependencies.verifyPaperclipAuth) {
      await dependencies.verifyPaperclipAuth();
    }
  };
}

async function main() {
  const env = loadEnv(process.env);
  const paperclipRequired = requiresPaperclipLaunchEnv(process.env);
  if (paperclipRequired && (!env.paperclipBaseUrl || !env.paperclipServiceToken)) {
    throw new Error("Paperclip launch env is required for the configured workflow set");
  }
  const redis = new Redis(env.redisUrl, {
    maxRetriesPerRequest: 1,
    lazyConnect: true
  });
  const paperclipClient =
    paperclipRequired && env.paperclipBaseUrl && env.paperclipServiceToken
      ? createPaperclipClient({
          baseUrl: env.paperclipBaseUrl,
          serviceToken: env.paperclipServiceToken
        })
      : null;
  const authProbeCompanyId = process.env.WF_PAPERCLIP_AUTH_PROBE_COMPANY_ID?.trim();

  const check = createWorkerHealthcheck({
    pingRedis: async () => {
      await redis.connect();
      const pong = await redis.ping();
      if (pong !== "PONG") {
        throw new Error(`Unexpected Redis ping response: ${pong}`);
      }
    },
    ...(paperclipClient
      ? {
          checkPaperclip: async () => {
            const health = await paperclipClient.healthCheck();
            return health.ok;
          }
        }
      : {}),
    ...(paperclipClient && authProbeCompanyId
      ? {
          verifyPaperclipAuth: async () => {
            const response = await fetch(`${env.paperclipBaseUrl}/api/companies/${encodeURIComponent(authProbeCompanyId)}/agents`, {
              method: "GET",
              headers: {
                authorization: `Bearer ${env.paperclipServiceToken}`
              }
            });

            if (response.status === 401 || response.status === 403) {
              throw new Error("Paperclip authenticated probe was rejected");
            }

            if (!response.ok) {
              throw new Error(`Paperclip authenticated probe failed with status ${response.status}`);
            }
          }
        }
      : {})
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
