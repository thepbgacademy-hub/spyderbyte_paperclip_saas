# SpyderByte Paperclip SaaS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MVP/POC branded SaaS wrapper, customer-facing as Wealth Factory, that uses private self-hosted Paperclip as a background workflow engine.

**Architecture:** Wealth Factory owns the public application, tenant model, BYOK handling, workflow queue, and audit surface. Paperclip is called through an internal REST adapter only and remains invisible to customers. A deterministic TypeScript boundary layer maps, rewrites, and guards all Paperclip-facing data before it can reach user-facing APIs or UI. Supabase stores app-side state and Redis/BullMQ runs async workflows.

**Tech Stack:** VPS hosting, Node.js/TypeScript, React later, Supabase, Redis, BullMQ, Paperclip REST API, Playwright CLI.

---

## Worker Rule

Subagents and implementers are not alone in the codebase. They must keep file ownership narrow, avoid reverting others' work, and adapt to existing changes. All code requires reviewer scrutiny for error and accuracy control before a phase is accepted.

## Security And Split-Origin Rule

Wealth Factory uses a split-site model: the customer portal/dashboard can be hosted on a normal website, while the backend API, workers, Redis/BullMQ, and private Paperclip runtime run on the VPS. The browser must only communicate with the Wealth Factory API over HTTPS. It must never communicate with Paperclip, Redis, workers, Supabase service-role endpoints, Docker, admin panels, or private ports.

Required implementation files for security hardening:

- Create: `src/security/cors.ts`
- Create: `src/security/rate-limit.ts`
- Create: `src/security/request-validation.ts`
- Create: `src/security/security-headers.ts`
- Create: `src/security/csrf.ts` if cookie auth is used across origins.
- Create: `tests/security-boundary.test.ts`
- Create: `tests/race-conditions.test.ts`
- Create: `deploy/runbooks/security-checklist.md`
- Modify: `deploy/docker-compose.yml`
- Modify: `deploy/nginx/spyderbyte.conf`
- Modify: `deploy/runbooks/deploy-poc.md`

Required implementation rules:

- Configure explicit portal origin allowlists. Wildcard CORS is forbidden for authenticated APIs.
- Pick one auth strategy per deployed portal/API pair: secure cookies with CSRF protection, or bearer tokens with strict issuer/audience/expiry checks.
- Keep Supabase service-role keys, Paperclip tokens, provider credentials, and secret-reference handles server-side only.
- Expose only `80` and `443` publicly on the VPS; keep Paperclip, Redis, workers, Docker, and admin/debug ports private.
- Add request schema validation, request size limits, route-level authorization, and rate limits to public routes.
- Add transactional checks for subscription status, installed package, add-on entitlement, tenant pause state, workflow membership, and provider credential status before enqueueing any workflow.
- Add idempotency keys, row locks, advisory locks, or unique constraints for run creation, package install, purchase activation, credential rotation/revoke, and queue enqueue paths.
- Add dependency/image vulnerability review before deployment.
- Add audit events for auth changes, provider credential lifecycle, package installs, entitlement changes, workflow starts, tenant pauses, operator actions, and security-relevant failures.

Required tests:

- Portal origin is allowed and an untrusted origin is rejected.
- Public APIs reject missing auth, wrong tenant, wrong role, oversized payloads, and invalid schemas.
- Tenant A cannot access Tenant B routes, rows, runs, credentials, package installs, audit events, or operator actions.
- Concurrent run creation cannot bypass subscription/package/provider checks or enqueue duplicate work.
- Credential revoke/rotate races cannot allow stale credentials to be used for new jobs.
- Queue payloads never contain raw secrets, provider tokens, Paperclip company IDs, Paperclip run IDs, prompts, skills, commands, or backend secret handles.
- Public responses pass the Wealth Factory response guard.

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

- [ ] Deploy public POC app at `www.spyderbyte.cloud` or configure the external customer portal origin.
- [x] Deploy API at `api.spyderbyte.cloud`.
- [ ] Configure CORS to allow only the portal origin(s).
- [ ] Deploy Paperclip on private network or private subdomain with authenticated mode.
- [ ] Keep Redis private.
- [ ] Expose only `80` and `443` publicly from the VPS reverse proxy.
- [x] Configure health checks.
- [ ] Run smoke tests from outside the VPS proving Paperclip, Redis, workers, Docker, Supabase service endpoints, and admin/debug ports are not publicly reachable.
- [ ] Run CORS allow/deny smoke tests.
- [ ] Run Playwright CLI E2E tests against the deployed POC.
- [ ] Reviewer checks deployment exposure and logs.
- [ ] Commit with message: `chore: add vps deployment poc`

