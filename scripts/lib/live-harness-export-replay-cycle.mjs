export async function runLiveHarnessExportReplayCycle(input) {
  const loadWriterConfig = requireFunction(input.loadWriterConfig, "loadWriterConfig");
  const setWriterRootState = requireFunction(input.setWriterRootState, "setWriterRootState");
  const loadClosedBoardCandidate = requireFunction(input.loadClosedBoardCandidate, "loadClosedBoardCandidate");
  const postCandidateAction = requireFunction(input.postCandidateAction, "postCandidateAction");
  const waitForCandidateDeliveryStatus = requireFunction(
    input.waitForCandidateDeliveryStatus,
    "waitForCandidateDeliveryStatus"
  );

  const runId = normalizeValue(input.runId);
  if (!runId) {
    return buildFailure("run_id_missing", [
      "The live export replay cycle requires an explicit existing run id."
    ]);
  }

  const originalWriterConfig = await loadWriterConfig();
  const originalWriterRoot = normalizeValue(originalWriterConfig?.exportRoot);
  if (
    !originalWriterRoot
    || originalWriterConfig?.absolute !== true
    || originalWriterConfig?.configured !== true
    || (originalWriterConfig?.exists === true && originalWriterConfig?.directory !== true)
    || (originalWriterConfig?.exists === true && originalWriterConfig?.directory === true && originalWriterConfig?.writable !== true)
  ) {
    return buildFailure("delivery_writer_not_ready", [
      "The isolated stage writer root must start healthy before the replay-cycle proof can inject a bounded delivery failure."
    ], {
      writerConfig: originalWriterConfig ?? null
    });
  }

  const failureWriterRoot = normalizeValue(input.failureWriterRoot) ?? `${originalWriterRoot}.replay-proof-blocker`;
  if (failureWriterRoot !== `${originalWriterRoot}.replay-proof-blocker`) {
    return buildFailure("invalid_failure_writer_root", [
      "The replay-cycle proof failure writer root must use the derived proof-blocker path for the configured export root."
    ], {
      writerRoot: {
        original: originalWriterRoot,
        failure: failureWriterRoot
      }
    });
  }

  const loadCandidateDeliverySnapshot = typeof input.loadCandidateDeliverySnapshot === "function"
    ? input.loadCandidateDeliverySnapshot
    : null;
  const governanceCandidate = await loadClosedBoardCandidate({
    runId,
    candidateId: "governance_history_export"
  });
  const packageEligibilityCandidate = await loadClosedBoardCandidate({
    runId,
    candidateId: "package_bundle_export"
  });
  const governanceEligibility = await assessFailureEligibility({
    candidateId: "governance_history_export",
    candidateState: governanceCandidate,
    loadCandidateDeliverySnapshot
  });
  const packageEligibility = await assessFailureEligibility({
    candidateId: "package_bundle_export",
    candidateState: packageEligibilityCandidate,
    loadCandidateDeliverySnapshot
  });

  if (!governanceEligibility.eligibleForFailureInduction || !packageEligibility.eligibleForFailureInduction) {
    return buildFailure("replay_cycle_not_failure_eligible", [
      "The target run is already delivered on the current export bundle, so the bounded replay-cycle proof cannot induce a fresh delivery failure on that same bundle."
    ], {
      runId,
      board: governanceCandidate.board ?? packageEligibilityCandidate.board ?? null,
      deliveryEligibility: {
        governance_history_export: governanceEligibility,
        package_bundle_export: packageEligibility
      }
    });
  }

  let writerState = "healthy";

  try {
    await setWriterRootState({
      mode: "broken",
      writerRoot: failureWriterRoot,
      restoreWriterRoot: originalWriterRoot
    });
    writerState = "broken";

    const governancePreflightAction = findAction(governanceCandidate.candidate, "export-preflight");
    const governanceExportAction = findAction(governanceCandidate.candidate, "governance-history-export");
    if (!governancePreflightAction || !governanceExportAction) {
      return buildFailure("governance_export_contract_missing", [
        "The closed board did not expose the bounded governance-history export contract on the target run."
      ], {
        board: governanceCandidate.board
      });
    }

    const governancePreflight = await postCandidateAction({
      runId,
      candidateId: "governance_history_export",
      action: governancePreflightAction
    });
    if (governancePreflight?.status !== 200) {
      return buildFailure("governance_preflight_failed", [
        "Governance-history export preflight failed during the replay-cycle proof."
      ], {
        governancePreflight
      });
    }

    const governanceExport = await postCandidateAction({
      runId,
      candidateId: "governance_history_export",
      action: governanceExportAction
    });
    if (governanceExport?.status !== 200) {
      return buildFailure("governance_export_failed", [
        "Governance-history export failed before the replay-cycle proof could create a replay-eligible delivery state."
      ], {
        governanceExport
      });
    }

    const governanceFailure = await waitForCandidateDeliveryStatus({
      candidateId: "governance_history_export",
      acceptedStatuses: ["delivery_failed"]
    });

    await setWriterRootState({
      mode: "healthy",
      writerRoot: originalWriterRoot,
      restoreWriterRoot: originalWriterRoot
    });
    writerState = "healthy";

    const governanceReplayCandidate = await loadClosedBoardCandidate({
      runId,
      candidateId: "governance_history_export"
    });
    const governanceReplayAction = findAction(governanceReplayCandidate.candidate, "governance-history-export-replay");
    if (!governanceReplayAction) {
      return buildFailure("governance_replay_contract_missing", [
        "The closed board did not expose a bounded governance-history replay action after the injected delivery failure."
      ], {
        board: governanceReplayCandidate.board,
        governanceFailure
      });
    }

    const governanceReplayRequest = await postCandidateAction({
      runId,
      candidateId: "governance_history_export",
      action: governanceReplayAction
    });
    if (governanceReplayRequest?.status !== 200) {
      return buildFailure("governance_replay_failed", [
        "Governance-history delivery replay failed on the bounded public contract."
      ], {
        governanceReplayRequest,
        governanceFailure
      });
    }

    const governanceReplay = await waitForCandidateDeliveryStatus({
      candidateId: "governance_history_export",
      acceptedStatuses: ["delivered"]
    });

    await setWriterRootState({
      mode: "broken",
      writerRoot: failureWriterRoot,
      restoreWriterRoot: originalWriterRoot
    });
    writerState = "broken";

    const packageCandidate = await loadClosedBoardCandidate({
      runId,
      candidateId: "package_bundle_export"
    });
    const packagePreflightAction = findAction(packageCandidate.candidate, "export-preflight");
    const packageExportAction = findAction(packageCandidate.candidate, "package-bundle-export");
    if (!packagePreflightAction || !packageExportAction) {
      return buildFailure("package_export_contract_missing", [
        "The closed board did not expose the bounded package-bundle export contract after governance replay completed."
      ], {
        board: packageCandidate.board,
        governanceReplay
      });
    }

    const packagePreflight = await postCandidateAction({
      runId,
      candidateId: "package_bundle_export",
      action: packagePreflightAction
    });
    if (packagePreflight?.status !== 200) {
      return buildFailure("package_preflight_failed", [
        "Package-bundle export preflight failed during the replay-cycle proof."
      ], {
        packagePreflight,
        governanceReplay
      });
    }

    const packageExport = await postCandidateAction({
      runId,
      candidateId: "package_bundle_export",
      action: packageExportAction
    });
    if (packageExport?.status !== 200) {
      return buildFailure("package_export_failed", [
        "Package-bundle export failed before the replay-cycle proof could create a replay-eligible package delivery state."
      ], {
        packageExport,
        governanceReplay
      });
    }

    const packageFailure = await waitForCandidateDeliveryStatus({
      candidateId: "package_bundle_export",
      acceptedStatuses: ["delivery_failed"]
    });

    await setWriterRootState({
      mode: "healthy",
      writerRoot: originalWriterRoot,
      restoreWriterRoot: originalWriterRoot
    });
    writerState = "healthy";

    const packageReplayCandidate = await loadClosedBoardCandidate({
      runId,
      candidateId: "package_bundle_export"
    });
    const packageReplayAction = findAction(packageReplayCandidate.candidate, "package-bundle-export-replay");
    if (!packageReplayAction) {
      return buildFailure("package_replay_contract_missing", [
        "The closed board did not expose a bounded package-bundle replay action after the injected package delivery failure."
      ], {
        board: packageReplayCandidate.board,
        packageFailure
      });
    }

    const packageReplayRequest = await postCandidateAction({
      runId,
      candidateId: "package_bundle_export",
      action: packageReplayAction
    });
    if (packageReplayRequest?.status !== 200) {
      return buildFailure("package_replay_failed", [
        "Package-bundle delivery replay failed on the bounded public contract."
      ], {
        packageReplayRequest,
        packageFailure
      });
    }

    const packageReplay = await waitForCandidateDeliveryStatus({
      candidateId: "package_bundle_export",
      acceptedStatuses: ["delivered"]
    });

    return {
      ok: true,
      phase: "governance_and_package_replay_verified",
      runId,
      writerRoot: {
        original: originalWriterRoot,
        failure: failureWriterRoot
      },
      governanceFailure,
      governanceReplay,
      packageFailure,
      packageReplay
    };
  } catch (error) {
    return buildFailure("export_replay_cycle_failed", [
      error instanceof Error ? error.message : "Unknown live export replay cycle failure"
    ], {
      runId,
      writerRoot: {
        original: originalWriterRoot,
        failure: failureWriterRoot
      }
    });
  } finally {
    if (writerState === "broken") {
      await setWriterRootState({
        mode: "healthy",
        writerRoot: originalWriterRoot,
        restoreWriterRoot: originalWriterRoot
      });
    }
  }
}

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new Error(`Expected function dependency: ${name}`);
  }
  return value;
}

