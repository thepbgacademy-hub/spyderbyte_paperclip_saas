# Wealth Factory Audit Correction Anchor

Date: `2026-06-14`
Branch: `codex/wf-harness-design`
Purpose: lock the June 14 audit direction into one source we can reference during correction work so future slices do not drift back into deferred metadata expansion.

## Why This Exists

The June 14 audit concluded that the build has real structural wins, but that the center of gravity drifted away from launch-critical capability and into deferred metadata expansion.

This file records the specific correction direction we should keep checking before and after each corrective slice.

## Structural Wins To Preserve

- Keep BYOK fully owned by Wealth Factory.
- Keep the queue, outbox, worker, and claim seams durable and fail-closed.
- Keep the three current core workflow families native-default only where explicitly approved.
- Keep installed-package overlays separate from core platform truth.
- Keep public dashboard visibility and public-start eligibility explicit and fail-closed.
- Keep closed-board snapshot immutability and tenant-safe export boundaries.

## Audit Correction Direction

- Freeze the `memoryBoundary` seam.
- Defer further Obsidian/export metadata expansion until one real live delivery path is actually active and worth proving.
- Stop treating deferred export metadata as launch progress.
- Pivot back to the missing product center: the CEO AI orchestration loop.
- Deepen worker execution toward real bounded multi-step deliverable work instead of more single-shot child-lane hardening alone.
- Keep every correction slice tied to launch-proof value, not code volume.

## Immediate Correction Priorities

1. Build the missing CEO AI conversational/orchestration loop that interprets tenant intent and sequences bounded child work.
2. Deepen native worker execution beyond a single-shot `state + summary` response contract.
3. Freeze or collapse non-launch `memoryBoundary` metadata instead of widening it further.
4. Reduce service/UI surface area that exists mainly to describe deferred export behavior.
5. Close the Hermes-style visual validation gap with actual benchmark comparison before treating the dashboard as launch-ready.

## `memoryBoundary` Course-Correction Rule

The audit's second critical finding should remain explicit during cleanup:

- Treat the current `memoryBoundary` contract as overgrown relative to launch need.
- Do not add new `memoryBoundary` fields, labels, grouped summaries, or UI render branches.
- Do not treat deferred Obsidian/export metadata expansion as launch progress.
- Keep the existing seam stable only long enough to avoid churn while higher-priority corrections land.

### What To Freeze Now

- New `memoryBoundary` item fields in `board-service.ts`
- New client normalization branches in `apps/web/src/harness-board-client.ts`
- New board rendering tied to deferred export/memory metadata
- New tests whose only value is proving additional deferred export labels or metadata permutations

### What To Collapse Later

When we take the bounded cleanup slice, reduce `memoryBoundary` to a small launch-safe summary shape, aiming for fields such as:

- destination
- readiness
- eligibility
- export candidate id(s)
- action path(s)
- blocker label

Everything beyond that should be treated as deferred until live Obsidian/export delivery is an active product need.

### What To Leave Alone For Now

- Existing queue/worker/claim durability
- Existing closed-board snapshot/export immutability seams
- Existing fail-closed overlay/core/public-start boundaries
- Existing persisted continuity and governance seams that directly support runtime truth

Working rule:

- freeze first
- redirect effort to CEO orchestration and real worker execution
- collapse the metadata seam only when that cleanup can be done as a bounded correction instead of a fresh distraction

### Phase A Lock Record

Recorded on `2026-06-14`:

- Freeze the current `memoryBoundary` shape, thin-event copy/permutation surface, and neutral overlay-example naming standard until a later explicit reopen.
- Treat the deferred-FK integration proof as canonically Docker-backed.
- Require a Docker-capable CI lane for portable shared evidence.
- Let Dockerless local machines rely on focused non-Docker fallback verification plus CI evidence instead of inventing a second local integration harness.

## Traceability Course-Correction Table

Use this table as the practical reference when choosing what to preserve, pause, build, and prove during correction work.

