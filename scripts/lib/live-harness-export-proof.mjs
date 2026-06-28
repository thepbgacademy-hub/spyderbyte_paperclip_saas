export async function runLiveHarnessExportProof(input) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const loadDeliverySnapshot = input.loadDeliverySnapshot ?? (async () => null);
  const sleepImpl = input.sleepImpl ?? sleep;
  const maxAttempts = Number.isInteger(input.maxAttempts) && input.maxAttempts > 0 ? input.maxAttempts : 40;
  const pollIntervalMs = Number.isFinite(input.pollIntervalMs) ? Math.max(0, input.pollIntervalMs) : 500;
  const deliveryMode = normalizeDeliveryMode(input.deliveryMode);
  const recoveryMode = normalizeRecoveryMode(input.recoveryMode);

  const closedBoard = await waitForClosedBoardExportBoard({
    baseUrl: input.baseUrl,
    portalOrigin: input.portalOrigin,
    sessionCookieName: input.sessionCookieName,
    sessionToken: input.sessionToken,
    workflowId: input.boardWorkflowId ?? input.workflowId,
    expectedRunId: input.expectedRunId,
    fetchImpl,
    sleepImpl,
    maxAttempts,
    pollIntervalMs,
    recoveryMode
  });
  if (!closedBoard.ok) {
    return closedBoard;
  }
  if (closedBoard.skipped === true) {
    return closedBoard;
  }

  const governancePreflight = await postBoardAction({
    baseUrl: input.baseUrl,
    portalOrigin: input.portalOrigin,
    sessionCookieName: input.sessionCookieName,
    sessionToken: input.sessionToken,
    action: closedBoard.governance.preflightAction,
    fetchImpl
  });
  if (!governancePreflight.ok) {
    return buildFailure("governance_preflight_failed", [
      "Governance-history export preflight did not succeed on the closed board contract."
    ], {
      board: closedBoard.board,
      governancePreflight
    });
  }

  const governanceReplayAction = closedBoard.governance.replayAction;
  if (recoveryMode === "replay" && !governanceReplayAction) {
    return buildFailure("governance_replay_contract_missing", [
      "The closed board did not expose a bounded governance-history replay action for this recovery path."
    ], {
      board: closedBoard.board,
      governancePreflight
    });
  }
  const governanceDeliveryAction = recoveryMode === "replay" ? governanceReplayAction : closedBoard.governance.exportAction;
  const governanceExport = await postBoardAction({
    baseUrl: input.baseUrl,
    portalOrigin: input.portalOrigin,
    sessionCookieName: input.sessionCookieName,
    sessionToken: input.sessionToken,
    action: governanceDeliveryAction,
    fetchImpl
  });
  if (!governanceExport.ok || governanceExport.response.status !== 200) {
    return buildFailure("governance_export_failed", [
      "Governance-history export did not return the expected success response."
    ], {
      board: closedBoard.board,
      governancePreflight,
      governanceExport
    });
  }
  if (containsForbiddenLeakage(governanceExport.body)) {
    return buildFailure("governance_export_leaked_private_data", [
      "Governance-history export replayed forbidden private runtime metadata into the public export response."
    ], {
      board: closedBoard.board,
      governancePreflight,
      governanceExport
    });
  }

  const governanceDelivery = await waitForExportDelivery({
    baseUrl: input.baseUrl,
    portalOrigin: input.portalOrigin,
    sessionCookieName: input.sessionCookieName,
    sessionToken: input.sessionToken,
    workflowId: input.boardWorkflowId ?? input.workflowId,
    expectedRunId: input.expectedRunId,
    candidateId: "governance_history_export",
    loadDeliverySnapshot,
    fetchImpl,
    sleepImpl,
    maxAttempts,
    pollIntervalMs
  });
  if (!governanceDelivery.ok) {
    return buildFailure(governanceDelivery.phase, governanceDelivery.notes, {
      board: closedBoard.board,
      governancePreflight,
      governanceExport,
      governanceDelivery
    });
  }
  if (governanceDelivery.deliveryStatus === "delivery_failed") {
    return buildFailure("governance_delivery_failed", [
      "Governance-history delivery reached a terminal failure state on the isolated lane."
    ], {
      board: closedBoard.board,
      governancePreflight,
      governanceExport,
      governanceDelivery
    });
  }
  if (deliveryMode === "required" && !isDeliveryCompleted(governanceDelivery.deliveryStatus)) {
    return buildFailure("governance_delivery_not_completed", [
      "The proof requires full governance-history delivery, but the isolated lane only reached export-ready state."
    ], {
      board: closedBoard.board,
      governancePreflight,
      governanceExport,
      governanceDelivery
    });
  }

  const refreshedBoard = governanceDelivery.board;
  const packageCandidate = findExportCandidate(refreshedBoard, "package_bundle_export");
  const packageExportAction = findExportAction(packageCandidate, "package-bundle-export");
  const packageReplayAction = findExportAction(packageCandidate, "package-bundle-export-replay");
  const packagePreflightAction = findExportAction(packageCandidate, "export-preflight");
  const governanceDelivered = isDeliveryCompleted(governanceDelivery.deliveryStatus);
  if (!packageCandidate || !packagePreflightAction) {
    return buildFailure("package_export_contract_missing", [
      "The closed board no longer exposed the expected package-bundle export contract after governance export."
    ], {
      board: refreshedBoard,
      governancePreflight,
      governanceExport,
      governanceDelivery
    });
  }

  const packagePreflight = await postBoardAction({
    baseUrl: input.baseUrl,
    portalOrigin: input.portalOrigin,
    sessionCookieName: input.sessionCookieName,
    sessionToken: input.sessionToken,
    action: packagePreflightAction,
    fetchImpl
  });
  if (!packagePreflight.ok) {
    return buildFailure("package_preflight_failed", [
      "Package-bundle export preflight did not succeed on the closed board contract."
    ], {
      board: refreshedBoard,
      governancePreflight,
      governanceExport,
      governanceDelivery,
      packagePreflight
    });
  }

  const packageDeliveryAction = recoveryMode === "replay" ? packageReplayAction : packageExportAction;
  if (!packageDeliveryAction) {
    if (recoveryMode === "replay") {
      return buildFailure("package_replay_contract_missing", [
        "The closed board did not expose a bounded package-bundle replay action for this recovery path."
      ], {
        board: refreshedBoard,
        governancePreflight,
        governanceExport,
        governanceDelivery,
        packagePreflight
      });
    }
    if (!governanceDelivered) {
      const packagePreflightStatus = normalizeValue(packagePreflight.body?.status);
      const packageSupportsExport = packagePreflight.body?.supportsExport;
      if (packagePreflightStatus !== "blocked" || packageSupportsExport !== false) {
        return buildFailure("package_export_should_be_blocked", [
          "Package-bundle export should have remained blocked behind the governance delivery dependency when the board withheld the export action."
        ], {
          board: refreshedBoard,
          governancePreflight,
          governanceExport,
          governanceDelivery,
          packagePreflight
        });
      }

      return {
        ok: true,
        phase: "governance_ready_package_blocked",
        notes: [
          "The closed board exposed the bounded governance-history export contract and persisted its current bundle delivery state.",
          "Because governance delivery is not yet marked delivered on this isolated lane, package-bundle export stayed fail-closed behind the dependency gate."
        ],
        board: {
          initial: closedBoard.board,
          afterGovernance: refreshedBoard
        },
        governancePreflight,
        governanceExport,
        governanceDelivery,
        packagePreflight
      };
    }

    return buildFailure("package_export_contract_missing", [
      "The closed board no longer exposed the expected package-bundle export contract after governance export."
    ], {
      board: refreshedBoard,
      governancePreflight,
      governanceExport,
      governanceDelivery,
      packagePreflight
    });
  }

  const packageExport = await postBoardAction({
    baseUrl: input.baseUrl,
    portalOrigin: input.portalOrigin,
    sessionCookieName: input.sessionCookieName,
    sessionToken: input.sessionToken,
    action: packageDeliveryAction,
    fetchImpl
  });

  if (!governanceDelivered) {
    if (packageExport.response.status !== 409) {
      return buildFailure("package_export_should_be_blocked", [
        "Package-bundle export should have remained blocked until governance-history delivery completed for the current bundle."
      ], {
        board: refreshedBoard,
        governancePreflight,
        governanceExport,
        governanceDelivery,
        packagePreflight,
        packageExport
      });
    }

    return {
      ok: true,
      phase: "governance_ready_package_blocked",
      notes: [
        "The closed board exposed the bounded governance-history export contract and persisted its current bundle delivery state.",
        "Because governance delivery is not yet marked delivered on this isolated lane, package-bundle export stayed fail-closed behind the dependency gate."
      ],
      board: {
        initial: closedBoard.board,
        afterGovernance: refreshedBoard
      },
      governancePreflight,
      governanceExport,
      governanceDelivery,
      packagePreflight,
      packageExport
    };
  }

  if (!packageExport.ok || packageExport.response.status !== 200) {
    return buildFailure("package_export_failed", [
      "Package-bundle export did not succeed after governance-history delivery completed."
    ], {
      board: refreshedBoard,
      governancePreflight,
      governanceExport,
      governanceDelivery,
      packagePreflight,
      packageExport
    });
  }
  if (containsForbiddenLeakage(packageExport.body)) {
    return buildFailure("package_export_leaked_private_data", [
      "Package-bundle export replayed forbidden private runtime metadata into the public export response."
    ], {
      board: refreshedBoard,
      governancePreflight,
      governanceExport,
      governanceDelivery,
      packagePreflight,
      packageExport
    });
  }

  const packageDelivery = await waitForExportDelivery({
    baseUrl: input.baseUrl,
    portalOrigin: input.portalOrigin,
    sessionCookieName: input.sessionCookieName,
    sessionToken: input.sessionToken,
    workflowId: input.boardWorkflowId ?? input.workflowId,
    expectedRunId: input.expectedRunId,
    candidateId: "package_bundle_export",
    loadDeliverySnapshot,
    fetchImpl,
    sleepImpl,
    maxAttempts,
    pollIntervalMs
  });
  if (!packageDelivery.ok) {
    return buildFailure(packageDelivery.phase, packageDelivery.notes, {
      board: refreshedBoard,
      governancePreflight,
      governanceExport,
      governanceDelivery,
      packagePreflight,
      packageExport,
      packageDelivery
    });
  }
  if (packageDelivery.deliveryStatus === "delivery_failed") {
    return buildFailure("package_delivery_failed", [
      "Package-bundle delivery reached a terminal failure state on the isolated lane."
    ], {
      board: refreshedBoard,
      governancePreflight,
      governanceExport,
      governanceDelivery,
      packagePreflight,
      packageExport,
      packageDelivery
    });
  }
  if (deliveryMode === "required" && !isDeliveryCompleted(packageDelivery.deliveryStatus)) {
    return buildFailure("package_delivery_not_completed", [
      "The proof requires full package-bundle delivery, but the isolated lane did not reach delivered state."
    ], {
      board: refreshedBoard,
      governancePreflight,
      governanceExport,
      governanceDelivery,
      packagePreflight,
      packageExport,
      packageDelivery
    });
  }

  return {
    ok: true,
    phase: "governance_and_package_export_verified",
    notes: [
      "The closed board exposed both bounded export seams and governance-history export completed first.",
      "Package-bundle export then advanced on the same closed run contract without leaking private runtime metadata."
    ],
    board: {
      initial: closedBoard.board,
      afterGovernance: refreshedBoard,
      afterPackage: packageDelivery.board
    },
    governancePreflight,
    governanceExport,
    governanceDelivery,
    packagePreflight,
    packageExport,
    packageDelivery
  };
}

