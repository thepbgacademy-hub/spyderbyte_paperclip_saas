# Wealth Factory Native Execution Replacement Plan

Date: `2026-06-05`
Branch: `codex/wf-harness-design`

## Purpose

Replace the remaining Paperclip execution adapter in bounded phases, without giving up the worker, queue, harness-claim, export, or tenant-safety guardrails already proven in Wealth Factory.

This plan is the active plan of record for native execution replacement. Older harness v1 plans remain useful as historical context, but this document is the forward execution track.

## Operating Rule

Each phase is an interrupted build/test boundary.

- We do not stop every few slices just to report progress.
- We finish the active phase end to end: code, tests, reviewer pass, and full verification.
- We only move to the next phase after the current phase is green and the handoff/TODO surfaces are updated.

## Non-Negotiable Guardrails

- Keep BYOK fully owned by Wealth Factory.
- Keep queue payloads unchanged unless a later phase explicitly requires expansion.
- Keep the existing outbox, BullMQ, worker drain, claim fencing, and stale-claim fail-closed behavior.
- Keep harness lane claims and lane outcomes as the durable source of worker truth.
- Keep public board/API contracts tenant-safe and metadata-bounded.
- Do not deepen Paperclip dependency while building replacement slices.

## Phase 1: Native Executor Skeleton

Status: `completed`

Goal:
- Land a real native execution seam inside the existing worker/harness path.

Scope:
- Add an internal native executor interface behind the current private harness execution envelope.
- Keep queue payloads, HTTP routes, DB tables, and public DTOs unchanged.
- Route only explicitly opted-in workflows through the new native seam.
- Keep the Paperclip path intact for everything else.

Required outputs:
- Execution-engine selection can distinguish `paperclip`, `wf_harness_v1`, and `wf_native_v1`.
- Worker runtime can invoke a native executor instead of `paperclipClient.createRun`.
- Native execution still commits lane outcomes through the existing durable harness outcome seam.
- Native path is dark by default and explicit-opt-in by workflow id.

Non-goals:
- No first real provider lane yet.
- No first real workflow-family implementation yet.
- No new tenant-visible controls.

Exit criteria:
- Native executor seam exists and is proven in focused worker/runtime tests.
- Worker shutdown still drains in-flight native work correctly.
- Paperclip path remains unchanged for non-opted-in workflows.

## Phase 2: First Native Provider Lane

Status: `completed`

Goal:
- Replace "Paperclip receives provider context" with "Wealth Factory executes with provider context here" for one bounded lane.

Scope:
- Support one hydrated `text_generation` provider binding.
- Keep single-binding-only behavior fail-closed.
- Reuse current bound-provider and secret-hydration rules.

Required outputs:
- Native executor can consume one launch-ready provider binding.
- Missing or malformed binding fails closed before execution.
- Provider-call results normalize into the existing harness lane outcome contract.

Non-goals:
- No multi-provider workflows yet.
- No fallback to shared subscriber credentials.

Exit criteria:
- One real provider-backed native execution path is green end to end.
- Existing provider guardrails remain intact.

## Phase 3: First Native Workflow Family

Status: `completed`

Goal:
- Move one concrete workflow family off the Paperclip adapter and onto the native executor.

Scope:
- Choose one narrow workflow family with bounded success criteria.
- Implement the workflow-specific native execution logic behind the Phase 2 provider lane.
- Keep the board, claim, and outcome contracts unchanged.

Required outputs:
- One workflow family completes natively through queue -> worker -> native executor -> harness lane outcome.
- Operator/support surfaces can explain native success/failure without reopening Paperclip internals.

Non-goals:
- No broad workflow migration yet.
- No removal of Paperclip integration code yet.

Exit criteria:
- One native workflow family is proven stable under the existing verification bar.

## Phase 4: Adapter Cutover And Removal

Status: `completed`

Goal:
- Remove Paperclip as a required execution dependency for the migrated workflow family/families.

Scope:
- Cut opted-in workflow families fully over to native execution.
- Remove no-longer-needed Paperclip launch assumptions for those paths.
- Keep any still-unmigrated paths explicitly on the adapter until they have their own native replacement.

Required outputs:
- Native execution is the default for migrated workflow families.
- Paperclip adapter code is retired where it is no longer needed.
- Handoff, TODO, and runtime verification surfaces reflect the new default truth.

Exit criteria:
- Migrated workflow families no longer require the Paperclip adapter in production runtime.

Completed outcome:
- `wf_connect_first_workflow` is now native by default.
- The worker/runtime path for that workflow family no longer requires Paperclip launch env or private adapter mapping.
- Healthcheck and server bootstrap only require Paperclip launch env when configured workflows still truly route through the adapter.
- The remaining Paperclip execution dependency is explicitly limited to still-unmigrated workflow families.

## Phase 5: Redispatch-Safe Native Continuation Seam

Status: `completed`

Goal:
- Keep the already-migrated native workflow family restartable on the same run id without reopening Paperclip assumptions.

Scope:
- Preserve the current public queue payload shape and tenant-safe DTO boundaries.
- Allow resumed and unblocked same-run harness redispatch to mint a fresh BullMQ job id, and keep fresh-cycle redispatch on the same bounded token seam without reopening Paperclip assumptions.
- Keep first-launch reservation/outbox idempotency intact for initial queue admission.
- Propagate only bounded action metadata needed to derive a fresh redispatch key.

Required outputs:
- Resolved-attention and fresh-cycle dispatch hooks carry a bounded redispatch token.
- BullMQ job ids use the enqueue request idempotency key, while the queue payload keeps its existing run-identity-safe shape.
- Native continuation on the same run id no longer collapses into `already_queued` only because the original BullMQ job id was reused.
- Worker/native continuation still stays entirely off the Paperclip path for `wf_connect_first_workflow`.

Non-goals:
- No second public workflow family yet.
- No multi-provider native execution widening.
- No queue payload expansion for customer-facing or public API surfaces.

Exit criteria:
- Resumed/unblocked/native continuation dispatch is proven end to end under focused and full verification.
- The remaining native-expansion backlog is narrowed further and stays explicitly scoped away from already-migrated Paperclip-free paths.

Completed outcome:
- Harness resume/unblock/fresh-cycle redispatch now carries a bounded action token.
- Redispatch queue admission now mints a fresh BullMQ job id without widening the existing queue payload contract.
- Redispatch stages a durable outbox continuation record and relies on the existing outbox worker for safe queue admission, so transient BullMQ or Redis failures no longer strand resumed or fresh-cycle native continuation.
- `wf_connect_first_workflow` can re-enter native continuation on the same run id without colliding with its original BullMQ job id.

## Immediate Execution Order

1. Keep the migrated `wf_connect_first_workflow` native path green under the full verification bar.
2. Choose the next bounded workflow family or runtime seam for native expansion without widening Paperclip dependency again.
3. Keep the legacy Paperclip adapter backlog explicitly scoped to still-unmigrated workflows.
4. Re-run focused and full repo verification before each additional native-family cutover.
