type TenantExecutionGateConfig = {
  maxConcurrentRuns: number;
  maxConcurrentRunsPerTenant: number;
  onSnapshot?: (snapshot: {
    event: "queued" | "started" | "released";
    tenantId: string;
    activeRuns: number;
    activeByTenant: Record<string, number>;
    queuedByTenant: Record<string, number>;
  }) => void;
};

type QueuedExecution<T> = {
  tenantId: string;
  operation: () => Promise<T>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

export function createTenantExecutionGate(config: TenantExecutionGateConfig) {
  validateConfig(config);

  const tenantQueues = new Map<string, QueuedExecution<unknown>[]>();
  const activeByTenant = new Map<string, number>();
  const tenantOrder: string[] = [];
  let activeRuns = 0;
  let nextTenantCursor = 0;

  return {
    run<T>(input: { tenantId: string; operation: () => Promise<T> }): Promise<T> {
      const tenantId = input.tenantId.trim();
      if (tenantId.length === 0) {
        throw new Error("Execution gate tenantId is required");
      }

      return new Promise<T>((resolve, reject) => {
        const queue = tenantQueues.get(tenantId) ?? [];
        queue.push({
          tenantId,
          operation: input.operation,
          resolve: (value) => resolve(value as T),
          reject
        });
        tenantQueues.set(tenantId, queue);
        if (!tenantOrder.includes(tenantId)) {
          tenantOrder.push(tenantId);
        }
        emitSnapshot("queued", tenantId);
        drainQueue();
      });
    },

    getSnapshot() {
      return {
        activeRuns,
        activeByTenant: Object.fromEntries(activeByTenant.entries()),
        queuedByTenant: Object.fromEntries(
          [...tenantQueues.entries()]
            .filter(([, queue]) => queue.length > 0)
            .map(([tenantId, queue]) => [tenantId, queue.length])
        )
      };
    }
  };

  function drainQueue() {
    while (activeRuns < config.maxConcurrentRuns) {
      const next = takeNextExecution();
      if (!next) {
        break;
      }

      activeRuns += 1;
      activeByTenant.set(next.tenantId, (activeByTenant.get(next.tenantId) ?? 0) + 1);
      emitSnapshot("started", next.tenantId);

      void next.operation().then(
        (value) => {
          next.resolve(value);
          release(next.tenantId);
        },
        (error) => {
          next.reject(error);
          release(next.tenantId);
        }
      );
    }
  }

  function takeNextExecution(): QueuedExecution<unknown> | null {
    if (tenantOrder.length === 0) {
      return null;
    }

    const totalTenants = tenantOrder.length;
    for (let offset = 0; offset < totalTenants; offset += 1) {
      const index = (nextTenantCursor + offset) % totalTenants;
      const tenantId = tenantOrder[index];
      if (!tenantId) {
        continue;
      }
      const queue = tenantQueues.get(tenantId);
      if (!queue || queue.length === 0) {
        continue;
      }

      const activeForTenant = activeByTenant.get(tenantId) ?? 0;
      if (activeForTenant >= config.maxConcurrentRunsPerTenant) {
        continue;
      }

      const next = queue.shift() ?? null;
      if (!next) {
        continue;
      }

      if (queue.length === 0) {
        tenantQueues.delete(tenantId);
        tenantOrder.splice(index, 1);
        nextTenantCursor = tenantOrder.length === 0 ? 0 : index % tenantOrder.length;
      } else {
        nextTenantCursor = (index + 1) % tenantOrder.length;
      }

      return next;
    }

    return null;
  }

  function release(tenantId: string) {
    activeRuns = Math.max(0, activeRuns - 1);
    const activeForTenant = Math.max(0, (activeByTenant.get(tenantId) ?? 1) - 1);
    if (activeForTenant === 0) {
      activeByTenant.delete(tenantId);
    } else {
      activeByTenant.set(tenantId, activeForTenant);
    }
    emitSnapshot("released", tenantId);
    drainQueue();
  }

  function emitSnapshot(event: "queued" | "started" | "released", tenantId: string) {
    config.onSnapshot?.({
      event,
      tenantId,
      ...{
        activeRuns,
        activeByTenant: Object.fromEntries(activeByTenant.entries()),
        queuedByTenant: Object.fromEntries(
          [...tenantQueues.entries()]
            .filter(([, queue]) => queue.length > 0)
            .map(([queuedTenantId, queue]) => [queuedTenantId, queue.length])
        )
      }
    });
  }
}

function validateConfig(config: TenantExecutionGateConfig) {
  if (!Number.isInteger(config.maxConcurrentRuns) || config.maxConcurrentRuns < 1) {
    throw new Error("Execution gate maxConcurrentRuns must be a positive integer");
  }

  if (!Number.isInteger(config.maxConcurrentRunsPerTenant) || config.maxConcurrentRunsPerTenant < 1) {
    throw new Error("Execution gate maxConcurrentRunsPerTenant must be a positive integer");
  }

  if (config.maxConcurrentRunsPerTenant > config.maxConcurrentRuns) {
    throw new Error("Execution gate maxConcurrentRunsPerTenant cannot exceed maxConcurrentRuns");
  }
}
