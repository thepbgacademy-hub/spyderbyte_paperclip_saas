# Handoff: Phase 1

This handoff is intentionally overwritten after each phase. It should only describe the next active phase and point workers to the durable docs.

## Active Phase

Phase 1: Single-Tenant Workflow Slice, No BYOK.

## Reference Docs

- `docs/design.md`
- `docs/build.md`
- `docs/reviewer-notes.md`
- `TODO.md`

## Build Instructions

Follow `docs/build.md`, Phase 1 only.

Build one internal workflow path that can be queued, processed, sent through the Paperclip REST adapter, and synced back as sanitized SpyderByte run metadata. Do not start Supabase RLS or BYOK implementation until Phase 1 is tested, reviewed, committed, and this handoff is overwritten for Phase 2.

## Phase 1 Files

- `src/paperclip/client.ts`
- `src/paperclip/types.ts`
- `src/workflows/queue.ts`
- `src/workflows/worker.ts`
- `src/workflows/run-service.ts`
- `tests/paperclip-client.test.ts`
- `tests/workflow-queue.test.ts`
- `docs/phases/phase-1-poc.md`

## Required Tests

- Paperclip adapter mocked tests.
- Queue payload validation tests.
- Tests proving raw secrets and Paperclip internals are rejected from queued/customer-visible payloads.
- `npm run build`
- `npm test`

## Hard Rules

- Users must never see Paperclip prompts, skills, commands, agents, tool calls, raw logs, or internal configuration.
- OpenAI user credentials are BYOK server-side secrets, not browser-visible reusable values.
- Generic providers must use the same secret-reference model as OpenAI.
- Subagents and implementers are not alone in the codebase. Do not revert others' work.
- All code requires reviewer scrutiny before the phase is accepted.
