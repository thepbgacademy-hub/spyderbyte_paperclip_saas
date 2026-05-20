# Pressure Proof Error Log

Date: 2026-05-20

Purpose: record the friction discovered while proving staged multi-tenant fairness so we do not repeat the same SSH/container mistakes in the next VPS phase.

## Errors Observed

1. The local sudo note format caused bad retries when passed through raw shell interpolation.
Fix:
- parse the stored line and strip the `[sudo] password for deploy:` prefix first
- prefer stdin or base64 piping over direct shell interpolation for special-character passwords

2. Multi-line SSH command batches silently dropped or obscured output for queue/inspect script runs.
Fix:
- run live queue and inspect commands one at a time when evidence matters
- use batched SSH only for low-risk copy/setup steps

3. `docker cp` into the staged API container did not reliably surface the new proof scripts during the same session.
Fix:
- verify copied files with an immediate `docker exec ... ls`
- if proof work is time-sensitive, fall back to the existing checked-in queue/inspect scripts instead of blocking on new script injection

4. The staged worker was still running the older fairness-unaware `dist` files even after the repo changed locally.
Fix:
- rebuild or recopy the exact `dist/worker/*.js` files before reading staged fairness logs
- verify the patch landed by grepping the container file for `wealth_factory_worker_fairness` and `onSnapshot`

5. The first concurrent-run inspection failed because the runs had never actually been reserved.
Fix:
- prove one direct `queue-live-workflow-run.mjs` invocation end to end first
- only then fan back out to the larger `A1 -> B1 -> A2` staged burst

6. The first sustained-burst timing summary stamped one shared `queuedAt` timestamp across the whole batch.
Fix:
- capture `queuedAt` immediately after each successful `queue-live-workflow-run.mjs` reservation
- use the per-run queue timestamp when computing wait-to-start and wait-to-complete summaries
- do not reuse the batch start time for every run in a staggered reservation burst

7. PowerShell repeatedly rewrote SSH redirection and compound-command syntax during the multi-worker proof attempt.
Fix:
- prefer Node-based helpers and local file combination over nested remote shell redirection
- avoid `&&` entirely on this workstation and use sequential commands or semicolons
- when remote evidence matters, fetch raw files back locally and analyze them from the repo instead of chaining shell filters on the VPS

8. The first two-worker staged probe produced a misleading result because one worker still had `WF_WORKER_CONCURRENCY=2`, letting it drain the short launch burst before the second worker had any meaningful chance to claim jobs.
Fix:
- use dedicated proof workers with explicit `WF_WORKER_INSTANCE_ID`
- set proof-worker `WF_WORKER_CONCURRENCY=1` when validating cross-worker claim distribution
- keep the single-worker sustained-burst metrics separate from the global multi-worker fairness check

9. A warmed two-worker proof lane still failed to show cross-worker participation, even after both proof workers were healthy and configured with one slot each.
Fix:
- treat this as a real staged finding, not a shell artifact
- preserve the `single_worker_only` analyzer result and use it to drive the next claim-layer fairness investigation
- do not mark global multi-worker fairness as proven until at least two distinct `workerInstanceId` values appear in the structured `wealth_factory_worker_run` start events for the same burst window

10. The first lane-aware analyzer patch changed the fairness semantics correctly, but two existing tests were still asserting the old tenant-collapsed behavior.
Fix:
- update the global-fairness happy-path and skew-path expectations together when changing lane-coverage semantics
- prefer test names that describe the expected verdict, not the previous implementation detail

11. `prove-live-fairness` and `analyze-worker-fairness` exposed an awkward mode split once `global-fairness` analysis was added.
Fix:
- let `prove-live-fairness --mode global-fairness` capture the same drain-phase evidence as `--mode drain`
- emit an explicit note that the final cross-worker verdict still requires `analyze-worker-fairness`
- do not pretend the capture step alone can prove global fairness without worker-event analysis

