# VPS2 Isolated Wealth Factory Stage Rollout

This runbook exists to move Wealth Factory forward on VPS 2 without disturbing other apps currently sharing `spyderbyte.cloud` subdomains or containers.

## Historical Baseline Findings

These findings were gathered before the isolated host was fully wired. Keep them as rollout context, not as current proof status.

- `api.spyderbyte.cloud` is currently routed by host Caddy to `wealth-factory-api:8080`.
- The routed public API container is `wealth-factory-api:20260512-114209`.
- `wealth-factory-api-stage2:boardsession` is also running, but it is **not** the public route target.
- Neither `wealth-factory-api` nor `wealth-factory-api-stage2` currently exposes `WF_WEB_APP_ENTRY_URL` or `WF_WEB_APP_STYLESHEET_URL` in container env.
- No Wealth Factory `web` container is currently running on VPS 2.
- The local checked-in compose expects a `web` service plus:
  - `WF_WEB_APP_ENTRY_URL`
  - `WF_WEB_APP_STYLESHEET_URL` when emitted
  - `/app-assets/` reverse-proxied to the Wealth Factory web service
- Live proof against `https://api.spyderbyte.cloud` currently fails at the browser-shell lane:
  - authenticated `GET /` returns `404 {"code":"not_found"}`
  - authenticated `GET /board?workflowId=...` returns `404 {"code":"not_found"}`
  - authenticated `GET /api/harness/board?workflowId=...` also returns `404 {"code":"not_found"}`
- Live runtime preflight inside `wealth-factory-api-stage2` passes for the demo tenant/workflow, so staged runtime/data readiness exists even though the public shell path does not.

## Current Proof Status

On June 15, 2026 the isolated host `https://wf-api.spyderbyte.cloud` passed the repo-side `npm run prove:stage-live` proof sequence against the real stage env at `E:/the_secrets/projects/wealth-factory-stage/wf-stage.vps2.env`.

- `wf-stage-web`, `wf-stage-api`, and `wf-stage-worker` were all live on VPS 2.
- Remote runtime preflight passed for one tenant in each current native workflow family:
  - `wf_connect_first_workflow`
  - `wf_tax_strategy`
  - `wf_package_followup`
- Authenticated shell smoke passed for `/`, `/board?workflowId=...`, and `/api/harness/board?workflowId=...`.
- Live Playwright proof passed for the same three workflow families with no private worker metadata leakage.
- `api.spyderbyte.cloud` remained unchanged; `wf-api.spyderbyte.cloud` is the canonical proof lane until a later explicit cutover decision is made.
- Because VPS 2 is still a shared host, the successful June 15, 2026 proof used `WF_SMOKE_PRIVATE_PORTS=6379,9000,3000,5173,8080,8081,2375`. Ports `5432`, `8000`, and `8443` were intentionally left open for unrelated test lanes and are now treated as approved stage-proof host-level exceptions rather than Wealth Factory regressions.

On June 22, 2026 the same isolated host passed the full repo-side `npm run prove:stage-stability` acceptance gate against that same real stage env.

- `npm run prove:stage-live` passed again on the current branch.
- `npm run prove:stage-live-native-execution` passed again on the current branch.
- `npm run prove:live-fairness` passed again on the isolated lane with the canonical six demo lanes.
- `npm run prove:live-soak-capacity` passed again on the isolated lane with the bounded focus-container set:
  - `wf-stage-api`
  - `wf-stage-worker`
  - `wf-stage-web`
- `api.spyderbyte.cloud` remained unchanged during this rerun; the June 22, 2026 result is launch-readiness evidence for `wf-api.spyderbyte.cloud`, not a shared-host cutover.

## Goal

Keep the fully wired Wealth Factory stage host on VPS 2 as the active public API lane without changing the current `api.spyderbyte.cloud` route unless operators deliberately choose a later cutover slice.

## Recommendation

Use a dedicated stage hostname first:

- `wf-api.spyderbyte.cloud`

That hostname was chosen originally because it was an unused low-blast-radius lane. It is now the proven isolated Wealth Factory proof lane and should remain separate from `api.spyderbyte.cloud` until a later explicit cutover decision is made.