export async function waitForClosedBoardExportBoard(input) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const sleepImpl = input.sleepImpl ?? sleep;
  const maxAttempts = Number.isInteger(input.maxAttempts) && input.maxAttempts > 0 ? input.maxAttempts : 40;
  const pollIntervalMs = Number.isFinite(input.pollIntervalMs) ? Math.max(0, input.pollIntervalMs) : 500;
  const recoveryMode = normalizeRecoveryMode(input.recoveryMode);

  let board = null;
  let reviewedFinalAssemblyActionHandle = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const boardState = await loadBoardState({
      baseUrl: input.baseUrl,
      portalOrigin: input.portalOrigin,
      sessionCookieName: input.sessionCookieName,
      sessionToken: input.sessionToken,
      workflowId: input.boardWorkflowId ?? input.workflowId,
      fetchImpl
    });
    if (!boardState.ok) {
      return buildFailure(boardState.phase, boardState.notes, {
        board: boardState.board,
        response: boardState.response
      });
    }
    board = boardState.board;

    const governance = findExportCandidate(board, "governance_history_export");
    const packageCandidate = findExportCandidate(board, "package_bundle_export");
    const governancePreflightAction = findExportAction(governance, "export-preflight");
    const governanceExportAction = findExportAction(governance, "governance-history-export");
    const governanceReplayAction = findExportAction(governance, "governance-history-export-replay");
    const governanceDeliveryAction = recoveryMode === "replay" ? governanceReplayAction : governanceExportAction;

    const pendingAttentionKind = normalizeValue(board?.pendingAttention?.kind);
    const finalAssemblyReview = buildFinalAssemblyReviewRequest(board);
    if (
      normalizeValue(board?.runId) === normalizeValue(input.expectedRunId) &&
      (pendingAttentionKind === "await_unblock" || pendingAttentionKind === "await_lane_resume")
    ) {
      const preconditionSummary =
        pendingAttentionKind === "await_lane_resume"
          ? "Resolve the bounded await_lane_resume attention on the live board before rerunning closed-board export acceptance."
          : "Resolve the bounded await_unblock attention on the live board before rerunning closed-board export acceptance.";
      return {
        ok: true,
        skipped: true,
        phase: "closed_board_export_precondition_unmet",
        notes: [
          "The expected run still requires an explicit bounded board action before export proof is actionable on this board state.",
          preconditionSummary
        ],
        precondition: {
          kind: pendingAttentionKind,
          reasonLabel: normalizeValue(board?.pendingAttention?.reasonLabel),
          summary: normalizeValue(board?.pendingAttention?.summary)
        },
        board
      };
    }

    if (
      normalizeValue(board?.runId) === normalizeValue(input.expectedRunId) &&
      finalAssemblyReview?.invalidReason
    ) {
      return buildFailure("final_assembly_review_contract_invalid", [
        finalAssemblyReview.invalidReason
      ], { board });
    }

    if (
      normalizeValue(board?.runId) === normalizeValue(input.expectedRunId) &&
      finalAssemblyReview?.action &&
      finalAssemblyReview?.requestBody
    ) {
      if (reviewedFinalAssemblyActionHandle !== finalAssemblyReview.action.actionHandle) {
        const reviewAttention = await postBoardAction({
          baseUrl: input.baseUrl,
          portalOrigin: input.portalOrigin,
          sessionCookieName: input.sessionCookieName,
          sessionToken: input.sessionToken,
          action: finalAssemblyReview.action,
          requestBody: finalAssemblyReview.requestBody,
          fetchImpl
        });
        if (!reviewAttention.ok) {
          return buildFailure("final_assembly_review_failed", [
            "The bounded CEO final-assembly review action did not succeed before closed-board export acceptance."
          ], {
            board,
            reviewAttention
          });
        }
        reviewedFinalAssemblyActionHandle = finalAssemblyReview.action.actionHandle;
      }

      if (attempt < maxAttempts) {
        await sleepImpl(pollIntervalMs);
      }
      continue;
    }

    if (
      normalizeValue(board?.runId) === normalizeValue(input.expectedRunId) &&
      isClosedBoardContract(board) &&
      governance &&
      packageCandidate &&
      governancePreflightAction &&
      governanceDeliveryAction
    ) {
      if (containsForbiddenLeakage(board)) {
        return buildFailure("board_export_contract_leaked_private_data", [
          "The closed board export contract leaked forbidden private runtime metadata."
        ], { board });
      }

      return {
        ok: true,
        phase: "closed_board_export_candidates_ready",
        notes: [
          "The live board closed on the expected run and exposed bounded governance-history and package-bundle export candidates."
        ],
        board,
        governance: {
          candidate: governance,
          preflightAction: governancePreflightAction,
          exportAction: governanceExportAction,
          replayAction: governanceReplayAction
        },
        packageCandidate
      };
    }

    if (attempt < maxAttempts) {
      await sleepImpl(pollIntervalMs);
    }
  }

  return buildFailure("closed_board_export_candidates_timeout", [
    "Timed out before the live board exposed export candidates on the expected closed run."
  ], { board });
}

