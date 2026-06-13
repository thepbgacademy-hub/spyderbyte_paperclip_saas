# Wealth Factory Harness V1 Design

Date: 2026-05-21
Branch: `codex/wf-harness-design`
Scope: Design-only subproject for the first custom Wealth Factory harness slice

## Purpose

Wealth Factory needs its own harness because the Paperclip-backed execution path proved the product concept, but also exposed the wrong long-term dependency shape for commercial multi-tenant reliability. The strongest findings from the pressure and soak phases were not that agentic workflow orchestration is invalid, but that the current Paperclip execution layer becomes the sustained hotspot under commercial-style load and must be protected by external control logic.

The first custom harness should replace the `CEO orchestration + child-card workflow loop` while keeping Wealth Factory as the tenant-safe control plane. The harness is not a general agent operating system. It is a bounded, reliable orchestration engine for Wealth Factory businesses-in-a-box.

## Design Freeze Rules

These rules are intentionally strict because drift near launch is more expensive than deferring a tempting slice.

- Wealth Factory is the base platform. Industry packages, overlays, and demo/example businesses must not be promoted into core-platform registry truth unless this design doc is explicitly revised first.
- Wealth Factory core must stay framework-agnostic. The base platform should provide runtime, governance, board, memory, package seams, and native workflow execution without assuming one business model.
- Package-specific workflows belong to package/install or overlay seams, not to the built-in platform baseline by default.
- Opinionated business frameworks belong in optional overlays or installed packages, not in the built-in platform baseline.
- Tenant-authored free-form business models are a first-class future requirement and must remain compatible with the same core seams instead of being forced into a prebuilt framework.
- Fixture convenience is not architecture. Demo seed data, preview data, or test examples must not decide the next platform phase on their own.
- Any phase that changes platform identity, core workflow registry truth, or next-phase direction must be checked back against this design doc before it is considered complete.

## Package Overlay Rule

Industry-specific workflows now enter through a package-overlay registration seam.

- Core Wealth Factory registry should stay platform-level and package-agnostic.
- Package-specific workflow families should be loaded from package/install or overlay registration context.
- Prebuilt business frameworks should be installed as overlays/packages rather than embedded into core platform identity.
- A later tenant-authored blank-canvas path should use the same package/overlay seam shape, while allowing a tenant to define a business model from scratch without changing the core platform baseline.
- Demo/example packages may illustrate overlays, but they must not redefine the core platform baseline.

### Registration Classes

- Core built-ins:
  Platform-level Wealth Factory workflows that are intentionally part of the built-in registry.
- Installed-package overlays:
  Package-scoped workflow definitions that are registered additively from installed package context.
- Demo/fixture presets:
  Example data that may illustrate packages or workflows, but must not redefine platform truth.

Overlay registration rules:

- Overlay registration is additive only.
- Installed package context is required.
- Overlay workflows may not override built-in workflow ids.
- Overlay registration alone does not imply harness eligibility or native-default execution.
- Overlay workflows remain off the board by default; board exposure requires an explicit package-definition opt-in plus active installed package context.
- Overlay workflows remain off the native executor by default; native execution requires an explicit package-definition opt-in plus active installed package context, and that opt-in does not promote the workflow into core-platform truth.
- Overlay board/native truth does not automatically imply public dashboard start availability; any later dashboard catalog or start-surface widening must be explicit and tenant-visible on that surface first.
- Overlay example naming must stay neutral enough that test fixtures or package demos do not masquerade as built-in Wealth Factory product scope.

Transition note:

- `wf_connect_first_workflow`, `wf_tax_strategy`, and `wf_package_followup` remain the current intentional core built-in workflow-family exceptions in the active engine room.
- This exception list is deliberately bounded. Future industry-specific or package-specific workflow families should use the overlay seam instead of joining the built-in registry by default unless this design doc is explicitly revised first.
- Keeping these three families in core does not by itself widen runtime eligibility, dashboard exposure, public start surfaces, or native-default policy beyond what the active plan records phase by phase.

## Why This Subproject Exists

The Paperclip-first build furnished valuable evidence:

- Wealth Factory queueing, outbox, worker pickup, and tenant isolation held up.
- Paperclip was repeatedly the active bottleneck under longer soak.
- The best user-facing dashboard reference was closer to Hermes than to Paperclip.
- BYOK ownership must stay in Wealth Factory.
- Orchestrator and worker separation matters for scope control and for recovery after interruption.

Those findings define the new direction:

- keep the good UX shape
- keep BYOK in Wealth Factory
- replace the unstable orchestration slice
- design for explicit state, bounded delegation, and restart-safe progress

## Selected Approach

Chosen approach:

- Persisted state-machine orchestrator core
- Structured multi-persona runtime
- Hermes-style dashboard and kanban UX
- Wealth Factory-owned BYOK boundary
- Slice replacement migration, not dual-engine dependence for the same execution path

Not chosen:

- Conversation-centric freeform multi-agent chat as the primary runtime model
- Full drop-in coexistence with Paperclip for the same workflow slice
- Rebuilding all of Hermes or all of Paperclip

## Adjacent Reference: Archon

Archon is a useful adjacent reference, but not a base platform choice for Wealth Factory.

Why it is relevant:

- it treats AI work as a deterministic workflow engine with explicit stages
- it separates AI steps from deterministic validation and shell steps
- it supports loop nodes, approval gates, and fresh-context iterations
- it reinforces the idea that the harness should own structure while the model supplies bounded intelligence

Why it is not the target architecture:

- Archon is optimized for AI coding workflows, Git worktrees, PRs, tests, and review loops
- Wealth Factory needs multi-tenant business orchestration, not software-delivery orchestration
- Wealth Factory also needs board memory, BYOK boundaries, tenant-safe governance, and long-running business operations

Concepts worth borrowing:

- explicit workflow graph definitions instead of implicit model drift
- bounded loop nodes with clear stop conditions
- deterministic validation gates between AI steps
- human/CEO approval gates as first-class runtime seams
- fresh-context worker iterations for sub-persona work
- clear execution monitoring and replayable progress traces

Concepts not to import directly:

- coding-specific worktree/PR assumptions
- GitHub-issue or code-review centric workflow defaults
- broad “workflow builder” scope before the Wealth Factory engine room is settled

Working rule:

- use Archon as a process-orchestration reference
- use Hermes as a dashboard/UX reference
- use Paperclip as a persona/value-shape reference
- keep the Wealth Factory harness purpose-built around the pressure-test lessons and tenant-safe business execution

## Architectural Boundary

### Wealth Factory Control Plane

Wealth Factory remains the outer trust and product boundary. It owns:

- tenant identity and membership
- package and B.I.B. entitlement boundaries
- active provider and credential selection
- BYOK vault storage and rotation
- run admission, fairness, and congestion policy
- customer-facing naming and dashboard language

The new harness does not own secret storage. It receives only resolved, run-safe runtime context from Wealth Factory.

### WF Harness Runtime

The new harness owns:

- CEO orchestration loop
- child persona card lifecycle
- bounded delegation rules
- approval flow for sub-cards
- run-state persistence
- card-state persistence
- restart recovery and resume

### UI Layer

The tenant experiences:

- a CEO-facing conversation surface
- a Hermes-like dashboard layout
- a clean kanban board
- high-level progress only
- card drawers for deeper outputs

The tenant must not see backend prompt/tool/skill/process noise.

## UX Direction

The Wealth Factory dashboard should closely mirror the Hermes dashboard in structure and feel, while using Wealth Factory branding, route names, and product concepts.

Hard UX requirements:

- left rail layout patterned closely after Hermes
- same calm, organized information density
- clean kanban-first workflow presentation
- tenant theme and color-palette settings
- polished drawer/detail behavior
- no backend execution chatter in the tenant surface

Intentional v1 differences:

- fewer side-rail items than Hermes
- Wealth Factory package and tenant wording everywhere
- no exposure of Hermes or Paperclip names

### Dashboard Visual Benchmark Note

An additional visual benchmark has now been identified from the user's later dashboard screenshot reference. The Wealth Factory dashboard should preserve that same clean, organized cockpit feel:

- clean left rail with simple, legible navigation groups
- roomy cards with strong spacing and minimal clutter
- high readability in a calm dark theme
- restrained metrics blocks instead of loud analytics tiles
- obvious hierarchy between current focus, actions, metrics, progress, and activity
- a polished, premium, organized feel rather than an over-busy control room

This note is intentionally directional, not final page-by-page layout lock-in. More screenshots and page references will be gathered later before the detailed dashboard layout spec is expanded.

## Core Run Model

Each run begins inside a selected B.I.B. package boundary. The package provides:

- allowed personas
- initial lane structure
- expected deliverable types
- allowed business scope
- runtime guardrails

The CEO orchestrator receives the tenant goal and decides how to structure the work inside those boundaries.

## Card Model

Each kanban card is a hybrid card:

- persona-owned
- deliverable-focused
- bounded in scope
- attached to one active assignment

A card is not just a task and not just an artifact. It is the unit of orchestrated work that the tenant can understand visually.

Each card should include at minimum:

- card id
- run id
- owning persona
- assignment title
- expected deliverable
- status
- priority
- package/workflow context
- summary/output snapshot
- timestamps
- parent/child relationships

## Orchestrator and Child Persona Rules

### CEO Orchestrator

