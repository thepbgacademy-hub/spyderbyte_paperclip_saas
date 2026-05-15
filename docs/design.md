# SpyderByte Paperclip SaaS Design

Date: 2026-05-07

## Summary

SpyderByte will be a branded multi-tenant SaaS, sold to customers as Wealth Factory, that runs user-facing workflows while using a private self-hosted Paperclip deployment as the background orchestration engine. Customers bring their own company-specific provider credentials, but customers never interact with Paperclip directly and never see Paperclip prompts, skills, commands, agent configuration, tool output, or internal logs.

The MVP should prove the integration path before investing in the final React dashboard. The first user-facing surface can be a minimal operator/dev web UI plus API endpoints that validate tenant isolation, BYOK handling, queue processing, and Paperclip run synchronization.

## Goals

- Prove that one VPS-hosted Paperclip instance can operate behind SpyderByte as a private workflow engine.
- Support multi-user and multi-tenant SaaS behavior.
- Sell Wealth Factory as subscription packages, where each package is prebuilt for a specific industry or offered as a premium blank-canvas build.
- Let a company purchase a package, install it from its dashboard, and access only workflows/employees included in that installed package plus purchased add-ons.
- Use company-specific BYOK credentials safely without storing secrets in queue payloads or user-visible logs.
- Encourage OpenAI as the preferred provider path, including OpenAI API/project keys and company-isolated ChatGPT/Codex subscription auth where allowed.
- Support Anthropic, xAI/Grok, and OpenRouter API-key lanes with the same secret-reference lifecycle as OpenAI.
- Map every SpyderByte tenant to a Paperclip company.
- Run workflows through Redis/BullMQ workers.
- Store app data, auth metadata, tenant mappings, run metadata, and audit events in Supabase.
- Verify the MVP with automated tests and Playwright CLI end-to-end tests.

## Non-Goals

- Rebrand or fork the Paperclip React UI.
- Expose Paperclip MCP, REST APIs, prompts, skills, commands, agents, or logs to customers.
- Build the final customer control panel/dashboard in the first phase.
- Depend on Paperclip local trusted mode in production.
- Put raw BYOK values in Redis jobs, Supabase application rows, browser state, or logs.

## Recommended Architecture

Use Option A: REST-first integration.

SpyderByte backend calls Paperclip's REST API directly through a narrow internal adapter. MCP can be revisited later as an internal operator-only abstraction, but it is not part of the MVP public path.

```text
Customer browser
  -> SpyderByte frontend
  -> SpyderByte API
  -> Supabase auth/data and audit
  -> Redis/BullMQ workflow queue
  -> SpyderByte worker
  -> Paperclip REST adapter
  -> private Paperclip service
```

## VPS Layout

Split-site production model:

- The customer portal/dashboard may be hosted on a regular public website separate from the backend VPS.
- The VPS hosts the Wealth Factory API, workers, Redis/BullMQ, and private Paperclip runtime.
- The browser calls only the Wealth Factory public API over HTTPS. It never calls Paperclip, Redis, Supabase service-role endpoints, worker endpoints, or internal admin ports.
- The exact portal origin can change by deployment, but it must be configured as an explicit allowlist value, not discovered from request headers.

Public/backend hosts:

- `www.spyderbyte.cloud` may serve the POC branded application or point users to the customer portal.
- `api.spyderbyte.cloud` is the recommended public API origin for the VPS backend.

Recommended private/internal hosts:

- `paperclip-internal.spyderbyte.cloud` or private network DNS for Paperclip. This should not be publicly routable if the VPS/network setup supports private ingress.
- `redis` on a private Docker/network interface only.
- Supabase initially may use the Supabase plugin/project for testing, while the final Supabase deployment will run on a different VPS.

## Security Architecture

Security is a product requirement, not a final deployment chore. Wealth Factory will be sold to many companies, so every public route, database policy, queue action, package lookup, provider credential, and Paperclip call must assume hostile cross-tenant input until proven otherwise.

Network and origin rules:

- The public VPS should expose only `80` and `443` through a reverse proxy.
- SSH must be restricted by firewall, key-only auth, and preferably VPN or trusted IP allowlists.
- Redis, Paperclip, Postgres/Supabase, Docker daemon, worker metrics, admin panels, and debug ports must not bind to public interfaces.
- CORS must allow only the configured portal origin(s). Wildcard CORS is forbidden for authenticated routes.
- If cookie-based auth crosses origins, cookies must be `Secure`, `HttpOnly`, and use the narrowest viable `SameSite` setting. Cross-site cookie auth requires CSRF protection.
- Current deployment direction: keep the authenticated HTML shell and bootstrap on the API origin with same-site cookies, and serve frontend assets through a reviewed reverse-proxy path on that same origin. Do not treat true cross-origin cookie sessions as supported until CSRF protection is implemented and reviewed.
- If bearer tokens are used, the backend must validate issuer, audience, expiry, tenant membership, and route-level authorization on every request.
- No Supabase service-role key, Paperclip service token, provider credential, or secret reference handle may be shipped to the browser.

API protection rules:

- Every public route must use strict schema validation, request size limits, authentication, tenant membership checks, and route-level authorization.
- Rate limits must exist for auth-sensitive, workflow-start, provider-credential, package-install, and operator routes.
- Public errors must use Wealth Factory-safe codes and must not reveal Paperclip URLs, provider internals, SQL errors, Redis keys, stack traces, prompt names, skill names, command names, or service-token state.
- Security headers should include HSTS after TLS is stable, `X-Content-Type-Options`, `Referrer-Policy`, a restrictive `Content-Security-Policy`, and frame protections appropriate for the portal.

RLS and data rules:

- Supabase RLS is required on tenant-owned tables before enabling a second tenant.
- Positive and negative RLS tests must prove that Tenant A cannot read, update, delete, replay, enqueue, or infer Tenant B resources.
- Service-role operations must live only in backend/worker code paths and should be wrapped by application authorization, audit events, and narrow helper methods.
- PII, customer data, provider metadata, secret references, package assets, prompts/rules, and audit trails are sensitive. Logs must be minimized and redacted by default.

Race-condition and entitlement rules:

- Subscription status, package install status, add-on entitlement, workflow membership, tenant pause state, and provider credential validity must be checked inside the run-creation transaction before enqueueing work.
- Run creation, package installation, purchase activation, credential rotation/revoke, queue enqueue, and tenant pause/cancel flows need idempotency keys or unique constraints.
- Use row locks, advisory locks, or unique constraints where concurrent requests could double-install packages, double-enqueue runs, revive revoked credentials, or bypass a subscription change.
- A canceled subscription, revoked package, paused tenant, or revoked provider credential must block new work immediately and must be considered by workers before each Paperclip call.
- The server must never trust client-selected tenant IDs, package IDs, workflow IDs, employee IDs, provider IDs, Paperclip company IDs, or Paperclip run IDs as authoritative.

Vulnerability-management rules:

- Container images and dependencies should be pinned to reviewed versions or immutable digests for deployment.
- Run dependency audits and image vulnerability scans before a release candidate is deployed.
- Keep the VPS patched, TLS certificates renewed, backups tested, and secrets rotated on a defined schedule.
- Containers should run with least privilege and without unnecessary host mounts. The Docker socket must never be exposed to the app, worker, or public network.
- Audit events should record auth changes, provider credential lifecycle events, package installs, entitlement changes, workflow starts, tenant pauses, operator actions, and security-relevant failures.

Security test gates:

- Exposed port smoke tests from outside the VPS.
- CORS allow/deny tests for the portal origin and an untrusted origin.
- RLS positive and negative tenant tests.
- Tenant cross-access route tests.
- Race-condition and idempotency tests for run creation, package install, entitlement changes, and credential rotation/revoke.
- Response-guard tests proving customer-facing payloads cannot leak Paperclip or internal fields.
- Queue payload tests proving jobs contain no raw secrets or private Paperclip identifiers.
- Dependency and image vulnerability checks before deployment.

## Tenant Model

Each tenant has:

- A SpyderByte tenant record.
- One or more users and memberships.
- One active subscription plan and zero or more package/add-on entitlements.
- Installed Wealth Factory package records.
- A Paperclip `companyId`.
- Workflow definitions available to that tenant through installed packages only.
- Employee/agent definitions available through the base package and purchased add-ons only.
- BYOK secret references.
- Run records and audit events.

The browser and public API must never accept a customer-provided Paperclip `companyId` as authoritative. The server resolves tenant ownership from the authenticated user, then looks up the mapped Paperclip company internally.

## Commercial Package Model

Wealth Factory is sold in subscription packages.

Package types:

- Industry package: a prebuilt package for a specific industry with curated prompts, rules, allowed assets, workflows, default employees, dashboards, templates, and result views.
- Blank-canvas package: the premium tier where the user starts with no prebuilt package/workflows and designs the business from scratch.
- Add-on employee package: paid specialist employees that can be added to an installed package.
- Add-on workflow/template package: optional later lane for additional workflow sets that remain scoped to the installed package/industry.

Base product assumptions:

- A company purchases one primary package before using the service.
- The company installs the purchased package from the dashboard.
- Initial signup should remain minimal. Package-specific provider keys are requested after package install or when the user first enables a workflow capability that needs them.
- The installed package defines the allowed industry/workflow boundary.
- Workflows may never execute outside the installed package/industry boundary.
- Wealth Factory ships with basic executive employees such as CEO/CFO-style roles.
- Specialist employees are add-ons at an additional fee.
- A monthly subscription is required to use the service.
- Subscription status and entitlements must be checked before workflow run creation.

Package isolation rules:

- A tenant can list only packages it has purchased or is eligible to buy.
- A tenant can run only workflows included in its installed package or purchased add-ons.
- A tenant cannot request arbitrary Paperclip workflow IDs, agent IDs, package IDs, employee IDs, or industry IDs.
- The server resolves installed package entitlements before resolving private Paperclip mappings.
- The blank-canvas premium tier starts with no prebuilt workflows; customer-created workflows must still become Wealth Factory registry entries before execution.
- Add-on employees must be bound to the tenant's installed package context and cannot expand the tenant into unrelated industries unless explicitly purchased.
- Provider credentials can be package-specific. A tenant may connect OpenAI at signup for general workflows, but a Social Media package can require additional image, video, or publishing provider lanes that are scoped to that package's workflows.

## Package Asset Registry

A Wealth Factory package is a governed set of allowed assets, not just a billing SKU.

Package assets can include:

- Public Wealth Factory workflow definitions.
- Internal prompt/rule bundles used by Paperclip.
- Allowed files, templates, documents, schemas, examples, checklists, or knowledge assets.
- Employee/agent role definitions.
- Dashboard widgets and result view templates.
- Required and optional provider/model constraints.
- Industry-specific guardrails and operating rules.

Examples:

- A Business Coach package can include business coaching prompts, discovery workflows, advisory scorecards, meeting templates, and coaching-specific employees.
- A Brand SEO package can include SEO audit prompts, keyword workflows, brand voice assets, content planning templates, and SEO/content specialist employees.

Those two packages must not share runtime assets unless the asset is explicitly marked as common/global and permitted by entitlement. A tenant with the Business Coach package cannot pull Brand SEO prompts, rules, employees, templates, or Paperclip mappings.

The package asset registry should live in Supabase/app database tables and be resolved by Wealth Factory before Paperclip is called. Paperclip may store or execute the underlying prompts/rules/assets privately, but the browser and public API see only Wealth Factory package/workflow/employee/result DTOs.

Required package asset checks:

- Resolve assets by installed package ID and tenant entitlement, not by user-supplied asset IDs.
- Treat prompts/rules as private internal assets even when their outputs become customer-visible results.
- Keep Paperclip asset IDs, prompt names, skill names, command names, and agent names server-side only.
- Version package assets so installed packages can be upgraded safely.
- Record which package asset version was used for each run for audit/reproducibility.
- Deny execution when a workflow references an asset outside the installed package's allowed asset set.

## Package-Specific Provider Requirements

