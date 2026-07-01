import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const artifactPath = "audit/2026-06-30/first-subscriber-browser-harness-observation.json";
const handoff = readFileSync("wf-harness/HANDOFF.md", "utf8");
const todo = readFileSync("wf-harness/TODO.md", "utf8");

type BrowserHarnessObservation = {
  phase: string;
  ok: boolean;
  browserHarnessUsed: boolean;
  correctedEntryUrl: string;
  observations: {
    unauthenticatedEntry: string;
    authenticatedEntry: string;
    visibleWorkflowBlocker: string;
  };
  requiredCorrection: {
    category: string;
    nextAction: string;
    cannotBeCompletedWithout: string;
  };
  scope: {
    vpsAccessed: boolean;
    liveInfrastructureMutated: boolean;
    databaseMutated: boolean;
    providerCredentialMutated: boolean;
    browserCookieSet: boolean;
  };
};

describe("first subscriber browser harness observation", () => {
  it("records the browser-harness proof and OpenAI device subscription blocker without leaking secrets", () => {
    expect(existsSync(artifactPath)).toBe(true);

    const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as BrowserHarnessObservation;

    expect(artifact).toMatchObject({
      phase: "first_subscriber_browser_harness_observation_recorded",
      ok: true,
      browserHarnessUsed: true,
      correctedEntryUrl: "https://wf-api.spyderbyte.cloud/board?workflowId=wf_connect_first_workflow",
      observations: {
        unauthenticatedEntry: "returned_unauthorized_json",
        authenticatedEntry: "loaded_wealth_factory_board",
        visibleWorkflowBlocker: "native_provider_http_401"
      },
      requiredCorrection: {
        category: "openai_device_codex_subscription_binding",
        nextAction: "repair_or_bind_openai_device_codex_subscription_then_retry_unblock",
        cannotBeCompletedWithout: "valid_openai_device_codex_subscription_binding"
      },
      scope: {
        vpsAccessed: false,
        liveInfrastructureMutated: false,
        databaseMutated: false,
        providerCredentialMutated: false,
        browserCookieSet: true
      }
    });

    const serialized = JSON.stringify(artifact);
    expect(serialized).not.toContain("the_secrets");
    expect(serialized).not.toMatch(/wf1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(serialized).not.toMatch(/Bearer\s+[A-Za-z0-9._-]+/);
    expect(serialized).not.toMatch(/sk-[A-Za-z0-9_-]+/);
  });

  it("updates handoff and TODO with the OpenAI device subscription blocker as the next launch proof step", () => {
    const latestPhaseCurrentBlock = handoff.split("## Latest Phase")[1]?.trimStart().split(/\r?\n\r?\n/)[0] ?? "";

    expect(latestPhaseCurrentBlock).toContain("Recorded the first-subscriber browser-harness observation");
    expect(latestPhaseCurrentBlock).toContain("authenticated browser session loaded the Wealth Factory board");
    expect(latestPhaseCurrentBlock).toContain("native provider lane is blocked by HTTP `401`");
    expect(latestPhaseCurrentBlock).toContain("OpenAI device/Codex subscription provider binding");
    expect(todo).toContain("Record the browser-harness first-subscriber observation");
    expect(todo).toContain("Do not retry workflow progression until the OpenAI device/Codex subscription provider binding is repaired or confirmed");
  });
});
