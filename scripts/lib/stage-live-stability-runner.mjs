import { spawnSync } from "node:child_process";

import { resolveNodeCommand } from "./stage-live-proof.mjs";

export async function runStageStabilityPlan(input) {
  const {
    plan,
    baseEnv,
    sudoPassword,
    stdout = process.stdout,
    cwd = process.cwd(),
    spawn = spawnSync,
    resolveCommand = resolveNodeCommand
  } = input;

  for (const step of plan.steps) {
    if (step.id === "stage-live-fairness") {
      runRemoteFairnessStep({
        step,
        sshTarget: plan.sshTarget,
        proofContainer: plan.proofContainer,
        sudoPassword,
        env: baseEnv,
        stdout,
        cwd,
        spawn
      });
      continue;
    }

    runStep({
      step,
      env: baseEnv,
      stdout,
      cwd,
      spawn,
      resolveCommand
    });
  }

  const result = {
    ok: true,
    phase: "stage_stability_complete",
    steps: plan.steps.map((step) => step.id)
  };
  stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

class StageStabilityStepError extends Error {
  constructor(step, status) {
    super(`Stage stability step "${step.id}" failed with exit status ${status}`);
    this.name = "StageStabilityStepError";
    this.stepId = step.id;
    this.stepLabel = step.label;
    this.status = status;
  }
}

function runStep(input) {
  const { step, env, stdout, cwd, spawn, resolveCommand } = input;
  stdout.write(`\n>> ${step.label}\n`);
  const command = resolveCommand(step.command);
  const result = spawn(command, step.args, {
    cwd,
    env,
    stdio: "inherit",
    shell: process.platform === "win32" && /\.cmd$/i.test(command)
  });
  if (typeof result.status === "number" && result.status !== 0) {
    throw new StageStabilityStepError(step, result.status);
  }
  if (result.error) {
    throw result.error;
  }
}

function runRemoteFairnessStep(input) {
  const { step, sshTarget, proofContainer, sudoPassword, env, stdout, cwd, spawn } = input;
  stdout.write(`\n>> ${step.label} (remote ${proofContainer})\n`);
  assertShellSafeContainerToken(proofContainer, "proof-container");
  const forwardedArgs = extractForwardedArgs(step.args);
  const forwardedEnvArgs = buildRemoteFairnessEnvArgs(env);
  const innerCommand = `cd /app && node scripts/prove-live-fairness.mjs ${forwardedArgs
    .map((value) => `'${shellEscapeSingleQuotes(value)}'`)
    .join(" ")}`.trim();
  const remoteCommand =
    `printf '%s\\n' '${shellEscapeSingleQuotes(sudoPassword)}' | sudo -S -p '' ` +
    `docker exec ${forwardedEnvArgs} ${shellEscapeSingleQuotes(proofContainer)} sh -lc '${shellEscapeSingleQuotes(innerCommand)}'`;
  const result = spawn("ssh", [sshTarget, remoteCommand], {
    cwd,
    stdio: "inherit"
  });
  if (typeof result.status === "number" && result.status !== 0) {
    throw new StageStabilityStepError(step, result.status);
  }
  if (result.error) {
    throw result.error;
  }
}

function buildRemoteFairnessEnvArgs(env = {}) {
  const apiOrigin = normalizeOrigin(env.WF_LIVE_BASE_URL ?? env.WF_STAGE_API_ORIGIN);
  const portalOrigin = normalizeOrigin(env.WF_SMOKE_PORTAL_URL ?? env.WF_STAGE_PORTAL_ORIGIN);
  const entries = [
    ["WF_LIVE_BASE_URL", apiOrigin],
    ["WF_SMOKE_PORTAL_URL", portalOrigin]
  ].filter(([, value]) => value);
  return entries.map(([key, value]) => `-e ${key}='${shellEscapeSingleQuotes(value)}'`).join(" ");
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

function assertShellSafeContainerToken(value, optionName) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(value ?? ""))) {
    throw new Error(`Stage stability ${optionName} must be a shell-safe container token`);
  }
}

function normalizeOrigin(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().replace(/\/$/, "") : null;
}
