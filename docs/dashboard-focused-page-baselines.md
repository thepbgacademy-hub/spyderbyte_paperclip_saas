Date: 2026-05-13

Reference docs:

- `docs/design.md`
- `docs/dashboard-design-prep.md`
- `docs/dashboard-field-contracts.md`
- `docs/dashboard-visual-baseline.md`
- `docs/support-visibility-repair-matrix.md`

## Purpose

This document defines the first focused customer page baselines for the Wealth Factory dashboard.

Unlike `Home`, these screens should not feel like dense overview dashboards. Each page should give the customer one clear working surface, one main decision loop, and only enough supporting context to keep momentum high.

These baselines are the bridge between:

- high-level dashboard IA
- page-level field contracts
- later React implementation and visual polish

## Shared Design Rules

Across all focused pages:

- Keep the shell stable: left navigation remains fixed, page title and actions live in the top bar, and the main canvas swaps by section.
- Use compact, high-polish cards with breathing room rather than tall panel stacks.
- Favor one dominant working surface per page.
- Use Wealth Factory language only; do not surface Paperclip names, prompts, raw skill-pack names, commands, logs, or internal run mechanics.
- Translate backend state into business-safe labels before display.
- Avoid rainbow-heavy status styling; prefer Wealth Factory brand accents with restrained warning and success colors.
- Use reactive navigation and page controls with clear default, hover, pressed, and selected states.
- Right-rail content is optional and should appear only when it materially helps the current task.

## Results Page Baseline

### Purpose

Help the customer review outcomes, make approval decisions, and move finished work into customer-owned storage without exposing internal run mechanics.

### Core Page Shape

The `Results` page should feel like a calm review desk.

It should have:

- a top summary strip for filters and current result state
- a left or center result list as the primary browsing surface
- a larger detail/review pane for the selected result
- a lightweight contextual side panel only when export or approval context is useful
- one approval package at a time in the main reading path so decisions stay legible

This page should not look like a run console.

### Layout Anatomy

1. Top bar:
   - page title: `Results`
   - package-aware search
   - status filter
   - workflow filter
   - date filter

2. Main canvas:
   - left column: compact result cards or rows
   - center column: selected result detail
   - optional right rail: export, approval, and expiry context

3. Mobile / narrow layout:
   - stacked list first
   - selected result opens into a detail view or drawer

### Key Components

#### Result List

Each item should show:

- result title
- related workflow name
- sanitized summary line
- status chip
- timestamp
- export badge if already delivered

Items should stay compact and highly scannable.

#### Result Detail Card

The selected result should show:

- result title
- workflow name
- created / updated timestamps
- summary block
- preview area for supported outputs
- safe milestone/history summary
- approval controls if relevant

This detail area should be the real center of gravity for the page. The customer should feel like they are reviewing and handing off one finished work item, not scanning a backend ledger.

#### Export Card

This card should show:

- download readiness
- Google Drive action/state
- Dropbox action/state
- expiry timer

It should reinforce that Wealth Factory is temporary storage, not a permanent media vault.

#### Approval Card

Shown only when relevant. It should include:

- current approval state
- approve / request revision actions
- short explanation of what the decision does next

### States

The page should clearly support:

- empty state: no results yet
- in-progress results mixed with completed ones
- approval-needed state
- export-ready state
- delayed or failed state with safe recovery guidance
- partial issue state where delivery succeeded for some files but needs attention for others

### Primary Actions

- review result
- approve result
- request revision
- download artifact
- send artifact to Google Drive
- send artifact to Dropbox
- open Assistant in support-intake mode for a failed result

### Right-Rail Guidance

Use the right rail only when it adds immediate decision support.

Best uses:

- export readiness
- expiry countdown
- approval guidance
- related connection issue summary

Do not use it for long history, logs, or technical diagnostics.

### What To Avoid

- raw run history tables
- technical error walls
- multiple competing previews
- mixing approvals, exports, and support into one overloaded card
- exposing more intermediate state than the customer needs

### Sample Customer-Safe Labels

- `Awaiting review`
- `Ready to download`
- `Sent to Google Drive`
- `Revision requested`
- `Reconnect storage`

## Workflows Page Baseline

### Purpose

Help the customer find and launch approved workflows inside their installed package boundary, without turning the page into a catalog dump or upsell surface.

### Core Page Shape

The `Workflows` page should feel like an execution launcher and active-work instrument panel.

It should have:

- a clean workflow catalog surface
- strong filtering
- a selected workflow detail panel
- clear launch readiness

This page should answer:

- what can I run
- what does it do
- what does it need
- can I start now

### Layout Anatomy

1. Top bar:
   - page title: `Workflows`
   - search
   - filters for specialist, status, and category

2. Main canvas:
   - left column: workflow list/grid
   - center column: selected workflow detail and launch setup
   - optional right rail: transient operational context only

