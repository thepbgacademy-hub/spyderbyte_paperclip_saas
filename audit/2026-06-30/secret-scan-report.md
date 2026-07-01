# Secret Exposure Scan

Date: 2026-06-30

Scope: Codex auth-home readiness hotzones touched by the VPS device-auth proof, plus targeted git history searches for those same paths.

## Executive Summary

No exposed live secrets were identified in the scanned hotzone files.

The VPS Codex device auth material was installed directly into the tenant-isolated VPS `CODEX_HOME` and was not written into the repository, audit artifacts, HTML summary, tests, or handoff docs. The current tree findings were compose/env placeholder references only. The targeted history signals were placeholders, sanitizer regexes, or prose/test references, not committed credential material.

## Files Scanned

- `audit/2026-06-30/vps-codex-auth-home-readiness-proof.json`
- `deploy/docker-compose.vps2-isolated-stage.yml`
- `deploy/env/wf-stage.vps2.example.env`
- `scripts/prove-codex-auth-home-readiness.mjs`
- `tests/prove-codex-auth-home-readiness.test.ts`
- `tests/vps2-isolated-stage-config.test.ts`
- `tests/handoff-docs.test.ts`
- `wf-harness/HANDOFF.md`
- `wf-harness/TODO.md`
- `vps-codex-auth-home-provisioning-summary.html`

## Methodology

- Ran a masked current-tree scan for provider-shaped secrets and assigned credential patterns.
- Checked OpenAI, Stripe, GitHub, AWS, private-key, database URL, bearer token, JWT, and generic secret-assignment patterns.
- Ran targeted git history searches over the hotzone paths for high-risk markers, including OpenAI-style keys, Supabase service-role markers, private-key markers, GitHub tokens, Stripe webhook/secret markers, and database URL markers.
- Masked all scan evidence and did not print or record raw credential material.

## Findings

### Current Tree

No confirmed exposed secrets.

The scanner found six compose variable references in `deploy/docker-compose.vps2-isolated-stage.yml` that look like secret-bearing environment names, such as Paperclip token variables. These are Docker Compose variable placeholders and required-env guards, not raw credential values.

Severity: Info

Remediation: No rotation required. Continue keeping real values in operator-controlled env files or secret stores, not in the repository.

### Git History

No confirmed exposed secrets in the scanned hotzone history.

The history scan found markers for Supabase service-role variable names, placeholder database URLs, sanitizer regexes, test assertions against secret-shaped patterns, and ordinary prose containing `disk-backed`. No raw key, bearer token, private key, Codex auth state, or concrete database credential was identified in these hotzone history results.

Severity: Info

Remediation: No history cleanup required for the scanned hotzone paths based on this pass.

## Hotzone Result

The Codex auth-home readiness hotzone is safe to proceed from a repository secret-exposure standpoint.

The actual VPS Codex auth state remains operationally sensitive and must stay out of source control, audit artifacts, logs, and summaries. Future scripts and reports should continue recording only boolean readiness fields and masked target identifiers.

## Provider Binding Repair Hotzone Addendum

After hardening `scripts/repair-openai-device-provider-binding.mjs`, a second focused scan covered the provider-binding repair hotzones:

- `scripts/repair-openai-device-provider-binding.mjs`
- `tests/openai-device-provider-binding-repair-script.test.ts`
- `deploy/runbooks/first-subscriber-launch-checklist.md`
- `tests/handoff-docs.test.ts`
- `wf-harness/HANDOFF.md`
- `wf-harness/TODO.md`
- `audit/2026-06-30/vps-codex-auth-home-readiness-proof.json`
- `audit/2026-06-30/secret-scan-report.md`

Result: no confirmed exposed secrets in the provider-binding repair hotzone current tree.

The scan also confirmed the active first-subscriber launch checklist no longer contains the literal local secrets-folder marker; it now uses the generic phrase "local secrets-folder paths."

## Residual Risk

This scan intentionally focused first on the changed Codex auth-home hotzones and targeted history for those paths. A full repository history scan was attempted but timed out in the large/noisy working tree. Before a public release candidate, run a dedicated full-history scanner with a longer timeout or specialized tooling.

## Full Current-Tree Addendum

After the provider-binding transaction implementation, a bounded full current-tree scan was run with generated/bulky folders excluded (`.git`, `node_modules`, `dist`, `build`, `.next`, coverage, cache, test-results, media/binary artifacts, and lockfiles).

Result: no confirmed exposed live secrets in the current tree.

The scan returned only expected placeholders, test fixtures, and masked audit examples:

- `.env.example` and `deploy/env/wf-stage.vps2.example.env` use `replace-with-password` placeholder database URLs.
- Stage/live tests contain deterministic local fixture URLs such as `postgresql://demo:***@...` and forbidden-text assertions such as `Bearer should-not-be-public`.
- Audit reports contain masked or explicitly dummy examples.
- Paperclip client tests use fixture bearer strings, not live provider credentials.

Residual risk after this addendum: full git-history depth still needs a dedicated long-running scan before a public release candidate, but the current working tree and changed auth/provider hotzones do not show confirmed exposed secrets.
