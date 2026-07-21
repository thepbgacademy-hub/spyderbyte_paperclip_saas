import { describe, expect, it, vi } from "vitest";

import {
  FactoryCredentialApiError,
  type FactoryCredentialDeleteDto,
  type FactoryCredentialDto
} from "../src/api/factory-credential-api.js";
import { createFactoryCredentialHttpHandler } from "../src/api/factory-credential-http.js";

const credentialDto: FactoryCredentialDto = {
  id: "credential_1",
  workspaceId: "tenant-1",
  providerKind: "anthropic_api",
  label: "Founder Anthropic key",
  last4: "alue",
  keyVersion: "v1",
  validationStatus: "pending",
  validationMessage: "Validation is queued.",
  lastValidatedAt: null,
  createdAt: "2026-07-11T12:00:00.000Z",
  deletedAt: null,
  masked: true
};

function createHandler(input?: {
  api?: Partial<Parameters<typeof createFactoryCredentialHttpHandler>[0]["credentialApi"]>;
  allowedOrigins?: string[];
}) {
  const credentialApi = {
    createCredential: vi.fn(),
    listCredentials: vi.fn(),
    deleteCredential: vi.fn(),
    ...input?.api
  };
  return {
    credentialApi,
    handler: createFactoryCredentialHttpHandler({
      allowedOrigins: input?.allowedOrigins ?? ["https://portal.wealthfactory.test"],
      credentialApi,
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: 1 }) }
    })
  };
}

describe("factory credential HTTP boundary", () => {
  it("routes Ticket 10 create/list/delete through guarded credential endpoints without leaking plaintext", async () => {
    const deleteDto: FactoryCredentialDeleteDto = { credentialId: credentialDto.id, deleted: true };
    const { handler, credentialApi } = createHandler({
      api: {
        createCredential: vi.fn().mockResolvedValue(credentialDto),
        listCredentials: vi.fn().mockResolvedValue([credentialDto]),
        deleteCredential: vi.fn().mockResolvedValue(deleteDto)
      }
    });
    const base = {
      headers: { origin: "https://portal.wealthfactory.test", authorization: "Bearer owner" },
      bodyByteLength: 90,
      ip: "203.0.113.10"
    };

    const created = await handler({
      ...base,
      method: "POST",
      path: "/api/factory/credentials",
      body: {
        providerKind: "anthropic_api",
        label: "Founder Anthropic key",
        secret: { apiKey: "sk-ant-secret-value" }
      }
    });
    expect(created.status).toBe(201);
    expect(JSON.stringify(created.body)).not.toContain("sk-ant-secret-value");

    await expect(
      handler({
        ...base,
        method: "GET",
        path: "/api/factory/credentials",
        body: undefined,
        bodyByteLength: 0
      })
    ).resolves.toMatchObject({ status: 200, body: [credentialDto] });

    await expect(
      handler({
        ...base,
        method: "DELETE",
        path: "/api/factory/credentials/credential_1",
        body: undefined,
        bodyByteLength: 0
      })
    ).resolves.toMatchObject({ status: 200, body: deleteDto });

    expect(credentialApi.createCredential).toHaveBeenCalledWith({
      authorization: "Bearer owner",
      providerKind: "anthropic_api",
      label: "Founder Anthropic key",
      secret: { apiKey: "sk-ant-secret-value" }
    });
    expect(credentialApi.deleteCredential).toHaveBeenCalledWith({
      authorization: "Bearer owner",
      credentialId: "credential_1"
    });
  });

  it("rejects invalid origins, malformed payloads, and unauthorized API results", async () => {
    const { handler, credentialApi } = createHandler({
      api: {
        createCredential: vi.fn().mockRejectedValue(new FactoryCredentialApiError("unauthorized", "Unauthorized"))
      }
    });

    const rejectedOrigin = await handler({
      method: "POST",
      path: "/api/factory/credentials",
      headers: { origin: "https://evil.example", authorization: "Bearer owner" },
      body: { providerKind: "openai_api" },
      bodyByteLength: 31,
      ip: "203.0.113.10"
    });
    expect(rejectedOrigin.status).toBe(403);

    const malformed = await handler({
      method: "POST",
      path: "/api/factory/credentials",
      headers: { origin: "https://portal.wealthfactory.test", authorization: "Bearer owner" },
      body: { providerKind: "openai_api" },
      bodyByteLength: 31,
      ip: "203.0.113.10"
    });
    expect(malformed.status).toBe(400);

    const unauthorized = await handler({
      method: "POST",
      path: "/api/factory/credentials",
      headers: { origin: "https://portal.wealthfactory.test", authorization: "Bearer owner" },
      body: { providerKind: "openai_api", label: "OpenAI key", secret: { apiKey: "sk-secret" } },
      bodyByteLength: 82,
      ip: "203.0.113.10"
    });
    expect(unauthorized.status).toBe(401);
    expect(credentialApi.createCredential).toHaveBeenCalledTimes(1);
  });

  it("fails closed on malformed encoded credential ids and domain validation errors", async () => {
    const { handler, credentialApi } = createHandler({
      api: {
        deleteCredential: vi.fn().mockRejectedValue(new FactoryCredentialApiError("invalid_request", "Credential missing"))
      }
    });

    const malformedPath = await handler({
      method: "DELETE",
      path: "/api/factory/credentials/%E0%A4%A",
      headers: { origin: "https://portal.wealthfactory.test", authorization: "Bearer owner" },
      body: undefined,
      bodyByteLength: 0,
      ip: "203.0.113.10"
    });
    expect(malformedPath.status).toBe(400);
    expect(malformedPath.body).toEqual({ code: "invalid_request" });

    const encodedSlash = await handler({
      method: "DELETE",
      path: "/api/factory/credentials/credential%2Fbad",
      headers: { origin: "https://portal.wealthfactory.test", authorization: "Bearer owner" },
      body: undefined,
      bodyByteLength: 0,
      ip: "203.0.113.10"
    });
    expect(encodedSlash.status).toBe(400);
    expect(encodedSlash.body).toEqual({ code: "invalid_request" });
    expect(credentialApi.deleteCredential).not.toHaveBeenCalled();

    const validationFailure = await handler({
      method: "DELETE",
      path: "/api/factory/credentials/credential_missing",
      headers: { origin: "https://portal.wealthfactory.test", authorization: "Bearer owner" },
      body: undefined,
      bodyByteLength: 0,
      ip: "203.0.113.10"
    });
    expect(validationFailure.status).toBe(400);
    expect(validationFailure.body).toEqual({ code: "invalid_request" });
  });
});
