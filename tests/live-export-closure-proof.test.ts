import { createRequire } from "node:module";

import { describe, expect, it, vi } from "vitest";

type LiveExportClosureProofModule = {
  pollForClosedBoardExportCandidate: (input: {
    fetch: typeof fetch;
    workflowId: string;
    expectedRunId: string;
    candidateId: string;
    maxAttempts: number;
    pollIntervalMs: number;
    sleep: (delayMs: number) => Promise<void>;
  }) => Promise<{
    attempts: number;
    board: Record<string, unknown>;
    exportCandidate: Record<string, unknown>;
  }>;
  postExportCandidateAction: (input: {
    fetch: typeof fetch;
    runId: string;
    candidateId: string;
    action: {
      actionRoute: string;
      actionHandle?: string;
    };
  }) => Promise<Record<string, unknown>>;
  verifyPackageExportDependencyTruth: (input: {
    board: {
      runId: string;
      memoryBoundary?: {
        exportCandidates?: Array<{
          id: string;
          readiness?: string;
          readinessLabel?: string;
          promotionBlocker?: string;
          promotionBlockerLabel?: string;
          latestDelivery?: {
            status?: string;
            bundleRevision?: string;
          };
          exportActions?: Array<{
            actionRoute: string;
            actionHandle?: string;
          }>;
        }>;
      };
    };
  }) => {
    governanceDelivered: boolean;
    packageExportBlocked: boolean;
    packageExportActionable: boolean;
    blockerLabel: string | null;
  };
};

const require = createRequire(import.meta.url);

function loadHelper(): LiveExportClosureProofModule {
  return require("../scripts/lib/live-export-closure-proof.mjs") as LiveExportClosureProofModule;
}

function jsonResponse(body: Record<string, unknown>) {
  return {
    ok: true,
    json: async () => body
  };
}

