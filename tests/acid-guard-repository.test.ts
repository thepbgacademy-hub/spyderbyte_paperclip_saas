import { describe, expect, it, vi } from "vitest";

import { createAcidGuardRepository } from "../src/db/acid-guard-repository.js";

function createSequencedClient(rows: unknown[][]) {
  const query = vi.fn().mockImplementation((_sql: string, _values: readonly unknown[]) => {
    if (/^(begin|commit|rollback)$/i.test(String(_sql))) {
      return Promise.resolve({ rows: [] });
    }
    return Promise.resolve({ rows: rows.shift() ?? [] });
  });
  return { query };
}

function createTransactionRunner(client: ReturnType<typeof createSequencedClient>) {
  return {
    withTransaction: vi.fn().mockImplementation(async (callback: (transaction: typeof client) => Promise<unknown>) => {
      await client.query("begin", []);
      try {
        const result = await callback(client);
        await client.query("commit", []);
        return result;
      } catch (error) {
        await client.query("rollback", []);
        throw error;
      }
    })
  };
}

describe("ACID guard repository", () => {
  it("reserves a workflow run inside one transaction with locked tenant and idempotency insert", async () => {
    const client = createSequencedClient([
      [{ paused_at: null }],
      [{ tenant_id: "tenant-1" }],
      [{ id: "workflow-1", package_id: "package-1", provider_kind: "openai_api" }],
      [{ id: "install-1", package_id: "package-1" }],
      [{ id: "requirement-1", capability: "text_generation" }],
      [{ id: "secret-1", secret_ref: "wf_secret_openai", label: "Primary OpenAI", metadata: { projectId: "proj_123" } }],
      [{ id: "reservation-1" }],
      []
    ]);
    const runner = createTransactionRunner(client);
    const repository = createAcidGuardRepository(runner);

    await expect(
      repository.reserveWorkflowRun({
        tenantId: "tenant-1",
        userId: "user-1",
        workflowTemplateId: "workflow-1",
        runId: "run-1",
        idempotencyKey: "idem-1"
      })
    ).resolves.toEqual({ reserved: true, runId: "run-1" });

    const sql = client.query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toMatch(/begin/i);
    expect(sql).toMatch(/from wfpc\.tenants[\s\S]+for update/i);
    expect(sql).toMatch(/from wfpc\.workflow_templates[\s\S]+for update/i);
    expect(sql).toMatch(/from wfpc\.tenant_package_installs[\s\S]+join wfpc\.tenant_package_purchases/i);
    expect(sql).toMatch(/p\.status = 'active'[\s\S]+p\.starts_at <= now\(\)/i);
    expect(sql).toMatch(/from wfpc\.package_provider_requirements/i);
    expect(sql).toMatch(/from wfpc\.secret_references[\s\S]+revoked_at is null/i);
    expect(sql).toMatch(/insert into wfpc\.workflow_run_reservations[\s\S]+on conflict do nothing/i);
    expect(sql).toMatch(/insert into wfpc\.workflow_runs/i);
    expect(sql).toMatch(/bound_secret_reference_id/i);
    expect(sql).toMatch(/bound_provider_context/i);
    expect(sql).toMatch(/insert into wfpc\.workflow_queue_outbox/i);
    expect(sql).toMatch(/commit/i);
    expect(runner.withTransaction).toHaveBeenCalledOnce();
  });

  it("rolls back and reports duplicate when the idempotency reservation already exists", async () => {
    const client = createSequencedClient([
      [{ paused_at: null }],
      [{ tenant_id: "tenant-1" }],
      [{ id: "workflow-1", package_id: "package-1", provider_kind: "openai_api" }],
      [{ id: "install-1", package_id: "package-1" }],
      [{ id: "requirement-1", capability: "text_generation" }],
      [{ id: "secret-1", secret_ref: "wf_secret_openai", label: "Primary OpenAI", metadata: {} }],
      []
    ]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(
      repository.reserveWorkflowRun({
        tenantId: "tenant-1",
        userId: "user-1",
        workflowTemplateId: "workflow-1",
        runId: "run-1",
        idempotencyKey: "idem-1"
      })
    ).resolves.toEqual({ reserved: false, reason: "duplicate" });

    expect(client.query.mock.calls.map(([statement]) => String(statement))).toContain("commit");
  });

  it("denies workflow reservations without an active package install entitlement", async () => {
    const client = createSequencedClient([
      [{ paused_at: null }],
      [{ tenant_id: "tenant-1" }],
      [{ id: "workflow-1", package_id: "package-1", provider_kind: "openai_api" }],
      []
    ]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(
      repository.reserveWorkflowRun({
        tenantId: "tenant-1",
        userId: "user-1",
        workflowTemplateId: "workflow-1",
        runId: "run-1",
        idempotencyKey: "idem-1"
      })
    ).resolves.toEqual({ reserved: false, reason: "entitlement_denied" });

    const sql = client.query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toMatch(/from wfpc\.tenant_package_installs[\s\S]+join wfpc\.tenant_package_purchases/i);
  });

  it("denies unbound workflows before checking package installs", async () => {
    const client = createSequencedClient([
      [{ paused_at: null }],
      [{ tenant_id: "tenant-1" }],
      [{ id: "workflow-1", package_id: null, provider_kind: "openai_api" }]
    ]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(
      repository.reserveWorkflowRun({
        tenantId: "tenant-1",
        userId: "user-1",
        workflowTemplateId: "workflow-1",
        runId: "run-1",
        idempotencyKey: "idem-1"
      })
    ).resolves.toEqual({ reserved: false, reason: "entitlement_denied" });

    const sql = client.query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).not.toMatch(/from wfpc\.tenant_package_installs/i);
  });

  it("normalizes legacy content_generation requirements into text_generation for bound provider context", async () => {
    const client = createSequencedClient([
      [{ paused_at: null }],
      [{ tenant_id: "tenant-1" }],
      [{ id: "workflow-1", package_id: "package-1", provider_kind: "openai_api" }],
      [{ id: "install-1", package_id: "package-1" }],
      [{ id: "requirement-1", capability: "content_generation" }],
      [{ id: "secret-1", secret_ref: "wf_secret_openai", label: "Primary OpenAI", metadata: {} }],
      [{ id: "reservation-1" }],
      []
    ]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(
      repository.reserveWorkflowRun({
        tenantId: "tenant-1",
        userId: "user-1",
        workflowTemplateId: "workflow-1",
        runId: "run-1",
        idempotencyKey: "idem-1"
      })
    ).resolves.toEqual({ reserved: true, runId: "run-1" });

    const workflowRunInsertCall = client.query.mock.calls.find(([statement]) => String(statement).includes("insert into wfpc.workflow_runs"));
    expect(workflowRunInsertCall).toBeDefined();
    const insertedContext = JSON.parse(String(workflowRunInsertCall?.[1]?.[5]));
    expect(insertedContext).toEqual([
      expect.objectContaining({
        capability: "text_generation",
        providerKind: "openai_api"
      })
    ]);
  });

  it("fails closed when multiple distinct capabilities match the same workflow provider requirement", async () => {
    const client = createSequencedClient([
      [{ paused_at: null }],
      [{ tenant_id: "tenant-1" }],
      [{ id: "workflow-1", package_id: "package-1", provider_kind: "openai_api" }],
      [{ id: "install-1", package_id: "package-1" }],
      [
        { id: "requirement-1", capability: "text_generation", provider_kind: null },
        { id: "requirement-2", capability: "image_generation", provider_kind: "openai_api" }
      ],
      [{ id: "secret-1", secret_ref: "wf_secret_openai", label: "Primary OpenAI", metadata: {} }],
      [{ id: "reservation-1" }],
      []
    ]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(
      repository.reserveWorkflowRun({
        tenantId: "tenant-1",
        userId: "user-1",
        workflowTemplateId: "workflow-1",
        runId: "run-1",
        idempotencyKey: "idem-1"
      })
    ).resolves.toEqual({ reserved: false, reason: "entitlement_denied" });

    const sql = client.query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toMatch(/from wfpc\.package_provider_requirements/i);
    expect(sql).not.toMatch(/insert into wfpc\.workflow_runs/i);
  });

  it("installs packages idempotently with database conflict handling", async () => {
    const client = createSequencedClient([[{ tenant_id: "tenant-1" }], [{ id: "purchase-1" }], [{ id: "install-1", status: "active" }]]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(
      repository.installPackage({
        tenantId: "tenant-1",
        packageId: "package-1",
        userId: "user-1"
      })
    ).resolves.toEqual({ installed: true, id: "install-1", status: "active" });

    const sql = client.query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toMatch(/from wfpc\.tenant_memberships[\s\S]+role in \('owner', 'admin'\)/i);
    expect(sql).toMatch(/from wfpc\.tenant_package_purchases[\s\S]+for update/i);
    expect(sql).toMatch(/insert into wfpc\.tenant_package_installs/i);
    expect(sql).toMatch(/on conflict \(tenant_id, package_id\) do update/i);
  });

  it("denies package installs when no active purchase is locked", async () => {
    const client = createSequencedClient([[{ tenant_id: "tenant-1" }], []]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(
      repository.installPackage({
        tenantId: "tenant-1",
        packageId: "package-1",
        userId: "user-1"
      })
    ).resolves.toEqual({ installed: false, reason: "package_not_purchased" });

    const sql = client.query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toMatch(/from wfpc\.tenant_package_purchases[\s\S]+status = 'active'/i);
    expect(sql).not.toMatch(/insert into wfpc\.tenant_package_installs/i);
  });

  it("denies package installs when the user cannot administer the tenant", async () => {
    const client = createSequencedClient([[]]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(
      repository.installPackage({
        tenantId: "tenant-1",
        packageId: "package-1",
        userId: "user-1"
      })
    ).resolves.toEqual({ installed: false, reason: "package_not_purchased" });

    const sql = client.query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toMatch(/from wfpc\.tenant_memberships/i);
    expect(sql).not.toMatch(/from wfpc\.tenant_package_purchases/i);
    expect(sql).not.toMatch(/insert into wfpc\.tenant_package_installs/i);
  });

  it("revokes credentials with a locked row so new run reservations cannot race stale credentials", async () => {
    const client = createSequencedClient([[{ id: "secret-1" }]]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(
      repository.revokeCredential({
        tenantId: "tenant-1",
        secretReferenceId: "secret-1",
        revokedReason: "manual"
      })
    ).resolves.toEqual({ revoked: true });

    const sql = client.query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toMatch(/update wfpc\.secret_references[\s\S]+revoked_at = coalesce/i);
    expect(sql).toMatch(/revoked_reason = \$3/i);
    expect(sql).toMatch(/where tenant_id = \$1 and id = \$2 and revoked_at is null/i);
  });

  it("guards workflow status transitions so terminal states are not overwritten", async () => {
    const client = createSequencedClient([[{ id: "run-1", status: "running" }]]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(
      repository.transitionWorkflowRunStatus({
        tenantId: "tenant-1",
        runId: "run-1",
        from: ["queued"],
        to: "running"
      })
    ).resolves.toEqual({ transitioned: true, status: "running" });

    const sql = client.query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toMatch(/update wfpc\.workflow_runs/i);
    expect(sql).toMatch(/status = any\(\$3::wfpc\.workflow_run_status\[\]\)/i);
    expect(sql).not.toMatch(/completed', 'failed', 'cancelled/i);
  });

  it("marks workflow outbox rows as enqueued after external queue success", async () => {
    const client = createSequencedClient([[{ id: "outbox-1" }]]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(
      repository.markWorkflowRunQueued({
        tenantId: "tenant-1",
        runId: "run-1",
        outboxId: "outbox-1",
        claimToken: "11111111-1111-4111-8111-111111111111"
      })
    ).resolves.toEqual({ marked: true });

    const sql = client.query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toMatch(/update wfpc\.workflow_queue_outbox/i);
    expect(sql).toMatch(/status = 'enqueued'/i);
    expect(sql).toMatch(/claim_token = null/i);
    expect(sql).toMatch(/and id = \$3::uuid/i);
    expect(sql).toMatch(/and claim_token = \$4::uuid/i);
    expect(sql).toMatch(/and status = 'claimed'/i);
  });

  it("claims pending workflow outbox rows with skip locked", async () => {
    const client = createSequencedClient([
      [
        {
          id: "outbox-1",
          tenant_id: "tenant-1",
          run_id: "run-1",
          workflow_template_id: "workflow-1",
          created_by_user_id: "user-1",
          idempotency_key: "idem-1",
          attempts: 1,
          claim_token: "11111111-1111-4111-8111-111111111111"
        }
      ]
    ]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(repository.claimWorkflowQueueOutbox({ limit: 10 })).resolves.toEqual([
      {
        id: "outbox-1",
        tenantId: "tenant-1",
        runId: "run-1",
        workflowTemplateId: "workflow-1",
        userId: "user-1",
        idempotencyKey: "idem-1",
        attempts: 1,
        claimToken: "11111111-1111-4111-8111-111111111111",
        claimSource: "pending_retry"
      }
    ]);

    const sql = client.query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toMatch(/for update skip locked/i);
    expect(sql).toMatch(/status = 'claimed'/i);
    expect(sql).toMatch(/claim_token = gen_random_uuid\(\)/i);
    expect(sql).toMatch(/status as previous_status/i);
    expect(sql).toMatch(/status = 'claimed'[\s\S]+claimed_at < now\(\) - \(\$2::int \* interval '1 second'\)/i);
  });

  it("releases only the claimed outbox row that still owns the claim token", async () => {
    const client = createSequencedClient([[{ id: "outbox-1" }]]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(
      repository.releaseWorkflowQueueOutbox({
        outboxId: "outbox-1",
        claimToken: "11111111-1111-4111-8111-111111111111",
        error: "redis unavailable",
        retryAfterSeconds: 30
      })
    ).resolves.toEqual({ released: true });

    const sql = client.query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toMatch(/claim_token = null/i);
    expect(sql).toMatch(/where id = \$1[\s\S]+and claim_token = \$4::uuid[\s\S]+and status = 'claimed'/i);
  });

  it("reconciles an already queued row or a reclaimed already-advanced run into a durable enqueued closure without reopening the claim", async () => {
    const client = createSequencedClient([[{ id: "outbox-1" }]]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(
      repository.confirmWorkflowRunQueued({
        tenantId: "tenant-1",
        runId: "run-1",
        outboxId: "outbox-1",
        claimToken: "11111111-1111-4111-8111-111111111111"
      })
    ).resolves.toEqual({ confirmed: true });

    const sql = client.query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toMatch(/update wfpc\.workflow_queue_outbox outbox/i);
    expect(sql).toMatch(/status = 'enqueued'/i);
    expect(sql).toMatch(/enqueued_at = coalesce\(outbox\.enqueued_at, now\(\)\)/i);
    expect(sql).toMatch(/from wfpc\.workflow_runs runs/i);
    expect(sql).toMatch(/\(outbox\.status = 'enqueued' and outbox\.claim_token is null\)/i);
    expect(sql).toMatch(/\$4::uuid is not null[\s\S]+outbox\.claim_token = \$4::uuid[\s\S]+runs\.status <> 'queued'/i);
    expect(sql).toMatch(/last_error = null/i);
    expect(sql).not.toMatch(/for update/i);
  });
});
  it("loads a run's bound provider context only while the bound credential remains active", async () => {
    const client = createSequencedClient([
      [
        {
          bound_provider_context: [
            {
              capability: "text_generation",
              providerKind: "openai_api",
              label: "Primary OpenAI",
              secretRef: "wf_secret_openai",
              metadata: { projectId: "proj_123" }
            }
          ]
        }
      ]
    ]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(repository.getBoundProviderContext({ tenantId: "tenant-1", runId: "run-1" })).resolves.toEqual([
      {
        capability: "text_generation",
        providerKind: "openai_api",
        label: "Primary OpenAI",
        secretRef: "wf_secret_openai",
        metadata: { projectId: "proj_123" }
      }
    ]);

    const sql = client.query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toMatch(/from wfpc\.workflow_runs runs/i);
    expect(sql).toMatch(/join wfpc\.secret_references secrets/i);
    expect(sql).toMatch(/secrets\.revoked_at is null/i);
  });

  it("keeps already-bound queued runs eligible to load provider context after the credential lane is replaced", async () => {
    const client = createSequencedClient([
      [
        {
          bound_provider_context: [
            {
              capability: "text_generation",
              providerKind: "openai_api",
              label: "Primary OpenAI",
              secretRef: "wf_secret_openai_old",
              metadata: { projectId: "proj_123" }
            }
          ]
        }
      ]
    ]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(repository.getBoundProviderContext({ tenantId: "tenant-1", runId: "run-1" })).resolves.toEqual([
      {
        capability: "text_generation",
        providerKind: "openai_api",
        label: "Primary OpenAI",
        secretRef: "wf_secret_openai_old",
        metadata: { projectId: "proj_123" }
      }
    ]);

    const sql = client.query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toMatch(/secrets\.revoked_reason = 'superseded'[\s\S]+runs\.status in \('queued', 'running'\)/i);
  });

  it("fails closed for already-bound queued runs after an explicit manual revoke", async () => {
    const client = createSequencedClient([[]]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(repository.getBoundProviderContext({ tenantId: "tenant-1", runId: "run-1" })).resolves.toBeNull();

    const sql = client.query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toMatch(/secrets\.revoked_reason = 'superseded'/i);
  });

  it("normalizes legacy bound provider capability values when loading existing run context", async () => {
    const client = createSequencedClient([
      [
        {
          bound_provider_context: [
            {
              capability: "content_generation",
              providerKind: "openai_api",
              label: "Primary OpenAI",
              secretRef: "wf_secret_openai",
              metadata: {}
            }
          ]
        }
      ]
    ]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(repository.getBoundProviderContext({ tenantId: "tenant-1", runId: "run-1" })).resolves.toEqual([
      {
        capability: "text_generation",
        providerKind: "openai_api",
        label: "Primary OpenAI",
        secretRef: "wf_secret_openai",
        metadata: {}
      }
    ]);
  });
