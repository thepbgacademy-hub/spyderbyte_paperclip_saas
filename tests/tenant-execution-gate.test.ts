import { describe, expect, it } from "vitest";

import { createTenantExecutionGate } from "../src/worker/tenant-execution-gate.js";

describe("tenant execution gate", () => {
  it("rejects invalid gate configuration", () => {
    expect(() => createTenantExecutionGate({ maxConcurrentRuns: 0, maxConcurrentRunsPerTenant: 1 })).toThrow(
      /maxConcurrentRuns/
    );
    expect(() => createTenantExecutionGate({ maxConcurrentRuns: 2, maxConcurrentRunsPerTenant: 0 })).toThrow(
      /maxConcurrentRunsPerTenant/
    );
    expect(() => createTenantExecutionGate({ maxConcurrentRuns: 1, maxConcurrentRunsPerTenant: 2 })).toThrow(
      /cannot exceed/
    );
  });

  it("keeps one tenant from occupying every slot when another tenant is queued", async () => {
    const gate = createTenantExecutionGate({
      maxConcurrentRuns: 2,
      maxConcurrentRunsPerTenant: 1
    });

    const started: string[] = [];
    const releases = new Map<string, () => void>();
    const makeOperation = (label: string) => () =>
      new Promise<string>((resolve) => {
        started.push(label);
        releases.set(label, () => resolve(label));
      });

    const a1 = gate.run({ tenantId: "tenant-a", operation: makeOperation("a1") });
    const a2 = gate.run({ tenantId: "tenant-a", operation: makeOperation("a2") });
    const b1 = gate.run({ tenantId: "tenant-b", operation: makeOperation("b1") });

    await Promise.resolve();

    expect(started).toEqual(["a1", "b1"]);
    expect(gate.getSnapshot()).toEqual({
      activeRuns: 2,
      activeByTenant: {
        "tenant-a": 1,
        "tenant-b": 1
      },
      queuedByTenant: {
        "tenant-a": 1
      }
    });

    releases.get("a1")?.();
    await Promise.resolve();
    expect(started).toEqual(["a1", "b1", "a2"]);

    releases.get("b1")?.();
    releases.get("a2")?.();

    await expect(Promise.all([a1, a2, b1])).resolves.toEqual(["a1", "a2", "b1"]);
  });

  it("surfaces fairness snapshots for queued, started, and released events", async () => {
    const snapshots: Array<{
      event: "queued" | "started" | "released";
      tenantId: string;
      activeRuns: number;
      activeByTenant: Record<string, number>;
      queuedByTenant: Record<string, number>;
    }> = [];
    const gate = createTenantExecutionGate({
      maxConcurrentRuns: 1,
      maxConcurrentRunsPerTenant: 1,
      onSnapshot: (snapshot) => snapshots.push(snapshot)
    });

    let releaseFirst = () => {};
    const first = gate.run({
      tenantId: "tenant-a",
      operation: () =>
        new Promise<string>((resolve) => {
          releaseFirst = () => resolve("a1");
        })
    });
    const second = gate.run({
      tenantId: "tenant-b",
      operation: async () => "b1"
    });

    await Promise.resolve();
    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual(["a1", "b1"]);

    expect(snapshots.map((snapshot) => snapshot.event)).toContain("queued");
    expect(snapshots.map((snapshot) => snapshot.event)).toContain("started");
    expect(snapshots.map((snapshot) => snapshot.event)).toContain("released");
  });
});