export async function waitForExportDelivery(input) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const loadDeliverySnapshot = input.loadDeliverySnapshot ?? (async () => null);
  const sleepImpl = input.sleepImpl ?? sleep;
  const maxAttempts = Number.isInteger(input.maxAttempts) && input.maxAttempts > 0 ? input.maxAttempts : 40;
  const pollIntervalMs = Number.isFinite(input.pollIntervalMs) ? Math.max(0, input.pollIntervalMs) : 500;

  let board = null;
  let deliverySnapshot = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const boardState = await loadBoardState({
      baseUrl: input.baseUrl,
      portalOrigin: input.portalOrigin,
      sessionCookieName: input.sessionCookieName,
      sessionToken: input.sessionToken,
      workflowId: input.boardWorkflowId ?? input.workflowId,
      fetchImpl
    });
    if (!boardState.ok) {
      return buildFailure(boardState.phase, boardState.notes, {
        board: boardState.board,
        response: boardState.response,
        deliverySnapshot
      });
    }
    board = boardState.board;
    const isExpectedClosedRun =
      normalizeValue(board?.runId) === normalizeValue(input.expectedRunId) &&
      isClosedBoardContract(board);
    if (!isExpectedClosedRun) {
      if (attempt < maxAttempts) {
        await sleepImpl(pollIntervalMs);
      }
      continue;
    }
    const candidate = findExportCandidate(board, input.candidateId);
    if (!candidate) {
      return buildFailure("export_candidate_missing", [
        `The live board no longer exposed ${input.candidateId} while waiting for delivery state.`
      ], { board });
    }

    deliverySnapshot = await loadDeliverySnapshot({
      runId: input.expectedRunId,
      candidateId: input.candidateId,
      candidate
    });

    const deliveryStatus =
      normalizeValue(deliverySnapshot?.status) ??
      normalizeValue(candidate.latestDelivery?.status);
    if (isAcceptedDeliveryStatus(deliveryStatus)) {
      return {
        ok: true,
        phase: `delivery_${deliveryStatus}`,
        notes: [
          `The live board and durable delivery seam converged on ${input.candidateId} status ${deliveryStatus}.`
        ],
        candidateId: input.candidateId,
        deliveryStatus,
        board,
        candidate,
        deliverySnapshot
      };
    }

    if (attempt < maxAttempts) {
      await sleepImpl(pollIntervalMs);
    }
  }

  return buildFailure("delivery_status_timeout", [
    `Timed out before ${input.candidateId} reached an accepted delivery status on the closed board seam.`
  ], {
    board,
    deliverySnapshot
  });
}

