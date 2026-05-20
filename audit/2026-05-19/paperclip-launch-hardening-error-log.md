# Paperclip Launch Hardening Error Log

## 2026-05-19

### Scope
- Remove raw Paperclip `secretValues` from the checked-in launch contract.
- Preserve a running error/fix log so the same mistakes are not repeated.

### Entries
- Phase start: current repo still hydrates vault-backed provider secrets internally, but the launch boundary must stop forwarding those raw values into Paperclip payloads.
- Verification failure 1: `tests/paperclip-client.test.ts` failed because `toPaperclipProviderContext` was imported as a type-only symbol in `src/paperclip/client.ts`, so the sanitizer was missing at runtime. Fix: switch to a value import with inline `type` specifiers for the remaining type-only names.
- Verification failure 2: `npm run build` failed under `exactOptionalPropertyTypes` because `src/workflows/run-service.ts` could still construct a launch input with `providerContext: undefined`. Fix: normalize to a local `paperclipProviderContext` value and only spread the property when it is present.
