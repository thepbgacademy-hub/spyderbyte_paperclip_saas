# AUDIT: PASS — TASK-069 (wire auth→role→RBAC→audit into one route), cycle 1

Auditor: main Opus session. Record revision audited: 26. Container:
`wf-skeleton-local-postgres-1` (postgres:16, 127.0.0.1:55432, local disposable).
Every claim re-derived by me from a clean shell.

## 1. Record validation
`validate-build.ps1` on rev 26 → exit 0. TASK-069 correctly still `pending`.

## 2. Evidence re-derived (my own runs)
- Route integration suite against the live DB:
  `WF_LOCAL_PG_URL=…55432/wf_skeleton npx vitest run tests/factory-install-route-rbac-audit.integration.test.ts`
  → **3 passed**: owner token succeeds; member token denied (no install row, no
  audit row); member token minted with the most-privileged `session.role`
  (`operator`) still denied.
- **RBAC falsifiability — reproduced by direct experiment (the crux):** backed up
  `src/api/factory-package-install-role-resolver.ts` (sha256 captured), forced it to
  `return "owner"` unconditionally, re-ran → **2 failed** (both member-denial tests,
  including the session.role-decoupling test, went RED). Restored byte-identical
  (sha256 matched) → **3 passed**. The RBAC gate genuinely depends on the resolved
  membership role.
- **AC2 audit persistence verified:** the test asserts exactly one persisted
  `wfpc.audit_events` row (`event_type: factory.package.installed`, correct
  `actor_user_id`, `metadata.packageKey`, `externalEntityId`); `auditSink` is now a
  **required** dep (QC cycle-2 fix) and the install path emits the row itself.
- Regression: install-api + application-service + repository + both integration
  suites → **42 passed / 5 files**. No regression from making `auditSink` required.
- `npx tsc --noEmit` → exit 0. `eslint` on the 5 touched files → exit 0.

## 3. Wiring is production code, not test glue
`createFactoryPackageInstallApi` (production, `src/api/factory-package-install-api.ts`)
calls `deps.resolveTenantPackageInstallRole` (line 97), passes the resolved role into
`installBlueprintPackageForTenant` (the RBAC gate, line 123), and calls
`deps.auditSink` (line 134). The integration test injects the real Postgres-backed
resolver, repository, audit sink, and runtime auth into the real HTTP handler
(`createFactoryPackageInstallHttpHandler`) — dependency injection of production
implementations, not a reimplemented bridge.

## 4. Scope / drift
5 files, all within `write_scope` (`src/api`) plus the test expansion. AC1, AC2, AC3
met as written, against the real DB, with falsifiability shown. No smuggled changes.

## 5. Boundaries to track (non-blocking, but should not be lost)
- **F1 — the wired route is not yet mounted in the live server.**
  `createFactoryPackageInstallApi` has no production construction site outside the
  test, and `createFactoryPackageInstallHttpHandler` is not mounted in any
  server-main/composition root. The path is proven via integration test with real
  components (same pattern TASK-055 used and was passed on), but real HTTP traffic
  does not yet reach it. The staged marker did not disclose this boundary — minor
  transparency nit. Recommend a follow-up task to mount the wired install route.
- **F2 — install/audit non-atomicity.** Honestly disclosed in TASK-069's risk notes:
  the install commits inside `saveLifecycleEvent`, then `auditSink` writes separately
  — no single transaction wraps both, so a transient failure after the install commit
  yields a committed install with no audit row. Out of scope by the brief
  ("don't over-engineer a distributed-transaction solution for MVP"). Recommend a
  tracked follow-up (atomic write or reconciliation) so it survives TASK-069's
  completion.

## Verdict
**PASS.** The install RBAC path is wired in production code, resolves the real
membership role (never `session.role`), emits its own audit row, and is proven
falsifiable by direct experiment. Sign off TASK-069. Record two follow-up tasks:
mount the wired route into the live server (F1); make install+audit atomic or
reconciled (F2).
