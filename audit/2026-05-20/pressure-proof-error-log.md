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
