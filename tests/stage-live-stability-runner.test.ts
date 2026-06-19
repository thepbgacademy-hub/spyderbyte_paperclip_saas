import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildStageStabilityPlan, parseStageStabilityArgs } = require("../scripts/lib/stage-live-stability.mjs");
const { runStageStabilityPlan } = require("../scripts/lib/stage-live-stability-runner.mjs") as {
  runStageStabilityPlan(input: {
    plan: {
      sshTarget: string;
      proofContainer: string;
      steps: Array<{
        id: string;
        label: string;
        command: string;
        args: string[];
      }>;
    };
    baseEnv: NodeJS.ProcessEnv;
    sudoPassword: string;
    stdout?: { write(chunk: string): unknown };
    stderr?: { write(chunk: string): unknown };
    cwd?: string;
    spawn?: (command: string, args: string[], options: Record<string, unknown>) => { status: number | null; error: Error | null };
    resolveCommand?: (command: string) => string;
  }): Promise<{
    ok: true;
    phase: "stage_stability_complete";
    steps: string[];
  }>;
};

describe("stage live stability runner", () => {
  it("runs local proof, remote fairness, and local soak without wrapper-side workflow-template lookup", async () => {
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
    const stdout: string[] = [];
    const stderr: string[] = [];
    const spawn = vi.fn().mockReturnValue({ status: 0, error: null });

    const result = await runStageStabilityPlan({
      plan,
      baseEnv: {
        WF_STAGE_ENV_FILE: plan.envFilePath,
        WF_STAGE_SSH_ENV_FILE: plan.sshEnvFilePath
      },
      sudoPassword: "super-secret",
      stdout: { write: (chunk: string) => stdout.push(String(chunk)) },
      stderr: { write: (chunk: string) => stderr.push(String(chunk)) },
      cwd: "E:/REPOS/spyderbyte_paperclip_saas",
      spawn,
      resolveCommand: (command: string) => `resolved:${command}`
    });

    expect(result).toEqual({
      ok: true,
      phase: "stage_stability_complete",
      steps: ["stage-live-proof", "stage-live-fairness", "stage-live-soak"]
    });
    expect(stderr).toEqual([]);
    expect(spawn).toHaveBeenCalledTimes(3);
    expect(spawn.mock.calls.map(([command]) => command)).toEqual([
      "resolved:npm",
      "ssh",
      "resolved:npm"
    ]);

    const proofArgs = spawn.mock.calls[0]?.[1] as string[];
    expect(proofArgs).toEqual(expect.arrayContaining([
      "run",
      "prove:stage-live"
    ]));

    const fairnessArgs = spawn.mock.calls[1]?.[1] as string[];
    expect(fairnessArgs[0]).toBe("deploy@187.77.19.83");
    expect(fairnessArgs[1]).toContain("cd /app && node scripts/prove-live-fairness.mjs");
    expect(fairnessArgs[1]).toContain("wf_connect_first_workflow");
    expect(fairnessArgs[1]).toContain("wf_package_followup");
    expect(fairnessArgs[1]).not.toContain("workflow_templates");

    const soakArgs = spawn.mock.calls[2]?.[1] as string[];
    expect(soakArgs).toEqual(expect.arrayContaining([
      "run",
      "prove:live-soak-capacity"
    ]));
  });

  it("fails closed before building a remote ssh command for an unsafe proof container token", async () => {
    const spawn = vi.fn().mockReturnValue({ status: 0, error: null });

    await expect(() =>
      runStageStabilityPlan({
        plan: {
          sshTarget: "deploy@187.77.19.83",
          proofContainer: "wf-stage-api; rm -rf /",
          steps: [
            {
              id: "stage-live-fairness",
              label: "npm run prove:live-fairness",
              command: "npm",
              args: ["run", "prove:live-fairness", "--", "--mode", "drain"]
            }
          ]
        },
        baseEnv: {},
        sudoPassword: "super-secret",
        stdout: { write: () => {} },
        cwd: "E:/REPOS/spyderbyte_paperclip_saas",
        spawn
      })
    ).rejects.toThrow("Stage stability proof-container must be a shell-safe container token");

    expect(spawn).not.toHaveBeenCalled();
  });
});