| Bucket | Area | Current Read | Correction Direction |
|---|---|---|---|
| `keep` | BYOK boundary | Clearly aligned | Preserve Wealth Factory-owned secret resolution and do not widen secret handling into the harness. |
| `keep` | Queue / outbox / worker / claim seams | Clearly aligned | Preserve the durable compare-and-set execution path and avoid destabilizing these core safety rails during correction. |
| `keep` | Persisted run/card state | Clearly aligned | Keep the persisted orchestration state machine and restart-safe recovery behavior intact. |
| `keep` | Overlay/core/public-start fail-closed boundaries | Clearly aligned | Preserve the explicit gating between overlay registration, board exposure, native execution, and public start. |
| `keep` | Closed-board snapshot immutability | Clearly aligned | Keep the frozen governance/package snapshot behavior and do not reopen mutable post-closure drift. |
| `freeze` | `memoryBoundary` contract | Overbuilt / deferred | Freeze at current shape immediately; no new fields, labels, summaries, or render branches. |
| `freeze` | Deferred Obsidian/export metadata expansion | Overbuilt / deferred | Stop treating future export metadata growth as launch progress until a real live delivery seam exists. |
| `freeze` | UI rendering of deferred export/memory detail | Overbuilt / partial | Avoid adding more board/client complexity for non-live integrations. |
| `build next` | CEO AI conversational/orchestration loop | Missing | Build the actual tenant-facing AI CEO loop that interprets intent, sequences bounded work, and owns orchestration. |
| `build next` | Multi-step native worker execution | Partial | Deepen child-lane execution beyond one prompt/one parse into a bounded multi-step deliverable loop. |
| `build next` | Worker-side orchestrator/child execution depth | Missing / partial | Move beyond single-lane dispatch plumbing into real orchestrated execution behavior that produces useful business outcomes. |
| `prove before launch` | Harness-specific fairness under load | Under-proven | Prove lane fairness and backpressure on the real harness path, not only the generic queue path. |
| `prove before launch` | Hermes-style dashboard benchmark | Partial | Close the visual validation gate with actual reference comparison instead of assuming the current board surface is good enough. |
| `prove before launch` | Private metadata non-leakage | Under-proven | Prove `orchestratorHandoff`, `postOutcomeDirectives`, and `boardContext` stay private and never leak into public seams. |
| `prove before launch` | Mixed-version / migration cutover behavior | Under-proven | Prove older rows and recovery paths do not break public start, runtime routing, or worker recovery at cutover. |
| `prove before launch` | Export delivery on real live targets | Under-proven | Keep immutability proofs, but do not claim full delivery readiness until one real live tenant-safe delivery path is proven end to end. |

## Decision Shortcut

When a new slice is proposed, classify it first:

- If it protects an already-aligned safety rail, it may be a `keep`.
- If it expands deferred metadata or future integration paperwork, it belongs in `freeze`.
- If it restores the missing product center, it belongs in `build next`.
- If it closes a launch-confidence gap, it belongs in `prove before launch`.

If a proposed slice does not fit one of those categories cleanly, treat it as suspect until it is justified against the source-of-truth docs.

## Bounded CEO Loop Implementation Shape

The audit's first critical finding is that the AI CEO loop is missing. This section defines the smallest correct shape for that loop so correction work does not drift into a broad agent platform.

### Minimum Required Capabilities

The first bounded CEO loop should:

1. accept tenant goal input through a CEO-facing surface,
2. interpret that goal against package/core boundary rules,
3. decide one of a small set of orchestration actions:
   - reuse/update an existing lane,
   - open a new bounded lane,
   - defer,
   - deny,
   - start a fresh cycle when the request materially changes direction,
4. produce tenant-facing CEO language instead of child-persona chatter,
5. persist the decision and any resulting lane/governance mutation through existing durable seams,
6. dispatch only bounded child work through the already-hardened worker/runtime path.

### What The First CEO Loop Must Not Become

- not a free-form multi-agent chat room
- not direct child-to-child coordination
- not unrestricted card creation
- not a second UI-defined orchestration engine
- not a broad workflow builder
- not a bypass around approval, overlay, native, or public-start boundaries

### Preferred First Slice

The first useful CEO loop should be narrow:

- one tenant message in
- one CEO interpretation pass
- one bounded orchestration decision
- durable state update
- optional child-lane dispatch
- one CEO-facing response out

That is enough to prove the missing product center without trying to solve every later orchestration behavior at once.

### Required Proof Before Closing This Gap

- prove the tenant can submit a goal and receive a CEO-authored response
- prove the CEO can choose between lane reuse, new lane creation, defer, deny, and fresh-cycle in bounded cases
- prove the resulting decision persists through existing harness state/governance seams
- prove child-lane dispatch still flows through the existing fail-closed worker/runtime path
- prove child personas remain non-tenant-facing
- prove package/core/native/public-start boundaries still hold under CEO-driven orchestration

### Working Rule

Do not call the CEO loop complete just because a CEO prompt exists.

The gap is only closed when:

- the tenant-facing CEO AI path is real,
- the orchestration decision is durable,
- the child work remains bounded,
- and the loop uses the existing platform safety rails instead of bypassing them.

## Native Worker Execution Correction Rule

The audit's `H-1` finding says native worker execution is still too shallow.

### Current Problem

- one prompt in
- one short structured response out
- no bounded internal iteration
- no validation gate inside the lane
- no proof that the output quality is strong enough for real tenant deliverables

### Correction Direction

