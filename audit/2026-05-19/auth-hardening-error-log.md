# Auth Hardening Error Log

## 2026-05-19

### Scope
- Replace shared static runtime auth with signed session-token auth.
- Keep a running list of failures, fixes, and patterns so they are not repeated.

### Entries
- Pending initial implementation and verification cycle.
- `apply_patch` failed on the first deploy runbook update because the expected smoke-check block had drifted from the current file. Fix: inspect live line ranges with `rg`/`Get-Content`, then patch against current content instead of stale assumptions.

### Change Set 1
- Replaced shared static bearer-token auth with signed runtime session-token auth in `src/api/runtime-auth.ts`.
- Added `npm run create:runtime-session-token` helper for controlled deploy/test token minting.
- Updated env, compose, and deploy docs from fixed shared bearer/session values to signed session-token inputs.
- Verification failure 1: `npm run lint` failed because `ApiRole` was imported but unused in `src/api/runtime-auth.ts`. Fix: remove the unused import instead of suppressing the lint rule.
- Verification failure 2: `npm test` failed in `tests/runtime-server.test.ts` because the new signed-cookie shell test asserted that the HTML bootstrap should contain `"user-1"`. The actual customer-safe shell bootstrap intentionally exposes tenant and role, not raw user identifiers. Fix: assert `tenantId` and `role`, and explicitly assert that `userId` is not exposed.
- Reviewer follow-up 1: `tenant-settings-api` still used an authorization-only auth contract while the hardened runtime accepted `{ authorization, cookie? }`. Fix: widen the internal contract now so future HTTP surfaces do not silently drop cookie-backed sessions.
- Reviewer follow-up 2: “short-lived” signed session tokens were policy-only. Fix: enforce a maximum 60-minute TTL both when minting helper tokens and when verifying runtime session claims.
- Reviewer follow-up 3: a stale bearer header could override a valid same-site cookie. Fix: auth now tries both transports and accepts the first valid signed token, preferring the cookie when both are present.
- Reviewer follow-up 4: runbook and handoff language still referenced deploy bearer tokens. Fix: update operational docs to use signed runtime session token terminology.
- Closeout check: a second pass still found two lingering handoff references to the old deploy bearer-token language. Fix: update those final operator notes before staging so the repo does not carry conflicting auth guidance.
- Final reviewer follow-up 1: future-issued signed session tokens were still accepted because verification only checked expiry and max TTL. Fix: reject tokens whose `iat` is later than the verifier clock and add regression coverage.
- Final reviewer follow-up 2: `create:runtime-session-token` could run against stale `dist` output. Fix: make the npm helper rebuild the server bundle before minting and document that behavior in the deploy runbook.
- Closeout tooling sharp edge: a combined `git add && git commit && git push` PowerShell command failed because this shell does not accept `&&` as a statement separator. Fix: rerun stage/commit/push as separate commands and prefer PowerShell-compatible sequencing in future local ops.