function findAction(candidate, route) {
  const actions = Array.isArray(candidate?.exportActions) ? candidate.exportActions : [];
  return actions.find((entry) => normalizeValue(entry?.actionRoute) === route) ?? null;
}

function normalizeValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function buildFailure(phase, notes, extra = {}) {
  return {
    ok: false,
    phase,
    notes,
    ...extra
  };
}

async function assessFailureEligibility(input) {
  const candidateDelivery = input.candidateState?.candidate?.latestDelivery ?? null;
  const snapshot = input.loadCandidateDeliverySnapshot
    ? await input.loadCandidateDeliverySnapshot({
      candidateId: input.candidateId
    })
    : null;
  const deliveryStatus =
    normalizeValue(snapshot?.status) ??
    normalizeValue(candidateDelivery?.status);
  const bundleRevision =
    normalizeValue(snapshot?.bundleRevision) ??
    normalizeValue(snapshot?.bundle_revision) ??
    normalizeValue(candidateDelivery?.bundleRevision) ??
    normalizeValue(candidateDelivery?.bundle_revision);
  const candidateBundleRevision =
    normalizeValue(candidateDelivery?.bundleRevision) ??
    normalizeValue(candidateDelivery?.bundle_revision);
  const contractFreshness =
    normalizeValue(snapshot?.contractFreshness) ??
    normalizeValue(snapshot?.contract_freshness) ??
    normalizeValue(candidateDelivery?.contractFreshness) ??
    normalizeValue(candidateDelivery?.contract_freshness) ??
    (bundleRevision && candidateBundleRevision && bundleRevision === candidateBundleRevision ? "current_bundle" : null);

  return {
    eligibleForFailureInduction: !(deliveryStatus === "delivered" && contractFreshness === "current_bundle"),
    deliveryStatus,
    contractFreshness,
    bundleRevision
  };
}
