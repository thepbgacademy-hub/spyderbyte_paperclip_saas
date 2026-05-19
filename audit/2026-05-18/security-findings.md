# Security Findings

Date: 2026-05-18
Target: `E:\REPOS\spyderbyte_paperclip_saas`
Branch: `codex/phase-0-foundation`

## Executive Summary

The repo remains in a good pre-production state, but the active test deployment
still carries several intentional security exceptions that must not ship as-is.
The most important current risks are:

- shared bearer-token runtime auth remains the primary authenticated app path
- Paperclip is intentionally exposed publicly for the current integration phase
- Paperclip deployment material on the VPS still includes live admin/bootstrap
  credentials in environment/config surfaces
- provider credential registration events still do not appear to be durably
  audited in runtime composition

These are acceptable for the current controlled test-drive phase only because
they are known, documented, and not yet being treated as launch posture.

Confirmed findings:

- 1 High
- 3 Medium
- 2 Low
- 0 Critical

Overall risk score: `21` (`Moderate Risk`)

## Scope And Methodology

Checked:

- repo sources under `src/`, `apps/web/`, `scripts/`, `deploy/`, `supabase/`,
  `tests/`, and current audit docs
- tracked environment and compose surfaces including `.env.example` and
  `deploy/docker-compose.yml`
- git history with targeted provider/secret pattern searches
- current external Paperclip exposure using network and health probes

Executed:

- repo-specific manual security review focused on auth, tenant isolation,
  queue/worker boundaries, deployment posture, secret handling, and operator
  controls
- current-tree secret keyword scan
- targeted git history scan for provider-shaped secrets and private-key material
- external validation of the current Paperclip test target

## Findings

### High

#### 1. Static shared runtime auth is still the primary app access model

- Category: `Authentication / Session Design`
- CWE: `CWE-798`, `CWE-287`
- File: [runtime-auth.ts](E:\REPOS\spyderbyte_paperclip_saas\src\api\runtime-auth.ts:23)
- Severity: High

Evidence:

- the runtime still requires one shared `WF_API_BEARER_TOKEN`
- matching bearer or cookie values are mapped to one env-backed static session
- the deployed shell/dashboard auth path still treats this as the active runtime
  gate

Risk:

- anyone obtaining the shared token can authenticate as the configured static
  tenant/user session
- the current model lacks per-user identity, expiry, issuer, audience, and
  revocation semantics
- this is especially risky if carried into commercial multi-tenant production

Recommended remediation:

- replace this with tenant-aware user authentication before launch
- keep the shared token path limited to deploy/debug use only
- enforce explicit separation between operator bootstrap auth and customer auth

### Medium

#### 2. Paperclip is publicly reachable in the temporary test deployment

- Category: `Deployment Exposure`
- Severity: Medium

Evidence:

- external probe to `187.77.19.83:53324` succeeded on 2026-05-18
- `curl http://187.77.19.83:53324/api/health` returned
  `{"status":"ok","deploymentMode":"authenticated","bootstrapStatus":"ready","bootstrapInviteActive":false}`
- `http://paperclip-gwry.srv1605805.hstgr.cloud` redirects publicly to HTTPS
- prior read-only VPS inspection showed the Paperclip deployment is intentionally
  published through a host port and public hostname route

Risk:

- Paperclip is reachable outside the intended Wealth Factory private-only
  topology
- this increases attack surface and creates a path for direct enumeration or
  auth pressure against the engine layer

Accepted-for-now status:

- this is an intentional temporary exception for controlled testing
- it should be treated as a pre-production-only posture

Recommended remediation:

- remove direct public port publishing before launch
- remove the public Paperclip hostname route before launch
- keep Paperclip reachable only on an internal Docker/private network from the
  Wealth Factory API and worker services

#### 3. Live Paperclip deployment material includes sensitive admin/bootstrap credentials

- Category: `Secret Handling / Deployment Hygiene`
- Severity: Medium

Evidence:

- prior read-only VPS inspection confirmed that the Paperclip deployment
  environment/config surfaces include live admin/bootstrap-style secret values
- those values were observed only for verification and are intentionally not
  reproduced in this report

Risk:

- even when used only for testing, live secrets in deployment env/config
  surfaces increase the blast radius of host or operator compromise
- combined with the current public exposure, this becomes more sensitive than a
  private-only service would be

Accepted-for-now status:

- known temporary exception for the current test phase
- not acceptable launch posture

Recommended remediation:

- rotate the Paperclip admin/bootstrap credentials before or during final
  topology hardening
- move the final deployment to private-only networking before launch
- keep deployment secrets in locked-down root-owned env or secret manager
  surfaces only

#### 4. Provider credential registration events still appear to use a no-op audit sink

- Category: `Security Logging And Auditability`
- CWE: `CWE-778`
- File: [runtime-server.ts](E:\REPOS\spyderbyte_paperclip_saas\src\api\runtime-server.ts:96)
- Severity: Medium

Evidence:

- `createVaultBackedProviderCredentialRegistration(...)` is still composed with
  `audit: async () => undefined`

Risk:

- sensitive operator/provider credential lifecycle events may not leave durable
  audit evidence
- this weakens incident response and compliance confidence once real tenants are
  active

Recommended remediation:

- replace the no-op audit sink with durable masked audit persistence
- add runtime tests proving credential create/rotate/revoke activity writes
  audit records without exposing raw secret material

### Low

#### 5. CSP still permits inline styles in the app shell

- Category: `Browser Hardening`
- File: [app-shell.ts](E:\REPOS\spyderbyte_paperclip_saas\src\api\app-shell.ts:101)
- Severity: Low

Evidence:

- the current CSP includes `style-src 'self' 'unsafe-inline'`

Risk:

- this is a smaller hardening gap than the auth/deployment items above, but it
  does weaken the browser mitigation surface

Recommended remediation:

- move toward nonce- or hash-based style allowances where practical
- reduce inline style reliance in shell/bootstrap paths

#### 6. Local secret material exists outside tracked git scope

- Category: `Workstation Hygiene`
- Severity: Low

Evidence:

- repo root contains a local `.env` file that is gitignored
- local operator material such as `sudo_deploy.txt` exists outside tracked repo
  scope for deployment/testing workflows

Risk:

- this is not a tracked-repo leak by itself
- it remains sensitive local material that could be mishandled by backup,
  sharing, or workstation compromise

Recommended remediation:

- keep local secret files untracked
- restrict local access and backup handling
- rotate temporary deployment credentials before launch hardening

## Secret Exposure Scan

### Scope

Scanned:

- current tracked repository tree
- tracked env/config surfaces including `.env.example` and
  `deploy/docker-compose.yml`
- targeted git history for provider-shaped secrets and private-key material

Excluded from routine scan:

- `.git/**`
- `node_modules/**`
- generated build output directories

### Confirmed Results

- No confirmed live secrets were identified in tracked repository files.
- No confirmed live secrets were identified in the targeted git history scan.
- `.env.example` contains placeholder values only, including service-role,
  Paperclip token, database URL, and bearer-token placeholders.
- test fixtures contain clearly test-only provider-shaped values such as
  `sk-test-secret` and `sk-openai-secret`; these are not treated as live
  exposures.

### Secret-Handling Findings

#### A. Local `.env` file exists in the working tree but is gitignored

- Severity: Low
- Location: local working tree only
- Status: known local-only secret surface

Rationale:

- this is not a tracked repo leak
- it is still a sensitive workstation artifact

Recommended remediation:

- keep `.env` untracked
- avoid copying workstation env files into shared folders or tickets

#### B. VPS Paperclip deployment includes live secret material in env/config surfaces

- Severity: Medium
- Location: VPS deployment material outside tracked repo
- Evidence form: masked/withheld by design

Rationale:

- this is a real secret-handling concern for the active test deployment
- the values were not written into the repo and are intentionally omitted here

Recommended remediation:

- rotate these values before final production rollout
- keep the current temporary public Paperclip lane limited to controlled testing
- move final deployment secrets into a tighter private-only deployment posture

### Secret Scan Conclusion

No exposed live secrets were identified in the tracked repo scope or the
targeted git history that was scanned. The main secret risks are operational,
not repository-based: local workstation secret files and the current temporary
Paperclip VPS test deployment.

## Remediation Priority

1. Replace shared bearer-token runtime auth with real tenant-aware user/session
   auth before launch.
2. Move Paperclip off the public internet and onto a private-only topology
   before launch.
3. Rotate current Paperclip admin/bootstrap deployment credentials during final
   hardening.
4. Add durable masked audit logging for provider credential lifecycle events.
5. Tighten CSP and keep workstation secret handling disciplined.
