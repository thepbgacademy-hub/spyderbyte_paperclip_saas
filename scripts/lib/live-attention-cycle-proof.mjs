export async function proveLiveAttentionCycleRefresh(input) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const normalizedBaseUrl = normalizeOrigin(input.baseUrl);
  const normalizedPortalOrigin = normalizeOrigin(input.portalOrigin);

  const initialBoard = await loadBoard({
    fetchImpl,
    baseUrl: normalizedBaseUrl,
    portalOrigin: normalizedPortalOrigin,
    sessionCookieName: input.sessionCookieName,
    sessionToken: input.sessionToken,
    workflowId: input.workflowId
  });
  if (!initialBoard.ok) {
    return {
      ok: false,
      phase: initialBoard.phase,
      notes: initialBoard.notes
    };
  }

  const initialMatchingBlockedAttention = resolveMatchingBlockedAttention({
    boardBody: initialBoard.body,
    baseUrl: normalizedBaseUrl,
    workflowId: input.workflowId,
    persona: input.persona,
    title: input.title,
    deliverableType: input.deliverableType
  });

  if (initialBoard.body.pendingAttention && !initialMatchingBlockedAttention.ok) {
    return {
      ok: false,
      phase: "preexisting_attention_present",
      notes: [
        "The selected workflow already exposes pending attention before the bounded cycle-refresh proof starts.",
        "The live proof stops here to avoid mutating a dirty board lane or claiming ownership over unrelated attention."
      ],
      runId: normalizeValue(initialBoard.body.runId) ?? undefined
    };
  }

  const runId = normalizeValue(initialBoard.body.runId);
  if (!runId) {
    return {
      ok: false,
      phase: "board_run_missing",
      notes: [
        "The live board response did not include a usable run id.",
        "The proof cannot verify the bounded resolve-attention contract without a stable run id."
      ],
      cardId: undefined
    };
  }

  const reusableCard = initialMatchingBlockedAttention.ok
    ? { id: initialMatchingBlockedAttention.cardId }
    : findReusableApprovedCard({
        boardBody: initialBoard.body,
        persona: input.persona,
        title: input.title,
        deliverableType: input.deliverableType
      });
  const cardResolution = reusableCard
    ? {
        ok: true,
        cardId: reusableCard.id,
        usedExistingCard: true,
        startedBlocked: initialMatchingBlockedAttention.ok
      }
    : await createCard({
        fetchImpl,
        baseUrl: normalizedBaseUrl,
        portalOrigin: normalizedPortalOrigin,
        sessionCookieName: input.sessionCookieName,
        sessionToken: input.sessionToken,
        workflowId: input.workflowId,
        persona: input.persona,
        title: input.title,
        deliverableType: input.deliverableType
      });
  if (!cardResolution.ok) {
    return {
      ok: false,
      phase: cardResolution.phase,
      notes: cardResolution.notes,
      runId
    };
  }

  const cardId = cardResolution.cardId;

  const firstAttentionContract = initialMatchingBlockedAttention.ok
    ? {
        ok: true,
        actionHandle: initialMatchingBlockedAttention.actionHandle,
        actionUrl: initialMatchingBlockedAttention.actionUrl
      }
    : await establishFirstBlockedCycle({
        fetchImpl,
        baseUrl: normalizedBaseUrl,
        portalOrigin: normalizedPortalOrigin,
        sessionCookieName: input.sessionCookieName,
        sessionToken: input.sessionToken,
        workflowId: input.workflowId,
        cardId,
        firstBlockSummary: input.firstBlockSummary
      });
  if (!firstAttentionContract.ok) {
    return failureFromStep(firstAttentionContract, { runId, cardId });
  }

  const firstResolve = await resolveAttention({
    fetchImpl,
    actionUrl: firstAttentionContract.actionUrl,
    portalOrigin: normalizedPortalOrigin,
    sessionCookieName: input.sessionCookieName,
    sessionToken: input.sessionToken,
    resolution: "unblock_lane",
    actionHandle: firstAttentionContract.actionHandle,
    resumeSummary: input.unblockSummary
  });
  if (!firstResolve.ok) {
    return failureFromStep(firstResolve, {
      runId,
      cardId,
      firstActionHandle: firstAttentionContract.actionHandle
    });
  }

  const secondAdvance = await advanceCard({
    fetchImpl,
    baseUrl: normalizedBaseUrl,
    portalOrigin: normalizedPortalOrigin,
    sessionCookieName: input.sessionCookieName,
    sessionToken: input.sessionToken,
    cardId,
    state: "working"
  });
  if (!secondAdvance.ok) {
    return failureFromStep(secondAdvance, {
      runId,
      cardId,
      firstActionHandle: firstAttentionContract.actionHandle
    });
  }

  const secondBlock = await advanceCard({
    fetchImpl,
    baseUrl: normalizedBaseUrl,
    portalOrigin: normalizedPortalOrigin,
    sessionCookieName: input.sessionCookieName,
    sessionToken: input.sessionToken,
    cardId,
    state: "blocked",
    resumeSummary: input.secondBlockSummary
  });
  if (!secondBlock.ok) {
    return failureFromStep(secondBlock, {
      runId,
      cardId,
      firstActionHandle: firstAttentionContract.actionHandle
    });
  }

  const secondAttentionBoard = await loadBoard({
    fetchImpl,
    baseUrl: normalizedBaseUrl,
    portalOrigin: normalizedPortalOrigin,
    sessionCookieName: input.sessionCookieName,
    sessionToken: input.sessionToken,
    workflowId: input.workflowId
  });
  if (!secondAttentionBoard.ok) {
    return failureFromStep(secondAttentionBoard, {
      runId,
      cardId,
      firstActionHandle: firstAttentionContract.actionHandle
    });
  }
  const secondAttentionContract = resolveAttentionContract({
    boardBody: secondAttentionBoard.body,
    baseUrl: normalizedBaseUrl,
    expectedRunId: runId,
    expectedCardId: cardId,
    expectedResolution: "unblock_lane"
  });
  if (!secondAttentionContract.ok) {
    return failureFromStep(secondAttentionContract, {
      runId,
      cardId,
      firstActionHandle: firstAttentionContract.actionHandle
    });
  }

  if (secondAttentionContract.actionHandle === firstAttentionContract.actionHandle) {
    return {
      ok: false,
      phase: "attention_handle_not_refreshed",
      notes: [
        "The second blocked cycle reused the first blocked cycle action handle.",
        "That means the live board did not mint a fresh cycle-specific handle for the new blocked state."
      ],
      runId,
      cardId,
      firstActionHandle: firstAttentionContract.actionHandle,
      secondActionHandle: secondAttentionContract.actionHandle
    };
  }

  const staleResolve = await resolveAttention({
    fetchImpl,
    actionUrl: secondAttentionContract.actionUrl,
    portalOrigin: normalizedPortalOrigin,
    sessionCookieName: input.sessionCookieName,
    sessionToken: input.sessionToken,
    resolution: "unblock_lane",
    actionHandle: firstAttentionContract.actionHandle,
    resumeSummary: input.unblockSummary
  });
  if (staleResolve.status !== 409 || staleResolve.body?.code !== "stale_contract") {
    return {
      ok: false,
      phase: "stale_handle_not_rejected",
      notes: [
        "Reusing the first blocked-cycle action handle did not return the expected stale_contract rejection.",
        `Observed HTTP status ${staleResolve.status} with code ${normalizeValue(staleResolve.body?.code) ?? "missing"}.`
      ],
      runId,
      cardId,
      firstActionHandle: firstAttentionContract.actionHandle,
      secondActionHandle: secondAttentionContract.actionHandle,
      staleActionResult: {
        status: staleResolve.status,
        body: staleResolve.body
      }
    };
  }

  const secondResolve = await resolveAttention({
    fetchImpl,
    actionUrl: secondAttentionContract.actionUrl,
    portalOrigin: normalizedPortalOrigin,
    sessionCookieName: input.sessionCookieName,
    sessionToken: input.sessionToken,
    resolution: "unblock_lane",
    actionHandle: secondAttentionContract.actionHandle,
    resumeSummary: input.unblockSummary
  });
  if (!secondResolve.ok) {
    return failureFromStep(secondResolve, {
      runId,
      cardId,
      firstActionHandle: firstAttentionContract.actionHandle,
      secondActionHandle: secondAttentionContract.actionHandle,
      staleActionResult: {
        status: staleResolve.status,
        body: staleResolve.body
      }
    });
  }

  return {
      ok: true,
      phase: "attention_cycle_refresh_verified",
      notes: [
        cardResolution.startedBlocked
          ? "The live board started from a matching blocked proof lane and no unrelated attention was adopted."
          : "The live board started without unrelated pending attention for the selected workflow.",
        cardResolution.usedExistingCard
          ? "A matching approved proof lane was reused and blocked twice through the bounded board seam."
          : "A fresh proof lane was opened and blocked twice through the bounded board seam.",
        "The second blocked cycle exposed a different action handle than the first blocked cycle.",
        "The first-cycle action handle was rejected with the expected stale_contract response.",
        "The second-cycle action handle resolved successfully through the bounded resolve-attention route."
    ],
    runId,
    cardId,
    firstActionHandle: firstAttentionContract.actionHandle,
    secondActionHandle: secondAttentionContract.actionHandle,
    staleActionResult: {
      status: staleResolve.status,
      body: staleResolve.body
    }
  };
}

