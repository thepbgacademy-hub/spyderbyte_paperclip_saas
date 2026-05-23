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
- Wealth Factory keeps small runtime memory, while larger tenant-owned company memory can later live in Obsidian as a second-brain/record layer

## External References

- Paperclip remains the persona/value-shape reference.
- Hermes remains the dashboard/UX reference.
- Archon is now explicitly a process-orchestration reference only:
  - borrow deterministic workflow-graph ideas
  - borrow loop/approval/validation-gate ideas
  - do not drift into a coding-agent or PR/worktree-centric architecture

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
- Widened proposal policy from binary approve-only behavior into explicit `approve`, `defer`, and `deny` decisions, with persisted resolution metadata and decision notes stored on the proposal record.
- Added smarter CEO lane reuse behavior so proposal approval now prefers updating an existing exact-match or persona/deliverable lane before opening a new child card, which keeps the board bounded under sustained tenant pressure.
- Added a first read-only completion-package seam to the board response so `assembling` and `done` runs can surface a durable summary plus completed non-CEO deliverables without exposing backend chatter.
- Added harness migration `0015_wf_harness_proposal_resolutions.sql` plus migration-helper awareness, so local/staged environments can widen proposal status support and resolution metadata without hand-applied SQL drift.
- Added harness migration `0016_wf_harness_board_decisions.sql` plus migration-helper awareness, so CEO board decisions now persist as first-class append-only governance records instead of being inferred from comments or audits.
- Fixed the first cut of defer/reuse policy so deferred proposals stay visible for later CEO review, `/approve` cannot return `200` for non-approved outcomes, and reused-lane approvals now leave a visible parent-card note instead of silently disappearing from the originating lane.
- Added a bounded `recentDecisions` board read model so the harness can surface governance history without exposing backend chatter or turning the board into a generic note stream.
- Tightened CEO policy again so proposal approval now auto-defers when another active persona already owns the same deliverable lane, instead of surfacing that governance conflict as a low-level runtime failure.
- Tightened the migration helper for the new board-decision table so it now re-checks the schema after applying `0016` and fails honestly if a drifted partial table shape still does not satisfy the runtime contract.
- Kept `recentDecisions` bounded after review: the public board history now summarizes governance outcomes without replaying raw `decisionNote` text or duplicating the CEO completion summary as a second source of business-result truth.
- Added harness migration `0017_wf_harness_board_memory.sql` plus migration-helper awareness, so the append-only decision ledger now carries bounded `policyReason`, `recommendationSummary`, and `objectionSummary` fields without introducing a second memory store.
- Widened the board read model so deferred approvals now surface bounded policy metadata (`policyReasonLabel`, `nextReviewTrigger`, `lastDecisionAtLabel`) instead of just a generic deferred status string.
- Widened `recentDecisions` and `completionPackage` so the board can surface bounded governance memory, deferred-approval caveats, and board recommendation/objection summaries without replaying raw CEO notes or backend chatter.
- Tightened repeated-governance handling so a second defer decision with no new note now stays idempotent instead of appending duplicate decision/event noise to the board memory ledger.
- Widened `completionPackage` again so deferred and denied governance outcomes now surface as first-class bounded `governanceItems`, with policy labels, objection/recommendation summaries, and deferred next-review triggers derived from the decision ledger instead of from raw notes.
- Corrected the first packaging cut so top-level recommendation/objection summaries now derive from the full deferred/denied governance set, not only the first visible `governanceItems`, and denied-only governance packages now still advertise visible governance content instead of hiding behind a false `hasOpenGovernanceItems: false`.
- Made reused-lane approvals persist structured absorbed-work state on the target lane instead of relying only on free-form comments, so folded follow-on work now survives as actionable card history in the board read model.
- Widened the card read model so active lanes expose absorbed proposal work through bounded activity labels plus an `Absorbed Work` detail section, without widening the board into a generic notes surface.
- Tightened the public board activity feed so proposal defer/deny/approve mutations no longer echo raw `decisionNote` text back to the tenant; the board now emits bounded public status messages while keeping free-form CEO notes internal to proposal/decision state.
- Corrected run-state derivation so a run whose non-CEO child lanes are all terminal-but-cancelled now resolves to `blocked` instead of falling back to a misleading `active` state with no live work left.
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
- Added an explicit `startFreshCycle` mutation that opens a new persisted run from a packaged board cycle instead of reopening a terminal run in place.
- Limited fresh-cycle carry-forward to deferred proposals whose latest governance reason is `completed_lanes_only`, so packaged follow-on work reopens intentionally without reviving unrelated lane-pressure or scope-boundary pauses.
- Deepened `startFreshCycle` so the CEO can now choose between reopening only bounded deferred follow-on work and starting a completely clean board cycle, without widening the seam into generic run reopening.
- Re-ran the tenant/secret scans and updated the harness security report at `wf-harness/audit/2026-05-21/security-report.md`.
- Cleared the final repo-specific reviewer pass on code correctness after tightening the wording around what this test seam does and does not prove.

