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
- Do not promote package-specific, industry-specific, demo, or overlay workflows into the core Wealth Factory registry unless the design docs explicitly change first.

## Phase Alignment Gate

Every future phase must pass this gate before it can be marked complete.

- Re-read `wf-harness/docs/2026-05-21-wf-harness-v1-design.md`, `wf-harness/docs/paperclip-pressure-lessons-and-wealth-factory-guardrails.md`, this plan, `wf-harness/TODO.md`, and `wf-harness/HANDOFF.md` before implementation closeout.
- Compare the completed work against those docs explicitly, not from memory.
- Fail the phase if the code or docs promote package-overlay content into core-platform truth without prior design approval.
- Fail the phase if the “next phase” direction is driven by fixture/demo/package convenience rather than the design docs and plan of record.
- A phase is not complete until code, tests, reviewer pass, and a drift/alignment check are all green.

## Phase 13: Package-Overlay Workflow Registration Seam

Status: `completed`

Goal:
- Land the registration seam that allows industry/package-specific workflows to come from installed package context without entering the core built-in Wealth Factory registry.

Scope:
- Keep the built-in Wealth Factory workflow registry platform-level.
- Allow additive package-overlay workflow definitions to register from installed package context.
- Fail closed if an overlay attempts to override a built-in workflow id.
- Keep overlay registration separate from board exposure, harness eligibility, and native-default execution.

Required outputs:
- Installed-package overlay workflows can register additively into the server-side registry.
- Built-in id override attempts fail closed.
- Overlay workflows stay `paperclip`-routed unless a later explicit promotion changes that truth.
- Overlay workflows remain off board/start surfaces unless separately exposed.

Non-goals:
- No broad runtime adoption of package overlays yet.
- No native cutover for package-overlay workflows in this phase.
- No promotion of overlay workflows into the built-in registry.

Exit criteria:
- Focused tests prove overlay registration works only from installed package context.
- Focused tests prove duplicate built-in ids are rejected.
- Registry/runtime/board tests stay green with the additive overlay seam present.
- Handoff, TODO, and design docs record the alignment result explicitly.

Completed outcome:
- The Wealth Factory registry now has an additive package-overlay registration seam.
- Package-scoped workflows can be supplied from installed package context without becoming built-in registry defaults.
- Duplicate-id override attempts now fail closed instead of letting overlays shadow built-in workflow ids.
- Overlay registration remains distinct from board exposure, harness eligibility, and native-default execution.

## Phase 14: Core Exception Codification

Status: `completed`

Goal:
- Codify the currently intentional core built-in workflow-family exceptions after the overlay seam landed, so the design boundary is explicit and future family additions do not drift into the core registry by convenience.

Scope:
- Record `wf_connect_first_workflow`, `wf_tax_strategy`, and `wf_package_followup` as the current intentional core built-in workflow-family exceptions.
- State that future industry-specific or package-specific workflow families must use the package-overlay registration seam unless the source-of-truth design doc is explicitly revised first.
- Keep runtime eligibility, dashboard exposure, public start-surface widening, and native-default widening out of scope for this phase.
- Align the plan, design doc, TODO, and handoff surfaces to the same bounded rule set.

Required outputs:
- The named three-family core exception list is explicit in the docs.
- The overlay seam is documented as the default path for future industry/package workflow families.
- The docs explicitly say this phase does not widen runtime, dashboard, native-default, or start-surface truth.

Non-goals:
- No new built-in workflow families.
- No board/start widening.
- No runtime/native execution widening.
- No change to overlay registration semantics beyond documenting the already-landed rule.

Exit criteria:
- The design doc, active plan, TODO, and handoff all name the same three intentional core exceptions.
- Those same surfaces all state that future industry/package families must use overlays unless the design docs change first.
- Those same surfaces all keep runtime/dashboard/native widening explicitly out of scope.

Completed outcome:
- `wf_connect_first_workflow`, `wf_tax_strategy`, and `wf_package_followup` are now documented as the current intentional core built-in workflow-family exceptions.
- The overlay seam is now documented as the required default path for future industry-specific and package-specific workflow families unless the design docs are intentionally revised first.
- This documentation phase intentionally did not widen runtime eligibility, dashboard exposure, public start surfaces, or native-default execution.

## Phase 15: Installed-Package Overlay Runtime Activation

Status: `completed`

Goal:
- Activate the already-landed overlay seam inside the real runtime-backed registry path so installed-package workflow definitions become available only from installed package context, without promoting them into core platform truth.

Scope:
- Thread active installed-package context into the runtime-backed harness registry resolver.
- Keep overlay workflows additive, install-scoped, and fail-closed when no installed package context exists.
- Keep overlay workflows `paperclip`-routed, non-native-default, and off board exposure by default.
- Neutralize package-overlay example naming where it risks reading like baked-in Wealth Factory product scope.

Required outputs:
- Runtime-backed registry construction can include installed package overlay definitions for the authenticated tenant.
- The same overlay workflow stays absent when no active installed package context exists.
- Overlay workflows remain outside the core exception list, native-default list, and default board-exposed list.
- Tests and docs make the anti-drift rule explicit: package examples do not redefine core platform scope.

Non-goals:
- No new core built-in workflow families.
- No board/start widening for overlay workflows by default.
- No native cutover for overlay workflows.
- No queue payload redesign or worker/orchestrator policy expansion.

Exit criteria:
- Focused runtime/board/boundary tests prove install-scoped overlay activation and fail-closed absence without installed package context.
- Build and lint stay green after the registry-scoping change.
- Plan, design doc, TODO, and handoff all record that overlay activation is runtime-scoped only and not a promotion into core-platform seams.

Completed outcome:
- The runtime-backed harness board path can now resolve installed-package overlay workflow definitions from active tenant install context instead of env flags alone.
- Overlay workflows still stay `paperclip`-routed, outside the three core exceptions, and off board exposure by default.
- Neutralized test/package example naming so package-overlay fixtures no longer read like a baked-in social-media product branch.

## Phase 16: Bounded CEO Approval Policy Completion

Status: `completed`