async function loadBoard(input) {
  const boardUrl = new URL("/api/harness/board", input.baseUrl);
  boardUrl.searchParams.set("workflowId", input.workflowId);

  const response = await input.fetchImpl(boardUrl.toString(), {
    method: "GET",
    headers: {
      cookie: `${input.sessionCookieName}=${input.sessionToken}`,
      origin: input.portalOrigin
    }
  });
  const body = await readJson(response);
  if (response.status !== 200 || !body || typeof body !== "object") {
    return {
      ok: false,
      phase: "board_load_failed",
      notes: [
        "Loading the live harness board did not return a usable response.",
        `Observed HTTP status ${response.status} before the attention-cycle proof could start.`
      ]
    };
  }

  if (normalizeValue(body.workflowId) !== input.workflowId) {
    return {
      ok: false,
      phase: "workflow_mismatch",
      notes: [
        "The live harness board did not return the requested workflow id.",
        `Expected workflow ${input.workflowId} before mutating any bounded proof lane.`
      ]
    };
  }

  return {
    ok: true,
    body
  };
}

async function createCard(input) {
  const response = await input.fetchImpl(`${input.baseUrl}/api/harness/cards`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `${input.sessionCookieName}=${input.sessionToken}`,
      origin: input.portalOrigin
    },
    body: JSON.stringify({
      workflowId: input.workflowId,
      persona: input.persona,
      title: input.title,
      deliverableType: input.deliverableType
    })
  });
  const body = await readJson(response);
  if (response.status !== 200 || !body || typeof body !== "object") {
    return {
      ok: false,
      phase: "card_create_failed",
      notes: [
        "Creating the bounded proof lane did not succeed.",
        `Observed HTTP status ${response.status} when posting the new child card request.`
      ]
    };
  }
  if (body.status === "deferred") {
    return {
      ok: false,
      phase: "card_create_deferred",
      notes: [
        "The bounded proof lane request was deferred by the board instead of opening directly.",
        "This proof expects a direct lane-open path so it does not widen into proposal or review handling."
      ]
    };
  }
  const cardId = normalizeValue(body.cardId);
  if (!cardId) {
    return {
      ok: false,
      phase: "card_create_invalid",
      notes: [
        "The board acknowledged the child-card request without returning a usable card id.",
        "The proof cannot continue without a stable target card."
      ]
    };
  }

  return {
    ok: true,
    cardId,
    usedExistingCard: false
  };
}