This hostname should point only at the isolated Wealth Factory stage stack and should not reuse the current shared `api.spyderbyte.cloud` route during proofing.

## Why This Is Safer

- It avoids cutting over any unknown consumers of the current `wealth-factory-api` route.
- It isolates Wealth Factory shell and asset wiring from other Telegram bot or mini-app work on the same VPS.
- It lets live proof fail or pass without breaking an existing public lane.

## Minimum Isolated Stack Shape

The isolated stage stack should include:

- `wf-stage-web`
- `wf-stage-api`
- `wf-stage-worker`
- existing internal dependencies already used by the Wealth Factory lane:
  - Redis
  - Paperclip
  - Supabase/Postgres

Because the stage API and worker resolve Postgres as `supabase-db`, any service that uses `SUPABASE_DB_URL=...@supabase-db:5432/...` must also join the `supabase_default` network. Do not leave `wf-stage-worker` on only the Paperclip and Redis networks or live runs can enqueue successfully and then fail at claim time with DNS resolution errors.

The important difference from the current public route is that the isolated API service must receive:

- `WF_WEB_APP_ENTRY_URL`
- `WF_WEB_APP_STYLESHEET_URL` when present

and the stage host must serve:

- authenticated shell from `/`
- authenticated board page from `/board`
- frontend assets from `/app-assets/*`

## Exact Config Requirements

### 1. Dedicated Host Route

Add a dedicated Caddy site block for the new Wealth Factory stage hostname that does **not** replace the existing `api.spyderbyte.cloud` block.

The new host should:

- proxy `/app-assets/*` to the Wealth Factory web service
- proxy all other Wealth Factory requests to the Wealth Factory API service
- preserve:
  - `Host`
  - `X-Forwarded-Proto`
  - `X-Forwarded-For`

An example block is provided in `deploy/caddy/wf-api.spyderbyte.cloud.Caddyfile.example`.

### 2. Dedicated Wealth Factory Web Service

Run the Wealth Factory web image as its own service for the stage host.

It should be configured with:

- `PUBLIC_APP_ORIGIN=https://www.spyderbyte.cloud` only if the public portal remains the same
- `API_ORIGIN=https://wf-api.spyderbyte.cloud`

If the stage portal origin differs, adjust both values to the actual intended browser and API origins for the proof lane.

### 3. Wealth Factory API Env Wiring

The stage API service must receive the resolved frontend asset env:

- `WF_WEB_APP_ENTRY_URL=https://<isolated-stage-host>/app-assets/<entry-file>.js`
- `WF_WEB_APP_STYLESHEET_URL=https://<isolated-stage-host>/app-assets/<stylesheet-file>.css` when emitted

It must also retain the existing runtime/session env already proven on VPS 2:

- `WF_ALLOWED_ORIGINS`
- `WF_API_SESSION_SIGNING_KEY`
- `WF_API_SESSION_ISSUER`
- `WF_API_SESSION_AUDIENCE`
- `WF_PORTAL_SESSION_COOKIE_NAME`
- `SUPABASE_*`
- `REDIS_URL`
- `WF_WORKFLOW_QUEUE_NAME`
- `PAPERCLIP_*`
- `WF_VAULT_MASTER_KEY`

Set `WF_WORKFLOW_QUEUE_NAME=wfpc-workflow-runs-stage` for the isolated stage lane.
This queue name must stay unique to the isolated stage lane.
Do not reuse the shared default `wfpc-workflow-runs` value on a VPS that still has older Wealth Factory proof workers attached to the same Redis and Postgres stack.

### 4. Asset Resolution Step

Before starting the stage API service, resolve the frontend asset URLs from the current web build:

```powershell
npm run build:web
$env:WF_WEB_PUBLIC_ASSET_ORIGIN="https://wf-api.spyderbyte.cloud"
$env:WF_WEB_PUBLIC_ASSET_PREFIX="/app-assets"
npm run resolve:web-assets
```

Then inject the emitted values into the stage API env:

