import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const policyDoc = readFileSync("wf-harness/docs/2026-06-29-launch-tenant-ceiling-and-jitter-policy.md", "utf8");
const policyArtifact = JSON.parse(
  readFileSync("audit/2026-06-29/launch-tenant-ceiling-and-jitter-policy.json", "utf8")
) as {
  phase: string;
  ok: boolean;
  decision: {
    launchTenantCeilingPerVps: number;
    ceilingType: string;
    activeMonitoringRequired: boolean;
    escalationRequiredAboveTenantCount: number;
  };
  pressureEvidence: {
    fourTenantStaggered: {
      runsReachedRunning: string;
      paperclipPeakCpuPercent: number;
      paperclipPeakMemoryBytes: number;
      paperclipPeakPids: number;
    };
    fourTenantClustered: {
      runsReachedRunning: string;
      paperclipPeakCpuPercent: number;
      paperclipPeakMemoryBytes: number;
      paperclipPeakPids: number;
    };
  };
  antiClusteringRule: {
    appliesTo: string[];
    minimumTenantStartOffsetSeconds: number;
    sameMinuteCronLaunchesAllowed: boolean;
    runtimeSchedulerImplemented: boolean;
  };
  outOfScope: string[];
};
const rootTodo = readFileSync("TODO.md", "utf8");
const harnessTodo = readFileSync("wf-harness/TODO.md", "utf8");
const handoff = readFileSync("wf-harness/HANDOFF.md", "utf8");
const deployPoc = readFileSync("deploy/runbooks/deploy-poc.md", "utf8");
const stageRunbook = readFileSync("deploy/runbooks/vps2-isolated-wealth-factory-stage-rollout.md", "utf8");
const pressureLog = readFileSync("audit/2026-05-21/live-soak-capacity-error-log.md", "utf8");

describe("launch tenant ceiling and cron-jitter policy", () => {
  it("records four tenants as a strict monitored launch ceiling, not a comfort target", () => {
    expect(policyArtifact.phase).toBe("launch_tenant_ceiling_policy_recorded");
    expect(policyArtifact.ok).toBe(true);
    expect(policyArtifact.decision).toEqual({
      launchTenantCeilingPerVps: 4,
      ceilingType: "strict_upper_cap_not_comfort_target",
      activeMonitoringRequired: true,
      escalationRequiredAboveTenantCount: 4
    });
    expect(policyArtifact.pressureEvidence.fourTenantStaggered).toMatchObject({
      runsReachedRunning: "80/80",
      paperclipPeakCpuPercent: 474.71,
      paperclipPeakMemoryBytes: 2990370980,
      paperclipPeakPids: 1405
    });
    expect(policyArtifact.pressureEvidence.fourTenantClustered).toMatchObject({
      runsReachedRunning: "40/40",
      paperclipPeakCpuPercent: 351.31,
      paperclipPeakMemoryBytes: 2482491097,
      paperclipPeakPids: 957
    });
    expect(pressureLog).toContain("Paperclip still peaked at `474.71%` CPU, `2990370980` bytes memory, and `1405` PIDs");
    expect(pressureLog).toContain("Paperclip peaked at `351.31%` CPU, `2482491097` bytes memory, and `957` PIDs");
    expect(policyDoc).toContain("four tenants per VPS is the strict launch upper cap");
    expect(policyDoc).toContain("not a comfort target");
    expect(deployPoc).toContain("four tenants per VPS is the strict launch upper cap");
    expect(stageRunbook).toContain("four tenants per VPS is the strict launch upper cap");
  });

  it("keeps cron and heartbeat clustering mitigation operator-facing without adding a runtime scheduler", () => {
    expect(policyArtifact.antiClusteringRule).toEqual({
      appliesTo: ["cron", "heartbeat", "tenant onboarding", "manual launch batches"],
      minimumTenantStartOffsetSeconds: 120,
      sameMinuteCronLaunchesAllowed: false,
      runtimeSchedulerImplemented: false
    });
    expect(policyArtifact.outOfScope).toContain("new runtime scheduler");
    expect(policyArtifact.outOfScope).toContain("VPS, Docker, Caddy, DNS, or database mutation");
    expect(policyDoc).toContain("Do not place multiple tenant cron or heartbeat starts on the same minute boundary");
    expect(policyDoc).toContain("This phase does not implement a new runtime scheduler");
    expect(stageRunbook).toContain("minimum `120` seconds between tenant start windows");
  });

  it("closes the documented pod-cap and jitter TODOs while preserving deferred launch scope", () => {
    expect(rootTodo).toContain("Turn the current pod-cap evidence into an explicit launch rule.");
    expect(rootTodo).toContain("four tenants per VPS is the strict launch upper cap");
    expect(rootTodo).toContain("Add one more operator-facing pressure slice for cron/heartbeat clustering mitigation");
    expect(rootTodo).toContain("minimum `120` seconds between tenant start windows");
    expect(harnessTodo).toContain("Record the launch tenant ceiling and cron/heartbeat anti-clustering rule");
    expect(harnessTodo).toContain("No runtime scheduler, VPS change, deployment topology change, or operator mutation is introduced by this phase.");
    expect(handoff).toContain("Recorded the launch tenant ceiling and cron/heartbeat anti-clustering rule");
    expect(handoff).toContain("four tenants per VPS is a strict monitored launch upper cap");
  });
});
