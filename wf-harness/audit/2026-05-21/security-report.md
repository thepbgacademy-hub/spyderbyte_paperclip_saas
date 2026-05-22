# Wealth Factory Harness Phase 1 Security Report

Date: 2026-05-21
Scope: First custom harness slice under `src/harness`, `src/api/harness-http.ts`, `src/api/runtime-server.ts`, `src/config/env.ts`, `src/wealthfactory/workflow-registry.ts`, `apps/web/src/pages/HarnessBoardPage.tsx`, `apps/web/src/components/HarnessBoard.tsx`, `apps/web/src/components/HarnessCardDrawer.tsx`, `apps/web/src/harness-board-client.ts`, and related tests.

## Executive Summary

- Confirmed findings: `0 Critical`, `0 High`, `0 Medium`, `2 Low`, `2 Info`
- Overall risk score: `4` (`Low`)
- Secret exposure status: no confirmed live secrets in the tracked harness slice or targeted git-history scan
- Top immediate actions:
  1. Keep root `.env` and other local operational artifacts excluded from staging and deployment bundles.
  2. Keep the new harness runtime contract sanitized so only `providerKind` and `credentialLabel` persist in `runtime_context`.
  3. Preserve response-guard checks and guarded 401/500 separation on the harness board API so customer-facing payloads cannot leak prompt/tool/secret fields or mask internal failures as auth issues.

## Methodology

- Refreshed GitNexus index, then used it as a preflight map for the new harness/runtime/board seams.
- Inventoried current secret surfaces with `rg --files` for env/config/key-like files.
- Ran a broad keyword scan across `src`, `apps/web/src`, `tests`, and `wf-harness`.
- Narrowed the scan to the changed harness slice with provider-pattern checks for live-looking secret formats.
- Scanned targeted git history for secret-shaped values and secret-boundary env names in the touched slice.
- Reviewed the customer-facing response guard and the new runtime-context sanitization path.
- Re-ran the scan after wiring the persisted board service, repository-backed run/card/event storage, and browser fetch fallback.
- Re-ran the scan again after adding credentialed board CORS support and atomic seed protection; no new secret-exposure findings were introduced.
- Re-ran the scan after separating tenant/package access denials from infrastructure failures and restricting the browser fallback board to loopback-only hosts; no new secret-exposure findings were introduced.
- Re-ran the scan after adding persisted sub-card proposals and the guarded CEO approval mutation path; the only matches in the touched slice were expected auth header names, dummy `Bearer valid` test values, and the intentional runtime-context sanitization test fixture.
- Re-ran the scan after the reviewer-fix pass for stale CEO gate reset and idempotent proposal approval. The only matches remained expected auth header names, dummy test placeholders, and the intentional `secretValues` sanitization fixture; no live secret material was introduced.
- Re-ran the scan after hardening proposal approval to require an atomic runner and after deferring the approval-card foreign key for transaction-safe persistence. The result stayed clean: only expected auth header names, dummy placeholders, and the sanitization fixture matched.
- Re-ran the scan after adding the guarded `POST /api/harness/cards` direct-child mutation and shrinking bootstrap seeding to CEO only. The result stayed clean: no live secret material was introduced, and the narrowed write seam still exposes only expected auth names, dummy placeholders, and the intentional sanitization fixture.
- Re-ran the scan after hardening the direct-child mutation for retry idempotency, open-card limits, and non-nested atomic seeding. The result stayed clean: only expected auth names, dummy placeholders, and the intentional sanitization fixture remained in scope.
- Re-ran the scan after adding transaction-client coverage for the deferred proposal-approval seam. The result stayed clean: the touched slice only exposed expected auth names, dummy placeholders, and the existing sanitization fixture; no live secret material was introduced.
- Re-ran the scan after landing the real disposable-Postgres proof path plus the guarded child-card progression/result-recording seam. The touched slice still only exposed expected auth names, dummy placeholders, local disposable test credentials for the isolated Docker database, and the existing sanitization fixture; no live secret material was introduced.
- Re-ran the scan after rejecting invalid child-card states at the HTTP seam, removing query-string outcome summaries from the public advancement route, and tightening the docs around Docker-gated proof coverage. The result stayed clean: no live secret material was introduced.
- Re-ran the scan after adding run-level reconciliation plus metadata-only harness audit publishing for child-card creation, proposal approval, and advancement. The touched slice still only exposed expected auth names, dummy placeholders, and the existing sanitization fixture; no live secret material or raw outcome text was introduced.
- Re-ran the scan after hardening post-commit harness audit publishing so audit-sink outages log a warning instead of making already-committed mutations appear failed. The touched slice still introduced no live secret material and still keeps raw outcome text out of durable audit payloads.

## OWASP-Oriented Findings

### A01 Broken Access Control

No issues identified in the harness slice. The new board HTTP surface preserves origin checks, preflight handling, and request authentication input flow instead of exposing an unauthenticated public board endpoint.

### A02 Security Misconfiguration

#### [LOW] Local operational env/config surfaces still exist at the repo root

