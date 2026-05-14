Date: 2026-05-13

Reference inputs:

- Hermes UI screenshots shared in thread
- `docs/dashboard-design-prep.md`
- `docs/dashboard-visual-baseline.md`
- `docs/dashboard-field-contracts.md`

## Purpose

This document maps the useful parts of the Hermes reference UI into Wealth Factory.

The goal is not to clone Hermes. The goal is to selectively reuse:

- visual rhythm
- left-rail composition
- card and table patterns
- textured shell treatment
- simple utility-button language

while replacing developer-facing or operator-facing surfaces with customer-safe Wealth Factory product surfaces.

## Core Rule

Wealth Factory is the visible operating system.
Paperclip is the hidden orchestration engine.

Hermes gives us a strong shell language, but many Hermes nouns are internal or technical. Wealth Factory should translate them into customer-safe product concepts.

## Recommended Wealth Factory Navigation

Primary navigation:

- `Home`
- `Workflows`
- `Results`
- `Team`
- `Profiles`
- `Providers`
- `Insights`
- `Package`
- `Files`
- `Assistant`

Bottom cluster:

- `Billing`
- `Settings`

Secondary or external link:

- `Guides`

`Guides` should open a website help/package-guide surface rather than a raw internal documentation console.

## Screenshot Mapping

| Hermes area | Wealth Factory use | Customer-facing label | What it should house | What stays hidden |
|---|---|---|---|---|
| `Sessions` | Reuse pattern, not literal label | `Activity` patterns inside `Home`, `Results`, and `Workflows` | recent runs, recent outputs, current jobs, customer-safe activity history | raw session IDs, worker traces, Paperclip thread/session internals |
| `Analytics` | Keep as a product surface | `Insights` | usage trends, deliverable throughput, package KPIs, time saved, output volume, business-safe spend summaries | low-level telemetry, trace IDs, internal token/accounting schema |
| `Models` | Shrink and partially merge | advanced area inside `Providers` or `Settings` | approved provider choice, preferred engine mode, safe defaults such as quality/speed tiers | raw routing logic, fallback chains, hidden model policies, system prompts |
| `Cron` | Rename and simplify | `Schedules` | recurring workflows, check-ins, follow-up runs, package-specific automation cadence | cron syntax, heartbeat mechanics, queue triggers, scheduler internals |
| `Skills` | Reinterpret heavily | `Team` with `Power Plays` inside it | included employees, hired roles, marketplace lane, paid unlocks, premium capabilities | raw skill packs, backend tool inventories, internal prompt bundles |
| `Profiles` | Keep concept | `Profiles` | company/business contexts inside the same package family | operator impersonation, cross-tenant mappings, internal joins |
| `Config` | Reduce drastically | small subset under `Settings` | preferences, notifications, appearance, safe defaults | raw config files, env toggles, operator settings, feature flags |
| `Keys` | Keep capability, rename surface | `Providers` | BYOK providers, subscription auth, storage connections, default provider preferences | raw secrets, vault refs, service tokens, backend secret handles |
| `Documentation` | Keep, but externalize | `Guides` | package explainer, onboarding, workflow instructions, billing/help FAQs, integration how-to | internal runbooks, Paperclip docs, private architecture docs |

## Page Decisions

### Team

Do not call this `Skills`.

This page should represent:

- the employees that ship with the package
- hires the customer purchased
- a marketplace lane for unlocking new hires
- a `Power Plays` tab for premium unlocks the customer paid for

Most internal capabilities remain hidden.

Only customer-safe, package-approved capabilities should be surfaced.

Recommended tabs:

- `Included Team`
- `Hired`
- `Power Plays`

### Providers

Do not make customers think in raw key-management terms if we can avoid it.

This page should house:

- provider accounts
- BYOK setup
- storage connections
- subscription auth
- safe provider preference selection

Recommended tabs:

- `Providers`
- `Keys`
- `Storage`
- `Defaults`

The page label in the nav should still be `Providers`, because that is the user's mental model.

### Insights

Use the Hermes analytics table and summary-card patterns here.

This page should show:

- business-safe usage summaries
- deliverable counts
- output volume
- turnaround trends
- package KPIs
- possibly spend summaries, if framed cleanly

This should not become a backend observability page.

### Schedules

Do not call this `Cron`.

Do not call it `Heartbeats` in the main customer UI either.

Preferred label:

- `Schedules`

This can live:

- as a subview inside `Workflows`, or
- as a later standalone page if recurring automation becomes central to the product

What it represents:

- recurring runs
- follow-up automations
- scheduled check-ins
- routine business tasks

What it must not expose:

- cron expressions
- worker heartbeat language
- backend scheduler internals

### Guides

The documentation screenshot is useful as a structural reference, but not as an in-app developer docs console.

For Wealth Factory:

- `Guides` should open a website help center or package guide
- package-specific help can explain:
  - what the package does
  - what workflows are included
  - what hires/power plays are available
  - what providers are required
  - how storage works

This can be:

- a web page opened from the app shell
- an embedded help surface
- a hybrid knowledge panel later

## Paperclip Capability Mapping

### Workflows

Paperclip elements behind this:

- workflow orchestration
- job state
- step progression
- result generation

Expose:

- workflow names
- readiness
- customer-safe next actions
- output/result status

Hide:

- prompts
- commands
- agent wiring
- tool calls
- queue states

### Results / Activity

Paperclip elements behind this:

- run records
- completion events
- errors
- artifacts

Expose:

- customer-safe milestones
- approvals
- downloads
- export status

Hide:

- raw run logs
- worker traces
- stack traces

### Team / Power Plays

Paperclip elements behind this:

- guarded capability bundles
- package-bound skills and tools
- specialist workflows

Expose:

- employee/hire mini resumes
- package-safe outcomes
- unlock state

Hide:

- raw skill names
- tool inventory
- hidden prompt bundles

### Providers

Paperclip elements behind this:

- provider auth resolution
- secret lookup
- runtime connector selection

Expose:

- connected / reconnect required
- approved provider choices
- storage readiness

Hide:

- raw keys
- token payloads
- secret references
- fallback logic

### Schedules

Paperclip elements behind this:

- recurring triggers
- scheduled run creation
- heartbeat-like monitors or follow-ups where used

Expose:

- next run
- cadence
- status
- pause/resume

Hide:

- cron syntax
- queue wakeups
- scheduler implementation

## Visual Guidance From The Screenshots

We should reuse:

- left rail proportions
- textured dark background
- thin crisp dividers
- cream utility buttons
- dense but breathable tables
- understated headings
- simple segmented controls

We should not reuse:

- raw dev nouns like `Cron`, `Models`, `Config`, `Skills`
- giant all-purpose config surfaces
- internal admin complexity
- direct exposure of orchestration concepts

## Recommended Final Direction

Use the Hermes screenshots as the visual and structural moodboard for:

- `Insights`
- `Providers`
- `Profiles`
- `Team`
- `Guides`

Use the already-developed Wealth Factory card-driven direction for:

- `Home`
- `Results`
- `Workflows`

That gives us the best blend:

- Hermes for shell confidence and control-surface texture
- Wealth Factory for safer business-facing workflow and output views
