import { describe, expect, it, vi } from "vitest";

import { createWorkerHealthcheck } from "../src/worker/healthcheck.js";

describe("worker healthcheck", () => {
  it("passes when Redis and Paperclip are both healthy", async () => {
    const pingRedis = vi.fn().mockResolvedValue(undefined);
    const checkPaperclip = vi.fn().mockResolvedValue(true);

    await expect(createWorkerHealthcheck({ pingRedis, checkPaperclip })()).resolves.toBeUndefined();

    expect(pingRedis).toHaveBeenCalledOnce();
    expect(checkPaperclip).toHaveBeenCalledOnce();
  });

  it("fails closed when Paperclip health is not ok", async () => {
    const pingRedis = vi.fn().mockResolvedValue(undefined);
    const checkPaperclip = vi.fn().mockResolvedValue(false);

    await expect(createWorkerHealthcheck({ pingRedis, checkPaperclip })()).rejects.toThrow(/Paperclip healthcheck returned not ok/);
  });

  it("surfaces Redis failures directly", async () => {
    const pingRedis = vi.fn().mockRejectedValue(new Error("redis unavailable"));
    const checkPaperclip = vi.fn();

    await expect(createWorkerHealthcheck({ pingRedis, checkPaperclip })()).rejects.toThrow(/redis unavailable/);
    expect(checkPaperclip).not.toHaveBeenCalled();
  });

  it("surfaces Paperclip client rejections directly", async () => {
    const pingRedis = vi.fn().mockResolvedValue(undefined);
    const checkPaperclip = vi.fn().mockRejectedValue(new Error("paperclip unavailable"));

    await expect(createWorkerHealthcheck({ pingRedis, checkPaperclip })()).rejects.toThrow(/paperclip unavailable/);
  });

  it("supports an authenticated Paperclip probe when configured", async () => {
    const pingRedis = vi.fn().mockResolvedValue(undefined);
    const checkPaperclip = vi.fn().mockResolvedValue(true);
    const verifyPaperclipAuth = vi.fn().mockResolvedValue(undefined);

    await expect(createWorkerHealthcheck({ pingRedis, checkPaperclip, verifyPaperclipAuth })()).resolves.toBeUndefined();
    expect(verifyPaperclipAuth).toHaveBeenCalledOnce();
  });
});
