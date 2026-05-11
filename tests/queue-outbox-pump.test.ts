import { describe, expect, it, vi } from "vitest";

import { createQueueOutboxPump } from "../src/workflows/queue-outbox-pump.js";

describe("queue outbox pump", () => {
  it("drains the worker with a fixed batch size", async () => {
    const worker = { drain: vi.fn().mockResolvedValue({ claimed: 0, enqueued: 0, failed: 0 }) };
    const pump = createQueueOutboxPump({ worker, batchSize: 7 });

    await pump.drainOnce();

    expect(worker.drain).toHaveBeenCalledWith({ limit: 7 });
  });

  it("does not run overlapping drains", async () => {
    let finishDrain!: () => void;
    const worker = {
      drain: vi.fn(
        (): Promise<{ claimed: number; enqueued: number; failed: number }> =>
          new Promise((resolve) => {
            finishDrain = () => resolve({ claimed: 0, enqueued: 0, failed: 0 });
          })
      )
    };
    const pump = createQueueOutboxPump({ worker, batchSize: 3 });

    const first = pump.drainOnce();
    await pump.drainOnce();
    finishDrain();
    await first;

    expect(worker.drain).toHaveBeenCalledTimes(1);
  });

  it("reports drain failures through the runtime error hook", async () => {
    const onError = vi.fn();
    const worker = { drain: vi.fn().mockRejectedValue(new Error("database unavailable")) };
    const pump = createQueueOutboxPump({ worker, onError });

    await pump.drainOnce();

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "database unavailable" }));
  });
});