The CEO is always the tenant-facing voice. The tenant never directly chats with CFO, COO, researcher, or other child personas.

The CEO owns:

- interpreting tenant intent
- sequencing work
- approving or denying sub-card creation
- maintaining card count discipline
- final answer assembly
- deciding whether an update belongs in an existing card or truly warrants a new card
- explicitly handing off an active deliverable lane when another persona should take ownership, without turning the board into a generic lane editor

The CEO may answer naturally about a child persona's work, but should not sound like a ventriloquist relaying raw child chatter.

### Child Personas

Each child persona gets:

- its own bounded context window
- its own persona framing
- a narrow assignment
- explicit expected output

Child personas may:

- complete their assigned work
- update their own card state
- request new sub-cards
- draft new sub-cards

Child personas may not:

- directly coordinate with each other
- directly interact with the tenant
- expand scope outside package boundaries
- create unlimited new cards without CEO approval

### Refinement Rule

Worker and board outcomes do not automatically imply a fresh run.

If the tenant or the CEO asks for a refinement of the same bounded assignment, the harness should prefer keeping that work inside the existing lane. This preserves:

- persona continuity
- prior outcome context
- absorbed follow-on requests
- governance history

Examples that should usually stay in the same lane:

- revising a pricing review with updated assumptions
- tightening a marketing plan that already exists
- expanding an existing research brief with a few more bounded inputs

If the follow-up request is related but materially different, it may justify a new lane.

If the request changes the larger board objective, starts a new operating phase, or reorients the company direction, it should usually become a fresh board cycle or fresh run instead of overloading the existing lane.

Examples that should usually become a fresh cycle:

- rebuilding the go-to-market plan around a different market segment
- pausing launch to rework the business model
- starting the next operating cycle after the board packages the prior one

Working rule:

- same lane for bounded refinement of the same deliverable
- new lane for related but materially distinct deliverable work
- fresh cycle for broader directional or phase-change work

Fresh cycle does not mean memory loss. A new run should still inherit the durable institutional memory of what was recommended, implemented, deferred, denied, and learned, while keeping execution state clean for the new board cycle.

### Coordination Rule

All coordination flows through the CEO orchestrator. Child-to-child free conversation is not allowed.

## State Model

### Run States

Suggested initial run states:

- `queued`
- `planning`
- `active`
- `waiting`
- `blocked`
- `assembling`
- `done`
- `failed`
- `cancelled`

### Card States

Suggested initial card states:

- `queued`
- `planning`
- `approved`
- `working`
- `waiting`
- `blocked`
- `done`
- `cancelled`

The harness should enforce explicit transitions rather than letting state drift implicitly from model output.

## Dynamic Card Creation

Dynamic card creation is allowed in v1, but only inside the selected B.I.B. structure and Wealth Factory package boundaries.

Rules:

- CEO may create new cards directly
- child personas may propose or draft sub-cards
- CEO remains the approval gate
- default bias is to reuse or update an existing card when possible
- card fan-out should be constrained so the board remains comprehensible

This preserves adaptability without letting the board explode into noise.

## Reliability Rules

Reliability is a first-class requirement for the new harness.

The harness must be designed so that:

- run state is persisted
- card state is persisted
- delegation decisions are persisted
- persona ownership is persisted
- outputs and summaries are persisted
- restart recovery resumes from saved state

If the VPS restarts or the process crashes:

- the CEO run reloads from storage
- all card states reload from storage
- the harness determines which work items were in progress

## Memory Strategy

Wealth Factory should separate short operational memory from long tenant-owned business memory.

### Small Harness Memory

The harness must keep a small retained memory layer for live continuity:

- active run state
- active card state
- recent board decisions needed for flow
- resumability after interruption
- bounded context needed for the CEO and child personas to keep the workflow coherent

This memory stays inside Wealth Factory because it is part of the live execution contract.

The live implementation should stay narrow and operational:

- per-lane continuity snapshots such as latest bounded outcome text
- absorbed follow-on work labels needed to resume the lane coherently
- no free-form long notes and no duplicate governance ledger

This is a policy boundary in the harness runtime and read model, not an excuse to let the storage layer become an open-ended notes system.

### Long Business Memory

The larger historical memory of the company should be designed as a tenant-owned record layer, not as an ever-growing harness runtime store.

Strong candidate:

- Obsidian as a tenant-owned long-memory and record system

Good uses for that layer:

- board meeting notes
- strategy decisions
- approved implementation direction
- KPI and company-health snapshots
- operating procedures
- weekly executive summaries
- recommendations made, accepted, rejected, or deferred
- longitudinal business history

This aligns with market interest in Obsidian as a second-brain and business knowledge system, and it lowers pressure for Wealth Factory to become a heavy long-term document-storage platform.

