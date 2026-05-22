import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { createPgTransactionRunner } from "../src/db/postgres-client.js";
import { createInMemoryHarnessRepository, createPostgresHarnessRepository } from "../src/harness/repository.js";
import {
  createHarnessCardEventRecord,
  createHarnessCardRecord,
  createHarnessRunRecord
} from "../src/harness/types.js";

const migration = readFileSync("supabase/migrations/0013_wf_harness_runs_cards.sql", "utf8");
const proposalMigration = readFileSync("supabase/migrations/0014_wf_harness_subcard_proposals.sql", "utf8");

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
});
