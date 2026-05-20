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

## Outcome

After the fixes above:

- staged primary run `afd2ceca-4754-4f24-8b33-03aca6070d20` reached `running`
- staged secondary run `6614eac6-3ba1-4bd9-8f67-a5601c7535f4` reached `running`
- staged second primary run `9428a32c-9e29-4d54-bf6a-48ad70965bee` reached `running`
- the staged worker emitted `wealth_factory_worker_fairness` events proving both tenants were admitted under the same single-worker lane
- the evidence confirms the current fairness proof is valid for one worker process with `WF_WORKER_CONCURRENCY=2` and `WF_WORKER_MAX_ACTIVE_PER_TENANT=1`

