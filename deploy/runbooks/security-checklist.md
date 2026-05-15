# Wealth Factory Security Checklist

Use this checklist before exposing a Wealth Factory POC or release candidate to real companies.

## Split-Origin And Network Exposure

- [ ] Portal/dashboard origin is explicitly configured.
- [ ] API origin is explicitly configured.
- [ ] Authenticated HTML shell serves from the API origin, and `/app-assets/` resolves to the approved frontend build output or reverse-proxy target.
- [ ] Authenticated CORS allows only the configured portal origin(s).
- [ ] Public VPS ports are limited to `80` and `443`.
- [ ] Supabase/Postgres/Kong ports `5432`, `8000`, and `8443` are closed publicly or restricted to trusted admin/VPN IPs only.
- [ ] SSH is key-only and restricted by firewall, VPN, or trusted IP allowlist.
- [ ] Paperclip has no public binding.
- [ ] Redis has no public binding.
- [ ] Workers, Docker socket, admin panels, debug ports, and metrics endpoints have no public binding.
- [ ] TLS certificates are valid and renewal is monitored.

## Auth, Sessions, And API Protection

- [ ] Auth strategy is documented for the portal/API pair.
- [ ] Same-site cookie bootstrap is documented and uses `Secure`, `HttpOnly`, and the intended `SameSite` policy.
- [ ] Cross-origin cookie sessions remain disabled unless CSRF protection is implemented and verified.
- [ ] Bearer-token auth, if used, validates issuer, audience, expiry, tenant membership, and route role.
- [ ] Public routes use schema validation and request size limits.
- [ ] Workflow-start, credential, package-install, auth-sensitive, and operator routes are rate limited.
- [ ] Customer-facing errors use only Wealth Factory-safe public codes.
- [ ] Security headers are configured at the reverse proxy or app layer.

## Tenant Isolation And RLS

- [ ] RLS is enabled on tenant-owned Supabase tables.
- [ ] Tenant A positive-access tests pass.
- [ ] Tenant A cannot read, update, delete, enqueue, replay, or infer Tenant B resources.
- [ ] Service-role operations are backend/worker only.
- [ ] Operator routes require operator role and write audit events.

## Secrets And Provider Credentials

- [ ] Supabase service-role key is never bundled into browser code.
- [ ] Paperclip service token is backend/worker only.
- [ ] Provider API keys and Codex auth state are stored by reference only.
- [ ] Queue payloads contain no raw secrets, provider tokens, or backend secret handles.
- [ ] Logs and audit events reference credentials by redacted reference only.
- [ ] Credential rotation and revoke paths have race-condition tests.

## Packages, Entitlements, And Race Conditions

- [ ] Subscription status is checked transactionally before run creation.
- [ ] Installed package and add-on entitlements are checked transactionally before run creation.
- [ ] Tenant pause state blocks new runs immediately.
- [ ] Run creation uses idempotency keys or unique constraints.
- [ ] Package install and purchase activation use idempotency keys or unique constraints.
- [ ] Credential rotation/revoke cannot race with new run enqueue.
- [ ] Workers re-check tenant pause, entitlement, workflow membership, and credential status before calling Paperclip.

## Paperclip Boundary

- [ ] Customers cannot reach Paperclip directly.
- [ ] Paperclip runs in authenticated/private mode outside local development.
- [ ] Paperclip company IDs and run IDs never appear in browser responses.
- [ ] Prompts, skills, commands, agents, tool calls, raw activity, and internal logs are blocked by response-guard tests.
- [ ] Paperclip errors are translated to Wealth Factory public errors.

## Vulnerability Management

- [ ] Node dependencies have been audited for the release candidate.
- [ ] Container images are pinned to reviewed tags or immutable digests.
- [ ] Deployment images have been scanned for high/critical vulnerabilities.
- [ ] VPS packages are patched.
- [ ] Backups and restore procedure are tested.
- [ ] Secrets rotation procedure is documented.
- [ ] Incident response runbook is current.