describe("live export closure proof helper", () => {
  it("polls the workflow board until the expected closed run exposes the requested export candidate", async () => {
    const { pollForClosedBoardExportCandidate } = loadHelper();
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        runId: "run_other_1",
        boardState: "closed",
        memoryBoundary: {
          exportCandidates: [
            {
              id: "governance_history_export"
            }
          ]
        }
      }) as Awaited<ReturnType<typeof fetch>>)
      .mockResolvedValueOnce(jsonResponse({
        runId: "run_expected_1",
        boardState: "open",
        memoryBoundary: {
          exportCandidates: []
        }
      }) as Awaited<ReturnType<typeof fetch>>)
      .mockResolvedValueOnce(jsonResponse({
        runId: "run_expected_1",
        boardState: "closed",
        memoryBoundary: {
          exportCandidates: [
            {
              id: "governance_history_export",
              readinessLabel: "Ready now",
              exportActions: [
                {
                  actionRoute: "governance-history-export",
                  actionHandle: "governance-export-handle-123"
                }
              ]
            }
          ]
        }
      }) as Awaited<ReturnType<typeof fetch>>);

    const result = await pollForClosedBoardExportCandidate({
      fetch: fetchImpl,
      workflowId: "wf_connect_first_workflow",
      expectedRunId: "run_expected_1",
      candidateId: "governance_history_export",
      maxAttempts: 4,
      pollIntervalMs: 25,
      sleep
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "/api/harness/board?workflowId=wf_connect_first_workflow",
      expect.objectContaining({
        method: "GET"
      })
    );
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 25);
    expect(sleep).toHaveBeenNthCalledWith(2, 25);
    expect(result).toMatchObject({
      attempts: 3,
      board: {
        runId: "run_expected_1",
        boardState: "closed"
      },
      exportCandidate: {
        id: "governance_history_export",
        readinessLabel: "Ready now"
      }
    });
  });

  it("posts a bounded export-candidate action using the canonical actionHandle payload", async () => {
    const { postExportCandidateAction } = loadHelper();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        candidateId: "governance_history_export",
        status: "export_ready"
      }) as Awaited<ReturnType<typeof fetch>>
    );

    const response = await postExportCandidateAction({
      fetch: fetchImpl,
      runId: "run_expected_1",
      candidateId: "governance_history_export",
      action: {
        actionRoute: "export",
        actionHandle: "governance-export-handle-123"
      }
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("/api/harness/runs/run_expected_1/export-candidates/governance_history_export/export");
    expect(options).toMatchObject({
      method: "POST",
      headers: {
        "content-type": "application/json"
      }
    });
    expect(JSON.parse(String(options?.body))).toEqual({
      actionHandle: "governance-export-handle-123"
    });
    expect(response).toMatchObject({
      candidateId: "governance_history_export",
      status: "export_ready"
    });
  });

  it("verifies package export stays blocked until governance delivery completes for the same bundle revision", async () => {
    const { verifyPackageExportDependencyTruth } = loadHelper();

    expect(verifyPackageExportDependencyTruth({
      board: {
        runId: "run_expected_1",
        memoryBoundary: {
          exportCandidates: [
            {
              id: "governance_history_export",
              latestDelivery: {
                status: "delivery_in_progress",
                bundleRevision: "bundle_revision_7"
              },
              exportActions: [
                {
                  actionRoute: "governance-history-export"
                }
              ]
            },
            {
              id: "package_bundle_export",
              readiness: "after_board_closes",
              readinessLabel: "After board closes",
              promotionBlocker: "governance_history_delivery_incomplete",
              promotionBlockerLabel: "Governance history delivery must complete first",
              latestDelivery: {
                status: "export_ready",
                bundleRevision: "bundle_revision_7"
              },
              exportActions: [
                {
                  actionRoute: "export-preflight"
                }
              ]
            }
          ]
        }
      }
    })).toEqual({
      governanceDelivered: false,
      packageExportBlocked: true,
      packageExportActionable: false,
      blockerLabel: "Governance history delivery must complete first"
    });

    expect(verifyPackageExportDependencyTruth({
      board: {
        runId: "run_expected_1",
        memoryBoundary: {
          exportCandidates: [
            {
              id: "governance_history_export",
              latestDelivery: {
                status: "delivered",
                bundleRevision: "bundle_revision_7"
              }
            },
            {
              id: "package_bundle_export",
              readiness: "after_board_closes",
              readinessLabel: "After board closes",
              latestDelivery: {
                status: "export_ready",
                bundleRevision: "bundle_revision_7"
              },
              exportActions: [
                {
                  actionRoute: "package-bundle-export",
                  actionHandle: "package-export-handle-123"
                }
              ]
            }
          ]
        }
      }
    })).toEqual({
      governanceDelivered: true,
      packageExportBlocked: false,
      packageExportActionable: true,
      blockerLabel: null
    });

    expect(verifyPackageExportDependencyTruth({
      board: {
        runId: "run_expected_1",
        memoryBoundary: {
          exportCandidates: [
            {
              id: "governance_history_export",
              latestDelivery: {
                status: "delivered",
                bundleRevision: "bundle_revision_7"
              }
            },
            {
              id: "package_bundle_export",
              latestDelivery: {
                status: "export_ready",
                bundleRevision: "bundle_revision_8"
              },
              exportActions: [
                {
                  actionRoute: "package-bundle-export",
                  actionHandle: "package-export-handle-456"
                }
              ]
            }
          ]
        }
      }
    })).toEqual({
      governanceDelivered: true,
      packageExportBlocked: true,
      packageExportActionable: false,
      blockerLabel: null
    });

    expect(verifyPackageExportDependencyTruth({
      board: {
        runId: "run_expected_1",
        memoryBoundary: {
          exportCandidates: [
            {
              id: "governance_history_export",
              latestDelivery: {
                status: "delivered"
              }
            },
            {
              id: "package_bundle_export",
              latestDelivery: {
                status: "export_ready",
                bundleRevision: "bundle_revision_8"
              },
              exportActions: [
                {
                  actionRoute: "package-bundle-export",
                  actionHandle: "package-export-handle-789"
                }
              ]
            }
          ]
        }
      }
    })).toEqual({
      governanceDelivered: true,
      packageExportBlocked: true,
      packageExportActionable: false,
      blockerLabel: null
    });

    expect(verifyPackageExportDependencyTruth({
      board: {
        runId: "run_expected_1",
        memoryBoundary: {
          exportCandidates: [
            {
              id: "governance_history_export",
              latestDelivery: {
                status: "delivered",
                bundleRevision: "bundle_revision_9"
              }
            },
            {
              id: "package_bundle_export",
              readiness: "after_board_closes",
              readinessLabel: "After board closes",
              promotionBlocker: "governance_history_delivery_incomplete",
              promotionBlockerLabel: "Governance history delivery must complete first",
              latestDelivery: {
                status: "export_ready",
                bundleRevision: "bundle_revision_9"
              },
              exportActions: [
                {
                  actionRoute: "package-bundle-export",
                  actionHandle: "package-export-handle-999"
                }
              ]
            }
          ]
        }
      }
    })).toEqual({
      governanceDelivered: true,
      packageExportBlocked: true,
      packageExportActionable: false,
      blockerLabel: "Governance history delivery must complete first"
    });
  });
});
