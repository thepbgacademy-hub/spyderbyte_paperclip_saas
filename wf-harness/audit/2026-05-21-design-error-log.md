# Wealth Factory Harness Design Error Log

Date: 2026-05-21
Phase: Design kickoff and first harness slice implementation

## Purpose

Capture design-stage mistakes, false assumptions, and pressure-test lessons so they are not repeated in the custom harness effort.

## Known Lessons Imported From The Prior Build

1. Paperclip proved the concept but became the sustained hotspot under commercial-style soak.
2. Queue reliability does not guarantee execution-engine reliability.
3. Tenant safety, fairness, and backpressure must be first-class system rules.
4. Tenant-facing UX should stay calm and structured; backend chatter is not product value.
5. BYOK must remain in Wealth Factory, not leak into the execution engine boundary.
6. Recovery from interruption must be based on persisted state, not conversation memory.

## Current Design-Stage Risks To Avoid

1. Recreating Paperclip's weak spots by copying implementation literally instead of mirroring behavior intentionally.
2. Letting child personas talk directly to each other and causing uncontrolled drift.
3. Allowing uncontrolled dynamic card creation until the board becomes unreadable.
4. Building a dashboard that exposes backend execution details instead of meaningful progress.
5. Turning the new harness into a broad "agent OS" instead of a bounded Wealth Factory orchestration slice.

## Phase 1 Implementation Lessons

1. The first board cut looked polished but was still a static demo. Reviewer feedback correctly forced the board route and page off fixtures and onto a tenant-scoped persisted path.
2. Harness HTTP cannot collapse all failures into `401 unauthorized`; internal failures must stay distinguishable from auth failures or operators will chase the wrong problem.
3. `WF_HARNESS_ENABLED_WORKFLOW_IDS` is not meaningful until a live runtime path actually consumes it. Configuration alone is not progress.
4. Persisted run/card/event tables are only valuable if the slice really writes and reads them. Repository scaffolding without a live caller is false comfort.
5. The intentional E2E fail step can poison the pass step if a dummy server is not fully cleaned up. A stray Python listener on `127.0.0.1:5173` produced false directory-listing failures until it was killed.
6. PowerShell separator quirks remain real on this machine. Prefer native sequential commands and explicit cleanup over bash-style chaining.
7. Browser fallback data must stay loopback-only. A polished fake CEO/CFO board is useful for static local shell work, but it becomes a dangerous false green if remote or authenticated paths can silently keep showing it after API/auth failures.
8. Tenant/package access denials and infrastructure faults cannot share the same generic error path. The harness board must fail closed on missing membership or package entitlement without masking DB outages as `401 unauthorized`.
9. A narrow route expansion still needs the surrounding type surface updated immediately. Adding proposal approval behavior without extending the handler option type broke `tsc` even though the runtime logic was correct.
10. Persisted CEO approvals need a real table, not just events. Proposal identity, pending status, and idempotent approval are too fragile if they are inferred from card-event history alone.
11. PowerShell path expansion is not the same as shell glob expansion. Targeted `rg` scans should use explicit file lists or `--glob` filters, not raw `tests/harness-*.test.ts` path arguments, or the scan itself becomes a false sharp edge.
12. Proposal approval ordering has to respect the real database contract, not just the in-memory repository. When an approval row references a newly created child card, the foreign key must either be deferred inside the transaction or the mutation order must change accordingly.
13. Approval mutations are not safe as an optional best-effort multi-step write path. If a future harness mutation needs multiple writes to stay consistent, require an atomic runner explicitly instead of normalizing non-transactional usage in tests or public service construction.

14. A stale .git/index.lock can linger after interrupted git operations on this machine. Clear it explicitly before staging instead of retrying blindly or assuming another live git process is still running.
15. Replacing fake seeded persona lanes with one real persisted CEO-driven create-card seam is more valuable than adding a generic state-editing API around bootstrap theater. Remove fake execution at the source before broadening mutation surface.
16. The current dashboard HTTP request shape only exposes query parameters, headers, and body size. A narrow guarded write route can use query params temporarily, but broader harness mutations will eventually need parsed JSON-body support to keep the contract clean.
17. On this machine, parallel `npm` invocations can fail with `UNKNOWN: unknown error, read` against `package.json` even when the file is healthy. Treat that as a local tooling sharp edge and rerun the verification gate sequentially instead of assuming the repo is broken.
18. The old "occupy port `5173` with a dummy listener" E2E fail trick is no longer reliable on this machine. When the listener does not truly bind, Playwright can still reuse the real dev server and produce a false pass. Verify the failure mechanism itself before trusting the fail-then-pass proof.
19. Tightening Playwright with an intentionally impossible timeout is a reliable local fail trigger for the harness gate when the dummy-listener method is flaky. Log the method explicitly so later phases do not waste time rediscovering it.
20. Mutation paths that can seed a run on first use must not re-enter `runAtomically` from inside an already-open atomic block. The in-memory harness repository will hide that mistake unless a nested-atomic guard test exists.
21. Direct child-card creation needs at least narrow idempotency and an open-card cap from day one. Otherwise double submits and retries can create card sprawl long before richer CEO policy logic is built.
22. The deferred approval-card foreign-key seam needs 2 separate proofs. First, prove the approval update and child-card insert share one leased transaction client and roll back together on failure. Later, prove the actual deferred foreign key against a real migration-backed Postgres transaction. Do not collapse those into one claim.
23. On this Windows machine, overlapping GitNexus FTS/cypher calls right after `gitnexus analyze` can briefly lock `.gitnexus\\lbug`. Serialize GitNexus preflight commands before assuming the repo index is unhealthy.
24. The real Postgres harness proof is easiest to trust when it applies only the harness migrations plus a tiny `wfpc.tenants` prerequisite table in an isolated disposable database. Pulling in more schema than the seam actually needs just increases noise and setup fragility.
25. Docker-backed proof tests should not block the Vitest worker thread with long `execFileSync` calls. On this machine that caused `[vitest-worker]: Timeout calling "onTaskUpdate"` even when the DB logic was correct; async child-process helpers keep the proof green.
26. Unsupported harness child-card state strings must fail as bounded client input, not bubble into `500 service_unavailable`. Validate the enum at the HTTP seam and keep the service conflict-aware too.
27. Tenant-authored outcome summaries should not travel through URL query strings. Until the dashboard HTTP contract grows parsed request bodies, keep summary recording off the public advancement URL surface.
28. Run-level progression should be derived from persisted card/proposal state, not implied from bootstrap or UI assumptions. The safe early precedence is `working -> waiting -> blocked -> assembling`, and final `done` should stay explicit until assembly/completion logic is real.
29. Harness audit expansion must stay metadata-only for tenant business content. Publish mutation and reconciliation events through the durable audit sink, but keep raw `resultSummary` text out of audit payloads and use booleans/state metadata instead.
30. Post-commit audit publishing must not turn a committed harness mutation into an apparent failure. If the durable audit sink is down, the mutation should still return success and emit a warning instead of encouraging retries against already-persisted state.
