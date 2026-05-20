# Paperclip Secret Ref Mapping

Date: 2026-05-19

## Purpose

This document maps the current Wealth Factory BYOK runtime model to the secure Paperclip runtime model that was proven on the VPS on 2026-05-19.

The repo historically assumed Wealth Factory:

- resolves the tenant provider connection
- hydrates vault-backed `secretValues` in the worker
- forwarded those raw values to Paperclip per run

That model is represented in:

- [E:\REPOS\spyderbyte_paperclip_saas\src\workflows\run-service.ts](E:\REPOS\spyderbyte_paperclip_saas\src\workflows\run-service.ts)
- [E:\REPOS\spyderbyte_paperclip_saas\src\providers\runtime-provider-execution.ts](E:\REPOS\spyderbyte_paperclip_saas\src\providers\runtime-provider-execution.ts)
- [E:\REPOS\spyderbyte_paperclip_saas\src\worker\runtime.ts](E:\REPOS\spyderbyte_paperclip_saas\src\worker\runtime.ts)
- [E:\REPOS\spyderbyte_paperclip_saas\src\paperclip\client.ts](E:\REPOS\spyderbyte_paperclip_saas\src\paperclip\client.ts)
- [E:\REPOS\spyderbyte_paperclip_saas\src\paperclip\types.ts](E:\REPOS\spyderbyte_paperclip_saas\src\paperclip\types.ts)

The live VPS discovery proved a different secure Paperclip contract:

- Paperclip can store managed secrets in its own company scope
- Paperclip can bind those secrets to agent env keys
- the agent config can expose only `secret_ref` metadata
- the runtime can resolve those secret refs successfully during execution
- plain issue-level env overrides are not safe for tenant secrets because they are persisted on the issue object

That means the secure production path should move away from passing tenant `secretValues` into Paperclip issue launches and toward pre-provisioned Paperclip secret references bound to the target agent/runtime config.

As of the checked-in hardening on 2026-05-19, the `/runs` launch boundary no longer forwards raw `secretValues` upstream. Wealth Factory may still hydrate secrets internally for run-bound validation or debug fallback policy, but the serialized Paperclip launch payload is now limited to safe `providerContext` fields such as capability, provider kind, label, `secretRef`, and metadata.

## Current Repo Model

### Wealth Factory Secret Ownership

Wealth Factory currently owns the tenant secret lifecycle in its own vault:

- provider registrations are stored in `wfpc.secret_references` plus the encrypted private vault
- runtime reservation binds a workflow run to a specific provider secret reference
- worker execution rehydrates that reference just-in-time

Code points:

- [E:\REPOS\spyderbyte_paperclip_saas\src\db\acid-guard-repository.ts](E:\REPOS\spyderbyte_paperclip_saas\src\db\acid-guard-repository.ts)
- [E:\REPOS\spyderbyte_paperclip_saas\src\secrets\secret-service.ts](E:\REPOS\spyderbyte_paperclip_saas\src\secrets\secret-service.ts)
- [E:\REPOS\spyderbyte_paperclip_saas\src\secrets\encrypted-vault.ts](E:\REPOS\spyderbyte_paperclip_saas\src\secrets\encrypted-vault.ts)
- [E:\REPOS\spyderbyte_paperclip_saas\src\providers\runtime-provider-resolution.ts](E:\REPOS\spyderbyte_paperclip_saas\src\providers\runtime-provider-resolution.ts)
- [E:\REPOS\spyderbyte_paperclip_saas\src\providers\runtime-provider-execution.ts](E:\REPOS\spyderbyte_paperclip_saas\src\providers\runtime-provider-execution.ts)

### Current Paperclip Assumption

The checked-in Paperclip client still targets a legacy `/runs` launch route:

- `POST /api/companies/:companyId/runs`
- payload may include `providerContext`
- `providerContext` is now sanitized before serialization and no longer carries raw `secretValues`

That is no longer aligned with the installed Paperclip build.

## Live Paperclip Model Proven On The VPS

### Proven Safe Pattern

The following pattern was successfully proven live:

1. Create a Paperclip-managed company secret through the board/admin lane.
2. Bind that secret to an agent env key.
3. Store only `secret_ref` metadata on the agent config.
4. Launch an assigned issue.
5. Let Paperclip resolve the secret internally during the heartbeat run.

Proof obtained:

- a migrated secret showed `referenceCount: 1`
- the agent config held:
  - `type: "secret_ref"`
  - `secretId`
  - `version: "latest"`
