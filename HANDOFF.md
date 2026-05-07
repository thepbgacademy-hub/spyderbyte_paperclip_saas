# Handoff: Phase 5

This handoff is intentionally overwritten after each phase. It should only describe the next active phase and point workers to the durable docs.

## Active Phase

Phase 5: Minimal Branded MVP UI.

## Reference Docs

- `docs/design.md`
- `docs/build.md`
- `docs/reviewer-notes.md`
- `TODO.md`

## Build Instructions

Follow `docs/build.md`, Phase 5 only.

Build a small SpyderByte-branded UI proving login placeholder flow, tenant selection, BYOK registration, workflow run status, and operator diagnostics. Do not start VPS deployment until Phase 5 is tested with Playwright, reviewed, committed, and this handoff is overwritten for Phase 6.

## Phase 5 Files

- `apps/web`
- `apps/web/tests/e2e/workflow.spec.ts`
- `apps/web/tests/e2e/tenant-isolation.spec.ts`

## Required Tests

- UI uses SpyderByte naming only.
- BYOK secrets are never redisplayed.
- Workflow status/result display is sanitized.
- Operator diagnostics are inaccessible to regular tenant users.
- API/UI responses contain no Paperclip prompt, skill, command, agent, raw activity, or internal log fields.
- Playwright CLI E2E tests pass.
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
