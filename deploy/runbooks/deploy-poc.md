# Phase 6 VPS Deployment POC

Reference docs: `docs/design.md`, `docs/build.md`, `TODO.md`.

## Hosts

- Customer portal/dashboard: hosted on a regular public website, origin configured in `WF_ALLOWED_ORIGINS`.
- POC public app: `www.spyderbyte.cloud` if the portal is hosted on the VPS during testing.
- Public backend API: `api.spyderbyte.cloud`
- Internal workflow engine: Docker private network only
- Redis: Docker private network only

The portal and API are treated as separate sites. The browser may call only the Wealth Factory API over HTTPS. It must not call Paperclip, Redis, workers, Docker, Supabase service-role endpoints, admin panels, or private ports.

## Required Secrets

Set these on the VPS as root-owned environment files or deployment secrets. Do not place real values in Git.

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`
- `SUPABASE_DB_SSL`
- `PAPERCLIP_SERVICE_TOKEN`
- `WF_PAPERCLIP_SERVICE_TOKEN_MAP` optional JSON object mapping additional Paperclip company IDs to company-scoped bearer tokens for multi-company issue-launch lanes; keep `PAPERCLIP_SERVICE_TOKEN` as the default/fallback token
- `WF_PAPERCLIP_LAUNCH_MODE` set to `issues` for the staged/live Paperclip board-session proof, otherwise leave the default `runs`
- `WF_PAPERCLIP_BOARD_SESSION_TOKEN` required when verifying Paperclip secret projection, rotation, and revoke against the installed board session routes
- `WF_PAPERCLIP_BOARD_ORIGIN` required with the board session token so trusted `Origin` / `Referer` headers match the Paperclip board host; for the installed Paperclip board-session routes, this origin is also the HTTP base URL for secret-management calls, while `PAPERCLIP_BASE_URL` remains the internal launch/health target
- `WF_PAPERCLIP_ADMIN_TOKEN` is deprecated for this issue-launch secret-projection path and should not be treated as a bearer-token compatibility lane
- `WF_PAPERCLIP_ISSUE_AGENT_ID` required when `WF_PAPERCLIP_LAUNCH_MODE=issues`
- `WF_PAPERCLIP_ISSUE_POLL_INTERVAL_MS` optional override for issue-launch run polling
- `WF_PAPERCLIP_ISSUE_MAX_POLL_ATTEMPTS` optional override for issue-launch run polling
- `WF_PROVIDER_EXECUTION_MODE` optional, defaults to `tenant_credentials_required`
- `WF_WORKER_CONCURRENCY` optional, defaults to `2`
- `WF_WORKER_MAX_ACTIVE_PER_TENANT` optional, defaults to `1`
- `WF_ALLOWED_ORIGINS`
- `WF_API_SESSION_SIGNING_KEY`
- `WF_API_SESSION_ISSUER`
- `WF_API_SESSION_AUDIENCE`
- `WF_VAULT_MASTER_KEY`
- `WF_PAPERCLIP_AUTH_PROBE_COMPANY_ID` optional but recommended for worker readiness because it lets the worker healthcheck prove the Paperclip service token can reach an authenticated company route on the installed Paperclip build
- this probe is intentionally narrow: it proves authenticated company-scoped API access, not full Wealth Factory launch-contract readiness
- `WF_WEB_APP_ENTRY_URL`
- `WF_WEB_APP_STYLESHEET_URL` if emitted by `npm run resolve:web-assets`
- `WF_PORTAL_SESSION_COOKIE_NAME`
- `SPYDERBYTE_IMAGE_TAG`
- `PAPERCLIP_IMAGE_TAG`
- `PAPERCLIP_PUBLIC_URL` optional, defaults to `http://127.0.0.1:3100` for the private-only container topology

Tenant OpenAI and generic provider keys remain BYOK runtime secrets stored by reference. They must not be baked into Docker images, browser bundles, Compose files, or Redis jobs.

Current POC auth note:

