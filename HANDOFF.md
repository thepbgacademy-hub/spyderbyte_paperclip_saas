# Handoff: Phase 4

This handoff is intentionally overwritten after each phase. It should only describe the next active phase and point workers to the durable docs.

## Active Phase

Phase 4: Operator Control Surface.

## Reference Docs

- `docs/design.md`
- `docs/build.md`
- `docs/reviewer-notes.md`
- `TODO.md`

## Build Instructions

Follow `docs/build.md`, Phase 4 only.

Build operator-only controls for tenant pause/resume, job inspect/retry/cancel/dead-letter views, secret rotate/revoke actions, and emergency Paperclip disable. Do not start the MVP UI until Phase 4 is tested, reviewed, committed, and this handoff is overwritten for Phase 5.

## Phase 4 Files

- `src/operators/operator-service.ts`
- `src/operators/routes.ts`
- `tests/operator-service.test.ts`

## Required Tests

- Operator APIs require operator authorization.
- Tenant pause/resume emits audit events.
- Job inspect/retry/cancel/dead-letter operations return sanitized data.
- Secret rotate/revoke actions delegate to secret service and emit operator audit events.
- Emergency Paperclip disable prevents future workflow starts for the tenant.
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
