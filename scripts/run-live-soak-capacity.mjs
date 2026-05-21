import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { clearTimeout, setTimeout } from "node:timers";

import {
  buildCapacityVerdict,
  DEFAULT_SATURATION_THRESHOLDS,
  buildRemoteDockerStatsCommand,
  buildRemoteQueueSnapshotCommand,
  parseSecretFileContents,
  parseRemoteQueueSnapshotStdout,
  splitCollectorAndProofArgs,
  summarizeCapacityPressure,
  tagDockerStatsSamples
} from "./lib/live-soak-capacity.mjs";
import { loadScriptEnv } from "./lib/script-env.mjs";

const env = loadScriptEnv();
const { collectorArgs, proofArgs } = splitCollectorAndProofArgs(process.argv.slice(2));
const args = parseArgs(collectorArgs);

const sshTarget = readRequiredString(args["ssh-target"], "ssh-target");
const dockerStatsPath = resolvePath(args["docker-stats-out"] ?? defaultAuditPath("live-soak-docker-stats.jsonl"));
const queueSnapshotsPath = resolvePath(args["queue-snapshots-out"] ?? defaultAuditPath("live-soak-queue-snapshots.jsonl"));
const sampleIntervalMs = parsePositiveInteger(args["interval-ms"], 10000, "interval-ms");
const cooldownMs = parsePositiveInteger(args["cooldown-ms"], 15000, "cooldown-ms", { allowZero: true });
const sshTimeoutMs = parsePositiveInteger(args["ssh-timeout-ms"], 10000, "ssh-timeout-ms");
const thresholds = {
  cpuPercent: parsePositiveInteger(args["cpu-hot"], DEFAULT_SATURATION_THRESHOLDS.cpuPercent, "cpu-hot"),
  memoryUsageBytes: parseMemoryBytes(args, DEFAULT_SATURATION_THRESHOLDS.memoryUsageBytes),
  pids: parsePositiveInteger(args["pids-hot"], DEFAULT_SATURATION_THRESHOLDS.pids, "pids-hot")
};
const focusContainers = toArray(args["focus-container"]);
const queueContainer = readRequiredString(args["queue-container"] ?? "wealth-factory-api-stage2", "queue-container");
const proofOutPath = resolvePath(args["proof-out"] ?? defaultAuditPath("live-soak-capacity-proof.json"));
const sudoPasswordFile = args["sudo-password-file"] ? resolvePath(args["sudo-password-file"]) : null;
const sudoPassword = sudoPasswordFile ? parseSecretFileContents(await readFile(sudoPasswordFile, "utf8")) : null;

if (proofArgs.length === 0) {
  throw new Error("Expected forwarded prove-live-fairness args after --");
}

await mkdir(dirname(dockerStatsPath), { recursive: true });
await mkdir(dirname(queueSnapshotsPath), { recursive: true });
await mkdir(dirname(proofOutPath), { recursive: true });

const proofChild = spawn(process.execPath, ["scripts/prove-live-fairness.mjs", ...proofArgs], {
  cwd: process.cwd(),
  env: {
    ...process.env
  },
  stdio: ["ignore", "pipe", "pipe"]
});

const proofStdoutChunks = [];
const proofStderrChunks = [];
proofChild.stdout.on("data", (chunk) => proofStdoutChunks.push(String(chunk)));
proofChild.stderr.on("data", (chunk) => proofStderrChunks.push(String(chunk)));

const proofExit = new Promise((resolveProof) => {
  proofChild.on("exit", (code, signal) => {
    resolveProof({ code: code ?? 1, signal: signal ?? null });
  });
});

const dockerSamples = [];
const queueSnapshots = [];
const sampleFailures = [];

let proofResult = null;
let proofExitResult = null;
let cooldownDeadline = null;
let proofParseError = null;