12. The first proof-worker recreation dropped worker-only env such as `WF_VAULT_MASTER_KEY` and `SUPABASE_DB_URL`, so the replacement workers died before they could emit any claim telemetry.
Fix:
- build proof workers from the staged worker env surface, not the API env surface
- explicitly preserve worker-only secrets and DB settings during proof-worker recreation
- verify replacement workers can boot before treating missing logs as a fairness verdict

13. The first warmed two-worker burst failed only for the secondary tenant because the proof-worker recreation path omitted `WF_PAPERCLIP_SERVICE_TOKEN_MAP`, forcing the secondary Paperclip company through the wrong bearer token.
Fix:
- source staged proof workers from `/home/deploy/wf-stage-worker.env`
- keep `WF_PAPERCLIP_SERVICE_TOKEN_MAP` intact when recreating proof workers
- do not assume the API container env is sufficient for staged worker proof

14. A true two-worker burst exposed a first-use Paperclip secret-sync race: both workers could try to sync the same tenant secret at once, and one side sometimes received a transient board-session `500`.
Fix:
- reuse an existing active/synced Paperclip binding before attempting a fresh remote sync
- if remote sync still fails, re-read the binding and recover if another worker completed the sync first
- cover that recovery path in `tests/worker-runtime.test.ts`

15. The local fairness analyzer originally accepted repeated `--worker-events` flags but only read the last file, producing a false `single_worker_only` verdict even when both proof-worker logs contained real claims.
Fix:
- treat repeated `--worker-events` args as an array in `scripts/analyze-worker-fairness.mjs`
- add a regression test that feeds two worker log files and expects both worker IDs to appear
- do not trust a single-file fairness verdict when the staged proof lane writes one log file per worker

16. The staged fairness proof emitted `pg` deprecation warnings because multiple reads were dispatched at once on a shared `pg.Client`.
Fix:
- serialize shared-client preflight reads in `scripts/prove-live-fairness.mjs`
- serialize queue snapshot reads in `scripts/lib/live-run-drive.mjs`
- keep `src/db/supabase-repositories.ts#getPlatformLoad` sequential when a shared client or transaction is in play

17. `seed-wfpc-demo.mjs` silently fell back to the `primary` lane when an unknown `--lane` value was passed, which could have written six-lane setup into the wrong tenant.
Fix:
- move lane presets into `scripts/lib/demo-seed-profiles.mjs`
- fail closed on unknown lanes unless an explicit tenant/user/workflow/provider-reference/purchase tuple is supplied
- add regression tests for `senary`, unknown-lane rejection, and explicit custom lanes

18. Copying rebuilt `dist` files into running proof-worker containers did not update the in-memory Node process, which produced a false `missing_worker_telemetry` result on the first six-lane attempt.
Fix:
- treat `docker cp` as file sync only, not code activation
- restart or recreate proof workers after copying updated `dist/worker/*`, `dist/workflows/*`, or fairness helper files
- do not trust missing telemetry until the workers have been restarted on the new build

19. Nested PowerShell -> SSH -> shell quoting kept drifting during worker recreation and log capture once multi-worker env and JSON token maps were involved.
Fix:
- prefer uploaded remote scripts plus Paramiko/SFTP over nested inline shell interpolation on this workstation
- use remote scripts for multi-step worker recreation and local Node analyzers for evidence review
- avoid compounding PowerShell quoting with remote JSON/env payloads when a file upload is safer

20. The first `staggered` scheduler implementation was effectively identical to `alternating` for the six-lane skew used in this proof, which made the docs overstate what had actually been exercised.
Fix:
- make `staggered` pick one lane at a time using remaining-run pressure instead of sweeping every lane in one pass
- add a regression test proving the six-lane skewed burst order now differs from the alternating scheduler

21. `prove-live-fairness` was double-counting pacing delays at cycle boundaries by applying both `--cycle-interval-ms` and the generic `--queue-interval-ms` before the first request of the next cycle.
Fix:
- treat the cycle boundary as its own pacing event
- skip the per-request queue delay for the first request in a new cycle so the CLI timing flags stay interpretable

