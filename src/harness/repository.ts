import type { HarnessCardEventRow, HarnessCardRow, HarnessRunRow } from "../db/types.js";
import type { QueryClient } from "../db/supabase-repositories.js";
import type { HarnessProposalResolution, HarnessProposalStatus, HarnessSubCardProposal } from "./runtime-contract.js";
import type { HarnessCardEventRecord, HarnessCardRecord, HarnessCardState, HarnessRunRecord, HarnessRunState } from "./types.js";

export interface HarnessRepository {
  insertRun(run: HarnessRunRecord): Promise<void>;
  getRun(runId: string): Promise<HarnessRunRecord | null>;
  findLatestRunForTenantWorkflow(input: { tenantId: string; workflowId: string }): Promise<HarnessRunRecord | null>;
  updateRunState(input: { runId: string; state: HarnessRunState }): Promise<HarnessRunRecord | null>;
  insertCard(card: HarnessCardRecord): Promise<void>;
  getCard(cardId: string): Promise<HarnessCardRecord | null>;
  updateCardState(input: { cardId: string; state: HarnessCardState }): Promise<HarnessCardRecord | null>;
  listCardsForRun(runId: string): Promise<HarnessCardRecord[]>;
  insertEvent(event: HarnessCardEventRecord): Promise<void>;
  listEventsForCard(cardId: string): Promise<HarnessCardEventRecord[]>;
  listEventsForRun(runId: string): Promise<HarnessCardEventRecord[]>;
  insertProposal(proposal: HarnessSubCardProposal): Promise<void>;
  getProposal(proposalId: string): Promise<HarnessSubCardProposal | null>;
  listProposalsForRun(runId: string): Promise<HarnessSubCardProposal[]>;
  markProposalApproved(input: {
    proposalId: string;
    approvedCardId: string;
    resolution?: HarnessProposalResolution;
    decisionNote?: string;
  }): Promise<{ updated: boolean }>;
  markProposalStatus(input: {
    proposalId: string;
    status: Extract<HarnessProposalStatus, "deferred" | "denied">;
    decisionNote?: string;
  }): Promise<{ updated: boolean }>;
}

