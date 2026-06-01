import { execFile, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createPgTransactionRunner } from "../src/db/postgres-client.js";
import { createInMemoryHarnessRepository, createPostgresHarnessRepository } from "../src/harness/repository.js";
import {
  createHarnessCardContinuityRecord,
  createHarnessCardEventRecord,
  createHarnessCardRecord,
  createHarnessRunRecord
} from "../src/harness/types.js";

const migration = readFileSync("supabase/migrations/0013_wf_harness_runs_cards.sql", "utf8");
const proposalMigration = readFileSync("supabase/migrations/0014_wf_harness_subcard_proposals.sql", "utf8");
const proposalResolutionMigration = readFileSync("supabase/migrations/0015_wf_harness_proposal_resolutions.sql", "utf8");
const boardDecisionMigration = readFileSync("supabase/migrations/0016_wf_harness_board_decisions.sql", "utf8");
const boardMemoryMigration = readFileSync("supabase/migrations/0017_wf_harness_board_memory.sql", "utf8");
const laneHandoffMigration = readFileSync("supabase/migrations/0018_wf_harness_lane_handoff.sql", "utf8");
const cardContinuityMigration = readFileSync("supabase/migrations/0019_wf_harness_card_continuity.sql", "utf8");
const cardContinuitySourceMigration = readFileSync("supabase/migrations/0020_wf_harness_card_continuity_source.sql", "utf8");
const exportDeliveriesMigration = readFileSync("supabase/migrations/0021_wf_harness_export_deliveries.sql", "utf8");
const exportDeliveriesRlsMigration = readFileSync("supabase/migrations/0022_wf_harness_export_deliveries_rls.sql", "utf8");
const exportDeliveryResultsMigration = readFileSync("supabase/migrations/0023_wf_harness_export_delivery_results.sql", "utf8");
const exportDeliveryClaimsMigration = readFileSync("supabase/migrations/0025_wf_harness_export_delivery_claims.sql", "utf8");
const execFileAsync = promisify(execFile);

const HARNESS_POSTGRES_IMAGE = "postgres:16-alpine";
const HARNESS_POSTGRES_PASSWORD = "wf_harness_test_pw";
const HARNESS_POSTGRES_DB = "wf_harness_test";
const dockerAvailable = hasDockerRuntime();

type DisposableHarnessDatabase = {
  connectionString: string;
  stop(): Promise<void>;
};

const describeIfDocker = dockerAvailable ? describe : describe.skip;

let disposableHarnessDb: DisposableHarnessDatabase | null = null;

beforeAll(async () => {
  if (!dockerAvailable) {
    return;
  }

  disposableHarnessDb = await startDisposableHarnessDatabase();
}, 300_000);

afterAll(async () => {
  await disposableHarnessDb?.stop();
  disposableHarnessDb = null;
}, 60_000);

