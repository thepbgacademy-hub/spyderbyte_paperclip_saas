# Phase 6 VPS Deployment POC

Reference docs: `docs/design.md`, `docs/build.md`, `TODO.md`.

## Hosts

- Public app: `www.spyderbyte.cloud`
- Public API: `api.spyderbyte.cloud`
- Internal workflow engine: Docker private network only
- Redis: Docker private network only

## Required Secrets

Set these on the VPS as root-owned environment files or deployment secrets. Do not place real values in Git.

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PAPERCLIP_SERVICE_TOKEN`
- `SPYDERBYTE_IMAGE_TAG`
- `PAPERCLIP_IMAGE_TAG`

Tenant OpenAI and generic provider keys remain BYOK runtime secrets stored by reference. They must not be baked into Docker images, browser bundles, Compose files, or Redis jobs.

## Deploy

1. Build and push the `spyderbyte/web`, `spyderbyte/api`, and `spyderbyte/worker` images with an immutable commit tag.
2. Copy `deploy/docker-compose.yml` and `deploy/nginx/spyderbyte.conf` to the VPS.
3. Install TLS certificates for `www.spyderbyte.cloud` and `api.spyderbyte.cloud`.
4. Set `SPYDERBYTE_IMAGE_TAG` to the selected commit tag and `PAPERCLIP_IMAGE_TAG` to a reviewed version or digest-backed tag.
5. Load the required server-side secrets into the shell or an `.env` file readable only by the deploy user.
6. Run `docker compose -f deploy/docker-compose.yml pull`.
7. Run `docker compose -f deploy/docker-compose.yml up -d`.
8. Run `docker compose -f deploy/docker-compose.yml ps` and confirm `api`, `worker`, `paperclip`, and `redis` are healthy or running.

## Smoke Tests

From outside the VPS:

```powershell
curl.exe -I https://www.spyderbyte.cloud
curl.exe -I https://api.spyderbyte.cloud/health
curl.exe --connect-timeout 5 http://<vps-public-ip>:9000/health
Test-NetConnection www.spyderbyte.cloud -Port 6379
```

From the VPS:

```powershell
docker compose -f deploy/docker-compose.yml port paperclip 9000
docker compose -f deploy/docker-compose.yml port redis 6379
```

Expected:

- App returns HTTP 200 or 304.
- API health returns HTTP 200 with SpyderByte-safe health output.
- Public port 9000 is closed or unreachable from outside the VPS.
- Redis port is closed externally.
- `docker compose port paperclip 9000` prints no host binding.
- `docker compose port redis 6379` prints no host binding.

Then run:

```powershell
npm run e2e -- --config apps/web/playwright.config.ts --project chromium
```

Point Playwright at the deployed origin before using this as a release gate.

## Rollback

1. Keep the previous immutable image tags available.
2. Update `SPYDERBYTE_IMAGE_TAG` and `PAPERCLIP_IMAGE_TAG` back to previous known-good tags.
3. Run `docker compose -f deploy/docker-compose.yml up -d`.
4. Confirm the smoke tests pass.
