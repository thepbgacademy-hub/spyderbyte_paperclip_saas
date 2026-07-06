import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("live native execution proof script", () => {
  it("reuses the stage dashboard proof seam and verifies bounded native advancement through dashboard or direct reservation starts", () => {
    const script = readFileSync("scripts/prove-live-native-execution.mjs", "utf8");

    expect(script).toContain("postDashboardRunAndVerifyDurableBinding");
    expect(script).toContain("parseStageProofArgs");
    expect(script).toContain("loadScriptEnv");
    expect(script).toContain("resolveNativeProofStartSelector");
    expect(script).toContain("workflow_definition_snapshot");
    expect(script).toContain("installed_package_overlay");
    expect(script).toContain("executionEngine");
    expect(script).toContain("wf_native_v1");
    expect(script).toContain("wf-stage-api");
    expect(script).toContain("native_execution_verified");
    expect(script).toContain("expectedExecutionEngine");
    expect(script).toContain("execution_outcome_committed");
    expect(script).toContain("execution_claimed_at");
    expect(script).toContain("card.persona <> 'ceo'");
    expect(script).toContain("created_at > $3");
    expect(script).toContain("advanceNativeExecutionProof");
    expect(script).toContain("waitForNativeExecutionAcceptance");
    expect(script).toContain("resolveLiveNativeAttention");
    expect(script).toContain("loadRemoteNativeExecutionState");
    expect(script).toContain("secrets.secret_ref as current_secret_ref");
    expect(script).toContain("secrets.revoked_at is null");
    expect(script).toContain("live-attention-roundtrip-verification.mjs");
    expect(script).toContain("verifyWaitingRoundTrip");
    expect(script).toContain("roundTripProof");
    expect(script).toContain("native_blocked_reached");
    expect(script).toContain("buildNativeExecutionAcceptanceOptions");
    expect(script).toContain("validateCodexReadinessProofGate");
    expect(script).toContain("api-codex-home-readiness-proof");
    expect(script).toContain("worker-codex-home-readiness-proof");
    expect(script).toContain("codex-auth-state-ref");
    expect(script).toContain("WF_OPENAI_CODEX_AUTH_STATE_REF");
    expect(script).toContain("phase: codexReadinessGate.phase");
    expect(script).toContain("taxEvidenceSummary");
    expect(script).not.toContain("upsertRemoteTaxStrategyPrerequisiteSnapshot");
    expect(script).not.toContain("harness_tax_strategy_prerequisite_snapshots");
    expect(script).toContain("wf_tax_strategy");
    expect(script).toContain("Founder tax posture documentation is now supplied.");
    expect(script).toContain("Connect First pricing inputs are now supplied:");
    expect(script).toContain("delivery cost is $625");
    expect(script).toContain("buyer-value proof is founder time saved");
    expect(script).toContain("shouldProveAttentionRoundTrip");
    expect(script).toContain("verifyWaitingRoundTrip");
    expect(script).toContain("workflow_templates");
    expect(script).toContain("workflowTemplateOverride");
    expect(script).toContain("WF_STAGE_WORKFLOW_TEMPLATE_ID");
    expect(script).toContain("resolvedStartWorkflowId");
    expect(script).toContain("direct_public_reservation");
    expect(script).toContain("args[\"fresh-run\"] === \"true\"");
    expect(script).toContain("reserveDirectNativePublicRun");
    expect(script).toContain("createAcidGuardRepository");
    expect(script).toContain("createQueueOutboxWorker");
    expect(script).toContain("createBullmqWorkflowRunEnqueuer");
    expect(script).toContain("stageWorkflowRunRedispatch");
    expect(script).toContain("reserveWorkflowRun");
    expect(script).toContain(":redispatch:");
    expect(script).not.toContain("wfq_proof_");
    expect(script).toContain("WF_WORKFLOW_QUEUE_NAME must be set");
    expect(script).toContain("tenant_template");
    expect(script).toContain("workflow_identity_kind");
    expect(script).toContain("seedPublicWorkflowHarnessRun");
    expect(script).toContain("fresh_harness_run_conflict");
    expect(script).toContain("existing_harness_run_conflicts_with_fresh_proof");
    expect(script).toContain("updateRunState({");
    expect(script).toContain("state: 'active'");
    expect(script).toContain("buildRemoteVerificationConfig");
    expect(script).toContain("verifyDirectNativeReservation");
    expect(script).toContain("startPath === \"dashboard_public_start\"");
    expect(script).toContain("attemptedAt");
    expect(script).toContain("childLane");
    expect(script).toContain("fresh outcome");
    expect(script).toContain("JSON.stringify");
    expect(script).not.toContain("canonicalizeDirectNativePublicRun");
    expect(script).not.toContain("ensureRemoteDirectProofQueueJob");
    expect(script).not.toContain("buildInstalledPackageOverlaySnapshot");
    expect(script).not.toContain("resolveDirectProofWorkflowIdentityKind");
    expect(script).not.toContain("limit 2");
    expect(script).not.toContain("queue-live-workflow-run.mjs");
    expect(script).not.toContain("process.env.WF_WORKFLOW_QUEUE_NAME || 'wfpc-workflow-runs'");
    expect(script).not.toContain("||\n                (typeof entry.secretRef === \"string\" ? entry.secretRef : \"\")");
  });

  it("requires wf_connect_first_workflow to stay on the truthful attention-first acceptance path", () => {
    const script = readFileSync("scripts/prove-live-native-execution.mjs", "utf8");

    expect(script).toContain('import { buildNativeExecutionAcceptanceOptions } from "./lib/live-native-execution-proof-options.mjs";');
    expect(script).toContain("...buildNativeExecutionAcceptanceOptions(workflowId)");
  });

  it("does not mutate preexisting native attention before advancement or widen worker dispatch", () => {
    const script = readFileSync("scripts/prove-live-native-execution.mjs", "utf8");

    expect(script).not.toContain("preAdvancementAttentionResolution");
    expect(script).not.toContain("preexistingAttentionResolution");
    expect(script).not.toContain("resolvePreexistingNativeAttention");
    expect(script).not.toContain("preexisting_attention_resolution_failed");
    expect(script).not.toContain("decision: \"start_next_lane\"");
  });

  it("resets canonical bootstrap continuity when rearming an existing proof lane", () => {
    const script = readFileSync("scripts/prove-live-native-execution.mjs", "utf8");

    expect(script).toContain("const bootstrap = repairBootstrap[workflowId];");
    expect(script).toContain("No proof repair bootstrap is registered for");
    expect(script).toContain("await repository.upsertCardContinuity(");
    expect(script).toContain("cardId: existingLaneId,");
    expect(script).toContain("runId: existingRunId,");
    expect(script).toContain("continuitySummary: bootstrap.continuitySummary,");
    expect(script).toContain("latestResultSummary: null,");
    expect(script).toContain("absorbedWorkItems: []");
    expect(script.lastIndexOf("await repository.upsertCardContinuity(")).toBeGreaterThan(
      script.indexOf("const rearmedLane = await repository.updateCardState({ cardId: existingLaneId, state: 'approved' });")
    );
  });

  it("requires green API and worker Codex auth-home readiness artifacts before remote Codex-subscription proof work", () => {
    const script = readFileSync("scripts/prove-live-native-execution.mjs", "utf8");

    expect(script.indexOf("const codexReadinessGate = resolveCodexReadinessGate")).toBeLessThan(
      script.indexOf("const durableResult =")
    );
    expect(script).toContain("expectedTenantId: tenantId");
    expect(script).toContain("expectedWorkflowId: workflowId");
    expect(script).toContain("expectedAuthStateRef");
    expect(script).toContain("process.exitCode = 1");
    expect(script).toContain("CODEX_SUBSCRIPTION_WORKFLOW_IDS");
    expect(script).toContain("codex_readiness_gate_not_required");
  });
});
