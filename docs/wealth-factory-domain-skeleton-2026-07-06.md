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
The reboot B1-B12 slice now treats `packageId` as the stable package identity seam and keeps `key` as the customer-facing key/slug seam. Phase B13 should make that split explicit everywhere in the reboot blueprint contract and derive the bounded slice `packageVersionId` as `${packageId}@${version}` before any outward widening into archives, publishing, persistence, runtime, or UI.

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
Phase B13 should keep `packageId` as the stable package identity while installs gain an explicit `packageVersionId` seam using `${packageId}@${version}`, so a production run can remain anchored to the exact reboot-slice package version active at run start without widening into publishing APIs, archives, or persistence/schema work.

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

Forward note:
Phase B13 should keep `packageInstallId` as the install reference while making the package-version pin explicit at the run seam via the install's deterministic `packageVersionId` value `${packageId}@${version}`. This phase stays strictly out of runtime execution changes, UI, quality-check personas, and later workflow families.

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

### Phase B10

Purpose:
Bind the current reboot slice to blueprint-style package-declared personas without widening into manifest loading or later workflow families.

Recommended slice:
`package-declared personas -> station persona references -> install-safe validation for intake/positioning`

Reason:
It proves the reboot package seam can carry blueprint-native persona declarations and fail-closed station bindings while staying strictly inside the current intake/positioning slice.

Bounded implementation shape:

- `BlueprintPackageDefinition` declares `personas`
- each persona declares `allowedStationKeys`
- each station declares `personaKey`
- package construction fails closed on undeclared references, duplicate persona keys, and allowlist drift
- current slice keeps a reboot-local compatibility check between `persona.specialistKey` and station-family specialist ownership from B9

Current B10 enforcement seam:

- the active enforcement seam is `createBlueprintPackage(...)` in `src/factory/packages/package-registry.ts`
- it currently fails closed on:
  - duplicate persona keys
  - undeclared `personaKey` references
  - persona `allowedStationKeys` drift
  - station families outside the bounded `intake` / `positioning` slice
  - reboot-local B9 specialist-owner mismatch between `persona.specialistKey` and `station.familyKey`
- this is intentionally a package-construction guardrail, not yet a manifest-loader or persistence-layer guardrail

Residual risk:

- any future code path that constructs `BlueprintPackageDefinition` objects without going through `createBlueprintPackage(...)` could bypass the current fail-closed checks and must add an equivalent validation seam

### Phase B11

Purpose:
Add the first bounded manifest-backed blueprint source for the current reboot slice.

Recommended slice:
`complete bounded manifest -> pure loader -> existing package constructor seam -> intake/positioning tests`

Reason:
It proves the reboot can load blueprint-style declarative package content without widening into package archives, persistence, or engine/runtime execution changes.

Bounded implementation shape:

- introduce a pure loader for a complete-but-bounded current-slice manifest contract
- keep required top-level blueprint manifest sections present, even when many are pass-through in this phase
- route loaded personas and stations through `createBlueprintPackage(...)` so B10 enforcement remains authoritative
- keep the bounded loader limited to the currently shipped `intake` / `positioning` slice

Out of scope for B11:

- zip or directory package loading
- package publishing, install history, or persistence seams
- template rendering, prompt execution, or UI manifest panels
- quality-check personas
- later workflow families beyond `intake` / `positioning`

Out of scope for B10:

- manifest file loading
- persistence or schema changes
- prompt files
- UI/dashboard presentation changes
- worker/runtime execution changes
- quality-check personas or later blueprint families

### Phase B12

Purpose:
Separate stable package identity from immutable package-version identity for the current reboot slice.

Recommended slice:
`packageId -> packageVersionId (${packageId}@${version}) -> package install pin -> run pin`

Reason:
It proves the reboot domain can name a stable package separately from the exact immutable version consumed by installs and runs, without widening into package archives, publishing APIs, persistence/schema work, runtime execution, UI, quality-check personas, or later workflow families.

Bounded implementation shape:

- keep `packageId` as the current reboot slice's stable package identity seam, while explicitly deferring any later package-id-vs-package-key publishing/persistence split
- introduce deterministic `packageVersionId` as `${packageId}@${version}`
- bind the current slice version seam only at domain/package/install/run boundaries
- require installs and runs in the current slice to describe their exact package-version pin using that deterministic seam
- keep manifest loading, package construction, and current intake/positioning slice assumptions compatible with the bounded B12 identity split

Out of scope for B12:

- package archives or zip/directory loading changes
- publishing APIs or package release workflow changes
- persistence or schema changes
- runtime or worker execution changes
- UI/dashboard presentation changes
- quality-check personas
- later workflow families beyond `intake` / `positioning`

### Phase B13

Purpose:
Make stable `packageId` explicit on the reboot blueprint contract before moving outward.

Recommended slice:
`explicit packageId -> separate package key/slug -> packageVersionId (${packageId}@${version}) -> install/run/approval pin continuity`

Reason:
It closes the remaining identity ambiguity in the reboot slice before any archive, publishing, persistence, runtime, or UI widening can lock the wrong seam in place.

Bounded implementation shape:

- expose `packageId` explicitly on the reboot blueprint/package contract
- keep `key` as the customer/package slug seam only
- derive deterministic `packageVersionId` as `${packageId}@${version}`
- require installs, runs, and approvals in the current slice to pin the explicit stable identity and deterministic version identity together
- prove the split with focused tests where slug/title can change without changing package identity

Out of scope for B13:

- package archives or zip/directory loading changes
- publishing APIs or package release workflow changes
- persistence or schema changes
- runtime or worker execution changes
- UI/dashboard presentation changes
- quality-check personas
- later workflow families beyond `intake` / `positioning`

### Phase B14

Purpose:
Add the bounded package content-hash/source seam required by blueprint Ticket 07 before moving to catalog or install lifecycle work.

Recommended slice:
`validated manifest -> deterministic package content hash -> package source metadata -> minimal read-only .twfpkg archive load`

Reason:
It completes the current package-identity foundation by proving the platform can name the exact validated package content it loaded, including stable hashes across archive repacking, without introducing operator publishing or tenant lifecycle behavior too early.

Bounded implementation shape:

- compute deterministic `sha256:` content hashes from sorted package entry paths and canonicalized JSON content
- attach package source metadata to manifest/archive-loaded `BlueprintPackageDefinition` values
- add a minimal read-only `.twfpkg` zip load path that extracts root `manifest.json` and routes through the existing manifest/package constructor guardrails
- prove hash stability across repacking with identical content and hash changes when package content changes

Out of scope for B14:

- operator catalog endpoints
- package publishing, deprecation, yanking, or archive storage
- tenant install/update/rollback/disable/uninstall lifecycle changes
- persistence or schema changes
- runtime or worker execution changes
- UI/dashboard presentation changes
- quality-check personas
- later workflow families beyond `intake` / `positioning`

### Phase B15

Purpose:
Start the operator catalog/publishing ticket without prematurely adopting its API, database, storage, or operator-console layers.

Recommended slice:
`validated .twfpkg -> immutable published package-version record -> duplicate-version rejection -> audit intent`

Reason:
Package identity and content provenance are now established. This adds the narrow publication contract that later persistence and operator delivery layers will adopt, while keeping their infrastructure explicitly deferred.

Bounded implementation shape:

- validate an uploaded archive only through the existing archive manifest loader
- publish a record anchored to `packageId`, `version`, `packageVersionId`, and source content hash
- reject any second publish of the same `packageId@version`, regardless of content
- produce a pure audit-intent object rather than calling the current tenant-shaped audit sink

Out of scope for B15:

- HTTP/API routes, operator middleware, or authorization
- database schema, persistence, or storage/archive retention
- deprecation or yanking actions
- tenant install/update/rollback/disable/uninstall lifecycle changes
- runtime/worker execution changes
- UI/dashboard presentation changes
- legacy package catalog reuse

### Phase B16

Purpose:
Finish the catalog lifecycle portion of Ticket 08 while preserving the distinction between immutable package content/version records and catalog visibility.

