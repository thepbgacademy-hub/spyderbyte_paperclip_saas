# SpyderByte Paperclip SaaS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MVP/POC branded SaaS wrapper that uses private self-hosted Paperclip as a background workflow engine.

**Architecture:** SpyderByte owns the public application, tenant model, BYOK handling, workflow queue, and audit surface. Paperclip is called through an internal REST adapter only and remains invisible to customers. Supabase stores app-side state and Redis/BullMQ runs async workflows.

**Tech Stack:** VPS hosting, Node.js/TypeScript, React later, Supabase, Redis, BullMQ, Paperclip REST API, Playwright CLI.

---

## Worker Rule

Subagents and implementers are not alone in the codebase. They must keep file ownership narrow, avoid reverting others' work, and adapt to existing changes. All code requires reviewer scrutiny for error and accuracy control before a phase is accepted.

## Phase 0: Repository And Local Skeleton

**Outcome:** A clean repo with documented architecture, environment conventions, test commands, and deployment assumptions.

**Files:**

- Create: `package.json`
- Create: `.env.example`
- Create: `src/config/env.ts`
- Create: `tests/env.test.ts`
- Create: `docs/reviewer-notes.md`

- [ ] Create a minimal TypeScript project with lint/test scripts.
- [ ] Add environment schema for Supabase URL/key, Redis URL, Paperclip base URL, and Paperclip service credential.
- [ ] Add tests proving required environment variables are validated.
- [ ] Run unit tests.
- [ ] Reviewer checks that no secret values are committed.
- [ ] Commit with message: `chore: initialize spyderbyte paperclip saas repo`

## Phase 1: Single-Tenant Vertical Slice, No BYOK

**Outcome:** One internal workflow can be queued, processed, sent to Paperclip through the adapter, and synced back into SpyderByte run metadata.

**Files:**

- Create: `src/paperclip/client.ts`
- Create: `src/paperclip/types.ts`
- Create: `src/workflows/queue.ts`
- Create: `src/workflows/worker.ts`
- Create: `src/workflows/run-service.ts`
- Create: `tests/paperclip-client.test.ts`
- Create: `tests/workflow-queue.test.ts`
- Create: `docs/phases/phase-1-poc.md`

- [ ] Define Paperclip adapter methods for health check, create run/task, fetch run status, and cancel run.
- [ ] Write mocked adapter tests before implementation.
- [ ] Implement adapter with safe error translation.
- [ ] Add BullMQ queue payload schema with `tenantId`, `runId`, `workflowId`, and idempotency key.
- [ ] Write tests rejecting payloads with raw secrets or Paperclip internals.
- [ ] Implement worker that validates payload, calls Paperclip adapter, and records sanitized status.
- [ ] Run unit/integration tests.
- [ ] Run a local dry-run worker against a mocked Paperclip endpoint.
- [ ] Reviewer checks that customer-visible responses contain no Paperclip prompt, skill, command, agent, or raw log fields.
- [ ] Commit with message: `feat: add single tenant workflow slice`

## Phase 2: Supabase Tenant Model And RLS

**Outcome:** Supabase tenant data is isolated before a second tenant is enabled.

**Files:**

- Create: `supabase/migrations/0001_initial_tenant_model.sql`
- Create: `src/db/types.ts`
- Create: `src/tenants/tenant-service.ts`
- Create: `tests/tenant-rls.test.ts`

- [ ] Create tables: `tenants`, `tenant_memberships`, `paperclip_company_mappings`, `workflow_templates`, `workflow_runs`, `secret_references`, `audit_events`, and `operator_actions`.
- [ ] Enable RLS on all tenant-owned tables.
- [ ] Add policies requiring membership for reads and service role for controlled writes.
- [ ] Write positive tests for Tenant A reading its own rows.
- [ ] Write negative tests proving Tenant A cannot read, update, delete, enqueue, replay, or inspect Tenant B resources.
- [ ] Run Supabase migration in the test project.
- [ ] Run RLS tests.
- [ ] Reviewer checks policies and test coverage.
- [ ] Commit with message: `feat: add tenant model and rls`

## Phase 3: BYOK Secret References

**Outcome:** Tenant API keys are accepted, stored by reference, used only at runtime, redacted everywhere, and revocable.

**Files:**

- Create: `src/secrets/secret-service.ts`
- Create: `src/secrets/redaction.ts`
- Create: `tests/secret-service.test.ts`
- Create: `tests/redaction.test.ts`

