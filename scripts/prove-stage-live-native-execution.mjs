import { readFileSync } from "node:fs";
import process from "node:process";

import { DEMO_PROFILES } from "./lib/demo-seed-profiles.mjs";
import { parseSecretFileContents } from "./lib/live-soak-capacity.mjs";
import { loadScriptEnv } from "./lib/script-env.mjs";
import { runStageLiveNativeExecutionPlan } from "./lib/stage-live-native-execution-runner.mjs";
import {
  DEFAULT_STAGE_PROOF_ENV_FILE,
  DEFAULT_STAGE_SSH_ENV_FILE,
  parseStageProofArgs,
  selectNamedStageProofLanes
} from "./lib/stage-live-proof.mjs";

const CORE_FAMILY_LANES = [
  { laneName: "primary", workflowId: "wf_connect_first_workflow", profile: DEMO_PROFILES.primary },
  { laneName: "tertiary", workflowId: "wf_tax_strategy", profile: DEMO_PROFILES.tertiary },
  { laneName: "quinary", workflowId: "wf_package_followup", profile: DEMO_PROFILES.quinary }
];

const args = parseStageProofArgs(process.argv.slice(2));
const envFilePath = normalizeValue(args["env-file"] ?? process.env.WF_STAGE_ENV_FILE) ?? DEFAULT_STAGE_PROOF_ENV_FILE;
const sshEnvFilePath = normalizeValue(args["ssh-env-file"] ?? process.env.WF_STAGE_SSH_ENV_FILE) ?? DEFAULT_STAGE_SSH_ENV_FILE;
const source = {
  ...loadScriptEnv(sshEnvFilePath),
  ...loadScriptEnv(envFilePath)
};
const env = {
  ...process.env,
  ...source
};
const sshTarget = normalizeValue(args["ssh-target"] ?? env.WF_STAGE_SSH_TARGET) ?? buildDefaultSshTarget(env);
const sudoPasswordFilePath = normalizeValue(args["sudo-password-file"] ?? env.WF_STAGE_SUDO_PASSWORD_FILE);
const sudoPassword = resolveSudoPassword({ env, sudoPasswordFilePath });
const childEnv = {
  ...env,
  VPS2_SUDO_PASSWORD: sudoPassword
};
const preflightContainer = validateContainerToken(
  normalizeValue(args["preflight-container"] ?? env.WF_STAGE_PREFLIGHT_CONTAINER) ?? "wf-stage-api",
  "preflight-container"
);

if (!sshTarget) {
  throw new Error("WF_STAGE_SSH_TARGET or VPS2_USER/VPS2_HOST is required for stage native execution proof");
}

try {
  const selectedLanes = selectNamedStageProofLanes(CORE_FAMILY_LANES, args.lanes ?? env.WF_STAGE_PROOF_LANES);
  runStageLiveNativeExecutionPlan({
    envFilePath,
    sshEnvFilePath,
    sshTarget,
    preflightContainer,
    childEnv,
    lanes: selectedLanes.map((lane) => ({
      ...lane,
      profile: {
        ...lane.profile,
        workflowTemplateId: requireWorkflowTemplateId(lane)
      }
    }))
  });
} catch (error) {
  process.stderr.write(`${formatStageNativeExecutionError(error)}\n`);
  process.exit(resolveStageNativeExecutionExitCode(error));
}

function validateContainerToken(value, optionName) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(value ?? ""))) {
    throw new Error(`Stage native execution option --${optionName} must be a shell-safe container token`);
  }
  return value;
}

function requireWorkflowTemplateId(lane) {
  const workflowTemplateId = normalizeValue(lane?.profile?.workflowTemplateId);
  if (!workflowTemplateId) {
    throw new Error(`Missing workflow template id for stage native execution lane '${lane?.laneName ?? lane?.workflowId ?? "unknown"}'`);
  }
  return workflowTemplateId;
}

function buildDefaultSshTarget(env) {
  const user = normalizeValue(env.VPS2_USER);
  const host = normalizeValue(env.VPS2_HOST);
  if (!user || !host) {
    return null;
  }
  return `${user}@${host}`;
}

function resolveSudoPassword({ env, sudoPasswordFilePath }) {
  const envPassword = normalizeValue(env.VPS2_SUDO_PASSWORD);
  if (envPassword) {
    return envPassword;
  }
  if (!sudoPasswordFilePath) {
    throw new Error("VPS2_SUDO_PASSWORD or --sudo-password-file is required");
  }
  const filePassword = normalizeValue(parseSecretFileContents(readFileSync(sudoPasswordFilePath, "utf8")));
  if (!filePassword) {
    throw new Error(`Sudo password file '${sudoPasswordFilePath}' is empty`);
  }
  return filePassword;
}

function normalizeValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function formatStageNativeExecutionError(error) {
  return error instanceof Error ? error.message : "Stage native execution proof failed";
}

function resolveStageNativeExecutionExitCode(error) {
  return typeof error?.status === "number" ? error.status : 1;
}
