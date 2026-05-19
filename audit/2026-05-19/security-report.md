# Security Audit Report

**Project:** spyderbyte_paperclip_saas
**Date:** 2026-05-19
**Auditor:** Codex Security Scanner
**Framework:** OWASP Top 10:2025
**Scope:** `src/`, `apps/web/`, `tests/`, `deploy/`, `supabase/`, `scripts/`, `.env.example`, git history, and local secret-surface inventory
**Technology Stack:** TypeScript, Node.js, React, Vite, BullMQ, Redis, PostgreSQL, Supabase

---

## Executive Summary

This review was performed using the exact local `security-scanner` and `secret-scanner` skill workflows requested for this session. The codebase shows solid tenant-boundary intent: SQL access is parameterized, queue payloads are scrubbed for secret-like values, customer-facing responses are aggressively filtered for internal fields, and the encrypted vault uses authenticated encryption rather than weak custom crypto. Dependency hygiene is also currently clean: `package-lock.json` is present and `npm audit --omit=dev --json` reported zero known production vulnerabilities at scan time on May 19, 2026.

The main remaining risks are architectural and operational rather than low-level coding flaws. The signed runtime session-token hardening landed during this phase, so the old shared static bearer-token finding is now resolved in the working tree. The most important remaining issue is that the checked-in Paperclip launch contract still allows hydrated `secretValues` to be forwarded upstream, which conflicts with the more secure `secret_ref` direction already documented elsewhere in the repo. Auditability also remains incomplete because secret lifecycle and runtime access events are still composed with no-op audit sinks in the API and worker runtimes.

The repository did not show confirmed live secrets in tracked files or in the targeted git history scan. The main secret-handling concern inside the workspace is local-only material outside tracked git scope: an untracked `.env` and an untracked `sudo_deploy.txt` remain present and should continue to be treated as sensitive workstation-only files.

**Overall Risk Score:** 19 (Moderate Risk)

| Severity | Count |
|----------|-------|
| Critical | 0   |
| High     | 1   |
| Medium   | 2   |
| Low      | 2   |
| Info     | 0   |
| **Total**| **5** |

---

## Findings

### A01:2025 - Broken Access Control

No issues identified. Checked: tenant membership enforcement in `src/api/dashboard-api.ts`, `src/db/supabase-repositories.ts`, and transactional run reservation/ownership checks in `src/db/acid-guard-repository.ts`; queue payload validation in `src/workflows/queue.ts`; customer-response scrubbing in `src/wealthfactory/response-guard.ts`.

---

### A02:2025 - Security Misconfiguration

#### [LOW] App Shell CSP still permits inline styles
- **File:** `src/api/app-shell.ts`
- **Line(s):** 97-102
- **CWE:** CWE-693: Protection Mechanism Failure
- **Description:** The app shell CSP allows `style-src 'unsafe-inline'`. This is not an immediate exploit by itself, but it weakens the frontend hardening posture and makes future style-injection bugs more survivable than they need to be.
- **Evidence:**
  ```ts
  return {
    "content-security-policy": `default-src 'self'; script-src 'self' ${assetSources}; connect-src 'self' ${assetSources}; style-src 'self' 'unsafe-inline' ${assetSources}; img-src 'self' data: blob: ${assetSources}; font-src 'self' data: ${assetSources}; frame-ancestors 'none'; base-uri 'self'`
  };
  ```
- **Recommendation:**
  ```ts
  return {
    "content-security-policy": [
      "default-src 'self'",
      `script-src 'self' ${assetSources}`,
      `connect-src 'self' ${assetSources}`,
      `style-src 'self' ${assetSources}`,
      `img-src 'self' data: blob: ${assetSources}`,
      `font-src 'self' data: ${assetSources}`,
      "frame-ancestors 'none'",
      "base-uri 'self'"
    ].join("; ")
  };
  ```

---

### A03:2025 - Software Supply Chain Failures

No issues identified. Checked: `package.json`, `package-lock.json`, deployment manifests, and `npm audit --omit=dev --json`. The repo has a lock file and the production dependency audit returned zero known vulnerabilities at scan time.

---

### A04:2025 - Cryptographic Failures