- `WF_WEB_APP_ENTRY_URL`
- `WF_WEB_APP_STYLESHEET_URL` if emitted

### 5. Keep Current Shared Host Unchanged

Do not repoint this existing block during the isolated proof phase:

```text
api.spyderbyte.cloud {
  reverse_proxy wealth-factory-api:8080
}
```

Leave it intact until the isolated Wealth Factory proof is green and a deliberate cutover decision is made.

### 6. Compose Shape

Use a stage-specific compose file that:

- creates dedicated `wf-stage-web`, `wf-stage-api`, and `wf-stage-worker` services
- joins the shared VPS 2 networks already in use by the current Wealth Factory stage2 lane:
  - `supabase_default`
  - `paperclip-gwry_default`
  - `redis-tzbr_default`
- does **not** bind ports `80` or `443`
- relies on host Caddy for the public `wf-api.spyderbyte.cloud` route

An example file is provided in `deploy/docker-compose.vps2-isolated-stage.yml`.

Load the example env template from `deploy/env/wf-stage.vps2.example.env`, replace placeholders with reviewed values, and then run the isolated compose with an explicit env file:

```powershell
docker compose --env-file deploy/env/wf-stage.vps2.env -f deploy/docker-compose.vps2-isolated-stage.yml up -d
```

Keep the real `deploy/env/wf-stage.vps2.env` file out of Git.

## Exact Operator Sequence

Follow this sequence in order. It is intentionally non-destructive and does not require deleting or replacing any existing VPS 2 container, route, or shared hostname.

### 1. Local Preparation

From the repo root on the workstation:

```powershell
Copy-Item deploy/env/wf-stage.vps2.example.env deploy/env/wf-stage.vps2.env
npm run build:web
$env:WF_WEB_PUBLIC_ASSET_ORIGIN="https://wf-api.spyderbyte.cloud"
$env:WF_WEB_PUBLIC_ASSET_PREFIX="/app-assets"
npm run resolve:web-assets
```

Then update `deploy/env/wf-stage.vps2.env` with:

- reviewed `SPYDERBYTE_IMAGE_TAG`
- reviewed `WF_STAGE_WEB_IMAGE`
- reviewed `WF_STAGE_API_IMAGE`
- reviewed `WF_STAGE_WORKER_IMAGE`
- real `SUPABASE_*` values
- real `WF_API_SESSION_*` values
- `WF_WORKFLOW_QUEUE_NAME=wfpc-workflow-runs-stage`
- reviewed `WF_STORAGE_OAUTH_REDIRECT_ORIGIN` that matches an allowed portal origin
- real `WF_VAULT_MASTER_KEY`
- real `PAPERCLIP_*` values
- emitted `WF_WEB_APP_ENTRY_URL`
- emitted `WF_WEB_APP_STYLESHEET_URL` when present

Before touching the VPS, verify the isolated compose renders cleanly:

```powershell
docker compose --env-file deploy/env/wf-stage.vps2.env -f deploy/docker-compose.vps2-isolated-stage.yml config
```

Current VPS 2 read-only findings suggest these initial image candidates:

- `WF_STAGE_API_IMAGE=wealth-factory-api-stage2:boardsession`
- `WF_STAGE_WORKER_IMAGE=wealth-factory-worker-stage2:boardsession`

Historical first-wire note: there was initially no verified Wealth Factory web image on VPS 2. That is no longer the current proof status because the June 15, 2026 isolated-host proof already ran with `wf-stage-web` live. If the stage stack is reprovisioned, `WF_STAGE_WEB_IMAGE` must still point at a reviewed built image instead of assuming an old host-local tag remains valid.

### 2. VPS 2 Read-Only Preflight

