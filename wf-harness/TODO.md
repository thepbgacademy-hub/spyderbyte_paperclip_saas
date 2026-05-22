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

## Progress Since Bootstrap

- [x] Add true database-backed transaction coverage for the deferred proposal-approval seam so approval-before-card-insert ordering is proven against the real persistence layer.
- [ ] Decide whether Docker-backed harness integration proofs need a CI lane or alternate local fallback so the deferred-FK contract is exercised outside Docker-capable machines too.
- [x] Add transaction-client coverage proving the approval update and child-card insert share one leased transaction client and roll back together on failure.
- [x] Expand beyond CEO direct-child creation into richer persisted card progression and result-recording mutation paths.
- [ ] Add fuller CEO approval logic for sub-card requests and card-count discipline beyond the current duplicate-lane/open-cap guardrails.
- [x] Add harness-specific audit publishing beyond the persisted card-event trail.
- [ ] Expand the dashboard visual system once the additional Hermes/Obsidian reference screenshots are reviewed.

## Current Next Slice

- [x] Reconcile persisted run-state progression with the new child-card advancement seam so run-level status is no longer effectively bootstrap-only.
- [x] Add a parsed request-body contract for harness mutations before tenant-authored outcome summaries are accepted over HTTP.
- [x] Add richer CEO approval policy beyond exact-match idempotency and the current open-card cap.
- [x] Widen run-level progression from the current derived `assembling` ceiling into explicit final assembly/completion logic.
- [ ] Add deny/defer semantics and stronger "update existing lane vs create new lane" CEO policy beyond the current duplicate-lane guards.
- [ ] Add richer packaging and result handoff logic on top of the current explicit CEO completion command.
