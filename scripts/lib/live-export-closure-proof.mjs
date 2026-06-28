export async function pollForClosedBoardExportCandidate(input) {
  const sleepImpl = input.sleep ?? sleep;

  for (let attempt = 1; attempt <= input.maxAttempts; attempt += 1) {
    const response = await input.fetch(`/api/harness/board?workflowId=${encodeURIComponent(input.workflowId)}`, {
      method: "GET"
    });
    const board = await response.json();
    const exportCandidate = Array.isArray(board?.memoryBoundary?.exportCandidates)
      ? board.memoryBoundary.exportCandidates.find((candidate) => candidate?.id === input.candidateId)
      : null;

    if (board?.runId === input.expectedRunId && board?.boardState === "closed" && exportCandidate) {
      return {
        attempts: attempt,
        board,
        exportCandidate
      };
    }

    if (attempt < input.maxAttempts) {
      await sleepImpl(input.pollIntervalMs);
    }
  }

  throw new Error(`Timed out waiting for closed-board candidate ${input.candidateId} on run ${input.expectedRunId}`);
}

export async function postExportCandidateAction(input) {
  const actionSegment = normalizeActionRoute(input.action.actionRoute);
  const actionHandle = normalizeValue(input.action.actionHandle);
  if (!actionHandle) {
    throw new Error("Expected an action handle for export-candidate action");
  }

  const response = await input.fetch(
    `/api/harness/runs/${encodeURIComponent(input.runId)}/export-candidates/${encodeURIComponent(input.candidateId)}/${actionSegment}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        actionHandle
      })
    }
  );
  return response.json();
}

export function verifyPackageExportDependencyTruth(input) {
  const candidates = Array.isArray(input.board?.memoryBoundary?.exportCandidates)
    ? input.board.memoryBoundary.exportCandidates
    : [];
  const governance = candidates.find((candidate) => candidate?.id === "governance_history_export");
  const packageCandidate = candidates.find((candidate) => candidate?.id === "package_bundle_export");
  const governanceDelivered = governance?.latestDelivery?.status === "delivered";
  const governanceBundleRevision = normalizeValue(governance?.latestDelivery?.bundleRevision);
  const packageBundleRevision = normalizeValue(packageCandidate?.latestDelivery?.bundleRevision);
  const hasPromotionBlocker =
    normalizeValue(packageCandidate?.promotionBlocker) !== null ||
    normalizeValue(packageCandidate?.promotionBlockerLabel) !== null;
  const revisionsMatch =
    governanceBundleRevision !== null
    && packageBundleRevision !== null
    && governanceBundleRevision === packageBundleRevision;
  const packageExportActionable = Array.isArray(packageCandidate?.exportActions)
    && packageCandidate.exportActions.some((action) => action?.actionRoute === "package-bundle-export")
    && governanceDelivered
    && !hasPromotionBlocker
    && revisionsMatch;
  const blockerLabel = normalizeValue(packageCandidate?.promotionBlockerLabel);

  return {
    governanceDelivered,
    packageExportBlocked: !packageExportActionable,
    packageExportActionable,
    blockerLabel
  };
}

function normalizeActionRoute(value) {
  const normalized = normalizeValue(value);
  if (normalized === "export") {
    return "export";
  }
  if (normalized === "dry-run") {
    return "dry-run";
  }
  if (normalized === "preflight" || normalized === "export-preflight") {
    return "preflight";
  }
  if (normalized === "delivery-replay") {
    return "delivery-replay";
  }
  throw new Error(`Unsupported export action route: ${value ?? "missing"}`);
}

function normalizeValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