No issues identified. Checked: `src/secrets/encrypted-vault.ts` and `src/secrets/redaction.ts`. The vault uses AES-256-GCM with a random IV and authentication tag, and the master key is derived through SHA-256 from a minimum-length secret rather than using reversible obfuscation or weak hashing for stored secrets.

---

### A05:2025 - Injection

No issues identified. Checked: parameterized SQL usage in `src/db/acid-guard-repository.ts` and `src/db/supabase-repositories.ts`, Paperclip HTTP client construction in `src/paperclip/client.ts`, queue validation in `src/workflows/queue.ts`, and grep review for `eval`, `new Function`, `exec`, `spawn`, and `child_process` patterns in `src/`.

---

### A06:2025 - Insecure Design

#### [HIGH] Paperclip launch contract still allows raw provider secret values to be forwarded upstream
- **File:** `src/paperclip/types.ts`
- **Line(s):** 11-18
- **CWE:** CWE-201: Insertion of Sensitive Information Into Sent Data
- **Description:** The checked-in launch contract still models `providerContext.secretValues` as a legal payload field. The live worker path hydrates tenant provider secrets just-in-time, and the Paperclip client then forwards the resulting `providerContext` body upstream. Even if this is currently intended only for a private integration lane, it keeps a raw-secret transport path alive in application code and conflicts with the safer `secret_ref`-based design already documented for production BYOK.
- **Evidence:**
  ```ts
  export type CreatePaperclipRunInput = {
    companyId: string;
    workflowId: string;
    spyderbyteRunId: string;
    providerContext?: readonly {
      capability: string;
      providerKind: string;
      label: string;
      secretRef: string;
      metadata: Record<string, unknown>;
      secretValues?: Record<string, string>;
    }[];
  };
  ```
- **File:** `src/paperclip/client.ts`
- **Line(s):** 63-70
- **Evidence:**
  ```ts
  const body = await request(`/api/companies/${encodeURIComponent(input.companyId)}/runs`, {
    method: "POST",
    body: JSON.stringify({
      workflowId: input.workflowId,
      externalRunId: input.spyderbyteRunId,
      ...(input.providerContext ? { providerContext: input.providerContext } : {})
    })
  });
  ```
- **Recommendation:**
  ```ts
  export type CreatePaperclipRunInput = {
    companyId: string;
    workflowId: string;
    spyderbyteRunId: string;
    providerContext?: readonly {
      capability: string;
      providerKind: string;
      label: string;
      secretRef: string;
      metadata: Record<string, unknown>;
      paperclipBindingId?: string;
    }[];
  };
  ```
  Move production execution to pre-provisioned Paperclip-managed secret bindings and remove raw `secretValues` from the upstream launch contract.

#### [MEDIUM] Rate limiting and OAuth callback state are process-local and reset on restart
- **File:** `src/security/rate-limit.ts`
- **Line(s):** 16-37
- **CWE:** CWE-307: Improper Restriction of Excessive Authentication Attempts
- **Description:** Public-route rate limiting uses an in-memory `Map` with per-process state only. If the API is restarted or scaled horizontally, limits reset and are not shared across instances. The map also has no cleanup path for long-lived high-cardinality IP churn.
- **Evidence:**
  ```ts
  const buckets = new Map<string, { count: number; windowStart: number }>();

  return {
    consume(key: string): RateLimitDecision {
      const current = now();
      const bucket = buckets.get(key);
      const activeBucket = bucket && current - bucket.windowStart < options.windowMs ? bucket : { count: 0, windowStart: current };
  ```
- **File:** `src/storage/storage-oauth-service.ts`
- **Line(s):** 146-157
- **Evidence:**
  ```ts
  export function createMemoryOAuthStateStore(): OAuthStateStore {
    const states = new Map<string, PendingOAuthState>();
    return {
      async save(input) {
        states.set(input.state, input.value);
      },
      async consume(input) {
        const value = states.get(input.state) ?? null;
        states.delete(input.state);
        return value;
      }
    };
  }
  ```
