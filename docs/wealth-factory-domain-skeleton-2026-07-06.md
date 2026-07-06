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

### PackageInstall

Responsibility:
Record of a package installed into a workspace.

Core fields:

- `id`
- `workspaceId`
- `packageId`
- `installedAt`
- `enabled`

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
