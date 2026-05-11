# Handoff: MVP/POC Complete

This handoff is intentionally overwritten after each phase. It now describes the next post-MVP continuation point and points workers to the durable docs.

## Status

Phases 0 through 7 are complete, tested, reviewed, and committed.

## Reference Docs

- `docs/design.md`
- `docs/build.md`
- `docs/dashboard-design-prep.md`
- `docs/reviewer-notes.md`
- `deploy/runbooks/deploy-poc.md`
- `deploy/runbooks/incident-response.md`
- `TODO.md`

## Next Build

Post-MVP: Build the full Wealth Factory control panel/dashboard from `docs/dashboard-design-prep.md`.

Before building customer-facing dashboard routes, implement the deterministic TypeScript Wealth Factory boundary layer described in `docs/build.md`. Do not rely on LLM memory or UI copy discipline for rewording. Do not expose internal workflow-engine prompts, skills, commands, agents, tool calls, raw logs, service routes, private company mappings, service tokens, BYOK values, backend secret handles, or private workflow identifiers.

## Required Starting Checks

- Replace Phase 5 demo UI state with authenticated API-backed state.
- Create `src/wealthfactory/workflow-registry.ts`, `src/wealthfactory/dto-mappers.ts`, `src/wealthfactory/response-guard.ts`, and `src/wealthfactory/public-errors.ts`.
- Add `tests/wealthfactory-boundary.test.ts` before exposing new dashboard API routes.
- Expand provider credentials to company-specific OpenAI API, Anthropic API, xAI/Grok API, OpenRouter API, and optional company-isolated ChatGPT/Codex subscription auth.
- Never use a shared server/operator `~/.codex`, `CODEX_HOME`, ChatGPT login, or provider API key for subscriber work.
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
