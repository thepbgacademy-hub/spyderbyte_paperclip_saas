# Stage Operator Controls Live Confirmation Gate

## Purpose

This document is the manual launch gate for the Wealth Factory stage operator-controls probe. It records the exact non-destructive command posture required before anyone runs the live read-only confirmation.

This is intentionally not part of `npm test` or `npm run prove:stage-stability`. The live probe must remain human-gated until a separate phase explicitly approves folding it into an automated stage wrapper.

## Allowed Live Confirmation

The only approved live request for this gate is:

```text
GET /api/operator/tenants/:tenant/jobs/dead-letters
```

The local command posture is:

```powershell
try {
  $env:WF_STAGE_API_ORIGIN = "https://wf-api.spyderbyte.cloud"
  $env:WF_STAGE_OPERATOR_TENANT_ID = "<stage tenant id>"
  $env:WF_STAGE_OPERATOR_BEARER_TOKEN = "<short-lived operator bearer token>"
  npm run prove:stage-operator-controls -- --execute-read-only
} finally {
  Remove-Item Env:\WF_STAGE_API_ORIGIN -ErrorAction SilentlyContinue
  Remove-Item Env:\WF_STAGE_OPERATOR_TENANT_ID -ErrorAction SilentlyContinue
  Remove-Item Env:\WF_STAGE_OPERATOR_BEARER_TOKEN -ErrorAction SilentlyContinue
}
```

Do not commit bearer tokens, command transcripts containing bearer tokens, raw live response bodies with secrets, VPS topology captures, or unrelated stage/container output.

## Required Guardrails

- The script must default to dry-run when `--execute-read-only` is absent.
- `WF_STAGE_OPERATOR_BEARER_TOKEN` must be required before live execution.
- The method must remain `GET`.
- The path must remain `/api/operator/tenants/:tenant/jobs/dead-letters`.
- Accepted live statuses are limited to `200`, `403`, `404`, and `501`.
- Redirects, unexpected 2xx responses, and server errors must fail closed.
- Output may include a masked authorization preview only.

## Explicitly Out Of Scope

- No pause or resume execution.
- No job retry, cancellation, or queue mutation.
- No secret rotation or revocation.
- No run cancellation by secret reference.
- No emergency Paperclip-disable operation.
- No Docker, DNS, Caddy, image, compose, or database migration change.
- No addition to `npm run prove:stage-stability` in this phase.

## Pass Criteria

This confirmation gate is locally ready when:

- the dry-run command prints a GET-only plan and makes no network request
- focused tests prove the live probe is not reachable from the default test or stage-stability script chain
- the implementation has been reviewed for no capability widening
- GitNexus has been refreshed after commit

The live read-only execution itself remains a separate operator action that requires intentional token provisioning.