Goal:
- Finish the remaining bounded CEO approval-policy gap by making pending-approval guidance reflect the same governance pressure the engine will actually apply when the CEO reviews follow-on work.

Scope:
- Complete the pending-approval read-model seam so recommendation metadata can inherit bounded unresolved-governance context when a newer repeated request is already effectively headed toward defer.
- Surface bounded policy labels and next-review timing on proposed approvals when the live board state or prior unresolved governance hold already makes the likely decision path non-approval.
- Keep the change inside proposal-decision/read-model policy only.

Required outputs:
- Proposed approvals no longer default to `approve` when the bounded policy truth is already `defer`.
- Repeated unresolved requests can inherit the latest earlier unresolved governance hold for board guidance without reopening a second policy heuristic seam in the client.
- Completed-cycle and persona-focus proposal guidance stay contract-owned in the board payload.

Non-goals:
- No registry widening.
- No overlay promotion.
- No board/start exposure widening.
- No native/provider execution-policy change.
- No queue, worker, or Paperclip-routing redesign.

Exit criteria:
- Focused board-service tests prove proposed approvals recommend `defer` for completed-cycle and inherited unresolved-governance cases where approval would not be the truthful next move.
- Full `tests/harness-board-service.test.ts` stays green.
- Plan, TODO, and handoff all record that this phase stayed inside proposal-decision/read-model policy and did not widen runtime or registry seams.

Completed outcome:
- Pending-approval contract guidance now reflects bounded governance pressure instead of always recommending `approve` for every proposed item.
- Proposed requests can inherit the latest earlier unresolved governance hold when that earlier hold is the real reason a repeated follow-on request should pause.
- Completed-cycle and persona-focus guidance now stay engine-owned in the board payload before the CEO clicks a decision.

## Phase 17: Governance-History Export Delivery Hardening

Status: `completed`

Goal:
- Finish the bounded governance-history export-delivery phase by proving the frozen closed-board snapshot remains the source of truth all the way through the real export-ready bundle path, not only in preview/dry-run helpers.

Scope:
- Stay inside the `governance_history_export` candidate family.
- Harden and verify the export-ready bundle path against post-closure governance noise.
- Keep the delivery seam tied to frozen governance-history snapshots, action tokens, and bounded tenant-safe receipts.

Required outputs:
- Real governance-history export bundles stay frozen after post-closure decision noise.
- The export-ready path is explicitly verified against the same immutability rule already expected of the dry-run path.
- Phase records align the codebase with the already-landed delivery seam instead of leaving it as unrecorded drift.

Non-goals:
- No package-overlay promotion.
- No registry, board/start, or native/provider widening.
- No package-bundle delivery expansion in the same phase.
- No reopening of live proposal/approval policy.

Exit criteria:
- Focused tests prove the real governance-history export bundle path stays frozen after post-closure governance noise.
- Full `tests/harness-board-service.test.ts` stays green.
- Build and lint stay green.
- Plan, TODO, and handoff record that this phase is export-delivery hardening on the frozen governance-history seam only.

Completed outcome:
- The real governance-history export-ready path is now explicitly proven to reuse the frozen closed-board governance snapshot even after later governance noise lands in mutable decision tables.
- The phase record now matches the already-landed delivery seam instead of leaving governance-history export delivery as implicit code-only progress.

## Phase 18: Package-Bundle Export Delivery Hardening

Status: `completed`

Goal:
- Finish the bounded package-bundle export-delivery hardening phase by proving the real package-bundle export-ready bundle path stays pinned to the persisted closed-board `completionPackage` snapshot even after later mutable governance noise appears.

Scope:
- Stay inside the `package_bundle_export` candidate family.
- Harden and verify the real export-ready package bundle path against post-closure governance noise.
- Keep the package-bundle export seam tied to the persisted `completionPackage` snapshot and the already-required governance-history delivery dependency.

Required outputs:
- Real package-bundle export bundles stay frozen after post-closure governance noise.
- The export-ready package path is explicitly verified against the same frozen-snapshot rule already expected of the persisted completion-package seam.
- Phase records align the codebase with the already-landed package-bundle delivery seam instead of leaving it as unrecorded drift.

Non-goals:
- No package-overlay promotion.
- No registry, board/start, or native/provider widening.
- No worker/runtime delivery-policy redesign.
- No reopening of governance-history export policy beyond satisfying the existing package dependency rule.

Exit criteria:
- Focused tests prove the real package-bundle export bundle path stays frozen after post-closure governance noise.
- Full `tests/harness-board-service.test.ts` stays green.
- Build and lint stay green.
- Plan, TODO, and handoff record that this phase is package-bundle export-delivery hardening on the persisted `completionPackage` seam only.

Completed outcome:
- The real package-bundle export-ready path is now explicitly proven to reuse the frozen closed-board `completionPackage` snapshot even after later governance noise lands in mutable tables.
- The phase record now matches the already-landed package-bundle delivery seam instead of leaving package-bundle export hardening as implicit code-only progress.

## Phase 19: Obsidian Memory-Boundary Codification

Status: `completed`

Goal:
- Codify the first explicit source-of-truth split between Wealth Factory operational runtime memory and later tenant-owned Obsidian long memory, using the already-landed `memoryBoundary` contract and hardened export seams as the phase anchor.

Scope:
- Keep lane continuity and pending-attention memory explicitly operational and Wealth Factory-owned only.
- Keep governance-history and package-bundle record promotion explicitly tenant-owned-later through the existing export candidate families.
- Align the design doc, guardrails doc, active plan, TODO, and handoff on the same runtime-vs-tenant-memory rule set.
- Add a focused contract proof that the closed-board board response still exposes this split truthfully.

Required outputs:
- Runtime continuity memory is explicitly documented as operational-only and non-promotable into tenant-owned long memory.
- Governance-history and package-bundle records are explicitly documented as tenant-owned-later export candidates, not live runtime truth.
- Focused tests prove the board contract keeps operational continuity memory runtime-only while closed-board export records stay tenant-owned-later.

