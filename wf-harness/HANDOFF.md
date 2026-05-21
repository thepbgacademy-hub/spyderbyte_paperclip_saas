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
- Added repository-backed harness board service that authenticates the tenant, enforces membership, seeds the first CEO/CFO/COO card set once, and reads customer-safe board state from persisted records.
- Tightened the board access boundary so membership/package denials fail closed as auth, while real infrastructure faults still surface as internal failures instead of being masked as `401`.
- Wired the runtime server to the real harness board service instead of static fixtures.
- Wired the board page to fetch guarded board state from `/api/harness/board`, while keeping a loopback-only browser fallback board for static Vite development and Playwright stability.
- Added harness workflow gating that now actually consumes `WF_HARNESS_ENABLED_WORKFLOW_IDS` through the harness workflow registry.
- Re-ran the tenant/secret scans and updated the harness security report at `wf-harness/audit/2026-05-21/security-report.md`.
- Cleared the final repo-specific reviewer pass with no remaining findings in the touched harness slice.

## Sharp Edges Logged

- Reviewer surfaced that the first cut was still a static demo board, the board handler masked internal failures as `401`, and harness-enabled workflow ids were not consumed in a live path. All three were fixed in this phase.
- Reviewer also surfaced that remote/authenticated board routes could not keep using fallback data and that DB outages in tenant/package gate checks must not be disguised as auth failures. Both edges were fixed and logged.
- The intentional E2E fail step left a stray Python server on `127.0.0.1:5173`, which caused false directory-listing failures until the process was killed. This is logged so the mistake is not repeated.

## Next Step

Continue the harness build by replacing more of the live execution slice behind the persisted CEO/card model:

- move from seeded board bootstrap toward real run mutation paths
- add explicit harness audit events beyond the current run/card/event persistence
- start defining the CEO approval rules and sub-card policies in executable runtime code instead of seed defaults