describe("harness persistence records", () => {
  it("creates run, card, and event records with durable ids and sanitized runtime context", () => {
    const run = createHarnessRunRecord({
      tenantId: "tenant-123",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI",
        secretValues: { apiKey: "sk-secret" }
      } as never
    });

    const card = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan the first workflow",
      deliverableType: "plan"
    });

    const event = createHarnessCardEventRecord({
      cardId: card.id,
      eventKind: "state_changed",
      payload: { from: "queued", to: "planning" }
    });

    expect(run.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(card.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(run.state).toBe("queued");
    expect(card.state).toBe("queued");
    expect(event.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(event.cardId).toBe(card.id);
    expect(run.runtimeContext).toEqual({
      providerKind: "openai_api",
      credentialLabel: "Primary OpenAI"
    });
    expect("secretValues" in run.runtimeContext).toBe(false);
  });

  it("stores runs, cards, and events in the minimal in-memory repository", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-123",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const card = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan the first workflow",
      deliverableType: "plan"
    });
    const event = createHarnessCardEventRecord({
      cardId: card.id,
      eventKind: "created",
      payload: {}
    });

    await repository.insertRun(run);
    await repository.insertCard(card);
    await repository.insertEvent(event);
    await repository.insertDecision({
      id: "decision_1",
      runId: run.id,
      tenantId: "tenant-123",
      actorUserId: "user-123",
      decisionKind: "lane_opened",
      cardId: card.id,
      proposalId: null,
      targetCardId: card.id,
      persona: "ceo",
      deliverableType: "plan",
      policyReason: "created_new_lane",
      resolution: "create_lane",
      decisionNote: null,
      recommendationSummary: "Open a dedicated plan lane for CEO.",
      objectionSummary: null,
      createdAt: "2026-05-22T00:00:00.000Z"
    });
    await repository.insertProposal({
      id: "proposal_1",
      runId: run.id,
      parentCardId: card.id,
      requestedByCardId: card.id,
      requestedByPersona: "ceo",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review",
      status: "proposed"
    });
    await repository.markProposalApproved({
      proposalId: "proposal_1",
      approvedCardId: "approved_card_1"
    });

    await expect(repository.getRun(run.id)).resolves.toEqual(run);
    await expect(repository.listCardsForRun(run.id)).resolves.toEqual([card]);
    await expect(repository.listEventsForCard(card.id)).resolves.toEqual([event]);
    await expect(repository.listDecisionsForRun(run.id)).resolves.toEqual([
      expect.objectContaining({
        id: "decision_1",
        decisionKind: "lane_opened",
        cardId: card.id,
        policyReason: "created_new_lane",
        recommendationSummary: "Open a dedicated plan lane for CEO.",
        objectionSummary: null
      })
    ]);
    await expect(repository.getProposal("proposal_1")).resolves.toEqual({
      id: "proposal_1",
      runId: run.id,
      parentCardId: card.id,
      requestedByCardId: card.id,
      requestedByPersona: "ceo",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review",
      status: "approved",
      approvedCardId: "approved_card_1"
    });
  });

  it("stores bounded card continuity snapshots in the minimal in-memory repository", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-123",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const card = createHarnessCardRecord({
      runId: run.id,
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });
    const continuity = createHarnessCardContinuityRecord({
      cardId: card.id,
      runId: run.id,
      continuitySummary: 'CFO should begin this approved pricing review lane: Pressure-test the pricing lane.',
      latestResultSummary: "Validated the pricing assumptions against the current workload.",
      absorbedWorkItems: ["update_existing_lane|CEO: Pressure-test the pricing lane"]
    });

    await repository.insertRun(run);
    await repository.insertCard(card);
    await repository.upsertCardContinuity(continuity);

    await expect(repository.getCardContinuity(card.id)).resolves.toEqual(continuity);
    await expect(repository.listCardContinuityForRun(run.id)).resolves.toEqual([continuity]);
  });

  it("stores export-ready governance-history delivery bundles in the minimal in-memory repository", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-123",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });

    await repository.insertRun(run);

    const firstWrite = await repository.upsertExportDelivery({
      id: "export_delivery_1",
      runId: run.id,
      tenantId: run.tenantId,
      workflowId: run.workflowId,
      packageId: run.packageId,
      candidateId: "governance_history_export",
      status: "export_ready",
      exportFormat: "obsidian_markdown_bundle",
      recordTarget: "governance_history_record",
      bundleId: "bundle_123",
      idempotencyKey: "governance_history_export:run_123",
      noteTitle: "Governance history",
      noteFileName: "wf_connect_first_workflow-governance-history.md",
      placementTargetSystem: "obsidian_vault",
      vaultFolder: "wealth-factory/governance-history/wf_connect_first_workflow",
      primaryNotePath:
        "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
      syncStrategy: "append_history_entry",
      confirmationRequirement: "tenant_export_confirmation",
      files: [
        {
          path: "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
          mediaType: "text/markdown",
          byteSize: 20,
          checksum: "abc123",
          content: "# Governance history"
        }
      ],
      recordCount: 2,
      disclosureSummary: "Decision summary only",
      redactionSummary: "Governance-safe redaction",
      attemptCount: 0,
      lastAttemptedAt: null,
      deliveredAt: null,
      writerKind: null,
      deliveryReceipt: {},
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: "2026-05-29T00:00:00.000Z",
      updatedAt: "2026-05-29T00:00:00.000Z"
    });

    const secondWrite = await repository.upsertExportDelivery({
      ...firstWrite,
      bundleId: "bundle_456",
      recordCount: 3,
      files: [
        ...firstWrite.files,
        {
          path: "wealth-factory/governance-history/wf_connect_first_workflow/manifest.json",
          mediaType: "application/json",
          byteSize: 42,
          checksum: "def456",
          content: "{\"ok\":true}"
        }
      ],
      updatedAt: "2026-05-29T01:00:00.000Z"
    });

    expect(secondWrite.id).toBe(firstWrite.id);
    expect(secondWrite.createdAt).toBe(firstWrite.createdAt);
    expect(secondWrite.bundleId).toBe("bundle_456");

    const delivered = await repository.recordExportDeliveryOutcome({
      idempotencyKey: "governance_history_export:run_123",
      status: "delivered",
      writerKind: "obsidian_filesystem",
      deliveryReceipt: {
        primaryNotePath:
          "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
        writtenFileCount: 2
      },
      attemptCount: 1,
      lastAttemptedAt: "2026-05-29T01:00:00.000Z",
      deliveredAt: "2026-05-29T01:00:01.000Z",
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: "2026-05-29T01:00:01.000Z"
    });

    expect(delivered).toEqual(
      expect.objectContaining({
        status: "delivered",
        writerKind: "obsidian_filesystem",
        attemptCount: 1,
        deliveredAt: "2026-05-29T01:00:01.000Z"
      })
    );

    await expect(repository.listExportDeliveriesForRun(run.id)).resolves.toEqual([
      expect.objectContaining({
        id: firstWrite.id,
        runId: run.id,
        bundleId: "bundle_456",
        recordCount: 3,
        status: "delivered",
        writerKind: "obsidian_filesystem",
        attemptCount: 1,
        files: [
          expect.objectContaining({
            path: "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md"
          }),
          expect.objectContaining({
            path: "wealth-factory/governance-history/wf_connect_first_workflow/manifest.json"
          })
        ]
      })
    ]);
  });

  it("claims governance-history delivery attempts exactly once in the minimal in-memory repository", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-123",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });

    await repository.insertRun(run);
    await repository.upsertExportDelivery({
      id: "export_delivery_claim_1",
      runId: run.id,
      tenantId: run.tenantId,
      workflowId: run.workflowId,
      packageId: run.packageId,
      candidateId: "governance_history_export",
      status: "export_ready",
      exportFormat: "obsidian_markdown_bundle",
      recordTarget: "governance_history_record",
      bundleId: "bundle_claim_1",
      idempotencyKey: "governance_history_export:claim",
      noteTitle: "Governance history",
      noteFileName: "wf_connect_first_workflow-governance-history.md",
      placementTargetSystem: "obsidian_vault",
      vaultFolder: "wealth-factory/governance-history/wf_connect_first_workflow",
      primaryNotePath:
        "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
      syncStrategy: "append_history_entry",
      confirmationRequirement: "tenant_export_confirmation",
      files: [],
      recordCount: 2,
      disclosureSummary: "Decision summary only",
      redactionSummary: "Governance-safe redaction",
      attemptCount: 0,
      lastAttemptedAt: null,
      deliveredAt: null,
      writerKind: null,
      deliveryReceipt: {},
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z"
    });

    const claimed = await repository.claimExportDeliveryAttempt({
      idempotencyKey: "governance_history_export:claim",
      writerKind: "obsidian_filesystem",
      claimedAt: "2026-06-01T00:05:00.000Z",
      updatedAt: "2026-06-01T00:05:00.000Z"
    });
    const duplicateClaim = await repository.claimExportDeliveryAttempt({
      idempotencyKey: "governance_history_export:claim",
      writerKind: "obsidian_filesystem",
      claimedAt: "2026-06-01T00:06:00.000Z",
      updatedAt: "2026-06-01T00:06:00.000Z"
    });

    expect(claimed).toEqual(
      expect.objectContaining({
        status: "delivery_in_progress",
        attemptCount: 1,
        writerKind: "obsidian_filesystem",
        lastAttemptedAt: "2026-06-01T00:05:00.000Z"
      })
    );
    expect(duplicateClaim).toBeNull();
  });

  it("updates lane ownership in the in-memory repository without changing the card state", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-123",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const card = {
      ...createHarnessCardRecord({
        runId: run.id,
        persona: "cfo",
        title: "Pressure-test the pricing lane",
        deliverableType: "pricing_review"
      }),
      state: "approved" as const
    };

    await repository.insertRun(run);
    await repository.insertCard(card);

    await expect(
      repository.updateCardAssignment({
        cardId: card.id,
        persona: "researcher",
        title: "Research the pricing lane"
      })
    ).resolves.toEqual(
      expect.objectContaining({
        id: card.id,
        persona: "researcher",
        title: "Research the pricing lane",
        state: "approved"
      })
    );
  });

  it("only transitions an in-memory card when the expected prior state still matches", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-123",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const card = {
      ...createHarnessCardRecord({
        runId: run.id,
        persona: "cfo",
        title: "Pressure-test the pricing lane",
        deliverableType: "pricing_review"
      }),
      state: "working" as const
    };

    await repository.insertRun(run);
    await repository.insertCard(card);

    await expect(
      repository.transitionCardState({
        cardId: card.id,
        expectedState: "working",
        state: "done"
      })
    ).resolves.toEqual(
      expect.objectContaining({
        id: card.id,
        state: "done"
      })
    );
    await expect(
      repository.transitionCardState({
        cardId: card.id,
        expectedState: "working",
        state: "cancelled"
      })
    ).resolves.toBeNull();
  });

  it("keeps deferred proposal approval and child-card insert on one leased transaction client", async () => {
    const card = {
      ...createHarnessCardRecord({
        runId: "run-123",
        parentCardId: "parent-card-123",
        persona: "researcher",
        title: "Validate renewal assumptions",
        deliverableType: "research_brief"
      }),
      state: "approved" as const
    };
    const leasedClient = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        if (sql === "begin" || sql === "commit" || sql === "rollback") {
          return { rows: [] };
        }
        if (sql.includes("update wfpc.harness_subcard_proposals")) {
          return { rows: [{ id: "proposal_1" }] };
        }
        if (sql.includes("insert into wfpc.harness_cards")) {
          return { rows: [] };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      }),
      release: vi.fn()
    };
    const pool = {
      connect: vi.fn().mockResolvedValue(leasedClient)
    };
    const runner = createPgTransactionRunner(pool);

    await runner.withTransaction(async (transaction) => {
      const repository = createPostgresHarnessRepository(transaction);

      await expect(
        repository.markProposalApproved({
          proposalId: "proposal_1",
          approvedCardId: card.id
        })
      ).resolves.toEqual({ updated: true });
      await expect(repository.insertCard(card)).resolves.toBeUndefined();
    });

    expect(leasedClient.query.mock.calls.map(([sql]) => sql)).toEqual([
      "begin",
      expect.stringContaining("update wfpc.harness_subcard_proposals"),
      expect.stringContaining("insert into wfpc.harness_cards"),
      "commit"
    ]);
    expect(leasedClient.release).toHaveBeenCalledOnce();
  });

  it("rolls back the deferred proposal approval transaction if the child-card insert fails", async () => {
    const card = {
      ...createHarnessCardRecord({
        runId: "run-123",
        parentCardId: "parent-card-123",
        persona: "researcher",
        title: "Validate renewal assumptions",
        deliverableType: "research_brief"
      }),
      state: "approved" as const
    };
    const leasedClient = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        if (sql === "begin" || sql === "commit" || sql === "rollback") {
          return { rows: [] };
        }
        if (sql.includes("update wfpc.harness_subcard_proposals")) {
          return { rows: [{ id: "proposal_1" }] };
        }
        if (sql.includes("insert into wfpc.harness_cards")) {
          throw new Error("card insert failed");
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      }),
      release: vi.fn()
    };
    const pool = {
      connect: vi.fn().mockResolvedValue(leasedClient)
    };
    const runner = createPgTransactionRunner(pool);

    await expect(
      runner.withTransaction(async (transaction) => {
        const repository = createPostgresHarnessRepository(transaction);
        await repository.markProposalApproved({
          proposalId: "proposal_1",
          approvedCardId: card.id
        });
        await repository.insertCard(card);
      })
    ).rejects.toThrow("card insert failed");

    expect(leasedClient.query.mock.calls.map(([sql]) => sql)).toEqual([
      "begin",
      expect.stringContaining("update wfpc.harness_subcard_proposals"),
      expect.stringContaining("insert into wfpc.harness_cards"),
      "rollback"
    ]);
    expect(leasedClient.release).toHaveBeenCalledOnce();
  });
});

