# Wealth Factory Harness TODO

This file tracks the new harness subproject only.

## Current Phase

- [x] Approve first harness direction.
- [x] Write v1 design spec.
- [x] Review and refine the v1 design spec.
- [x] Consolidate the Paperclip pressure lessons and Wealth Factory guardrails into one dedicated reference doc.
- [x] Write the implementation plan for the first harness slice.
- [x] Choose execution mode for implementing the first harness slice.
- [x] Implement the first harness slice with subagent-driven execution.
- [x] Verify the first harness slice with full lint/build/test/E2E fail-then-pass.

## V1 Build Targets

- [x] Define persisted run-state model for CEO orchestration.
- [x] Define persisted hybrid-card model for child personas.
- [ ] Define CEO approval rules for dynamic card creation beyond the seeded bootstrap defaults.
  - [x] Persist sub-card proposals as first-class harness state.
  - [x] Add a guarded CEO approval mutation path for persisted proposals.
- [x] Define resume-from-crash behavior and checkpoint policy.
- [x] Define Wealth Factory to harness runtime contract for resolved BYOK context.
- [x] Define Hermes-style dashboard information architecture for Wealth Factory.
- [x] Define board columns, drawer behavior, and tenant-visible status language.
- [x] Define migration slice boundary from the current Paperclip-backed runtime.
- [x] Wire the board route to persisted tenant-scoped harness state instead of static fixtures.
- [x] Consume harness-enabled workflow ids in a live runtime path.
- [x] Replace the fixed seeded CFO/COO board defaults with a narrow persisted CEO-driven child-card creation seam.

## Guardrails

- [x] Keep BYOK fully owned by Wealth Factory.
- [x] Keep tenant interaction CEO-only.
- [x] Keep child personas bounded and non-conversational to the tenant.
- [x] Keep dashboard noise-free and high-level.
- [x] Keep test findings from the Paperclip build as design constraints, not historical trivia.
- [x] Keep Archon as a process-orchestration reference only, not a target runtime architecture.

## Progress Since Bootstrap

- [x] Add true database-backed transaction coverage for the deferred proposal-approval seam so approval-before-card-insert ordering is proven against the real persistence layer.
- [ ] Decide whether Docker-backed harness integration proofs need a CI lane or alternate local fallback so the deferred-FK contract is exercised outside Docker-capable machines too.
- [x] Add transaction-client coverage proving the approval update and child-card insert share one leased transaction client and roll back together on failure.
- [x] Expand beyond CEO direct-child creation into richer persisted card progression and result-recording mutation paths.
- [ ] Add fuller CEO approval logic for sub-card requests and card-count discipline beyond the current duplicate-lane/open-cap guardrails.
  - [x] Make repeated unresolved requests reuse the latest earlier unresolved governance hold instead of opening fresh duplicate lanes when no active-lane reuse or valid handoff applies.
  - [x] Preserve direct CEO lane-cap requests as deferred governance instead of dropping them as hard conflicts when the board is already full.
- [x] Persist structured absorbed-work state when the CEO folds a proposal into an existing lane, so lane reuse becomes real engine state instead of comment-only history.
- [x] Add first-class board decision memory so approvals, deferrals, denials, lane opens, and CEO completion become durable harness records instead of inferred chatter.
- [x] Widen board decision memory with bounded policy reasons and recommendation/objection summaries instead of introducing a second generic notes store.
- [x] Derive tenant-safe board follow-through history from the decision ledger so implemented governance actions are visible without replaying raw notes or card chatter.
- [x] Promote absorbed-work and latest-outcome continuity from replayed card events into a policy-bounded first-class harness continuity snapshot per lane.
  - [x] Keep continuity merge semantics aligned across in-memory and Postgres repos so the latest six absorbed-work items stay ordered and handoff-aware instead of becoming an unbounded or ambiguously ordered history list.
  - [x] Promote `continuitySummary` from optional board copy into the actual bounded per-lane resume directive that runtime resume can hydrate and progression mutations can refresh intentionally.
  - [x] Route harness-enabled worker jobs through a bounded lane-dispatch seam that actually consumes persisted continuity resume focus instead of leaving it as board-only memory.
  - [x] Keep the worker-side lane-dispatch seam approval-aware and fail-closed so `planning` lanes, terminal runs, and no-actionable-lane cases stay quiet instead of looking like queued execution.