- deepen native execution into a bounded multi-step loop
- keep it narrow and workflow-family-specific
- prefer shapes like:
  - interpret
  - draft/reason
  - validate
  - return outcome

### What Not To Do

- do not widen into an unconstrained agent swarm
- do not add child-to-child coordination
- do not hide retries or scope expansion inside the lane
- do not replace explicit lane outcomes with vague generated prose

### Proof Required

- at least one workflow family must prove a real 2-3 step execution path
- the result quality must be materially stronger than the current single-shot summary loop
- the bounded `done/waiting/blocked/cancelled` contract must remain explicit and fail-closed

## Dashboard UX Correction Rule

The audit's `H-2` finding says the current board surface is too large and too entangled with deferred metadata to be treated as a validated Hermes-style dashboard.

### Current Problem

- the board page is too large to assume it still preserves a calm, obvious hierarchy
- too much rendering is tied to deferred `memoryBoundary` detail
- the visual benchmark gate is still open
- no screenshot-based comparison has closed the design requirement

### Correction Direction

- stop expanding deferred memory/export UI
- close the Hermes-style benchmark with actual reference comparison
- simplify the board toward the launch-critical cockpit shape
- remove or defer rendering that exists mainly to explain non-live future integrations

### What To Preserve

- truthful live/preview distinction
- fail-closed action surfaces
- contract-owned recovery and error handling
- tenant-safe board status and governance posture

### Proof Required

- screenshot/reference validation against the Hermes-style benchmark
- a reduced board surface with clearer hierarchy
- evidence that deferred `memoryBoundary` rendering is no longer dominating the page

### Concrete H-2 Correction Checklist

- Inventory every `memoryBoundary`-driven board section and classify it as:
  - launch-critical,
  - defer until live Obsidian/export delivery,
  - remove entirely.
- Remove or hide deferred export/memory sections from the main board surface before adding new dashboard features.
- Reduce `HarnessBoardPage.tsx` responsibility by pushing non-launch presentation branches out of the primary page flow.
- Re-check that the remaining board surface emphasizes:
  - current focus,
  - active lanes,
  - bounded next actions,
  - governance posture,
  - high-level progress.
- Capture before/after screenshots against the Hermes-style benchmark and record the comparison in phase closeout.
- Do not close the dashboard correction slice until the page is simpler both in code responsibility and in visible operator hierarchy.

## Overlay Naming Correction Rule

The audit's `H-3` finding says some overlay/package naming still reads like real built-in product identity instead of a neutral example/reference implementation.

### Correction Direction

- keep the overlay mechanism
- keep the explicit opt-in and fail-closed boundary behavior
- rename example package/workflow identifiers so they do not read like a baked-in Wealth Factory business branch

### Naming Standard

Preferred example naming should read like:

- `pkg-example-*`
- `wf-example-*`
- `Example Audit Workflow`
- `Reference Package`

Avoid names that imply an actual released vertical, agency model, or built-in framework identity unless the design docs are explicitly revised first.

### Working Rule

- neutral example naming is not cosmetic
- it is part of keeping the core platform framework-agnostic
- if a package/example name pulls roadmap or UI assumptions toward a specific business model, treat it as drift and correct it

## Test Investment Correction Rule

The audit's `H-4` finding says the runtime/worker test surface may now be over-weighted toward thin-event fallback permutations and copy-detail exhaustiveness instead of the next missing launch-critical proofs.

### What To Preserve

- claim atomicity proofs
- shutdown and close-path correctness
- stale callback / stale claim isolation
- durable outcome commit correctness
- worker/runtime fail-closed safety behavior

### What To Freeze

- new thin-event fallback copy permutations
- new board-history wording variants whose only value is proving another phrasing branch
- new low-yield event-shape permutations that do not materially change launch safety or tenant truth

### Redirect Future Test Effort Toward

- CEO AI orchestration loop behavior
- multi-step native worker execution
- harness-specific fairness/backpressure under load
- private metadata non-leakage proofs
- public/private seam truthfulness
- launch-path E2E evidence

### Working Rule

- keep the hard safety proofs
- stop expanding low-yield wording/permutation proof surfaces
- make the next wave of TDD investment follow the missing product center and launch-proof gaps

## Worker Orchestration Depth Correction Rule

The audit's `M-1` finding says the worker-side harness still behaves mainly as a single-lane dispatch path rather than a deeper orchestrated execution system.

### Correction Direction

- treat single-lane dispatch as a foundation, not the finished runtime model
- deepen worker behavior only through explicit CEO-driven orchestration decisions
- keep progression durable, bounded, and auditable

### What To Build

- durable next-step / next-lane progression that follows CEO decisions
- bounded sequencing behavior between lanes
- explicit worker handling for richer orchestrated progress without reopening swarm-style ambiguity

