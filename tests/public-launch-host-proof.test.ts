import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
const script = readFileSync("scripts/prove-public-launch-host.mjs", "utf8");
const runbook = readFileSync("deploy/runbooks/vps2-isolated-wealth-factory-stage-rollout.md", "utf8");
const handoff = readFileSync("wf-harness/HANDOFF.md", "utf8");
const harnessTodo = readFileSync("wf-harness/TODO.md", "utf8");
const acceptanceArtifact = JSON.parse(readFileSync("audit/2026-06-30/public-launch-host-acceptance.json", "utf8")) as {
  phase: string;
  ok: boolean;
  apiOrigin: string;
  cutoverHost: string;
  vpsAccessed: boolean;
  mutationPerformed: boolean;
  dnsCaddyChanged: boolean;
  authenticatedSessionCookieSupplied: boolean;
  results: Array<{ label: string; status: number }>;
};
const {
  DEFAULT_PUBLIC_LAUNCH_API_ORIGIN,
  DEFAULT_PUBLIC_LAUNCH_PORTAL_ORIGIN,
  DEFAULT_PUBLIC_LAUNCH_PRIVATE_PORTS,
  buildPublicLaunchHostPlan,
  parsePublicLaunchHostArgs
} = require("../scripts/lib/public-launch-host.mjs");

