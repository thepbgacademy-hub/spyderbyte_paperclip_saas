# Handoff: Current Build Position

This handoff is intentionally overwritten after each phase. It now describes the exact current build position and the next continuation point for a fresh session.

## Status

Phases 0 through 7 are complete, tested, reviewed, and committed.

The first post-MVP productization slices are implemented locally: security baseline helpers, Wealth Factory boundary layer, package entitlements/provider requirements, temporary artifacts, expanded provider definitions, a Wealth Factory dashboard POC surface, the first API-backed dashboard foundation, and the first database-backed ACID/race-condition foundation.

The next session should continue from the live VPS API deployment that now answers behind `api.spyderbyte.cloud`, then finish the remaining commercial hardening gaps.

## Reference Docs

- `docs/design.md`
- `docs/build.md`
- `docs/recovery-2026-05-16.md`
- `docs/recovery-backup-2026-05-14.md`
- `docs/dashboard-design-prep.md`
- `docs/reviewer-notes.md`
- `deploy/runbooks/deploy-poc.md`
- `deploy/runbooks/incident-response.md`
- `TODO.md`

## Product Position

Wealth Factory is the customer-facing SaaS. Paperclip is private infrastructure.

Customers subscribe as companies. Each subscribing company must see only Wealth Factory wording, workflows, credentials, runs, results, billing, and support language. Customers must never see Paperclip names, prompts, skills, commands, agents, raw logs, tool calls, private company mappings, backend secret handles, service tokens, or private workflow-engine identifiers.

Do not rely on LLM memory or prompt instructions to enforce this rebrand. The product boundary must be deterministic TypeScript code and tests.

## Completed In Current Slice

- Security baseline helpers in `src/security/cors.ts` and `src/security/rate-limit.ts`.
- Wealth Factory boundary layer in `src/wealthfactory/*`.
- Package entitlement and asset registry primitives in `src/packages/*`.
- Expanded provider lane definitions and Codex subscription validation in `src/providers/provider-types.ts`.
- Worker-level entitlement re-checks in `src/workflows/worker.ts` so stale/replayed jobs fail closed before private workflow calls.
- Temporary artifact service in `src/artifacts/artifact-service.ts`.
- Customer-owned storage provider definitions in `src/storage/storage-provider-types.ts`.
- Customer-owned storage connector registry in `src/storage/storage-connector-service.ts`.
- Authenticated dashboard API DTO primitive in `src/api/dashboard-api.ts`.
- Supabase schema coverage for packages, package installs, provider requirements, artifact metadata, and storage connectors.
- Dashboard client abstraction in `apps/web/src/dashboard-client.ts`.
- API-backed dashboard client fetch mapping in `apps/web/src/dashboard-client.ts`.
- Dashboard HTTP boundary in `src/api/dashboard-http.ts`.
- Tenant settings API for provider credentials and storage connectors in `src/api/tenant-settings-api.ts`.
- Supabase `wfpc` repository mappers in `src/db/supabase-repositories.ts`.
- Self-hosted Supabase pooler Postgres client factory in `src/db/postgres-client.ts`.
- ACID guard repository in `src/db/acid-guard-repository.ts`.
- Runtime server adapter in `src/api/runtime-server.ts`.
- ACID workflow run reservation facade in `src/workflows/acid-run-reservation.ts`.
- ACID worker status recorder in `src/workflows/acid-status-recorder.ts`.
- ACID package install service in `src/packages/acid-package-install-service.ts`.
- ACID credential revoke service in `src/secrets/acid-secret-revoke-service.ts`.
- Repeat-safe live schema helper in `scripts/apply-wfpc-migration.mjs`.
- ACID guard migration in `supabase/migrations/0002_acid_race_guards.sql`.
- Wealth Factory dashboard POC updates in `apps/web/src/App.tsx`.
- Tests for security, boundary, entitlements, artifacts, provider lanes, and E2E dashboard behavior.
- Tests for dashboard HTTP, dashboard client mapping, Supabase repository mappers, Postgres client behavior, and tenant settings APIs.
- Provider enum support in the initial Supabase migration and DB types for OpenAI API, ChatGPT/Codex subscription auth, Anthropic, xAI/Grok, OpenRouter, and generic providers.
- Live Supabase reachability confirmed from Windows through the self-hosted pooler with `SUPABASE_DB_SSL=false`; `wfpc` has 16 tables.
- Live Supabase now includes `wfpc.workflow_run_reservations` with RLS enabled, idempotency uniqueness, active credential uniqueness, secret lookup, and status guard indexes.
- Live Supabase now includes `wfpc.tenant_package_purchases` with RLS enabled, tenant/package uniqueness, and active purchase lookup support.
- Live Supabase now includes `wfpc.workflow_queue_outbox` with RLS enabled, idempotent run/workflow uniqueness, pending/stale-claimed lookup support, claim-token fencing, backfill repair for queued reservations, and recovery worker/pump wiring in the runtime factory.
- Provider credential registration now has a vault-backed path: encrypted secret material is persisted in private `wfpc_private.vault_secrets` behind opaque `wf_secret_*` handles, while `wfpc.secret_references` stores only the handle, provider kind, label, and public metadata.
- Public provider registration responses now return only `{ providerKind, label, connected, metadata }`; no `secretRef`, vault handle, API key, token, or raw credential leaves the backend boundary.
- Google Drive and Dropbox storage connector setup now has runtime-reachable OAuth/PKCE begin/callback routes. The callback exchange requires offline refresh-token access, stores OAuth tokens in the encrypted vault, and persists connector secret references in private `wfpc_private.storage_connector_secrets`.
- Private storage connector secret rows now have same-tenant FK enforcement back to public `wfpc.storage_connectors`; OAuth public targets are sanitized before persistence, and browser-supplied Google Drive/Dropbox secret-reference registration is rejected.

