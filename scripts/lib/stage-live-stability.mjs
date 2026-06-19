import { DEMO_PROFILES } from "./demo-seed-profiles.mjs";
import {
  DEFAULT_STAGE_PROOF_ENV_FILE,
  DEFAULT_STAGE_SSH_ENV_FILE,
  buildStageProofPlan
} from "./stage-live-proof.mjs";
import { alignDurableHarnessProofPlan } from "./native-proof-lane-model.mjs";

export const DEFAULT_STAGE_STABILITY_ENV_FILE = DEFAULT_STAGE_PROOF_ENV_FILE;
export const DEFAULT_STAGE_STABILITY_SSH_ENV_FILE = DEFAULT_STAGE_SSH_ENV_FILE;
export const DEFAULT_STAGE_STABILITY_SUDO_PASSWORD_FILE = "sudo_deploy.txt";
export const DEFAULT_STAGE_STABILITY_QUEUE_CONTAINER = "wf-stage-api";
export const DEFAULT_STAGE_STABILITY_PROOF_CONTAINER = "wf-stage-api";
export const DEFAULT_STAGE_STABILITY_LANES = ["primary", "secondary", "tertiary", "quaternary", "quinary", "senary"];
export const DEFAULT_STAGE_STABILITY_FOCUS_CONTAINERS = [
  "wf-stage-api",
  "wf-stage-worker",
  "wf-stage-web"
];

export function parseStageStabilityArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      continue;
    }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    if (Object.hasOwn(args, key)) {
      const previous = args[key];
      args[key] = Array.isArray(previous) ? [...previous, next] : [previous, next];
    } else {
      args[key] = next;
    }
    index += 1;
  }
  return args;
}

export function buildStageStabilityPlan({ args, env }) {
  const envFilePath =
    resolveSingleOptionValue({ args, key: "env-file", envValue: env.WF_STAGE_ENV_FILE }) ?? DEFAULT_STAGE_STABILITY_ENV_FILE;
  const sshEnvFilePath =
    resolveSingleOptionValue({ args, key: "ssh-env-file", envValue: env.WF_STAGE_SSH_ENV_FILE }) ?? DEFAULT_STAGE_STABILITY_SSH_ENV_FILE;
  const sudoPasswordFilePath =
    resolveSingleOptionValue({ args, key: "sudo-password-file", envValue: env.WF_STAGE_SUDO_PASSWORD_FILE })
    ?? DEFAULT_STAGE_STABILITY_SUDO_PASSWORD_FILE;
  const queueContainer =
    validateContainerToken(
      resolveSingleOptionValue({ args, key: "queue-container", envValue: env.WF_STAGE_QUEUE_CONTAINER })
      ?? DEFAULT_STAGE_STABILITY_QUEUE_CONTAINER,
      "queue-container"
    );
  const proofContainer =
    validateContainerToken(
      resolveSingleOptionValue({ args, key: "proof-container", envValue: env.WF_STAGE_PROOF_CONTAINER })
      ?? DEFAULT_STAGE_STABILITY_PROOF_CONTAINER,
      "proof-container"
    );
  const focusContainers = parseFocusContainers(args["focus-container"] ?? env.WF_STAGE_FOCUS_CONTAINERS);
  const laneNames = parseLaneNames(args.lanes ?? env.WF_STAGE_STABILITY_LANES);
  const lanes = laneNames.map((laneName) => {
    const profile = DEMO_PROFILES[laneName];
    if (!profile) {
      throw new Error(`Unknown stage stability lane '${laneName}'. Use one of: ${Object.keys(DEMO_PROFILES).sort().join(", ")}`);
    }
    return {
      laneName,
      tenantId: profile.tenantId,
      userId: profile.userId,
      workflowId: profile.workflowId
    };
  });

  const stageProofPlan = buildStageProofPlan({
    args: {
      "env-file": envFilePath
    },
    env
  });
  const sshTarget =
    resolveSingleOptionValue({ args, key: "ssh-target", envValue: env.WF_STAGE_SSH_TARGET })
    ?? stageProofPlan.preflightDb.sshTarget
    ?? null;
  if (!sshTarget) {
    throw new Error("WF_STAGE_SSH_TARGET or VPS2_USER/VPS2_HOST is required for stage stability proof");
  }

  const fairnessProofPlan = alignDurableHarnessProofPlan({
    lanes: lanes.map((lane) => ({ ...lane, runs: 3 })),
    cycles: 3
  });
  const soakProofPlan = alignDurableHarnessProofPlan({
    lanes: lanes.map((lane) => ({ ...lane, runs: soakRunCount(lane.laneName) })),
    cycles: 8
  });

  return {
    envFilePath,
    sshEnvFilePath,
    sudoPasswordFilePath,
    queueContainer,
    proofContainer,
    focusContainers,
    sshTarget,
    preflightDb: stageProofPlan.preflightDb,
    dryRun: args["dry-run"] === true,
    lanes,
    proofModelNotes: [...new Set([...fairnessProofPlan.notes, ...soakProofPlan.notes])],
    steps: [
      {
        id: "stage-live-proof",
        label: "npm run prove:stage-live",
        command: "npm",
        args: [
          "run",
          "prove:stage-live",
          "--",
          "--env-file",
          envFilePath,
          "--ssh-env-file",
          sshEnvFilePath,
          "--ssh-target",
          sshTarget
        ]
      },
      {
        id: "stage-live-fairness",
        label: "npm run prove:live-fairness",
        command: "npm",
        args: [
          "run",
          "prove:live-fairness",
          "--",
          "--mode",
          "drain",
          "--order",
          "staggered",
          "--cycles",
          String(fairnessProofPlan.cycles),
          "--cycle-interval-ms",
          "500",
          "--queue-interval-ms",
          "250",
          "--timeout",
          "240000",
          "--post-success-observation-ms",
          "15000",
          ...fairnessProofPlan.lanes.flatMap((lane) => ["--lane", formatLaneSpec(lane, lane.runs)])
        ]
      },
      {
        id: "stage-live-soak",
        label: "npm run prove:live-soak-capacity",
        command: "npm",
        args: [
          "run",
          "prove:live-soak-capacity",
          "--",
          "--ssh-target",
          sshTarget,
          "--sudo-password-file",
          sudoPasswordFilePath,
          "--queue-container",
          queueContainer,
          "--proof-ssh-target",
          sshTarget,
          "--proof-container",
          proofContainer,
          "--docker-stats-out",
          buildDefaultAuditPath("stage-live-soak-docker-stats.jsonl"),
          "--queue-snapshots-out",
          buildDefaultAuditPath("stage-live-soak-queue-snapshots.jsonl"),
          "--proof-out",
          buildDefaultAuditPath("stage-live-soak-capacity-proof.json"),
          "--interval-ms",
          "10000",
          "--cooldown-ms",
          "15000",
          "--ssh-timeout-ms",
          "20000",
          ...focusContainers.flatMap((container) => ["--focus-container", container]),
          "--",
          "--mode",
          "drain",
          "--order",
          "staggered",
          "--cycles",
          String(soakProofPlan.cycles),
          "--cycle-interval-ms",
          "1500",
          "--queue-interval-ms",
          "250",
          "--timeout",
          "240000",
          "--post-success-observation-ms",
          "120000",
          ...soakProofPlan.lanes.flatMap((lane) => ["--lane", formatLaneSpec(lane, lane.runs)])
        ]
      }
    ]
  };
}