describe("public launch host proof", () => {
  it("defaults launch acceptance to wf-api and keeps api.spyderbyte.cloud as operator cutover only", () => {
    const plan = buildPublicLaunchHostPlan({
      args: parsePublicLaunchHostArgs([]),
      env: {}
    });

    expect(DEFAULT_PUBLIC_LAUNCH_API_ORIGIN).toBe("https://wf-api.spyderbyte.cloud");
    expect(DEFAULT_PUBLIC_LAUNCH_PORTAL_ORIGIN).toBe("https://www.spyderbyte.cloud");
    expect(DEFAULT_PUBLIC_LAUNCH_PRIVATE_PORTS).toBe("6379,9000,3000,5173,8080,8081,2375");
    expect(plan.apiOrigin).toBe("https://wf-api.spyderbyte.cloud");
    expect(plan.portalOrigin).toBe("https://www.spyderbyte.cloud");
    expect(plan.cutoverHost).toBe("https://api.spyderbyte.cloud");
    expect(plan.launchPosture).toBe("isolated_host_launch_lane");
    expect(plan.execute).toBe(false);
    expect(plan.commands.map((command: { label: string }) => command.label)).toEqual([
      "npm run smoke:external",
      "npm run e2e:live"
    ]);
    expect(plan.commands[0].env.WF_SMOKE_API_URL).toBe("https://wf-api.spyderbyte.cloud");
    expect(plan.commands[0].env.WF_SMOKE_PRIVATE_PORTS).toBe(DEFAULT_PUBLIC_LAUNCH_PRIVATE_PORTS);
    expect(plan.commands[1].env.WF_LIVE_BASE_URL).toBe("https://wf-api.spyderbyte.cloud");
    expect(plan.commands[1].env.WF_LIVE_EXPECT_ASSET_BASE_URL).toBe("https://wf-api.spyderbyte.cloud/app-assets/");
  });

  it("requires an explicit execute flag before running network smoke or browser proof", () => {
    expect(buildPublicLaunchHostPlan({
      args: parsePublicLaunchHostArgs(["--execute"]),
      env: {}
    }).execute).toBe(true);
    expect(script).toContain("DRY RUN: no network calls made");
    expect(script).toContain("Pass --execute to run the public launch host proof");
  });

  it("does not inherit stage origin drift unless the launch origin is explicit", () => {
    const plan = buildPublicLaunchHostPlan({
      args: parsePublicLaunchHostArgs([]),
      env: {
        WF_STAGE_API_ORIGIN: "https://api.spyderbyte.cloud"
      }
    });

    expect(plan.apiOrigin).toBe("https://wf-api.spyderbyte.cloud");
    expect(buildPublicLaunchHostPlan({
      args: parsePublicLaunchHostArgs([]),
      env: {
        WF_PUBLIC_LAUNCH_API_ORIGIN: "https://wf-api-alt.spyderbyte.cloud",
        WF_STAGE_API_ORIGIN: "https://api.spyderbyte.cloud"
      }
    }).apiOrigin).toBe("https://wf-api-alt.spyderbyte.cloud");
  });

  it("redacts session cookie values from dry-run output", () => {
    const result = spawnSync(process.execPath, ["scripts/prove-public-launch-host.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        WF_PUBLIC_LAUNCH_SESSION_COOKIE_VALUE: "super-secret-cookie"
      }
    });

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("super-secret-cookie");
    expect(result.stdout).toContain('"WF_SMOKE_SESSION_COOKIE_VALUE": "<set>"');
    expect(result.stdout).toContain('"WF_LIVE_SESSION_COOKIE_VALUE": "<set>"');
  });

  it("plans an explicit authenticated launch proof without serializing a minted token", () => {
    const plan = buildPublicLaunchHostPlan({
      args: parsePublicLaunchHostArgs(["--mint-session", "--env-file", "E:/safe/wf-stage.env", "--expires-in-minutes", "10"]),
      env: {}
    });

    expect(plan.authenticatedMode).toBe("mint_session");
    expect(plan.authEnvFilePath).toBe("E:/safe/wf-stage.env");
    expect(plan.expiresInMinutes).toBe(10);
    expect(plan.authenticatedSessionCookieSupplied).toBe(false);
    expect(plan.commands[0].env.WF_SMOKE_SESSION_COOKIE_VALUE).toBe("");
    expect(plan.commands[1].env.WF_LIVE_SESSION_COOKIE_VALUE).toBe("");
    expect(script).toContain("createRuntimeSessionToken");
    expect(script).toContain("authenticatedSessionCookieSupplied");
    expect(script).toContain("authenticated_public_launch_host_verified");
    expect(script).toContain("buildAuthenticatedChecks");
  });

  it("does not advertise an implicit local secrets env file for minted sessions", () => {
    const result = spawnSync(process.execPath, ["scripts/prove-public-launch-host.mjs", "--mint-session"], {
      cwd: process.cwd(),
      encoding: "utf8"
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"authEnvFilePath": null');
    expect(result.stdout).not.toContain("the_secrets");
  });

  it("rejects invalid public launch token ttl values before execution", () => {
    expect(() =>
      buildPublicLaunchHostPlan({
        args: parsePublicLaunchHostArgs(["--mint-session", "--expires-in-minutes", "90"]),
        env: {}
      })
    ).toThrow("--expires-in-minutes must be an integer between 1 and 60");
  });

  it("documents the launch host decision and exposes an npm proof command", () => {
    expect(packageJson.scripts["prove:public-launch-host"]).toBe("node scripts/prove-public-launch-host.mjs");
    expect(runbook).toContain("`npm run prove:public-launch-host`");
    expect(runbook).toContain("launch acceptance defaults to `wf-api.spyderbyte.cloud`");
    expect(runbook).toContain("does not certify or mutate `api.spyderbyte.cloud`");
    expect(handoff).toContain("Recorded the public launch host acceptance gate");
    expect(handoff).toContain("`wf-api.spyderbyte.cloud` remains the launch acceptance lane");
    expect(harnessTodo).toContain("Record the public launch host acceptance gate");
  });

  it("records sanitized non-destructive public-host acceptance evidence", () => {
    expect(acceptanceArtifact).toMatchObject({
      phase: "public_launch_host_verified",
      ok: true,
      apiOrigin: "https://wf-api.spyderbyte.cloud",
      cutoverHost: "https://api.spyderbyte.cloud",
      vpsAccessed: false,
      mutationPerformed: false,
      dnsCaddyChanged: false,
      authenticatedSessionCookieSupplied: false
    });
    expect(acceptanceArtifact.results).toMatchObject([
      { label: "npm run smoke:external", status: 0 },
      { label: "npm run e2e:live", status: 0 }
    ]);
    expect(runbook).toContain("Sanitized evidence is recorded in `audit/2026-06-30/public-launch-host-acceptance.json`");
  });

  it("records sanitized authenticated public-host acceptance evidence", () => {
    const artifactPath = "audit/2026-06-30/authenticated-public-launch-host-acceptance.json";

    expect(existsSync(artifactPath)).toBe(true);
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as {
      phase: string;
      ok: boolean;
      authenticatedSessionCookieSupplied: boolean;
      sessionTokenPrinted: boolean;
      vpsAccessed: boolean;
      mutationPerformed: boolean;
      results: Array<{ label: string; status: number; authenticatedChecks: string[] }>;
    };

    expect(artifact).toMatchObject({
      phase: "authenticated_public_launch_host_verified",
      ok: true,
      authenticatedSessionCookieSupplied: true,
      sessionTokenPrinted: false,
      vpsAccessed: false,
      mutationPerformed: false
    });
    expect(JSON.stringify(artifact)).not.toMatch(/wf1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(JSON.stringify(artifact)).not.toContain("the_secrets");
    expect(artifact.results).toEqual([
      {
        label: "npm run smoke:external",
        status: 0,
        authenticatedChecks: ["html_shell", "html_shell", "harness_board_api"]
      },
      {
        label: "npm run e2e:live",
        status: 0,
        authenticatedChecks: ["authenticated_shell", "authenticated_harness_board"]
      }
    ]);
    expect(handoff).toContain("Recorded the authenticated public launch host acceptance gate");
    expect(harnessTodo).toContain("Record the authenticated public launch host acceptance gate");
  });
});