## Phase 6.5: Security Hardening And Split-Origin Deployment

**Outcome:** The dashboard/API can be safely exposed as separate sites, with formal tenant isolation, network exposure, CORS, auth, RLS, race-condition, and vulnerability controls.

**Files:**

- Create: `src/security/cors.ts`
- Create: `src/security/rate-limit.ts`
- Create: `src/security/request-validation.ts`
- Create: `src/security/security-headers.ts`
- Create: `src/security/csrf.ts` if cookie auth is used.
- Create: `tests/security-boundary.test.ts`
- Create: `tests/race-conditions.test.ts`
- Create: `deploy/runbooks/security-checklist.md`
- Modify: `deploy/docker-compose.yml`
- Modify: `deploy/nginx/spyderbyte.conf`
- Modify: `deploy/runbooks/deploy-poc.md`
- Modify: `supabase/migrations/0001_initial_tenant_model.sql` or add focused security migrations.

- [ ] Define the customer portal origin and backend API origin for the POC and production target.
- [ ] Add explicit CORS allowlist handling for the portal origin.
- [ ] Implement the selected auth/session strategy and CSRF protection if using cross-origin cookies.
- [ ] Add route-level auth, tenant membership, operator-role, request size, and schema validation middleware.
- [ ] Add rate limits for auth-sensitive, workflow-start, provider-credential, package-install, and operator routes.
- [ ] Add security headers at the reverse proxy or app layer.
- [ ] Harden Docker Compose so only the reverse proxy binds public ports.
- [ ] Add outside-the-VPS port exposure checks to the deployment runbook.
- [ ] Add transactional entitlement checks and idempotency guards before queue enqueue.
- [ ] Add race-condition tests for run creation, package install, entitlement change, tenant pause, and credential revoke/rotate.
- [ ] Add RLS tests for all tenant-owned package, provider, workflow, run, and audit rows.
- [ ] Add vulnerability scan instructions for dependencies and deployment images.
- [ ] Run `npm run build`, `npm test`, `npm run lint`, and deployed smoke checks.
- [ ] Reviewer checks split-origin auth, CORS, RLS, exposed ports, race-condition controls, vulnerability posture, and audit coverage.

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
- Create: `src/packages/package-provider-requirements.ts`
- Create: `tests/package-asset-registry.test.ts`
- Create: `tests/package-entitlements.test.ts`
- Create: `tests/package-provider-requirements.test.ts`
- Modify: `supabase/migrations/0001_initial_tenant_model.sql` or create a new migration.
- Modify: `src/workflows/run-service.ts`
- Modify: `src/wealthfactory/workflow-registry.ts`
- Modify: `docs/dashboard-design-prep.md`

- [ ] Add package catalog types for industry packages, blank-canvas package, base employees, specialist add-ons, package workflows, and private package assets.
- [ ] Add package-specific required and optional provider lane metadata.
- [ ] Add subscription and package install data model.
- [ ] Add package asset registry that resolves prompts/rules/assets only through installed-package entitlement.
- [ ] Add entitlement service that checks active subscription, installed package, workflow membership, add-on employee access, and package provider requirements.
- [ ] Update workflow registry so every public workflow belongs to a package or customer-created blank-canvas registry scope.
- [ ] Update workflow registry so every workflow references only allowed package assets.
- [ ] Update workflow registry so workflows request provider capabilities allowed by the installed package, such as `text_generation`, `image_generation`, `video_generation`, `social_publishing`, or `media_storage`.
- [ ] Update run creation to require active subscription and valid package/workflow entitlement before queueing.
- [ ] Add setup-state APIs so installed packages can ask for extra BYOK connections after install rather than during initial signup.
- [ ] Add tests proving workflows cannot escape the installed package/industry boundary.
- [ ] Add tests proving package assets cannot cross package boundaries.
- [ ] Add tests proving package-specific provider requirements are enforced before run creation.
- [ ] Add tests proving optional provider lanes unlock optional workflows/capabilities without becoming global tenant permissions.
- [ ] Add tests proving blank-canvas tenants start with no prebuilt workflows.
- [ ] Add tests proving specialist employees are unavailable until purchased.
- [ ] Run `npm run build`, `npm test`, and `npm run lint`.
- [ ] Reviewer checks subscription gating, package isolation, package-specific BYOK requirements, blank-canvas behavior, and add-on employee entitlement enforcement.