describe("harness persistence migration", () => {
  it("creates durable run, card, and event tables", () => {
    expect(migration).toMatch(/create table if not exists wfpc\.harness_runs/i);
    expect(migration).toMatch(/id uuid primary key/i);
    expect(migration).toMatch(/runtime_context jsonb not null/i);
    expect(migration).toMatch(/create table if not exists wfpc\.harness_cards/i);
    expect(migration).toMatch(/run_id uuid not null references wfpc\.harness_runs\(id\) on delete cascade/i);
    expect(migration).toMatch(/parent_card_id uuid null references wfpc\.harness_cards\(id\) on delete set null/i);
    expect(migration).toMatch(/create table if not exists wfpc\.harness_card_events/i);
    expect(migration).toMatch(/card_id uuid not null references wfpc\.harness_cards\(id\) on delete cascade/i);
    expect(migration).toMatch(/payload jsonb not null default '\{\}'::jsonb/i);
  });

  it("creates durable sub-card proposal storage for CEO approval work", () => {
    expect(proposalMigration).toMatch(/create table if not exists wfpc\.harness_subcard_proposals/i);
    expect(proposalMigration).toMatch(/run_id uuid not null references wfpc\.harness_runs\(id\) on delete cascade/i);
    expect(proposalMigration).toMatch(/status text not null check \(status in \('proposed', 'approved'\)\)/i);
    expect(proposalMigration).toMatch(
      /approved_card_id uuid null references wfpc\.harness_cards\(id\) on delete set null deferrable initially deferred/i
    );
  });

  it("creates durable harness board decision storage for CEO governance memory", () => {
    expect(boardDecisionMigration).toMatch(/create table if not exists wfpc\.harness_board_decisions/i);
    expect(boardDecisionMigration).toMatch(/run_id uuid not null references wfpc\.harness_runs\(id\) on delete cascade/i);
    expect(boardDecisionMigration).toMatch(/proposal_id uuid null references wfpc\.harness_subcard_proposals\(id\) on delete set null/i);
    expect(boardDecisionMigration).toMatch(/decision_kind text not null check \(decision_kind in \('lane_opened', 'proposal_approved', 'proposal_deferred', 'proposal_denied', 'run_completed'\)\)/i);
    expect(boardDecisionMigration).toMatch(/create index if not exists harness_board_decisions_run_created_at_idx/i);
  });

  it("widens harness board decisions with bounded policy and board-memory columns", () => {
    expect(boardMemoryMigration).toMatch(/alter table wfpc\.harness_board_decisions/i);
    expect(boardMemoryMigration).toMatch(/add column if not exists policy_reason text null/i);
    expect(boardMemoryMigration).toMatch(/add column if not exists recommendation_summary text null/i);
    expect(boardMemoryMigration).toMatch(/add column if not exists objection_summary text null/i);
    expect(boardMemoryMigration).toMatch(/harness_board_decisions_policy_reason_check/i);
    expect(boardMemoryMigration).toMatch(/deliverable_owner_conflict/i);
    expect(boardMemoryMigration).toMatch(/completed_lanes_only/i);
  });
});

