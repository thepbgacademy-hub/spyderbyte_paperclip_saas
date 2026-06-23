# Wealth Factory Post-Audit Realignment Plan

Date: 2026-06-22

Branch context: `codex/wf-harness-design`

Audit basis:

- `wf-harness/docs/2026-05-21-wf-harness-v1-design.md`
- `wf-harness/docs/paperclip-pressure-lessons-and-wealth-factory-guardrails.md`
- `wf-harness/docs/2026-06-14-audit-correction-anchor.md`
- `wf-harness/docs/plans/2026-05-21-wf-harness-v1-implementation-plan.md`
- `wf-harness/docs/plans/2026-06-05-wf-native-execution-replacement-plan.md`
- `wf-harness/docs/plans/2026-06-14-wf-audit-correction-plan.md`
- `wf-harness/TODO.md`
- `wf-harness/HANDOFF.md`
- Sonnet audit of committed codebase at `cc2fc8f`

## Purpose

This plan exists to bring the current Wealth Factory branch back into a launch-focused, design-aligned state after the audit identified proof accumulation, repo noise, UI/runtime overgrowth, and excessive surface area.

This is a correction plan, not a feature expansion plan.

It is intentionally ordered to:

1. reduce repo noise first
2. reduce brittleness second
3. narrow launch surface third
4. preserve already-proven core product behavior

## Non-Negotiable Realignment Rules

- Do not widen product scope while executing this plan.
- Do not add new workflow families, new package identities, or new board capabilities while correcting.
- Do not reopen social-media or unrelated framework branches.
- Do not promote Paperclip back into active product identity.
- Do not turn operator-only deployment plumbing into product logic.
- Do not keep proof infrastructure simply because it exists; every retained proof path must justify launch value.
- Every correction phase must begin with GitNexus preflight and end with a drift/alignment check against this plan, the design docs, `TODO.md`, and `HANDOFF.md`.

## Source-of-Truth Outcome We Are Targeting

When this plan is complete, the codebase should present a simpler, launch-bounded shape:

- Wealth Factory remains CEO-centered.
- Child-lane execution remains bounded and native-first.
- Board UI is smaller, clearer, and easier to reason about.
- Runtime orchestration is explicit and not concentrated in one oversized hotspot.
- Paperclip is clearly a bounded legacy seam or removed from active launch flow.
- Proof and deployment tooling are reduced to what is needed to launch and validate safely.
- Repo noise is low enough that GitNexus findings reflect real product risk rather than artifact accumulation.

## Correction Phases

### Phase R1: Repo Noise and Artifact Cleanup

Goal:
Remove committed or tracked noise that does not belong in a launch-ready product repo.

Targets:

- committed proof logs
- temporary JSON proof outputs
- build artifacts in version control
- scratch checklists that are not current plan-of-record docs
- duplicate or stale status docs

Expected work:

- identify committed proof/log/json artifact files and remove them from version control
- add or correct ignore rules where appropriate
- remove committed build outputs such as `apps/web/dist` and root `dist` if they are not intentional release artifacts
- classify `sudo_deploy.txt`; either move it into a proper runbook lane or remove it
- consolidate duplicate handoff/status materials so there is one authoritative handoff source

Acceptance bar:

- repo no longer contains committed proof/log scratch artifacts that are not product inputs
- repo no longer contains committed build outputs unless explicitly justified
- one authoritative handoff path is documented
- focused verification passes for any tests impacted by removals

### Phase R2: Proof and Tooling Surface Reduction

Goal:
Keep only the proof/deployment scripts that have ongoing launch or safety value.

Targets:

- overgrown `scripts/`
- obsolete phase-proof helpers
- proof utilities that no longer justify living in the main product repo

Expected work:

- inventory scripts by category: launch-required, operator-only, historical-proof, removable
- keep only scripts needed for:
  - live runtime readiness
  - isolated stage proof
  - native execution proof
  - essential demo seeding
  - required operator cutover guidance
- archive or remove historical-only proof runners that no longer change product confidence
- move non-product proof tooling out of `src/` and into `scripts/` where still justified

Acceptance bar:

- every remaining script has a current launch or operator purpose
- no proof-only module remains under `src/` without strong justification
- package scripts are understandable and bounded

### Phase R3: Launch Surface Pruning on Harness HTTP

Goal:
Reduce the HTTP harness surface to the routes and decision branches actually required for launch.

Targets:

- `src/api/harness-http.ts`
- downstream board-service entrypoints that exist only to support deferred or speculative launch behavior

Expected work:

- inventory each harness route and sub-decision path
- classify each as:
  - required for launch
  - acceptable temporary compatibility
  - defer/remove after launch
- prune optional or speculative branches that are not needed for the current board/CEO flow
- keep contract-owned mutation behavior intact

Acceptance bar:

- harness HTTP surface is smaller and easier to reason about
- deferred export and replay permutations are either explicitly justified or removed from launch path
- tests reflect the smaller launch surface

### Phase R4: Board UI Decomposition and Simplification

Goal:
Reduce frontend brittleness and bring the board experience back toward the intended Hermes-style bounded interface.

Targets:

- `apps/web/src/pages/HarnessBoardPage.tsx`
- any supporting board components that should absorb clearly separable responsibilities

Expected work:

- identify major responsibility clusters inside the page:
  - board shell
  - pending approvals
  - pending attention
  - live action composer
  - export surfaces
  - recovery/status messaging
- split pure view concerns into focused components or helpers
- remove or defer UI behavior that exceeds launch needs
- keep contract-owned action behavior intact while making the page materially smaller

Acceptance bar:

- `HarnessBoardPage.tsx` is substantially smaller
- launch-critical board behavior is unchanged
- page responsibilities are easier to test and reason about
- board remains aligned to the bounded CEO-centered UX

### Phase R5: Runtime Hotspot Reduction

Goal:
Reduce orchestration concentration and brittleness in the worker runtime.

Targets:

- `src/worker/runtime.ts`

Expected work:

- inventory responsibilities currently concentrated in runtime
- split distinct concerns into private modules where behavior is already understood and proven
- preserve:
  - dispatch
  - claim
  - outcome commit
  - bounded native execution handoff
- defer or remove non-essential compatibility shaping where possible

Acceptance bar:

- `runtime.ts` is materially smaller
- no launch behavior regression
- runtime responsibilities are more explicit and bounded
- worker path remains native-first and fail-closed

### Phase R6: Paperclip Seam Freeze

Goal:
Make Paperclip’s role explicit and limited so the launch product does not read as dual-engine by accident.

Targets:

- `src/paperclip/`
- any runtime paths where Paperclip still appears active rather than legacy-bounded

Expected work:

- identify exactly where Paperclip still participates
- classify each usage as:
  - still required temporary seam
  - launch-incompatible drift
  - removable
- clearly mark any retained Paperclip seam as bounded legacy compatibility
- remove active investment in Paperclip paths that are no longer required for launch

Acceptance bar:

- Paperclip is either clearly frozen as a bounded seam or further reduced
- launch documentation no longer implies dual-engine ambiguity
- tests and docs reflect the real role of the seam

## Execution Order

Recommended order:

1. Phase R1
2. Phase R2
3. Phase R3
4. Phase R4
5. Phase R5
6. Phase R6

Reason:

- R1 and R2 reduce repo noise and sharpen future audit signals.
- R3 and R4 reduce launch-surface brittleness fastest.
- R5 and R6 are deeper structural corrections that should happen after noise and public-surface simplification.

## Phase Discipline

For every correction phase:

### Before work

- run `gitnexus status`
- run `gitnexus detect-changes --repo spyderbyte_paperclip_saas --scope all`
- record the seam/blast-radius headline
- define one bounded acceptance bar

### During work

- do not expand beyond the phase target
- do not “while we’re here” adjacent features
- prefer removals and simplification over additional abstraction unless required

### After work

- run focused local tests
- run build if the seam touches shipped code
- run isolated live validation if the seam safely affects stage/runtime/deploy behavior
- update `TODO.md` and `HANDOFF.md`
- perform a drift/alignment check against this plan and the design docs

## Success Criteria for Realignment

This correction track is complete when:

- repo noise no longer dominates audit signal
- the public board/runtime/deploy seams are smaller and clearer
- the branch no longer looks like proof accumulation is outpacing product convergence
- GitNexus criticality is better explained by real product seams, not artifact clutter
- the codebase reads like a launch-focused Wealth Factory product rather than an exploratory proof harness

## Immediate Next Recommended Move

Begin with Phase R1: Repo Noise and Artifact Cleanup.

That phase gives the fastest reduction in confusion, improves audit clarity, and lowers the chance of further accidental drift while subsequent correction phases are executed.