Example package-provider behavior:

- A Social Media package may require OpenAI for planning and captions.
- The same package may optionally support Google Gemini/Nano Banana-style image generation, Higgsfield image/video generation, OpenRouter creative model access, social publishing APIs, and media storage/CDN providers.
- Those keys are collected after package install or when a workflow requiring that capability is first enabled.
- Connecting a creative provider for Social Media does not authorize unrelated packages to use that provider unless their package definitions and tenant entitlements also allow it.

## Post-MVP Phase: Temporary Artifacts And Customer-Owned Storage

**Outcome:** Wealth Factory can generate reports, decks, images, and videos without becoming the customer's permanent storage/CDN provider.

**Files:**

- Create: `src/artifacts/artifact-types.ts`
- Create: `src/artifacts/artifact-service.ts`
- Create: `src/artifacts/artifact-cleanup-worker.ts`
- Create: `src/artifacts/download-links.ts`
- Create: `src/storage/storage-provider-types.ts`
- Create: `src/storage/google-drive-provider.ts`
- Create: `src/storage/dropbox-provider.ts`
- Create: `tests/artifact-service.test.ts`
- Create: `tests/artifact-cleanup.test.ts`
- Create: `tests/storage-provider-connectors.test.ts`
- Modify: `supabase/migrations/0001_initial_tenant_model.sql` or add an artifact/storage migration.
- Modify: `src/workflows/run-service.ts`
- Modify: `src/packages/package-provider-requirements.ts`

- [ ] Add artifact metadata tables for tenant ID, run ID, package ID, type, filename/title, MIME type, byte size, checksum/hash, created time, expiration time, purge status, and export status.
- [ ] Store generated artifact blobs in temporary private storage only.
- [ ] Set default artifact TTL to `24 hours`.
- [ ] Add a cleanup worker that purges expired blobs and leaves lightweight metadata.
- [ ] Add authenticated tenant-scoped download links with short expiration.
- [ ] Forbid public unauthenticated artifact URLs.
- [ ] Add per-artifact, per-run, and per-tenant temporary storage limits.
- [ ] Add audit events for artifact created, downloaded, exported, expired, and purged.
- [ ] Add customer-owned storage connector types for Google Drive, Dropbox, OneDrive/SharePoint, customer S3-compatible storage, and customer-owned Supabase Storage.
- [ ] Implement Google Drive and Dropbox connectors first if storage export is needed for the first media-heavy package.
- [ ] Store storage connector OAuth tokens, refresh tokens, bucket credentials, and folder IDs by secret reference only.
- [ ] Add package `media_storage` capability requirements so media-heavy packages can prompt for customer-owned storage after install.
- [ ] Add tests proving expired artifacts are not downloadable after purge.
- [ ] Add tests proving Tenant A cannot download, export, list, or infer Tenant B artifacts.
- [ ] Add tests proving queue payloads do not contain artifact blobs, OAuth tokens, refresh tokens, bucket credentials, or private storage paths.
- [ ] Reviewer checks storage cost controls, artifact TTL behavior, connector secret handling, tenant isolation, and audit coverage.

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
- Generated artifacts expire and are no longer downloadable after the configured TTL.
- Tenant A cannot download, export, list, or infer Tenant B generated artifacts.
- API responses do not include Paperclip prompt, skill, command, agent, raw activity, or internal log fields.
- Workflow run can be queued, processed, completed, and displayed as SpyderByte output.
- Operator-only pages are inaccessible to regular tenant users.

## Post-MVP Phase: API-Backed Dashboard Foundation

**Outcome:** The POC dashboard has a tested customer-facing HTTP boundary and Supabase-backed read repositories for the `wfpc` schema.

**Files:**

