export async function resolveLiveNativeAttention(input) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const nowImpl = input.nowImpl ?? (() => new Date().toISOString());
  const boardUrl = new URL("/api/harness/board", normalizeOrigin(input.baseUrl));
  boardUrl.searchParams.set("workflowId", input.workflowId);

  const boardResponse = await fetchImpl(boardUrl.toString(), {
    method: "GET",
    headers: {
      cookie: `${input.sessionCookieName}=${input.sessionToken}`,
      origin: normalizeOrigin(input.portalOrigin)
    }
  });
  const boardBody = await readJson(boardResponse);
  if (boardResponse.status !== 200) {
    return {
      ok: false,
      phase: "native_attention_board_load_failed",
      notes: [
        "Loading the live board contract did not return a successful response.",
        `Observed HTTP status ${boardResponse.status} before the native resolve-attention contract could be inspected.`
      ],
      actionResult: {
        status: boardResponse.status,
        body: boardBody
      }
    };
  }

  const action = resolveNativeAttentionAction(boardBody, input.expectedRunId);
  if (!action) {
    return {
      ok: false,
      phase: "native_attention_unavailable",
      notes: [
        "The live board did not return the expected native resolve-attention contract for the requested run.",
        `Expected run ${input.expectedRunId} with a resolve-attention action that allows resume_lane or unblock_lane.`
      ]
    };
  }

  const postAttemptedAt = nowImpl();
  const actionPath = new URL(boardBody.pendingAttention.actionPath, normalizeOrigin(input.baseUrl));
  if (!isBoundedResolveAttentionPath(actionPath, normalizeOrigin(input.baseUrl), input.expectedRunId)) {
    return {
      ok: false,
      phase: "native_attention_contract_invalid",
      notes: [
        "The live board exposed a resolve-attention action path outside the bounded harness route contract.",
        `Expected a same-origin /api/harness/runs/${input.expectedRunId}/resolve-attention action path before submitting the authenticated attention resolution.`
      ]
    };
  }
  const actionResponse = await fetchImpl(actionPath.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `${input.sessionCookieName}=${input.sessionToken}`,
      origin: normalizeOrigin(input.portalOrigin)
    },
    body: JSON.stringify({
      ...action.body,
      ...(normalizeValue(input.resumeSummary) ? { resumeSummary: normalizeValue(input.resumeSummary) } : {}),
      ...resolveTaxStrategyPrerequisiteEvidenceFields(input.taxStrategyPrerequisiteEvidence)
    })
  });
  const actionBody = await readJson(actionResponse);

  if (actionResponse.status !== 200 || actionBody?.status !== action.expectedStatus) {
    return {
      ok: false,
      phase: "native_attention_resolution_failed",
      notes: [
        "Submitting the bounded native attention resolution through the guarded resolve-attention route did not return the expected response.",
        `Observed HTTP status ${actionResponse.status} with action status ${normalizeValue(actionBody?.status) ?? "missing"}.`
      ],
      actionResult: {
        status: actionResponse.status,
        body: actionBody
      }
    };
  }

  return {
    ok: true,
    phase: "native_attention_resolved",
    notes: [
      "The live board returned the current native attention contract for the requested workflow.",
      "Submitting the bounded native attention resolution through the guarded resolve-attention route returned a successful response."
    ],
    postAttemptedAt,
    actionResult: {
      status: actionResponse.status,
      body: actionBody
    }
  };
}

function resolveNativeAttentionAction(boardBody, expectedRunId) {
  if (!boardBody || typeof boardBody !== "object") {
    return null;
  }
  if (normalizeValue(boardBody.runId) !== normalizeValue(expectedRunId)) {
    return null;
  }
  const pendingAttention = boardBody.pendingAttention;
  if (!pendingAttention || typeof pendingAttention !== "object") {
    return null;
  }
  if (normalizeValue(pendingAttention.actionRoute) !== "resolve-attention") {
    return null;
  }
  if (!normalizeValue(pendingAttention.actionPath) || !normalizeValue(pendingAttention.actionHandle)) {
    return null;
  }
  if (!Array.isArray(pendingAttention.allowedResolutions)) {
    return null;
  }
  if (pendingAttention.allowedResolutions.includes("resume_lane")) {
    return {
      body: {
        resolution: "resume_lane",
        actionHandle: pendingAttention.actionHandle
      },
      expectedStatus: "resumed"
    };
  }
  if (pendingAttention.allowedResolutions.includes("unblock_lane")) {
    return {
      body: {
        resolution: "unblock_lane",
        actionHandle: pendingAttention.actionHandle
      },
      expectedStatus: "unblocked"
    };
  }
  return null;
}

function normalizeOrigin(value) {
  const normalized = normalizeValue(value);
  if (!normalized) {
    throw new Error("Expected an HTTP origin");
  }
  return normalized.replace(/\/$/, "");
}

function isBoundedResolveAttentionPath(actionUrl, expectedOrigin, expectedRunId) {
  return (
    actionUrl.origin === expectedOrigin &&
    actionUrl.pathname === `/api/harness/runs/${expectedRunId}/resolve-attention` &&
    (actionUrl.search ?? "") === "" &&
    (actionUrl.hash ?? "") === ""
  );
}

function normalizeValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function resolveTaxStrategyPrerequisiteEvidenceFields(evidence) {
  if (!evidence || typeof evidence !== "object") {
    return {};
  }

  const summary = normalizeValue(evidence.taxEvidenceSummary) ?? normalizeValue(evidence.summary);
  const confirmedBy = normalizeValue(evidence.taxEvidenceConfirmedBy) ?? normalizeValue(evidence.confirmedBy);
  const taxYear = normalizeValue(evidence.taxEvidenceTaxYear) ?? normalizeValue(evidence.taxYear);
  const entityType = normalizeValue(evidence.taxEvidenceEntityType) ?? normalizeValue(evidence.entityType);

  if (!summary || !confirmedBy || !taxYear || !entityType) {
    return {};
  }

  return {
    taxEvidenceSummary: summary,
    taxEvidenceConfirmedBy: confirmedBy,
    taxEvidenceTaxYear: taxYear,
    taxEvidenceEntityType: entityType
  };
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