Non-goals:
- No new workflow-family migration.
- No board/start/runtime widening.
- No overlay promotion into the core registry.
- No new export family or live Obsidian sync expansion.
- No queue, worker, provider, or delivery-policy redesign.

Exit criteria:
- Focused board-service tests prove the runtime-vs-tenant-owned memory split directly.
- Full `tests/harness-board-service.test.ts` stays green.
- Build and lint stay green.
- Plan, design, guardrails, TODO, and handoff all name the same bounded memory-boundary rules.

Completed outcome:
- The source-of-truth docs now explicitly say lane continuity and pending-attention memory stay operational and Wealth Factory-owned only.
- The source-of-truth docs now explicitly say governance-history and package-bundle exports are tenant-owned-later record candidates promoted only through the existing bounded export families.
- The board contract now has an explicit focused proof for that split instead of relying only on broader metadata assertions.

## Phase 20: Canonical Installed-Package Overlay Catalog Wiring

Status: `completed`

Goal:
- Finish the installed-package overlay path by resolving overlay workflow definitions from a canonical package catalog keyed by active tenant installs, while keeping Wealth Factory core framework-agnostic and deferring free-form framework implementation.

Scope:
- Resolve active installed package ids into canonical package definitions before building the runtime-scoped workflow registry.
- Keep overlay workflows additive, install-scoped, Paperclip-routed, non-native-default, and off board exposure by default.
- Keep package definitions fail-closed when a package workflow is not explicitly included or when an overlay attempts to reuse a core built-in workflow id.
- Align the source-of-truth docs so Wealth Factory core stays framework-agnostic, prebuilt business models stay overlay/package-scoped, and a future free-form tenant-authored lane is explicitly planned but not yet implemented.

Required outputs:
- Runtime-scoped registry resolution uses active tenant package installs plus the canonical package catalog to supply overlay workflow definitions.
- Overlay workflow ids remain absent when no active installed package context exists.
- Invalid overlay definitions fail closed rather than widening core registry truth.
- The design, guardrails, TODO, and handoff surfaces all record the framework-agnostic core rule and the deferred free-form tenant lane.

Non-goals:
- No promotion of package overlays into the built-in core registry.
- No board/start exposure widening for overlay workflows.
- No native-default cutover for overlay workflows.
- No implementation of the free-form blank-canvas tenant-authoring lane in this phase.

Exit criteria:
- Focused boundary, board-service, runtime-server, and package-service tests prove catalog-backed overlay resolution and fail-closed boundary behavior.
- Full repo verification is green after the catalog/runtime wiring and docs alignment.
- Phase closeout records that Wealth Factory core remains framework-agnostic and that free-form business modeling is planned but intentionally deferred.

Completed outcome:
- The runtime-backed registry resolver now hydrates installed-package overlay workflows from a canonical package catalog keyed by active tenant installs instead of relying on ad hoc overlay shape.
- Overlay workflows still stay outside the core built-in exception list, outside native-default execution, and outside board exposure by default.
- Fail-closed coverage now proves hidden package workflows do not register unless explicitly included and that overlay definitions cannot override core built-in workflow ids.
- Source-of-truth docs now explicitly say Wealth Factory core stays framework-agnostic, prebuilt business frameworks stay package/overlay-scoped, and a later free-form tenant-authored lane must compose through the same seams instead of entering core as drift.

## Phase 21: Deliberate Installed-Package Overlay Board Exposure

Status: `completed`

Goal:
- Widen the harness board selector seam so an installed-package overlay can become tenant-visible only when the canonical package definition explicitly opts into board exposure and active installed package context resolves it.

Scope:
- Keep overlay registration additive and install-scoped.
- Allow board exposure for an installed-package overlay only when the package workflow definition explicitly opts in.
- Keep overlay workflows `paperclip`-routed, non-native-default, and outside the core built-in exception list.
- Align design, guardrails, TODO, and handoff wording with the new bounded board-exposure rule.

Required outputs:
- Package workflow definitions can declare bounded overlay board exposure.
- Runtime-scoped registry resolution exposes only those installed-package overlays that are both install-resolved and explicitly board-opted-in.
- Overlay workflows without explicit board opt-in remain absent from the board selector even when installed and harness-enabled.
- Focused tests prove board exposure widening does not imply harness eligibility or native-default execution.

Non-goals:
- No promotion of package overlays into the core built-in registry.
- No native-default cutover for overlay workflows.
- No Paperclip-routing change for overlays.
- No free-form tenant-authored blank-canvas implementation.
- No queue payload or worker-runtime redesign.

Exit criteria:
- Boundary, board-service, and runtime-server tests prove explicit overlay board exposure and fail-closed absence without package opt-in.
- Full repo verification is green after the board-exposure widening.
- Docs record that overlay board exposure is now explicit-package-opt-in, not an automatic side effect of overlay registration.

Completed outcome:
- Installed-package overlays can now become board-selectable through the runtime-backed harness registry only when the canonical package definition explicitly opts into board exposure.
- Overlay workflows still remain `paperclip`-routed, non-native-default, and outside the core built-in workflow exception list.
- Fail-closed coverage now proves package overlays stay off the board when the package definition omits board exposure, even if the overlay is otherwise installed and resolvable.

## Phase 22: First Native Installed-Package Overlay Workflow Family

Status: `completed`

Goal:
- Migrate the first installed-package overlay workflow family onto the native executor seam without promoting overlay workflows into core built-in truth or widening overlay policy globally.

Scope:
- Keep the work bounded to explicitly native-enabled package overlays resolved from active installed package context.
- Keep core built-in workflow truth unchanged.
- Keep overlay board exposure and overlay native execution as two separate explicit package-definition opt-ins.
- Add the first workflow-family native implementation for the canonical overlay example.

Required outputs:
- Package workflow definitions can explicitly opt an installed-package overlay into native execution.
- Runtime-scoped registry resolution marks that overlay harness-eligible and `wf_native_v1` only when active installed package context resolves it.
- Environment validation no longer incorrectly requires Paperclip launch env for the canonical native-enabled overlay workflow id.
- Worker runtime can execute the first native overlay family end to end through the existing provider-bound native seam.