- The deployed API shell and dashboard API now trust short-lived signed runtime session tokens.
- Bearer and same-site cookie bootstrap may both carry the same signed session token, but the token must include issuer, audience, tenant, user, role, and expiry claims.
- Runtime session tokens must expire within 60 minutes. Do not mint long-lived deploy or smoke-check tokens.
- `npm run create:runtime-session-token` rebuilds the server bundle before minting so deploy smoke checks cannot accidentally use stale auth logic.
- Treat this as a controlled deploy/runtime bridge, not the final end-user auth design.

## Deploy

1. Build and push the `spyderbyte/web`, `spyderbyte/api`, and `spyderbyte/worker` images with an immutable commit tag.
2. Copy `deploy/docker-compose.yml` and `deploy/nginx/spyderbyte.conf` to the VPS.
3. Install TLS certificates for `www.spyderbyte.cloud` if used for the POC app and `api.spyderbyte.cloud` for the backend API.
4. Set `SPYDERBYTE_IMAGE_TAG` to the selected commit tag and `PAPERCLIP_IMAGE_TAG` to a reviewed version or digest-backed tag.
5. Set `WF_ALLOWED_ORIGINS` to the exact customer portal origin or comma-separated allowed origins. Do not use wildcard origins for authenticated routes.
6. Load the required server-side secrets into the shell or an `.env` file readable only by the deploy user.
7. For the staged/live Paperclip proof lane, explicitly set:

```powershell
$env:WF_PAPERCLIP_LAUNCH_MODE="issues"
$env:WF_PAPERCLIP_BOARD_SESSION_TOKEN="<paperclip-board-session-token>"
$env:WF_PAPERCLIP_BOARD_ORIGIN="https://paperclip-gwry.srv1605805.hstgr.cloud"
$env:WF_PAPERCLIP_ISSUE_AGENT_ID="<paperclip-issue-agent-id>"
$env:WF_PAPERCLIP_SERVICE_TOKEN_MAP='{"<paperclip-company-id>":"<company-scoped-paperclip-token>"}'
```

Keep `PAPERCLIP_BASE_URL` pointed at the internal Paperclip service (`http://paperclip:3100` or equivalent private network target) for launch and health traffic. On the currently installed Paperclip build, board-session secret routes must be called against `WF_PAPERCLIP_BOARD_ORIGIN` with matching trusted `Origin` / `Referer` headers.

Leave `WF_PAPERCLIP_BOARD_SESSION_TOKEN` unset outside the board-session proof path so normal `/runs` deployments do not accidentally depend on board-scoped Paperclip credentials. Do not rely on `WF_PAPERCLIP_ADMIN_TOKEN` as a bearer-token fallback for this path.

8. Build the frontend assets and resolve the API-shell asset URLs:

```powershell
npm run build:web
$env:WF_WEB_PUBLIC_ASSET_ORIGIN="https://api.spyderbyte.cloud"
$env:WF_WEB_PUBLIC_ASSET_PREFIX="/app-assets"
npm run resolve:web-assets
```

Copy the emitted `WF_WEB_APP_ENTRY_URL` value into the deployment environment for the `api` service. If the resolver also prints `WF_WEB_APP_STYLESHEET_URL`, set that too. Leave it unset when the build does not emit a standalone stylesheet.

Current deployment choice:

- The authenticated HTML shell is served from `api.spyderbyte.cloud`.
- Frontend JS and CSS assets are served from the same API origin through Nginx at `/app-assets/`, reverse-proxied to the `web` container.
- Session bootstrap is treated as same-site cookie auth only. Do not treat true cross-origin cookie sessions as supported until CSRF protections are implemented and reviewed.
8. Run `docker compose -f deploy/docker-compose.yml pull`.
9. Run `docker compose -f deploy/docker-compose.yml up -d`.
10. Run `docker compose -f deploy/docker-compose.yml ps` and confirm `api` is running, and `worker`, `paperclip`, and `redis` are healthy.

Image build note:

- the repo now ships both [E:\REPOS\spyderbyte_paperclip_saas\Dockerfile.api](E:\REPOS\spyderbyte_paperclip_saas\Dockerfile.api) and [E:\REPOS\spyderbyte_paperclip_saas\Dockerfile.worker](E:\REPOS\spyderbyte_paperclip_saas\Dockerfile.worker)
- `spyderbyte/api` must start `dist/api/server-main.js`
- `spyderbyte/worker` must start `dist/worker/worker-main.js`
- the worker image now includes a container healthcheck that verifies both Redis reachability and Paperclip health before the rollout should be treated as green
- when `WF_PAPERCLIP_AUTH_PROBE_COMPANY_ID` is set, the worker healthcheck also verifies that the configured Paperclip service token is not rejected by an authenticated company-scoped route
- on the current Paperclip install, that authenticated probe route is `GET /api/companies/:companyId/agents`
- treat that as an auth/readiness floor only; it does not prove the current token can execute the final Wealth Factory launch flow
- the checked-in deploy compose now targets the installed Paperclip internal port and health route at `http://paperclip:3100/api/health`
- for staged/live issue-launch proof, the deployed API and worker must both receive `WF_PAPERCLIP_LAUNCH_MODE`, `WF_PAPERCLIP_BOARD_SESSION_TOKEN`, `WF_PAPERCLIP_BOARD_ORIGIN`, and `WF_PAPERCLIP_ISSUE_AGENT_ID` so registration, rotation, revoke, and worker-side secret sync all use the same board-session contract
- when staging more than one Paperclip company in the same worker lane, also provide `WF_PAPERCLIP_SERVICE_TOKEN_MAP` so issue-launch requests use a company-scoped bearer token instead of reusing the primary company token across tenants
- for that proof path specifically, keep `PAPERCLIP_BASE_URL` on the internal/private service for launch/health traffic; the secret-projection client uses `WF_PAPERCLIP_BOARD_ORIGIN` as the board-session request target because the installed Paperclip board routes do not accept the internal service host
- do not reuse the API image for the worker unless its entrypoint is explicitly overridden to `node dist/worker/worker-main.js`

## Smoke Tests

From outside the VPS:

```powershell
npm run smoke:external
curl.exe -I https://www.spyderbyte.cloud
curl.exe -I https://api.spyderbyte.cloud/health
curl.exe -I https://api.spyderbyte.cloud/app-assets/
curl.exe --connect-timeout 5 http://<vps-public-ip>:3100/api/health
Test-NetConnection www.spyderbyte.cloud -Port 6379
Test-NetConnection api.spyderbyte.cloud -Port 80
Test-NetConnection api.spyderbyte.cloud -Port 443
Test-NetConnection api.spyderbyte.cloud -Port 3100
Test-NetConnection api.spyderbyte.cloud -Port 6379
```

From the VPS:

```powershell
docker compose -f deploy/docker-compose.yml port paperclip 3100
docker compose -f deploy/docker-compose.yml port redis 6379
```

Expected:

- `npm run smoke:external` exits `0`.
- App returns HTTP 200 or 304.
- API health returns HTTP 200 with SpyderByte-safe health output.
- API shell assets are reachable only through the intended `/app-assets/` reverse-proxy path.
- API responses include only Wealth Factory-safe health fields.
- Public port 3100 is closed or unreachable from outside the VPS.
- Redis port is closed externally.
- Only 80 and 443 are externally reachable on the API host.
- `docker compose port paperclip 3100` prints no host binding.
- `docker compose port redis 6379` prints no host binding.

Run CORS checks from outside the VPS:

```powershell
curl.exe -i -X OPTIONS https://api.spyderbyte.cloud/health -H "Origin: https://www.spyderbyte.cloud" -H "Access-Control-Request-Method: GET"
curl.exe -i -X OPTIONS https://api.spyderbyte.cloud/health -H "Origin: https://untrusted.example" -H "Access-Control-Request-Method: GET"
```

Expected:

- The configured portal origin receives the intended CORS headers.
- The untrusted origin does not receive an allow-origin header.

Before release-candidate deploys, run the security checklist in `deploy/runbooks/security-checklist.md`.

