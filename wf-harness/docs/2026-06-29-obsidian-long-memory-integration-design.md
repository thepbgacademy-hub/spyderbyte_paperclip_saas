# Obsidian Long-Memory Integration Design

Date: 2026-06-29

Status: accepted design boundary

## Purpose

This note closes the local-only Obsidian long-memory design phase after the live export writer and stage delivery seams became launch-proven.

The goal is not to add another runtime database, dashboard surface, or workflow engine. The goal is to define how Wealth Factory can promote selected tenant-safe records into a tenant-owned knowledge space without letting that knowledge space become execution truth.

## Source-Of-Truth Split

Wealth Factory owns live execution truth:

- active run locks
- queue and outbox state
- in-flight orchestration state
- lane continuity and attention state
- auth, tenant membership, and BYOK credential state
- fairness, congestion, and retry controls

Obsidian may own tenant long memory:

- governance history records
- package bundle records
- accepted, rejected, deferred, and implemented decision history
- operating notes created from approved exports
- longitudinal business context that is useful after a workflow closes

Obsidian must not become the source of truth for live execution-critical state.

## Approved Promotion Paths

Only approved export candidates may promote Wealth Factory records into tenant-owned Obsidian memory:

- `governance_history_export`
- `package_bundle_export`

These candidates are already bounded by the harness export contract, delivery ledger, writer receipts, stale-bundle checks, and replay controls.

No future phase should directly export or sync these operational seams into Obsidian:

- `lane_continuity`
- `attention_state`
- raw card events
- raw child-agent prompts or provider responses
- BYOK credential material or secret references
- private worker envelopes, claim tokens, queue payloads, or runtime handoffs

## Tenant-Owned Delivery Model

The current launch-proven filesystem writer is an operator/stage proof of the tenant-owned destination model. Productized tenant delivery should keep the same contract shape but swap the destination adapter only after the tenant explicitly configures storage.

Allowed future destination adapters:

- local or mounted Obsidian vault folder for controlled deployments
- tenant-owned cloud folder connector
- tenant-owned storage connector that writes an Obsidian-compatible markdown bundle

Deferred until a dedicated connector phase:

- OAuth setup UI
- tenant folder selection
- cloud connector refresh-token lifecycle
- tenant-visible delivery history beyond the existing bounded board/export status

## Launch Guardrails

- Do not add new board sections just to describe future Obsidian metadata.
- Do not widen runtime state to make Obsidian sync easier.
- Do not treat export metadata expansion as launch progress unless it proves a real delivery or recovery gap.
- Do not use Obsidian reads to decide whether a workflow can start, resume, retry, replay, or complete.
- Do not use `scripts/seed-wfpc-demo.mjs` to create Obsidian proof lanes.
- Keep fresh-bundle replay proof as operator-provisioned until a genuinely new export-bundle lane exists.

## Acceptance For This Design Phase

This phase is complete when:

- the dedicated Obsidian memory boundary is documented
- `wf-harness/TODO.md` marks the design item closed
- `wf-harness/HANDOFF.md` points future agents to this decision record
- a doc regression proves the handoff/TODO keep the source-of-truth split visible

No VPS validation is required for this phase because the previous phase already proved the live export delivery lane and this phase does not change runtime or deployment behavior.