### Boundary Rule

Obsidian should not become the source of truth for live execution-critical state.

Do not rely on Obsidian alone for:

- active run locks
- queue state
- in-flight orchestration state
- auth/session state
- BYOK credential state
- fairness or congestion control

So the intended split is:

- Wealth Factory owns runtime truth
- Obsidian can own long-form business memory
- cloud storage connectors like Google Drive or Dropbox can hold larger files and artifacts

This preserves a leaner harness while turning tenant-owned memory into a feature rather than a storage burden.
- the run continues from the last durable checkpoint

### Memory Split

The memory split is now explicit:

- `lane_continuity` and `attention_state` stay operational runtime memory inside Wealth Factory.
- Those operational seams remain Wealth Factory-owned only and never promote directly into tenant-owned long memory.
- `governance_history_export` is the bounded tenant-owned-later promotion path for governance decisions and implemented follow-through.
- `package_bundle_export` is the bounded tenant-owned-later promotion path for closed-board package governance and package deliverables.
- Future tenant-authored free-form frameworks must still respect this split: operational runtime memory stays harness-owned, while any tenant-owned long-memory promotion remains explicit and bounded through approved export seams.

This means Obsidian can own tenant records later, but only through the bounded export candidates and not by reading live continuity or attention state as execution truth.

## Framework Model

Wealth Factory should support three product layers without collapsing them into one another.

- Core platform lane:
  Framework-agnostic runtime, board, governance, memory, package, and native execution seams.
- Prebuilt framework lane:
  Optional installed overlays/packages that provide opinionated business models, workflows, and assets without redefining core platform truth.
- Free-form tenant lane:
  A later blank-canvas path where a tenant can define a business model from scratch while still using the same core runtime, governance, and memory seams.

Working rule:

- Do not bake one business framework into the Wealth Factory core.
- Do not let package examples or launch demos read like the built-in default product identity.
- When free-form tenant modeling is implemented later, it should compose through package/overlay-compatible seams instead of forcing special-case core exceptions.

Version 1 should resume from saved card state automatically and keep going.

## BYOK Boundary

Wealth Factory fully owns BYOK in version 1.

That means:

- tenant credentials are stored and rotated only in Wealth Factory
- Wealth Factory decides which credential is active
- the harness receives resolved runtime credential/context only
- the harness does not fetch or manage tenant secrets on its own

This keeps the trust boundary explicit and reduces secret sprawl.

## Migration Path

The migration should be a slice replacement, not a long-lived same-slice dual-engine setup.

Version 1 replaces:

- `CEO orchestration + child-card workflow loop`

Version 1 does not attempt to replace everything at once.

Paperclip remains useful as:

- a behavioral reference
- a source of earlier product proof
- a record of what worked and what broke under load

But the new harness should not depend on Paperclip for this replaced slice once it goes live.

## Test-Derived Constraints

The following findings from the previous build are now design constraints:

- the queue and worker path can be reliable even when the execution engine is not
- the engine must tolerate sustained work without becoming opaque and fragile
- fairness and backpressure matter
- restart-safe orchestration matters more than agent theatrics
- dashboard clarity matters to user trust
- sustained hotspot behavior must be visible and controllable

## V1 Non-Goals

Version 1 is not trying to:

- fully replace all Paperclip-backed execution
- clone all of Hermes
- become a general-purpose agent platform
- expose raw tool or prompt mechanics to the tenant
- build every future package/persona system up front

## Initial Subproject Structure

This subproject lives in its own folder so it does not intermingle with the earlier Paperclip-first build track:

- `wf-harness/docs/`
- `wf-harness/TODO.md`
- `wf-harness/HANDOFF.md`
- `wf-harness/audit/`
- `wf-harness/phase-builds/`

## Initial Success Criteria

The first harness slice is successful when:

- Wealth Factory still fully owns BYOK
- the CEO is the only tenant-facing conversational actor
- child personas operate through bounded hybrid cards
- the board experience feels close to Hermes in clarity and polish
- state survives restart and resumes correctly
- card creation remains dynamic but controlled
- the harness slice no longer depends on Paperclip for CEO orchestration

## Open Questions For Planning

These are not blockers for the design, but they need plan-level decisions next:

- exact persistence schema for run and card state
- how persona context windows are serialized and resumed
- what minimum card drawer detail ships in v1
- how much of the Hermes settings model is copied in the first UI slice
- how fairness and congestion control interact with the new harness runtime

## Recommendation

Proceed with a first implementation plan for the custom Wealth Factory harness focused on the persisted CEO orchestration and child-card loop, with Wealth Factory retaining BYOK and business-boundary control, and with Hermes-style dashboard UX as the reference standard.
