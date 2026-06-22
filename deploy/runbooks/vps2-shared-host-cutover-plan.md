# VPS2 Shared-Host Cutover Plan

This plan exists for one bounded operator slice: move the public host `api.spyderbyte.cloud` onto the already-proven Wealth Factory isolated stack if and only if the operator explicitly chooses that posture.

This plan does not authorize application, runtime, queue, worker-policy, or dashboard-scope changes.
Do not treat this plan as permission to change workflow families, native-execution policy, or board contracts.

## Intent

- Keep the application/runtime proof anchored to the already-green isolated lane `wf-api.spyderbyte.cloud`.
- Treat cutover as reverse-proxy and host-routing plumbing only.
- Preserve a fast rollback path that restores the old public target first, then investigates on the isolated lane.

## Preconditions

Before any route change, all of the following must already be true:

- `wf-api.spyderbyte.cloud` is still green on the current branch.
- `npm run prove:stage-live` has already passed on the isolated host.
- `npm run prove:stage-stability` has already passed on the isolated host.
- `wf-stage-web`, `wf-stage-api`, and `wf-stage-worker` are healthy on VPS 2.
- The current `api.spyderbyte.cloud` route target is known and recorded before editing Caddy.
- An operator has explicitly chosen cutover instead of keeping `wf-api.spyderbyte.cloud` as the permanent public lane.

## Exact Cutover Sequence

1. Re-run the isolated-lane proof bar from the workstation without changing the live route:

```powershell
cd /d E:\REPOS\spyderbyte_paperclip_saas
npm run prove:stage-live
npm run prove:stage-stability
```

2. On VPS 2, capture the current Caddy config and route target before editing:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.pre-wf-cutover-$(date +%Y%m%d-%H%M%S).bak
```

3. Confirm the current public route still points where expected:

```bash
grep -n "api.spyderbyte.cloud" /etc/caddy/Caddyfile
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
```

4. Update only the `api.spyderbyte.cloud` reverse proxy target so it matches the already-proven isolated lane target shape.

The cutover should route:

- `/app-assets/*` to `wf-stage-web:3000`
- all other Wealth Factory requests to `wf-stage-api:8080`

Do not change the app itself. Do not change container images, queue names, env files, workflow flags, or worker settings in this slice.

5. Validate and reload Caddy only if validation passes:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo caddy reload --config /etc/caddy/Caddyfile
```

6. Verify the public hostname answers after reload:

```powershell
Resolve-DnsName api.spyderbyte.cloud
curl.exe -I https://api.spyderbyte.cloud/health
```

## Verification Gate

After the route flips, verify the public host immediately.

From the workstation:

```powershell
cd /d E:\REPOS\spyderbyte_paperclip_saas
npm run prove:stage-live -- --base-url https://api.spyderbyte.cloud
```

If the public route proof is green, then run the bounded stability proof again on the isolated lane to ensure the underlying services remain healthy:

```powershell
npm run prove:stage-stability
```

Success means:

- `api.spyderbyte.cloud` now serves the same authenticated shell, board shell, board API, and asset path shape that `wf-api.spyderbyte.cloud` already proved.
- `wf-api.spyderbyte.cloud` can remain live as the rollback lane until the operator decides whether to retire it later.

## Rollback

If cutover verification fails, roll back the route first and debug on the isolated lane second.

Rollback steps:

1. restore the previous `api.spyderbyte.cloud` reverse proxy target from the saved Caddy backup
2. validate and reload Caddy again
3. re-check `https://api.spyderbyte.cloud/health`
4. leave `wf-api.spyderbyte.cloud` untouched as the known-good proof lane

Use:

```bash
sudo cp /etc/caddy/Caddyfile.pre-wf-cutover-YYYYMMDD-HHMMSS.bak /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo caddy reload --config /etc/caddy/Caddyfile
```

During first rollback, do not delete the isolated `wf-stage-web`, `wf-stage-api`, or `wf-stage-worker` services during first rollback.

## Explicit Non-Goals

- No application redeploy is required just to flip the route.
- No container-image replacement is required in this slice.
- No queue-name or Redis topology change is required in this slice.
- No worker concurrency tuning is required in this slice.
- No DNS change for `wf-api.spyderbyte.cloud` is required in this slice.
- No changes to `wf_connect_first_workflow`, `wf_tax_strategy`, or `wf_package_followup`.

## Decision Output

When this plan is executed, record one of these outcomes in handoff:

- `api.spyderbyte.cloud` now fronts the proven Wealth Factory isolated stack, with `wf-api.spyderbyte.cloud` preserved as rollback lane
- cutover was attempted and rolled back, with the failure isolated to deployment plumbing rather than application/runtime behavior
- operator chose to keep `wf-api.spyderbyte.cloud` as the permanent public lane for now
