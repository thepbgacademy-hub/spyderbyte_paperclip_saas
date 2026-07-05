import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import process from "node:process";

const PROVIDER_KIND = "openai_chatgpt_codex_subscription";

const args = parseArgs(process.argv.slice(2));
const tenantId = readArg(args, "tenant");
const workflowId = readArg(args, "workflow");
const workflowTemplateId = readArg(args, "workflow-template") ?? workflowId;
const rebindExistingRunId = readArg(args, "rebind-existing-run");
const codexHome = normalizeValue(args["codex-home"] ?? process.env.WF_OPENAI_CODEX_HOME);
const authStateRef = normalizeAuthStateRef(args["auth-state-ref"] ?? process.env.WF_OPENAI_CODEX_AUTH_STATE_REF);
const codexHomeReadinessProofPath = normalizeValue(
  args["codex-home-readiness-proof"] ?? process.env.WF_OPENAI_CODEX_HOME_READINESS_PROOF
);
const execute = args.execute === "true";
const codexHomeReadyConfirmed = args["confirm-codex-home-ready"] === "true";
const dbUrl = normalizeValue(process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL);

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

if (execute && !codexHomeReadinessProofPath) {
  throw new Error("--codex-home-readiness-proof is required before execute mode; do not rely on --confirm-codex-home-ready alone");
}

const codexHomeReadinessProof = codexHomeReadinessProofPath
  ? loadCodexHomeReadinessProof(codexHomeReadinessProofPath)
  : null;

if (execute) {
  validateCodexHomeReadinessProof(codexHomeReadinessProof, {
    tenantId,
    workflowId,
    authStateRef,
    codexHomeFingerprint: fingerprintCodexHome(codexHome)
  });
}

const plannedSqlContract = [
  "BEGIN",
  "SELECT workflow template FOR UPDATE by tenant/workflow to fetch package_id",
  "UPDATE wfpc.workflow_templates SET provider_kind = $3 WHERE tenant_id = $1 AND id = $2",
  "ASSERT package provider requirement remains present; do not mutate package-scoped requirements in this lane",
  "UPDATE wfpc.secret_references SET revoked_at = now() WHERE tenant_id = $1 AND provider_kind = $2 AND revoked_at IS NULL -- dedupe subscription rows only; openai_api remains active fallback",
  "UPSERT wfpc.secret_references metadata with codexHome/authStateRef and non-secret readiness breadcrumbs only; no vault_secrets write and never raw Codex auth material",
  "OPTIONAL REBIND_EXACT_EXISTING_WORKFLOW_RUN updates one tenant/workflow/run bound provider context only when --rebind-existing-run is supplied",
  "COMMIT",
  "do not mutate existing workflow_runs unless --rebind-existing-run supplies an exact stale run id"
];

if (execute && !dbUrl && !isTestMockDbEnabled()) {
  throw new Error("SUPABASE_DB_URL or DATABASE_URL is required before executing an OpenAI device provider binding repair");
}