Non-goals:
- No promotion of package overlays into the core built-in registry.
- No widening of overlay native execution to every overlay by default.
- No queue payload, provider-binding, or board-selector redesign.
- No free-form tenant-authored blank-canvas implementation.

Exit criteria:
- Boundary, runtime-server, env, and worker-runtime tests prove explicit overlay native execution and fail-closed absence without package opt-in.
- Full repo verification is green after the overlay-native cutover.
- Docs record that overlay native execution is now explicit-package-opt-in, not an automatic side effect of overlay registration or board exposure.

Completed outcome:
- The canonical installed-package overlay workflow `wf-seo-audit` now runs on `wf_native_v1` when the active installed package context resolves `pkg-brand-seo` and the package definition explicitly opts into native execution.
- Overlay native execution remains overlay-scoped and explicit-package-opt-in; it does not add overlay workflows to the core built-in exception list.
- Worker outcome commit and runtime env validation now respect the same tenant-scoped overlay-native truth instead of assuming only core built-in workflows can be native.

## Phase 23: Public Dashboard Catalog And Start-Surface Fencing

Status: `completed`

Goal:
- Keep the public dashboard workflow catalog and run-start seam truthful after the overlay registration, board exposure, and native-execution phases landed, so registry-only overlay ids cannot be mistaken for public dashboard start availability.

Scope:
- Fail closed when `POST /api/dashboard/runs` targets a workflow id that is not present in the tenant-visible dashboard workflow catalog.
- Preserve the existing separation between overlay registration, overlay board exposure, overlay native execution, and public dashboard start availability.
- Keep queue payloads, reservation/outbox flow, and worker/runtime execution policy unchanged.

Required outputs:
- The authenticated dashboard API validates run-start requests against the same tenant-visible dashboard workflow catalog it already exposes.
- Registry-only overlay ids such as `wf-seo-audit` are explicitly rejected on the public dashboard start seam until a later dedicated public-start widening phase says otherwise.
- Runtime-server coverage proves the public dashboard seam fails closed on overlay-only workflow ids instead of quietly queuing them through the legacy template path.

Non-goals:
- No overlay promotion into the core built-in registry.
- No new overlay workflow family.
- No widening of public start availability for board-exposed overlays in this phase.
- No queue, reservation, or worker payload redesign.

Exit criteria:
- Focused API/runtime tests prove run-start requests must target a workflow in the tenant-visible dashboard catalog.
- Focused API/runtime tests prove overlay-only registry ids fail closed on the public dashboard start seam.
- Plan, TODO, handoff, and guardrail/design surfaces all record that public dashboard start remains a separate explicit seam from overlay registration, board exposure, and native execution.

Completed outcome:
- The public dashboard start seam now validates workflow ids against the tenant-visible dashboard workflow catalog before attempting queue reservation.
- Registry-only overlay ids such as `wf-seo-audit` now fail closed on `POST /api/dashboard/runs`, preserving the design boundary that overlay board/native truth does not automatically imply public dashboard start availability.
- The phase closes the customer-facing catalog/start drift gap without widening core exceptions, overlay policy, queue payloads, or worker/runtime execution seams.

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

## Phase 9: Third Native Harness Workflow Family Migration

Status: `completed`

Goal:
- Migrate the next bounded harness-native workflow family onto the existing native worker/runtime seam without widening the board/start exposure boundary or reopening Paperclip fallback.

Scope:
- Formalize `wf_package_followup` as a real Wealth Factory workflow family with package identity, deliverable catalog, and native-default execution.
- Reuse the existing native provider lane and harness outcome contract.
- Keep board/start exposure unchanged so only explicitly board-wired families remain tenant-visible there.
- Add focused proof that `wf_package_followup` stays off Paperclip on the worker/runtime start path and completes through the native executor seam.

Required outputs:
- `wf_package_followup` exists as a real registry definition with package identity and required capabilities.
- `wf_package_followup` is harness-eligible and native-default without requiring Paperclip launch env.
- The native executor has a bounded workflow-family implementation for `wf_package_followup`.
- Registry, env, runtime-server, and worker-runtime tests prove the new family stays on `wf_native_v1` and does not silently reopen the Paperclip path.

Non-goals:
- No board/start exposure widening for `wf_package_followup` in this phase.
- No queue payload expansion.
- No multi-provider execution widening.

Exit criteria:
- `wf_package_followup` is proven end to end on the native worker/runtime path.
- Full repo verification is green after the new family lands.
- Handoff and TODO surfaces point at the next seam: deliberate board/start widening for additional native families or the next bounded family migration.

Completed outcome:
- `wf_package_followup` is now a real Wealth Factory workflow family with a bounded native registry definition.
- The native executor now owns a tenant-safe Package Follow-up Workflow decision contract on the same OpenAI-backed provider lane used by the earlier native families.
- Env validation, registry wiring, dashboard/runtime registry truth, and worker-runtime proofs now treat `wf_package_followup` as native-default instead of Paperclip-routed on the worker/runtime seam.
- `wf_package_followup` worker starts now stay off Paperclip launch env and emit explicit `wf_native_v1` execution-engine provenance on the worker seam.
- Board/start exposure intentionally remains limited to `wf_connect_first_workflow` and `wf_tax_strategy`, so `wf_package_followup` does not become tenant-visible there until a later explicit widening phase.

## Phase 10: Deliberate Board Exposure Widening For `wf_package_followup`

Status: `completed`

Goal:
- Widen the explicit board selector and local package/demo wiring so `wf_package_followup` becomes tenant-visible on the board seam without overstating the still-separate public run-start API seam.

Scope:
- Add `wf_package_followup` to the explicit board-exposed workflow allowlist.
- Reuse the existing explicit selector seam rather than inventing a new board bootstrap path.
- Add bounded board-service proof that the Package Follow-up workflow accepts only its own deliverable catalog on the selected board.
- Add local demo/package seed truth for the Package Follow-up workflow family so board/package setup is not left as registry-only metadata.
- Keep the worker/runtime native path unchanged and do not claim that the dashboard start button is already a real queue-reservation path for every exposed family.