function parseLaneNames(value) {
  const entries = toEntries(value);
  if (entries.length === 0) {
    return [...DEFAULT_STAGE_STABILITY_LANES];
  }
  return entries;
}

function parseFocusContainers(value) {
  const entries = toEntries(value);
  if (entries.length === 0) {
    return [...DEFAULT_STAGE_STABILITY_FOCUS_CONTAINERS];
  }
  return [...new Set(entries)];
}

function formatLaneSpec(lane, runs) {
  return `${lane.laneName}:${lane.tenantId}:${lane.userId}:${lane.workflowId}:${runs}`;
}

function soakRunCount(laneName) {
  return laneName === "primary"
    ? 3
    : laneName === "secondary" || laneName === "tertiary"
      ? 2
      : 1;
}

function buildDefaultAuditPath(filename) {
  const date = new Date().toISOString().slice(0, 10);
  return `audit/${date}/${filename}`;
}

function resolveSingleOptionValue({ args, key, envValue }) {
  if (Object.hasOwn(args, key)) {
    return parseSingleOptionValue(args[key], key, { rejectBlank: true });
  }
  return parseSingleOptionValue(envValue, key);
}

function parseSingleOptionValue(value, optionName, options = {}) {
  const { rejectBlank = false } = options;
  if (value === true) {
    throw new Error(`Stage stability option --${optionName} requires a value`);
  }
  if (Array.isArray(value)) {
    throw new Error(`Stage stability option --${optionName} may only be provided once`);
  }
  if (rejectBlank && typeof value === "string" && value.trim().length === 0) {
    throw new Error(`Stage stability option --${optionName} cannot be blank`);
  }
  return normalizeValue(value);
}

function validateContainerToken(value, optionName) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    throw new Error(`Stage stability option --${optionName} must be a shell-safe container token`);
  }
  return value;
}

function normalizeValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toEntries(value) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((entry) => String(entry ?? "").split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
}
