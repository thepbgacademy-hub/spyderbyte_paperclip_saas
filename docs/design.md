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

Public host:

- `www.spyderbyte.cloud` serves the branded application.

Recommended private/internal hosts:

- `api.spyderbyte.cloud` for the SpyderByte API.
- `paperclip-internal.spyderbyte.cloud` or private network DNS for Paperclip. This should not be publicly routable if the VPS/network setup supports private ingress.
- `redis` on a private Docker/network interface only.
- Supabase initially may use the Supabase plugin/project for testing, while the final Supabase deployment will run on a different VPS.

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

## Package Asset Registry

A Wealth Factory package is a governed set of allowed assets, not just a billing SKU.

Package assets can include:

- Public Wealth Factory workflow definitions.
- Internal prompt/rule bundles used by Paperclip.
- Allowed files, templates, documents, schemas, examples, checklists, or knowledge assets.
- Employee/agent role definitions.
- Dashboard widgets and result view templates.
- Provider/model constraints.
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
