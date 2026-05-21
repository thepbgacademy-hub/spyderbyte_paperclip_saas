# Wealth Factory Harness TODO

This file tracks the new harness subproject only.

## Current Phase

- [x] Approve first harness direction.
- [x] Write v1 design spec.
- [ ] Review and refine the v1 design spec.
- [ ] Write the implementation plan for the first harness slice.

## V1 Build Targets

- [ ] Define persisted run-state model for CEO orchestration.
- [ ] Define persisted hybrid-card model for child personas.
- [ ] Define CEO approval rules for dynamic card creation.
- [ ] Define resume-from-crash behavior and checkpoint policy.
- [ ] Define Wealth Factory to harness runtime contract for resolved BYOK context.
- [ ] Define Hermes-style dashboard information architecture for Wealth Factory.
- [ ] Define board columns, drawer behavior, and tenant-visible status language.
- [ ] Define migration slice boundary from the current Paperclip-backed runtime.

## Guardrails

- [ ] Keep BYOK fully owned by Wealth Factory.
- [ ] Keep tenant interaction CEO-only.
- [ ] Keep child personas bounded and non-conversational to the tenant.
- [ ] Keep dashboard noise-free and high-level.
- [ ] Keep test findings from the Paperclip build as design constraints, not historical trivia.
