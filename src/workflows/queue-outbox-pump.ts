import type { createQueueOutboxWorker } from "./queue-outbox-worker.js";

type QueueOutboxWorker = ReturnType<typeof createQueueOutboxWorker>;

export function createQueueOutboxPump(options: {
  worker: QueueOutboxWorker;
  intervalMs?: number;
  batchSize?: number;
  onError?: (error: unknown) => void;
}) {
  const intervalMs = options.intervalMs ?? 1_000;
  const batchSize = options.batchSize ?? 25;
  let timer: ReturnType<typeof setInterval> | undefined;
  let draining = false;

  async function drainOnce() {
    if (draining) {
      return;
    }

    draining = true;
    try {
      await options.worker.drain({ limit: batchSize });
    } catch (error) {
      options.onError?.(error);
    } finally {
      draining = false;
    }
  }

  return {
    async drainOnce() {
      await drainOnce();
    },

    start() {
      if (timer) {
        return;
      }

      void drainOnce();
      timer = setInterval(() => {
        void drainOnce();
      }, intervalMs);
      timer.unref?.();
    },

    stop() {
      if (!timer) {
        return;
      }

      clearInterval(timer);
      timer = undefined;
    }
  };
}
