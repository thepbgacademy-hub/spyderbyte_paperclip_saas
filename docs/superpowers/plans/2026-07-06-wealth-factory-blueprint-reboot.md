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

## Forward Modeling Note

The current B1-B7 reboot lane intentionally keeps package identity minimal so the domain can be proven without introducing persistence or publishing infrastructure. That simplification must not become permanent.

Before any later phase adds package persistence, publishing, install history, or update flows, the model should separate:

- stable package identity
- immutable published package-version identity

Expected consequence:

- runs should pin a specific package-version seam at start time
- installs should record both package identity and installed version identity
- the current proof-slice shortcut where package identity is minimally modeled should be retired before those later phases widen the model

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
