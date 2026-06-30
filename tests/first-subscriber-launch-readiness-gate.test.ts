import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const artifactPath = "audit/2026-06-30/first-subscriber-launch-readiness-gate.json";
const checklistPath = "deploy/runbooks/first-subscriber-launch-checklist.md";
const handoff = readFileSync("wf-harness/HANDOFF.md", "utf8");
const todo = readFileSync("wf-harness/TODO.md", "utf8");

type ReadinessGate = {
  phase: string;
  ok: boolean;
  launchLane: {
    apiOrigin: string;
    portalOrigin: string;
    cutoverHost: string;
    cutoverStatus: string;
    firstSubscriberPosture: string;
  };
  tenantSafety: {
    launchTenantCeilingPerVps: number;
    minimumTenantStartOffsetSeconds: number;
    activeMonitoringRequired: boolean;
  };
  requiredEvidence: Array<{
    label: string;
    path: string;
    phase: string;
    ok: boolean;
  }>;
  blockedScope: string[];
  operatorChecklist: string;
  sanitized: {
    containsSecrets: boolean;
    containsRuntimeSessionToken: boolean;
    vpsMutationRequired: boolean;
  };
};

describe("first-subscriber launch readiness gate", () => {
  it("records a sanitized first-subscriber go/no-go gate from existing launch evidence", () => {
    expect(existsSync(artifactPath)).toBe(true);

    const gate = JSON.parse(readFileSync(artifactPath, "utf8")) as ReadinessGate;

    expect(gate).toMatchObject({
      phase: "first_subscriber_launch_readiness_gate_recorded",
      ok: true,
      launchLane: {
        apiOrigin: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        cutoverHost: "https://api.spyderbyte.cloud",
        cutoverStatus: "operator_only_deferred",
        firstSubscriberPosture: "controlled_first_subscriber_under_isolated_authenticated_lane"
      },
      tenantSafety: {
        launchTenantCeilingPerVps: 4,
        minimumTenantStartOffsetSeconds: 120,
        activeMonitoringRequired: true
      },
      sanitized: {
        containsSecrets: false,
        containsRuntimeSessionToken: false,
        vpsMutationRequired: false
      }
    });
    expect(gate.requiredEvidence).toEqual([
      {
        label: "authenticated public launch host",
        path: "audit/2026-06-30/authenticated-public-launch-host-acceptance.json",
        phase: "authenticated_public_launch_host_verified",
        ok: true
      },
      {
        label: "public launch host",
        path: "audit/2026-06-30/public-launch-host-acceptance.json",
        phase: "public_launch_host_verified",
        ok: true
      },
      {
        label: "stage live stability",
        path: "audit/2026-06-29/stage-live-stability-summary.json",
        phase: "stage_stability_complete",
        ok: true
      },
      {
        label: "launch tenant ceiling and jitter",
        path: "audit/2026-06-29/launch-tenant-ceiling-and-jitter-policy.json",
        phase: "launch_tenant_ceiling_policy_recorded",
        ok: true
      },
      {
        label: "stage operator controls read-only confirmation",
        path: "audit/2026-06-29/stage-operator-controls-read-only-confirmation.json",
        phase: "stage_operator_controls_read_only_confirmation_gate",
        ok: true
      }
    ]);
    for (const evidence of gate.requiredEvidence) {
      expect(existsSync(evidence.path), evidence.path).toBe(true);
      const actual = JSON.parse(readFileSync(evidence.path, "utf8")) as { phase: string; ok: boolean };
      expect(actual.phase, evidence.path).toBe(evidence.phase);
      expect(actual.ok, evidence.path).toBe(evidence.ok);
    }
    expect(gate.blockedScope).toEqual([
      "api.spyderbyte.cloud cutover",
      "new subscriber-facing onboarding UI",
      "runtime scheduler or queue smoothing",
      "VPS, Docker, Caddy, DNS, database, or seed mutation",
      "dashboard visual expansion",
      "export replay or Obsidian delivery expansion",
      "workflow-family or package-overlay expansion"
    ]);
  });

  it("documents the operator checklist without embedding secrets or widening launch scope", () => {
    expect(existsSync(checklistPath)).toBe(true);

    const checklist = readFileSync(checklistPath, "utf8");
    const gate = readFileSync(artifactPath, "utf8");
    const combined = `${checklist}\n${gate}`;

    expect(checklist).toContain("First Subscriber Launch Checklist");
    expect(checklist).toContain("`wf-api.spyderbyte.cloud` is the launch lane");
    expect(checklist).toContain("Do not use `api.spyderbyte.cloud` as the subscriber lane");
    expect(checklist).toContain("four tenants per VPS is the strict launch upper cap");
    expect(checklist).toContain("minimum `120` seconds between tenant start windows");
    expect(checklist).toContain("npm run prove:public-launch-host -- --mint-session --env-file <operator-supplied-stage-env-file> --expires-in-minutes 10 --execute");
    expect(checklist).toContain("Do not run `scripts/seed-wfpc-demo.mjs`");
    expect(checklist).not.toContain("E:/the_secrets");
    expect(combined).not.toContain("the_secrets");
    expect(combined).not.toMatch(/wf1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(combined).not.toMatch(/Bearer\s+[A-Za-z0-9._-]+/);
  });

  it("updates the handoff and TODO as a completed bounded gate", () => {
    const latestPhase = handoff.split("## Latest Phase")[1]?.split("## Key Design Commitments")[0] ?? "";

    expect(latestPhase).toContain("Recorded the first-subscriber launch readiness gate");
    expect(latestPhase).toContain("Sonnet was consulted in headless mode");
    expect(latestPhase).toContain("A local explorer subagent independently confirmed");
    expect(latestPhase).toContain("No VPS, Docker, Caddy, DNS, database, runtime, worker, scheduler, export, dashboard-visual, onboarding-UI, or cutover mutation was performed");
    expect(latestPhase).toContain("Next continuation point");
    expect(todo).toContain("Record the first-subscriber launch readiness gate");
    expect(todo).toContain("Do not promote this gate into subscriber-facing onboarding UI, scheduler automation, cutover, or export replay.");
  });
});