Recommended slice:
`published lifecycle -> deprecated lifecycle -> yanked lifecycle, each with audit intent`

Bounded implementation shape:

- retain the B15 published package-version record as immutable identity/content data
- create a separate immutable catalog lifecycle projection keyed by `packageVersionId` and source content hash
- allow only `published -> deprecated`, `published -> yanked`, and `deprecated -> yanked`
- reject repeated, backward, and restore transitions
- return pure audit intent for deprecate and yank actions

Out of scope for B16:

- HTTP/API routes, operator middleware, and authorization
- database schema, persistence, storage, and archive retention
- restore/un-yank behavior
- tenant installation/update lifecycle changes
- runtime/worker execution changes
- UI/dashboard presentation changes
- legacy package catalog reuse

### Phase B17

Purpose:
Add the first durable database contract for the new blueprint catalog without attaching it to the legacy tenant package lane.

Recommended slice:
`operator-owned package tables -> immutable package/version content -> forward-only lifecycle constraints`

Bounded implementation shape:

- add `wfpc.factory_blueprint_packages` and `wfpc.factory_blueprint_package_versions`
- keep package and package-version identity, manifest, content hash, and publication provenance immutable
- persist only the `published`, `deprecated`, and `yanked` catalog states
- enforce lifecycle actor/timestamp completeness, chronology, and forward-only transitions in SQL
- keep version history from being deleted through a package-row cascade

Out of scope for B17:

- reuse of `wfpc.wealth_factory_packages` or any legacy catalog table
- live migration-helper wiring or VPS application
- API routes, operator authentication, RLS, or audit persistence
- archive-byte storage and tenant install lifecycle
- runtime/worker execution changes
- UI/dashboard presentation changes

### Phase B18

Purpose:
Start the tenant-facing package install lifecycle from blueprint Ticket 09 without attaching it to API, persistence, payments, or UI surfaces yet.

Recommended slice:
`manifest permissions -> install snapshot -> bounded lifecycle transition -> audit intent`

Bounded implementation shape:

- carry normalized manifest permissions and budgets on the blueprint package definition
- deep-copy package permission and budget snapshots when a workspace installs a package
- model the pure lifecycle transitions `enabled -> disabled -> enabled`, update, rollback, and uninstall
- block updates that widen tools, external actions, or budgets unless explicit consent is provided
- return audit intents for lifecycle transitions so durable audit wiring can be added later without reverse engineering the domain contract

Out of scope for B18:

- tenant install database tables or repository wiring
- HTTP routes, RBAC middleware, entitlement checks, Stripe, or operator/customer UI
- durable audit persistence
- package archive storage, catalog mutation, or catalog lifecycle changes
- runtime/worker execution changes
- expanding beyond the current intake/positioning reboot slice

### Phase B19

Purpose:
Add the first durable tenant package install storage contract for blueprint Ticket 09 without routing through the legacy package install lane.

Recommended slice:
`B17 catalog version -> tenant install projection -> lifecycle event log -> tenant read RLS`

Bounded implementation shape:

- add `wfpc.factory_blueprint_package_installs` anchored to `wfpc.factory_blueprint_package_versions`
- persist the B18 lifecycle projection fields, including install status, permission snapshot, permission diff, and lifecycle timestamps
- add `wfpc.factory_blueprint_package_install_events` for durable install/update/rollback/disable/enable/uninstall audit events
- allow tenant members to read their install and event records through RLS
- keep uninstall non-destructive: deliverables are never deleted by uninstall

Out of scope for B19:

- reusing or mutating `wfpc.tenant_package_installs` or `wfpc.wealth_factory_packages`
- HTTP routes, owner/admin write enforcement, entitlement checks, Stripe, or UI
- repository/service wiring or dual-writes from the B18 pure lifecycle helpers
- package archive storage, catalog mutation, or catalog lifecycle changes
- runtime/worker execution changes
- expanding beyond the current intake/positioning reboot slice

### Phase B20

Purpose:
Add the first repository boundary for persisting blueprint-native package install lifecycle state without introducing tenant endpoints or legacy package install storage.

