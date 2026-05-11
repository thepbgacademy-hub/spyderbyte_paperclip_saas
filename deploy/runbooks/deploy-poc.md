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
- `WF_VAULT_MASTER_KEY`
- `SPYDERBYTE_IMAGE_TAG`
- `PAPERCLIP_IMAGE_TAG`

Tenant OpenAI and generic provider keys remain BYOK runtime secrets stored by reference. They must not be baked into Docker images, browser bundles, Compose files, or Redis jobs.

## Deploy

1. Build and push the `spyderbyte/web`, `spyderbyte/api`, and `spyderbyte/worker` images with an immutable commit tag.
2. Copy `deploy/docker-compose.yml` and `deploy/nginx/spyderbyte.conf` to the VPS.
3. Install TLS certificates for `www.spyderbyte.cloud` if used for the POC app and `api.spyderbyte.cloud` for the backend API.
4. Set `SPYDERBYTE_IMAGE_TAG` to the selected commit tag and `PAPERCLIP_IMAGE_TAG` to a reviewed version or digest-backed tag.
5. Set `WF_ALLOWED_ORIGINS` to the exact customer portal origin or comma-separated allowed origins. Do not use wildcard origins for authenticated routes.
6. Load the required server-side secrets into the shell or an `.env` file readable only by the deploy user.
7. Run `docker compose -f deploy/docker-compose.yml pull`.
8. Run `docker compose -f deploy/docker-compose.yml up -d`.
9. Run `docker compose -f deploy/docker-compose.yml ps` and confirm `api`, `worker`, `paperclip`, and `redis` are healthy or running.

## Smoke Tests

From outside the VPS:

```powershell
npm run smoke:external
curl.exe -I https://www.spyderbyte.cloud
curl.exe -I https://api.spyderbyte.cloud/health
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

Then run:

```powershell
npm run e2e
```

Point Playwright at the deployed origin before using this as a release gate.

## Current External Smoke Status

Last checked from outside the VPS on 2026-05-11:

- PASS: `www.spyderbyte.cloud` and `api.spyderbyte.cloud` resolve to `187.77.19.83`.
- PASS: Public ports `80` and `443` are reachable.
- PASS: Redis `6379`, Paperclip `9000`, app/dev ports `3000`, `5173`, API direct ports `8080`, `8081`, and Docker daemon `2375` were not reachable.
- BLOCKED: `5432`, `8000`, and `8443` were reachable externally. These appear to be Supabase Postgres/Kong exposure and must be firewall or allowlist restricted before commercial exposure.
- BLOCKED: `https://api.spyderbyte.cloud/api/dashboard` failed TLS handshake, so CORS/auth/response-guard checks could not run externally.

Do not treat the VPS deployment as release-safe until `npm run smoke:external` passes.

## Rollback

1. Keep the previous immutable image tags available.
2. Update `SPYDERBYTE_IMAGE_TAG` and `PAPERCLIP_IMAGE_TAG` back to previous known-good tags.
3. Run `docker compose -f deploy/docker-compose.yml up -d`.
4. Confirm the smoke tests pass.