## Next Build Order

1. Fix VPS external exposure once the multi-project port plan is finalized: `5432` and `8000` are currently reachable from outside and must be firewall/allowlist restricted before commercial exposure. `8443` now probes closed externally.
2. Decide whether the storage OAuth routes should remain unavailable until Google Drive/Dropbox client credentials are configured, or whether the smoke gate should treat `503 {"code":"storage_oauth_unavailable"}` as an expected pre-config state.
3. Add the tenant-scoped provider runtime cutover so Wealth Factory resolves each tenant's allowed provider, fetches that tenant's vault-backed credential just-in-time in the worker, and injects it into Paperclip per run. Keep operator/shared credentials available only as explicit debug/test fallback until the tenant path is verified, then disable the shared fallback for normal subscriber production runs.
4. Wire the BullMQ consumer/dequeue loop to the worker runtime using the new conservative concurrency defaults and per-tenant fairness gate, then verify one tenant cannot monopolize execution slots under parallel load.
5. Re-run `npm run smoke:external` after the final firewall/allowlist policy is applied; it is now the repeatable external gate for DNS, intended ports, private ports, auth/CORS route behavior, and response leak checks.
6. Confirm the VPS runtime keeps using `createPostgresEncryptedVaultStore` with a strong `WF_VAULT_MASTER_KEY` and rotate the static bearer token when the tenant-aware auth layer replaces it.

## Security Position

Wealth Factory will be sold to many companies. Security must cover user data, provider keys, PII, public APIs, exposed ports, vulnerabilities, race conditions, and Supabase RLS before commercial exposure.

The intended deployment is split-origin:

- The customer portal/dashboard can be hosted on a regular public website.
- The backend API, workers, Redis/BullMQ, and private Paperclip runtime run on the VPS.
- The browser calls only the Wealth Factory API over HTTPS.
- Paperclip, Redis, workers, Docker, admin/debug ports, Supabase service-role operations, and private service tokens remain server-side/private.
- Public VPS exposure should be limited to `80` and `443` through the reverse proxy.
- `api.spyderbyte.cloud` now proxies to a live `wealth-factory-api` container on the `supabase_default` Docker network through `supabase-caddy`.
- The live API container uses the internal Supabase Docker route `postgresql://postgres:<password>@supabase-db:5432/postgres` with `SUPABASE_DB_SSL=false`, not the public pooler URL.
- External checks now pass for API TLS, health, unauthorized dashboard rejection, allowed-origin CORS, and authenticated dashboard responses.
- Current external smoke still fails because `5432` and `8000` remain publicly reachable, and because storage OAuth is intentionally unconfigured so `/api/storage/oauth/google_drive/begin` returns `503 {"code":"storage_oauth_unavailable"}` without provider client IDs.
- CORS must allow only the configured portal origin(s). Wildcard CORS is forbidden for authenticated APIs.
- If cross-origin cookies are used, add `Secure`, `HttpOnly`, correct `SameSite`, and CSRF protection. If bearer tokens are used, validate issuer, audience, expiry, membership, and role.
- Supabase service-role keys, Paperclip tokens, provider credentials, and secret-reference handles must never reach browser code.

Required security files for the next roadmap:

- `src/security/cors.ts` exists.
- `src/security/rate-limit.ts` exists.
- `src/security/request-validation.ts` still needs full route integration beyond the dashboard HTTP primitive.
- `src/security/security-headers.ts` can be split from `cors.ts` when the HTTP layer is added.
- `src/security/csrf.ts` if cookie auth is used.
- `tests/security-boundary.test.ts` exists.
- `tests/race-conditions.test.ts`
- `deploy/runbooks/security-checklist.md`

Security tests to preserve:

- CORS allow/deny tests for portal and untrusted origins.
- RLS positive and negative tenant tests.
- Route-level tenant and operator authorization tests.
- Race-condition/idempotency tests for run creation, package install, entitlement change, tenant pause, and credential revoke/rotate.
- Database-backed ACID tests for workflow reservation, package install idempotency, credential revoke locks, and guarded status transitions.
- Queue payload tests proving no raw secrets or Paperclip internals are enqueued.
- Response-guard tests proving customer-facing responses contain only Wealth Factory terms and fields.
- Outside-the-VPS exposed-port smoke tests.
- Dependency and image vulnerability checks before deploy.

## Commercial Package Position

Wealth Factory is sold in monthly subscription packages.

- Each package is prebuilt for a specific industry, except the premium blank-canvas package.
- A package is a governed bundle of prompts, rules, allowed assets, workflows, employees, dashboards/templates, and result views.
- A company purchases a package and installs it from its dashboard.
- Initial signup should stay minimal; package-specific BYOK connections are requested after package install or when a workflow capability requires them.
- The installed package defines the company's allowed workflow/industry boundary.
- A workflow may never run outside the installed package/industry boundary.
- A workflow may only pull prompts/rules/assets from the installed package's allowed asset registry.
- A workflow may only use provider lanes allowed by the installed package and connected by the tenant.
- Business Coach and Brand SEO are examples of separate packages with separate asset registries; they must not cross-load each other's prompts, rules, employees, templates, or Paperclip mappings.
- Social Media is an example of a package that can require extra creative BYOK lanes such as image generation, video generation, social publishing, or media storage providers after install.
- Wealth Factory ships with basic CEO/CFO-style employees.
- Specialist employees are paid add-ons.
- Add-on employees and workflows remain scoped to the installed package/industry unless separately purchased.
- The premium blank-canvas tier starts with no prebuilt packages/workflows; the user designs the business from scratch.
- Subscription status and package/add-on entitlements must be checked before workflow run creation.

Required package files for the next roadmap:

- `src/packages/package-types.ts` exists.
- `src/packages/package-asset-registry.ts` exists.
- `src/packages/package-service.ts` still needs Supabase-backed install/list behavior.
- `src/packages/entitlement-service.ts` exists.
- `src/packages/employee-catalog.ts`
- `src/packages/package-provider-requirements.ts` exists.
- `tests/package-asset-registry.test.ts` can be split from the current entitlement test later.
- `tests/package-entitlements.test.ts` exists.
- `tests/package-provider-requirements.test.ts`

Package-specific provider nuance:

