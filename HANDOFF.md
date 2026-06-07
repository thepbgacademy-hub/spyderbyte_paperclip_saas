# Handoff: Current Build Position

This handoff is intentionally overwritten after each phase. It now describes the exact current build position and the next continuation point for a fresh session.

## Status

Phases 0 through 9 are complete, tested, reviewed, and committed.

The first post-MVP productization slices are implemented locally: security baseline helpers, Wealth Factory boundary layer, package entitlements/provider requirements, temporary artifacts, expanded provider definitions, a Wealth Factory dashboard POC surface, the first API-backed dashboard foundation, and the first database-backed ACID/race-condition foundation.

The next session should enter through the harness lane first, read the current phased native-replacement plan, and continue from the now-complete Phase 9 third native harness workflow-family migration into the next bounded native-expansion seam instead of reopening Paperclip adapter dependency for already-migrated families. `wf_package_followup` is now native on the worker/runtime seam beside `wf_connect_first_workflow` and `wf_tax_strategy`, but board/start exposure still stays bounded to the explicitly selected board workflows rather than implying every native family is tenant-visible by default.

## Reference Docs

- `docs/design.md`
- `docs/build.md`
- `wf-harness/HANDOFF.md`
- `wf-harness/docs/plans/2026-06-05-wf-native-execution-replacement-plan.md`
- `docs/recovery-2026-05-16.md`
- `docs/recovery-backup-2026-05-14.md`
- `docs/dashboard-design-prep.md`
- `docs/reviewer-notes.md`
- `deploy/runbooks/deploy-poc.md`
- `deploy/runbooks/incident-response.md`
- `TODO.md`

## GitNexus Workflow Note

Use GitNexus as a proactive confidence layer before planning changes in sensitive runtime areas. Prefer it for blast-radius discovery before broad file reading.

Recommended local workflow:

- Set `GITNEXUS_HOME=E:\GitNexusHome`
- Exact commit truth: use `git diff` / `git log`
- Recent blast radius: `gitnexus detect-changes --repo spyderbyte_paperclip_saas --scope compare --base-ref HEAD~3`
- Structure and flow: use `gitnexus cypher`, `gitnexus context`, and `gitnexus impact`
- Ranked keyword discovery on Windows: `node E:\GitNexusHome\tools\gitnexus-fts-query.mjs --repo-path E:\REPOS\spyderbyte_paperclip_saas --query "<terms>" --limit 8`

Current caveat:

- GitNexus is useful right now for architecture and blast radius, but if `gitnexus status` shows a stale index or missing FTS indexes, treat exact current-change findings as lower confidence until the graph is refreshed.

## Product Position

Wealth Factory is the customer-facing SaaS. Paperclip is private infrastructure.

Customers subscribe as companies. Each subscribing company must see only Wealth Factory wording, workflows, credentials, runs, results, billing, and support language. Customers must never see Paperclip names, prompts, skills, commands, agents, raw logs, tool calls, private company mappings, backend secret handles, service tokens, or private workflow-engine identifiers.

Do not rely on LLM memory or prompt instructions to enforce this rebrand. The product boundary must be deterministic TypeScript code and tests.

## Completed In Current Slice

