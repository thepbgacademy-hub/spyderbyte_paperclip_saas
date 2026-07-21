# Wealth Factory Blueprint Reboot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reset the active build direction onto the factory-style blueprint with a new domain skeleton and a first blueprint-native vertical slice.

**Architecture:** Keep the existing repository and reuse only the safe infrastructure lessons, but treat the old Paperclip-shaped product model as reference-only. Build forward from a clean domain core centered on workspace, package, run, station, deliverable, and approval primitives.

**Tech Stack:** TypeScript, Vitest, existing repo workspace, GitNexus preflight, Markdown planning docs.

> **Implementation note:** The Task 3 and Task 4 code snippets below are intentionally minimal seed examples. The shipped reboot slice is allowed to be stricter than these examples as long as it stays inside the B1/B2/B3 boundaries from the domain skeleton doc.

---

### Task 1: Lock the reboot source of truth

**Files:**
- Create: `docs/wealth-factory-reboot-plan-2026-07-06.md`
- Modify: `TODO.md`
- Modify: `HANDOFF.md`

- [ ] **Step 1: Verify the repo is on the reboot branch**

Run: `git branch --show-current`
Expected: `codex/wealth-factory-blueprint`

- [ ] **Step 2: Verify GitNexus is fresh before planning**

Run: `$env:GITNEXUS_HOME='E:\\GitNexusHome'; npx gitnexus status`
Expected: `Status: up-to-date`

- [ ] **Step 3: Create the reboot plan document**

Write a doc that states:

```md
# Wealth Factory Reboot Plan

Date: 2026-07-06
Branch: `codex/wealth-factory-blueprint`
Blueprint source: `E:\REPOS 2\wealth_clip\THE_WEALTH_FACTORY_MASTER_BLUEPRINT.md`
```

And include:

- blueprint is the new source of truth
- older runtime and deployment work is reference-only
- GitNexus baseline for the reboot branch
- immediate phases B0, B1, and B2

- [ ] **Step 4: Update `TODO.md` with the reboot track**

Add:

```md
## Active Reboot Track

- [x] Create reboot branch `codex/wealth-factory-blueprint`.
- [x] Rebuild GitNexus on the reboot branch for a clean seam/blast-radius baseline.
- [x] Add reboot plan doc that makes the blueprint the new source of truth.
- [ ] Phase B1: Define the blueprint-native factory domain skeleton and phase boundaries.
- [ ] Phase B2: Stand up the new implementation foundation for workspace/package/run/station/deliverable primitives.
- [ ] Phase B3: Select and implement the first bounded blueprint-native vertical slice end to end.
```

- [ ] **Step 5: Update `HANDOFF.md` to point at the reboot plan**

Add:

```md
## Reboot Override

For the reboot branch `codex/wealth-factory-blueprint`, the active planning entrypoint is:

- `docs/wealth-factory-reboot-plan-2026-07-06.md`
```

- [ ] **Step 6: Verify only the expected planning files changed**

Run: `$env:GITNEXUS_HOME='E:\\GitNexusHome'; npx gitnexus detect-changes --repo spyderbyte_paperclip_saas --scope all`
Expected: low-risk docs-only or planning-only change map

- [ ] **Step 7: Commit the reboot foundation**

```bash
git add HANDOFF.md TODO.md docs/wealth-factory-reboot-plan-2026-07-06.md
git commit -m "docs: anchor wealth factory reboot plan"
```

### Task 2: Define the blueprint-native domain skeleton

**Files:**
- Create: `docs/wealth-factory-domain-skeleton-2026-07-06.md`
- Modify: `TODO.md`

- [ ] **Step 1: Write the domain skeleton doc**

The document must define these internal canonical entities:

```md
- Workspace
- Package
- PackageInstall
- ProviderCredential
- Run
- Station
- Deliverable
- Approval
```

And it must distinguish them from customer-facing labels:

```md
- Blueprint
- Expansion
- Production Run
- Specialist
- Checkpoint
- Launch Kit
- Power Source
```

- [ ] **Step 2: Record explicit phase boundaries**

The domain doc must include:

```md
### Phase B1
### Phase B2
### Phase B3
```

With:

- B1 = language and boundaries only
- B2 = minimal code skeleton
- B3 = first vertical slice

- [ ] **Step 3: Choose the first bounded slice**

The domain doc must recommend:

```md
workspace -> installed blueprint -> production run -> intake station -> founder profile deliverable
```

And explain why intake is the correct first slice.

- [ ] **Step 4: Mark Phase B1 complete in `TODO.md`**

Update:

```md
- [x] Phase B1: Define the blueprint-native factory domain skeleton and phase boundaries.
```

- [ ] **Step 5: Verify the new domain doc is plain ASCII and readable**

Run: `Get-Content docs\\wealth-factory-domain-skeleton-2026-07-06.md`
Expected: no mojibake, no missing headings

- [ ] **Step 6: Commit the domain skeleton**

```bash
git add TODO.md docs/wealth-factory-domain-skeleton-2026-07-06.md
git commit -m "docs: define wealth factory domain skeleton"
```

### Task 3: Prepare the first implementation foundation

**Files:**
- Create: `src/factory/domain/types.ts`
- Create: `src/factory/domain/run-status.ts`
- Create: `src/factory/packages/package-registry.ts`
- Create: `tests/factory-domain-types.test.ts`
- Create: `tests/factory-package-registry.test.ts`

- [ ] **Step 1: Write the failing domain type test**

Create:

```ts
import { describe, expect, it } from "vitest";
import { createBlueprintPackage, isStationKindAllowed } from "../src/factory/packages/package-registry";

describe("factory package registry", () => {
  it("builds a blueprint-native package definition", () => {
    const pkg = createBlueprintPackage({
      key: "connect-first",
      title: "Connect First Operating System",
      stations: [
        { key: "intake", kind: "structured_interview", title: "Intake Station" },
      ],
    });

    expect(pkg.kind).toBe("blueprint");
    expect(pkg.stations[0]?.key).toBe("intake");
  });

  it("allows only declared station kinds", () => {
    expect(isStationKindAllowed("structured_interview")).toBe(true);
    expect(isStationKindAllowed("legacy_board_unblock")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npx vitest run tests/factory-package-registry.test.ts`
Expected: FAIL because the new domain files do not exist yet

- [ ] **Step 3: Add the minimal domain types**

Create:

```ts
export type PackageKind = "blueprint" | "expansion";

export type RunStatus =
  | "draft"
  | "ready"
  | "running"
  | "waiting_for_input"
  | "waiting_for_approval"
  | "completed"
  | "failed";

export type StationKind =
  | "structured_interview"
  | "analysis"
  | "checkpoint"
  | "assembly";

export interface StationDefinition {
  key: string;
  title: string;
  kind: StationKind;
}

export interface BlueprintPackageDefinition {
  key: string;
  title: string;
  kind: "blueprint";
  stations: StationDefinition[];
}
```

- [ ] **Step 4: Add the minimal package registry**

Create:

```ts
import type {
  BlueprintPackageDefinition,
  StationDefinition,
  StationKind,
} from "../domain/types";

const allowedStationKinds: ReadonlySet<StationKind> = new Set([
  "structured_interview",
  "analysis",
  "checkpoint",
  "assembly",
]);

export function isStationKindAllowed(kind: string): kind is StationKind {
  return allowedStationKinds.has(kind as StationKind);
}

export function createBlueprintPackage(input: {
  key: string;
  title: string;
  stations: StationDefinition[];
}): BlueprintPackageDefinition {
  return {
    key: input.key,
    title: input.title,
    kind: "blueprint",
    stations: input.stations,
  };
}
```

- [ ] **Step 5: Re-run the focused tests**

Run: `npx vitest run tests/factory-package-registry.test.ts tests/factory-domain-types.test.ts`
Expected: PASS

- [ ] **Step 6: Run the broader quality gate**

Run: `npm run build && npm run test`
Expected: PASS

- [ ] **Step 7: Commit the new implementation foundation**

```bash
git add src/factory/domain/types.ts src/factory/domain/run-status.ts src/factory/packages/package-registry.ts tests/factory-domain-types.test.ts tests/factory-package-registry.test.ts
git commit -m "feat: add wealth factory domain foundation"
```

### Task 4: Start the first vertical slice

**Files:**
- Create: `src/factory/runs/intake-run-service.ts`
- Create: `tests/factory-intake-run-service.test.ts`

- [ ] **Step 1: Write the failing intake slice test**

Create:

```ts
import { describe, expect, it } from "vitest";
import { startIntakeRun } from "../src/factory/runs/intake-run-service";

describe("startIntakeRun", () => {
  it("creates a run positioned at the intake station", () => {
    const run = startIntakeRun({
      workspaceId: "ws_123",
      packageId: "connect-first",
    });

    expect(run.status).toBe("waiting_for_input");
    expect(run.currentStationKey).toBe("intake");
    expect(run.packageId).toBe("connect-first");
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npx vitest run tests/factory-intake-run-service.test.ts`
Expected: FAIL because `startIntakeRun` does not exist yet

- [ ] **Step 3: Implement the minimal intake run service**

Create:

```ts
import type { RunStatus } from "../domain/types";

export interface IntakeRun {
  id: string;
  workspaceId: string;
  packageId: string;
  currentStationKey: string;
  status: RunStatus;
}

export function startIntakeRun(input: {
  workspaceId: string;
  packageId: string;
}): IntakeRun {
  return {
    id: "run_intake_seed",
    workspaceId: input.workspaceId,
    packageId: input.packageId,
    currentStationKey: "intake",
    status: "waiting_for_input",
  };
}
```

- [ ] **Step 4: Re-run the intake slice test**

Run: `npx vitest run tests/factory-intake-run-service.test.ts`
Expected: PASS

- [ ] **Step 5: Mark Phase B2 complete and Phase B3 in progress in `TODO.md`**

Update:

```md
- [x] Phase B2: Stand up the new implementation foundation for workspace/package/run/station/deliverable primitives.
- [ ] Phase B3: Select and implement the first bounded blueprint-native vertical slice end to end.
```

- [ ] **Step 6: Commit the first vertical slice seed**

```bash
git add TODO.md src/factory/runs/intake-run-service.ts tests/factory-intake-run-service.test.ts
git commit -m "feat: seed intake run slice"
```

## Self-Review

- Spec coverage: this plan covers the reboot anchor, domain skeleton, implementation foundation, and first bounded intake slice.
- Placeholder scan: no `TBD`, `TODO`, or vague implementation notes are left in the task steps.
- Type consistency: `PackageKind`, `RunStatus`, `StationKind`, `BlueprintPackageDefinition`, and `startIntakeRun` are named consistently across the planned files and tests.

## B3 Addendum

The implemented B3 slice is intentionally stricter than the initial seed examples:

