import { createHmac, timingSafeEqual } from "node:crypto";

import type { ApiSession } from "./dashboard-api.js";

export type RuntimeSessionAuthEnv = {
  signingKey: string;
  sessionCookieName: string;
  issuer: string;
  audience: string;
};

export type RuntimeSessionClaims = ApiSession & {
  exp: number;
  iat: number;
  iss: string;
  aud: string;
  v: 1;
};

export class RuntimeAuthEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeAuthEnvError";
  }
}

const MIN_SIGNING_KEY_LENGTH = 24;
const TOKEN_VERSION = "wf1";
const MAX_RUNTIME_SESSION_TTL_SECONDS = 60 * 60;

export function loadRuntimeSessionAuthEnv(source: NodeJS.ProcessEnv = process.env): RuntimeSessionAuthEnv {
  const signingKey = source.WF_API_SESSION_SIGNING_KEY?.trim();
  const sessionCookieName = source.WF_PORTAL_SESSION_COOKIE_NAME?.trim() || "wf_portal_session";
  const issuer = source.WF_API_SESSION_ISSUER?.trim() || "wealth-factory-runtime";
  const audience = source.WF_API_SESSION_AUDIENCE?.trim() || "wealth-factory-portal";

  if (!signingKey) {
    throw new RuntimeAuthEnvError("WF_API_SESSION_SIGNING_KEY is required");
  }
  if (signingKey.length < MIN_SIGNING_KEY_LENGTH) {
    throw new RuntimeAuthEnvError(`WF_API_SESSION_SIGNING_KEY must be at least ${MIN_SIGNING_KEY_LENGTH} characters`);
  }
  if (!issuer) {
    throw new RuntimeAuthEnvError("WF_API_SESSION_ISSUER is required");
  }
  if (!audience) {
    throw new RuntimeAuthEnvError("WF_API_SESSION_AUDIENCE is required");
  }

  return {
    signingKey,
    sessionCookieName,
    issuer,
    audience
  };
}

export function createRuntimeSessionAuth(
  env: RuntimeSessionAuthEnv,
  options: {
    now?: () => number;
  } = {}
) {
  const now = options.now ?? (() => Date.now());

  return {
    async authenticate(input: { authorization: string; cookie?: string }): Promise<ApiSession | null> {
      const bearerToken = readBearerToken(input.authorization);
      const cookieToken = readCookieValue(input.cookie, env.sessionCookieName);
      for (const token of [cookieToken, bearerToken]) {
        if (!token) {
          continue;
        }

        const claims = verifyRuntimeSessionToken({
          token,
          signingKey: env.signingKey,
          issuer: env.issuer,
          audience: env.audience,
          nowMs: now()
        });
        if (!claims) {
          continue;
        }

        return {
          tenantId: claims.tenantId,
          userId: claims.userId,
          role: claims.role
        };
      }
      return null;
    }
  };
}

export function createRuntimeSessionToken(input: {
  signingKey: string;
  issuer: string;
  audience: string;
  session: ApiSession;
  expiresAt: Date;
  issuedAt?: Date;
}): string {
  const issuedAt = input.issuedAt ?? new Date();
  const claims: RuntimeSessionClaims = {
    tenantId: input.session.tenantId,
    userId: input.session.userId,
    role: input.session.role,
    iat: Math.floor(issuedAt.getTime() / 1000),
    exp: Math.floor(input.expiresAt.getTime() / 1000),
    iss: input.issuer,
    aud: input.audience,
    v: 1
  };

  const payload = base64UrlEncode(JSON.stringify(claims));
  const signature = signPayload({
    signingKey: input.signingKey,
    payload
  });
  return `${TOKEN_VERSION}.${payload}.${signature}`;
}

export function verifyRuntimeSessionToken(input: {
  token: string;
  signingKey: string;
  issuer: string;
  audience: string;
  nowMs?: number;
}): RuntimeSessionClaims | null {
  const nowMs = input.nowMs ?? Date.now();
  const [version, payload, signature] = input.token.split(".");
  if (version !== TOKEN_VERSION || !payload || !signature) {
    return null;
  }

  const expectedSignature = signPayload({
    signingKey: input.signingKey,
    payload
  });
  const actualSignature = Buffer.from(signature, "utf8");
  const expectedSignatureBuffer = Buffer.from(expectedSignature, "utf8");
  if (actualSignature.length !== expectedSignatureBuffer.length) {
    return null;
  }
  if (!timingSafeEqual(actualSignature, expectedSignatureBuffer)) {
    return null;
  }

  let claims: unknown;
  try {
    claims = JSON.parse(base64UrlDecode(payload));
  } catch {
    return null;
  }

  if (!isRuntimeSessionClaims(claims)) {
    return null;
  }
  if (claims.iss !== input.issuer || claims.aud !== input.audience) {
    return null;
  }
  if (claims.exp <= claims.iat) {
    return null;
  }
  if (claims.exp - claims.iat > MAX_RUNTIME_SESSION_TTL_SECONDS) {
    return null;
  }
  if (claims.iat > Math.floor(nowMs / 1000)) {
    return null;
  }
  if (claims.exp <= Math.floor(nowMs / 1000)) {
    return null;
  }

  return claims;
}

function signPayload(input: { signingKey: string; payload: string }) {
  return createHmac("sha256", input.signingKey).update(input.payload).digest("base64url");
}

function readBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/u.exec(authorizationHeader.trim());
  return match?.[1]?.trim() || null;
}

function readCookieValue(cookieHeader: string | undefined, cookieName: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const entry of cookieHeader.split(";")) {
    const [name, ...valueParts] = entry.trim().split("=");
    if (name === cookieName) {
      return valueParts.join("=") || null;
    }
  }

  return null;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function isRuntimeSessionClaims(value: unknown): value is RuntimeSessionClaims {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.tenantId === "string" &&
    record.tenantId.trim().length > 0 &&
    typeof record.userId === "string" &&
    record.userId.trim().length > 0 &&
    (record.role === "member" || record.role === "operator") &&
    typeof record.iss === "string" &&
    record.iss.trim().length > 0 &&
    typeof record.aud === "string" &&
    record.aud.trim().length > 0 &&
    typeof record.iat === "number" &&
    Number.isFinite(record.iat) &&
    typeof record.exp === "number" &&
    Number.isFinite(record.exp) &&
    record.v === 1
  );
}
