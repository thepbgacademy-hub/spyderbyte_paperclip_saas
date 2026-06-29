import { loadWorkflowRunSnapshot } from "./live-run-drive.mjs";

export async function waitForNativeExecutionAcceptance(input) {
  const loadState = input.loadState ?? ((snapshotInput) => loadWorkflowRunSnapshot({
    client: input.client,
    tenantId: snapshotInput.tenantId,
    runId: snapshotInput.runId
  }));
  const sleepImpl = input.sleepImpl ?? sleep;
  const pollIntervalMs = Number.isFinite(input.pollIntervalMs) ? Math.max(0, input.pollIntervalMs) : 250;
  const maxAttempts = Number.isInteger(input.maxAttempts) && input.maxAttempts > 0 ? input.maxAttempts : 20;
  const postAttemptedAt = requireTimestamp(input.postAttemptedAt, "postAttemptedAt");
  const allowFreshExecutionClaimAsTerminal = input.allowFreshExecutionClaimAsTerminal !== false;

  let state = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    state = await loadState({
      tenantId: input.tenantId,
      runId: input.runId,
      attempt
    });

    const acceptance = summarizeNativeExecutionAcceptance(state, postAttemptedAt, {
      expectedBlockedArtifactName: normalizeValue(input.expectedBlockedArtifactName),
      allowFreshExecutionClaimAsTerminal
    });
    if (acceptance.terminal) {
      return {
        ok: acceptance.ok,
        phase: acceptance.phase,
        attempts: attempt,
        runId: input.runId,
        state,
        notes: acceptance.notes
      };
    }

    if (attempt < maxAttempts) {
      await sleepImpl(pollIntervalMs);
    }
  }

  return {
    ok: false,
    phase: "native_advancement_timeout",
    attempts: maxAttempts,
    runId: input.runId,
    state,
    notes: [
      "Timed out before durable state proved a bounded native-execution advancement.",
      `Last observed run status: ${describeStatus(state?.run?.status)}. Last observed outbox status: ${describeStatus(state?.outbox?.status)}. Last observed committed outcome: ${describeStatus(state?.event?.payload?.outcomeState)}.`
    ]
  };
}

function summarizeNativeExecutionAcceptance(state, postAttemptedAt, options = {}) {
  const event = state?.event;
  const eventOutcomeState = normalizeValue(event?.payload?.outcomeState);
  const blockedArtifactAcceptance = summarizeBlockedArtifactAcceptance(eventOutcomeState, event?.payload, options.expectedBlockedArtifactName);
  if (
    normalizeValue(event?.eventKind) === "execution_outcome_committed" &&
    eventOutcomeState &&
    isAcceptedOutcomeState(eventOutcomeState) &&
    blockedArtifactAcceptance.accepted &&
    isFreshTimestamp(event?.createdAt, postAttemptedAt) &&
    isNonChiefExecutivePersona(event?.persona)
  ) {
    return {
      terminal: true,
      ok: true,
      phase: `native_${eventOutcomeState}_reached`,
      notes: [
        "The queued run advanced into bounded native execution.",
        `A fresh execution_outcome_committed event for the bootstrapped non-CEO lane recorded outcomeState ${eventOutcomeState} after the current POST attempt.`
      ].concat(buildProviderRequestBlockedNotes(eventOutcomeState, event?.payload)).concat(blockedArtifactAcceptance.notes)
    };
  }

  const lane = state?.lane;
  if (
    lane &&
    Number.isInteger(lane.laneCount) &&
    lane.laneCount === 1 &&
    normalizeValue(lane.state) === "working" &&
    isFreshTimestamp(lane.executionClaimedAt, postAttemptedAt) &&
    isNonChiefExecutivePersona(lane.persona) &&
    options.allowFreshExecutionClaimAsTerminal !== false
  ) {
    return {
      terminal: true,
      ok: true,
      phase: "native_execution_claimed",
      notes: [
        "The queued run advanced into bounded native execution.",
        "The bootstrapped non-CEO lane recorded a fresh worker claim after the current POST attempt."
      ]
    };
  }

  const outboxStatus = normalizeValue(state?.outbox?.status);
  if (outboxStatus === "failed") {
    return {
      terminal: true,
      ok: false,
      phase: "outbox_failed",
      notes: [
        "Durable queue state failed before native execution advancement was proven.",
        `Last outbox error: ${normalizeValue(state?.outbox?.lastError) ?? "unknown"}`
      ]
    };
  }

  const runStatus = normalizeValue(state?.run?.status);
  if (runStatus === "failed") {
    return {
      terminal: true,
      ok: false,
      phase: "workflow_failed",
      notes: [
        "The workflow run failed before durable native execution advancement was proven.",
        "This proof cannot claim acceptance from a failed durable run."
      ]
    };
  }

  return {
    terminal: false
  };
}

function normalizeValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function describeStatus(value) {
  return normalizeValue(value) ?? "missing";
}

function isAcceptedOutcomeState(value) {
  return value === "waiting" || value === "blocked" || value === "done" || value === "cancelled";
}

function isNonChiefExecutivePersona(value) {
  const normalized = normalizeValue(value);
  return normalized !== null && normalized.toLowerCase() !== "ceo";
}

function isFreshTimestamp(value, floor) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) && timestamp > floor;
}

function buildProviderRequestBlockedNotes(outcomeState, payload) {
  if (outcomeState !== "blocked") {
    return [];
  }

  const continuitySummary = normalizeValue(payload?.continuitySummary);
  if (!continuitySummary) {
    return [];
  }

  const lowerSummary = continuitySummary.toLowerCase();
  const matchesProviderRequestFailure =
    lowerSummary.includes("provider rejected the request with http") ||
    lowerSummary.includes("provider request failed before a usable response was returned");

  return matchesProviderRequestFailure ? [`Blocked outcome summary: ${continuitySummary}`] : [];
}

function summarizeBlockedArtifactAcceptance(outcomeState, payload, expectedBlockedArtifactName) {
  if (outcomeState !== "blocked" || !expectedBlockedArtifactName) {
    return {
      accepted: true,
      notes: []
    };
  }

  const continuitySummary = normalizeValue(payload?.continuitySummary);
  if (!continuitySummary || !continuitySummary.includes(expectedBlockedArtifactName)) {
    return {
      accepted: false,
      notes: []
    };
  }

  return {
    accepted: true,
    notes: [`Blocked outcome named the expected prerequisite artifact: ${expectedBlockedArtifactName}.`]
  };
}

function requireTimestamp(value, label) {
  const timestamp = Date.parse(String(value ?? ""));
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Expected ${label} to be an ISO timestamp`);
  }
  return timestamp;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