async function establishFirstBlockedCycle(input) {
  const firstAdvance = await advanceCard({
    fetchImpl: input.fetchImpl,
    baseUrl: input.baseUrl,
    portalOrigin: input.portalOrigin,
    sessionCookieName: input.sessionCookieName,
    sessionToken: input.sessionToken,
    cardId: input.cardId,
    state: "working"
  });
  if (!firstAdvance.ok) {
    return firstAdvance;
  }

  const firstBlock = await advanceCard({
    fetchImpl: input.fetchImpl,
    baseUrl: input.baseUrl,
    portalOrigin: input.portalOrigin,
    sessionCookieName: input.sessionCookieName,
    sessionToken: input.sessionToken,
    cardId: input.cardId,
    state: "blocked",
    resumeSummary: input.firstBlockSummary
  });
  if (!firstBlock.ok) {
    return firstBlock;
  }

  const firstAttentionBoard = await loadBoard({
    fetchImpl: input.fetchImpl,
    baseUrl: input.baseUrl,
    portalOrigin: input.portalOrigin,
    sessionCookieName: input.sessionCookieName,
    sessionToken: input.sessionToken,
    workflowId: input.workflowId
  });
  if (!firstAttentionBoard.ok) {
    return firstAttentionBoard;
  }

  return resolveAttentionContract({
    boardBody: firstAttentionBoard.body,
    baseUrl: input.baseUrl,
    expectedRunId: normalizeValue(firstAttentionBoard.body.runId),
    expectedCardId: input.cardId,
    expectedResolution: "unblock_lane"
  });
}

