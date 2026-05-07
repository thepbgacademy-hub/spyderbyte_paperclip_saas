# Handoff: Phase 6

This handoff is intentionally overwritten after each phase. It should only describe the next active phase and point workers to the durable docs.

## Active Phase

Phase 6: VPS Deployment POC.

## Reference Docs

- `docs/design.md`
- `docs/build.md`
- `docs/reviewer-notes.md`
- `TODO.md`

## Build Instructions

Follow `docs/build.md`, Phase 6 only.

Create deployment proof-of-concept configuration for the VPS-hosted architecture using Supabase, Redis/BullMQ, and SpyderByte-owned services. Do not start dashboard design work until Phase 6 is tested, reviewed, committed, and this handoff is overwritten for Phase 7.

## Phase 6 Files

- `deploy/docker-compose.yml`
- `deploy/nginx/spyderbyte.conf`
- `deploy/runbooks/deploy-poc.md`
- `tests/deploy-config.test.ts`

## Required Tests

- Deployment config does not expose internal Paperclip service ports publicly.
- Redis is private to the Compose network.
- Reverse proxy routes public traffic only to the branded web/API surface.
- Environment variables use secret references or server-side secrets, not browser-visible raw keys.
- Health-check and smoke-test commands are documented.
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