- the heartbeat run reported `resolvedSecretRefs`
- the runtime successfully read the secret value and returned the expected output

### Unsafe Pattern

This pattern must not be used for subscriber secrets:

- issue-level `assigneeAdapterOverrides.adapterConfig.env` with plain values

Why:

- the plain value is persisted on the issue object and is visible through the Paperclip API

### Important Operational Constraint

The company-scoped bearer token was enough for:

- issue creation
- agent reads
- normal company-scoped runtime flow

But it was not enough for all secret-management actions.

Paperclip secret creation required a board/admin lane during discovery. That means Wealth Factory must not assume ordinary company execution tokens can perform secret provisioning.

## Mapping Wealth Factory Providers To Paperclip Env Keys

Current provider definitions already tell us the env targets Wealth Factory expects:

- `openai_api` -> `OPENAI_API_KEY`
- `anthropic_api` -> `ANTHROPIC_API_KEY`
- `xai_grok_api` -> `XAI_API_KEY`
- `openrouter_api` -> `OPENROUTER_API_KEY`
- `openai_chatgpt_codex_subscription` -> isolated auth home, not an API-key env lane

Source of truth:

- [E:\REPOS\spyderbyte_paperclip_saas\src\providers\provider-types.ts](E:\REPOS\spyderbyte_paperclip_saas\src\providers\provider-types.ts)

This gives the first stable translation table:

| Wealth Factory providerKind | Wealth Factory secret shape | Paperclip env key target |
| --- | --- | --- |
| `openai_api` | `{ apiKey, projectId? }` | `OPENAI_API_KEY`, optional `OPENAI_PROJECT_ID` |
| `anthropic_api` | `{ apiKey }` | `ANTHROPIC_API_KEY` |
| `xai_grok_api` | `{ apiKey }` | `XAI_API_KEY` |
| `openrouter_api` | `{ apiKey }` | `OPENROUTER_API_KEY` |
| `generic_api` | provider-defined | provider-defined |
| `openai_chatgpt_codex_subscription` | auth-state material, not API key | not a normal env-key secret binding |

## Recommended Integration Shape

### Split Responsibilities

Wealth Factory should remain the source of truth for:

- tenant ownership
- package entitlement
- provider connection state
- provider rotation/revoke decisions
- run authorization
- queue fairness and audit trail

Paperclip should become the source of truth only for:

- runtime-local secret resolution inside the launched company/agent execution
- agent env binding references needed by its own adapter/runtime

This preserves the repo rule from [E:\REPOS\spyderbyte_paperclip_saas\docs\reviewer-notes.md](E:\REPOS\spyderbyte_paperclip_saas\docs\reviewer-notes.md): Paperclip must not become the multi-tenant trust zone.

### Production Flow Target

Recommended target flow:

1. Tenant registers or rotates BYOK in Wealth Factory.
2. Wealth Factory stores the raw secret in its own vault as it does today.
3. Wealth Factory operator/runtime sync logic provisions or updates the corresponding Paperclip-managed secret for that tenant's mapped Paperclip company.
4. Wealth Factory ensures the required Paperclip agent env key is bound to that Paperclip secret as `secret_ref`.
5. Workflow run reservation still binds the Wealth Factory run to the tenant provider record in `wfpc.workflow_runs`.
6. Worker launches Paperclip through the supported issue-based contract.
7. Paperclip resolves the bound secret internally at runtime.
8. Wealth Factory still audits the run against the tenant-bound provider record it selected.

### Why This Is Better Than Raw `secretValues`

Benefits:

- raw tenant keys no longer need to cross the Wealth Factory -> Paperclip run-launch request
- issue objects do not carry plain secret values
- Paperclip runtime can resolve its own secure env bindings
- Wealth Factory still controls tenant authorization and provider selection

## Required Repo Changes

### 1. Introduce A Paperclip Secret Sync Layer

Create a new service boundary responsible for:

- ensuring a Paperclip company secret exists for a Wealth Factory provider connection
- ensuring the target Paperclip agent env path is bound to that secret
- rotating the Paperclip secret when Wealth Factory rotates the tenant credential
- revoking or disabling the Paperclip binding when Wealth Factory revokes the credential

Recommended new files:

- `src/paperclip/secret-sync.ts`
- `src/paperclip/issue-launch.ts`
- `tests/paperclip-secret-sync.test.ts`
- `tests/paperclip-issue-launch.test.ts`

