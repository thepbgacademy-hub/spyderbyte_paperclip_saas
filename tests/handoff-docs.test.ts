import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const rootHandoff = readFileSync("HANDOFF.md", "utf8");
const handoff = readFileSync("wf-harness/HANDOFF.md", "utf8");
const obsidianDesign = readFileSync("wf-harness/docs/2026-06-29-obsidian-long-memory-integration-design.md", "utf8");
const latestPhase = handoff.split("## Latest Phase")[1]?.split("## Key Design Commitments")[0] ?? "";
const latestPhaseCurrentBlock = latestPhase.trimStart().split(/\r?\n\r?\n/)[0] ?? "";
const todo = readFileSync("wf-harness/TODO.md", "utf8");
const currentNextSlice = todo.split("## Current Next Slice")[1]?.split("## Historical Next Slice Notes")[0] ?? "";
const firstSubscriberLaunchChecklist = readFileSync("deploy/runbooks/first-subscriber-launch-checklist.md", "utf8");

describe("handoff board-surface wording", () => {
  it("keeps one authoritative handoff path after the repo-noise cleanup", () => {
    expect(rootHandoff).toContain("`wf-harness/HANDOFF.md` is the authoritative handoff path");
    expect(rootHandoff).toContain("Phase R1");
    expect(rootHandoff).not.toContain("## Status");
    expect(rootHandoff).not.toContain("## Next Build Order");
  });

  it("records the completed realignment phases without reopening product scope", () => {
    expect(handoff).toContain(
      "Phase R2 is now closed"
    );
    expect(handoff).toContain(
      "GitNexus preflight"
    );
    expect(handoff).toContain(
      "Phase R4 is now closed"
    );
    expect(handoff).toContain(
      "HarnessBoardActionPanel.tsx"
    );
    expect(handoff).toContain(
      "Phase R5 is now closed"
    );
    expect(handoff).toContain(
      "runtime-native-execution.ts"
    );
    expect(handoff).toContain(
      "Phase R6 is now closed"
    );
    expect(handoff).toContain(
      "legacy-bounded adapters"
    );
    expect(handoff).toContain(
      "`npx vitest run tests/worker-runtime.test.ts tests/runtime-provider-fallback.test.ts`"
    );
  });

  it("records backend result approval durability as latest while preserving launch-readiness history", () => {
    expect(latestPhaseCurrentBlock).toContain(
      "local-first backend durability foundation for result approval state"
    );
    expect(latestPhaseCurrentBlock).toContain(
      "wfpc.harness_result_approval_states"
    );
    expect(latestPhaseCurrentBlock).toContain(
      "upsertResultApprovalState"
    );
    expect(latestPhaseCurrentBlock).toContain(
      "disposable Postgres cross-client round-trip"
    );
    expect(latestPhaseCurrentBlock).toContain(
      "does not wire the dashboard UI"
    );
    expect(latestPhaseCurrentBlock).toContain(
      "UI/API bridging should be separate"
    );
    expect(latestPhase).toContain(
      "Re-authenticated the tenant-isolated OpenAI Codex device login"
    );
    expect(latestPhase).toContain(
      "codex_auth_home_ready"
    );
    expect(latestPhase).toContain(
      "codex-auth-home-readiness-api-after-reauth-targeted.json"
    );
    expect(latestPhase).toContain(
      "codex-auth-home-readiness-worker-after-reauth-targeted.json"
    );
    expect(latestPhase).toContain(
      "live-native-execution-after-reauth-connect-first.json"
    );
    expect(latestPhase).toContain(
      "round_trip_verified"
    );
    expect(latestPhase).toContain(
      "wf_tax_strategy"
    );
    expect(latestPhase).toContain(
      "next launch-facing phase should prove the browser/client journey"
    );
    expect(latestPhase).toContain(
      "--api-codex-home-readiness-proof"
    );
    expect(latestPhase).toContain(
      "--worker-codex-home-readiness-proof"
    );
    expect(latestPhase).toContain(
      "--codex-auth-state-ref"
    );
    expect(latestPhase).toContain(
      "Deployed the bounded worker-side Codex execution wiring fix"
    );
    expect(latestPhase).toContain(
      "wf-stage-api"
    );
    expect(latestPhase).toContain(
      "wf-stage-worker"
    );
    expect(latestPhase).toContain(
      "wf-stage-20260701-workercodexhome2"
    );
    expect(latestPhase).toContain(
      "refresh_token_invalidated"
    );
    expect(latestPhase).toContain(
      "re-authenticate the tenant-isolated Codex device login"
    );
    expect(latestPhase).toContain("codex-auth-home-readiness-worker-auth-revoked.json");
    expect(latestPhase).toContain("codex-auth-home-readiness-api-auth-session-revoked.json");
    expect(latestPhase).toContain("codex-auth-home-readiness-worker-auth-session-revoked.json");
    expect(latestPhase).toContain("No DNS, Caddy, web image");
    expect(latestPhase).toContain(
      "Recorded the first-subscriber browser-harness observation"
    );
    expect(latestPhase).toContain(
      "authenticated browser session loaded the Wealth Factory board"
    );
    expect(latestPhase).toContain(
      "native provider lane is blocked by HTTP `401`"
    );
    expect(latestPhase).toContain(
      "OpenAI device/Codex subscription provider binding"
    );
    expect(latestPhase).toContain(
      "`audit/2026-06-30/first-subscriber-browser-harness-observation.json`"
    );
    expect(latestPhase).toContain(
      "--confirm-codex-home-ready"
    );
    expect(latestPhase).toContain(
      "--codex-home-readiness-proof"
    );
    expect(latestPhase).toContain(
      "requires `codexHome`, `authStateRef`, `--confirm-codex-home-ready`, a target-matched `--codex-home-readiness-proof` with a matching CODEX_HOME fingerprint, and an operator-supplied stage DB URL"
    );
    expect(latestPhase).toContain(
      "Implemented the target-scoped transaction contract"
    );
    expect(latestPhase).toContain(
      "must not be generalized to multi-workflow tenants without a schema/design change"
    );
    expect(latestPhase).toContain(
      "wfpc.package_provider_requirements"
    );
    expect(latestPhase).toContain(
      "incomplete `openai_chatgpt_codex_subscription` rows"
    );
    expect(latestPhase).toContain(
      "npm run prove:codex-auth-home-readiness"
    );
    expect(latestPhase).toContain(
      "defaults to dry-run without loading secret files"
    );
    expect(latestPhase).toContain(
      "Result advanced to `codex_home_missing`"
    );
    expect(latestPhase).toContain(
      "Result: `codex_auth_home_ready`"
    );
    expect(latestPhase).toContain(
      "vps-codex-auth-home-readiness-proof.json"
    );
    expect(latestPhase).toContain(
      "the Codex auth-home readiness hotzone is safe to proceed from a repository secret-exposure standpoint"
    );
    expect(latestPhase).toContain(
      "performs no DB, workflow, DNS/Caddy, provider repair, or Paperclip mutation"
    );
    expect(latestPhase).toContain(
      "must not mutate existing `workflow_runs`"
    );
    expect(latestPhase).toContain(
      "Recorded the first-subscriber entry URL blocker and correction"
    );
    expect(latestPhase).toContain(
      "apex/www `/board` returned `404`"
    );
    expect(latestPhase).toContain(
      "https://wf-api.spyderbyte.cloud/board?workflowId=wf_connect_first_workflow"
    );
    expect(latestPhase).toContain(
      "`audit/2026-06-30/first-subscriber-entry-url-blocker.json`"
    );
    expect(latestPhase).toContain(
      "Recorded the first-subscriber post-invite observation template"
    );
    expect(latestPhase).toContain(
      "subscriber invite has not been performed by this repo phase"
    );
    expect(latestPhase).toContain(
      "`audit/2026-06-30/first-subscriber-post-invite-observation-template.json`"
    );
    expect(latestPhase).toContain(
      "Recorded the controlled first-subscriber handoff packet"
    );
    expect(latestPhase).toContain(
      "operator-ready decision before any subscriber invite"
    );
    expect(latestPhase).toContain(
      "Sanitized evidence is recorded in `audit/2026-06-30/first-subscriber-handoff-decision.json`"
    );
    expect(latestPhase).toContain(
      "Recorded the first-subscriber authenticated public-host preflight proof"
    );
    expect(latestPhase).toContain(
      "Fresh authenticated preflight result"
    );
    expect(latestPhase).toContain(
      "Recorded the first-subscriber launch readiness gate"
    );
    expect(latestPhase).toContain(
      "Recorded the authenticated public launch host acceptance gate"
    );
    expect(latestPhase).toContain(
      "Recorded the public launch host acceptance gate"
    );
    expect(latestPhase).toContain(
      "keep `api.spyderbyte.cloud` as operator-only deferred cutover"
    );
    expect(latestPhase).toContain(
      "Recorded the launch tenant ceiling and cron/heartbeat anti-clustering rule"
    );
    expect(latestPhase).toContain(
      "Completed the manual live read-only confirmation for the stage operator-controls probe"
    );
    expect(latestPhase).toContain(
      "Added the manual live read-only confirmation gate for the stage operator-controls probe"
    );
    expect(latestPhase).toContain(
      "Added the dry-run-first isolated stage operator-controls probe"
    );
    expect(latestPhase).toContain(
      "Closed the bounded local operator-controls integration proof harness"
    );
  });

  it("keeps the OpenAI device provider binding gate explicit before live repair execute", () => {
    expect(firstSubscriberLaunchChecklist).toContain("## OpenAI Device Provider Binding Gate");
    expect(firstSubscriberLaunchChecklist).toContain("tenant-isolated `CODEX_HOME`");
    expect(firstSubscriberLaunchChecklist).toContain("non-secret smoke prompt");
    expect(firstSubscriberLaunchChecklist).toContain("npm run prove:codex-auth-home-readiness -- --execute");
    expect(firstSubscriberLaunchChecklist).toContain("--target-tenant <tenant-id>");
    expect(firstSubscriberLaunchChecklist).toContain("--target-workflow wf_connect_first_workflow");
    expect(firstSubscriberLaunchChecklist).toContain("--auth-state-ref <auth-state-ref>");
    expect(firstSubscriberLaunchChecklist).toContain("--codex-home-readiness-proof <path>");
    expect(firstSubscriberLaunchChecklist).toContain("validate that artifact, including the target tenant/workflow/auth-state reference and CODEX_HOME fingerprint");
    expect(firstSubscriberLaunchChecklist).toContain("must not print raw `CODEX_HOME`");
    expect(firstSubscriberLaunchChecklist).not.toContain("the_secrets");
    expect(firstSubscriberLaunchChecklist).toContain("Treat execute mode as an operator-only DB repair lane");
    expect(firstSubscriberLaunchChecklist).toContain("green target-matched Codex auth-home proof");
    expect(firstSubscriberLaunchChecklist).toContain("package provider requirement seam");
    expect(firstSubscriberLaunchChecklist).toContain("secret_references_tenant_secret_ref_unique");
    expect(firstSubscriberLaunchChecklist).toContain("Do not treat the existing `openai_api`-bound run as proof");
    expect(firstSubscriberLaunchChecklist).toContain("must not mutate existing `workflow_runs`");
    expect(firstSubscriberLaunchChecklist).toContain("--api-codex-home-readiness-proof <api-artifact>");
    expect(firstSubscriberLaunchChecklist).toContain("--worker-codex-home-readiness-proof <worker-artifact>");
    expect(firstSubscriberLaunchChecklist).toContain("--codex-auth-state-ref <auth-state-ref>");
    expect(firstSubscriberLaunchChecklist).toContain("different `CODEX_HOME` fingerprint");
    expect(firstSubscriberLaunchChecklist).toContain("fail closed before remote reservation or advancement");
    expect(latestPhase).toContain("--api-codex-home-readiness-proof");
    expect(latestPhase).toContain("--worker-codex-home-readiness-proof");
    expect(latestPhase).toContain("--codex-auth-state-ref");
    expect(latestPhase).toContain("Added a fail-closed Codex auth-home readiness artifact gate");
    expect(currentNextSlice).toContain("scripts/prove-live-native-execution.mjs");
    expect(currentNextSlice).toContain("--api-codex-home-readiness-proof");
    expect(currentNextSlice).toContain("--worker-codex-home-readiness-proof");
    expect(currentNextSlice).toContain("Keep repair execute mode fail-closed");
    expect(currentNextSlice).toContain("`wfpc.package_provider_requirements`");
    expect(currentNextSlice).toContain("Implement and locally prove the operator-gated provider-binding repair transaction");
    expect(currentNextSlice).toContain("secret_references_tenant_secret_ref_unique");
    expect(currentNextSlice).toContain("Skip incomplete `openai_chatgpt_codex_subscription` rows");
    expect(currentNextSlice).toContain("Prove the VPS Codex auth-home readiness gate");
    expect(currentNextSlice).toContain("no DB/workflow/DNS/Caddy/provider/Paperclip mutation");
    expect(currentNextSlice).toContain("`codex_home_missing`");
    expect(currentNextSlice).toContain("tenant-isolated `CODEX_HOME`");
    expect(currentNextSlice).toContain("`sudo usermod -aG docker deploy`");
    expect(currentNextSlice).toContain("no mutation of existing `workflow_runs`");
    expect(currentNextSlice).toContain("Preserve BYOK/API-provider lanes");
  });

  it("keeps the current next-slice section pointed at completed bounded launch-readiness slices", () => {
    expect(currentNextSlice.trimStart()).toContain(
      "- [x] Add a manual live read-only confirmation gate for the stage operator-controls probe without executing the live token path or widening stage automation."
    );
    expect(currentNextSlice).toContain(
      "Add sanitized audit evidence at `audit/2026-06-29/stage-operator-controls-read-only-confirmation.json`"
    );
    expect(currentNextSlice).toContain(
      "Extend the stage-stability dry-run test to prove the automated sequence still excludes `npm run prove:stage-operator-controls`."
    );
    expect(currentNextSlice.trimStart()).toContain(
      "- [x] Add a dry-run-first isolated stage operator-controls probe without mutating stage state or widening operator capability."
    );
    expect(currentNextSlice).toContain(
      "Add `npm run prove:stage-operator-controls` as an opt-in proof command that defaults to dry-run and emits structured JSON."
    );
    expect(currentNextSlice).toContain(
      "Defer pause/resume stage execution, job retry/cancel, secret rotate/revoke, run cancellation, emergency Paperclip disable, VPS/container/DNS/Caddy changes, and folding this probe into stage stability."
    );
    expect(currentNextSlice.trimStart()).toContain(
      "- [x] Refresh only the isolated Wealth Factory stage lane to prove live parity with the current branch."
    );
    expect(currentNextSlice).toContain(
      "- [x] Complete the post-stage-refresh commit/reindex closeout."
    );
    expect(currentNextSlice).toContain(
      "Commit and push the completed stage-refresh slice at `d73eb35`."
    );
    expect(currentNextSlice).toContain(
      "- [x] Harden the public board attention-recovery copy without widening runtime semantics, export plumbing, or deployment topology."
    );
    expect(currentNextSlice).toContain(
      "resolve the live board action instead of restarting workers, replaying stale action tokens, or bypassing the engine-owned contract"
    );
    expect(todo).toContain(
      "Phase R2: Proof and Tooling Surface Reduction"
    );
    expect(todo).toContain(
      "scripts/prove-provider-credential-lifecycle.mjs"
    );
    expect(todo).toContain(
      "Phase R4: Board UI Decomposition and Simplification"
    );
    expect(todo).toContain(
      "Phase R5: Runtime Hotspot Reduction"
    );
    expect(todo).toContain(
      "Phase R6: Paperclip Compatibility Bounding"
    );
    expect(currentNextSlice).not.toContain(
      "Close the bounded stage native-execution runner proof gap"
    );
  });

  it("records the Obsidian long-memory split without making Obsidian runtime truth", () => {
    expect(todo).toContain(
      "Design the Obsidian long-memory integration"
    );
    expect(todo).toContain(
      "Keep Obsidian limited to tenant-owned long memory promoted through `governance_history_export` and `package_bundle_export`"
    );
    expect(obsidianDesign).toContain(
      "This note closes the local-only Obsidian long-memory design phase"
    );
    expect(obsidianDesign).toContain(
      "Wealth Factory owns live execution truth"
    );
    expect(obsidianDesign).toContain(
      "Obsidian must not become the source of truth for live execution-critical state"
    );
    expect(obsidianDesign).toContain(
      "Only approved export candidates may promote Wealth Factory records into tenant-owned Obsidian memory"
    );
  });
});
