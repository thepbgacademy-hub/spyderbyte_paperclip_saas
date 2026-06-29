import { describe, expect, it, vi } from "vitest";

import {
  buildStageOperatorControlsProbePlan,
  runStageOperatorControlsProbe
} from "../scripts/lib/stage-operator-controls-probe.mjs";

describe("stage operator controls probe planner", () => {
  it("builds a dry-run plan by default without requiring a token or network execution", () => {
    const plan = buildStageOperatorControlsProbePlan({
      args: {},
      env: {
        WF_STAGE_API_ORIGIN: "https://wf-api.spyderbyte.cloud",
        WF_STAGE_OPERATOR_TENANT_ID: "tenant-1"
      }
    });

    expect(plan).toMatchObject({
      dryRun: true,
      executeReadOnly: false,
      method: "GET",
      apiOrigin: "https://wf-api.spyderbyte.cloud",
      tenantId: "tenant-1",
      endpoint: "https://wf-api.spyderbyte.cloud/api/operator/tenants/tenant-1/jobs/dead-letters"
    });
    expect(plan.authorizationPreview).toBe(null);
  });

  it("requires explicit execute-read-only and a bearer token before preparing a live read-only probe", () => {
    expect(() =>
      buildStageOperatorControlsProbePlan({
        args: { "execute-read-only": true },
        env: {
          WF_STAGE_API_ORIGIN: "https://wf-api.spyderbyte.cloud",
          WF_STAGE_OPERATOR_TENANT_ID: "tenant-1"
        }
      })
    ).toThrow(/WF_STAGE_OPERATOR_BEARER_TOKEN is required/);

    const plan = buildStageOperatorControlsProbePlan({
      args: { "execute-read-only": true },
      env: {
        WF_STAGE_API_ORIGIN: "https://wf-api.spyderbyte.cloud/",
        WF_STAGE_OPERATOR_TENANT_ID: "tenant-1",
        WF_STAGE_OPERATOR_BEARER_TOKEN: "stage-token-value"
      }
    });

    expect(plan).toMatchObject({
      dryRun: false,
      executeReadOnly: true,
      method: "GET",
      authorizationPreview: "stag****"
    });
    expect(plan.endpoint).toBe("https://wf-api.spyderbyte.cloud/api/operator/tenants/tenant-1/jobs/dead-letters");
  });

  it("rejects non-read methods and mutable route overrides", () => {
    expect(() =>
      buildStageOperatorControlsProbePlan({
        args: { method: "POST" },
        env: {
          WF_STAGE_API_ORIGIN: "https://wf-api.spyderbyte.cloud",
          WF_STAGE_OPERATOR_TENANT_ID: "tenant-1"
        }
      })
    ).toThrow(/only supports the GET/);

    expect(() =>
      buildStageOperatorControlsProbePlan({
        args: { path: "/api/operator/tenants/tenant-1/pause" },
        env: {
          WF_STAGE_API_ORIGIN: "https://wf-api.spyderbyte.cloud",
          WF_STAGE_OPERATOR_TENANT_ID: "tenant-1"
        }
      })
    ).toThrow(/only supports the dead-letter read path/);
  });

  it("runs one read-only request with a narrow acceptable status set and no secret leakage", async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 501 });
    const plan = buildStageOperatorControlsProbePlan({
      args: { "execute-read-only": true },
      env: {
        WF_STAGE_API_ORIGIN: "https://wf-api.spyderbyte.cloud",
        WF_STAGE_OPERATOR_TENANT_ID: "tenant-1",
        WF_STAGE_OPERATOR_BEARER_TOKEN: "stage-token-value"
      }
    });

    const result = await runStageOperatorControlsProbe({ plan, fetch, now: () => 1000 });

    expect(result).toMatchObject({
      ok: true,
      dryRun: false,
      endpoint: plan.endpoint,
      method: "GET",
      status: 501,
      verdict: "accepted_operator_surface_status",
      authorizationPreview: "stag****"
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      plan.endpoint,
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ authorization: "Bearer stage-token-value" })
      })
    );
    expect(JSON.stringify(result)).not.toContain("stage-token-value");
  });

  it("fails closed on redirects, unexpected 2xx, and server errors", async () => {
    const plan = buildStageOperatorControlsProbePlan({
      args: { "execute-read-only": true },
      env: {
        WF_STAGE_API_ORIGIN: "https://wf-api.spyderbyte.cloud",
        WF_STAGE_OPERATOR_TENANT_ID: "tenant-1",
        WF_STAGE_OPERATOR_BEARER_TOKEN: "stage-token-value"
      }
    });

    await expect(runStageOperatorControlsProbe({ plan, fetch: vi.fn().mockResolvedValue({ status: 204 }) })).resolves.toMatchObject({
      ok: false,
      status: 204,
      verdict: "unexpected_operator_surface_status"
    });
    await expect(runStageOperatorControlsProbe({ plan, fetch: vi.fn().mockResolvedValue({ status: 302 }) })).resolves.toMatchObject({
      ok: false,
      status: 302,
      verdict: "unexpected_operator_surface_status"
    });
    await expect(runStageOperatorControlsProbe({ plan, fetch: vi.fn().mockResolvedValue({ status: 500 }) })).resolves.toMatchObject({
      ok: false,
      status: 500,
      verdict: "unexpected_operator_surface_status"
    });
  });
});