- Security baseline helpers in `src/security/cors.ts` and `src/security/rate-limit.ts`.
- Wealth Factory boundary layer in `src/wealthfactory/*`.
- Package entitlement and asset registry primitives in `src/packages/*`.
- Expanded provider lane definitions and Codex subscription validation in `src/providers/provider-types.ts`.
- Worker-level entitlement re-checks in `src/workflows/worker.ts` so stale/replayed jobs fail closed before private workflow calls.
- Temporary artifact service in `src/artifacts/artifact-service.ts`.
- Customer-owned storage provider definitions in `src/storage/storage-provider-types.ts`.
- Customer-owned storage connector registry in `src/storage/storage-connector-service.ts`.
- Authenticated dashboard API DTO primitive in `src/api/dashboard-api.ts`.
- Supabase schema coverage for packages, package installs, provider requirements, artifact metadata, and storage connectors.
- Dashboard client abstraction in `apps/web/src/dashboard-client.ts`.
- API-backed dashboard client fetch mapping in `apps/web/src/dashboard-client.ts`.
- Dashboard HTTP boundary in `src/api/dashboard-http.ts`.
- Tenant settings API for provider credentials and storage connectors in `src/api/tenant-settings-api.ts`.
- Supabase `wfpc` repository mappers in `src/db/supabase-repositories.ts`.
- Self-hosted Supabase pooler Postgres client factory in `src/db/postgres-client.ts`.
- ACID guard repository in `src/db/acid-guard-repository.ts`.
- Runtime server adapter in `src/api/runtime-server.ts`.
- BullMQ-backed workflow queue bridge in `src/workflows/bullmq-workflow-queue.ts`.
- Temporary public-Paperclip verification script in `scripts/verify-paperclip-target.mjs`.
- ACID workflow run reservation facade in `src/workflows/acid-run-reservation.ts`.
- ACID worker status recorder in `src/workflows/acid-status-recorder.ts`.
- ACID package install service in `src/packages/acid-package-install-service.ts`.
- ACID credential revoke service in `src/secrets/acid-secret-revoke-service.ts`.
- Repeat-safe live schema helper in `scripts/apply-wfpc-migration.mjs`.
- ACID guard migration in `supabase/migrations/0002_acid_race_guards.sql`.
- Wealth Factory dashboard POC updates in `apps/web/src/App.tsx`.
- Tests for security, boundary, entitlements, artifacts, provider lanes, and E2E dashboard behavior.
- Tests for dashboard HTTP, dashboard client mapping, Supabase repository mappers, Postgres client behavior, and tenant settings APIs.
- Provider enum support in the initial Supabase migration and DB types for OpenAI API, ChatGPT/Codex subscription auth, Anthropic, xAI/Grok, OpenRouter, and generic providers.
- Live Supabase reachability confirmed from Windows through the self-hosted pooler with `SUPABASE_DB_SSL=false`; `wfpc` has 16 tables.
- Live Supabase now includes `wfpc.workflow_run_reservations` with RLS enabled, idempotency uniqueness, active credential uniqueness, secret lookup, and status guard indexes.
- Live Supabase now includes `wfpc.tenant_package_purchases` with RLS enabled, tenant/package uniqueness, and active purchase lookup support.
- Live Supabase now includes `wfpc.workflow_queue_outbox` with RLS enabled, idempotent run/workflow uniqueness, pending/stale-claimed lookup support, claim-token fencing, bounded durable-enqueue reconciliation before retry, backfill repair for queued reservations, and recovery worker/pump wiring in the runtime factory.
- Provider credential registration now has a vault-backed path: encrypted secret material is persisted in private `wfpc_private.vault_secrets` behind opaque `wf_secret_*` handles, while `wfpc.secret_references` stores only the handle, provider kind, label, and public metadata.
- Public provider registration responses now return only `{ providerKind, label, connected, metadata }`; no `secretRef`, vault handle, API key, token, or raw credential leaves the backend boundary.
- Google Drive and Dropbox storage connector setup now has runtime-reachable OAuth/PKCE begin/callback routes. The callback exchange requires offline refresh-token access, stores OAuth tokens in the encrypted vault, and persists connector secret references in private `wfpc_private.storage_connector_secrets`.
- Private storage connector secret rows now have same-tenant FK enforcement back to public `wfpc.storage_connectors`; OAuth public targets are sanitized before persistence, and browser-supplied Google Drive/Dropbox secret-reference registration is rejected.
- The API runtime now creates a BullMQ-backed workflow enqueuer from `REDIS_URL` and starts the durable outbox pump against that queue at boot.
- The worker runtime now starts a BullMQ consumer on boot and routes queue payloads through the tenant fairness gate before the guarded Paperclip execution path.
- Repo-owned live-drive scripts now exist for controlled runtime verification: `npm run check:live-runtime`, `npm run seed:demo`, `npm run queue:live-run`, and `npm run inspect:live-run`.
- The Paperclip client now accepts both `{ ok: true }` and the live target’s `{ status: "ok" }` health payload shape during the temporary public test-drive phase.

## Next Build Order

1. Fix VPS external exposure once the multi-project port plan is finalized: `5432` and `8000` are currently reachable from outside and must be firewall/allowlist restricted before commercial exposure. `8443` now probes closed externally.
2. Decide whether the storage OAuth routes should remain unavailable until Google Drive/Dropbox client credentials are configured, or whether the smoke gate should treat `503 {"code":"storage_oauth_unavailable"}` as an expected pre-config state.
3. Use the temporary public Paperclip lane only for controlled testing: run `npm run verify:paperclip-target`, then use `npm run seed:demo`, `npm run queue:live-run`, and `npm run inspect:live-run` to validate the live Redis/BullMQ path end to end. Treat queue-unreachable output as inconclusive instead of clean success, and confirm the worker can claim the run and the bound provider path reaches Paperclip without using shared credentials in the normal tenant-required mode.
4. Current live blocker as of 2026-05-19: the repo-side migration gap is fixed and `npm run check:live-runtime` now reports the VPS-backed database schema as bound-provider ready, but the running `wealth-factory-api` container is still an older partial runtime. It is missing the app/worker env needed for the full queue path, including `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`, `PAPERCLIP_BASE_URL`, `PAPERCLIP_SERVICE_TOKEN`, and the new signed-session auth env (`WF_API_SESSION_SIGNING_KEY`, plus optional issuer/audience overrides), and the VPS process list still shows no deployed `worker-main` process.
5. Next live-ops step: redeploy the Wealth Factory API with the full queue/Paperclip env set, deploy/start the repo's `worker-main` process, seed a real `wfpc.paperclip_company_mappings` row with a Paperclip company ID, and then rerun the controlled live drive.
6. Extend the first staged parallel-load fairness proof into longer sustained pressure runs, then tune `WF_WORKER_CONCURRENCY` and `WF_WORKER_MAX_ACTIVE_PER_TENANT` with measurement instead of assumption.
7. Re-run `npm run smoke:external` after the final firewall/allowlist policy is applied; it is now the repeatable external gate for DNS, intended ports, private ports, auth/CORS route behavior, and response leak checks.
8. Confirm the VPS runtime keeps using `createPostgresEncryptedVaultStore` with a strong `WF_VAULT_MASTER_KEY` and rotate any previously issued shared deploy tokens out of operator workflows now that the signed runtime session-token layer is in place.
9. Keep the repo-side Paperclip adapter steady for now. The installed Paperclip build has now proven:
   - issue assignment creates a real heartbeat run
   - `GET /api/issues/:identifier` can expose `executionRunId`/`checkoutRunId` shortly after assignment
   - `GET /api/heartbeat-runs/:runId` works
   - issue-scoped adapter env overrides reach runtime
   but it has not yet proven a safe secret-ref lane for tenant BYOK secrets. Do not pivot the checked-in Wealth Factory adapter until that secure injection path is understood.
