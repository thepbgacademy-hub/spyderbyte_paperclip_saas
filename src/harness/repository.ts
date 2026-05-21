import type { HarnessCardEventRow, HarnessCardRow, HarnessRunRow } from "../db/types.js";
import type { QueryClient } from "../db/supabase-repositories.js";
import type { HarnessCardEventRecord, HarnessCardRecord, HarnessRunRecord } from "./types.js";

export interface HarnessRepository {
  insertRun(run: HarnessRunRecord): Promise<void>;
  getRun(runId: string): Promise<HarnessRunRecord | null>;
  findLatestRunForTenantWorkflow(input: { tenantId: string; workflowId: string }): Promise<HarnessRunRecord | null>;
  insertCard(card: HarnessCardRecord): Promise<void>;
  listCardsForRun(runId: string): Promise<HarnessCardRecord[]>;
  insertEvent(event: HarnessCardEventRecord): Promise<void>;
  listEventsForCard(cardId: string): Promise<HarnessCardEventRecord[]>;
  listEventsForRun(runId: string): Promise<HarnessCardEventRecord[]>;
}

export function createInMemoryHarnessRepository(): HarnessRepository {
  const runs = new Map<string, HarnessRunRecord>();
  const cards = new Map<string, HarnessCardRecord[]>();
  const events = new Map<string, HarnessCardEventRecord[]>();

  return {
    async insertRun(run) {
      runs.set(run.id, run);
    },

    async getRun(runId) {
      return runs.get(runId) ?? null;
    },

    async findLatestRunForTenantWorkflow(input) {
      const matchingRuns = [...runs.values()].filter(
        (run) => run.tenantId === input.tenantId && run.workflowId === input.workflowId
      );
      return matchingRuns.at(-1) ?? null;
    },

    async insertCard(card) {
      const runCards = cards.get(card.runId) ?? [];
      cards.set(card.runId, [...runCards, card]);
    },

    async listCardsForRun(runId) {
      return [...(cards.get(runId) ?? [])];
    },

    async insertEvent(event) {
      const cardEvents = events.get(event.cardId) ?? [];
      events.set(event.cardId, [...cardEvents, event]);
    },

    async listEventsForCard(cardId) {
      return [...(events.get(cardId) ?? [])];
    },

    async listEventsForRun(runId) {
      const runCards = cards.get(runId) ?? [];
      return runCards.flatMap((card) => events.get(card.id) ?? []);
    }
  };
}

export function createPostgresHarnessRepository(client: QueryClient): HarnessRepository {
  return {
    async insertRun(run) {
      await client.query(
        `insert into wfpc.harness_runs
          (id, tenant_id, workflow_id, package_id, orchestrator_persona, state, runtime_context, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz, $9::timestamptz)`,
        [
          run.id,
          run.tenantId,
          run.workflowId,
          run.packageId,
          run.orchestratorPersona,
          run.state,
          JSON.stringify(run.runtimeContext),
          run.createdAt,
          run.updatedAt
        ]
      );
    },

    async getRun(runId) {
      const result = await client.query(
        `select id, tenant_id, workflow_id, package_id, orchestrator_persona, state, runtime_context, created_at, updated_at
         from wfpc.harness_runs
         where id = $1
         limit 1`,
        [runId]
      );
      return mapHarnessRunRow(result.rows[0]);
    },

    async findLatestRunForTenantWorkflow(input) {
      const result = await client.query(
        `select id, tenant_id, workflow_id, package_id, orchestrator_persona, state, runtime_context, created_at, updated_at
         from wfpc.harness_runs
         where tenant_id = $1
           and workflow_id = $2
         order by updated_at desc, created_at desc
         limit 1`,
        [input.tenantId, input.workflowId]
      );
      return mapHarnessRunRow(result.rows[0]);
    },

    async insertCard(card) {
      await client.query(
        `insert into wfpc.harness_cards
          (id, run_id, parent_card_id, persona, title, deliverable_type, state, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz)`,
        [card.id, card.runId, card.parentCardId, card.persona, card.title, card.deliverableType, card.state, card.createdAt, card.updatedAt]
      );
    },

    async listCardsForRun(runId) {
      const result = await client.query(
        `select id, run_id, parent_card_id, persona, title, deliverable_type, state, created_at, updated_at
         from wfpc.harness_cards
         where run_id = $1
         order by created_at asc`,
        [runId]
      );
      return result.rows.map(mapHarnessCardRow).filter((card): card is HarnessCardRecord => card !== null);
    },

    async insertEvent(event) {
      await client.query(
        `insert into wfpc.harness_card_events
          (id, card_id, event_kind, payload, created_at)
         values ($1, $2, $3, $4::jsonb, $5::timestamptz)`,
        [event.id, event.cardId, event.eventKind, JSON.stringify(event.payload), event.createdAt]
      );
    },

    async listEventsForCard(cardId) {
      const result = await client.query(
        `select id, card_id, event_kind, payload, created_at
         from wfpc.harness_card_events
         where card_id = $1
         order by created_at asc`,
        [cardId]
      );
      return result.rows.map(mapHarnessCardEventRow).filter((event): event is HarnessCardEventRecord => event !== null);
    },

    async listEventsForRun(runId) {
      const result = await client.query(
        `select events.id, events.card_id, events.event_kind, events.payload, events.created_at
         from wfpc.harness_card_events events
         join wfpc.harness_cards cards
           on cards.id = events.card_id
         where cards.run_id = $1
         order by events.created_at asc`,
        [runId]
      );
      return result.rows.map(mapHarnessCardEventRow).filter((event): event is HarnessCardEventRecord => event !== null);
    }
  };
}

