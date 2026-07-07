# Wealth Factory Domain Skeleton

Date: 2026-07-06
Branch: `codex/wealth-factory-blueprint`
Source blueprint: `E:\REPOS 2\wealth_clip\THE_WEALTH_FACTORY_MASTER_BLUEPRINT.md`

## Goal

Define the first blueprint-native domain surface so new implementation work stops inheriting the older board-first product shape by accident.

## Customer-Facing Concepts

- Workspace
- Blueprint
- Expansion
- Production Run
- Station
- Specialist
- Checkpoint
- Deliverable
- Launch Kit
- Power Source
- Run Budget
- Factory Log

## Specialist Function Layer

The reboot keeps the business-guidance functions from the older CEO/CFO/CMO-style workflow model, but it does not require those exact titles or the older board-first persona shell.

The source of truth going forward is:

- preserve the expertise function
- do not preserve legacy persona naming unless it clearly improves the product
- bind expertise to stations, deliverables, approvals, and handoffs

Recommended specialist-function roster:

- Direction specialist
- Finance specialist
- Market specialist
- Operations specialist
- Offer specialist

These are function placeholders, not final marketing labels. They exist to preserve the user benefit:

- business direction
- financial pressure-testing
- positioning and messaging guidance
- operational systemization
- offer and conversion refinement

Implementation rule:
Phase B proves the engine and bounded workflow slices that make specialist work possible. A later dedicated phase should formalize the specialist-function architecture itself.

## Specialist Function Map

This map is the current reboot recommendation for how specialist functions should attach to future station families.

### Direction Specialist

Primary responsibility:
Business direction, priorities, sequencing, and executive decisions.

Recommended station families:

- intake
- founder profile synthesis
- strategic priorities
- decision checkpoints
- launch direction review

Expected deliverables:

- founder profile
- strategic brief
- decision memo
- launch direction summary

### Finance Specialist

Primary responsibility:
Pricing logic, margin pressure-testing, financial constraints, and commercial tradeoff review.

Recommended station families:

- pricing analysis
- margin review
- cost structure review
- revenue sensitivity review
- financial approval checkpoints

Expected deliverables:

- pricing brief
- margin pressure-test summary
- financial risk note
- approval recommendation

### Market Specialist

Primary responsibility:
Positioning, messaging, audience fit, market framing, and go-to-market clarity.

Recommended station families:

- positioning analysis
- messaging refinement
- audience clarity review
- market offer framing
- campaign direction review

Expected deliverables:

- positioning brief
- messaging brief
- audience summary
- go-to-market recommendation

### Operations Specialist

Primary responsibility:
Systemization, delivery flow, workflow readiness, and execution reliability.

Recommended station families:

- delivery design
- workflow sequencing
- SOP drafting
- implementation readiness review
- handoff packaging

Expected deliverables:

- operating plan
- SOP package
- workflow readiness brief
- handoff checklist

### Offer Specialist

Primary responsibility:
Offer design, packaging, conversion framing, and customer-value clarity.

Recommended station families:

- offer shaping
- package design
- objection handling review
- conversion review
- launch offer validation

Expected deliverables:

- offer brief
- package recommendation
- objection-handling notes
- conversion guidance summary

## Mapping Rules

- A station family should have one primary specialist owner.
- Secondary specialist input can exist, but it should be expressed as a bounded handoff or approval, not as overlapping ownership.
- `personaKey` should eventually point to a specialist-function identity, not to a legacy executive-title assumption.
- Deliverables should be attributable to the specialist function that owns the station.
- Approval checkpoints should name which specialist function is requesting review and which specialist function is expected to resolve or sign off.

## Internal Canonical Entities

These names should be used in code, schemas, and APIs.

### Workspace

Responsibility:
Tenant boundary for members, settings, credentials, installs, runs, and deliverables.

Core fields:

- `id`
- `name`
- `slug`
- `status`
- `createdAt`

### Package

Responsibility:
Installable product unit containing stations, personas, templates, permissions, and optional expansions.

Core fields:

- `id`
- `key`
- `kind` (`blueprint` or `expansion`)
- `title`
- `version`
- `status`

Forward note:
The reboot B1-B7 slice currently allows the package `id` seam to align closely with the package key so the engine can be proven without persistence or publishing infrastructure. Before any later phase widens into publishing, persistence, installs with history, or package updates, the domain must separate stable package identity from immutable package-version identity so installs and runs can pin an exact published version without a breaking retrofit.

### PackageInstall

Responsibility:
Record of a package installed into a workspace.

Core fields:

- `id`
- `workspaceId`
- `packageId`
- `installedAt`
- `enabled`

Forward note:
In a later persistence/versioning phase, `packageId` should remain the stable package identity while installs gain an explicit version seam such as `packageVersionId`, so a production run can remain anchored to the exact published blueprint revision active at run start.

### ProviderCredential

Responsibility:
Tenant-scoped provider binding used by a run at execution time.

Core fields:

- `id`
- `workspaceId`
- `providerKind`
- `label`
- `secretRef`
- `status`

### Run

Responsibility:
One production pass through a package-defined station graph.

Core fields:

- `id`
- `workspaceId`
- `packageInstallId`
- `status`
- `currentStationKey`
- `startedAt`
- `completedAt`

### Station

Responsibility:
A bounded workflow unit inside a package graph.

Core fields:

- `key`
- `packageId`
- `title`
- `kind`
- `personaKey`
- `checkpointPolicy`

Note:
`personaKey` should be treated as a specialist-function binding, not a requirement to keep legacy executive titles.

### Deliverable

