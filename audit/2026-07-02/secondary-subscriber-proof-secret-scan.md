# Secret Exposure Scan

Scope: secondary-subscriber live proof commit set and newly generated proof artifacts for July 2, 2026.

Result: no exposed live credentials, session tokens, private keys, or provider API keys were identified in the scanned proof artifacts or source changes.

Notes:

- The scan flagged expected environment variable names in `deploy/docker-compose.vps2-isolated-stage.yml`.
- The scan flagged placeholder values in `deploy/env/wf-stage.vps2.example.env`.
- The scan flagged dummy test database URLs in `tests/vps2-isolated-stage-config.test.ts` and `tests/worker-runtime.test.ts`.
- These findings are placeholders/test fixtures, not live credentials.

Recommendation: keep proof artifacts committed only when they avoid runtime session tokens and raw provider credentials. Continue using secrets from `E:/the_secrets` at runtime rather than writing them into repo artifacts.
