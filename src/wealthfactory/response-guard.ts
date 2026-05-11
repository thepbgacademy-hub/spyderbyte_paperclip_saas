const FORBIDDEN_FIELDS = new Set([
  "paperclip",
  "paperclipRunId",
  "paperclipCompanyId",
  "companyId",
  "prompt",
  "skill",
  "command",
  "agent",
  "toolCall",
  "rawActivity",
  "internalLog",
  "secretRef",
  "serviceToken",
  "apiKey",
  "token",
  "password",
  "credential",
  "oauthTokenRef",
  "refreshTokenRef",
  "codexHome",
  "authStateRef"
]);

const FORBIDDEN_TEXT =
  /paperclip|prompt|skill|command|tool call|raw activity|internal log|service token|vault:\/\/|wf_secret_|access_token=|api[_-]?key[:=]|authorization[:=]|Bearer\s+|sk-[A-Za-z0-9_-]+|pc-(company|run|agent|goal|task)-/i;

export function assertWealthFactoryResponse(value: unknown): void {
  visit(value);
}

function visit(value: unknown): void {
  if (typeof value === "string") {
    if (FORBIDDEN_TEXT.test(value)) {
      throw new Error("Forbidden customer-facing text");
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach(visit);
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (key === "authorizationUrl" && isAllowedExternalAuthorizationUrl(nested)) {
      continue;
    }
    if (isForbiddenField(key)) {
      throw new Error("Forbidden customer-facing field");
    }
    visit(nested);
  }
}

function isAllowedExternalAuthorizationUrl(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value);
    if (!["https://accounts.google.com", "https://www.dropbox.com"].includes(url.origin)) {
      return false;
    }
    return !/(access_token=|api[_-]?key[:=]|authorization[:=]|Bearer\s+|sk-[A-Za-z0-9_-]+)/i.test(value);
  } catch {
    return false;
  }
}

function isForbiddenField(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_\-\s]/g, "");
  return (
    FORBIDDEN_FIELDS.has(key) ||
    /paperclip|companyid|prompt|skill|command|agent|toolcall|rawactivity|internallog|secretref|servicetoken|apikey|token|password|credential|oauth|refresh|wfsecret|codexhome|authstateref/.test(
      normalized
    )
  );
}