Packages declare their own provider capability requirements. A provider lane is not automatically available to every package just because the tenant connected it once.

Example: a Social Media package for solo founders or agencies may let the tenant create and manage social media for other individuals or companies. That package could include workflows for post planning, image generation, short-form video generation, caption variants, approval flows, and later channel publishing. Those workflows may require extra BYOK lanes beyond the initial signup provider.

Possible Social Media package lanes:

- Required: `openai_api` for general reasoning, planning, or approved image/video-capable OpenAI models.
- Optional: Google Gemini or Nano Banana-style image generation API lane when available.
- Optional: Higgsfield image/video API lane.
- Optional: OpenRouter API lane for supported upstream creative models.
- Later: Meta, TikTok, YouTube, LinkedIn, X, or other publishing API lanes.
- Later: storage/CDN provider lanes for generated media hosting and delivery.

Package provider rules:

- Package install can create a setup checklist for required and optional provider connections.
- A workflow run must verify that the installed package allows the requested provider lane.
- A workflow run must verify that the tenant has connected a valid, non-revoked credential for every required provider capability.
- Optional provider lanes can unlock optional workflows, better models, larger media outputs, or publishing destinations without blocking the base package.
- Provider credentials remain company-specific and secret-reference based even when they are package-scoped.
- The browser may show public provider labels and connection status, but never backend secret handles, raw provider responses, Paperclip mappings, prompts, skills, or commands.
- Package-specific provider metadata should include capability names such as `text_generation`, `image_generation`, `video_generation`, `social_publishing`, and `media_storage` so workflows can request capabilities rather than hard-coded vendors.

## Generated Artifact Storage

Wealth Factory should not be the long-term storage or CDN provider for customer-generated assets by default. Generated PDFs, slide decks, images, videos, source design files, and heavy media can create large infrastructure bills and increase data-retention risk.

Default MVP/POC artifact rule:

- Generated artifacts are stored temporarily only long enough for workflow continuity and user download.
- Default artifact TTL is `24 hours`.
- Expired artifacts are purged by a background cleanup job.
- Download links must be authenticated, tenant-scoped, and short-lived.
- Public unauthenticated file URLs are forbidden.
- The server keeps lightweight metadata after purge, not the artifact blob.

Metadata Wealth Factory may retain:

- Artifact ID.
- Tenant ID.
- Workflow/run ID.
- Package ID and workflow ID.
- Artifact type, filename/title, MIME type, byte size, checksum/hash, created time, expiration time, and purge status.
- Download/export audit events.
- A small user-facing summary or preview record when needed for ongoing workflow context.

Data Wealth Factory should not retain by default:

- Generated PDFs.
- Slide decks.
- Images.
- Videos.
- Source design files.
- Raw provider media blobs.
- Large intermediate files.

Storage limits:

- Enforce per-artifact size limits.
- Enforce per-run temporary storage limits.
- Enforce per-tenant temporary storage limits.
- Refuse or downshift workflows that would exceed package limits unless the tenant connects customer-owned storage.

Customer-owned storage connectors are the preferred long-term option after MVP:

- Google Drive.
- Dropbox.
- OneDrive/SharePoint.
- Customer-owned S3-compatible storage such as S3, Cloudflare R2, Backblaze B2, or MinIO.
- Customer-owned Supabase Storage if the customer has its own project.

Connector rules:

- Storage connectors are BYOK/bring-your-own-account integrations and are scoped to the tenant.
- Packages can declare optional or required `media_storage` provider capabilities.
- A Social Media package can use temporary download-only delivery by default, then offer Google Drive/Dropbox export for long-term media libraries.
- OAuth tokens, refresh tokens, bucket credentials, and folder IDs must be stored by secret reference and never exposed in browser responses or queue payloads.
- Export jobs must write only to folders/buckets authorized by the tenant and should record audit events for export, failure, expiration, and deletion.

Local machine storage note:

- A normal web app cannot silently store generated files on a user's machine. For MVP, Wealth Factory can deliver browser downloads. A future desktop companion could support local SQLite/file storage, but browser-based local persistence should not be treated as reliable long-term storage for large business assets.