- [ ] Add secret reference data model usage without storing raw secret values in app tables.
- [ ] Implement secret registration flow against the selected MVP secret backend.
- [ ] Implement redaction for common key/token/secret patterns.
- [ ] Write tests proving raw keys never appear in logs, job payloads, API responses, or audit events.
- [ ] Add rotation and revoke operations.
- [ ] Add audit events for create, rotate, revoke, and runtime access by reference.
- [ ] Reviewer checks BYOK lifecycle and failure behavior.
- [ ] Commit with message: `feat: add byok secret references`

## Phase 4: Operator Control Surface

**Outcome:** Operators can safely inspect and control the MVP without exposing Paperclip to customers.

**Files:**

- Create: `src/operators/operator-service.ts`
- Create: `src/operators/routes.ts`
- Create: `tests/operator-service.test.ts`

- [ ] Add tenant pause/resume.
- [ ] Add job inspect, retry, cancel, and dead-letter view APIs.
- [ ] Add secret rotate/revoke endpoints.
- [ ] Add emergency disable for Paperclip integration by tenant.
- [ ] Ensure operator APIs require operator role and write audit events.
- [ ] Reviewer checks that operator endpoints cannot be reached by tenant users.
- [ ] Commit with message: `feat: add operator control surface`

## Phase 5: Minimal Branded MVP UI

**Outcome:** A small SpyderByte UI proves login, tenant selection, credential registration, workflow run, and sanitized result display.

**Files:**

- Create: `apps/web`
- Create: `apps/web/tests/e2e/workflow.spec.ts`
- Create: `apps/web/tests/e2e/tenant-isolation.spec.ts`

- [ ] Build minimal UI using SpyderByte naming only.
- [ ] Add workflow run page with sanitized status/result.
- [ ] Add BYOK registration page that never redisplays the secret.
- [ ] Add operator-only diagnostics page.
- [ ] Write Playwright CLI tests for login, workflow run, tenant isolation, and no Paperclip internals in UI/API responses.
- [ ] Run Playwright CLI end-to-end tests.
- [ ] Reviewer checks UI copy and network responses for Paperclip leakage.
- [ ] Commit with message: `feat: add minimal branded mvp ui`

## Phase 6: VPS Deployment POC

**Outcome:** The MVP runs on VPS infrastructure with public SpyderByte routes and private Paperclip/Redis routes.

**Files:**

- Create: `deploy/docker-compose.yml`
- Create: `deploy/nginx/spyderbyte.conf`
- Create: `deploy/runbooks/deploy-poc.md`
- Create: `deploy/runbooks/incident-response.md`

- [ ] Deploy public app at `www.spyderbyte.cloud`.
- [ ] Deploy API at `api.spyderbyte.cloud` or behind the same origin.
- [ ] Deploy Paperclip on private network or private subdomain with authenticated mode.
- [ ] Keep Redis private.
- [ ] Configure health checks.
- [ ] Run smoke tests from outside the VPS proving Paperclip and Redis are not publicly reachable.
- [ ] Run Playwright CLI E2E tests against the deployed POC.
- [ ] Reviewer checks deployment exposure and logs.
- [ ] Commit with message: `chore: add vps deployment poc`

## Phase 7: Final Dashboard Design Prep

**Outcome:** After the POC works, design the real control panel/dashboard separately.

- [ ] Review operator workflows learned from the POC.
- [ ] Define customer dashboard information architecture.
- [ ] Define admin dashboard information architecture.
- [ ] Design Paperclip-safe result views that never expose internal prompts, skills, commands, or logs.
- [ ] Create a separate dashboard design spec before implementation.

## Required E2E Checks

Use the installed Playwright CLI when a web surface exists.

Required assertions:

- Tenant A cannot view Tenant B workflows, runs, secrets, logs, or audit events.
- BYOK secrets are never redisplayed.
- API responses do not include Paperclip prompt, skill, command, agent, raw activity, or internal log fields.
- Workflow run can be queued, processed, completed, and displayed as SpyderByte output.
- Operator-only pages are inaccessible to regular tenant users.

## Self-Review

Coverage check:

- VPS hosting is covered in Phase 6.
- Supabase is covered in Phase 2.
- Redis/BullMQ is covered in Phase 1.
- BYOK is covered in Phase 3.
- Paperclip invisibility is covered across all phases.
- E2E tests are required in Phases 5 and 6.
- Reviewer control is required in every phase.
- Dashboard is deferred to Phase 7 by design.

No placeholders remain in this plan. The MVP is intentionally split so each phase creates testable software.
