# Paperclip Stage Proof Error Log

Date: 2026-05-20

Purpose: record stage-lane errors and the fixes used during the version-pinned Paperclip issue-launch proof so we do not repeat the same deployment friction.

## Errors Observed

1. `node: command not found` on the VPS deploy shell while attempting to run `scripts/apply-wfpc-migration.mjs`.
Fix:
- use Docker on the VPS instead of assuming host Node.js
- apply stage SQL migrations with a containerized Postgres client or the staged app image toolchain

2. `./tmp_stage_proof.sh: Permission denied`.
Fix:
- invoke the helper with `bash ./tmp_stage_proof.sh` instead of assuming the executable bit is set

3. `tmp_stage_inspect.sh` was stale and called `inspect-live-workflow-run.mjs` without the required `--tenant`, `--workflow`, and `--run` arguments.
Fix:
- do not trust the helper blindly
- run the repo inspection script directly with explicit args when validating the stage lane

4. Stage Docker images did not include the repo inspection scripts.
Fix:
- for ad hoc live inspection, copy the required script files into the running staged API container and execute them there
- longer term, keep operational proof steps documented in the runbook so ad hoc container surgery is minimized

5. The copied inspection script failed with `ENOENT: no such file or directory, open '.env'`.
Fix:
- copy the staged API env file into the running container as `/app/.env` before running script-based inspection

6. Before the final fix, workflow launch semantics could still drift to Paperclip `version: "latest"` when an existing secret binding was reused without a persisted version.
Fix:
- persist `paperclip_secret_version`
- return issue-scoped `secret_ref { secretId, version }` overrides at launch time
- fail closed when a workflow launch tries to reuse an existing binding that lacks a concrete version

7. The first secondary-company staged queue attempt failed with `403 Agent key cannot access another company`.
Fix:
- Paperclip bearer tokens are company-scoped; one primary-company token cannot create issues in another Paperclip company
- add a per-company Paperclip issue-agent mapping in Wealth Factory
- add `WF_PAPERCLIP_SERVICE_TOKEN_MAP` so the staged worker can choose the correct company-scoped bearer token per Paperclip company while keeping `PAPERCLIP_SERVICE_TOKEN` as the fallback

8. `POST /api/agents/:agentId/keys` initially failed during secondary-company token minting with `403 Board mutation requires trusted browser origin`.
Fix:
- mint secondary-company agent keys against the public Paperclip board origin, not the internal `127.0.0.1` service host
- include the trusted public `Origin` / `Referer` headers when calling the board-only key-mint route

9. Recreating the staged worker with the new token map initially failed twice:
- first because the injected `WF_PAPERCLIP_SERVICE_TOKEN_MAP` lost its JSON quotes during shell expansion and failed env validation
- second because the replacement worker was attached only to `supabase_default` and could not resolve `redis`
Fix:
- write the JSON env line with a literal heredoc so the quotes survive into the env file
- reconnect the staged worker to `redis-tzbr_default` and `paperclip-gwry_default` after replacement

10. A remote `scp` copy used a shared target directory and briefly placed `runtime.ts`, `apply-wfpc-migration.mjs`, and `0014_paperclip_secret_binding_synced_status.sql` into `src/paperclip/` on the VPS stage source.
Fix:
- copy staged source files to their exact target paths instead of batching mixed directories into one destination
- if a misplaced copy slips through, move the files back immediately before rebuilding the stage image

11. The first run-scoped `secret_ref` launch attempt failed with `422 Invalid environment binding for key: OPENAI_API_KEY`.
Fix:
- match the installed Paperclip contract exactly: numeric secret versions must be sent as numbers in `secret_ref` overrides, while `"latest"` remains a string
- normalize run-scoped `secret_ref` bindings through the same version-selector helper used for accepted agent config payloads

## Outcome

After the fixes above:

- staged secret bindings persist the concrete Paperclip secret version
- issue-launch uses version-pinned `secret_ref` overrides
- BullMQ job completion and `wfpc.workflow_runs.status = running` were confirmed for staged run `040f4776-7636-4d08-9678-dc6b17ed1378`
- a second staged tenant/company lane now also reaches `running` after switching the worker to company-scoped Paperclip bearer token selection, confirmed by staged run `cc59dcb9-4ed4-4aee-a2c4-f4637ce4a13c`
