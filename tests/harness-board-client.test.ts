import { describe, expect, it, vi } from "vitest";

import { createHarnessBoardClient } from "../apps/web/src/harness-board-client.js";

describe("harness board client", () => {
  it("enables browser fallback only on loopback hosts", () => {
    const localClient = createHarnessBoardClient(
      fetch,
      { location: { hostname: "127.0.0.1" } as Window["location"] }
    );
    const remoteClient = createHarnessBoardClient(
      fetch,
      { location: { hostname: "app.spyderbyte.cloud" } as Window["location"] }
    );

    expect(localClient.isBrowserFallbackEnabled()).toBe(true);
    expect(remoteClient.isBrowserFallbackEnabled()).toBe(false);
  });

  it("does not silently fall back on non-loopback hosts when the live request fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false
    });
    const client = createHarnessBoardClient(
      fetchImpl as unknown as typeof fetch,
      { location: { hostname: "app.spyderbyte.cloud" } as Window["location"] }
    );

    await expect(client.fetchBoard()).rejects.toThrow("Unable to load harness board");
    expect(fetchImpl).toHaveBeenCalledWith("/api/harness/board", { credentials: "include" });
    expect(client.isBrowserFallbackEnabled()).toBe(false);
  });
});