- `PackageInstall` uses `packageId` to match the domain skeleton source of truth.
- `PackageKind` is carried in the shared domain types so future `expansion` work does not require a retrofit.
- The shipped intake slice proves `workspace -> installed blueprint -> production run -> intake station -> founder profile deliverable`, not just a stubbed `startIntakeRun(...)`.

## B4 Addendum

The next bounded widening after B3 is:

- `completed intake run -> positioning analysis station -> positioning brief deliverable -> waiting_for_approval`

This phase remains intentionally out of scope for:

- approval entity persistence
- checkpoint resolution commands
- assembly-family work
- historical harness/runtime board inheritance

## B5 Addendum

The next bounded widening after B4 is:

- `positioning brief deliverable -> approval request -> approval resolution -> completed run`

This phase remains intentionally out of scope for:

- database persistence or repository wiring for approvals
- generic checkpoint orchestration
- changes-requested or resume/rework routing
- any post-approval next-station continuation
- assembly-family work
- historical harness/runtime or board-action integration

## B6 Addendum

The next bounded widening after B5 is:

- `positioning approval -> changes requested -> bounded re-entry to positioning`

This phase remains intentionally out of scope for:

- generic rework workflow engines
- persistence or repository wiring for rework history
- introducing a new downstream station family
- assembly-family continuation
- historical harness/runtime or board-action integration

## B7 Addendum

The next bounded widening after B6 is:

- `changes requested -> revised positioning brief -> fresh approval request`

This phase remains intentionally out of scope for:

- persistence or repository wiring for revision history
- generic revision or rework workflow engines
- multiple revision generations beyond the first bounded loop
- downstream station continuation after re-approval
- assembly-family continuation
- historical harness/runtime or board-action integration

## B8 Addendum

The next bounded widening after B7 is:

- `revised positioning brief -> fresh approval request -> approval resolution -> completed run`

This phase remains intentionally out of scope for:

- additional revision generations after `revision_1`
- downstream station continuation after revised approval
- generic checkpoint or revision orchestration
- persistence or repository wiring for approval history
- assembly-family continuation
- historical harness/runtime or board-action integration

## B9 Addendum

The next bounded widening after B8 is:

- `specialist roster -> station-family ownership -> deliverable ownership -> bounded approval/handoff expectations`

This phase remains intentionally out of scope for:

- persistence or schema changes for specialist metadata
- UI/dashboard presentation changes
- generic multi-specialist workflow engines
- unconstrained prompt-persona routing
- historical harness/runtime or board-action integration

The intended implementation shape is:

- keep the canonical roster function-first (`direction`, `finance`, `market`, `operations`, `offer`)
- bind specialist ownership at the station-definition layer
- validate one primary specialist owner per station family
- reuse existing bounded approval behavior instead of inventing new policy kinds
- keep executable handoff expectations narrow to the currently shipped intake/positioning slice

## B10 Addendum

The next bounded widening after B9 is:

- `package-declared personas -> station persona references -> install-safe persona/station validation`

This phase remains intentionally out of scope for:

- manifest file loading
- persistence or schema changes
- prompt files
- UI/dashboard presentation changes
- worker/runtime execution changes
- quality-check personas or later blueprint families

The intended implementation shape is:

- declare bounded personas directly on the reboot package definition
- require each station to reference a declared `personaKey`
- require each persona to declare its allowed station keys
- fail closed on undeclared persona references, duplicate persona keys, and persona allowlist drift
- keep the B9 specialist-to-station-family ownership check as a reboot-local compatibility guard only

Recorded enforcement note:

- the active B10 enforcement seam is `createBlueprintPackage(...)`
- the current constructor-level guard fails closed on:
  - duplicate persona keys
  - undeclared `personaKey` references
  - persona allowlist drift
  - station families outside the bounded `intake` / `positioning` slice
  - reboot-local B9 specialist-owner mismatch
- if a later phase introduces direct object construction, manifest loading, or persistence hydration without routing through this seam, it must add an equivalent validation guard before widening the model

## B11 Addendum

The next bounded widening after B10 is:

- `complete bounded manifest -> pure loader -> package constructor seam`

This phase remains intentionally out of scope for:

- zip or filesystem package archive loading
- package publishing or persistence seams
- prompt/template/ui execution
- quality-check persona execution
- runtime engine changes
- later workflow families beyond `intake` / `positioning`

The intended implementation shape is:

- define a complete-but-bounded manifest contract for the current slice
- keep the loader pure and local to package-definition loading/validation
- route loader output through `createBlueprintPackage(...)` so B10 guardrails remain authoritative
- prove the seam by switching current intake/positioning reboot tests to manifest-backed package creation

## B12 Addendum

The next bounded widening after B11 is:

- `packageId -> packageVersionId (${packageId}@${version}) -> package install pin -> run pin`

This phase remains intentionally out of scope for:

- package archives or zip/directory loading changes
- publishing APIs or package release workflow changes
- persistence or schema changes
- runtime or worker execution changes
- UI/dashboard presentation changes
- quality-check personas
- later workflow families beyond `intake` / `positioning`

The intended implementation shape is:

- keep `packageId` as the current reboot slice's stable package identity seam, while explicitly deferring any later package-id-vs-package-key publishing/persistence split
- introduce deterministic `packageVersionId` as `${packageId}@${version}`
- bind the current reboot slice version seam only at the domain/package/install/run boundaries
- require installs and runs in the current slice to describe the exact package-version pin through that deterministic seam
- keep the current manifest loader and package-construction path compatible with the identity split without widening the slice