Recommended slice:
`B18 install transition -> B19-shaped repository port -> in-memory adapter proof`

Bounded implementation shape:

- define a `FactoryPackageInstallRepository` port for saving a `PackageInstall` with its paired `PackageInstallAuditIntent`
- map domain install fields to the B19 install row shape
- map audit intents to B19 lifecycle event rows with deterministic event IDs
- enforce tenant-scoped reads and install/audit identity matching at the adapter boundary
- preserve deep-copied permission snapshots and diffs on reads

Out of scope for B20:

- claiming Ticket 09 endpoint acceptance is complete
- HTTP routes, owner/admin RBAC enforcement, entitlement checks, Stripe, or UI
- Supabase client wiring or live database application
- reusing or mutating `wfpc.tenant_package_installs` or `wfpc.wealth_factory_packages`
- runtime/worker execution changes
- expanding beyond the current intake/positioning reboot slice

### Phase B21

Purpose:
Add the first tenant package install application-service boundary for Ticket 09 while keeping it install-only.

Recommended slice:
`owner/admin actor -> entitlement check -> B18 install transition -> B20 repository save`

Bounded implementation shape:

- define a narrow actor shape for owner/admin/member install authorization
- define an `Entitlements.canInstall(...)` interface with a dev allow-all implementation for later Stripe replacement
- fail closed when the requested package key does not match the resolved blueprint package
- compose `installBlueprintPackage(...)`, `createPackageInstalledAuditIntent(...)`, and `FactoryPackageInstallRepository.saveLifecycleEvent(...)`
- keep successful installs persisted with one paired `package_installed` lifecycle event

Out of scope for B21:

- completing Ticket 09 endpoint/RBAC acceptance
- HTTP routes, middleware/session role mapping, Supabase adapters, Stripe, or UI
- update, rollback, disable, enable, or uninstall application methods
- reusing or mutating `wfpc.tenant_package_installs` or `wfpc.wealth_factory_packages`
- runtime/worker execution changes
- expanding beyond the current intake/positioning reboot slice

### Phase B22

Purpose:
Add the first non-install tenant package lifecycle application-service boundary for Ticket 09 while keeping the slice limited to disable/enable.

Recommended slice:
`owner/admin actor -> tenant-scoped install lookup -> B18 disable/enable transition -> B20 repository save`

Bounded implementation shape:

- reuse the B21 actor shape for owner/admin/member lifecycle authorization
- tenant-scope package install lookup through the B20 repository before any lifecycle transition
- hydrate the repository row back into the B18 `PackageInstall` domain contract without losing timestamps, version pointers, permission snapshots, or permission diffs
- call the existing B18 `disableBlueprintPackageInstall` and `enableBlueprintPackageInstall` helpers instead of hand-building status or audit payloads
- persist the transition through the B20 `saveLifecycleEvent(...)` contract so install state and audit event remain coupled
- fail closed for cross-tenant install ids, member actors, and uninstalled installs

Out of scope for B22:

- completing Ticket 09 endpoint/RBAC acceptance
- HTTP routes, middleware/session role mapping, Supabase adapters, Stripe, or UI
- update, rollback, uninstall, or permission-widening consent application methods
- in-flight run pause/resume worker semantics beyond the install status transition
- reusing or mutating `wfpc.tenant_package_installs` or `wfpc.wealth_factory_packages`
- runtime/worker execution changes
- expanding beyond the current intake/positioning reboot slice

### Phase B23

Purpose:
Add the update tenant package lifecycle application-service boundary for Ticket 09 while keeping rollback, uninstall, routes, and runtime behavior deferred.

Recommended slice:
`owner/admin actor -> package-key check -> tenant-scoped install lookup -> B18 update transition -> B20 repository save`

Bounded implementation shape:

- reuse the B21/B22 actor shape for owner/admin/member lifecycle authorization
- fail closed when the requested package key does not match the resolved blueprint package key
- tenant-scope package install lookup through the B20 repository before applying an update
- block updates unless the current install is enabled, so update does not implicitly re-enable disabled installs
- block same-version updates, so no-op updates do not emit lifecycle audit noise
- call the existing B18 `updateBlueprintPackageInstall` helper so permission diffs and consent enforcement stay centralized
- persist the transition through the B20 `saveLifecycleEvent(...)` contract so install state and audit event remain coupled
- return the updated install with `permissionDiff` for later API/UI consent-display layers

Out of scope for B23:

- completing Ticket 09 endpoint/RBAC acceptance
- HTTP routes, middleware/session role mapping, Supabase adapters, Stripe, or UI
- rollback or uninstall application methods
- entitlement checks beyond the install-only B21 seam
- in-flight run version pinning or runtime worker behavior
- reusing or mutating `wfpc.tenant_package_installs` or `wfpc.wealth_factory_packages`
- expanding beyond the current intake/positioning reboot slice

### Phase B24

Purpose:
Add the rollback tenant package lifecycle application-service boundary for Ticket 09 while keeping uninstall, routes, runtime behavior, and full rollback consent acceptance deferred.

Recommended slice:
`owner/admin actor -> package-key check -> tenant-scoped install lookup -> B18 rollback transition -> B20 repository save`

Bounded implementation shape:

- reuse the B21-B23 actor shape for owner/admin/member lifecycle authorization
- fail closed when the requested package key does not match the resolved rollback blueprint package key
- tenant-scope package install lookup through the B20 repository before applying rollback
- block rollback unless the current install is enabled, so rollback does not implicitly re-enable disabled installs
- call the existing B18 `rollbackBlueprintPackageInstall` helper so package identity, previous-version validation, snapshot replacement, and audit intent stay centralized
- persist the transition through the B20 `saveLifecycleEvent(...)` contract so install state and audit event remain coupled
- preserve the original package-version snapshot when rolling back

Out of scope for B24:

- completing Ticket 09 endpoint/RBAC acceptance
- HTTP routes, middleware/session role mapping, Supabase adapters, Stripe, or UI
- uninstall application methods
- rollback permission-widening consent beyond the existing B18 helper behavior
- runtime deliverable version marking or run version-pinning behavior
- reusing or mutating `wfpc.tenant_package_installs` or `wfpc.wealth_factory_packages`
- expanding beyond the current intake/positioning reboot slice

### Phase B25

Purpose:
Add the uninstall tenant package lifecycle application-service boundary for Ticket 09 while keeping routes, runtime run cancellation, destructive data deletion, and payment/refund behavior deferred.

Recommended slice:
`owner/admin actor -> tenant-scoped install lookup -> package identity check -> exact typed confirmation -> B18 uninstall transition -> B20 repository save`

Bounded implementation shape:

- reuse the B21-B24 actor shape for owner/admin/member lifecycle authorization
- tenant-scope package install lookup through the B20 repository before applying uninstall
- fail closed when the requested package identity does not match the persisted install package identity
- require exact typed confirmation shaped as `UNINSTALL <packageKey>` derived from the persisted package identity before emitting the uninstall lifecycle event
- call the existing B18 `uninstallBlueprintPackageInstall` helper so uninstall status, disabled state, timestamping, and audit intent stay centralized
- persist the transition through the B20 `saveLifecycleEvent(...)` contract so install state and audit event remain coupled
- allow disabled installs to uninstall without implicitly re-enabling them
- preserve the blueprint non-destructive uninstall rule: deliverables and Launch Kit outputs are never deleted by uninstall

Out of scope for B25:

- completing Ticket 09 endpoint/RBAC acceptance
- HTTP routes, middleware/session role mapping, Supabase adapters, Stripe, refund handling, or UI
- runtime run cancellation, run queue draining, or worker behavior
- deliverable deletion, Launch Kit deletion, or separate delete-data actions
- entitlement revocation or billing lifecycle side effects
- reusing or mutating `wfpc.tenant_package_installs` or `wfpc.wealth_factory_packages`
- expanding beyond the current intake/positioning reboot slice

### Phase B26

Purpose:
Close the bounded Ticket 09 tenant endpoint acceptance seam after the B18-B25 lifecycle/application slices.