10. New mapping checkpoint: `docs/paperclip-secret-ref-mapping.md` captures the secure direction that was proven live:
   - Wealth Factory should remain the tenant trust boundary and canonical BYOK vault
   - Paperclip should receive synchronized managed secrets plus bound `secret_ref` runtime config, not plain tenant `secretValues` on issue payloads
   - before adapter cutover, fix 2 repo seams:
     - current run binding storage is effectively single-provider even though the product model assumes future multi-capability workflows
     - keep the normalized capability-label contract on `bound_provider_context` and avoid drifting back to vendor-shaped values
   - the storage format still stays JSON-array-shaped, but the DB/apply/preflight seam now requires the cardinality guard `jsonb_array_length(bound_provider_context) <= 1`
   - current repo/runtime behavior now fails closed if a run ever carries more than one stored bound-provider entry or a mismatched provider kind, while still rewriting queued/running bindings to the current joined `secret_ref` when the same secret row rotates in place
11. Runtime hardening checkpoint now landed in the repo:
   - durable masked audit events now flow through `src/audit/durable-audit.ts` for API/worker secret composition and storage OAuth registration
   - OAuth callback state is now backed by `wfpc_private.oauth_pending_states`
   - authenticated route rate limiting is now backed by `wfpc_private.rate_limit_buckets`
   - `wfpc.paperclip_secret_bindings` now exists for Paperclip-managed secret sync bookkeeping
   - the Paperclip client now has a configurable issue-launch seam plus optional secret-sync hook while preserving the default sanitized `/runs` path
   - the worker runtime now honors explicit Paperclip launch-mode env controls and can validate bound company/agent/env-key secret bindings before issue launch
   - the API registration lifecycle can now project provider secrets into Paperclip through the admin lane when `WF_PAPERCLIP_ADMIN_TOKEN` and `WF_PAPERCLIP_ISSUE_AGENT_ID` are configured
   - the worker issue-launch path now refreshes Paperclip bindings idempotently in issue mode instead of assuming an existing binding is current
12. Immediate next repo step:
   - verify the live VPS Paperclip admin lane against the real board/admin token path and confirm the expected admin routes on the installed build
   - rerun staged verification against the Paperclip issue-launch lane with real admin-token provisioning enabled

13. Staged fairness checkpoint now landed:
- the repo now includes `scripts/lib/pressure-drive.mjs` plus the `npm run prove:live-fairness` helper
- the worker runtime now emits `wealth_factory_worker_fairness` logs with tenant-safe `queued` / `started` / `released` snapshots
- staged skewed burst proof succeeded with:
  - primary run `afd2ceca-4754-4f24-8b33-03aca6070d20`
     - secondary run `6614eac6-3ba1-4bd9-8f67-a5601c7535f4`
     - second primary run `9428a32c-9e29-4d54-bf6a-48ad70965bee`
   - all 3 runs reached `wfpc.workflow_runs.status = running`
