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

- The `.buildwork/` record is the single source of truth for lifecycle, scope,
  tasks, dependencies, acceptance criteria, revision, and acceptance.
- Validate after every state boundary:
  `pwsh ~/.claude/skills/beginning-builds/scripts/validate-build.ps1 -File .buildwork/builds/2026-07-21-wealth-factory-blueprint-native-reboot.json`
  (exit 0 required), then rebuild the index with
  `python ~/.claude/skills/beginning-builds/scripts/build_work.py rebuild-index --workspace .`
  (workspace is the repo ROOT `.`, never `.buildwork`).
- No task completes without acceptance evidence the auditor re-derived
  independently. A crew member's green is a claim, not a fact — re-check it
  (run the tests yourself; reproduce tenant-isolation/RBAC falsifiability by hand).
- **Crew model (DEC-041): direct-dispatch.** The headless orchestrator stalls on
  full-pipeline tickets, so the auditor (main session) dispatches the engineer and
  QC reviewer as direct single-role `launch_role.py` calls and uses the orchestrator
  only for record-only sign-off. See DEC-041 in the record.
- **Skeleton DB (CON-012):** integration/e2e run only against a local disposable
  Postgres from `deploy/docker-compose.local-postgres.yml` — never the VPS/Supabase
  DB in `.env`.
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

## Current position (revision 40, 2026-07-25)

- **Active branch:** `foundry/mvp-baseline` (synced to origin
  `thepbgacademy-hub/spyderbyte_paperclip_saas`). 35/86 tasks completed.
- **Built & independently audited** against a real local disposable Postgres, each
  slice with tenant isolation/RBAC proven falsifiable by hand:
  - `TASK-055` walking skeleton (login → tenant → install → station → persisted
    deliverable → tenant isolation)
  - `TASK-069` wired auth → real tenant-membership role → install RBAC → persisted
    audit into one route (`session.role` never trusted)
  - `TASK-073` mounted that route into the live server (`createDashboardRuntime`)
  - `TASK-076` approval checkpoint (approve / request-changes persisted, one-revision
    cap; `wfpc.factory_run_approvals`, migration 0039)
  - `TASK-079` Launch Kit export (`GET /api/factory/runs/:runId/export`, downloadable,
    gated on approved, no cross-tenant leak)
  - `TASK-084` run-driver spine (`wfpc.factory_runs` migration 0040; driver sequences
    intake → positioning on the stub; mounted `POST /api/factory/runs` answers-at-start +
    `GET /api/factory/runs/:runId` status). Subsumes `TASK-077`.
  - `TASK-078` **the approve/REVISE fork — belt now flows BOTH branches.**
    `request_changes` drives `reviseFactoryRunPositioning` (composing the existing domain
    fns on the stub) → persists `revision_1` deliverable + new pending approval + updated
    run row, wired into the mounted decision route. One-revision cap + idempotency proven.
  - Two demo packages load-verify (`DEC-039`, `demo-packages/`)
  - `TASK-086` **export curated to the approved positioning** — `assembleFactoryRunLaunchKit`
    filters to the positioning deliverable the approved approval points at (keyed on
    `approval.deliverableId`, not a string match); the customer's kit no longer shows the
    superseded draft. Revised run → revised brief; non-revised run → original. Read-only,
    no migration.
- **✔ Status (rev 40):** the belt flows as ONE SYSTEM on the stub provider, BOTH forks —
  `start → checkpoint → approve → export`, and
  `start → checkpoint → request_changes → revision_1 → approve → export` — and the exported
  Launch Kit now presents only the approved positioning. Workpieces arrive by running the
  line, not by seeded preconditions. The customer loop is MVP-complete on the stub path.
- **Suggested next slices** (owner's call): owner-deferred output polish `TASK-081` (rendered
  HTML/PDF kit), `TASK-082` (Drive/Dropbox delivery), `TASK-083` (brand color/voice kit);
  and/or `TASK-066` the first live BYOK provider call (owner + main session, outside the crew
  — no real credential in headless subprocesses).
- **Deferred (DEC-043/044):** interactive intake (answers-at-start only); client-run-id
  contract; `TASK-085` concurrency-safe start idempotency; the revision op's
  content-channel + non-atomicity limitations (DEC-044). All low-priority; sequential
  stub path is proven.
- **Deferred polish backlog (DEC-042):** `TASK-081` rendered HTML/PDF kit,
  `TASK-082` Drive/Dropbox delivery, `TASK-083` brand color/voice kit. Previews:
  `docs/sample-launch-kit.json` (what ships today) and `docs/sample-launch-kit.html`
  (the rendered target).
- **Open follow-ups:** `TASK-066` live provider call (owner+main-session, outside the
  crew), `TASK-067` Postgres RLS (`RISK-027`, high — no DB backstop for a missed
  tenant filter), `TASK-075` deploy asset path, `TASK-080` e2e seeding race.
- **Owner-gated / not code:** Stripe submission (gates all revenue); VPS port closure
  (`TASK-034`, needs root/Hostinger panel); `docker rm` vs keep the four stopped
  dormant containers (`TASK-065`). Nothing deployed to the VPS yet.
