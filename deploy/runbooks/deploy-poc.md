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
- `WF_ALLOWED_ORIGINS`
- `WF_API_BEARER_TOKEN`
- `WF_API_TENANT_ID`
- `WF_API_USER_ID`
- `WF_API_ROLE`
- `WF_VAULT_MASTER_KEY`
- `WF_WEB_APP_ENTRY_URL`
- `WF_WEB_APP_STYLESHEET_URL` if emitted by `npm run resolve:web-assets`
- `WF_PORTAL_SESSION_COOKIE_NAME`
- `SPYDERBYTE_IMAGE_TAG`
- `PAPERCLIP_IMAGE_TAG`

Tenant OpenAI and generic provider keys remain BYOK runtime secrets stored by reference. They must not be baked into Docker images, browser bundles, Compose files, or Redis jobs.

Current POC auth note:

- The deployed API shell and dashboard API currently trust a static runtime bearer token configured through `WF_API_BEARER_TOKEN`.
- The same token may also be presented through the configured portal session cookie name for same-site shell bootstrap smoke checks.
- Treat this as a deploy-only/shared-secret POC path, not a long-term end-user auth design.

## Deploy

1. Build and push the `spyderbyte/web`, `spyderbyte/api`, and `spyderbyte/worker` images with an immutable commit tag.
2. Copy `deploy/docker-compose.yml` and `deploy/nginx/spyderbyte.conf` to the VPS.
3. Install TLS certificates for `www.spyderbyte.cloud` if used for the POC app and `api.spyderbyte.cloud` for the backend API.
4. Set `SPYDERBYTE_IMAGE_TAG` to the selected commit tag and `PAPERCLIP_IMAGE_TAG` to a reviewed version or digest-backed tag.
5. Set `WF_ALLOWED_ORIGINS` to the exact customer portal origin or comma-separated allowed origins. Do not use wildcard origins for authenticated routes.
6. Load the required server-side secrets into the shell or an `.env` file readable only by the deploy user.
7. Build the frontend assets and resolve the API-shell asset URLs:

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
10. Run `docker compose -f deploy/docker-compose.yml ps` and confirm `api`, `worker`, `paperclip`, and `redis` are healthy or running.

## Smoke Tests

From outside the VPS:

```powershell
npm run smoke:external
curl.exe -I https://www.spyderbyte.cloud
curl.exe -I https://api.spyderbyte.cloud/health
curl.exe -I https://api.spyderbyte.cloud/app-assets/
curl.exe --connect-timeout 5 http://<vps-public-ip>:9000/health
Test-NetConnection www.spyderbyte.cloud -Port 6379
Test-NetConnection api.spyderbyte.cloud -Port 80
Test-NetConnection api.spyderbyte.cloud -Port 443
Test-NetConnection api.spyderbyte.cloud -Port 9000
Test-NetConnection api.spyderbyte.cloud -Port 6379
```

From the VPS:

```powershell
docker compose -f deploy/docker-compose.yml port paperclip 9000
docker compose -f deploy/docker-compose.yml port redis 6379
```

Expected:

- `npm run smoke:external` exits `0`.
- App returns HTTP 200 or 304.
- API health returns HTTP 200 with SpyderByte-safe health output.
- API shell assets are reachable only through the intended `/app-assets/` reverse-proxy path.
- API responses include only Wealth Factory-safe health fields.
- Public port 9000 is closed or unreachable from outside the VPS.
- Redis port is closed externally.
- Only 80 and 443 are externally reachable on the API host.
- `docker compose port paperclip 9000` prints no host binding.
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

For authenticated shell smoke checks, set a deploy-safe cookie token before running the external smoke script:

```powershell
$env:WF_SMOKE_SESSION_COOKIE_NAME="wf_portal_session"
$env:WF_SMOKE_SESSION_COOKIE_VALUE="<deploy-session-token>"
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

Do not treat a public Paperclip target as release-safe. Before commercial rollout, remove the host port publish and public router so Paperclip is reachable only from the Wealth Factory API and worker containers.

## Current External Smoke Status

Last checked from outside the VPS on 2026-05-15:

- PASS: `www.spyderbyte.cloud` and `api.spyderbyte.cloud` resolve to `187.77.19.83`.
- PASS: Public ports `80` and `443` are reachable.
- PASS: Redis `6379`, Paperclip `9000`, app/dev ports `3000`, `5173`, API direct ports `8080`, `8081`, and Docker daemon `2375` were not reachable.
- PASS: `https://api.spyderbyte.cloud/health` returns `200 {"status":"ok","service":"wealth_factory_api"}`.
- PASS: `https://api.spyderbyte.cloud/api/dashboard` now rejects unauthenticated requests with `401`, rejects untrusted origins with `403`, and returns tenant-scoped Wealth Factory data when called with the deploy bearer token from an allowed origin.
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
sudo ss -tulpn | egrep '(:80|:443|:5432|:6543|:8000|:8443|:9000|:8080|:8081)'
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
2. Update `SPYDERBYTE_IMAGE_TAG` and `PAPERCLIP_IMAGE_TAG` back to previous known-good tags.
3. Run `docker compose -f deploy/docker-compose.yml up -d`.
4. Confirm the smoke tests pass.
