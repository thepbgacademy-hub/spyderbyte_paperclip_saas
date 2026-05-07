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
- [x] Phase 3: BYOK secret references, OpenAI lane, and generic provider lane.
- [x] Add secret reference data model usage without storing raw secret values in app tables.
- [x] Implement OpenAI BYOK registration flow.
- [x] Store optional OpenAI project ID as non-secret provider metadata.
- [x] Add generic provider lane for declared secret labels and public-safe config.
- [x] Implement redaction for common key/token/secret patterns.
- [x] Write tests proving raw keys never appear in logs, job payloads, API responses, or audit events.
- [x] Add rotation and revoke operations.
- [x] Add audit events for create, rotate, revoke, and runtime access by reference.
- [x] Run lint/build/refactor pass.
- [x] Complete Phase 3 reviewer check.
- [x] Phase 4: Operator control surface.
- [x] Add tenant pause/resume.
- [x] Add job inspect, retry, cancel, and dead-letter view APIs.
- [x] Add secret rotate/revoke operator endpoints.
- [x] Add emergency disable for Paperclip integration by tenant.
- [x] Ensure operator APIs require operator role and write audit events.
- [x] Run lint/build/refactor pass.
- [x] Complete Phase 4 reviewer check.
- [x] Phase 5: Minimal branded MVP UI.
- [x] Build minimal UI using SpyderByte naming only.
- [x] Add workflow run page with sanitized status/result.
- [x] Add BYOK registration page that never redisplays the secret.
- [x] Add operator-only diagnostics page.
- [x] Write Playwright CLI tests for workflow run, tenant isolation, and no Paperclip internals in UI responses.
- [x] Run Playwright CLI end-to-end tests.
- [x] Run lint/build/refactor pass.
- [x] Complete reviewer check.
- [x] Overwrite `HANDOFF.md` with Phase 6-only next steps.

## Current Phase: Phase 6

- [ ] Create VPS deployment POC configuration.
- [ ] Add Docker Compose for app, worker, Redis, and reverse proxy assumptions.
- [ ] Add Nginx subdomain config for `www.spyderbyte.cloud` or `paperclip.spyderbyte.cloud`.
- [ ] Add deployment runbook with environment variable matrix and secret handling.
- [ ] Add health-check and smoke-test instructions.
- [ ] Add static tests for deployment config safety.
- [ ] Run lint/build/test/refactor pass.
- [ ] Complete reviewer check.
- [ ] Overwrite `HANDOFF.md` with Phase 7-only next steps.
- [ ] Commit Phase 6.

## Later Phases

- [ ] Phase 7: Final dashboard design prep.
