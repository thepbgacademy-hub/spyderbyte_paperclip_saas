import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const scriptPath = "scripts/repair-openai-device-provider-binding.mjs";

describe("OpenAI device provider binding repair script", () => {
  it("is exposed as a dry-run-first npm operator command", () => {
    const script = readFileSync(scriptPath, "utf8");
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };

    expect(packageJson.scripts["repair:openai-device-provider-binding"]).toBe(
      "node scripts/repair-openai-device-provider-binding.mjs"
    );
    expect(script).toContain("openai_chatgpt_codex_subscription");
    expect(script).toContain("--execute");
    expect(script).toContain("codexHome");
    expect(script).toContain("authStateRef");
    expect(script).toContain("DRY RUN");
    expect(script).not.toContain("PAPERCLIP");
    expect(script).not.toContain("api.spyderbyte.cloud");
  });

  it("prints a sanitized dry-run plan by default", () => {
    const stdout = execFileSync(
      process.execPath,
      [
        scriptPath,
        "--tenant",
        "22222222-2222-4222-8222-222222222222",
        "--workflow",
        "wf_connect_first_workflow",
        "--codex-home",
        "/opt/wealth-factory/codex-auth/22222222-2222-4222-8222-222222222222",
        "--auth-state-ref",
        "codex-auth-state"
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8"
      }
    );

    const parsed = JSON.parse(stdout);
    expect(parsed).toMatchObject({
      ok: true,
      dryRun: true,
      phase: "openai_device_provider_binding_repair_planned",
      tenantId: "22222222-2222-4222-8222-222222222222",
      workflowId: "wf_connect_first_workflow",
      providerKind: "openai_chatgpt_codex_subscription",
      codexHomeSupplied: true,
      authStateRefSupplied: true
    });
    expect(JSON.stringify(parsed)).not.toMatch(/sk-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]+|postgresql:\/\/|the_secrets/i);
  });

  it("fails closed in execute mode until device auth metadata is supplied", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [scriptPath, "--tenant", "tenant-1", "--workflow", "wf_connect_first_workflow", "--execute"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          stdio: "pipe"
        }
      )
    ).toThrow(/--codex-home and --auth-state-ref are required/);
  });

  it("fails closed in execute mode until the VPS Codex auth home readiness gate is explicitly confirmed", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [
          scriptPath,
          "--tenant",
          "22222222-2222-4222-8222-222222222222",
          "--workflow",
          "wf_connect_first_workflow",
          "--codex-home",
          "/opt/wealth-factory/codex-auth/22222222-2222-4222-8222-222222222222",
          "--auth-state-ref",
          "codex-auth-state",
          "--execute"
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          stdio: "pipe"
        }
      )
    ).toThrow(/--confirm-codex-home-ready is required/);
  });

  it("documents the future mutation contract as tenant-scoped, transactional, and non-secret", () => {
    const script = readFileSync(scriptPath, "utf8");

    expect(script).toContain("BEGIN");
    expect(script).toContain("COMMIT");
    expect(script).toContain("WHERE tenant_id = $1");
    expect(script).toContain("workflow_id = $2");
    expect(script).toContain("provider_kind = $3");
    expect(script).toContain("wfpc.package_provider_requirements");
    expect(script).toContain("openai_chatgpt_codex_subscription");
    expect(script).toContain("empty subscription marker");
    expect(script).toContain("do not mutate existing workflow_runs");
    expect(script).not.toMatch(/UPDATE\s+wfpc\.workflow_runs/i);
    expect(script).not.toMatch(/DELETE\s+FROM/i);
  });

  it("fails closed even after readiness confirmation until live DB mutation is implemented", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [
          scriptPath,
          "--tenant",
          "22222222-2222-4222-8222-222222222222",
          "--workflow",
          "wf_connect_first_workflow",
          "--codex-home",
          "/opt/wealth-factory/codex-auth/22222222-2222-4222-8222-222222222222",
          "--auth-state-ref",
          "codex-auth-state",
          "--execute",
          "--confirm-codex-home-ready"
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          stdio: "pipe"
        }
      )
    ).toThrow(/live DB mutation is not implemented/);
  });
});