Recommended slice:
`authenticated tenant request -> owner/admin application API -> lifecycle action -> guarded HTTP response`

Bounded implementation shape:

- add a tenant package install API facade that authenticates the actor, resolves the tenant install role, loads/re-validates the requested blueprint package version, and delegates to the B21-B25 application-service lifecycle actions
- expose the accepted Ticket 09 action routes through a guarded HTTP handler:
  - `POST /api/factory/package-installs`
  - `POST /api/factory/package-installs/:installId/disable`
  - `POST /api/factory/package-installs/:installId/enable`
  - `POST /api/factory/package-installs/:installId/update`
  - `POST /api/factory/package-installs/:installId/rollback`
  - `POST /api/factory/package-installs/:installId/uninstall`
- map widened-permission updates to a `permission_widening_requires_consent` response that preserves the permission diff for later UI/operator display
- preserve the non-destructive uninstall contract by returning `deliverablesDeleted: false` and `launchKitDeleted: false`
- prove owner/admin access, member rejection, unauthenticated rejection, entitlement rejection, lifecycle statuses, audit event ordering, CORS/request guards, malformed payload handling, and permission-widening consent behavior with focused tests

Out of scope for B26:

- Supabase/Postgres repository adapters or live runtime dependency wiring
- customer UI for the lifecycle actions
- Stripe/refund behavior, entitlement revocation, or billing lifecycle side effects
- runtime pause/cancel workers, queue draining, or in-flight run behavior
- deliverable deletion, Launch Kit deletion, or separate delete-data actions
- reusing or mutating `wfpc.tenant_package_installs` or `wfpc.wealth_factory_packages`
- expanding beyond the current intake/positioning reboot slice

### Phase B27: Ticket 10 Power Source credential seam

Phase B27 starts Ticket 10 by adding the first blueprint-native credential boundary for Power Sources.

What changed:

- added a factory credential vault using AES-256-GCM envelope encryption
- generated a per-credential data key and wrapped it with a versioned 32-byte base64 master key
- added masked Power Source credential create/list/delete service behavior
- added a worker-bound decrypt seam that requires a purpose and writes a credential access audit intent
- proved ciphertext-only storage, wrong-key failure, tamper detection, and key re-wrap without changing credential ciphertext

Out of scope for B27:

- provider adapters or provider capability registry work from Ticket 11
- credential validation scheduling or status lifecycle work from Ticket 12
- HTTP routes, UI, OAuth, Supabase/Postgres adapters, live runtime wiring, or worker execution integration
- reuse or mutation of the legacy provider credential endpoints as the new factory source of truth
- expanding beyond the current intake/positioning reboot slice

### Phase B28: Ticket 10 credential API and HTTP seam

Phase B28 completes the bounded Ticket 10 tenant API/HTTP acceptance seam for Power Source credential CRUD.

What changed:

- added an authenticated factory credential API for owner/admin create, masked list, and soft delete
- added guarded HTTP routes for `POST /api/factory/credentials`, `GET /api/factory/credentials`, and `DELETE /api/factory/credentials/:credentialId`
- preserved the B27 service/vault boundary so API responses never return plaintext or encrypted material
- mapped unauthenticated, forbidden, invalid provider, blank label, empty secret, malformed credential id, and missing credential cases to tenant-safe errors
- proved invalid origins, request guards, rate-limit path, malformed payloads, and malformed route decoding fail closed

Out of scope for B28:

- decrypt endpoints or browser access to plaintext credential material
- provider validation, status lifecycle, validation queues, or weekly revalidation from Ticket 12
- provider adapters or capability registry behavior from Ticket 11
- Supabase/Postgres adapters, live runtime wiring, worker queue integration, UI, OAuth, rotation, restore, or package-scoped credential semantics

### Phase B29: Ticket 11 provider registry and adapter contract seam

Phase B29 starts Ticket 11 by adding the first blueprint-native provider abstraction without wiring it into credential validation or runtime execution.

What changed:

- added a shared `LLMProvider` interface for the blueprint provider keys: `anthropic`, `openai`, `openrouter`, `google`, and `xai`
- added a static versioned provider capability registry with model id, context window, structured-output support, tool-use support, cost rates, and tier
- added a pure requirement matcher for package capability requirements to eligible provider/model pairs
- added pure cost estimation from registry rates
- added an explicit Power Source credential-kind mapping layer so `gemini_api` maps to the blueprint `google` provider key
- added injected adapter shells for all five provider keys so validation/completion response normalization can compile without live HTTP calls

Out of scope for B29:

- credential validation jobs, async status updates, weekly revalidation, or invalidation hooks from Ticket 12
- worker decrypt/injection, run execution, queue wiring, rate limiting, retries, usage-event persistence, or budget enforcement
- live provider smoke calls, real HTTP fixtures, customer UI, Supabase/Postgres adapters, OAuth, or fallback/shared operator provider behavior
- mutation of B27/B28 credential API/service contracts or any browser/API path that returns plaintext credential material

### Phase B30: Ticket 11 completion adapter mapper seam

Phase B30 continues Ticket 11 by making the shared `LLMProvider.complete(...)` contract executable against injected mocked HTTP clients, without live provider calls or runtime wiring.

What changed:

- added provider-native completion request mappers for OpenAI, Anthropic, OpenRouter, Google, and xAI
- mapped shared system prompts, ordered messages, tool definitions, tool-result turns, and JSON-schema response formats into provider-specific request shapes
- normalized mocked provider success responses into the shared `CompletionResult` shape with text, request id, token usage, and registry-derived cost
- normalized completion error statuses into tenant-safe provider messages without leaking raw provider bodies or submitted secrets
- preserved the B29 registry, cost estimation, provider-key mapping, and injected HTTP client boundary

Out of scope for B30:

- credential validation queues, async credential statuses, weekly revalidation, or invalidation hooks from Ticket 12
- worker-only credential decrypt/injection, run execution, queue wiring, retries, rate limiting, usage ledger writes, budget enforcement, Redis, or database imports
- live provider smoke scripts or real provider calls
- customer UI, Supabase/Postgres adapters, OAuth, fallback/shared operator provider behavior, or mutation of B27/B28 credential API/service contracts

### Phase B31: Ticket 12 credential validation lifecycle seam

Phase B31 starts Ticket 12 with the smallest in-process validation lifecycle that can later be wired to a real worker queue.

What changed:

- added credential validation status fields to encrypted Power Source credentials and masked credential DTOs: `pending`, `valid`, or `invalid`, plus a tenant-safe validation message and `lastValidatedAt`
- changed credential creation to return immediately as `pending` and enqueue a validation job without returning plaintext
- added a validation job repository seam to the in-memory credential repository
- added a credential validation service that claims the next queued job, decrypts through the existing vault boundary, maps the Power Source provider kind to the Ticket 11 provider adapter, calls `validateCredential`, and projects a sanitized valid/invalid status
- added weekly revalidation eligibility for active valid credentials whose last validation is at least seven days old
- added an auth-failure invalidation helper for later run-execution integration

Out of scope for B31:

- BullMQ, Redis, worker boot/shutdown, repeatable-job registration, or `apps/worker` integration
- Supabase/Postgres adapters or schema migration for validation jobs/status fields
- live provider validation calls, OAuth flows, customer UI, runtime run pausing/resume behavior, retries/backoff, usage ledger writes, or budget accounting

### Phase B31a Addendum: Queue Namespace Isolation

B31a adds a blueprint-only guardrail before any B32 worker queue wiring:

- canonical factory queue prefix: `wealth-factory-blueprint-v1`
- credential validation queue name: `wealth-factory-validations-v1`
- reserved runtime queue name: `wealth-factory-runs-v1`
- legacy `wfpc-*` and Paperclip-shaped queue names or Redis key prefixes are rejected before a BullMQ queue can be constructed

This addendum intentionally does not create queues, inspect Redis, delete historical jobs, boot workers, or migrate live queue state. Its job is to prevent future blueprint wiring from silently inheriting the older Paperclip queue namespace.

