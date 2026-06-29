import process from "node:process";

import { loadScriptEnv } from "./lib/script-env.mjs";
import {
  buildStageOperatorControlsProbePlan,
  parseStageOperatorControlsArgs,
  publicPlan,
  runStageOperatorControlsProbe
} from "./lib/stage-operator-controls-probe.mjs";

const args = parseStageOperatorControlsArgs(process.argv.slice(2));
const envFilePath = typeof args["env-file"] === "string" && args["env-file"].trim().length > 0
  ? args["env-file"].trim()
  : undefined;
const env = {
  ...(envFilePath ? loadScriptEnv(envFilePath) : {}),
  ...process.env
};

try {
  const plan = buildStageOperatorControlsProbePlan({ args, env });
  if (plan.dryRun) {
    process.stderr.write("DRY RUN: no network calls made. Pass --execute-read-only to run the bounded GET probe.\n");
    process.stdout.write(`${JSON.stringify(await runStageOperatorControlsProbe({ plan }), null, 2)}\n`);
    process.exit(0);
  }

  process.stderr.write(`--execute-read-only acknowledged; issuing one ${plan.method} request to ${plan.endpoint}\n`);
  const result = await runStageOperatorControlsProbe({ plan });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
} catch (error) {
  process.stderr.write(`${formatError(error)}\n`);
  process.stdout.write(`${JSON.stringify({ ok: false, phase: "stage_operator_controls_probe_failed", error: formatError(error), plan: args["execute-read-only"] === true ? undefined : publicPlanSafe(args, env) }, null, 2)}\n`);
  process.exit(1);
}

function publicPlanSafe(args, env) {
  try {
    return publicPlan(buildStageOperatorControlsProbePlan({ args, env }));
  } catch {
    return null;
  }
}

function formatError(error) {
  return error instanceof Error ? error.message : "Stage operator controls probe failed";
}