## B13 Addendum

The next bounded widening after B12 is:

- `explicit packageId -> separate package key/slug -> packageVersionId (${packageId}@${version})`

This phase remains intentionally out of scope for:

- package archives or zip/directory loading changes
- publishing APIs or package release workflow changes
- persistence or schema changes
- runtime or worker execution changes
- UI/dashboard presentation changes
- quality-check personas
- later workflow families beyond `intake` / `positioning`

The intended implementation shape is:

- expose `packageId` explicitly on the reboot blueprint/package contract
- keep `key` as the customer/package slug seam only
- derive deterministic `packageVersionId` as `${packageId}@${version}`
- require installs, runs, and approvals in the current slice to pin the explicit stable identity and deterministic version seam together
- prove with focused tests that changing the slug or title alone does not change package identity

## B14 Addendum

The next bounded widening after B13 is:

- `validated manifest -> deterministic package content hash -> package source metadata -> minimal read-only .twfpkg archive load`

This phase remains intentionally out of scope for:

- operator catalog endpoints
- package publishing, deprecation, yanking, or archive storage
- tenant install/update/rollback/disable/uninstall lifecycle changes
- persistence or schema changes
- runtime or worker execution changes
- UI/dashboard presentation changes
- quality-check personas
- later workflow families beyond `intake` / `positioning`

The intended implementation shape is:

- compute deterministic package content hashes from sorted package entry paths and canonicalized JSON content
- attach source metadata to package definitions loaded from manifests or `.twfpkg` archives
- support only a minimal read-only `.twfpkg` zip load path that extracts root `manifest.json`
- route archive-loaded manifests through the existing loader and `createBlueprintPackage(...)` seam so B10-B13 guardrails remain authoritative
- prove stable hashes across archive repacking with identical content and changed hashes when package content changes

## B15 Addendum

The next bounded widening after B14 is:

- `validated .twfpkg -> immutable published package version -> duplicate rejection -> audit intent`

This phase remains intentionally out of scope for:

- operator HTTP routes, middleware, and authorization
- database schema, persistence, or archive storage
- package deprecation and yanking
- tenant install lifecycle behavior
- runtime/worker execution changes
- UI/dashboard presentation changes
- legacy catalog reuse

The intended implementation shape is:

- load archives through the B14 archive loader so manifest and persona guardrails stay authoritative
- create a pure published-version value containing the stable package identity, deterministic version identity, source metadata, and operator/timestamp provenance
- reject republishing the same `packageId@version`, even if the archive content differs
- return a pure audit intent for later durable operator-audit wiring, without invoking the tenant-shaped legacy audit sink

## B16 Addendum

The next bounded widening after B15 is:

- `published lifecycle -> deprecated lifecycle -> yanked lifecycle, with audit intent`

This phase remains intentionally out of scope for:

- operator HTTP routes, middleware, and authorization
- database schema, persistence, or archive storage
- restore or un-yank behavior
- tenant install lifecycle behavior
- runtime/worker execution changes
- UI/dashboard presentation changes
- legacy catalog reuse

The intended implementation shape is:

- keep published package-version identity and content immutable
- represent catalog visibility in a separate immutable lifecycle projection
- allow only the forward transitions `published -> deprecated`, `published -> yanked`, and `deprecated -> yanked`
- return an audit intent for every catalog transition without calling a durable audit sink

## B17 Addendum

The next bounded widening after B16 is:

- `operator-owned blueprint catalog tables -> immutable package/version content -> forward-only lifecycle integrity`

This phase remains intentionally out of scope for:

- reuse of the legacy `wealth_factory_packages` catalog
- live migration-helper wiring or VPS application
- operator API routes, authentication, RLS, or durable audit integration
- archive-byte storage and tenant package installs
- runtime/worker execution changes
- UI/dashboard presentation changes

The intended implementation shape is:

- create `wfpc.factory_blueprint_packages` and `wfpc.factory_blueprint_package_versions`
- preserve the B15/B16 package identity, version identity, manifest, content hash, and publication provenance
- enforce status-specific lifecycle actor/timestamp completeness and chronological ordering
- enforce only `published -> deprecated`, `published -> yanked`, and `deprecated -> yanked`; yanked is terminal
- prevent package deletion from cascading away immutable version history

## B18 Addendum

The next bounded widening after B17 is:

- `manifest permissions -> tenant install snapshot -> lifecycle transition -> audit intent`

This phase remains intentionally out of scope for:

- tenant install database tables, repositories, or live migration-helper wiring
- HTTP routes, RBAC middleware, entitlement checks, Stripe, or customer/operator UI
- durable audit persistence
- package archive storage or catalog lifecycle mutation
- runtime/worker execution changes
- widening beyond the current intake/positioning reboot slice

The intended implementation shape is:

- normalize manifest `permissions` and `budgets` into the blueprint package definition
- deep-copy those permissions and budgets into `PackageInstall.permissionSnapshot` at install time
- add pure lifecycle helpers for disable, enable, update, rollback, and uninstall
- compute permission diffs for updates and fail closed when a version widens permissions without explicit consent
- return audit intents from lifecycle transitions so persistence can attach later without changing the domain seam

## B19 Addendum

The next bounded widening after B18 is:

- `B17 catalog version -> tenant install projection -> lifecycle event log -> tenant read RLS`

This phase remains intentionally out of scope for:

