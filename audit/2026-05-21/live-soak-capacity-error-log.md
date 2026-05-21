# 2026-05-21 Live Soak Capacity Error Log

## Scope

- repo-owned longer-soak orchestrator: `scripts/run-live-soak-capacity.mjs`
- helper layer: `scripts/lib/live-soak-capacity.mjs`
- saturation analyzer: `scripts/lib/resource-saturation.mjs`

## Errors And Fixes

1. Sampling loop raced too aggressively after each sample.
   - Symptom: the first cut could spin back into sampling immediately instead of honoring the collection interval while waiting for `prove-live-fairness` to exit.
   - Fix: distinguish `proof-exit` from `interval` in the `Promise.race(...)` result and only enter cooldown after a real proof exit.

2. Docker inspection failed when run directly as `deploy`.
   - Symptom: staged soak collection could not read `docker stats` or `docker exec` because the VPS `deploy` user did not have direct Docker permission.
   - Fix: add `--sudo-password-file` support and run remote commands through `sudo -S -p '' ...` over SSH stdin.

3. `sudo_deploy.txt` was not a raw one-line password file.
   - Symptom: the helper originally assumed the first line was the literal secret, but the file includes labels such as `[sudo] password for deploy: ...`.
   - Fix: add `parseSecretFileContents(...)` so labeled helper output resolves to the actual secret value.

4. Queue-side evidence could falsely look healthy.
   - Symptom: malformed or failed queue snapshots were normalized into zero-filled counts, which could make a bad probe look like an empty healthy queue.
   - Fix: preserve `counts: null` when queue telemetry is missing and fail the soak verdict when no reachable queue snapshots exist or when queue snapshot evidence is incomplete.

5. Global fairness capture could be mislabeled as a failure.
   - Symptom: the wrapper treated every `proof.ok !== true` result as `fairness_proof_failed`, even though `prove-live-fairness --mode global-fairness` intentionally returns `analysisPending: true` until offline fairness analysis runs.
   - Fix: treat `analysisPending: true` as a special non-terminal proof state instead of an automatic wrapper failure.

6. A single hot sample could be mislabeled as sustained saturation.
   - Symptom: one interval above threshold would mark a container as “concerning,” even though the verdict reason was named `sustained_hotspot_detected`.
   - Fix: require at least two hot samples plus either a hot streak of `>= 3` samples or a hot-sample ratio of `>= 0.3`.

7. Proof stdout parse failures could discard useful artifacts.
   - Symptom: if `prove-live-fairness` exited without valid JSON, the wrapper would throw during `JSON.parse(...)` and lose the saturation summary it was supposed to preserve.
   - Fix: add structured proof parsing that degrades to `proof_output_missing` or `proof_output_invalid` while still returning sample artifacts and a failed soak verdict.

## Live Soak Notes

- `live-soak-capacity-v1` and `v2` timed out before a final merged verdict because the first orchestration pass still had the sample-loop and privilege issues above.
- `live-soak-capacity-v3` proved the queue path stayed healthy, but its verdict was still tied to the earlier proof and sustained-hotspot semantics.
- `live-soak-capacity-v4` is the first run using the corrected harness and is the authoritative result for this phase.
