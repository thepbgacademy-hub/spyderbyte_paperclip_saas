import { createHash, randomBytes } from "node:crypto";

import type { StorageProviderKind } from "./storage-provider-types.js";

export type StorageOAuthProviderKind = Extract<StorageProviderKind, "google_drive" | "dropbox">;

type OAuthProviderConfig = {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes: readonly string[];
  authorizationParams?: Readonly<Record<string, string>>;
  requiresRefreshToken: boolean;
};

type PendingOAuthState = {
  tenantId: string;
  actorUserId: string;
  providerKind: StorageOAuthProviderKind;
  displayName: string;
  publicTarget: StoragePublicTarget;
  codeVerifier: string;
  expiresAt: string;
};

type OAuthStateStore = {
  save(input: { state: string; value: PendingOAuthState }): Promise<void>;
  consume(input: { state: string }): Promise<PendingOAuthState | null>;
};

type StorageOAuthRegistration = {
  register(input: {
    tenantId: string;
    actorUserId: string;
    providerKind: StorageOAuthProviderKind;
    displayName: string;
    secretValues: Record<string, string>;
    publicTarget: StoragePublicTarget;
  }): Promise<unknown>;
};

type StoragePublicTarget = {
  folderLabel?: string;
};

type FetchLike = (url: string, init: { method: "POST"; headers: Record<string, string>; body: URLSearchParams }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export function createStorageOAuthService(options: {
  providers: Record<StorageOAuthProviderKind, OAuthProviderConfig>;
  stateStore: OAuthStateStore;
  registration: StorageOAuthRegistration;
  fetch: FetchLike;
  now?: () => Date;
}) {
  const now = options.now ?? (() => new Date());

  return {
    async begin(input: {
      tenantId: string;
      actorUserId: string;
      providerKind: StorageOAuthProviderKind;
      displayName: string;
      publicTarget: Record<string, unknown>;
    }): Promise<{ authorizationUrl: string; expiresAt: string }> {
      assertPublicTarget(input.publicTarget);
      const publicTarget = normalizePublicTarget(input.publicTarget);
      const provider = options.providers[input.providerKind];
      const state = randomToken();
      const codeVerifier = randomToken();
      const expiresAt = new Date(now().getTime() + 10 * 60_000).toISOString();

      await options.stateStore.save({
        state,
        value: {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          providerKind: input.providerKind,
          displayName: input.displayName,
          publicTarget,
          codeVerifier,
          expiresAt
        }
      });

      const authorizationUrl = new URL(provider.authorizationEndpoint);
      authorizationUrl.searchParams.set("response_type", "code");
      authorizationUrl.searchParams.set("client_id", provider.clientId);
      authorizationUrl.searchParams.set("redirect_uri", provider.redirectUri);
      authorizationUrl.searchParams.set("scope", provider.scopes.join(" "));
      authorizationUrl.searchParams.set("state", state);
      authorizationUrl.searchParams.set("code_challenge", codeChallenge(codeVerifier));
      authorizationUrl.searchParams.set("code_challenge_method", "S256");
      for (const [key, value] of Object.entries(provider.authorizationParams ?? {})) {
        authorizationUrl.searchParams.set(key, value);
      }

      return { authorizationUrl: authorizationUrl.toString(), expiresAt };
    },

    async complete(input: { state: string; code: string }): Promise<unknown> {
      const pending = await options.stateStore.consume({ state: input.state });
      if (!pending || Date.parse(pending.expiresAt) <= now().getTime()) {
        throw new Error("Storage authorization expired");
      }

      const provider = options.providers[pending.providerKind];
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: provider.redirectUri,
        client_id: provider.clientId,
        code_verifier: pending.codeVerifier
      });
      if (provider.clientSecret) {
        body.set("client_secret", provider.clientSecret);
      }

      const tokenResponse = await options.fetch(provider.tokenEndpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body
      });
      if (!tokenResponse.ok) {
        throw new Error("Storage authorization failed");
      }

      const tokens = readTokenResponse(await tokenResponse.json(), provider.requiresRefreshToken);
      return options.registration.register({
        tenantId: pending.tenantId,
        actorUserId: pending.actorUserId,
        providerKind: pending.providerKind,
        displayName: pending.displayName,
        secretValues: tokens,
        publicTarget: pending.publicTarget
      });
    }
  };
}

export function createMemoryOAuthStateStore(): OAuthStateStore {
  const states = new Map<string, PendingOAuthState>();
  return {
    async save(input) {
      states.set(input.state, input.value);
    },
    async consume(input) {
      const value = states.get(input.state) ?? null;
      states.delete(input.state);
      return value;
    }
  };
}

export const STORAGE_OAUTH_PROVIDER_CONFIGS = {
  googleDrive(input: { clientId: string; clientSecret?: string; redirectUri: string }): OAuthProviderConfig {
    return {
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      clientId: input.clientId,
      ...(input.clientSecret ? { clientSecret: input.clientSecret } : {}),
      redirectUri: input.redirectUri,
      scopes: ["https://www.googleapis.com/auth/drive.file"],
      authorizationParams: {
        access_type: "offline",
        prompt: "consent"
      },
      requiresRefreshToken: true
    };
  },
  dropbox(input: { clientId: string; clientSecret?: string; redirectUri: string }): OAuthProviderConfig {
    return {
      authorizationEndpoint: "https://www.dropbox.com/oauth2/authorize",
      tokenEndpoint: "https://api.dropboxapi.com/oauth2/token",
      clientId: input.clientId,
      ...(input.clientSecret ? { clientSecret: input.clientSecret } : {}),
      redirectUri: input.redirectUri,
      scopes: ["files.content.write", "files.metadata.read"],
      authorizationParams: {
        token_access_type: "offline"
      },
      requiresRefreshToken: true
    };
  }
};

function readTokenResponse(value: unknown, requiresRefreshToken: boolean): Record<string, string> {
  if (!value || typeof value !== "object") {
    throw new Error("Storage authorization returned an invalid token response");
  }
  const record = value as Record<string, unknown>;
  const accessToken = record.access_token;
  if (typeof accessToken !== "string" || accessToken.trim().length === 0) {
    throw new Error("Storage authorization returned an invalid token response");
  }
  const refreshToken = record.refresh_token;
  if (requiresRefreshToken && (typeof refreshToken !== "string" || refreshToken.trim().length === 0)) {
    throw new Error("Storage authorization did not return offline access");
  }
  return {
    accessToken,
    ...(typeof refreshToken === "string" && refreshToken.trim().length > 0 ? { refreshToken } : {})
  };
}

function normalizePublicTarget(target: Record<string, unknown>): StoragePublicTarget {
  const folderLabel = target.folderLabel;
  return typeof folderLabel === "string" && folderLabel.trim().length > 0 ? { folderLabel: folderLabel.trim() } : {};
}

function assertPublicTarget(target: Record<string, unknown>): void {
  if (containsSecretLikeField(target)) {
    throw new Error("Storage target cannot contain secret-like fields");
  }
}

function containsSecretLikeField(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return typeof value === "string" && /vault:\/\/|wf_secret_|oauth|refresh[_-]?token|access_token=|api[_-]?key[:=]|authorization[:=]|Bearer\s+|sk-[A-Za-z0-9_-]+/i.test(value);
  }

  if (Array.isArray(value)) {
    return value.some(containsSecretLikeField);
  }

  return Object.entries(value).some(([key, nested]) => {
    return /api[_-]?key|token|secret|authorization|password|credential|oauth|refresh/i.test(key) || containsSecretLikeField(nested);
  });
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function codeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}
