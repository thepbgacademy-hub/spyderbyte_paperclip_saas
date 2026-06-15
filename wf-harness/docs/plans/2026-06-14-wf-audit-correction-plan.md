# Wealth Factory Audit Correction Plan

Date: `2026-06-14`
Branch: `codex/wf-harness-design`
Status: `active`

## Purpose

This plan converts the June 14 audit into a bounded correction track.

The objective is not to restart the build or throw away the structural wins. The objective is to:

- preserve the durable safety rails that are already real,
- stop expanding deferred seams that are not helping launch,
- restore the missing CEO-centered product loop,
- deepen worker execution into something deliverable-quality,
- and close the proof gaps that still separate "promising platform" from "launch-ready product."

## Source Of Truth

All correction phases must stay aligned with:

- `wf-harness/docs/2026-05-21-wf-harness-v1-design.md`
- `wf-harness/docs/paperclip-pressure-lessons-and-wealth-factory-guardrails.md`
- `wf-harness/docs/2026-06-14-audit-correction-anchor.md`
- `wf-harness/TODO.md`
- `wf-harness/HANDOFF.md`

## Non-Negotiable Preserve List

The following seams are already aligned and must not be destabilized during correction:

- Wealth Factory-owned BYOK boundary
- queue / outbox / worker / claim durability
- persisted run/card/proposal state machine
- fail-closed overlay/core/public-start boundaries
- closed-board snapshot immutability
- current native workflow-family cutovers for the approved core exceptions

## Immediate Freeze Rules

Effective immediately, until a later bounded cleanup phase explicitly reopens them:

- no new `memoryBoundary` fields
- no new `memoryBoundary` labels
- no new grouped export/memory summary metadata
- no new board/client rendering for deferred Obsidian/export detail
- no new thin-event board-copy variant regressions unless a new user-visible behavior truly requires them
- no new cleanup-only phases on the shallow executor unless they directly unlock the next missing product capability

## Correction Phases

Each phase is an end-to-end build/test boundary. Do not declare a phase complete until code, tests, docs, reviewer pass, and the phase-specific proof requirement are all green.

### Phase A: Freeze Deferred Growth

Goal:
- Stop spending build effort on deferred metadata and low-yield proof surfaces before any more launch-critical work is displaced.

Scope:
- Lock the `memoryBoundary` seam at its current shape.
- Lock thin-event copy-regression growth.
- Fold the overlay naming correction into the freeze phase so example/catalog drift does not keep pulling product identity assumptions.
- Decide the portable proof strategy for Docker-backed integration checks before later proof-closure work begins.
- Record the freeze in docs/TODO/handoff.

Required outputs:
- No new `memoryBoundary` expansion in service, client, or UI code.
- No new low-yield copy/permutation regressions.
- Overlay/example naming no longer reads like built-in product identity where the audit flagged it as drift.
- A recorded decision exists for how Docker-backed proof will be made portable enough for launch confidence.
- A clear "frozen until re-opened" rule set in the plan surfaces.

Proof requirement:
- Diff review shows no new deferred metadata surface growth landed in the phase.

Phase A lock record (`2026-06-14`):
- The current `memoryBoundary` shape, thin-event copy/permutation surface, and neutral overlay-example naming standard are now frozen until a later explicit reopen.
- The deferred-FK integration proof remains canonically Docker-backed and must have a Docker-capable CI lane for portable shared evidence.
- Dockerless local machines should use focused non-Docker fallback verification plus published CI evidence instead of a second local integration harness.
- Neutral examples should read like `wf-example-*`, `Reference Advisory`, and `Reference Audit`, not like built-in released product identities.

### Phase B: Complete Remaining CEO Governance Rules

Goal:
- Close the remaining dynamic card-creation / approval-policy seams that the AI CEO loop will rely on.

Scope:
- Finish the still-open CEO governance rules for bounded card creation and follow-on work handling.
- Keep reuse, new-lane, defer, deny, and fresh-cycle semantics coherent and durable.

Still-open governance rules that Phase B must explicitly close:
- what constitutes a bounded lane reuse versus a materially distinct new lane
- when the CEO should defer versus deny follow-on work
- when a request should trigger a fresh cycle instead of lane reuse
- how direct tenant/CEO requests that would exceed current board discipline are handled
- how follow-on work after completed-lane states is governed without reopening generic lane sprawl

Required outputs:
- CEO governance policy is fully specified in code and docs for the bounded first AI CEO loop.
- No unresolved TODO ambiguity remains around card-creation rules that block orchestration.

Proof requirement:
- Focused tests prove bounded CEO governance outcomes for reuse, new lane, defer, deny, and fresh-cycle decisions.

