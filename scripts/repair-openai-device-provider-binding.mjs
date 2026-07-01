import process from "node:process";

const PROVIDER_KIND = "openai_chatgpt_codex_subscription";

const args = parseArgs(process.argv.slice(2));
const tenantId = readArg(args, "tenant");
const workflowId = readArg(args, "workflow");
const codexHome = normalizeValue(args["codex-home"] ?? process.env.WF_OPENAI_CODEX_HOME);
const authStateRef = normalizeValue(args["auth-state-ref"] ?? process.env.WF_OPENAI_CODEX_AUTH_STATE_REF);
const execute = args.execute === "true";
const codexHomeReadyConfirmed = args["confirm-codex-home-ready"] === "true";

if (!tenantId || !workflowId) {
  throw new Error("--tenant and --workflow are required");
}

if (execute && (!codexHome || !authStateRef)) {
  throw new Error("--codex-home and --auth-state-ref are required before executing an OpenAI device provider binding repair");
}

if (execute && !codexHomeReadyConfirmed) {
  throw new Error(
    "--confirm-codex-home-ready is required before execute mode; first prove Codex CLI, tenant-isolated CODEX_HOME, and a non-secret smoke prompt from the Wealth Factory worker lane"
  );
}

if (execute) {
  throw new Error(
    "live DB mutation is not implemented in this slice; use dry-run output and the launch checklist until the tenant-isolated Codex auth home and package-provider requirement update are ready for a dedicated execute phase"
  );
}

const plannedSqlContract = [
  "BEGIN",
  "UPDATE wfpc.workflow_templates SET provider_kind = $3 WHERE tenant_id = $1 AND workflow_id = $2",
  "UPDATE wfpc.package_provider_requirements SET provider_kind = $3 WHERE tenant_id = $1 AND workflow_id = $2 AND provider_kind IN ('openai_api', 'openai_chatgpt_codex_subscription')",
  "UPDATE wfpc.secret_references SET active = false WHERE tenant_id = $1 AND provider_kind = $3 AND active = true -- dedupe subscription rows only; openai_api remains active fallback",
  "INSERT INTO wfpc_private.vault_secrets (...) VALUES (...) -- empty subscription marker only, never raw Codex auth material",
  "INSERT INTO wfpc.secret_references (...) VALUES (...) -- metadata includes codexHome/authStateRef references only",
  "COMMIT",
  "do not mutate existing workflow_runs; start a fresh proof run after repair"
];

const plan = {
  ok: true,
  dryRun: !execute,
  phase: execute ? "openai_device_provider_binding_repair_execute_guard_reached" : "openai_device_provider_binding_repair_planned",
  tenantId,
  workflowId,
  providerKind: PROVIDER_KIND,
  label: "OpenAI Codex",
  codexHomeSupplied: Boolean(codexHome),
  authStateRefSupplied: Boolean(authStateRef),
  codexHomeReadyConfirmed,
  plannedSqlContract,
  liveMutationScope: [
    "wfpc.workflow_templates provider_kind for the requested tenant/workflow only",
    "wfpc.secret_references active provider row for the requested tenant/provider only",
    "wfpc_private.vault_secrets empty subscription marker for the generated secret reference only"
  ],
  blockedScope: [
    "Paperclip containers or provider rows",
    "DNS, Caddy, launch-host cutover, or unrelated VPS services",
    "existing bound workflow_runs rows unless a separate fresh proof/rebind phase is explicitly run",
    "BYOK/API-provider lanes for Anthropic, Gemini/OpenRouter, OpenAI API keys, or other user-owned API accounts"
  ],
  note: execute
    ? "EXECUTE mode currently stops at the preflight guard in this build slice; wire DB mutation only after stage Codex auth home is installed and reviewed."
    : "DRY RUN: no network, database, VPS, provider, or workflow mutation performed. Pass --execute only after the stage Codex auth home exists."
};

process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);

function parseArgs(values) {
  const parsed = {};
  const booleanFlags = new Set(["execute", "confirm-codex-home-ready"]);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      continue;
    }
    const key = value.slice(2);
    if (booleanFlags.has(key)) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = values[index + 1] ?? "";
    index += 1;
  }
  return parsed;
}

function readArg(parsed, name) {
  return normalizeValue(parsed[name]);
}

function normalizeValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
