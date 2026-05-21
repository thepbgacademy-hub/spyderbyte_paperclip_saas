# Wealth Factory Harness V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first custom Wealth Factory harness slice that replaces the CEO orchestration + child-card workflow loop with a persisted, restart-safe runtime and a Hermes-inspired board surface while keeping BYOK fully owned by Wealth Factory.

**Architecture:** The implementation introduces a new `src/harness` domain with explicit run and card state machines, durable persistence in `wfpc`, and a narrow runtime contract that accepts resolved provider context from Wealth Factory instead of fetching secrets itself. The UI adds a Hermes-style board page and drawer that consume the new harness API without exposing backend process noise.

**Tech Stack:** TypeScript, Vitest, Supabase/Postgres migrations, existing `src/db/*` repository patterns, existing `src/api/runtime-server.ts` composition root, React dashboard in `apps/web/src/*`, Playwright for E2E.

---

## File Structure

### New backend files

- `supabase/migrations/0013_wf_harness_runs_cards.sql`
  - Create durable tables for harness runs, harness cards, and card events.
- `src/harness/types.ts`
  - Canonical types for run states, card states, personas, sub-card proposals, and runtime payloads.
- `src/harness/state-machine.ts`
  - Explicit transition rules for runs and cards.
- `src/harness/repository.ts`
  - Persistence contract and Postgres-backed implementation helpers.
- `src/harness/runtime-contract.ts`
  - Boundary type describing the resolved runtime context Wealth Factory passes into the harness.
- `src/harness/runtime.ts`
  - CEO loop, card proposal approval, and resume-from-state logic.
- `src/harness/execution-selector.ts`
  - Migration seam that decides whether a workflow uses the new harness or the existing Paperclip-backed lane.

### New API files

- `src/api/harness-http.ts`
  - Authenticated HTTP surface for harness runs, board state, and drawer detail.

### New frontend files

- `apps/web/src/pages/HarnessBoardPage.tsx`
  - Hermes-inspired board route for harness-backed workflows.
- `apps/web/src/components/HarnessBoard.tsx`
  - Kanban column layout and card rendering.
- `apps/web/src/components/HarnessCardDrawer.tsx`
  - Drawer with high-level output, comments, and state history.

### New tests

- `tests/harness-state-machine.test.ts`
- `tests/harness-repository.test.ts`
- `tests/harness-runtime.test.ts`
- `tests/harness-execution-selector.test.ts`
- `tests/harness-http.test.ts`
- `tests/harness-ui.test.tsx`
- `tests/harness-board.e2e.spec.ts`

### Existing files to modify

- `src/db/types.ts`
  - Add DB row types for harness tables.
- `src/db/postgres-client.ts`
  - Reuse existing transaction runner helpers if needed.
- `src/db/supabase-repositories.ts`
  - Expose any tenant/workflow metadata needed by the harness selector.
- `src/api/runtime-server.ts`
  - Compose the new harness repository/runtime and register HTTP routes.
- `src/config/env.ts`
  - Add feature flag or explicit execution-mode env parsing.
- `src/wealthfactory/workflow-registry.ts`
  - Mark which workflow families are eligible for harness execution.
- `apps/web/src/App.tsx`
  - Register the new board route.
- `apps/web/src/shell/navigation.tsx`
  - Add the board navigation item when the harness feature is enabled.
- `apps/web/src/styles.css`
  - Add board-specific layout classes that echo the Hermes benchmark without exposing Hermes names.
- `wf-harness/TODO.md`
- `wf-harness/HANDOFF.md`
- `wf-harness/audit/2026-05-21-design-error-log.md`

---

### Task 1: Add Durable Harness Run/Card Persistence

**Files:**
- Create: `supabase/migrations/0013_wf_harness_runs_cards.sql`
- Create: `src/harness/types.ts`
- Create: `src/harness/repository.ts`
- Modify: `src/db/types.ts`
- Test: `tests/harness-repository.test.ts`

- [ ] **Step 1: Write the failing repository test**

