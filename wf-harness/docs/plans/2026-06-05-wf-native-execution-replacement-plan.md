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

## Phase 6: Native Start-Path Cutover Proof

Status: `completed`

Goal:
- Prove that the cut-over workflow family starts natively by default and cannot silently drift back onto the Paperclip adapter path because of env toggles or ambiguous launch selection.

Scope:
- Keep the queue payload shape unchanged.
- Tighten execution selection so native-default workflow families remain native even when a harness-enabled env flag is absent.
- Surface launch provenance on the worker start seam so support can distinguish native versus adapter starts without reopening runtime internals.
- Add focused proof at the registry, dashboard-runtime, and worker start seams.

Required outputs:
- Native-default workflow families select `wf_native_v1` before any Paperclip fallback, even when `WF_HARNESS_ENABLED_WORKFLOW_IDS` does not explicitly include them.
- Dashboard/runtime registry wiring reflects the native-default truth for `wf_connect_first_workflow` without requiring private adapter mapping.
- Worker start telemetry carries explicit execution-engine provenance for native and adapter starts.
- Native-cutover worker starts for `wf_connect_first_workflow` remain off the Paperclip adapter path even when Paperclip launch env is absent and no harness-enabled env flag is set.

Non-goals:
- No second native workflow family yet.
- No queue payload expansion.
- No Paperclip removal for still-unmigrated workflow families.

Exit criteria:
- Focused tests prove native-default selection, dashboard-runtime cutover truth, and worker start provenance.
- Full repo verification is green after the cutover-proof changes.
- Handoff and TODO surfaces point to the next bounded native-expansion seam instead of adapter hardening for the already-migrated family.

Completed outcome:
- `wf_connect_first_workflow` now stays on `wf_native_v1` by default instead of requiring an explicit harness-enabled env flag to avoid silent fallback.
- The dashboard/runtime registry now treats the cut-over workflow family as native without private adapter mapping, even when runtime env leaves the harness-enabled list empty.
- Worker start telemetry now records the selected execution engine, so operator/support traces can distinguish native starts from adapter starts directly at the worker seam.
- Focused and full verification now prove the native start path stays off Paperclip for the cut-over workflow family under default-native configuration.

## Phase 7: Second Native Workflow Family Migration

Status: `completed`

Goal:
- Migrate the next smallest named Paperclip-routed workflow family onto the already-proven native execution plane without widening queue payloads, board exposure, or adapter assumptions.

Scope:
- Formalize `wf_tax_strategy` as a real Wealth Factory workflow family instead of leaving it as a selector/env placeholder.
- Keep the existing native provider lane and harness runtime contract.
- Keep board exposure explicit and env-gated even while the worker/runtime path becomes native by default, and do not widen the board start seam beyond workflows that already have proven package/install wiring.
- Add focused proof that `wf_tax_strategy` stays off Paperclip on the worker start path and through native execution.

Required outputs:
- `wf_tax_strategy` exists as a real registry definition with package identity and required capabilities.
- `wf_tax_strategy` is harness-eligible and native-default without requiring Paperclip launch env.
- The native executor has a bounded workflow-family implementation for `wf_tax_strategy`.
- Registry, env, runtime-server, and worker-runtime tests prove the new family stays on `wf_native_v1` and does not silently reopen the Paperclip path.

Non-goals:
- No queue payload expansion.
- No new multi-provider execution shape.
- No migration of broader social/package-followup families in the same phase.

Exit criteria:
- `wf_tax_strategy` is proven end to end on the native worker/runtime path.
- Full repo verification is green after the new family lands.
- Handoff and TODO surfaces point at the next bounded native-expansion seam and explicitly leave dashboard/start-path widening for a later dedicated phase.

Completed outcome:
- `wf_tax_strategy` is now a real Wealth Factory workflow family with a bounded native registry definition.
- The native executor now owns a tenant-safe Tax Strategy Workflow decision contract on the same OpenAI-backed provider lane used by the first family.
- Env validation, registry wiring, dashboard/runtime registry truth, and worker-runtime proofs now treat `wf_tax_strategy` as native-default instead of Paperclip-routed on the worker/runtime seam.
- `wf_tax_strategy` worker starts now stay off Paperclip launch env and emit explicit `wf_native_v1` execution-engine provenance on the worker seam.
- Board/start exposure intentionally remains limited to the already-proven package-wired workflow family until the selector and entitlement seam is widened in a dedicated follow-up phase.

## Phase 8: Native Board/Start Selector Widening

Status: `completed`

Goal:
- Widen the board/start seam so more than one already-native workflow family can be exposed safely without ambiguous dashboard bootstrap, invalid child-lane contracts, or dead-start package/install drift.

Scope:
- Add an explicit board selector seam for live board bootstrap.
- Keep the worker/runtime native execution plane unchanged.
- Allow board exposure for `wf_tax_strategy` only once selector resolution, deliverable catalog shape, and repo-local package/demo wiring are present.
- Keep request/response widening minimal and tenant-safe.

Required outputs:
- The board/start seam accepts an explicit workflow selector and no longer hard-fails just because multiple board workflows are exposed.
- `wf_tax_strategy` becomes board-exposed only through the new explicit selector path.
- The harness board contract accepts `tax_strategy_review` for the tax workflow family.
- Local demo/package wiring can seed a real tax-strategy package/install path instead of leaving that family as a registry-only string.

Non-goals:
- No new execution engine.
- No multi-provider widening.
- No broad dashboard navigation rewrite beyond the selector seam needed for board bootstrap.

Exit criteria:
- Focused tests prove selector parsing through the HTTP and client seams, board-service resolution under multiple exposed workflows, and tax-strategy board deliverable acceptance.
- Full repo verification is green after the selector/package/catalog widening.
- Handoff and TODO surfaces point to the next bounded native-expansion seam rather than treating the board/start surface as still single-workflow-only.

Completed outcome:
- `GET /api/harness/board` now accepts an explicit workflow selector while preserving the existing bounded response shape.
- The board service now resolves multiple board-exposed workflow families safely when a selector is provided, instead of forcing a generic ambiguous-board failure.
- `wf_tax_strategy` is now board-exposed on purpose, and the harness deliverable catalog admits `tax_strategy_review` so its native lane shape matches the public board contract.
- Local demo seed profiles and package insert wiring can now seed a tax-strategy package/install path instead of always writing the social-media package identity.

## Immediate Execution Order

1. Keep the migrated `wf_connect_first_workflow` native path green under the full verification bar.
2. Keep the migrated `wf_tax_strategy` native worker/runtime and board/start paths green under the full verification bar.
3. Choose the next bounded workflow family or runtime seam for native expansion without widening Paperclip dependency again.
4. Keep the legacy Paperclip adapter backlog explicitly scoped to still-unmigrated workflows.
5. Re-run focused and full repo verification before each additional native-family cutover.