## Sharp Edges Logged

- Reviewer surfaced that the first cut was still a static demo board, the board handler masked internal failures as `401`, and harness-enabled workflow ids were not consumed in a live path. All three were fixed in this phase.
- Reviewer also surfaced that remote/authenticated board routes could not keep using fallback data and that DB outages in tenant/package gate checks must not be disguised as auth failures. Both edges were fixed and logged.
- The next mutation slice exposed a new sharp edge: adding `approveProposal` behavior to the handler without updating the handler option type broke the TypeScript build immediately. This is logged as a seam reminder for future narrow-route expansions.
- The intentional E2E fail step left a stray Python server on `127.0.0.1:5173`, which caused false directory-listing failures until the process was killed. This is logged so the mistake is not repeated.
- The approval hardening pass revealed one remaining proof gap: the repo now requires atomic approval mutations and marks the proposal-to-card foreign key as deferred, but the exact transaction-backed DB seam still needs a stronger integration harness than the current in-memory passthrough tests.
- The current CEO policy is stronger but still intentionally narrow. Exact-match retries remain idempotent, open child-card counts are capped, duplicate open deliverable lanes are blocked, and duplicate proposal approvals into the same persona/deliverable lane are blocked. Broader deny/defer semantics and smarter "update an existing lane instead of opening another one" logic still belong in a later slice.
- Proposal decisions are now persisted as first-class policy outcomes. If future slices widen this seam, preserve the current bounded model: `approve`, `defer`, and `deny` are workflow decisions, not generic board-edit verbs, and lane reuse should stay preferred over lane creation.
- `defer` is now a real revisit state, not a hidden terminal state. Keep deferred proposals visible in the approvals read model and allow a later CEO approval/denial pass unless a future product rule explicitly changes that lifecycle.
- The first real packaging/result-handoff seam is intentionally read-only. `completionPackage` is a derived board view built from persisted CEO and child-card outcomes; do not start persisting a second duplicate package artifact until a later slice proves it is necessary.
- The real disposable Postgres proof must apply every harness proposal migration in order. Forgetting `0015_wf_harness_proposal_resolutions.sql` produced a false red on the deferred-FK proof because the repository started writing `resolution` and `decision_note` before the disposable DB knew those columns existed.
- Run reconciliation is intentionally deterministic and the final completion seam is intentionally explicit. The harness now derives `active`, `waiting`, `blocked`, and `assembling` from child-card/proposal state, then requires a separate CEO completion command to persist `done`.
- The first fresh-cycle regression was too trusting of live decision helpers during test setup. The alternate deferred proposal accidentally picked up `completed_lanes_only` too, so the proof looked like a carry-forward bug when it was really a test-fixture bug. Pin alternate governance reasons explicitly when the seam under test is policy-sensitive.
- The next fresh-cycle widening exposed 2 easy false reds in test fixtures: copied child-card progress setups can accidentally double-apply `working`, and clean-cycle proofs still need the normal `approved -> working -> done` progression before packaging. Keep progression fixtures literal and minimal when broadening board-cycle behavior.
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
- On this machine, `docker --version` can succeed even while the Docker daemon pipe is unavailable. Treat the disposable Postgres proof as Docker-ready only when `docker info` also succeeds, or the suite will false-red trying to pull images through a dead daemon connection.
- On Windows, overlapping GitNexus FTS/cypher calls right after analyze can briefly lock `.gitnexus\\lbug` and produce a false tooling failure. Serialize those preflight calls instead of treating the lock as a repo regression.
- The first cut of the real Postgres harness used blocking Docker child processes inside Vitest and triggered `[vitest-worker]: Timeout calling "onTaskUpdate"` on longer combined runs. The helper now uses async child-process calls; keep it that way or the proof suite can false-fail even when the database contract is correct.
- This Vitest version does not support `--runInBand`; using it produces a CLI failure before the repo tests even start. Keep targeted proof runs on the repo's supported `vitest run ...` shape instead of cargo-culting Jest flags.
- Board-memory persistence should stay append-only and transaction-local. Write the decision ledger inside the same atomic seam as the business mutation instead of trying to reconstruct governance history later from comments or audit events.
- A cross-persona deliverable-owner conflict is a board-governance signal, not a runtime exception. The bounded behavior is to defer the proposal, keep it visible, and let the CEO revisit it later.
- Board-memory widening should stay bounded and additive. Use the existing append-only decision ledger plus derived board views, not a generic notes table or a second persisted package-memory store.
- Implemented board history should come from the decision ledger too. If the tenant needs to see what governance actions were actually carried out, derive that from `lane_opened`, `proposal_approved`, and `run_completed` decisions instead of replaying raw card chatter or CEO notes.
- Governance caveats belong in the read model, not in raw note replay. Deferred approvals should expose why they are paused and what reopens them, but the public board still should not echo full `decisionNote` text back to the tenant.
- Public lane activity must stay bounded too. Even if free-form CEO notes remain useful in persisted proposal or decision state, do not replay them into the tenant-facing activity feed; emit a bounded public status message instead.
- Those bounded public status messages still need to stay policy-aware. Do not flatten every denied proposal into a generic workflow-boundary message when the real governing reason was lane pressure or another persona actively owning the deliverable.
- If the board copy tells tenants to wait until a deliverable owner clears or hands off a lane, that promise should map to a real bounded engine action. The harness now supports an explicit CEO lane handoff path for owner-conflict proposals; future governance wording should stay tied to executable paths like that.
- If a guarded mutation accepts a bounded targeting hint like `targetCardId`, the board read model must surface the matching bounded hint too, and stale hints should degrade into normal governance fallback instead of turning a valid approval into a hard conflict.
- Completed board cycles now fail closed on follow-on work creation, not only on proposal approvals. When a run is already `assembling` or `done`, the harness defers new proposal approvals under `completed_lanes_only` and rejects direct CEO child-lane creation instead of silently reopening child work through generic lane creation.
- Terminal runs should be read-only at the child-card seam, not only at run reconciliation. Once a run is `done`, `failed`, or `cancelled`, reject direct child-card progression writes and keep reconciliation read-only so later activity cannot drive invalid reverse state transitions.
- Migration-helper readiness checks must cover every live enum literal, not just one or two sentinel values. A partial `policy_reason` constraint can look "ready" and still reject the first real board decision insert.
- `completionPackage` should summarize current governance state, not replay stale historical objections. Deferred or denied guidance that is later resolved must fall out of the final handoff package instead of lingering as old board noise.
- Repeated defer actions need the same card-discipline as repeated lane opens. If the CEO has not changed the note or the policy context, treat the second defer as idempotent instead of expanding the governance ledger with duplicate pause decisions.
- Tenant-facing governance packaging should be derived from the decision ledger, not from raw `decisionNote` text. Surface bounded policy labels, recommendation/objection summaries, and review triggers, but keep ad hoc CEO notes internal unless a later explicit export seam proves they belong in long memory.
- If the board shows only a capped visible subset of governance items, the package-level summaries still need to derive from the full current governance set. Otherwise larger boards under-report active objections and recommendations.

## Next Step

Continue the harness build by replacing more of the live execution slice behind the persisted CEO/card model:

- keep deepening CEO lane policy in executable runtime code, especially around when to update an existing lane versus defer versus deny as the board accumulates more governance memory
- keep widening reusable-lane execution truth so absorbed proposal work becomes structured lane state, not only comment history, whenever the CEO folds follow-on work into an existing card
- keep deepening follow-through memory from the decision ledger so the board can later export a clean suggested-versus-implemented history to Obsidian without introducing a second persisted notes system
- keep tightening derived run-state truth so terminal-but-empty child-lane outcomes surface as honest blocked states rather than falling back to fake active work
- widen harness completion beyond the current derived `completionPackage` into a fuller packaged result handoff only after the bounded governance-memory seam stays stable under more execution slices
- decide whether denied governance items should stay only in the derived tenant-facing handoff package or graduate into a later persisted export artifact/Obsidian sync record
- expand the proposal/card mutation seam beyond the current child-card progression path without widening into generic editing APIs
- design first-class board memory exports so recommendations, objections, approvals, and deferrals can later sync into tenant-owned Obsidian without making Obsidian live runtime truth
- later, design the Obsidian integration as tenant-owned long memory and records, not as the live source of truth for harness execution state
