Date: 2026-05-13

Reference docs:

- `docs/dashboard-visual-baseline.md`
- `docs/dashboard-focused-page-baselines.md`
- `docs/dashboard-field-contracts.md`

## Purpose

This document converts the focused dashboard page baselines into image-generation-ready prompts.

These prompts should be used to create visual concept baselines for:

1. `Results`
2. `Workflows`
3. `Providers`
4. `Team`
5. `Insights`

The goal is not marketing art. The goal is realistic, implementation-friendly product UI that can guide React build work later.

## Shared Visual Rules

Across all page renders:

- show a realistic desktop SaaS interface
- keep the Wealth Factory shell stable across all screens
- use a dark premium interface with calm, businesslike energy
- prefer charcoal, graphite, muted blue, restrained green, and small amber warning accents
- use compact, polished cards with breathing room
- avoid card soup, oversized hero text, purple AI gradients, exposed technical language, or sci-fi HUD styling
- use only customer-safe Wealth Factory wording
- no Paperclip language, prompts, raw skill-pack names, agents, logs, queue states, or other backend mechanics

## Results Screen Prompt

### Visual Goal

Render `Results` as a calm review-and-delivery desk.

### Screen Priorities

- selected result is the center of gravity
- result list is compact and scannable
- approval and export actions are obvious
- customer-owned storage delivery is visible but not noisy

### Prompt

`Create a highly realistic desktop product-design screenshot for Wealth Factory showing the Results screen of a premium business operations web app. Keep the interface dark, calm, and implementation-friendly, like a real SaaS dashboard captured from a browser, not a marketing image. The shell should match a stable Wealth Factory layout with a left navigation rail, compact top bar, large central canvas, and an optional narrow right context rail.`

`This Results page should feel like a calm review-and-delivery desk. In the main area, show a compact results list on the left with items that include title, related workflow name, short summary, timestamp, and a small status chip. In the center, show one selected result detail card as the visual focus, including a clean summary block, a preview area for the output, approval controls, and a small milestone/history section written in customer-safe language. On the right, show a restrained export and expiry context panel with Google Drive, Dropbox, download readiness, and expiration timing.`

`Use business-safe microcopy such as Awaiting review, Ready to download, Sent to Google Drive, Revision requested, and Reconnect storage. Show compact action buttons for approve, request revision, download, and send to storage. Make the design feel polished and breathable, with matte graphite surfaces, muted blue selection accents, restrained green success states, and soft amber warning states. Avoid any developer-console feeling, raw logs, giant charts, technical error dumps, or cluttered panel stacks.`

## Results Screen Prompt, Pass 2

### Refinement Goal

Open up the `Results` layout so it feels less cramped and more premium while keeping the same underlying structure.

### Refinement Priorities

- increase breathing room between major cards
- make the selected result detail pane more dominant
- keep the result list compact but less visually crowded
- reduce the feeling of too many stacked controls
- preserve business-safe language and export clarity

### Prompt

`Create a highly realistic desktop product-design screenshot for Wealth Factory showing a refined second-pass Results screen for a premium business operations web app. Keep the same dark Wealth Factory shell with left navigation, compact top bar, and narrow right context rail, but improve the breathing room and visual hierarchy so the screen feels calmer, more premium, and less cramped than a typical dashboard. This should look like a real browser screenshot of a production SaaS app, not a concept illustration.`

`Design this Results page as a calm review-and-delivery desk. Use a compact, scannable results list in the left column with fewer visible items and more spacing between rows. Make the center selected-result detail pane clearly larger and more dominant, with a clean summary block, a tasteful preview area, a short milestone/history section, and approval controls placed low and clearly in the reading path. Keep the right-side export and expiry context panel slimmer and simpler, with Google Drive, Dropbox, download readiness, and expiration timing presented cleanly without crowding the center pane.`

`Use customer-safe labels such as Awaiting review, Ready to download, Sent to Google Drive, Revision requested, and Reconnect storage. Favor restrained typography, crisp borders, matte graphite panels, muted blue selection accents, restrained green success states, and soft amber warning states. Leave more empty space between major regions, reduce visual noise, and avoid dashboard congestion, developer-console vibes, stacked button clutter, oversized analytics, or technical language.`

