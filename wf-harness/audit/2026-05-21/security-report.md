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
- Re-ran the scan after moving harness mutations to parsed JSON bodies, adding the explicit CEO completion command, and tightening duplicate-lane policy. The touched slice still introduced no live secret material, and tenant-authored summaries now stay off URL surfaces while remaining excluded from durable audit payloads.
- Re-ran the scan after hardening the Node adapter to enforce request-size limits on bytes actually read, splitting dashboard `401` vs `500` outcomes, and making the touched runtime-server test fixture use the clearly fake `db.invalid` host plus a placeholder password. The touched slice still introduced no live secret material.
- Re-ran the scan after closing the cross-tenant approved-proposal leak, bounding child-card persona/deliverable inputs to the approved catalog, and making storage OAuth degrade per provider with structured unavailable responses. The touched slice still introduced no live secret material, and no new secret-bearing response paths were added.
- Re-ran the scan after binding storage OAuth callback completion to the route provider, validating `WF_STORAGE_OAUTH_REDIRECT_ORIGIN` against the allowed portal-origin set, and tightening harness route classification so dead proposal paths no longer consume the live approval rate-limit bucket. The touched slice still introduced no live secret material and did not add any new secret-bearing response paths.
- Re-ran the scan after normalizing the accepted storage OAuth redirect origin and preserving pending OAuth state on provider-mismatch callback attempts. The touched slice still introduced no live secret material, and the callback integrity seam now fails closed without consuming the tenant's one valid retry path.
- Re-ran the scan after widening harness proposal policy to support persisted `defer`/`deny` outcomes, lane-reuse decisions, and the derived `completionPackage` read model. The touched slice still introduced no live secret material, and the new decision notes remain bounded business text rather than secret-bearing config.
- Re-ran the scan after wiring migration-helper support for `0015_wf_harness_proposal_resolutions.sql` and updating the disposable Postgres proof path. The touched slice still introduced no live secret material, and the new Docker-backed test path continues using isolated local-only credentials.
- Re-ran the scan after making deferred proposals visible/re-approvable, restoring a parent-card approval trail for reused lanes, and tightening `/approve` to reject non-approved terminal outcomes. The touched slice still introduced no live secret material and did not widen any tenant secret or audit payload surface.
- Re-ran the scan after adding the append-only harness board-decision ledger, the bounded `recentDecisions` read model, and auto-defer behavior for cross-persona deliverable-owner conflicts. The touched slice still introduced no live secret material, and the new decision ledger stores only bounded workflow metadata plus optional business-facing decision notes.
- Re-ran the scan after the reviewer pass tightened board-decision semantics: the migration helper now re-checks the `0016` schema after apply, `recentDecisions` no longer echoes raw `decisionNote` text, and the CEO completion summary is no longer duplicated into the decision ledger. The touched slice still introduced no live secret material.
- Re-ran the scan after widening the board-decision ledger with bounded policy reasons plus recommendation/objection summaries, and after teaching deferred approvals plus `completionPackage` to surface governance caveats from that ledger. The touched slice still introduced no live secret material and still kept raw CEO notes out of the public board feed.
- Re-ran the scan after tightening the migration-helper constraint check and trimming stale governance history out of `completionPackage`. The final touched slice still introduced no live secret material; only expected auth placeholders and the isolated Docker test DSN remained in scope.
- Re-ran the scan after making repeated defer decisions idempotent and widening `completionPackage` into structured governance items for deferred/denied requests. The touched slice still introduced no live secret material and still kept raw `decisionNote` text out of the public tenant-facing package.
- Re-ran the scan after fixing reviewer-found packaging edge cases so governance summaries now derive from the full decision set and denied-only packages still keep governance content visible. The touched slice still introduced no live secret material and still kept raw `decisionNote` text out of the public tenant-facing package.
- Re-ran the scan after adding structured `proposal_absorbed` lane events for reused approvals and after tightening the local Docker-daemon readiness check for the disposable Postgres proof path. The touched slice still introduced no live secret material and still kept absorbed-work board history free of raw secret-bearing payloads.
- Re-ran the scan after redacting raw `decisionNote` text from the tenant-facing lane activity feed and after correcting all-cancelled child lanes to derive `blocked` instead of a misleading `active`. The touched slice still introduced no live secret material and further reduced the risk of leaking free-form internal business notes through public board activity.
- Re-ran the scan after making denied public board messages policy-aware again for owner-conflict and lane-cap cases. The touched slice still introduced no live secret material, and the narrower public activity feed now stays both bounded and truthful without replaying raw CEO notes.
- Re-ran the scan after adding the bounded owner-conflict lane-handoff seam, widening harness resolution checks with `handoff_existing_lane`, and accepting a guarded `targetCardId` on proposal approval routes. The touched slice still introduced no live secret material and only reassigns persisted lane metadata without widening the BYOK or runtime-secret boundary.
- Re-ran the scan after surfacing bounded handoff-target hints in deferred owner-conflict approvals and making stale `targetCardId` hints fall back to normal governance instead of hard-failing a valid approval path. The touched slice still introduced no live secret material and did not widen any credential or runtime-secret boundary.
- Re-ran the scan after making `assembling`/`done` runs fail closed on both follow-on proposal approvals and direct CEO child-lane creation under `completed_lanes_only`, and after making terminal runs read-only at the child-card seam instead of relying only on reconciliation. The touched slice still introduced no live secret material and did not widen any credential-bearing persistence or response surface.
- Re-ran the scan after adding derived `followThroughItems` from the persisted decision ledger so the board can show implemented governance history without replaying raw `decisionNote` text or card chatter. The touched slice still introduced no live secret material and kept implemented history bounded to existing safe decision fields.
- Re-ran the scan after adding the explicit `startFreshCycle` seam plus fresh-cycle carry-forward filtering for `completed_lanes_only` deferred proposals. The touched slice still introduced no live secret material and reopened follow-on work only by cloning bounded proposal metadata into a new run, not by widening runtime-context or credential persistence.
- Re-ran the scan after widening `startFreshCycle` with an explicit clean-vs-reopen mode and JSON-body parsing at the HTTP seam. The touched slice still introduced no live secret material and still keeps fresh-cycle inputs bounded to run id plus a small policy mode, with no BYOK, runtime-context, or tenant-authored business text widening.
- Re-ran the scan after tightening repeated unresolved proposal governance so newer retries of the same request now defer or deny against the latest earlier unresolved governance state instead of opening fresh lanes, while active-lane reuse and owner-conflict handoff still win first. The touched slice still introduced no live secret material and still keeps repeated-request handling bounded to proposal metadata, policy labels, and internal decision notes rather than any credential-bearing state.
- Re-ran the scan after the reviewer-fix pass narrowed repeated-request matching to the same request title/persona/deliverable triple and changed the helper to look at the latest earlier unresolved request instead of the first one. The touched slice still introduced no live secret material and still keeps the repeated-request guard entirely inside bounded governance metadata.
- Re-ran the scan after adding the bounded `harness_card_continuity` seam for live lane continuity snapshots. The touched slice still introduced no live secret material and still keeps continuity persistence limited to operational lane summaries, latest outcomes, and absorbed-work labels rather than any BYOK or runtime-secret state.
- Re-ran the scan after the continuity reviewer fix pass tightened handoff attribution and deterministic absorbed-work merge behavior. The touched slice still introduced no live secret material, and the continuity seam still stores only policy-bounded operational board labels instead of any provider or tenant secret values.
- Re-ran the scan after promoting `continuitySummary` into the real per-lane resume directive and threading continuity through runtime resume. The touched slice still introduced no live secret material and still keeps continuity limited to bounded operational board text rather than any provider credential, BYOK secret, or raw tenant note payload.
- Re-ran the scan after hardening the done-lane seam so `resumeSummary` is rejected on terminal `done` transitions. The touched slice still introduced no live secret material and further reduced the risk of stale operational board text overriding a completed-lane snapshot.
- Re-ran the scan after adding the first worker-side harness lane-dispatch seam for `wf_harness_v1` workflows. The touched slice still introduced no live secret material and keeps the dispatch payload bounded to persisted lane metadata plus `resumeFocus` / latest outcome text, without widening BYOK, provider secrets, or tenant-authored internal notes.
- Re-ran the scan after adding the worker-private lane outcome commit seam plus compare-and-set child-lane transitions. The touched slice still introduced no live secret material and keeps worker-written outcomes bounded to lane state, continuity text, and optional result summaries rather than any BYOK, provider, or tenant-secret payload.
- Re-ran the scan after deepening the worker-private seam into bounded follow-on dispatch. The touched slice still introduced no live secret material and keeps the new follow-on payload limited to persona/lane metadata, continuity-backed resume focus, and optional latest-result summaries instead of any BYOK, provider binding, or tenant-secret fields.
- Re-ran the scan after wiring guarded workflow-status recording behind the bounded follow-on dispatch seam. The touched slice still introduced no live secret material and only propagates existing run/workflow ids plus a fixed `running` status through the private worker path, without widening any tenant-authored or credential-bearing surface.
- Re-ran the scan after adding the bounded completed-lane refinement reopen seam. The touched slice still introduced no live secret material and only reuses existing lane ids, state transitions, continuity text, and latest-result summaries instead of widening any tenant-authored secret, BYOK, or provider-binding surface.
- Re-ran the scan after extending the bounded completed-lane refinement reopen rule to direct CEO-created child lanes. The touched slice still introduced no live secret material and only reuses existing lane ids, state transitions, continuity text, and latest-result summaries instead of widening any tenant-authored secret, BYOK, or provider-binding surface.
- Re-ran the scan after fixing the Postgres continuity upsert so omitted follow-up writes preserve the prior `latestResultSummary` instead of nulling it. The touched slice still introduced no live secret material and only tightened persistence parity between in-memory and real Postgres harness state.

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

