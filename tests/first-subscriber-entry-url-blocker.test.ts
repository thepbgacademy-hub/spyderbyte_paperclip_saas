import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const artifactPath = "audit/2026-06-30/first-subscriber-entry-url-blocker.json";
const launchChecklistPath = "deploy/runbooks/first-subscriber-launch-checklist.md";
const postInviteRunbookPath = "deploy/runbooks/first-subscriber-post-invite-runbook.md";
const handoffPath = "wf-harness/HANDOFF.md";
const todoPath = "wf-harness/TODO.md";

const correctedBoardUrl = "https://wf-api.spyderbyte.cloud/board?workflowId=wf_connect_first_workflow";
const invalidApexBoardUrl = "https://spyderbyte.cloud/board?workflowId=wf_connect_first_workflow";
const invalidWwwBoardUrl = "https://www.spyderbyte.cloud/board?workflowId=wf_connect_first_workflow";

type EntryUrlBlockerArtifact = {
  phase: string;
  ok: boolean;
  verdict: string;
  launchLane: string;
  correctedEntry: {
    subscriberBoardUrl: string;
    requiresAuthenticatedSession: boolean;
    portalOriginBoardRouteAvailable: boolean;
  };
  observedBlockedUrls: Array<{
    url: string;
    status: number;
    interpretation: string;
  }>;
  scope: {
    vpsAccessed: boolean;
    mutationPerformed: boolean;
    dnsCaddyChanged: boolean;
    runtimeChanged: boolean;
    onboardingUiChanged: boolean;
  };
};

describe("first subscriber entry URL blocker", () => {
  it("records the apex/www board 404 as a bounded handoff blocker with the corrected wf-api board entry", () => {
    expect(existsSync(artifactPath)).toBe(true);

    const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as EntryUrlBlockerArtifact;

    expect(artifact).toMatchObject({
      phase: "first_subscriber_entry_url_blocker_documented",
      ok: true,
      verdict: "blocker_documented_and_handoff_corrected",
      launchLane: "wf-api.spyderbyte.cloud",
      correctedEntry: {
        subscriberBoardUrl: correctedBoardUrl,
        requiresAuthenticatedSession: true,
        portalOriginBoardRouteAvailable: false
      },
      scope: {
        vpsAccessed: false,
        mutationPerformed: false,
        dnsCaddyChanged: false,
        runtimeChanged: false,
        onboardingUiChanged: false
      }
    });

    expect(artifact.observedBlockedUrls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: invalidApexBoardUrl,
          status: 404,
          interpretation: "invalid_first_subscriber_entry_path"
        }),
        expect.objectContaining({
          url: invalidWwwBoardUrl,
          status: 404,
          interpretation: "invalid_first_subscriber_entry_path"
        })
      ])
    );

    const serialized = JSON.stringify(artifact);
    expect(serialized).not.toContain("the_secrets");
    expect(serialized).not.toMatch(/wf1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(serialized).not.toMatch(/Bearer\s+[A-Za-z0-9._-]+/);
  });

  it("updates operator-facing docs to forbid apex/www board links and use the wf-api board entry", () => {
    const launchChecklist = readFileSync(launchChecklistPath, "utf8");
    const postInviteRunbook = readFileSync(postInviteRunbookPath, "utf8");
    const combinedDocs = `${launchChecklist}\n${postInviteRunbook}`;

    expect(combinedDocs).toContain(correctedBoardUrl);
    expect(combinedDocs).toContain("Do not send the subscriber to `https://spyderbyte.cloud/board?workflowId=wf_connect_first_workflow`");
    expect(combinedDocs).toContain("Do not send the subscriber to `https://www.spyderbyte.cloud/board?workflowId=wf_connect_first_workflow`");
    expect(combinedDocs).toContain("apex/www `/board` returns `404` in the current launch posture");
    expect(combinedDocs).toContain("the `wf-api.spyderbyte.cloud` board path is expected to require authentication");
    expect(combinedDocs).not.toContain("the_secrets");
    expect(combinedDocs).not.toMatch(/wf1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(combinedDocs).not.toMatch(/Bearer\s+[A-Za-z0-9._-]+/);
  });

  it("records the entry-path correction in handoff and TODO without widening scope", () => {
    const handoff = readFileSync(handoffPath, "utf8");
    const todo = readFileSync(todoPath, "utf8");
    const latestPhaseCurrentBlock = handoff.split("## Latest Phase")[1]?.trimStart().split(/\r?\n\r?\n/)[0] ?? "";

    expect(latestPhaseCurrentBlock).toContain("Recorded the first-subscriber browser-harness observation");
    expect(handoff).toContain("Recorded the first-subscriber entry URL blocker and correction");
    expect(handoff).toContain("apex/www `/board` returned `404`");
    expect(handoff).toContain(correctedBoardUrl);
    expect(handoff).toContain("prove the subscriber session acquisition path");
    expect(handoff).toContain("No VPS, Docker, Caddy, DNS, database, runtime, worker, scheduler, export, onboarding-UI, workflow/package, rollback, or cutover mutation was performed");
    expect(todo).toContain("Record and correct the first-subscriber entry URL blocker");
    expect(todo).toContain("Forbid apex/www `/board` as a first-subscriber handoff URL");
    expect(todo).toContain("Capture the remaining operational gap: the corrected `wf-api` board URL is auth-gated, so the next stand-in check must prove the subscriber session acquisition path");
    expect(todo).toContain("Do not turn this correction into DNS/Caddy changes, onboarding UI, runtime routing changes, workflow/package expansion, or `api.spyderbyte.cloud` cutover");
  });
});
