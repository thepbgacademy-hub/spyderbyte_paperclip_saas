export const DEFAULT_STAGE_OPERATOR_TIMEOUT_MS: number;
export const ACCEPTED_STAGE_OPERATOR_STATUSES: Set<number>;

export type StageOperatorControlsArgs = Record<string, string | boolean | undefined>;

export type StageOperatorControlsProbePlan = {
  dryRun: boolean;
  executeReadOnly: boolean;
  apiOrigin: string;
  tenantId: string;
  method: "GET";
  path: string;
  endpoint: string;
  timeoutMs: number;
  acceptedStatuses: number[];
  token: string | null;
  authorizationPreview: string | null;
};

export type StageOperatorControlsProbeResult = {
  ok: boolean;
  dryRun: boolean;
  message?: string;
  plan?: Omit<StageOperatorControlsProbePlan, "token">;
  endpoint?: string;
  method?: "GET";
  status?: number;
  latencyMs?: number;
  verdict?: "accepted_operator_surface_status" | "unexpected_operator_surface_status";
  authorizationPreview?: string | null;
};

export function parseStageOperatorControlsArgs(argv: string[]): StageOperatorControlsArgs;
export function buildStageOperatorControlsProbePlan(input: {
  args: StageOperatorControlsArgs;
  env: Record<string, string | undefined>;
}): StageOperatorControlsProbePlan;
export function runStageOperatorControlsProbe(input: {
  plan: StageOperatorControlsProbePlan;
  fetch?: typeof fetch;
  now?: () => number;
}): Promise<StageOperatorControlsProbeResult>;
export function publicPlan(plan: StageOperatorControlsProbePlan): Omit<StageOperatorControlsProbePlan, "token">;