### 2. Keep Wealth Factory Vault As The Canonical BYOK Record

Do not move tenant truth into Paperclip.

The existing Wealth Factory vault-backed registration path should remain canonical for:

- tenant UI registration
- entitlement-aware connection state
- rotate/revoke lifecycle
- audit attribution

Paperclip secret state should be treated as a runtime projection derived from Wealth Factory truth.

### 3. Replace Legacy `/runs` Launch Contract

The current checked-in client in [E:\REPOS\spyderbyte_paperclip_saas\src\paperclip\client.ts](E:\REPOS\spyderbyte_paperclip_saas\src\paperclip\client.ts) still targets `/runs`.

The next adapter target should be an issue-based launch flow that:

1. creates the issue
2. assigns it to the correct agent
3. polls briefly for `executionRunId`
4. tracks the resulting heartbeat run

The launch contract should not include plain tenant secret values.

### 4. Narrow `providerContext`

`providerContext` should stop being treated as a carrier for raw `secretValues`.

Recommended future shape:

- retain provider label/kind/capability for Wealth Factory audit/usefulness
- keep raw `secretValues` out of the checked-in Paperclip launch payload
- optionally include a safe Paperclip binding selector or alias if needed, but only if it does not expose tenant secret handles to customer-visible paths

### 5. Add Secret-Sync Idempotency

Paperclip secret provisioning must be idempotent per tenant/provider/agent/env-path.

We should persist enough app-side state to answer:

- which Paperclip secret corresponds to which Wealth Factory secret reference
- which Paperclip agent/env path is currently bound
- when the sync last succeeded
- whether the binding is stale after rotation/revoke

Recommended new table or extension:

- `wfpc.paperclip_secret_bindings`

Suggested columns:

- `tenant_id`
- `provider_kind`
- `wealth_factory_secret_reference_id`
- `paperclip_company_id`
- `paperclip_agent_id`
- `paperclip_env_key`
- `paperclip_secret_id`
- `paperclip_secret_key`
- `binding_status`
- `last_synced_at`
- `last_error`

### 6. Treat Board/Admin Capability As Operator Infrastructure

The live discovery showed secret creation needs a higher-scope Paperclip lane than ordinary company execution.

That means:

- board/admin capability must not become the generic runtime execution token
- it should be isolated to a provisioning/sync path
- customer-triggered workflow execution should continue to use the narrower company-scoped execution lane where possible

## Non-Negotiable Acceptance Rules

The Paperclip integration is not production-ready until these are true:

- Wealth Factory never places plain tenant provider secrets on Paperclip issue objects.
- Wealth Factory keeps tenant ownership and entitlement checks outside Paperclip.
- Paperclip execution uses bound `secret_ref` runtime resolution, not ad hoc plain env injection.
- Rotate/revoke operations update both Wealth Factory canonical state and Paperclip runtime projection.
- Cross-tenant tests prove one tenant cannot cause another tenant's Paperclip secret or agent binding to be used.

## Sharp Edges To Solve Before Implementation

### 0. Capability Drift In The Current Bound Context

The current reservation code writes vendor enums into `bound_provider_context.capability`.

Current behavior:

- `capability: "openai_api"`

Desired long-term behavior:

- `capability: "text_generation"` or another actual capability label

Why this matters:

- the docs and resolver direction already assume workflows request capabilities, not vendors
- Paperclip secret binding strategy will be harder to evolve if run bindings are vendor-shaped from the start
- package policies that allow multiple vendors for one capability will not fit the current binding shape cleanly

Primary files:

- [E:\REPOS\spyderbyte_paperclip_saas\src\db\acid-guard-repository.ts](E:\REPOS\spyderbyte_paperclip_saas\src\db\acid-guard-repository.ts)
- [E:\REPOS\spyderbyte_paperclip_saas\docs\design.md](E:\REPOS\spyderbyte_paperclip_saas\docs\design.md)

### 1. Agent Choice

Secret bindings are agent/env specific. We need an explicit rule for:

- which Paperclip agent receives provider env bindings for each workflow family

### 2. Multi-Provider Workflows

Some packages may require more than one provider capability.

We need a deterministic mapping for:

- one workflow -> one or more Paperclip env keys

Current repo limitation:

- `wfpc.workflow_runs` still has one `bound_secret_reference_id`
- the loader currently revalidates through that single secret id
- if later workflows need text plus image plus storage bindings, the run record cannot durably validate them independently yet

Primary files:

- [E:\REPOS\spyderbyte_paperclip_saas\supabase\migrations\0005_bound_provider_context.sql](E:\REPOS\spyderbyte_paperclip_saas\supabase\migrations\0005_bound_provider_context.sql)
- [E:\REPOS\spyderbyte_paperclip_saas\src\db\acid-guard-repository.ts](E:\REPOS\spyderbyte_paperclip_saas\src\db\acid-guard-repository.ts)

### 3. Rotation Timing

If Wealth Factory rotates a tenant secret while a run is queued or active:

- queued runs should continue to use the run-bound provider decision
- new runs should use the latest synced secret binding
- active runs should not silently drift mid-execution

Current repo/stage resolution on 2026-05-20:

- `wfpc.paperclip_secret_bindings` now persists `paperclip_secret_version`
- registration and rotation projection now sync the Paperclip secret/version without mutating the live issue agent by default
- when a tenant still has queued or running workflow runs, remote Paperclip rotation projection is deferred and audited so Wealth Factory does not flip the shared issue-agent env underneath an in-flight run
- the worker keeps the just-in-time agent bind at launch time because the installed Paperclip build still needs that global agent env for first assignment execution
- that launch-time bind now also fails closed if the tenant still has another queued or running workflow run and the new secret ref would require a fresh Paperclip rebind
- issue-launch runtime sync now returns issue-scoped `assigneeAdapterOverrides.adapterConfig.env`
- those launch overrides use explicit `secret_ref { secretId, version }` values instead of mutable `version: "latest"` semantics
- when the worker must reuse an existing Paperclip binding for launch and no concrete version is stored, the launch now fails closed instead of silently drifting to the newest remote secret version
- important installed-build nuance:
  - the current Paperclip build still needs the provider secret globally bound on the issue agent for first assignment execution
  - the run-scoped version-pinned `secret_ref` override is additive safety, not a substitute for the agent-bound secret on this build

### 4. Subscription Auth Lane

`openai_chatgpt_codex_subscription` does not map cleanly to a normal API-key env var.

That lane likely needs separate handling:

- isolated auth home sync
- explicit Paperclip adapter/runtime support
- no reuse of API-key secret-binding logic

### 5. Resolver Data Gap

The intended runtime provider resolver expects persisted connections to expose:

- `secretRef`
- `metadata`
- capability coverage

But the current repository path used for dashboard/provider listings intentionally exposes only:

- `providerKind`
- `label`
- `connected`

That is correct for customer-safe responses, but it means we still need a private repository path dedicated to runtime provider resolution and Paperclip secret sync.

Primary files:

- [E:\REPOS\spyderbyte_paperclip_saas\src\providers\runtime-provider-resolution.ts](E:\REPOS\spyderbyte_paperclip_saas\src\providers\runtime-provider-resolution.ts)
- [E:\REPOS\spyderbyte_paperclip_saas\src\db\supabase-repositories.ts](E:\REPOS\spyderbyte_paperclip_saas\src\db\supabase-repositories.ts)

## Recommended Next Implementation Order

1. Normalize workflow/provider binding semantics so runs bind capabilities, not vendor enums.
2. Add a private runtime repository path that can resolve full provider bindings for worker/sync use without weakening customer-safe DTOs.
3. Add a design-level Paperclip secret sync record in the app DB.
4. Add a repo-side Paperclip secret sync service abstraction with mocked tests.
5. Add a repo-side issue-launch adapter abstraction with mocked tests.
6. Preserve the new launch-boundary sanitizer so launch code continues to avoid raw `secretValues`, then continue the bigger issue-launch and secret-sync cutover.
7. Keep current Wealth Factory vault hydration for debug fallback only until the new sync path is fully proven.
8. Add cross-tenant, rotate/revoke, multi-capability, and no-plain-secret-on-issue tests before cutting over the live launch path.

## Immediate Conclusion

The current Paperclip install is capable of supporting the Wealth Factory BYOK design, but not through the legacy `/runs` contract alone. The checked-in boundary now strips raw launch secrets, and the repo now has the larger issue-launch plus synchronized `secret_ref` runtime-binding seams for registration, rotation, revoke, and worker launch refresh. The next step is live VPS verification that the installed Paperclip board-session routes and cookie scope match the repo's board-session assumptions.

The secure direction is:

- Wealth Factory remains the tenant trust boundary
- Paperclip secrets become a synchronized runtime projection
- issue-launch replaces the legacy run-launch path
- plain issue env injection is forbidden for subscriber credentials