3. Mobile / narrow layout:
   - workflow cards stack vertically
   - selected workflow opens in a focused detail view

### Key Components

#### Workflow Catalog

Each workflow card should show:

- workflow name
- one-line description
- employee association if useful
- required provider tags
- readiness status

Cards should feel compact and confident, not like a marketplace tile wall.

#### Workflow Detail Card

The selected workflow should show:

- workflow name
- what outcome it produces
- what input the customer should be ready to provide
- required providers
- estimated output type
- safe last-run summary if helpful
- next customer-actionable milestone when the workflow is already in motion
- blockers or missing items only when customer action is needed

#### Launch Readiness Card

This card should answer:

- ready to run now
- missing connection
- missing add-on
- temporarily unavailable

It should culminate in one dominant CTA:

- `Start workflow`

### States

The page should clearly support:

- fully available workflows
- workflows blocked by missing connection
- workflows blocked by missing add-on
- temporarily unavailable workflows
- active workflows already in motion
- empty filtered state

### Primary Actions

- select workflow
- review workflow details
- connect required provider
- go to skills/package context if blocked
- start workflow

### Right-Rail Guidance

Use the right rail sparingly for:

- required connections
- package-safe usage notes
- simple `before you start` reminders
- upcoming due timing when it affects the selected workflow
- a small `Needs your attention` summary tied only to the selected workflow

Do not use it for sales copy, hidden internal capability descriptions, or unrelated help text.

### What To Avoid

- turning the page into Marketplace-lite
- overselling unavailable features
- exposing internal workflow structures
- cluttering the surface with too many secondary stats
- burying the start action under configuration noise

### Sample Customer-Safe Labels

- `Available now`
- `Connection needed`
- `Needs add-on`
- `Try again in a moment`
- `Ready to start`

## Team Page Baseline

### Purpose

Help the customer understand who is available to help inside the package, what each role can do, which hires they already own, and which premium `Power Plays` they have unlocked.

### Core Page Shape

The `Team` page should feel like a roster plus capability deck, not a backend registry.

It should have:

- a calm top summary for team coverage
- tabs for included roles, hired roles, and power plays
- one dominant list or grid of roles
- a selected detail pane for the chosen role or power play

This page should not expose internal skill bundles, prompt packs, or tooling inventories.

### Layout Anatomy

1. Top bar:
   - page title: `Team`
   - search
   - filter for `Included`, `Hired`, `Power Plays`
   - optional package-family chip

2. Main canvas:
   - left column: compact role list or roster cards
   - center column: selected role detail
   - optional right rail: unlock requirements, provider needs, package fit

3. Mobile / narrow layout:
   - tab row first
   - role list below
   - selected role opens as a detail view or drawer

### Key Components

#### Team Coverage Strip

Show a small summary row with:

- included roles count
- hired roles count
- power plays unlocked
- roles needing connection before use

#### Included Team Tab

Show the employees that ship with the package:

- role name
- short resume line
- primary business outcomes
- active / available state

#### Hired Tab

Show paid or activated add-ons:

- role name
- outcome summary
- added date
- connection readiness

#### Power Plays Tab

This is the right place for the premium capabilities you mentioned.

Each item should show:

- power play name
- short description of what it unlocks
- required provider or package condition
- unlocked / locked state

These should feel like premium operating capabilities, not hidden dev tools.

#### Role Detail Card

The selected role should show:

- role name
- concise mini resume
- what this role helps with
- what workflows or outcomes it supports
- any provider requirements
- one clean action area

### States

The page should clearly support:

- included-only customers
- mixed included + hired roster
- locked power plays
- no hires yet
- role blocked by missing provider

### Primary Actions

- review role details
- activate a purchased hire
- open the marketplace lane
- unlock a power play
- connect a required provider

### Right-Rail Guidance

Good uses:

- provider requirement summary
- package-fit explanation
- unlock requirement summary

Avoid:

- raw capability inventories
- implementation detail
- long sales copy

### What To Avoid

- calling these backend skills
- showing hidden prompt/tool names
- making the page sound like HR software
- making power plays feel like unsafe unrestricted powers

### Sample Customer-Safe Labels

- `Included with your package`
- `Ready to use`
- `Needs provider`
- `Unlock power play`
- `Hired and active`

## Providers Page Baseline

### Purpose

Help the customer set up and maintain BYOK providers, subscriptions, and customer-owned storage in a calm, trustworthy, non-technical way.

### Core Page Shape

The `Providers` page should feel like a setup checklist, not an infrastructure dashboard.

It should have:

- grouped connection cards by type
- simple health/status presentation
- clear next-step actions
- package-aware guidance on what is actually needed
- trust-building language that reassures the customer that Wealth Factory uses only the access needed to keep workflows working

