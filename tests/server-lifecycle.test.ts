import { describe, expect, it, vi } from "vitest";

import { closeServerGracefully } from "../src/api/server-lifecycle.js";

describe("server lifecycle", () => {
  it("waits for the server close callback before resolving", async () => {
    const close = vi.fn((callback: (error?: Error) => void) => {
      setTimeout(() => callback(), 0);
    });

    await expect(closeServerGracefully({ close } as never)).resolves.toBeUndefined();
    expect(close).toHaveBeenCalledOnce();
  });

  it("rejects when the server close callback reports an error", async () => {
    const close = vi.fn((callback: (error?: Error) => void) => {
      callback(new Error("close_failed"));
    });

    await expect(closeServerGracefully({ close } as never)).rejects.toThrow("close_failed");
  });
});
