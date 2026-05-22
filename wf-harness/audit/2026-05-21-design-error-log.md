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
31. Once the harness starts accepting richer mutation input, move it to parsed JSON bodies instead of query parameters. Keep tenant-authored business text off URL surfaces and keep the write API command-style instead of turning it into a generic board editor.
32. Final completion should stay CEO-gated and explicit. Let child-card progression derive `assembling`, then require a separate persisted completion command for `done` instead of inferring business completion from internal motion.
33. Card-discipline policy should grow in narrow workflow terms, not abstract editing terms. Blocking duplicate open deliverable lanes is a useful next step; broader deny/defer or lane-merging logic should wait until the current policy seams are proven.
34. Request-body guardrails belong in the Node adapter as well as the handler. If the adapter trusts only `Content-Length`, chunked or mismatched payloads can bypass the size limit after the whole body is already buffered into memory.
35. Rate-limiter client IPs need trusted-proxy awareness. Loopback reverse proxies should be allowed to forward the first client IP, but untrusted remote peers must not be able to spoof limiter identity through `x-forwarded-for`.
36. Dashboard auth and internal failure paths cannot share the same public status code. If downstream faults are flattened to `401`, operators lose the signal that the runtime is unhealthy and tenants get misleading auth errors.
37. A single implicit harness workflow selector is only safe while one workflow is enabled. If multiple harness-eligible ids can surface, fail closed until an explicit selector exists instead of silently letting config order choose the run target.
38. Proposal approval must prove tenant ownership before taking any idempotent shortcut. An already-approved proposal is still sensitive tenant state, and returning its card id before the tenant check leaks foreign run metadata.
39. Bounded persona/deliverable policy has to exist at the service seam, not only in UI conventions. Otherwise the direct child-card mutation path becomes an uncontrolled taxonomy surface and invites lane sprawl.
40. Storage OAuth availability should degrade per provider, not globally. Missing Dropbox config should not disable Google Drive, and disabled routes still need security/CORS headers so browsers receive a real `503` instead of a network-shaped failure.
41. Provider-specific OAuth callback routes must be enforced as part of callback integrity. If callback completion trusts only `state`, a miswired redirect URI or proxy rewrite can silently complete the wrong provider flow instead of failing closed.
42. `WF_STORAGE_OAUTH_REDIRECT_ORIGIN` cannot be an arbitrary host override. Validate it as a bare http(s) origin and require it to already exist in `WF_ALLOWED_ORIGINS` before building callback URLs.
43. Route classification must happen before harness rate limiting. Unknown proposal-like paths should return `404` without consuming the approval bucket or distorting traffic signals.
44. After validating an origin-shaped config value, store the normalized origin, not the raw string. Otherwise a trailing slash can pass validation and still produce a broken exact-match redirect URI later.
45. Provider-mismatch OAuth callbacks should fail closed without burning the pending state. A wrong callback path should be a recoverable rejected attempt, not a one-shot denial of the tenant's connector flow.
