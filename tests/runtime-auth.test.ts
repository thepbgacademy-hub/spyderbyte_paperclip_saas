import { describe, expect, it } from "vitest";

import { createRuntimeSessionAuth, createRuntimeSessionToken, loadRuntimeSessionAuthEnv, RuntimeAuthEnvError } from "../src/api/runtime-auth.js";

describe("runtime auth", () => {
  it("loads the runtime session auth environment", () => {
    expect(
      loadRuntimeSessionAuthEnv({
        WF_API_SESSION_SIGNING_KEY: "wf-demo-signing-key-with-sufficient-length"
      })
    ).toEqual({
      signingKey: "wf-demo-signing-key-with-sufficient-length",
      sessionCookieName: "wf_portal_session",
      issuer: "wealth-factory-runtime",
      audience: "wealth-factory-portal"
    });
  });

  it("rejects invalid auth env and authenticates signed session tokens only", async () => {
    expect(() =>
      loadRuntimeSessionAuthEnv({
        WF_API_SESSION_SIGNING_KEY: "short-token"
      })
    ).toThrow(RuntimeAuthEnvError);

    expect(() =>
      loadRuntimeSessionAuthEnv({
        WF_API_SESSION_SIGNING_KEY: "short-token"
      })
    ).toThrow(/at least 24 characters/);

    const signingKey = "wf-demo-signing-key-with-sufficient-length";
    const auth = createRuntimeSessionAuth(
      {
        signingKey,
        sessionCookieName: "wf_portal_session",
        issuer: "wealth-factory-runtime",
        audience: "wealth-factory-portal"
      },
      {
        now: () => new Date("2026-05-19T12:00:00.000Z").getTime()
      }
    );
    const token = createRuntimeSessionToken({
      signingKey,
      issuer: "wealth-factory-runtime",
      audience: "wealth-factory-portal",
      session: {
        tenantId: "tenant-1",
        userId: "user-1",
        role: "operator"
      },
      issuedAt: new Date("2026-05-19T11:55:00.000Z"),
      expiresAt: new Date("2026-05-19T12:30:00.000Z")
    });

    await expect(auth.authenticate({ authorization: `Bearer ${token}` })).resolves.toEqual({
      tenantId: "tenant-1",
      userId: "user-1",
      role: "operator"
    });
    await expect(auth.authenticate({ authorization: "", cookie: `wf_portal_session=${token}` })).resolves.toEqual({
      tenantId: "tenant-1",
      userId: "user-1",
      role: "operator"
    });
    await expect(auth.authenticate({ authorization: "Bearer no" })).resolves.toBeNull();
  });

  it("rejects expired or mismatched signed session tokens", async () => {
    const signingKey = "wf-demo-signing-key-with-sufficient-length";
    const auth = createRuntimeSessionAuth(
      {
        signingKey,
        sessionCookieName: "wf_portal_session",
        issuer: "wealth-factory-runtime",
        audience: "wealth-factory-portal"
      },
      {
        now: () => new Date("2026-05-19T12:00:00.000Z").getTime()
      }
    );

    const expiredToken = createRuntimeSessionToken({
      signingKey,
      issuer: "wealth-factory-runtime",
      audience: "wealth-factory-portal",
      session: {
        tenantId: "tenant-1",
        userId: "user-1",
        role: "member"
      },
      issuedAt: new Date("2026-05-19T10:00:00.000Z"),
      expiresAt: new Date("2026-05-19T11:00:00.000Z")
    });
    const wrongAudienceToken = createRuntimeSessionToken({
      signingKey,
      issuer: "wealth-factory-runtime",
      audience: "other-audience",
      session: {
        tenantId: "tenant-1",
        userId: "user-1",
        role: "member"
      },
      issuedAt: new Date("2026-05-19T11:55:00.000Z"),
      expiresAt: new Date("2026-05-19T12:30:00.000Z")
    });
    const tooLongToken = createRuntimeSessionToken({
      signingKey,
      issuer: "wealth-factory-runtime",
      audience: "wealth-factory-portal",
      session: {
        tenantId: "tenant-1",
        userId: "user-1",
        role: "member"
      },
      issuedAt: new Date("2026-05-19T10:00:00.000Z"),
      expiresAt: new Date("2026-05-19T12:30:01.000Z")
    });
    const futureIssuedToken = createRuntimeSessionToken({
      signingKey,
      issuer: "wealth-factory-runtime",
      audience: "wealth-factory-portal",
      session: {
        tenantId: "tenant-1",
        userId: "user-1",
        role: "member"
      },
      issuedAt: new Date("2026-05-19T12:05:00.000Z"),
      expiresAt: new Date("2026-05-19T12:30:00.000Z")
    });

    await expect(auth.authenticate({ authorization: `Bearer ${expiredToken}` })).resolves.toBeNull();
    await expect(auth.authenticate({ authorization: `Bearer ${wrongAudienceToken}` })).resolves.toBeNull();
    await expect(auth.authenticate({ authorization: `Bearer ${tooLongToken}` })).resolves.toBeNull();
    await expect(auth.authenticate({ authorization: `Bearer ${futureIssuedToken}` })).resolves.toBeNull();
  });

  it("accepts a valid cookie even when a stale bearer token is also present", async () => {
    const signingKey = "wf-demo-signing-key-with-sufficient-length";
    const auth = createRuntimeSessionAuth(
      {
        signingKey,
        sessionCookieName: "wf_portal_session",
        issuer: "wealth-factory-runtime",
        audience: "wealth-factory-portal"
      },
      {
        now: () => new Date("2026-05-19T12:00:00.000Z").getTime()
      }
    );
    const validCookieToken = createRuntimeSessionToken({
      signingKey,
      issuer: "wealth-factory-runtime",
      audience: "wealth-factory-portal",
      session: {
        tenantId: "tenant-1",
        userId: "user-1",
        role: "operator"
      },
      issuedAt: new Date("2026-05-19T11:55:00.000Z"),
      expiresAt: new Date("2026-05-19T12:30:00.000Z")
    });
    const expiredBearerToken = createRuntimeSessionToken({
      signingKey,
      issuer: "wealth-factory-runtime",
      audience: "wealth-factory-portal",
      session: {
        tenantId: "tenant-2",
        userId: "user-2",
        role: "member"
      },
      issuedAt: new Date("2026-05-19T09:00:00.000Z"),
      expiresAt: new Date("2026-05-19T10:00:00.000Z")
    });

    await expect(
      auth.authenticate({
        authorization: `Bearer ${expiredBearerToken}`,
        cookie: `wf_portal_session=${validCookieToken}`
      })
    ).resolves.toEqual({
      tenantId: "tenant-1",
      userId: "user-1",
      role: "operator"
    });
  });
});
