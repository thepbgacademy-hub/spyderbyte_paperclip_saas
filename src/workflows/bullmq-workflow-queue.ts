import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";

import type { ReserveWorkflowRunInput } from "../db/acid-guard-repository.js";
import { createWorkflowQueuePayload, type WorkflowQueuePayload } from "./queue.js";

type WorkflowQueueConnectionOptions = {
  redisUrl: string;
  queueName: string;
};

export function createBullmqWorkflowRunEnqueuer(options: WorkflowQueueConnectionOptions) {
  const connection = createBullmqConnection(options.redisUrl);
  const queue = new Queue<WorkflowQueuePayload>(options.queueName, {
    connection,
    defaultJobOptions: {
      removeOnComplete: 1_000,
      removeOnFail: 5_000
    }
  });

  return {
    async enqueueOnce(input: ReserveWorkflowRunInput): Promise<"enqueued" | "already_queued"> {
      const payload = createWorkflowQueuePayload({
        tenantId: input.tenantId,
        runId: input.runId,
        workflowId: input.workflowTemplateId,
        createdByUserId: input.userId
      });

      try {
        await queue.add("workflow-run", payload, {
          jobId: payload.idempotencyKey
        });
        return "enqueued";
      } catch (error) {
        if (isDuplicateJobError(error)) {
          return "already_queued";
        }
        throw error;
      }
    },

    async close() {
      await queue.close();
      await connection.quit();
    }
  };
}

export function createBullmqWorkflowConsumer(options: WorkflowQueueConnectionOptions & {
  concurrency: number;
  processPayload(payload: WorkflowQueuePayload): Promise<unknown>;
  onError?: (error: unknown) => void;
  onJobEvent?: (event: "claimed" | "completed" | "failed", details: {
    jobId: string | null;
    payload: WorkflowQueuePayload;
    error?: unknown;
  }) => void;
}) {
  const connection = createBullmqConnection(options.redisUrl);
  const worker = new Worker<WorkflowQueuePayload>(
    options.queueName,
    async (job) => {
      options.onJobEvent?.("claimed", {
        jobId: job.id ?? null,
        payload: job.data
      });

      try {
        const result = await options.processPayload(job.data);
        options.onJobEvent?.("completed", {
          jobId: job.id ?? null,
          payload: job.data
        });
        return result;
      } catch (error) {
        options.onJobEvent?.("failed", {
          jobId: job.id ?? null,
          payload: job.data,
          error
        });
        throw error;
      }
    },
    {
      connection,
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
      await worker.close();
      await connection.quit();
    }
  };
}

function createBullmqConnection(redisUrl: string) {
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null
  });
}

function isDuplicateJobError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /job.+already exists|duplicated job|jobid/i.test(error.message);
}
