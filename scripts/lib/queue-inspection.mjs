import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { clearTimeout, setTimeout } from "node:timers";

export async function inspectQueueState({
  redisUrl,
  queueName,
  jobId,
  runId = null,
  fallbackScanLimit = 1000,
  connectTimeoutMs = 3000,
  QueueClass = Queue,
  RedisClass = Redis
}) {
  const connection = new RedisClass(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: null,
    connectTimeout: connectTimeoutMs
  });
  if (typeof connection.on === "function") {
    connection.on("error", () => undefined);
  }

  let queue;
  try {
    await withTimeout(connection.connect(), connectTimeoutMs, "Redis connection timed out during queue inspection");
    queue = new QueueClass(queueName, { connection });
    const job = await resolveQueueJob({
      queue,
      jobId,
      runId,
      fallbackScanLimit,
      connectTimeoutMs
    });
    const state = job ? await withTimeout(job.getState(), connectTimeoutMs, "BullMQ state lookup timed out") : null;
    return {
      queueName,
      jobId,
      state,
      reachable: true,
      error: null
    };
  } catch (error) {
    return {
      queueName,
      jobId,
      state: null,
      reachable: false,
      error: error instanceof Error ? error.message : "Queue inspection failed"
    };
  } finally {
    if (queue) {
      await withTimeout(queue.close(), connectTimeoutMs, "BullMQ queue close timed out").catch(() => undefined);
    }
    if (typeof connection.disconnect === "function") {
      connection.disconnect();
    }
  }
}

export async function inspectQueueSnapshot({
  redisUrl,
  queueName,
  connectTimeoutMs = 3000,
  QueueClass = Queue,
  RedisClass = Redis
}) {
  const connection = new RedisClass(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: null,
    connectTimeout: connectTimeoutMs
  });
  if (typeof connection.on === "function") {
    connection.on("error", () => undefined);
  }

  let queue;
  try {
    await withTimeout(connection.connect(), connectTimeoutMs, "Redis connection timed out during queue snapshot");
    queue = new QueueClass(queueName, { connection });
    const counts = await withTimeout(
      queue.getJobCounts("waiting", "active", "completed", "failed", "delayed", "paused", "prioritized", "waiting-children"),
      connectTimeoutMs,
      "BullMQ queue snapshot timed out"
    );
    return {
      queueName,
      reachable: true,
      error: null,
      counts: {
        waiting: Number(counts.waiting ?? 0),
        active: Number(counts.active ?? 0),
        completed: Number(counts.completed ?? 0),
        failed: Number(counts.failed ?? 0),
        delayed: Number(counts.delayed ?? 0),
        paused: Number(counts.paused ?? 0),
        prioritized: Number(counts.prioritized ?? 0),
        waitingChildren: Number(counts["waiting-children"] ?? 0)
      }
    };
  } catch (error) {
    return {
      queueName,
      reachable: false,
      error: error instanceof Error ? error.message : "Queue snapshot failed",
      counts: null
    };
  } finally {
    if (queue) {
      await withTimeout(queue.close(), connectTimeoutMs, "BullMQ queue close timed out").catch(() => undefined);
    }
    if (typeof connection.disconnect === "function") {
      connection.disconnect();
    }
  }
}

async function resolveQueueJob({
  queue,
  jobId,
  runId,
  fallbackScanLimit,
  connectTimeoutMs
}) {
  const job = await withTimeout(queue.getJob(jobId), connectTimeoutMs, "BullMQ job lookup timed out");
  if (job || !runId || typeof queue.getJobs !== "function" || fallbackScanLimit < 1) {
    return job;
  }

  const jobs = await withTimeout(
    queue.getJobs(["active", "waiting", "completed", "failed", "delayed", "prioritized", "waiting-children"], 0, fallbackScanLimit - 1, true),
    connectTimeoutMs,
    "BullMQ fallback job scan timed out"
  );
  return jobs.find((entry) => entry?.data?.runId === runId) ?? null;
}

async function withTimeout(promise, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
