import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const artifactPath = "audit/2026-06-30/first-subscriber-post-invite-observation-template.json";
const runbookPath = "deploy/runbooks/first-subscriber-post-invite-runbook.md";
const handoff = readFileSync("wf-harness/HANDOFF.md", "utf8");
const todo = readFileSync("wf-harness/TODO.md", "utf8");

type PostInviteObservation = {
  phase: string;
  ok: boolean;
  template: boolean;
  subscriberInviteSent: boolean;
  verdict: "pending" | "go" | "no_go" | "rollback_completed";
  launchLane: string;
  cutoverHost: string;
  cutoverStatus: string;
  blockerIntake: {
    blockerReported: boolean;
    blockerSeverity: "none" | "launch_critical" | "defer";
    smallestFixPhaseRequired: boolean;
    blockerDescription: string | null;
  };
  rollback: {
    rollbackPerformed: boolean;
    rollbackReason: string | null;
    rollbackOperatorActionOnly: boolean;
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
  nextAllowedOutcomes: string[];
};

describe("first subscriber post-invite observation template", () => {
  it("records a pending, sanitized post-invite observation template before the invite occurs", () => {
    expect(existsSync(artifactPath)).toBe(true);

    const observation = JSON.parse(readFileSync(artifactPath, "utf8")) as PostInviteObservation;

    expect(observation).toMatchObject({
      phase: "first_subscriber_post_invite_observation_template_recorded",
      ok: true,
      template: true,
      subscriberInviteSent: false,
      verdict: "pending",
      launchLane: "wf-api.spyderbyte.cloud",
      cutoverHost: "api.spyderbyte.cloud",
      cutoverStatus: "operator_only_deferred",
      blockerIntake: {
        blockerReported: false,
        blockerSeverity: "none",
        smallestFixPhaseRequired: false,
        blockerDescription: null
      },
      rollback: {
        rollbackPerformed: false,
        rollbackReason: null,
        rollbackOperatorActionOnly: true
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
      }
    });
    expect(observation.nextAllowedOutcomes).toEqual([
      "operator_records_go_after_invite",
      "operator_records_no_go_without_code_change",
      "operator_records_rollback_completed",
      "open_smallest_launch_critical_blocker_phase"
    ]);

    const serialized = JSON.stringify(observation);
    expect(serialized).not.toContain("the_secrets");
    expect(serialized).not.toMatch(/wf1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(serialized).not.toMatch(/Bearer\s+[A-Za-z0-9._-]+/);
  });

  it("documents the post-invite runbook without prescribing repo-driven rollback or widening scope", () => {
    expect(existsSync(runbookPath)).toBe(true);

    const runbook = readFileSync(runbookPath, "utf8");
    const combined = `${runbook}\n${readFileSync(artifactPath, "utf8")}`;

    expect(runbook).toContain("First Subscriber Post-Invite Observation Runbook");
    expect(runbook).toContain("The invite itself is an out-of-band operator action");
    expect(runbook).toContain("Do not run VPS, Docker, Caddy, DNS, database, runtime, worker, queue, scheduler, export, workflow/package, or cutover mutations from this runbook");
    expect(runbook).toContain("If a launch-critical blocker appears, stop and open the smallest bounded blocker-fix phase");
    expect(runbook).toContain("`api.spyderbyte.cloud` remains operator-only deferred cutover territory");
    expect(combined).not.toContain("the_secrets");
    expect(combined).not.toMatch(/wf1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(combined).not.toMatch(/Bearer\s+[A-Za-z0-9._-]+/);
  });

  it("records the post-invite observation template as the latest phase without pretending the invite happened", () => {
    const latestPhaseCurrentBlock = handoff.split("## Latest Phase")[1]?.trimStart().split(/\r?\n\r?\n/)[0] ?? "";

    expect(latestPhaseCurrentBlock).toContain("Recorded the first-subscriber post-invite observation template");
    expect(latestPhaseCurrentBlock).toContain("Sonnet was consulted in headless mode");
    expect(latestPhaseCurrentBlock).toContain("A local explorer subagent independently confirmed");
    expect(latestPhaseCurrentBlock).toContain("subscriber invite has not been performed by this repo phase");
    expect(latestPhaseCurrentBlock).toContain("No VPS, Docker, Caddy, DNS, database, runtime, worker, scheduler, export, dashboard-visual, onboarding-UI, workflow/package, rollback, or cutover mutation was performed");
    expect(todo).toContain("Record the first-subscriber post-invite observation template");
    expect(todo).toContain("Do not turn this observation template into onboarding UI, rollback automation, scheduler automation, export replay, workflow/package expansion, or `api.spyderbyte.cloud` cutover.");
  });
});