- Paths:
  - `E:\REPOS\spyderbyte_paperclip_saas\.env`
  - `E:\REPOS\spyderbyte_paperclip_saas\deploy\docker-compose.yml`
- Rationale: the harness slice itself does not commit secrets, but root operational surfaces remain present locally and could be staged accidentally if repo hygiene regresses.
- Evidence: inventory scan found `.env` plus deployment manifests; no live values were echoed into this report.
- Recommendation: keep `.env` untracked, keep local-only files in ignore/exclude rules, and keep deployment packaging restricted to explicit allowlists.

### A03 Software Supply Chain Failures

No issues identified in the harness slice.

### A04 Cryptographic Failures

No issues identified in the harness slice. The new runtime contract and migration explicitly reject persisted `secretValues`, which reduces accidental plaintext persistence.

### A05 Injection

No issues identified in the harness slice.

### A06 Insecure Design

No issues identified in the harness slice. The new board route is read-only and high-level; it does not expose raw orchestration inputs or sub-agent mechanics.

### A07 Authentication Failures

No issues identified in the harness slice. The new board handler reuses the guarded request shape with authorization/cookie passthrough rather than introducing a parallel trust model.

### A08 Software or Data Integrity Failures

No issues identified in the harness slice.

### A09 Security Logging and Alerting Failures

#### [INFO] Harness audit publishing is now metadata-only and best-effort, but sink outages can still drop audit rows after a successful mutation

- Paths:
  - `E:\REPOS\spyderbyte_paperclip_saas\src\harness\board-service.ts`
  - `E:\REPOS\spyderbyte_paperclip_saas\src\api\runtime-server.ts`
- Rationale: the harness now emits explicit audit events for the current card/proposal/run reconciliation mutations, and audit outages no longer make committed mutations look like failures. But because publishing happens after commit, a sink outage still means the business mutation succeeds while the durable audit row is skipped.
- Recommendation: keep this best-effort path for the current bounded slice, but move audit publishing inside a stronger shared persistence or outbox seam before claiming full guaranteed audit durability.

### A10 Mishandling of Exceptional Conditions

No issues identified in the harness slice. The board HTTP boundary now distinguishes guarded 401 auth failures from internal 500 conditions instead of collapsing everything into `unauthorized`.

## Secret Exposure Scan

### Confirmed Results

- No confirmed live secrets were found in the tracked harness slice or the targeted history scan.
- The narrowed provider-pattern scan matched only env-variable names, dummy test values, and authorization placeholders used in tests.
- The new harness persistence layer strips `secretValues` before runtime context is stored or serialized, and the repository-backed board path continues using only sanitized runtime context fields.
- The guarded child-card advancement route no longer accepts tenant-authored result summaries through URL query strings, which reduces business-data exposure through browser history and intermediary logs.

### Additional Hygiene Observations

#### [LOW] Root operational proof artifacts should stay out of customer bundles

- Paths:
  - `E:\REPOS\spyderbyte_paperclip_saas\tmp_stage_*.json`
  - `E:\REPOS\spyderbyte_paperclip_saas\tertiary_runs.json`
  - `E:\REPOS\spyderbyte_paperclip_saas\audit\2026-05-20\*.json`
  - `E:\REPOS\spyderbyte_paperclip_saas\audit\2026-05-21\*.json`
- Rationale: these are not confirmed secret leaks, but they are operational artifacts that should never be treated as customer-facing deployment assets.
- Recommendation: keep deployment packaging allowlisted and avoid copying repo-root artifacts into runtime images or release bundles.

#### [INFO] Test fixtures intentionally use dummy secret-shaped placeholders

- Paths:
  - `E:\REPOS\spyderbyte_paperclip_saas\tests\env.test.ts`
  - `E:\REPOS\spyderbyte_paperclip_saas\tests\runtime-server.test.ts`
  - `E:\REPOS\spyderbyte_paperclip_saas\tests\harness-http.test.ts`
- Evidence: examples include masked/dummy values like `service-role-key`, `paperclip-service-token`, and `Bearer valid`.
- Recommendation: keep using clearly fake placeholders and continue avoiding live provider-shaped values in tests.

## Remediation Priority

1. Maintain ignore/exclude hygiene for `.env` and local operational artifacts so the clean harness slice cannot be contaminated by deployment-time staging mistakes.
2. Keep the harness `runtime_context` sanitization and response-guard tests in the full gate to prevent future regressions that reintroduce `secretValues` or customer-facing execution noise.
3. Keep tenant-authored summaries off URL surfaces until the HTTP contract supports parsed request bodies, and extend the same metadata-only audit discipline if broader harness mutation paths begin recording richer business outcomes.

## Conclusion

The current Wealth Factory harness slice is in a good security position: no confirmed live secret exposure was introduced, no tenant secret values are persisted in the new harness records, the board API remains customer-safe and high-level, run reconciliation now operates on persisted child-card/proposal state, and the widened harness audit path stays metadata-only without storing raw tenant outcome text. The remaining work is operational hygiene, richer mutation-body handling, and eventually moving audit publishing from the current best-effort post-commit path into a stronger guaranteed persistence seam, not an immediate security blocker for continued development.
