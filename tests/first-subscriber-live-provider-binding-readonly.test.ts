import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const artifactPath = "audit/2026-06-30/first-subscriber-live-provider-binding-readonly.json";

type LiveProviderBindingReadonlyArtifact = {
  phase: string;
  scope: {
    accessMode: string;
    liveInfrastructureMutated: boolean;
    databaseMutated: boolean;
    providerCredentialMutated: boolean;
    workflowProgressionRetried: boolean;
  };
  liveFinding: {
    activeProviderConnections: Array<{
      providerKind: string;
      metadataKeys: string[];
      hasCodexHomeMetadata: boolean;
      hasAuthStateRefMetadata: boolean;
    }>;
    recentRunBoundProviderKinds: Array<{
      boundProviderKinds: string[];
    }>;
  };
  conclusion: {
    blocker: string;
    nextAction: string;
    doNotDo: string[];
  };
};

describe("first subscriber live provider binding readonly observation", () => {
  it("records the live provider binding blocker without leaking secrets or mutating state", () => {
    expect(existsSync(artifactPath)).toBe(true);

    const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as LiveProviderBindingReadonlyArtifact;

    expect(artifact).toMatchObject({
      phase: "first_subscriber_live_provider_binding_readonly_check",
      scope: {
        accessMode: "read_only_sql_via_wf_stage_api_container",
        liveInfrastructureMutated: false,
        databaseMutated: false,
        providerCredentialMutated: false,
        workflowProgressionRetried: false
      },
      conclusion: {
        blocker: "live_stage_is_still_bound_to_openai_api_not_openai_device_codex_subscription",
        nextAction: "create_or_repair_the_openai_device_codex_subscription_connection_for_the_controlled_lane_then_start_or_rebind_a_fresh_proof_run"
      }
    });

    expect(artifact.liveFinding.activeProviderConnections).toContainEqual(
      expect.objectContaining({
        providerKind: "openai_api",
        metadataKeys: ["project"],
        hasCodexHomeMetadata: false,
        hasAuthStateRefMetadata: false
      })
    );
    expect(artifact.liveFinding.recentRunBoundProviderKinds.every((run) => run.boundProviderKinds.includes("openai_api"))).toBe(true);
    expect(JSON.stringify(artifact)).not.toMatch(/sk-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]+|postgresql:\/\/|VPS2_|WF_API_SESSION_SIGNING_KEY/i);
  });
});
