import { randomUUID } from "node:crypto";

import type { ProviderKind } from "../db/types.js";

export type HarnessRunState = "queued" | "planning" | "active" | "waiting" | "blocked" | "assembling" | "done" | "failed" | "cancelled";
export type HarnessCardState = "queued" | "planning" | "approved" | "working" | "waiting" | "blocked" | "done" | "cancelled";
export type HarnessPersona = string;
export type HarnessDeliverableType = string;
export type HarnessCardEventKind = "created" | "state_changed" | "comment_added" | "subcard_proposed" | "result_recorded";

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
