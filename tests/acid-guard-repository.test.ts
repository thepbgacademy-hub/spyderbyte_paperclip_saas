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
    const insertedContext = JSON.parse(String(workflowRunInsertCall?.[1]?.[9]));
    expect(insertedContext).toEqual([
      expect.objectContaining({
        capability: "text_generation",
        providerKind: "openai_api"
      })
    ]);
  });

  it("allows OpenAI subscription bindings to satisfy OpenAI API text-generation package requirements", async () => {
    const client = createSequencedClient([
      [{ paused_at: null }],
      [{ tenant_id: "tenant-1" }],
      [{ id: "workflow-1", package_id: "package-1", provider_kind: "openai_chatgpt_codex_subscription" }],
      [{ id: "install-1", package_id: "package-1" }],
      [{ id: "requirement-1", capability: "content_generation", provider_kind: "openai_api" }],
      [{ id: "secret-1", secret_ref: "wf_secret_codex_subscription", label: "OpenAI Codex", metadata: { authStateRef: "codex://tenant" } }],
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

    const sql = client.query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toMatch(/openai_chatgpt_codex_subscription' and provider_kind = 'openai_api'/i);
    const workflowRunInsertCall = client.query.mock.calls.find(([statement]) => String(statement).includes("insert into wfpc.workflow_runs"));
    const insertedContext = JSON.parse(String(workflowRunInsertCall?.[1]?.[9]));
    expect(insertedContext).toEqual([
      expect.objectContaining({
        capability: "text_generation",
        providerKind: "openai_chatgpt_codex_subscription",
        secretRef: "wf_secret_codex_subscription"
      })
    ]);
  });

  it("reserves an explicitly public installed-package overlay without requiring a workflow_templates row lookup", async () => {
    const client = createSequencedClient([
      [{ paused_at: null }],
      [{ tenant_id: "tenant-1" }],
      [{ id: "install-1", package_id: "11111111-1111-4111-8111-111111111111" }],
      [{ id: "requirement-1", capability: "text_generation" }],
      [{ id: "secret-1", secret_ref: "wf_secret_openai", label: "Primary OpenAI", metadata: {} }],
      [{ id: "reservation-1" }],
      []
    ]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(
      repository.reserveWorkflowRun({
        tenantId: "tenant-1",
        userId: "user-1",
        workflowTemplateId: "wf-example-audit",
        runId: "run-1",
        idempotencyKey: "idem-1",
        workflowBinding: {
          packageId: "pkg-example-audit",
          providerKind: "openai_api"
        }
      })
    ).resolves.toEqual({ reserved: true, runId: "run-1" });

    const sql = client.query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).not.toMatch(/from wfpc\.workflow_templates[\s\S]+for update/i);
    expect(sql).toMatch(/join wfpc\.wealth_factory_packages packages[\s\S]+packages\.package_key = \$2/i);
    expect(sql).toMatch(/from wfpc\.tenant_package_installs[\s\S]+join wfpc\.tenant_package_purchases/i);
    expect(sql).toMatch(/insert into wfpc\.workflow_run_reservations/i);

    const reservationInsertCall = client.query.mock.calls.find(([statement]) => String(statement).includes("insert into wfpc.workflow_run_reservations"));
    expect(reservationInsertCall?.[1]?.[4]).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("invokes the reserved callback on the same transaction before commit so native public starts can seed harness state atomically", async () => {
    const client = createSequencedClient([
      [{ paused_at: null }],
      [{ tenant_id: "tenant-1" }],
      [{ id: "install-1", package_id: "11111111-1111-4111-8111-111111111111" }],
      [{ id: "requirement-1", capability: "text_generation" }],
      [{ id: "secret-1", secret_ref: "wf_secret_openai", label: "Primary OpenAI", metadata: {} }],
      [{ id: "reservation-1" }],
      [],
      [],
      []
    ]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));
    const onReserved = vi.fn(async ({ transaction }) => {
      await transaction.query("insert into wfpc.harness_runs /* test bootstrap */ values ('run-1')", []);
    });

    await expect(
      repository.reserveWorkflowRun({
        tenantId: "tenant-1",
        userId: "user-1",
        workflowTemplateId: "wf-example-audit",
        runId: "run-1",
        idempotencyKey: "idem-1",
        workflowBinding: {
          packageId: "pkg-example-audit",
          providerKind: "openai_api"
        },
        workflowDefinitionSnapshot: {
          publicWorkflowId: "wf-example-audit",
          packageId: "pkg-example-audit",
          executionEngine: "wf_native_v1",
          requiredCapabilities: ["text_generation"],
          providerKind: "openai_api"
        },
        onReserved
      })
    ).resolves.toEqual({ reserved: true, runId: "run-1" });

    expect(onReserved).toHaveBeenCalledTimes(1);
    expect(onReserved).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction: client,
        publicWorkflowId: "wf-example-audit",
        workflowPackageId: "11111111-1111-4111-8111-111111111111",
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      })
    );

    const sqlCalls = client.query.mock.calls.map(([statement]) => String(statement));
    const outboxInsertIndex = sqlCalls.findIndex((statement) => statement.includes("insert into wfpc.workflow_queue_outbox"));
    const harnessBootstrapIndex = sqlCalls.findIndex((statement) => statement.includes("insert into wfpc.harness_runs /* test bootstrap */"));
    const commitIndex = sqlCalls.findIndex((statement) => statement === "commit");

    expect(outboxInsertIndex).toBeGreaterThan(-1);
    expect(harnessBootstrapIndex).toBeGreaterThan(outboxInsertIndex);
    expect(commitIndex).toBeGreaterThan(harnessBootstrapIndex);
  });

  it("rolls the reservation transaction back when native bootstrap seeding throws", async () => {
    const client = createSequencedClient([
      [{ paused_at: null }],
      [{ tenant_id: "tenant-1" }],
      [{ id: "install-1", package_id: "11111111-1111-4111-8111-111111111111" }],
      [{ id: "requirement-1", capability: "text_generation" }],
      [{ id: "secret-1", secret_ref: "wf_secret_openai", label: "Primary OpenAI", metadata: {} }],
      [{ id: "reservation-1" }],
      []
    ]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(
      repository.reserveWorkflowRun({
        tenantId: "tenant-1",
        userId: "user-1",
        workflowTemplateId: "wf-example-audit",
        runId: "run-1",
        idempotencyKey: "idem-1",
        workflowBinding: {
          packageId: "pkg-example-audit",
          providerKind: "openai_api"
        },
        workflowDefinitionSnapshot: {
          publicWorkflowId: "wf-example-audit",
          packageId: "pkg-example-audit",
          executionEngine: "wf_native_v1",
          requiredCapabilities: ["text_generation"],
          providerKind: "openai_api"
        },
        onReserved: async () => {
          throw new Error("bootstrap failed");
        }
      })
    ).rejects.toThrow("bootstrap failed");

    const sqlCalls = client.query.mock.calls.map(([statement]) => String(statement));
    expect(sqlCalls).toContain("rollback");
    expect(sqlCalls).not.toContain("commit");
  });

  it("fails closed when an overlay public workflow id is not present in the installed package catalog", async () => {
    const client = createSequencedClient([
      [{ paused_at: null }],
      [{ tenant_id: "tenant-1" }],
      [{ id: "install-1", package_id: "pkg-example-audit" }],
      [{ id: "requirement-1", capability: "text_generation" }],
      [{ id: "secret-1", secret_ref: "wf_secret_openai", label: "Primary OpenAI", metadata: {} }]
    ]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(
      repository.reserveWorkflowRun({
        tenantId: "tenant-1",
        userId: "user-1",
        workflowId: "wf-not-in-package",
        workflowTemplateId: null,
        workflowIdentityKind: "installed_package_overlay",
        workflowPackageId: "pkg-example-audit",
        runId: "run-1",
        idempotencyKey: "idem-1",
        workflowBinding: {
          packageId: "pkg-example-audit",
          providerKind: "openai_api"
        }
      })
    ).resolves.toEqual({ reserved: false, reason: "workflow_unavailable" });
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

  it("cancels only active runs whose stored bound provider context still names one stale secret ref", async () => {
    const client = createSequencedClient([
      [
        { id: "run-1", status: "cancelled" },
        { id: "run-2", status: "cancelled" }
      ]
    ]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(
      repository.cancelWorkflowRunsBySecretRef({
        tenantId: "tenant-1",
        secretRef: "wf_secret_old"
      })
    ).resolves.toEqual({
      cancelled: 2,
      runIds: ["run-1", "run-2"]
    });

    const sql = client.query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toMatch(/update wfpc\.workflow_runs runs/i);
    expect(sql).toMatch(/set status = 'cancelled'/i);
    expect(sql).toMatch(/jsonb_array_elements\(runs\.bound_provider_context\)/i);
    expect(sql).toMatch(/entry->>'secretRef' = \$2/i);
    expect(sql).toMatch(/runs\.status in \('queued', 'running'\)/i);
    expect(sql).toMatch(/returning runs\.id, runs\.status/i);
  });

  it("marks workflow outbox rows as enqueued after external queue success", async () => {
    const client = createSequencedClient([[{ id: "outbox-1" }]]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(
      repository.markWorkflowRunQueued({
        tenantId: "tenant-1",
        runId: "run-1",
        outboxId: "outbox-1",
        claimToken: "11111111-1111-4111-8111-111111111111",
        idempotencyKey: "tenant-1:workflow-1:run-1"
      })
    ).resolves.toEqual({ marked: true });

    const sql = client.query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toMatch(/update wfpc\.workflow_queue_outbox/i);
    expect(sql).toMatch(/status = 'enqueued'/i);
    expect(sql).toMatch(/claim_token = null/i);
    expect(sql).toMatch(/and id = \$3::uuid/i);
    expect(sql).toMatch(/and claim_token = \$4::uuid/i);
    expect(sql).toMatch(/and idempotency_key = \$5/i);
    expect(sql).toMatch(/and status = 'claimed'/i);
  });

  it("re-arms workflow outbox rows for redispatch recovery on the same run id", async () => {
    const client = createSequencedClient([[{ id: "outbox-1" }]]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(
      repository.stageWorkflowRunRedispatch({
        tenantId: "tenant-1",
        runId: "run-1",
        userId: "user-1",
        idempotencyKey: "tenant-1:workflow-1:run-1:redispatch:resume_lane:abc123def456"
      })
    ).resolves.toEqual({ staged: true, outboxId: "outbox-1" });

    const sql = client.query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toMatch(/insert into wfpc\.workflow_queue_outbox/i);
    expect(sql).toMatch(/from wfpc\.workflow_runs runs/i);
    expect(sql).toMatch(/on conflict \(tenant_id, run_id\) do update/i);
    expect(sql).toMatch(/when wfpc\.workflow_queue_outbox\.status = 'claimed' then wfpc\.workflow_queue_outbox\.idempotency_key/i);
    expect(sql).toMatch(/else excluded\.idempotency_key/i);
    expect(sql).not.toMatch(/created_by_user_id = excluded\.created_by_user_id/i);
    expect(sql).toMatch(/when wfpc\.workflow_queue_outbox\.status = 'claimed' then wfpc\.workflow_queue_outbox\.status/i);
    expect(sql).toMatch(/when wfpc\.workflow_queue_outbox\.status = 'claimed' then wfpc\.workflow_queue_outbox\.claim_token/i);
    expect(sql).toMatch(/when wfpc\.workflow_queue_outbox\.status = 'claimed' then wfpc\.workflow_queue_outbox\.claimed_at/i);
    expect(sql).toMatch(/else now\(\)/i);
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
        workflowId: "workflow-1",
        workflowTemplateId: "workflow-1",
        workflowIdentityKind: "tenant_template",
        workflowPackageId: null,
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

  it("maps template-only pre-cutover outbox rows onto the durable public identity shape when claiming work", async () => {
    const client = createSequencedClient([
      [
        {
          id: "outbox-legacy-1",
          tenant_id: "tenant-1",
          run_id: "run-legacy-1",
          public_workflow_id: null,
          workflow_template_id: "workflow-legacy-1",
          workflow_identity_kind: null,
          workflow_package_id: null,
          created_by_user_id: "user-1",
          idempotency_key: "tenant-1:workflow-legacy-1:run-legacy-1",
          attempts: 2,
          claim_token: "22222222-2222-4222-8222-222222222222",
          previous_status: "pending"
        }
      ]
    ]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(repository.claimWorkflowQueueOutbox({ limit: 1 })).resolves.toEqual([
      {
        id: "outbox-legacy-1",
        tenantId: "tenant-1",
        runId: "run-legacy-1",
        workflowId: "workflow-legacy-1",
        workflowTemplateId: "workflow-legacy-1",
        workflowIdentityKind: "tenant_template",
        workflowPackageId: null,
        userId: "user-1",
        idempotencyKey: "tenant-1:workflow-legacy-1:run-legacy-1",
        attempts: 2,
        claimToken: "22222222-2222-4222-8222-222222222222",
        claimSource: "pending_retry"
      }
    ]);

    const sql = client.query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toMatch(/returning outbox\.id, outbox\.tenant_id, outbox\.run_id, outbox\.public_workflow_id/i);
    expect(sql).toMatch(/outbox\.workflow_identity_kind/i);
  });

  it("preserves installed-package overlay public workflow identity when reclaiming stale outbox rows", async () => {
    const client = createSequencedClient([
      [
        {
          id: "outbox-overlay-1",
          tenant_id: "tenant-1",
          run_id: "run-overlay-1",
          public_workflow_id: "wf-example-audit",
          workflow_template_id: null,
          workflow_identity_kind: "installed_package_overlay",
          workflow_package_id: "pkg-example-audit",
          created_by_user_id: "user-1",
          idempotency_key: "tenant-1:wf-example-audit:run-overlay-1",
          attempts: 4,
          claim_token: "33333333-3333-4333-8333-333333333333",
          previous_status: "claimed"
        }
      ]
    ]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(repository.claimWorkflowQueueOutbox({ limit: 1, staleClaimSeconds: 60 })).resolves.toEqual([
      {
        id: "outbox-overlay-1",
        tenantId: "tenant-1",
        runId: "run-overlay-1",
        workflowId: "wf-example-audit",
        workflowTemplateId: null,
        workflowIdentityKind: "installed_package_overlay",
        workflowPackageId: "pkg-example-audit",
        userId: "user-1",
        idempotencyKey: "tenant-1:wf-example-audit:run-overlay-1",
        attempts: 4,
        claimToken: "33333333-3333-4333-8333-333333333333",
        claimSource: "stale_claim"
      }
    ]);
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
          ],
          secret_ref: "wf_secret_openai",
          provider_kind: "openai_api"
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
          ],
          secret_ref: "wf_secret_openai_old",
          provider_kind: "openai_api"
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
          ],
          secret_ref: "wf_secret_openai",
          provider_kind: "openai_api"
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

  it("loads a launch-ready bound provider binding as a single authoritative record", async () => {
    const client = createSequencedClient([
      [
        {
          bound_provider_context: [
            {
              capability: "text_generation",
              providerKind: "openai_api",
              label: "Primary OpenAI",
              secretRef: "wf_secret_openai",
              metadata: {}
            }
          ],
          secret_ref: "wf_secret_openai",
          provider_kind: "openai_api"
        }
      ]
    ]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(repository.getBoundProviderLaunchBinding({ tenantId: "tenant-1", runId: "run-1" })).resolves.toEqual({
      capability: "text_generation",
      providerKind: "openai_api",
      label: "Primary OpenAI",
      secretRef: "wf_secret_openai",
      metadata: {}
    });
  });

  it("fails closed when a bound run row carries more than one provider binding entry", async () => {
    const client = createSequencedClient([
      [
        {
          bound_provider_context: [
            {
              capability: "text_generation",
              providerKind: "openai_api",
              label: "Primary OpenAI",
              secretRef: "wf_secret_openai",
              metadata: {}
            },
            {
              capability: "image_generation",
              providerKind: "openai_api",
              label: "Primary OpenAI",
              secretRef: "wf_secret_openai",
              metadata: {}
            }
          ],
          secret_ref: "wf_secret_openai",
          provider_kind: "openai_api"
        }
      ]
    ]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(repository.getBoundProviderContext({ tenantId: "tenant-1", runId: "run-1" })).resolves.toBeNull();
  });

  it("fails closed when a bound run row carries more than one stored entry even if only one normalizes cleanly", async () => {
    const client = createSequencedClient([
      [
        {
          bound_provider_context: [
            {
              capability: "text_generation",
              providerKind: "openai_api",
              label: "Primary OpenAI",
              secretRef: "wf_secret_openai",
              metadata: {}
            },
            {
              capability: null,
              providerKind: "",
              label: "",
              secretRef: "",
              metadata: {}
            }
          ],
          secret_ref: "wf_secret_openai",
          provider_kind: "openai_api"
        }
      ]
    ]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(repository.getBoundProviderContext({ tenantId: "tenant-1", runId: "run-1" })).resolves.toBeNull();
  });

  it("fails closed when a bound provider entry does not match the single joined secret row", async () => {
    const client = createSequencedClient([
      [
        {
          bound_provider_context: [
            {
              capability: "text_generation",
              providerKind: "anthropic_api",
              label: "Primary Anthropic",
              secretRef: "wf_secret_anthropic",
              metadata: {}
            }
          ],
          secret_ref: "wf_secret_openai",
          provider_kind: "openai_api"
        }
      ]
    ]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(repository.getBoundProviderContext({ tenantId: "tenant-1", runId: "run-1" })).resolves.toBeNull();
  });

  it("returns no launch-ready binding when the stored run context is not launchable", async () => {
    const client = createSequencedClient([
      [
        {
          bound_provider_context: [
            {
              capability: "text_generation",
              providerKind: "anthropic_api",
              label: "Primary Anthropic",
              secretRef: "wf_secret_anthropic",
              metadata: {}
            }
          ],
          secret_ref: "wf_secret_openai",
          provider_kind: "openai_api"
        }
      ]
    ]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(repository.getBoundProviderLaunchBinding({ tenantId: "tenant-1", runId: "run-1" })).resolves.toBeNull();
  });

  it("keeps already-bound queued runs readable when the same secret row rotates to a new secret_ref", async () => {
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
          ],
          secret_ref: "wf_secret_openai_new",
          provider_kind: "openai_api"
        }
      ]
    ]);
    const repository = createAcidGuardRepository(createTransactionRunner(client));

    await expect(repository.getBoundProviderContext({ tenantId: "tenant-1", runId: "run-1" })).resolves.toEqual([
      {
        capability: "text_generation",
        providerKind: "openai_api",
        label: "Primary OpenAI",
        secretRef: "wf_secret_openai_new",
        metadata: { projectId: "proj_123" }
      }
    ]);
  });
