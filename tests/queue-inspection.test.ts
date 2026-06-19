import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { inspectQueueSnapshot, inspectQueueState } = require("../scripts/lib/queue-inspection.mjs");

describe("queue inspection helpers", () => {
  it("captures BullMQ per-job state when Redis is reachable", async () => {
    class FakeJob {
      async getState() {
        return "completed";
      }
    }

    class FakeRedis {
      async connect() {}
      disconnect() {}
      on() {}
    }

    class FakeQueue {
      async getJob(jobId: string) {
        expect(jobId).toBe("tenant:workflow:run");
        return new FakeJob();
      }

      async close() {}
    }

    await expect(
      inspectQueueState({
        redisUrl: "redis://localhost:6379",
        queueName: "wfpc-workflow-runs",
        jobId: "tenant:workflow:run",
        RedisClass: FakeRedis,
        QueueClass: FakeQueue
      })
    ).resolves.toEqual({
      queueName: "wfpc-workflow-runs",
      jobId: "tenant:workflow:run",
      state: "completed",
      reachable: true,
      error: null
    });
  });

  it("reports an unreachable per-job queue inspection instead of throwing", async () => {
    class FakeRedis {
      async connect() {
        throw new Error("job lookup unavailable");
      }
      disconnect() {}
      on() {}
    }

    await expect(
      inspectQueueState({
        redisUrl: "redis://localhost:6379",
        queueName: "wfpc-workflow-runs",
        jobId: "tenant:workflow:run",
        RedisClass: FakeRedis
      })
    ).resolves.toEqual({
      queueName: "wfpc-workflow-runs",
      jobId: "tenant:workflow:run",
      state: null,
      reachable: false,
      error: "job lookup unavailable"
    });
  });

  it("falls back to locating a queue job by payload run id when the BullMQ job id differs", async () => {
    class FakeJob {
      constructor(
        public readonly data: { runId: string }
      ) {}

      async getState() {
        return "completed";
      }
    }

    class FakeRedis {
      async connect() {}
      disconnect() {}
      on() {}
    }

    class FakeQueue {
      async getJob(jobId: string) {
        expect(jobId).toBe("tenant:workflow:run");
        return null;
      }

      async getJobs() {
        return [
          new FakeJob({ runId: "other-run" }),
          new FakeJob({ runId: "run-1" })
        ];
      }

      async close() {}
    }

    await expect(
      inspectQueueState({
        redisUrl: "redis://localhost:6379",
        queueName: "wfpc-workflow-runs",
        jobId: "tenant:workflow:run",
        runId: "run-1",
        RedisClass: FakeRedis,
        QueueClass: FakeQueue
      })
    ).resolves.toEqual({
      queueName: "wfpc-workflow-runs",
      jobId: "tenant:workflow:run",
      state: "completed",
      reachable: true,
      error: null
    });
  });

  it("captures BullMQ queue-level counts when Redis is reachable", async () => {
    class FakeRedis {
      async connect() {}
      disconnect() {}
      on() {}
    }

    class FakeQueue {
      async getJobCounts() {
        return {
          waiting: 3,
          active: 2,
          completed: 5,
          failed: 1,
          delayed: 4,
          paused: 0,
          prioritized: 2,
          "waiting-children": 6
        };
      }

      async close() {}
    }

    await expect(
      inspectQueueSnapshot({
        redisUrl: "redis://localhost:6379",
        queueName: "wfpc-workflow-runs",
        RedisClass: FakeRedis,
        QueueClass: FakeQueue
      })
    ).resolves.toEqual({
      queueName: "wfpc-workflow-runs",
      reachable: true,
      error: null,
      counts: {
        waiting: 3,
        active: 2,
        completed: 5,
        failed: 1,
        delayed: 4,
        paused: 0,
        prioritized: 2,
        waitingChildren: 6
      }
    });
  });

  it("reports an unreachable queue snapshot instead of throwing", async () => {
    class FakeRedis {
      async connect() {
        throw new Error("no redis");
      }
      disconnect() {}
      on() {}
    }

    await expect(
      inspectQueueSnapshot({
        redisUrl: "redis://localhost:6379",
        queueName: "wfpc-workflow-runs",
        RedisClass: FakeRedis
      })
    ).resolves.toEqual({
      queueName: "wfpc-workflow-runs",
      reachable: false,
      error: "no redis",
      counts: null
    });
  });
});