- Create: `src/api/dashboard-http.ts`
- Create: `src/api/tenant-settings-api.ts`
- Create: `src/db/supabase-repositories.ts`
- Create: `src/db/postgres-client.ts`
- Create: `scripts/apply-wfpc-migration.mjs`
- Create: `tests/dashboard-http.test.ts`
- Create: `tests/supabase-repositories.test.ts`
- Create: `tests/tenant-settings-api.test.ts`
- Create: `tests/postgres-client.test.ts`
- Create: `tests/dashboard-client.test.ts`
- Modify: `apps/web/src/dashboard-client.ts`

- [x] Add repeat-safe live Supabase schema helper for `wfpc`.
- [x] Add a dashboard HTTP handler with explicit CORS allowlist, request size guard, rate limiting, security headers, auth, and response guard.
- [x] Add Supabase repository mappers for dashboard workflows, packages, artifacts, provider connections, and tenant membership.
- [x] Add a Postgres query client factory that supports self-hosted Supabase pooler connections with `SUPABASE_DB_SSL=false`.
- [x] Add provider credential registration API for company-specific OpenAI, Anthropic, xAI/Grok, OpenRouter, Codex subscription, and generic provider lanes.
- [x] Add customer-owned storage connector registration API that returns public summaries only.
- [x] Add dashboard client API fetch/mapping behavior.
- [x] Run live Supabase schema reachability check against the VPS-hosted database.
- [x] Run `npm run build`, `npm test`, `npm run lint`, `npm run build:web`, and `npm run e2e`.

Next work after this phase:

- [ ] Add the deployed API server/runtime entrypoint and compose `createDashboardApi`, `connectPgQueryClient`, and `createSupabaseRepositories`.
- [ ] Replace remaining in-memory write paths with Supabase transactions, idempotency keys, and route-level authorization.
- [ ] Connect provider credential registration to the selected vault backend.
- [ ] Implement Google Drive and Dropbox OAuth for storage connector setup.
- [ ] Run external VPS smoke tests for CORS, auth failures, exposed ports, and response-guarded DTOs.

## Post-MVP Phase: ACID And Race-Condition Database Foundation

**Outcome:** Workflow run creation and related commercial write paths have durable database primitives for idempotency and race protection.

**Files:**

- Create: `supabase/migrations/0002_acid_race_guards.sql`
- Create: `src/db/acid-guard-repository.ts`
- Create: `tests/acid-migration.test.ts`
- Create: `tests/acid-guard-repository.test.ts`
- Modify: `scripts/apply-wfpc-migration.mjs`

- [x] Add `wfpc.workflow_run_reservations` with `unique (tenant_id, workflow_template_id, idempotency_key)` and unique `run_id`.
- [x] Enable RLS on `wfpc.workflow_run_reservations` with no public policies.
- [x] Add active credential uniqueness for `(tenant_id, provider_kind, label) where revoked_at is null`.
- [x] Add `(tenant_id, secret_ref)` lookup uniqueness for secret-reference lifecycle operations.
- [x] Add workflow run status guard index for conditional transitions.
- [x] Add transactional repository methods for workflow run reservation, package install upsert, credential revoke, and guarded workflow status transition.
- [x] Apply the migration to live Supabase and verify `wfpc` reports 14 tables.
- [x] Run `npm run build`, `npm test`, and `npm run lint`.

Next work after this phase:

- [x] Replace the in-memory `run-creation-gate` usage with `createAcidGuardRepository.reserveWorkflowRun`.
- [x] Wire worker status callbacks to `transitionWorkflowRunStatus` so terminal states cannot be overwritten.
- [x] Wire credential revoke service adapter to the ACID repository.
- [x] Add authoritative package purchase storage and wire package install authorization into the same transaction as the install upsert.
- [x] Add queue enqueue transaction/outbox behavior before production deployment.

## Post-MVP Phase: Runtime Wiring Foundation

**Outcome:** The VPS API has a Node runtime adapter for the guarded dashboard HTTP boundary, and workflow write paths have explicit ACID-backed composition points.

**Files:**

- Create: `src/api/runtime-server.ts`
- Create: `src/workflows/acid-run-reservation.ts`
- Create: `src/workflows/acid-status-recorder.ts`
- Create: `tests/runtime-server.test.ts`
- Create: `tests/acid-run-reservation.test.ts`
- Create: `tests/acid-status-recorder.test.ts`
- Modify: `src/db/postgres-client.ts`
- Modify: `.env.example`