### Phase B32: Credential Validation Queue Port

Phase B32 adds the first blueprint-native queue seam for Ticket 12 without introducing a live queue client.

What changed:

- added a `FactoryCredentialValidationQueue` port for enqueue, claim, complete, and open-job duplicate checks
- added a repository-backed adapter that keeps the B31 validation job repository as the source of truth
- enforced the B31a Wealth Factory queue namespace before the adapter can be constructed
- routed create-time credential validation jobs through the queue port
- routed validation processing, completion, and weekly revalidation duplicate checks through the same queue port

The queue port also owns the failure boundary: credential creation persists the encrypted credential before enqueueing and removes it if enqueueing fails; retryable provider outcomes are requeued as open jobs rather than terminally completed. Repository implementations must provide an atomic queued-to-processing claim so a durable adapter cannot double-claim work.

### Phase B33: BullMQ Transport Adapter

Phase B33 adds the first real transport adapter behind the B32 queue port. It publishes tenant-safe validation job references to the isolated `wealth-factory-validations-v1` BullMQ queue using the `wealth-factory-blueprint-v1` prefix, while the repository remains authoritative for enqueue, claim, completion, requeue, and duplicate suppression state.

### Phase B34: Controlled BullMQ Consumer Shell

Phase B34 adds a factory-local BullMQ consumer shell behind the B33 transport. It consumes the exact `{ jobId }` payload, preserves the guarded factory queue namespace, and exposes controlled lifecycle and job-event seams for a future worker path. It does not claim repository work itself and does not wire worker boot/runtime, scheduling, retry/backoff policy, persistence, API/UI, provider execution, or legacy queues.

### Phase B35: Exact Credential Validation Job Processing

Phase B35 adds the exact repository and service path needed by the B33/B34 credential-validation transport contract. A validation payload shaped as `{ jobId }` can now claim and process only the matching queued repository job through `claimById` and `processValidationJob({ jobId })`.

The repository remains the source of truth. The BullMQ adapter delegates exact claims to the repository-backed queue and leaves transport state unchanged during the claim. The validation service shares its post-claim behavior across next-job and exact-job processing and returns the updated persisted credential projection after successful validation or auth-failure invalidation.

This phase does not compose the consumer into a worker, boot runtime processing, add scheduler or retry/backoff policy, add Supabase/Postgres adapters, expose API/UI surfaces, call live providers, touch the VPS, or access legacy queues.

### Historical B32/B33 Transport Notes

The following notes remain attached to the credential-validation queue and transport foundation, not to the B36 gate.

The repository contract performs the open-job check and insert atomically, and the transport adapter removes that repository job when publishing fails or a duplicate error cannot be verified as observable. This keeps transport failure recoverable without making Redis the source of truth.

The adapter exposes explicit resource cleanup but does not start a worker, register repeatable jobs, define retry/backoff policy, add Supabase/Postgres persistence, wire runtime/API/UI surfaces, or alter legacy Paperclip queues.

Out of scope for B32:

- BullMQ or Redis client construction
- worker boot/shutdown, repeatable weekly job registration, or queue retry/backoff policy
- Supabase/Postgres adapters or live database migration
- live provider validation calls, OAuth, customer UI, runtime run pausing/resume behavior, usage ledger writes, or budget accounting

### Phase B36: Foundation Ticket Reconciliation Gate

Phase B36 must run before Ticket 13. The reboot track has advanced B1-B35 against the new blueprint-native model, but master-blueprint Tickets 01-06 were not independently audited in this branch. Ticket 13 must not introduce the run and deliverable data model on top of an inherited legacy foundation unless that foundation is explicitly accepted as blueprint-compatible.

B36 reconciles:

- Ticket 01 scaffold/workspace shape
- Ticket 02 core schema and tenant-owned table conventions
- Ticket 03 auth/session model
- Ticket 04 tenant context and RLS expectations
- Ticket 05 RBAC roles and permission checks
- Ticket 06 append-only audit event contract

Each item should end with one of three outcomes: accept current foundation, adapt current foundation with bounded changes, or replace before Ticket 13.

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
