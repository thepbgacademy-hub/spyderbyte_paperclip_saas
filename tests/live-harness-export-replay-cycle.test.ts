import { describe, expect, it, vi } from "vitest";

import { runLiveHarnessExportReplayCycle } from "../scripts/lib/live-harness-export-replay-cycle.mjs";

describe("live harness export replay cycle", () => {
  it("induces governance and package delivery failures, restores the writer root, and replays both deliveries on the same run", async () => {
    const loadWriterConfig = vi.fn()
      .mockResolvedValueOnce({
        exportRoot: "/tmp/wealth-factory-stage-obsidian-export",
        configured: true,
        absolute: true,
        exists: true,
        directory: true,
        writable: true
      });
    const setWriterRootState = vi.fn()
      .mockResolvedValueOnce({
        exportRoot: "/tmp/wealth-factory-stage-obsidian-export.replay-proof-blocker",
        configured: true,
        absolute: true,
        exists: true,
        directory: false,
        writable: false
      })
      .mockResolvedValueOnce({
        exportRoot: "/tmp/wealth-factory-stage-obsidian-export",
        configured: true,
        absolute: true,
        exists: true,
        directory: true,
        writable: true
      })
      .mockResolvedValueOnce({
        exportRoot: "/tmp/wealth-factory-stage-obsidian-export.replay-proof-blocker",
        configured: true,
        absolute: true,
        exists: true,
        directory: false,
        writable: false
      })
      .mockResolvedValueOnce({
        exportRoot: "/tmp/wealth-factory-stage-obsidian-export",
        configured: true,
        absolute: true,
        exists: true,
        directory: true,
        writable: true
      });
    const loadClosedBoardCandidate = vi.fn()
      .mockResolvedValueOnce(candidateState({
        runId: "run-stage-replay-1",
        candidateId: "governance_history_export",
        actions: ["export-preflight", "governance-history-export"]
      }))
      .mockResolvedValueOnce(candidateState({
        runId: "run-stage-replay-1",
        candidateId: "package_bundle_export",
        actions: ["export-preflight", "package-bundle-export"]
      }))
      .mockResolvedValueOnce(candidateState({
        runId: "run-stage-replay-1",
        candidateId: "governance_history_export",
        actions: ["export-preflight", "governance-history-export-replay"]
      }))
      .mockResolvedValueOnce(candidateState({
        runId: "run-stage-replay-1",
        candidateId: "package_bundle_export",
        actions: ["export-preflight", "package-bundle-export"]
      }))
      .mockResolvedValueOnce(candidateState({
        runId: "run-stage-replay-1",
        candidateId: "package_bundle_export",
        actions: ["export-preflight", "package-bundle-export-replay"]
      }));
    const postCandidateAction = vi.fn()
      .mockResolvedValueOnce({ status: 200, body: { status: "ready" } })
      .mockResolvedValueOnce({ status: 200, body: { status: "export_ready" } })
      .mockResolvedValueOnce({ status: 200, body: { status: "delivery_replayed" } })
      .mockResolvedValueOnce({ status: 200, body: { status: "ready" } })
      .mockResolvedValueOnce({ status: 200, body: { status: "export_ready" } })
      .mockResolvedValueOnce({ status: 200, body: { status: "delivery_replayed" } });
    const waitForCandidateDeliveryStatus = vi.fn()
      .mockResolvedValueOnce({
        candidateId: "governance_history_export",
        deliveryStatus: "delivery_failed"
      })
      .mockResolvedValueOnce({
        candidateId: "governance_history_export",
        deliveryStatus: "delivered"
      })
      .mockResolvedValueOnce({
        candidateId: "package_bundle_export",
        deliveryStatus: "delivery_failed"
      })
      .mockResolvedValueOnce({
        candidateId: "package_bundle_export",
        deliveryStatus: "delivered"
      });

    await expect(
      runLiveHarnessExportReplayCycle({
        runId: "run-stage-replay-1",
        loadWriterConfig,
        setWriterRootState,
        loadClosedBoardCandidate,
        postCandidateAction,
        waitForCandidateDeliveryStatus
      })
    ).resolves.toMatchObject({
      ok: true,
      phase: "governance_and_package_replay_verified",
      writerRoot: {
        original: "/tmp/wealth-factory-stage-obsidian-export",
        failure: "/tmp/wealth-factory-stage-obsidian-export.replay-proof-blocker"
      },
      governanceFailure: {
        deliveryStatus: "delivery_failed"
      },
      governanceReplay: {
        deliveryStatus: "delivered"
      },
      packageFailure: {
        deliveryStatus: "delivery_failed"
      },
      packageReplay: {
        deliveryStatus: "delivered"
      }
    });

    expect(setWriterRootState).toHaveBeenNthCalledWith(1, expect.objectContaining({
      mode: "broken",
      writerRoot: "/tmp/wealth-factory-stage-obsidian-export.replay-proof-blocker"
    }));
    expect(setWriterRootState).toHaveBeenNthCalledWith(2, expect.objectContaining({
      mode: "healthy",
      writerRoot: "/tmp/wealth-factory-stage-obsidian-export"
    }));
    expect(setWriterRootState).toHaveBeenNthCalledWith(3, expect.objectContaining({
      mode: "broken",
      writerRoot: "/tmp/wealth-factory-stage-obsidian-export.replay-proof-blocker"
    }));
    expect(setWriterRootState).toHaveBeenNthCalledWith(4, expect.objectContaining({
      mode: "healthy",
      writerRoot: "/tmp/wealth-factory-stage-obsidian-export"
    }));
    expect(waitForCandidateDeliveryStatus).toHaveBeenNthCalledWith(1, {
      candidateId: "governance_history_export",
      acceptedStatuses: ["delivery_failed"]
    });
    expect(waitForCandidateDeliveryStatus).toHaveBeenNthCalledWith(2, {
      candidateId: "governance_history_export",
      acceptedStatuses: ["delivered"]
    });
    expect(waitForCandidateDeliveryStatus).toHaveBeenNthCalledWith(3, {
      candidateId: "package_bundle_export",
      acceptedStatuses: ["delivery_failed"]
    });
    expect(waitForCandidateDeliveryStatus).toHaveBeenNthCalledWith(4, {
      candidateId: "package_bundle_export",
      acceptedStatuses: ["delivered"]
    });
  });

  it("restores the original writer root before returning a failure", async () => {
    const setWriterRootState = vi.fn()
      .mockResolvedValueOnce({
        exportRoot: "/tmp/wealth-factory-stage-obsidian-export.replay-proof-blocker",
        configured: true,
        absolute: true,
        exists: true,
        directory: false,
        writable: false
      })
      .mockResolvedValueOnce({
        exportRoot: "/tmp/wealth-factory-stage-obsidian-export",
        configured: true,
        absolute: true,
        exists: true,
        directory: true,
        writable: true
      });

    await expect(
      runLiveHarnessExportReplayCycle({
        runId: "run-stage-replay-2",
        loadWriterConfig: async () => ({
          exportRoot: "/tmp/wealth-factory-stage-obsidian-export",
          configured: true,
          absolute: true,
          exists: true,
          directory: true,
          writable: true
        }),
        setWriterRootState,
        loadClosedBoardCandidate: async () => candidateState({
          runId: "run-stage-replay-2",
          candidateId: "governance_history_export",
          actions: ["export-preflight", "governance-history-export"]
        }),
        postCandidateAction: async ({ action }: { action: { actionRoute?: string | null } }) =>
          action.actionRoute === "export-preflight"
            ? { status: 200, body: { status: "ready" } }
            : { status: 500, body: { code: "writer_failed" } },
        waitForCandidateDeliveryStatus: async () => {
          throw new Error("should not be reached");
        }
      })
    ).resolves.toMatchObject({
      ok: false,
      phase: "governance_export_failed"
    });

    expect(setWriterRootState).toHaveBeenNthCalledWith(1, expect.objectContaining({
      mode: "broken"
    }));
    expect(setWriterRootState).toHaveBeenNthCalledWith(2, expect.objectContaining({
      mode: "healthy",
      writerRoot: "/tmp/wealth-factory-stage-obsidian-export"
    }));
  });

  it("allows a configured absolute writer root that does not exist yet because the bounded writer can create it on restore", async () => {
    await expect(
      runLiveHarnessExportReplayCycle({
        runId: "run-stage-replay-3",
        loadWriterConfig: async () => ({
          exportRoot: "/tmp/wealth-factory-stage-obsidian-export",
          configured: true,
          absolute: true,
          exists: false,
          directory: false,
          writable: false
        }),
        setWriterRootState: vi.fn()
          .mockResolvedValue({
            exportRoot: "/tmp/wealth-factory-stage-obsidian-export",
            configured: true,
            absolute: true,
            exists: true,
            directory: true,
            writable: true
          }),
        loadClosedBoardCandidate: async () => candidateState({
          runId: "run-stage-replay-3",
          candidateId: "governance_history_export",
          actions: ["export-preflight", "governance-history-export"]
        }),
        postCandidateAction: async ({ action }: { action: { actionRoute?: string | null } }) =>
          action.actionRoute === "export-preflight"
            ? { status: 200, body: { status: "ready" } }
            : { status: 500, body: { code: "writer_failed" } },
        waitForCandidateDeliveryStatus: async () => {
          throw new Error("should not be reached");
        }
      })
    ).resolves.toMatchObject({
      ok: false,
      phase: "governance_export_failed"
    });
  });

  it("fails closed before mutating the writer root when the target run is already delivered on the current bundle", async () => {
    const setWriterRootState = vi.fn();
    const postCandidateAction = vi.fn();
    const waitForCandidateDeliveryStatus = vi.fn();
    const loadClosedBoardCandidate = vi.fn()
      .mockResolvedValueOnce(candidateState({
        runId: "run-stage-replay-4",
        candidateId: "governance_history_export",
        actions: ["export-preflight", "governance-history-export"],
        latestDelivery: {
          status: "delivered",
          contractFreshness: "current_bundle"
        }
      }))
      .mockResolvedValueOnce(candidateState({
        runId: "run-stage-replay-4",
        candidateId: "package_bundle_export",
        actions: ["export-preflight", "package-bundle-export"],
        latestDelivery: {
          status: "delivered",
          contractFreshness: "current_bundle"
        }
      }));

    await expect(
      runLiveHarnessExportReplayCycle({
        runId: "run-stage-replay-4",
        loadWriterConfig: async () => ({
          exportRoot: "/tmp/wealth-factory-stage-obsidian-export",
          configured: true,
          absolute: true,
          exists: true,
          directory: true,
          writable: true
        }),
        setWriterRootState,
        loadClosedBoardCandidate,
        postCandidateAction,
        waitForCandidateDeliveryStatus
      })
    ).resolves.toMatchObject({
      ok: false,
      phase: "replay_cycle_not_failure_eligible",
      deliveryEligibility: {
        governance_history_export: {
          eligibleForFailureInduction: false,
          deliveryStatus: "delivered",
          contractFreshness: "current_bundle"
        },
        package_bundle_export: {
          eligibleForFailureInduction: false,
          deliveryStatus: "delivered",
          contractFreshness: "current_bundle"
        }
      }
    });

    expect(setWriterRootState).not.toHaveBeenCalled();
    expect(postCandidateAction).not.toHaveBeenCalled();
    expect(waitForCandidateDeliveryStatus).not.toHaveBeenCalled();
  });

  it("uses delivery snapshot bundle revision to fail closed before writer-root mutation", async () => {
    const setWriterRootState = vi.fn();
    const loadCandidateDeliverySnapshot = vi.fn()
      .mockResolvedValueOnce({
        status: "delivered",
        bundle_revision: "bundle-current-1"
      })
      .mockResolvedValueOnce({
        status: "delivered",
        bundle_revision: "bundle-current-2"
      });

    await expect(
      runLiveHarnessExportReplayCycle({
        runId: "run-stage-replay-5",
        loadWriterConfig: async () => ({
          exportRoot: "/tmp/wealth-factory-stage-obsidian-export",
          configured: true,
          absolute: true,
          exists: true,
          directory: true,
          writable: true
        }),
        setWriterRootState,
        loadClosedBoardCandidate: vi.fn()
          .mockResolvedValueOnce(candidateState({
            runId: "run-stage-replay-5",
            candidateId: "governance_history_export",
            actions: ["export-preflight", "governance-history-export"],
            latestDelivery: {
              bundleRevision: "bundle-current-1"
            }
          }))
          .mockResolvedValueOnce(candidateState({
            runId: "run-stage-replay-5",
            candidateId: "package_bundle_export",
            actions: ["export-preflight", "package-bundle-export"],
            latestDelivery: {
              bundleRevision: "bundle-current-2"
            }
          })),
        loadCandidateDeliverySnapshot,
        postCandidateAction: vi.fn(),
        waitForCandidateDeliveryStatus: vi.fn()
      })
    ).resolves.toMatchObject({
      ok: false,
      phase: "replay_cycle_not_failure_eligible",
      deliveryEligibility: {
        governance_history_export: {
          deliveryStatus: "delivered",
          contractFreshness: "current_bundle",
          bundleRevision: "bundle-current-1"
        },
        package_bundle_export: {
          deliveryStatus: "delivered",
          contractFreshness: "current_bundle",
          bundleRevision: "bundle-current-2"
        }
      }
    });

    expect(setWriterRootState).not.toHaveBeenCalled();
  });

  it("rejects custom failure writer roots outside the derived proof-blocker path", async () => {
    const setWriterRootState = vi.fn();

    await expect(
      runLiveHarnessExportReplayCycle({
        runId: "run-stage-replay-6",
        failureWriterRoot: "/tmp/wealth-factory-stage-obsidian-export",
        loadWriterConfig: async () => ({
          exportRoot: "/tmp/wealth-factory-stage-obsidian-export",
          configured: true,
          absolute: true,
          exists: true,
          directory: true,
          writable: true
        }),
        setWriterRootState,
        loadClosedBoardCandidate: vi.fn()
          .mockResolvedValueOnce(candidateState({
            runId: "run-stage-replay-6",
            candidateId: "governance_history_export",
            actions: ["export-preflight", "governance-history-export"]
          }))
          .mockResolvedValueOnce(candidateState({
            runId: "run-stage-replay-6",
            candidateId: "package_bundle_export",
            actions: ["export-preflight", "package-bundle-export"]
          })),
        postCandidateAction: vi.fn(),
        waitForCandidateDeliveryStatus: vi.fn()
      })
    ).resolves.toMatchObject({
      ok: false,
      phase: "invalid_failure_writer_root"
    });

    expect(setWriterRootState).not.toHaveBeenCalled();
  });
});

function candidateState(input: {
  runId: string;
  candidateId: string;
  actions: string[];
  latestDelivery?: {
    status?: string;
    contractFreshness?: string;
    bundleRevision?: string;
  };
}) {
  return {
    board: {
      runId: input.runId,
      boardState: "closed"
    },
    candidate: {
      id: input.candidateId,
      latestDelivery: input.latestDelivery ?? null,
      exportActions: input.actions.map((actionRoute) => ({
        actionRoute,
        actionHandle: `${input.candidateId}-${actionRoute}-handle`,
        actionPath: `/api/harness/runs/${input.runId}/export-candidates/${input.candidateId}/${actionRoute}`
      }))
    }
  };
}
