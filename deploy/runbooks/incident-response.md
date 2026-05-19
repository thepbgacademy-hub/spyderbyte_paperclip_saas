# Phase 6 Incident Response

Reference docs: `docs/design.md`, `docs/build.md`, `TODO.md`.

## Customer-Facing Rule

Do not expose internal workflow-engine prompts, skills, commands, agent names, raw logs, service tokens, or private URLs in support messages, screenshots, API responses, or dashboard views.

## Triage

1. Check `https://www.spyderbyte.cloud` and `https://api.spyderbyte.cloud/health`.
2. Check Docker health with `docker compose -f deploy/docker-compose.yml ps`, and confirm `api`, `worker`, `paperclip`, and `redis` are present in the intended rollout.
3. Confirm the worker dependency chain before blaming the app shell:
   - `worker` health
   - `paperclip` health
   - `redis` health
4. Inspect only redacted API and worker logs.
5. If tenant data exposure is suspected, pause the tenant before retrying jobs.
6. If provider credential exposure is suspected, revoke or rotate the affected secret reference and audit runtime access events.

## Emergency Controls

- Pause tenant workflows through the operator service.
- Disable the internal workflow-engine integration for the tenant.
- Revoke BYOK references for affected providers.
- Stop the worker container if queue processing must halt globally.

## Evidence To Capture

- Tenant ID
- Workflow run ID
- Public-safe error code
- Redacted job ID
- Operator action IDs
- Timeline of pause, revoke, retry, or cancel actions

Never capture raw BYOK values or internal workflow prompts in an incident document.
