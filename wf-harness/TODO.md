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
- [x] Persist structured absorbed-work state when the CEO folds a proposal into an existing lane, so lane reuse becomes real engine state instead of comment-only history.
- [x] Add first-class board decision memory so approvals, deferrals, denials, lane opens, and CEO completion become durable harness records instead of inferred chatter.
- [x] Widen board decision memory with bounded policy reasons and recommendation/objection summaries instead of introducing a second generic notes store.
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
- [ ] Deepen CEO decision policy so repeated sub-card requests prefer lane updates, then defer, then deny in a more explicit workflow-aware order.
- [x] Surface absorbed follow-on work back through bounded board activity/detail views when a proposal is folded into an existing lane.
- [x] Keep raw CEO decision notes out of the tenant-facing activity feed while preserving bounded public governance status.
- [x] Make repeated defer decisions idempotent when no new note or policy context is introduced.
- [ ] Decide which board-memory records should stay purely operational in Wealth Factory versus which ones should later export into tenant-owned Obsidian as long-memory business records.
- [ ] Decide whether the widened derived `completionPackage` should stay a read model or graduate into a persisted packaged-output artifact in a later slice.
- [x] Add explicit packaging policy for how recommendations, objections, and deferred governance items should shape the tenant-facing final handoff.
- [ ] Decide whether denied governance items should remain derived read-model packaging only or become exportable board-memory artifacts later.
- [ ] Define the split between small harness continuity memory and larger tenant-owned long memory in Obsidian, including what gets written there and what must remain Wealth Factory runtime truth.
