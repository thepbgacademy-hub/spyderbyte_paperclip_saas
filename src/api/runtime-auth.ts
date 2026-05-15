import { timingSafeEqual } from "node:crypto";

import type { ApiRole, ApiSession } from "./dashboard-api.js";

export type StaticRuntimeAuthEnv = {
  bearerToken: string;
  sessionCookieName: string;
  tenantId: string;
  userId: string;
  role: ApiRole;
};

export class RuntimeAuthEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeAuthEnvError";
  }
}

const MIN_BEARER_TOKEN_LENGTH = 24;

export function loadStaticRuntimeAuthEnv(source: NodeJS.ProcessEnv = process.env): StaticRuntimeAuthEnv {
  const bearerToken = source.WF_API_BEARER_TOKEN?.trim();
  const tenantId = source.WF_API_TENANT_ID?.trim();
  const userId = source.WF_API_USER_ID?.trim();
  const role = source.WF_API_ROLE?.trim();
  const sessionCookieName = source.WF_PORTAL_SESSION_COOKIE_NAME?.trim() || "wf_portal_session";

  if (!bearerToken) {
    throw new RuntimeAuthEnvError("WF_API_BEARER_TOKEN is required");
  }
  if (bearerToken.length < MIN_BEARER_TOKEN_LENGTH) {
    throw new RuntimeAuthEnvError(`WF_API_BEARER_TOKEN must be at least ${MIN_BEARER_TOKEN_LENGTH} characters`);
  }
  if (!tenantId) {
    throw new RuntimeAuthEnvError("WF_API_TENANT_ID is required");
  }
  if (!userId) {
    throw new RuntimeAuthEnvError("WF_API_USER_ID is required");
  }
  if (role !== "member" && role !== "operator") {
    throw new RuntimeAuthEnvError("WF_API_ROLE must be member or operator");
  }

  return { bearerToken, sessionCookieName, tenantId, userId, role };
}

export function createStaticRuntimeAuth(env: StaticRuntimeAuthEnv) {
  const expectedAuthorization = Buffer.from(`Bearer ${env.bearerToken}`, "utf8");
  const session: ApiSession = {
    tenantId: env.tenantId,
    userId: env.userId,
    role: env.role
  };

  return {
    async authenticate(input: { authorization: string; cookie?: string }): Promise<ApiSession | null> {
      const actualAuthorization = Buffer.from(input.authorization, "utf8");
      if (actualAuthorization.length === expectedAuthorization.length && timingSafeEqual(actualAuthorization, expectedAuthorization)) {
        return session;
      }

      const cookieToken = readCookieValue(input.cookie, env.sessionCookieName);
      if (!cookieToken) {
        return null;
      }

      const actualCookieToken = Buffer.from(cookieToken, "utf8");
      const expectedCookieToken = Buffer.from(env.bearerToken, "utf8");
      if (actualCookieToken.length !== expectedCookieToken.length) {
        return null;
      }

      return timingSafeEqual(actualCookieToken, expectedCookieToken) ? session : null;
    }
  };
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
