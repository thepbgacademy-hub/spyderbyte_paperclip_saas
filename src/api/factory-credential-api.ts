import type { MaskedPowerSourceCredential, PowerSourceProviderKind } from "../factory/domain/types.js";
import {
  FactoryCredentialNotFoundError,
  type createFactoryCredentialService
} from "../factory/power-sources/factory-credential-service.js";

export type FactoryCredentialApiSession = {
  userId: string;
  tenantId: string;
};

export type FactoryCredentialRole = "owner" | "admin" | "member";

export type FactoryCredentialDto = MaskedPowerSourceCredential;

export type FactoryCredentialDeleteDto = {
  credentialId: string;
  deleted: true;
};

export class FactoryCredentialApiError extends Error {
  constructor(readonly code: "unauthorized" | "forbidden" | "invalid_request", message: string) {
    super(message);
    this.name = "FactoryCredentialApiError";
  }
}

type FactoryCredentialService = ReturnType<typeof createFactoryCredentialService>;

export type FactoryCredentialApiDeps = {
  authenticate(input: { authorization: string; cookie?: string }): Promise<FactoryCredentialApiSession | null>;
  requireTenantMember(input: { tenantId: string; userId: string }): Promise<void>;
  resolveTenantCredentialRole(input: { tenantId: string; userId: string }): Promise<FactoryCredentialRole>;
  credentialService: FactoryCredentialService;
};

const SUPPORTED_PROVIDER_KINDS = new Set<PowerSourceProviderKind>([
  "openai_api",
  "anthropic_api",
  "gemini_api",
  "openrouter_api",
  "xai_grok_api"
]);

type AuthenticatedRequest = {
  authorization: string;
  cookie?: string;
};

export function createFactoryCredentialApi(deps: FactoryCredentialApiDeps) {
  async function createActor(request: AuthenticatedRequest) {
    const session = await deps.authenticate({
      authorization: request.authorization,
      ...(request.cookie ? { cookie: request.cookie } : {})
    });
    if (!session) {
      throw new FactoryCredentialApiError("unauthorized", "Unauthorized");
    }

    try {
      await deps.requireTenantMember({
        tenantId: session.tenantId,
        userId: session.userId
      });
    } catch (error) {
      if (isMissingMembershipError(error)) {
        throw new FactoryCredentialApiError("forbidden", "Tenant membership is required");
      }
      throw error;
    }
    const role = await deps.resolveTenantCredentialRole({
      tenantId: session.tenantId,
      userId: session.userId
    });
    if (role !== "owner" && role !== "admin") {
      throw new FactoryCredentialApiError("forbidden", "Only tenant owners and admins can manage Power Sources");
    }

    return {
      userId: session.userId,
      tenantId: session.tenantId,
      role
    };
  }

  return {
    async createCredential(
      request: AuthenticatedRequest & {
        providerKind: string;
        label: string;
        secret: Record<string, string>;
      }
    ): Promise<FactoryCredentialDto> {
      const actor = await createActor(request);
      const providerKind = parseProviderKind(request.providerKind);
      if (!providerKind || request.label.trim().length === 0 || !hasSecretValue(request.secret)) {
        throw new FactoryCredentialApiError("invalid_request", "Credential request is invalid");
      }

      return deps.credentialService.createCredential({
        workspaceId: actor.tenantId,
        providerKind,
        label: request.label.trim(),
        secret: request.secret
      });
    },

    async listCredentials(request: AuthenticatedRequest): Promise<FactoryCredentialDto[]> {
      const actor = await createActor(request);
      return deps.credentialService.listCredentials({ workspaceId: actor.tenantId });
    },

    async deleteCredential(
      request: AuthenticatedRequest & {
        credentialId: string;
      }
    ): Promise<FactoryCredentialDeleteDto> {
      const actor = await createActor(request);
      try {
        await deps.credentialService.deleteCredential({
          workspaceId: actor.tenantId,
          credentialId: request.credentialId
        });
      } catch (error) {
        if (error instanceof FactoryCredentialNotFoundError) {
          throw new FactoryCredentialApiError("invalid_request", "Credential was not found");
        }
        throw error;
      }
      return { credentialId: request.credentialId, deleted: true };
    }
  };
}

function parseProviderKind(value: string): PowerSourceProviderKind | null {
  return SUPPORTED_PROVIDER_KINDS.has(value as PowerSourceProviderKind) ? (value as PowerSourceProviderKind) : null;
}

function hasSecretValue(secret: Record<string, string>): boolean {
  return Object.values(secret).some((value) => typeof value === "string" && value.trim().length > 0);
}

function isMissingMembershipError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /membership|member|not found|not authorized|forbidden/i.test(error.message) &&
    !/database|connection|timeout|unavailable/i.test(error.message)
  );
}
