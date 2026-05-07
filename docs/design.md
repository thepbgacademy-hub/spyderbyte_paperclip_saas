# SpyderByte Paperclip SaaS Design

Date: 2026-05-07

## Summary

SpyderByte will be a branded multi-tenant SaaS that runs user-facing workflows while using a private self-hosted Paperclip deployment as the background orchestration engine. Customers bring their own provider API keys, but customers never interact with Paperclip directly and never see Paperclip prompts, skills, commands, agent configuration, tool output, or internal logs.

The MVP should prove the integration path before investing in the final React dashboard. The first user-facing surface can be a minimal operator/dev web UI plus API endpoints that validate tenant isolation, BYOK handling, queue processing, and Paperclip run synchronization.

## Goals

- Prove that one VPS-hosted Paperclip instance can operate behind SpyderByte as a private workflow engine.
- Support multi-user and multi-tenant SaaS behavior.
- Use tenant BYOK credentials safely without storing secrets in queue payloads or user-visible logs.
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
- A Paperclip `companyId`.
- Workflow definitions available to that tenant.
- BYOK secret references.
- Run records and audit events.

The browser and public API must never accept a customer-provided Paperclip `companyId` as authoritative. The server resolves tenant ownership from the authenticated user, then looks up the mapped Paperclip company internally.

## BYOK Secret Model

BYOK is handled by reference.

1. Customer enters a provider API key in the SpyderByte UI.
2. SpyderByte backend validates the user's tenant membership.
3. Backend stores the key using the selected secret backend:
   - MVP option: Paperclip encrypted company/agent secret reference.
   - Production option: external KMS/Vault/Supabase Vault-backed reference with Paperclip receiving only runtime scoped values where necessary.
4. Redis job payload stores only `tenantId`, `workflowId`, `runId`, and secret reference IDs.
5. Worker resolves the secret only for the current job.
6. Secret material remains in memory only for the shortest possible time.
7. Logs and audit events record secret access by reference only.

## User Visibility Rule

This is a hard product rule:

Customers can see SpyderByte workflow names, statuses, results, and approved output. Customers cannot see Paperclip prompts, skills, commands, agent names, tool calls, raw activity logs, run JWTs, API routes, or internal implementation details.

Worker logs, Paperclip activity, and internal diagnostics must be separated into operator-only views. Any customer-facing result must be sanitized and shaped by SpyderByte before display.

## Queue Model

Redis/BullMQ queues are tenant-aware. Jobs use server-generated IDs and include:

- `tenantId`
- `runId`
- `workflowId`
- idempotency key
- created-by user ID
- request timestamp

Jobs do not include raw API keys, Paperclip credentials, or untrusted Paperclip identifiers. Workers validate tenant/run ownership before every Paperclip call.

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
