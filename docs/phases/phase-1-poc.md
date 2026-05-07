# Phase 1 POC: Single-Tenant Workflow Slice

## Purpose

Prove the narrowest useful end-to-end path before introducing multi-tenant BYOK complexity.

## Scope

- One tenant.
- One workflow template.
- One queued run.
- Mocked or private Paperclip REST integration.
- Sanitized SpyderByte run status.
- No customer-facing Paperclip concepts.
- No BYOK yet.

## Flow

```text
Create workflow run
  -> write SpyderByte run row
  -> enqueue BullMQ job
  -> worker validates payload
  -> worker calls Paperclip adapter
  -> worker polls or receives status
  -> worker stores sanitized result
  -> API returns SpyderByte-safe status
```

## Acceptance Criteria

- Redis job payload contains no raw secrets.
- API responses contain no Paperclip prompt, skill, command, agent, tool, or raw log fields.
- Paperclip adapter converts internal failures into SpyderByte-safe error codes.
- A reviewer can trace every state transition through audit events.
- Unit and integration tests pass.

## Test Commands

These commands will become active once the implementation skeleton exists:

```powershell
npm test
npx playwright test
```

## Reviewer Checklist

- Confirm no Paperclip internals in public route names, response fields, frontend copy, or logs visible to tenant users.
- Confirm worker validates tenant/run ownership before adapter calls.
- Confirm failures do not expose Paperclip stack traces or raw activity.
