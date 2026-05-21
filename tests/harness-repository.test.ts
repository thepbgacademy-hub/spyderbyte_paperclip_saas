import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createHarnessCardEventRecord,
  createHarnessCardRecord,
  createHarnessRunRecord
} from "../src/harness/types.js";
import { createInMemoryHarnessRepository } from "../src/harness/repository.js";

const migration = readFileSync("supabase/migrations/0013_wf_harness_runs_cards.sql", "utf8");

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

    await expect(repository.getRun(run.id)).resolves.toEqual(run);
    await expect(repository.listCardsForRun(run.id)).resolves.toEqual([card]);
    await expect(repository.listEventsForCard(card.id)).resolves.toEqual([event]);
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
});
