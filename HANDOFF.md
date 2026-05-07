# Handoff: Phase 7

This handoff is intentionally overwritten after each phase. It should only describe the next active phase and point workers to the durable docs.

## Active Phase

Phase 7: Final Dashboard Design Prep.

## Reference Docs

- `docs/design.md`
- `docs/build.md`
- `docs/reviewer-notes.md`
- `TODO.md`
- `deploy/runbooks/deploy-poc.md`

## Build Instructions

Follow `docs/build.md`, Phase 7 only.

Create the dashboard design preparation document for the post-MVP control panel. This phase should not build the final dashboard; it should convert what the POC proved into information architecture, safety rules, page inventory, and next implementation requirements.

## Phase 7 Files

- `docs/dashboard-design-prep.md`
- `TODO.md`
- `HANDOFF.md`

## Required Checks

- Customer dashboard information architecture is defined.
- Operator/admin information architecture is defined.
- Result views are explicitly designed to hide internal prompts, skills, commands, raw logs, provider secrets, and private workflow-engine identifiers.
- The document identifies what must be backed by Supabase RLS, server-side authorization, and audit events.
- `npm run build`
- `npm test`
- `npm run lint`

## Hard Rules

- Users must never see Paperclip prompts, skills, commands, agents, tool calls, raw logs, or internal configuration.
- OpenAI user credentials are BYOK server-side secrets, not browser-visible reusable values.
- Generic providers must use the same secret-reference model as OpenAI.
- Supabase RLS must protect provider metadata and secret references because metadata can be sensitive.
- Subagents and implementers are not alone in the codebase. Do not revert others' work.
- All code and docs require reviewer scrutiny before the phase is accepted.
