# Repo Noise Slice Checklist

Purpose: reduce the current multi-phase worktree noise into bounded commits without widening scope or crossing seam boundaries.

Rules:
- Keep `AGENTS.md` and `CLAUDE.md` untracked.
- Do not mix dashboard/start truth with overlay runtime policy.
- Do not mix durable workflow identity plumbing with native worker envelope behavior.
- Do not mix queue/outbox identity propagation with overlay runtime registry resolution.

## Commit 1: Durable workflow identity / provenance

Include:
- `src/db/acid-guard-repository.ts`
- `src/db/supabase-repositories.ts`
- `src/db/types.ts`
- `supabase/migrations/0032_durable_public_workflow_identity.sql`
- `tests/acid-guard-repository.test.ts`
- `tests/acid-run-reservation.test.ts`
- `tests/api-routes.test.ts`
- `tests/durable-public-workflow-identity-migration.test.ts`
- `tests/wealthfactory-boundary.test.ts`
- Durable identity hunks only from:
  - `src/api/runtime-server.ts`
  - `tests/runtime-server.test.ts`
  - `src/workflows/bullmq-workflow-queue.ts`
  - `src/workflows/queue-outbox-worker.ts`
  - `tests/bullmq-workflow-queue.test.ts`
  - `tests/queue-outbox-worker.test.ts`

## Commit 2: Dashboard/start truth

Include:
- `src/api/dashboard-api.ts`
- `apps/web/src/dashboard-client.ts`
- `apps/web/src/pages/DashboardPages.tsx`
- `tests/dashboard-client.test.ts`
- Built-in dashboard/start truth hunks only from:
  - `src/api/runtime-server.ts`
  - `src/wealthfactory/workflow-registry.ts`
  - `tests/runtime-server.test.ts`
- If still tightly aligned with this slice:
  - `apps/web/src/App.tsx`
  - `apps/web/src/pages/dashboard-data.ts`
  - `apps/web/src/shell/ShellLayout.tsx`
  - `apps/web/tests/e2e/tenant-isolation.spec.ts`
  - `apps/web/tests/e2e/workflow.spec.ts`
  - `src/api/app-shell.ts`
  - `tests/dashboard-data.test.ts`
  - `tests/dashboard-pages.test.tsx`

## Commit 3: Native worker envelope / executor

Include:
- `src/harness/worker-executor.ts`
- `src/providers/native-openai-text.ts`
- `src/worker/native-executor.ts`
- `tests/harness-worker-executor.test.ts`
- `tests/native-executor.test.ts`
- `tests/native-openai-text.test.ts`
- `postOutcomeDirectives` expectation hunks only from `tests/worker-runtime.test.ts`

## Commit 4: Tenant-scoped overlay runtime registry

Include:
- Overlay/runtime-registry hunks only from:
  - `src/worker/runtime.ts`
  - `src/wealthfactory/workflow-registry.ts`
  - `tests/worker-runtime.test.ts`
  - `tests/runtime-server.test.ts`

Defer:
- docs
- handoff/todo
- environment/scripts cleanup
- unrelated package/service/test files