For authenticated shell smoke checks, mint a short-lived deploy-safe runtime session token before running the external smoke script:

```powershell
$env:WF_API_SESSION_SIGNING_KEY="<session-signing-key>"
npm run build:server
npm run create:runtime-session-token -- --tenant tenant-demo --user deploy-operator --role operator --expires-in-minutes 15
$env:WF_SMOKE_SESSION_COOKIE_NAME="wf_portal_session"
$env:WF_SMOKE_SESSION_COOKIE_VALUE="<signed-session-token>"
$env:WF_SMOKE_EXPECT_ASSET_BASE_URL="https://api.spyderbyte.cloud/app-assets/"
npm run smoke:external
```

Then run:

```powershell
npm run e2e:live
npm run e2e
```

For deployed-browser verification, set `WF_LIVE_BASE_URL` to the API origin before running `npm run e2e:live`. If you have a deploy-safe same-site session token, also set `WF_LIVE_SESSION_COOKIE_VALUE` to exercise the authenticated shell path. The live Playwright config now fails fast when `WF_LIVE_BASE_URL` is omitted so it does not probe a deployment by accident.

## Temporary Public Paperclip Test Drive

If Paperclip is intentionally installed as a temporary public debug target before the final private-only Wealth Factory topology is applied, treat it as a controlled verification lane only.

Use this repo-side check before and after pressure testing:

```powershell
$env:WF_PAPERCLIP_VERIFY_URL="http://187.77.19.83:53324"
$env:WF_PAPERCLIP_EXPECT_MODE="authenticated"
$env:WF_PAPERCLIP_EXPECT_EXPOSURE="public"
$env:WF_PAPERCLIP_PUBLIC_PORT="53324"
npm run verify:paperclip-target
```

Expected for the temporary test target:

- `/api/health` returns `200`
- the payload reports a healthy Paperclip instance
- `deploymentMode` reports `authenticated`
- the script prints a warning reminding operators that this public exposure is for controlled testing only

For a controlled live run drive after Paperclip target health is verified:

```powershell
npm run check:live-runtime -- --tenant 22222222-2222-4222-8222-222222222222 --workflow 44444444-4444-4444-8444-444444444444
$env:WF_DEMO_PAPERCLIP_COMPANY_ID="<paperclip-company-id>"
npm run seed:demo
npm run queue:live-run -- --tenant 22222222-2222-4222-8222-222222222222 --user 11111111-1111-4111-8111-111111111111 --workflow 44444444-4444-4444-8444-444444444444
npm run inspect:live-run -- --tenant 22222222-2222-4222-8222-222222222222 --workflow 44444444-4444-4444-8444-444444444444 --run <run-id-from-queue-output>
```

Expected for the live drive:

- `check:live-runtime` reports whether the live DB schema is current enough for
  bound-provider workflow execution and demo purchase seeding
- `seed:demo` now creates the active package purchase prerequisite
- `seed:demo` can also create `wfpc.paperclip_company_mappings` when `WF_DEMO_PAPERCLIP_COMPANY_ID` is provided
- `queue:live-run` creates a reserved workflow run plus the durable outbox row
- `inspect:live-run` confirms bound provider context and BullMQ job presence without improvised SQL

Current observed blocker on 2026-05-19:

- the live DB schema is now aligned for bound-provider workflow execution after
  rerunning `node scripts/apply-wfpc-migration.mjs`
- the running `wealth-factory-api` container is still an older partial runtime
  and does not currently carry the full queue/Paperclip env required by the
  repo's worker path, including `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`, `PAPERCLIP_BASE_URL`, and
  `PAPERCLIP_SERVICE_TOKEN`
- the VPS process list still shows the Wealth Factory API running, but not the
  repo's `worker-main` process yet
- a real `wfpc.paperclip_company_mappings` row still needs to be seeded with
  the Paperclip company ID that Wealth Factory should target during controlled
  testing

Current live rollout implication:

- the next VPS alignment step is not a schema change anymore
- it is a runtime/image alignment step: the live API container needs the queue
  and Paperclip env, and the worker needs to be deployed from the repo's worker
  entrypoint
