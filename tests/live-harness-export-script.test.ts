import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

describe("live harness export proof script", () => {
  it("bootstraps a dashboard run and then reuses the live harness export helper on the isolated stage lane", () => {
    const script = readFileSync("scripts/prove-live-harness-export.mjs", "utf8");

    expect(script).toContain("postDashboardRunAndVerifyDurableBinding");
    expect(script).toContain("runLiveHarnessExportProof");
    expect(script).toContain("WF_STAGE_EXPORT_DELIVERY_MODE");
    expect(script).toContain("harness_export_deliveries");
    expect(script).toContain("secrets.secret_ref as current_secret_ref");
    expect(script).toContain("secrets.revoked_at is null");
    expect(script).toContain("wf-stage-api");
    expect(script).toContain("function getRemoteVerification()");
    expect(script).toContain("loadRemoteExportDeliverySnapshot");
    expect(script).toContain("loadRemoteExportWriterConfig");
    expect(script).toContain("buildRequiredDeliveryWriterPrecondition");
    expect(script).toContain("WF_OBSIDIAN_EXPORT_ROOT");
    expect(script).toContain("delivery_writer_preflight_failed");
    expect(script).toContain("dashboard_run_bootstrap_failed");
    expect(script).not.toContain("||\n                (typeof entry.secretRef === \"string\" ? entry.secretRef : \"\")");
  });

  it("forwards a bootstrapped run id into the export proof when --run is omitted", async () => {
    const postDashboardRunAndVerifyDurableBinding = vi.fn(async () => ({
      ok: true,
      runId: "fresh-stage-run-1",
      snapshot: null,
      verification: {
        ok: true,
        phase: "direct_public_reservation_verified",
        notes: []
      }
    }));
    const runLiveHarnessExportProof = vi.fn(async () => ({
      ok: true,
      phase: "governance_ready_package_blocked",
      notes: []
    }));

    // @ts-expect-error Runtime-loaded NodeNext helper is exercised directly in this test.
    const module = await import("../scripts/prove-live-harness-export.mjs");

    await expect(
      module.runLiveHarnessExportStageProof({
        args: {
          tenant: "22222222-2222-4222-8222-444444444444",
          user: "11111111-1111-4111-8111-333333333333",
          workflow: "44444444-4444-4444-8444-666666666666",
          "board-workflow": "wf_tax_strategy",
          "timeout-ms": "60000",
          "poll-interval-ms": "1000",
          "max-attempts": "45"
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
        postDashboardRunAndVerifyDurableBinding,
        runLiveHarnessExportProof,
        loadRemoteExportWriterConfig: async () => null
      })
    ).resolves.toMatchObject({
      ok: true,
      result: {
        durableResult: {
          ok: true,
          runId: "fresh-stage-run-1"
        },
        exportProof: {
          ok: true,
          phase: "governance_ready_package_blocked"
        }
      }
    });

    expect(postDashboardRunAndVerifyDurableBinding).toHaveBeenCalledTimes(1);
    expect(postDashboardRunAndVerifyDurableBinding).toHaveBeenCalledWith(
      expect.objectContaining({
        freshRun: true,
        workflowId: "44444444-4444-4444-8444-666666666666"
      })
    );
    expect(runLiveHarnessExportProof).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRunId: "fresh-stage-run-1",
        workflowId: "44444444-4444-4444-8444-666666666666",
        boardWorkflowId: "wf_tax_strategy"
      })
    );
  }, 15000);

  it("fails closed with an explicit fresh-harness-run conflict when a fresh export proof would otherwise reuse an existing native run", async () => {
    const postDashboardRunAndVerifyDurableBinding = vi.fn(async () => ({
      ok: false,
      error: {
        status: 409,
        body: { code: "conflict" }
      }
    }));
    const loadFreshRunConflictDetails = vi.fn(async () => ({
      ok: false,
      phase: "fresh_harness_run_conflict",
      existingRunId: "existing-run-123",
      mode: "existing_harness_run_conflicts_with_fresh_proof"
    }));
    const runLiveHarnessExportProof = vi.fn();

    // @ts-expect-error Runtime-loaded NodeNext helper is exercised directly in this test.
    const module = await import("../scripts/prove-live-harness-export.mjs");

    await expect(
      module.runLiveHarnessExportStageProof({
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
        postDashboardRunAndVerifyDurableBinding,
        loadFreshRunConflictDetails,
        runLiveHarnessExportProof
      })
    ).resolves.toMatchObject({
      ok: false,
      result: {
        exportProof: {
          ok: false,
          phase: "fresh_harness_run_conflict",
          existingRunId: "existing-run-123"
        }
      }
    });

    expect(loadFreshRunConflictDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "22222222-2222-4222-8222-444444444444",
        workflowId: "wf_tax_strategy"
      })
    );
    expect(runLiveHarnessExportProof).not.toHaveBeenCalled();
  });

  it("fails closed when replay recovery mode is requested without an explicit run id", async () => {
    const postDashboardRunAndVerifyDurableBinding = vi.fn(async () => ({
      ok: true,
      runId: "fresh-stage-run-replay-1",
      snapshot: null,
      verification: {
        ok: true,
        phase: "direct_public_reservation_verified",
        notes: []
      }
    }));
    const runLiveHarnessExportProof = vi.fn(async () => ({
      ok: true,
      phase: "governance_and_package_export_verified",
      notes: []
    }));

    // @ts-expect-error Runtime-loaded NodeNext helper is exercised directly in this test.
    const module = await import("../scripts/prove-live-harness-export.mjs");

    await expect(
      module.runLiveHarnessExportStageProof({
        args: {
          tenant: "22222222-2222-4222-8222-444444444444",
          user: "11111111-1111-4111-8111-333333333333",
          workflow: "44444444-4444-4444-8444-666666666666",
          "board-workflow": "wf_tax_strategy",
          mode: "replay"
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
          sessionToken: "session-replay-mode-1"
        }),
        postDashboardRunAndVerifyDurableBinding,
        runLiveHarnessExportProof,
        loadRemoteExportWriterConfig: async () => null
      })
    ).resolves.toMatchObject({
      ok: false,
      result: {
        exportProof: {
          ok: false,
          phase: "replay_mode_requires_explicit_run"
        }
      }
    });

    expect(postDashboardRunAndVerifyDurableBinding).not.toHaveBeenCalled();
    expect(runLiveHarnessExportProof).not.toHaveBeenCalled();
  });

  it("forwards replay recovery mode into the export proof when an explicit run is targeted", async () => {
    const postDashboardRunAndVerifyDurableBinding = vi.fn();
    const runLiveHarnessExportProof = vi.fn(async () => ({
      ok: true,
      phase: "governance_and_package_export_verified",
      notes: []
    }));

    // @ts-expect-error Runtime-loaded NodeNext helper is exercised directly in this test.
    const module = await import("../scripts/prove-live-harness-export.mjs");

    await expect(
      module.runLiveHarnessExportStageProof({
        args: {
          tenant: "22222222-2222-4222-8222-444444444444",
          user: "11111111-1111-4111-8111-333333333333",
          workflow: "44444444-4444-4444-8444-666666666666",
          "board-workflow": "wf_tax_strategy",
          run: "existing-stage-run-replay-1",
          mode: "replay"
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
          sessionToken: "session-replay-mode-2"
        }),
        postDashboardRunAndVerifyDurableBinding,
        runLiveHarnessExportProof,
        loadRemoteExportWriterConfig: async () => null
      })
    ).resolves.toMatchObject({
      ok: true,
      result: {
        durableResult: {
          ok: true,
          runId: "existing-stage-run-replay-1"
        },
        exportProof: {
          ok: true,
          phase: "governance_and_package_export_verified"
        }
      }
    });

    expect(postDashboardRunAndVerifyDurableBinding).not.toHaveBeenCalled();
    expect(runLiveHarnessExportProof).toHaveBeenCalledWith(expect.objectContaining({
      expectedRunId: "existing-stage-run-replay-1",
      recoveryMode: "replay"
    }));
  });
});
