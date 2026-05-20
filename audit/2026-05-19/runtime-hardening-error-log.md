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
