import { readFile } from "node:fs/promises";
import process from "node:process";

import { summarizePressureProof } from "./lib/pressure-drive.mjs";

const args = parseArgs(process.argv.slice(2));
const workerEventPaths = toArray(args["worker-events"]);

if (!args.proof || workerEventPaths.length === 0) {
  throw new Error("Expected --proof <path> and --worker-events <path>");
}

const proof = JSON.parse(await readFile(args.proof, "utf8"));
const workerEvents = (
  await Promise.all(workerEventPaths.map((path) => readFile(path, "utf8")))
).flatMap((contents) =>
  contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line);
        return parsed?.type === "wealth_factory_worker_run" || parsed?.type === "wealth_factory_worker_claim"
          ? [parsed]
          : [];
      } catch {
        return [];
      }
    })
);

const summary = summarizePressureProof({
  requests: proof.requests,
  snapshots: proof.snapshots,
  workerEvents,
  mode: "global-fairness"
});

process.stdout.write(
  JSON.stringify(
    {
      ok: summary.ok,
      phase: summary.phase,
      requests: proof.requests,
      snapshots: proof.snapshots,
      workerEvents,
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