- [x] Add split-origin runtime env validation for `SUPABASE_DB_URL`, `SUPABASE_DB_SSL`, explicit `WF_ALLOWED_ORIGINS`, and `WF_API_PORT`.
- [x] Add a Node HTTP request adapter that calls `createDashboardHttpHandler`.
- [x] Compose the dashboard runtime with a Postgres pool, `createSupabaseRepositories`, `createDashboardApi`, CORS, security headers, and rate limiting.
- [x] Add a DB-backed workflow run reservation facade that enqueues only after `createAcidGuardRepository.reserveWorkflowRun` succeeds.
- [x] Add recoverable duplicate handling for committed reservations that were not queued.
- [x] Add a DB-backed worker status recorder that uses guarded status transitions.
- [x] Run focused runtime and ACID adapter tests.

Next work after this phase:

- [x] Add an executable server bootstrap path that serves an authenticated HTML shell with injected dashboard bootstrap JSON when `WF_WEB_APP_ENTRY_URL` is configured, with same-site session-cookie support and optional `WF_WEB_APP_STYLESHEET_URL`.
- [ ] Add queue enqueue transaction/outbox behavior before production deployment.
- [ ] Add external VPS smoke tests for the runtime adapter, CORS, auth failure, and response guard.
- [x] Add static asset hosting or reverse-proxy integration for the configured app entry URL so the HTML shell and frontend bundle can ship together in deployment.
  - [x] Codify the current session stance as same-site cookie bootstrap on the API origin, not full cross-origin cookie auth.
- [x] Add an opt-in deployed Playwright gate (`npm run e2e:live`) that verifies the current unauthenticated browser contract against the live API origin and can exercise the authenticated shell when a deploy-safe cookie is supplied.
- [x] Document a reversible VPS operator sequence for temporarily restricting exposed Supabase/Kong ports, rolling out shell env vars, rerunning deployment checks, and reopening ports if other in-progress builds still depend on them.

## Post-MVP Phase: ACID Package And Credential Service Adapter Prep

**Outcome:** Credential revoke uses the transactional Supabase guard repository, and package install has an adapter ready for the authoritative purchase table needed to make install authorization transactional.

**Files:**

- Create: `src/packages/acid-package-install-service.ts`
- Create: `src/secrets/acid-secret-revoke-service.ts`
- Create: `tests/acid-package-install-service.test.ts`
- Create: `tests/acid-secret-revoke-service.test.ts`

- [x] Add a package install adapter that verifies tenant purchase authorization before install while the authoritative purchase table is pending.
- [x] Add a credential revoke adapter that resolves secret references server-side and calls `createAcidGuardRepository.revokeCredential`.
- [x] Ensure already-revoked credentials still retry vault cleanup, then fail closed without audit.
- [x] Ensure audit output uses the database secret reference ID and never logs secret-reference handles.
- [x] Run focused ACID service wiring tests.

Next work after this phase:

- [x] Add an authoritative package purchase/entitlement table and check it inside the package install transaction.
- [x] Add a durable outbox for queue enqueue after workflow reservation.
- [ ] Connect provider credential registration to the selected vault backend.
- [ ] Add external VPS smoke tests for CORS, auth failure, exposed ports, and response guard.

## Post-MVP Phase: Authoritative Package Purchase Guard

**Outcome:** Package install authorization is now an authoritative Supabase transaction, not a preflight app check.

**Files:**

- Create: `supabase/migrations/0003_package_purchase_guards.sql`
- Create: `tests/package-purchase-migration.test.ts`
- Modify: `src/db/acid-guard-repository.ts`
- Modify: `src/packages/acid-package-install-service.ts`
- Modify: `scripts/apply-wfpc-migration.mjs`
- Modify: `tests/acid-guard-repository.test.ts`
- Modify: `tests/acid-package-install-service.test.ts`

- [x] Add `wfpc.tenant_package_purchases` with tenant/package uniqueness, active/cancelled/expired/refunded states, start/end windows, RLS, and tenant member read policy.
- [x] Add a live migration readiness check for the purchase table, active index, uniqueness, RLS, and member read policy.
- [x] Change `createAcidGuardRepository.installPackage` to lock/check active purchase rows inside the same transaction as the install upsert.
- [x] Change the package install service adapter to trust the repository's transactional install decision.
- [x] Apply the migration to live Supabase and verify `wfpc` reports 15 tables.
- [x] Run focused package purchase guard tests.

