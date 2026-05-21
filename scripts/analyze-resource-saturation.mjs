import { readFile } from "node:fs/promises";
import process from "node:process";

import {
  DEFAULT_SATURATION_THRESHOLDS,
  parseDockerStatsDocument,
  parseQueueSnapshotsDocument,
  summarizeResourceSaturation
} from "./lib/resource-saturation.mjs";

const args = parseArgs(process.argv.slice(2));
const dockerStatsPaths = toArray(args["docker-stats"]);
const queueSnapshotPaths = toArray(args["queue-snapshots"]);

if (dockerStatsPaths.length < 1) {
  throw new Error("Expected at least one --docker-stats <path>");
}

const dockerSamples = (
  await Promise.all(dockerStatsPaths.map((path) => readFile(path, "utf8")))
).flatMap((contents) => parseDockerStatsDocument(contents));

const queueSnapshots = (
  await Promise.all(queueSnapshotPaths.map((path) => readFile(path, "utf8")))
).flatMap((contents) => parseQueueSnapshotsDocument(contents));

const summary = summarizeResourceSaturation({
  dockerSamples,
  queueSnapshots,
  thresholds: {
    cpuPercent: parsePositiveInteger(args["cpu-hot"], DEFAULT_SATURATION_THRESHOLDS.cpuPercent, "cpu-hot"),
    memoryUsageBytes: parseMemoryBytes(args, DEFAULT_SATURATION_THRESHOLDS.memoryUsageBytes),
    pids: parsePositiveInteger(args["pids-hot"], DEFAULT_SATURATION_THRESHOLDS.pids, "pids-hot")
  }
});

const reasons = [];
if (summary.docker.valid !== true) {
  reasons.push("no_docker_samples_parsed");
}
if (queueSnapshotPaths.length > 0 && summary.queue.samples < 1) {
  reasons.push("no_queue_snapshots_parsed");
}
if (queueSnapshotPaths.length > 0 && summary.queue.reachableSamples < 1) {
  reasons.push("no_reachable_queue_snapshots");
}
if (queueSnapshotPaths.length > 0 && summary.queue.reachableSamples > 0 && summary.queue.reachableSamples < summary.queue.samples) {
  reasons.push("queue_snapshots_partially_unreachable");
}

const ok = reasons.length === 0;

process.stdout.write(
  JSON.stringify(
    {
      ok,
      reasons,
      dockerSamples,
      queueSnapshots,
      summary
    },
    null,
    2
  ) + "\n"
);

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      continue;
    }
    const key = value.slice(2);
    const nextValue = values[index + 1];
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

function parsePositiveInteger(value, fallback, label) {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Expected --${label} to be > 0`);
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
