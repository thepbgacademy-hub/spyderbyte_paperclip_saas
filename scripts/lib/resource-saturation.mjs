export const DEFAULT_SATURATION_THRESHOLDS = {
  cpuPercent: 250,
  memoryUsageBytes: 2_147_483_648,
  pids: 800
};

export function summarizeResourceSaturation(input) {
  const dockerSamples = Array.isArray(input?.dockerSamples)
    ? input.dockerSamples.map((sample) => normalizeDockerSample(sample))
    : [];
  const queueSnapshots = Array.isArray(input?.queueSnapshots)
    ? input.queueSnapshots.map((snapshot) => normalizeQueueSnapshot(snapshot))
    : [];
  const thresholds = normalizeThresholds(input?.thresholds);

  const byContainer = {};
  for (const sample of dockerSamples) {
    const container = byContainer[sample.name] ?? {
      samples: 0,
      totalCpuPercent: 0,
      totalMemoryUsageBytes: 0,
      totalMemoryPercent: 0,
      totalPids: 0,
      maxCpuPercent: 0,
      maxMemoryUsageBytes: 0,
      maxMemoryPercent: 0,
      maxPids: 0,
      hotSamples: {
        cpuPercent: 0,
        memoryUsageBytes: 0,
        pids: 0,
        any: 0
      },
      longestHotStreaks: {
        cpuPercent: 0,
        memoryUsageBytes: 0,
        pids: 0,
        any: 0
      },
      currentHotStreaks: {
        cpuPercent: 0,
        memoryUsageBytes: 0,
        pids: 0,
        any: 0
      }
    };
    container.samples += 1;
    container.totalCpuPercent += sample.cpuPercent;
    container.totalMemoryUsageBytes += sample.memoryUsageBytes;
    container.totalMemoryPercent += sample.memoryPercent;
    container.totalPids += sample.pids;
    container.maxCpuPercent = Math.max(container.maxCpuPercent, sample.cpuPercent);
    container.maxMemoryUsageBytes = Math.max(container.maxMemoryUsageBytes, sample.memoryUsageBytes);
    container.maxMemoryPercent = Math.max(container.maxMemoryPercent, sample.memoryPercent);
    container.maxPids = Math.max(container.maxPids, sample.pids);
    updateHotspotStats(container, sample, thresholds);
    byContainer[sample.name] = container;
  }

  for (const container of Object.values(byContainer)) {
    container.avgCpuPercent = roundTo(container.totalCpuPercent / container.samples, 2);
    container.avgMemoryUsageBytes = Math.round(container.totalMemoryUsageBytes / container.samples);
    container.avgMemoryPercent = roundTo(container.totalMemoryPercent / container.samples, 2);
    container.avgPids = roundTo(container.totalPids / container.samples, 2);
    container.hotSampleRatios = {
      cpuPercent: roundTo(container.hotSamples.cpuPercent / container.samples, 4),
      memoryUsageBytes: roundTo(container.hotSamples.memoryUsageBytes / container.samples, 4),
      pids: roundTo(container.hotSamples.pids / container.samples, 4),
      any: roundTo(container.hotSamples.any / container.samples, 4)
    };
    delete container.totalCpuPercent;
    delete container.totalMemoryUsageBytes;
    delete container.totalMemoryPercent;
    delete container.totalPids;
    delete container.currentHotStreaks;
  }

  const reachableQueueSnapshots = queueSnapshots.filter((snapshot) => snapshot.reachable && snapshot.counts);
  return {
    docker: {
      samples: dockerSamples.length,
      valid: dockerSamples.length > 0,
      thresholds,
      byContainer,
      maxCpuPercent: maxOf(dockerSamples.map((sample) => sample.cpuPercent)),
      maxMemoryUsageBytes: maxOf(dockerSamples.map((sample) => sample.memoryUsageBytes)),
      maxMemoryPercent: maxOf(dockerSamples.map((sample) => sample.memoryPercent)),
      maxPids: maxOf(dockerSamples.map((sample) => sample.pids)),
      hotContainers: Object.entries(byContainer)
        .filter(([, container]) => container.hotSamples.any > 0)
        .map(([name]) => name)
        .sort()
    },
    queue: {
      samples: queueSnapshots.length,
      reachableSamples: reachableQueueSnapshots.length,
      unreachableSamples: queueSnapshots.filter((snapshot) => snapshot.reachable === false).length,
      valid: queueSnapshots.length > 0 && reachableQueueSnapshots.length === queueSnapshots.length,
      highWaterMarks: {
        waiting: maxOf(reachableQueueSnapshots.map((snapshot) => snapshot.counts.waiting)),
        active: maxOf(reachableQueueSnapshots.map((snapshot) => snapshot.counts.active)),
        completed: maxOf(reachableQueueSnapshots.map((snapshot) => snapshot.counts.completed)),
        failed: maxOf(reachableQueueSnapshots.map((snapshot) => snapshot.counts.failed)),
        delayed: maxOf(reachableQueueSnapshots.map((snapshot) => snapshot.counts.delayed)),
        paused: maxOf(reachableQueueSnapshots.map((snapshot) => snapshot.counts.paused)),
        prioritized: maxOf(reachableQueueSnapshots.map((snapshot) => snapshot.counts.prioritized)),
        waitingChildren: maxOf(reachableQueueSnapshots.map((snapshot) => snapshot.counts.waitingChildren))
      }
    }
  };
}

