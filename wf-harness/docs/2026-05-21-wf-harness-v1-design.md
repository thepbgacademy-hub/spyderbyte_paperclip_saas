# Wealth Factory Harness V1 Design

Date: 2026-05-21
Branch: `codex/wf-harness-design`
Scope: Design-only subproject for the first custom Wealth Factory harness slice

## Purpose

Wealth Factory needs its own harness because the Paperclip-backed execution path proved the product concept, but also exposed the wrong long-term dependency shape for commercial multi-tenant reliability. The strongest findings from the pressure and soak phases were not that agentic workflow orchestration is invalid, but that the current Paperclip execution layer becomes the sustained hotspot under commercial-style load and must be protected by external control logic.

The first custom harness should replace the `CEO orchestration + child-card workflow loop` while keeping Wealth Factory as the tenant-safe control plane. The harness is not a general agent operating system. It is a bounded, reliable orchestration engine for Wealth Factory businesses-in-a-box.

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
- the run continues from the last durable checkpoint

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