Required outputs:
- `wf_package_followup` is board-exposed only through the explicit workflow selector seam.
- The board contract accepts Package Follow-up deliverables and rejects deliverables outside that family boundary.
- The client, HTTP, routing, and runtime registry seams all preserve the `workflowId=wf_package_followup` selector truth.
- Local demo seed profiles include a built-in Package Follow-up preset with package identity and workflow copy aligned to the native registry definition.

Non-goals:
- No new public run-start API or queue reservation flow in this phase.
- No widening of dashboard/start claims beyond the existing selector/bootstrap seam.
- No migration of another workflow family in the same phase.

Exit criteria:
- Focused tests prove the widened board exposure, selector threading, board deliverable guardrails, and local demo/package preset truth.
- Full repo verification is green after the widening lands.
- Handoff and TODO surfaces point at the next seam: either the real public run-start cutover for the widened native families or the next bounded workflow-family migration.

Completed outcome:
- `wf_package_followup` is now part of the explicit board-exposed workflow allowlist instead of staying worker-only.
- The board service now accepts the Package Follow-up deliverable catalog on the selected Package Follow-up board and still fails closed on out-of-family deliverables.
- Client routing, HTTP selector parsing, runtime registry truth, and local demo seed wiring now all recognize the Package Follow-up workflow family directly.
- This phase intentionally stops short of claiming full public run-start cutover; the board exposure is now truthful, while the deeper start-path/API seam remains a later dedicated phase.

## Phase 11: Public Run-Start API Cutover For Widened Native Families

Status: `completed`

Goal:
- Replace the fake dashboard queued-state stub with a real authenticated API-to-reservation cutover for the already-widened native workflow families, while keeping the existing outbox-first queue discipline and avoiding direct worker launch from the browser.

Scope:
- Add a bounded authenticated dashboard run-start HTTP route.
- Route that new public seam into the existing ACID reservation + workflow queue outbox staging path.
- Update the browser dashboard client to call the real start endpoint and preserve bounded error codes.
- Update the app start action to use the real runtime API when the app is running behind the authenticated runtime shell, while keeping the browser-only bootstrap shell fallback for local/demo surfaces that do not have the runtime API.

Required outputs:
- `POST /api/dashboard/runs` exists as a guarded authenticated runtime route.
- The runtime dashboard composition can start a run only when queue start wiring is available, and fails closed otherwise.
- The browser dashboard client can start a workflow run and preserve bounded `invalid_request`, `conflict`, `rate_limited`, and `service_unavailable` failure codes.
- The app start button no longer marks a runtime-backed workflow as queued before the API confirms reservation.

Non-goals:
- No direct browser-to-worker launch path.
- No queue-engine rewrite.
- No removal of the browser-only bootstrap/demo fallback in this phase.
- No new board widening beyond the already-selected workflow families.

Exit criteria:
- Focused tests prove the new dashboard POST route, runtime composition wiring, and browser client mutation seam.
- Full repo verification is green after the cutover lands.
- Handoff and TODO surfaces explicitly distinguish the now-real runtime-backed public start seam from the still-existing browser-only fallback shell.

Completed outcome:
- The public runtime-backed dashboard now exposes `POST /api/dashboard/runs` as a real authenticated start path instead of only a local queued-state UI stub.
- That public start path composes the existing ACID reservation and outbox staging seam rather than bypassing it, so the browser never launches workers directly.
- The browser dashboard client now knows how to start workflow runs and preserve bounded failure codes for operator/member handling.
- The app start button now waits for runtime-backed queue confirmation before surfacing `queued`, while the browser-only bootstrap shell still uses a bounded fallback path for local/demo surfaces that do not have the runtime API.

## Phase 12: Remove Fake Browser-Only Run-Start Success

Status: `completed`

Goal:
- Keep the real authenticated dashboard run-start seam as the only public path that can claim a queued workflow run, while preserving preview-only board/bootstrap shells for local and demo use.

Scope:
- Remove the fake browser-only `queued` success path from the dashboard start action.
- Fail closed when a bootstrap-only browser shell tries to start a workflow without the authenticated runtime API.
- Keep the preview-only board fallback and localhost contract previews unchanged.
- Tighten the workflow start UI copy so preview shells no longer look launch-capable.

Required outputs:
- Bootstrap-only dashboard shells no longer synthesize a local queued run id or navigate to results as if a real queue reservation happened.
- The browser dashboard client returns a bounded `service_unavailable` failure when no runtime-backed start seam exists.
- The workflow start button is disabled in preview-only shells and explains that real starts require the authenticated runtime shell.

Non-goals:
- No removal of the localhost board preview fallback.
- No new workflow-family migration in this phase.
- No runtime reservation/outbox rewrite.

Exit criteria:
- Focused tests prove bootstrap-only browser shells fail closed on start and the workflow UI no longer looks runnable there.
- Existing dashboard HTTP/runtime start tests remain green and continue to prove the real authenticated start seam.
- Handoff and TODO surfaces now point back to the next bounded native workflow-family formalization or migration seam instead of the fake browser-only start cleanup.

Completed outcome:
- The fake browser-only run-start success path is gone from the dashboard app surface.
- Bootstrap-only shells now fail closed on workflow start instead of inventing `preview-local-run` success.
- The workflow start UI and Home-page launch guidance now make the runtime-shell requirement explicit while leaving the board preview/demo fallback intact for truthful local contract work.
- End-to-end preview-shell coverage now proves the browser surface stays review-only even after provider setup, instead of silently reenabling a fake queued run path.

## Phase 24: Tenant-Scoped Installed-Package Overlay Runtime And Board Resolution

Status: `completed`

Goal:
- Replace the remaining shared/static installed-overlay assumption on the runtime, board, and worker seams with active tenant install resolution, while keeping the public dashboard catalog/start seam explicitly fenced until a later dedicated widening phase.

Scope:
- Resolve installed package ids into canonical package workflow definitions per tenant on the runtime-backed board/auth surface.
- Resolve the worker harness registry per tenant before selecting execution engine or reconstructing follow-on native execution envelopes.
- Keep the first canonical installed-package overlay workflow family (`wf-seo-audit`) native only when active tenant install context resolves the package and the package definition explicitly opts into native execution.
- Keep preview/bootstrap dashboard shells truthful by requiring explicit runtime bootstrap for real workflow starts and by removing package naming that reads like baked-in product identity.

