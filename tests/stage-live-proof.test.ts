import { describe, expect, it } from "vitest";

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  DEFAULT_STAGE_DB_TUNNEL_LOCAL_PORT,
  DEFAULT_STAGE_PROOF_ENV_FILE,
  DEFAULT_STAGE_PROOF_LANES,
  DEFAULT_STAGE_SMOKE_PRIVATE_PORTS,
  buildLaneProofEnv,
  buildStageProofPlan,
  parseStageProofArgs,
  selectSingleWorkflowTemplateId
} = require("../scripts/lib/stage-live-proof.mjs");

describe("stage live proof helper", () => {
  it("defaults to the isolated Wealth Factory stage env file and the three intended workflow-family lanes", () => {
    const args = parseStageProofArgs([]);
    const plan = buildStageProofPlan({
      args,
      env: {
        WF_STAGE_API_ORIGIN: "https://wf-api.spyderbyte.cloud",
        WF_STAGE_PORTAL_ORIGIN: "https://www.spyderbyte.cloud",
        WF_PORTAL_SESSION_COOKIE_NAME: "wf_portal_session",
        SUPABASE_DB_URL: "postgresql://demo:secret@supabase-db:5432/postgres"
      }
    });

    expect(DEFAULT_STAGE_PROOF_ENV_FILE).toBe("E:/the_secrets/projects/wealth-factory-stage/wf-stage.vps2.env");
    expect(DEFAULT_STAGE_PROOF_LANES).toEqual(["primary", "tertiary", "quinary"]);
    expect(plan.envFilePath).toBe(DEFAULT_STAGE_PROOF_ENV_FILE);
    expect(plan.lanes.map((lane: { laneName: string }) => lane.laneName)).toEqual(DEFAULT_STAGE_PROOF_LANES);
    expect(plan.lanes.map((lane: { workflowId: string }) => lane.workflowId)).toEqual([
      "wf_connect_first_workflow",
      "wf_tax_strategy",
      "wf_package_followup"
    ]);
  });

  it("builds canonical authenticated board selectors and asset urls for each lane", () => {
    const plan = buildStageProofPlan({
      args: parseStageProofArgs(["--lanes", "primary,tertiary,quinary"]),
      env: {
        WF_STAGE_API_ORIGIN: "https://wf-api.spyderbyte.cloud/",
        WF_STAGE_PORTAL_ORIGIN: "https://www.spyderbyte.cloud/",
        WF_PORTAL_SESSION_COOKIE_NAME: "wf_portal_session",
        SUPABASE_DB_URL: "postgresql://demo:secret@supabase-db:5432/postgres"
      }
    });

    expect(plan.apiOrigin).toBe("https://wf-api.spyderbyte.cloud");
    expect(plan.portalOrigin).toBe("https://www.spyderbyte.cloud");
    expect(plan.lanes.map((lane: { harnessBoardPath: string }) => lane.harnessBoardPath)).toEqual([
      "/board?workflowId=wf_connect_first_workflow",
      "/board?workflowId=wf_tax_strategy",
      "/board?workflowId=wf_package_followup"
    ]);
    expect(plan.lanes.every((lane: { expectedAssetBaseUrl: string }) => lane.expectedAssetBaseUrl === "https://wf-api.spyderbyte.cloud/app-assets/")).toBe(true);
  });

  it("defaults the stage proof smoke gate to the shared-host private-port exception list", () => {
    const plan = buildStageProofPlan({
      args: parseStageProofArgs([]),
      env: {
        WF_STAGE_API_ORIGIN: "https://wf-api.spyderbyte.cloud/",
        WF_STAGE_PORTAL_ORIGIN: "https://www.spyderbyte.cloud/",
        WF_PORTAL_SESSION_COOKIE_NAME: "wf_portal_session",
        SUPABASE_DB_URL: "postgresql://demo:secret@supabase-db:5432/postgres"
      }
    });

    expect(DEFAULT_STAGE_SMOKE_PRIVATE_PORTS).toBe("6379,9000,3000,5173,8080,8081,2375");
    expect(
      buildLaneProofEnv({
        plan,
        lane: plan.lanes[0],
        sessionToken: "demo-token"
      }).WF_SMOKE_PRIVATE_PORTS
    ).toBe(DEFAULT_STAGE_SMOKE_PRIVATE_PORTS);
  });

  it("allows explicit stage smoke private-port overrides without changing the global smoke default", () => {
    const plan = buildStageProofPlan({
      args: parseStageProofArgs([]),
      env: {
        WF_STAGE_API_ORIGIN: "https://wf-api.spyderbyte.cloud/",
        WF_STAGE_PORTAL_ORIGIN: "https://www.spyderbyte.cloud/",
        WF_PORTAL_SESSION_COOKIE_NAME: "wf_portal_session",
        SUPABASE_DB_URL: "postgresql://demo:secret@supabase-db:5432/postgres",
        WF_STAGE_SMOKE_PRIVATE_PORTS: "5432,6379"
      }
    });

    expect(
      buildLaneProofEnv({
        plan,
        lane: plan.lanes[0],
        sessionToken: "demo-token"
      }).WF_SMOKE_PRIVATE_PORTS
    ).toBe("5432,6379");
  });

  it("allows env overrides for the env file and cookie name", () => {
    const plan = buildStageProofPlan({
      args: parseStageProofArgs([]),
      env: {
        WF_STAGE_ENV_FILE: "C:/custom/wf-stage.env",
        WF_STAGE_API_ORIGIN: "https://wf-api.spyderbyte.cloud",
        WF_STAGE_PORTAL_ORIGIN: "https://www.spyderbyte.cloud",
        WF_PORTAL_SESSION_COOKIE_NAME: "custom_cookie",
        SUPABASE_DB_URL: "postgresql://demo:secret@supabase-db:5432/postgres",
        VPS2_USER: "deploy",
        VPS2_HOST: "187.77.19.83"
      }
    });

    expect(plan.envFilePath).toBe("C:/custom/wf-stage.env");
    expect(plan.sessionCookieName).toBe("custom_cookie");
    expect(plan.preflightDb.tunnelRequired).toBe(true);
    expect(plan.preflightDb.sshTarget).toBe("deploy@187.77.19.83");
    expect(plan.preflightDb.localPort).toBe(DEFAULT_STAGE_DB_TUNNEL_LOCAL_PORT);
    expect(plan.preflightDb.resolvedDbUrl).toContain("@127.0.0.1:6543/postgres");
  });

  it("fails closed on unknown lane names", () => {
    expect(() =>
      buildStageProofPlan({
        args: parseStageProofArgs(["--lanes", "primary,unknown"]),
        env: {
          WF_STAGE_API_ORIGIN: "https://wf-api.spyderbyte.cloud",
          WF_STAGE_PORTAL_ORIGIN: "https://www.spyderbyte.cloud",
          WF_PORTAL_SESSION_COOKIE_NAME: "wf_portal_session",
          SUPABASE_DB_URL: "postgresql://demo:secret@supabase-db:5432/postgres"
        }
      })
    ).toThrow("Unknown stage proof lane 'unknown'");
  });

  it("keeps local db urls untouched when the proof already has direct reachability", () => {
    const plan = buildStageProofPlan({
      args: parseStageProofArgs([]),
      env: {
        WF_STAGE_API_ORIGIN: "https://wf-api.spyderbyte.cloud",
        WF_STAGE_PORTAL_ORIGIN: "https://www.spyderbyte.cloud",
        WF_PORTAL_SESSION_COOKIE_NAME: "wf_portal_session",
        SUPABASE_DB_URL: "postgresql://demo:secret@127.0.0.1:5432/postgres"
      }
    });

    expect(plan.preflightDb.tunnelRequired).toBe(false);
    expect(plan.preflightDb.resolvedDbUrl).toBe("postgresql://demo:secret@127.0.0.1:5432/postgres");
  });

  it("fails closed unless the remote lookup returns exactly one workflow template id", () => {
    expect(selectSingleWorkflowTemplateId([{ id: "workflow-template-1" }])).toBe("workflow-template-1");
    expect(() => selectSingleWorkflowTemplateId([])).toThrow("Expected exactly one workflow template row, found 0");
    expect(() =>
      selectSingleWorkflowTemplateId([{ id: "workflow-template-1" }, { id: "workflow-template-2" }])
    ).toThrow("Expected exactly one workflow template row, found 2");
  });
});
