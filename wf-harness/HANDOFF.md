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
- Hardened the direct-child mutation so same-request retries reuse the existing open child card, the first write path does not nest a second atomic seed block, and open child-card growth is capped before the board turns into card sprawl.
- Added a real disposable Postgres-backed harness proof path for the deferred `approved_card_id` foreign key. The repo now proves the actual approval-before-card-insert commit succeeds when the child card exists by commit time, and rolls back cleanly when the deferred FK reaches commit without a matching card.
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
- The new direct-child mutation currently uses guarded query parameters instead of a parsed JSON body because the existing dashboard HTTP request shape does not yet expose parsed request bodies. This keeps the slice narrow, but it is a contract seam to revisit before the mutation surface broadens.
- The current direct-child guardrail is intentionally narrow: exact-match retries are idempotent and open child cards are capped, but richer CEO card-count policy still belongs in a later slice instead of being guessed inside this mutation.
- The new child-card advancement seam is also intentionally narrow: it advances non-CEO cards and records durable events/results, but it does not yet reconcile the parent run state beyond the bootstrap path. Keep that next-step gap visible instead of assuming card progression already means full run progression.
- On Windows, overlapping GitNexus FTS/cypher calls right after analyze can briefly lock `.gitnexus\\lbug` and produce a false tooling failure. Serialize those preflight calls instead of treating the lock as a repo regression.
- The first cut of the real Postgres harness used blocking Docker child processes inside Vitest and triggered `[vitest-worker]: Timeout calling "onTaskUpdate"` on longer combined runs. The helper now uses async child-process calls; keep it that way or the proof suite can false-fail even when the database contract is correct.

## Next Step

Continue the harness build by replacing more of the live execution slice behind the persisted CEO/card model:

- reconcile run-level progression with the new persisted child-card advancement seam so harness run state tracks real execution instead of mostly reflecting bootstrap
- add explicit harness audit events beyond the current run/card/event/proposal persistence
- start defining richer CEO approval rules and card-count discipline in executable runtime code instead of seed defaults
- expand the proposal/card mutation seam beyond the current child-card progression path without widening into generic editing APIs