Next work after this phase:

- [x] Add a durable queue outbox table and recovery worker for post-reservation enqueue reliability.
- [ ] Connect provider credential registration to the selected vault backend.
- [ ] Add external VPS smoke tests for CORS, auth failure, exposed ports, and response guard.

## Post-MVP Phase: Durable Workflow Queue Outbox

**Outcome:** A committed workflow reservation can always be recovered and enqueued later, even if Redis/BullMQ enqueue fails after the database transaction commits.

**Files:**

- Create: `supabase/migrations/0004_workflow_queue_outbox.sql`
- Create: `src/workflows/queue-outbox-worker.ts`
- Create: `src/workflows/queue-outbox-pump.ts`
- Create: `tests/queue-outbox-migration.test.ts`
- Create: `tests/queue-outbox-worker.test.ts`
- Create: `tests/queue-outbox-pump.test.ts`
- Modify: `src/db/acid-guard-repository.ts`
- Modify: `src/workflows/acid-run-reservation.ts`
- Modify: `src/api/runtime-server.ts`
- Modify: `scripts/apply-wfpc-migration.mjs`
- Modify: `tests/acid-guard-repository.test.ts`
- Modify: `tests/acid-run-reservation.test.ts`
- Modify: `tests/runtime-server.test.ts`

- [x] Add `wfpc.workflow_queue_outbox` with private RLS, run/idempotency uniqueness, pending lookup index, attempt counts, retry timestamps, and last-error tracking.
- [x] Insert an outbox row inside the same transaction that reserves a workflow run.
- [x] Mark outbox rows `enqueued` only after the external queue accepts the job.
- [x] Add a recovery worker that claims pending/failed/stale-claimed outbox rows with `for update skip locked`, enqueues them through the idempotent `enqueueOnce` queue contract, marks success with claim-token fencing, or releases them for retry.
- [x] Wire a runtime outbox pump into `createDashboardRuntime` when a queue enqueuer is provided, so the production runtime can drain pending jobs at a fixed interval without overlapping drain attempts.
- [x] Apply the migration to live Supabase and verify `wfpc` reports 16 tables.
- [x] Run focused outbox/runtime tests with 133 passing tests in the full Vitest suite.

Next work after this phase:

- [x] Connect provider credential registration to the selected vault backend.
- [ ] Add external VPS smoke tests for CORS, auth failure, exposed ports, and response guard.

## Post-MVP Phase: Vault-Backed Provider Credential Registration

**Outcome:** Company BYOK credentials are accepted through Wealth Factory, stored only as encrypted vault material behind opaque references, persisted in Supabase as `wfpc.secret_references`, and returned to the browser only as public provider connection summaries.

**Files:**

- Create: `src/secrets/encrypted-vault.ts`
- Create: `src/secrets/postgres-vault-store.ts`
- Create: `src/secrets/provider-credential-service.ts`
- Create: `src/secrets/vault-backed-provider-registration.ts`
- Create: `supabase/migrations/0005_private_encrypted_vault.sql`
- Create: `tests/encrypted-vault.test.ts`
- Create: `tests/postgres-vault-store.test.ts`
- Create: `tests/private-vault-migration.test.ts`
- Create: `tests/provider-credential-service.test.ts`
- Create: `tests/vault-backed-provider-registration.test.ts`
- Modify: `src/secrets/secret-service.ts`
- Modify: `src/db/supabase-repositories.ts`
- Modify: `src/providers/provider-types.ts`
- Modify: `tests/secret-service.test.ts`
- Modify: `tests/supabase-repositories.test.ts`

