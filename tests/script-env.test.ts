import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { loadScriptEnv } = require("../scripts/lib/script-env.mjs");

describe("script env loader", () => {
  const original = process.env.WF_DEMO_PAPERCLIP_COMPANY_ID;
  let tempDir: string | undefined;

  afterEach(() => {
    if (typeof original === "string") {
      process.env.WF_DEMO_PAPERCLIP_COMPANY_ID = original;
    } else {
      delete process.env.WF_DEMO_PAPERCLIP_COMPANY_ID;
    }
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("allows process env to override file-backed defaults for live ops scripts", () => {
    tempDir = mkdtempSync(join(tmpdir(), "wfpc-script-env-"));
    const envPath = join(tempDir, ".env");
    writeFileSync(envPath, "WF_DEMO_PAPERCLIP_COMPANY_ID=pc-company-from-file\n", "utf8");
    process.env.WF_DEMO_PAPERCLIP_COMPANY_ID = "pc-company-from-process";

    const env = loadScriptEnv(envPath);

    expect(env.WF_DEMO_PAPERCLIP_COMPANY_ID).toBe("pc-company-from-process");
  });

  it("preserves explicit blank process overrides for optional live ops flags", () => {
    tempDir = mkdtempSync(join(tmpdir(), "wfpc-script-env-"));
    const envPath = join(tempDir, ".env");
    writeFileSync(envPath, "WF_DEMO_PAPERCLIP_COMPANY_ID=pc-company-from-file\n", "utf8");
    process.env.WF_DEMO_PAPERCLIP_COMPANY_ID = "";

    const env = loadScriptEnv(envPath);

    expect(env.WF_DEMO_PAPERCLIP_COMPANY_ID).toBe("");
  });
});