- all 3 outbox rows reached `enqueued`
- BullMQ reported all 3 jobs `completed`
- the staged worker logs proved both tenants were admitted under the same single-worker lane while `WF_WORKER_CONCURRENCY=2` and `WF_WORKER_MAX_ACTIVE_PER_TENANT=1`
- the earlier single-worker checkpoint is now superseded by the multi-worker staged proofs below
- current sustained-burst checkpoint on 2026-05-20:
  - `prove:live-fairness` now supports `--mode drain` and emits per-run queue plus observed progress/start/completion timestamps, along with per-lane observed wait and retry summaries
  - it also now supports repeated `--lane lane:tenant:user:workflow:runs` inputs, so staged bursts are no longer limited to hard-coded primary/secondary/tertiary lanes
  - stage burst drain proof passed with:
    - primary runs:
      - `82219491-8916-47ca-9f5b-6924e1a48961`
      - `c656fdbb-3d90-4eb4-a2d1-07aeb18e6e9b`
      - `5828f991-2e10-42c6-9c1a-5e2ab2cdd149`
    - secondary runs:
      - `58352127-e4ef-477a-b364-d5f68833294d`
      - `7cb07fa7-7793-435f-a7a7-81c09e576073`
  - all 5 runs reached the stronger checkpoint:
    - `wfpc.workflow_runs.status = running`
    - outbox `status = enqueued`
    - BullMQ `state = completed`
  - observed wait-to-start:
    - primary: `min=2264ms`, `median=3493ms`, `max=4737ms`
    - secondary: `min=2098ms`, `median=2722ms`, `max=3345ms`
  - no retries and no queue-unreachable observations were reported
  - worker logs now also emit `wealth_factory_worker_run` start/release events with `workerInstanceId` and `observedAt`, so fairness output can be correlated back to concrete `runId` values
  - the repo now includes `scripts/analyze-worker-fairness.mjs` for turning a saved burst proof plus structured worker events into a global multi-worker fairness verdict
  - `prove:live-fairness --mode global-fairness` is now accepted as a capture alias, but it still records drain-phase proof and expects the analyzer to compute the final cross-worker verdict from worker logs
  - `workerInstanceId` is authoritative only when `WF_WORKER_INSTANCE_ID` is explicitly pinned in the worker env; the default `hostname:pid` fallback is best-effort staging telemetry
  - current global finding:
    - the first apparent `single_worker_only` result was a proof artifact caused by proof-worker env drift, a missing `WF_PAPERCLIP_SERVICE_TOKEN_MAP`, first-use Paperclip secret-sync collisions, and the analyzer only reading the last `--worker-events` file
    - after fixing those issues and rerunning the staged proof with warmed workers, `scripts/analyze-worker-fairness.mjs` reported `phase = global_multi_worker_fairness_observed`
    - proof worker `a` handled the primary lane while proof worker `b` handled the secondary lane
    - all 8 workflow runs reached `status = running`, all 8 outbox rows reached `enqueued`, and BullMQ reported all 8 jobs `completed`
    - conclusion: staged cross-worker fairness is now proven for the 2-worker / 2-tenant burst lane
  - current bounded-pod soak checkpoint:
    - a six-tenant / three-worker / three-cycle staged proof has now passed
    - additional staged lanes were provisioned for:
      - quaternary
      - quinary
      - senary
    - all 18 workflow runs reached `status = running`
    - all 18 outbox rows reached `enqueued`
    - BullMQ reported all 18 jobs `completed`
    - `scripts/analyze-worker-fairness.mjs` reported `phase = global_multi_worker_soak_observed`
    - worker start distribution was balanced:
      - `proof-a`: 6 starts
      - `proof-b`: 6 starts
      - `proof-c`: 6 starts
    - early coverage windows showed:
      - wave 1: first 3 starts covered 3 unique lanes across 3 workers
      - wave 2: first 6 starts covered all 6 lanes across 3 workers
    - observed wait-to-start:
      - primary: `min=2665ms`, `median=2748ms`, `max=4659ms`
      - secondary: `min=2579ms`, `median=2767ms`, `max=4465ms`
      - tertiary: `min=2402ms`, `median=2559ms`, `max=4033ms`
      - quaternary: `min=3845ms`, `median=4540ms`, `max=5739ms`
      - quinary: `min=3592ms`, `median=4386ms`, `max=5536ms`
      - senary: `min=3410ms`, `median=4191ms`, `max=5386ms`
    - conclusion: the bounded-pod checkpoint passed for a six-tenant, three-worker staged soak, but it still required a longer skewed soak before the pod shape could be treated as robust
  - current skewed-soak and saturation checkpoint on 2026-05-20:
    - a heavier six-lane / three-worker / three-cycle skewed soak has now passed with staggered lane ordering and `30` total requests:
      - primary: `3` runs per cycle
      - secondary: `2` runs per cycle
      - tertiary: `2` runs per cycle
      - quaternary: `1` run per cycle
      - quinary: `1` run per cycle
      - senary: `1` run per cycle
    - all `30` workflow runs reached `status = running`
    - all `30` outbox rows reached `enqueued`
    - BullMQ reported all `30` jobs `completed`
    - `scripts/analyze-worker-fairness.mjs` reported `phase = global_multi_worker_soak_observed`
    - worker start distribution remained healthy under the skewed burst:
      - `proof-a`: `12` starts
      - `proof-b`: `9` starts
      - `proof-c`: `9` starts
    - early coverage windows still showed meaningful multi-worker spread:
      - wave 1: first `3` starts covered `3` unique lanes across `2` participating workers
      - wave 2: first `6` starts covered all `6` lanes across `3` participating workers
    - local queue saturation polling from this workstation is not authoritative for the staged private-Redis lane:
      - the proof file recorded queue snapshots as unreachable because the local caller cannot see the private BullMQ Redis service directly
      - use worker telemetry plus VPS-side queue evidence as the source of truth for saturation on this lane
    - confirmed practical implication:
      - multi-worker fairness still held under the shorter skewed burst pressure
      - that checkpoint alone was not enough to clear the longer-soak risk
  - current longer-soak and VPS-side saturation checkpoint on 2026-05-20:
    - the repo now includes:
      - `scripts/inspect-live-queue-snapshot.mjs`
      - `scripts/analyze-resource-saturation.mjs`
      - `scripts/lib/resource-saturation.mjs`
    - a longer staggered soak was then run with `5` cycles and `50` total requests across the same six-lane / three-worker pod shape
    - all `50` workflow runs reached `status = running`
    - all `50` outbox rows reached `enqueued`
    - BullMQ reported all `50` jobs `completed`
    - queue depth sampled from inside the staged API container stayed healthy:
      - `waiting` high-water: `0`
      - `active` high-water: `2`
    - the first analyzer pass reported `phase = soak_cycle_distribution_failed`, but that turned out to be a proof expectation bug, not a worker-runtime failure
    - the staggered six-lane soak intentionally queued only `5` unique lanes inside the first `windowSize = 6` burst window, while the analyzer was incorrectly expecting `6`
    - after correcting the fairness window semantics in `scripts/lib/pressure-drive.mjs`, the saved staged proof re-analyzed cleanly:
      - `scripts/analyze-worker-fairness.mjs` reported `phase = global_multi_worker_soak_observed`
      - each cycle returned `phase = global_multi_worker_fairness_observed`
      - the second early coverage window now evaluates as:
        - `windowSize = 6`
        - `participatingWorkers = 3`
        - `expectedUniqueLanes = 5`
        - `uniqueLanesSeen = 5`
    - implication:
      - the current bounded pod both drains the longer skewed soak successfully and preserves cross-worker lane fairness under the corrected staged proof semantics
    - VPS-side resource sampling showed the dominant pressure is Paperclip, not Redis or the Wealth Factory workers:
      - `paperclip-gwry-paperclip-1`
        - peak CPU: `378.99%`
        - peak memory: `2553358057` bytes (`15.23%`)
        - peak PIDs: `1011`
      - Redis and the Wealth Factory proof workers remained comparatively light
    - next pressure gap:
      - keep Paperclip resource saturation under close watch during any longer soak or heavier pod experiments
      - decide whether the current six-client pod cap should stay as-is or be tuned down based on longer-duration Paperclip CPU, memory, and PID behavior
    - strict staged soak follow-up:
      - the proof workers were still pinned to `WF_PAPERCLIP_ISSUE_MAX_POLL_ATTEMPTS=30` until the staged worker env was updated and the workers were recreated
      - the repo default issue-launch poll budget is now `60` attempts; the current staged Paperclip lane still needs an explicit `120`-attempt override in `wf-stage-worker.env`
      - after raising that staged issue-launch poll budget override to `120` attempts, the `10`-cycle / `100`-request staggered soak reached:
        - `100` workflow runs at `status = running`
        - `100` outbox rows at `status = enqueued`
        - no remaining proof-worker log hits for `Paperclip issue launch did not resolve an execution run id` or `Paperclip board-session request failed: 500`
      - one final proof-layer issue surfaced:
        - `scripts/analyze-worker-fairness.mjs` was still inheriting the drain-only queue-state checkpoint before it evaluated worker start events
        - under the stricter soak, some per-run queue-state snapshots stayed partial even though the worker-event and run-state evidence were already complete
      - after tightening `global-fairness` to require worker-backed plus workflow-backed evidence for every requested run, the saved strict soak still re-analyzed cleanly:
        - `ok = true`
        - `phase = global_multi_worker_soak_observed`
        - all `10` cycles reported `global_multi_worker_fairness_observed`
      - same-worker Paperclip secret-sync dedupe is now agent-scoped; different issue agents no longer share the same in-flight binding promise
      - updated strict-soak Paperclip saturation:
        - peak CPU: `374.01%`
        - peak memory: `3988950876` bytes (`23.79%`)
        - peak PIDs: `2127`
      - implication:
        - the six-tenant / three-worker bounded pod has now survived the stricter staged `100`-request soak
        - the next question is operational sizing, not whether the backend can sustain the current bounded-pod shape at all