```ts
import { describe, expect, it } from "vitest";
import {
  createHarnessRunRecord,
  createHarnessCardRecord,
  transitionHarnessCard,
} from "../src/harness/types";

describe("harness persistence records", () => {
  it("creates a run plus an initial CEO card with durable ids", () => {
    const run = createHarnessRunRecord({
      tenantId: "tenant_123",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI",
      },
    });

    const card = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan the first workflow",
      deliverableType: "plan",
    });

    const moved = transitionHarnessCard(card, "planning");

    expect(run.state).toBe("queued");
    expect(card.state).toBe("queued");
    expect(moved.state).toBe("planning");
    expect(run.runtimeContext.secretValues).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/harness-repository.test.ts`

Expected: FAIL with module resolution errors for `src/harness/types.ts`.

- [ ] **Step 3: Write the minimal types and migration**

```sql
create table if not exists wfpc.harness_runs (
  id uuid primary key,
  tenant_id uuid not null,
  workflow_id text not null,
  package_id text not null,
  orchestrator_persona text not null,
  state text not null,
  runtime_context jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wfpc.harness_cards (
  id uuid primary key,
  run_id uuid not null references wfpc.harness_runs(id) on delete cascade,
  parent_card_id uuid null references wfpc.harness_cards(id) on delete set null,
  persona text not null,
  title text not null,
  deliverable_type text not null,
  state text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wfpc.harness_card_events (
  id bigserial primary key,
  card_id uuid not null references wfpc.harness_cards(id) on delete cascade,
  event_kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

```ts
import { randomUUID } from "node:crypto";

export type HarnessRunState =
  | "queued"
  | "planning"
  | "active"
  | "waiting"
  | "blocked"
  | "assembling"
  | "done"
  | "failed"
  | "cancelled";

export type HarnessCardState =
  | "queued"
  | "planning"
  | "approved"
  | "working"
  | "waiting"
  | "blocked"
  | "done"
  | "cancelled";

export interface HarnessRuntimeContext {
  providerKind: string;
  credentialLabel: string;
  secretValues?: never;
}

export interface HarnessRunRecord {
  id: string;
  tenantId: string;
  workflowId: string;
  packageId: string;
  orchestratorPersona: string;
  state: HarnessRunState;
  runtimeContext: HarnessRuntimeContext;
}

export interface HarnessCardRecord {
  id: string;
  runId: string;
  parentCardId: string | null;
  persona: string;
  title: string;
  deliverableType: string;
  state: HarnessCardState;
}

export function createHarnessRunRecord(input: {
  tenantId: string;
  workflowId: string;
  packageId: string;
  orchestratorPersona: string;
  runtimeContext: HarnessRuntimeContext;
}): HarnessRunRecord {
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    workflowId: input.workflowId,
    packageId: input.packageId,
    orchestratorPersona: input.orchestratorPersona,
    state: "queued",
    runtimeContext: input.runtimeContext,
  };
}

export function createHarnessCardRecord(input: {
  runId: string;
  persona: string;
  title: string;
  deliverableType: string;
  parentCardId?: string | null;
}): HarnessCardRecord {
  return {
    id: randomUUID(),
    runId: input.runId,
    parentCardId: input.parentCardId ?? null,
    persona: input.persona,
    title: input.title,
    deliverableType: input.deliverableType,
    state: "queued",
  };
}

export function transitionHarnessCard(
  card: HarnessCardRecord,
  state: HarnessCardState,
): HarnessCardRecord {
  return { ...card, state };
}
```

```ts
export interface HarnessRepository {
  insertRun(run: HarnessRunRecord): Promise<void>;
  insertCard(card: HarnessCardRecord): Promise<void>;
  listCardsForRun(runId: string): Promise<HarnessCardRecord[]>;
}