- Package definitions should declare required and optional provider lanes by capability, not just vendor.
- Useful capability labels include `text_generation`, `image_generation`, `video_generation`, `social_publishing`, and `media_storage`.
- A Social Media package might require OpenAI and optionally support Google Gemini/Nano Banana-style image generation, Higgsfield image/video, OpenRouter creative models, and later Meta/TikTok/YouTube/LinkedIn/X publishing APIs.
- Connecting a provider for one package does not make it globally available to all packages.
- Run creation must verify active subscription, installed package, workflow entitlement, provider lane allowlist, and valid non-revoked tenant credential before queueing work.

## Generated Artifact Storage Position

Wealth Factory should not be the default long-term storage/CDN provider for customer-generated reports, PDFs, slide decks, images, videos, source files, or raw media blobs.

Default rule:

- Generated artifacts are temporary.
- Default TTL is `24 hours`.
- Downloads are authenticated, tenant-scoped, and short-lived.
- Expired artifacts are purged by a cleanup worker.
- Wealth Factory keeps lightweight metadata, audit events, and small workflow context only.
- Public unauthenticated artifact URLs are forbidden.

Retain metadata such as artifact ID, tenant ID, run ID, package ID, artifact type, filename/title, MIME type, byte size, checksum/hash, created time, expiration time, purge status, and export status.

Preferred long-term storage path:

- Customer-owned Google Drive.
- Customer-owned Dropbox.
- Customer-owned OneDrive/SharePoint.
- Customer-owned S3-compatible storage such as S3, Cloudflare R2, Backblaze B2, or MinIO.
- Customer-owned Supabase Storage.

Storage connector nuance:

- Storage connectors are BYOK/bring-your-own-account integrations scoped to the tenant.
- Packages can declare optional or required `media_storage` capabilities.
- A Social Media package can use 24-hour download-only delivery by default, then offer Google Drive/Dropbox export for long-term media libraries.
- OAuth tokens, refresh tokens, bucket credentials, folder IDs, and private storage paths must be secret-reference based and absent from browser responses and queue payloads.
- A normal web app cannot silently save large generated assets to a user's local machine. Browser download is the MVP path; local SQLite/file storage belongs in a possible future desktop companion.

## Boundary Layer Requirements

Required files:

- `src/wealthfactory/workflow-registry.ts` exists.
- `src/wealthfactory/dto-mappers.ts` exists.
- `src/wealthfactory/response-guard.ts` exists.
- `src/wealthfactory/public-errors.ts` exists.
- `tests/wealthfactory-boundary.test.ts` exists.

The boundary layer must own public Wealth Factory workflow names, private Paperclip mappings, DTO mapping, public error mapping, forbidden-term checks, and forbidden-field checks. The browser consumes only Wealth Factory DTOs.

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
- service tokens
- backend secret handles
- private Paperclip URLs
- raw provider responses

## Provider Position

OpenAI is the encouraged/default provider, but every company must bring or authorize its own credentials.

Supported post-MVP provider lanes:

- `openai_api`
- `openai_chatgpt_codex_subscription`
- `anthropic_api`
- `xai_grok_api`
- `openrouter_api`
- `generic_api`

Nuances to preserve:

- ChatGPT/Codex subscription auth is possible through Paperclip's `codex_local` adapter and the Codex CLI, but it must be isolated by company or authorized company user.
- Never use a shared server/operator `~/.codex`, `CODEX_HOME`, ChatGPT login, or provider API key for subscriber work.
- Use isolated `CODEX_HOME` per company or authorized company user.
- Subscription mode must fail if `OPENAI_API_KEY` is present in the runtime environment, because that turns Codex into API-key billing.
- Anthropic, xAI/Grok, OpenRouter, and generic API providers use the same secret-reference model as OpenAI API keys.
- OpenRouter usage reporting should distinguish `biller=openrouter` from the upstream model/provider when available.
- Operator/shared provider credentials may remain configured temporarily for
  development, smoke testing, and debugging, but commercial production runs
  must execute with tenant-scoped provider credentials injected into Paperclip
  per run.

## Required Starting Checks

