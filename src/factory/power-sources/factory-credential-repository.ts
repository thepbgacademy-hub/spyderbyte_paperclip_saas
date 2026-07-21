import type { CredentialAccessAuditIntent, CredentialValidationJob, PowerSourceCredential } from "../domain/types.js";

export interface FactoryCredentialRepository {
  insertCredential(credential: PowerSourceCredential): Promise<void>;
  removeCredential(credentialId: string): Promise<void>;
  getCredential(input: { workspaceId: string; credentialId: string }): Promise<PowerSourceCredential | null>;
  listCredentials(input: { workspaceId: string }): Promise<PowerSourceCredential[]>;
  listAllCredentials(): Promise<PowerSourceCredential[]>;
  updateCredential(credential: PowerSourceCredential): Promise<void>;
  insertAccessAuditEvent(event: CredentialAccessAuditIntent): Promise<void>;
  insertValidationJob(job: CredentialValidationJob): Promise<void>;
  insertValidationJobIfOpenAbsent(job: CredentialValidationJob): Promise<boolean>;
  removeValidationJob(jobId: string): Promise<void>;
  /** Atomically transitions one queued job to processing for a single claimant. */
  claimNextQueuedValidationJob(input: { startedAt: string }): Promise<CredentialValidationJob | null>;
  claimQueuedValidationJobById(input: { jobId: string; startedAt: string }): Promise<CredentialValidationJob | null>;
  hasOpenValidationJob(input: { workspaceId: string; credentialId: string; reason?: CredentialValidationJob["reason"] }): Promise<boolean>;
  updateValidationJob(job: CredentialValidationJob): Promise<void>;
}

export function createMemoryFactoryCredentialRepository(): FactoryCredentialRepository & {
  dump(): PowerSourceCredential[];
  dumpAuditEvents(): CredentialAccessAuditIntent[];
  dumpValidationJobs(): CredentialValidationJob[];
  clearValidationJobs(): void;
} {
  const credentials = new Map<string, PowerSourceCredential>();
  const auditEvents: CredentialAccessAuditIntent[] = [];
  const validationJobs = new Map<string, CredentialValidationJob>();

  return {
    async insertCredential(credential) {
      credentials.set(credential.id, credential);
    },

    async removeCredential(credentialId) {
      credentials.delete(credentialId);
    },

    async getCredential(input) {
      const credential = credentials.get(input.credentialId);
      if (!credential || credential.workspaceId !== input.workspaceId) {
        return null;
      }
      return credential;
    },

    async listCredentials(input) {
      return Array.from(credentials.values()).filter((credential) => credential.workspaceId === input.workspaceId);
    },

    async listAllCredentials() {
      return Array.from(credentials.values());
    },

    async updateCredential(credential) {
      credentials.set(credential.id, credential);
    },

    async insertAccessAuditEvent(event) {
      auditEvents.push(event);
    },

    async insertValidationJob(job) {
      validationJobs.set(job.id, job);
    },

    async insertValidationJobIfOpenAbsent(job) {
      const hasOpenJob = Array.from(validationJobs.values()).some(
        (existing) =>
          existing.workspaceId === job.workspaceId &&
          existing.credentialId === job.credentialId &&
          existing.reason === job.reason &&
          (existing.status === "queued" || existing.status === "processing")
      );
      if (hasOpenJob) {
        return false;
      }
      validationJobs.set(job.id, job);
      return true;
    },

    async removeValidationJob(jobId) {
      validationJobs.delete(jobId);
    },

    async claimNextQueuedValidationJob(input) {
      const queued = Array.from(validationJobs.values()).find((job) => job.status === "queued");
      if (!queued) {
        return null;
      }
      const claimed = {
        ...queued,
        status: "processing" as const,
        startedAt: input.startedAt
      };
      validationJobs.set(claimed.id, claimed);
      return claimed;
    },

    async claimQueuedValidationJobById(input) {
      const queued = validationJobs.get(input.jobId);
      if (!queued || queued.status !== "queued") {
        return null;
      }
      const claimed = {
        ...queued,
        status: "processing" as const,
        startedAt: input.startedAt
      };
      validationJobs.set(claimed.id, claimed);
      return claimed;
    },

    async hasOpenValidationJob(input) {
      return Array.from(validationJobs.values()).some(
        (job) =>
          job.workspaceId === input.workspaceId &&
          job.credentialId === input.credentialId &&
          (input.reason ? job.reason === input.reason : true) &&
          (job.status === "queued" || job.status === "processing")
      );
    },

    async updateValidationJob(job) {
      validationJobs.set(job.id, job);
    },

    dump() {
      return Array.from(credentials.values());
    },

    dumpAuditEvents() {
      return [...auditEvents];
    },

    dumpValidationJobs() {
      return Array.from(validationJobs.values());
    },

    clearValidationJobs() {
      validationJobs.clear();
    }
  };
}
