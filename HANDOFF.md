# Handoff: Current Build Position

This handoff is intentionally overwritten after each phase. It now describes the exact current build position and the next post-MVP continuation point for a fresh session.

## Status

Phases 0 through 7 are complete, tested, reviewed, and committed.

The project is no longer in the initial MVP planning/build phase. The next session should start post-MVP hardening and productization for the customer-facing SaaS brand **Wealth Factory**.

## Reference Docs

- `docs/design.md`
- `docs/build.md`
- `docs/dashboard-design-prep.md`
- `docs/reviewer-notes.md`
- `deploy/runbooks/deploy-poc.md`
- `deploy/runbooks/incident-response.md`
- `TODO.md`

## Product Position

Wealth Factory is the customer-facing SaaS. Paperclip is private infrastructure.

Customers subscribe as companies. Each subscribing company must see only Wealth Factory wording, workflows, credentials, runs, results, billing, and support language. Customers must never see Paperclip names, prompts, skills, commands, agents, raw logs, tool calls, private company mappings, backend secret handles, service tokens, or private workflow-engine identifiers.

Do not rely on LLM memory or prompt instructions to enforce this rebrand. The product boundary must be deterministic TypeScript code and tests.

## Next Build Order

1. Build the security hardening baseline for split-origin portal/API deployment.
2. Build the deterministic TypeScript Wealth Factory boundary layer described in `docs/build.md`.
3. Build package entitlement and subscription gates.
4. Expand company-specific provider credential lanes.
5. Replace the Phase 5 demo UI state with authenticated API-backed state.
6. Build the full Wealth Factory control panel/dashboard from `docs/dashboard-design-prep.md`.
7. Deploy the POC to the VPS using the Phase 6 deployment runbooks once credentials and final Supabase target are available.

Do not build customer-facing dashboard routes before the security baseline and boundary layer exist.

## Security Position

Wealth Factory will be sold to many companies. Security must cover user data, provider keys, PII, public APIs, exposed ports, vulnerabilities, race conditions, and Supabase RLS before commercial exposure.

The intended deployment is split-origin:

- The customer portal/dashboard can be hosted on a regular public website.
- The backend API, workers, Redis/BullMQ, and private Paperclip runtime run on the VPS.
- The browser calls only the Wealth Factory API over HTTPS.
- Paperclip, Redis, workers, Docker, admin/debug ports, Supabase service-role operations, and private service tokens remain server-side/private.
- Public VPS exposure should be limited to `80` and `443` through the reverse proxy.
- CORS must allow only the configured portal origin(s). Wildcard CORS is forbidden for authenticated APIs.
- If cross-origin cookies are used, add `Secure`, `HttpOnly`, correct `SameSite`, and CSRF protection. If bearer tokens are used, validate issuer, audience, expiry, membership, and role.
- Supabase service-role keys, Paperclip tokens, provider credentials, and secret-reference handles must never reach browser code.

Required security files for the next roadmap:

- `src/security/cors.ts`
- `src/security/rate-limit.ts`
- `src/security/request-validation.ts`
- `src/security/security-headers.ts`
- `src/security/csrf.ts` if cookie auth is used.
- `tests/security-boundary.test.ts`
- `tests/race-conditions.test.ts`
- `deploy/runbooks/security-checklist.md`

Security tests to preserve:

- CORS allow/deny tests for portal and untrusted origins.
- RLS positive and negative tenant tests.
- Route-level tenant and operator authorization tests.
- Race-condition/idempotency tests for run creation, package install, entitlement change, tenant pause, and credential revoke/rotate.
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

- `src/packages/package-types.ts`
- `src/packages/package-asset-registry.ts`
- `src/packages/package-service.ts`
- `src/packages/entitlement-service.ts`
- `src/packages/employee-catalog.ts`
- `src/packages/package-provider-requirements.ts`
- `tests/package-asset-registry.test.ts`
- `tests/package-entitlements.test.ts`
- `tests/package-provider-requirements.test.ts`

Package-specific provider nuance:

- Package definitions should declare required and optional provider lanes by capability, not just vendor.
- Useful capability labels include `text_generation`, `image_generation`, `video_generation`, `social_publishing`, and `media_storage`.
- A Social Media package might require OpenAI and optionally support Google Gemini/Nano Banana-style image generation, Higgsfield image/video, OpenRouter creative models, and later Meta/TikTok/YouTube/LinkedIn/X publishing APIs.
- Connecting a provider for one package does not make it globally available to all packages.
- Run creation must verify active subscription, installed package, workflow entitlement, provider lane allowlist, and valid non-revoked tenant credential before queueing work.

## Boundary Layer Requirements

Required files:

- `src/wealthfactory/workflow-registry.ts`
- `src/wealthfactory/dto-mappers.ts`
- `src/wealthfactory/response-guard.ts`
- `src/wealthfactory/public-errors.ts`
- `tests/wealthfactory-boundary.test.ts`

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

## Required Starting Checks

- Create `src/wealthfactory/workflow-registry.ts`, `src/wealthfactory/dto-mappers.ts`, `src/wealthfactory/response-guard.ts`, and `src/wealthfactory/public-errors.ts`.
- Add `tests/wealthfactory-boundary.test.ts` before exposing new dashboard API routes.
- Add security middleware and tests before exposing customer-facing dashboard API routes.
- Add package/subscription entitlement checks before exposing commercial workflow run APIs.
- Expand provider credentials to company-specific OpenAI API, Anthropic API, xAI/Grok API, OpenRouter API, and optional company-isolated ChatGPT/Codex subscription auth.
- Never use a shared server/operator `~/.codex`, `CODEX_HOME`, ChatGPT login, or provider API key for subscriber work.
- Replace Phase 5 demo UI state with authenticated API-backed state.
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
