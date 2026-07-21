import { createHash } from "node:crypto";

import { Queue } from "bullmq";
import { Redis } from "ioredis";

import type { CredentialValidationJob } from "../domain/types.js";
import type { FactoryCredentialRepository } from "../power-sources/factory-credential-repository.js";
import {
  createRepositoryBackedFactoryCredentialValidationQueue,
  type FactoryCredentialValidationQueue
} from "./factory-credential-validation-queue.js";
import { createFactoryCredentialValidationQueueConfig } from "./factory-queue-names.js";

type FactoryCredentialValidationQueueConfigInput = Parameters<
  typeof createFactoryCredentialValidationQueueConfig
>[0];

type BullmqFactoryCredentialValidationQueueOptions = {
  repository: FactoryCredentialRepository;
  redisUrl: string;
  config?: FactoryCredentialValidationQueueConfigInput;
};

export type BullmqFactoryCredentialValidationQueue = FactoryCredentialValidationQueue & {
  close(): Promise<void>;
};

type ValidationQueuePayload = {
  jobId: string;
};

export function createBullmqFactoryCredentialValidationQueue(
  options: BullmqFactoryCredentialValidationQueueOptions
): BullmqFactoryCredentialValidationQueue {
  const config = createFactoryCredentialValidationQueueConfig(options.config);
  const repositoryQueue = createRepositoryBackedFactoryCredentialValidationQueue({
    repository: options.repository,
    config
  });
  const connection = createBullmqConnection(options.redisUrl);
  const queue = new Queue<ValidationQueuePayload>(config.queueName, {
    connection,
    prefix: config.prefix
  });

  return {
    ...repositoryQueue,

    async enqueue(job) {
      const inserted = await options.repository.insertValidationJobIfOpenAbsent(job);
      if (!inserted) {
        return;
      }

      const transportJobId = createBullmqFactoryCredentialValidationJobId(job.id);
      try {
        await queue.add("factory-credential-validation", createValidationQueuePayload(job), {
          jobId: transportJobId
        });
      } catch (error) {
        if (isDuplicateJobError(error)) {
          const observedJob = await queue.getJob(transportJobId);
          if (observedJob) {
            return;
          }
          error = new Error("BullMQ credential validation job was not observable after duplicate enqueue");
        }
        await options.repository.removeValidationJob(job.id);
        throw error;
      }
    },

    async claimNext(input) {
      return repositoryQueue.claimNext(input);
    },

    async claimById(input) {
      return repositoryQueue.claimById(input);
    },

    async complete(job, input) {
      return repositoryQueue.complete(job, input);
    },

    async requeue(job, input) {
      return repositoryQueue.requeue(job, input);
    },

    async hasOpenJob(input) {
      return repositoryQueue.hasOpenJob(input);
    },

    async close() {
      let closeError: unknown;
      try {
        await queue.close();
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

export function createBullmqFactoryCredentialValidationJobId(jobId: string): string {
  return `fcvq_${createHash("sha256").update(jobId).digest("hex")}`;
}

function createValidationQueuePayload(job: CredentialValidationJob): ValidationQueuePayload {
  return {
    jobId: job.id
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
