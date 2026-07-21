import { randomBytes } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { createFactoryCredentialService } from "../src/factory/power-sources/factory-credential-service.js";
import { createMemoryFactoryCredentialRepository } from "../src/factory/power-sources/factory-credential-repository.js";
import { createFactoryCredentialValidationService } from "../src/factory/power-sources/factory-credential-validation-service.js";
import { createFactoryCredentialVault } from "../src/factory/power-sources/factory-credential-vault.js";
import type { LLMProvider } from "../src/factory/providers/provider-types.js";
import {
  createRepositoryBackedFactoryCredentialValidationQueue,
  type FactoryCredentialValidationQueue
} from "../src/factory/queues/factory-credential-validation-queue.js";

function harness(input?: {
  now?: string;
  providers?: Partial<Record<LLMProvider["key"], LLMProvider>>;
}) {
  const repository = createMemoryFactoryCredentialRepository();
  const validationQueue = createRepositoryBackedFactoryCredentialValidationQueue({ repository });
  const vault = createFactoryCredentialVault({
    keyring: { current: { version: "v1", masterKey: randomBytes(32).toString("base64") } }
  });
  const credentialService = createFactoryCredentialService({
    repository,
    validationQueue,
    vault,
    now: () => input?.now ?? "2026-07-11T12:00:00.000Z"
  });
  const validationService = createFactoryCredentialValidationService({
    repository,
    validationQueue,
    vault,
    providers: input?.providers ?? {},
    now: () => input?.now ?? "2026-07-11T12:00:00.000Z"
  });
  return { repository, vault, credentialService, validationService };
}

function provider(overrides?: Partial<LLMProvider>): LLMProvider {
  return {
    key: "openai",
    validateCredential: vi.fn().mockResolvedValue({ valid: true }),
    listCapabilities: vi.fn(),
    complete: vi.fn(),
    estimateCost: vi.fn(),
    ...overrides
  } as LLMProvider;
}

