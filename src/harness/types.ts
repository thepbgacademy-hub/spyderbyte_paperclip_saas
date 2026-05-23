import { randomUUID } from "node:crypto";

import type { ProviderKind } from "../db/types.js";

export type HarnessRunState = "queued" | "planning" | "active" | "waiting" | "blocked" | "assembling" | "done" | "failed" | "cancelled";
export type HarnessCardState = "queued" | "planning" | "approved" | "working" | "waiting" | "blocked" | "done" | "cancelled";
export type HarnessPersona = string;
export type HarnessDeliverableType = string;
export type HarnessCardEventKind =
  | "created"
  | "state_changed"
  | "comment_added"
  | "subcard_proposed"
  | "proposal_absorbed"
  | "result_recorded";
export type HarnessBoardDecisionKind =
  | "lane_opened"
  | "proposal_approved"
  | "proposal_deferred"
  | "proposal_denied"
  | "run_completed";
export type HarnessBoardPolicyReason =
  | "created_new_lane"
  | "reused_existing_lane"
  | "deliverable_owner_conflict"
  | "lane_cap"
  | "scope_guardrail"
  | "completed_lanes_only";

export const HARNESS_CHILD_PERSONAS = ["cfo", "coo", "researcher", "cto", "cmo", "analyst"] as const;
export const HARNESS_DELIVERABLE_TYPES = [
  "plan",
  "pricing_review",
  "research_brief",
  "ops_handoff",
  "technical_review",
  "launch_copy",
  "forecast_model",
  "finance_review",
  "legal_review"
] as const;

export interface HarnessRuntimeContext {
  providerKind: ProviderKind;
  credentialLabel: string;
  secretValues?: never;
}

export interface HarnessRunRecord {
  id: string;
  tenantId: string;
  workflowId: string;
  packageId: string;
  orchestratorPersona: HarnessPersona;
  state: HarnessRunState;
  runtimeContext: HarnessRuntimeContext;
  createdAt: string;
  updatedAt: string;
}

export interface HarnessCardRecord {
  id: string;
  runId: string;
  parentCardId: string | null;
  persona: HarnessPersona;
  title: string;
  deliverableType: HarnessDeliverableType;
  state: HarnessCardState;
  createdAt: string;
  updatedAt: string;
}

export interface HarnessCardEventRecord {
  id: string;
  cardId: string;
  eventKind: HarnessCardEventKind;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface HarnessBoardDecisionRecord {
  id: string;
  runId: string;
  tenantId: string;
  actorUserId: string;
  decisionKind: HarnessBoardDecisionKind;
  cardId: string | null;
  proposalId: string | null;
  targetCardId: string | null;
  persona: string | null;
  deliverableType: string | null;
  policyReason: HarnessBoardPolicyReason | null;
  resolution: string | null;
  decisionNote: string | null;
  recommendationSummary: string | null;
  objectionSummary: string | null;
  createdAt: string;
}

export const HARNESS_CARD_STATES = [
  "queued",
  "planning",
  "approved",
  "working",
  "waiting",
  "blocked",
  "done",
  "cancelled"
] as const satisfies readonly HarnessCardState[];

export function isHarnessCardState(value: string): value is HarnessCardState {
  return HARNESS_CARD_STATES.includes(value as HarnessCardState);
}

export function normalizeHarnessPersona(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeHarnessDeliverableType(value: string): string {
  return value.trim().toLowerCase();
}

export function isHarnessChildPersona(value: string): value is (typeof HARNESS_CHILD_PERSONAS)[number] {
  return HARNESS_CHILD_PERSONAS.includes(value as (typeof HARNESS_CHILD_PERSONAS)[number]);
}

export function isHarnessDeliverableType(value: string): value is (typeof HARNESS_DELIVERABLE_TYPES)[number] {
  return HARNESS_DELIVERABLE_TYPES.includes(value as (typeof HARNESS_DELIVERABLE_TYPES)[number]);
}

export function createHarnessRuntimeContext(input: {
  providerKind: ProviderKind;
  credentialLabel: string;
} & Record<string, unknown>): HarnessRuntimeContext {
  return {
    providerKind: input.providerKind,
    credentialLabel: input.credentialLabel
  };
}

export function createHarnessRunRecord(input: {
  tenantId: string;
  workflowId: string;
  packageId: string;
  orchestratorPersona: HarnessPersona;
  runtimeContext: {
    providerKind: ProviderKind;
    credentialLabel: string;
  } & Record<string, unknown>;
}): HarnessRunRecord {
  const timestamp = new Date().toISOString();

  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    workflowId: input.workflowId,
    packageId: input.packageId,
    orchestratorPersona: input.orchestratorPersona,
    state: "queued",
    runtimeContext: createHarnessRuntimeContext(input.runtimeContext),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createHarnessCardRecord(input: {
  runId: string;
  persona: HarnessPersona;
  title: string;
  deliverableType: HarnessDeliverableType;
  parentCardId?: string | null;
}): HarnessCardRecord {
  const timestamp = new Date().toISOString();

  return {
    id: randomUUID(),
    runId: input.runId,
    parentCardId: input.parentCardId ?? null,
    persona: input.persona,
    title: input.title,
    deliverableType: input.deliverableType,
    state: "queued",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createHarnessCardEventRecord(input: {
  cardId: string;
  eventKind: HarnessCardEventKind;
  payload?: Record<string, unknown>;
}): HarnessCardEventRecord {
  return {
    id: randomUUID(),
    cardId: input.cardId,
    eventKind: input.eventKind,
    payload: input.payload ?? {},
    createdAt: new Date().toISOString()
  };
}

export function createHarnessBoardDecisionRecord(input: {
  runId: string;
  tenantId: string;
  actorUserId: string;
  decisionKind: HarnessBoardDecisionKind;
  cardId?: string | null;
  proposalId?: string | null;
  targetCardId?: string | null;
  persona?: string | null;
  deliverableType?: string | null;
  policyReason?: HarnessBoardPolicyReason | null;
  resolution?: string | null;
  decisionNote?: string | null;
  recommendationSummary?: string | null;
  objectionSummary?: string | null;
}): HarnessBoardDecisionRecord {
  return {
    id: randomUUID(),
    runId: input.runId,
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    decisionKind: input.decisionKind,
    cardId: input.cardId ?? null,
    proposalId: input.proposalId ?? null,
    targetCardId: input.targetCardId ?? null,
    persona: input.persona ?? null,
    deliverableType: input.deliverableType ?? null,
    policyReason: input.policyReason ?? null,
    resolution: input.resolution ?? null,
    decisionNote: input.decisionNote ?? null,
    recommendationSummary: input.recommendationSummary ?? null,
    objectionSummary: input.objectionSummary ?? null,
    createdAt: new Date().toISOString()
  };
}
