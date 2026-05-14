# Wealth Factory Dashboard Visual Baseline

Date: 2026-05-12

Reference inputs:

- `docs/design.md`
- `docs/dashboard-design-prep.md`
- user-provided reference screenshots in the thread

## Design Goal

Design a Wealth Factory dashboard that feels clean, calm, and operational for business owners. The user should feel like they are running a business, not configuring an AI tool or decoding a developer dashboard.

The visual direction should feel:

- confident
- quiet
- structured
- premium
- practical
- package-aware

It must not feel like:

- a prompt console
- a workflow engine admin panel
- a generic card-soup SaaS
- a builder-oriented AI workspace

## Core Thesis

Wealth Factory should behave like a package-aware business operating system.

The shell stays consistent across customers. What changes is the center-of-gravity content based on:

- the installed package
- the user's role
- what requires attention now

The first emotional signal should be:

`Here is what matters today, what is moving, what is blocked, and what you should do next.`

Not:

`Here are all the tools and systems available to you.`

## Recommended Shell

### 1. Left Navigation

Keep the navigation short, stable, and human-readable.

Recommended top-level items:

- `Home`
- `Workflows`
- `Results`
- `Skills`
- `Profiles`
- `Keys`
- `Package`
- `Files`
- `Assistant`

Bottom cluster:

- `Billing`
- `Settings`

Notes:

- Avoid internal/build-system language such as logs, runs, prompts, agents, tools, queues, or containers.
- `Workflows` is acceptable because it is already productized in Wealth Factory language, but it must show business workflows only.
- `Skills` is acceptable here as long as it clearly means the active employee roster plus marketplace hiring lane, not backend skill packs.
- `Profiles` should represent the companies or operating contexts the customer owns within the same package family.
- `Keys` should be the customer-safe provider, subscription, and storage setup surface.
- `Package` is acceptable here because it is already a core commercial concept in Wealth Factory. On-screen copy should make clear that this page represents the installed business system, not shipping or file packaging.
- The installed package name should be visible near the top of the nav as context, not as a navigation branch explosion.

### 2. Top Bar

Purpose: orient the user without competing with the work.

Recommended elements:

- page title
- package or business context badge
- global search
- `Today` or date-range control
- notifications
- quick capture / quick add
- account menu

The top bar should not carry dense KPI clutter.

### 3. Main Workspace

The main workspace should follow a clear hierarchy:

1. `Current Focus`
2. `Needs Attention`
3. `Operating Snapshot`
4. `Work Queue`
5. `Metrics and Trends`

This means one dominant panel near the top, not six equally weighted cards.

### 4. Right Rail

Reserve the right rail for live context and lightweight utilities:

- today's schedule
- alerts
- pending approvals summary
- expiring downloads
- reminders

The right rail should be narrow and scannable. It should support the main workspace, not replace it.
Do not duplicate the main work queue here.

## Default Home Screen

### Primary Hero Panel: Current Focus

This is the anchor panel.

It should show:

- one recommended next action
- a short explanation of why it matters
- supporting context chips such as due today, waiting on approval, blocked, ready to send
- one strong CTA
- one secondary CTA

Example language:

- `Approve this week's content plan`
- `Review cash reserves before payroll`
- `Send the client update before 4 PM`

### Secondary Panel: Needs Attention

A compact list of the highest-priority operational items:

- overdue tasks
- approvals waiting
- payment or subscription issues
- urgent workflow exceptions
- blocked deliverables

This panel should be list-based, not chart-based.

### Tertiary Panel: Operating Snapshot

This is where the useful business summary lives:

- campaigns or client initiatives in motion
- completed deliverables this week
- deliverables due next
- revenue or pipeline at risk
- upcoming deadlines

This section should help a business owner understand the state of the business, not the state of the platform.

### Fourth Panel: Work Queue

This is the "what gets done next" surface.

It should show a compact ordered queue of work items such as:

- draft awaiting review
- post awaiting approval
- export ready to send
- follow-up due
- asset waiting on revision

This panel should be action-oriented and sortable by urgency. It should not repeat the same items already shown in the right rail.

### Lower Section: Metrics and Trends

Only after action-oriented information is visible should the user see metrics:

- weekly completion trend
- on-time delivery trend
- campaign or client progress
- package-specific KPIs

For some packages this may be heavier, for others lighter.

## Package-Aware Behavior

The shell remains the same across packages. The center content changes.

### Social Media Package

Home emphasis:

- current publishing plan
- approvals needed
- content in production
- due posts
- exports waiting for download or storage

### Business Coach Package

Home emphasis:

- client tasks
- session prep
- deliverables due
- scorecards and playbooks in motion
- client follow-ups

### Blank Canvas Premium Package

Home emphasis:

- setup milestones
- active systems being defined
- missing connections
- first workflow creation steps
- approvals and structure decisions

## Visual Direction

Borrow from the reference screenshots:

- dark textured theme
- restrained glow/accent behavior
- compact, high-clarity modules
- strong vertical hierarchy
- one obvious focal point
- crisp panel boundaries
- tactile cream utility buttons against deep green-black surfaces

But adapt it for Wealth Factory:

- slightly more polished and less hacker-ish
- more executive/business calm
- less command center for creators
- more operations cockpit for owners
- fewer exposed configuration categories
- simpler customer-safe labels

### Palette

Recommended:

- deep green-black or charcoal textured background as the default baseline
- graphite or forest-slate surfaces
- cream or parchment accents for utility buttons
- muted blue as navigation/selection accent
- restrained green for success and forward motion
- amber for warnings
- soft gray or warm ivory text hierarchy

Avoid:

- purple-heavy AI palettes
- candy colors
- bright neon
- frosted-glass gimmicks
- glossy gradient blobs

### Theme Presets

Users should be able to choose from a small curated theme menu.

Recommended launch presets:

- `Foundry`
  - dark green-black textured baseline, closest to the reference style
- `Midnight`
  - deep charcoal with cool blue accents
- `Ledger`
  - monochrome graphite and ivory
- `Ember`
  - warm dark surfaces with restrained bronze accents

Rules:

- Theme choices should change palette and surface treatment, not rewrite the information architecture.
- Themes should stay curated and brand-safe, not become a freeform color picker in the MVP.
- The default should remain the Wealth Factory baseline look.

### Typography

Typography should feel:

- compact
- modern
- legible
- businesslike

Use strong hierarchy without giant hero text.

### Motion

Use subtle flourishes only:

- soft hover lifts
- understated panel transitions
- segmented-control state changes
- quiet loading placeholders
- smooth list updates

No decorative animation for its own sake.

## Hard Product Rules For The UI

The dashboard must never expose:

- `Paperclip`
- prompts
- raw skill-pack names
- commands
- agents
- tool calls
- raw logs
- queue internals
- Docker/container language
- backend secret handles
- provider secrets
- service-role mechanics
- internal workflow IDs

Customer-safe language examples:

- `Assistant is getting ready`
- `Connection needed`
- `Action required`
- `Completed successfully`
- `Try again in a moment`

Not:

- `worker retrying`
- `cold start`
- `queue claim failed`
- `container unavailable`

## Recommended First Image Baseline

The first concept render should show:

- a realistic desktop browser screenshot
- a full Wealth Factory dashboard
- left nav
- top bar
- large Current Focus panel
- right-side schedule/alerts rail
- compact Needs Attention list
- visible Work Queue panel
- one restrained metrics row
- package-aware labels and business-safe language

It should look implementation-friendly, not like a marketing illustration.

## GPT-Image Prompt

Use this as the baseline prompt for concept generation:

`Create a highly realistic product-design screenshot of a desktop web app for Wealth Factory, shown as a SaaS business operations dashboard in active use. The image should feel like a real customer-facing operations platform captured from a modern browser on a large laptop screen, not a marketing hero image. Use a dark premium interface inspired by calm command-center dashboards, with a left navigation rail, compact top utility bar, a dominant main content column, and a narrow right context rail.`

`The dashboard should be designed for a business owner running a company, not a developer configuring AI tools. Make the hierarchy extremely clear. At the top of the main content area, show a large Current Focus panel with one important recommendation, supporting context chips, and 1-2 clean action buttons. Below it, show a Needs Attention list with overdue items, approvals, payment issues, and follow-ups. Add an Operating Snapshot area with business-facing metrics such as campaigns in motion, deliverables due, revenue at risk, and upcoming deadlines. Add a separate Work Queue panel with ordered tasks like awaiting review, awaiting approval, ready to send, and due today. Keep one restrained lower row with small trend charts or throughput summaries, not a crowded analytics mosaic.`

`The right rail should include Today's Schedule, alerts, pending approvals summary, and expiring downloads. The left nav should use customer-facing labels such as Home, Workflows, Results, Skills, Profiles, Keys, Package, Files, Assistant, Billing, and Settings. Near the top, show the installed package context in a subtle label, such as Social Media Package or Business Coach Package.`

`Use realistic product UI details: believable spacing, crisp borders, matte surfaces, subtle shadows, dark green-black or charcoal textured background, graphite panels, cream utility buttons, muted blue accents, restrained green highlights, soft gray or warm ivory typography, and small amber warning states. Make the interface feel premium, calm, and implementation-friendly. Avoid giant headline text, fantasy visuals, generic AI art style, glowing sci-fi HUDs, fake glassmorphism, oversized rounded cards, purple gradients, empty placeholder panels, mobile layout, or exposed technical terminology. Do not show prompts, agents, logs, or any internal workflow-engine concepts.`

## Hermes-Inspired Notes

The reference style is useful because it has:

- strong left-rail identity
- compact and readable controls
- tactile utility buttons
- textured depth without glossy clutter
- a distinctive operating-system feel

Wealth Factory should borrow that confidence while changing the meaning of the UI:

- `Skills` means packaged employees and hires, not backend skill folders
- `Profiles` means companies/workspaces the customer operates
- `Keys` means provider, subscription, and storage setup
- `Settings` should stay deliberately smaller than the reference product's wide config surface
- operator-only configuration must remain backstage

## Recommendation

For the first image pass, render the shell as a `Social Media Package` variant because it provides the richest operational contrast:

- planning
- approvals
- content production
- deadlines
- exports

That gives us enough density to judge whether the shell is clear without making the dashboard feel abstract.
