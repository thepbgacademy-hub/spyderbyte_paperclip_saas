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
- the analyzer still returned `phase = single_worker_only`
- observed implication:
  - staged tenant fairness inside one worker remains good
  - global cross-worker distribution is not yet proven
  - the next step is no longer better scripting; it is claim-layer investigation or a different worker/queue coordination strategy
