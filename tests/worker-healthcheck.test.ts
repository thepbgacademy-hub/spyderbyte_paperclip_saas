import { describe, expect, it, vi } from "vitest";

import { createWorkerHealthcheck } from "../src/worker/healthcheck.js";

describe("worker healthcheck", () => {
  it("passes when Redis is healthy", async () => {
    const pingRedis = vi.fn().mockResolvedValue(undefined);

    await expect(createWorkerHealthcheck({ pingRedis })()).resolves.toBeUndefined();

    expect(pingRedis).toHaveBeenCalledOnce();
  });

  it("surfaces Redis failures directly", async () => {
    const pingRedis = vi.fn().mockRejectedValue(new Error("redis unavailable"));

    await expect(createWorkerHealthcheck({ pingRedis })()).rejects.toThrow(/redis unavailable/);
  });

  it("passes in native-only mode when Redis is healthy and no Paperclip probe is required", async () => {
    const pingRedis = vi.fn().mockResolvedValue(undefined);

    await expect(createWorkerHealthcheck({ pingRedis })()).resolves.toBeUndefined();
  });

  it("does not invoke retired Paperclip health probes even when legacy callbacks are provided", async () => {
    const pingRedis = vi.fn().mockResolvedValue(undefined);
    const checkPaperclip = vi.fn().mockResolvedValue(true);
    const verifyPaperclipAuth = vi.fn().mockResolvedValue(undefined);
    const legacyDependencies = {
      pingRedis,
      checkPaperclip,
      verifyPaperclipAuth
    };

    await expect(createWorkerHealthcheck(legacyDependencies)()).resolves.toBeUndefined();

    expect(checkPaperclip).not.toHaveBeenCalled();
    expect(verifyPaperclipAuth).not.toHaveBeenCalled();
  });
});
