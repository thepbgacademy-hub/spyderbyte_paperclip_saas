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

Status: `next`

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

## Immediate Execution Order

1. Start Phase 4 from the completed `wf_connect_first_workflow` native path.
2. Decide the first bounded adapter-removal seam for that workflow family.
3. Re-run focused runtime/queue verification after the first cutover slice.
4. Re-run full repo verification before retiring any Paperclip launch assumption.
