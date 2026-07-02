import process from "node:process";
import { spawnSync } from "node:child_process";

const CODEX_SUBSCRIPTION_WORKFLOW_IDS = new Set(["wf_connect_first_workflow"]);

export function runStageLiveNativeExecutionPlan(input) {
  const stdout = input.stdout ?? process.stdout;
  const spawn = input.spawn ?? spawnSync;
  const cwd = input.cwd ?? process.cwd();

  for (const lane of input.lanes) {
    const codexReadinessArgs = resolveCodexReadinessArgs(input, lane);
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
        ...codexReadinessArgs,
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

function resolveCodexReadinessArgs(input, lane) {
  if (!CODEX_SUBSCRIPTION_WORKFLOW_IDS.has(lane.workflowId)) {
    return [];
  }
  if (!input.apiCodexHomeReadinessProofPath || !input.workerCodexHomeReadinessProofPath) {
    throw new StageLiveNativeExecutionStepError({
      stepId: "codex_readiness_gate",
      stepLabel: "Codex auth-home readiness proof gate",
      status: 1,
      message: `Both API and worker Codex auth-home readiness proof paths are required before stage native execution for ${lane.workflowId}.`
    });
  }

  return [
    "--api-codex-home-readiness-proof",
    input.apiCodexHomeReadinessProofPath,
    "--worker-codex-home-readiness-proof",
    input.workerCodexHomeReadinessProofPath,
    ...(input.codexAuthStateRef ? ["--codex-auth-state-ref", input.codexAuthStateRef] : [])
  ];
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
    super(input.message ?? `${input.stepLabel} failed with exit status ${input.status}`);
    this.name = "StageLiveNativeExecutionStepError";
    this.stepId = input.stepId;
    this.stepLabel = input.stepLabel;
    this.status = input.status ?? null;
    this.signal = input.signal ?? null;
  }
}
