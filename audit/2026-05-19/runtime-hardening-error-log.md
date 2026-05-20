## Runtime Hardening Error Log

Use this log to avoid repeating already-seen mistakes while finishing:

1. Do not import runtime-used helpers as type-only imports.
   The prior Paperclip launch hardening slice failed when a sanitizer was imported with `import type`, which erased the symbol at runtime.

2. Respect `exactOptionalPropertyTypes`.
   Avoid passing `undefined` into optional object properties unless the receiving type explicitly allows it.

3. Keep API/worker runtime seams aligned with test doubles.
   Rate-limit and OAuth state handlers now use async persistence-backed contracts, so tests and mocks must use `mockResolvedValue` / async implementations.

4. Treat audit metadata as masked-by-default.
   Durable audit writes must pass through `safeAuditMetadata` and must not persist raw secret values, raw auth material, or opaque secret handles.

5. Keep migration helper awareness in sync with schema additions.
   New migrations are not complete until `scripts/apply-wfpc-migration.mjs` and migration-shape tests know how to detect them idempotently.

6. Temporary Playwright configs should live inside the workspace when they import repo dev dependencies.
   A config created under `%TEMP%` failed because `@playwright/test` did not resolve from outside the repo tree.

7. When extending revocation assertions, add the new projection mock in the same test scope.
   One rerun failed because the assertion referenced `projection` without defining it in that test case.

8. Worker-side Paperclip binding helpers should cast or narrow provider kinds before strict helper calls.
   The runtime bridge passed a generic string into a `ProviderKind` helper and broke `tsc` under strict typing.

9. Paperclip lifecycle projection must be best-effort at registration time.
   A missing tenant-to-Paperclip company mapping should not make local BYOK registration fail after the secret is already stored and committed.

10. Secret rotation hooks need provider metadata, not just the next secret ref.
    Without the provider kind, first-time Paperclip binding on rotation cannot derive the correct env-key mapping.

11. Runtime composition order matters when new cross-system seams reuse shared services.
    A later patch failed because `paperclipProjection` captured `audit` before `audit` was initialized in `runtime-server.ts`.

12. Keep mirrored projection contracts in sync across local and remote lifecycle types.
    Adding `allowBootstrap` only on the Paperclip side broke `secret-service.ts` until the shared projection type was updated too.
