# Wealth Factory Harness Handoff

## Status

This is a new dominant subproject for Wealth Factory.

The first harness implementation slice is now built and verified:

- build a custom Wealth Factory harness
- replace the `CEO orchestration + child-card workflow loop` first
- keep BYOK fully owned by Wealth Factory
- use Hermes-style dashboard UX as the reference standard
- use prior Paperclip and pressure-test findings as the design compass
- persist harness runs, cards, and card events in dedicated tables
- expose a guarded harness board route backed by tenant-scoped persisted state
- render the first Hermes-style board page through a real API path, with browser-only fallback data kept outside the production page component
- persist sub-card proposals and expose the first guarded CEO approval mutation path

## Current Branch

- `codex/wf-harness-design`

## Key Design Commitments

- CEO is the only tenant-facing conversational actor
- child personas operate through bounded hybrid cards
- child-to-child coordination goes through the CEO
- dynamic card creation is allowed, but CEO-approved and card-count disciplined
- restart recovery resumes from persisted card and run state
- the first harness slice is a slice replacement, not a long-lived same-slice dual-engine setup

## Source of Truth

- `wf-harness/docs/2026-05-21-wf-harness-v1-design.md`

## Plan Of Record

- `wf-harness/docs/plans/2026-05-21-wf-harness-v1-implementation-plan.md`

## Standard Preflight

- If GitNexus will be used as the code map/blast-radius guide, refresh it first:
  - `gitnexus status`
  - if stale: `gitnexus analyze`
- Preferred discovery workflow:
  - `git diff` / `git log` for exact truth
  - `gitnexus detect-changes --scope compare` for recent blast radius
  - `gitnexus cypher` / `context` / `impact` for structure
  - `node E:\GitNexusHome\tools\gitnexus-fts-query.mjs --repo-path E:\REPOS\spyderbyte_paperclip_saas --query "<keywords>" --limit 8`

## Completed In This Phase

- Added durable harness persistence with `wfpc.harness_runs`, `wfpc.harness_cards`, and `wfpc.harness_card_events`.
- Added durable proposal persistence with `wfpc.harness_subcard_proposals`.
- Added repository-backed harness board service that authenticates the tenant, enforces membership, seeds the first CEO card set once, and reads customer-safe board state from persisted records.
- Added persisted pending-approval hydration plus a guarded `POST /api/harness/proposals/:proposalId/approve` mutation that turns one pending proposal into one queued child card without widening the board into a generic editing surface.
- Added a guarded `POST /api/harness/cards` mutation that lets the CEO create one direct top-level child card in persisted `approved` state, replacing the old fixed seeded CFO/COO board defaults with a real write seam.
- Added a guarded `POST /api/harness/cards/:cardId/advance` mutation that advances a persisted non-CEO child card through the existing state machine and can record a durable outcome snapshot when a lane reaches `done`.
- Reconciled persisted run-level progression from the real child-card and proposal seams so harness runs now derive `active`, `waiting`, `blocked`, and `assembling` from live execution state instead of mostly reflecting bootstrap.
- Added an explicit CEO-gated final assembly/completion seam so an `assembling` run now transitions to `done` only through a persisted completion command instead of being inferred from child-card motion alone.
- Replaced the narrow query-string mutation contract with parsed JSON-body input for the current harness command routes, keeping tenant-authored summaries off URL surfaces while preserving a bounded write API.
- Tightened CEO card-discipline rules so direct child creation now blocks duplicate open deliverable lanes and proposal approval now blocks duplicate open persona/deliverable lanes.
- Hardened the Node HTTP adapter so request-body limits are enforced on bytes actually read, not only on client-declared `Content-Length`, and loopback proxy headers now preserve the forwarded client IP for rate limiting.
- Tightened the dashboard HTTP seam so auth failures still return `401`, but real downstream/runtime faults now surface as `500 service_unavailable` instead of being mislabeled as unauthorized.
- Made harness workflow selection fail closed if more than one harness-eligible workflow is exposed without an explicit selector, instead of silently choosing the first configured id.
- Closed a cross-tenant approval leak on the already-approved proposal path, so a foreign tenant can no longer get a `200` and card id just by knowing another tenant's approved proposal id.
- Bounded the public child-card mutation seam to the approved v1 persona and deliverable catalog instead of accepting arbitrary lane taxonomy from HTTP input.
- Relaxed storage OAuth from all-or-nothing to per-provider availability, and returned structured CORS-safe `503 storage_oauth_unavailable` responses when a requested provider is not configured.
- Bound storage OAuth callback completion to the provider encoded in the public callback route, so a pending Google Drive state can no longer be completed through the Dropbox callback path.
- Validated `WF_STORAGE_OAUTH_REDIRECT_ORIGIN` against the allowed portal-origin list and basic bare-origin rules before it is embedded into OAuth callback URLs.
- Normalized the accepted storage OAuth redirect origin before wiring callback URLs, so a trailing slash or equivalent input cannot silently produce redirect-URI mismatches at the provider.
- Preserved pending OAuth state on a wrong-provider callback hit, so the flow still fails closed without burning the tenant's one valid retry path.
- Tightened harness route classification so unknown proposal/dead-end POST paths now return `404` before touching the proposal-approval rate-limit bucket.
- Widened harness-specific audit publishing beyond the card-event trail so direct child-card creation, proposal approval, child-card advancement, and run-state reconciliation now emit metadata-only best-effort durable audit events through the existing runtime sink.
- Hardened the direct-child mutation so same-request retries reuse the existing open child card, the first write path does not nest a second atomic seed block, and open child-card growth is capped before the board turns into card sprawl.
- Added a real disposable Postgres-backed harness proof path for the deferred `approved_card_id` foreign key. On machines with Docker available, the repo now proves the actual approval-before-card-insert commit succeeds when the child card exists by commit time, and rolls back cleanly when the deferred FK reaches commit without a matching card.
- Tightened the board read model so recorded result summaries surface back into the card outcome/detail view without exposing backend chatter.
- Tightened the board access boundary so membership/package denials fail closed as auth, while real infrastructure faults still surface as internal failures instead of being masked as `401`.
- Wired the runtime server to the real harness board service instead of static fixtures.
- Wired the board page to fetch guarded board state from `/api/harness/board`, while keeping a loopback-only browser fallback board for static Vite development and Playwright stability.
- Added harness workflow gating that now actually consumes `WF_HARNESS_ENABLED_WORKFLOW_IDS` through the harness workflow registry.
- Added a lightweight CEO approvals panel to the board shell so pending approval work is visible without exposing backend chatter.
- Reduced initial board seeding to CEO only, so additional persona lanes now appear through persisted mutations rather than hardcoded bootstrap cards.
- Added transaction-client coverage for the deferred proposal-approval seam so `markProposalApproved()` and the follow-on child-card insert are now proven to share one leased transaction client, including rollback behavior when the child-card insert fails after the proposal update.
- Re-ran the tenant/secret scans and updated the harness security report at `wf-harness/audit/2026-05-21/security-report.md`.
- Cleared the final repo-specific reviewer pass on code correctness after tightening the wording around what this test seam does and does not prove.