## Security Position

Wealth Factory will be sold to many companies. Security must cover user data, provider keys, PII, public APIs, exposed ports, vulnerabilities, race conditions, and Supabase RLS before commercial exposure.

The intended deployment is split-origin:

- The customer portal/dashboard can be hosted on a regular public website.
- The backend API, workers, Redis/BullMQ, and private Paperclip runtime run on the VPS.
- The browser calls only the Wealth Factory API over HTTPS.
- Paperclip, Redis, workers, Docker, admin/debug ports, Supabase service-role operations, and private service tokens remain server-side/private.
- Public VPS exposure should be limited to `80` and `443` through the reverse proxy.
- `api.spyderbyte.cloud` now proxies to a live `wealth-factory-api` container on the `supabase_default` Docker network through `supabase-caddy`.
- The live API container uses the internal Supabase Docker route `postgresql://postgres:<password>@supabase-db:5432/postgres` with `SUPABASE_DB_SSL=false`, not the public pooler URL.
- External checks now pass for API TLS, health, unauthorized dashboard rejection, allowed-origin CORS, and authenticated dashboard responses.
- Current external smoke still fails because `5432` and `8000` remain publicly reachable, and because storage OAuth is intentionally unconfigured so `/api/storage/oauth/google_drive/begin` returns `503 {"code":"storage_oauth_unavailable"}` without provider client IDs.
- CORS must allow only the configured portal origin(s). Wildcard CORS is forbidden for authenticated APIs.
- If cross-origin cookies are used, add `Secure`, `HttpOnly`, correct `SameSite`, and CSRF protection. If bearer tokens are used, validate issuer, audience, expiry, membership, and role.
- Supabase service-role keys, Paperclip tokens, provider credentials, and secret-reference handles must never reach browser code.

Required security files for the next roadmap:

- `src/security/cors.ts` exists.
- `src/security/rate-limit.ts` exists.
- `src/security/request-validation.ts` still needs full route integration beyond the dashboard HTTP primitive.
- `src/security/security-headers.ts` can be split from `cors.ts` when the HTTP layer is added.
- `src/security/csrf.ts` if cookie auth is used.
- `tests/security-boundary.test.ts` exists.
- `tests/race-conditions.test.ts`
- `deploy/runbooks/security-checklist.md`

Security tests to preserve:

- CORS allow/deny tests for portal and untrusted origins.
- RLS positive and negative tenant tests.
- Route-level tenant and operator authorization tests.
- Race-condition/idempotency tests for run creation, package install, entitlement change, tenant pause, and credential revoke/rotate.
- Database-backed ACID tests for workflow reservation, package install idempotency, credential revoke locks, and guarded status transitions.
- Queue payload tests proving no raw secrets or Paperclip internals are enqueued.
- Response-guard tests proving customer-facing responses contain only Wealth Factory terms and fields.
- Outside-the-VPS exposed-port smoke tests.
- Dependency and image vulnerability checks before deploy.

## Commercial Package Position

Wealth Factory is sold in monthly subscription packages.

- Each package is prebuilt for a specific industry, except the premium blank-canvas package.
- A package is a governed bundle of prompts, rules, allowed assets, workflows, employees, dashboards/templates, and result views.
- A company purchases a package and installs it from its dashboard.
- Initial signup should stay minimal; package-specific BYOK connections are requested after package install or when a workflow capability requires them.
- The installed package defines the company's allowed workflow/industry boundary.
- A workflow may never run outside the installed package/industry boundary.
- A workflow may only pull prompts/rules/assets from the installed package's allowed asset registry.
- A workflow may only use provider lanes allowed by the installed package and connected by the tenant.
- Business Coach and Brand SEO are examples of separate packages with separate asset registries; they must not cross-load each other's prompts, rules, employees, templates, or Paperclip mappings.
- Social Media is an example of a package that can require extra creative BYOK lanes such as image generation, video generation, social publishing, or media storage providers after install.
- Wealth Factory ships with basic CEO/CFO-style employees.
- Specialist employees are paid add-ons.
- Add-on employees and workflows remain scoped to the installed package/industry unless separately purchased.
- The premium blank-canvas tier starts with no prebuilt packages/workflows; the user designs the business from scratch.
- Subscription status and package/add-on entitlements must be checked before workflow run creation.

Required package files for the next roadmap:

- `src/packages/package-types.ts` exists.
- `src/packages/package-asset-registry.ts` exists.
- `src/packages/package-service.ts` still needs Supabase-backed install/list behavior.
- `src/packages/entitlement-service.ts` exists.
- `src/packages/employee-catalog.ts`
- `src/packages/package-provider-requirements.ts` exists.
- `tests/package-asset-registry.test.ts` can be split from the current entitlement test later.
- `tests/package-entitlements.test.ts` exists.
- `tests/package-provider-requirements.test.ts`

Package-specific provider nuance:

- Package definitions should declare required and optional provider lanes by capability, not just vendor.
- Useful capability labels include `text_generation`, `image_generation`, `video_generation`, `social_publishing`, and `media_storage`.
- A Social Media package might require OpenAI and optionally support Google Gemini/Nano Banana-style image generation, Higgsfield image/video, OpenRouter creative models, and later Meta/TikTok/YouTube/LinkedIn/X publishing APIs.
- Connecting a provider for one package does not make it globally available to all packages.
- Run creation must verify active subscription, installed package, workflow entitlement, provider lane allowlist, and valid non-revoked tenant credential before queueing work.

## Generated Artifact Storage Position

Wealth Factory should not be the default long-term storage/CDN provider for customer-generated reports, PDFs, slide decks, images, videos, source files, or raw media blobs.

Default rule:

- Generated artifacts are temporary.
- Default TTL is `24 hours`.
- Downloads are authenticated, tenant-scoped, and short-lived.
- Expired artifacts are purged by a cleanup worker.
- Wealth Factory keeps lightweight metadata, audit events, and small workflow context only.
- Public unauthenticated artifact URLs are forbidden.

Retain metadata such as artifact ID, tenant ID, run ID, package ID, artifact type, filename/title, MIME type, byte size, checksum/hash, created time, expiration time, purge status, and export status.

Preferred long-term storage path:

- Customer-owned Google Drive.
- Customer-owned Dropbox.
- Customer-owned OneDrive/SharePoint.
- Customer-owned S3-compatible storage such as S3, Cloudflare R2, Backblaze B2, or MinIO.
- Customer-owned Supabase Storage.

Storage connector nuance:

- Storage connectors are BYOK/bring-your-own-account integrations scoped to the tenant.
- Packages can declare optional or required `media_storage` capabilities.
- A Social Media package can use 24-hour download-only delivery by default, then offer Google Drive/Dropbox export for long-term media libraries.
- OAuth tokens, refresh tokens, bucket credentials, folder IDs, and private storage paths must be secret-reference based and absent from browser responses and queue payloads.
- A normal web app cannot silently save large generated assets to a user's local machine. Browser download is the MVP path; local SQLite/file storage belongs in a possible future desktop companion.

## Boundary Layer Requirements

Required files:

- `src/wealthfactory/workflow-registry.ts` exists.
- `src/wealthfactory/dto-mappers.ts` exists.
- `src/wealthfactory/response-guard.ts` exists.
- `src/wealthfactory/public-errors.ts` exists.
- `tests/wealthfactory-boundary.test.ts` exists.

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
- Operator/shared provider credentials may remain configured temporarily for
  development, smoke testing, and debugging, but commercial production runs
  must execute with tenant-scoped provider credentials injected into Paperclip
  per run.

## Required Starting Checks