describeIfDocker("harness persistence real Postgres transaction proof", () => {
  it(
    "round-trips harness board decisions through the real Postgres repository mapping",
    async () => {
      const database = requireDisposableHarnessDatabase();
      const client = new Client({ connectionString: database.connectionString });
      await client.connect();

      try {
        const repository = createPostgresHarnessRepository({
          query: async (sql: string, values: readonly unknown[]) => {
            const result = await client.query(sql, [...values]);
            return { rows: result.rows };
          }
        });
        const tenantId = randomUUID();
        const run = createHarnessRunRecord({
          tenantId,
          workflowId: "wf_connect_first_workflow",
          packageId: "pkg_bib_connect",
          orchestratorPersona: "ceo",
          runtimeContext: {
            providerKind: "openai_api",
            credentialLabel: "Primary OpenAI"
          }
        });
        const ceoCard = createHarnessCardRecord({
          runId: run.id,
          persona: "ceo",
          title: "Plan the first workflow",
          deliverableType: "plan"
        });
        const proposalId = randomUUID();

        await resetHarnessProofDatabase(client);
        await seedHarnessProofPrerequisites(client, tenantId);
        await repository.insertRun(run);
        await repository.insertCard(ceoCard);
        await repository.insertProposal({
          id: proposalId,
          runId: run.id,
          parentCardId: ceoCard.id,
          requestedByCardId: ceoCard.id,
          requestedByPersona: "ceo",
          persona: "cfo",
          title: "Validate pricing assumptions",
          deliverableType: "pricing_review",
          status: "deferred"
        });

        await repository.insertDecision({
          id: randomUUID(),
          runId: run.id,
          tenantId,
          actorUserId: "user-123",
          decisionKind: "proposal_deferred",
          cardId: ceoCard.id,
          proposalId,
          targetCardId: null,
          persona: "cfo",
          deliverableType: "pricing_review",
          policyReason: "deliverable_owner_conflict",
          resolution: null,
          decisionNote: "Wait for the current pricing owner to finish.",
          recommendationSummary: null,
          objectionSummary: "Wait for the current pricing review owner to clear or hand off that lane first.",
          createdAt: "2026-05-22T00:00:00.000Z"
        });

        await expect(repository.listDecisionsForRun(run.id)).resolves.toEqual([
          expect.objectContaining({
            runId: run.id,
            tenantId,
            actorUserId: "user-123",
            decisionKind: "proposal_deferred",
            cardId: ceoCard.id,
            proposalId,
            persona: "cfo",
            deliverableType: "pricing_review",
            policyReason: "deliverable_owner_conflict",
            resolution: null,
            decisionNote: "Wait for the current pricing owner to finish.",
            recommendationSummary: null,
            objectionSummary: "Wait for the current pricing review owner to clear or hand off that lane first."
          })
        ]);
      } finally {
        await client.end();
      }
    },
    120_000
  );

  it(
    "round-trips harness card ownership updates through the real Postgres repository mapping",
    async () => {
      const database = requireDisposableHarnessDatabase();
      const client = new Client({ connectionString: database.connectionString });
      await client.connect();

      try {
        const repository = createPostgresHarnessRepository({
          query: async (sql: string, values: readonly unknown[]) => {
            const result = await client.query(sql, [...values]);
            return { rows: result.rows };
          }
        });
        const tenantId = randomUUID();
        const run = createHarnessRunRecord({
          tenantId,
          workflowId: "wf_connect_first_workflow",
          packageId: "pkg_bib_connect",
          orchestratorPersona: "ceo",
          runtimeContext: {
            providerKind: "openai_api",
            credentialLabel: "Primary OpenAI"
          }
        });
        const childCard = {
          ...createHarnessCardRecord({
            runId: run.id,
            persona: "cfo",
            title: "Pressure-test the pricing lane",
            deliverableType: "pricing_review"
          }),
          state: "approved" as const
        };

        await resetHarnessProofDatabase(client);
        await seedHarnessProofPrerequisites(client, tenantId);
        await repository.insertRun(run);
        await repository.insertCard(childCard);

        await expect(
          repository.updateCardAssignment({
            cardId: childCard.id,
            persona: "researcher",
            title: "Research the pricing lane"
          })
        ).resolves.toEqual(
          expect.objectContaining({
            id: childCard.id,
            persona: "researcher",
            title: "Research the pricing lane",
            state: "approved"
          })
        );
      } finally {
        await client.end();
      }
    },
    120_000
  );

  it(
    "round-trips compare-and-set harness card transitions through the real Postgres repository mapping",
    async () => {
      const database = requireDisposableHarnessDatabase();
      const client = new Client({ connectionString: database.connectionString });
      await client.connect();

      try {
        const repository = createPostgresHarnessRepository({
          query: async (sql: string, values: readonly unknown[]) => {
            const result = await client.query(sql, [...values]);
            return { rows: result.rows };
          }
        });
        const tenantId = randomUUID();
        const run = createHarnessRunRecord({
          tenantId,
          workflowId: "wf_connect_first_workflow",
          packageId: "pkg_bib_connect",
          orchestratorPersona: "ceo",
          runtimeContext: {
            providerKind: "openai_api",
            credentialLabel: "Primary OpenAI"
          }
        });
        const childCard = {
          ...createHarnessCardRecord({
            runId: run.id,
            persona: "cfo",
            title: "Pressure-test the pricing lane",
            deliverableType: "pricing_review"
          }),
          state: "working" as const
        };

        await resetHarnessProofDatabase(client);
        await seedHarnessProofPrerequisites(client, tenantId);
        await repository.insertRun(run);
        await repository.insertCard(childCard);

        await expect(
          repository.transitionCardState({
            cardId: childCard.id,
            expectedState: "working",
            state: "done"
          })
        ).resolves.toEqual(
          expect.objectContaining({
            id: childCard.id,
            state: "done"
          })
        );
        await expect(
          repository.transitionCardState({
            cardId: childCard.id,
            expectedState: "working",
            state: "cancelled"
          })
        ).resolves.toBeNull();
      } finally {
        await client.end();
      }
    },
    120_000
  );

  it(
    "round-trips harness card continuity snapshots through the real Postgres repository mapping",
    async () => {
      const database = requireDisposableHarnessDatabase();
      const client = new Client({ connectionString: database.connectionString });
      await client.connect();

      try {
        const repository = createPostgresHarnessRepository({
          query: async (sql: string, values: readonly unknown[]) => {
            const result = await client.query(sql, [...values]);
            return { rows: result.rows };
          }
        });
        const tenantId = randomUUID();
        const run = createHarnessRunRecord({
          tenantId,
          workflowId: "wf_connect_first_workflow",
          packageId: "pkg_bib_connect",
          orchestratorPersona: "ceo",
          runtimeContext: {
            providerKind: "openai_api",
            credentialLabel: "Primary OpenAI"
          }
        });
        const childCard = createHarnessCardRecord({
          runId: run.id,
          persona: "researcher",
          title: "Gather competitor price anchors",
          deliverableType: "research_brief"
        });

        await resetHarnessProofDatabase(client);
        await seedHarnessProofPrerequisites(client, tenantId);
        await repository.insertRun(run);
        await repository.insertCard(childCard);

        await repository.upsertCardContinuity(
          createHarnessCardContinuityRecord({
            cardId: childCard.id,
            runId: run.id,
            continuitySummary: "RESEARCHER should continue this active research brief lane: Gather competitor price anchors.",
            latestResultSummary: "Collected the first pricing-anchor round.",
            absorbedWorkItems: [
              "update_existing_lane|CMO: Draft campaign outline",
              "update_existing_lane|CFO: Refresh competitor pricing anchors"
            ]
          })
        );
        await repository.upsertCardContinuity(
          createHarnessCardContinuityRecord({
            cardId: childCard.id,
            runId: run.id,
            continuitySummary: "RESEARCHER should continue this active research brief lane: Gather competitor price anchors.",
            absorbedWorkItems: [
              "update_existing_lane|COO: Confirm fulfillment handoff",
              "update_existing_lane|CEO: Package tenant next steps",
              "update_existing_lane|CFO: Refresh competitor pricing anchors",
              "handoff_existing_lane|CEO: Hand off the research lane",
              "update_existing_lane|CMO: Validate offer headline",
              "update_existing_lane|CFO: Re-check pricing anchors"
            ]
          })
        );

        await expect(repository.getCardContinuity(childCard.id)).resolves.toEqual(
          expect.objectContaining({
            cardId: childCard.id,
            runId: run.id,
            continuitySummary: "RESEARCHER should continue this active research brief lane: Gather competitor price anchors.",
            latestResultSummary: "Collected the first pricing-anchor round.",
            absorbedWorkItems: [
              "update_existing_lane|COO: Confirm fulfillment handoff",
              "update_existing_lane|CEO: Package tenant next steps",
              "update_existing_lane|CFO: Refresh competitor pricing anchors",
              "handoff_existing_lane|CEO: Hand off the research lane",
              "update_existing_lane|CMO: Validate offer headline",
              "update_existing_lane|CFO: Re-check pricing anchors"
            ]
          })
        );
        await expect(repository.listCardContinuityForRun(run.id)).resolves.toEqual([
          expect.objectContaining({
            cardId: childCard.id,
            runId: run.id,
            continuitySummary: "RESEARCHER should continue this active research brief lane: Gather competitor price anchors.",
            latestResultSummary: "Collected the first pricing-anchor round.",
            absorbedWorkItems: [
              "update_existing_lane|COO: Confirm fulfillment handoff",
              "update_existing_lane|CEO: Package tenant next steps",
              "update_existing_lane|CFO: Refresh competitor pricing anchors",
              "handoff_existing_lane|CEO: Hand off the research lane",
              "update_existing_lane|CMO: Validate offer headline",
              "update_existing_lane|CFO: Re-check pricing anchors"
            ]
          })
        ]);
      } finally {
        await client.end();
      }
    },
    120_000
  );

  it(
    "commits proposal approval before child-card insert when the deferred foreign key is satisfied by commit time",
    async () => {
      const database = requireDisposableHarnessDatabase();
      const client = new Client({ connectionString: database.connectionString });
      await client.connect();

      try {
        const runner = createPgTransactionRunner({
          connect: async () => ({
            query: (sql: string, values: readonly unknown[]) => client.query(sql, [...values]),
            release: () => undefined
          })
        });
        const repository = createPostgresHarnessRepository({
          query: async (sql: string, values: readonly unknown[]) => {
            const result = await client.query(sql, [...values]);
            return { rows: result.rows };
          }
        });
        const tenantId = randomUUID();
        const run = createHarnessRunRecord({
          tenantId,
          workflowId: "wf_connect_first_workflow",
          packageId: "pkg_bib_connect",
          orchestratorPersona: "ceo",
          runtimeContext: {
            providerKind: "openai_api",
            credentialLabel: "Primary OpenAI"
          }
        });
        const ceoCard = createHarnessCardRecord({
          runId: run.id,
          persona: "ceo",
          title: "Plan the first workflow",
          deliverableType: "plan"
        });
        const approvedChildCard = {
          ...createHarnessCardRecord({
            runId: run.id,
            parentCardId: ceoCard.id,
            persona: "cfo",
            title: "Validate pricing assumptions",
            deliverableType: "pricing_review"
          }),
          state: "approved" as const
        };
        const proposalId = randomUUID();

        await resetHarnessProofDatabase(client);
        await seedHarnessProofPrerequisites(client, tenantId);
        await repository.insertRun(run);
        await repository.insertCard(ceoCard);
        await repository.insertProposal({
          id: proposalId,
          runId: run.id,
          parentCardId: ceoCard.id,
          requestedByCardId: ceoCard.id,
          requestedByPersona: "ceo",
          persona: approvedChildCard.persona,
          title: approvedChildCard.title,
          deliverableType: approvedChildCard.deliverableType,
          status: "proposed"
        });

        await runner.withTransaction(async (transaction) => {
          const transactionalRepository = createPostgresHarnessRepository(transaction);
          await expect(
            transactionalRepository.markProposalApproved({
              proposalId,
              approvedCardId: approvedChildCard.id
            })
          ).resolves.toEqual({ updated: true });
          await expect(transactionalRepository.insertCard(approvedChildCard)).resolves.toBeUndefined();
        });

        await expect(repository.getProposal(proposalId)).resolves.toEqual(
          expect.objectContaining({
            id: proposalId,
            status: "approved",
            approvedCardId: approvedChildCard.id
          })
        );
        await expect(repository.listCardsForRun(run.id)).resolves.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: ceoCard.id }),
            expect.objectContaining({ id: approvedChildCard.id, state: "approved" })
          ])
        );
      } finally {
        await client.end();
      }
    },
    120_000
  );

  it(
    "rolls back proposal approval when commit reaches the deferred foreign key without a matching child card",
    async () => {
      const database = requireDisposableHarnessDatabase();
      const client = new Client({ connectionString: database.connectionString });
      await client.connect();

      try {
        const runner = createPgTransactionRunner({
          connect: async () => ({
            query: (sql: string, values: readonly unknown[]) => client.query(sql, [...values]),
            release: () => undefined
          })
        });
        const repository = createPostgresHarnessRepository({
          query: async (sql: string, values: readonly unknown[]) => {
            const result = await client.query(sql, [...values]);
            return { rows: result.rows };
          }
        });
        const tenantId = randomUUID();
        const run = createHarnessRunRecord({
          tenantId,
          workflowId: "wf_connect_first_workflow",
          packageId: "pkg_bib_connect",
          orchestratorPersona: "ceo",
          runtimeContext: {
            providerKind: "openai_api",
            credentialLabel: "Primary OpenAI"
          }
        });
        const ceoCard = createHarnessCardRecord({
          runId: run.id,
          persona: "ceo",
          title: "Plan the first workflow",
          deliverableType: "plan"
        });
        const missingApprovedCardId = randomUUID();
        const proposalId = randomUUID();

        await resetHarnessProofDatabase(client);
        await seedHarnessProofPrerequisites(client, tenantId);
        await repository.insertRun(run);
        await repository.insertCard(ceoCard);
        await repository.insertProposal({
          id: proposalId,
          runId: run.id,
          parentCardId: ceoCard.id,
          requestedByCardId: ceoCard.id,
          requestedByPersona: "ceo",
          persona: "cfo",
          title: "Validate pricing assumptions",
          deliverableType: "pricing_review",
          status: "proposed"
        });

        await expect(
          runner.withTransaction(async (transaction) => {
            const transactionalRepository = createPostgresHarnessRepository(transaction);
            await transactionalRepository.markProposalApproved({
              proposalId,
              approvedCardId: missingApprovedCardId
            });
          })
        ).rejects.toThrow(/harness_subcard_proposals_approved_card_id_fkey|violates foreign key constraint/i);

        await expect(repository.getProposal(proposalId)).resolves.toEqual(
          expect.objectContaining({
            id: proposalId,
            status: "proposed"
          })
        );
      } finally {
        await client.end();
      }
    },
      120_000
  );

  it(
    "round-trips harness export delivery bundles through the real Postgres repository mapping",
    async () => {
      const database = requireDisposableHarnessDatabase();
      const client = new Client({ connectionString: database.connectionString });
      const tenantId = "8beea757-39c8-4d97-a7ca-1c62172501d5";

      try {
        await client.connect();
        await resetHarnessProofDatabase(client);
        await seedHarnessProofPrerequisites(client, tenantId);

        const repository = createPostgresHarnessRepository({
          query: async (sql: string, values: readonly unknown[]) => {
            const result = await client.query(sql, [...values]);
            return { rows: result.rows };
          }
        });

        const run = createHarnessRunRecord({
          tenantId,
          workflowId: "wf_connect_first_workflow",
          packageId: "pkg_bib_connect",
          orchestratorPersona: "ceo",
          runtimeContext: {
            providerKind: "openai_api",
            credentialLabel: "Primary OpenAI"
          }
        });
        await repository.insertRun(run);

        const firstWrite = await repository.upsertExportDelivery({
          id: "11111111-1111-4111-8111-111111111111",
          runId: run.id,
          tenantId,
          workflowId: run.workflowId,
          packageId: run.packageId,
          candidateId: "governance_history_export",
          status: "export_ready",
          exportFormat: "obsidian_markdown_bundle",
          recordTarget: "governance_history_record",
          bundleId: "bundle_pg_1",
          idempotencyKey: `${run.id}:governance_history_export`,
          noteTitle: "Governance history",
          noteFileName: "wf_connect_first_workflow-governance-history.md",
          placementTargetSystem: "obsidian_vault",
          vaultFolder: "wealth-factory/governance-history/wf_connect_first_workflow",
          primaryNotePath:
            "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
          syncStrategy: "append_history_entry",
          confirmationRequirement: "tenant_export_confirmation",
          files: [
            {
              path: "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
              mediaType: "text/markdown",
              byteSize: 20,
              checksum: "abc123",
              content: "# Governance history"
            },
            {
              path: "wealth-factory/governance-history/wf_connect_first_workflow/manifest.json",
              mediaType: "application/json",
              byteSize: 42,
              checksum: "def456",
              content: "{\"ok\":true}"
            }
          ],
          recordCount: 2,
          disclosureSummary: "Decision summary only",
          redactionSummary: "Governance-safe redaction",
          attemptCount: 0,
          lastAttemptedAt: null,
          deliveredAt: null,
          writerKind: null,
          deliveryReceipt: {},
          lastErrorCode: null,
          lastErrorMessage: null,
          createdAt: "2026-05-29T00:00:00.000Z",
          updatedAt: "2026-05-29T00:00:00.000Z"
        });

        const secondWrite = await repository.upsertExportDelivery({
          ...firstWrite,
          bundleId: "bundle_pg_2",
          recordCount: 3,
          updatedAt: "2026-05-29T01:00:00.000Z"
        });

        expect(secondWrite.id).toBe(firstWrite.id);
        expect(secondWrite.createdAt).toBe(firstWrite.createdAt);
        expect(secondWrite.bundleId).toBe("bundle_pg_2");

        const delivered = await repository.recordExportDeliveryOutcome({
          idempotencyKey: `${run.id}:governance_history_export`,
          status: "delivered",
          writerKind: "obsidian_filesystem",
          deliveryReceipt: {
            primaryNotePath:
              "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
            writtenFileCount: 2
          },
          attemptCount: 1,
          lastAttemptedAt: "2026-05-29T01:00:00.000Z",
          deliveredAt: "2026-05-29T01:00:01.000Z",
          lastErrorCode: null,
          lastErrorMessage: null,
          updatedAt: "2026-05-29T01:00:01.000Z"
        });

        expect(delivered).toEqual(
          expect.objectContaining({
            status: "delivered",
            writerKind: "obsidian_filesystem",
            attemptCount: 1
          })
        );

        await expect(repository.listExportDeliveriesForRun(run.id)).resolves.toEqual([
          expect.objectContaining({
            id: firstWrite.id,
            runId: run.id,
            tenantId,
            workflowId: run.workflowId,
            packageId: run.packageId,
            bundleId: "bundle_pg_2",
            recordCount: 3,
            status: "delivered",
            writerKind: "obsidian_filesystem",
            attemptCount: 1,
            files: [
              expect.objectContaining({
                path: "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
                mediaType: "text/markdown"
              }),
              expect.objectContaining({
                path: "wealth-factory/governance-history/wf_connect_first_workflow/manifest.json",
                mediaType: "application/json"
              })
            ]
          })
        ]);
      } finally {
        await client.end();
      }
    },
    120_000
  );

  it(
    "claims harness export delivery attempts exactly once through the real Postgres repository mapping",
    async () => {
      const database = requireDisposableHarnessDatabase();
      const client = new Client({ connectionString: database.connectionString });
      const tenantId = "8beea757-39c8-4d97-a7ca-1c62172501d5";

      try {
        await client.connect();
        await resetHarnessProofDatabase(client);
        await seedHarnessProofPrerequisites(client, tenantId);

        const repository = createPostgresHarnessRepository({
          query: async (sql: string, values: readonly unknown[]) => {
            const result = await client.query(sql, [...values]);
            return { rows: result.rows };
          }
        });

        const run = createHarnessRunRecord({
          tenantId,
          workflowId: "wf_connect_first_workflow",
          packageId: "pkg_bib_connect",
          orchestratorPersona: "ceo",
          runtimeContext: {
            providerKind: "openai_api",
            credentialLabel: "Primary OpenAI"
          }
        });
        await repository.insertRun(run);
        await repository.upsertExportDelivery({
          id: "22222222-2222-4222-8222-222222222222",
          runId: run.id,
          tenantId,
          workflowId: run.workflowId,
          packageId: run.packageId,
          candidateId: "governance_history_export",
          status: "export_ready",
          exportFormat: "obsidian_markdown_bundle",
          recordTarget: "governance_history_record",
          bundleId: "bundle_pg_claim_1",
          idempotencyKey: `${run.id}:governance_history_claim`,
          noteTitle: "Governance history",
          noteFileName: "wf_connect_first_workflow-governance-history.md",
          placementTargetSystem: "obsidian_vault",
          vaultFolder: "wealth-factory/governance-history/wf_connect_first_workflow",
          primaryNotePath:
            "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
          syncStrategy: "append_history_entry",
          confirmationRequirement: "tenant_export_confirmation",
          files: [],
          recordCount: 2,
          disclosureSummary: "Decision summary only",
          redactionSummary: "Governance-safe redaction",
          attemptCount: 0,
          lastAttemptedAt: null,
          deliveredAt: null,
          writerKind: null,
          deliveryReceipt: {},
          lastErrorCode: null,
          lastErrorMessage: null,
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z"
        });

        const claimed = await repository.claimExportDeliveryAttempt({
          idempotencyKey: `${run.id}:governance_history_claim`,
          writerKind: "obsidian_filesystem",
          claimedAt: "2026-06-01T00:05:00.000Z",
          updatedAt: "2026-06-01T00:05:00.000Z"
        });
        const duplicateClaim = await repository.claimExportDeliveryAttempt({
          idempotencyKey: `${run.id}:governance_history_claim`,
          writerKind: "obsidian_filesystem",
          claimedAt: "2026-06-01T00:06:00.000Z",
          updatedAt: "2026-06-01T00:06:00.000Z"
        });

        expect(claimed).toEqual(
          expect.objectContaining({
            status: "delivery_in_progress",
            attemptCount: 1,
            writerKind: "obsidian_filesystem",
            lastAttemptedAt: "2026-06-01T00:05:00.000Z"
          })
        );
        expect(duplicateClaim).toBeNull();
      } finally {
        await client.end();
      }
    },
    120_000
  );
});

