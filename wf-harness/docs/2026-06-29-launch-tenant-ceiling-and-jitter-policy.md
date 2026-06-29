# Launch Tenant Ceiling and Jitter Policy

## Phase Boundary

This phase records the launch-time operating rule for the first public Wealth Factory pod. It is policy and proof-only: no runtime scheduler, VPS change, deployment topology change, database mutation, operator mutation, Caddy/DNS change, or Paperclip repair is introduced here. This phase does not implement a new runtime scheduler.

## Decision

For launch, four tenants per VPS is the strict launch upper cap. This is not a comfort target.

The cap is allowed only with active monitoring and only on the isolated Wealth Factory launch lane. Adding a fifth tenant to the same VPS requires an explicit operator review, fresh soak evidence, and a new phase boundary.

## Evidence Basis

The decision comes from the existing pressure-test evidence, not from a new live run in this phase.

- The six-tenant pod shape proved fairness and drain behavior, but it remained a pressure ceiling rather than a comfortable launch posture.
- The `4tenant-staggered` follow-up reached `80/80` running runs, but Paperclip still peaked at `474.71%` CPU, `2990370980` bytes memory, and `1405` PIDs.
- The `4tenant-clustered` follow-up reached `40/40` running runs, but Paperclip still peaked at `351.31%` CPU, `2482491097` bytes memory, and `957` PIDs.
- The practical read is that four tenants improves blast radius, but Paperclip headroom is still tight enough that four must remain a monitored upper cap.

## Anti-Clustering Rule

Do not place multiple tenant cron or heartbeat starts on the same minute boundary.

Until a later dedicated scheduler phase exists, operators should stagger tenant onboarding, manual launch batches, cron starts, and heartbeat starts with a minimum `120` seconds between tenant start windows. This keeps the launch rule aligned with the Paperclip pressure lesson without creating a new Wealth Factory scheduling subsystem.

## Out Of Scope

- New runtime scheduler
- Automated cron rewrite
- Queue smoothing engine
- VPS, Docker, Caddy, DNS, or database mutation
- Operator pause/resume, retry/cancel, or secret mutation
- Raising the launch cap above four tenants
- Treating four tenants as a relaxed safety zone

## Next Review Gate

Revisit the cap only after a fresh stage-stability or soak phase proves better Paperclip headroom on the exact deployment shape that will receive additional tenants.
