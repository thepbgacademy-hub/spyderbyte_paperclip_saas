# Build Work Record — Read First

**Product: SpyderByte Foundry** (renamed from Wealth Factory for copyright; repo
and internal identifiers still say `wealth-factory` by decision, not oversight —
the rename lives in a customer-facing copy layer, internals stay frozen).

The authoritative state of this build lives in
`.buildwork/builds/2026-07-21-wealth-factory-blueprint-native-reboot.json`.

Read it before any planning or implementation in this workspace. It governs
objective, scope, task status, decisions, risks, and open questions. This file
is a tracked pointer so a freshly cloned session lands on the record; the full
local guidance (including GitNexus tooling) is in the gitignored `CLAUDE.md`.

**Scope rule:** MVP is defined by what https://www.spyderbyte.cloud promises
paying customers — buy a package, connect a provider (BYOK or subscription
connector), run capped workflows, approve, export, cancel. The 30
master-blueprint tickets are backlog, not the definition of done. Work serving
no promise on that page is post-MVP unless it is a safety, security, or legal
requirement.

## Working rules

- Only the orchestrator changes authoritative state (lifecycle, scope, tasks,
  dependencies, acceptance criteria, revision, acceptance).
- Validate after every state boundary:
  `pwsh ~/.claude/skills/beginning-builds/scripts/validate-build.ps1 -File .buildwork/builds/2026-07-21-wealth-factory-blueprint-native-reboot.json`
  (exit 0 required).
- No task completes without recorded acceptance evidence re-derived by the
  orchestrator. A subagent's green is a claim, not a fact — re-check it.
- `TODO.md` and `wf-harness/HANDOFF.md` are historical reference. Do not add or
  tick items there; the record governs task status.

## Reference docs (subordinate to this record)

- **Master blueprint** — `THE_WEALTH_FACTORY_MASTER_BLUEPRINT.md`, kept outside
  this repo (the founder's `wealth_clip` working area). It is the founding design
  document (v1.0, 2026-07-06) and the source of the architecture, the anti-"AI
  company" stance, and the internal-vs-customer naming mechanism (its Section 5).
  It is **historical**: where it and this record differ, the record wins. It still
  uses the original name "The Wealth Factory" (= SpyderByte Foundry) by design,
  not oversight. Do not renumber or restructure it — this record's phase map
  (B11–B35 → Tickets 07–12) depends on its ticket numbers.

## Current position (revision 16, 2026-07-23)

- **Active branch:** `foundry/mvp-baseline` (synced to origin).
- **Repo:** `thepbgacademy-hub/spyderbyte_paperclip_saas`.
- 25 blueprint phases (B0–B35) committed. Record restructured from architecture
  to customer outcome. Foreman, two-meter budget, session-loss recovery, wave
  onboarding, and the Foundry rename are designed in.
- **Next task:** `TASK-055`, the walking skeleton — one thin path (real login →
  real tenant → one package → one station → one deliverable that survives logout
  → a test proving tenant isolation). Run via the build-crew skill with the
  orchestrating session auditing.
- **Open with the owner:** Stripe submission, VPS port closure (`TASK-034`,
  needs root/Hostinger panel, Redis on 32768 first), and whether to `docker rm`
  four safely-stopped dormant containers (`TASK-065`).
