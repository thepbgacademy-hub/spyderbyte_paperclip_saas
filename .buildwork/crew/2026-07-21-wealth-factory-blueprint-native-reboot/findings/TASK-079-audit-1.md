# AUDIT: FINDINGS → one fix cycle — TASK-079 (Launch Kit export), cycle 1

Auditor: main Opus session. Record rev 32. DB: wf-skeleton-local-postgres-1 (local disposable).

## Re-derived and holds
- Export tests, my own run vs live DB: **6 passed** (unit + e2e). Full factory suite:
  **240/240 (34 files)** — no regression from the widened repository interfaces. tsc +
  eslint (8 touched files) exit 0.
- **AC4 falsifiability reproduced by me:** stripped `tenant_id = $1` from the approved-
  approval gate (`findApprovedApprovalForRun`) → the AC4 cross-tenant export e2e went RED;
  restored byte-identical (sha256) → 3/3 GREEN.
- AC2 gate proven: export refused (404 not_ready) before approval; the unit test confirms
  cross-tenant is indistinguishable from missing (no existence leak).
- AC3 download proven: the e2e asserts `content-type: application/json` and
  `content-disposition: attachment` + filename (lines 295-297). QC UNVERIFIED #1 closed.

## Finding — FIX THIS CYCLE
`deliverable-repository.ts` `listDeliverablesForRun` orders by `station_key` only — in-
memory (line 50, `localeCompare(stationKey)`) and Postgres (line 115, `order by
station_key asc`). Not a total order when a run has multiple deliverables for one station.
Deterministic by accident today (one deliverable per station), but AC1/AC2 require
deterministic order and this becomes a real bug once TASK-078's revision adds a second
positioning deliverable. Fix: add a stable tie-breaker (`, deliverable_id asc`) in BOTH
adapters.

## Deferred (record as follow-up)
Test-infra seeding race (engineer-disclosed): parallel `beforeAll` demo-package seeding
uses `on conflict (package_id) do nothing`, which does not cover the separate
`package_key` unique constraint, so concurrent e2e files can rarely collide on
`factory_blueprint_packages_package_key_key`. Pre-existing pattern shared by TASK-073/076
e2e tests; low-probability; product code unaffected. Record a follow-up to make the
shared e2e package seeding race-safe.

## Disposition
One fix cycle for the ordering tie-breaker. Seeding race recorded as a follow-up at
sign-off. Re-audit: re-run export tests + tsc after the fix.
