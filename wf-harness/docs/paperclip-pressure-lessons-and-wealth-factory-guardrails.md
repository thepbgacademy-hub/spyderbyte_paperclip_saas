# Paperclip Pressure Lessons And Wealth Factory Guardrails

Date: 2026-05-25
Branch: `codex/wf-harness-design`
Scope: Consolidated reference for why Wealth Factory is shadowing the useful parts of Paperclip while replacing the volatile orchestration seams

## Purpose

This document pulls together the most important lessons from the Paperclip pressure and soak phases, then translates them into the guardrails now shaping the Wealth Factory engine room.

It is meant to answer 4 recurring questions clearly:

1. What did Paperclip prove was valuable?
2. What became unstable or misleading under pressure?
3. Why are we still intentionally preserving some Paperclip traits?
4. What hard rules is Wealth Factory using so we do not rebuild the same hotspot?

## Short Framing

The cleanest contrast is:

- Paperclip leaned too heavily on assumptions, implied behavior, and loosely coordinated execution truth.
- Wealth Factory is being built around explicit rules, guardrails, and durable control seams.

Another useful shorthand is:

- Paperclip = presumption-heavy orchestration
- Wealth Factory = governed orchestration

That does not mean Paperclip had no value. It means its most useful ideas need stronger control boundaries before they are safe at commercial multi-tenant pressure.

## What Paperclip Proved Was Useful

Paperclip still gave us several strong product and architecture truths:

- persona-shaped work is valuable
- a CEO/orchestrator pattern is a good tenant-facing control model
- board-style progress is easier for tenants to understand than raw execution logs
- child work needs to be bounded and business-readable
- orchestration and worker execution should stay separate
- queueing, outbox, and worker pickup can work if they stay outside the unstable trust zone

We are intentionally preserving those parts.

## What Became Volatile Under Pressure

The pressure and soak phases surfaced several recurring failure modes.

### 1. The orchestration slice became the hotspot

Paperclip proved the concept, but it became the sustained hotspot under longer commercial-style soak.

Why this matters:

- queue reliability did not guarantee execution-engine reliability
- the unstable part was not the whole product, it was the orchestration/execution slice
- that meant Wealth Factory needed to replace the hotspot instead of wrapping it with more assumptions

### 2. Too much important behavior was implied instead of explicit

Under pressure, important execution truth could blur together:

- what was really running
- what had completed
- what still needed approval
- what should happen next
- whether the visible status matched the durable state

This created ambiguity, false progress, and harder debugging.

### 3. Status truth, control truth, and visible truth could drift apart

A recurring danger zone was any seam where:

- worker behavior said one thing
- board status suggested another
- the UI inferred a third thing

That kind of drift is survivable in small demos and very risky in multi-tenant sustained load.

### 4. Duplicate work and sprawl could accumulate

Without strong lane discipline, the system could drift into:

- duplicate lanes
- repeated unresolved requests
- fuzzy reopen behavior
- scope inflation
- board noise

That increases heat without increasing value.

### 5. Control surfaces were not always bounded enough

When the next allowed action was not explicit, the system was forced to guess:

- should work continue
- should it pause
- should it reopen
- should it wait for review
- should it deny expansion

That guessing posture is exactly what we want to avoid in Wealth Factory.

## Why We Are Still Shadowing Paperclip

We are not trying to erase Paperclip’s useful shape.

We are still intentionally shadowing:

- persona/value shape
- CEO-centered orchestration
- board-style progress
- bounded child work
- business-readable outcomes

We are not shadowing:

- fuzzy orchestration
- implicit next-step logic
- assumption-heavy mutation behavior
- ambiguous worker truth
- loosely governed lane growth

So the strategy is:

- preserve the useful product shape
- replace the unstable engine-room behavior

## Wealth Factory Guardrails

These are the main rules that exist specifically because of the Paperclip pressure lessons.

### 1. CEO remains the only tenant-facing conversational actor

Why:

- prevents uncontrolled multi-agent drift
- keeps accountability and approval flow clear
- protects the tenant from backend chatter

### 2. Child personas work only through bounded lanes/cards

Why:

- preserves clean business-facing progress
- keeps work scoped, auditable, and resumable
- prevents swarm-style uncontrolled expansion

### 3. Dynamic work creation is allowed, but never free-form

Why:

- unchecked lane creation becomes board sprawl
- repeated requests must reuse, defer, hand off, or deny before they create more cards
- governance must stay visible and bounded

### 4. Runtime truth must be durable before it is presented as progress

Why:

- Paperclip taught us that implied progress is dangerous
- selection without durable claim is not real execution
- visible running state must follow persisted state transitions, not guesswork

### 5. Status must be derived from explicit rules, not page inference

Why:

- the UI should not become a second orchestration engine
- action surfaces should come from the harness contract
- route, method, options, request fields, and default behavior should be explicit

