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
- [x] Define resume-from-crash behavior and checkpoint policy.
- [x] Define Wealth Factory to harness runtime contract for resolved BYOK context.
- [x] Define Hermes-style dashboard information architecture for Wealth Factory.
- [x] Define board columns, drawer behavior, and tenant-visible status language.
- [x] Define migration slice boundary from the current Paperclip-backed runtime.
- [x] Wire the board route to persisted tenant-scoped harness state instead of static fixtures.
- [x] Consume harness-enabled workflow ids in a live runtime path.

## Guardrails

- [x] Keep BYOK fully owned by Wealth Factory.
- [x] Keep tenant interaction CEO-only.
- [x] Keep child personas bounded and non-conversational to the tenant.
- [x] Keep dashboard noise-free and high-level.
- [x] Keep test findings from the Paperclip build as design constraints, not historical trivia.

## Next Slice

- [ ] Replace seeded harness board defaults with real persisted CEO/card mutation paths.
- [ ] Add explicit CEO approval logic for sub-card requests and card-count discipline.
- [ ] Add harness-specific audit publishing beyond the persisted card-event trail.
- [ ] Expand the dashboard visual system once the additional Hermes/Obsidian reference screenshots are reviewed.
