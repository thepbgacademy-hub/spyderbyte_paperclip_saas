import { createRequire } from "node:module";

import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  runLiveHarnessExportProof,
  waitForClosedBoardExportBoard,
  waitForExportDelivery
} = require("../scripts/lib/live-harness-export-proof.mjs") as {
  runLiveHarnessExportProof(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  waitForClosedBoardExportBoard(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  waitForExportDelivery(input: Record<string, unknown>): Promise<Record<string, unknown>>;
};

describe("live harness export proof helper", () => {
  it("verifies governance export readiness and keeps package export blocked until governance delivery completes", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(buildBoard({
        runId: "run-export-1",
        governanceLatestDelivery: null,
        packageLatestDelivery: null
      })))
      .mockResolvedValueOnce(jsonResponse({
        candidateId: "governance_history_export",
        status: "ready"
      }))
      .mockResolvedValueOnce(jsonResponse({
        candidateId: "governance_history_export",
        status: "export_ready",
        summary: "Governance history export is ready as a tenant-safe Obsidian markdown bundle."
      }))
      .mockResolvedValueOnce(jsonResponse(buildBoard({
        runId: "run-export-1",
        governanceLatestDelivery: {
          status: "export_ready",
          summary: "The governance history bundle is export-ready and waiting for bounded delivery through the configured tenant-safe writer seam."
        },
        packageLatestDelivery: null
      })))
      .mockResolvedValueOnce(jsonResponse({
        candidateId: "package_bundle_export",
        status: "ready"
      }))
      .mockResolvedValueOnce({
        status: 409,
        json: async () => ({
          code: "stale_contract",
          message: "Harness package bundle export is not available until governance history delivery completes for the current bundle"
        })
      });

    const loadDeliverySnapshot = vi.fn().mockResolvedValue({
      status: "export_ready",
      candidateId: "governance_history_export",
      idempotencyKey: "gov-key-1"
    });

    await expect(
      runLiveHarnessExportProof({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-1",
        workflowId: "wf_tax_strategy",
        expectedRunId: "run-export-1",
        fetchImpl,
        loadDeliverySnapshot
      })
    ).resolves.toMatchObject({
      ok: true,
      phase: "governance_ready_package_blocked",
      governanceDelivery: {
        deliveryStatus: "export_ready"
      },
      packageExport: {
        response: {
          status: 409
        }
      }
    });

    expect(loadDeliverySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      runId: "run-export-1",
      candidateId: "governance_history_export"
    }));
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://wf-api.spyderbyte.cloud/api/harness/runs/run-export-1/export-candidates/governance_history_export/preflight",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          actionHandle: "governance_history_export-preflight-handle"
        })
      })
    );
  });

  it("continues into package export once governance delivery is marked delivered", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(buildBoard({
        runId: "run-export-2",
        governanceLatestDelivery: null,
        packageLatestDelivery: null
      })))
      .mockResolvedValueOnce(jsonResponse({ candidateId: "governance_history_export", status: "ready" }))
      .mockResolvedValueOnce(jsonResponse({ candidateId: "governance_history_export", status: "export_ready" }))
      .mockResolvedValueOnce(jsonResponse(buildBoard({
        runId: "run-export-2",
        governanceLatestDelivery: {
          status: "delivered",
          summary: "The latest tenant-safe export bundle was delivered through the bounded private writer seam."
        },
        packageLatestDelivery: null
      })))
      .mockResolvedValueOnce(jsonResponse({ candidateId: "package_bundle_export", status: "ready" }))
      .mockResolvedValueOnce(jsonResponse({ candidateId: "package_bundle_export", status: "export_ready" }))
      .mockResolvedValueOnce(jsonResponse(buildBoard({
        runId: "run-export-2",
        governanceLatestDelivery: {
          status: "delivered",
          summary: "The latest tenant-safe export bundle was delivered through the bounded private writer seam."
        },
        packageLatestDelivery: {
          status: "delivered",
          summary: "The latest tenant-safe export bundle was delivered through the bounded private writer seam."
        }
      })));

    const loadDeliverySnapshot = vi.fn()
      .mockResolvedValueOnce({
        status: "delivered",
        candidateId: "governance_history_export",
        deliveryReceipt: {
          primaryNotePath: "wealth-factory/governance-history/export.md",
          writtenFileCount: 2
        }
      })
      .mockResolvedValueOnce({
        status: "delivered",
        candidateId: "package_bundle_export",
        deliveryReceipt: {
          primaryNotePath: "wealth-factory/package-bundles/export.md",
          writtenFileCount: 2
        }
      });

    await expect(
      runLiveHarnessExportProof({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-2",
        workflowId: "wf_tax_strategy",
        expectedRunId: "run-export-2",
        fetchImpl,
        loadDeliverySnapshot,
        deliveryMode: "required"
      })
    ).resolves.toMatchObject({
      ok: true,
      phase: "governance_and_package_export_verified",
      governanceDelivery: {
        deliveryStatus: "delivered"
      },
      packageDelivery: {
        deliveryStatus: "delivered"
      }
    });
  });

  it("accepts governance-history replay recovery once the durable seam reports delivery_replayed", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(buildBoard({
        runId: "run-export-replay-governance-1",
        governanceLatestDelivery: null,
        packageLatestDelivery: null
      })))
      .mockResolvedValueOnce(jsonResponse(buildBoard({
        runId: "run-export-replay-governance-1",
        governanceLatestDelivery: {
          status: "export_ready",
          summary: "The governance history bundle is export-ready and waiting for bounded delivery through the configured tenant-safe writer seam."
        },
        packageLatestDelivery: null
      })));
    const loadDeliverySnapshot = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        status: "delivery_replayed",
        candidateId: "governance_history_export",
        idempotencyKey: "gov-replay-key-1"
      });
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForExportDelivery({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-replay-governance-1",
        workflowId: "wf_tax_strategy",
        expectedRunId: "run-export-replay-governance-1",
        candidateId: "governance_history_export",
        fetchImpl,
        loadDeliverySnapshot,
        sleepImpl,
        maxAttempts: 2,
        pollIntervalMs: 5
      })
    ).resolves.toMatchObject({
      ok: true,
      phase: "delivery_delivery_replayed",
      candidateId: "governance_history_export",
      deliveryStatus: "delivery_replayed",
      board: {
        runId: "run-export-replay-governance-1",
        boardState: "closed"
      }
    });

    expect(loadDeliverySnapshot).toHaveBeenNthCalledWith(2, expect.objectContaining({
      runId: "run-export-replay-governance-1",
      candidateId: "governance_history_export"
    }));
    expect(sleepImpl).toHaveBeenCalledTimes(1);
  });

  it("treats governance replay recovery as satisfying package replay acceptance when both deliveries settle on delivery_replayed", async () => {
    const initialReplayBoard = buildBoard({
      runId: "run-export-replay-package-1",
      governanceLatestDelivery: {
        status: "delivery_failed",
        summary: "The governance history delivery last failed and can be replayed safely."
      },
      packageLatestDelivery: null
    });
    const governanceReplayCandidate = initialReplayBoard.memoryBoundary.exportCandidates.find((candidate) => candidate.id === "governance_history_export");
    if (!governanceReplayCandidate) {
      throw new Error("Expected governance export candidate to exist for governance replay recovery.");
    }
    governanceReplayCandidate.exportActions = [
      governanceReplayCandidate.exportActions[0]!,
      {
        actionRoute: "governance-history-export-replay",
        actionPath: "/api/harness/runs/run-export-replay-package-1/export-candidates/governance_history_export/delivery-replay",
        actionHandle: "governance_history_export-replay-handle"
      }
    ];
    const boardAfterGovernanceReplay = buildBoard({
      runId: "run-export-replay-package-1",
      governanceLatestDelivery: {
        status: "delivery_replayed",
        summary: "Governance history delivery replay has been re-queued through the bounded tenant-safe writer seam."
      },
      packageLatestDelivery: {
        status: "delivery_failed",
        summary: "The package bundle delivery last failed and can be replayed safely."
      }
    });
    const governanceReplayAfterCandidate = boardAfterGovernanceReplay.memoryBoundary.exportCandidates.find((candidate) => candidate.id === "governance_history_export");
    if (!governanceReplayAfterCandidate) {
      throw new Error("Expected governance export candidate to exist after governance replay recovery.");
    }
    governanceReplayAfterCandidate.exportActions = [
      governanceReplayAfterCandidate.exportActions[0]!,
      {
        actionRoute: "governance-history-export-replay",
        actionPath: "/api/harness/runs/run-export-replay-package-1/export-candidates/governance_history_export/delivery-replay",
        actionHandle: "governance_history_export-replay-handle"
      }
    ];
    const packageCandidate = boardAfterGovernanceReplay.memoryBoundary.exportCandidates.find((candidate) => candidate.id === "package_bundle_export");
    if (!packageCandidate) {
      throw new Error("Expected package export candidate to exist for package replay recovery.");
    }
    packageCandidate.exportActions = [
      packageCandidate.exportActions[0]!,
      {
        actionRoute: "package-bundle-export-replay",
        actionPath: "/api/harness/runs/run-export-replay-package-1/export-candidates/package_bundle_export/delivery-replay",
        actionHandle: "package_bundle_export-replay-handle"
      }
    ];

    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(initialReplayBoard))
      .mockResolvedValueOnce(jsonResponse({ candidateId: "governance_history_export", status: "ready" }))
      .mockResolvedValueOnce(jsonResponse({
        candidateId: "governance_history_export",
        status: "delivery_replayed",
        summary: "Governance history delivery replay has been re-queued through the bounded tenant-safe writer seam."
      }))
      .mockResolvedValueOnce(jsonResponse(boardAfterGovernanceReplay))
      .mockResolvedValueOnce(jsonResponse({
        candidateId: "package_bundle_export",
        status: "ready",
        supportsReplay: true
      }))
      .mockResolvedValueOnce(jsonResponse({
        candidateId: "package_bundle_export",
        status: "delivery_replayed",
        summary: "Package bundle delivery replay has been re-queued through the bounded tenant-safe writer seam."
      }))
      .mockResolvedValueOnce(jsonResponse(buildBoard({
        runId: "run-export-replay-package-1",
        governanceLatestDelivery: {
          status: "delivery_replayed",
          summary: "Governance history delivery replay has been re-queued through the bounded tenant-safe writer seam."
        },
        packageLatestDelivery: {
          status: "delivery_replayed",
          summary: "Package bundle delivery replay has been re-queued through the bounded tenant-safe writer seam."
        }
      })));

    const loadDeliverySnapshot = vi.fn()
      .mockResolvedValueOnce({
        status: "delivery_replayed",
        candidateId: "governance_history_export",
        idempotencyKey: "gov-replay-key-2"
      })
      .mockResolvedValueOnce({
        status: "delivery_replayed",
        candidateId: "package_bundle_export",
        idempotencyKey: "package-replay-key-2"
      });

    await expect(
      runLiveHarnessExportProof({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-replay-package-1",
        workflowId: "wf_tax_strategy",
        expectedRunId: "run-export-replay-package-1",
        fetchImpl,
        loadDeliverySnapshot,
        recoveryMode: "replay"
      })
    ).resolves.toMatchObject({
      ok: true,
      phase: "governance_and_package_export_verified",
      governanceDelivery: {
        deliveryStatus: "delivery_replayed"
      },
      packageDelivery: {
        deliveryStatus: "delivery_replayed"
      }
    });
  });

  it("fails closed in replay recovery mode when a stale package bundle withholds the bounded replay action", async () => {
    const initialReplayBoard = buildBoard({
      runId: "run-export-replay-stale-package-1",
      governanceLatestDelivery: {
        status: "delivery_failed",
        summary: "The governance history delivery last failed and can be replayed safely."
      },
      packageLatestDelivery: null
    });
    const governanceReplayCandidate = initialReplayBoard.memoryBoundary.exportCandidates.find((candidate) => candidate.id === "governance_history_export");
    if (!governanceReplayCandidate) {
      throw new Error("Expected governance export candidate to exist for stale governance replay recovery.");
    }
    governanceReplayCandidate.exportActions = [
      governanceReplayCandidate.exportActions[0]!,
      {
        actionRoute: "governance-history-export-replay",
        actionPath: "/api/harness/runs/run-export-replay-stale-package-1/export-candidates/governance_history_export/delivery-replay",
        actionHandle: "governance_history_export-replay-handle"
      }
    ];
    const boardAfterGovernanceReplay = buildBoard({
      runId: "run-export-replay-stale-package-1",
      governanceLatestDelivery: {
        status: "delivery_replayed",
        summary: "Governance history delivery replay has been re-queued through the bounded tenant-safe writer seam."
      },
      packageLatestDelivery: {
        status: "delivery_failed",
        summary: "The stored package bundle no longer matches the current export contract."
      }
    });
    const governanceReplayAfterCandidate = boardAfterGovernanceReplay.memoryBoundary.exportCandidates.find((candidate) => candidate.id === "governance_history_export");
    if (!governanceReplayAfterCandidate) {
      throw new Error("Expected governance export candidate to exist after stale governance replay recovery.");
    }
    governanceReplayAfterCandidate.exportActions = [
      governanceReplayAfterCandidate.exportActions[0]!,
      {
        actionRoute: "governance-history-export-replay",
        actionPath: "/api/harness/runs/run-export-replay-stale-package-1/export-candidates/governance_history_export/delivery-replay",
        actionHandle: "governance_history_export-replay-handle"
      }
    ];
    const packageCandidate = boardAfterGovernanceReplay.memoryBoundary.exportCandidates.find((candidate) => candidate.id === "package_bundle_export");
    if (!packageCandidate) {
      throw new Error("Expected package export candidate to exist for stale replay recovery.");
    }
    packageCandidate.latestDelivery = {
      ...packageCandidate.latestDelivery,
      contractFreshness: "stale_bundle",
      contractFreshnessSummary: "The stored delivery bundle no longer matches the current export contract. Build a fresh export bundle before replaying delivery."
    };
    packageCandidate.exportActions = packageCandidate.exportActions.filter((action) => action.actionRoute !== "package-bundle-export");

    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(initialReplayBoard))
      .mockResolvedValueOnce(jsonResponse({ candidateId: "governance_history_export", status: "ready" }))
      .mockResolvedValueOnce(jsonResponse({
        candidateId: "governance_history_export",
        status: "delivery_replayed",
        summary: "Governance history delivery replay has been re-queued through the bounded tenant-safe writer seam."
      }))
      .mockResolvedValueOnce(jsonResponse(boardAfterGovernanceReplay))
      .mockResolvedValueOnce(jsonResponse({
        candidateId: "package_bundle_export",
        status: "blocked",
        supportsReplay: false,
        blockerLabel: "Build a fresh export bundle before replaying delivery."
      }));

    const loadDeliverySnapshot = vi.fn().mockResolvedValue({
      status: "delivery_replayed",
      candidateId: "governance_history_export",
      idempotencyKey: "gov-replay-key-3"
    });

    await expect(
      runLiveHarnessExportProof({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-replay-stale-package-1",
        workflowId: "wf_tax_strategy",
        expectedRunId: "run-export-replay-stale-package-1",
        fetchImpl,
        loadDeliverySnapshot,
        recoveryMode: "replay"
      })
    ).resolves.toMatchObject({
      ok: false,
      phase: "package_replay_contract_missing",
      governanceDelivery: {
        deliveryStatus: "delivery_replayed"
      },
      packagePreflight: {
        body: {
          blockerLabel: "Build a fresh export bundle before replaying delivery."
        }
      }
    });
  });

  it("treats a withheld package-bundle export action as a truthful blocked dependency when governance delivery is only export-ready", async () => {
    const boardAfterGovernance = buildBoard({
      runId: "run-export-withheld-package-1",
      governanceLatestDelivery: {
        status: "export_ready",
        summary: "The governance history bundle is export-ready and waiting for bounded delivery through the configured tenant-safe writer seam."
      },
      packageLatestDelivery: null
    });
    const packageCandidate = boardAfterGovernance.memoryBoundary.exportCandidates.find((candidate) => candidate.id === "package_bundle_export");
    if (!packageCandidate) {
      throw new Error("Expected package export candidate to exist.");
    }
    packageCandidate.exportActions = packageCandidate.exportActions.filter((action) => action.actionRoute !== "package-bundle-export");

    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(buildBoard({
        runId: "run-export-withheld-package-1",
        governanceLatestDelivery: null,
        packageLatestDelivery: null
      })))
      .mockResolvedValueOnce(jsonResponse({
        candidateId: "governance_history_export",
        status: "ready"
      }))
      .mockResolvedValueOnce(jsonResponse({
        candidateId: "governance_history_export",
        status: "export_ready",
        summary: "Governance history export is ready as a tenant-safe Obsidian markdown bundle."
      }))
      .mockResolvedValueOnce(jsonResponse(boardAfterGovernance))
      .mockResolvedValueOnce(jsonResponse({
        candidateId: "package_bundle_export",
        status: "blocked",
        supportsExport: false,
        blockerLabel: "Governance history delivery must complete first"
      }));

    const loadDeliverySnapshot = vi.fn().mockResolvedValue({
      status: "export_ready",
      candidateId: "governance_history_export",
      idempotencyKey: "gov-key-withheld-1"
    });

    await expect(
      runLiveHarnessExportProof({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-withheld-package-1",
        workflowId: "wf_tax_strategy",
        expectedRunId: "run-export-withheld-package-1",
        fetchImpl,
        loadDeliverySnapshot
      })
    ).resolves.toMatchObject({
      ok: true,
      phase: "governance_ready_package_blocked",
      governanceDelivery: {
        deliveryStatus: "export_ready"
      },
      packagePreflight: {
        response: {
          status: 200
        }
      }
    });
  });

  it("fails closed when the board export response leaks private runtime metadata", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(buildBoard({
        runId: "run-export-3",
        governanceLatestDelivery: null,
        packageLatestDelivery: null
      })))
      .mockResolvedValueOnce(jsonResponse({ candidateId: "governance_history_export", status: "ready" }))
      .mockResolvedValueOnce(jsonResponse({
        candidateId: "governance_history_export",
        status: "export_ready",
        providerContext: [{ secretRef: "wf_secret_demo" }]
      }));

    await expect(
      runLiveHarnessExportProof({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-3",
        workflowId: "wf_tax_strategy",
        expectedRunId: "run-export-3",
        fetchImpl
      })
    ).resolves.toMatchObject({
      ok: false,
      phase: "governance_export_leaked_private_data"
    });
  });

  it("fails closed without posting credentials when the board returns an off-origin export action path", async () => {
    const board = buildBoard({
      runId: "run-export-off-origin-1",
      governanceLatestDelivery: null,
      packageLatestDelivery: null
    });
    const governanceCandidate = board.memoryBoundary.exportCandidates[0];
    const firstAction = governanceCandidate?.exportActions[0];
    expect(governanceCandidate).toBeDefined();
    expect(firstAction).toBeDefined();
    if (!firstAction) {
      throw new Error("Expected governance export action to exist for the off-origin proof case.");
    }
    firstAction.actionPath = "https://evil.example/export";

    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(board));

    await expect(
      runLiveHarnessExportProof({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-off-origin-1",
        workflowId: "wf_tax_strategy",
        expectedRunId: "run-export-off-origin-1",
        fetchImpl
      })
    ).resolves.toMatchObject({
      ok: false,
      phase: "governance_preflight_failed",
      governancePreflight: {
        response: {
          status: 0
        }
      }
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails closed when governance delivery reaches a terminal failure state", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(buildBoard({
        runId: "run-export-5",
        governanceLatestDelivery: null,
        packageLatestDelivery: null
      })))
      .mockResolvedValueOnce(jsonResponse({ candidateId: "governance_history_export", status: "ready" }))
      .mockResolvedValueOnce(jsonResponse({ candidateId: "governance_history_export", status: "export_ready" }))
      .mockResolvedValueOnce(jsonResponse(buildBoard({
        runId: "run-export-5",
        governanceLatestDelivery: {
          status: "delivery_failed",
          summary: "The last governance history delivery attempt failed inside the bounded tenant-safe writer seam."
        },
        packageLatestDelivery: null
      })));
    const loadDeliverySnapshot = vi.fn().mockResolvedValue({
      status: "delivery_failed",
      candidateId: "governance_history_export",
      lastErrorCode: "writer_failed"
    });

    await expect(
      runLiveHarnessExportProof({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-5",
        workflowId: "wf_tax_strategy",
        expectedRunId: "run-export-5",
        fetchImpl,
        loadDeliverySnapshot
      })
    ).resolves.toMatchObject({
      ok: false,
      phase: "governance_delivery_failed"
    });
  });

  it("returns the same structured known-skip envelope from the top-level proof when the expected run is blocked on await_unblock", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(buildBoard({
      runId: "run-export-skip-1",
      boardState: "open",
      governanceLatestDelivery: null,
      packageLatestDelivery: null,
      pendingAttention: {
        kind: "await_unblock",
        reasonLabel: "Governance hold",
        summary: "Operator must explicitly unblock the CFO lane before export is possible."
      }
    })));

    await expect(
      runLiveHarnessExportProof({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-skip-1",
        workflowId: "wf_tax_strategy",
        expectedRunId: "run-export-skip-1",
        fetchImpl
      })
    ).resolves.toMatchObject({
      ok: true,
      skipped: true,
      phase: "closed_board_export_precondition_unmet",
      precondition: {
        kind: "await_unblock"
      },
      board: {
        runId: "run-export-skip-1"
      }
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns the same structured known-skip envelope from the top-level proof when the expected run is waiting on await_lane_resume", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(buildBoard({
      runId: "run-export-skip-resume-1",
      boardState: "open",
      governanceLatestDelivery: null,
      packageLatestDelivery: null,
      pendingAttention: {
        kind: "await_lane_resume",
        reasonLabel: "Waiting on lane resume",
        summary: "Founder tax posture data is still missing, so the CFO lane needs an explicit resume action."
      }
    })));

    await expect(
      runLiveHarnessExportProof({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-skip-resume-1",
        workflowId: "wf_tax_strategy",
        expectedRunId: "run-export-skip-resume-1",
        fetchImpl
      })
    ).resolves.toMatchObject({
      ok: true,
      skipped: true,
      phase: "closed_board_export_precondition_unmet",
      precondition: {
        kind: "await_lane_resume"
      },
      board: {
        runId: "run-export-skip-resume-1"
      }
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails closed on explicit board-load transport failures instead of timing out", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({
      status: 500,
      json: async () => {
        throw new Error("not json");
      }
    });
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForClosedBoardExportBoard({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-load-fail-1",
        workflowId: "wf_tax_strategy",
        expectedRunId: "run-export-load-fail-1",
        fetchImpl,
        sleepImpl,
        maxAttempts: 2,
        pollIntervalMs: 5
      })
    ).resolves.toMatchObject({
      ok: false,
      phase: "board_load_failed",
      board: null,
      response: {
        status: 500
      }
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleepImpl).not.toHaveBeenCalled();
  });

  it("waits for the expected run to expose closed-board export candidates", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ runId: "older-run", memoryBoundary: { exportCandidates: [] } }))
      .mockResolvedValueOnce(jsonResponse(buildBoard({
        runId: "run-export-4",
        governanceLatestDelivery: null,
        packageLatestDelivery: null
      })));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForClosedBoardExportBoard({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-4",
        workflowId: "wf_tax_strategy",
        expectedRunId: "run-export-4",
        fetchImpl,
        sleepImpl,
        maxAttempts: 2,
        pollIntervalMs: 5
      })
    ).resolves.toMatchObject({
      ok: true,
      phase: "closed_board_export_candidates_ready",
      board: {
        runId: "run-export-4"
      }
    });

    expect(sleepImpl).toHaveBeenCalledWith(5);
  });

  it("does not treat an open board with a completion package as a closed-board export contract", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(buildBoard({
        runId: "run-export-6",
        boardState: "open",
        governanceLatestDelivery: null,
        packageLatestDelivery: null
      })))
      .mockResolvedValueOnce(jsonResponse(buildBoard({
        runId: "run-export-6",
        boardState: "closed",
        governanceLatestDelivery: null,
        packageLatestDelivery: null
      })));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForClosedBoardExportBoard({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-6",
        workflowId: "wf_tax_strategy",
        expectedRunId: "run-export-6",
        fetchImpl,
        sleepImpl,
        maxAttempts: 2,
        pollIntervalMs: 5
      })
    ).resolves.toMatchObject({
      ok: true,
      phase: "closed_board_export_candidates_ready",
      board: {
        runId: "run-export-6",
        boardState: "closed"
      }
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleepImpl).toHaveBeenCalledWith(5);
  });

  it("returns a structured known-skip when the expected run is blocked on await_unblock instead of timing out for export candidates", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(buildBoard({
      runId: "run-export-8",
      boardState: "open",
      governanceLatestDelivery: null,
      packageLatestDelivery: null,
      pendingAttention: {
        kind: "await_unblock",
        reasonLabel: "Governance hold",
        summary: "Operator must explicitly unblock the CFO lane before export is possible."
      }
    })));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForClosedBoardExportBoard({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-8",
        workflowId: "wf_tax_strategy",
        expectedRunId: "run-export-8",
        fetchImpl,
        sleepImpl,
        maxAttempts: 2,
        pollIntervalMs: 5
      })
    ).resolves.toMatchObject({
      ok: true,
      skipped: true,
      phase: "closed_board_export_precondition_unmet",
      precondition: {
        kind: "await_unblock"
      },
      board: {
        runId: "run-export-8"
      }
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleepImpl).not.toHaveBeenCalled();
  });

  it("returns a structured known-skip when the expected run is waiting on await_lane_resume instead of timing out for export candidates", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(buildBoard({
      runId: "run-export-9",
      boardState: "open",
      governanceLatestDelivery: null,
      packageLatestDelivery: null,
      pendingAttention: {
        kind: "await_lane_resume",
        reasonLabel: "Waiting on lane resume",
        summary: "Founder tax posture data is still missing, so the CFO lane needs an explicit resume action."
      }
    })));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForClosedBoardExportBoard({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-9",
        workflowId: "wf_tax_strategy",
        expectedRunId: "run-export-9",
        fetchImpl,
        sleepImpl,
        maxAttempts: 2,
        pollIntervalMs: 5
      })
    ).resolves.toMatchObject({
      ok: true,
      skipped: true,
      phase: "closed_board_export_precondition_unmet",
      precondition: {
        kind: "await_lane_resume"
      },
      board: {
        runId: "run-export-9"
      }
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleepImpl).not.toHaveBeenCalled();
  });

  it("resolves bounded final-assembly CEO review on the expected run before waiting for closed-board export candidates", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(buildBoard({
        runId: "run-export-final-assembly-1",
        boardState: "open",
        governanceLatestDelivery: null,
        packageLatestDelivery: null,
        pendingAttention: {
          kind: "queue_ceo_review",
          reasonLabel: "Final assembly",
          summary: "The CFO lane is done and the board is waiting on CEO final assembly review.",
          actionRoute: "review-attention",
          actionPath: "/api/harness/runs/run-export-final-assembly-1/review-attention",
          requestFields: [
            {
              name: "decision",
              allowedValues: ["complete_run", "start_fresh_cycle"]
            },
            {
              name: "completionSummary",
              requiredWhenValue: "complete_run"
            }
          ],
          actionOptions: [
            {
              value: "complete_run",
              exampleRequest: {
                decision: "complete_run"
              }
            }
          ]
        }
      })))
      .mockResolvedValueOnce(jsonResponse({
        status: "done",
        runId: "run-export-final-assembly-1"
      }))
      .mockResolvedValueOnce(jsonResponse(buildBoard({
        runId: "run-export-final-assembly-1",
        boardState: "closed",
        governanceLatestDelivery: null,
        packageLatestDelivery: null
      })));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForClosedBoardExportBoard({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-final-assembly-1",
        workflowId: "wf_tax_strategy",
        expectedRunId: "run-export-final-assembly-1",
        fetchImpl,
        sleepImpl,
        maxAttempts: 3,
        pollIntervalMs: 5
      })
    ).resolves.toMatchObject({
      ok: true,
      phase: "closed_board_export_candidates_ready",
      board: {
        runId: "run-export-final-assembly-1",
        boardState: "closed"
      }
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://wf-api.spyderbyte.cloud/api/harness/runs/run-export-final-assembly-1/review-attention",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          actionHandle: "attention-handle",
          decision: "complete_run",
          completionSummary: "The CEO accepted final assembly and closed this board cycle for export verification."
        })
      })
    );
    expect(sleepImpl).toHaveBeenCalledTimes(1);
    expect(sleepImpl).toHaveBeenCalledWith(5);
  });

  it("fails closed when final-assembly review exposes a same-origin action path for the wrong run", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(buildBoard({
      runId: "run-export-final-assembly-wrong-path-1",
      boardState: "open",
      governanceLatestDelivery: null,
      packageLatestDelivery: null,
      pendingAttention: {
        kind: "queue_ceo_review",
        reasonLabel: "Final assembly",
        summary: "The CFO lane is done and the board is waiting on CEO final assembly review.",
        actionRoute: "review-attention",
        actionPath: "/api/harness/runs/run-other/review-attention",
        requestFields: [
          {
            name: "decision",
            allowedValues: ["complete_run", "start_fresh_cycle"]
          }
        ],
        actionOptions: [
          {
            value: "complete_run",
            exampleRequest: {
              decision: "complete_run"
            }
          }
        ]
      }
    })));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForClosedBoardExportBoard({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-final-assembly-wrong-path-1",
        workflowId: "wf_tax_strategy",
        expectedRunId: "run-export-final-assembly-wrong-path-1",
        fetchImpl,
        sleepImpl,
        maxAttempts: 2,
        pollIntervalMs: 5
      })
    ).resolves.toMatchObject({
      ok: false,
      phase: "final_assembly_review_contract_invalid",
      board: {
        runId: "run-export-final-assembly-wrong-path-1"
      }
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleepImpl).not.toHaveBeenCalled();
  });

  it("fails closed when final-assembly review does not expose the bounded review-attention route", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(buildBoard({
      runId: "run-export-final-assembly-wrong-route-1",
      boardState: "open",
      governanceLatestDelivery: null,
      packageLatestDelivery: null,
      pendingAttention: {
        kind: "queue_ceo_review",
        reasonLabel: "Final assembly",
        summary: "The CFO lane is done and the board is waiting on CEO final assembly review.",
        actionRoute: "resolve-attention",
        actionPath: "/api/harness/runs/run-export-final-assembly-wrong-route-1/review-attention",
        requestFields: [
          {
            name: "decision",
            allowedValues: ["complete_run", "start_fresh_cycle"]
          }
        ]
      }
    })));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForClosedBoardExportBoard({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-final-assembly-wrong-route-1",
        workflowId: "wf_tax_strategy",
        expectedRunId: "run-export-final-assembly-wrong-route-1",
        fetchImpl,
        sleepImpl,
        maxAttempts: 2,
        pollIntervalMs: 5
      })
    ).resolves.toMatchObject({
      ok: false,
      phase: "final_assembly_review_contract_invalid",
      board: {
        runId: "run-export-final-assembly-wrong-route-1"
      }
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleepImpl).not.toHaveBeenCalled();
  });

  it("fails closed when final-assembly review omits bounded completion payload requirements", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(buildBoard({
      runId: "run-export-final-assembly-missing-payload-1",
      boardState: "open",
      governanceLatestDelivery: null,
      packageLatestDelivery: null,
      pendingAttention: {
        kind: "queue_ceo_review",
        reasonLabel: "Final assembly",
        summary: "The CFO lane is done and the board is waiting on CEO final assembly review.",
        actionRoute: "review-attention",
        actionPath: "/api/harness/runs/run-export-final-assembly-missing-payload-1/review-attention",
        actionHandle: "",
        requestFields: [
          {
            name: "decision",
            allowedValues: ["start_fresh_cycle"]
          }
        ]
      }
    })));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForClosedBoardExportBoard({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-final-assembly-missing-payload-1",
        workflowId: "wf_tax_strategy",
        expectedRunId: "run-export-final-assembly-missing-payload-1",
        fetchImpl,
        sleepImpl,
        maxAttempts: 2,
        pollIntervalMs: 5
      })
    ).resolves.toMatchObject({
      ok: false,
      phase: "final_assembly_review_contract_invalid",
      board: {
        runId: "run-export-final-assembly-missing-payload-1"
      }
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleepImpl).not.toHaveBeenCalled();
  });

  it("fails closed when final-assembly review does not expose the expected run id", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(buildBoard({
      runId: "",
      boardState: "open",
      governanceLatestDelivery: null,
      packageLatestDelivery: null,
      pendingAttention: {
        kind: "queue_ceo_review",
        reasonLabel: "Final assembly",
        summary: "The CFO lane is done and the board is waiting on CEO final assembly review.",
        actionRoute: "review-attention",
        actionPath: "/api/harness/runs/run-export-final-assembly-missing-run-1/review-attention",
        requestFields: [
          {
            name: "decision",
            allowedValues: ["complete_run", "start_fresh_cycle"]
          }
        ]
      }
    })));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForClosedBoardExportBoard({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-final-assembly-missing-run-1",
        workflowId: "wf_tax_strategy",
        expectedRunId: "",
        fetchImpl,
        sleepImpl,
        maxAttempts: 2,
        pollIntervalMs: 5
      })
    ).resolves.toMatchObject({
      ok: false,
      phase: "final_assembly_review_contract_invalid",
      board: {
        runId: ""
      }
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleepImpl).not.toHaveBeenCalled();
  });

  it("fails closed when the bounded final-assembly review POST returns a non-2xx response", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(buildBoard({
        runId: "run-export-final-assembly-post-fail-1",
        boardState: "open",
        governanceLatestDelivery: null,
        packageLatestDelivery: null,
        pendingAttention: {
          kind: "queue_ceo_review",
          reasonLabel: "Final assembly",
          summary: "The CFO lane is done and the board is waiting on CEO final assembly review.",
          actionRoute: "review-attention",
          actionPath: "/api/harness/runs/run-export-final-assembly-post-fail-1/review-attention",
          requestFields: [
            {
              name: "decision",
              allowedValues: ["complete_run", "start_fresh_cycle"]
            }
          ]
        }
      })))
      .mockResolvedValueOnce({
        status: 500,
        json: async () => ({
          code: "service_unavailable"
        })
      });
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForClosedBoardExportBoard({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-final-assembly-post-fail-1",
        workflowId: "wf_tax_strategy",
        expectedRunId: "run-export-final-assembly-post-fail-1",
        fetchImpl,
        sleepImpl,
        maxAttempts: 2,
        pollIntervalMs: 5
      })
    ).resolves.toMatchObject({
      ok: false,
      phase: "final_assembly_review_failed",
      board: {
        runId: "run-export-final-assembly-post-fail-1"
      },
      reviewAttention: {
        response: {
          status: 500
        }
      }
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleepImpl).not.toHaveBeenCalled();
  });

  it("keeps delivery polling pinned to the expected closed run instead of accepting a newer open board", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(buildBoard({
        runId: "run-export-7",
        boardState: "closed",
        governanceLatestDelivery: null,
        packageLatestDelivery: null
      })))
      .mockResolvedValueOnce(jsonResponse(buildBoard({
        runId: "run-other",
        boardState: "open",
        governanceLatestDelivery: {
          status: "delivered",
          summary: "Wrong run"
        },
        packageLatestDelivery: null
      })))
      .mockResolvedValueOnce(jsonResponse(buildBoard({
        runId: "run-export-7",
        boardState: "closed",
        governanceLatestDelivery: {
          status: "export_ready",
          summary: "Expected run"
        },
        packageLatestDelivery: null
      })));
    const loadDeliverySnapshot = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        status: "delivered"
      })
      .mockResolvedValueOnce({
        status: "export_ready"
      });
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForExportDelivery({
        baseUrl: "https://wf-api.spyderbyte.cloud",
        portalOrigin: "https://www.spyderbyte.cloud",
        sessionCookieName: "wf_portal_session",
        sessionToken: "session-7",
        workflowId: "wf_tax_strategy",
        expectedRunId: "run-export-7",
        candidateId: "governance_history_export",
        fetchImpl,
        loadDeliverySnapshot,
        sleepImpl,
        maxAttempts: 3,
        pollIntervalMs: 5
      })
    ).resolves.toMatchObject({
      ok: true,
      phase: "delivery_delivered",
      candidateId: "governance_history_export",
      board: {
        runId: "run-export-7",
        boardState: "closed"
      }
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(loadDeliverySnapshot).toHaveBeenCalledTimes(2);
    expect(loadDeliverySnapshot).toHaveBeenNthCalledWith(2, expect.objectContaining({
      runId: "run-export-7",
      candidateId: "governance_history_export"
    }));
    expect(sleepImpl).toHaveBeenCalledTimes(2);
  });
});

