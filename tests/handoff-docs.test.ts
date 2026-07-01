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

  it("records the browser-harness observation as latest while preserving launch-readiness history", () => {
    expect(latestPhaseCurrentBlock).toContain(
      "Recorded the first-subscriber browser-harness observation"
    );
    expect(latestPhaseCurrentBlock).toContain(
      "authenticated browser session loaded the Wealth Factory board"
    );
    expect(latestPhaseCurrentBlock).toContain(
      "native provider lane is blocked by HTTP `401`"
    );
    expect(latestPhaseCurrentBlock).toContain(
      "OpenAI device/Codex subscription provider binding"
    );
    expect(latestPhaseCurrentBlock).toContain(
      "`audit/2026-06-30/first-subscriber-browser-harness-observation.json`"
    );
    expect(latestPhaseCurrentBlock).toContain(
      "--confirm-codex-home-ready"
    );
    expect(latestPhaseCurrentBlock).toContain(
      "remains fail-closed in this slice"
    );
    expect(latestPhaseCurrentBlock).toContain(
      "wfpc.package_provider_requirements"
    );
    expect(latestPhaseCurrentBlock).toContain(
      "incomplete `openai_chatgpt_codex_subscription` rows"
    );
    expect(latestPhaseCurrentBlock).toContain(
      "npm run prove:codex-auth-home-readiness"
    );
    expect(latestPhaseCurrentBlock).toContain(
      "defaults to dry-run without loading secret files"
    );
    expect(latestPhaseCurrentBlock).toContain(
      "Result: `container_not_running`"
    );
    expect(latestPhaseCurrentBlock).toContain(
      "vps-codex-auth-home-readiness-proof.json"
    );
    expect(latestPhaseCurrentBlock).toContain(
      "do not proceed to OpenAI device provider binding repair execute"
    );
    expect(latestPhaseCurrentBlock).toContain(
      "performs no DB, workflow, DNS/Caddy, provider repair, or Paperclip mutation"
    );
    expect(latestPhaseCurrentBlock).toContain(
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
    expect(firstSubscriberLaunchChecklist).toContain("must not print raw `CODEX_HOME`");
    expect(firstSubscriberLaunchChecklist).toContain("Current execute mode still fails closed");
    expect(firstSubscriberLaunchChecklist).toContain("workflow provider requirement seam");
    expect(firstSubscriberLaunchChecklist).toContain("Do not treat the existing `openai_api`-bound run as proof");
    expect(firstSubscriberLaunchChecklist).toContain("must not mutate existing `workflow_runs`");
    expect(currentNextSlice).toContain("Keep repair execute mode fail-closed");
    expect(currentNextSlice).toContain("`wfpc.package_provider_requirements`");
    expect(currentNextSlice).toContain("Skip incomplete `openai_chatgpt_codex_subscription` rows");
    expect(currentNextSlice).toContain("Prove the VPS Codex auth-home readiness gate");
    expect(currentNextSlice).toContain("no DB/workflow/DNS/Caddy/provider/Paperclip mutation");
    expect(currentNextSlice).toContain("`container_not_running`");
    expect(currentNextSlice).toContain("Bring up or refresh only the isolated Wealth Factory stage API lane");
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