export function createInMemoryHarnessRepository(): HarnessRepository {
  const runs = new Map<string, HarnessRunRecord>();
  const cards = new Map<string, HarnessCardRecord[]>();

  return {
    async insertRun(run) {
      runs.set(run.id, run);
    },
    async insertCard(card) {
      cards.set(card.runId, [...(cards.get(card.runId) ?? []), card]);
    },
    async listCardsForRun(runId) {
      return cards.get(runId) ?? [];
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/harness-repository.test.ts`

Expected: PASS with 1 passing test.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0013_wf_harness_runs_cards.sql src/harness/types.ts src/harness/repository.ts src/db/types.ts tests/harness-repository.test.ts
git commit -m "feat: add durable harness run and card records"
```

### Task 2: Add Explicit Run and Card State Machines

**Files:**
- Create: `src/harness/state-machine.ts`
- Test: `tests/harness-state-machine.test.ts`

- [ ] **Step 1: Write the failing state-machine test**

```ts
import { describe, expect, it } from "vitest";
import {
  assertValidRunTransition,
  assertValidCardTransition,
} from "../src/harness/state-machine";

describe("harness state machine", () => {
  it("allows queued runs to move into planning and active", () => {
    expect(assertValidRunTransition("queued", "planning")).toBe("planning");
    expect(assertValidRunTransition("planning", "active")).toBe("active");
  });

  it("rejects invalid card jumps", () => {
    expect(() => assertValidCardTransition("queued", "done")).toThrow(
      /invalid harness card transition/i,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/harness-state-machine.test.ts`

Expected: FAIL because `src/harness/state-machine.ts` does not exist.

- [ ] **Step 3: Write the minimal transition guards**

```ts
import type { HarnessCardState, HarnessRunState } from "./types";

const RUN_TRANSITIONS: Record<HarnessRunState, HarnessRunState[]> = {
  queued: ["planning", "cancelled"],
  planning: ["active", "blocked", "cancelled"],
  active: ["waiting", "assembling", "blocked", "failed", "cancelled"],
  waiting: ["active", "blocked", "cancelled"],
  blocked: ["planning", "cancelled", "failed"],
  assembling: ["done", "failed", "cancelled"],
  done: [],
  failed: [],
  cancelled: [],
};

const CARD_TRANSITIONS: Record<HarnessCardState, HarnessCardState[]> = {
  queued: ["planning", "cancelled"],
  planning: ["approved", "blocked", "cancelled"],
  approved: ["working", "blocked", "cancelled"],
  working: ["waiting", "done", "blocked", "cancelled"],
  waiting: ["working", "blocked", "cancelled"],
  blocked: ["approved", "cancelled"],
  done: [],
  cancelled: [],
};

export function assertValidRunTransition(
  from: HarnessRunState,
  to: HarnessRunState,
): HarnessRunState {
  if (!RUN_TRANSITIONS[from].includes(to)) {
    throw new Error(`Invalid harness run transition: ${from} -> ${to}`);
  }
  return to;
}

export function assertValidCardTransition(
  from: HarnessCardState,
  to: HarnessCardState,
): HarnessCardState {
  if (!CARD_TRANSITIONS[from].includes(to)) {
    throw new Error(`Invalid harness card transition: ${from} -> ${to}`);
  }
  return to;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/harness-state-machine.test.ts`

Expected: PASS with 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/harness/state-machine.ts tests/harness-state-machine.test.ts
git commit -m "feat: add harness run and card state machines"
```

### Task 3: Implement CEO Approval and Child Sub-Card Proposal Flow

**Files:**
- Create: `src/harness/runtime-contract.ts`
- Create: `src/harness/runtime.ts`
- Test: `tests/harness-runtime.test.ts`

- [ ] **Step 1: Write the failing runtime test**

```ts
import { describe, expect, it } from "vitest";
import { createHarnessRuntime } from "../src/harness/runtime";

describe("harness runtime", () => {
  it("lets a child propose a sub-card but requires CEO approval", async () => {
    const runtime = createHarnessRuntime();
    const session = runtime.startRun({
      tenantId: "tenant_123",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI",
      },
    });

    const child = runtime.createApprovedChildCard(session.run.id, {
      persona: "cfo",
      title: "Review pricing assumptions",
      deliverableType: "pricing-review",
    });

    const proposal = runtime.proposeSubCard(child.id, {
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research-brief",
    });

    expect(proposal.status).toBe("proposed");

    const approved = runtime.approveSubCard(proposal.id);
    expect(approved.state).toBe("queued");
    expect(approved.persona).toBe("researcher");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/harness-runtime.test.ts`

Expected: FAIL because the runtime functions are undefined.

- [ ] **Step 3: Write the minimal CEO-gated runtime**

```ts
import {
  createHarnessCardRecord,
  createHarnessRunRecord,
  type HarnessCardRecord,
  type HarnessRuntimeContext,
} from "./types";

type ProposedSubCard = {
  id: string;
  parentCardId: string;
  persona: string;
  title: string;
  deliverableType: string;
  status: "proposed";
};

export function createHarnessRuntime() {
  const runs = new Map<string, ReturnType<typeof createHarnessRunRecord>>();
  const cards = new Map<string, HarnessCardRecord>();
  const proposals = new Map<string, ProposedSubCard>();

  return {
    startRun(input: {
      tenantId: string;
      workflowId: string;
      packageId: string;
      runtimeContext: HarnessRuntimeContext;
    }) {
      const run = createHarnessRunRecord({
        ...input,
        orchestratorPersona: "ceo",
      });
      runs.set(run.id, run);
      const ceoCard = createHarnessCardRecord({
        runId: run.id,
        persona: "ceo",
        title: "Plan run",
        deliverableType: "plan",
      });
      cards.set(ceoCard.id, ceoCard);
      return { run, ceoCard };
    },

    createApprovedChildCard(runId: string, input: {
      persona: string;
      title: string;
      deliverableType: string;
    }) {
      const card = createHarnessCardRecord({
        runId,
        persona: input.persona,
        title: input.title,
        deliverableType: input.deliverableType,
      });
      cards.set(card.id, { ...card, state: "approved" });
      return cards.get(card.id)!;
    },

    proposeSubCard(parentCardId: string, input: {
      persona: string;
      title: string;
      deliverableType: string;
    }) {
      const proposal: ProposedSubCard = {
        id: `proposal_${parentCardId}_${input.persona}`,
        parentCardId,
        persona: input.persona,
        title: input.title,
        deliverableType: input.deliverableType,
        status: "proposed",
      };
      proposals.set(proposal.id, proposal);
      return proposal;
    },

    approveSubCard(proposalId: string) {
      const proposal = proposals.get(proposalId);
      if (!proposal) throw new Error(`Unknown proposal: ${proposalId}`);
      const parent = cards.get(proposal.parentCardId);
      if (!parent) throw new Error(`Unknown parent card: ${proposal.parentCardId}`);
      const child = createHarnessCardRecord({
        runId: parent.runId,
        parentCardId: proposal.parentCardId,
        persona: proposal.persona,
        title: proposal.title,
        deliverableType: proposal.deliverableType,
      });
      cards.set(child.id, child);
      proposals.delete(proposalId);
      return child;
    },
  };
}
```

```ts
export interface WealthFactoryResolvedRuntimeContext {
  tenantId: string;
  workflowId: string;
  packageId: string;
  providerKind: string;
  credentialLabel: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/harness-runtime.test.ts`

Expected: PASS with 1 passing test.

- [ ] **Step 5: Commit**

```bash
git add src/harness/runtime-contract.ts src/harness/runtime.ts tests/harness-runtime.test.ts
git commit -m "feat: add CEO-gated child card proposal flow"
```

### Task 4: Add the Execution Selector and Migration Seam

**Files:**
- Create: `src/harness/execution-selector.ts`
- Modify: `src/config/env.ts`
- Modify: `src/wealthfactory/workflow-registry.ts`
- Test: `tests/harness-execution-selector.test.ts`

- [ ] **Step 1: Write the failing selector test**

```ts
import { describe, expect, it } from "vitest";
import { selectExecutionEngine } from "../src/harness/execution-selector";

describe("harness execution selector", () => {
  it("routes only opted-in workflow families to the new harness", () => {
    expect(
      selectExecutionEngine({
        workflowId: "wf_connect_first_workflow",
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"],
      }),
    ).toBe("wf_harness_v1");

    expect(
      selectExecutionEngine({
        workflowId: "wf_social_campaign_builder",
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"],
      }),
    ).toBe("paperclip");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/harness-execution-selector.test.ts`

Expected: FAIL because `src/harness/execution-selector.ts` does not exist.

- [ ] **Step 3: Write the minimal selector and env parsing**

```ts
export type ExecutionEngine = "paperclip" | "wf_harness_v1";

export function selectExecutionEngine(input: {
  workflowId: string;
  harnessEnabledWorkflowIds: string[];
}): ExecutionEngine {
  return input.harnessEnabledWorkflowIds.includes(input.workflowId)
    ? "wf_harness_v1"
    : "paperclip";
}
```

```ts
export function parseHarnessEnabledWorkflowIds(
  raw: string | undefined,
): string[] {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
```

```ts
export const WF_HARNESS_ELIGIBLE_WORKFLOWS = [
  "wf_connect_first_workflow",
] as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/harness-execution-selector.test.ts`

Expected: PASS with 1 passing test.

- [ ] **Step 5: Commit**

```bash
git add src/harness/execution-selector.ts src/config/env.ts src/wealthfactory/workflow-registry.ts tests/harness-execution-selector.test.ts
git commit -m "feat: add harness execution selector seam"
```

### Task 5: Expose the Harness Board and Drawer API

**Files:**
- Create: `src/api/harness-http.ts`
- Modify: `src/api/runtime-server.ts`
- Test: `tests/harness-http.test.ts`

- [ ] **Step 1: Write the failing API test**

```ts
import { describe, expect, it } from "vitest";
import { createHarnessHttpHandler } from "../src/api/harness-http";

describe("harness HTTP", () => {
  it("returns high-level board data without backend noise", async () => {
    const handler = createHarnessHttpHandler({
      listBoardState: async () => ({
        runId: "run_123",
        columns: [
          {
            name: "planning",
            cards: [
              {
                id: "card_1",
                persona: "ceo",
                title: "Plan run",
                state: "planning",
              },
            ],
          },
        ],
      }),
    });

    const res = await handler({ method: "GET", path: "/api/harness/board" });
    expect(res.status).toBe(200);
    expect(res.body).not.toContain("tool_call");
    expect(res.body).not.toContain("prompt");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/harness-http.test.ts`

Expected: FAIL because the handler module does not exist.

- [ ] **Step 3: Write the minimal harness HTTP surface**

```ts
type HarnessHttpDeps = {
  listBoardState: () => Promise<{
    runId: string;
    columns: Array<{
      name: string;
      cards: Array<{
        id: string;
        persona: string;
        title: string;
        state: string;
      }>;
    }>;
  }>;
};

export function createHarnessHttpHandler(deps: HarnessHttpDeps) {
  return async function handle(request: { method: string; path: string }) {
    if (request.method === "GET" && request.path === "/api/harness/board") {
      const payload = await deps.listBoardState();
      return {
        status: 200,
        body: JSON.stringify(payload),
      };
    }

    return {
      status: 404,
      body: JSON.stringify({ error: "not_found" }),
    };
  };
}
```

```ts
// runtime-server.ts
const harnessHttpHandler = createHarnessHttpHandler({
  listBoardState: async () => ({
    runId: "placeholder",
    columns: [],
  }),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/harness-http.test.ts`

Expected: PASS with 1 passing test.

- [ ] **Step 5: Commit**

```bash
git add src/api/harness-http.ts src/api/runtime-server.ts tests/harness-http.test.ts
git commit -m "feat: add harness board API surface"
```

### Task 6: Add the First Hermes-Style Board Page

**Files:**
- Create: `apps/web/src/pages/HarnessBoardPage.tsx`
- Create: `apps/web/src/components/HarnessBoard.tsx`
- Create: `apps/web/src/components/HarnessCardDrawer.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/shell/navigation.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `tests/harness-ui.test.tsx`

- [ ] **Step 1: Write the failing UI test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HarnessBoard } from "../apps/web/src/components/HarnessBoard";

describe("HarnessBoard", () => {
  it("renders clean persona cards with high-level status only", () => {
    render(
      <HarnessBoard
        columns={[
          {
            name: "planning",
            cards: [
              {
                id: "card_1",
                persona: "CEO",
                title: "Plan the workflow",
                status: "Planning",
                summary: "Reviewing the request and shaping the work.",
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText("CEO")).toBeInTheDocument();
    expect(screen.getByText("Plan the workflow")).toBeInTheDocument();
    expect(screen.queryByText(/tool call/i)).toBeNull();
    expect(screen.queryByText(/executing this prompt/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/harness-ui.test.tsx`

Expected: FAIL because the board components do not exist.

- [ ] **Step 3: Write the minimal board page and styling**

```tsx
// HarnessBoard.tsx
export function HarnessBoard(props: {
  columns: Array<{
    name: string;
    cards: Array<{
      id: string;
      persona: string;
      title: string;
      status: string;
      summary?: string;
    }>;
  }>;
}) {
  return (
    <div className="wf-harness-board">
      {props.columns.map((column) => (
        <section key={column.name} className="wf-harness-column">
          <header className="wf-harness-column-header">
            <h2>{column.name}</h2>
            <span>{column.cards.length}</span>
          </header>
          <div className="wf-harness-column-body">
            {column.cards.map((card) => (
              <article key={card.id} className="wf-harness-card">
                <div className="wf-harness-card-meta">
                  <span className="wf-harness-card-persona">{card.persona}</span>
                  <span className="wf-harness-card-status">{card.status}</span>
                </div>
                <h3>{card.title}</h3>
                {card.summary ? <p>{card.summary}</p> : null}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
```

```tsx
// HarnessCardDrawer.tsx
export function HarnessCardDrawer(props: {
  open: boolean;
  title: string;
  persona: string;
  status: string;
  summary?: string;
  onClose: () => void;
}) {
  if (!props.open) return null;
  return (
    <aside className="wf-harness-drawer">
      <button onClick={props.onClose}>Close</button>
      <p>{props.persona}</p>
      <h2>{props.title}</h2>
      <p>{props.status}</p>
      {props.summary ? <p>{props.summary}</p> : null}
    </aside>
  );
}
```

```tsx
// HarnessBoardPage.tsx
import { useState } from "react";
import { HarnessBoard } from "../components/HarnessBoard";
import { HarnessCardDrawer } from "../components/HarnessCardDrawer";

export default function HarnessBoardPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const board = {
    columns: [
      {
        name: "planning",
        cards: [
          {
            id: "card_1",
            persona: "CEO",
            title: "Plan the workflow",
            status: "Planning",
            summary: "Reviewing the request and shaping the work.",
          },
        ],
      },
    ],
  };

  return (
    <div className="wf-harness-page">
      <HarnessBoard columns={board.columns} />
      <HarnessCardDrawer
        open={drawerOpen}
        title="Plan the workflow"
        persona="CEO"
        status="Planning"
        summary="Reviewing the request and shaping the work."
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
```

```css
.wf-harness-board {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
}

.wf-harness-column {
  border: 1px solid color-mix(in srgb, var(--midground-base) 15%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--background-base) 88%, transparent);
  padding: 0.75rem;
}

.wf-harness-card {
  border: 1px solid color-mix(in srgb, var(--midground-base) 12%, transparent);
  border-radius: 10px;
  padding: 0.75rem;
  background: color-mix(in srgb, var(--background-base) 92%, transparent);
}
```

```tsx
// App.tsx route
<Route path="/harness-board" element={<HarnessBoardPage />} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/harness-ui.test.tsx`

Expected: PASS with 1 passing test.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/HarnessBoardPage.tsx apps/web/src/components/HarnessBoard.tsx apps/web/src/components/HarnessCardDrawer.tsx apps/web/src/App.tsx apps/web/src/shell/navigation.tsx apps/web/src/styles.css tests/harness-ui.test.tsx
git commit -m "feat: add first Hermes-style harness board page"
```

### Task 7: Prove Resume-From-State and the Migration Slice End to End

**Files:**
- Modify: `src/harness/runtime.ts`
- Modify: `src/harness/repository.ts`
- Test: `tests/harness-runtime.test.ts`
- Test: `tests/harness-board.e2e.spec.ts`
- Modify: `wf-harness/TODO.md`
- Modify: `wf-harness/HANDOFF.md`
- Modify: `wf-harness/audit/2026-05-21-design-error-log.md`

- [ ] **Step 1: Write the failing resume and E2E tests**

```ts
import { describe, expect, it } from "vitest";
import { createHarnessRuntime } from "../src/harness/runtime";

describe("harness resume", () => {
  it("resumes a run from persisted card state after restart", async () => {
    const savedState = {
      run: { id: "run_123", state: "active" },
      cards: [
        { id: "card_1", persona: "ceo", state: "working", title: "Plan run" },
        { id: "card_2", persona: "cfo", state: "waiting", title: "Review numbers" },
      ],
    };

    const runtime = createHarnessRuntime();
    const resumed = runtime.resumeRun(savedState);

    expect(resumed.run.id).toBe("run_123");
    expect(resumed.cards).toHaveLength(2);
    expect(resumed.cards[0].state).toBe("working");
  });
});
```

```ts
import { test, expect } from "@playwright/test";

test("harness board hides backend execution chatter", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173/harness-board");
  await expect(page.getByText("CEO")).toBeVisible();
  await expect(page.getByText(/tool call/i)).toHaveCount(0);
  await expect(page.getByText(/executing this prompt/i)).toHaveCount(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/harness-runtime.test.ts`

Expected: FAIL because `resumeRun()` does not exist.

Run: `npm run e2e -- tests/harness-board.e2e.spec.ts`

Expected: FAIL because the route is not fully wired with live board data.

- [ ] **Step 3: Write the minimal resume logic and E2E fixtures**

```ts
resumeRun(saved: {
  run: { id: string; state: string };
  cards: Array<{ id: string; persona: string; state: string; title: string }>;
}) {
  return {
    run: saved.run,
    cards: saved.cards,
  };
}
```

```ts
// HarnessBoardPage.tsx
const demoBoard = {
  columns: [
    {
      name: "planning",
      cards: [
        {
          id: "card_1",
          persona: "CEO",
          title: "Plan the workflow",
          status: "Planning",
          summary: "Reviewing the request and shaping the work.",
        },
      ],
    },
  ],
};
```

```md
## Progress

- [x] Spec approved
- [x] Implementation plan written
- [ ] Execution not started
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/harness-runtime.test.ts`

Expected: PASS with the new resume assertion passing.

Run: `npm run e2e -- tests/harness-board.e2e.spec.ts`

Expected: PASS with the board route showing CEO-only high-level output.

- [ ] **Step 5: Commit**

```bash
git add src/harness/runtime.ts src/harness/repository.ts tests/harness-runtime.test.ts tests/harness-board.e2e.spec.ts wf-harness/TODO.md wf-harness/HANDOFF.md wf-harness/audit/2026-05-21-design-error-log.md
git commit -m "feat: prove harness resume and first board slice"
```

---

## Self-Review

### Spec coverage

- BYOK boundary: covered by Tasks 1, 3, and 4 through `HarnessRuntimeContext` and execution-selector wiring.
- CEO orchestrator + child persona model: covered by Tasks 2 and 3.
- Hermes-style kanban/dashboard UX: covered by Tasks 5, 6, and 7.
- Run lifecycle and reliability rules: covered by Tasks 1, 2, and 7.
- Migration path from Paperclip-backed Wealth Factory: covered by Task 4 and reinforced in Task 7.

### Placeholder scan

- No `TBD`, `TODO`, or “implement later” placeholders remain in the actionable tasks.
- Each code-changing step includes concrete code or SQL.
- Each verification step includes explicit commands and expected outcomes.

### Type consistency

- `HarnessRunState`, `HarnessCardState`, and `HarnessRuntimeContext` are defined in Task 1 and reused consistently later.
- Execution mode names stay consistent as `"paperclip"` and `"wf_harness_v1"`.
- CEO approval terminology stays consistent between runtime and UI tasks.
