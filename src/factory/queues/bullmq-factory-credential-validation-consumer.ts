import { Worker } from "bullmq";
import { Redis } from "ioredis";

import { createFactoryCredentialValidationQueueConfig } from "./factory-queue-names.js";

type FactoryCredentialValidationQueueConfigInput = Parameters<
  typeof createFactoryCredentialValidationQueueConfig
>[0];

type FactoryCredentialValidationPayload = {
  jobId: string;
};

type BullmqFactoryCredentialValidationConsumerOptions = {
  redisUrl: string;
  concurrency: number;
  config?: FactoryCredentialValidationQueueConfigInput;
  processPayload(payload: FactoryCredentialValidationPayload): Promise<unknown>;
  onError?: (error: unknown) => void;
  onJobEvent?: (event: "claimed" | "completed" | "failed", details: {
    jobId: string | null;
    payload: FactoryCredentialValidationPayload;
    error?: unknown;
  }) => void;
};

export function createBullmqFactoryCredentialValidationConsumer(
  options: BullmqFactoryCredentialValidationConsumerOptions
) {
  const config = createFactoryCredentialValidationQueueConfig(options.config);
  const connection = createBullmqConnection(options.redisUrl);
  const worker = new Worker<FactoryCredentialValidationPayload>(
    config.queueName,
    async (job) => {
      const payload = parseFactoryCredentialValidationPayload(job.data);

      options.onJobEvent?.("claimed", {
        jobId: job.id ?? null,
        payload
      });

      try {
        const result = await options.processPayload(payload);
        options.onJobEvent?.("completed", {
          jobId: job.id ?? null,
          payload
        });
        return result;
      } catch (error) {
        options.onJobEvent?.("failed", {
          jobId: job.id ?? null,
          payload,
          error
        });
        throw error;
      }
    },
    {
      connection,
      prefix: config.prefix,
      concurrency: options.concurrency,
      autorun: false
    }
  );

  worker.on("error", (error) => {
    options.onError?.(error);
  });
  worker.on("failed", (_job, error) => {
    options.onError?.(error);
  });

  let runPromise: Promise<void> | null = null;

  return {
    config,

    start() {
      if (runPromise) {
        return runPromise;
      }

      runPromise = worker.run();
      return runPromise;
    },

    waitUntilReady() {
      return worker.waitUntilReady();
    },

    async close() {
      let closeError: unknown;
      try {
        await worker.close();
      } catch (error) {
        closeError = error;
      }
      try {
        await connection.quit();
      } catch (error) {
        closeError ??= error;
      }
      if (closeError) {
        throw closeError;
      }
    }
  };
}

function createBullmqConnection(redisUrl: string) {
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null
  });
}

function parseFactoryCredentialValidationPayload(
  payload: unknown
): FactoryCredentialValidationPayload {
  if (!isFactoryCredentialValidationPayload(payload)) {
    throw new Error(
      "BullMQ factory credential validation job payload must be an object with exactly one non-empty string jobId"
    );
  }

  return payload;
}

function isFactoryCredentialValidationPayload(
  payload: unknown
): payload is FactoryCredentialValidationPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const entries = Object.entries(payload);
  if (entries.length !== 1) {
    return false;
  }

  const [entry] = entries;
  if (!entry) {
    return false;
  }

  const [key, value] = entry;
  return key === "jobId" && typeof value === "string" && value.trim().length > 0;
}