async function advanceCard(input) {
  const response = await input.fetchImpl(`${input.baseUrl}/api/harness/cards/${encodeURIComponent(input.cardId)}/advance`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `${input.sessionCookieName}=${input.sessionToken}`,
      origin: input.portalOrigin
    },
    body: JSON.stringify({
      state: input.state,
      ...(normalizeValue(input.resumeSummary) ? { resumeSummary: input.resumeSummary } : {})
    })
  });
  const body = await readJson(response);
  if (response.status !== 200 || normalizeValue(body?.cardId) !== input.cardId || normalizeValue(body?.state) !== input.state) {
    return {
      ok: false,
      phase: "card_advance_failed",
      notes: [
        "Advancing the proof lane through the bounded child-card seam did not return the expected response.",
        `Observed HTTP status ${response.status} with state ${normalizeValue(body?.state) ?? "missing"}.`
      ]
    };
  }

  return { ok: true };
}

function resolveAttentionContract(input) {
  const pendingAttention = input.boardBody?.pendingAttention;
  if (!pendingAttention || typeof pendingAttention !== "object") {
    return {
      ok: false,
      phase: "attention_missing",
      notes: [
        "The live board did not expose pending attention after the proof lane entered the blocked state.",
        "The cycle-refresh seam cannot be proven without the current resolve-attention contract."
      ]
    };
  }

  if (normalizeValue(input.boardBody?.runId) !== input.expectedRunId) {
    return {
      ok: false,
      phase: "attention_run_mismatch",
      notes: [
        "The live board response did not return the expected run while inspecting pending attention.",
        `Expected run ${input.expectedRunId} before validating the resolve-attention contract.`
      ]
    };
  }

  if (normalizeValue(pendingAttention.targetCardId) !== input.expectedCardId) {
    return {
      ok: false,
      phase: "attention_target_mismatch",
      notes: [
        "The live board pending attention points at a different card than the bounded proof lane.",
        "The proof stops here instead of mutating attention that belongs to another lane."
      ]
    };
  }

  if (normalizeValue(pendingAttention.actionRoute) !== "resolve-attention") {
    return {
      ok: false,
      phase: "attention_route_invalid",
      notes: [
        "The live board did not expose the bounded resolve-attention route for the blocked proof lane.",
        "The proof cannot continue through any broader or different action contract."
      ]
    };
  }

  const actionHandle = normalizeValue(pendingAttention.actionHandle);
  const actionPath = normalizeValue(pendingAttention.actionPath);
  if (!actionHandle || !actionPath) {
    return {
      ok: false,
      phase: "attention_contract_incomplete",
      notes: [
        "The live board exposed pending attention without a usable action handle or action path.",
        "The proof cannot continue without the full bounded resolve-attention contract."
      ]
    };
  }

  const allowedResolutions = Array.isArray(pendingAttention.allowedResolutions)
    ? pendingAttention.allowedResolutions.filter((entry) => typeof entry === "string")
    : [];
  if (!allowedResolutions.includes(input.expectedResolution)) {
    return {
      ok: false,
      phase: "attention_resolution_invalid",
      notes: [
        "The live board did not allow the expected bounded unblock resolution for the blocked proof lane.",
        `Expected allowedResolutions to include ${input.expectedResolution}.`
      ]
    };
  }

  const actionUrl = new URL(actionPath, input.baseUrl);
  if (
    actionUrl.origin !== input.baseUrl ||
    actionUrl.pathname !== `/api/harness/runs/${input.expectedRunId}/resolve-attention` ||
    (actionUrl.search ?? "") !== "" ||
    (actionUrl.hash ?? "") !== ""
  ) {
    return {
      ok: false,
      phase: "attention_path_invalid",
      notes: [
        "The live board exposed a resolve-attention path outside the bounded same-origin run contract.",
        `Expected /api/harness/runs/${input.expectedRunId}/resolve-attention on ${input.baseUrl}.`
      ]
    };
  }

  return {
    ok: true,
    actionHandle,
    actionUrl
  };
}