### A07/A10 Storage OAuth Callback Integrity

No confirmed issue remains in the current slice. The callback handler now requires the public route provider to match the pending OAuth state before token exchange begins, so a miswired callback path fails closed instead of silently finishing the wrong provider flow.

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
- The guarded harness mutation routes now accept tenant-authored summaries through parsed JSON bodies instead of URL query strings, which keeps business text out of browser history and intermediary URL logs.
- The widened proposal policy and new board-decision ledger store only bounded workflow metadata (`status`, `resolution`, optional `decisionNote`) and do not introduce any new credential-bearing persistence paths. The public `recentDecisions` feed now renders bounded summaries instead of replaying raw decision-note text.
- The new reused-lane `proposal_absorbed` event stores only bounded workflow metadata (`proposalId`, `parentCardId`, `requestedByPersona`, `requestedTitle`, `deliverableType`, `resolution`) and does not widen the secret boundary or persist provider material.
- The public board activity feed now emits bounded governance status messages for proposal decisions instead of replaying raw `decisionNote` text, which lowers the risk of leaking internal business notes or accidental sensitive phrasing into the tenant-facing surface.
- The derived `completionPackage` board view is assembled from existing persisted CEO and child-card outcomes and does not persist raw provider secrets or expand the runtime-context trust boundary.
- The new `harness_card_continuity` persistence path stores only policy-bounded operational board text (`continuitySummary`, `latestResultSummary`, `absorbedWorkItems`) and does not expand the runtime-context trust boundary or duplicate any provider credential state.
- The new `governanceItems` completion-package view is derived from bounded ledger fields (`policyReason`, `recommendationSummary`, `objectionSummary`) and intentionally excludes raw `decisionNote` text, which keeps ad hoc CEO notes out of the public board handoff.
- The worker-side harness lane-dispatch seam now emits only bounded lane metadata plus continuity-backed resume focus for the next actionable non-CEO lane, and terminal/no-actionable-lane cases stay quiet instead of widening execution noise or secret exposure.
- The worker-side harness claim/start seam now requires a durable `approved -> working` compare-and-set before any lane dispatch is emitted or any harness run is marked `running`, which keeps false progress and stale-lane races out of the public worker surface.
- Raw `queued` child lanes remain intentionally non-executable in the worker seam, which preserves the CEO approval boundary and avoids widening execution behavior into unreviewed staged work.
- The tightened worker-start seam now persists only bounded state/event/continuity updates around that claim (`state_changed`, active-lane `continuitySummary`, preserved `latestResultSummary`), without widening BYOK, provider secrets, or raw tenant notes into the worker surface.
- The new worker-private lane outcome seam stays inside the same bounded trust model: it accepts only a claimed `working` lane, records only `state_changed` plus optional bounded `result_recorded` summaries, refreshes continuity without exposing BYOK or provider material, and emits a private worker event instead of reopening the tenant-facing board API.
- Child-lane advancement now uses compare-and-set state transitions in both the public and private seams, which reduces the risk of stale workers or duplicate writes silently overwriting a lane after its state already changed elsewhere.

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
- Evidence: examples include masked/dummy values like `service-role-key`, `paperclip-service-token`, `Bearer valid`, and the clearly fake `postgresql://postgres.tenant:***@db.invalid:5432/postgres` test fixture.
- Recommendation: keep using clearly fake placeholders and continue avoiding live provider-shaped values in tests.

