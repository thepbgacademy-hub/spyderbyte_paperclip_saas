import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { clearTimeout, setTimeout } from "node:timers";

export async function inspectQueueState({
  redisUrl,
  queueName,
  jobId,
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
    const job = await withTimeout(queue.getJob(jobId), connectTimeoutMs, "BullMQ job lookup timed out");
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