Phase B lock record (`2026-06-14`):
- Reuse an open or completed lane only when the request is a bounded refinement of the same assignment.
- A materially distinct request aimed at the same persona and deliverable while an active lane is still open must not auto-reuse that lane; it returns to bounded CEO governance as lane-pressure work instead.
- `fresh_cycle` remains reserved for `completed_lanes_only` follow-on work after the board has already packaged the current run.
- `scope_guardrail` remains the bounded within-package new-lane candidate state: `approve` is the recommended path there, while `defer` and `deny` stay explicit CEO override choices rather than automatic pressure outcomes.

### Phase C: First AI CEO Loop

Goal:
- Build the smallest correct tenant-facing AI CEO path.

Scope:
- Add a CEO-facing input surface.
- Add CEO prompt building and response parsing.
- Let the CEO interpret one tenant goal into one bounded orchestration decision.
- Persist that decision through existing harness state/governance seams.
- Optionally dispatch bounded child work through the existing worker/runtime path.

Required outputs:
- A tenant can submit a goal and receive a CEO-authored response.
- The CEO can choose between lane reuse, new lane, defer, deny, and fresh-cycle in bounded scenarios.
- Child personas remain non-tenant-facing.
- CEO response language is tenant-facing, names the orchestration decision taken, and does not collapse into child-persona chatter.

Proof requirement:
- End-to-end tests prove tenant input -> CEO decision -> durable mutation -> bounded response.
- Phase closeout includes explicit human reviewer sign-off that CEO response language is actually CEO-authored and tenant-facing, not merely mechanically valid.

Phase C lock record (`2026-06-14`):
- Tenant goals now enter through one guarded CEO loop submission seam instead of widening direct public board mutations.
- The CEO loop maps free-form tenant intent onto the existing bounded board-governance engine: proposal approval, defer, deny, or explicit fresh-cycle review.
- Durable truth remains in the existing harness decision ledger and proposal/card state seams; the CEO loop did not introduce a second orchestration state path.
- Fresh-cycle handling remains bounded to the current explicit review seam and existing redispatch path; this phase did not widen worker/outbox policy.
- The runtime-backed CEO executor uses the run-bound provider context and returns structured bounded decisions plus tenant-facing response text.

### Phase D: First Multi-Step Native Worker Lane

Goal:
- Replace the single-shot child-lane stub with one bounded multi-step native execution path.

Scope:
- Choose one workflow family.
- Add a narrow 2-3 step loop such as interpret -> draft -> validate -> return.
- Keep explicit `done/waiting/blocked/cancelled` outcome truth.
- Keep scope bounded to one lane and one family.

Required outputs:
- One workflow family produces materially richer output than the current single-shot summary loop.
- Validation stays explicit and fail-closed.

Proof requirement:
- Focused tests prove the multi-step path and show stronger deliverable-quality behavior than the prior single-shot path.

Closed 2026-06-14:
- Phase D is complete for `wf_connect_first_workflow` only.
- The executor now runs one bounded `interpret -> draft -> validate -> return` loop for that family.
- Validation stays explicit and fail-closed before the shared harness commit seam sees the final native outcome.
- The durable worker/runtime contract still remains the same explicit `done` / `waiting` / `blocked` / `cancelled` truth.
- Public/dashboard/queue policy did not widen in this phase.

### Phase E: CEO Next-Lane Decisioning

Goal:
- Put the CEO back into the middle of lane progression instead of leaving sequencing as mostly automatic dispatch or human-only review.

Scope:
- After a child lane finishes, let the CEO evaluate whether to:
  - start the next lane,
  - request changes,
  - defer,
  - or move the board toward assembly.

Required outputs:
- Lane completion no longer implies only simplistic follow-through.
- CEO sequencing becomes a real orchestrator behavior, not just a setup-time decision.

Proof requirement:
- End-to-end tests prove a completed child lane can route through explicit CEO next-step decisioning before further progression.

Closed 2026-06-14:
- Phase E is complete.
- A child lane finishing `done` no longer auto-claims the next approved lane through worker/runtime follow-on dispatch.
- The harness now routes that moment through explicit CEO review with four bounded outcomes: `start_next_lane`, `request_changes`, `defer`, or `move_to_assembly`.
- The worker/runtime seam still emits durable `postOutcomeAction` and attention truth, but the actual reviewed redispatch happens only through the existing review-attention board mutation path.
- Reviewer follow-up hardening also closed two sharp edges before sign-off: generic title overlap no longer silently auto-reuses materially different work, and tenant-goal fresh-cycle requests now carry the explicit review action token so they fail closed if the board review contract changes mid-flight.
- Final-assembly review now also fails closed on next-lane-only decisions, so inputs like `defer` or `move_to_assembly` can no longer silently open a fresh cycle outside the valid `complete_run` / `start_fresh_cycle` contract.
- Focused proof now covers worker outcome commit, board review mutation, HTTP/runtime wiring, reviewed redispatch staging, and the explicit no-auto-follow-on guard.

### Phase F: Hermes UX Closure

Goal:
- Make the board surface truthfully simpler and validate it against the Hermes-style benchmark.