Required outputs:
- Runtime-backed board authorization can resolve installed-package overlay workflows from active tenant install context instead of a process-wide static registry assumption.
- Worker execution-engine selection and follow-on native envelope reconstruction stay tenant-scoped for installed-package overlays.
- The first canonical overlay workflow family (`wf-seo-audit`) is proven native on the worker/runtime seam only when tenant install context resolves `pkg-brand-seo`.
- Preview-only shells stay review-only and require explicit runtime bootstrap before exposing real workflow-start behavior.

Non-goals:
- No widening of the public dashboard workflow catalog or `POST /api/dashboard/runs` for overlay workflows in this phase.
- No promotion of installed-package overlays into the core built-in exception list.
- No queue payload expansion, provider-lane widening, or new framework-specific product identity in core Wealth Factory.

Exit criteria:
- Focused runtime-server, worker-runtime, board-service, browser client, and boundary tests prove tenant-scoped overlay resolution and truthful preview-shell start behavior.
- Full repo verification, including lint, build, and browser E2E, is green after the phase lands.
- Handoff and TODO surfaces record that board/runtime/native overlay truth is now tenant-scoped, while public dashboard catalog/start widening remains a later explicit phase.

Completed outcome:
- Runtime-backed board authorization can now resolve installed-package overlay workflows from active tenant installs through canonical package definitions instead of assuming a shared static overlay registry.
- Worker execution-engine selection, native lane dispatch, and follow-on envelope reconstruction now stay tenant-scoped for installed-package overlays, including the canonical `wf-seo-audit` family.
- The first native overlay family remains fail-closed when no active tenant install resolves `pkg-brand-seo`, preserving the overlay boundary instead of promoting `wf-seo-audit` into core workflow truth.
- Preview/bootstrap dashboard shells now require explicit runtime bootstrap before exposing real workflow starts, and the package-facing copy was neutralized so installed packages do not read like built-in product identity.

## Phase 25: Tenant-Scoped Installed-Package Overlay Public Dashboard Catalog And Start Widening

Status: `completed`

Goal:
- Widen the public dashboard workflow catalog and run-start seam in one bounded way so tenant-scoped installed-package overlays can become customer-visible and startable only when the canonical package definition explicitly opts into that public surface and active installed package context resolves the overlay.

Scope:
- Resolve public dashboard workflow-catalog entries for installed-package overlays per tenant from active installed package context plus canonical package definitions.
- Allow `POST /api/dashboard/runs` to start an installed-package overlay only when that workflow is present in the same tenant-visible public dashboard catalog.
- Keep the public dashboard seam separate from overlay registration, overlay board exposure, and overlay native execution by requiring explicit package-definition public opt-in.
- Keep the existing fail-closed catalog validation path in place and reuse it for overlay workflow ids.

Required outputs:
- The authenticated dashboard workflow catalog can include installed-package overlays only when canonical package definitions explicitly opt them into the public dashboard surface and tenant install context resolves them.
- `POST /api/dashboard/runs` can start those tenant-visible overlays only through the same catalog-backed validation seam.
- Registry-only, board-only, or native-only overlay ids still fail closed on the public dashboard start seam when the overlay is not tenant-visible in that catalog.

Non-goals:
- No promotion of installed-package overlays into the core built-in registry or core exception list.
- No automatic public-dashboard visibility as a side effect of overlay registration, board exposure, or native execution opt-in.
- No widening of queue payloads, provider-lane contracts, or worker-runtime native-default policy beyond the bounded dashboard/start seam.
- No widening for overlays that are not resolved from active tenant install context.

Exit criteria:
- Focused API/runtime/catalog tests prove tenant-visible installed-package overlays appear on the public dashboard only with explicit package-definition public opt-in plus active install resolution.
- Focused API/runtime tests prove overlay start requests still fail closed when the overlay is absent from the tenant-visible public dashboard catalog.
- Handoff, TODO, and guardrail/design surfaces all record that public dashboard overlay widening is explicit-package-opt-in, tenant-scoped, and still separate from core registry truth, board exposure, and native execution policy.

Completed outcome:
- The public dashboard catalog can now surface installed-package overlays per tenant only when canonical package definitions explicitly opt them into that customer-facing surface.
- The public dashboard start seam can now start those overlays only through the same tenant-visible catalog-backed validation path.
- The phase widened customer-facing overlay availability without promoting overlays into core workflow truth or treating board/native overlay truth as automatic public-start approval.

## Phase 26: Durable Public Workflow Identity And Template-Mapping Cleanup

Status: `completed`

Goal:
- Make the public dashboard workflow identity durable across reservation, run persistence, outbox recovery, queue payloads, and worker execution, without pretending every customer-visible workflow id is a tenant `workflow_templates` row.

Scope:
- Persist a durable public workflow identity on workflow reservations, runs, and outbox rows.
- Keep tenant-template provenance explicit when a DB template row exists, and keep installed-package overlay provenance explicit when the workflow comes from package catalog/registry truth instead.
- Allow overlay-backed runs to persist without a fake `workflow_template_id` requirement while preserving the current board/native/public guardrails.
- Rebuild worker overlay registry truth from stored run identity/package provenance rather than today’s active-install assumption.

Required outputs:
- Reservations, workflow runs, and queue outbox rows store `public_workflow_id` plus identity/provenance fields explicitly.
- Installed-package overlay runs no longer depend on writing a public overlay id into a template-only UUID slot.
- Queue payloads and redispatch continue to carry the durable public workflow id while worker execution can recover the correct overlay package context from the stored run identity.
- Migration helper and focused tests prove the new schema and recovery path.

Non-goals:
- No widening of core built-in workflow truth.
- No new board exposure, public catalog exposure, or native-default policy beyond what prior phases already allowed.
- No package/framework promotion into core Wealth Factory identity.

