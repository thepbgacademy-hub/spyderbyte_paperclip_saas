# First Subscriber Launch Checklist

This checklist is the controlled first-subscriber gate for the current Wealth Factory build. It aggregates the already-green launch evidence instead of introducing a new onboarding product surface.

## Launch Lane

- `wf-api.spyderbyte.cloud` is the launch lane for the first controlled subscriber.
- `www.spyderbyte.cloud` remains the portal origin for public shell proof.
- The first-subscriber board entry URL is `https://wf-api.spyderbyte.cloud/board?workflowId=wf_connect_first_workflow`.
- Do not send the subscriber to `https://spyderbyte.cloud/board?workflowId=wf_connect_first_workflow`; apex/www `/board` returns `404` in the current launch posture.
- Do not send the subscriber to `https://www.spyderbyte.cloud/board?workflowId=wf_connect_first_workflow`; apex/www `/board` returns `404` in the current launch posture.
- The `wf-api.spyderbyte.cloud` board path is expected to require authentication before the board/API data is visible.
- Do not use `api.spyderbyte.cloud` as the subscriber lane; it remains an operator-only shared-host cutover path until a separate cutover phase is deliberately chosen.

## Required Evidence

Before subscriber handoff, confirm these committed evidence artifacts are still the current baseline:

- `audit/2026-06-30/authenticated-public-launch-host-acceptance.json`
- `audit/2026-06-30/public-launch-host-acceptance.json`
- `audit/2026-06-29/stage-live-stability-summary.json`
- `audit/2026-06-29/launch-tenant-ceiling-and-jitter-policy.json`
- `audit/2026-06-29/stage-operator-controls-read-only-confirmation.json`

Run a fresh authenticated public-host proof immediately before handoff:

```powershell
npm run prove:public-launch-host -- --mint-session --env-file <operator-supplied-stage-env-file> --expires-in-minutes 10 --execute
```

The command must mint a short-lived runtime session locally, pass it only through the smoke and Playwright environment, and must not print, commit, or store the token.

## OpenAI Device Provider Binding Gate

The first-subscriber workflow must not be retried on the old `openai_api` provider binding. Before any `unblock_lane`, fresh proof run, or provider repair execute step:

1. Confirm the Wealth Factory worker lane has the Codex CLI available in the worker process environment.
2. Provision a tenant-isolated `CODEX_HOME` path for the first-subscriber tenant; do not reuse an operator-global `.codex` home.
3. Confirm the auth-state reference points to the tenant-isolated Codex device-login state and never to a raw token committed in the repo or printed in logs.
4. Run a non-secret smoke prompt from the same worker/container lane that will execute native provider calls.
   - Use `npm run prove:codex-auth-home-readiness -- --execute` for the bounded readiness proof. The proof may inspect the configured worker container, Codex CLI, `CODEX_HOME` presence, and a non-secret smoke prompt only.
   - The proof must not print raw `CODEX_HOME`, auth-state contents, session cookies, bearer tokens, VPS credentials, or paths under `the_secrets`.
5. Run `npm run repair:openai-device-provider-binding` in dry-run mode and confirm the plan targets only the intended tenant/workflow/provider.
6. Keep this slice in dry-run/readiness mode. Current execute mode still fails closed until a later dedicated DB-mutation phase wires and reviews the live repair.
7. When that later phase exists, it must update the workflow provider requirement seam as well as the provider binding, otherwise a fresh run can fail entitlement before credentials bind.
8. Start a fresh proof run after repair. Do not treat the existing `openai_api`-bound run as proof that device auth is being used.

The repair plan is intentionally scoped to the active provider binding for the controlled first-subscriber lane. It must not mutate existing `workflow_runs`, Paperclip state, DNS/Caddy/shared-host routing, or BYOK/API-provider lanes.

## Tenant Safety Gate

- four tenants per VPS is the strict launch upper cap, not a comfort target.
- active monitoring is required before and during the first subscriber window.
- keep a minimum `120` seconds between tenant start windows for onboarding, cron, heartbeat, and manual launch batches.
- do not onboard a fifth tenant on the same VPS without fresh explicit review and soak evidence.

## Operator Handoff

1. Confirm the branch and deployed lane match the latest committed launch proof.
2. Confirm the target tenant is fresh and not one of the dirty historical demo lanes.
3. Confirm the authenticated public-host proof passes with no authenticated skips.
4. Confirm private port posture and shell/API smoke still match the public-host proof.
5. Confirm operator read-only fail-closed behavior remains acceptable for this launch window.
6. Confirm the invite/handoff link uses `https://wf-api.spyderbyte.cloud/board?workflowId=wf_connect_first_workflow`.
7. Record the subscriber handoff decision and evidence paths before inviting the tenant.

## Do Not Widen This Gate

- Do not run `scripts/seed-wfpc-demo.mjs`.
- Do not mutate VPS, Docker, Caddy, DNS, database rows, runtime settings, worker settings, queue state, or seeds.
- Do not build subscriber-facing onboarding UI in this gate.
- Do not add scheduler automation or queue smoothing in this gate.
- Do not expand dashboard visuals, export replay, Obsidian delivery, workflow families, or package overlays in this gate.
- Do not treat this first-subscriber readiness gate as full public launch certification.
