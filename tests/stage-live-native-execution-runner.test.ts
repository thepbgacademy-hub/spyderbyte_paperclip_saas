import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { runStageLiveNativeExecutionPlan } = require("../scripts/lib/stage-live-native-execution-runner.mjs") as {
  runStageLiveNativeExecutionPlan(input: {
    envFilePath: string;
    sshEnvFilePath: string;
    sshTarget: string;
    preflightContainer: string;
    apiCodexHomeReadinessProofPath?: string | null;
    workerCodexHomeReadinessProofPath?: string | null;
    codexAuthStateRef?: string | null;
    childEnv: NodeJS.ProcessEnv;
    lanes: Array<{
      laneName: string;
      workflowId: string;
      profile: {
        tenantId: string;
        userId: string;
        workflowTemplateId: string;
      };
    }>;
    stdout?: { write(chunk: string): unknown };
    cwd?: string;
    spawn?: (command: string, args: string[], options: Record<string, unknown>) => { status: number | null; error: Error | null };
  }): void;
};

describe("stage live native execution runner", () => {
  it("runs the three matched core-family lanes with explicit workflow-template ids", () => {
    const spawn = vi.fn().mockReturnValue({ status: 0, error: null });
    const stdout: string[] = [];

    runStageLiveNativeExecutionPlan({
      envFilePath: "E:/the_secrets/projects/wealth-factory-stage/wf-stage.vps2.env",
      sshEnvFilePath: "E:/the_secrets/vps/ssh.env",
      sshTarget: "deploy@187.77.19.83",
      preflightContainer: "wf-stage-api",
      apiCodexHomeReadinessProofPath: "audit/2026-07-01/api-ready.json",
      workerCodexHomeReadinessProofPath: "audit/2026-07-01/worker-ready.json",
      codexAuthStateRef: "first-subscriber-openai-device",
      childEnv: {
        VPS2_SUDO_PASSWORD: "super-secret"
      },
      lanes: [
        {
          laneName: "primary",
          workflowId: "wf_connect_first_workflow",
          profile: {
            tenantId: "tenant-primary",
            userId: "user-primary",
            workflowTemplateId: "template-primary"
          }
        },
        {
          laneName: "tertiary",
          workflowId: "wf_tax_strategy",
          profile: {
            tenantId: "tenant-tertiary",
            userId: "user-tertiary",
            workflowTemplateId: "template-tertiary"
          }
        },
        {
          laneName: "quinary",
          workflowId: "wf_package_followup",
          profile: {
            tenantId: "tenant-quinary",
            userId: "user-quinary",
            workflowTemplateId: "template-quinary"
          }
        }
      ],
      stdout: { write: (chunk: string) => stdout.push(String(chunk)) },
      cwd: "E:/REPOS/spyderbyte_paperclip_saas",
      spawn
    });

    expect(spawn).toHaveBeenCalledTimes(3);
    expect(spawn.mock.calls.map(([command]) => command)).toEqual([
      process.execPath,
      process.execPath,
      process.execPath
    ]);
    expect(stdout.join("")).toContain("== Stage native execution lane: primary (wf_connect_first_workflow) ==");
    expect(stdout.join("")).toContain("== Stage native execution lane: tertiary (wf_tax_strategy) ==");
    expect(stdout.join("")).toContain("== Stage native execution lane: quinary (wf_package_followup) ==");

    const primaryArgs = spawn.mock.calls[0]?.[1] as string[];
    expect(primaryArgs).toEqual(expect.arrayContaining([
      "scripts/prove-live-native-execution.mjs",
      "--env-file",
      "E:/the_secrets/projects/wealth-factory-stage/wf-stage.vps2.env",
      "--ssh-env-file",
      "E:/the_secrets/vps/ssh.env",
      "--ssh-target",
      "deploy@187.77.19.83",
      "--preflight-container",
      "wf-stage-api",
      "--api-codex-home-readiness-proof",
      "audit/2026-07-01/api-ready.json",
      "--worker-codex-home-readiness-proof",
      "audit/2026-07-01/worker-ready.json",
      "--codex-auth-state-ref",
      "first-subscriber-openai-device",
      "--tenant",
      "tenant-primary",
      "--user",
      "user-primary",
      "--workflow",
      "wf_connect_first_workflow",
      "--workflow-template",
      "template-primary"
    ]));

    const tertiaryArgs = spawn.mock.calls[1]?.[1] as string[];
    expect(tertiaryArgs).toEqual(expect.arrayContaining([
      "--workflow",
      "wf_tax_strategy",
      "--workflow-template",
      "template-tertiary"
    ]));
    expect(tertiaryArgs).not.toContain("--api-codex-home-readiness-proof");
    expect(tertiaryArgs).not.toContain("--worker-codex-home-readiness-proof");

    const quinaryArgs = spawn.mock.calls[2]?.[1] as string[];
    expect(quinaryArgs).toEqual(expect.arrayContaining([
      "--workflow",
      "wf_package_followup",
      "--workflow-template",
      "template-quinary"
    ]));
    expect(quinaryArgs).not.toContain("--api-codex-home-readiness-proof");
    expect(quinaryArgs).not.toContain("--worker-codex-home-readiness-proof");

    const firstOptions = spawn.mock.calls[0]?.[2] as { env: NodeJS.ProcessEnv; cwd: string; shell: boolean; stdio: string };
    expect(firstOptions.env?.VPS2_SUDO_PASSWORD).toBe("super-secret");
    expect(firstOptions.cwd).toBe("E:/REPOS/spyderbyte_paperclip_saas");
    expect(firstOptions.stdio).toBe("inherit");
  });

  it("surfaces step context instead of exiting directly when a lane proof returns a non-zero status", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit unexpectedly called with code ${code}`);
    }) as never);
    const spawn = vi
      .fn()
      .mockReturnValueOnce({ status: 0, error: null })
      .mockReturnValueOnce({ status: 23, error: null });

    try {
      let thrown: unknown;
      try {
        runStageLiveNativeExecutionPlan({
          envFilePath: "E:/the_secrets/projects/wealth-factory-stage/wf-stage.vps2.env",
          sshEnvFilePath: "E:/the_secrets/vps/ssh.env",
      sshTarget: "deploy@187.77.19.83",
      preflightContainer: "wf-stage-api",
      apiCodexHomeReadinessProofPath: "audit/2026-07-01/api-ready.json",
      workerCodexHomeReadinessProofPath: "audit/2026-07-01/worker-ready.json",
      childEnv: {
            VPS2_SUDO_PASSWORD: "super-secret"
          },
          lanes: [
            {
              laneName: "primary",
              workflowId: "wf_connect_first_workflow",
              profile: {
                tenantId: "tenant-primary",
                userId: "user-primary",
                workflowTemplateId: "template-primary"
              }
            },
            {
              laneName: "tertiary",
              workflowId: "wf_tax_strategy",
              profile: {
                tenantId: "tenant-tertiary",
                userId: "user-tertiary",
                workflowTemplateId: "template-tertiary"
              }
            }
          ],
          spawn
        });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toMatchObject({
        name: "StageLiveNativeExecutionStepError",
        stepId: "wf_tax_strategy",
        stepLabel: "node scripts/prove-live-native-execution.mjs",
        status: 23
      });
    } finally {
      exitSpy.mockRestore();
    }
  });

  it("fails closed when a lane proof ends by signal without an explicit exit status", () => {
    const spawn = vi.fn().mockReturnValue({
      status: null,
      signal: "SIGTERM",
      error: null
    });

    let thrown: unknown;
    try {
      runStageLiveNativeExecutionPlan({
        envFilePath: "E:/the_secrets/projects/wealth-factory-stage/wf-stage.vps2.env",
        sshEnvFilePath: "E:/the_secrets/vps/ssh.env",
      sshTarget: "deploy@187.77.19.83",
      preflightContainer: "wf-stage-api",
      apiCodexHomeReadinessProofPath: "audit/2026-07-01/api-ready.json",
      workerCodexHomeReadinessProofPath: "audit/2026-07-01/worker-ready.json",
      childEnv: {
          VPS2_SUDO_PASSWORD: "super-secret"
        },
        lanes: [
          {
            laneName: "primary",
            workflowId: "wf_connect_first_workflow",
            profile: {
              tenantId: "tenant-primary",
              userId: "user-primary",
              workflowTemplateId: "template-primary"
            }
          }
        ],
        spawn
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      name: "StageLiveNativeExecutionStepError",
      stepId: "wf_connect_first_workflow",
      stepLabel: "node scripts/prove-live-native-execution.mjs",
      signal: "SIGTERM"
    });
  });

  it("fails closed before spawning Codex-subscription lanes when API or worker Codex readiness proof paths are missing", () => {
    const spawn = vi.fn();

    let thrown: unknown;
    try {
      runStageLiveNativeExecutionPlan({
        envFilePath: "E:/the_secrets/projects/wealth-factory-stage/wf-stage.vps2.env",
        sshEnvFilePath: "E:/the_secrets/vps/ssh.env",
        sshTarget: "deploy@187.77.19.83",
        preflightContainer: "wf-stage-api",
        apiCodexHomeReadinessProofPath: "audit/2026-07-01/api-ready.json",
        workerCodexHomeReadinessProofPath: null,
        childEnv: {
          VPS2_SUDO_PASSWORD: "super-secret"
        },
        lanes: [
          {
            laneName: "primary",
            workflowId: "wf_connect_first_workflow",
            profile: {
              tenantId: "tenant-primary",
              userId: "user-primary",
              workflowTemplateId: "template-primary"
            }
          }
        ],
        spawn
      });
    } catch (error) {
      thrown = error;
    }

    expect(spawn).not.toHaveBeenCalled();
    expect(thrown).toMatchObject({
      name: "StageLiveNativeExecutionStepError",
      stepId: "codex_readiness_gate",
      stepLabel: "Codex auth-home readiness proof gate",
      status: 1
    });
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(
      "Both API and worker Codex auth-home readiness proof paths are required before stage native execution for wf_connect_first_workflow."
    );
  });

  it("does not require Codex readiness proof paths for non-Codex-subscription lanes", () => {
    const spawn = vi.fn().mockReturnValue({ status: 0, error: null });

    runStageLiveNativeExecutionPlan({
      envFilePath: "E:/the_secrets/projects/wealth-factory-stage/wf-stage.vps2.env",
      sshEnvFilePath: "E:/the_secrets/vps/ssh.env",
      sshTarget: "deploy@187.77.19.83",
      preflightContainer: "wf-stage-api",
      apiCodexHomeReadinessProofPath: null,
      workerCodexHomeReadinessProofPath: null,
      childEnv: {
        VPS2_SUDO_PASSWORD: "super-secret"
      },
      lanes: [
        {
          laneName: "tertiary",
          workflowId: "wf_tax_strategy",
          profile: {
            tenantId: "tenant-tertiary",
            userId: "user-tertiary",
            workflowTemplateId: "template-tertiary"
          }
        }
      ],
      spawn
    });

    expect(spawn).toHaveBeenCalledTimes(1);
    const args = spawn.mock.calls[0]?.[1] as string[];
    expect(args).not.toContain("--api-codex-home-readiness-proof");
    expect(args).not.toContain("--worker-codex-home-readiness-proof");
    expect(args).toEqual(expect.arrayContaining([
      "--workflow",
      "wf_tax_strategy",
      "--workflow-template",
      "template-tertiary"
    ]));
  });
});