## Workflows Screen Prompt

### Visual Goal

Render `Workflows` as an execution launcher with selected-detail focus.

### Screen Priorities

- workflow list is easy to scan
- selected workflow detail clearly explains what the workflow does
- launch readiness is obvious
- the page feels operational, not salesy or builder-oriented

### Prompt

`Create a highly realistic desktop product-design screenshot for Wealth Factory showing the Workflows screen of a premium business operations web app. Keep the same stable shell as the rest of the product: dark left navigation rail, compact top utility bar, central working canvas, and optional narrow right rail. The visual style should be calm, premium, implementation-friendly, and clearly inspired by a textured green-black command-center aesthetic with tactile cream utility buttons, not a generic dark SaaS or flashy futuristic interface.`

`This Workflows page should feel like an execution launcher, not a marketplace or automation builder. In the main area, favor a compact scannable workflow list in the left column rather than a tile mosaic or gallery wall. Each list item should include workflow name, one-line description, required provider tags, and a readiness status. In the center, show a selected workflow detail card as the visual focus, including outcome summary, inputs the customer should be ready to provide, required providers, output type, and the next customer-actionable milestone when the workflow is already in motion. Also include a clean launch-readiness card with states such as Available now, Connection needed, Needs add-on, Try again in a moment, and a dominant Start workflow button.`

`Use a narrow right rail only for selected-workflow context like required connections, simple before-you-start reminders, and a small needs-attention summary tied only to that workflow. Keep the composition tidy and low-noise. Avoid upsell modules, marketing tiles, generic AI aesthetics, backend workflow mechanics, or dense analytics.`

## Providers Screen Prompt

### Visual Goal

Render `Providers` as a trustworthy setup checklist for BYOK providers, subscriptions, and customer-owned storage.

### Screen Priorities

- connection health is obvious
- the page feels safe and non-technical
- optional vs required connections are easy to understand
- storage ownership is reassuring

### Prompt

`Create a highly realistic desktop product-design screenshot for Wealth Factory showing the Providers screen of a premium business operations web app. Keep the same stable dark Wealth Factory shell with left navigation, compact top bar, and clean main workspace. The screen should feel like a setup checklist, not an infrastructure console, and should carry the same textured green-black surfaces and tactile cream utility buttons as the rest of the Hermes-inspired Wealth Factory shell.`

`In the main workspace, show grouped cards for provider connections, subscription connections, and storage connections. Provider cards should include OpenAI, ChatGPT / Codex subscription, Anthropic, xAI / Grok, and OpenRouter. Storage cards should include Google Drive and Dropbox. Each card should show provider name, connection state, short safe description, last verified time, and a clear customer-safe action such as Connect, Reconnect, or Update connection. Include a small requirements summary card that clarifies which connections are required for the installed package, which are optional, and which are only needed for certain workflows or hires.`

`Use customer-safe labels such as Connected, Needs attention, Reconnect required, Not needed for your package, and Storage ready. Include trust-building language that reassures the user that Wealth Factory uses only the access needed to keep workflows working and that files are delivered to storage the customer controls. Avoid raw API key language, OAuth details, secret references, admin-console jargon, or scary technical warnings. Keep the cards compact, polished, and easy to scan.`

## Team Screen Prompt

### Visual Goal

Render `Team` as a roster-plus-capability surface for included roles, hired roles, and premium `Power Plays`.

### Screen Priorities

- roles feel like people/products, not backend capability bundles
- included, hired, and locked states are easy to scan
- marketplace expansion lives inside the page without becoming a noisy store
- power plays feel premium but still bounded

### Prompt

`Create a highly realistic desktop product-design screenshot for Wealth Factory showing the Team screen of a premium business operations web app. Keep the same stable dark Wealth Factory shell with textured green-black surfaces, crisp dividers, and tactile cream utility buttons. The screen should feel like a calm executive roster and capability deck, not an HR tool and not a backend skill registry.`