function hasDockerRuntime() {
  if (spawnSync("docker", ["--version"], { stdio: "ignore" }).status !== 0) {
    return false;
  }
  return spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], { stdio: "ignore" }).status === 0;
}

async function startDisposableHarnessDatabase(): Promise<DisposableHarnessDatabase> {
  const containerName = `wf-harness-proof-${randomUUID()}`;
  await ensureHarnessPostgresImage();
  await execFileAsync(
    "docker",
    [
      "run",
      "--detach",
      "--rm",
      "--name",
      containerName,
      "-e",
      `POSTGRES_PASSWORD=${HARNESS_POSTGRES_PASSWORD}`,
      "-e",
      `POSTGRES_DB=${HARNESS_POSTGRES_DB}`,
      "-P",
      HARNESS_POSTGRES_IMAGE
    ],
  );

  try {
    const { stdout } = await execFileAsync("docker", ["port", containerName, "5432/tcp"]);
    const hostPort = stdout
      .toString()
      .trim()
      .split(":")
      .at(-1);
    if (!hostPort) {
      throw new Error("Unable to resolve disposable Postgres port");
    }

    const connectionString = `postgresql://postgres:${HARNESS_POSTGRES_PASSWORD}@127.0.0.1:${hostPort}/${HARNESS_POSTGRES_DB}`;
    await waitForHarnessDatabase(connectionString);
    return {
      connectionString,
      async stop() {
        try {
          await execFileAsync("docker", ["rm", "-f", containerName], { timeout: 20_000 });
        } catch {
          // Container may already be gone because --rm is enabled.
        }
      }
    };
  } catch (error) {
    await execFileAsync("docker", ["rm", "-f", containerName], { timeout: 20_000 });
    throw error;
  }
}

