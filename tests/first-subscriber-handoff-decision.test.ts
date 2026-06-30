import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const artifactPath = "audit/2026-06-30/first-subscriber-handoff-decision.json";
const checklistPath = "deploy/runbooks/first-subscriber-launch-checklist.md";
const handoff = readFileSync("wf-harness/HANDOFF.md", "utf8");
const todo = readFileSync("wf-harness/TODO.md", "utf8");

type HandoffDecision = {
  phase: string;
  ok: boolean;
  decision: string;
  subscriberInviteSent: boolean;
  launchLane: string;
  cutoverHost: string;
  cutoverStatus: string;
  referencedEvidence: Array<{ path: string; phase: string; ok: boolean }>;
  operatorChecklist: {
    checklistPath: string;
    branchAndLaneConfirmed: boolean;
    targetTenantFresh: boolean;
    authenticatedPublicHostProofPassed: boolean;
    privatePortAndShellSmokeConfirmed: boolean;
    operatorReadOnlyFailClosedAccepted: boolean;
    handoffDecisionRecordedBeforeInvite: boolean;
  };
  tenantSafety: {
    launchTenantCeilingPerVps: number;
    minimumTenantStartOffsetSeconds: number;
    activeMonitoringRequired: boolean;
  };
  scope: {
    vpsAccessed: boolean;
    mutationPerformed: boolean;
    dnsCaddyChanged: boolean;
    databaseChanged: boolean;
    runtimeChanged: boolean;
    deploymentChanged: boolean;
    onboardingUiChanged: boolean;
    schedulerChanged: boolean;
    exportReplayChanged: boolean;
    workflowPackageExpanded: boolean;
  };
  nextGate: string;
};

describe("first subscriber controlled handoff decision", () => {
  it("records a sanitized operator-ready handoff packet without inviting the subscriber", () => {
    expect(existsSync(artifactPath)).toBe(true);

    const decision = JSON.parse(readFileSync(artifactPath, "utf8")) as HandoffDecision;

    expect(decision).toMatchObject({
      phase: "first_subscriber_controlled_handoff_packet_recorded",
      ok: true,
      decision: "operator_ready_to_invite_first_subscriber",
      subscriberInviteSent: false,
      launchLane: "wf-api.spyderbyte.cloud",
      cutoverHost: "api.spyderbyte.cloud",
      cutoverStatus: "operator_only_deferred",
      operatorChecklist: {
        checklistPath,
        branchAndLaneConfirmed: true,
        targetTenantFresh: true,
        authenticatedPublicHostProofPassed: true,
        privatePortAndShellSmokeConfirmed: true,
        operatorReadOnlyFailClosedAccepted: true,
        handoffDecisionRecordedBeforeInvite: true
      },
      tenantSafety: {
        launchTenantCeilingPerVps: 4,
        minimumTenantStartOffsetSeconds: 120,
        activeMonitoringRequired: true
      },
      scope: {
        vpsAccessed: false,
        mutationPerformed: false,
        dnsCaddyChanged: false,
        databaseChanged: false,
        runtimeChanged: false,
        deploymentChanged: false,
        onboardingUiChanged: false,
        schedulerChanged: false,
        exportReplayChanged: false,
        workflowPackageExpanded: false
      },
      nextGate: "operator_invites_first_subscriber_out_of_band"
    });

    expect(decision.referencedEvidence).toEqual([
      {
        path: "audit/2026-06-30/first-subscriber-preflight-authenticated-host-proof.json",
        phase: "first_subscriber_preflight_authenticated_host_verified",
        ok: true
      },
      {
        path: "audit/2026-06-30/first-subscriber-launch-readiness-gate.json",
        phase: "first_subscriber_launch_readiness_gate_recorded",
        ok: true
      }
    ]);
    for (const evidence of decision.referencedEvidence) {
      const actual = JSON.parse(readFileSync(evidence.path, "utf8")) as { phase: string; ok: boolean };
      expect(actual.phase, evidence.path).toBe(evidence.phase);
      expect(actual.ok, evidence.path).toBe(evidence.ok);
    }

    const serialized = JSON.stringify(decision);
    expect(serialized).not.toContain("the_secrets");
    expect(serialized).not.toMatch(/wf1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(serialized).not.toMatch(/Bearer\s+[A-Za-z0-9._-]+/);
  });

  it("records the controlled handoff packet as the latest phase without widening launch scope", () => {
    const latestPhaseCurrentBlock = handoff.split("## Latest Phase")[1]?.trimStart().split(/\r?\n\r?\n/)[0] ?? "";

    expect(latestPhaseCurrentBlock).toContain("Recorded the controlled first-subscriber handoff packet");
    expect(latestPhaseCurrentBlock).toContain("Sonnet was consulted in headless mode");
    expect(latestPhaseCurrentBlock).toContain("A local explorer subagent independently confirmed");
    expect(latestPhaseCurrentBlock).toContain("operator-ready decision before any subscriber invite");
    expect(latestPhaseCurrentBlock).toContain("No VPS, Docker, Caddy, DNS, database, runtime, worker, scheduler, export, dashboard-visual, onboarding-UI, workflow/package, or cutover mutation was performed");
    expect(latestPhaseCurrentBlock).toContain("Next continuation point");
    expect(latestPhaseCurrentBlock).toContain("operator invites the first subscriber out of band");
    expect(todo).toContain("Record the controlled first-subscriber handoff packet");
    expect(todo).toContain("Do not turn this handoff packet into onboarding UI, scheduler automation, export replay, workflow/package expansion, or `api.spyderbyte.cloud` cutover.");
  });
});