`In the main workspace, show a top summary area with package-aware chips such as Included, Hired, and Available unlocks. Below it, show three clear tabs: Included Team, Hired, and Power Plays. The default view should present compact persona cards with role name, short resume line, outcome summary, status label such as Included, Hired, Available, Locked, or Needs provider, and a clean action like View profile, Activate, or Unlock. Include a selected-detail pane or expanded card that explains what the chosen role helps with, expected outputs, and any provider requirements. The Power Plays tab should feel premium and curated, not like a generic app marketplace.`

`Use business-safe language only. Avoid any references to skills, prompt bundles, agents, commands, hidden tool inventories, or package internals. Keep the page elegant, scannable, and slightly aspirational without turning it into sales clutter.`

## Insights Screen Prompt

### Visual Goal

Render `Insights` as a customer-safe operational analytics page using Hermes-like table and chart patterns.

### Screen Priorities

- usage and output feel business-relevant, not technical
- KPI strip is clean and readable
- charts are restrained
- recent-work table is the anchor for interpretability

### Prompt

`Create a highly realistic desktop product-design screenshot for Wealth Factory showing the Insights screen of a premium business operations web app. Keep the same Hermes-inspired shell language: textured dark green-black background, crisp dividers, restrained green highlights, tactile cream utility buttons, and business-safe typography. The page should feel like an executive analytics view, not a developer observability console.`

`In the main workspace, show a top KPI strip with cards for Usage, Output, Average Turnaround, and Package Status. Below that, show two restrained charts side by side: one for activity or output volume over time, and one for turnaround trend. Under the charts, show a recent work table with customer-safe columns such as Date, Work type, Status, Turnaround, and Delivered via. Include a compact package utilization card showing used this period, remaining, and renewal or reset timing.`

`Use customer-safe labels such as Used this period, Completed successfully, Average turnaround, Near package limit, and Output volume. Avoid raw token accounting, model names, trace spans, retry counters, queue terms, or backend telemetry language. The page should feel confident and useful to a business owner.`

## Combined Three-Screen Concept Board Prompt

Use this when generating one concept board instead of three separate images:

`Create a realistic three-panel product concept board for Wealth Factory, showing three desktop SaaS screens side by side in this order: Results, Workflows, Providers. Each screen should look like part of the same premium dark business operations platform, with a stable left navigation rail, compact top bar, and calm graphite surfaces. The style should be implementation-friendly and realistic, not marketing art.`

`Panel 1, Results: show a calm review-and-delivery desk with a compact results list, a selected result detail card with preview and approval controls, and a right-side export/expiry context panel featuring Google Drive, Dropbox, and download readiness. Use customer-safe labels like Awaiting review, Ready to download, Sent to Google Drive, Revision requested, and Reconnect storage.`

`Panel 2, Workflows: show an execution launcher with a compact scannable workflow list in the left column, a selected workflow detail card explaining outcome, inputs, required providers, and next customer-actionable milestone, plus a launch-readiness card with labels like Available now, Connection needed, Needs add-on, and Ready to start. Avoid a card mosaic or marketplace wall.`

`Panel 3, Providers: show a trustworthy setup checklist with grouped provider, subscription, and storage cards for OpenAI, ChatGPT / Codex subscription, Anthropic, xAI / Grok, OpenRouter, Google Drive, and Dropbox, plus a compact requirements summary card. Use labels like Connected, Needs attention, Reconnect required, Not needed for your package, and Storage ready. Keep the actions customer-safe and specific, such as Connect, Reconnect, and Update connection.`

`Across all three panels, use Wealth Factory branding colors with restrained muted blue selection accents, restrained green success states, soft amber warnings, dark green-black textured backgrounds, crisp borders, tactile cream utility buttons, polished compact cards, and business-safe language only. Avoid purple AI gradients, giant hero text, generic charcoal SaaS flatness, cluttered analytics mosaics, exposed backend terminology, Paperclip references, logs, prompts, or sci-fi UI styling.`