export function createInMemoryHarnessRepository(): HarnessRepository {
  const runs = new Map<string, HarnessRunRecord>();
  const cards = new Map<string, HarnessCardRecord[]>();
  const events = new Map<string, HarnessCardEventRecord[]>();
  const proposals = new Map<string, HarnessSubCardProposal>();

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

    async updateRunState(input) {
      const existingRun = runs.get(input.runId);
      if (!existingRun) {
        return null;
      }

      const updatedRun = {
        ...existingRun,
        state: input.state,
        updatedAt: new Date().toISOString()
      };
      runs.set(input.runId, updatedRun);
      return { ...updatedRun, runtimeContext: { ...updatedRun.runtimeContext } };
    },

    async insertCard(card) {
      const runCards = cards.get(card.runId) ?? [];
      cards.set(card.runId, [...runCards, card]);
    },

    async getCard(cardId) {
      for (const runCards of cards.values()) {
        const card = runCards.find((candidate) => candidate.id === cardId);
        if (card) {
          return { ...card };
        }
      }
      return null;
    },

    async updateCardState(input) {
      for (const [runId, runCards] of cards.entries()) {
        const existingCard = runCards.find((candidate) => candidate.id === input.cardId);
        if (!existingCard) {
          continue;
        }

        const updatedCard = {
          ...existingCard,
          state: input.state,
          updatedAt: new Date().toISOString()
        };
        cards.set(
          runId,
          runCards.map((candidate) => (candidate.id === input.cardId ? updatedCard : candidate))
        );
        return { ...updatedCard };
      }

      return null;
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
    },

    async insertProposal(proposal) {
      proposals.set(proposal.id, { ...proposal });
    },

    async getProposal(proposalId) {
      const proposal = proposals.get(proposalId);
      return proposal ? { ...proposal } : null;
    },

    async listProposalsForRun(runId) {
      return [...proposals.values()].filter((proposal) => proposal.runId === runId).map((proposal) => ({ ...proposal }));
    },

    async markProposalApproved(input) {
      const proposal = proposals.get(input.proposalId);
      if (!proposal) {
        return { updated: false };
      }
      if (proposal.status !== "proposed" && proposal.status !== "deferred") {
        return { updated: false };
      }

      proposals.set(input.proposalId, {
        ...proposal,
        status: "approved",
        approvedCardId: input.approvedCardId,
        ...(input.resolution ? { resolution: input.resolution } : {}),
        ...(input.decisionNote ? { decisionNote: input.decisionNote } : {})
      });
      return { updated: true };
    },

    async markProposalStatus(input) {
      const proposal = proposals.get(input.proposalId);
      if (!proposal) {
        return { updated: false };
      }
      if (proposal.status !== "proposed" && proposal.status !== "deferred") {
        return { updated: false };
      }

      proposals.set(input.proposalId, {
        ...proposal,
        status: input.status,
        ...(input.decisionNote ? { decisionNote: input.decisionNote } : {})
      });
      return { updated: true };
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

    async updateRunState(input) {
      const result = await client.query(
        `update wfpc.harness_runs
         set state = $2,
             updated_at = now()
         where id = $1
         returning id, tenant_id, workflow_id, package_id, orchestrator_persona, state, runtime_context, created_at, updated_at`,
        [input.runId, input.state]
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

    async getCard(cardId) {
      const result = await client.query(
        `select id, run_id, parent_card_id, persona, title, deliverable_type, state, created_at, updated_at
         from wfpc.harness_cards
         where id = $1
         limit 1`,
        [cardId]
      );
      return mapHarnessCardRow(result.rows[0]);
    },

    async updateCardState(input) {
      const result = await client.query(
        `update wfpc.harness_cards
         set state = $2,
             updated_at = now()
         where id = $1
         returning id, run_id, parent_card_id, persona, title, deliverable_type, state, created_at, updated_at`,
        [input.cardId, input.state]
      );
      return mapHarnessCardRow(result.rows[0]);
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
    },

    async insertProposal(proposal) {
      await client.query(
        `insert into wfpc.harness_subcard_proposals
          (id, run_id, parent_card_id, requested_by_card_id, requested_by_persona, persona, title, deliverable_type, status, resolution, decision_note, approved_card_id, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), now())`,
        [
          proposal.id,
          proposal.runId,
          proposal.parentCardId,
          proposal.requestedByCardId,
          proposal.requestedByPersona,
          proposal.persona,
          proposal.title,
          proposal.deliverableType,
          proposal.status,
          proposal.resolution ?? null,
          proposal.decisionNote ?? null,
          proposal.approvedCardId ?? null
        ]
      );
    },

    async getProposal(proposalId) {
      const result = await client.query(
        `select id, run_id, parent_card_id, requested_by_card_id, requested_by_persona, persona, title, deliverable_type, status, resolution, decision_note, approved_card_id, created_at, updated_at
         from wfpc.harness_subcard_proposals
         where id = $1
         limit 1`,
        [proposalId]
      );
      return mapHarnessProposalRow(result.rows[0]);
    },

    async listProposalsForRun(runId) {
      const result = await client.query(
        `select id, run_id, parent_card_id, requested_by_card_id, requested_by_persona, persona, title, deliverable_type, status, resolution, decision_note, approved_card_id, created_at, updated_at
         from wfpc.harness_subcard_proposals
         where run_id = $1
         order by created_at asc`,
        [runId]
      );
      return result.rows.map(mapHarnessProposalRow).filter((proposal): proposal is HarnessSubCardProposal => proposal !== null);
    },

    async markProposalApproved(input) {
      const result = await client.query(
        `update wfpc.harness_subcard_proposals
         set status = 'approved',
             resolution = $3,
             decision_note = $4,
             approved_card_id = $2,
             updated_at = now()
         where id = $1
           and status in ('proposed', 'deferred')
         returning id`,
        [input.proposalId, input.approvedCardId, input.resolution ?? "create_lane", input.decisionNote ?? null]
      );
      return { updated: result.rows.length > 0 };
    },

    async markProposalStatus(input) {
      const result = await client.query(
        `update wfpc.harness_subcard_proposals
         set status = $2,
             resolution = null,
             decision_note = $3,
             updated_at = now()
         where id = $1
           and status in ('proposed', 'deferred')
         returning id`,
        [input.proposalId, input.status, input.decisionNote ?? null]
      );
      return { updated: result.rows.length > 0 };
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

function mapHarnessProposalRow(row: unknown): HarnessSubCardProposal | null {
  const record = asRecord(row);
  if (
    !record.id ||
    !record.run_id ||
    !record.parent_card_id ||
    !record.requested_by_card_id ||
    !record.requested_by_persona ||
    !record.persona ||
    !record.title ||
    !record.deliverable_type ||
    !record.status
  ) {
    return null;
  }

  const proposal: HarnessSubCardProposal = {
    id: String(record.id),
    runId: String(record.run_id),
    parentCardId: String(record.parent_card_id),
    requestedByCardId: String(record.requested_by_card_id),
    requestedByPersona: String(record.requested_by_persona),
    persona: String(record.persona),
    title: String(record.title),
    deliverableType: String(record.deliverable_type),
    status: String(record.status) as HarnessSubCardProposal["status"]
  };

  if (typeof record.resolution === "string") {
    proposal.resolution = record.resolution as NonNullable<HarnessSubCardProposal["resolution"]>;
  }
  if (typeof record.decision_note === "string") {
    proposal.decisionNote = record.decision_note;
  }
  if (typeof record.approved_card_id === "string") {
    proposal.approvedCardId = record.approved_card_id;
  }

  return proposal;
}

function normalizeRuntimeContext(value: unknown): HarnessRunRecord["runtimeContext"] {
  const record = asRecord(value);
  return {
    providerKind: String(record.providerKind ?? record.provider_kind ?? "generic_api") as HarnessRunRecord["runtimeContext"]["providerKind"],
    credentialLabel: String(record.credentialLabel ?? record.credential_label ?? "Connected provider")
  };
}