On VPS 2, confirm the shared state still matches the assumptions from this runbook:

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
docker network inspect supabase_default --format '{{.Name}}'
docker network inspect paperclip-gwry_default --format '{{.Name}}'
docker network inspect redis-tzbr_default --format '{{.Name}}'
sudo caddy validate --config /etc/caddy/Caddyfile
```

Expected:

- existing shared containers are unchanged
- the three expected external Docker networks exist
- the current Caddy config is valid before adding the isolated host

### 3. Copy Stage Files To VPS 2

Copy only the isolated stage artifacts to a dedicated Wealth Factory deploy directory on VPS 2:

- `deploy/docker-compose.vps2-isolated-stage.yml`
- `deploy/env/wf-stage.vps2.env`
- `deploy/caddy/wf-api.spyderbyte.cloud.Caddyfile.example`

Keep these files separate from any existing shared deploy directories for other apps.

### 4. Bring Up The Isolated Stage Stack

From that dedicated deploy directory on VPS 2:

```bash
docker compose --env-file deploy/env/wf-stage.vps2.env -f deploy/docker-compose.vps2-isolated-stage.yml up -d
docker compose --env-file deploy/env/wf-stage.vps2.env -f deploy/docker-compose.vps2-isolated-stage.yml ps
docker compose --env-file deploy/env/wf-stage.vps2.env -f deploy/docker-compose.vps2-isolated-stage.yml logs --tail=100 wf-stage-api
docker compose --env-file deploy/env/wf-stage.vps2.env -f deploy/docker-compose.vps2-isolated-stage.yml logs --tail=100 wf-stage-worker
```

Expected:

- `wf-stage-web` is running
- `wf-stage-api` is running
- `wf-stage-worker` is running
- no host port publishes appear on these services

### 5. Attach The Dedicated Host Route

Add the site block from `deploy/caddy/wf-api.spyderbyte.cloud.Caddyfile.example` into the host Caddy config without editing the existing `api.spyderbyte.cloud` site block.

Then validate and reload only if validation passes:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo caddy reload --config /etc/caddy/Caddyfile
```

### 6. Point DNS For The Isolated Host

Point `wf-api.spyderbyte.cloud` at the VPS 2 public IP and wait until it resolves before running browser or smoke proof.

From the workstation, confirm:

```powershell
Resolve-DnsName wf-api.spyderbyte.cloud
curl.exe -I https://wf-api.spyderbyte.cloud/health
```

Expected:

- DNS resolves to VPS 2
- the isolated host answers over HTTPS

### 7. Run The Isolated Proof Sequence

Run the proof command from the repo root:

```powershell
npm run prove:stage-live
```

Keep `WF_STAGE_SMOKE_PRIVATE_PORTS` in the real stage env file as `6379,9000,3000,5173,8080,8081,2375` so the proof lane stays aligned with the current approved VPS 2 shared-host exception set while `5432`, `8000`, and `8443` remain intentionally in use by unrelated lanes.

What this command does:

1. reads the real stage env from `E:/the_secrets/projects/wealth-factory-stage/wf-stage.vps2.env`
2. resolves the live `workflow_templates.id` UUID for each proof tenant inside `wf-stage-api`
3. runs remote runtime preflight in `wf-stage-api`
4. mints a short-lived runtime session token locally from the stage signing env
5. runs authenticated shell/API smoke on `https://wf-api.spyderbyte.cloud`
6. runs `apps/web/tests/live/deployment.spec.ts` against the same host

Do not treat the host as ready until that one command is green.

### 8. Hold The Shared Host Steady

If the isolated proof fails:

- leave `api.spyderbyte.cloud` unchanged
- leave other containers and subdomains unchanged
- fix only the isolated stack inputs and rerun proof

If the isolated proof passes:

- record the result
- keep `wf-api.spyderbyte.cloud` as the active Wealth Factory API host unless operators deliberately choose a later cutover

### 9. Run The Stage Stability Plan

After `npm run prove:stage-live` is green, use the stage-owned stability wrapper before treating the lane as launch-stable under repeated load.

First inspect the exact planned commands without touching the live host:

```powershell
npm run prove:stage-stability -- --dry-run
```

That dry-run should show:

- `npm run prove:stage-live`
- `npm run prove:stage-live-native-execution`
- `npm run prove:live-fairness`
- `npm run prove:live-soak-capacity`
- the canonical six demo lanes for staged stability proof
- the bounded stage-owned focus-container set:
  - `wf-stage-api`
  - `wf-stage-worker`
  - `wf-stage-web`

Then run the real sequence:

```powershell
npm run prove:stage-stability
```

`npm run prove:stage-stability` inherits that same stage-owned private-port exception list automatically.
That keeps the stability wrapper aligned with the approved shared-host VPS 2 proof posture instead of relying on one-off operator shell exports when it reruns `npm run prove:stage-live`.

This wrapper keeps the low-level proof commands generic on purpose. The stage wrapper owns only the isolated-host defaults:

- stage env file `E:/the_secrets/projects/wealth-factory-stage/wf-stage.vps2.env`
- ssh env file `E:/the_secrets/vps/ssh.env`
- queue container `wf-stage-api`
- stage-owned focus-container defaults on the shared VPS 2 host
- canonical stage demo-lane expansion for fairness and soak

The default focus-container set is intentionally limited to `wf-stage-api`, `wf-stage-worker`, and `wf-stage-web`. It does not widen the verdict to unrelated shared-host containers.

It must not be treated as permission to widen the proof lane to `api.spyderbyte.cloud`, to pull unrelated host containers into the verdict, or to change the underlying low-level fairness/soak command contracts.

## Proof Checklist For The Isolated Host

Once the isolated stage hostname is live, prove this exact lane:

### Proof Expectations

When `npm run prove:stage-live` is green, all of the following should already be true:

- remote runtime preflight returns `ok: true` for one tenant in each current native workflow family
- `GET /` returns HTML shell, not `404`
- `/app-assets/*` resolves through the isolated host
- `/board?workflowId=...` returns shell HTML for each proven public workflow id
- `/api/harness/board?workflowId=...` returns bounded JSON for each proven public workflow id
- authenticated shell bootstrap is visible in Playwright
- the selected workflow board API response is observed in Playwright
- no private worker metadata leakage appears in shell HTML or board JSON

## Stage Alignment Gate

Before you treat harness-board proof failures as runtime regressions, confirm all of the following:

- the isolated stage env enables board exposure with `WF_HARNESS_ENABLED_WORKFLOW_IDS`
- the isolated stage env enables the intended native workflow families with `WF_NATIVE_EXECUTOR_ENABLED_WORKFLOW_IDS`
- the stage tenant owns an active install for the package behind the public workflow you are proving
- the board URL uses the public workflow id, not the workflow template UUID
- the isolated stage tenant is aligned to the current design-doc core workflows rather than an older social-media demo seed

## Cutover Decision Gate

Only consider repointing `api.spyderbyte.cloud` after all isolated-host proofs are green.

The current operator posture as of June 22, 2026 is to keep `wf-api.spyderbyte.cloud` as the active Wealth Factory public API lane.
The cutover paths below remain available only if operators later choose to change host posture.

If operators later choose to change host posture, choose one of these paths explicitly:

- keep Wealth Factory on the dedicated hostname permanently
- move `api.spyderbyte.cloud` to the isolated Wealth Factory stack
- keep both lanes alive with the old route preserved for any remaining dependency window

If the second path is chosen, follow the bounded deployment-plumbing plan in `deploy/runbooks/vps2-shared-host-cutover-plan.md` instead of improvising the route change live.

## Non-Goals

This runbook does **not** require:

- repointing `api.spyderbyte.cloud`
- changing Telegram bot subdomains
- changing other mini-app containers
- changing currently intentional test ports such as `5432`, `8000`, or `8443`
- deleting any existing Wealth Factory or non-Wealth-Factory container

## Evidence Summary

The application/runtime/browser proof is now green on the isolated host:

- the isolated `wf-stage-web`, `wf-stage-api`, and `wf-stage-worker` lane is live on VPS 2
- `npm run prove:stage-live` passed on June 15, 2026 against `wf-api.spyderbyte.cloud`
- `npm run prove:stage-stability` passed on June 22, 2026 against that same isolated host, including `prove:stage-live`, `prove:stage-live-native-execution`, `prove:live-fairness`, and `prove:live-soak-capacity`
- the public shared host `api.spyderbyte.cloud` was left unchanged on purpose
- the remaining host-posture choice is optional operator plumbing, not application correctness on the isolated lane
