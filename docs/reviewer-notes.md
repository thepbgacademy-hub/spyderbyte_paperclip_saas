# Reviewer Notes

Date: 2026-05-07

These notes summarize architecture review findings that every implementation worker and reviewer must treat as acceptance criteria.

## P0 Findings

### Tenant BYOK Injection Is The Highest-Risk Boundary

Tenant secrets must not live in shared worker process state longer than needed. Avoid long-lived environment variables carrying multiple tenants' credentials. Prefer per-job ephemeral secret retrieval, in-memory use only, explicit cleanup, and redacted structured logging.

### Paperclip Must Not Become The Multi-Tenant Trust Zone

Paperclip company scoping is useful, but SpyderByte must enforce tenant ownership before every internal request. A private subdomain is not enough. The backend needs tenant-scoped authorization, queue validation, network policy, SSRF controls, audit logging, and tests proving one tenant cannot reference another tenant's files, agents, logs, outputs, or Paperclip company.

## P1 Findings

### Queue Isolation And Idempotency

BullMQ needs tenant-aware job design, namespaced or validated payloads, deduplication keys, retries with backoff, dead-letter handling, job cancellation, timeout limits, and idempotent workflow steps.

### Supabase RLS And Metadata Sensitivity

RLS must protect every tenant-owned table. Secret metadata can be sensitive because provider names, key labels, and timestamps reveal customer systems.

### Operator Workflows Are Required In MVP

The final dashboard can wait, but operators still need safe ways to onboard tenants, pause tenants, inspect failed jobs, retry/cancel jobs, rotate/revoke secrets, and disable Paperclip integration in an emergency.

## P2 Findings

### Auth And Session Ambiguity

Users never access Paperclip directly. SpyderByte backend and worker services are the only callers. Paperclip's board/operator sessions must not be used as generic customer request credentials.

## Required Missing Tests

- RLS negative tests for cross-tenant reads, writes, deletes, enqueues, replays, and inspections.
- Secret lifecycle tests proving BYOK fetch is scoped and never persisted in logs or job payloads.
- Queue abuse tests for malformed tenant IDs, duplicate jobs, expired jobs, oversized payloads, and poisoned retries.
- Paperclip boundary tests for cross-tenant references and attempts to expose prompts, skills, commands, tools, or secrets.
- Failure-mode tests for Redis outage, worker crash, Paperclip timeout, Supabase auth failure, and secret provider unavailability.
- Audit tests proving secret access, workflow start, Paperclip calls, failures, retries, and admin overrides are attributable.

## Reviewer Acceptance Rule

A phase is not complete until an independent reviewer has checked tenant isolation, BYOK handling, Paperclip invisibility, logging, tests, and E2E evidence.