async function waitForHarnessDatabase(connectionString: string) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const client = new Client({ connectionString });
    try {
      await client.connect();
      await client.query("select 1");
      await client.end();
      return;
    } catch {
      try {
        await client.end();
      } catch {
        // ignore close errors during startup polling
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error("Timed out waiting for disposable Postgres harness database");
}

async function ensureHarnessPostgresImage() {
  try {
    await execFileAsync("docker", ["image", "inspect", HARNESS_POSTGRES_IMAGE]);
  } catch {
    await execFileAsync("docker", ["pull", HARNESS_POSTGRES_IMAGE]);
  }
}

function requireDisposableHarnessDatabase() {
  if (!disposableHarnessDb) {
    throw new Error("Disposable Postgres harness database was not started");
  }
  return disposableHarnessDb;
}

async function resetHarnessProofDatabase(client: Client) {
  await client.query("drop schema if exists wfpc cascade");
  await client.query("drop schema if exists wfpc_private cascade");
  await client.query("create schema if not exists wfpc");
  await client.query("create schema if not exists wfpc_private");
  await client.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated;
      end if;
    end $$;
  `);
  await client.query(`
    create or replace function wfpc_private.is_tenant_member(input_tenant_id uuid)
    returns boolean
    language sql
    stable
    as $$
      select true;
    $$;
  `);
  await client.query(
    `create table if not exists wfpc.tenants (
      id uuid primary key,
      slug text not null,
      name text not null,
      status text not null default 'active',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      paused_at timestamptz null
    )`
  );
  await client.query(migration);
  await client.query(proposalMigration);
  await client.query(proposalResolutionMigration);
  await client.query(boardDecisionMigration);
  await client.query(boardMemoryMigration);
  await client.query(laneHandoffMigration);
  await client.query(cardContinuityMigration);
  await client.query(cardContinuitySourceMigration);
  await client.query(exportDeliveriesMigration);
  await client.query(exportDeliveriesRlsMigration);
  await client.query(exportDeliveryResultsMigration);
  await client.query(exportDeliveryClaimsMigration);
}

async function seedHarnessProofPrerequisites(client: Client, tenantId: string) {
  await client.query(
    `insert into wfpc.tenants (id, slug, name, status)
     values ($1, $2, $3, 'active')`,
    [tenantId, `tenant-${tenantId.slice(0, 8)}`, "Harness Proof Tenant"]
  );
}
