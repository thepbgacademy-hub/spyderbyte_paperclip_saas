# TODO

This file tracks implementation progress. Keep it current after every phase.

## Completed

- [x] Phase 0: Repository and local skeleton.
- [x] Create minimal TypeScript project with lint/test scripts.
- [x] Add environment validation.
- [x] Add provider type definitions for OpenAI and generic API providers.
- [x] Add tests for environment validation and provider metadata.
- [x] Run unit tests.
- [x] Phase 1: Single-tenant workflow slice.
- [x] Define Paperclip adapter methods for health check, create run/task, fetch run status, and cancel run.
- [x] Write mocked adapter tests before implementation.
- [x] Implement adapter with safe error translation.
- [x] Add tenant-aware queue payload schema with `tenantId`, `runId`, `workflowId`, and idempotency key.
- [x] Write tests rejecting raw secrets and Paperclip internals in queue payloads.
- [x] Implement worker that validates payload, calls Paperclip adapter, and records sanitized status.
- [x] Run unit/integration tests.
- [x] Run local dry-run behavior through mocked Paperclip tests.
- [x] Run lint/build/refactor pass.
- [x] Complete Phase 1 reviewer check.

## Current Phase: Phase 2

- [ ] Create Supabase migration for tenant model.
- [ ] Enable RLS on all tenant-owned tables.
- [ ] Add tenant service and database type definitions.
- [ ] Write positive tenant access tests.
- [ ] Write negative cross-tenant access tests.
- [ ] Run Supabase migration in the test project.
- [ ] Run RLS tests.
- [ ] Run lint/build/refactor pass.
- [ ] Complete reviewer check.
- [ ] Overwrite `HANDOFF.md` with Phase 3-only next steps.
- [ ] Commit Phase 2.

## Later Phases

- [ ] Phase 3: BYOK secret references, OpenAI lane, and generic provider lane.
- [ ] Phase 4: Operator control surface.
- [ ] Phase 5: Minimal branded MVP UI and Playwright E2E.
- [ ] Phase 6: VPS deployment POC.
- [ ] Phase 7: Final dashboard design prep.
