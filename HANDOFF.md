# Handoff: Phase 3

This handoff is intentionally overwritten after each phase. It should only describe the next active phase and point workers to the durable docs.

## Active Phase

Phase 3: BYOK Secret References, OpenAI Lane, And Generic Provider Lane.

## Reference Docs

- `docs/design.md`
- `docs/build.md`
- `docs/reviewer-notes.md`
- `TODO.md`

## Build Instructions

Follow `docs/build.md`, Phase 3 only.

Build BYOK secret-reference lifecycle services. Do not start operator control surface until Phase 3 is tested, reviewed, committed, and this handoff is overwritten for Phase 4.

## Phase 3 Files

- `src/secrets/secret-service.ts`
- `src/secrets/redaction.ts`
- `src/providers/openai-provider.ts`
- `src/providers/generic-provider.ts`
- `tests/secret-service.test.ts`
- `tests/redaction.test.ts`

## Required Tests

- OpenAI BYOK registration stores only a secret reference and optional public-safe project metadata.
- Generic providers reject secret-like metadata fields.
- Raw keys never appear in logs, job payloads, API responses, or audit events.
- Rotation, revoke, and runtime access emit sanitized audit events.
- `npm run build`
- `npm test`
- `npm run lint`

## Hard Rules

- Users must never see Paperclip prompts, skills, commands, agents, tool calls, raw logs, or internal configuration.
- OpenAI user credentials are BYOK server-side secrets, not browser-visible reusable values.
- Generic providers must use the same secret-reference model as OpenAI.
- Supabase RLS must protect provider metadata and secret references because metadata can be sensitive.
- Subagents and implementers are not alone in the codebase. Do not revert others' work.
- All code requires reviewer scrutiny before the phase is accepted.
