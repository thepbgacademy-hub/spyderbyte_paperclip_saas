const LEGACY_FIRST_SUBSCRIBER_AUTH_STATE_REF = "codex-home:first-subscriber";
export const CANONICAL_FIRST_SUBSCRIBER_AUTH_STATE_REF = "first-subscriber-openai-device";

export function normalizeCodexAuthStateRef(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed === LEGACY_FIRST_SUBSCRIBER_AUTH_STATE_REF) {
    return CANONICAL_FIRST_SUBSCRIBER_AUTH_STATE_REF;
  }

  return trimmed;
}

export function normalizeCodexSubscriptionMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...metadata };
  const authStateRef = normalizeCodexAuthStateRef(normalized.authStateRef);

  if (authStateRef) {
    normalized.authStateRef = authStateRef;
  }

  return normalized;
}