Responsibility:
Customer-visible artifact emitted by a station.

Core fields:

- `id`
- `workspaceId`
- `runId`
- `stationKey`
- `kind`
- `title`
- `status`

### Approval

Responsibility:
Explicit checkpoint decision row for review-gated actions.

Core fields:

- `id`
- `workspaceId`
- `runId`
- `stationKey`
- `status`
- `requestedAt`
- `resolvedAt`

## Phase Boundaries

### Phase B1

Purpose:
Lock the domain language, entities, and bounded first slice.

Deliverables:

- reboot plan
- domain skeleton
- implementation plan

No code inheritance decisions should be made before this phase is complete.

### Phase B2

Purpose:
Stand up the minimal blueprint-native skeleton in code.

Allowed scope:

- shared domain types
- package registry scaffold
- run state enum
- station definition shape
- tests for the new domain contracts

Forbidden scope:

- live VPS work
- browser harness work
- legacy board-action fixes
- Paperclip runtime reuse beyond reference-only reading

### Phase B3

Purpose:
Implement the first bounded vertical slice.

Recommended slice:
`workspace -> installed blueprint -> production run -> intake station -> founder profile deliverable`

Reason:
It proves the new product shape without yet depending on the entire old orchestration stack.

### Phase B4

Purpose:
Widen the reboot slice by exactly one post-intake analysis station family.

Recommended slice:
`completed intake run -> positioning analysis station -> positioning brief deliverable -> waiting_for_approval`

Reason:
It proves one downstream station can consume the founder profile artifact and emit the next customer-visible deliverable without inheriting the historical harness/runtime, checkpoint-resolution, or assembly backlog.

### Phase B5

Purpose:
Add the first explicit approval/checkpoint row and a bounded resolution seam for the positioning brief.

Recommended slice:
`positioning brief deliverable -> approval request -> approval resolution -> completed run`

Reason:
It proves the reboot domain can represent review-gated work with a native `Approval` entity and a fail-closed completion path, without widening into persistence layers, generic checkpoint engines, rework routing, or assembly-family continuation.

### Phase B6

Purpose:
Add the first bounded `changes_requested` approval outcome for the positioning brief.

Recommended slice:
`positioning approval -> changes requested -> bounded re-entry to positioning`

Reason:
It proves the reboot domain can model a non-happy-path review decision while keeping the work inside the same station family and without widening into generic rework orchestration, persistence layers, or downstream workflow continuation.

### Phase B7

Purpose:
Add the first bounded same-family revision loop for the positioning brief.

Recommended slice:
`changes requested -> revised positioning brief -> fresh approval request`

Reason:
It proves the reboot domain can rework customer-visible output inside the same station family and return it to review without widening into persistence, generic revision engines, or downstream workflow continuation.

### Phase B8

Purpose:
Close the first bounded revised-positioning approval loop.

Recommended slice:
`revised positioning brief -> fresh approval request -> approval resolution -> completed run`

Reason:
It proves the reboot domain can approve the first bounded revision output and terminate the run cleanly without widening into downstream station continuation, extra revision generations, or generic loop engines.

### Phase B9

Purpose:
Define the specialist-function architecture as a bounded domain-layer contract.

Recommended slice:
`specialist roster -> station-family ownership -> deliverable ownership -> bounded approval/handoff expectations`

Reason:
It preserves the business-guidance expertise promised by the blueprint without reintroducing the legacy CEO/CFO/CMO persona shell, widening into persistence, or turning specialist functions into unconstrained prompt personas.

## Later Dedicated Phase

### Specialist Architecture Phase

Purpose:
Define and bind the specialist-function layer that guides the user through business development without reintroducing the older board-first persona model as the product shell.

Expected outputs:

- specialist roster by function
- `personaKey` or equivalent mapping rules
- station-family ownership by specialist function
- deliverable ownership expectations
- approval and handoff expectations between specialist functions

Current B9 implementation seam:

- `StationDefinition` now carries a bounded `familyKey` field so specialist ownership can be derived without a second station-level source of truth.
- The canonical specialist roster is codified in `src/factory/specialists/specialist-registry.ts`.
- Station-family ownership is fail-closed and derived from the specialist registry.
- Deliverable ownership is codified for the currently active reboot slice outputs (`founder_profile`, `positioning_brief`).
- Executable approval/handoff expectations remain intentionally bounded to the currently shipped station families:
  - `intake` -> no approval, handoff target `market`
  - `positioning` -> customer checkpoint, no further specialist handoff in the current slice

Out of scope for the B9 seam:

- persistence or schema changes for specialist metadata
- UI presentation changes
- generalized downstream multi-specialist workflow graphs
- unconstrained specialist prompt routing

Out of scope for this later phase:

- replacing the engine/domain core
- reintroducing legacy card-column orchestration as the canonical workflow model
- turning specialist functions into unconstrained prompt personas

## First Vertical Slice Recommendation

Start with the intake lane, not the pricing-review lane.

Why:

- intake is universally required
- it is native to the factory metaphor
- it creates the founder profile artifact that later stations consume
- it avoids inheriting the older live board unblock/resume baggage

## Seams To Preserve

- tenant isolation
- credential secrecy
- queue idempotency
- audit logging
- provider abstraction

## Seams To Retire

- public board as the primary product model
- card-column progression as the canonical workflow abstraction
- Paperclip-specific run nomenclature
- legacy proof-script-driven product language

## Decision

From this branch forward, the build should start from the `Workspace / Package / Run / Station / Deliverable / Approval` model and only pull older code across when it clearly fits that model.
