const SECRET_KEY_PATTERN = /api[_-]?key|token|secret|authorization|password|credential|secretRef|rawSecretValue/i;
const SECRET_VALUE_PATTERN = /(OPENAI_API_KEY=|[A-Z0-9_]*API_KEY=)?sk-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]+|vault:\/\/[^\s"']+/g;

export function redactSecrets<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(SECRET_VALUE_PATTERN, (match, prefix: string | undefined) => (prefix ? `${prefix}[REDACTED]` : "[REDACTED]")) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item)) as T;
  }

  if (isRecord(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, fieldValue] of Object.entries(value)) {
      output[key] = SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : redactSecrets(fieldValue);
    }
    return output as T;
  }

  return value;
}

export function safeAuditMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!SECRET_KEY_PATTERN.test(key)) {
      output[key] = redactSecrets(value);
    }
  }
  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
