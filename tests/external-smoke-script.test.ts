import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/external-smoke-security.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };

describe("external smoke security script", () => {
  it("checks only intended public ports and common private service ports", () => {
    expect(script).toContain('WF_SMOKE_PUBLIC_PORTS ?? "80,443"');
    expect(script).toContain("5432,6379,8000,8443,9000,3000,5173,8080,8081,2375");
  });

  it("checks CORS/auth routes and customer-facing response leaks", () => {
    expect(script).toContain("/api/dashboard");
    expect(script).toContain("/api/storage/oauth/google_drive/begin");
    expect(script).toContain('WF_SMOKE_SHELL_PATH ?? "/"');
    expect(script).toContain("WF_SMOKE_SESSION_COOKIE_VALUE");
    expect(script).toContain('id="wf-dashboard-bootstrap"');
    expect(script).toContain("/app-assets/");
    expect(script).toContain("extractAssetUrls");
    expect(script).toContain("shell_asset");
    expect(script).toContain("access-control-allow-origin");
    expect(script).toContain("paperclip|prompt|skill|command");
  });

  it("is exposed as an npm smoke command", () => {
    expect(packageJson.scripts["smoke:external"]).toBe("node scripts/external-smoke-security.mjs");
  });
});
