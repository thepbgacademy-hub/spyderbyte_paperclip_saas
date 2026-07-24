# AUDIT: FINDINGS → one fix cycle — TASK-076 (approval checkpoint), cycle 1

Auditor: main Opus session. Record rev 30. DB: wf-skeleton-local-postgres-1
(127.0.0.1:55432, local disposable).

## What I re-derived and it holds (the ticket's core is sound)
- New approval tests, my own run vs live DB: **13 passed** (migration + app-service
  + e2e). Full factory suite: **234 passed / 32 files** — no regression. tsc + eslint
  (9 touched files) exit 0.
- **AC3 falsifiability reproduced by me:** stripped `tenant_id = $1` from
  `findPendingApprovalForRun` → the AC3 cross-tenant e2e went RED (collapsed the whole
  approval lookup); restored byte-identical (sha256) → 4/4 GREEN.
- Transitions correctly reuse `approvePendingApproval` / `requestChangesForPendingApproval`
  from approval-service.ts; the mounted decision route persists tenant-scoped.

## Findings (QC-surfaced, all confirmed by me against source)

### F1 — FIX THIS CYCLE (delivered migration defect)
`supabase/migrations/0039_factory_run_approvals.sql:46-47`: the unique index
`factory_run_approvals_one_pending_per_run` is on `(run_id)` only, but the design is
tenant-scoped and the in-memory repo enforces "one pending per **(tenant_id, run_id)**".
Failure: tenant A holds a pending approval for run X; tenant B's pending approval for
the same run_id is rejected by a global unique constraint. Fix in place (0039 is not
yet applied to any real DB — fixing later would need a new migration): make the
partial unique index `(tenant_id, run_id) where approval_status = 'pending'`, and have
the migration test assert the tenant-scoped uniqueness.

### F2 — DEFER (record as follow-up; create path not wired to production)
`run-approval-repository.ts createPendingApproval` builds/inserts the pending row
directly rather than via `createApprovalRequest` (AC1 names it), and does not verify
`package_install_id` / `deliverable_id` belong to the inserted `tenant_id` (FK checks
existence only) — a tenant-A approval could link tenant-B data. Mitigated now: reads
are tenant-scoped (a mismatched row is unreadable cross-tenant) and the production run
flow does not yet create approvals through this path (the e2e seeds them). Fold into a
follow-up that wires run-flow creation THROUGH createApprovalRequest with
tenant-consistency checks.

### F3 — DEFER (disclosed scope boundary)
The production run flow does not yet CREATE the pending approval (when the positioning
deliverable is produced) nor RE-RUN positioning to produce revision_1 after
request-changes. The mounted DECISION route is proven; run-flow creation + revision
production are follow-ups (engineer disclosed this).

## Disposition
One fix cycle for **F1** only (contained migration correctness, cheaper now than
later). F2 and F3 recorded as follow-up tasks at sign-off. Re-audit after the fix:
recreate a fresh DB, re-apply migrations, re-run the migration test + e2e + a
falsifiability spot check.