### What Not To Build

- implicit free-form lane chaining
- hidden multi-lane autonomy
- background orchestration that bypasses governance or public/runtime truth

### Working Rule

- the worker should become a stronger executor of explicit orchestration truth
- it should not become an assumption-heavy scheduler

## Deferred Delivery Correction Rule

The audit's `M-2` finding says Obsidian/export writer seams exist, but there is still no active live delivery path that justifies further expansion around them.

### Correction Direction

- keep the current writers stable
- do not deepen surrounding product or metadata work just because writer stubs exist
- reopen this seam only when a real live delivery phase is intentionally scheduled

### Working Rule

- writer existence is not launch readiness
- deferred delivery infrastructure must not keep pulling core build effort away from CEO orchestration, worker execution depth, or launch-proof validation

## Proof Portability Correction Rule

The audit's `M-3` finding says some meaningful integration proof still depends too heavily on environments that are not guaranteed everywhere.

### Correction Direction

- identify which integration proofs are truly launch-critical
- decide which of those must be portable across development and validation environments
- add either CI support or an explicit alternate proof path where Docker-backed proof is not available

### Working Rule

- local-only success is useful but not enough to count as strong launch evidence
- launch-proof confidence should be reproducible, not personality-driven or machine-specific
- for the deferred-FK contract specifically, reproducible evidence now means Docker-backed proof in CI plus focused local fallback verification where Docker is unavailable

## CEO Governance Completion Rule

The audit's `M-4` finding says CEO dynamic card-creation and approval rules are still not fully closed.

### Correction Direction

- complete the remaining CEO governance rules that the future AI CEO loop will depend on
- keep card creation bounded, disciplined, and explicit
- make sure reuse, open-new, defer, deny, and fresh-cycle paths are fully coherent before treating orchestration as finished

### Working Rule

- do not build the AI CEO loop on top of partially defined governance semantics
- close the remaining CEO policy gaps as part of the orchestration correction track, not as an unrelated cleanup later

## Low-Value Code Signal Rules

The audit's low-value section identifies where code growth stopped producing proportional launch value. Use these rules to prevent repeating that pattern.

### 1. `memoryBoundary` Metadata Cascade

- treat the current `memoryBoundary` growth as the clearest example of low-value code accumulation
- no new per-field metadata or `*Label` expansions
- no new grouped export summaries unless a live delivery phase explicitly requires them
- future work should collapse this seam, not elaborate it

### 2. Board Activity Copy Variant Expansion

- copy regressions are useful, but they are now saturated
- do not spend new test effort proving more thin-event wording combinations unless a new user-visible product behavior truly depends on them
- prioritize product capability proof over presentation-permutation exhaustiveness

### 3. Cleanup Without Execution Depth

- refactors and extractions are only justified if they materially unlock or simplify the next missing capability
- do not run multiple consecutive cleanup phases on shallow execution paths without also deepening the underlying execution model
- if a cleanup does not move CEO orchestration, worker execution depth, tenant safety, or launch proof forward, treat it as suspect

### Working Rule

- preserve the useful safety rails already built
- stop feeding surfaces that mostly generate metadata, labels, or permutations
- favor bounded capability gains over beautifully organized incompleteness

## Working Rules For Corrections

- No code counts as progress unless it clearly advances a source-of-truth design requirement, an active plan requirement, or a launch-proof requirement.
- Deferred integrations must not keep growing metadata contracts ahead of live product need.
- If a seam is not helping CEO orchestration, bounded child execution, multi-tenant truthfulness, recovery, or launch safety, treat it as a candidate for freeze, collapse, or deferral.
- Before closing a correction slice, compare the result against:
  - `wf-harness/docs/2026-05-21-wf-harness-v1-design.md`
  - `wf-harness/docs/paperclip-pressure-lessons-and-wealth-factory-guardrails.md`
  - `wf-harness/docs/plans/2026-06-05-wf-native-execution-replacement-plan.md`
  - `wf-harness/TODO.md`
  - `wf-harness/HANDOFF.md`
  - this correction anchor

## What We Should Be Skeptical Of

- New metadata fields that only describe deferred export or memory behavior.
- Large read-model growth that does not unlock a launch-proof requirement.
- UI rendering for non-live future integrations.
- Refactors or abstractions that increase code volume without increasing proven tenant-safe capability.
- Any branch that looks like package/demo/product-identity drift.

## Decision Standard

When a correction choice is unclear, prefer the option that:

1. restores the missing CEO-centered product loop,
2. keeps multi-tenant truth explicit and durable,
3. reduces deferred complexity,
4. and produces the strongest launch-proof evidence with the least scope growth.