export async function postBoardAction(input) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const actionPath = normalizeValue(input.action?.actionPath);
  const actionHandle = normalizeValue(input.action?.actionHandle);
  const baseOrigin = normalizeOrigin(input.baseUrl);
  if (!actionPath || !actionHandle) {
    return {
      ok: false,
      response: {
        status: 0
      },
      body: null
    };
  }

  const url = new URL(actionPath, baseOrigin);
  if (normalizeOrigin(url.origin) !== baseOrigin) {
    return {
      ok: false,
      response: {
        status: 0
      },
      body: null
    };
  }

  const response = await fetchImpl(url.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `${input.sessionCookieName}=${input.sessionToken}`,
      origin: normalizeOrigin(input.portalOrigin)
    },
    body: JSON.stringify({
      actionHandle,
      ...(isPlainObject(input.requestBody) ? input.requestBody : {})
    })
  });
  const body = await readJson(response);

  return {
    ok: response.status >= 200 && response.status < 300,
    response: {
      status: response.status
    },
    body
  };
}

function buildFinalAssemblyReviewRequest(board) {
  const pendingAttention = isPlainObject(board?.pendingAttention) ? board.pendingAttention : null;
  if (!pendingAttention) {
    return null;
  }

  const pendingAttentionKind = normalizeValue(pendingAttention.kind);
  const reasonLabel = normalizeValue(pendingAttention.reasonLabel);
  const actionRoute = normalizeValue(pendingAttention.actionRoute);
  const actionHandle = normalizeValue(pendingAttention.actionHandle);
  const actionPath = normalizeValue(pendingAttention.actionPath);
  const runId = normalizeValue(board?.runId);
  const allowedDecisionValues = Array.isArray(pendingAttention.requestFields)
    ? pendingAttention.requestFields
      .filter((field) => isPlainObject(field) && normalizeValue(field.name) === "decision")
      .flatMap((field) => Array.isArray(field.allowedValues) ? field.allowedValues.map((value) => normalizeValue(value)) : [])
      .filter(Boolean)
    : [];

  if (pendingAttentionKind !== "queue_ceo_review" || reasonLabel !== "Final assembly") {
    return null;
  }
  if (!runId) {
    return {
      invalidReason: "The final-assembly review contract did not expose the expected run id."
    };
  }
  if (actionRoute !== "review-attention") {
    return {
      invalidReason: "The final-assembly review contract did not expose the bounded review-attention route."
    };
  }
  if (!actionHandle || !actionPath || !allowedDecisionValues.includes("complete_run")) {
    return {
      invalidReason: "The final-assembly review contract is missing the bounded completion payload requirements."
    };
  }
  const expectedActionPath = `/api/harness/runs/${encodeURIComponent(runId)}/review-attention`;
  if (actionPath !== expectedActionPath) {
    return {
      invalidReason: "The final-assembly review contract pointed at an unexpected same-origin action path."
    };
  }

  return {
    action: {
      actionHandle,
      actionPath
    },
    requestBody: {
      decision: "complete_run",
      completionSummary: "The CEO accepted final assembly and closed this board cycle for export verification."
    }
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function loadBoardState(input) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const boardUrl = new URL("/api/harness/board", normalizeOrigin(input.baseUrl));
  boardUrl.searchParams.set("workflowId", input.workflowId);

  const response = await fetchImpl(boardUrl.toString(), {
    method: "GET",
    headers: {
      cookie: `${input.sessionCookieName}=${input.sessionToken}`,
      origin: normalizeOrigin(input.portalOrigin)
    }
  });
  const body = await readJson(response);
  if (response.status < 200 || response.status >= 300) {
    return {
      ok: false,
      phase: "board_load_failed",
      notes: [
        `The live board request failed with HTTP ${response.status} before export proof could continue.`
      ],
      response: {
        status: response.status
      },
      board: body
    };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      phase: "board_load_failed",
      notes: [
        "The live board request returned an invalid response body before export proof could continue."
      ],
      response: {
        status: response.status
      },
      board: null
    };
  }

  return {
    ok: true,
    board: body
  };
}