- for board-session proof specifically, ensure both services are restarted with
  `WF_PAPERCLIP_LAUNCH_MODE=issues`, `WF_PAPERCLIP_BOARD_SESSION_TOKEN`,
  `WF_PAPERCLIP_BOARD_ORIGIN`, and `WF_PAPERCLIP_ISSUE_AGENT_ID` populated
  before testing register, rotate, and revoke behavior

Current staged-runtime finding on 2026-05-19:

- a parallel private-only stage lane was brought up successfully on the VPS
  using the repo's current API and worker runtime from commit `38fdf74`
- that stage lane proved:
  - authenticated Redis/BullMQ connectivity
  - outbox enqueue
  - worker pickup
  - tenant vault-backed provider hydration
  - Paperclip bearer-token authentication
- the remaining blocker is the Paperclip launch contract itself:
  - the legacy `POST /api/companies/:companyId/runs` route is not present on the installed Paperclip build and returns `404`
  - a staged adapter experiment proved company-token issue creation succeeds through `POST /api/companies/:companyId/issues`
  - that same staged experiment showed `POST /api/issues/:id/checkout` still returns `401` when called headlessly with the company bearer token and explicit agent id
  - that strongly suggests the installed Paperclip build treats checkout as an interactive/local-agent claim flow rather than a server-safe headless execution endpoint
- the checked-in repo still keeps the previous BYOK-preserving `/runs` adapter behavior until a supported headless Paperclip execution/auth contract is identified for Wealth Factory

Current staged-runtime finding on 2026-05-20:

- the stage lane was rebuilt with version-pinned Paperclip secret binding support
- the stage database now carries `wfpc.paperclip_secret_bindings.paperclip_secret_version`
- the worker issue-launch path now syncs Paperclip secrets per run, patches the configured Paperclip issue agent with version-pinned `secret_ref` bindings, and does not forward raw secret values in the issue payload
- the worker no longer falls back to Paperclip `version: "latest"` when reusing an existing binding for workflow launch; missing versions now fail closed
- a fresh staged proof run (`040f4776-7636-4d08-9678-dc6b17ed1378`) confirmed:
  - run reservation succeeds
  - durable outbox status becomes `enqueued`
  - BullMQ job becomes reachable and completes
  - `wfpc.workflow_runs.status` advances to `running`
  - bound provider context remains attached to the run
- a second staged tenant/company lane now also works after adding per-company Paperclip issue-agent mappings plus a company-scoped bearer token override:
  - the secondary Paperclip company token must be minted through `POST /api/agents/:agentId/keys` using the public Paperclip board origin with trusted `Origin` / `Referer` headers
  - reusing the primary company token against the secondary company fails with `403 Agent key cannot access another company`
  - after setting `WF_PAPERCLIP_SERVICE_TOKEN_MAP`, a fresh secondary staged run (`cc59dcb9-4ed4-4aee-a2c4-f4637ce4a13c`) reached `running` with outbox `enqueued` and BullMQ `completed`

Current Paperclip contract findings on 2026-05-19:

- temporary VPS remediation proved two real runtime blockers were Paperclip-local, not Wealth Factory-local:
  - the `codex_local` lane needed a valid seeded `.codex` auth/session
  - top-level `PAPERCLIP_PUBLIC_URL` had to point at `http://127.0.0.1:3100` so agent-injected `PAPERCLIP_API_URL` and `PAPERCLIP_RUNTIME_API_URL` stayed local instead of redirecting through the public hostname
- with those fixes in place, assignment-triggered Paperclip heartbeat runs now succeed end to end on the temporary test lane
- issue creation now exposes a usable run bridge:
  - `POST /api/companies/:companyId/issues` returns the issue only
  - within roughly `1.5s`, `GET /api/issues/:identifier` can populate `executionRunId` and `checkoutRunId`
  - `GET /api/heartbeat-runs/:runId` returns the live run record
