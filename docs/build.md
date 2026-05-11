# SpyderByte Paperclip SaaS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MVP/POC branded SaaS wrapper, customer-facing as Wealth Factory, that uses private self-hosted Paperclip as a background workflow engine.

**Architecture:** Wealth Factory owns the public application, tenant model, BYOK handling, workflow queue, and audit surface. Paperclip is called through an internal REST adapter only and remains invisible to customers. A deterministic TypeScript boundary layer maps, rewrites, and guards all Paperclip-facing data before it can reach user-facing APIs or UI. Supabase stores app-side state and Redis/BullMQ runs async workflows.

**Tech Stack:** VPS hosting, Node.js/TypeScript, React later, Supabase, Redis, BullMQ, Paperclip REST API, Playwright CLI.

---

## Worker Rule

Subagents and implementers are not alone in the codebase. They must keep file ownership narrow, avoid reverting others' work, and adapt to existing changes. All code requires reviewer scrutiny for error and accuracy control before a phase is accepted.

## Provider Credential Strategy

Wealth Factory must treat every provider credential as company-specific. A subscribing company can use its own OpenAI, Anthropic, xAI/Grok, or OpenRouter API key, and optionally its own company-isolated ChatGPT/Codex subscription auth lane. No server-wide or operator-owned provider credential may be used as the default for subscriber work.

Supported provider lanes for the post-MVP dashboard/API:

- `openai_api`: preferred API-key lane. Stores OpenAI API key by reference and optional non-secret `OpenAI-Project` metadata.
- `openai_chatgpt_codex_subscription`: company-isolated Codex CLI subscription lane. Uses a per-company or per-authorized-user `CODEX_HOME`, `codex login` or device-code auth, encrypted auth/session storage, and no `OPENAI_API_KEY` in the runtime environment when subscription mode is intended.
- `anthropic_api`: Anthropic API-key lane using the same secret-reference model.
- `xai_grok_api`: xAI/Grok API-key lane using the same secret-reference model.
- `openrouter_api`: OpenRouter API-key lane using the same secret-reference model, with usage reporting that can distinguish OpenRouter as biller from upstream provider/model where available.
- `generic_api`: later extension lane for providers outside the initial supported set.

Required implementation files for provider expansion:

- Modify: `src/providers/provider-types.ts`
- Modify: `src/providers/generic-provider.ts`
- Create: `src/providers/anthropic-provider.ts`
- Create: `src/providers/xai-provider.ts`
- Create: `src/providers/openrouter-provider.ts`
- Create: `src/providers/codex-subscription-provider.ts`
- Create: `tests/provider-credential-lanes.test.ts`

Required tests:

- OpenAI remains the recommended/default provider option.
- Anthropic, xAI/Grok, and OpenRouter registrations require API-key secrets and reject secret-like metadata.
- ChatGPT/Codex subscription registrations require isolated company/user auth state references and reject shared `~/.codex` or global `CODEX_HOME` paths.
- Subscription mode fails if an `OPENAI_API_KEY` is present in the intended runtime environment.
- Tenant A cannot access, rotate, revoke, inspect, or run with Tenant B provider credentials or Codex auth state.

## Subscription Package Strategy

Wealth Factory is sold as monthly subscription packages. Each package is either an industry-specific prebuilt package or the premium blank-canvas package.

Commercial rules:

- A company must have an active subscription before it can run workflows.
- A company purchases and installs a primary package from its dashboard.
- Industry packages include governed prompts, rules, allowed assets, prebuilt workflows, default dashboards/templates, and base employees.
- The blank-canvas premium tier starts with no prebuilt workflows; the customer designs the business from scratch.
- Wealth Factory ships with basic executive employees such as CEO/CFO-style roles.
- Specialist employees are paid add-ons.
- Add-on employees and workflows are scoped to the installed package/industry unless explicitly purchased.
- A workflow may never execute outside the tenant's installed package/industry boundary.

Required implementation files for package/subscription expansion:

- Create: `src/packages/package-types.ts`
- Create: `src/packages/package-asset-registry.ts`
- Create: `src/packages/package-service.ts`
- Create: `src/packages/entitlement-service.ts`
- Create: `src/packages/employee-catalog.ts`
- Create: `tests/package-asset-registry.test.ts`
- Create: `tests/package-entitlements.test.ts`
- Modify: `supabase/migrations/0001_initial_tenant_model.sql` or add a new package entitlement migration.
- Modify: `src/workflows/run-service.ts`
- Modify: `src/wealthfactory/workflow-registry.ts`

Required tests:

- A tenant cannot run any workflow without an active subscription.
- A tenant cannot run a workflow before installing a purchased package.
- A tenant cannot run a workflow from another industry package.
- A tenant cannot resolve prompts/rules/assets from another package.
- Business Coach package assets cannot be pulled into a Brand SEO run, and Brand SEO assets cannot be pulled into a Business Coach run.
- A tenant can run workflows included in its installed package.
- A tenant can run add-on specialist workflows only after purchasing the add-on.
- The blank-canvas premium tier starts with no prebuilt workflows.
- Customer-created blank-canvas workflows must be registered in the Wealth Factory registry before execution.
- Queue payloads include only Wealth Factory package/workflow IDs, never Paperclip internals.