- Keep `src/wealthfactory/workflow-registry.ts`, `src/wealthfactory/dto-mappers.ts`, `src/wealthfactory/response-guard.ts`, and `src/wealthfactory/public-errors.ts` in the customer-facing API path.
- Keep `tests/wealthfactory-boundary.test.ts` passing before exposing new dashboard API routes.
- Integrate security helpers into the authenticated API layer before exposing customer-facing dashboard API routes.
- Add package/subscription entitlement checks before exposing commercial workflow run APIs.
- Expand provider credentials to company-specific OpenAI API, Anthropic API, xAI/Grok API, OpenRouter API, and optional company-isolated ChatGPT/Codex subscription auth.
- Never use a shared server/operator `~/.codex`, `CODEX_HOME`, ChatGPT login, or provider API key for subscriber work.
- Replace remaining Phase 5 demo UI state with authenticated API-backed state.
- Derive tenant role and operator role from server-side authorization.
- Use Wealth Factory DTOs rather than raw database rows or internal workflow responses.
- Add route tests proving tenant isolation and operator-only access.
- Add entitlement tests proving tenants cannot run workflows outside their installed package/industry.
- Add asset registry tests proving tenants cannot resolve prompts/rules/assets outside their installed package.
- Add race-condition tests proving concurrent requests cannot bypass entitlement, subscription, tenant pause, or credential revoke checks.
- Add response-guard tests proving Paperclip/internal terms and fields are rejected.
- Add CORS, request validation, rate-limit, and exposed-port checks for split-origin deployment.
- Add Playwright tests for member, owner, and operator paths.
- Keep `npm run build`, `npm test`, `npm run lint`, `npm run build:web`, and `npm run e2e` passing as the dashboard grows.
- Keep the live API deployment aligned with the repo changes: current image tag is `wealth-factory-api:20260512-114209`, container name is `wealth-factory-api`, and the VPS Caddyfile has a backup at `/root/supabase/docker/Caddyfile.wfapi.bak`.

## Latest Verification

- `node scripts/apply-wfpc-migration.mjs` applied private storage OAuth/vault migrations, then passed idempotently and reported `wfpc` with 16 public schema tables.
- `npm run build` passed.
- `npm run build:server` passed.
- `npm test` passed with 52 files / 200 tests.
- `npm run lint` passed.
- `npm run build:web` passed with lucide `use client` warnings from dependency bundling.
- `npm run e2e` passed with 3 Playwright tests.
- External verification passed for:
  - `https://api.spyderbyte.cloud/health` -> `200 {"status":"ok","service":"wealth_factory_api"}`
  - `GET /api/dashboard` from `https://www.spyderbyte.cloud` without auth -> `401`
  - `GET /api/dashboard` from `https://www.spyderbyte.cloud` with the deploy bearer token -> `200` with seeded tenant/package/workflow data
  - `OPTIONS /health` from `https://www.spyderbyte.cloud` -> `204` with explicit CORS headers
- `npm run smoke:external` now passes DNS, public `80/443` reachability, private app-port closure, dashboard auth/CORS checks, and response-guard checks. It still fails on the known open `5432` and `8000` ports and on the intentionally unconfigured storage OAuth route.

## Hard Rules

- Users must never see Paperclip prompts, skills, commands, agents, tool calls, raw logs, or internal configuration.
- Users may run only workflows included in their installed Wealth Factory package or purchased add-ons.
- Monthly subscription status must gate service access.
- OpenAI should remain the encouraged/default provider, but every company must bring or authorize its own credentials.
- Anthropic, xAI/Grok, OpenRouter, and generic providers must use the same secret-reference model as OpenAI API keys.
- ChatGPT/Codex subscription auth must be isolated by company or authorized company user.
- Supabase RLS must protect provider metadata and secret references because metadata can be sensitive.
- The frontend/dashboard site and backend/API VPS are different sites; preserve explicit origin, CORS, auth, CSRF, and firewall controls.
- Only the reverse proxy should expose public ports on the VPS. Paperclip, Redis, workers, Docker, and admin/debug ports stay private.
- Race conditions around subscriptions, package installs, add-ons, tenant pause, credential revoke/rotate, and queue enqueue must be blocked transactionally.
- Subagents and implementers are not alone in the codebase. Do not revert others' work.
- All code and docs require reviewer scrutiny before acceptance.
