import type {
  HarnessBoardDecisionRow,
  HarnessCardContinuityRow,
  HarnessCardEventRow,
  HarnessCardRow,
  HarnessRunRow
} from "../db/types.js";
import type { QueryClient } from "../db/supabase-repositories.js";
import type { HarnessProposalResolution, HarnessProposalStatus, HarnessSubCardProposal } from "./runtime-contract.js";
import type {
  HarnessBoardDecisionRecord,
  HarnessCardContinuitySource,
  HarnessCardContinuityRecord,
  HarnessCardEventRecord,
  HarnessCardRecord,
  HarnessCardState,
  HarnessExportDeliveryRecord,
  HarnessRunRecord,
  HarnessRunState
} from "./types.js";

export interface HarnessRepository {
  insertRun(run: HarnessRunRecord): Promise<void>;
  getRun(runId: string): Promise<HarnessRunRecord | null>;
  findLatestRunForTenantWorkflow(input: { tenantId: string; workflowId: string }): Promise<HarnessRunRecord | null>;
  updateRunState(input: { runId: string; state: HarnessRunState }): Promise<HarnessRunRecord | null>;
  insertCard(card: HarnessCardRecord): Promise<void>;
  getCard(cardId: string): Promise<HarnessCardRecord | null>;
  updateCardState(input: { cardId: string; state: HarnessCardState }): Promise<HarnessCardRecord | null>;
  transitionCardState(input: {
    cardId: string;
    expectedState: HarnessCardState;
    state: HarnessCardState;
  }): Promise<HarnessCardRecord | null>;
  claimCardForExecution(input: { cardId: string; expectedState: "approved" }): Promise<HarnessCardRecord | null>;
  updateCardAssignment(input: { cardId: string; persona: string; title: string }): Promise<HarnessCardRecord | null>;
  listCardsForRun(runId: string): Promise<HarnessCardRecord[]>;
  insertEvent(event: HarnessCardEventRecord): Promise<void>;
  listEventsForCard(cardId: string): Promise<HarnessCardEventRecord[]>;
  listEventsForRun(runId: string): Promise<HarnessCardEventRecord[]>;
  upsertCardContinuity(record: HarnessCardContinuityRecord): Promise<void>;
  getCardContinuity(cardId: string): Promise<HarnessCardContinuityRecord | null>;
  listCardContinuityForRun(runId: string): Promise<HarnessCardContinuityRecord[]>;
  insertDecision(decision: HarnessBoardDecisionRecord): Promise<void>;
  listDecisionsForRun(runId: string): Promise<HarnessBoardDecisionRecord[]>;
  upsertExportDelivery(record: HarnessExportDeliveryRecord): Promise<HarnessExportDeliveryRecord>;
  listExportDeliveriesForRun(runId: string): Promise<HarnessExportDeliveryRecord[]>;
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
  const continuity = new Map<string, HarnessCardContinuityRecord>();
  const decisions = new Map<string, HarnessBoardDecisionRecord[]>();
  const exportDeliveries = new Map<string, HarnessExportDeliveryRecord>();
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