### Layout Anatomy

1. Top bar:
   - page title: `Providers`
   - optional filter for `All`, `Needed now`, `Connected`, `Needs attention`
   - tab row for `Providers`, `Keys`, `Storage`, `Defaults`

2. Main canvas:
   - provider and subscription section
   - storage section
   - each section uses compact connection cards in a tidy grid or stacked list

3. Optional right rail:
   - only for selected connection help, package requirements, or short setup guidance

### Key Components

#### Provider Connection Cards

Cards for:

- OpenAI
- ChatGPT / Codex subscription
- Anthropic
- xAI / Grok
- OpenRouter

Each card should show:

- provider name
- current state
- short safe description
- last updated or last verified timestamp
- primary action

#### Storage Connection Cards

Cards for:

- Google Drive
- Dropbox

Each card should show:

- connected/not connected state
- export role summary
- reconnect guidance if needed
- ownership reassurance that files are delivered to storage the customer controls

#### Defaults Card

This card should show:

- preferred provider for supported workflow families
- default storage destination
- safe engine mode label if exposed later, such as `Balanced` or `Deep Work`

This lets customers choose their providers without exposing backend routing internals.

#### Requirements Summary Card

This should clarify:

- which connections are required for the installed package
- which are optional
- which are only needed for certain workflows or specialists

This helps avoid the feeling that the user must connect everything at once.

### States

The page should clearly support:

- no connections yet
- not connected
- connected
- expired
- needs attention
- not needed for your package

### Primary Actions

- connect provider
- connect Google Drive
- connect Dropbox
- reconnect
- rotate/revoke from a safe settings flow

### Right-Rail Guidance

Good uses:

- package-specific explanation
- short setup checklist
- reassurance about BYOK and no secret redisplay

Avoid:

- raw auth jargon
- token lifecycle detail
- technical storage/API implementation notes

### What To Avoid

- showing raw key or OAuth detail
- making optional providers feel mandatory
- mixing connection health with billing or support noise
- turning the page into a generic admin settings dump

### Sample Customer-Safe Labels

- `Connected`
- `Needs attention`
- `Reconnect required`
- `Not needed for your package`
- `Storage ready`

## Insights Page Baseline

### Purpose

Show customer-safe usage, output, turnaround, and package KPI summaries in a clean operational analytics surface.

### Core Page Shape

The `Insights` page should reuse the strongest Hermes analytics patterns while translating them into business-safe meaning.

It should have:

- a KPI strip
- one trend row
- one recent-work table
- one package utilization module

This page should feel executive-readable, not like observability tooling.

### Layout Anatomy

1. Top bar:
   - page title: `Insights`
   - date-range control such as `7D`, `30D`, `90D`
   - optional export or refresh action later

2. Main canvas:
   - top KPI band
   - middle row with two charts
   - lower table for recent business-safe work
   - optional side rail or lower card for package utilization

3. Mobile / narrow layout:
   - KPI cards stack first
   - charts collapse vertically
   - recent-work table becomes cards or a condensed list

### Key Components

#### KPI Strip

Recommended cards:

- usage
- output
- turnaround
- package status

Each card should show:

- current value
- delta vs prior period
- clear label

#### Usage Trend

Show:

- requests, completed tasks, or delivered outputs over time

#### Turnaround Trend

Show:

- median or average turnaround over time

#### Recent Work Table

Show customer-safe columns such as:

- date
- work type
- status
- turnaround
- delivery channel

#### Package Utilization Card

Show:

- used this period
- remaining
- renewal/reset date
- near-limit state when relevant

### States

The page should clearly support:

- active account with enough data
- low-data account
- empty/new account
- filtered date-range view

### Primary Actions

- change date range
- review a recent output
- understand package utilization
- request support if outcomes look off

### Right-Rail Guidance

Good uses:

- package summary
- plan utilization
- short glossary/help note

Avoid:

- internal model/provider telemetry
- trace data
- queue or retry metrics

### What To Avoid

- raw token-accounting tables
- backend observability language
- too many decorative charts
- exposing model orchestration or cost internals without product framing

### Sample Customer-Safe Labels

- `Used this period`
- `Completed successfully`
- `Average turnaround`
- `Near package limit`
- `Output volume`

## Sequence Recommendation

If these focused pages are implemented in stages, build them in this order:

1. `Results`
2. `Workflows`
3. `Providers`
4. `Team`
5. `Insights`

This sequence keeps the product centered on visible customer value first, then execution flow, then setup clarity.

## Implementation Follow-Through

These baselines should drive:

- wireframes and image mockups
- React page composition
- DTO shaping
- response-guard assertions
- E2E coverage for navigation, state labels, and action visibility

If a later screen design adds complexity that is not justified by the page purpose, that design should be simplified back to this baseline.