export function normalizeDockerSample(sample) {
  const usagePair = parseUsagePair(sample?.memoryUsage ?? sample?.MemUsage);
  return {
    observedAt: toTimestamp(sample?.observedAt),
    name: String(sample?.name ?? sample?.Name ?? "").trim(),
    cpuPercent: parsePercent(sample?.cpuPercent ?? sample?.CPUPerc),
    memoryPercent: parsePercent(sample?.memoryPercent ?? sample?.MemPerc),
    memoryUsageBytes: parseInteger(sample?.memoryUsageBytes) || usagePair.usedBytes,
    memoryLimitBytes: parseInteger(sample?.memoryLimitBytes) || usagePair.limitBytes,
    pids: parseInteger(sample?.pids ?? sample?.PIDs)
  };
}

export function normalizeQueueSnapshot(snapshot) {
  const counts = snapshot?.counts && typeof snapshot.counts === "object" ? snapshot.counts : null;
  return {
    observedAt: toTimestamp(snapshot?.observedAt),
    reachable: typeof snapshot?.reachable === "boolean" ? snapshot.reachable : null,
    counts: counts
      ? {
          waiting: parseInteger(counts.waiting),
          active: parseInteger(counts.active),
          completed: parseInteger(counts.completed),
          failed: parseInteger(counts.failed),
          delayed: parseInteger(counts.delayed),
          paused: parseInteger(counts.paused),
          prioritized: parseInteger(counts.prioritized),
          waitingChildren: parseInteger(counts.waitingChildren)
        }
      : null
  };
}

export function parseDockerStatsDocument(contents) {
  return String(contents)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [normalizeDockerSample(JSON.parse(line))];
      } catch {
        return [];
      }
    })
    .filter((sample) => sample.name);
}

export function parseQueueSnapshotsDocument(contents) {
  return String(contents)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [normalizeQueueSnapshot(JSON.parse(line))];
      } catch {
        return [];
      }
    });
}

function parsePercent(value) {
  const normalized = String(value ?? "")
    .replace("%", "")
    .trim();
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseUsagePair(value) {
  const [used = "", limit = ""] = String(value ?? "").split("/").map((part) => part.trim());
  return {
    usedBytes: parseByteSize(used),
    limitBytes: parseByteSize(limit)
  };
}

function parseByteSize(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return 0;
  }
  const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)\s*([KMGTP]?i?B)$/i);
  if (!match) {
    return 0;
  }
  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) {
    return 0;
  }
  const unit = match[2].toUpperCase();
  const multipliers = {
    B: 1,
    KB: 1000,
    MB: 1000 ** 2,
    GB: 1000 ** 3,
    TB: 1000 ** 4,
    PB: 1000 ** 5,
    KIB: 1024,
    MIB: 1024 ** 2,
    GIB: 1024 ** 3,
    TIB: 1024 ** 4,
    PIB: 1024 ** 5
  };
  return Math.round(amount * (multipliers[unit] ?? 1));
}

function parseInteger(value) {
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toTimestamp(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function maxOf(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }
  return values.reduce((current, value) => (value > current ? value : current), 0);
}

function normalizeThresholds(thresholds) {
  return {
    cpuPercent: toThreshold(thresholds?.cpuPercent, DEFAULT_SATURATION_THRESHOLDS.cpuPercent),
    memoryUsageBytes: toThreshold(thresholds?.memoryUsageBytes, DEFAULT_SATURATION_THRESHOLDS.memoryUsageBytes),
    pids: toThreshold(thresholds?.pids, DEFAULT_SATURATION_THRESHOLDS.pids)
  };
}

function toThreshold(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function updateHotspotStats(container, sample, thresholds) {
  const flags = {
    cpuPercent: sample.cpuPercent >= thresholds.cpuPercent,
    memoryUsageBytes: sample.memoryUsageBytes >= thresholds.memoryUsageBytes,
    pids: sample.pids >= thresholds.pids
  };
  flags.any = flags.cpuPercent || flags.memoryUsageBytes || flags.pids;

  for (const key of Object.keys(flags)) {
    if (flags[key]) {
      container.hotSamples[key] += 1;
      container.currentHotStreaks[key] += 1;
      container.longestHotStreaks[key] = Math.max(
        container.longestHotStreaks[key],
        container.currentHotStreaks[key]
      );
      continue;
    }
    container.currentHotStreaks[key] = 0;
  }
}

function roundTo(value, digits) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(digits));
}
