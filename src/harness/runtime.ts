import { randomUUID } from "node:crypto";

import type {
  CreateHarnessCardInput,
  HarnessPersistedState,
  HarnessRunSession,
  HarnessSubCardProposal,
  StartHarnessRunInput
} from "./runtime-contract.js";
import { transitionHarnessCard, transitionHarnessRun } from "./state-machine.js";
import { createHarnessCardRecord, createHarnessRunRecord, type HarnessCardRecord, type HarnessRunRecord } from "./types.js";

type HarnessRuntimeOptions = {
  createId?: () => string;
};

export function createHarnessRuntime(options: HarnessRuntimeOptions = {}) {
  const createId = options.createId ?? randomUUID;
  const runs = new Map<string, HarnessRunRecord>();
  const cardsById = new Map<string, HarnessCardRecord>();
  const cardIdsByRun = new Map<string, string[]>();
  const proposalsById = new Map<string, HarnessSubCardProposal>();
  const proposalIdsByRun = new Map<string, string[]>();
  const ceoCardIdByRun = new Map<string, string>();

  function cloneRun(run: HarnessRunRecord): HarnessRunRecord {
    return {
      ...run,
      runtimeContext: { ...run.runtimeContext }
    };
  }

  function cloneCard(card: HarnessCardRecord): HarnessCardRecord {
    return { ...card };
  }

  function cloneProposal(proposal: HarnessSubCardProposal): HarnessSubCardProposal {
    return { ...proposal };
  }

  function appendRunItem(index: Map<string, string[]>, runId: string, id: string): void {
    index.set(runId, [...(index.get(runId) ?? []), id]);
  }

  function requireRun(runId: string): HarnessRunRecord {
    const run = runs.get(runId);
    if (!run) {
      throw new Error(`Unknown harness run: ${runId}`);
    }
    return run;
  }

  function requireCard(cardId: string): HarnessCardRecord {
    const card = cardsById.get(cardId);
    if (!card) {
      throw new Error(`Unknown harness card: ${cardId}`);
    }
    return card;
  }

  function requireProposal(proposalId: string): HarnessSubCardProposal {
    const proposal = proposalsById.get(proposalId);
    if (!proposal) {
      throw new Error(`Unknown harness proposal: ${proposalId}`);
    }
    return proposal;
  }

  function requireCeoCard(runId: string): HarnessCardRecord {
    const ceoCardId = ceoCardIdByRun.get(runId);
    if (!ceoCardId) {
      throw new Error(`Missing CEO card for run: ${runId}`);
    }
    const ceoCard = requireCard(ceoCardId);
    if (ceoCard.persona !== "ceo") {
      throw new Error(`Invalid CEO gate for run: ${runId}`);
    }
    return ceoCard;
  }

  function storeRun(run: HarnessRunRecord): HarnessRunRecord {
    runs.set(run.id, cloneRun(run));
    return cloneRun(run);
  }

  function storeCard(card: HarnessCardRecord): HarnessCardRecord {
    cardsById.set(card.id, cloneCard(card));
    appendRunItem(cardIdsByRun, card.runId, card.id);
    if (card.persona === "ceo" && card.parentCardId === null) {
      ceoCardIdByRun.set(card.runId, card.id);
    }
    return cloneCard(card);
  }

  function storeProposal(proposal: HarnessSubCardProposal): HarnessSubCardProposal {
    proposalsById.set(proposal.id, cloneProposal(proposal));
    appendRunItem(proposalIdsByRun, proposal.runId, proposal.id);
    return cloneProposal(proposal);
  }

  function buildCard(input: {
    runId: string;
    persona: string;
    title: string;
    deliverableType: string;
    state: HarnessCardRecord["state"];
    parentCardId?: string | null;
  }): HarnessCardRecord {
    const card = createHarnessCardRecord({
      runId: input.runId,
      persona: input.persona,
      title: input.title,
      deliverableType: input.deliverableType,
      ...(input.parentCardId !== undefined ? { parentCardId: input.parentCardId } : {})
    });
    card.id = createId();
    return materializeCardState(card, input.state);
  }

  function materializeCardState(card: HarnessCardRecord, state: HarnessCardRecord["state"]): HarnessCardRecord {
    if (state === "queued") {
      return card;
    }

    const pathByState: Partial<Record<HarnessCardRecord["state"], HarnessCardRecord["state"][]>> = {
      planning: ["planning"],
      approved: ["planning", "approved"],
      working: ["planning", "approved", "working"],
      waiting: ["planning", "approved", "working", "waiting"],
      blocked: ["planning", "blocked"],
      done: ["planning", "approved", "working", "done"],
      cancelled: ["cancelled"]
    };
    const path = pathByState[state];
    if (!path) {
      return card;
    }

    return path.reduce((current, nextState) => transitionHarnessCard(current, nextState), card);
  }

  return {
    startRun(input: StartHarnessRunInput): HarnessRunSession {
      const queuedRun = createHarnessRunRecord({
        tenantId: input.tenantId,
        workflowId: input.workflowId,
        packageId: input.packageId,
        orchestratorPersona: "ceo",
        runtimeContext: input.runtimeContext
      });
      queuedRun.id = createId();
      const run = storeRun(transitionHarnessRun(queuedRun, "planning"));
      const ceoCard = storeCard(
        buildCard({
          runId: run.id,
          persona: "ceo",
          title: "Plan run",
          deliverableType: "plan",
          state: "planning"
        })
      );
      return { run, ceoCard };
    },

    createApprovedChildCard(runId: string, input: CreateHarnessCardInput): HarnessCardRecord {
      requireRun(runId);
      const ceoCard = requireCeoCard(runId);
      return storeCard(
        buildCard({
          runId,
          parentCardId: ceoCard.id,
          persona: input.persona,
          title: input.title,
          deliverableType: input.deliverableType,
          state: "approved"
        })
      );
    },

    proposeSubCard(parentCardId: string, input: CreateHarnessCardInput): HarnessSubCardProposal {
      const parentCard = requireCard(parentCardId);
      requireCeoCard(parentCard.runId);
      return storeProposal({
        id: createId(),
        runId: parentCard.runId,
        parentCardId,
        requestedByCardId: parentCard.id,
        requestedByPersona: parentCard.persona,
        persona: input.persona,
        title: input.title,
        deliverableType: input.deliverableType,
        status: "proposed"
      });
    },

    approveSubCard(proposalId: string): HarnessCardRecord {
      const proposal = requireProposal(proposalId);
      requireCeoCard(proposal.runId);
      const approvedCard = storeCard(
        buildCard({
          runId: proposal.runId,
          parentCardId: proposal.parentCardId,
          persona: proposal.persona,
          title: proposal.title,
          deliverableType: proposal.deliverableType,
          state: "queued"
        })
      );

      proposalsById.delete(proposalId);
      proposalIdsByRun.set(
        proposal.runId,
        (proposalIdsByRun.get(proposal.runId) ?? []).filter((id) => id !== proposalId)
      );

      return approvedCard;
    },

    resumeRun(savedState: HarnessPersistedState) {
      cardIdsByRun.set(savedState.run.id, []);
      proposalIdsByRun.set(savedState.run.id, []);
      storeRun(savedState.run);

      for (const card of savedState.cards) {
        storeCard(card);
      }

      for (const proposal of savedState.proposals ?? []) {
        storeProposal(proposal);
      }

      return {
        run: cloneRun(requireRun(savedState.run.id)),
        cards: this.listCards(savedState.run.id),
        proposals: this.listProposals(savedState.run.id)
      };
    },

    listCards(runId: string): HarnessCardRecord[] {
      return (cardIdsByRun.get(runId) ?? [])
        .map((cardId) => cardsById.get(cardId))
        .filter((card): card is HarnessCardRecord => card !== undefined)
        .map(cloneCard);
    },

    listProposals(runId: string): HarnessSubCardProposal[] {
      return (proposalIdsByRun.get(runId) ?? [])
        .map((proposalId) => proposalsById.get(proposalId))
        .filter((proposal): proposal is HarnessSubCardProposal => proposal !== undefined)
        .map(cloneProposal);
    }
  };
}