- [x] Add AES-GCM encrypted vault backend abstraction with tenant ownership checks and opaque `wf_secret_*` handles.
- [x] Add private Postgres-backed encrypted vault storage in `wfpc_private.vault_secrets`, with RLS enabled and no authenticated/browser grants.
- [x] Add vault-backed provider credential registration composition that connects vault storage, Supabase secret-reference persistence, and public connection responses.
- [x] Support OpenAI API, Anthropic, xAI/Grok, OpenRouter, and generic API credential lanes through the same path.
- [x] Keep raw provider keys out of Supabase repository calls, audit metadata, public API responses, DTOs, and tests.
- [x] Preserve `openai_api` as the explicit OpenAI BYOK lane.
- [x] Apply the private encrypted vault migration to live Supabase and verify the helper is idempotent.
- [x] Run full lint/build/test/web-build/e2e pass with 156 unit tests and 3 Playwright E2E tests passing.

Next work after this phase:

- [x] Add real OAuth flows for Google Drive and Dropbox storage connectors.
- [ ] Add external VPS smoke tests for CORS, auth failure, exposed ports, and response guard.

## Post-MVP Phase: Customer-Owned Storage OAuth

**Outcome:** Google Drive and Dropbox connector setup can run through OAuth with PKCE, exchange callback codes server-side, store OAuth tokens in the private encrypted vault, and persist connector secret references outside browser-readable tables.

**Files:**

- Create: `src/storage/storage-oauth-service.ts`
- Create: `src/api/storage-oauth-http.ts`
- Create: `supabase/migrations/0006_vault_storage_secret_kinds.sql`
- Create: `supabase/migrations/0007_private_storage_connector_secrets.sql`
- Create: `supabase/migrations/0008_storage_connector_tenant_fk.sql`
- Create: `tests/storage-oauth-service.test.ts`
- Create: `tests/storage-oauth-http.test.ts`
- Create: `tests/vault-storage-kind-migration.test.ts`
- Create: `tests/private-storage-connector-secrets-migration.test.ts`
- Create: `tests/storage-connector-tenant-fk-migration.test.ts`
- Modify: `src/secrets/encrypted-vault.ts`
- Modify: `src/secrets/postgres-vault-store.ts`
- Modify: `src/db/supabase-repositories.ts`
- Modify: `scripts/apply-wfpc-migration.mjs`
- Modify: `tests/supabase-repositories.test.ts`

- [x] Add Google Drive and Dropbox OAuth provider configuration with PKCE authorization URLs.
- [x] Add runtime-reachable OAuth begin/callback routes for Google Drive and Dropbox storage connectors.
- [x] Add callback exchange that requires offline refresh-token access, stores `accessToken`/`refreshToken` in the encrypted vault, and returns only public connector summaries.
- [x] Allow private vault rows to represent storage provider secret kinds directly.
- [x] Add `wfpc_private.storage_connector_secrets` so connector secret references stay outside browser-readable `wfpc.storage_connectors`.
- [x] Add same-tenant FK enforcement between public storage connector rows and private connector secret rows.
- [x] Reject browser-supplied secret-reference registration for Google Drive/Dropbox; those providers must use the OAuth setup path.
- [x] Apply storage OAuth/vault migrations to live Supabase and verify the helper is idempotent.

Next work after this phase:

- [ ] Add external VPS smoke tests for CORS, auth failure, exposed ports, and response guard.

## Self-Review

Coverage check:

- VPS hosting is covered in Phase 6.
- Split-site portal/API deployment and VPS exposure security are covered in Phase 6.5.
- Supabase is covered in Phase 2.
- RLS, route authorization, CORS, rate limits, exposed ports, race-condition controls, and vulnerability checks are explicit security gates.
- Redis/BullMQ is covered in Phase 1.
- BYOK is covered in Phase 3.
- OpenAI account/API-key support is covered in Phases 0 and 3, with OpenAI kept as the encouraged/default provider in post-MVP provider expansion.
- Anthropic, xAI/Grok, and OpenRouter are required post-MVP provider lanes.
- Company-isolated ChatGPT/Codex subscription auth is required before offering subscription-based Codex usage to multiple companies.
- Subscription packages and installed-package workflow boundaries are required before exposing workflows commercially.
- Generated assets use temporary download-first storage by default, with customer-owned Google Drive/Dropbox/other storage connectors as the long-term option.
- Paperclip invisibility is covered across all phases.
- The Wealth Factory boundary layer is required before post-MVP dashboard/API work.
- E2E tests are required in Phases 5 and 6.
- Reviewer control is required in every phase.
- Dashboard is deferred to Phase 7 by design.

No placeholders remain in this plan. The MVP is intentionally split so each phase creates testable software.