function findExportCandidate(board, candidateId) {
  const candidates = Array.isArray(board?.memoryBoundary?.exportCandidates)
    ? board.memoryBoundary.exportCandidates
    : [];
  return candidates.find((candidate) => candidate?.id === candidateId) ?? null;
}

function findExportAction(candidate, actionRoute) {
  const actions = Array.isArray(candidate?.exportActions) ? candidate.exportActions : [];
  return actions.find((action) => normalizeValue(action?.actionRoute) === actionRoute) ?? null;
}

function containsForbiddenLeakage(value) {
  const serialized = JSON.stringify(value ?? null);
  return FORBIDDEN_LEAKAGE_PATTERNS.some((pattern) => pattern.test(serialized));
}

function isAcceptedDeliveryStatus(value) {
  return value === "export_ready" || value === "delivered" || value === "delivery_failed" || value === "delivery_replayed";
}

function isDeliveryCompleted(value) {
  return value === "delivered" || value === "delivery_replayed";
}

function isClosedBoardContract(board) {
  return normalizeValue(board?.boardState) === "closed";
}

function normalizeDeliveryMode(value) {
  const normalized = normalizeValue(value) ?? "auto";
  if (normalized !== "auto" && normalized !== "required") {
    throw new Error("--delivery-mode must be auto or required");
  }
  return normalized;
}

function normalizeRecoveryMode(value) {
  const normalized = normalizeValue(value) ?? "fresh";
  if (normalized !== "fresh" && normalized !== "replay") {
    throw new Error("--mode must be fresh or replay");
  }
  return normalized;
}

function buildFailure(phase, notes, extra = {}) {
  return {
    ok: false,
    phase,
    notes,
    ...extra
  };
}

function normalizeOrigin(value) {
  const normalized = normalizeValue(value);
  if (!normalized) {
    throw new Error("Expected an HTTP origin");
  }
  return normalized.replace(/\/$/, "");
}

function normalizeValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const FORBIDDEN_LEAKAGE_PATTERNS = [
  /orchestratorHandoff/i,
  /postOutcomeDirectives/i,
  /boardContext/i,
  /boundSecretReferenceId/i,
  /providerContext/i,
  /secretRef/i
];
