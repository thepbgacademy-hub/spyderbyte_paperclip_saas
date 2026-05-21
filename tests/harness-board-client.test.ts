import { describe, expect, it } from "vitest";

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
});