Exit criteria:
- Focused repository, runtime-server, worker-runtime, queue, and migration tests prove durable public workflow identity persistence and overlay redispatch recovery.
- Build and full test verification are green.
- Plan, TODO, handoff, and alignment notes all state that public visibility/start policy stayed unchanged while durable identity/provenance became explicit.

Completed outcome:
- Workflow reservations, runs, and queue outbox rows now persist a durable `public_workflow_id` plus explicit identity/provenance fields instead of assuming every public workflow start maps to a tenant template UUID.
- Installed-package overlay public starts and redispatches now keep their public workflow id durable while storing explicit overlay provenance, and worker runtime can rebuild overlay registry truth from the stored run identity/package context.
- The phase corrected a real schema/runtime mismatch without widening core exceptions, board exposure, native-default policy, or public-start policy.

## Phase 27: Public Dashboard Start-Eligibility Truthfulness

Status: `completed`

Goal:
- Split customer-visible workflow visibility from public-start eligibility per workflow, keep runtime/dashboard/browser seams truthful, and fail closed when a workflow is visible in the dashboard but not start-enabled on that public seam.

Scope:
- Thread per-workflow `startEnabled` / public-start truth through the registry, runtime, dashboard API, and browser client seams.
- Keep customer-visible dashboard workflow visibility separate from public-start eligibility instead of treating visibility as automatic start approval.
- Fail closed when dashboard API start requests target a workflow that is visible on the public dashboard but not start-enabled on that seam.
- Keep runtime-ready dashboard copy truthful instead of hardcoding the media-calendar title on generic runtime-startable messaging.

Required outputs:
- Registry/runtime/dashboard/browser seams all preserve per-workflow public-start eligibility truth alongside visibility truth.
- Public dashboard start requests fail closed for visible-but-not-startable workflow ids.
- Runtime-ready dashboard copy reflects the actual selected workflow instead of hardcoding a media-calendar title.
- Focused tests and docs prove the public dashboard seam now distinguishes visibility from start approval per workflow.

Non-goals:
- No widening of core built-in workflow truth.
- No new overlay/public approvals.
- No queue, provider, or native execution-policy widening.

Exit criteria:
- Focused registry/runtime/dashboard/browser tests prove per-workflow public visibility and public-start eligibility stay separate and truthful.
- Focused API/runtime tests prove visible-but-not-startable workflows fail closed on the public dashboard start seam.
- Plan, TODO, handoff, and build docs all record that Phase 27 preserved existing registry/native/public guardrails while tightening seam truthfulness.

Completed outcome:
- Per-workflow `startEnabled` / public-start truth now flows through the registry, runtime, dashboard API, and browser seams instead of being inferred from dashboard visibility alone.
- Dashboard API start requests now fail closed when a workflow is visible in the customer dashboard but not start-enabled on that public seam.
- Runtime-ready dashboard copy no longer hardcodes a media-calendar title and now stays aligned with the actual workflow/runtime seam truth.
- Core built-in public ids no longer leak into the customer dashboard catalog as if they were tenant-template start targets, and authenticated runtime shells no longer fall back to fake local workflow cards when the real catalog is empty.

## Phase 28: Bounded Worker Orchestrator Handoff

Status: `completed`

Goal:
- Formalize the private orchestrator-to-child execution handoff so native worker execution receives an explicit bounded brief instead of only raw lane metadata, while keeping the public/dashboard/queue seams unchanged.

Scope:
- Add a private `orchestratorHandoff` contract to the worker execution envelope.
- Derive that handoff from the run orchestrator persona, the current dispatch handoff, and the lane continuity/resume directive.
- Thread the new private handoff into the native prompt builders so child execution sees the bounded scope/completion guidance directly.
- Keep that contract private to worker/native execution; do not widen public dispatch telemetry, dashboard DTOs, queue payloads, or board API surfaces.

Required outputs:
- Worker execution envelopes carry an explicit private orchestrator handoff with persona, dispatch reason, scope guard, completion rule, and resume directive.
- Native prompt builders include that bounded orchestrator handoff instead of forcing child execution to reconstruct intent from raw lane data alone.
- Focused tests prove the envelope contract and prompt composition without widening public seams.

Non-goals:
- No public dashboard visibility or start-policy changes.
- No queue/outbox payload redesign.
- No overlay/core-registry policy changes.
- No Obsidian/export expansion.

Exit criteria:
- Focused harness worker and native prompt tests are green.
- Full build, unit/integration test, and E2E verification are green.
- Plan, TODO, handoff, and build surfaces record that the new handoff stayed private and bounded to the worker/native seam.

Completed outcome:
- The worker execution envelope now carries a private `orchestratorHandoff` contract with explicit bounded execution guidance instead of leaving child execution to infer orchestrator intent from lane metadata alone.
- Native prompt builders now include orchestrator persona, dispatch reason, scope guard, completion rule, and resume directive directly in the private child-execution brief.
- The phase deepened the engine-room worker seam without widening dashboard truth, public start policy, queue payloads, or overlay/core registry boundaries.

## Phase 29: Bounded Public Start-Truth Consistency On The Runtime-Backed Dashboard Path

Status: `completed`

Goal:
- Finish the bounded runtime-backed public dashboard/start seam so customer-visible workflow catalog truth, preview-shell behavior, and public start eligibility all stay aligned without fake local starts, accidental overlay widening, or spillover into private worker/native contracts.

Scope:
- Keep the authenticated runtime shell workflow catalog truthful to tenant-visible dashboard entries instead of falling back to local demo cards when the real catalog is empty.
- Keep preview/bootstrap shells review-only, with no fake queued runs and no implicit runtime-start approval after provider setup.
- Carry per-workflow `startEnabled` truth through runtime API, dashboard API, browser bootstrap, and page copy so visible-but-not-startable workflows stay reviewable but fail closed on public start.
- Allow installed-package overlays onto the public dashboard/start seam only when canonical package definitions explicitly opt them into that customer-facing surface and tenant install context resolves them.
- Treat this public dashboard/start seam as complete for now once truthful behavior is restored, so the next phase can return to the private worker/native execution seam instead of reopening public start widening.

