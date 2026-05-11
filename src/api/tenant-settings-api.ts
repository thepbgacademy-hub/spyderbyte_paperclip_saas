import type { ProviderKind } from "../providers/provider-types.js";
import type { StorageProviderKind } from "../storage/storage-provider-types.js";
import { assertWealthFactoryResponse } from "../wealthfactory/response-guard.js";
import type { ApiSession } from "./dashboard-api.js";

type SettingsApiDeps = {
  authenticate(input: { authorization: string }): Promise<ApiSession | null>;
  requireTenantMember(input: { tenantId: string; userId: string }): Promise<void>;
  registerProviderCredential(input: {
    tenantId: string;
    actorUserId: string;
    providerKind: ProviderKind;
    label: string;
    secretValues: Record<string, string>;
    metadata: Record<string, unknown>;
  }): Promise<unknown>;
  registerStorageConnector(input: {
    tenantId: string;
    actorUserId: string;
    providerKind: StorageProviderKind;
    displayName: string;
    secretRefs: Record<string, string>;
    publicTarget: Record<string, unknown>;
  }): Promise<unknown>;
};

type AuthenticatedRequest = {
  authorization: string;
};

export function createTenantSettingsApi(deps: SettingsApiDeps) {
  async function requireSession(request: AuthenticatedRequest): Promise<ApiSession> {
    const session = await deps.authenticate({ authorization: request.authorization });
    if (!session) {
      throw new Error("Unauthorized");
    }
    await deps.requireTenantMember({ tenantId: session.tenantId, userId: session.userId });
    return session;
  }

  return {
    async registerProviderCredential(
      request: AuthenticatedRequest & {
        providerKind: ProviderKind;
        label: string;
        secretValues: Record<string, string>;
        metadata: Record<string, unknown>;
      }
    ) {
      assertPublicMetadata(request.metadata);
      const session = await requireSession(request);
      const response = await deps.registerProviderCredential({
        tenantId: session.tenantId,
        actorUserId: session.userId,
        providerKind: request.providerKind,
        label: request.label,
        secretValues: request.secretValues,
        metadata: request.metadata
      });
      assertWealthFactoryResponse(response);
      return response;
    },

    async registerStorageConnector(
      request: AuthenticatedRequest & {
        providerKind: StorageProviderKind;
        displayName: string;
        secretRefs: Record<string, string>;
        publicTarget: Record<string, unknown>;
      }
    ) {
      assertPublicTarget(request.publicTarget);
      const session = await requireSession(request);
      const response = await deps.registerStorageConnector({
        tenantId: session.tenantId,
        actorUserId: session.userId,
        providerKind: request.providerKind,
        displayName: request.displayName,
        secretRefs: request.secretRefs,
        publicTarget: request.publicTarget
      });
      assertWealthFactoryResponse(response);
      return response;
    }
  };
}

function assertPublicMetadata(metadata: Record<string, unknown>): void {
  if (containsSecretLikeField(metadata)) {
    throw new Error("Provider metadata cannot contain secret-like fields");
  }
}

function assertPublicTarget(target: Record<string, unknown>): void {
  if (containsSecretLikeField(target)) {
    throw new Error("Storage target cannot contain secret-like fields");
  }
}

function containsSecretLikeField(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return typeof value === "string" && /vault:\/\/|oauth|refresh[_-]?token|access_token=|api[_-]?key[:=]|authorization[:=]|Bearer\s+|sk-[A-Za-z0-9_-]+/i.test(value);
  }

  if (Array.isArray(value)) {
    return value.some(containsSecretLikeField);
  }

  return Object.entries(value).some(([key, nested]) => {
    return /api[_-]?key|token|secret|authorization|password|credential|oauth|refresh/i.test(key) || containsSecretLikeField(nested);
  });
}
