import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

describe("live harness export replay cycle script", () => {
  it("wires the isolated stage writer-root patch and replay-cycle helper through the stage proof wrapper", () => {
    const script = readFileSync("scripts/prove-live-harness-export-replay-cycle.mjs", "utf8");

    expect(script).toContain("runLiveHarnessExportReplayCycle");
    expect(script).toContain("pollForClosedBoardExportCandidate");
    expect(script).toContain("WF_OBSIDIAN_EXPORT_ROOT");
    expect(script).toContain("/home/deploy/wealth-factory-stage/wf-stage.vps2.env");
    expect(script).toContain("/home/deploy/wealth-factory-stage/docker-compose.vps2-isolated-stage.yml");
    expect(script).toContain("docker compose --env-file");
    expect(script).toContain("wf-stage-api");
  });

  it("fails closed when the replay-cycle stage proof is requested without an explicit run id", async () => {
    const runLiveHarnessExportReplayCycle = vi.fn();

    // @ts-expect-error Runtime-loaded NodeNext helper is exercised directly in this test.
    const module = await import("../scripts/prove-live-harness-export-replay-cycle.mjs");

    await expect(
      module.runLiveHarnessExportReplayCycleStageProof({
        args: {
          tenant: "22222222-2222-4222-8222-444444444444",
          user: "11111111-1111-4111-8111-333333333333",
          workflow: "44444444-4444-4444-8444-666666666666",
          "board-workflow": "wf_tax_strategy"
        },
        processEnv: {
          WF_LIVE_BASE_URL: "https://wf-api.spyderbyte.cloud",
          WF_SMOKE_PORTAL_URL: "https://www.spyderbyte.cloud",
          WF_PORTAL_SESSION_COOKIE_NAME: "wf_portal_session",
          WF_STAGE_SSH_TARGET: "deploy@example.test",
          VPS2_SUDO_PASSWORD: "pw"
        },
        loadSeedEnv: () => ({}),
        loadSshEnv: () => ({}),
        resolveSessionToken: async () => ({
          source: "provided",
          sessionToken: "session-1"
        }),
        runLiveHarnessExportReplayCycle
      })
    ).resolves.toMatchObject({
      ok: false,
      result: {
        replayCycle: {
          ok: false,
          phase: "replay_cycle_requires_explicit_run"
        }
      }
    });

    expect(runLiveHarnessExportReplayCycle).not.toHaveBeenCalled();
  });

  it("forwards an explicit run into the bounded replay-cycle helper", async () => {
    const runLiveHarnessExportReplayCycle = vi.fn(async () => ({
      ok: true,
      phase: "governance_and_package_replay_verified",
      runId: "run-stage-replay-1",
      writerRoot: {
        original: "/tmp/wealth-factory-stage-obsidian-export",
        failure: "/tmp/wealth-factory-stage-obsidian-export.replay-proof-blocker"
      }
    }));

    // @ts-expect-error Runtime-loaded NodeNext helper is exercised directly in this test.
    const module = await import("../scripts/prove-live-harness-export-replay-cycle.mjs");

    await expect(
      module.runLiveHarnessExportReplayCycleStageProof({
        args: {
          tenant: "22222222-2222-4222-8222-444444444444",
          user: "11111111-1111-4111-8111-333333333333",
          workflow: "44444444-4444-4444-8444-666666666666",
          "board-workflow": "wf_tax_strategy",
          run: "run-stage-replay-1"
        },
        processEnv: {
          WF_LIVE_BASE_URL: "https://wf-api.spyderbyte.cloud",
          WF_SMOKE_PORTAL_URL: "https://www.spyderbyte.cloud",
          WF_PORTAL_SESSION_COOKIE_NAME: "wf_portal_session",
          WF_STAGE_SSH_TARGET: "deploy@example.test",
          VPS2_SUDO_PASSWORD: "pw"
        },
        loadSeedEnv: () => ({
          WF_API_SESSION_SIGNING_KEY: "signing",
          WF_API_SESSION_ISSUER: "issuer",
          WF_API_SESSION_AUDIENCE: "audience"
        }),
        loadSshEnv: () => ({}),
        resolveSessionToken: async () => ({
          source: "provided",
          sessionToken: "session-2"
        }),
        runLiveHarnessExportReplayCycle,
        loadRemoteExportWriterConfig: async () => ({
          exportRoot: "/tmp/wealth-factory-stage-obsidian-export",
          configured: true,
          absolute: true,
          exists: true,
          directory: true,
          writable: true
        }),
        setRemoteWriterRootState: async () => ({
          exportRoot: "/tmp/wealth-factory-stage-obsidian-export",
          configured: true,
          absolute: true,
          exists: true,
          directory: true,
          writable: true
        }),
        loadRemoteExportDeliverySnapshot: async () => ({
          status: "delivered"
        }),
        fetchImpl: vi.fn()
      })
    ).resolves.toMatchObject({
      ok: true,
      result: {
        replayCycle: {
          ok: true,
          phase: "governance_and_package_replay_verified"
        }
      }
    });

    expect(runLiveHarnessExportReplayCycle).toHaveBeenCalledWith(expect.objectContaining({
      runId: "run-stage-replay-1",
      loadCandidateDeliverySnapshot: expect.any(Function)
    }));
  });
});
