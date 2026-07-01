import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const scriptPath = "scripts/prove-codex-auth-home-readiness.mjs";
const artifactPath = "audit/2026-06-30/vps-codex-auth-home-readiness-proof.json";

describe("Codex auth-home readiness proof", () => {
  it("is exposed as a dry-run-first npm operator command", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    const script = readFileSync(scriptPath, "utf8");

    expect(packageJson.scripts["prove:codex-auth-home-readiness"]).toBe("node scripts/prove-codex-auth-home-readiness.mjs");
    expect(script).toContain("codex_auth_home_readiness_dry_run");
    expect(script).toContain("codex_auth_home_ready");
    expect(script).toContain("container_not_running");
    expect(script).toContain("codex_cli_missing");
    expect(script).toContain("codex_home_missing");
    expect(script).toContain("codex_smoke_failed");
    expect(script).toContain("timeout");
    expect(script).toContain("smoke=");
    expect(script).toContain("READY");
    expect(script).not.toContain("sudo -S");
    expect(script).not.toContain("SUDO_PASSWORD");
    expect(script).not.toMatch(/psql|UPDATE\s+wfpc|INSERT\s+INTO\s+wfpc|docker compose|docker restart/i);
  });

  it("prints a sanitized dry-run plan without SSH or Docker access", () => {
    const stdout = execFileSync(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        WF_STAGE_SSH_TARGET: "deploy@187.77.19.83",
        WF_STAGE_PREFLIGHT_CONTAINER: "wf-stage-api"
      }
    });

    const parsed = JSON.parse(stdout);
    expect(parsed).toMatchObject({
      ok: true,
      dryRun: true,
      phase: "codex_auth_home_readiness_dry_run",
      container: "wf-stage-api",
      sshTargetSupplied: true,
      mutationPerformed: false,
      dbRowsWritten: false,
      workflowRunsTouched: false
    });
    expect(parsed.note).toContain("no secret files loaded");
    expect(JSON.stringify(parsed)).not.toMatch(/187\.77\.19\.83|sk-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]+|postgresql:\/\/|the_secrets/i);
  });

  it("fails closed before execute when no SSH target can be resolved", () => {
    expect(() =>
      execFileSync(process.execPath, [scriptPath, "--execute", "--ssh-env-file", "missing.env"], {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: "pipe",
        env: {
          PATH: process.env.PATH ?? "",
          SystemRoot: process.env.SystemRoot ?? "",
          WINDIR: process.env.WINDIR ?? ""
        }
      })
    ).toThrow(/WF_STAGE_SSH_TARGET, or VPS2_USER\/VPS2_HOST is required/);
  });

  it("emits sanitized execute success output from a mock remote readiness result", () => {
    const stdout = execFileSync(
      process.execPath,
      [
        scriptPath,
        "--execute",
        "--ssh-target",
        "deploy@187.77.19.83",
        "--mock-remote-json",
        JSON.stringify({
          ok: true,
          phase: "codex_auth_home_ready",
          codexCliPresent: true,
          codexHomeExists: true,
          smokePromptPassed: true,
          mutationPerformed: false,
          dbRowsWritten: false,
          workflowRunsTouched: false
        })
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8"
      }
    );

    const parsed = JSON.parse(stdout);
    expect(parsed).toMatchObject({
      ok: true,
      dryRun: false,
      phase: "codex_auth_home_ready",
      container: "wf-stage-api",
      sshTarget: "deploy@[masked]",
      codexCliChecked: true,
      codexHomeChecked: true,
      smokePromptChecked: true,
      codexCliPresent: true,
      codexHomeExists: true,
      smokePromptPassed: true,
      mutationPerformed: false,
      dbRowsWritten: false,
      workflowRunsTouched: false
    });
    expect(JSON.stringify(parsed)).not.toMatch(/187\.77\.19\.83|CODEX_HOME=|E:\\the_secrets|sk-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]+/i);
  });

  it("sanitizes execute failure output from a mock remote readiness result", () => {
    const stdout = execFileSync(
      process.execPath,
      [
        scriptPath,
        "--execute",
        "--ssh-target",
        "deploy@187.77.19.83",
        "--mock-remote-json",
        JSON.stringify({
          ok: false,
          phase: "codex_home_missing",
          codexCliPresent: true,
          codexHomeExists: false,
          error: "CODEX_HOME=E:\\the_secrets\\codex-auth sk-test"
        })
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8"
      }
    );

    const parsed = JSON.parse(stdout);
    expect(parsed).toMatchObject({
      ok: false,
      phase: "codex_home_missing",
      sshTarget: "deploy@[masked]",
      codexCliChecked: true,
      codexHomeChecked: true,
      smokePromptChecked: false,
      codexCliPresent: true,
      codexHomeExists: false
    });
    expect(parsed.error).toContain("CODEX_HOME=<redacted>");
    expect(JSON.stringify(parsed)).not.toMatch(/E:\\the_secrets|sk-test|187\.77\.19\.83/i);
  });

  it("classifies Docker socket permission failures separately from SSH reachability failures", () => {
    const script = readFileSync(scriptPath, "utf8");

    expect(script).toContain("docker_permission_denied");
    expect(script).toContain("docker_unavailable");
    expect(script).toContain("permission denied while trying to connect to the docker API");
    expect(script).toContain("docker inspect permission denied");
    expect(script).toContain("docker inspect unavailable");
    expect(script).toContain("inspectStatus=$?");
    expect(script).toContain('].join("\\n")');
    expect(script).not.toContain("then; case");
    expect(script).toContain("classifyRemoteFailure");
  });

  it("does not load secret env files before the dry-run branch", () => {
    const script = readFileSync(scriptPath, "utf8");
    const dryRunIndex = script.indexOf("if (!execute)");
    const loadEnvIndex = script.indexOf("loadScriptEnv(sshEnvFilePath)");

    expect(dryRunIndex).toBeGreaterThan(-1);
    expect(loadEnvIndex).toBeGreaterThan(dryRunIndex);
  });

  it("records sanitized live VPS readiness evidence without mutating launch state", () => {
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as {
      phase: string;
      ok: boolean;
      sshTarget: string;
      mutationPerformed: boolean;
      dbRowsWritten: boolean;
      workflowRunsTouched: boolean;
      dnsCaddyChanged: boolean;
      providerRepairExecuted: boolean;
      paperclipTouched: boolean;
      codexCliChecked: boolean;
      codexHomeChecked: boolean;
      smokePromptChecked: boolean;
      finding: string;
    };

    expect(artifact).toMatchObject({
      phase: "codex_cli_missing",
      ok: false,
      sshTarget: "deploy@[masked]",
      mutationPerformed: false,
      dbRowsWritten: false,
      workflowRunsTouched: false,
      dnsCaddyChanged: false,
      providerRepairExecuted: false,
      paperclipTouched: false,
      codexCliChecked: true,
      codexHomeChecked: false,
      smokePromptChecked: false
    });
    expect(artifact.finding).toContain("Codex CLI is not present");
    expect(artifact.finding).toContain("smoke prompt checks were not reached");
    expect(JSON.stringify(artifact)).not.toMatch(/187\.77\.19\.83|E:\\the_secrets|sk-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]+|postgresql:\/\//i);
  });
});