- [x] Add harness-specific audit publishing beyond the persisted card-event trail.
- [ ] Expand the dashboard visual system once the additional Hermes/Obsidian reference screenshots are reviewed.
- [ ] Design the Obsidian long-memory integration so board records, decisions, and company history can live in tenant-owned knowledge space without becoming live runtime state.
- [ ] Add an explicit unsafe-artifact-id guard before any future disk-backed artifact retrieval or local blob-staging seam is introduced.
  - [x] Confirm the current artifact seam is still in-memory and tenant-scoped, so `artifactId` does not yet resolve into filesystem paths or direct disk reads.
  - [ ] Require future artifact retrieval to validate artifact ids against a strict allowlist format, reject separators and traversal encodings, and verify the resolved path stays under the intended artifact root before touching disk.
- [ ] Keep live board failure handling contract-driven as the board becomes more interactive.
  - [x] Preserve bounded harness HTTP failure codes in the browser client instead of flattening them into one generic board error.
  - [x] Extend the live page to surface action-family-aware recovery guidance for proposal review, CEO review, lane resume/unblock, and throttled live-board loads instead of flattening everything into one generic failure string.
  - [x] Resync the live board automatically after stale/conflict contract failures and expose explicit bounded reload controls instead of leaving board recovery as a purely manual mental step.
  - [x] Keep retryable live-action recovery contract-owned too, with safe replay and composer-reset paths driven by bounded failure classes instead of manual operator memory.
  - [x] Bound live board requests with an explicit timeout class so browser-side hangs fail into the same recovery seam instead of waiting indefinitely under pressure.

## Current Next Slice

- [x] Reconcile persisted run-state progression with the new child-card advancement seam so run-level status is no longer effectively bootstrap-only.
- [x] Add a parsed request-body contract for harness mutations before tenant-authored outcome summaries are accepted over HTTP.
- [x] Add richer CEO approval policy beyond exact-match idempotency and the current open-card cap.
- [x] Widen run-level progression from the current derived `assembling` ceiling into explicit final assembly/completion logic.
- [x] Add deny/defer semantics and stronger "update existing lane vs create new lane" CEO policy beyond the current duplicate-lane guards.
- [x] Preserve direct CEO owner-conflict and completed-cycle requests as deferred governance instead of hard conflicts, so bounded follow-on intent survives through the same proposal seam the board already uses for lane-cap pressure.
- [x] Add an initial read-only packaging/result handoff seam on top of the explicit CEO completion command.
- [x] Keep deferred proposals visible and re-approvable so CEO decisions can genuinely pause work instead of silently dropping it.
- [x] Make the owner-conflict "clear or hand off that lane" promise real with a bounded CEO handoff path instead of leaving it as board text only.
- [x] Deepen CEO decision policy so repeated sub-card requests prefer lane updates, then defer, then deny in a more explicit workflow-aware order.
- [x] Surface absorbed follow-on work back through bounded board activity/detail views when a proposal is folded into an existing lane.
- [x] Keep raw CEO decision notes out of the tenant-facing activity feed while preserving bounded public governance status.
- [x] Make repeated defer decisions idempotent when no new note or policy context is introduced.
- [ ] Decide which board-memory records should stay purely operational in Wealth Factory versus which ones should later export into tenant-owned Obsidian as long-memory business records.
- [ ] Decide whether the widened derived `completionPackage` should stay a read model or graduate into a persisted packaged-output artifact in a later slice.
- [x] Keep `resolve-attention` and later action-family branches covered wherever the board contract is consumed, so `review-attention` does not become the only richly rendered control path.
- [x] Add explicit packaging policy for how recommendations, objections, and deferred governance items should shape the tenant-facing final handoff.
- [ ] Decide whether denied governance items should remain derived read-model packaging only or become exportable board-memory artifacts later.
- [x] Decide whether completed-lane runs should reject or boundedly reopen new follow-on proposals instead of falling back to generic lane-creation rules.
- [x] Decide whether a future explicit "start a fresh board cycle" command should reopen follow-on work from `completed_lanes_only` deferrals instead of keeping that recovery path manual.
- [x] Deepen the fresh-cycle policy so the CEO can choose between reopening only deferred follow-on work versus starting a completely clean board cycle when no follow-through should carry forward.
- [ ] Define the split between small harness continuity memory and larger tenant-owned long memory in Obsidian, including what gets written there and what must remain Wealth Factory runtime truth.
  - [x] Keep live lane continuity inside Wealth Factory as bounded operational snapshot state instead of reconstructing it only from card-event replay.
  - [x] Add a bounded continuity-source discriminator so runtime memory stays self-describing before any later Obsidian export seam exists.
  - [ ] Decide whether the current continuity trio (`continuitySummary`, `latestResultSummary`, `absorbedWorkItems`) is the final bounded runtime-memory shape before any Obsidian export seam is added.
  - [x] Keep the refinement policy explicit in implementation: bounded changes to the same deliverable should stay in-lane, while broader directional changes should open a new lane or fresh cycle without losing institutional memory.
