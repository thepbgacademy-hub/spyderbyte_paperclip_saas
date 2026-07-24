# AUDIT: PASS — TASK-073 (mount install route into live server), cycle 1

Auditor: main Opus session. Record revision audited: 27. Container:
`wf-skeleton-local-postgres-1` (postgres:16, 127.0.0.1:55432, local disposable).

## Process note — orchestration stalled; work verified independently
The orchestrator stalled a third time (dispatched the engineer, "armed a monitor,"
and exited before merge/QC/stage) — no envelope, no staged marker, no crew QC. The
engineer's CODE, however, landed complete in the working tree. I therefore audited
the working-tree diff directly and ran the blank-context QC reviewer myself (a leaf
role that spawns no children). This is a documented recovery, not a bypass of the
audit discipline.

## Evidence re-derived (my own runs)
- Real-socket e2e against the live DB:
  `WF_LOCAL_PG_URL=…55432/wf_skeleton npx vitest run tests/factory-install-route-mounted.e2e.test.ts`
  → **3 passed**: owner token → 201 + install row + exactly one `audit_events` row;
  member token → 403 with zero install and zero audit rows; member token minted with
  `session.role='operator'` → still 403 (decoupling proven through the mounted server).
- **RBAC falsifiability on the mounted path (reproduced by me):** forced
  `factory-package-install-role-resolver.ts` to `return "owner"` → both member-denial
  e2e tests went RED; restored byte-identical (sha256 matched) → 3 passed.
- `npx tsc --noEmit` → exit 0. Scope: only `src/api/runtime-server.ts` (mount, +26
  lines), new `src/api/factory-package-install-blueprint-loader.ts`, new
  `tests/factory-install-route-mounted.e2e.test.ts` — within `write_scope` (src/api)
  plus the test expansion.

## Blank-context QC (codex gpt-5.5), run by the Auditor
**VERDICT: pass.** Three UNVERIFIED notes, all resolved:
- Rate-limiter import present → resolved (tsc clean, import resolves).
- Blueprint loader path safety → the `ALLOWED_DEMO_PACKAGE_KEYS` allowlist rejects any
  key before filesystem access, so `path.join` cannot traverse. Safe.
- e2e gated on `WF_LOCAL_PG_URL` → intentional skip-not-false-pass gate (same pattern
  as TASK-055/069). Confirmed it skips (not passes) without the DB.

## Acceptance
- AC1 MET: `createDashboardRuntime` constructs the install API with the real Postgres
  role resolver + durable audit sink + Postgres install repository and serves it via
  `createFactoryPackageInstallHttpHandler`. Production construction site now exists.
- AC2 MET: e2e drives real HTTP over a real socket to the mounted route, proving the
  RBAC + audit path and persisting a real audit row, with falsifiability shown.

## Follow-up to record (minor, non-blocking)
- **F1 — cwd-relative package assets.** `createDemoPackageBlueprintLoader` defaults its
  root to `path.resolve(process.cwd(), "demo-packages")`. Correct for local/test runs,
  but a server started from a different working directory (container / `dist`) would
  not find the manifests unless `demoPackagesRoot` is passed explicitly. The injection
  seam exists; production wiring must supply the right path. Recommend a small
  follow-up task so this isn't discovered at deploy time.

## Verdict
**PASS.** The proven install route is now mounted in the live server composition root
and reachable over real HTTP, with RBAC + audit enforced and shown falsifiable. Sign
off TASK-073. Record follow-up F1 (cwd-relative package assets).