- sharp edge:
  - `executionRunId` and `checkoutRunId` are not durable on the issue object after the run transitions the issue to `blocked` or the issue later completes; they can fall back to `null`
  - for durable correlation, use the run id while it is present, then rely on issue activity/comment `runId` or `createdByRunId` plus `GET /api/heartbeat-runs/:runId`
- issue-level `assigneeAdapterOverrides.adapterConfig.env` reaches the launched runtime for plain values:
  - a direct CTO probe issue successfully echoed an injected env value from runtime
  - this proves the installed Paperclip build supports issue-scoped adapter env overrides in execution
- security sharp edge:
  - plain env override values are persisted on the Paperclip issue object and therefore must not be used for subscriber API keys or other tenant secrets
  - on the installed Paperclip build, `secret_ref` issue overrides for provider env keys currently fail validation, so the staged Wealth Factory path uses agent-bound version-pinned `secret_ref` bindings instead of issue-scoped secret refs
- current implication for Wealth Factory:
  - do not switch the checked-in adapter yet
- the installed Paperclip build now looks capable of deterministic issue-launch plus run-id polling, and the repo now assumes board-session secret projection via `WF_PAPERCLIP_BOARD_SESSION_TOKEN`, `WF_PAPERCLIP_BOARD_ORIGIN` as the board-session secret-route base, and `WF_PAPERCLIP_ISSUE_AGENT_ID`
  - the live VPS contract no longer uses `/api/admin/...` bearer routes for secret lifecycle work; it now depends on the trusted board session routes `GET/POST /api/companies/:companyId/secrets`, `POST /api/secrets/:secretId/rotate`, `PATCH /api/secrets/:secretId`, and `PATCH /api/agents/:agentId`

## Next VPS Proof Sequence

After the stage/live containers are running with the issue-launch board-session env, verify the lifecycle end to end in this order:

1. Register or refresh a tenant provider credential and confirm the API logs an audited projection attempt without breaking local registration if the Paperclip mapping is absent.
2. Seed or confirm the matching `wfpc.paperclip_company_mappings` row, then repeat registration and confirm a Paperclip secret binding is created for the configured issue agent.
3. For any additional staged Paperclip company, mint a company-scoped agent key with `POST /api/agents/:agentId/keys` from the trusted public Paperclip board origin and add it to `WF_PAPERCLIP_SERVICE_TOKEN_MAP`.
4. Queue a real run and confirm the worker reuses the same board-session binding contract during issue-launch secret sync, refreshing the Paperclip issue agent binding without exposing raw secret values in the issue payload.
5. Rotate the tenant credential and confirm a first-time or replacement binding is refreshed remotely without exposing raw secret values in the launch payload.
6. Revoke the tenant credential and confirm future runs fail closed while the Paperclip binding cleanup path is attempted and audited.

Repeatable operator helpers for this proof lane:

- `npm run prove:provider-lifecycle -- --tenant <tenant-id> --user <user-id> --provider-kind openai_api --label OpenAI`
- `npm run seed:demo -- --lane secondary --paperclip-company-id <paperclip-company-id>`
- the API runtime image now carries the repo `scripts/` folder, and `scripts/lib/script-env.mjs` tolerates a missing `.env`, so `docker exec wealth-factory-api-stage2 node scripts/inspect-live-workflow-run.mjs ...` no longer requires copying helper scripts or an ad hoc env file into the container first

Set the lifecycle proof env before using the helper:

- `WF_LIFECYCLE_SECRET_VALUE` for `register` and `full`
- `WF_LIFECYCLE_SECRET_VALUE_NEXT` for `rotate` and `full`

Do not treat a public Paperclip target as release-safe. Before commercial rollout, remove the host port publish and public router so Paperclip is reachable only from the Wealth Factory API and worker containers.

## Current External Smoke Status

Last checked from outside the VPS on 2026-05-15:

- PASS: `www.spyderbyte.cloud` and `api.spyderbyte.cloud` resolve to `187.77.19.83`.
- PASS: Public ports `80` and `443` are reachable.
- PASS: Redis `6379`, Paperclip `3100`, app/dev ports `3000`, `5173`, API direct ports `8080`, `8081`, and Docker daemon `2375` were not reachable.
- PASS: `https://api.spyderbyte.cloud/health` returns `200 {"status":"ok","service":"wealth_factory_api"}`.
- PASS: `https://api.spyderbyte.cloud/api/dashboard` now rejects unauthenticated requests with `401`, rejects untrusted origins with `403`, and returns tenant-scoped Wealth Factory data when called with a valid signed runtime session token from an allowed origin.
- PASS: `npm run e2e:live` now verifies the deployed unauthenticated browser-navigation contract against `https://api.spyderbyte.cloud`, and the optional authenticated-shell check skips cleanly when no deploy-safe session cookie is supplied.
- PASS: `api.spyderbyte.cloud` now proxies to the live `wealth-factory-api` container through `supabase-caddy`.
- BLOCKED: `5432` and `8000` remain reachable externally. These are still part of the temporary multi-project exposure and must be firewall or allowlist restricted before commercial exposure. `8443` now probes closed externally.
- BLOCKED: `https://api.spyderbyte.cloud/` still returns `404 {"code":"not_found"}` to the script-based unauthenticated shell probe used by `npm run smoke:external` when that probe sends an explicit portal `Origin` header. This differs from top-level browser navigation, which currently receives an unauthenticated app response, so the authenticated API-origin shell rollout should not be treated as fully consistent yet.
- BLOCKED: `https://api.spyderbyte.cloud/api/storage/oauth/google_drive/begin` returns `503 {"code":"storage_oauth_unavailable"}` until Google Drive and Dropbox OAuth client credentials are configured for the runtime.

Do not treat the VPS deployment as release-safe until `npm run smoke:external` passes or the intentionally unconfigured storage OAuth check is explicitly carved out for pre-credential environments.

## Reversible Operator Sequence

Use this sequence when other work in progress may still depend on currently exposed Supabase or Kong ports. The goal is to make temporary hardening and shell rollout testable without losing the ability to reopen those ports afterward.

1. Capture the current published-port state before changing anything:

```bash
sudo docker ps --format 'table {{.Names}}\t{{.Ports}}'
sudo ss -tulpn | egrep '(:80|:443|:3100|:5432|:6543|:8000|:8443|:8080|:8081)'
curl -i https://api.spyderbyte.cloud/
curl -i -H 'Origin: https://www.spyderbyte.cloud' https://api.spyderbyte.cloud/api/dashboard
```

2. If another project still needs public access to `5432` or `8000`, record that dependency and postpone temporary restriction until its owner approves the test window.
3. When a test window is available, apply the temporary port restrictions using the reversible firewall sequence below.
4. Roll out the Wealth Factory API shell env vars in the live `wealth-factory-api` deployment:
   - `WF_WEB_APP_ENTRY_URL`
   - `WF_WEB_APP_STYLESHEET_URL` if the build emits one
5. Restart only the affected Wealth Factory service or compose stack, not unrelated VPS projects.
6. Rerun:

```powershell
npm run smoke:external
$env:WF_LIVE_BASE_URL="https://api.spyderbyte.cloud"
npm run e2e:live
```

7. If the tests pass but other in-progress builds still require those previously exposed ports, reopen only the specific ports that were intentionally closed for the test window and document who requested them.
8. If tests fail, restore the pre-change port posture and shell env state before moving on.

## Remediate Current Smoke Blockers

These commands are intended to be run on the VPS by an operator with sudo/root access. Adjust the trusted admin IP value before applying firewall rules.

### Restrict Supabase And Kong Ports

Current smoke tests show `5432` and `8000` reachable from the public internet. `8443` now probes closed externally. For a commercial Wealth Factory deployment, the remaining exposed admin/service ports must not be public.

Recommended UFW posture:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow from <trusted-admin-ip>/32 to any port 22 proto tcp