- **Recommendation:**
  ```ts
  type SharedStateStore = {
    save(input: { state: string; value: PendingOAuthState; ttlSeconds: number }): Promise<void>;
    consume(input: { state: string }): Promise<PendingOAuthState | null>;
  };

  type SharedRateLimiter = {
    consume(key: string, limit: number, windowMs: number): Promise<RateLimitDecision>;
  };
  ```
  Back both controls with Redis or another shared store so limits and OAuth state survive process restarts and coordinate across instances.

---

### A07:2025 - Authentication Failures

No current issue identified in the working tree. The earlier shared static bearer-token finding was resolved during this phase by moving runtime auth to signed session tokens with issuer, audience, expiry, max TTL, and cookie-or-bearer verification in `src/api/runtime-auth.ts`, `src/api/server-main.ts`, `src/api/storage-oauth-http.ts`, and `src/api/tenant-settings-api.ts`.

---

### A08:2025 - Software or Data Integrity Failures

No issues identified. Checked: dependency pinning through `package-lock.json`, absence of dynamic `eval`/`Function` patterns in `src/`, and repository code paths involved in queue payload validation and vault access.

---

### A09:2025 - Security Logging and Alerting Failures

#### [MEDIUM] Secret lifecycle and runtime access still use no-op audit sinks in composed API/worker runtimes
- **File:** `src/api/runtime-server.ts`
- **Line(s):** 96-109
- **CWE:** CWE-778: Insufficient Logging
- **Description:** Provider credential registration in the runtime server is composed with `audit: async () => undefined`, which means create/rotate/revoke/access paths can complete without a durable security audit trail unless a different composition layer is added later.
- **Evidence:**
  ```ts
  const registerProviderCredential = createVaultBackedProviderCredentialRegistration({
    vault: createEncryptedSecretVault({
      masterKey: options.env.vaultMasterKey,
      store: createPostgresEncryptedVaultStore(queryClient)
    }),
    repository: {
      create: repositories.createSecretReference,
      updateSecretRef: repositories.updateSecretRef,
      revoke: repositories.revokeSecretReference,
      findIdBySecretRef: repositories.findSecretReferenceId
    },
    audit: async () => undefined,
    runtimeEnv: options.env.runtimeEnv
  });
  ```
- **File:** `src/worker/runtime.ts`
- **Line(s):** 42-50
- **Evidence:**
  ```ts
  const secretService = createSecretService({
    vault,
    repository: {
      create: repositories.createSecretReference,
      updateSecretRef: repositories.updateSecretRef,
      revoke: repositories.revokeSecretReference,
      findIdBySecretRef: repositories.findSecretReferenceId
    },
    audit: async () => undefined
  });
  ```
- **Recommendation:**
  ```ts
  const audit = createMaskedAuditSink({
    write: persistSecurityEvent,
    redact: safeAuditMetadata
  });

  const secretService = createSecretService({
    vault,
    repository,
    audit
  });
  ```
  Persist masked audit records for secret create, rotate, revoke, and runtime access events, and add tests proving those events are attributable without exposing raw secret material.

---

### A10:2025 - Mishandling of Exceptional Conditions

No issues identified. Checked: `src/api/dashboard-http.ts`, `src/api/storage-oauth-http.ts`, `src/api/health-http.ts`, `src/api/runtime-server.ts`, `src/workflows/queue-outbox-pump.ts`, and worker bootstrap error handling. The reviewed catch paths fail closed with generic responses rather than exposing stack traces or continuing on partial state.

---

## Risk Score Breakdown

Scoring: Critical = 10 pts, High = 7 pts, Medium = 4 pts, Low = 2 pts, Info = 0 pts.

| Category | Critical | High | Medium | Low | Info | Points |
|----------|----------|------|--------|-----|------|--------|
| A01 - Broken Access Control        | 0 | 0 | 0 | 0 | 0 | 0 |
| A02 - Security Misconfiguration    | 0 | 0 | 0 | 1 | 0 | 2 |
| A03 - Supply Chain Failures        | 0 | 0 | 0 | 0 | 0 | 0 |
| A04 - Cryptographic Failures       | 0 | 0 | 0 | 0 | 0 | 0 |
| A05 - Injection                    | 0 | 0 | 0 | 0 | 0 | 0 |
| A06 - Insecure Design              | 0 | 1 | 1 | 0 | 0 | 11 |
| A07 - Authentication Failures      | 0 | 0 | 0 | 0 | 0 | 0 |
| A08 - Data Integrity Failures      | 0 | 0 | 0 | 0 | 0 | 0 |
| A09 - Logging & Alerting Failures  | 0 | 0 | 1 | 0 | 0 | 4 |
| A10 - Exceptional Conditions       | 0 | 0 | 0 | 0 | 0 | 0 |
| Secret Exposure Scan               | 0 | 0 | 0 | 1 | 0 | 2 |
| **Total**                          |     |     |     |     |     | **19** |