function buildBoard(input: {
  runId: string;
  boardState?: string;
  governanceLatestDelivery: null | Record<string, unknown>;
  packageLatestDelivery: null | Record<string, unknown>;
  pendingAttention?: {
    kind: string;
    reasonLabel?: string;
    summary?: string;
    actionHandle?: string;
    actionRoute?: string;
    actionPath?: string;
    requestFields?: Array<Record<string, unknown>>;
    actionOptions?: Array<Record<string, unknown>>;
  } | null;
}) {
  return {
    runId: input.runId,
    workflowId: "wf_tax_strategy",
    boardState: input.boardState ?? "closed",
    ...(input.pendingAttention
        ? {
          pendingAttention: {
            actionHandle: input.pendingAttention.actionHandle ?? "attention-handle",
            actionPath: input.pendingAttention.actionPath ?? `/api/harness/runs/${input.runId}/attention/resolve`,
            actionRoute: input.pendingAttention.actionRoute ?? "resolve-attention",
            allowedResolutions: ["unblock_lane"],
            ...(input.pendingAttention.requestFields
              ? { requestFields: input.pendingAttention.requestFields }
              : {}),
            ...(input.pendingAttention.actionOptions
              ? { actionOptions: input.pendingAttention.actionOptions }
              : {}),
            ...input.pendingAttention
          }
        }
      : {}),
    completionPackage: {
      summary: "Closed-board completion package"
    },
    memoryBoundary: {
      exportCandidates: [
        {
          id: "governance_history_export",
          latestDelivery: input.governanceLatestDelivery,
          exportActions: [
            {
              actionRoute: "export-preflight",
              actionPath: `/api/harness/runs/${input.runId}/export-candidates/governance_history_export/preflight`,
              actionHandle: "governance_history_export-preflight-handle"
            },
            {
              actionRoute: "governance-history-export",
              actionPath: `/api/harness/runs/${input.runId}/export-candidates/governance_history_export/export`,
              actionHandle: "governance_history_export-export-handle"
            }
          ]
        },
        {
          id: "package_bundle_export",
          latestDelivery: input.packageLatestDelivery,
          exportActions: [
            {
              actionRoute: "export-preflight",
              actionPath: `/api/harness/runs/${input.runId}/export-candidates/package_bundle_export/preflight`,
              actionHandle: "package_bundle_export-preflight-handle"
            },
            {
              actionRoute: "package-bundle-export",
              actionPath: `/api/harness/runs/${input.runId}/export-candidates/package_bundle_export/export`,
              actionHandle: "package_bundle_export-export-handle"
            }
          ]
        }
      ]
    }
  };
}

function jsonResponse(body: unknown) {
  return {
    status: 200,
    json: async () => body
  };
}