- Keep `src/wealthfactory/workflow-registry.ts`, `src/wealthfactory/dto-mappers.ts`, `src/wealthfactory/response-guard.ts`, and `src/wealthfactory/public-errors.ts` in the customer-facing API path.
- Keep `tests/wealthfactory-boundary.test.ts` passing before exposing new dashboard API routes.
- Integrate security helpers into the authenticated API layer before exposing customer-facing dashboard API routes.
- Add package/subscription entitlement checks before exposing commercial workflow run APIs.
- Expand provider credentials to company-specific OpenAI API, Anthropic API, xAI/Grok API, OpenRouter API, and optional company-isolated ChatGPT/Codex subscription auth.
- Never use a shared server/operator `~/.codex`, `CODEX_HOME`, ChatGPT login, or provider API key for subscriber work.
- Replace remaining legacy MVP UI demo state with authenticated API-backed state.
- Derive tenant role and operator role from server-side authorization.
- Use Wealth Factory DTOs rather than raw database rows or internal workflow responses.
- Add route tests proving tenant isolation and operator-only access.
- Add entitlement tests proving tenants cannot run workflows outside their installed package/industry.
- Add asset registry tests proving tenants cannot resolve prompts/rules/assets outside their installed package.
- Add race-condition tests proving concurrent requests cannot bypass entitlement, subscription, tenant pause, or credential revoke checks.
- Add response-guard tests proving Paperclip/internal terms and fields are rejected.
- Add CORS, request validation, rate-limit, and exposed-port checks for split-origin deployment.
- Add Playwright tests for member, owner, and operator paths.
- Keep `npm run build`, `npm test`, `npm run lint`, `npm run build:web`, and `npm run e2e` passing as the dashboard grows.
- Keep the live API deployment aligned with the repo changes: current image tag is `wealth-factory-api:20260512-114209`, container name is `wealth-factory-api`, and the VPS Caddyfile has a backup at `/root/supabase/docker/Caddyfile.wfapi.bak`.

## Latest Verification

- `node scripts/apply-wfpc-migration.mjs` applied private storage OAuth/vault migrations, then passed idempotently and reported `wfpc` with 16 public schema tables.
- `npm run build` passed.
- `npm run build:server` passed.
- `npm test` passed with 52 files / 200 tests.
- `npm run lint` passed.
- `npm run build:web` passed with lucide `use client` warnings from dependency bundling.
- `npm run e2e` passed with 3 Playwright tests.
- External verification passed for:
  - `https://api.spyderbyte.cloud/health` -> `200 {"status":"ok","service":"wealth_factory_api"}`
  - `GET /api/dashboard` from `https://www.spyderbyte.cloud` without auth -> `401`
  - `GET /api/dashboard` from `https://www.spyderbyte.cloud` with a valid signed runtime session token -> `200` with seeded tenant/package/workflow data
  - `OPTIONS /health` from `https://www.spyderbyte.cloud` -> `204` with explicit CORS headers
- `npm run smoke:external` now passes DNS, public `80/443` reachability, private app-port closure, dashboard auth/CORS checks, and response-guard checks. It still fails on the known open `5432` and `8000` ports and on the intentionally unconfigured storage OAuth route.

## 2026-05-19 Staged Runtime Status

- A private-only VPS stage lane is now running from repo commit `38fdf74` as:
  - `wealth-factory-api-stage`
  - `wealth-factory-worker-stage`
- The stage lane is attached to:
  - `supabase_default`
  - `redis-tzbr_default`
  - `paperclip-gwry_default`
- The stage lane has already proven:
  - DB-backed workflow reservation
  - outbox enqueue
  - BullMQ pickup
  - worker startup against authenticated Redis
  - tenant secret hydration from the encrypted vault
  - Paperclip bearer-token authentication
- The demo Paperclip company, agent, and token in use are:
  - company: `a691a344-a3e6-4a1c-963a-4acac79b6253`
  - agent: `e40e2bc4-263e-45fa-b8a6-7a7737265994`
- Current next blocker:
  - the current repo still preserves the old BYOK-aware `/runs` adapter because the issue-centric experiment is not safe to merge yet
  - staged verification proved the company-scoped bearer token can create a Paperclip issue successfully through `POST /api/companies/:companyId/issues`
  - the next step in that issue-centric flow, `POST /api/issues/:id/checkout`, still returns `401` when called headlessly with the same company token plus explicit agent id
  - that means the staging discovery has narrowed the problem beyond the original `404`, but the checked-in repo still needs a supported headless Paperclip launch contract before the adapter should change
  - current evidence suggests checkout is an interactive/local-agent claim flow, not a server-safe headless launch primitive for Wealth Factory

## 2026-05-19 Paperclip Runtime Discovery

- Paperclip is now able to execute real assignment-triggered runs after 2 VPS-side fixes:
  - seed a valid `.codex` auth/session into the Paperclip-managed Codex home
  - keep `PAPERCLIP_PUBLIC_URL` local (`http://127.0.0.1:3100`) so agent API calls do not redirect through the public hostname and fail TLS internally
- The issue-centric execution surface is more capable than it first looked:
  - `POST /api/companies/:companyId/issues` starts the assignment flow
  - the issue can pick up `executionRunId`/`checkoutRunId` within about `1.5s`
  - `GET /api/heartbeat-runs/:runId` returns the actual run record
- Sharp edges discovered:
  - the run id is not durable on the issue object forever; after `blocked` or later completion it can return to `null`
  - the durable fallback is issue activity/comment metadata plus the heartbeat-runs endpoint
  - issue-level plain env overrides definitely reach runtime, but the plain value is stored on the issue object and is therefore not safe for subscriber secrets
  - a direct `secret_ref` issue override did not work in the company-token lane, and secret creation via the company token returned `403 Board access required`