    async transitionCardState(input) {
      for (const [runId, runCards] of cards.entries()) {
        const existingCard = runCards.find((candidate) => candidate.id === input.cardId);
        if (!existingCard || existingCard.state !== input.expectedState) {
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

    async claimCardForExecution(input) {
      for (const [runId, runCards] of cards.entries()) {
        const existingCard = runCards.find((candidate) => candidate.id === input.cardId);
        if (!existingCard || existingCard.state !== input.expectedState) {
          continue;
        }

        const updatedCard = {
          ...existingCard,
          state: "working" as const,
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

    async updateCardAssignment(input) {
      for (const [runId, runCards] of cards.entries()) {
        const existingCard = runCards.find((candidate) => candidate.id === input.cardId);
        if (!existingCard) {
          continue;
        }

        const updatedCard = {
          ...existingCard,
          persona: input.persona,
          title: input.title,
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

    async upsertCardContinuity(record) {
      const existing = continuity.get(record.cardId);
      continuity.set(record.cardId, {
        cardId: record.cardId,
        runId: record.runId,
        continuitySource: record.continuitySource,
        continuitySummary: record.continuitySummary,
        latestResultSummary: record.latestResultSummary,
        absorbedWorkItems: mergeBoundedStrings(existing?.absorbedWorkItems ?? [], record.absorbedWorkItems),
        updatedAt: record.updatedAt
      });
    },

    async getCardContinuity(cardId) {
      const record = continuity.get(cardId);
      return record
        ? {
            ...record,
            absorbedWorkItems: [...record.absorbedWorkItems]
          }
        : null;
    },

    async listCardContinuityForRun(runId) {
      return [...continuity.values()]
        .filter((record) => record.runId === runId)
        .map((record) => ({
          ...record,
          absorbedWorkItems: [...record.absorbedWorkItems]
        }));
    },

    async insertDecision(decision) {
      const runDecisions = decisions.get(decision.runId) ?? [];
      decisions.set(decision.runId, [...runDecisions, { ...decision }]);
    },

    async listDecisionsForRun(runId) {
      return [...(decisions.get(runId) ?? [])]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map((decision) => ({ ...decision }));
    },

    async upsertExportDelivery(record) {
      const existing = exportDeliveries.get(record.idempotencyKey);
      const persisted: HarnessExportDeliveryRecord = {
        ...(existing ?? { id: record.id, createdAt: record.createdAt }),
        ...record,
        files: record.files.map((file) => ({ ...file }))
      };
      exportDeliveries.set(record.idempotencyKey, persisted);
      return {
        ...persisted,
        files: persisted.files.map((file) => ({ ...file }))
      };
    },

    async listExportDeliveriesForRun(runId) {
      return [...exportDeliveries.values()]
        .filter((record) => record.runId === runId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map((record) => ({
          ...record,
          files: record.files.map((file) => ({ ...file }))
        }));
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

    async transitionCardState(input) {
      const result = await client.query(
        `update wfpc.harness_cards
         set state = $3,
             updated_at = now()
         where id = $1
           and state = $2
         returning id, run_id, parent_card_id, persona, title, deliverable_type, state, created_at, updated_at`,
        [input.cardId, input.expectedState, input.state]
      );
      return mapHarnessCardRow(result.rows[0]);
    },

    async claimCardForExecution(input) {
      const result = await client.query(
        `update wfpc.harness_cards
         set state = 'working',
             updated_at = now()
         where id = $1
           and state = $2
         returning id, run_id, parent_card_id, persona, title, deliverable_type, state, created_at, updated_at`,
        [input.cardId, input.expectedState]
      );
      return mapHarnessCardRow(result.rows[0]);
    },

    async updateCardAssignment(input) {
      const result = await client.query(
        `update wfpc.harness_cards
         set persona = $2,
             title = $3,
             updated_at = now()
         where id = $1
         returning id, run_id, parent_card_id, persona, title, deliverable_type, state, created_at, updated_at`,
        [input.cardId, input.persona, input.title]
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

    async upsertCardContinuity(record) {
      await client.query(
        `insert into wfpc.harness_card_continuity
          (card_id, run_id, continuity_source, continuity_summary, latest_result_summary, absorbed_work_items, updated_at)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz)
         on conflict (card_id) do update
           set continuity_source = excluded.continuity_source,
               continuity_summary = excluded.continuity_summary,
               latest_result_summary = coalesce(
                 excluded.latest_result_summary,
                 wfpc.harness_card_continuity.latest_result_summary
               ),
               absorbed_work_items = (
                 with merged as (
                   select value, max(ordinality) as latest_ordinality
                   from jsonb_array_elements_text(
                     coalesce(wfpc.harness_card_continuity.absorbed_work_items, '[]'::jsonb) ||
                     coalesce(excluded.absorbed_work_items, '[]'::jsonb)
                   ) with ordinality as merged(value, ordinality)
                   group by value
                 ),
                 bounded as (
                   select value, latest_ordinality
                   from merged
                   order by latest_ordinality desc
                   limit 6
                 )
                 select to_jsonb(coalesce(array(select value from bounded order by latest_ordinality asc), array[]::text[]))
               ),
               updated_at = excluded.updated_at`,
        [
          record.cardId,
          record.runId,
          record.continuitySource,
          record.continuitySummary,
          record.latestResultSummary,
          JSON.stringify(record.absorbedWorkItems),
          record.updatedAt
        ]
      );
    },

    async getCardContinuity(cardId) {
      const result = await client.query(
        `select card_id, run_id, continuity_source, continuity_summary, latest_result_summary, absorbed_work_items, updated_at
         from wfpc.harness_card_continuity
         where card_id = $1
         limit 1`,
        [cardId]
      );
      return mapHarnessCardContinuityRow(result.rows[0]);
    },

    async listCardContinuityForRun(runId) {
      const result = await client.query(
        `select card_id, run_id, continuity_source, continuity_summary, latest_result_summary, absorbed_work_items, updated_at
         from wfpc.harness_card_continuity
         where run_id = $1
         order by updated_at desc, card_id asc`,
        [runId]
      );
      return result.rows
        .map(mapHarnessCardContinuityRow)
        .filter((record): record is HarnessCardContinuityRecord => record !== null);
    },

    async insertDecision(decision) {
      await client.query(
        `insert into wfpc.harness_board_decisions
          (id, run_id, tenant_id, actor_user_id, decision_kind, card_id, proposal_id, target_card_id, persona, deliverable_type, policy_reason, resolution, decision_note, recommendation_summary, objection_summary, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::timestamptz)`,
        [
          decision.id,
          decision.runId,
          decision.tenantId,
          decision.actorUserId,
          decision.decisionKind,
          decision.cardId,
          decision.proposalId,
          decision.targetCardId,
          decision.persona,
          decision.deliverableType,
          decision.policyReason,
          decision.resolution,
          decision.decisionNote,
          decision.recommendationSummary,
          decision.objectionSummary,
          decision.createdAt
        ]
      );
    },

    async listDecisionsForRun(runId) {
      const result = await client.query(
        `select id, run_id, tenant_id, actor_user_id, decision_kind, card_id, proposal_id, target_card_id, persona, deliverable_type, policy_reason, resolution, decision_note, recommendation_summary, objection_summary, created_at
         from wfpc.harness_board_decisions
         where run_id = $1
         order by created_at desc`,
        [runId]
      );
      return result.rows.map(mapHarnessBoardDecisionRow).filter((decision): decision is HarnessBoardDecisionRecord => decision !== null);
    },

    async upsertExportDelivery(record) {
      const result = await client.query(
        `insert into wfpc.harness_export_deliveries (
            id, run_id, tenant_id, workflow_id, package_id, candidate_id, status, export_format, record_target,
            bundle_id, idempotency_key, note_title, note_file_name, placement_manifest, files, record_count,
            disclosure_summary, redaction_summary, created_at, updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb, $16, $17, $18, $19::timestamptz, $20::timestamptz)
          on conflict (idempotency_key) do update set
            bundle_id = excluded.bundle_id,
            note_title = excluded.note_title,
            note_file_name = excluded.note_file_name,
            placement_manifest = excluded.placement_manifest,
            files = excluded.files,
            record_count = excluded.record_count,
            disclosure_summary = excluded.disclosure_summary,
            redaction_summary = excluded.redaction_summary,
            updated_at = excluded.updated_at
          returning id, run_id, tenant_id, workflow_id, package_id, candidate_id, status, export_format, record_target,
                    bundle_id, idempotency_key, note_title, note_file_name, placement_manifest, files, record_count,
                    disclosure_summary, redaction_summary, created_at, updated_at`,
        [
          record.id,
          record.runId,
          record.tenantId,
          record.workflowId,
          record.packageId,
          record.candidateId,
          record.status,
          record.exportFormat,
          record.recordTarget,
          record.bundleId,
          record.idempotencyKey,
          record.noteTitle,
          record.noteFileName,
          JSON.stringify({
            targetSystem: record.placementTargetSystem,
            vaultFolder: record.vaultFolder,
            primaryNotePath: record.primaryNotePath,
            syncStrategy: record.syncStrategy,
            confirmationRequirement: record.confirmationRequirement
          }),
          JSON.stringify(record.files),
          record.recordCount,
          record.disclosureSummary,
          record.redactionSummary,
          record.createdAt,
          record.updatedAt
        ]
      );
      return mapHarnessExportDeliveryRow(result.rows[0]);
    },

    async listExportDeliveriesForRun(runId) {
      const result = await client.query(
        `select id, run_id, tenant_id, workflow_id, package_id, candidate_id, status, export_format, record_target,
                bundle_id, idempotency_key, note_title, note_file_name, placement_manifest, files, record_count,
                disclosure_summary, redaction_summary, created_at, updated_at
           from wfpc.harness_export_deliveries
          where run_id = $1
          order by created_at desc`,
        [runId]
      );
      return result.rows.map(mapHarnessExportDeliveryRow);
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

export function toHarnessCardContinuityRow(record: HarnessCardContinuityRecord): HarnessCardContinuityRow {
  return {
    cardId: record.cardId,
    runId: record.runId,
    continuitySource: record.continuitySource,
    continuitySummary: record.continuitySummary,
    latestResultSummary: record.latestResultSummary,
    absorbedWorkItems: [...record.absorbedWorkItems],
    updatedAt: record.updatedAt
  };
}

export function toHarnessBoardDecisionRow(record: HarnessBoardDecisionRecord): HarnessBoardDecisionRow {
  return {
    id: record.id,
    runId: record.runId,
    tenantId: record.tenantId,
    actorUserId: record.actorUserId,
    decisionKind: record.decisionKind,
    cardId: record.cardId,
    proposalId: record.proposalId,
    targetCardId: record.targetCardId,
    persona: record.persona,
    deliverableType: record.deliverableType,
    policyReason: record.policyReason,
    resolution: record.resolution,
    decisionNote: record.decisionNote,
    recommendationSummary: record.recommendationSummary,
    objectionSummary: record.objectionSummary,
    createdAt: record.createdAt
  };
}

function mapHarnessExportDeliveryRow(row: unknown): HarnessExportDeliveryRecord {
  const record = asRecord(row);
  const placement = asRecord(record.placement_manifest);
  const files = Array.isArray(record.files) ? record.files : [];
  return {
    id: String(record.id),
    runId: String(record.run_id),
    tenantId: String(record.tenant_id),
    workflowId: String(record.workflow_id),
    packageId: String(record.package_id),
    candidateId: "governance_history_export",
    status: "export_ready",
    exportFormat: "obsidian_markdown_bundle",
    recordTarget: "governance_history_record",
    bundleId: String(record.bundle_id),
    idempotencyKey: String(record.idempotency_key),
    noteTitle: String(record.note_title),
    noteFileName: String(record.note_file_name),
    placementTargetSystem: "obsidian_vault",
    vaultFolder: String(placement.vaultFolder ?? ""),
    primaryNotePath: String(placement.primaryNotePath ?? ""),
    syncStrategy: String(placement.syncStrategy ?? ""),
    confirmationRequirement: String(placement.confirmationRequirement ?? ""),
    files: files.map((file) => {
      const entry = asRecord(file);
      return {
        path: String(entry.path ?? ""),
        mediaType: String(entry.mediaType ?? "text/markdown") as "text/markdown" | "application/json",
        byteSize: Number(entry.byteSize ?? 0),
        checksum: String(entry.checksum ?? ""),
        content: String(entry.content ?? "")
      };
    }),
    recordCount: Number(record.record_count ?? 0),
    disclosureSummary: String(record.disclosure_summary ?? ""),
    redactionSummary: String(record.redaction_summary ?? ""),
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at)
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

function mapHarnessCardContinuityRow(row: unknown): HarnessCardContinuityRecord | null {
  const record = asRecord(row);
  if (!record.card_id || !record.run_id) {
    return null;
  }

  return {
    cardId: String(record.card_id),
    runId: String(record.run_id),
    continuitySource:
      typeof record.continuity_source === "string"
        ? (record.continuity_source as HarnessCardContinuitySource)
        : "state_transition",
    continuitySummary: typeof record.continuity_summary === "string" ? record.continuity_summary : null,
    latestResultSummary: typeof record.latest_result_summary === "string" ? record.latest_result_summary : null,
    absorbedWorkItems: Array.isArray(record.absorbed_work_items)
      ? record.absorbed_work_items.filter((item): item is string => typeof item === "string")
      : [],
    updatedAt: String(record.updated_at)
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

function mapHarnessBoardDecisionRow(row: unknown): HarnessBoardDecisionRecord | null {
  const record = asRecord(row);
  if (!record.id || !record.run_id || !record.tenant_id || !record.actor_user_id || !record.decision_kind) {
    return null;
  }

  return {
    id: String(record.id),
    runId: String(record.run_id),
    tenantId: String(record.tenant_id),
    actorUserId: String(record.actor_user_id),
    decisionKind: String(record.decision_kind) as HarnessBoardDecisionRecord["decisionKind"],
    cardId: typeof record.card_id === "string" ? record.card_id : null,
    proposalId: typeof record.proposal_id === "string" ? record.proposal_id : null,
    targetCardId: typeof record.target_card_id === "string" ? record.target_card_id : null,
    persona: typeof record.persona === "string" ? record.persona : null,
    deliverableType: typeof record.deliverable_type === "string" ? record.deliverable_type : null,
    policyReason: typeof record.policy_reason === "string" ? (record.policy_reason as HarnessBoardDecisionRecord["policyReason"]) : null,
    resolution: typeof record.resolution === "string" ? record.resolution : null,
    decisionNote: typeof record.decision_note === "string" ? record.decision_note : null,
    recommendationSummary:
      typeof record.recommendation_summary === "string" ? record.recommendation_summary : null,
    objectionSummary: typeof record.objection_summary === "string" ? record.objection_summary : null,
    createdAt: String(record.created_at)
  };
}

function mergeBoundedStrings(existing: readonly string[], nextValues: readonly string[]): string[] {
  const merged = [...existing];
  for (const value of nextValues) {
    const priorIndex = merged.indexOf(value);
    if (priorIndex >= 0) {
      merged.splice(priorIndex, 1);
    }
    merged.push(value);
  }
  return merged.slice(-6);
}

function normalizeRuntimeContext(value: unknown): HarnessRunRecord["runtimeContext"] {
  const record = asRecord(value);
  return {
    providerKind: String(record.providerKind ?? record.provider_kind ?? "generic_api") as HarnessRunRecord["runtimeContext"]["providerKind"],
    credentialLabel: String(record.credentialLabel ?? record.credential_label ?? "Connected provider")
  };
}
