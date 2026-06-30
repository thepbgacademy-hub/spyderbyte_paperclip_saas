import { spawnSync } from "node:child_process";
import process from "node:process";

import {
  buildPublicLaunchHostPlan,
  parsePublicLaunchHostArgs
} from "./lib/public-launch-host.mjs";

const plan = buildPublicLaunchHostPlan({
  args: parsePublicLaunchHostArgs(process.argv.slice(2)),
  env: process.env
});

if (!plan.execute) {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    dryRun: true,
    phase: "public_launch_host_proof_planned",
    launchPosture: plan.launchPosture,
    apiOrigin: plan.apiOrigin,
    portalOrigin: plan.portalOrigin,
    cutoverHost: plan.cutoverHost,
    note: "DRY RUN: no network calls made. Pass --execute to run the public launch host proof.",
    commands: plan.commands.map((command) => ({
      label: command.label,
      env: redactSensitiveEnv(command.env)
    }))
  }, null, 2)}\n`);
  process.exit(0);
}

const results = [];
for (const command of plan.commands) {
  process.stdout.write(`\n>> ${command.label}\n`);
  const result = spawnSync(command.command, command.args, {
    cwd: process.cwd(),
    shell: process.platform === "win32" && /\.cmd$/i.test(command.command),
    stdio: "inherit",
    env: {
      ...process.env,
      ...command.env
    }
  });
  results.push({
    label: command.label,
    status: result.status ?? 1
  });
  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
  if (result.error) {
    throw result.error;
  }
}

process.stdout.write(`\n${JSON.stringify({
  ok: true,
  dryRun: false,
  phase: "public_launch_host_verified",
  launchPosture: plan.launchPosture,
  apiOrigin: plan.apiOrigin,
  portalOrigin: plan.portalOrigin,
  cutoverHost: plan.cutoverHost,
  results
}, null, 2)}\n`);

function redactSensitiveEnv(env) {
  return Object.fromEntries(Object.entries(env).map(([key, value]) => [
    key,
    isSensitiveEnvKey(key) && value ? "<set>" : value
  ]));
}

function isSensitiveEnvKey(key) {
  return /(?:COOKIE|TOKEN|SECRET|PASSWORD|KEY)/i.test(key);
}