- Immediate repo implication:
  - keep the checked-in `/runs` adapter steady
  - the checked-in `/runs` launch boundary now strips raw `secretValues` before serialization
  - only the worker healthcheck auth probe should change right now
  - the bigger adapter decision waits on a secure secret-ref/admin path for tenant BYOK injection

## 2026-05-19 Paperclip Secret Ref Mapping

- Live Paperclip testing has now proven a secure agent-runtime path:
  - create a managed Paperclip secret
  - bind it to an agent env key
  - store only `secret_ref` metadata on the agent config
  - let the heartbeat runtime resolve the secret internally
- That direction is documented in `docs/paperclip-secret-ref-mapping.md`.
- Reviewer findings that must shape the next implementation slice:
  - `workflow_runs` still centers on one `bound_secret_reference_id`, which is too narrow for future multi-capability workflows
  - the repo still lacks a private runtime repository path that can resolve full provider bindings for worker/sync use without weakening customer-safe DTO paths
- Immediate implication:
  - the next repo work should start with the runtime binding model and private resolver seam, not with a direct adapter rewrite

## Hard Rules

- Users must never see Paperclip prompts, skills, commands, agents, tool calls, raw logs, or internal configuration.
- Users may run only workflows included in their installed Wealth Factory package or purchased add-ons.
- Monthly subscription status must gate service access.
- OpenAI should remain the encouraged/default provider, but every company must bring or authorize its own credentials.
- Anthropic, xAI/Grok, OpenRouter, and generic providers must use the same secret-reference model as OpenAI API keys.
- ChatGPT/Codex subscription auth must be isolated by company or authorized company user.
- Supabase RLS must protect provider metadata and secret references because metadata can be sensitive.
- The frontend/dashboard site and backend/API VPS are different sites; preserve explicit origin, CORS, auth, CSRF, and firewall controls.
- Only the reverse proxy should expose public ports on the VPS. Paperclip, Redis, workers, Docker, and admin/debug ports stay private.
- Race conditions around subscriptions, package installs, add-ons, tenant pause, credential revoke/rotate, and queue enqueue must be blocked transactionally.
- Subagents and implementers are not alone in the codebase. Do not revert others' work.
- All code and docs require reviewer scrutiny before acceptance.

## 2026-05-21 Longer Soak Capacity Status

- The repo now has a VPS-backed long-soak orchestrator at `npm run prove:live-soak-capacity`.
- It collects, in one run:
  - staged fairness proof output from `scripts/prove-live-fairness.mjs`
  - remote Docker saturation samples over SSH
  - authoritative queue snapshots from inside the staged API container via `docker exec wealth-factory-api-stage2 node scripts/inspect-live-queue-snapshot.mjs`
- The current authoritative run is `audit/2026-05-21/live-soak-capacity-v4-*.json*`.
- Current live result:
  - `80/80` workflow runs reached `running`
  - `80/80` outbox rows reached `enqueued`
  - queue snapshots stayed reachable for the whole soak and peaked at `waiting=2`, `active=3`
  - the soak still failed overall because Paperclip remained a sustained hotspot
- Current Paperclip saturation evidence from `v4`:
  - `maxCpuPercent: 396.32`
  - `maxMemoryUsageBytes: 2501818450`
  - `maxPids: 1018`
  - `hotSampleRatios.any: 0.5714`
  - `longestHotStreaks.any: 16`
- Operational read:
  - Wealth Factory queueing, outbox, worker pickup, and tenant isolation are still holding under the six-lane soak.
  - Paperclip is the active bottleneck over longer duration.
  - Treat `6` tenants as the current stress ceiling, not yet a boringly safe launch cap.
  - The next business decision is whether launch should start below `6` active clients per VPS unless later soak data shows more Paperclip headroom.

## 2026-05-21 Four-Tenant Cap Follow-Up

- We also ran two follow-up decision tests after agreeing not to assume user load would always be light:
  - `audit/2026-05-21/live-soak-capacity-4tenant-staggered-*.json*`
  - `audit/2026-05-21/live-soak-capacity-4tenant-clustered-*.json*`
- `4tenant-staggered` result:
  - `80/80` runs reached `running`
  - `80/80` outbox rows reached `enqueued`
  - queue evidence remained reachable and valid
  - Paperclip still peaked at `474.71%` CPU, `2990370980` bytes memory, and `1405` PIDs
  - Paperclip hot-sample ratio `0.5333`, longest hot streak `16`
- `4tenant-clustered` result:
  - `40/40` runs reached `running`
  - `40/40` outbox rows reached `enqueued`
  - queue evidence remained reachable and valid
  - Paperclip peaked at `351.31%` CPU, `2482491097` bytes memory, and `957` PIDs
  - Paperclip hot-sample ratio `0.25`, longest hot streak `5`
- Operational read:
  - lowering the pod from six tenants to four reduces blast radius but still does not create a clearly boring long-soak margin on the current Paperclip/VPS shape
  - the longer staggered four-tenant soak was actually harsher on Paperclip than the shorter cron-cluster approximation
  - if launch happens on the current VPS shape, treat `4` as a strict upper cap with active monitoring, not as proof of roomy headroom
