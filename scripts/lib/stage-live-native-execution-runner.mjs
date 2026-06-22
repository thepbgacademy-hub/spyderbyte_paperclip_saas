import process from "node:process";
import { spawnSync } from "node:child_process";

export function runStageLiveNativeExecutionPlan(input) {
  const stdout = input.stdout ?? process.stdout;
  const spawn = input.spawn ?? spawnSync;
  const cwd = input.cwd ?? process.cwd();

  for (const lane of input.lanes) {
    stdout.write(`\n== Stage native execution lane: ${lane.laneName} (${lane.workflowId}) ==\n`);
    runCommand({
      stepId: lane.workflowId,
      label: "node scripts/prove-live-native-execution.mjs",
      command: process.execPath,
      args: [
        "scripts/prove-live-native-execution.mjs",
        "--env-file",
        input.envFilePath,
        "--ssh-env-file",
        input.sshEnvFilePath,
        "--ssh-target",
        input.sshTarget,
        "--preflight-container",
        input.preflightContainer,
        "--tenant",
        lane.profile.tenantId,
        "--user",
        lane.profile.userId,
        "--workflow",
        lane.workflowId,
        "--workflow-template",
        lane.profile.workflowTemplateId
      ],
      options: {
        cwd,
        shell: process.platform === "win32" && /\.cmd$/i.test(process.execPath),
        stdio: "inherit",
        env: input.childEnv
      },
      stdout,
      spawn
    });
  }
}

function runCommand(input) {
  input.stdout.write(`\n>> ${input.label}\n`);
  const result = input.spawn(input.command, input.args, input.options);
  if (typeof result.status === "number" && result.status !== 0) {
    throw new StageLiveNativeExecutionStepError({
      stepId: input.stepId,
      stepLabel: input.label,
      status: result.status
    });
  }
  if (result.status === null && typeof result.signal === "string" && result.signal.length > 0) {
    throw new StageLiveNativeExecutionStepError({
      stepId: input.stepId,
      stepLabel: input.label,
      signal: result.signal
    });
  }
  if (result.error) {
    throw result.error;
  }
}

class StageLiveNativeExecutionStepError extends Error {
  constructor(input) {
    super(`${input.stepLabel} failed with exit status ${input.status}`);
    this.name = "StageLiveNativeExecutionStepError";
    this.stepId = input.stepId;
    this.stepLabel = input.stepLabel;
    this.status = input.status ?? null;
    this.signal = input.signal ?? null;
  }
}