async function resolveAttention(input) {
  const response = await input.fetchImpl(input.actionUrl.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `${input.sessionCookieName}=${input.sessionToken}`,
      origin: input.portalOrigin
    },
    body: JSON.stringify({
      resolution: input.resolution,
      actionHandle: input.actionHandle,
      ...(normalizeValue(input.resumeSummary) ? { resumeSummary: input.resumeSummary } : {})
    })
  });
  const body = await readJson(response);
  const expectedStatus = input.resolution === "resume_lane" ? "resumed" : "unblocked";

  if (response.status === 200 && normalizeValue(body?.status) === expectedStatus) {
    return {
      ok: true,
      status: response.status,
      body
    };
  }

  return {
    ok: false,
    phase: "attention_resolution_failed",
    notes: [
      "Submitting the bounded resolve-attention action did not return the expected successful response.",
      `Observed HTTP status ${response.status} with action status ${normalizeValue(body?.status) ?? "missing"}.`
    ],
    status: response.status,
    body
  };
}

function failureFromStep(step, extra = {}) {
  return {
    ok: false,
    phase: step.phase,
    notes: step.notes,
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

function findReusableApprovedCard({ boardBody, persona, title, deliverableType }) {
  if (!Array.isArray(boardBody?.cards)) {
    return null;
  }

  const normalizedPersona = normalizeValue(persona)?.toLowerCase();
  const normalizedTitle = normalizeValue(title);
  const expectedDeliverableLabel = humanizeDeliverableType(deliverableType);
  if (!normalizedPersona || !normalizedTitle || !expectedDeliverableLabel) {
    return null;
  }

  return boardBody.cards.find((card) =>
    normalizeValue(card?.persona)?.toLowerCase() === normalizedPersona &&
    normalizeValue(card?.title) === normalizedTitle &&
    normalizeValue(card?.statusLabel)?.toLowerCase() === "approved" &&
    normalizeValue(card?.deliverableLabel) === expectedDeliverableLabel &&
    normalizeValue(card?.id)
  ) ?? null;
}

function resolveMatchingBlockedAttention({ boardBody, baseUrl, workflowId, persona, title, deliverableType }) {
  const pendingAttention = boardBody?.pendingAttention;
  if (!pendingAttention || typeof pendingAttention !== "object") {
    return { ok: false };
  }

  const targetCardId = normalizeValue(pendingAttention.targetCardId);
  const expectedTitle = normalizeValue(title);
  const expectedPersona = normalizeValue(persona)?.toLowerCase();
  const expectedDeliverableLabel = humanizeDeliverableType(deliverableType);
  if (!targetCardId || !expectedTitle || !expectedPersona || !expectedDeliverableLabel) {
    return { ok: false };
  }

  if (
    normalizeValue(boardBody.workflowId) !== workflowId ||
    normalizeValue(pendingAttention.kind) !== "await_unblock" ||
    normalizeValue(pendingAttention.runState) !== "blocked" ||
    normalizeValue(pendingAttention.targetTitle) !== expectedTitle ||
    normalizeValue(pendingAttention.targetPersona)?.toLowerCase() !== expectedPersona
  ) {
    return { ok: false };
  }

  const matchingCard = Array.isArray(boardBody.cards)
    ? boardBody.cards.find((card) =>
        normalizeValue(card?.id) === targetCardId &&
        normalizeValue(card?.title) === expectedTitle &&
        normalizeValue(card?.persona)?.toLowerCase() === expectedPersona &&
        normalizeValue(card?.deliverableLabel) === expectedDeliverableLabel
      )
    : null;
  if (!matchingCard) {
    return { ok: false };
  }

  const contract = resolveAttentionContract({
    boardBody,
    baseUrl,
    expectedRunId: normalizeValue(boardBody.runId),
    expectedCardId: targetCardId,
    expectedResolution: "unblock_lane"
  });
  if (!contract.ok) {
    return { ok: false };
  }

  return {
    ok: true,
    cardId: targetCardId,
    actionHandle: contract.actionHandle,
    actionUrl: contract.actionUrl
  };
}

function humanizeDeliverableType(value) {
  const normalized = normalizeValue(value);
  if (!normalized) {
    return null;
  }

  return normalized
    .split("_")
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
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