- [ ] Deepen the worker-side harness execution seam beyond the current single-lane dispatch payload and into real orchestrator/child execution behavior without reopening the old Paperclip-style hotspot model.
  - [x] Require a durable worker claim/start boundary so harness-enabled jobs now move exactly one `approved` lane to `working` before dispatch and stay quiet when the claim race is lost.
  - [x] Keep raw `queued` child lanes fail-closed in the worker slice so execution still respects the CEO approval boundary until a later bounded promotion path exists.
  - [x] Persist worker-start truth with the claim so the bounded start seam also records `state_changed`, refreshes active-lane continuity, and reconciles run state instead of leaving those facts behind in board-only logic.
  - [x] Add a worker-private lane outcome commit seam so a claimed `working` lane can write its bounded result back into durable harness state without going through the public board API.
  - [x] Let the worker-private seam advance beyond bounded lane outcomes into orchestrator-aware multi-step execution without reopening swarm-style ambiguity or bypassing CEO governance.
  - [x] Add a private claimed-lane execution envelope carrying required capabilities and sanitized runtime context while keeping public dispatch telemetry metadata-only.
  - [x] Return an explicit `postOutcomeAction` contract from worker lane outcomes so the engine can distinguish `dispatch_next_lane`, `queue_ceo_review`, `await_lane_resume`, and `await_unblock` without re-deriving follow-through from `nextDispatch` alone.
  - [x] Consume the new `postOutcomeAction` seam in the orchestrator/runtime handoff so review, wait, and unblock paths are driven by explicit worker outcome truth.
  - [x] Keep `dispatch_next_lane` on the existing lane-ready event/hook path while non-dispatch worker outcomes emit the dedicated `wealth_factory_harness_post_outcome_action` event plus bounded `onHarnessPostOutcomeAction` hook input.
  - [x] Decide which runtime-side handlers should consume `queue_ceo_review`, `await_lane_resume`, and `await_unblock` beyond the current bounded event/hook seam.
  - [x] Add explicit runtime-side handlers for CEO review, lane resume, and unblock so non-dispatch worker outcomes do not collapse back into one generic branch.
  - [x] Keep generic and specific post-outcome hooks failure-isolated so one rejected runtime consumer cannot suppress the rest of the durable handoff path.
  - [x] Emit dedicated bounded worker events for CEO review, lane resume, and lane unblock so future consumers do not have to recover those paths by parsing a generic post-outcome event.
  - [x] Share post-outcome action classification between the worker seam and the board-facing read model so CEO-facing follow-through does not drift onto a second set of heuristics.
  - [x] Persist a bounded `attention_requested` event when a worker outcome leaves the board waiting on CEO review, lane resume, or unblock.
  - [x] Surface a bounded `pendingAttention` board view so the CEO side can see the next required orchestration step without inferring it from raw lane state.
  - [x] Keep repeated unresolved attention idempotent so the worker seam does not append duplicate `attention_requested` noise for the same active post-outcome need.
  - [x] Persist a bounded `attention_resolved` event when a previously requested CEO review / resume / unblock state is cleared by later durable lane progress.
  - [x] Keep the board attention read model current by clearing stale `pendingAttention` after durable resolution while preserving bounded historical activity for the resolved attention path.
  - [x] Return explicit attention-transition metadata from worker lane outcomes so runtime consumers can distinguish newly requested, resolved, unchanged, and absent attention without diffing event history.