## Wealth Factory Boundary Layer

This is a hard architectural requirement. Do not rely on an LLM to remember branding, privacy, or terminology rules.

All customer-facing routes and UI must pass through a deterministic TypeScript boundary layer before returning data. Paperclip responses, identifiers, errors, logs, workflow names, company mappings, prompts, skills, commands, agents, tool calls, and provider internals must never be sent directly to the browser.

Required files for the next dashboard/API build:

- Create: `src/wealthfactory/workflow-registry.ts`
- Create: `src/wealthfactory/dto-mappers.ts`
- Create: `src/wealthfactory/response-guard.ts`
- Create: `src/wealthfactory/public-errors.ts`
- Create: `tests/wealthfactory-boundary.test.ts`

The boundary layer owns:

- Public Wealth Factory workflow names, descriptions, categories, and result labels.
- Private mappings from Wealth Factory workflow IDs to Paperclip workflow/company IDs.
- Package asset lookup for allowed prompts, rules, templates, employees, and private Paperclip assets.
- DTO mapping from internal Paperclip adapter responses to Wealth Factory response objects.
- Safe public error translation, such as `workflow_failed`, `credential_invalid`, `tenant_paused`, and `service_unavailable`.
- Forbidden-term and forbidden-field checks for user-facing API responses.
- Tests proving Paperclip/internal terms cannot leak to customer-facing output.

Customer-facing DTOs should use names such as:

- `WealthFactoryWorkflowListItem`
- `WealthFactoryRunSummary`
- `WealthFactoryRunResult`
- `WealthFactoryCredentialSummary`
- `WealthFactoryAuditEventSummary`

Forbidden customer-facing terms and fields include:

- `Paperclip`
- `prompt`
- `skill`
- `command`
- `agent`
- `tool call`
- `raw activity`
- `internal log`
- `companyId`
- `secretRef`
- `service token`
- private Paperclip URLs
- raw provider responses

The UI consumes only Wealth Factory DTOs. The worker and adapter may know Paperclip identifiers internally, but those identifiers stay server-side and are never serialized into customer-visible responses.

Minimum boundary test examples:

```ts
expect(JSON.stringify(publicResponse)).not.toMatch(/Paperclip|prompt|skill|command|agent/i);
expect(JSON.stringify(publicResponse)).not.toMatch(/companyId|secretRef|service token/i);
expect(publicResponse.workflowName).toContain("Wealth Factory");
```

## Phase 0: Repository And Local Skeleton

**Outcome:** A clean repo with documented architecture, environment conventions, test commands, and deployment assumptions.

**Files:**

- Create: `package.json`
- Create: `.env.example`
- Create: `src/config/env.ts`
- Create: `src/providers/provider-types.ts`
- Create: `tests/env.test.ts`
- Create: `docs/reviewer-notes.md`

- [ ] Create a minimal TypeScript project with lint/test scripts.
- [ ] Add environment schema for Supabase URL/key, Redis URL, Paperclip base URL, and Paperclip service credential.
- [ ] Add provider type definitions for `openai` and `generic_api`.
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
- Create: `src/providers/openai-provider.ts`
- Create: `src/providers/generic-provider.ts`
- Create: `tests/secret-service.test.ts`
- Create: `tests/redaction.test.ts`

- [ ] Add secret reference data model usage without storing raw secret values in app tables.
- [ ] Implement secret registration flow for the OpenAI lane against the selected MVP secret backend.
- [ ] Store optional OpenAI project ID as non-secret provider metadata and never as an authoritative tenant identifier.
- [ ] Add a generic provider lane that can declare required secret labels and public-safe config fields.
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

## Post-MVP Phase: Wealth Factory Boundary Layer And Dashboard API

**Outcome:** The real dashboard and API use a deterministic Wealth Factory boundary layer instead of relying on model memory or ad hoc UI copy.

**Files:**

- Create: `src/wealthfactory/workflow-registry.ts`
- Create: `src/wealthfactory/dto-mappers.ts`
- Create: `src/wealthfactory/response-guard.ts`
- Create: `src/wealthfactory/public-errors.ts`
- Create: `tests/wealthfactory-boundary.test.ts`
- Modify: `src/workflows/run-service.ts`
- Modify: `src/operators/routes.ts`
- Modify: `apps/web/src/App.tsx` or replacement dashboard routes

