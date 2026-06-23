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

  const resolution = resolveNativeAttentionResolution(boardBody, input.expectedRunId);
  if (!resolution) {
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
  const actionResponse = await fetchImpl(actionPath.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `${input.sessionCookieName}=${input.sessionToken}`,
      origin: normalizeOrigin(input.portalOrigin)
    },
    body: JSON.stringify({
      resolution,
      actionHandle: boardBody.pendingAttention.actionHandle,
      command: resolution,
      actionToken: boardBody.pendingAttention.actionHandle
    })
  });
  const actionBody = await readJson(actionResponse);
  const expectedActionStatus = resolution === "resume_lane" ? "resumed" : "unblocked";

  if (actionResponse.status !== 200 || actionBody?.status !== expectedActionStatus) {
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

function resolveNativeAttentionResolution(boardBody, expectedRunId) {
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
    return "resume_lane";
  }
  if (pendingAttention.allowedResolutions.includes("unblock_lane")) {
    return "unblock_lane";
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
