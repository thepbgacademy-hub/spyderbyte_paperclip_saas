# Hermes Shell Transplant For Wealth Factory

## Goal

Replace the current custom Wealth Factory dashboard shell with a Wealth Factory adaptation of the Hermes dashboard shell so the project uses the real long-term layout primitives, topbar pattern, and global theme token system instead of a screenshot-inspired approximation.

The resulting app must preserve Wealth Factory's customer-facing naming, business-safe summaries, package boundaries, and theme controls while keeping future Hermes-like surfaces scaffoldable behind flags.

## Success Criteria

- Wealth Factory uses a Hermes-derived responsive sidebar, mobile drawer, topbar, and page-header structure.
- Theme tokens are global across the app, not limited to the shell.
- The `Settings` page remains the visible customer-facing theme control surface.
- Existing Wealth Factory page names and customer-safe copy remain primary.
- Future Hermes-style extra sections can be enabled later through flags without re-architecting the shell.
- No Hermes operator-only pages, logs, system actions, config editors, terminal surfaces, or internal branding are exposed in the current customer UI.

## Source Of Truth

The shell transplant should reference these Hermes files:

- `E:\REPOS\_vendor\hermes-agent\web\src\App.tsx`
- `E:\REPOS\_vendor\hermes-agent\web\src\contexts\PageHeaderProvider.tsx`
- `E:\REPOS\_vendor\hermes-agent\web\src\index.css`

The Wealth Factory adaptation should preserve and refit these current project files:

- `E:\REPOS\spyderbyte_paperclip_saas\apps\web\src\App.tsx`
- `E:\REPOS\spyderbyte_paperclip_saas\apps\web\src\styles.css`
- `E:\REPOS\spyderbyte_paperclip_saas\apps\web\src\dashboard-client.ts`
- `E:\REPOS\spyderbyte_paperclip_saas\apps\web\tests\e2e\workflow.spec.ts`
- `E:\REPOS\spyderbyte_paperclip_saas\apps\web\tests\e2e\tenant-isolation.spec.ts`
- `E:\REPOS\spyderbyte_paperclip_saas\tests\dashboard-client.test.ts`

## Product Boundaries

### Keep visible and customer-facing

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
- `Billing`
- `Settings`

These labels remain Wealth Factory-first even when the underlying shell structure comes from Hermes.

### Keep available only as hidden future scaffolding

Hermes-style sections that may be useful later should be representable in code behind feature flags, but not visible by default and not linked in the live customer UI.

Examples include future route groups, richer assistant surfaces, advanced internal dashboards, or other layout partitions that would benefit from the Hermes shell.

### Exclude from current customer product

The following Hermes concepts are explicitly out of scope for the visible UI:

- Hermes system actions
- restart and update actions
- logs
- environment variable views
- configuration editing
- plugin management
- skills management
- cron management
- PTY or terminal-backed chat
- Hermes or Nous branding

## Proposed Architecture

### 1. Shell primitives

Introduce Hermes-style shell primitives into the Wealth Factory app:

- responsive sidebar container
- mobile navigation overlay
- topbar and page-title strip
- scrollable main content region
- page header slot pattern for title and right-side actions

The shell should be structurally close to Hermes, but its nav model, branding, and labels should be defined by Wealth Factory code.

### 2. Route model

Move away from a purely local page-toggle shell and refit the dashboard to a route-based structure that mirrors Hermes navigation behavior.

Requirements:

- visible routes map to Wealth Factory pages
- hidden future routes are scaffolded behind flags
- the route model is extensible without renaming customer-facing pages later
- current test hooks remain available or are replaced with stable equivalents

### 3. Theme system

Adopt a Hermes-derived global token layer based on CSS custom properties.

Requirements:

- tokens apply across shell and page interiors
- theme choice affects cards, forms, tables, search, nav, and detail panels
- current Wealth Factory presets are remapped into the token system
- `Settings` updates the active theme globally

The implementation should prefer a centralized theme state rather than page-local styling branches.

### 4. Feature flags

Future Hermes-like extra surfaces should be hidden behind flags from day one.

Requirements:

- flags default to off
- flags gate nav visibility and route accessibility for future sections
- visible customer flows do not mention hidden routes
- enabling a flag later should require minimal shell changes

## UX Rules

### Naming

Use Wealth Factory naming wherever a customer sees labels, headings, summaries, buttons, status copy, and page descriptions.

### Shell fidelity

Use Hermes layout behavior, spacing logic, responsive framing, and topbar interaction patterns as closely as practical without importing Hermes admin behavior.

### Settings

`Settings` remains a first-class page and acts as the customer-facing home for:

- theme switching
- visual preferences
- safe notification preferences
- support links
- tenant-visible preferences that do not expose operator internals

### Safe future-proofing

The code may retain hidden route scaffolding and hidden flaggable sections, but the visible product must remain calm, business-safe, and package-bounded.

## Data Flow

- `dashboard-client.ts` remains the source for tenant/package snapshot data unless a more route-friendly wrapper is introduced during refit.
- Theme state should be app-global and available to both shell and page components.
- Page titles and summaries should be derived from route-aware metadata rather than deeply duplicated conditional rendering.
- Hidden routes should be registered through a nav configuration layer so flags can control visibility centrally.

## Implementation Constraints

- Do not blindly import Hermes API wiring or admin endpoint assumptions.
- Do not bring over Hermes plugin slots, system actions, or embedded terminal logic in the first pass.
- Preserve current Wealth Factory behavior around provider gating, result approval states, paused workflows, and storage connection indicators.
- Avoid over-engineering new abstractions that only serve speculative future features.
- Prefer extracting focused local components if `App.tsx` grows too large during the route refactor.

## Testing Strategy

### Functional

- confirm the visible Wealth Factory nav still works
- confirm hidden flagged routes are not visible by default
- confirm `Settings` changes theme globally
- confirm workflow gating still depends on the required provider state
- confirm results, providers, and files retain current key behaviors

### Regression

- update unit tests around dashboard snapshot shaping only if route refactor changes assumptions
- update Playwright tests to follow the new shell structure and stable selectors
- verify mobile nav behavior and sidebar dismissal

### Quality gates

- `npm run lint`
- `npm run build`
- `npm test`
- relevant e2e coverage for dashboard shell behavior

## Risks And Mitigations

### Risk: shell transplant changes too much at once

Mitigation:
Keep page content logic intact while replacing framing first, then refit internals only where required by the Hermes shell.

### Risk: theme tokens conflict with existing handcrafted CSS

Mitigation:
Replace broad shell-level CSS deliberately, and normalize page internals to token-driven colors instead of mixing both systems indefinitely.

### Risk: route refactor introduces behavior regressions

Mitigation:
Preserve stable page keys, explicit metadata, and test ids while moving to route-aware rendering.

### Risk: hidden future sections leak into the UI

Mitigation:
Gate both navigation and route exposure behind central flags that default off.

## Recommended Delivery Sequence

1. Add Wealth Factory shell metadata and flag configuration.
2. Introduce Hermes-style page-header and shell primitives.
3. Convert the dashboard into route-based page rendering.
4. Port Hermes-derived global tokens and adapt Wealth Factory presets.
5. Refit current visible pages into the new shell.
6. Wire `Settings` to the global theme state.
7. Update tests and run verification.
8. Perform a final detail-focused review for edge cases, bloat, and scope creep.

## Explicit Non-Goals For This Pass

- live Hermes backend integration
- exposing hidden Hermes admin pages
- replacing Wealth Factory copy with Hermes terminology
- building speculative new features just because hidden scaffolding exists
- solving the broader server-authorized session architecture in this shell pass
