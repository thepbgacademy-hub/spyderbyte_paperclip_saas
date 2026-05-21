# Wealth Factory Harness Handoff

## Status

This is a new dominant subproject for Wealth Factory.

The first design decision is now locked in:

- build a custom Wealth Factory harness
- replace the `CEO orchestration + child-card workflow loop` first
- keep BYOK fully owned by Wealth Factory
- use Hermes-style dashboard UX as the reference standard
- use prior Paperclip and pressure-test findings as the design compass

## Current Branch

- `codex/wf-harness-design`

## Key Design Commitments

- CEO is the only tenant-facing conversational actor
- child personas operate through bounded hybrid cards
- child-to-child coordination goes through the CEO
- dynamic card creation is allowed, but CEO-approved and card-count disciplined
- restart recovery resumes from persisted card and run state
- the first harness slice is a slice replacement, not a long-lived same-slice dual-engine setup

## Source of Truth

- `wf-harness/docs/2026-05-21-wf-harness-v1-design.md`

## Plan Of Record

- `wf-harness/docs/plans/2026-05-21-wf-harness-v1-implementation-plan.md`

## Next Step

Choose the execution mode for implementing the first harness slice:

- subagent-driven execution
- inline execution