- [ ] Write failing tests that reject Paperclip/internal terms and fields in every customer-facing DTO.
- [ ] Create the Wealth Factory workflow registry with public names/descriptions and private Paperclip mappings.
- [ ] Create DTO mappers that accept internal run/workflow/credential data and return Wealth Factory-only objects.
- [ ] Create a response guard that rejects forbidden terms and forbidden fields before API responses are returned.
- [ ] Map internal Paperclip/worker errors to Wealth Factory public error codes.
- [ ] Update workflow and run APIs to return only Wealth Factory DTOs.
- [ ] Update dashboard UI to consume only Wealth Factory DTOs.
- [ ] Add Playwright tests proving subscribers only see Wealth Factory wording, workflows, statuses, and results.
- [ ] Run `npm run build`, `npm test`, `npm run lint`, `npm run build:web`, and `npm run e2e`.
- [ ] Reviewer checks that no customer-visible API/UI response can expose Paperclip terms, prompts, skills, commands, agents, raw logs, provider secrets, backend secret handles, or private workflow identifiers.

## Post-MVP Phase: Package Entitlements And Subscription Gates

**Outcome:** Wealth Factory companies can purchase/install industry packages, subscribe monthly, buy add-on employees, and run only workflows allowed by their installed package/industry.

**Files:**

- Create: `src/packages/package-types.ts`
- Create: `src/packages/package-asset-registry.ts`
- Create: `src/packages/package-service.ts`
- Create: `src/packages/entitlement-service.ts`
- Create: `src/packages/employee-catalog.ts`
- Create: `tests/package-asset-registry.test.ts`
- Create: `tests/package-entitlements.test.ts`
- Modify: `supabase/migrations/0001_initial_tenant_model.sql` or create a new migration.
- Modify: `src/workflows/run-service.ts`
- Modify: `src/wealthfactory/workflow-registry.ts`
- Modify: `docs/dashboard-design-prep.md`

- [ ] Add package catalog types for industry packages, blank-canvas package, base employees, specialist add-ons, package workflows, and private package assets.
- [ ] Add subscription and package install data model.
- [ ] Add package asset registry that resolves prompts/rules/assets only through installed-package entitlement.
- [ ] Add entitlement service that checks active subscription, installed package, workflow membership, and add-on employee access.
- [ ] Update workflow registry so every public workflow belongs to a package or customer-created blank-canvas registry scope.
- [ ] Update workflow registry so every workflow references only allowed package assets.
- [ ] Update run creation to require active subscription and valid package/workflow entitlement before queueing.
- [ ] Add tests proving workflows cannot escape the installed package/industry boundary.
- [ ] Add tests proving package assets cannot cross package boundaries.
- [ ] Add tests proving blank-canvas tenants start with no prebuilt workflows.
- [ ] Add tests proving specialist employees are unavailable until purchased.
- [ ] Run `npm run build`, `npm test`, and `npm run lint`.
- [ ] Reviewer checks subscription gating, package isolation, blank-canvas behavior, and add-on employee entitlement enforcement.

## Post-MVP Phase: Provider Credential Expansion

**Outcome:** Wealth Factory supports company-specific OpenAI, Anthropic, xAI/Grok, OpenRouter, and optional company-isolated ChatGPT/Codex subscription auth.

**Files:**

- Modify: `src/providers/provider-types.ts`
- Modify: `src/providers/openai-provider.ts`
- Modify: `src/providers/generic-provider.ts`
- Create: `src/providers/anthropic-provider.ts`
- Create: `src/providers/xai-provider.ts`
- Create: `src/providers/openrouter-provider.ts`
- Create: `src/providers/codex-subscription-provider.ts`
- Create: `tests/provider-credential-lanes.test.ts`
- Modify: `docs/dashboard-design-prep.md`

- [ ] Add explicit provider kinds for `openai_api`, `openai_chatgpt_codex_subscription`, `anthropic_api`, `xai_grok_api`, `openrouter_api`, and `generic_api`.
- [ ] Keep OpenAI API first in UI ordering and docs as the encouraged/default lane.
- [ ] Add provider registration helpers for Anthropic, xAI/Grok, and OpenRouter API-key credentials.
- [ ] Add a Codex subscription registration shape that stores only an isolated auth-state reference, not raw tokens in customer-visible rows.
- [ ] Reject shared/global Codex auth homes in subscription registration.
- [ ] Add runtime guard tests proving `OPENAI_API_KEY` is absent when subscription mode is selected.
- [ ] Add cross-tenant tests proving provider credentials and Codex auth state cannot cross company boundaries.
- [ ] Run `npm run build`, `npm test`, and `npm run lint`.
- [ ] Reviewer checks provider isolation, secret redaction, billing attribution, and customer-facing Wealth Factory wording.

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
- OpenAI account/API-key support is covered in Phases 0 and 3, with OpenAI kept as the encouraged/default provider in post-MVP provider expansion.
- Anthropic, xAI/Grok, and OpenRouter are required post-MVP provider lanes.
- Company-isolated ChatGPT/Codex subscription auth is required before offering subscription-based Codex usage to multiple companies.
- Subscription packages and installed-package workflow boundaries are required before exposing workflows commercially.
- Paperclip invisibility is covered across all phases.
- The Wealth Factory boundary layer is required before post-MVP dashboard/API work.
- E2E tests are required in Phases 5 and 6.
- Reviewer control is required in every phase.
- Dashboard is deferred to Phase 7 by design.

No placeholders remain in this plan. The MVP is intentionally split so each phase creates testable software.