# Optional temporary admin access for direct self-hosted Supabase maintenance.
# Remove these before commercial exposure unless access is restricted by VPN.
sudo ufw allow from <trusted-admin-ip>/32 to any port 5432 proto tcp
sudo ufw allow from <trusted-admin-ip>/32 to any port 8000 proto tcp
sudo ufw deny 5432/tcp
sudo ufw deny 8000/tcp
sudo ufw enable
sudo ufw status verbose
```

If Docker-published ports bypass UFW on the VPS, apply provider firewall rules in the VPS control panel too. The external gate is authoritative: `npm run smoke:external` must report `5432` and `8000` as closed from an untrusted network, and continue confirming that `8443` stays closed.

For Docker Compose hardening, avoid publishing Supabase/Kong/Postgres ports to `0.0.0.0`. Bind admin-only services to loopback or a private VPN interface when direct maintenance access is needed.

### Temporary Reopen Sequence

If another active VPS project still needs one of the restricted ports after the Wealth Factory test window, reopen only the exact port required and only for the shortest practical time.

```bash
# Example: temporarily reopen only 5432 to the trusted admin IP.
sudo ufw delete deny 5432/tcp
sudo ufw allow from <trusted-admin-ip>/32 to any port 5432 proto tcp
sudo ufw status numbered
```

When that dependent work is finished, restore the deny rule and rerun the external smoke check:

```bash
sudo ufw delete allow from <trusted-admin-ip>/32 to any port 5432 proto tcp
sudo ufw deny 5432/tcp
sudo ufw status numbered
```

```powershell
npm run smoke:external
```

If Docker-published ports are managed outside UFW, apply the same open-close sequence in the VPS provider firewall or compose publishing rules instead of assuming host firewall changes are enough.

### Roll Out API Shell Env Vars

The current live `wealth-factory-api` container is running without the shell env vars, so `/` still behaves like an API-only deployment. Before expecting the authenticated API-origin shell to work, confirm these env vars are present in the live service definition:

- `WF_WEB_APP_ENTRY_URL`
- `WF_WEB_APP_STYLESHEET_URL` if the build emits one

Recommended verification from the VPS after redeploy:

```bash
sudo docker inspect wealth-factory-api --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^WF_WEB_'
curl -i -H 'Cookie: wf_portal_session=<deploy-session-token>' https://api.spyderbyte.cloud/
```

Expected:

- `WF_WEB_APP_ENTRY_URL` is present in the live container env.
- `WF_WEB_APP_STYLESHEET_URL` is present when the current web build emits a standalone stylesheet.
- Authenticated `GET /` returns HTML with `id="wf-dashboard-bootstrap"` instead of `{"code":"not_found"}`.

### Fix API TLS

Current smoke tests no longer show a TLS handshake failure. `api.spyderbyte.cloud` has a valid certificate and a live Caddy route. Use the following steps only if the TLS route regresses in a later deploy.

For Caddy-based deployments:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl status caddy --no-pager
sudo journalctl -u caddy -n 100 --no-pager
sudo caddy reload --config /etc/caddy/Caddyfile
```

Confirm the Caddyfile has an explicit `api.spyderbyte.cloud` site block and proxies only to the Wealth Factory API service, not to Supabase Kong or another TLS listener.

For Nginx-based deployments:

```bash
sudo nginx -t
sudo systemctl status nginx --no-pager
sudo journalctl -u nginx -n 100 --no-pager
sudo certbot certificates
sudo systemctl reload nginx
```

Confirm the certificate paths for `api.spyderbyte.cloud` exist and that the server block proxies to the internal API port only.

After changing firewall or TLS configuration, rerun from outside the VPS:

```powershell
npm run smoke:external
```

## Rollback

1. Keep the previous immutable image tags available.
2. Restore the previous `WF_WEB_APP_ENTRY_URL` and `WF_WEB_APP_STYLESHEET_URL` values that match the known-good image tag.
3. Update `SPYDERBYTE_IMAGE_TAG` and `PAPERCLIP_IMAGE_TAG` back to previous known-good tags.
4. Run `docker compose -f deploy/docker-compose.yml up -d`.
5. Confirm the smoke tests pass.