## Company-Specific Provider Credential Model

Provider credentials are company-specific and handled by reference. No subscribing company may share another company's API keys, subscription auth state, Codex home, vault path, or runtime provider session.

1. Customer enters a provider credential in the Wealth Factory UI.
2. SpyderByte backend validates the user's tenant membership.
3. Backend stores the key using the selected secret backend:
   - MVP option: Paperclip encrypted company/agent secret reference.
   - Production option: external KMS/Vault/Supabase Vault-backed reference with Paperclip receiving only runtime scoped values where necessary.
4. Redis job payload stores only `tenantId`, `workflowId`, `runId`, and secret reference IDs.
5. Worker resolves the secret only for the current job.
6. Secret material remains in memory only for the shortest possible time.
7. Logs and audit events record secret access by reference only.

For ChatGPT/Codex subscription auth, the credential is not an API key. Wealth Factory must create an isolated `CODEX_HOME` per company or per authorized company user, run the Codex login/device-code flow for that company context, and store only the resulting auth/session material in that company's encrypted secret/volume boundary. A server-wide shared `~/.codex` login is not acceptable for multi-company SaaS.

## Provider Lanes

Wealth Factory supports these provider lanes.

OpenAI API lane:

- Preferred provider path.
- Customer supplies an OpenAI API key tied to their own OpenAI account/project.
- Optional `OpenAI-Project` metadata can be stored as non-secret provider configuration when customers use project-scoped keys.
- Runtime injection should match Paperclip's native OpenAI environment expectations where possible, but only inside private worker/Paperclip execution.
- The UI describes this as "Connect OpenAI"; it does not mention Paperclip internals.

OpenAI ChatGPT/Codex subscription lane:

- Optional lane for companies that want to use their own ChatGPT/Codex subscription rather than OpenAI API billing.
- Uses Paperclip's `codex_local` behavior through an isolated company-specific `CODEX_HOME`.
- Requires `codex login` or device-code authentication for the company/user context.
- Must not run with `OPENAI_API_KEY` present when subscription mode is intended, because Codex/Paperclip will treat that as API-key billing.
- Runtime usage must be attributed to the correct Wealth Factory company and audited without exposing Codex auth files, access tokens, refresh tokens, account IDs, or ChatGPT email addresses to other tenants.
- This lane is for company-specific subscription access only. It must not use a shared operator/server ChatGPT account for subscriber work.

Anthropic API lane:

- Customer supplies an Anthropic API key stored by reference.
- Optional public-safe metadata may include workspace label or default model family.
- Claude subscription login is not part of the initial Wealth Factory SaaS credential model unless a separate company-isolated, terms-reviewed lane is designed.

xAI/Grok API lane:

- Customer supplies an xAI API key stored by reference.
- Public-safe metadata may include endpoint region or default Grok model label.
- Runtime responses are normalized into Wealth Factory DTOs and never exposed raw.

OpenRouter API lane:

- Customer supplies an OpenRouter API key stored by reference.
- Public-safe metadata may include allowed upstream provider/model allowlist.
- Cost and usage reporting must distinguish `biller=openrouter` from the upstream model provider when available.

Generic provider lane:

- Reserved for later providers not covered by OpenAI, Anthropic, xAI/Grok, or OpenRouter.
- Uses the same secret-reference lifecycle and redaction rules.
- Provider adapters declare required secret names and public-safe configuration fields.
- Public workflow UX stays provider-neutral unless a workflow specifically requires a provider capability.

OpenAI implementation note: OpenAI's current docs describe API keys as server-side credentials that should be loaded from environment variables or key management services, and project-scoped requests may include an `OpenAI-Project` header. The MVP should not attempt to automate creation of user API keys; customers generate and paste their own key, and Wealth Factory stores it by reference. OpenAI's Codex docs also support signing in to Codex with a ChatGPT account; Wealth Factory may support this only through company-isolated Codex auth homes and explicit customer authorization.

## User Visibility Rule

This is a hard product rule:

Customers can see SpyderByte workflow names, statuses, results, and approved output. Customers cannot see Paperclip prompts, skills, commands, agent names, tool calls, raw activity logs, run JWTs, API routes, or internal implementation details.

Worker logs, Paperclip activity, and internal diagnostics must be separated into operator-only views. Any customer-facing result must be sanitized and shaped by SpyderByte before display.

## Queue Model

Redis/BullMQ queues are tenant-aware. Jobs use server-generated IDs and include:

- `tenantId`
- installed package ID
- `runId`
- `workflowId`
- idempotency key
- created-by user ID
- request timestamp

Jobs do not include raw API keys, Paperclip credentials, or untrusted Paperclip identifiers. Workers validate tenant/run ownership, subscription status, installed package entitlement, add-on entitlement, and workflow/package membership before every Paperclip call.

Required queue behavior:

- Deduplication by tenant/workflow/idempotency key.
- Retry with backoff.
- Dead-letter handling.
- Per-job timeout.
- Job cancellation.
- Tenant pause support.
- Structured redacted logs.

## Supabase Model

Supabase stores app-side state and enforces RLS on tenant-owned tables.

Core tables:

- `tenants`
- `tenant_memberships`
- `subscription_plans`
- `tenant_subscriptions`
- `wealth_factory_packages`
- `tenant_package_installs`
- `package_asset_versions`
- `package_allowed_assets`
- `package_workflows`
- `package_employees`
- `tenant_add_ons`
- `paperclip_company_mappings`
- `workflow_templates`
- `workflow_runs`
- `secret_references`
- `audit_events`
- `operator_actions`

RLS policies must be tested with positive and negative tenant access tests before enabling a second tenant in the MVP.

## Paperclip Boundary

Paperclip is treated as a private subsystem, not the SaaS trust boundary.

Rules:

- No direct customer network access.
- Authenticated mode only outside local development.
- Service-to-service credentials held by backend/worker only.
- Tenant-to-company mapping enforced before every call.
- No broad board/operator session used as a generic customer request credential.
- Paperclip errors are translated into SpyderByte-safe errors before returning to the browser.

## Error Handling

Customer-facing errors must be brief and non-revealing:

- `workflow_failed`
- `credential_invalid`
- `workflow_timed_out`
- `tenant_paused`
- `service_unavailable`

Internal operator logs may include Paperclip request IDs, adapter status, retry attempts, and redacted diagnostic fields.

## Testing Strategy

Each phase must include:

- Unit tests for adapter mapping, redaction, and queue payload validation.
- Supabase RLS tests for tenant isolation.
- Worker integration tests with mocked Paperclip responses.
- Failure-mode tests for Redis, Paperclip timeout, secret provider failure, and duplicate jobs.
- Playwright CLI E2E tests for the implemented user/operator flow.

Minimum E2E proof:

1. Tenant A can create/run a workflow.
2. Tenant B cannot read Tenant A run metadata.
3. A workflow can complete through the queue and display sanitized SpyderByte output.
4. Paperclip internals are absent from all customer-visible UI and API responses.

## Security Review Gates

Before each implementation phase is marked complete:

- A reviewer checks tenant isolation, secret handling, logging, and Paperclip visibility.
- Tests must pass locally.
- E2E tests must run with Playwright CLI.
- Any skipped test must be documented with reason and follow-up.

## Sources Used For Feasibility

- Paperclip API overview: `https://raw.githubusercontent.com/paperclipai/paperclip/master/docs/api/overview.md`
- Paperclip auth docs: `https://raw.githubusercontent.com/paperclipai/paperclip/master/docs/api/authentication.md`
- Paperclip secrets docs: `https://raw.githubusercontent.com/paperclipai/paperclip/master/docs/deploy/secrets.md`
- Paperclip implementation spec: `https://github.com/paperclipai/paperclip/blob/master/doc/SPEC-implementation.md`
- paperclip-mcp package: `https://pypi.org/project/paperclip-mcp/`
- OpenAI API authentication: `https://platform.openai.com/docs/api-reference/authentication`
- OpenAI project API keys: `https://platform.openai.com/docs/api-reference/project-api-keys/list`
