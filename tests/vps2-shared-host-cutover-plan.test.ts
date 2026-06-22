import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const cutoverPlan = normalizeLineEndings(
  readFileSync("deploy/runbooks/vps2-shared-host-cutover-plan.md", "utf8")
);

describe("VPS2 shared-host cutover plan", () => {
  it("keeps the cutover as deployment plumbing rather than reopening application scope", () => {
    expect(cutoverPlan).toContain("# VPS2 Shared-Host Cutover Plan");
    expect(cutoverPlan).toContain("This plan does not authorize application, runtime, queue, worker-policy, or dashboard-scope changes.");
    expect(cutoverPlan).toContain("Do not treat this plan as permission to change workflow families, native-execution policy, or board contracts.");
  });

  it("documents the preconditions, cutover steps, verification, and rollback", () => {
    expect(cutoverPlan).toContain("## Preconditions");
    expect(cutoverPlan).toContain("## Exact Cutover Sequence");
    expect(cutoverPlan).toContain("## Verification Gate");
    expect(cutoverPlan).toContain("## Rollback");
    expect(cutoverPlan).toContain("api.spyderbyte.cloud");
    expect(cutoverPlan).toContain("wf-api.spyderbyte.cloud");
    expect(cutoverPlan).toContain("sudo caddy validate --config /etc/caddy/Caddyfile");
    expect(cutoverPlan).toContain("sudo caddy reload --config /etc/caddy/Caddyfile");
    expect(cutoverPlan).toContain("npm run prove:stage-live");
    expect(cutoverPlan).toContain("npm run prove:stage-stability");
  });

  it("keeps rollback explicit and non-destructive", () => {
    expect(cutoverPlan).toContain("restore the previous `api.spyderbyte.cloud` reverse proxy target");
    expect(cutoverPlan).toContain("do not delete the isolated `wf-stage-web`, `wf-stage-api`, or `wf-stage-worker` services during first rollback");
    expect(cutoverPlan).toContain("If cutover verification fails, roll back the route first and debug on the isolated lane second.");
  });
});

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n");
}