**Risk Rating:** 0-10 = Low | 11-30 = Moderate | 31-60 = High | 61+ = Critical

---

## Remediation Priority

1. **Remove raw `secretValues` from the Paperclip launch contract** - Complete the move to synchronized Paperclip-managed `secret_ref` bindings so tenant BYOK secrets are not forwarded as plain execution payload values.
2. **Add durable masked audit logging for secret lifecycle and access** - Wire persistent audit sinks into both API and worker secret composition paths.
3. **Back OAuth state and rate limiting with a shared store** - Replace process-local `Map` state with Redis or another coordinated backend.
4. **Tighten frontend hardening and local secret hygiene** - Remove `style-src 'unsafe-inline'` where practical, and keep untracked local secret files outside any release or support artifact path.
5. **Preserve the new session-token controls operationally** - Keep runtime session tokens short-lived, rebuild the server bundle before minting deploy smoke tokens, and retire any old shared deploy-token habits from operator workflows.

---

## Secret Exposure Scan

No exposed live secrets were identified in the tracked repository scope or the targeted git history scan.

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 1 |
| Info | 0 |
| **Total** | **1** |

### Checked Surfaces

- Environment files: Checked (`.env.example` tracked; `.env` present locally but untracked)
- Source/config files: Checked
- Docker/deployment files: Checked
- CI/CD files: Checked where present in repo scope
- Logs/fixtures/docs: Checked
- Git history: Checked with targeted provider/credential patterns

### Secret Findings

#### [LOW] Local-only secret surfaces exist outside tracked git scope
- **File:** `.env` (untracked), `sudo_deploy.txt` (untracked)
- **Line(s):** N/A
- **Provider/Type:** Local workstation secret surfaces
- **Masked Evidence:** Presence only; contents intentionally not printed or inspected in the report
- **Impact:** These files are not currently tracked in git, so this is not a confirmed repository leak. They are still sensitive local material that could be exposed through workstation backup, support artifact bundling, or accidental future commits.
- **Rotation/Removal Guidance:** Keep both files untracked, exclude them from any support bundles, and rotate temporary deployment credentials before final production hardening.
- **History Cleanup Needed:** No, based on current `git ls-files` and targeted history review.
- **Prevention Control:** Keep `.env*` ignore rules in place while preserving `.env.example`, add pre-commit/CI secret scanning, and avoid storing live SSH/sudo material inside the repo root during normal development.

### Secret Scan Conclusion

- `.env.example` contains placeholders only, including masked-style examples for service-role, Paperclip token, database URL, and runtime bearer-token configuration.
- Test strings such as `sk-test-secret`, `sk-openai-secret`, and `postgresql://...:pw@...` were observed in tests and fixtures but do not appear to be live credentials.
- The targeted git history scan did not show confirmed live provider-shaped secrets or private-key blocks in tracked history for the patterns tested.

---

## Methodology

This audit was performed using static analysis against the OWASP Top 10:2025 framework plus the exact local `security-scanner` and `secret-scanner` skill workflows requested by the user. Each OWASP category was evaluated using pattern matching, code review, dependency analysis, and configuration inspection. Secret scanning covered provider-shaped keys, credential variable names, private key material, connection strings, sensitive config files, deployment manifests, documentation surfaces, and targeted git history where available.

**Limitations:** This is a static analysis. It does not include dynamic runtime testing, live VPS/container inspection, penetration testing, or network-level verification. Untracked local secret files were treated as sensitive surfaces and were not dumped into the report.

## References

- [OWASP Top 10:2025](https://owasp.org/Top10/2025/)
- [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