export function toHarnessRunRow(record: HarnessRunRecord): HarnessRunRow {
  return {
    id: record.id,
    tenantId: record.tenantId,
    workflowId: record.workflowId,
    packageId: record.packageId,
    orchestratorPersona: record.orchestratorPersona,
    state: record.state,
    runtimeContext: record.runtimeContext,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

export function toHarnessCardRow(record: HarnessCardRecord): HarnessCardRow {
  return {
    id: record.id,
    runId: record.runId,
    parentCardId: record.parentCardId,
    persona: record.persona,
    title: record.title,
    deliverableType: record.deliverableType,
    state: record.state,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

export function toHarnessCardEventRow(record: HarnessCardEventRecord): HarnessCardEventRow {
  return {
    id: record.id,
    cardId: record.cardId,
    eventKind: record.eventKind,
    payload: record.payload,
    createdAt: record.createdAt
  };
}

function asRecord(row: unknown): Record<string, unknown> {
  return row && typeof row === "object" ? (row as Record<string, unknown>) : {};
}

function mapHarnessRunRow(row: unknown): HarnessRunRecord | null {
  const record = asRecord(row);
  if (!record.id || !record.tenant_id || !record.workflow_id || !record.package_id || !record.orchestrator_persona) {
    return null;
  }

  return {
    id: String(record.id),
    tenantId: String(record.tenant_id),
    workflowId: String(record.workflow_id),
    packageId: String(record.package_id),
    orchestratorPersona: String(record.orchestrator_persona),
    state: String(record.state) as HarnessRunRecord["state"],
    runtimeContext: normalizeRuntimeContext(record.runtime_context),
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at)
  };
}

function mapHarnessCardRow(row: unknown): HarnessCardRecord | null {
  const record = asRecord(row);
  if (!record.id || !record.run_id || !record.persona || !record.title || !record.deliverable_type) {
    return null;
  }

  return {
    id: String(record.id),
    runId: String(record.run_id),
    parentCardId: typeof record.parent_card_id === "string" ? record.parent_card_id : null,
    persona: String(record.persona),
    title: String(record.title),
    deliverableType: String(record.deliverable_type),
    state: String(record.state) as HarnessCardRecord["state"],
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at)
  };
}

function mapHarnessCardEventRow(row: unknown): HarnessCardEventRecord | null {
  const record = asRecord(row);
  if (!record.id || !record.card_id || !record.event_kind) {
    return null;
  }

  return {
    id: String(record.id),
    cardId: String(record.card_id),
    eventKind: String(record.event_kind) as HarnessCardEventRecord["eventKind"],
    payload: asRecord(record.payload),
    createdAt: String(record.created_at)
  };
}

function normalizeRuntimeContext(value: unknown): HarnessRunRecord["runtimeContext"] {
  const record = asRecord(value);
  return {
    providerKind: String(record.providerKind ?? record.provider_kind ?? "generic_api") as HarnessRunRecord["runtimeContext"]["providerKind"],
    credentialLabel: String(record.credentialLabel ?? record.credential_label ?? "Connected provider")
  };
}
