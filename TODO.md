# TODO

This file tracks implementation progress. Keep it current after every phase.

## Completed

- [x] Phase 0: Repository and local skeleton.
- [x] Create minimal TypeScript project with lint/test scripts.
- [x] Add environment validation.
- [x] Add provider type definitions for OpenAI and generic API providers.
- [x] Add tests for environment validation and provider metadata.
- [x] Run unit tests.

## Current Phase: Phase 1

- [ ] Define Paperclip adapter methods for health check, create run/task, fetch run status, and cancel run.
- [ ] Write mocked adapter tests before implementation.
- [ ] Implement adapter with safe error translation.
- [ ] Add BullMQ queue payload schema with `tenantId`, `runId`, `workflowId`, and idempotency key.
- [ ] Write tests rejecting payloads with raw secrets or Paperclip internals.
- [ ] Implement worker that validates payload, calls Paperclip adapter, and records sanitized status.
- [ ] Run unit/integration tests.
- [ ] Run a local dry-run worker against a mocked Paperclip endpoint.
- [ ] Complete reviewer check.
- [ ] Overwrite `HANDOFF.md` with Phase 2-only next steps.
- [ ] Commit Phase 1.

## Later Phases

- [ ] Phase 2: Supabase tenant model and RLS.
- [ ] Phase 3: BYOK secret references, OpenAI lane, and generic provider lane.
- [ ] Phase 4: Operator control surface.
- [ ] Phase 5: Minimal branded MVP UI and Playwright E2E.
- [ ] Phase 6: VPS deployment POC.
- [ ] Phase 7: Final dashboard design prep.