- [x] Suppress duplicate runtime post-outcome events and hooks when the same unresolved attention need remains active after a later durable lane outcome.
- [x] Emit a dedicated bounded runtime `attention_resolved` handoff/event when later durable lane progress clears an earlier CEO-review / resume / unblock need.
- [x] Persist bounded attention snapshot metadata with `attention_requested` / `attention_resolved` events so the board can reuse durable labels and target metadata later.
- [x] Prefer persisted attention snapshots in `pendingAttention` and attention history reads instead of rebuilding those labels purely from mutable lane state.
- [x] Add an explicit CEO review-action seam so `queue_ceo_review` attention can resolve through a bounded `complete_run` or `start_fresh_cycle` command instead of leaving completion behavior implicit in downstream callers.
- [x] Add explicit board-side attention-resolution commands so `await_lane_resume` and `await_unblock` can resolve through bounded mutations instead of generic card editing or implicit state nudges.
- [x] Surface bounded pending-attention action metadata so the board can tell the dashboard which explicit command family (`review-attention` vs `resolve-attention`) applies without inferring it from labels.
- [x] Re-enter the existing worker queue seam after explicit board-side `resume_lane` / `unblock_lane` resolution so resolved attention restores live execution truth instead of becoming a silent side path.
- [x] Re-enter the existing worker queue seam after `start_fresh_cycle` so durable fresh-cycle runs restore live execution truth instead of becoming packaged-but-idle board state.
- [x] Keep explicit CEO review resolution history durable so `complete_run` and `start_fresh_cycle` clear `queue_ceo_review` through a bounded `attention_resolved` event instead of only changing the resulting run state.
- [x] Keep governance-only CEO attention visible without advertising impossible explicit review commands when the run is not actually in the final-assembly review seam.
- [x] Route governance-only CEO attention toward the bounded pending-approvals queue so active/blocked backlog states point at the real proposal review surface instead of leaving the UI to guess the next move.
- [x] Expose bounded proposal-decision action metadata on each `pendingApprovals` row so the board can act on individual approvals without inferring command families from labels or surrounding attention routes.
- [x] Reuse unresolved same-run top-level direct CEO follow-on proposals when the same bounded assignment later clears, while keeping fresh-cycle carried-forward proposals in explicit CEO review until they are approved through the bounded governance seam.
- [x] Expose bounded action paths alongside board command metadata so proposal rows and actionable attention states stop relying on client-side route reconstruction.
- [x] Expose bounded action methods plus minimal request-field metadata alongside board command metadata so proposal rows and actionable attention states stop relying on client-side request-body reconstruction.
- [x] Expose bounded action labels, descriptions, and option metadata alongside board command metadata so proposal rows and actionable attention states stop relying on client-side choice-semantics reconstruction.
- [x] Expose bounded option examples and target summaries alongside board action metadata so proposal rows and actionable attention states stop relying on client-side payload and target-copy reconstruction.
- [x] Expose bounded recommended-option and confirmation metadata alongside board action metadata so proposal rows and actionable attention states stop relying on client-side default-choice and disruption-guard reconstruction.
- [x] Teach the localhost fallback and board page to consume the bounded harness action contract directly so contract-rich control semantics stop being backend-only metadata.
- [x] Teach the board page and localhost fallback to render bounded field constraints and attention context from the harness contract so request semantics stay engine-owned instead of UI-inferred.
- [x] Teach the board page to render option emphasis, per-option example payloads, and allowed decision/command families from the harness contract so action semantics stay engine-owned instead of UI-inferred.
- [x] Teach the board page and fallback to render bounded approval governance metadata from the harness contract so requested-by context, policy reasons, and next-review timing stay engine-owned instead of UI-inferred.
- [x] Teach the board page and fallback to render bounded governance history and package read models (`recentDecisions`, `followThroughItems`, `completionPackage`) so tenant-facing board truth does not stop at action metadata.
- [x] Teach the board page to surface bounded governance/package counts and labels from the contract so hero metrics and package sections do not fall back to page-local heuristics.
- [x] Teach the board page to group contract-driven board posture into a bounded pulse summary for attention, approvals, and package state instead of scattering those summaries into page-local heuristics.
- [x] Teach the live board page to submit bounded proposal and attention actions through engine-supplied action paths and example payloads instead of inventing a second request model in UI code.
- [x] Teach the board page to reflect bounded live-action outcomes and live-vs-preview control posture directly from the harness seam instead of leaving action results as generic client copy.
- [x] Teach the board page to carry a typed bounded live-action result seam so latest action feedback, lane focus, and run/fresh-cycle effects stay contract-driven instead of being re-derived from untyped client responses.
- [x] Teach the live board page to collect bounded request-field input from harness `requestFields` and build live action payloads from the contract instead of inventing ad hoc UI-only form semantics.
- [x] Teach the live board page to keep field defaults, required-field validation, reset behavior, and payload previews contract-driven instead of letting interactive controls invent their own request rules.
- [x] Teach the board page to track live-vs-preview control mode explicitly and keep option composers contract-driven, so action mutability no longer depends on fallback `runId` sentinels or fully expanded per-option UI clutter.
- [x] Keep prop-seeded preview boards explicitly read-only, so preloaded board data cannot silently bypass the preview/live mutability seam.
- [x] Keep retry/reset recovery controls bounded to the current board contract, so stale live-action failures cannot replay or reset actions that the refreshed board no longer exposes.
- [x] Distinguish stale action disappearance from stale payload drift, so replay stays suppressed when the old payload no longer matches current request-field rules while composer reset remains available for contract-compatible recovery.
- [x] Keep `invalid_request` recovery honest by showing reset only for payload drift, not for replay-safe payloads that still fit the current live contract.
- [x] Catch stale draft drift before submit when the live board already has the current request-field contract, so invalid allowed values or hidden stale fields disable submit and require reset instead of depending on a later server rejection.
- [x] Keep stale draft cleanup bounded when the live board contract refreshes, so removed actions/fields are pruned from local composer state but same-action drift still surfaces with explicit field-level reset reasons.
- [x] Surface bounded contract-refresh guidance when a live reload prunes stale action drafts, removed request fields, or stale open composers, so concurrency-driven cleanup is visible instead of silent.
- [x] Keep contract-refresh guidance action-specific enough to name the bounded actions/composers that were pruned, so concurrent board changes do not collapse into a vague “state changed” notice.
- [x] Keep active contract-refresh guidance visible until dismissal or superseding refresh, and surface that active refresh state in the board pulse so cleanup remains operator-visible instead of quietly expiring.
- [x] Preserve the last known bounded contract labels and field labels when a live refresh removes an action or field, so concurrency cleanup guidance stays human-readable instead of falling back to raw option values or field keys.
- [x] Keep contract-refresh guidance structured with bounded affected-action and impact-count metadata so the board page and pulse can summarize concurrency cleanup without inventing page-local status heuristics.
- [x] Keep contract-refresh recovery guidance structured too, so the board page and pulse expose bounded next-safe-step actions after live contract drift instead of leaving operators to infer recovery from a raw cleanup notice.
- [x] Extend the bounded board `actionToken` seam across legacy CEO mutation routes so `/complete` and `/fresh-cycle` cannot bypass `stale_contract` protection after the explicit review contract was introduced.
- [x] Re-check CEO review exclusivity at commit time, so a fresh-cycle decision makes the older packaged run non-completable through the same review token instead of allowing contradictory outcomes under concurrency.
- [x] Surface bounded lane continuity memory on card details so continuity source, latest outcome memory, and latest absorbed-work context stay tenant-visible without replaying raw card events or opening a second notes store.
- [x] Surface bounded policy/recommendation context on `followThroughItems` so implemented governance actions already carry enough suggested-versus-implemented memory for later export without reconstructing intent from raw decision rows.
- [x] Surface a bounded `memoryBoundary` read model so the board can distinguish live Wealth Factory runtime memory from later tenant-record/export candidates without turning future export or Obsidian surfaces into live orchestration truth.
- [x] Surface bounded `memoryBoundary` readiness states so export-candidate memory that is already stable does not get conflated with package-shaped memory that still waits on board closure.
- [x] Surface `memoryBoundary` readiness labels, next-eligible export guidance, and pulse-level export summary from the same harness contract so the UI does not re-derive export posture from enums or package heuristics.
- [x] Surface `memoryBoundary` role, eligibility-rule, and source-surface metadata plus partition summaries from the same harness contract so the runtime-memory vs governance-history vs packaged-output split stays engine-owned instead of becoming a second UI/export heuristic layer.
