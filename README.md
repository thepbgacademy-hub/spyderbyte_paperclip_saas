# SpyderByte Paperclip SaaS

MVP/POC design repository for a VPS-hosted, multi-tenant BYOK SaaS that uses a private self-hosted Paperclip instance as an internal workflow engine.

## Core Decision

Use Option A: REST-first Paperclip integration.

SpyderByte owns the public product surface, authentication, tenant model, BYOK lifecycle, workflow queue, audit trail, and future dashboard. Paperclip runs privately in the background and is never exposed to end users.

## Documents

- `docs/design.md` - Product and system design.
- `docs/build.md` - Phased implementation plan.
- `docs/reviewer-notes.md` - Architecture review findings and controls.
- `docs/phases/phase-1-poc.md` - First build phase details.

## Non-Negotiables

- Users never access Paperclip directly.
- Users never see Paperclip prompts, skills, commands, internal logs, agent names, or runtime implementation details.
- Paperclip is reachable only from trusted backend/worker services.
- Every code change requires reviewer scrutiny for error and accuracy control.
- Every phase must include automated tests and end-to-end verification.
