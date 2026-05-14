# Wealth Factory Support Visibility And Repair Authority Matrix

Date: 2026-05-13

Reference docs:

- `docs/design.md`
- `docs/dashboard-design-prep.md`
- `docs/dashboard-visual-baseline.md`

## Purpose

Define how AI-assisted support should work in Wealth Factory without creating a free-roaming repair bot.

This document separates:

- what customers can report and see
- what the customer-facing Assistant can access
- what the internal support copilot can inspect
- what the internal repair agent can change automatically
- what must always require human approval

The goal is to preserve fast AI support while keeping tenant isolation, auditability, and infrastructure safety intact.

## Core Principle

Customer support AI is not a general shell agent.

It must be:

- scoped
- audited
- least-privilege
- runbook-driven
- tenant-aware
- reversible when possible

The customer may interact with a support surface, but the repair agent itself remains internal.

## Support Layers

### 1. Customer Assistant With Support Intake Mode

This is the single customer-facing support entry point.

It has two bounded modes:

- normal package-safe assistant help
- support-intake mode for reporting an issue

Support-intake mode can gather:

- company/account name
- reporting person's name
- installed package
- workflow or result involved
- what went wrong
- urgency
- screenshot or note

It can help the user phrase the issue clearly, but it cannot inspect private infrastructure directly.

### 2. Internal Support Copilot

This is an operator-facing AI support assistant.

It can:

- inspect tenant-safe diagnostics
- classify likely root cause
- suggest a repair path
- prepare low-risk runbook actions for operator approval
- escalate when confidence is low

It is not customer-facing.

### 3. Internal Repair Agent

This is a narrower autonomous or semi-autonomous repair actor.

It may execute pre-approved low-risk repair actions using tightly scoped tools and credentials, but only after the rollout phase explicitly enables that authority.

It must not improvise broad fixes or explore the environment with unrestricted shell freedom.

## Visibility Matrix

| System State | Customer Sees | Customer Assistant Can See | Internal Support Copilot Can See | Internal Repair Agent Can See |
|---|---|---|---|---|
| Account / tenant identity | Account name, user name, package | Yes | Yes | Yes, only for scoped repair |
| Package entitlement | Installed package, included workflows, specialist access | Yes | Yes | Yes |
| Workflow status | Public workflow name, safe status, last update | Yes | Yes | Yes |
| Result state | Safe summary, export status, approval state | Yes | Yes | Yes |
| Provider connection status | Connected / action needed / expired | Yes | Yes | Yes |
| Storage export status | Ready, sent to Drive, sent to Dropbox, expires soon | Yes | Yes | Yes |
| Audit history | Tenant-visible safe events only | Limited | Yes, redacted | Yes, redacted |
| Queue / outbox state | No | No | Yes, redacted | Yes, scoped |
| Container / service health | No | No | Yes | Yes |
| Redacted logs | No | No | Yes | Yes |
| Raw prompts / skills / commands | No | No | No | No |
| Raw provider secrets / tokens | No | No | No | No |
| SSH credentials / service-role secrets | No | No | No | No direct visibility; use delegated tools only |

## Authority Matrix

### Customer Assistant Support Intake Mode

Allowed:

- open a support case
- collect account, package, issue, and context
- explain safe public status
- suggest customer actions such as reconnecting storage or checking a connection

Not allowed:

- inspect logs
- inspect tenant-private backend state
- restart services
- modify credentials
- alter data

### Customer-Facing Assistant

Allowed:

- answer questions about the current package
- explain workflow and result states
- clarify connection requirements
- explain storage/export behavior
- help route the user into the correct workflow or support path

Not allowed:

- general off-topic chat
- workflow creation outside the installed package
- support diagnostics against private infrastructure
- viewing or describing Paperclip internals

### Internal Support Copilot

Allowed:

- inspect tenant-safe diagnostic summaries
- inspect recent workflow state
- inspect provider readiness
- inspect storage/export status
- inspect queue/outbox summaries
- inspect service health
- inspect redacted logs
- recommend a repair plan
- prepare low-risk runbook actions through approved tools for operator review

Not allowed:

- broad shell exploration
- arbitrary file access
- destructive data deletion
- schema changes
- unrestricted credential access

### Internal Repair Agent

Allowed:

- restart one named safe service
- requeue one failed export or workflow outbox item
- refresh one tenant connection state
- reload one reverse-proxy config
- run one migration health check
- clear one expired temporary artifact record if covered by runbook
- restart one named container if it belongs to the approved repair set

Not allowed:

- arbitrary `ssh` exploration
- firewall changes
- deleting tenant data broadly
- rotating production secrets without approval
- editing database schemas
- changing RLS policies
- modifying unrelated containers or services
- acting across tenants without explicit operator scope

## Repair Classes

### Auto-Repair Safe

These may be automated once runbooks are proven and audited:

- restart a healthy-known service that occasionally stalls
- requeue a single failed export
- retry a single stuck outbox item
- refresh a cached connection status
- reload validated reverse-proxy config

### Operator Approval Required

These require a human operator decision before execution:

- tenant credential revoke or rotate
- service rebuild or re-deploy
- permission changes
- package entitlement correction
- tenant pause / resume
- changes affecting more than one tenant

### Human-Only

These should not be delegated to an autonomous repair agent:

- destructive deletes beyond temporary artifact cleanup
- firewall policy changes
- database schema changes
- RLS policy changes
- root credential management
- SSH or service-role secret rotation
- backup restore operations

## Tooling Model

Do not give the support LLM open-ended root shell access as its primary interface.

Preferred model:

- read-only diagnostic tools
- narrow repair tools
- runbook-backed execution
- structured tool inputs and outputs
- action logging for every repair attempt

Examples:

- `inspectTenantWorkflowState(tenantId, workflowId)`
- `inspectProviderHealth(tenantId, providerKind)`
- `inspectArtifactExport(tenantId, artifactId)`
- `restartService(serviceName)` from an allowlist
- `requeueOutboxItem(runId)`
- `reloadCaddyIfConfigValid()`

## Logging And Audit

Every support-agent action should record:

- actor type: customer assistant, support copilot, repair agent, operator
- tenant scope
- reporting user
- action taken
- tool used
- result
- timestamp
- escalation or rollback outcome

Audit should never store:

- raw provider secrets
- SSH passwords
- raw prompts
- raw Paperclip logs
- backend secret handles in customer-visible views

## Customer Language Rules

Support responses shown to customers must stay in Wealth Factory language.

Allowed examples:

- `We found a connection issue and fixed it.`
- `Your export was retried and is ready now.`
- `Your assistant is getting ready. Try again in a moment.`
- `Your Google Drive connection needs to be reconnected.`

Forbidden examples:

- `The worker stalled and the queue claim failed.`
- `The Paperclip skill retry loop timed out.`
- `The container restarted because Docker marked it unhealthy.`
- `Your refresh token could not be decrypted from the vault store.`

## Recommended Initial Rollout

Phase 1:

- customer support intake only
- internal support copilot is read-only
- no autonomous repair execution

Phase 2:

- internal support copilot may prepare repair actions but still requires operator confirmation before write actions
- allow a small set of runbook-backed low-risk auto-repairs
- add verification after each repair
- add operator review queue for failed repairs

Phase 3:

- expand approved repair set only after logs show low-risk reliability

## Open Questions

- Which exact services belong in the safe restart allowlist?
- Whether support copilot actions should require an operator click-to-confirm in the MVP
- Whether operators can allow tenant-scoped read-only impersonation for support
- Whether the same support model should inspect Obsidian companion sync state later if that lane is added
