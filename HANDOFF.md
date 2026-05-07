# Handoff: Phase 2

This handoff is intentionally overwritten after each phase. It should only describe the next active phase and point workers to the durable docs.

## Active Phase

Phase 2: Supabase Tenant Model And RLS.

## Reference Docs

- `docs/design.md`
- `docs/build.md`
- `docs/reviewer-notes.md`
- `TODO.md`

## Build Instructions

Follow `docs/build.md`, Phase 2 only.

Build the Supabase tenant schema and RLS isolation layer. Do not start BYOK implementation until Phase 2 is tested, reviewed, committed, and this handoff is overwritten for Phase 3.

## Phase 2 Files

- `supabase/migrations/0001_initial_tenant_model.sql`
- `src/db/types.ts`
- `src/tenants/tenant-service.ts`
- `tests/tenant-rls.test.ts`

## Required Tests

- Positive tenant access tests.
- Negative cross-tenant access tests for reads, writes, deletes, enqueues, replays, and inspections.
- Tests proving tenant users cannot access secret metadata, workflow runs, logs, or mappings outside their tenant.
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
