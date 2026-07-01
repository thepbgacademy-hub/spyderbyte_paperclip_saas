# First Subscriber Post-Invite Observation Runbook

This runbook is the bounded observation path for the first controlled subscriber invite on `wf-api.spyderbyte.cloud`.

The invite itself is an out-of-band operator action. The repo records the observation structure and decision path only.

## Before Recording

- Confirm the invite was sent on `wf-api.spyderbyte.cloud`, not `api.spyderbyte.cloud`.
- Confirm the invite/handoff link used `https://wf-api.spyderbyte.cloud/board?workflowId=wf_connect_first_workflow`.
- Do not send the subscriber to `https://spyderbyte.cloud/board?workflowId=wf_connect_first_workflow`; apex/www `/board` returns `404` in the current launch posture.
- Do not send the subscriber to `https://www.spyderbyte.cloud/board?workflowId=wf_connect_first_workflow`; apex/www `/board` returns `404` in the current launch posture.
- The `wf-api.spyderbyte.cloud` board path is expected to require authentication before the board/API data is visible.
- Confirm the launch lane still respects the four-tenant VPS cap, active monitoring, and minimum `120` second tenant start spacing.
- Confirm the previous handoff packet remains the source of truth for the operator-ready decision.
- Do not record a real subscriber name, email, tenant secret, session token, bearer token, VPS credential, or raw support transcript in the observation artifact.

## Known Entry-Path Blocker

The manual first-subscriber stand-in check exposed a handoff blocker: `https://spyderbyte.cloud/board?workflowId=wf_connect_first_workflow` returned `404`, and `https://www.spyderbyte.cloud/board?workflowId=wf_connect_first_workflow` finalized to the same invalid apex board route.

This is a documentation/handoff blocker, not a runtime regression. The controlled first-subscriber board entry is `https://wf-api.spyderbyte.cloud/board?workflowId=wf_connect_first_workflow`, and the `wf-api.spyderbyte.cloud` board path is expected to require authentication before the board/API data is visible.

## Observation Decision Tree

1. If the invite succeeds and no launch blocker appears, update a copied observation artifact with `subscriberInviteSent: true` and `verdict: "go"`.
2. If the invite should not proceed but no code change is required, record `verdict: "no_go"` and keep the blocker severity as `defer`.
3. If rollback is performed by the operator, record `verdict: "rollback_completed"` and keep rollback details sanitized.
4. If a launch-critical blocker appears, stop and open the smallest bounded blocker-fix phase before touching code.

## Hard Boundaries

- Do not run VPS, Docker, Caddy, DNS, database, runtime, worker, queue, scheduler, export, workflow/package, or cutover mutations from this runbook.
- Do not build onboarding UI from this runbook.
- Do not run export replay or Obsidian delivery from this runbook.
- Do not promote `api.spyderbyte.cloud`; `api.spyderbyte.cloud` remains operator-only deferred cutover territory.
- Do not invite a second subscriber from this runbook. A second invite requires a separate deliberate phase.

## Smallest-Blocker Rule

If a launch-critical blocker appears, capture only:

- the sanitized symptom,
- the failing lane or public path,
- whether rollback was performed,
- whether the issue blocks the first subscriber,
- the nearest focused test or proof command that should fail before the fix.

Then stop. The blocker fix belongs in its own bounded implementation phase with fresh GitNexus preflight, Sonnet review, subagent review, and TDD.
