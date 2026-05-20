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

## Outcome

After the fixes above:

- staged secret bindings persist the concrete Paperclip secret version
- issue-launch uses version-pinned `secret_ref` overrides
- BullMQ job completion and `wfpc.workflow_runs.status = running` were confirmed for staged run `040f4776-7636-4d08-9678-dc6b17ed1378`
