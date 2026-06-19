import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  DEFAULT_STAGE_STABILITY_ENV_FILE,
  DEFAULT_STAGE_STABILITY_FOCUS_CONTAINERS,
  DEFAULT_STAGE_STABILITY_LANES,
  DEFAULT_STAGE_STABILITY_PROOF_CONTAINER,
  DEFAULT_STAGE_STABILITY_QUEUE_CONTAINER,
  DEFAULT_STAGE_STABILITY_SSH_ENV_FILE,
  DEFAULT_STAGE_STABILITY_SUDO_PASSWORD_FILE,
  buildStageStabilityPlan,
  parseStageStabilityArgs
} = require("../scripts/lib/stage-live-stability.mjs");

describe("stage live stability helper", () => {
  it("defaults to the isolated stage env, ssh env, six demo lanes, and bounded stage-owned container focus", () => {
    const plan = buildStageStabilityPlan({
      args: parseStageStabilityArgs([]),
      env: {
        WF_STAGE_API_ORIGIN: "https://wf-api.spyderbyte.cloud",
        WF_STAGE_PORTAL_ORIGIN: "https://www.spyderbyte.cloud",
        WF_PORTAL_SESSION_COOKIE_NAME: "wf_portal_session",
        SUPABASE_DB_URL: "postgresql://demo:secret@supabase-db:5432/postgres",
        VPS2_USER: "deploy",
        VPS2_HOST: "187.77.19.83"
      }
    });

    expect(DEFAULT_STAGE_STABILITY_ENV_FILE).toBe("E:/the_secrets/projects/wealth-factory-stage/wf-stage.vps2.env");
    expect(DEFAULT_STAGE_STABILITY_SSH_ENV_FILE).toBe("E:/the_secrets/vps/ssh.env");
    expect(DEFAULT_STAGE_STABILITY_SUDO_PASSWORD_FILE).toBe("sudo_deploy.txt");
    expect(DEFAULT_STAGE_STABILITY_QUEUE_CONTAINER).toBe("wf-stage-api");
    expect(DEFAULT_STAGE_STABILITY_PROOF_CONTAINER).toBe("wf-stage-api");
    expect(DEFAULT_STAGE_STABILITY_LANES).toEqual([
      "primary",
      "secondary",
      "tertiary",
      "quaternary",
      "quinary",
      "senary"
    ]);
    expect(DEFAULT_STAGE_STABILITY_FOCUS_CONTAINERS).toEqual([
      "wf-stage-api",
      "wf-stage-worker",
      "wf-stage-web"
    ]);
    expect(plan.envFilePath).toBe(DEFAULT_STAGE_STABILITY_ENV_FILE);
    expect(plan.sshEnvFilePath).toBe(DEFAULT_STAGE_STABILITY_SSH_ENV_FILE);
    expect(plan.sudoPasswordFilePath).toBe(DEFAULT_STAGE_STABILITY_SUDO_PASSWORD_FILE);
    expect(plan.queueContainer).toBe(DEFAULT_STAGE_STABILITY_QUEUE_CONTAINER);
    expect(plan.proofContainer).toBe(DEFAULT_STAGE_STABILITY_PROOF_CONTAINER);
    expect(plan.focusContainers).toEqual(DEFAULT_STAGE_STABILITY_FOCUS_CONTAINERS);
    expect(plan.sshTarget).toBe("deploy@187.77.19.83");
    expect(plan.lanes.map((lane: { laneName: string }) => lane.laneName)).toEqual(DEFAULT_STAGE_STABILITY_LANES);
    expect(plan.preflightDb.tunnelRequired).toBe(true);
    expect(plan.preflightDb.resolvedDbUrl).toBe("postgresql://demo:secret@127.0.0.1:6543/postgres");
  });

  it("builds canonical fairness and soak command plans for the isolated stage lane", () => {
    const plan = buildStageStabilityPlan({
      args: parseStageStabilityArgs([]),
      env: {
        WF_STAGE_API_ORIGIN: "https://wf-api.spyderbyte.cloud",
        WF_STAGE_PORTAL_ORIGIN: "https://www.spyderbyte.cloud",
        WF_PORTAL_SESSION_COOKIE_NAME: "wf_portal_session",
        SUPABASE_DB_URL: "postgresql://demo:secret@supabase-db:5432/postgres",
        VPS2_USER: "deploy",
        VPS2_HOST: "187.77.19.83"
      }
    });

    expect(plan.steps.map((step: { id: string }) => step.id)).toEqual([
      "stage-live-proof",
      "stage-live-fairness",
      "stage-live-soak"
    ]);

    const fairnessStep = plan.steps.find((step: { id: string }) => step.id === "stage-live-fairness");
    expect(fairnessStep.command).toBe("npm");
    expect(fairnessStep.args).toEqual(expect.arrayContaining([
      "run",
      "prove:live-fairness",
      "--",
      "--mode",
      "drain",
      "--order",
      "staggered",
      "--cycles",
      "1"
    ]));
    expect(fairnessStep.args).toContain("primary:22222222-2222-4222-8222-222222222222:11111111-1111-4111-8111-111111111111:wf_connect_first_workflow:1");
    expect(fairnessStep.args).toContain("senary:22222222-2222-4222-8222-777777777777:11111111-1111-4111-8111-666666666666:wf_package_followup:1");

    const soakStep = plan.steps.find((step: { id: string }) => step.id === "stage-live-soak");
    expect(soakStep.command).toBe("npm");
    expect(soakStep.args).toEqual(expect.arrayContaining([
      "run",
      "prove:live-soak-capacity",
      "--",
      "--ssh-target",
      "deploy@187.77.19.83",
      "--sudo-password-file",
      "sudo_deploy.txt",
      "--queue-container",
      "wf-stage-api",
      "--proof-ssh-target",
      "deploy@187.77.19.83",
      "--proof-container",
      "wf-stage-api"
    ]));
    expect(soakStep.args).toContain("wf-stage-api");
    expect(soakStep.args).toContain("wf-stage-worker");
    expect(soakStep.args).toContain("wf-stage-web");
    expect(soakStep.args).toContain("primary:22222222-2222-4222-8222-222222222222:11111111-1111-4111-8111-111111111111:wf_connect_first_workflow:1");
    expect(soakStep.args).toContain("senary:22222222-2222-4222-8222-777777777777:11111111-1111-4111-8111-666666666666:wf_package_followup:1");
    expect(soakStep.args).toEqual(expect.arrayContaining([
      "--cycles",
      "1"
    ]));
    expect(plan.proofModelNotes).toEqual(expect.arrayContaining([
      expect.stringContaining("single start for primary"),
      expect.stringContaining("single cycle")
    ]));
  });

  it("propagates ssh-target overrides to the first proof step and honors repeated focus-container flags", () => {
    const plan = buildStageStabilityPlan({
      args: parseStageStabilityArgs([
        "--ssh-target",
        "deploy@203.0.113.10",
        "--focus-container",
        "wf-stage-api",
        "--focus-container",
        "paperclip"
      ]),
      env: {
        WF_STAGE_API_ORIGIN: "https://wf-api.spyderbyte.cloud",
        WF_STAGE_PORTAL_ORIGIN: "https://www.spyderbyte.cloud",
        WF_PORTAL_SESSION_COOKIE_NAME: "wf_portal_session",
        SUPABASE_DB_URL: "postgresql://demo:secret@supabase-db:5432/postgres"
      }
    });

    expect(plan.sshTarget).toBe("deploy@203.0.113.10");
    expect(plan.focusContainers).toEqual(["wf-stage-api", "paperclip"]);
    const proofStep = plan.steps.find((step: { id: string }) => step.id === "stage-live-proof");
    expect(proofStep.args).toEqual(expect.arrayContaining([
      "--ssh-target",
      "deploy@203.0.113.10"
    ]));
    const soakStep = plan.steps.find((step: { id: string }) => step.id === "stage-live-soak");
    expect(soakStep.args).toEqual(expect.arrayContaining([
      "--focus-container",
      "wf-stage-api",
      "--focus-container",
      "paperclip"
    ]));
  });

  it("fails closed on unknown lane names", () => {
    expect(() =>
      buildStageStabilityPlan({
        args: parseStageStabilityArgs(["--lanes", "primary,unknown"]),
        env: {
          WF_STAGE_API_ORIGIN: "https://wf-api.spyderbyte.cloud",
          WF_STAGE_PORTAL_ORIGIN: "https://www.spyderbyte.cloud",
          WF_PORTAL_SESSION_COOKIE_NAME: "wf_portal_session",
          SUPABASE_DB_URL: "postgresql://demo:secret@supabase-db:5432/postgres"
        }
      })
    ).toThrow("Unknown stage stability lane 'unknown'");
  });

  it("fails closed when a single-value flag is provided without a value", () => {
    expect(() =>
      buildStageStabilityPlan({
        args: parseStageStabilityArgs(["--ssh-target"]),
        env: {
          WF_STAGE_API_ORIGIN: "https://wf-api.spyderbyte.cloud",
          WF_STAGE_PORTAL_ORIGIN: "https://www.spyderbyte.cloud",
          WF_PORTAL_SESSION_COOKIE_NAME: "wf_portal_session",
          SUPABASE_DB_URL: "postgresql://demo:secret@supabase-db:5432/postgres",
          VPS2_USER: "deploy",
          VPS2_HOST: "187.77.19.83"
        }
      })
    ).toThrow("Stage stability option --ssh-target requires a value");
  });

  it("fails closed when a single-value flag is repeated", () => {
    expect(() =>
      buildStageStabilityPlan({
        args: parseStageStabilityArgs([
          "--ssh-target",
          "deploy@203.0.113.10",
          "--ssh-target",
          "deploy@203.0.113.11"
        ]),
        env: {
          WF_STAGE_API_ORIGIN: "https://wf-api.spyderbyte.cloud",
          WF_STAGE_PORTAL_ORIGIN: "https://www.spyderbyte.cloud",
          WF_PORTAL_SESSION_COOKIE_NAME: "wf_portal_session",
          SUPABASE_DB_URL: "postgresql://demo:secret@supabase-db:5432/postgres"
        }
      })
    ).toThrow("Stage stability option --ssh-target may only be provided once");
  });

  it("fails closed when a single-value flag is blank", () => {
    expect(() =>
      buildStageStabilityPlan({
        args: parseStageStabilityArgs([
          "--ssh-target",
          "   "
        ]),
        env: {
          WF_STAGE_API_ORIGIN: "https://wf-api.spyderbyte.cloud",
          WF_STAGE_PORTAL_ORIGIN: "https://www.spyderbyte.cloud",
          WF_PORTAL_SESSION_COOKIE_NAME: "wf_portal_session",
          SUPABASE_DB_URL: "postgresql://demo:secret@supabase-db:5432/postgres",
          VPS2_USER: "deploy",
          VPS2_HOST: "187.77.19.83"
        }
      })
    ).toThrow("Stage stability option --ssh-target cannot be blank");
  });
});