while (true) {
  const observedAt = new Date().toISOString();
  const loopResult = await captureSample({
    sshTarget,
    observedAt,
    dockerStatsPath,
    queueSnapshotsPath,
    sshTimeoutMs,
    queueContainer
  });
  dockerSamples.push(...loopResult.dockerSamples);
  queueSnapshots.push(loopResult.queueSnapshot);
  sampleFailures.push(...loopResult.failures);

  if (!proofExitResult) {
    const raceResult = await Promise.race([
      proofExit.then((value) => ({ type: "proof-exit", value })),
      delay(sampleIntervalMs).then(() => ({ type: "interval" }))
    ]);
    if (raceResult.type === "proof-exit") {
      proofExitResult = raceResult.value;
      const stdout = proofStdoutChunks.join("");
      const parsedProof = parseProofStdout(stdout);
      proofResult = parsedProof.proofResult;
      proofParseError = parsedProof.proofParseError;
      await writeProofArtifact(proofOutPath, stdout);
      cooldownDeadline = Date.now() + cooldownMs;
    }
  } else if (Date.now() >= cooldownDeadline) {
    break;
  } else {
    await delay(sampleIntervalMs);
  }
}

if (!proofExitResult) {
  proofExitResult = await proofExit;
}
if (!proofResult) {
  const stdout = proofStdoutChunks.join("");
  const parsedProof = parseProofStdout(stdout);
  proofResult = parsedProof.proofResult;
  proofParseError = parsedProof.proofParseError;
  await writeProofArtifact(proofOutPath, stdout);
}

const capacity = summarizeCapacityPressure({
  dockerSamples,
  queueSnapshots,
  thresholds,
  focusContainers
});
const reasons = buildCapacityVerdict({
  proofResult,
  proofExitResult,
  proofParseError,
  dockerSampleCount: dockerSamples.length,
  queueSnapshotCount: queueSnapshots.length,
  queueReachableSamples: capacity?.saturation?.queue?.reachableSamples,
  queueEvidenceValid: capacity?.saturation?.queue?.valid,
  concerningContainers: capacity.concerningContainers
});

process.exitCode = reasons.length > 0 ? 1 : 0;
process.stdout.write(
  JSON.stringify(
    {
      ok: reasons.length === 0,
      reasons,
      thresholds,
      focusContainers: focusContainers.length > 0 ? focusContainers : Object.keys(capacity.focus),
      proof: proofResult,
      proofExit: proofExitResult,
      proofParseError,
      saturation: capacity,
      sampleFailures,
      proofStderr: proofStderrChunks.join("").trim() || null,
      artifacts: {
        dockerStatsPath,
        queueSnapshotsPath,
        proofOutPath
      }
    },
    null,
    2
  ) + "\n"
);

async function captureSample({
  sshTarget,
  observedAt,
  dockerStatsPath,
  queueSnapshotsPath,
  sshTimeoutMs,
  queueContainer
}) {
  const failures = [];
  let dockerOutput = "";

  try {
    const result = await sshExec({
      sshTarget,
      remoteCommand: buildRemoteDockerStatsCommand(),
      timeoutMs: sshTimeoutMs,
      sudoPassword,
      maxBufferBytes: 10 * 1024 * 1024
    });
    dockerOutput = result.stdout;
  } catch (error) {
    failures.push({
      observedAt,
      scope: "docker",
      error: error instanceof Error ? error.message : "ssh docker stats failed"
    });
  }

  let queueSnapshot;
  try {
    const result = await sshExec({
      sshTarget,
      remoteCommand: buildRemoteQueueSnapshotCommand({ queueContainer }),
      timeoutMs: sshTimeoutMs,
      sudoPassword,
      maxBufferBytes: 1024 * 1024
    });
    queueSnapshot = parseRemoteQueueSnapshotStdout(result.stdout, { observedAt });
  } catch (error) {
    queueSnapshot = {
      observedAt,
      queueName: env.WF_WORKFLOW_QUEUE_NAME?.trim() || "wfpc-workflow-runs",
      reachable: false,
      error: error instanceof Error ? error.message : "remote queue snapshot failed",
      counts: null
    };
    failures.push({
      observedAt,
      scope: "queue",
      error: queueSnapshot.error
    });
  }

  const taggedDockerSamples = tagDockerStatsSamples(dockerOutput, { observedAt });
  if (taggedDockerSamples.length > 0) {
    await appendJsonLines(dockerStatsPath, taggedDockerSamples);
  }

  await appendJsonLines(queueSnapshotsPath, [queueSnapshot]);

  return {
    dockerSamples: taggedDockerSamples,
    queueSnapshot,
    failures
  };
}

