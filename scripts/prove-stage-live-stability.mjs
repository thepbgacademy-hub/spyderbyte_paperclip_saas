import process from "node:process";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { parseSecretFileContents } from "./lib/live-soak-capacity.mjs";
import { loadScriptEnv } from "./lib/script-env.mjs";
import { resolveNodeCommand, selectSingleWorkflowTemplateId } from "./lib/stage-live-proof.mjs";
import {
  DEFAULT_STAGE_STABILITY_ENV_FILE,
  DEFAULT_STAGE_STABILITY_SSH_ENV_FILE,
  buildStageStabilityPlan,
  parseStageStabilityArgs,
  rewriteStageStabilityLaneSpecs
} from "./lib/stage-live-stability.mjs";

const STAGE_STABILITY_SEQUENCE = [
  "npm run prove:stage-live",
  "npm run prove:live-fairness",
  "npm run prove:live-soak-capacity"
];
const DRY_RUN_FLAG = "--dry-run";
const args = parseStageStabilityArgs(process.argv.slice(2));
const envFilePath = typeof args["env-file"] === "string" && args["env-file"].trim().length > 0
  ? args["env-file"].trim()
  : DEFAULT_STAGE_STABILITY_ENV_FILE;
const sshEnvFilePath = typeof args["ssh-env-file"] === "string" && args["ssh-env-file"].trim().length > 0
  ? args["ssh-env-file"].trim()
  : DEFAULT_STAGE_STABILITY_SSH_ENV_FILE;
const source = {
  ...loadScriptEnv(sshEnvFilePath),
  ...loadScriptEnv(envFilePath),
  ...process.env
};
const plan = buildStageStabilityPlan({ args, env: source });

if (plan.dryRun) {
  process.stderr.write(`Skipping live execution because ${DRY_RUN_FLAG} was requested.\n`);
  process.stdout.write(`${JSON.stringify({ ok: true, dryRun: true, sequence: STAGE_STABILITY_SEQUENCE, plan }, null, 2)}\n`);
  process.exit(0);
}

const baseEnv = {
  ...process.env,
  ...source,
  WF_STAGE_ENV_FILE: plan.envFilePath,
  WF_STAGE_SSH_ENV_FILE: plan.sshEnvFilePath
};
const sudoPassword = parseSecretFileContents(readFileSync(plan.sudoPasswordFilePath, "utf8"));
let remoteWorkflowTemplateIdByLane = null;

for (const step of plan.steps) {
  if (step.id === "stage-live-proof") {
    runStep(step, baseEnv);
    continue;
  }
  if (!remoteWorkflowTemplateIdByLane) {
    remoteWorkflowTemplateIdByLane = await resolveRemoteWorkflowTemplateIdsForLanes({
      lanes: plan.lanes,
      sshTarget: plan.sshTarget,
      proofContainer: plan.proofContainer,
      sudoPassword
    });
  }
  const compatibilityStep = {
    ...step,
    args: rewriteStageStabilityLaneSpecs({
      stepArgs: step.args,
      workflowTemplateIdByLane: remoteWorkflowTemplateIdByLane
    })
  };
  if (step.id === "stage-live-fairness") {
    runRemoteFairnessStep({
      step: compatibilityStep,
      sshTarget: plan.sshTarget,
      proofContainer: plan.proofContainer,
      sudoPassword
    });
    continue;
  }
  runStep(compatibilityStep, baseEnv);
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  phase: "stage_stability_complete",
  steps: plan.steps.map((step) => step.id)
}, null, 2)}\n`);

function runStep(step, env) {
  process.stdout.write(`\n>> ${step.label}\n`);
  const command = resolveNodeCommand(step.command);
  const result = spawnSync(command, step.args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    shell: process.platform === "win32" && /\.cmd$/i.test(command)
  });
  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
  if (result.error) {
    throw result.error;
  }
}

function runRemoteFairnessStep({ step, sshTarget, proofContainer, sudoPassword }) {
  process.stdout.write(`\n>> ${step.label} (remote ${proofContainer})\n`);
  const forwardedArgs = extractForwardedArgs(step.args);
  const innerCommand = [
    "cd /app",
    "node scripts/prove-live-fairness.mjs",
    ...forwardedArgs.map((value) => `'${shellEscapeSingleQuotes(value)}'`)
  ].join(" ");
  const remoteCommand =
    `printf '%s\\n' '${shellEscapeSingleQuotes(sudoPassword)}' | sudo -S -p '' ` +
    `docker exec ${shellEscapeSingleQuotes(proofContainer)} sh -lc '${shellEscapeSingleQuotes(innerCommand)}'`;
  const result = spawnSync("ssh", [sshTarget, remoteCommand], {
    cwd: process.cwd(),
    stdio: "inherit"
  });
  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
  if (result.error) {
    throw result.error;
  }
}

function extractForwardedArgs(stepArgs) {
  const separatorIndex = stepArgs.indexOf("--");
  if (separatorIndex < 0) {
    return [];
  }
  return stepArgs.slice(separatorIndex + 1);
}

function shellEscapeSingleQuotes(value) {
  return String(value).replace(/'/g, `'\"'\"'`);
}

async function resolveRemoteWorkflowTemplateIdsForLanes({ lanes, sshTarget, proofContainer, sudoPassword }) {
  const workflowTemplateIdByLane = new Map();
  for (const lane of lanes) {
    const workflowTemplateId = await resolveRemoteWorkflowTemplateId({
      sshTarget,
      sudoPassword,
      proofContainer,
      tenantId: lane.tenantId
    });
    workflowTemplateIdByLane.set(
      `${lane.laneName}:${lane.tenantId}:${lane.userId}:${lane.workflowId}`,
      workflowTemplateId
    );
  }
  return workflowTemplateIdByLane;
}

async function resolveRemoteWorkflowTemplateId({ sshTarget, sudoPassword, proofContainer, tenantId }) {
  const remoteScript = [
    "const pg = require('pg');",
    "const client = new pg.Client({",
    "  connectionString: process.env.SUPABASE_DB_URL,",
    "  ssl: process.env.SUPABASE_DB_SSL === 'false' ? undefined : { rejectUnauthorized: true }",
    "});",
    "(async () => {",
    "  await client.connect();",
    `  const result = await client.query(\"select id from wfpc.workflow_templates where tenant_id = '${tenantId}' order by created_at desc\");`,
    "  console.log(JSON.stringify(result.rows));",
    "  await client.end();",
    "})().catch((error) => {",
    "  console.error(error);",
    "  process.exit(1);",
    "});"
  ].join(" ");
  const remoteCommand =
    `printf '%s\\n' '${shellEscapeSingleQuotes(sudoPassword)}' | sudo -S -p '' docker exec ${shellEscapeSingleQuotes(proofContainer)} node -e ` +
    `"${escapeDoubleQuotes(remoteScript)}"`;
  const result = spawnSync("ssh", [sshTarget, remoteCommand], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  if (typeof result.status === "number" && result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `SSH workflow-id resolution failed with code ${result.status}`);
  }
  if (result.error) {
    throw result.error;
  }
  return selectSingleWorkflowTemplateId(JSON.parse(String(result.stdout ?? "").trim()));
}

function escapeDoubleQuotes(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
