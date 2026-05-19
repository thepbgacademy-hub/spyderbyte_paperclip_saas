# Security Report

Date: 2026-05-18
Target: `E:\REPOS\spyderbyte_paperclip_saas`
Branch: `codex/phase-0-foundation`

## Executive Summary

The codebase shows strong defensive intent around tenant isolation, queue
payload hygiene, secret redaction, vault-backed credential storage, and response
guarding. The main security concerns are concentrated in the current POC auth
model and incomplete production hardening rather than obvious raw-secret leaks.

Confirmed findings:

- 1 High
- 2 Medium
- 2 Low
- 0 Critical

Overall risk score: `19` (`Moderate Risk`)

Secret exposure status: No confirmed live secrets were identified in tracked
repository files or scanned git history. A local `.env` file exists in the
working tree and is gitignored, which is good, but local runtime secrets should
still be handled as sensitive workstation material.

## Methodology

Checked:

- TypeScript server and frontend sources under `src/` and `apps/web/`
- deployment/config files under `deploy/`
- SQL migrations under `supabase/migrations/`
- tests under `tests/` and `apps/web/tests/`
- tracked environment template files including `.env.example`
- git history using targeted `git log -G` searches for secret/provider patterns

Executed:

- OWASP-style manual review of auth, access control, config, injection, crypto,
  logging, and failure handling surfaces
- broad current-tree keyword/pattern scan
- targeted git history scan for common secret patterns

## Findings

### High

#### 1. Static shared runtime auth is still acting as the primary access model

- Category: `A07 Authentication Failures`
- CWE: `CWE-798`, `CWE-287`
- File: [runtime-auth.ts](E:\REPOS\spyderbyte_paperclip_saas\src\api\runtime-auth.ts:18)
- Severity: High

Evidence:

- The runtime loads one shared `WF_API_BEARER_TOKEN`
- The runtime derives one static `tenantId`, `userId`, and `role` from env
- Any request presenting the matching bearer token or cookie is mapped to that
  single static session

Risk:

- If the deploy bearer token is exposed, an attacker gets authenticated access
  as the configured static session
- This model does not provide per-user identity, expiry, issuer, audience, or
  session revocation semantics
- It is especially risky in a multi-tenant commercial system if not removed

Recommended remediation:

- Replace static runtime auth with tenant-aware user authentication before
  commercial production
- Require signed/expiring user sessions or validated bearer tokens with issuer,
  audience, expiry, membership, and role checks
- Keep the current path only as a tightly bounded deployment/debug mechanism

#### 2. Security-relevant credential events are not persisted in the runtime composition

- Category: `A09 Security Logging and Alerting Failures`
- CWE: `CWE-778`
- File: [runtime-server.ts](E:\REPOS\spyderbyte_paperclip_saas\src\api\runtime-server.ts:96)
- Severity: Medium

Evidence:

- `createVaultBackedProviderCredentialRegistration(...)` is wired with
  `audit: async () => undefined`

Risk:

- Provider credential registration and access events may not be durably logged
  in the live runtime path
- This weakens incident response, credential tracing, and compliance evidence

Recommended remediation:

- Replace the no-op audit function with durable audit persistence
- Ensure provider create/access/rotate/revoke events are recorded with masked
  metadata only
- Add runtime tests confirming audit writes occur in production composition

### Medium

#### 3. CSP currently allows inline styles in the app shell

- Category: `A02 Security Misconfiguration`
- CWE: `CWE-693`
- File: [app-shell.ts](E:\REPOS\spyderbyte_paperclip_saas\src\api\app-shell.ts:101)
- Severity: Medium

Evidence:

- CSP includes `style-src 'self' 'unsafe-inline'`

Risk:

- This weakens the browser’s mitigation surface for style/script-adjacent
  injection chains
- It may be acceptable during UI bootstrap, but it should not remain broader
  than necessary

Recommended remediation:

- Move toward nonce- or hash-based style allowances where practical
- Reduce inline style usage in the shell/bootstrap path
- Keep CSP strict for scripts and progressively harden styles

#### 4. Production hardening depends on operator discipline for network exposure

- Category: `A02 Security Misconfiguration`
- CWE: `CWE-16`
- Files:
  - [HANDOFF.md](E:\REPOS\spyderbyte_paperclip_saas\HANDOFF.md:74)
  - [deploy-poc.md](E:\REPOS\spyderbyte_paperclip_saas\deploy\runbooks\deploy-poc.md:157)
- Severity: Medium

Evidence:

- Known open external ports `5432` and `8000` are still documented as pending
  closure/allowlisting
- The repo already treats this as a release blocker

Risk:

- Publicly reachable database/app ports materially raise compromise risk
- Even with auth, unnecessary exposed services increase attack surface

