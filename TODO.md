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
- [x] Phase 2: Supabase tenant model and RLS.
- [x] Create Supabase migration for tenant model.
- [x] Enable RLS on all tenant-owned tables.
- [x] Add tenant service and database type definitions.
- [x] Write positive tenant access tests.
- [x] Write negative/static cross-tenant access tests.
- [x] Run local RLS migration tests.
- [x] Run lint/build/refactor pass.
- [x] Complete Phase 2 reviewer check.

## Current Phase: Phase 3

- [ ] Add secret reference data model usage without storing raw secret values in app tables.
- [ ] Implement OpenAI BYOK registration flow.
- [ ] Store optional OpenAI project ID as non-secret provider metadata.
- [ ] Add generic provider lane for declared secret labels and public-safe config.
- [ ] Implement redaction for common key/token/secret patterns.
- [ ] Write tests proving raw keys never appear in logs, job payloads, API responses, or audit events.
- [ ] Add rotation and revoke operations.
- [ ] Add audit events for create, rotate, revoke, and runtime access by reference.
- [ ] Run lint/build/refactor pass.
- [ ] Complete reviewer check.
- [ ] Overwrite `HANDOFF.md` with Phase 4-only next steps.
- [ ] Commit Phase 3.

## Later Phases

- [ ] Phase 4: Operator control surface.
- [ ] Phase 5: Minimal branded MVP UI and Playwright E2E.
- [ ] Phase 6: VPS deployment POC.
- [ ] Phase 7: Final dashboard design prep.
