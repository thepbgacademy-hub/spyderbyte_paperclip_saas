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
- `audit/2026-07-01/codex-auth-home-readiness-api-after-reauth-targeted.json`
- `audit/2026-07-01/codex-auth-home-readiness-worker-after-reauth-targeted.json`
- `audit/2026-07-01/live-native-execution-after-reauth-connect-first.json`

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
   - Use `npm run prove:codex-auth-home-readiness -- --execute --target-tenant <tenant-id> --target-workflow wf_connect_first_workflow --auth-state-ref <auth-state-ref>` for the bounded readiness proof. The proof may inspect the configured worker container, Codex CLI, `CODEX_HOME` presence, and a non-secret smoke prompt only.
   - The proof must not print raw `CODEX_HOME`, auth-state contents, session cookies, bearer tokens, VPS credentials, or local secrets-folder paths.
5. Run `npm run repair:openai-device-provider-binding` in dry-run mode and confirm the plan targets only the intended tenant/workflow/provider. For the live stage first-subscriber lane, pass the public workflow id as `--workflow wf_connect_first_workflow` and the resolved stage template UUID as `--workflow-template 44444444-4444-4444-8444-444444444444`.
6. Before any later execute attempt, pass `--codex-home-readiness-proof <path>` pointing at the green `codex_auth_home_ready` artifact. The script must validate that artifact, including the target tenant/workflow/auth-state reference and CODEX_HOME fingerprint, instead of trusting `--confirm-codex-home-ready` alone.
7. Treat execute mode as an operator-only DB repair lane, not a normal launch step. It may run only after the green target-matched Codex auth-home proof, explicit operator confirmation, and a stage DB URL are supplied.
8. The execute transaction must update the workflow template provider binding for the explicit `--workflow-template` row and only verify that the package provider requirement seam exists. It must not rewrite `wfpc.package_provider_requirements` because that seam is package-scoped, not tenant/workflow-scoped.
9. The repair intentionally revokes active `openai_chatgpt_codex_subscription` references for the target tenant before upserting the new metadata-only reference. This is safe only for the controlled first-subscriber single-workflow lane; do not reuse it as a general multi-workflow tenant repair without redesign.
10. Confirm the `(tenant_id, secret_ref)` uniqueness seam exists through `secret_references_tenant_secret_ref_unique` before live execute; the repair upsert depends on that schema guard.
11. Start a fresh proof run after repair. Do not treat the existing `openai_api`-bound run as proof that device auth is being used.
12. If the native public uniqueness model returns `fresh_harness_run_conflict`, explicitly rebind the single controlled first-subscriber proof run before rerunning acceptance. The rebind must replace only that run's `bound_secret_reference_id` / single-entry `bound_provider_context` with the active `openai_chatgpt_codex_subscription` reference and re-enqueue that run's outbox row.
13. The worker runtime must hydrate `openai_chatgpt_codex_subscription` from metadata, not from `wfpc_private.vault_secrets`. If live proof reports `bound provider secret was unavailable at execution time`, deploy the resolver fix before retrying the same lane.
14. The isolated `wf-stage-worker` must receive the same tenant-isolated `CODEX_HOME` mount as `wf-stage-api`, and the worker image must expose `/app/node_modules/.bin` on `PATH` so the packaged Codex CLI is available to native execution.
15. If the readiness proof reports `codex_auth_session_revoked`, stop retrying workflow runs. The container wiring is past CLI/home checks, but the OpenAI device-login state has expired or been revoked. Re-authenticate the tenant-isolated Codex home out of band, rerun the readiness proof against both `wf-stage-api` and `wf-stage-worker`, and only then rerun native execution acceptance.
16. Pass the green API and worker readiness artifacts into live native execution with `--api-codex-home-readiness-proof <api-artifact>`, `--worker-codex-home-readiness-proof <worker-artifact>`, and `--codex-auth-state-ref <auth-state-ref>` unless `WF_OPENAI_CODEX_AUTH_STATE_REF` is already set in the operator env. The proof must fail closed before remote reservation or advancement if either artifact is missing, mismatched, revoked, mutation-tainted, pointed at the wrong auth-state reference, or tied to a different `CODEX_HOME` fingerprint.
17. Current connect-first baseline: after operator reauthentication, `wf_connect_first_workflow` passed the bounded live native round trip with `codex_readiness_gate_verified`, `native_blocked_reached`, `native_attention_resolved`, and `round_trip_verified`. Do not reuse these connect-first readiness artifacts to prove another workflow family; each family needs matching tenant/workflow/auth-state readiness artifacts.

The repair plan is intentionally scoped to the active provider binding for the controlled first-subscriber lane. It must not mutate existing `workflow_runs`, Paperclip state, DNS/Caddy/shared-host routing, `wfpc_private.vault_secrets`, or BYOK/API-provider lanes. A later explicit proof-run rebind may mutate exactly one controlled first-subscriber `workflow_runs` row and its matching outbox row; do not generalize that into tenant-wide run rewrites.

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