Scope:
- Inventory and remove/defer non-launch `memoryBoundary`-driven board sections.
- Simplify the board hierarchy around current focus, active lanes, next actions, governance posture, and progress.
- Compare before/after against Hermes reference screenshots.

Required outputs:
- The visual benchmark gate is actually closed.
- The board no longer spends major surface area explaining deferred export/memory semantics.

Proof requirement:
- Phase artifact includes screenshot/reference comparison and documents the kept vs deferred board sections.

Closed 2026-06-14:
- Phase F is complete.
- The board surface is now contracted around current focus, active lanes, next actions, governance posture, and progress.
- Deferred `memoryBoundary`, recent-decision, follow-through, and completion-package explainer sections no longer occupy the main board surface.
- Live/preview truth, contract-owned action handling, CEO approvals, and drawer-level bounded continuity detail remain intact.
- Focused UI proof, browser proof, typecheck, and web build all passed during closeout.

### Phase G: Harness-Specific Proof Closure

Goal:
- Close the remaining launch-confidence gaps on the real harness path.

Scope:
- prove tenant isolation under simultaneous harness activity
- prove harness-specific fairness/backpressure under load
- prove private metadata non-leakage across public seams
- prove mixed-version/cutover safety for public start, routing, and recovery
- execute the portable proof strategy decided earlier for Docker-backed integration checks

Required outputs:
- The remaining launch-proof gaps are narrowed to known acceptable residual risk.

Proof requirement:
- Fresh verification evidence exists for each required proof family, not only assumptions or local anecdotes.

Completed:
- private public-seam guards now explicitly reject both object-key and serialized-text leakage of runtime-only harness envelope fields such as `orchestratorHandoff`, `boardContext`, `postOutcomeDirectives`, and adjacent worker-only metadata on Wealth Factory responses
- installed-package overlay runtime routing now fails closed when a persisted run is missing its workflow-definition snapshot instead of drifting into a later unrelated harness failure
- durable public-identity cutover coverage now includes template-only legacy outbox rows and installed-package overlay stale-claim recovery
- harness-specific fairness/backpressure proof now shows a queued same-tenant run staying backpressured while a second tenant run is still admitted on the bounded harness path
- the Docker-backed real Postgres harness proof lane now covers concurrent `claimCardForExecution` isolation while another valid run claims independently
- fresh evidence was recorded by rerunning the focused Phase G suite and the full Docker-enabled `tests/harness-repository.test.ts` lane, followed by `tsc --noEmit`

### Phase H: Bounded `memoryBoundary` Collapse

Goal:
- Reduce the deferred metadata seam after the core product loop and proof work are back on track.

Scope:
- Collapse the `memoryBoundary` per-item shape to a small launch-safe summary.
- Remove or defer excess rendering and normalization tied to non-live future delivery behavior.
- Keep only the minimum fields needed for truthful current product posture.

Required outputs:
- Service/UI/test surface area is materially reduced.
- Deferred integration paperwork is no longer dominating the board contract.

Proof requirement:
- The board remains truthful and launch-safe after the collapse, with simpler code and no reopened boundary drift.

## Recommended Execution Order

1. Phase A: Freeze Deferred Growth
2. Phase B: Complete Remaining CEO Governance Rules
3. Phase C: First AI CEO Loop
4. Phase D: First Multi-Step Native Worker Lane
5. Phase E: CEO Next-Lane Decisioning
6. Phase F: Hermes UX Closure
7. Phase G: Harness-Specific Proof Closure
8. Phase H: Bounded `memoryBoundary` Collapse

## Notes For Later

- Phase H should expect a large blast radius because the `memoryBoundary` seam expanded across service, client, UI, and tests for many slices.
- If later timeline pressure requires it, Phases F and G may be reconsidered for partial parallelization because they touch largely independent seams, but the default plan remains sequential for discipline and lower coordination risk.

## TDD Rule

For every correction phase:

- write the failing test or failing proof first
- verify the failure is for the intended reason
- implement the minimum bounded change to pass
- rerun focused verification
- rerun wider verification before closeout

## Required Preflight For Every Correction Phase

Before starting each phase:

1. Confirm real sub-agent tools are actually available if the phase requires delegation.
2. Run:
   - `gitnexus status`
   - `gitnexus detect-changes --repo spyderbyte_paperclip_saas --scope all`
3. Record whether the blast radius stayed inside the intended seam.
4. Re-check the correction anchor before deciding the slice scope.

## Completion Standard

The correction track is only complete when:

- the tenant-facing AI CEO loop is real
- at least one worker family performs bounded multi-step native execution
- CEO next-lane decisioning is real
- the Hermes-style dashboard benchmark is actually closed
- the remaining launch-proof gaps are backed by fresh evidence
- the deferred metadata seam is frozen or collapsed enough that it no longer dominates the build

At that point, the build can be judged on real product readiness instead of on infrastructure promise alone.
