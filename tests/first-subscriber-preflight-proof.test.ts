import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const artifactPath = "audit/2026-06-30/first-subscriber-preflight-authenticated-host-proof.json";
const handoff = readFileSync("wf-harness/HANDOFF.md", "utf8");
const todo = readFileSync("wf-harness/TODO.md", "utf8");

type PreflightProof = {
  phase: string;
  ok: boolean;
  apiOrigin: string;
  portalOrigin: string;
  cutoverHost: string;
  firstSubscriberLane: string;
  proofCommand: string;
  authenticatedSessionCookieSupplied: boolean;
  sessionTokenPrinted: boolean;
  sessionTokenCommitted: boolean;
  vpsAccessed: boolean;
  mutationPerformed: boolean;
  dnsCaddyChanged: boolean;
  runtimeChanged: boolean;
  deploymentChanged: boolean;
  results: Array<{ label: string; status: number; authenticatedChecks: string[] }>;
  nextGate: string;
};

describe("first subscriber authenticated public-host preflight proof", () => {
  it("records a fresh sanitized authenticated public-host proof for first-subscriber handoff", () => {
    expect(existsSync(artifactPath)).toBe(true);

    const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as PreflightProof;

    expect(artifact).toMatchObject({
      phase: "first_subscriber_preflight_authenticated_host_verified",
      ok: true,
      apiOrigin: "https://wf-api.spyderbyte.cloud",
      portalOrigin: "https://www.spyderbyte.cloud",
      cutoverHost: "https://api.spyderbyte.cloud",
      firstSubscriberLane: "wf-api.spyderbyte.cloud",
      proofCommand: "npm run prove:public-launch-host -- --mint-session --env-file <operator-supplied-stage-env-file> --expires-in-minutes 10 --execute",
      authenticatedSessionCookieSupplied: true,
      sessionTokenPrinted: false,
      sessionTokenCommitted: false,
      vpsAccessed: false,
      mutationPerformed: false,
      dnsCaddyChanged: false,
      runtimeChanged: false,
      deploymentChanged: false,
      nextGate: "controlled_first_subscriber_handoff"
    });
    expect(artifact.results).toEqual([
      {
        label: "npm run smoke:external",
        status: 0,
        authenticatedChecks: ["html_shell", "board_shell", "shell_assets", "harness_board_api"]
      },
      {
        label: "npm run e2e:live",
        status: 0,
        authenticatedChecks: ["authenticated_shell", "authenticated_harness_board"]
      }
    ]);
    expect(JSON.stringify(artifact)).not.toContain("the_secrets");
    expect(JSON.stringify(artifact)).not.toMatch(/wf1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(JSON.stringify(artifact)).not.toMatch(/Bearer\s+[A-Za-z0-9._-]+/);
  });

  it("records the fresh preflight as the latest phase without widening launch scope", () => {
    const latestPhaseCurrentBlock = handoff.split("## Latest Phase")[1]?.trimStart().split(/\r?\n\r?\n/)[0] ?? "";

    expect(latestPhaseCurrentBlock).toContain("Recorded the first-subscriber authenticated public-host preflight proof");
    expect(latestPhaseCurrentBlock).toContain("Sonnet was consulted in headless mode");
    expect(latestPhaseCurrentBlock).toContain("A local explorer subagent independently confirmed");
    expect(latestPhaseCurrentBlock).toContain("No VPS, Docker, Caddy, DNS, database, runtime, worker, scheduler, export, dashboard-visual, onboarding-UI, or cutover mutation was performed");
    expect(latestPhaseCurrentBlock).toContain("controlled first-subscriber handoff on `wf-api.spyderbyte.cloud`");
    expect(latestPhaseCurrentBlock).toContain("keep `api.spyderbyte.cloud` as operator-only deferred cutover");
    expect(todo).toContain("Record the first-subscriber authenticated public-host preflight proof");
    expect(todo).toContain("Do not turn this preflight into onboarding UI, scheduler automation, export replay, or `api.spyderbyte.cloud` cutover.");
  });
});
