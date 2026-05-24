# Wealth Factory Harness TODO

This file tracks the new harness subproject only.

## Current Phase

- [x] Approve first harness direction.
- [x] Write v1 design spec.
- [x] Review and refine the v1 design spec.
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

## Current Next Slice

- [x] Reconcile persisted run-state progression with the new child-card advancement seam so run-level status is no longer effectively bootstrap-only.
- [x] Add a parsed request-body contract for harness mutations before tenant-authored outcome summaries are accepted over HTTP.
- [x] Add richer CEO approval policy beyond exact-match idempotency and the current open-card cap.
- [x] Widen run-level progression from the current derived `assembling` ceiling into explicit final assembly/completion logic.
- [x] Add deny/defer semantics and stronger "update existing lane vs create new lane" CEO policy beyond the current duplicate-lane guards.
- [x] Add an initial read-only packaging/result handoff seam on top of the explicit CEO completion command.
- [x] Keep deferred proposals visible and re-approvable so CEO decisions can genuinely pause work instead of silently dropping it.
- [x] Make the owner-conflict "clear or hand off that lane" promise real with a bounded CEO handoff path instead of leaving it as board text only.
- [x] Deepen CEO decision policy so repeated sub-card requests prefer lane updates, then defer, then deny in a more explicit workflow-aware order.
- [x] Surface absorbed follow-on work back through bounded board activity/detail views when a proposal is folded into an existing lane.
- [x] Keep raw CEO decision notes out of the tenant-facing activity feed while preserving bounded public governance status.
- [x] Make repeated defer decisions idempotent when no new note or policy context is introduced.
- [ ] Decide which board-memory records should stay purely operational in Wealth Factory versus which ones should later export into tenant-owned Obsidian as long-memory business records.
- [ ] Decide whether the widened derived `completionPackage` should stay a read model or graduate into a persisted packaged-output artifact in a later slice.
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