- reuse or mutation of the legacy `wfpc.tenant_package_installs` or `wfpc.wealth_factory_packages` tables
- HTTP routes, owner/admin write enforcement, entitlement checks, Stripe, or customer/operator UI
- repository/service wiring or dual-writes from the pure B18 lifecycle helpers
- package archive storage or catalog lifecycle mutation
- runtime/worker execution changes
- widening beyond the current intake/positioning reboot slice

The intended implementation shape is:

- create `wfpc.factory_blueprint_package_installs` as the tenant-owned install projection anchored to `wfpc.factory_blueprint_package_versions`
- persist the B18 permission snapshot, permission diff, current package version, previous package version, lifecycle status, and lifecycle timestamps
- create `wfpc.factory_blueprint_package_install_events` for durable lifecycle audit events
- enable tenant-scoped read RLS only, leaving owner/admin writes to the later API phase
- preserve the non-destructive uninstall rule: deliverables and launch kit outputs are never deleted by uninstall

## B20 Addendum

The next bounded widening after B19 is:

- `B18 install transition -> B19-shaped repository port -> in-memory adapter proof`

This phase remains intentionally out of scope for:

- completing Ticket 09 tenant endpoints or owner/admin RBAC acceptance
- entitlement checks, Stripe, customer/operator UI, or Supabase client wiring
- reuse or mutation of the legacy `wfpc.tenant_package_installs` or `wfpc.wealth_factory_packages` tables
- package archive storage or catalog lifecycle mutation
- runtime/worker execution changes
- widening beyond the current intake/positioning reboot slice

The intended implementation shape is:

- define a narrow blueprint-native install repository port that saves a `PackageInstall` together with its paired audit intent
- expose B19-shaped install and lifecycle event rows for tests and future Supabase wiring
- generate deterministic lifecycle event IDs inside the adapter boundary
- enforce tenant-scoped reads and reject audit intents whose workspace, install, package, or package-version identity does not match the install
- deep-copy snapshot and diff payloads so repository reads cannot mutate stored install state

## B21 Addendum

The next bounded widening after B20 is:

- `owner/admin actor -> entitlement check -> B18 install transition -> B20 repository save`

This phase remains intentionally out of scope for:

- completing Ticket 09 tenant endpoints or full owner/admin RBAC acceptance
- HTTP routes, middleware/session role mapping, Supabase adapters, Stripe, or customer/operator UI
- update, rollback, disable, enable, or uninstall application methods
- reuse or mutation of the legacy `wfpc.tenant_package_installs` or `wfpc.wealth_factory_packages` tables
- runtime/worker execution changes
- widening beyond the current intake/positioning reboot slice

The intended implementation shape is:

- create an install-only application service that admits tenant owners and admins and rejects members before entitlement or persistence work
- keep `Entitlements.canInstall(...)` boolean and narrow, with an allow-all dev implementation until Ticket 25 replaces it
- treat the requested package key as a fail-closed check against the resolved blueprint package key
- compose the existing pure B18 install/audit helpers with the B20 repository port
- persist exactly one paired `package_installed` lifecycle event for a successful install

## B22 Addendum

The next bounded widening after B21 is:

- `owner/admin actor -> tenant-scoped install lookup -> B18 disable/enable transition -> B20 repository save`

This phase remains intentionally out of scope for:

- completing Ticket 09 tenant endpoints or full owner/admin RBAC acceptance
- HTTP routes, middleware/session role mapping, Supabase adapters, Stripe, or customer/operator UI
- update, rollback, uninstall, or permission-widening consent application methods
- in-flight run pause/resume worker semantics beyond the install status transition
- reuse or mutation of the legacy `wfpc.tenant_package_installs` or `wfpc.wealth_factory_packages` tables
- runtime/worker execution changes
- widening beyond the current intake/positioning reboot slice

The intended implementation shape is:

- reuse the B21 actor gate for tenant owner/admin lifecycle actions
- lookup installs through the B20 tenant-scoped repository before applying lifecycle transitions
- hydrate repository rows back into the B18 `PackageInstall` domain contract without dropping identity, timestamps, version pointers, permission snapshots, or permission diffs
- compose the existing pure B18 disable/enable transition helpers with the B20 repository port
- persist paired `package_disabled` and `package_enabled` lifecycle events through `saveLifecycleEvent(...)`
- fail closed for member actors, cross-tenant install ids, and uninstalled installs

## B23 Addendum

The next bounded widening after B22 is:

- `owner/admin actor -> package-key check -> tenant-scoped install lookup -> B18 update transition -> B20 repository save`

This phase remains intentionally out of scope for:

- completing Ticket 09 tenant endpoints or full owner/admin RBAC acceptance
- HTTP routes, middleware/session role mapping, Supabase adapters, Stripe, or customer/operator UI
- rollback or uninstall application methods
- entitlement checks beyond the install-only B21 seam
- in-flight run version pinning or runtime worker behavior
- reuse or mutation of the legacy `wfpc.tenant_package_installs` or `wfpc.wealth_factory_packages` tables
- widening beyond the current intake/positioning reboot slice

The intended implementation shape is:

- reuse the B21/B22 actor gate for tenant owner/admin update actions
- fail closed when the requested package key does not match the resolved blueprint package key
- lookup installs through the B20 tenant-scoped repository before applying an update
- reject disabled/non-enabled installs so update does not implicitly re-enable packages
- reject same-version updates so no-op updates do not emit lifecycle audit noise
- compose the existing pure B18 update transition helper with the B20 repository port
- persist paired `package_updated` lifecycle events through `saveLifecycleEvent(...)`
- return the updated install with `permissionDiff` so later API/UI layers can echo widened permissions without recalculating the diff

