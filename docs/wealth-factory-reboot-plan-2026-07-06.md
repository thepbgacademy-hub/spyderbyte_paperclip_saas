# Wealth Factory Reboot Plan

Date: 2026-07-06
Branch: `codex/wealth-factory-blueprint`
Blueprint source: `E:\REPOS 2\wealth_clip\THE_WEALTH_FACTORY_MASTER_BLUEPRINT.md`

## Purpose

This branch marks a deliberate reboot of the Wealth Factory build direction.

The prior repository history remains valuable as reference material for:

- tenant isolation patterns
- provider credential handling
- queue and worker hardening
- audit and safety posture
- live deployment lessons

It is no longer the product shape to extend by default.

The new source of truth is the factory-style blueprint. The product is now framed as:

- Blueprint installs
- Production Runs
- Stations
- Specialists
- Checkpoints
- Deliverables
- Launch Kits

The older Paperclip-shaped board/orchestrator mental model is now reference-only.

## Clean-Start Rules

1. Treat the blueprint as the design source of truth for all new customer-facing architecture and language.
2. Treat existing runtime, queue, auth, tenant, and deployment code as a pattern library, not as a required inheritance path.
3. Do not widen or preserve old Paperclip-flavored workflow surfaces unless a concrete reboot task explicitly needs them as temporary migration scaffolding.
4. Prefer new bounded implementation slices over retrofitting deep legacy seams.
5. Before each implementation phase, run GitNexus preflight on this branch and record the result in the phase summary.

## GitNexus Baseline

Rebuilt on this branch on 2026-07-06 after branch creation.

- Repo: `spyderbyte_paperclip_saas`
- Commit: `e528540`
- Status: up to date
- Graph: 8,524 nodes / 13,978 edges / 434 clusters / 300 flows

## Branch Strategy

- Historical branch: `codex/wf-harness-design`
- Reboot branch: `codex/wealth-factory-blueprint`

The reboot branch is the active line for the new build.

## Immediate Phases

### Phase B0: Reboot foundation

Goal:
Create the explicit reboot documents, reset the implementation plan of record, and anchor the clean-start operating rules.

Exit criteria:

- reboot plan doc exists
- TODO includes reboot track
- handoff points to reboot track
- GitNexus index is fresh on the reboot branch

### Phase B1: Factory domain skeleton

Goal:
Define the new canonical domain surfaces from the blueprint without carrying forward the older board-first shape.

Focus:

- package/blueprint terminology map
- core entities
- API and UI seam boundaries
- first bounded slice selection

### Phase B2: New implementation foundation

Goal:
Stand up the first minimal code skeleton for the blueprint-native build path.

Focus:

- workspace/package/run/station/deliverable primitives
- clean route and package layout
- first test-first slice

## What Not To Carry Forward Blindly

- Paperclip-specific naming
- old board action assumptions
- old live proof scripts as product truth
- legacy run artifacts and historical workflow state as launch inputs
- prior dashboard behavior as the default UX model

## Reference Material

Keep consulting these as engineering references only:

- `docs/build.md`
- `docs/design.md`
- `docs/reviewer-notes.md`
- `wf-harness/HANDOFF.md`
- historical tests, scripts, and deployment notes where they still teach safe patterns

## Decision

This repository is not being discarded.

Instead, this branch reuses the useful infrastructure lessons while resetting the product architecture around the factory blueprint so the implementation path matches the intended launch product.