if (execute) {
  const result = await executeRepairTransaction({
    tenantId,
    workflowId,
    workflowTemplateId,
    codexHome,
    authStateRef,
    dbUrl,
    rebindExistingRunId
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}

const plan = {
  ok: true,
  dryRun: !execute,
  phase: execute ? "openai_device_provider_binding_repair_execute_guard_reached" : "openai_device_provider_binding_repair_planned",
  tenantId,
  workflowId,
  workflowTemplateId,
  providerKind: PROVIDER_KIND,
  label: "OpenAI Codex",
  codexHomeSupplied: Boolean(codexHome),
  authStateRefSupplied: Boolean(authStateRef),
  codexHomeReadyConfirmed,
  codexHomeReadinessProofSupplied: Boolean(codexHomeReadinessProofPath),
  codexHomeReadinessProofPhase: codexHomeReadinessProof?.phase ?? null,
  rebindExistingRunSupplied: Boolean(rebindExistingRunId),
  plannedSqlContract,
  liveMutationScope: [
    "wfpc.workflow_templates provider_kind for the requested tenant/workflow template only",
    "verify package provider requirement seam exists without mutating package-scoped provider_kind",
    "wfpc.secret_references active subscription-provider reference for the requested tenant/provider only; no vault_secrets write",
    "wfpc.workflow_runs bound provider context for one exact tenant/workflow/run only when --rebind-existing-run is supplied"
  ],
  blockedScope: [
    "Paperclip containers or provider rows",
    "DNS, Caddy, launch-host cutover, or unrelated VPS services",
    "existing bound workflow_runs rows unless this operator explicitly supplies --rebind-existing-run for one stale run",
    "BYOK/API-provider lanes for Anthropic, Gemini/OpenRouter, OpenAI API keys, or other user-owned API accounts"
  ],
  note: execute
    ? "EXECUTE mode performs the target-scoped repair only after the Codex auth-home proof, explicit confirmation, and DB URL gates pass."
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

function normalizeAuthStateRef(value) {
  const normalized = normalizeValue(value);
  if (!normalized) {
    return null;
  }

  return normalized === "codex-home:first-subscriber" ? "first-subscriber-openai-device" : normalized;
}

async function executeRepairTransaction(input) {
  const client = await createRepairClient(input.dbUrl);
  const executedSql = [];
  const secretRef = buildCodexSubscriptionSecretRef(input.tenantId, input.workflowId);
  const metadata = {
    codexHome: input.codexHome,
    authStateRef: input.authStateRef,
    readinessProofPhase: codexHomeReadinessProof?.phase ?? null,
    readinessProofArtifact: codexHomeReadinessProofPath ? "supplied" : "missing",
    codexHomeReady: codexHomeReadinessProof?.phase === "codex_auth_home_ready",
    codexHomeWritable: codexHomeReadinessProof?.codexHomeWritable === true,
    codexHomeFingerprint: codexHomeReadinessProof?.codexHomeFingerprint ?? null,
    smokePromptPassed: codexHomeReadinessProof?.smokePromptPassed === true
  };

  try {
    await trackedQuery(client, executedSql, "BEGIN", "BEGIN");
    const workflow = await trackedQuery(
      client,
      executedSql,
      "SELECT_WORKFLOW_TEMPLATE_FOR_UPDATE",
      `select id, package_id, provider_kind
       from wfpc.workflow_templates
       where tenant_id = $1
         and id = $2
         and enabled = true
       for update`,
      [input.tenantId, input.workflowTemplateId]
    );
    if (workflow.rows.length === 0) {
      throw new Error("target workflow template was not found for the requested tenant/workflow");
    }
    const packageId = workflow.rows[0]?.package_id;
    if (!packageId) {
      throw new Error("target workflow template is missing package_id; cannot update package provider requirement seam");
    }

    const requirementCheck = await trackedQuery(
      client,
      executedSql,
      "ASSERT_PACKAGE_PROVIDER_REQUIREMENT_PRESENT",
      `select id
       from wfpc.package_provider_requirements
       where package_id = $1
         and provider_kind in ('openai_api', 'openai_chatgpt_codex_subscription')
       limit 1`,
      [packageId]
    );
    if (requirementCheck.rows.length === 0) {
      throw new Error("package provider requirement seam was not found for the target workflow package");
    }

    const workflowUpdate = await trackedQuery(
      client,
      executedSql,
      "UPDATE_WORKFLOW_TEMPLATE_PROVIDER",
      `update wfpc.workflow_templates
       set provider_kind = $3::wfpc.provider_kind,
           updated_at = now()
       where tenant_id = $1
         and id = $2
       returning id`,
      [input.tenantId, input.workflowTemplateId, PROVIDER_KIND]
    );
    if (workflowUpdate.rowCount === 0) {
      throw new Error("target workflow template provider binding was not updated");
    }

    const revoked = await trackedQuery(
      client,
      executedSql,
      "REVOKE_ACTIVE_CODEX_SUBSCRIPTION_REFERENCES",
      `update wfpc.secret_references
       set revoked_at = coalesce(revoked_at, now()),
           revoked_reason = coalesce(revoked_reason, 'superseded'),
           updated_at = now()
       where tenant_id = $1
         and provider_kind = $2::wfpc.provider_kind
         and revoked_at is null
       returning id`,
      [input.tenantId, PROVIDER_KIND]
    );

    const secretReference = await trackedQuery(
      client,
      executedSql,
      "UPSERT_CODEX_SUBSCRIPTION_SECRET_REFERENCE",
      `insert into wfpc.secret_references (tenant_id, provider_kind, label, secret_ref, metadata, revoked_at)
       values ($1, $2::wfpc.provider_kind, $3, $4, $5::jsonb, null)
       on conflict (tenant_id, secret_ref) do update
       set provider_kind = excluded.provider_kind,
           label = excluded.label,
           metadata = excluded.metadata,
           revoked_at = null,
           revoked_reason = null,
           updated_at = now()
       where wfpc.secret_references.provider_kind = excluded.provider_kind
       returning id`,
      [input.tenantId, PROVIDER_KIND, "OpenAI Codex", secretRef, JSON.stringify(metadata)]
    );
    if (secretReference.rowCount === 0) {
      throw new Error("Codex subscription secret reference was not activated; existing secret_ref belongs to a different provider lane");
    }
    const secretReferenceId = secretReference.rows[0]?.id;
    if (!secretReferenceId) {
      throw new Error("Codex subscription secret reference did not return an id");
    }

    let workflowRunsTouched = false;
    if (input.rebindExistingRunId) {
      const providerContext = [
        {
          capability: "text_generation",
          providerKind: PROVIDER_KIND,
          label: "OpenAI Codex",
          secretRef,
          metadata
        }
      ];
      const rebound = await trackedQuery(
        client,
        executedSql,
        "REBIND_EXACT_EXISTING_WORKFLOW_RUN",
        `update wfpc.workflow_runs
         set bound_secret_reference_id = $5,
             bound_provider_context = $6::jsonb,
             updated_at = now()
         where tenant_id = $1
           and id = $2
           and public_workflow_id = $3
           and workflow_template_id = $4
         returning id`,
        [
          input.tenantId,
          input.rebindExistingRunId,
          input.workflowId,
          input.workflowTemplateId,
          secretReferenceId,
          JSON.stringify(providerContext)
        ]
      );
      if (rebound.rowCount !== 1) {
        throw new Error("exact stale workflow run was not rebound; expected one tenant/workflow/run match");
      }
      workflowRunsTouched = true;
    }

    await trackedQuery(client, executedSql, "COMMIT", "COMMIT");
    return {
      ok: true,
      dryRun: false,
      phase: "openai_device_provider_binding_repair_executed",
      tenantId: input.tenantId,
      workflowId: input.workflowId,
      workflowTemplateId: input.workflowTemplateId,
      providerKind: PROVIDER_KIND,
      label: "OpenAI Codex",
      codexHomeSupplied: true,
      authStateRefSupplied: true,
      codexHomeReadyConfirmed,
      codexHomeReadinessProofSupplied: true,
      codexHomeReadinessProofPhase: codexHomeReadinessProof?.phase ?? null,
      rebindExistingRunSupplied: Boolean(input.rebindExistingRunId),
      workflowTemplateUpdated: true,
      packageProviderRequirementUpdated: false,
      codexSubscriptionReferencesRevoked: revoked.rowCount ?? 0,
      secretReferenceActivated: true,
      workflowRunsTouched,
      reboundExistingRunId: input.rebindExistingRunId ?? null,
      paperclipTouched: false,
      dnsCaddyChanged: false,
      byokApiProviderLanesTouched: false,
      executedSql
    };
  } catch (error) {
    try {
      await trackedQuery(client, executedSql, "ROLLBACK", "ROLLBACK");
    } catch {
      // Preserve the original failure. The caller needs the target repair error.
    }
    throw error;
  } finally {
    await client.end();
  }
}

async function createRepairClient(dbUrl) {
  if (isTestMockDbEnabled()) {
    return createMockRepairClient(process.env.WF_REPAIR_PROVIDER_BINDING_MOCK_DB);
  }
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: dbUrl,
    ssl: String(process.env.SUPABASE_DB_SSL ?? "").toLowerCase() === "true" ? { rejectUnauthorized: false } : undefined
  });
  await client.connect();
  return client;
}

async function trackedQuery(client, executedSql, label, sql, params = []) {
  executedSql.push(label);
  return client.query(sql, params);
}

function buildCodexSubscriptionSecretRef(tenantId, workflowId) {
  return `wfpc_codex_subscription_${tenantId}_${workflowId}`.replace(/[^A-Za-z0-9_-]/g, "_");
}

function fingerprintCodexHome(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex").slice(0, 16);
}

function isTestMockDbEnabled() {
  return process.env.NODE_ENV === "test" && normalizeValue(process.env.WF_REPAIR_PROVIDER_BINDING_MOCK_DB);
}

function createMockRepairClient(mode) {
  return {
    async query(sql) {
      const normalized = String(sql).trim().toLowerCase();
      if (normalized === "begin" || normalized === "commit" || normalized === "rollback") {
        return { rows: [], rowCount: 0 };
      }
      if (normalized.startsWith("select id, package_id")) {
        return mode === "missing-workflow"
          ? { rows: [], rowCount: 0 }
          : { rows: [{ id: "wf_connect_first_workflow", package_id: "44444444-4444-4444-8444-444444444444" }], rowCount: 1 };
      }
      if (normalized.startsWith("update wfpc.workflow_templates")) {
        return { rows: [{ id: "wf_connect_first_workflow" }], rowCount: 1 };
      }
      if (normalized.startsWith("select id") && normalized.includes("from wfpc.package_provider_requirements")) {
        return mode === "missing-requirement"
          ? { rows: [], rowCount: 0 }
          : { rows: [{ id: "provider-requirement-1" }], rowCount: 1 };
      }
      if (normalized.startsWith("update wfpc.secret_references")) {
        return { rows: [], rowCount: 0 };
      }
      if (normalized.startsWith("insert into wfpc.secret_references")) {
        return mode === "conflicting-secret-ref"
          ? { rows: [], rowCount: 0 }
          : { rows: [{ id: "secret-reference-1" }], rowCount: 1 };
      }
      if (normalized.startsWith("update wfpc.workflow_runs")) {
        return { rows: [{ id: "169c4ac8-ea8d-48fe-accc-6dcc60d4dd4d" }], rowCount: 1 };
      }
      throw new Error(`unexpected mock repair SQL: ${String(sql).slice(0, 80)}`);
    },
    async end() {}
  };
}

function loadCodexHomeReadinessProof(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`Codex auth-home readiness proof could not be loaded: ${error.message}`);
  }
}

function validateCodexHomeReadinessProof(proof, expected) {
  if (
    !proof ||
    proof.phase !== "codex_auth_home_ready" ||
    proof.ok !== true ||
    proof.codexCliPresent !== true ||
    proof.codexHomeExists !== true ||
    proof.codexHomeWritable !== true ||
    proof.smokePromptPassed !== true ||
    proof.mutationPerformed !== false ||
    proof.dbRowsWritten !== false ||
    proof.workflowRunsTouched !== false ||
    proof.targetTenantId !== expected.tenantId ||
    proof.targetWorkflowId !== expected.workflowId ||
    proof.authStateRef !== expected.authStateRef ||
    proof.codexHomeFingerprint !== expected.codexHomeFingerprint
  ) {
    throw new Error(
      "Codex auth-home readiness proof must be green and match the requested repair target before execute mode: require codex_auth_home_ready, CLI present, CODEX_HOME present/writable, smoke prompt passed, no prior mutation, and matching tenant/workflow/auth-state/CODEX_HOME fingerprint"
    );
  }
}