## B24 Addendum

The next bounded widening after B23 is:

- `owner/admin actor -> package-key check -> tenant-scoped install lookup -> B18 rollback transition -> B20 repository save`

This phase remains intentionally out of scope for:

- completing Ticket 09 tenant endpoints or full owner/admin RBAC acceptance
- HTTP routes, middleware/session role mapping, Supabase adapters, Stripe, or customer/operator UI
- uninstall application methods
- rollback permission-widening consent beyond the existing B18 helper behavior
- runtime deliverable version marking or run version-pinning behavior
- reuse or mutation of the legacy `wfpc.tenant_package_installs` or `wfpc.wealth_factory_packages` tables
- widening beyond the current intake/positioning reboot slice

The intended implementation shape is:

- reuse the B21-B23 actor gate for tenant owner/admin rollback actions
- fail closed when the requested package key does not match the resolved rollback blueprint package key
- lookup installs through the B20 tenant-scoped repository before applying rollback
- reject disabled/non-enabled installs so rollback does not implicitly re-enable packages
- compose the existing pure B18 rollback transition helper with the B20 repository port
- persist paired `package_rolled_back` lifecycle events through `saveLifecycleEvent(...)`
- preserve the original package-version snapshot when rolling back
- explicitly defer full rollback consent acceptance because Section 13 describes the same consent flow as update, while the current B18 helper only validates `previousPackageVersionId`

## B25 Addendum

Phase B25 adds the uninstall tenant package application-service seam for Ticket 09.

This phase remains intentionally out of scope for:

- completing Ticket 09 tenant endpoints or full owner/admin RBAC acceptance
- HTTP routes, middleware/session role mapping, Supabase adapters, Stripe/refund handling, or customer/operator UI
- runtime run cancellation, queue draining, or worker behavior
- deliverable deletion, Launch Kit deletion, or separate delete-data actions
- entitlement revocation or billing lifecycle side effects
- reuse or mutation of the legacy `wfpc.tenant_package_installs` or `wfpc.wealth_factory_packages` tables
- widening beyond the current intake/positioning reboot slice

The intended implementation shape is:

- reuse the B21-B24 actor gate for tenant owner/admin uninstall actions
- lookup installs through the B20 tenant-scoped repository before applying uninstall
- fail closed when the requested package identity does not match the persisted install package identity
- require exact typed confirmation shaped as `UNINSTALL <packageKey>` derived from the persisted package identity before emitting `package_uninstalled`
- compose the existing pure B18 uninstall transition helper with the B20 repository port
- persist `package_uninstalled` lifecycle events through `saveLifecycleEvent(...)`
- allow disabled installs to uninstall without re-enabling them
- preserve the blueprint non-destructive uninstall rule: deliverables and Launch Kit outputs are never deleted by uninstall

## B26 Addendum

Phase B26 completes the bounded Ticket 09 tenant API and HTTP endpoint acceptance seam after the B18-B25 lifecycle/application work.

This phase is intentionally limited to:

- `authenticated tenant request -> owner/admin application API -> lifecycle action -> guarded HTTP response`
- the install, disable, enable, update, rollback, and uninstall lifecycle actions already proven below the API layer
- widened-permission update rejection with a tenant-safe permission diff until explicit consent is supplied
- owner/admin acceptance plus member, unauthenticated, and unentitled rejection paths
- non-destructive uninstall signaling: uninstall never deletes deliverables or Launch Kit output
- focused API and HTTP tests using the in-memory package install repository and dependency-injected auth/catalog/entitlement seams

This phase remains intentionally out of scope for:

- Supabase/Postgres repository adapters or live runtime dependency wiring
- customer UI for the lifecycle actions
- Stripe/refund behavior, entitlement revocation, or billing lifecycle side effects
- runtime pause/cancel workers, queue draining, or in-flight run behavior
- deliverable deletion, Launch Kit deletion, or separate delete-data actions
- reuse or mutation of the legacy `wfpc.tenant_package_installs` or `wfpc.wealth_factory_packages` tables
- widening beyond the current intake/positioning reboot slice

## B27 Addendum

Phase B27 starts Ticket 10 by creating the first blueprint-native Power Source credential seam.

This phase is intentionally limited to:

- AES-256-GCM envelope encryption with a random per-credential data key
- versioned wrapping of that data key by a 32-byte base64 `SECRETS_MASTER_KEY`-style master key
- pure service behavior for create, masked list, soft delete, and worker-bound decrypt
- a decrypt audit intent that always records `purpose`
- focused tests for encrypted storage, masked public responses, deleted credential exclusion, required decrypt purpose, wrong-key failure, tamper detection, and key re-wrap

This phase remains intentionally out of scope for:

- provider adapters or provider capability registry behavior from Ticket 11
- credential validation, async status updates, or weekly revalidation from Ticket 12
- HTTP routes, tenant UI, OAuth, Supabase/Postgres adapters, live runtime wiring, or worker queue integration
- reusing legacy provider registration endpoints as the factory Power Source source of truth
- expanding beyond the current intake/positioning reboot slice

## B28 Addendum

Phase B28 completes the bounded Ticket 10 API/HTTP seam on top of the B27 credential service.

This phase is intentionally limited to:

- authenticated tenant API methods for credential create, masked list, and soft delete
- owner/admin authorization for credential management, with tenant members rejected before persistence
- guarded HTTP routes for `POST /api/factory/credentials`, `GET /api/factory/credentials`, and `DELETE /api/factory/credentials/:credentialId`
- tenant-safe error mapping for unauthenticated, forbidden, invalid provider kind, blank label, empty secret, malformed credential id, and missing credential cases
- focused serializer-style assertions that submitted plaintext does not appear in API/HTTP responses

This phase remains intentionally out of scope for:

- browser/API decrypt endpoints or any return path for plaintext credential material
- provider validation, validation queue setup, or weekly revalidation from Ticket 12
- provider adapters, capability registry, model selection, rate limiting, or worker injection from Ticket 11 and later engine phases
- Supabase/Postgres adapters, live runtime wiring, customer UI, OAuth flows, rotation UI, restore behavior, or package-scoped credential semantics

## B29 Addendum

Phase B29 starts Ticket 11 with the smallest provider abstraction seam that materially advances the blueprint without crossing into runtime execution.

This phase is intentionally limited to:

- the shared `LLMProvider` contract for `anthropic`, `openai`, `openrouter`, `google`, and `xai`
- a static versioned capability registry with model context windows, structured-output support, tool-use support, token-cost rates, and tier
- pure matching from required package capabilities to eligible provider/model entries
- pure cost estimation from registry rates
- an explicit mapping from Ticket 10 Power Source credential kinds to blueprint provider keys, including `gemini_api` -> `google`
- injected adapter shells that normalize credential validation, completion result shape, usage, cost, request ids, and provider error classes without making live calls in tests

This phase remains intentionally out of scope for:

- credential validation queue/status lifecycle from Ticket 12
- worker-only credential decrypt/injection, run execution, usage ledger writes, budgets, retries, Redis, or database imports
- live provider smoke scripts, real recorded HTTP fixtures, rate-limit token buckets, provider incident toggles, customer UI, OAuth, or Supabase/Postgres adapters
- reuse of legacy `src/providers` runtime fallback paths as the new factory provider source of truth

## B30 Addendum

Phase B30 continues Ticket 11 by implementing provider-native completion request/response mapping behind the injected provider HTTP client seam.

This phase is intentionally limited to:

- mapping the shared `CompletionRequest` into provider-native mocked HTTP request shapes for OpenAI, Anthropic, OpenRouter, Google, and xAI
- preserving system prompts, ordered messages, tool definitions, tool-result turns, and JSON-schema response format intent
- normalizing mocked provider success responses into the shared `CompletionResult` shape with `text`, `providerRequestId`, `usage`, and registry-derived `costUsd`
- normalizing provider completion error statuses into the existing tenant-safe error messages without surfacing raw provider bodies or secrets
- keeping B29's static registry, cost estimation, capability matching, provider-key mapping, and injected HTTP client boundary intact

This phase remains intentionally out of scope for:

- credential validation jobs, async credential statuses, weekly revalidation, or auto-invalidation from Ticket 12
- worker-only credential decrypt/injection, run execution, queue processing, retries, rate limiting, Redis, database imports, usage ledger writes, or budget enforcement
- live provider smoke scripts, real provider calls, recorded external fixtures, provider incident toggles, customer UI, OAuth, Supabase/Postgres adapters, or fallback/shared operator providers
- reusing legacy `src/providers` runtime paths as the blueprint-native provider source of truth

## B31 Addendum

Phase B31 starts Ticket 12 by adding the factory-layer credential validation lifecycle while deliberately deferring the actual BullMQ/worker infrastructure to a later slice.

This phase is intentionally limited to:

- adding validation status, validation message, and last-validation timestamp fields to Power Source credentials and masked DTOs
- returning newly saved credentials as `pending` and recording a queued validation job
- processing one queued validation job through the existing vault decrypt boundary and Ticket 11 provider `validateCredential(...)` seam
- projecting provider validation results into tenant-safe `valid` or `invalid` credential state without leaking raw provider bodies or submitted secrets
- identifying active valid credentials due for weekly revalidation
- providing a small auth-failure invalidation helper for later run-execution integration

This phase remains intentionally out of scope for:

- BullMQ/Redis queue registration, worker boot/shutdown, repeatable weekly job setup, or `apps/worker` code
- Supabase/Postgres adapters, schema migrations, customer UI, OAuth, live provider calls, retry/backoff policy, runtime run pausing, usage ledger writes, or budget accounting

## B31a Addendum: Queue Namespace Isolation

Before B32 wires any durable validation queue, the reboot branch now owns an explicit queue namespace contract:

- `wealth-factory-blueprint-v1` is the blueprint queue prefix.
- `wealth-factory-validations-v1` is the credential validation queue name.
- `wealth-factory-runs-v1` is reserved for later blueprint runtime execution.
- `wfpc-*` and Paperclip-shaped queue names or Redis key prefixes are invalid for new factory queue wiring.

This is a non-destructive local guardrail only. It does not inspect, drain, delete, or migrate live Redis/BullMQ data.

## B32 Addendum: Credential Validation Queue Port

B32 completes the next bounded Ticket 12 step by introducing a queue port around the existing credential validation job lifecycle.

The implementation remains local and repository-backed:

- credential creation enqueues validation jobs through `FactoryCredentialValidationQueue`
- validation processing claims and completes jobs through that same queue port
- weekly revalidation checks the queue port for open duplicate jobs before enqueueing
- the B31a Wealth Factory queue namespace guard is enforced at queue adapter construction time
- the repository remains the authoritative validation job state store

