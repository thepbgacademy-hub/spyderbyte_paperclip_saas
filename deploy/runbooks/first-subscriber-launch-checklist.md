# First Subscriber Launch Checklist

This checklist is the controlled first-subscriber gate for the current Wealth Factory build. It aggregates the already-green launch evidence instead of introducing a new onboarding product surface.

## Launch Lane

- `wf-api.spyderbyte.cloud` is the launch lane for the first controlled subscriber.
- `www.spyderbyte.cloud` remains the portal origin for public shell proof.
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
6. Record the subscriber handoff decision and evidence paths before inviting the tenant.

## Do Not Widen This Gate

- Do not run `scripts/seed-wfpc-demo.mjs`.
- Do not mutate VPS, Docker, Caddy, DNS, database rows, runtime settings, worker settings, queue state, or seeds.
- Do not build subscriber-facing onboarding UI in this gate.
- Do not add scheduler automation or queue smoothing in this gate.
- Do not expand dashboard visuals, export replay, Obsidian delivery, workflow families, or package overlays in this gate.
- Do not treat this first-subscriber readiness gate as full public launch certification.
