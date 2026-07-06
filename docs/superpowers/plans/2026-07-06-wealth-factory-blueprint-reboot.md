# Wealth Factory Blueprint Reboot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reset the active build direction onto the factory-style blueprint with a new domain skeleton and a first blueprint-native vertical slice.

**Architecture:** Keep the existing repository and reuse only the safe infrastructure lessons, but treat the old Paperclip-shaped product model as reference-only. Build forward from a clean domain core centered on workspace, package, run, station, deliverable, and approval primitives.

**Tech Stack:** TypeScript, Vitest, existing repo workspace, GitNexus preflight, Markdown planning docs.

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
      packageKey: "connect-first",
    });

    expect(run.status).toBe("waiting_for_input");
    expect(run.currentStationKey).toBe("intake");
    expect(run.packageKey).toBe("connect-first");
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
  packageKey: string;
  currentStationKey: string;
  status: RunStatus;
}

export function startIntakeRun(input: {
  workspaceId: string;
  packageKey: string;
}): IntakeRun {
  return {
    id: "run_intake_seed",
    workspaceId: input.workspaceId,
    packageKey: input.packageKey,
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

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-06-wealth-factory-blueprint-reboot.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
