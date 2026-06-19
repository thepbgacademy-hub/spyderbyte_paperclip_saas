import { parseDockerStatsDocument, summarizeResourceSaturation, DEFAULT_SATURATION_THRESHOLDS } from "./resource-saturation.mjs";

export { DEFAULT_SATURATION_THRESHOLDS } from "./resource-saturation.mjs";

export function splitCollectorAndProofArgs(argv) {
  const separatorIndex = argv.indexOf("--");
  if (separatorIndex < 0) {
    return {
      collectorArgs: argv,
      proofArgs: []
    };
  }
  return {
    collectorArgs: argv.slice(0, separatorIndex),
    proofArgs: argv.slice(separatorIndex + 1)
  };
}

export function parseSecretFileContents(contents) {
  const firstLine = String(contents ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) {
    throw new Error("Secret file did not contain a usable value");
  }
  const labeledMatch = firstLine.match(/^[^:]+:\s*(.+)$/);
  return (labeledMatch ? labeledMatch[1] : firstLine).trim();
}

export function tagDockerStatsSamples(contents, { observedAt }) {
  return parseDockerStatsDocument(contents).map((sample) => ({
    ...sample,
    observedAt: observedAt ?? sample.observedAt ?? null
  }));
}

export function buildRemoteDockerStatsCommand() {
  return "docker stats --no-stream --format '{{json .}}'";
}

export function buildRemoteQueueSnapshotCommand({ queueContainer }) {
  const normalized = String(queueContainer ?? "").trim();
  if (!normalized) {
    throw new Error("queueContainer is required");
  }
  return `docker exec ${normalized} node scripts/inspect-live-queue-snapshot.mjs`;
}

export function parseRemoteQueueSnapshotStdout(stdout, { observedAt }) {
  const jsonText = extractFirstJsonObject(stdout);
  const parsed = JSON.parse(jsonText);
  return {
    observedAt: observedAt ?? parsed.observedAt ?? null,
    queueName: parsed.queueName ?? null,
    reachable: typeof parsed.reachable === "boolean" ? parsed.reachable : null,
    error: parsed.error ?? null,
    counts: parsed.counts ?? null
  };
}

export function summarizeCapacityPressure(input) {
  const thresholds = normalizeThresholds(input?.thresholds);
  const saturation = summarizeResourceSaturation({
    dockerSamples: Array.isArray(input?.dockerSamples) ? input.dockerSamples : [],
    queueSnapshots: Array.isArray(input?.queueSnapshots) ? input.queueSnapshots : [],
    thresholds
  });
  const focusContainers = normalizeFocusContainers(input?.focusContainers, saturation.docker.byContainer);
  const focus = Object.fromEntries(
    focusContainers
      .filter((name) => Object.hasOwn(saturation.docker.byContainer, name))
      .map((name) => [name, saturation.docker.byContainer[name]])
  );
  const concerningContainers = focusContainers.filter((name) => {
    const container = saturation.docker.byContainer[name];
    return container && isSustainedHotspot(container);
  });

  const notes = concerningContainers.map(
    (name) => `${name} exceeded at least one saturation threshold with sustained duration during the soak window.`
  );

  return {
    thresholds,
    focus,
    concerningContainers,
    notes,
    saturation
  };
}

export function buildCapacityVerdict(input) {
  const reasons = [];
  const proofResult = input?.proofResult ?? null;
  const proofExitResult = input?.proofExitResult ?? null;
  const proofParseError = input?.proofParseError ?? null;
  const dockerSampleCount = Number(input?.dockerSampleCount ?? 0);
  const queueSnapshotCount = Number(input?.queueSnapshotCount ?? 0);
  const queueReachableSamples = Number(input?.queueReachableSamples ?? 0);
  const queueEvidenceValid = input?.queueEvidenceValid === true;
  const concerningContainers = Array.isArray(input?.concerningContainers) ? input.concerningContainers : [];

  if (proofParseError) {
    reasons.push("fairness_proof_output_invalid");
  }
  if (proofResult?.analysisPending === true) {
    reasons.push("fairness_proof_analysis_pending");
  } else if (proofExitResult?.code !== 0 || proofResult?.ok !== true) {
    reasons.push("fairness_proof_failed");
  }
  if (dockerSampleCount < 1) {
    reasons.push("no_docker_samples_collected");
  }
  if (queueSnapshotCount < 1) {
    reasons.push("no_queue_snapshots_collected");
  }
  if (queueReachableSamples < 1) {
    reasons.push("no_reachable_queue_snapshots");
  }
  if (queueSnapshotCount > 0 && !queueEvidenceValid) {
    reasons.push("queue_snapshot_evidence_incomplete");
  }
  if (concerningContainers.length > 0) {
    reasons.push("sustained_hotspot_detected");
  }

  return reasons;
}

function normalizeThresholds(thresholds) {
  return {
    cpuPercent: toFiniteNumber(thresholds?.cpuPercent, DEFAULT_SATURATION_THRESHOLDS.cpuPercent),
    memoryUsageBytes: toFiniteNumber(thresholds?.memoryUsageBytes, DEFAULT_SATURATION_THRESHOLDS.memoryUsageBytes),
    pids: toFiniteNumber(thresholds?.pids, DEFAULT_SATURATION_THRESHOLDS.pids)
  };
}

function normalizeFocusContainers(focusContainers, byContainer) {
  if (Array.isArray(focusContainers) && focusContainers.length > 0) {
    const normalizedEntries = [...new Set(focusContainers.map((value) => String(value ?? "").trim()).filter(Boolean))];
    const availableContainers = Object.keys(byContainer);
    return [...new Set(normalizedEntries.flatMap((entry) => {
      const exactMatches = availableContainers.filter((name) => name === entry);
      if (exactMatches.length > 0) {
        return exactMatches;
      }
      const partialMatches = availableContainers.filter((name) => name.includes(entry));
      return partialMatches.length > 0 ? partialMatches : [entry];
    }))];
  }
  return Object.keys(byContainer).sort();
}

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function extractFirstJsonObject(stdout) {
  const text = String(stdout ?? "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("No JSON object found in remote queue snapshot output");
  }
  return text.slice(start, end + 1);
}

function isSustainedHotspot(container) {
  const streak = Number(container?.longestHotStreaks?.any ?? 0);
  const ratio = Number(container?.hotSampleRatios?.any ?? 0);
  const hotSamples = Number(container?.hotSamples?.any ?? 0);
  return hotSamples >= 2 && (streak >= 3 || ratio >= 0.3);
}
