export type HarnessProposalStatus = "proposed" | "approved" | "deferred" | "denied";
export type HarnessProposalResolution = "create_lane" | "update_existing_lane" | "handoff_existing_lane";

import type {
  HarnessCardContinuityRecord,
  HarnessCardRecord,
  HarnessPersona,
  HarnessRunRecord,
  HarnessRuntimeContext
} from "./types.js";

export type WealthFactoryResolvedRuntimeContext = HarnessRuntimeContext & Record<string, unknown>;

export interface HarnessSubCardProposal {
  id: string;
  runId: string;
  parentCardId: string;
  requestedByCardId: string;
  requestedByPersona: string;
  persona: string;
  title: string;
  deliverableType: string;
  status: HarnessProposalStatus;
  resolution?: HarnessProposalResolution;
  decisionNote?: string;
  approvedCardId?: string;
}

export interface StartHarnessRunInput {
  tenantId: string;
  workflowId: string;
  packageId: string;
  runtimeContext: WealthFactoryResolvedRuntimeContext;
}

export interface CreateHarnessCardInput {
  persona: HarnessPersona;
  title: string;
  deliverableType: string;
}

export interface HarnessRunSession {
  run: HarnessRunRecord;
  ceoCard: HarnessCardRecord;
}

export interface HarnessPersistedState {
  run: HarnessRunRecord;
  cards: readonly HarnessCardRecord[];
  proposals?: readonly HarnessSubCardProposal[];
  continuity?: readonly HarnessCardContinuityRecord[];
}