The queue port preserves work across ordinary failure boundaries: credential persistence precedes enqueueing and rolls back on enqueue failure, while retryable validation remains queued with its tenant and credential identity intact. The repository claim operation is an atomic queued-to-processing transition, even though the in-memory adapter implements that contract synchronously.

This phase intentionally does not add BullMQ/Redis clients, worker boot, repeatable weekly scheduling, queue retry/backoff design, Supabase/Postgres adapters, live provider calls, runtime pause/resume behavior, usage ledger writes, budget accounting, or customer UI.

## B33 Addendum: BullMQ Transport Adapter

B33 adds the first isolated BullMQ/Redis transport adapter behind the B32 credential-validation queue port. The transport publishes only a deterministic validation-job reference; the repository remains the authoritative state machine for claim, completion, requeue, and duplicate suppression. The adapter validates the Wealth Factory namespace and exposes explicit queue/connection cleanup. Worker boot, repeatable scheduling, retry/backoff policy, Supabase/Postgres persistence, runtime wiring, API/UI, and legacy queue migration remain out of scope.

The repository also owns an atomic insert-if-open-absent operation. If transport publication fails, or a duplicate transport error is not backed by an observable BullMQ job, the adapter removes the repository job so future recovery is not suppressed by stale state.

## B34 Addendum: Controlled BullMQ Consumer Shell

B34 adds only the factory-local BullMQ consumer seam for the B33 transport. It uses the guarded `wealth-factory-validations-v1` queue namespace and passes the exact `{ jobId }` transport payload to an injected processor. It exposes explicit start, readiness, and cleanup controls plus bounded job/error events.

This phase intentionally does not wire the consumer into worker boot or runtime execution, infer repository claims from queue order, add retry/backoff or repeatable scheduling, add persistence, API/UI, provider calls, or touch legacy Paperclip queues.

## B35 Addendum: Exact Credential Validation Job Processing

B35 closes the exact-job handoff between the B33 transport and B34 consumer shell. The credential validation repository now exposes an exact queued-job claim by validation job ID, the validation queue port exposes `claimById`, and the validation service exposes `processValidationJob({ jobId })` while sharing the same post-claim validation behavior used by `processNextValidationJob()`.

The repository remains authoritative for validation job state. The BullMQ queue adapter delegates exact claims through the repository-backed queue and does not mutate BullMQ transport state during `claimById`.

This phase also tightened validation-service return DTOs so successful exact validation and provider-auth invalidation return the same updated credential projection that was persisted.

This phase intentionally does not compose the B34 consumer with the service, boot a worker, add scheduling or retry/backoff policy, add persistence adapters, expose API/UI routes, contact live providers, touch the VPS, or access legacy `wfpc-*` queues.

## B36 Gate: Foundation Tickets 01-06 Before Ticket 13

Before Ticket 13 introduces the run and deliverable data model, the reboot must explicitly audit the master-blueprint foundation tickets that were not independently covered by B1-B35. B1-B35 intentionally advanced the blueprint-native package, install, provider, credential, and queue seams, but they did not prove that the underlying scaffold, schema, auth, tenant isolation, RBAC, and audit-event foundation matches the master blueprint.

Ticket 13 is blocked until the following master-blueprint tickets are reconciled against the current repo foundation:

- Ticket 01: scaffold and workspace shape
- Ticket 02: core database schema and tenant-owned table conventions
- Ticket 03: auth and session model
- Ticket 04: tenant context and RLS expectations
- Ticket 05: RBAC roles and permission checks
- Ticket 06: append-only audit event contract

For each foundation ticket, B36 must decide whether the current repo foundation is accepted as blueprint-compatible, adapted with bounded changes, or replaced before Ticket 13 lands. The key risk is accidental inheritance: Ticket 13 must not build the new Wealth Factory run model on an unreviewed legacy Paperclip foundation.

## Forward Modeling Note

The current B1-B7 reboot lane intentionally keeps package identity minimal so the domain can be proven without introducing persistence or publishing infrastructure. That simplification must not become permanent.

Before any later phase adds package persistence, publishing, install history, or update flows, the model should separate:

- stable package identity
- immutable published package-version identity

Expected consequence:

- runs should pin a specific package-version seam at start time
- installs should record both package identity and installed version identity
- the current proof-slice shortcut where package identity is minimally modeled should be retired before those later phases widen the model

The bounded B13 seam for the current reboot slice should use deterministic `packageVersionId` values shaped as `${packageId}@${version}`.

## Specialist-Function Addendum

The reboot preserves the business-guidance expertise from the older CEO/CFO/CMO-style system, but the active source of truth is now function over title.

That means:

- keep the expertise
- allow naming to change
- bind the expertise to station ownership, deliverables, approvals, and handoffs

Recommended function set for a later dedicated phase:

- direction
- finance
- market
- operations
- offer

This specialist-function architecture is intentionally not part of B1-B5 engine proof work except where a bounded slice needs a temporary `personaKey` binding.

Recommended future specialist-to-station map:

- direction -> intake, founder profile synthesis, strategic priorities, decision checkpoints
- finance -> pricing, margin, cost structure, revenue sensitivity, financial approvals
- market -> positioning, messaging, audience clarity, go-to-market framing
- operations -> delivery design, SOPs, implementation readiness, handoff packaging
- offer -> offer shaping, package design, objection handling, conversion review

Design rule:
each station family should have one primary specialist-function owner, with additional expertise entering only through bounded handoffs or approvals.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-06-wealth-factory-blueprint-reboot.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
