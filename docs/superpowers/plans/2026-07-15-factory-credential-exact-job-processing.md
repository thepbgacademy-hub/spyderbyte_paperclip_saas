# Factory Credential Exact Job Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the isolated B34 BullMQ consumer process exactly the validation job referenced by its `{ jobId }` payload without selecting another queued job.

**Architecture:** Keep the repository authoritative. Add one atomic queued-to-processing claim operation keyed by validation job ID, expose it through the existing queue port, and add a job-specific entry point to the validation service. The B34 consumer remains transport-only and receives the service method through dependency injection in a later composition/worker-bootstrap phase.

**Tech Stack:** TypeScript, Vitest, repository-backed queue port, BullMQ transport adapters.

---

### Task 1: Add exact validation-job claiming and processing

**Files:**
- Modify: `src/factory/power-sources/factory-credential-repository.ts`
- Modify: `src/factory/queues/factory-credential-validation-queue.ts`
- Modify: `src/factory/queues/bullmq-factory-credential-validation-queue.ts`
- Modify: `src/factory/power-sources/factory-credential-validation-service.ts`
- Modify: `tests/factory-credential-validation-queue.test.ts`
- Modify: `tests/factory-credential-validation-service.test.ts`
- Modify: `tests/bullmq-factory-credential-validation-queue.test.ts`

- [x] **Step 1: Write failing exact-claim tests**

```ts
const claimed = await queue.claimById({
  jobId: "credential_validation_second",
  now: "2026-07-15T12:01:00.000Z"
});

expect(claimed).toMatchObject({
  id: "credential_validation_second",
  status: "processing"
});
expect(await queue.claimById({ jobId: "missing", now: "2026-07-15T12:02:00.000Z" })).toBeNull();
```

Add a validation-service test that queues two credentials, calls `processValidationJob({ jobId: secondJob.id })`, and proves only the second provider credential is decrypted/validated and completed. Add a non-queued/missing job case that returns `null` without a provider call.

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/factory-credential-validation-queue.test.ts tests/factory-credential-validation-service.test.ts tests/bullmq-factory-credential-validation-queue.test.ts --reporter=dot`

Expected: FAIL because `claimById` and `processValidationJob` do not exist.

- [x] **Step 3: Add the minimal repository and queue contract**

```ts
claimQueuedValidationJobById(input: {
  jobId: string;
  startedAt: string;
}): Promise<CredentialValidationJob | null>;

claimById(input: {
  jobId: string;
  now: string;
}): Promise<CredentialValidationJob | null>;
```

The memory repository may claim only an existing job whose status is `"queued"`; it returns `null` for missing, processing, succeeded, or failed jobs. The repository-backed and BullMQ queue adapters must delegate this contract without contacting BullMQ or changing transport state.

- [x] **Step 4: Add the job-specific service entry point**

```ts
async processValidationJob(input: { jobId: string }) {
  const queued = await validationQueue.claimById({ jobId: input.jobId, now: now() });
  return queued ? processClaimedValidationJob(queued) : null;
}
```

Factor existing post-claim validation logic into one private helper shared with `processNextValidationJob()`. Do not change validation outcomes, retryable requeue behavior, or credential secrecy behavior.

- [x] **Step 5: Run focused tests and compilation**

Run: `npx vitest run tests/factory-credential-validation-queue.test.ts tests/factory-credential-validation-service.test.ts tests/bullmq-factory-credential-validation-queue.test.ts tests/bullmq-factory-credential-validation-consumer.test.ts --reporter=dot`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: PASS.

- [x] **Step 6: Review scope**

Verify that this ticket does not instantiate the B34 consumer, boot a worker, add retry/backoff or scheduling policy, migrate storage, expose an API/UI route, contact a provider outside existing test doubles, or access legacy `wfpc-*` queues.

### Plan Self-Review

- Spec coverage: the plan resolves the exact-job mismatch, preserves repository authority and current validation behavior, and keeps worker runtime wiring deferred.
- Placeholder scan: no deferred implementation placeholders remain in the ticket steps.
- Type consistency: `claimQueuedValidationJobById`, `claimById`, and `processValidationJob` use the same `jobId` identifier across repository, queue, and service layers.
