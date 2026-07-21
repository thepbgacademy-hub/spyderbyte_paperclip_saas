import type { CredentialValidationJob } from "../domain/types.js";
import type { FactoryCredentialRepository } from "../power-sources/factory-credential-repository.js";
import { createFactoryCredentialValidationQueueConfig } from "./factory-queue-names.js";

type FactoryCredentialValidationQueueConfigInput = Parameters<
  typeof createFactoryCredentialValidationQueueConfig
>[0];

type ValidationJobCompletionInput = {
  status: Extract<CredentialValidationJob["status"], "succeeded" | "failed">;
  completedAt: string;
  message: string;
};

type ValidationJobRetryInput = {
  requestedAt: string;
  message: string;
};

export interface FactoryCredentialValidationQueue {
  readonly config: ReturnType<typeof createFactoryCredentialValidationQueueConfig>;
  enqueue(job: CredentialValidationJob): Promise<void>;
  claimNext(input: { now: string }): Promise<CredentialValidationJob | null>;
  claimById(input: { jobId: string; now: string }): Promise<CredentialValidationJob | null>;
  complete(job: CredentialValidationJob, input: ValidationJobCompletionInput): Promise<void>;
  requeue(job: CredentialValidationJob, input: ValidationJobRetryInput): Promise<void>;
  hasOpenJob(input: {
    workspaceId: string;
    credentialId: string;
    reason?: CredentialValidationJob["reason"];
  }): Promise<boolean>;
}

export function createRepositoryBackedFactoryCredentialValidationQueue(options: {
  repository: FactoryCredentialRepository;
  config?: FactoryCredentialValidationQueueConfigInput;
}): FactoryCredentialValidationQueue {
  const config = createFactoryCredentialValidationQueueConfig(options.config);

  return {
    config,

    async enqueue(job) {
      await options.repository.insertValidationJobIfOpenAbsent(job);
    },

    async claimNext(input) {
      return options.repository.claimNextQueuedValidationJob({ startedAt: input.now });
    },

    async claimById(input) {
      return options.repository.claimQueuedValidationJobById({
        jobId: input.jobId,
        startedAt: input.now
      });
    },

    async complete(job, input) {
      await options.repository.updateValidationJob({
        ...job,
        status: input.status,
        completedAt: input.completedAt,
        message: input.message
      });
    },

    async requeue(job, input) {
      await options.repository.updateValidationJob({
        ...job,
        status: "queued",
        requestedAt: input.requestedAt,
        startedAt: null,
        completedAt: null,
        message: input.message
      });
    },

    async hasOpenJob(input) {
      return options.repository.hasOpenValidationJob(input);
    }
  };
}