### 6. Pauses and follow-up work must stay governed

Why:

- `defer` should remain visible, not disappear like a hidden deny
- `review-attention`, `resolve-attention`, and `fresh-cycle` should be explicit seams
- resume/unblock/review/fresh-cycle behavior must be command-driven, not implied

### 7. Board memory should stay bounded and purposeful

Why:

- board history is valuable
- free-form note sprawl is not
- decisions, follow-through, attention, and continuity should be structured and tenant-safe

### 8. Browser and board behavior must fail truthfully

Why:

- flattening every failure into one generic client error recreates assumption-heavy debugging
- the browser should preserve bounded error codes like `conflict`, `rate_limited`, and `invalid_request`
- the page should reflect engine truth, not generic UI guesswork

### 9. Preview vs live behavior must stay explicit

Why:

- localhost fallback is useful for shell work
- silent fallback under live conditions is dangerous
- preview mode must stay read-only and clearly labeled

### 10. GitNexus seam checks are part of discipline, not decoration

Why:

- pressure problems often start where seam boundaries quietly widen
- repeated map checks keep blast radius visible
- we use the map to confirm we are strengthening narrow seams instead of leaking into the hot zones

### 11. Package overlays must not silently become platform truth

Why:

- demo/package adjacency can create misleading momentum under long builds
- a useful example workflow is not automatically a core Wealth Factory workflow family
- launch pressure makes “small” scope promotions especially dangerous when they reshape the roadmap

Required behavior:

- Wealth Factory core stays framework-agnostic; it does not silently become one specific business model
- industry/package/demo workflow families stay in overlay seams unless the design docs explicitly move them
- opinionated business frameworks land as optional overlays/packages, not as built-in core identity
- a future tenant-authored blank-canvas path must reuse the same core seams rather than creating a special-case core framework
- phase closeout must include a drift check against the source-of-truth docs
- if code and docs disagree, fix both before moving on
- installed package context is required for overlay registration
- duplicate built-in workflow ids are rejected fail-closed
- overlay registration alone is not board exposure
- overlay board exposure requires explicit package-definition opt-in and active installed package context
- overlay registration is not native cutover
- overlay native cutover requires explicit package-definition opt-in and active installed package context
- explicit overlay native cutover still does not promote that workflow into the core built-in registry
- overlay board/native truth is not public dashboard start truth; the customer-facing dashboard catalog and start seam must opt in separately and fail closed when a workflow is not tenant-visible there
- public dashboard visibility for installed-package overlays requires explicit package-definition opt-in plus active installed package context
- public dashboard start for an installed-package overlay requires that same tenant-visible catalog presence; do not treat overlay registration, board exposure, or native execution alone as public-start approval
- explicit public dashboard opt-in for an overlay still does not promote that workflow into the core built-in registry or core exception list
- selector and deliverable fences remain workflow-specific

Proof surface:

- registry boundary tests
- selector/runtime registry tests
- board-selector and deliverable-fence tests

## Concrete Wealth Factory Patterns That Replace Paperclip Volatility

These are some of the direct substitutions already in flight.

### Instead of implicit next steps

We now prefer explicit post-outcome actions such as:

- `dispatch_next_lane`
- `queue_ceo_review`
- `await_lane_resume`
- `await_unblock`

### Instead of UI-side guesses

We now prefer board-contract metadata like:

- `actionRoute`
- `actionPath`
- `actionMethod`
- `requestFields`
- `actionOptions`
- `recommendedOptionValue`
- `exampleRequest`

### Instead of generic board noise

We now prefer bounded read models like:

- `pendingApprovals`
- `pendingAttention`
- `recentDecisions`
- `followThroughItems`
- `completionPackage`

### Instead of replay-only card history

We now prefer bounded persisted lane continuity like:

- `continuitySummary`
- `continuitySource`
- `latestResultSummary`
- absorbed-work snapshots

Those bounded continuity fields are operational runtime memory only. They can shape resume behavior and tenant-safe board views, but they must not become direct long-memory exports just because an Obsidian seam exists elsewhere.

## Practical Design Rule

When we are deciding whether to add or widen a seam, the check should be:

1. Does this preserve the useful Paperclip product shape?
2. Does it remove or reduce one of the known pressure failure modes?
3. Is the behavior explicit, durable, and bounded?
4. Would this still look truthful under multi-tenant pressure?

If the answer to those questions is not clearly yes, the seam probably needs to stay narrower.

## Current Working Principle

We are not rebuilding Paperclip.

We are building a Wealth Factory engine room that:

- keeps the persona and board value that made Paperclip useful
- removes the assumption-heavy orchestration that made it volatile
- favors durable rules over inferred behavior
- favors bounded governance over broad agent freedom
- favors tenant-safe truth over convenient ambiguity

That is the reason the current build closely shadows the valuable parts of Paperclip while deliberately avoiding the areas that became unstable under pressure.
