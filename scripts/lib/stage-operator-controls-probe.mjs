export const DEFAULT_STAGE_OPERATOR_TIMEOUT_MS = 8000;
export const ACCEPTED_STAGE_OPERATOR_STATUSES = new Set([200, 403, 404, 501]);

export function parseStageOperatorControlsArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      continue;
    }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

export function buildStageOperatorControlsProbePlan({ args, env }) {
  const apiOrigin = requireOrigin(args["api-origin"] ?? env.WF_STAGE_API_ORIGIN, "WF_STAGE_API_ORIGIN");
  const tenantId = requireToken(args.tenant ?? env.WF_STAGE_OPERATOR_TENANT_ID, "WF_STAGE_OPERATOR_TENANT_ID");
  const method = parseReadOnlyMethod(args.method ?? env.WF_STAGE_OPERATOR_PROBE_METHOD ?? "GET");
  const path = parseProbePath(args.path, tenantId);
  const executeReadOnly = args["execute-read-only"] === true;
  const token = normalizeValue(args.token ?? env.WF_STAGE_OPERATOR_BEARER_TOKEN);
  const timeoutMs = parseTimeoutMs(args["timeout-ms"] ?? env.WF_STAGE_OPERATOR_TIMEOUT_MS);

  if (executeReadOnly && !token) {
    throw new Error("WF_STAGE_OPERATOR_BEARER_TOKEN is required when --execute-read-only is set");
  }

  return {
    dryRun: !executeReadOnly,
    executeReadOnly,
    apiOrigin,
    tenantId,
    method,
    path,
    endpoint: `${apiOrigin}${path}`,
    timeoutMs,
    acceptedStatuses: [...ACCEPTED_STAGE_OPERATOR_STATUSES].sort((left, right) => left - right),
    token: executeReadOnly ? token : null,
    authorizationPreview: executeReadOnly ? previewToken(token) : null
  };
}

export async function runStageOperatorControlsProbe({ plan, fetch = globalThis.fetch, now = () => Date.now() }) {
  if (plan.dryRun) {
    return {
      ok: true,
      dryRun: true,
      message: "DRY RUN: no network calls made",
      plan: publicPlan(plan)
    };
  }

  assertReadOnlyMethod(plan.method);
  const startedAt = now();
  const response = await fetch(plan.endpoint, {
    method: plan.method,
    headers: {
      authorization: `Bearer ${plan.token}`,
      accept: "application/json"
    },
    signal: AbortSignal.timeout(plan.timeoutMs),
    redirect: "manual"
  });
  const latencyMs = Math.max(0, now() - startedAt);
  const accepted = ACCEPTED_STAGE_OPERATOR_STATUSES.has(response.status);

  return {
    ok: accepted,
    dryRun: false,
    endpoint: plan.endpoint,
    method: plan.method,
    status: response.status,
    latencyMs,
    verdict: accepted ? "accepted_operator_surface_status" : "unexpected_operator_surface_status",
    authorizationPreview: plan.authorizationPreview
  };
}

export function publicPlan(plan) {
  const { token: _token, ...safePlan } = plan;
  return safePlan;
}

function parseReadOnlyMethod(value) {
  const method = normalizeValue(value)?.toUpperCase() ?? "GET";
  assertReadOnlyMethod(method);
  return method;
}

function assertReadOnlyMethod(method) {
  if (method !== "GET") {
    throw new Error("Stage operator controls probe only supports the GET read-only method");
  }
}

function parseProbePath(value, tenantId) {
  const path = normalizeValue(value) ?? `/api/operator/tenants/${encodeURIComponent(tenantId)}/jobs/dead-letters`;
  if (path !== `/api/operator/tenants/${encodeURIComponent(tenantId)}/jobs/dead-letters`) {
    throw new Error("Stage operator controls probe only supports the dead-letter read path");
  }
  return path;
}

function requireOrigin(value, name) {
  const normalized = normalizeValue(value);
  if (!normalized) {
    throw new Error(`${name} is required`);
  }
  return normalized.replace(/\/$/, "");
}

function requireToken(value, name) {
  const normalized = normalizeValue(value);
  if (!normalized) {
    throw new Error(`${name} is required`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(normalized)) {
    throw new Error(`${name} must be a bounded token value`);
  }
  return normalized;
}

function parseTimeoutMs(value) {
  const normalized = normalizeValue(value);
  if (!normalized) {
    return DEFAULT_STAGE_OPERATOR_TIMEOUT_MS;
  }
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1000 || parsed > 10000) {
    throw new Error("--timeout-ms must be an integer between 1000 and 10000");
  }
  return parsed;
}

function previewToken(token) {
  return `${token.slice(0, 4)}****`;
}

function normalizeValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
