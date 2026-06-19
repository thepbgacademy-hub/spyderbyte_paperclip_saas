import process from "node:process";
import { readFileSync } from "node:fs";

import { parseSecretFileContents } from "./lib/live-soak-capacity.mjs";
import { loadScriptEnv } from "./lib/script-env.mjs";
import { runStageStabilityPlan } from "./lib/stage-live-stability-runner.mjs";
import {
  DEFAULT_STAGE_STABILITY_ENV_FILE,
  DEFAULT_STAGE_STABILITY_SSH_ENV_FILE,
  buildStageStabilityPlan,
  parseStageStabilityArgs
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
await runStageStabilityPlan({
  plan,
  baseEnv,
  sudoPassword
});