## Sharp Edges Logged

- Reviewer surfaced that the first cut was still a static demo board, the board handler masked internal failures as `401`, and harness-enabled workflow ids were not consumed in a live path. All three were fixed in this phase.
- Reviewer also surfaced that remote/authenticated board routes could not keep using fallback data and that DB outages in tenant/package gate checks must not be disguised as auth failures. Both edges were fixed and logged.
- The next mutation slice exposed a new sharp edge: adding `approveProposal` behavior to the handler without updating the handler option type broke the TypeScript build immediately. This is logged as a seam reminder for future narrow-route expansions.
- The intentional E2E fail step left a stray Python server on `127.0.0.1:5173`, which caused false directory-listing failures until the process was killed. This is logged so the mistake is not repeated.
- The approval hardening pass revealed one remaining proof gap: the repo now requires atomic approval mutations and marks the proposal-to-card foreign key as deferred, but the exact transaction-backed DB seam still needs a stronger integration harness than the current in-memory passthrough tests.
- The current CEO policy is stronger but still intentionally narrow. Exact-match retries remain idempotent, open child-card counts are capped, duplicate open deliverable lanes are blocked, and duplicate proposal approvals into the same persona/deliverable lane are blocked. Broader deny/defer semantics and smarter "update an existing lane instead of opening another one" logic still belong in a later slice.
- Run reconciliation is intentionally deterministic and the final completion seam is intentionally explicit. The harness now derives `active`, `waiting`, `blocked`, and `assembling` from child-card/proposal state, then requires a separate CEO completion command to persist `done`.
- Harness audit expansion is intentionally metadata-only. Do not persist raw `resultSummary` business text in durable audit payloads; use state metadata and booleans instead.
- Harness audit publishing is post-commit and best-effort. If the durable audit sink is unavailable, the mutation still succeeds and logs a warning rather than pretending the committed state failed.
- Mutation summaries now travel through parsed JSON bodies instead of URL query strings. Keep it that way; do not reopen URL surfaces for tenant-authored business text.
- Runtime request-size enforcement must use bytes actually read from the stream. Do not trust `Content-Length` alone for guarded harness/dashboard mutation surfaces.
- If the API is behind a trusted loopback proxy, preserve the forwarded client IP for rate limiting; otherwise the limiter will collapse tenants into one bucket and hide real traffic shape.
- Provider-specific storage OAuth callback routes are part of the integrity boundary, not just presentation. Do not complete a pending state through a mismatched provider callback path.
- `WF_STORAGE_OAUTH_REDIRECT_ORIGIN` must stay a bare http(s) origin that is already present in `WF_ALLOWED_ORIGINS`; do not treat it as an arbitrary callback host override.
- When validating callback-host config, keep and reuse the normalized origin string. Passing validation with a trailing slash is not enough if the stored value later rebuilds a double-slash redirect URI.
- Failing closed on a provider-mismatch callback should not destroy the pending OAuth state. Preserve the state so the correct callback can still succeed on retry.
- Harness rate-limit buckets should be charged only after a concrete route match. Dead or mistyped paths must not burn the budget for real approval traffic.
- The real deferred-FK proof is Docker-backed. Treat it as a strong integration proof where Docker is available, but remember it still skips cleanly on Dockerless machines instead of failing the whole suite.
- On Windows, overlapping GitNexus FTS/cypher calls right after analyze can briefly lock `.gitnexus\\lbug` and produce a false tooling failure. Serialize those preflight calls instead of treating the lock as a repo regression.
- The first cut of the real Postgres harness used blocking Docker child processes inside Vitest and triggered `[vitest-worker]: Timeout calling "onTaskUpdate"` on longer combined runs. The helper now uses async child-process calls; keep it that way or the proof suite can false-fail even when the database contract is correct.

## Next Step

Continue the harness build by replacing more of the live execution slice behind the persisted CEO/card model:

- start defining richer CEO approval rules and card-count discipline in executable runtime code instead of the current duplicate-lane/open-cap guardrails
- widen harness completion beyond the current explicit CEO final-assembly command into fuller packaging and result handoff logic
- expand the proposal/card mutation seam beyond the current child-card progression path without widening into generic editing APIs