async function writeProofArtifact(path, stdout) {
  await writeFile(path, stdout.trim().length > 0 ? `${stdout.trim()}\n` : "", "utf8");
}

function sshExec({
  sshTarget,
  remoteCommand,
  timeoutMs,
  sudoPassword,
  maxBufferBytes
}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("ssh", [
      sshTarget,
      sudoPassword ? `sudo -S -p '' ${remoteCommand}` : remoteCommand
    ], {
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGKILL");
      rejectPromise(new Error(`SSH command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxBufferBytes) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          child.kill("SIGKILL");
          rejectPromise(new Error(`SSH stdout exceeded ${maxBufferBytes} bytes`));
        }
        return;
      }
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > maxBufferBytes) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          child.kill("SIGKILL");
          rejectPromise(new Error(`SSH stderr exceeded ${maxBufferBytes} bytes`));
        }
        return;
      }
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.on("exit", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      rejectPromise(new Error(stderr.trim() || stdout.trim() || `SSH command exited with code ${code}`));
    });

    if (sudoPassword) {
      child.stdin.write(`${sudoPassword}\n`);
    }
    child.stdin.end();
  });
}

async function appendJsonLines(path, values) {
  const lines = values.map((value) => JSON.stringify(value)).join("\n");
  if (!lines) {
    return;
  }
  await appendFile(path, `${lines}\n`, "utf8");
}

function defaultAuditPath(filename) {
  const date = new Date().toISOString().slice(0, 10);
  return `audit/${date}/${filename}`;
}

function resolvePath(path) {
  return resolve(process.cwd(), String(path));
}

function readRequiredString(value, key) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`Missing required --${key}`);
  }
  return normalized;
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      continue;
    }
    const key = value.slice(2);
    const nextValue = values[index + 1];
    if (!nextValue || nextValue.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    if (Object.hasOwn(parsed, key)) {
      parsed[key] = [...toArray(parsed[key]), nextValue];
    } else {
      parsed[key] = nextValue;
    }
    index += 1;
  }
  return parsed;
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return typeof value === "string" ? [value] : [];
}

function parsePositiveInteger(value, fallback, label, { allowZero = false } = {}) {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0 || (!allowZero && parsed < 1)) {
    throw new Error(`Expected --${label} to be ${allowZero ? ">= 0" : "> 0"}`);
  }
  return parsed;
}

function parseMemoryBytes(args, fallback) {
  if (args["memory-hot-bytes"] !== undefined) {
    return parsePositiveInteger(args["memory-hot-bytes"], fallback, "memory-hot-bytes");
  }
  if (args["memory-hot-gib"] !== undefined) {
    const parsed = Number.parseFloat(String(args["memory-hot-gib"]));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error("Expected --memory-hot-gib to be > 0");
    }
    return Math.round(parsed * 1024 ** 3);
  }
  return fallback;
}

function parseProofStdout(stdout) {
  const text = String(stdout ?? "").trim();
  if (!text) {
    return {
      proofResult: {
        ok: false,
        phase: "proof_output_missing",
        error: "prove-live-fairness did not emit JSON"
      },
      proofParseError: "prove-live-fairness did not emit JSON"
    };
  }
  try {
    return {
      proofResult: JSON.parse(text),
      proofParseError: null
    };
  } catch (error) {
    return {
      proofResult: {
        ok: false,
        phase: "proof_output_invalid",
        error: error instanceof Error ? error.message : "Failed to parse prove-live-fairness output"
      },
      proofParseError: error instanceof Error ? error.message : "Failed to parse prove-live-fairness output"
    };
  }
}