Recommended remediation:

- Close or allowlist the ports before any commercial exposure
- Treat `npm run smoke:external` as a release gate
- Add deployment automation checks so this cannot regress silently

### Low

#### 5. Local tracked `.env` presence should remain tightly controlled

- Category: `A02 Security Misconfiguration`
- CWE: `CWE-922`
- Files:
  - [.gitignore](E:\REPOS\spyderbyte_paperclip_saas\.gitignore:7)
  - local working tree `.env` file present but gitignored
- Severity: Low

Evidence:

- A local `.env` file exists in the working directory
- `.gitignore` excludes `.env` and `.env.*` while keeping `.env.example`

Risk:

- This is not a tracked-repo leak by itself
- It is still a sensitive workstation artifact and could be mishandled outside git

Recommended remediation:

- Keep `.env` untracked
- Restrict local machine access and backup handling
- Prefer secret managers or root-owned deployment env files for VPS runtime secrets

#### 6. Test fixtures contain provider-shaped dummy secrets

- Category: `A09 Security Logging and Alerting Failures`
- CWE: `CWE-200`
- Files:
  - [workflow.spec.ts](E:\REPOS\spyderbyte_paperclip_saas\apps\web\tests\e2e\workflow.spec.ts:35)
  - [tenant-isolation.spec.ts](E:\REPOS\spyderbyte_paperclip_saas\apps\web\tests\e2e\tenant-isolation.spec.ts:56)
  - [workflow-queue.test.ts](E:\REPOS\spyderbyte_paperclip_saas\tests\workflow-queue.test.ts:162)
- Severity: Low

Evidence:

- Test fixtures use provider-shaped values such as masked/dummy `sk-...` strings

Risk:

- These appear to be test-only and non-live
- They can still confuse scanners and humans reviewing the repo

Recommended remediation:

- Prefer clearly fake sentinel values like `test-openai-key-placeholder`
- Keep tests asserting redaction/no-leak behavior

## OWASP Category Summary

### A01 Broken Access Control

No direct route-level broken access control finding was confirmed in the scanned
code. The codebase contains several positive controls, including tenant
membership checks, response guards, and ACID reservation/entitlement checks.

### A02 Security Misconfiguration

Findings:

- CSP includes `'unsafe-inline'` for styles
- documented external port exposure remains a known deployment blocker

### A03 Software Supply Chain Failures

No specific vulnerable dependency was confirmed from code inspection alone.
Lockfiles are present. A dedicated dependency vulnerability scan should still be
run before release.

### A04 Cryptographic Failures

No weak crypto primitive misuse was confirmed in the scanned code. Positive
signals include `timingSafeEqual` for token comparison and AES-GCM vault usage
in the secret layer.

### A05 Injection

No confirmed SQL injection, command injection, or obvious XSS sink was found in
the scanned sources. The app shell escapes HTML/JSON bootstrap content and the
response guard blocks many secret/internal leakage patterns.

### A06 Insecure Design

The current shared-static auth path remains an insecure-by-design POC mechanism
that must be replaced before production multi-tenant use.

### A07 Authentication Failures

Confirmed high-severity finding:

- static bearer-token/cookie auth maps all matching requests into one env-backed
  session identity

### A08 Software or Data Integrity Failures

No confirmed finding from the reviewed code paths.

### A09 Security Logging and Alerting Failures

Confirmed finding:

- runtime credential registration composition currently uses a no-op audit sink

### A10 Mishandling of Exceptional Conditions

No direct fail-open condition was confirmed. Error handling generally fails
closed with sanitized responses, though the current auth/runtime model still
needs stronger production semantics.

## Secret Exposure Scan

Scope checked:

- current tracked repository tree
- `.env.example`
- deployment manifests
- source code and test files
- targeted git history via `git log -G`

Confirmed results:

- No confirmed live secrets were identified in tracked repository files
- No confirmed live secrets were identified in scanned git history results
- `.env.example` contains placeholders only
- `.gitignore` excludes `.env` and `.env.*` while preserving `.env.example`

Notes:

- The repository contains many secret-handling tests and provider-shaped dummy
  values. These were reviewed as test fixtures, not live exposures.
- A local `.env` file exists in the working tree but is gitignored; this is a
  local secret-handling concern rather than a tracked repository exposure.

## Remediation Priority

1. Replace static shared runtime auth with real tenant-aware user/session auth
   before commercial production.
2. Wire durable audit persistence into runtime credential registration and
   secret-access paths.
3. Close or allowlist external ports `5432` and `8000` and keep external smoke
   tests as a hard release gate.
4. Tighten CSP and reduce inline-style allowances where possible.
5. Keep local `.env` handling disciplined and continue avoiding tracked secret files.