22. Queue snapshot coverage temporarily displaced direct `inspectQueueState` coverage even though the proof driver still depends on per-job BullMQ inspection during drain checks.
Fix:
- extend the queue inspection tests instead of replacing them
- keep coverage on both the per-job lookup path and the queue-level snapshot path

## Outcome

After the fixes above:

- staged primary run `afd2ceca-4754-4f24-8b33-03aca6070d20` reached `running`
- staged secondary run `6614eac6-3ba1-4bd9-8f67-a5601c7535f4` reached `running`
- staged second primary run `9428a32c-9e29-4d54-bf6a-48ad70965bee` reached `running`
- the staged worker emitted `wealth_factory_worker_fairness` events proving both tenants were admitted under the same single-worker lane
- the evidence confirms the current fairness proof is valid for one worker process with `WF_WORKER_CONCURRENCY=2` and `WF_WORKER_MAX_ACTIVE_PER_TENANT=1`

Additional sustained-burst checkpoint after strengthening the proof harness:

- staged burst drain proof succeeded in `mode=drain` with:
  - primary runs:
    - `82219491-8916-47ca-9f5b-6924e1a48961`
    - `c656fdbb-3d90-4eb4-a2d1-07aeb18e6e9b`
    - `5828f991-2e10-42c6-9c1a-5e2ab2cdd149`
  - secondary runs:
    - `58352127-e4ef-477a-b364-d5f68833294d`
    - `7cb07fa7-7793-435f-a7a7-81c09e576073`
- all 5 workflow runs reached `status = running`
- all 5 outbox rows reached `enqueued`
- BullMQ reported all 5 jobs `completed`
- structured worker logs now correlate run starts/releases with fairness snapshots through `wealth_factory_worker_run`
- staged burst summary now emits observed per-lane timing and retry metrics:
  - primary observed wait-to-start: `min=2264ms`, `median=3493ms`, `max=4737ms`
  - secondary observed wait-to-start: `min=2098ms`, `median=2722ms`, `max=3345ms`
  - retries observed: `0`
  - queue-unreachable observations: `0`

Additional global multi-worker fairness checkpoint after adding worker-instance IDs, arbitrary lane specs, and the repo-owned worker-event analyzer:

- `scripts/prove-live-fairness.mjs` now supports repeated `--lane lane:tenant:user:workflow:runs` inputs for larger staged bursts
- `scripts/analyze-worker-fairness.mjs` now turns a saved burst proof plus structured `wealth_factory_worker_run` log lines into a `global-fairness` verdict
- staged two-worker proof attempts were run against warmed proof workers with explicit `WF_WORKER_INSTANCE_ID` values
- `prove-live-fairness --mode global-fairness` is now accepted as a capture alias, but it intentionally records drain-phase proof plus guidance to run `analyze-worker-fairness` afterward
- the first apparent `single_worker_only` result was a proof artifact caused by:
  - proof-worker env drift
  - missing `WF_PAPERCLIP_SERVICE_TOKEN_MAP`
  - transient first-use secret-sync collisions
  - a single-file analyzer bug
- after fixing those issues and rerunning the staged proof with warmed workers, the analyzer reported `phase = global_multi_worker_fairness_observed`
- observed implication:
  - proof worker `a` consistently claimed the primary lane
  - proof worker `b` consistently claimed the secondary lane
  - all 8 workflow runs reached `status = running`
  - all 8 outbox rows reached `enqueued`
  - BullMQ reported all 8 jobs `completed`
  - global cross-worker fairness is now proven for the staged 2-worker / 2-tenant burst lane
  - the next pressure gap is larger-tenant-count and longer-soak behavior

Bounded-pod soak checkpoint after provisioning lanes 4 through 6 and a third proof worker:

- additional staged Paperclip companies and lanes were provisioned for:
  - quaternary
  - quinary
  - senary
- the staged six-lane / three-worker / three-cycle proof passed with all 18 requests reaching:
  - workflow run `status = running`
  - outbox `status = enqueued`
  - BullMQ `state = completed`
- `scripts/analyze-worker-fairness.mjs` reported:
  - `ok = true`
  - `phase = global_multi_worker_soak_observed`
- worker start distribution was balanced across the proof workers:
  - `proof-a`: 6 claimed starts
  - `proof-b`: 6 claimed starts
  - `proof-c`: 6 claimed starts
- early coverage windows:
  - wave 1: first 3 starts covered 3 unique lanes across 3 workers
  - wave 2: first 6 starts covered all 6 lanes across 3 workers
- per-cycle verdicts:
  - cycle 1: `global_multi_worker_fairness_observed`
  - cycle 2: `global_multi_worker_fairness_observed`
  - cycle 3: `global_multi_worker_fairness_observed`
- observed wait-to-start from the bounded-pod soak:
  - primary: `min=2665ms`, `median=2748ms`, `max=4659ms`
  - secondary: `min=2579ms`, `median=2767ms`, `max=4465ms`
  - tertiary: `min=2402ms`, `median=2559ms`, `max=4033ms`
  - quaternary: `min=3845ms`, `median=4540ms`, `max=5739ms`
  - quinary: `min=3592ms`, `median=4386ms`, `max=5536ms`
  - senary: `min=3410ms`, `median=4191ms`, `max=5386ms`
- implication:
  - the current bounded-pod model is now proven through a six-tenant, three-worker staged soak
  - the next pressure gap is longer soak duration, skewed bursts, and resource saturation behavior, not basic lane distribution

Additional skewed-soak checkpoint after adding queue snapshots, staggered ordering, and direct VPS worker-log capture:

- the local skewed soak proof succeeded with a six-lane staggered burst over `3` cycles and `30` total requests:
  - primary: `3` runs per cycle
  - secondary: `2` runs per cycle
  - tertiary: `2` runs per cycle
  - quaternary: `1` run per cycle
  - quinary: `1` run per cycle
  - senary: `1` run per cycle
- all `30` workflow runs reached `status = running`
- all `30` outbox rows reached `enqueued`
- BullMQ reported all `30` jobs `completed`
- `scripts/analyze-worker-fairness.mjs` reported:
  - `ok = true`
  - `phase = global_multi_worker_soak_observed`
- worker start distribution under the skewed burst:
  - `proof-a`: `12` starts
  - `proof-b`: `9` starts
  - `proof-c`: `9` starts
- early coverage windows still showed real multi-worker spread:
  - wave 1: first `3` starts covered `3` unique lanes across `2` participating workers
  - wave 2: first `6` starts covered all `6` lanes across `3` participating workers
- new practical friction and fix:
  - queue snapshots captured from this Windows workstation are not authoritative for the staged private Redis lane because the local caller cannot reach BullMQ Redis directly and the proof recorded `Connection is closed.` snapshots
  - use worker telemetry plus VPS-side queue evidence as the source of truth for saturation on this topology
- PowerShell-specific operator fix:
  - nested PowerShell -> SSH quoting kept burning time during worker-log capture and sudo commands
  - prefer a local Node helper that reads `sudo_deploy.txt`, feeds `sudo -S` over stdin, and captures raw remote output instead of stacking more inline PowerShell quoting
- analyzer robustness fix:
  - saved proof files captured through `npm run ... | Out-File` can include a UTF BOM and npm banner lines before the JSON payload
  - the analyzer now strips BOM/prefix noise and trims to the first JSON object instead of treating the file as pristine JSON
- implication:
  - longer soak and skewed-burst behavior are now proven strongly enough for this bounded pod model
  - the remaining pressure gap is explicit resource saturation sampling from inside the VPS lane, not whether the current multi-worker fairness model survives skewed bursts