Required outputs:
- Runtime-backed dashboard catalog and browser shell behavior stay truthful when the authenticated catalog is empty or when workflows are visible but not startable.
- Preview/bootstrap shells no longer fabricate queued runs or imply that local review mode can launch real work.
- Public dashboard start requests validate against the same tenant-visible catalog they render from, including explicit `startEnabled` truth.
- Installed-package overlay visibility/start stays explicit, tenant-scoped, and separate from core built-in registry truth.

Non-goals:
- No widening of core built-in workflow truth.
- No queue/outbox payload redesign or worker-runtime contract widening.
- No promotion of board exposure or native execution eligibility into automatic public-dashboard approval.
- No reopening of browser-only fallback behavior as a fake start lane.
- No new public dashboard/start expansion beyond restoring truthful bounded behavior on the existing seam.

Exit criteria:
- Focused runtime/dashboard/browser tests prove empty authenticated catalogs stay empty, preview shells stay review-only, and visible-but-not-startable workflows fail closed on public start.
- Full build, full unit/integration tests, and E2E verification are green.
- Plan, TODO, handoff, and build docs all record that Phase 29 tightened the runtime-backed public start seam without widening overlay/core boundaries or private worker seams.

Completed outcome:
- Authenticated runtime shells now stay truthful to the real tenant-visible dashboard catalog and no longer fall back to fake local workflow cards when that catalog is empty.
- Preview/bootstrap shells now remain review-only: they explain that real starts require the authenticated runtime shell and do not fabricate local queued runs.
- Public dashboard start requests now validate against the same tenant-visible catalog they render from, preserving per-workflow `startEnabled` truth for review-only workflows.
- Installed-package overlays now appear on the public dashboard/start seam only when canonical package definitions explicitly opt them into that surface for the tenant, without promoting overlays into core built-in registry truth.
- Phase 29 closes this bounded public start-truth consistency seam for now and hands the next execution slice back to the private worker/native contract boundary.

## Phase 30: Private Post-Outcome Directive Contract

Status: `completed`

Goal:
- Deepen the private worker/orchestrator-child execution seam with an explicit state-by-state post-outcome directive map so native child execution knows what the engine will do after `waiting`, `done`, `blocked`, or `cancelled` without reconstructing that follow-through from run-state heuristics.

Scope:
- Add a private `postOutcomeDirectives` map to the worker execution envelope outcome contract.
- Derive one directive per allowed outcome state from the persisted run/cards/proposals truth and the existing post-outcome classifier.
- Thread those directives into the native prompt builders so child execution sees bounded follow-through truth directly.
- Keep the new contract private to the worker/native seam; do not widen queue payloads, public/dashboard DTOs, or board API surfaces.

Required outputs:
- Worker execution envelopes carry explicit post-outcome directives for each allowed lane outcome state.
- Native prompt builders include those directives as part of the private child-execution brief.
- Focused worker/native/runtime tests prove the directive contract, prompt composition, and runtime envelope reconstruction.

Non-goals:
- No public dashboard/start behavior changes.
- No queue/outbox payload redesign.
- No overlay/core-registry policy changes.
- No widening of multi-lane orchestration beyond the existing one-next-lane dispatch discipline.

Exit criteria:
- Focused harness worker, native prompt, native executor, and worker runtime tests are green.
- Full build, full unit/integration tests, and E2E verification are green.
- Plan, TODO, handoff, and build docs all record that the new post-outcome map stayed private and bounded to the worker/native seam.

Completed outcome:
- The worker execution envelope now carries a private `postOutcomeDirectives` map that tells native child execution what the bounded engine follow-through will be for each allowed outcome state.
- Native prompt builders now include that state-by-state post-outcome contract directly in the private child-execution brief, alongside the existing `orchestratorHandoff`.
- The phase deepened the engine-room worker seam without widening dashboard truth, public start policy, queue payloads, or overlay/core registry boundaries.

## Immediate Execution Order

1. Keep the migrated `wf_connect_first_workflow` native path green under the full verification bar.
2. Keep the migrated `wf_tax_strategy` native worker/runtime and board/start paths green under the full verification bar.
3. Keep the migrated `wf_package_followup` native worker/runtime, board exposure, and runtime-backed public start seams green under the full verification bar.
4. Start every future phase with a fresh GitNexus seam/blast-radius preflight plus a drift/alignment check, and fail closeout if the code, docs, and next-step direction are not aligned.
5. Keep the authenticated runtime-backed public dashboard/start seam green: empty tenant catalogs stay empty, preview shells stay review-only, and visible-but-not-startable workflows fail closed on public start.
6. Keep tenant-scoped installed-package overlay board/runtime/native seams green while public dashboard catalog visibility and public-start eligibility remain explicit, separate, and tenant-scoped per workflow.
7. Keep the durable public workflow identity seam green across reservation, outbox, queue, and worker recovery before widening any additional public surfaces.
8. Keep the private worker/orchestrator handoff explicit and bounded so child execution never has to reconstruct orchestrator intent from public telemetry or queue payloads.
9. Keep the new private `postOutcomeDirectives` contract explicit and bounded so child execution never has to reconstruct post-outcome follow-through from run-state heuristics, generic `nextDispatch` absence, or public telemetry.
10. Continue the next bounded engine-room phase on the private worker/orchestrator-child execution contract rather than reopening public dashboard/start behavior.
11. Re-run focused and full repo verification before each additional native-family cutover or public-surface widening.
12. Keep package-overlay and demo-package seams out of the core platform registry unless the design docs are intentionally revised first.
13. If industry-specific workflow families are needed later, implement a package-overlay registration seam first instead of promoting them into the core registry.
14. Use the landed overlay seam for future industry workflows rather than expanding the built-in registry.
15. Treat `wf_connect_first_workflow`, `wf_tax_strategy`, and `wf_package_followup` as the current intentional core built-in exceptions only; any future industry/package family stays overlay-scoped unless the design docs are explicitly revised first.
16. Do not treat this exception codification as approval to widen runtime eligibility, dashboard/start exposure, native-default policy, or public-start approval outside later dedicated phases.
