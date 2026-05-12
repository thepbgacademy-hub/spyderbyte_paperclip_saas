import { timingSafeEqual } from "node:crypto";

import type { ApiRole, ApiSession } from "./dashboard-api.js";

export type StaticRuntimeAuthEnv = {
  bearerToken: string;
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

  return { bearerToken, tenantId, userId, role };
}

export function createStaticRuntimeAuth(env: StaticRuntimeAuthEnv) {
  const expectedAuthorization = Buffer.from(`Bearer ${env.bearerToken}`, "utf8");
  const session: ApiSession = {
    tenantId: env.tenantId,
    userId: env.userId,
    role: env.role
  };

  return {
    async authenticate(input: { authorization: string }): Promise<ApiSession | null> {
      const actualAuthorization = Buffer.from(input.authorization, "utf8");
      if (actualAuthorization.length !== expectedAuthorization.length) {
        return null;
      }
      return timingSafeEqual(actualAuthorization, expectedAuthorization) ? session : null;
    }
  };
}
