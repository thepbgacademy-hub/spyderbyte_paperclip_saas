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
const exportDeliveryBundleRevisionMigration = readFileSync("supabase/migrations/0026_wf_harness_export_delivery_bundle_revision.sql", "utf8");
const completionPackageSnapshotsMigration = readFileSync("supabase/migrations/0027_wf_harness_completion_package_snapshots.sql", "utf8");
const governanceHistorySnapshotsMigration = readFileSync("supabase/migrations/0028_wf_harness_governance_history_snapshots.sql", "utf8");
const cardExecutionClaimsMigration = readFileSync("supabase/migrations/0029_wf_harness_card_execution_claims.sql", "utf8");
const taxStrategyPrerequisiteSnapshotsMigration = readFileSync("supabase/migrations/0033_wf_harness_tax_strategy_prerequisite_snapshots.sql", "utf8");
const execFileAsync = promisify(execFile);

const HARNESS_POSTGRES_IMAGE = "postgres:16-alpine";
const HARNESS_POSTGRES_PASSWORD = "wf_harness_test_pw";
const HARNESS_POSTGRES_DB = "wf_harness_test";
const dockerAvailable = hasDockerRuntime();

type DisposableHarnessDatabase = {
  connectionString: string;
  stop(): Promise<void>;
};

type HarnessProofRepositoryClient = {
  repository: ReturnType<typeof createPostgresHarnessRepository>;
  close(): Promise<void>;
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

  it("normalizes Postgres Date run timestamps into ISO strings when mapping repository rows", async () => {
    const createdAt = new Date("2026-06-01T00:00:00.000Z");
    const updatedAt = new Date("2026-06-01T00:05:00.000Z");
    const repository = createPostgresHarnessRepository({
      query: vi.fn(async () => ({
        rows: [
          {
            id: "run_pg_date_1",
            tenant_id: "tenant-123",
            workflow_id: "wf_connect_first_workflow",
            package_id: "pkg_bib_connect",
            orchestrator_persona: "ceo",
            state: "assembling",
            runtime_context: {
              providerKind: "openai_api",
              credentialLabel: "Primary OpenAI"
            },
            created_at: createdAt,
            updated_at: updatedAt
          }
        ]
      }))
    });

    await expect(repository.getRun("run_pg_date_1")).resolves.toEqual(
      expect.objectContaining({
        id: "run_pg_date_1",
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString()
      })
    );
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

  it("records and clears bounded execution-claim tokens as lanes enter and leave working state", async () => {
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
    card.state = "approved";

    await repository.insertRun(run);
    await repository.insertCard(card);

    const claimedCard = await repository.claimCardForExecution({
      cardId: card.id,
      expectedState: "approved"
    });
    expect(claimedCard).toEqual(
      expect.objectContaining({
        id: card.id,
        state: "working",
        executionClaimToken: expect.any(String),
        executionClaimedAt: expect.any(String)
      })
    );

    const completedCard = await repository.transitionCardState({
      cardId: card.id,
      expectedState: "working",
      ...(claimedCard?.executionClaimToken ? { expectedExecutionClaimToken: claimedCard.executionClaimToken } : {}),
      state: "done"
    });
    expect(completedCard).toEqual(
      expect.objectContaining({
        id: card.id,
        state: "done",
        executionClaimToken: null,
        executionClaimedAt: null
      })
    );
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
      bundleRevision: "bundle_revision_123",
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
      bundleRevision: "bundle_revision_456",
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
    expect(secondWrite.bundleRevision).toBe("bundle_revision_456");

    const claimed = await repository.claimExportDeliveryAttempt({
      idempotencyKey: "governance_history_export:run_123",
      writerKind: "obsidian_filesystem",
      claimedAt: "2026-05-29T01:00:00.000Z",
      updatedAt: "2026-05-29T01:00:00.000Z"
    });

    expect(claimed).toEqual(
      expect.objectContaining({
        status: "delivery_in_progress",
        attemptCount: 1
      })
    );

    const delivered = await repository.recordExportDeliveryOutcome({
      idempotencyKey: "governance_history_export:run_123",
      expectedLastAttemptedAt: "2026-05-29T01:00:00.000Z",
      status: "delivered",
      writerKind: "obsidian_filesystem",
      deliveryReceipt: {
        primaryNotePath:
          "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
        writtenFileCount: 2,
        writtenPaths: [
          "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
          "wealth-factory/governance-history/wf_connect_first_workflow/manifest.json"
        ]
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
        deliveredAt: "2026-05-29T01:00:01.000Z",
        deliveryReceipt: expect.objectContaining({
          writtenPaths: [
            "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
            "wealth-factory/governance-history/wf_connect_first_workflow/manifest.json"
          ]
        })
      })
    );

    await expect(repository.listExportDeliveriesForRun(run.id)).resolves.toEqual([
      expect.objectContaining({
        id: firstWrite.id,
        runId: run.id,
        bundleId: "bundle_456",
        bundleRevision: "bundle_revision_456",
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

  it("stores bounded completion-package snapshots in the minimal in-memory repository", async () => {
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
    await repository.upsertCompletionPackageSnapshot({
      runId: run.id,
      tenantId: run.tenantId,
      workflowId: run.workflowId,
      packageId: run.packageId,
      status: "done",
      summary: "The CEO packaged the final business-facing outcome.",
      deferredApprovalCount: 1,
      deniedApprovalCount: 0,
      hasOpenGovernanceItems: true,
      packageNote: "The board is packaging completed work while keeping deferred follow-up requests visible for later CEO review.",
      recommendations: ["Package only completed lanes into the tenant-facing board outcome."],
      objections: ["Hold this research brief request until the active lane count drops."],
      governanceItems: [
        {
          proposalId: "proposal_completion_deferred_1",
          statusLabel: "Deferred for later CEO review",
          persona: "RESEARCHER",
          deliverableLabel: "Research Brief",
          policyReasonLabel: "Lane cap protection",
          recommendationSummary: "Finish or close one active lane before reopening this research brief request.",
          objectionSummary: "Hold this research brief request until the active lane count drops.",
          nextReviewTrigger: "Review again when one of the active child lanes closes."
        }
      ],
      deliverables: [
        {
          cardId: "card_done_1",
          persona: "CFO",
          title: "Pressure-test the pricing lane",
          deliverableLabel: "Pricing Review",
          outcome: "Pricing floor is stable enough for launch."
        }
      ],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z"
    });

    await expect(repository.getCompletionPackageSnapshot(run.id)).resolves.toEqual(
      expect.objectContaining({
        runId: run.id,
        status: "done",
        summary: "The CEO packaged the final business-facing outcome.",
        governanceItems: [
          expect.objectContaining({
            proposalId: "proposal_completion_deferred_1"
          })
        ],
        deliverables: [
          expect.objectContaining({
            cardId: "card_done_1"
          })
        ]
      })
    );
  });

  it("stores bounded governance-history snapshots in the minimal in-memory repository", async () => {
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
    await repository.upsertGovernanceHistorySnapshot({
      runId: run.id,
      tenantId: run.tenantId,
      workflowId: run.workflowId,
      packageId: run.packageId,
      recentDecisions: [
        {
          id: "decision_1",
          decisionKind: "run_completed",
          label: "CEO completed the board",
          resolution: "Completed package assembly",
          timestampLabel: "Jun 1, 2026"
        }
      ],
      followThroughItems: [
        {
          id: "decision_follow_1",
          action: "packaged_outcome",
          summary: "Packaged the closed-board outcome for tenant export.",
          resolutionLabel: "Packaged for export",
          timestampLabel: "Jun 1, 2026"
        }
      ],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z"
    });

    await expect(repository.getGovernanceHistorySnapshot(run.id)).resolves.toEqual(
      expect.objectContaining({
        runId: run.id,
        recentDecisions: [
          expect.objectContaining({
            id: "decision_1"
          })
        ],
        followThroughItems: [
          expect.objectContaining({
            id: "decision_follow_1"
          })
        ]
      })
    );
  });

  it("stores bounded tax-strategy prerequisite snapshots in the minimal in-memory repository", async () => {
    const repository = createInMemoryHarnessRepository();
    const run = createHarnessRunRecord({
      tenantId: "tenant-123",
      workflowId: "wf_tax_strategy",
      packageId: "pkg_tax_strategy",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });

    await repository.insertRun(run);
    await repository.upsertTaxStrategyPrerequisiteSnapshot({
      runId: run.id,
      tenantId: run.tenantId,
      workflowId: run.workflowId,
      packageId: run.packageId,
      evidence: [
        {
          artifactName: "founder_tax_posture_documents",
          status: "confirmed",
          summary: "Founder tax posture documents were confirmed for bounded tax review.",
          confirmedBy: "operator",
          taxYear: "2025",
          entityType: "llc",
          confirmedAt: "2026-06-23T16:00:00.000Z"
        }
      ],
      createdAt: "2026-06-23T16:00:00.000Z",
      updatedAt: "2026-06-23T16:00:00.000Z"
    });

    await expect(repository.getTaxStrategyPrerequisiteSnapshot(run.id)).resolves.toEqual(
      expect.objectContaining({
        runId: run.id,
        evidence: [
          expect.objectContaining({
            artifactName: "founder_tax_posture_documents",
            taxYear: "2025"
          })
        ]
      })
    );
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
      bundleRevision: "bundle_claim_revision_1",
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

  it("can recover a stale in-progress governance-history delivery claim in the minimal in-memory repository", async () => {
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
      id: "export_delivery_claim_recover_1",
      runId: run.id,
      tenantId: run.tenantId,
      workflowId: run.workflowId,
      packageId: run.packageId,
      candidateId: "governance_history_export",
      status: "delivery_in_progress",
      exportFormat: "obsidian_markdown_bundle",
      recordTarget: "governance_history_record",
      bundleId: "bundle_claim_recover_1",
      bundleRevision: "bundle_claim_recover_revision_1",
      idempotencyKey: "governance_history_export:recover",
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
      attemptCount: 1,
      lastAttemptedAt: "2026-06-01T00:00:00.000Z",
      deliveredAt: null,
      writerKind: "obsidian_filesystem",
      deliveryReceipt: {},
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z"
    });

    const recoveredClaim = await repository.claimExportDeliveryAttempt({
      idempotencyKey: "governance_history_export:recover",
      writerKind: "obsidian_filesystem",
      claimedAt: "2026-06-01T00:15:00.000Z",
      updatedAt: "2026-06-01T00:15:00.000Z"
    });

    expect(recoveredClaim).toEqual(
      expect.objectContaining({
        status: "delivery_in_progress",
        attemptCount: 2,
        lastAttemptedAt: "2026-06-01T00:15:00.000Z"
      })
    );

    await expect(
      repository.recordExportDeliveryOutcome({
        idempotencyKey: "governance_history_export:recover",
        expectedLastAttemptedAt: "2026-06-01T00:00:00.000Z",
        status: "delivery_failed",
        writerKind: "obsidian_filesystem",
        deliveryReceipt: {},
        attemptCount: 1,
        lastAttemptedAt: "2026-06-01T00:00:00.000Z",
        deliveredAt: null,
        lastErrorCode: "late_writer",
        lastErrorMessage: "The stale writer returned after the claim was recovered.",
        updatedAt: "2026-06-01T00:16:00.000Z"
      })
    ).resolves.toBeNull();

    await expect(
      repository.recordExportDeliveryOutcome({
        idempotencyKey: "governance_history_export:recover",
        expectedLastAttemptedAt: "2026-06-01T00:15:00.000Z",
        status: "delivered",
        writerKind: "obsidian_filesystem",
        deliveryReceipt: {
          writtenFileCount: 2
        },
        attemptCount: 2,
        lastAttemptedAt: "2026-06-01T00:15:00.000Z",
        deliveredAt: "2026-06-01T00:15:01.000Z",
        lastErrorCode: null,
        lastErrorMessage: null,
        updatedAt: "2026-06-01T00:15:01.000Z"
      })
    ).resolves.toEqual(
      expect.objectContaining({
        status: "delivered",
        attemptCount: 2,
        lastAttemptedAt: "2026-06-01T00:15:00.000Z"
      })
    );
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
      state: "working" as const,
      executionClaimToken: "claim-working-card",
      executionClaimedAt: "2026-06-02T00:00:00.000Z"
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
          state: "working" as const,
          executionClaimToken: "claim-working-card-pg",
          executionClaimedAt: "2026-06-02T00:00:00.000Z"
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
    "isolates concurrent execution claims to one winner per lane while other runs remain claimable through the real Postgres repository mapping",
    async () => {
      const database = requireDisposableHarnessDatabase();
      const setupClient = new Client({ connectionString: database.connectionString });
      await setupClient.connect();
      const primaryClaimer = await createDisposableHarnessProofRepositoryClient(database.connectionString);
      const competingClaimer = await createDisposableHarnessProofRepositoryClient(database.connectionString);
      const isolatedRunClaimer = await createDisposableHarnessProofRepositoryClient(database.connectionString);

      try {
        const tenantId = randomUUID();
        const secondTenantId = randomUUID();
        await resetHarnessProofDatabase(setupClient);
        await seedHarnessProofPrerequisites(setupClient, tenantId);
        await seedHarnessProofPrerequisites(setupClient, secondTenantId);

        const firstRun = createHarnessRunRecord({
          tenantId,
          workflowId: "wf_connect_first_workflow",
          packageId: "pkg_bib_connect",
          orchestratorPersona: "ceo",
          runtimeContext: {
            providerKind: "openai_api",
            credentialLabel: "Primary OpenAI"
          }
        });
        const secondRun = createHarnessRunRecord({
          tenantId: secondTenantId,
          workflowId: "wf_connect_first_workflow",
          packageId: "pkg_bib_connect",
          orchestratorPersona: "ceo",
          runtimeContext: {
            providerKind: "openai_api",
            credentialLabel: "Primary OpenAI"
          }
        });
        const contestedCard = {
          ...createHarnessCardRecord({
            runId: firstRun.id,
            persona: "cfo",
            title: "Pressure-test the pricing lane",
            deliverableType: "pricing_review"
          }),
          state: "approved" as const
        };
        const isolatedCard = {
          ...createHarnessCardRecord({
            runId: secondRun.id,
            persona: "researcher",
            title: "Research the launch lane",
            deliverableType: "research_brief"
          }),
          state: "approved" as const
        };

        await primaryClaimer.repository.insertRun(firstRun);
        await primaryClaimer.repository.insertRun(secondRun);
        await primaryClaimer.repository.insertCard(contestedCard);
        await primaryClaimer.repository.insertCard(isolatedCard);

        const [firstClaim, duplicateClaim, isolatedClaim] = await Promise.all([
          primaryClaimer.repository.claimCardForExecution({
            cardId: contestedCard.id,
            expectedState: "approved"
          }),
          competingClaimer.repository.claimCardForExecution({
            cardId: contestedCard.id,
            expectedState: "approved"
          }),
          isolatedRunClaimer.repository.claimCardForExecution({
            cardId: isolatedCard.id,
            expectedState: "approved"
          })
        ]);

        expect([firstClaim, duplicateClaim].filter((candidate) => candidate !== null)).toHaveLength(1);
        expect(firstClaim ?? duplicateClaim).toEqual(
          expect.objectContaining({
            id: contestedCard.id,
            runId: firstRun.id,
            state: "working",
            executionClaimToken: expect.any(String),
            executionClaimedAt: expect.any(String)
          })
        );
        expect(isolatedClaim).toEqual(
          expect.objectContaining({
            id: isolatedCard.id,
            runId: secondRun.id,
            state: "working",
            executionClaimToken: expect.any(String),
            executionClaimedAt: expect.any(String)
          })
        );
        await expect(primaryClaimer.repository.getCard(contestedCard.id)).resolves.toEqual(
          expect.objectContaining({
            id: contestedCard.id,
            state: "working"
          })
        );
        await expect(primaryClaimer.repository.getCard(isolatedCard.id)).resolves.toEqual(
          expect.objectContaining({
            id: isolatedCard.id,
            state: "working"
          })
        );
      } finally {
        await Promise.all([
          primaryClaimer.close(),
          competingClaimer.close(),
          isolatedRunClaimer.close(),
          setupClient.end()
        ]);
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
          bundleRevision: "bundle_pg_revision_1",
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
          bundleRevision: "bundle_pg_revision_2",
          recordCount: 3,
          updatedAt: "2026-05-29T01:00:00.000Z"
        });

        expect(secondWrite.id).toBe(firstWrite.id);
        expect(secondWrite.createdAt).toBe(firstWrite.createdAt);
        expect(secondWrite.bundleId).toBe("bundle_pg_2");
        expect(secondWrite.bundleRevision).toBe("bundle_pg_revision_2");

        const claimed = await repository.claimExportDeliveryAttempt({
          idempotencyKey: `${run.id}:governance_history_export`,
          writerKind: "obsidian_filesystem",
          claimedAt: "2026-05-29T01:00:00.000Z",
          updatedAt: "2026-05-29T01:00:00.000Z"
        });

        expect(claimed).toEqual(
          expect.objectContaining({
            status: "delivery_in_progress",
            attemptCount: 1
          })
        );

        const delivered = await repository.recordExportDeliveryOutcome({
          idempotencyKey: `${run.id}:governance_history_export`,
          expectedLastAttemptedAt: "2026-05-29T01:00:00.000Z",
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
            bundleRevision: "bundle_pg_revision_2",
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
          bundleRevision: "bundle_pg_claim_revision_1",
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

        const recoveredClaim = await repository.claimExportDeliveryAttempt({
          idempotencyKey: `${run.id}:governance_history_claim`,
          writerKind: "obsidian_filesystem",
          claimedAt: "2026-06-01T00:20:00.000Z",
          updatedAt: "2026-06-01T00:20:00.000Z"
        });

        expect(recoveredClaim).toEqual(
          expect.objectContaining({
            status: "delivery_in_progress",
            attemptCount: 2,
            lastAttemptedAt: "2026-06-01T00:20:00.000Z"
          })
        );

        await expect(
          repository.recordExportDeliveryOutcome({
            idempotencyKey: `${run.id}:governance_history_claim`,
            expectedLastAttemptedAt: "2026-06-01T00:05:00.000Z",
            status: "delivery_failed",
            writerKind: "obsidian_filesystem",
            deliveryReceipt: {},
            attemptCount: 1,
            lastAttemptedAt: "2026-06-01T00:05:00.000Z",
            deliveredAt: null,
            lastErrorCode: "late_writer",
            lastErrorMessage: "The stale writer returned after the claim was recovered.",
            updatedAt: "2026-06-01T00:20:30.000Z"
          })
        ).resolves.toBeNull();

        await expect(
          repository.recordExportDeliveryOutcome({
            idempotencyKey: `${run.id}:governance_history_claim`,
            expectedLastAttemptedAt: "2026-06-01T00:20:00.000Z",
            status: "delivered",
            writerKind: "obsidian_filesystem",
            deliveryReceipt: {
              writtenFileCount: 2
            },
            attemptCount: 2,
            lastAttemptedAt: "2026-06-01T00:20:00.000Z",
            deliveredAt: "2026-06-01T00:20:01.000Z",
            lastErrorCode: null,
            lastErrorMessage: null,
            updatedAt: "2026-06-01T00:20:01.000Z"
          })
        ).resolves.toEqual(
          expect.objectContaining({
            status: "delivered",
            attemptCount: 2,
            lastAttemptedAt: "2026-06-01T00:20:00.000Z"
          })
        );
      } finally {
        await client.end();
      }
    },
    120_000
  );
  it(
    "stores bounded completion-package snapshots in the real Postgres repository",
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

        await resetHarnessProofDatabase(client);
        await seedHarnessProofPrerequisites(client, tenantId);
        await client.query(completionPackageSnapshotsMigration);
        await repository.insertRun(run);
        await repository.upsertCompletionPackageSnapshot({
          runId: run.id,
          tenantId: run.tenantId,
          workflowId: run.workflowId,
          packageId: run.packageId,
          status: "done",
          summary: "The CEO packaged the final business-facing outcome.",
          deferredApprovalCount: 0,
          deniedApprovalCount: 0,
          hasOpenGovernanceItems: false,
          packageNote: "Closed-board deliverables are ready to promote into a tenant-owned package bundle.",
          recommendations: ["Package only completed lanes into the tenant-facing board outcome."],
          objections: [],
          governanceItems: [],
          deliverables: [
            {
              cardId: "card_done_pg_1",
              persona: "CFO",
              title: "Pressure-test the pricing lane",
              deliverableLabel: "Pricing Review",
              outcome: "Pricing floor is stable enough for launch."
            }
          ],
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z"
        });

        await expect(repository.getCompletionPackageSnapshot(run.id)).resolves.toEqual(
          expect.objectContaining({
            runId: run.id,
            status: "done",
            deliverables: [
              expect.objectContaining({
                cardId: "card_done_pg_1"
              })
            ]
          })
        );
      } finally {
        await client.end();
      }
    },
    120_000
  );
  it(
    "accepts Date objects for completion-package snapshot timestamps in the real Postgres repository",
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
        const snapshotCreatedAt = new Date("2026-06-01T00:00:00.000Z");
        const snapshotUpdatedAt = new Date("2026-06-01T00:05:00.000Z");

        await resetHarnessProofDatabase(client);
        await seedHarnessProofPrerequisites(client, tenantId);
        await client.query(completionPackageSnapshotsMigration);
        await repository.insertRun(run);

        await expect(repository.upsertCompletionPackageSnapshot({
          runId: run.id,
          tenantId: run.tenantId,
          workflowId: run.workflowId,
          packageId: run.packageId,
          status: "done",
          summary: "The CEO packaged the final business-facing outcome.",
          deferredApprovalCount: 0,
          deniedApprovalCount: 0,
          hasOpenGovernanceItems: false,
          packageNote: "Closed-board deliverables are ready to promote into a tenant-owned package bundle.",
          recommendations: ["Package only completed lanes into the tenant-facing board outcome."],
          objections: [],
          governanceItems: [],
          deliverables: [
            {
              cardId: "card_done_pg_date_1",
              persona: "CFO",
              title: "Pressure-test the pricing lane",
              deliverableLabel: "Pricing Review",
              outcome: "Pricing floor is stable enough for launch."
            }
          ],
          createdAt: snapshotCreatedAt as unknown as string,
          updatedAt: snapshotUpdatedAt as unknown as string
        })).resolves.toEqual(
          expect.objectContaining({
            runId: run.id,
            createdAt: snapshotCreatedAt.toISOString(),
            updatedAt: snapshotUpdatedAt.toISOString()
          })
        );
      } finally {
        await client.end();
      }
    },
    120_000
  );
  it(
    "stores bounded governance-history snapshots in the real Postgres repository",
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

        await resetHarnessProofDatabase(client);
        await seedHarnessProofPrerequisites(client, tenantId);
        await client.query(governanceHistorySnapshotsMigration);
        await repository.insertRun(run);
        await repository.upsertGovernanceHistorySnapshot({
          runId: run.id,
          tenantId: run.tenantId,
          workflowId: run.workflowId,
          packageId: run.packageId,
          recentDecisions: [
            {
              id: "decision_pg_1",
              decisionKind: "run_completed",
              label: "CEO completed the board",
              resolution: "Completed package assembly",
              timestampLabel: "Jun 1, 2026"
            }
          ],
          followThroughItems: [
            {
              id: "decision_pg_follow_1",
              action: "packaged_outcome",
              summary: "Packaged the closed-board outcome for tenant export.",
              resolutionLabel: "Packaged for export",
              timestampLabel: "Jun 1, 2026"
            }
          ],
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z"
        });

        await expect(repository.getGovernanceHistorySnapshot(run.id)).resolves.toEqual(
          expect.objectContaining({
            runId: run.id,
            recentDecisions: [
              expect.objectContaining({
                id: "decision_pg_1"
              })
            ],
            followThroughItems: [
              expect.objectContaining({
                id: "decision_pg_follow_1"
              })
            ]
          })
        );
      } finally {
        await client.end();
      }
    },
    120_000
  );
  it(
    "accepts Date objects for governance-history snapshot timestamps in the real Postgres repository",
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
        const snapshotCreatedAt = new Date("2026-06-01T00:00:00.000Z");
        const snapshotUpdatedAt = new Date("2026-06-01T00:05:00.000Z");

        await resetHarnessProofDatabase(client);
        await seedHarnessProofPrerequisites(client, tenantId);
        await client.query(governanceHistorySnapshotsMigration);
        await repository.insertRun(run);

        await expect(repository.upsertGovernanceHistorySnapshot({
          runId: run.id,
          tenantId: run.tenantId,
          workflowId: run.workflowId,
          packageId: run.packageId,
          recentDecisions: [
            {
              id: "decision_pg_date_1",
              decisionKind: "run_completed",
              label: "CEO completed the board",
              resolution: "Completed package assembly",
              timestampLabel: "Jun 1, 2026"
            }
          ],
          followThroughItems: [
            {
              id: "decision_pg_follow_date_1",
              action: "packaged_outcome",
              summary: "Packaged the closed-board outcome for tenant export.",
              resolutionLabel: "Packaged for export",
              timestampLabel: "Jun 1, 2026"
            }
          ],
          createdAt: snapshotCreatedAt as unknown as string,
          updatedAt: snapshotUpdatedAt as unknown as string
        })).resolves.toEqual(
          expect.objectContaining({
            runId: run.id,
            createdAt: snapshotCreatedAt.toISOString(),
            updatedAt: snapshotUpdatedAt.toISOString()
          })
        );
      } finally {
        await client.end();
      }
    },
    120_000
  );
  it(
    "stores bounded tax-strategy prerequisite snapshots in the real Postgres repository",
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
          workflowId: "wf_tax_strategy",
          packageId: "pkg_tax_strategy",
          orchestratorPersona: "ceo",
          runtimeContext: {
            providerKind: "openai_api",
            credentialLabel: "Primary OpenAI"
          }
        });

        await resetHarnessProofDatabase(client);
        await seedHarnessProofPrerequisites(client, tenantId);
        await client.query(taxStrategyPrerequisiteSnapshotsMigration);
        await repository.insertRun(run);
        await repository.upsertTaxStrategyPrerequisiteSnapshot({
          runId: run.id,
          tenantId: run.tenantId,
          workflowId: run.workflowId,
          packageId: run.packageId,
          evidence: [
            {
              artifactName: "founder_tax_posture_documents",
              status: "confirmed",
              summary: "Founder tax posture documents were confirmed for bounded tax review.",
              confirmedBy: "operator",
              taxYear: "2025",
              entityType: "llc",
              confirmedAt: "2026-06-23T16:00:00.000Z"
            }
          ],
          createdAt: "2026-06-23T16:00:00.000Z",
          updatedAt: "2026-06-23T16:00:00.000Z"
        });

        await expect(repository.getTaxStrategyPrerequisiteSnapshot(run.id)).resolves.toEqual(
          expect.objectContaining({
            runId: run.id,
            evidence: [
              expect.objectContaining({
                artifactName: "founder_tax_posture_documents",
                taxYear: "2025"
              })
            ]
          })
        );
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

async function createDisposableHarnessProofRepositoryClient(
  connectionString: string
): Promise<HarnessProofRepositoryClient> {
  const client = new Client({ connectionString });
  await client.connect();

  return {
    repository: createPostgresHarnessRepository({
      query: async (sql: string, values: readonly unknown[]) => {
        const result = await client.query(sql, [...values]);
        return { rows: result.rows };
      }
    }),
    async close() {
      await client.end();
    }
  };
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
  const deadline = Date.now() + 240_000;
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
  await client.query(exportDeliveryBundleRevisionMigration);
  await client.query(completionPackageSnapshotsMigration);
  await client.query(governanceHistorySnapshotsMigration);
  await client.query(cardExecutionClaimsMigration);
}

async function seedHarnessProofPrerequisites(client: Client, tenantId: string) {
  await client.query(
    `insert into wfpc.tenants (id, slug, name, status)
     values ($1, $2, $3, 'active')`,
    [tenantId, `tenant-${tenantId.slice(0, 8)}`, "Harness Proof Tenant"]
  );
}