describe("factory credential validation service", () => {
  it("creates credentials as pending and enqueues the first validation job without exposing plaintext", async () => {
    const { credentialService, repository } = harness();

    const created = await credentialService.createCredential({
      workspaceId: "workspace_1",
      providerKind: "openai_api",
      label: "Founder OpenAI key",
      secret: { apiKey: "sk-secret-value" }
    });

    expect(created).toMatchObject({
      validationStatus: "pending",
      validationMessage: "Validation is queued.",
      lastValidatedAt: null
    });
    expect(repository.dumpValidationJobs()).toEqual([
      expect.objectContaining({
        workspaceId: "workspace_1",
        credentialId: created.id,
        reason: "credential_created",
        status: "queued"
      })
    ]);
    expect(JSON.stringify(created)).not.toContain("sk-secret-value");
    expect(JSON.stringify(repository.dump())).not.toContain("sk-secret-value");
  });

  it("fails closed before storing credentials when validation queue configuration is legacy-shaped", async () => {
    const repository = createMemoryFactoryCredentialRepository();
    const vault = createFactoryCredentialVault({
      keyring: { current: { version: "v1", masterKey: randomBytes(32).toString("base64") } }
    });

    expect(() =>
      createFactoryCredentialService({
        repository,
        vault,
        validationQueue: createRepositoryBackedFactoryCredentialValidationQueue({
          repository,
          config: { queueName: "wfpc-workflow-runs", prefix: "wealth-factory-blueprint-v1" }
        })
      })
    ).toThrow("Factory queue name must not reuse a legacy queue namespace");
    expect(repository.dump()).toEqual([]);
  });

  it("routes create-time validation jobs through the queue seam instead of bypassing it", async () => {
    const repository = createMemoryFactoryCredentialRepository();
    const vault = createFactoryCredentialVault({
      keyring: { current: { version: "v1", masterKey: randomBytes(32).toString("base64") } }
    });
    const rejectingQueue: FactoryCredentialValidationQueue = {
      config: { queueName: "wealth-factory-validations-v1", prefix: "wealth-factory-blueprint-v1" },
      enqueue: vi.fn().mockRejectedValue(new Error("validation queue unavailable")),
      claimNext: vi.fn(),
      claimById: vi.fn(),
      complete: vi.fn(),
      requeue: vi.fn(),
      hasOpenJob: vi.fn()
    };
    const credentialService = createFactoryCredentialService({
      repository,
      validationQueue: rejectingQueue,
      vault,
      now: () => "2026-07-11T12:00:00.000Z"
    });

    await expect(
      credentialService.createCredential({
        workspaceId: "workspace_1",
        providerKind: "openai_api",
        label: "Founder OpenAI key",
        secret: { apiKey: "sk-secret-value" }
      })
    ).rejects.toThrow("validation queue unavailable");
    expect(rejectingQueue.enqueue).toHaveBeenCalledOnce();
    expect(repository.dump()).toEqual([]);
    expect(repository.dumpValidationJobs()).toEqual([]);
  });

  it("processes validation jobs through the mapped provider and records a valid status", async () => {
    const openai = provider({
      key: "openai",
      validateCredential: vi.fn().mockResolvedValue({ valid: true })
    });
    const { credentialService, repository, validationService } = harness({ providers: { openai } });
    const created = await credentialService.createCredential({
      workspaceId: "workspace_1",
      providerKind: "openai_api",
      label: "Founder OpenAI key",
      secret: { apiKey: "sk-valid-secret" }
    });

    const result = await validationService.processNextValidationJob();

    expect(result).toMatchObject({
      credentialId: created.id,
      validationStatus: "valid",
      validationMessage: "Power Source is connected."
    });
    expect(openai.validateCredential).toHaveBeenCalledWith("sk-valid-secret");
    await expect(credentialService.listCredentials({ workspaceId: "workspace_1" })).resolves.toEqual([
      expect.objectContaining({
        id: created.id,
        validationStatus: "valid",
        validationMessage: "Power Source is connected.",
        lastValidatedAt: "2026-07-11T12:00:00.000Z"
      })
    ]);
    expect(repository.dumpValidationJobs()).toEqual([
      expect.objectContaining({ credentialId: created.id, status: "succeeded" })
    ]);
  });

  it("claims and completes validation jobs through the queue seam", async () => {
    const openai = provider({
      key: "openai",
      validateCredential: vi.fn().mockResolvedValue({ valid: true })
    });
    const { credentialService, repository, vault } = harness({ providers: { openai } });
    const created = await credentialService.createCredential({
      workspaceId: "workspace_1",
      providerKind: "openai_api",
      label: "Founder OpenAI key",
      secret: { apiKey: "sk-valid-secret" }
    });
    const queued = repository.dumpValidationJobs()[0]!;
    repository.clearValidationJobs();
    const validationQueue: FactoryCredentialValidationQueue = {
      config: { queueName: "wealth-factory-validations-v1", prefix: "wealth-factory-blueprint-v1" },
      enqueue: vi.fn(),
      claimNext: vi.fn().mockResolvedValue({
        ...queued,
        status: "processing",
        startedAt: "2026-07-11T12:00:00.000Z"
      }),
      claimById: vi.fn(),
      complete: vi.fn(),
      requeue: vi.fn(),
      hasOpenJob: vi.fn()
    };
    const validationService = createFactoryCredentialValidationService({
      repository,
      validationQueue,
      vault,
      providers: { openai },
      now: () => "2026-07-11T12:00:00.000Z"
    });

    const result = await validationService.processNextValidationJob();

    expect(result).toMatchObject({
      credentialId: created.id,
      validationStatus: "valid",
      validationMessage: "Power Source is connected."
    });
    expect(validationQueue.claimNext).toHaveBeenCalledWith({ now: "2026-07-11T12:00:00.000Z" });
    expect(validationQueue.complete).toHaveBeenCalledWith(
      expect.objectContaining({ credentialId: created.id, status: "processing" }),
      expect.objectContaining({ status: "succeeded", message: "Power Source is connected." })
    );
  });

  it("does not complete claimed jobs when credential state cannot be persisted", async () => {
    const openai = provider({
      key: "openai",
      validateCredential: vi.fn().mockResolvedValue({ valid: true })
    });
    const { credentialService, repository, vault } = harness({ providers: { openai } });
    const created = await credentialService.createCredential({
      workspaceId: "workspace_1",
      providerKind: "openai_api",
      label: "Founder OpenAI key",
      secret: { apiKey: "sk-valid-secret" }
    });
    const claimed = {
      ...repository.dumpValidationJobs()[0]!,
      status: "processing" as const,
      startedAt: "2026-07-11T12:00:00.000Z"
    };
    const validationQueue: FactoryCredentialValidationQueue = {
      config: { queueName: "wealth-factory-validations-v1", prefix: "wealth-factory-blueprint-v1" },
      enqueue: vi.fn(),
      claimNext: vi.fn().mockResolvedValue(claimed),
      claimById: vi.fn(),
      complete: vi.fn(),
      requeue: vi.fn(),
      hasOpenJob: vi.fn()
    };
    const failingRepository = {
      ...repository,
      updateCredential: vi.fn().mockRejectedValue(new Error("credential write unavailable"))
    };
    const validationService = createFactoryCredentialValidationService({
      repository: failingRepository,
      validationQueue,
      vault,
      providers: { openai },
      now: () => "2026-07-11T12:00:00.000Z"
    });

    await expect(validationService.processNextValidationJob()).rejects.toThrow("credential write unavailable");
    expect(validationQueue.complete).not.toHaveBeenCalled();
    await expect(credentialService.listCredentials({ workspaceId: "workspace_1" })).resolves.toEqual([
      expect.objectContaining({
        id: created.id,
        validationStatus: "pending",
        lastValidatedAt: null
      })
    ]);
  });

  it("surfaces queue completion failures without rewriting provider validation outcome", async () => {
    const openai = provider({
      key: "openai",
      validateCredential: vi.fn().mockResolvedValue({ valid: true })
    });
    const { credentialService, repository, vault } = harness({ providers: { openai } });
    const created = await credentialService.createCredential({
      workspaceId: "workspace_1",
      providerKind: "openai_api",
      label: "Founder OpenAI key",
      secret: { apiKey: "sk-valid-secret" }
    });
    const claimed = {
      ...repository.dumpValidationJobs()[0]!,
      status: "processing" as const,
      startedAt: "2026-07-11T12:00:00.000Z"
    };
    const validationQueue: FactoryCredentialValidationQueue = {
      config: { queueName: "wealth-factory-validations-v1", prefix: "wealth-factory-blueprint-v1" },
      enqueue: vi.fn(),
      claimNext: vi.fn().mockResolvedValue(claimed),
      claimById: vi.fn(),
      complete: vi.fn().mockRejectedValue(new Error("queue completion unavailable")),
      requeue: vi.fn(),
      hasOpenJob: vi.fn()
    };
    const validationService = createFactoryCredentialValidationService({
      repository,
      validationQueue,
      vault,
      providers: { openai },
      now: () => "2026-07-11T12:00:00.000Z"
    });

    await expect(validationService.processNextValidationJob()).rejects.toThrow("queue completion unavailable");
    await expect(credentialService.listCredentials({ workspaceId: "workspace_1" })).resolves.toEqual([
      expect.objectContaining({
        id: created.id,
        validationStatus: "valid",
        validationMessage: "Power Source is connected.",
        lastValidatedAt: "2026-07-11T12:00:00.000Z"
      })
    ]);
  });


  it("records friendly invalid status without leaking raw provider errors", async () => {
    const openai = provider({
      key: "openai",
      validateCredential: vi.fn().mockResolvedValue({
        valid: false,
        errorClass: "auth",
        message: "raw provider body contains sk-invalid-secret"
      })
    });
    const { credentialService, validationService } = harness({ providers: { openai } });
    const created = await credentialService.createCredential({
      workspaceId: "workspace_1",
      providerKind: "openai_api",
      label: "Founder OpenAI key",
      secret: { apiKey: "sk-invalid-secret" }
    });

    const result = await validationService.processNextValidationJob();

    expect(result).toMatchObject({
      credentialId: created.id,
      validationStatus: "invalid",
      validationMessage: "Power Source credential was rejected by the provider."
    });
    expect(JSON.stringify(result)).not.toContain("sk-invalid-secret");
    await expect(credentialService.listCredentials({ workspaceId: "workspace_1" })).resolves.toEqual([
      expect.objectContaining({
        id: created.id,
        validationStatus: "invalid",
        validationMessage: "Power Source credential was rejected by the provider."
      })
    ]);
  });

  it("requeues validation jobs without stranding credentials when providers throw", async () => {
    const openai = provider({
      key: "openai",
      validateCredential: vi.fn().mockRejectedValue(new Error("raw provider threw sk-throw-secret"))
    });
    const { credentialService, repository, validationService } = harness({ providers: { openai } });
    const created = await credentialService.createCredential({
      workspaceId: "workspace_1",
      providerKind: "openai_api",
      label: "Founder OpenAI key",
      secret: { apiKey: "sk-throw-secret" }
    });

    await expect(validationService.processNextValidationJob()).resolves.toMatchObject({
      credentialId: created.id,
      validationStatus: "pending",
      validationMessage: "Validation could not complete; it can retry later."
    });

    expect(repository.dumpValidationJobs()).toEqual([
      expect.objectContaining({
        credentialId: created.id,
        status: "queued",
        startedAt: null,
        completedAt: null,
        message: "Validation could not complete; it can retry later."
      })
    ]);
    await expect(credentialService.listCredentials({ workspaceId: "workspace_1" })).resolves.toEqual([
      expect.objectContaining({
        id: created.id,
        validationStatus: "pending",
        validationMessage: "Validation could not complete; it can retry later."
      })
    ]);
    expect(JSON.stringify(repository.dumpValidationJobs())).not.toContain("sk-throw-secret");
  });

  it("preserves previous valid status and validation timestamp on transient validation failures", async () => {
    const openai = provider({
      key: "openai",
      validateCredential: vi.fn().mockResolvedValue({
        valid: false,
        errorClass: "provider_outage",
        message: "provider is unavailable"
      })
    });
    const { credentialService, repository, validationService } = harness({ providers: { openai } });
    const created = await credentialService.createCredential({
      workspaceId: "workspace_1",
      providerKind: "openai_api",
      label: "Founder OpenAI key",
      secret: { apiKey: "sk-valid-before-outage" }
    });
    await repository.updateCredential({
      ...(await repository.getCredential({ workspaceId: "workspace_1", credentialId: created.id }))!,
      validationStatus: "valid",
      validationMessage: "Power Source is connected.",
      lastValidatedAt: "2026-07-01T12:00:00.000Z"
    });

    const result = await validationService.processNextValidationJob();

    expect(result).toMatchObject({
      credentialId: created.id,
      validationStatus: "valid",
      validationMessage: "Validation could not complete; it can retry later."
    });
    await expect(credentialService.listCredentials({ workspaceId: "workspace_1" })).resolves.toEqual([
      expect.objectContaining({
        id: created.id,
        validationStatus: "valid",
        validationMessage: "Validation could not complete; it can retry later.",
        lastValidatedAt: "2026-07-01T12:00:00.000Z"
      })
    ]);
  });

  it("processes only the requested queued validation job by id and leaves other jobs queued", async () => {
    const openai = provider({
      key: "openai",
      validateCredential: vi.fn().mockResolvedValue({ valid: true })
    });
    const { credentialService, repository, validationService } = harness({ providers: { openai } });
    const first = await credentialService.createCredential({
      workspaceId: "workspace_1",
      providerKind: "openai_api",
      label: "First key",
      secret: { apiKey: "sk-first-secret" }
    });
    const second = await credentialService.createCredential({
      workspaceId: "workspace_1",
      providerKind: "openai_api",
      label: "Second key",
      secret: { apiKey: "sk-second-secret" }
    });
    const jobs = repository.dumpValidationJobs();
    const firstJob = jobs.find((job) => job.credentialId === first.id)!;
    const secondJob = jobs.find((job) => job.credentialId === second.id)!;

    const result = await validationService.processValidationJob({ jobId: secondJob.id });

    expect(result).toMatchObject({
      credentialId: second.id,
      validationStatus: "valid",
      validationMessage: "Power Source is connected.",
      lastValidatedAt: "2026-07-11T12:00:00.000Z"
    });
    await expect(credentialService.listCredentials({ workspaceId: "workspace_1" })).resolves.toContainEqual(
      expect.objectContaining({
        id: second.id,
        validationStatus: "valid",
        lastValidatedAt: result?.lastValidatedAt
      })
    );
    expect(openai.validateCredential).toHaveBeenCalledTimes(1);
    expect(openai.validateCredential).toHaveBeenCalledWith("sk-second-secret");
    expect(repository.dumpValidationJobs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: firstJob.id,
          credentialId: first.id,
          status: "queued",
          startedAt: null,
          completedAt: null
        }),
        expect.objectContaining({
          id: secondJob.id,
          credentialId: second.id,
          status: "succeeded"
        })
      ])
    );
  });

  it("returns null without validating a provider when the requested job is missing or nonqueued", async () => {
    const openai = provider({
      key: "openai",
      validateCredential: vi.fn().mockResolvedValue({ valid: true })
    });
    const { credentialService, repository, validationService } = harness({ providers: { openai } });
    const created = await credentialService.createCredential({
      workspaceId: "workspace_1",
      providerKind: "openai_api",
      label: "Founder OpenAI key",
      secret: { apiKey: "sk-valid-secret" }
    });
    const queued = repository.dumpValidationJobs()[0]!;
    await repository.updateValidationJob({
      ...queued,
      status: "processing",
      startedAt: "2026-07-11T12:00:00.000Z"
    });

    await expect(validationService.processValidationJob({ jobId: "missing-job" })).resolves.toBeNull();
    await expect(validationService.processValidationJob({ jobId: queued.id })).resolves.toBeNull();

    expect(openai.validateCredential).not.toHaveBeenCalled();
    await expect(credentialService.listCredentials({ workspaceId: "workspace_1" })).resolves.toEqual([
      expect.objectContaining({
        id: created.id,
        validationStatus: "pending",
        lastValidatedAt: null
      })
    ]);
  });

  it("preserves next-job behavior when processing queued validations without an explicit id", async () => {
    const openai = provider({
      key: "openai",
      validateCredential: vi.fn().mockResolvedValue({ valid: true })
    });
    const { credentialService, repository, validationService } = harness({ providers: { openai } });
    const first = await credentialService.createCredential({
      workspaceId: "workspace_1",
      providerKind: "openai_api",
      label: "First key",
      secret: { apiKey: "sk-first-secret" }
    });
    const second = await credentialService.createCredential({
      workspaceId: "workspace_1",
      providerKind: "openai_api",
      label: "Second key",
      secret: { apiKey: "sk-second-secret" }
    });

    const result = await validationService.processNextValidationJob();

    expect(result).toMatchObject({
      credentialId: first.id,
      validationStatus: "valid"
    });
    expect(openai.validateCredential).toHaveBeenCalledTimes(1);
    expect(repository.dumpValidationJobs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          credentialId: first.id,
          status: "succeeded"
        }),
        expect.objectContaining({
          credentialId: second.id,
          status: "queued"
        })
      ])
    );
  });

  it("queues weekly revalidation only for active valid credentials due for validation", async () => {
    const { credentialService, repository, validationService } = harness({ now: "2026-07-15T12:00:00.000Z" });
    const due = await credentialService.createCredential({
      workspaceId: "workspace_1",
      providerKind: "openai_api",
      label: "Due key",
      secret: { apiKey: "sk-due-secret" }
    });
    const fresh = await credentialService.createCredential({
      workspaceId: "workspace_1",
      providerKind: "anthropic_api",
      label: "Fresh key",
      secret: { apiKey: "sk-fresh-secret" }
    });
    await repository.updateCredential({
      ...(await repository.getCredential({ workspaceId: "workspace_1", credentialId: due.id }))!,
      validationStatus: "valid",
      lastValidatedAt: "2026-07-07T12:00:00.000Z"
    });
    await repository.updateCredential({
      ...(await repository.getCredential({ workspaceId: "workspace_1", credentialId: fresh.id }))!,
      validationStatus: "valid",
      lastValidatedAt: "2026-07-13T12:00:00.000Z"
    });
    repository.clearValidationJobs();

    const queued = await validationService.enqueueWeeklyRevalidationJobs();
    const secondPass = await validationService.enqueueWeeklyRevalidationJobs();

    expect(queued).toEqual([{ workspaceId: "workspace_1", credentialId: due.id }]);
    expect(secondPass).toEqual([]);
    expect(repository.dumpValidationJobs()).toEqual([
      expect.objectContaining({
        workspaceId: "workspace_1",
        credentialId: due.id,
        reason: "weekly_revalidation",
        status: "queued"
      })
    ]);
  });

  it("auto-invalidates credentials on provider auth failures during later run execution", async () => {
    const { credentialService, validationService } = harness({ now: "2026-07-15T12:00:00.000Z" });
    const created = await credentialService.createCredential({
      workspaceId: "workspace_1",
      providerKind: "xai_grok_api",
      label: "Grok key",
      secret: { apiKey: "xai-secret" }
    });

    const result = await validationService.invalidateCredentialAfterAuthFailure({
      workspaceId: "workspace_1",
      credentialId: created.id
    });

    expect(result).toMatchObject({
      credentialId: created.id,
      validationStatus: "invalid",
      validationMessage: "Power Source credential was rejected by the provider.",
      lastValidatedAt: "2026-07-15T12:00:00.000Z"
    });
    await expect(credentialService.listCredentials({ workspaceId: "workspace_1" })).resolves.toEqual([
      expect.objectContaining({
        id: created.id,
        validationStatus: "invalid",
        validationMessage: "Power Source credential was rejected by the provider.",
        lastValidatedAt: "2026-07-15T12:00:00.000Z"
      })
    ]);
  });
});