## Remediation Priority

1. Maintain ignore/exclude hygiene for `.env` and local operational artifacts so the clean harness slice cannot be contaminated by deployment-time staging mistakes.
2. Keep the harness `runtime_context` sanitization and response-guard tests in the full gate to prevent future regressions that reintroduce `secretValues` or customer-facing execution noise.
3. Keep tenant-authored summaries on parsed body surfaces only, and extend the same metadata-only audit discipline if broader harness mutation paths begin recording richer business outcomes.

## Conclusion

The current Wealth Factory harness slice is in a good security position: no confirmed live secret exposure was introduced, no tenant secret values are persisted in the new harness records, the board API remains customer-safe and high-level, run reconciliation now operates on persisted child-card/proposal state, completion is explicit and CEO-gated, proposal policy can now defer/deny or reuse an existing lane while keeping deferred work visible and reviewable, the decision ledger now carries bounded governance memory without replaying raw CEO notes, and the widened worker seam now requires both a durable claim and bounded persisted start-state updates before any public `running` signal is emitted while also keeping private lane outcomes inside a compare-and-set, non-secret-bearing mutation path. The new bounded follow-on dispatch path also stays lane-safe: it can only advance one next `approved` lane at a time, records the guarded workflow status that matches that claim, and still carries no BYOK or provider-secret material. The same-lane refinement reopen seam is also bounded on both approval paths: it only reactivates an existing completed lane with persisted continuity and latest outcome context instead of opening a new secret-bearing surface. The remaining work is operational hygiene and eventually moving audit publishing from the current best-effort post-commit path into a stronger guaranteed persistence seam, not an immediate security blocker for continued development.
