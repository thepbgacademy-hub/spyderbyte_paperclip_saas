import { describe, expect, it } from "vitest";

import { createStaticRuntimeAuth, loadStaticRuntimeAuthEnv, RuntimeAuthEnvError } from "../src/api/runtime-auth.js";

describe("runtime auth", () => {
  it("loads the static bearer auth environment", () => {
    expect(
      loadStaticRuntimeAuthEnv({
        WF_API_BEARER_TOKEN: "wf-demo-token-with-sufficient-length",
        WF_API_TENANT_ID: "tenant-1",
        WF_API_USER_ID: "user-1",
        WF_API_ROLE: "member"
      })
    ).toEqual({
      bearerToken: "wf-demo-token-with-sufficient-length",
      tenantId: "tenant-1",
      userId: "user-1",
      role: "member"
    });
  });

  it("rejects invalid auth env and authenticates only the expected bearer token", async () => {
    expect(() =>
      loadStaticRuntimeAuthEnv({
        WF_API_BEARER_TOKEN: "short-token",
        WF_API_TENANT_ID: "tenant-1",
        WF_API_USER_ID: "user-1",
        WF_API_ROLE: "admin"
      })
    ).toThrow(RuntimeAuthEnvError);

    expect(() =>
      loadStaticRuntimeAuthEnv({
        WF_API_BEARER_TOKEN: "short-token",
        WF_API_TENANT_ID: "tenant-1",
        WF_API_USER_ID: "user-1",
        WF_API_ROLE: "member"
      })
    ).toThrow(/at least 24 characters/);

    const auth = createStaticRuntimeAuth({
      bearerToken: "wf-demo-token-with-sufficient-length",
      tenantId: "tenant-1",
      userId: "user-1",
      role: "operator"
    });

    await expect(auth.authenticate({ authorization: "Bearer wf-demo-token-with-sufficient-length" })).resolves.toEqual({
      tenantId: "tenant-1",
      userId: "user-1",
      role: "operator"
    });
    await expect(auth.authenticate({ authorization: "Bearer no" })).resolves.toBeNull();
  });
});
