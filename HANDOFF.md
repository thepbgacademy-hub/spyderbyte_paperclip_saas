# Handoff: Current Build Position

This handoff is intentionally overwritten after each phase. It now describes the exact current build position and the next post-MVP continuation point for a fresh session.

## Status

Phases 0 through 7 are complete, tested, reviewed, and committed.

The project is no longer in the initial MVP planning/build phase. The next session should start post-MVP hardening and productization for the customer-facing SaaS brand **Wealth Factory**.

## Reference Docs

- `docs/design.md`
- `docs/build.md`
- `docs/dashboard-design-prep.md`
- `docs/reviewer-notes.md`
- `deploy/runbooks/deploy-poc.md`
- `deploy/runbooks/incident-response.md`
- `TODO.md`

## Product Position

Wealth Factory is the customer-facing SaaS. Paperclip is private infrastructure.

Customers subscribe as companies. Each subscribing company must see only Wealth Factory wording, workflows, credentials, runs, results, billing, and support language. Customers must never see Paperclip names, prompts, skills, commands, agents, raw logs, tool calls, private company mappings, backend secret handles, service tokens, or private workflow-engine identifiers.

Do not rely on LLM memory or prompt instructions to enforce this rebrand. The product boundary must be deterministic TypeScript code and tests.

## Next Build Order

1. Build the deterministic TypeScript Wealth Factory boundary layer described in `docs/build.md`.
2. Expand company-specific provider credential lanes.
3. Replace the Phase 5 demo UI state with authenticated API-backed state.
4. Build the full Wealth Factory control panel/dashboard from `docs/dashboard-design-prep.md`.
5. Deploy the POC to the VPS using the Phase 6 deployment runbooks once credentials and final Supabase target are available.

Do not build customer-facing dashboard routes before the boundary layer exists.

## Boundary Layer Requirements

Required files:

- `src/wealthfactory/workflow-registry.ts`
- `src/wealthfactory/dto-mappers.ts`
- `src/wealthfactory/response-guard.ts`
- `src/wealthfactory/public-errors.ts`
- `tests/wealthfactory-boundary.test.ts`

The boundary layer must own public Wealth Factory workflow names, private Paperclip mappings, DTO mapping, public error mapping, forbidden-term checks, and forbidden-field checks. The browser consumes only Wealth Factory DTOs.

Forbidden customer-facing terms and fields include:

- `Paperclip`
- `prompt`
- `skill`
- `command`
- `agent`
- `tool call`
- `raw activity`
- `internal log`
- `companyId`
- `secretRef`
- service tokens
- backend secret handles
- private Paperclip URLs
- raw provider responses

## Provider Position

OpenAI is the encouraged/default provider, but every company must bring or authorize its own credentials.

Supported post-MVP provider lanes:

- `openai_api`
- `openai_chatgpt_codex_subscription`
- `anthropic_api`
- `xai_grok_api`
- `openrouter_api`
- `generic_api`

Nuances to preserve:

- ChatGPT/Codex subscription auth is possible through Paperclip's `codex_local` adapter and the Codex CLI, but it must be isolated by company or authorized company user.
- Never use a shared server/operator `~/.codex`, `CODEX_HOME`, ChatGPT login, or provider API key for subscriber work.
- Use isolated `CODEX_HOME` per company or authorized company user.
- Subscription mode must fail if `OPENAI_API_KEY` is present in the runtime environment, because that turns Codex into API-key billing.
- Anthropic, xAI/Grok, OpenRouter, and generic API providers use the same secret-reference model as OpenAI API keys.
- OpenRouter usage reporting should distinguish `biller=openrouter` from the upstream model/provider when available.

## Required Starting Checks

- Create `src/wealthfactory/workflow-registry.ts`, `src/wealthfactory/dto-mappers.ts`, `src/wealthfactory/response-guard.ts`, and `src/wealthfactory/public-errors.ts`.
- Add `tests/wealthfactory-boundary.test.ts` before exposing new dashboard API routes.
- Expand provider credentials to company-specific OpenAI API, Anthropic API, xAI/Grok API, OpenRouter API, and optional company-isolated ChatGPT/Codex subscription auth.
- Never use a shared server/operator `~/.codex`, `CODEX_HOME`, ChatGPT login, or provider API key for subscriber work.
- Replace Phase 5 demo UI state with authenticated API-backed state.
- Derive tenant role and operator role from server-side authorization.
- Use Wealth Factory DTOs rather than raw database rows or internal workflow responses.
- Add route tests proving tenant isolation and operator-only access.
- Add response-guard tests proving Paperclip/internal terms and fields are rejected.
- Add Playwright tests for member, owner, and operator paths.
- Keep `npm run build`, `npm test`, `npm run lint`, `npm run build:web`, and `npm run e2e` passing as the dashboard grows.

## Hard Rules

- Users must never see Paperclip prompts, skills, commands, agents, tool calls, raw logs, or internal configuration.
- OpenAI should remain the encouraged/default provider, but every company must bring or authorize its own credentials.
- Anthropic, xAI/Grok, OpenRouter, and generic providers must use the same secret-reference model as OpenAI API keys.
- ChatGPT/Codex subscription auth must be isolated by company or authorized company user.
- Supabase RLS must protect provider metadata and secret references because metadata can be sensitive.
- Subagents and implementers are not alone in the codebase. Do not revert others' work.
- All code and docs require reviewer scrutiny before acceptance.
