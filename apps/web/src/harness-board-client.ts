import type { HarnessBoardResponse } from "../../../src/harness/board-service.js";
export type { HarnessBoardResponse } from "../../../src/harness/board-service.js";

export type HarnessBoardActionResult =
  | { status: "approved"; cardId: string }
  | { status: "deferred" }
  | { status: "denied" }
  | { status: "done"; runId: string }
  | { status: "fresh_cycle_started"; runId: string; reopenedProposalCount: number }
  | { status: "resumed"; cardId: string; state: "working" }
  | { status: "unblocked"; cardId: string; state: "approved" };

export type HarnessBoardControlMode = "live" | "preview";
export type HarnessBoardFallbackVariant = "review-attention" | "resolve-attention";
export type HarnessBoardFallbackState = {
  board: HarnessBoardResponse;
  controlMode: HarnessBoardControlMode;
  variant: HarnessBoardFallbackVariant;
  variantLabel: string;
};

export type HarnessBoardClientErrorCode =
  | "conflict"
  | "invalid_request"
  | "not_found"
  | "rate_limited"
  | "request_rejected"
  | "service_unavailable"
  | "timed_out"
  | "unauthorized"
  | "unknown";

export class HarnessBoardClientError extends Error {
  readonly code: HarnessBoardClientErrorCode;
  readonly status: number;
  readonly retryAfterSeconds: number | null;

  constructor(input: {
    code: HarnessBoardClientErrorCode;
    message: string;
    status: number;
    retryAfterSeconds?: number | null;
  }) {
    super(input.message);
    this.name = "HarnessBoardClientError";
    this.code = input.code;
    this.status = input.status;
    this.retryAfterSeconds = input.retryAfterSeconds ?? null;
  }
}

const fallbackBoardBase: HarnessBoardResponse = {
  runId: "harness-browser-fallback",
  workflowId: "wf_connect_first_workflow",
  packageId: "pkg_bib_connect",
  columns: [
    {
      id: "planning",
      title: "Planning",
      description: "Work being shaped by the orchestrator.",
      cardIds: ["card-ceo-plan"]
    },
    {
      id: "working",
      title: "Working",
      description: "Active persona lanes moving the run forward.",
      cardIds: ["card-cfo-forecast"]
    },
    {
      id: "done",
      title: "Done",
      description: "Completed outputs ready for review.",
      cardIds: ["card-coo-handoff"]
    }
  ],
  cards: [
    {
      id: "card-ceo-plan",
      persona: "CEO",
      title: "Shape the launch plan",
      summary: "Clarify the first three moves, tighten the promise, and hand the team a clear sequence.",
      lane: "planning",
      statusLabel: "Planning",
      priorityLabel: "High priority",
      deliverableLabel: "Launch Plan",
      updatedAtLabel: "Updated recently",
      outcome: "The launch path is narrowed to a clean three-step sequence ready for approval.",
      focusPoints: [
        "Define the opening offer",
        "Keep the next three decisions visible",
        "Avoid extra card fan-out"
      ],
      activity: [
        {
          id: "activity-ceo-fallback",
          label: "CEO is maintaining a bounded launch-planning lane for the current board.",
          timestampLabel: "recently"
        }
      ],
      detailSections: [
        {
          id: "snapshot",
          title: "Snapshot",
          body: "This fallback board keeps the shell usable during static web development without exposing backend mechanics."
        }
      ]
    },
    {
      id: "card-cfo-forecast",
      persona: "CFO",
      title: "Pressure-test the pricing lane",
      summary: "Check margin resilience and isolate the one pricing decision that still needs review.",
      lane: "working",
      statusLabel: "Working",
      priorityLabel: "Active",
      deliverableLabel: "Pricing Review",
      updatedAtLabel: "Updated recently",
      outcome: "Margin assumptions are holding with one discount edge case still waiting on approval.",
      focusPoints: [
        "Review floor price",
        "Flag discount sensitivity",
        "Keep the model summary readable"
      ],
      activity: [
        {
          id: "activity-cfo-fallback",
          label: "CFO is keeping the pricing lane current inside the approved workflow boundary.",
          timestampLabel: "recently"
        }
      ],
      detailSections: [
        {
          id: "readout",
          title: "Readout",
          body: "The business takeaway is stable enough to guide a decision without surfacing tool chatter."
        }
      ]
    },
    {
      id: "card-coo-handoff",
      persona: "COO",
      title: "Prepare the fulfillment handoff",
      summary: "Package the first delivery lane so execution can start without follow-up churn.",
      lane: "done",
      statusLabel: "Done",
      priorityLabel: "Ready",
      deliverableLabel: "Ops Handoff",
      updatedAtLabel: "Updated recently",
      outcome: "Fulfillment steps are packaged into a clean operational checklist for the first client wave.",
      focusPoints: [
        "Confirm owners",
        "Reduce handoff friction",
        "Keep the checklist customer-safe"
      ],
      activity: [
        {
          id: "activity-coo-fallback",
          label: "COO closed the handoff loop and kept the board readable for the tenant.",
          timestampLabel: "recently"
        }
      ],
      detailSections: [
        {
          id: "delivery-summary",
          title: "Delivery summary",
          body: "The handoff is complete and shown as business progress instead of backend process noise."
        }
      ]
    }
  ],
  pendingApprovals: [
    {
      id: "proposal-fallback-1",
      title: "Gather competitor price anchors",
      requestedByPersona: "CFO",
      targetPersona: "RESEARCHER",
      deliverableLabel: "Research Brief",
      statusLabel: "Pending CEO approval",
      actionRoute: "proposal-decision",
      actionPath: "/api/harness/proposals/proposal-fallback-1/decision",
      actionMethod: "POST",
      actionLabel: "Review proposal decision",
      actionDescription: "Choose whether this proposed follow-on work should be approved, deferred, or denied.",
      requestFields: [
        {
          name: "decision",
          label: "Proposal decision",
          description: "Choose whether this proposed follow-on work should be approved, deferred, or denied.",
          required: true,
          allowedValues: ["approve", "defer", "deny"]
        },
        {
          name: "decisionNote",
          label: "Decision note",
          description: "Add a short note when the CEO wants the review trail to capture why this proposal changed direction.",
          required: false,
          supportedWhenValue: "defer"
        }
      ],
      actionOptions: [
        {
          value: "approve",
          label: "Approve proposal",
          description: "Approve this work so it can move into the bounded execution flow.",
          emphasis: "primary",
          nextEffectSummary: "This proposal can move into the bounded execution flow and open or advance the intended lane.",
          exampleRequest: { decision: "approve" }
        },
        {
          value: "defer",
          label: "Defer proposal",
          description: "Pause this follow-on work until the current board cycle is ready to widen safely.",
          emphasis: "secondary",
          nextEffectSummary: "This proposal stays visible for later CEO review without opening or advancing a new lane yet.",
          exampleRequest: { decision: "defer" }
        },
        {
          value: "deny",
          label: "Deny proposal",
          description: "Reject this follow-on work when it should not expand the current board cycle.",
          emphasis: "caution",
          nextEffectSummary: "This proposal closes without opening or advancing any new work lane.",
          requiresConfirmation: true,
          confirmationLabel: "Deny this proposal and close the follow-on request?",
          exampleRequest: { decision: "deny" }
        }
      ],
      recommendedOptionValue: "approve",
      allowedDecisions: ["approve", "defer", "deny"],
      policyReasonLabel: "Review for expansion",
      nextReviewTrigger: "Revisit when the CEO is ready to widen the pricing work.",
      lastDecisionAtLabel: "recently"
    }
  ],
  pendingAttention: {
    kind: "queue_ceo_review",
    runState: "assembling",
    statusLabel: "CEO review required",
    summary: "The board is ready for final assembly before the tenant-facing package is closed.",
    actionRoute: "review-attention",
    actionPath: "/api/harness/runs/harness-browser-fallback/review-attention",
    actionMethod: "POST",
    actionLabel: "Review final assembly",
    actionDescription: "Finish the current board cycle or intentionally start the next one.",
    requestFields: [
      {
        name: "decision",
        label: "Review decision",
        description: "Choose whether to close the current board cycle or start the next one.",
        required: true,
        allowedValues: ["complete_run", "start_fresh_cycle"]
      },
      {
        name: "mode",
        label: "Fresh-cycle mode",
        description: "Choose whether the next cycle should reopen deferred work or start clean.",
        required: false,
        supportedWhenValue: "start_fresh_cycle",
        allowedValues: ["reopen_deferred", "clean"],
        suggestedValue: "reopen_deferred"
      }
    ],
    actionOptions: [
      {
        value: "complete_run",
        label: "Complete run",
        description: "Close the current board cycle and package the current business outcome.",
        emphasis: "primary",
        nextEffectSummary: "The current run closes as done and the tenant-facing package stays on this board cycle.",
        exampleRequest: { decision: "complete_run" }
      },
      {
        value: "start_fresh_cycle",
        label: "Start fresh cycle",
        description: "Open the next board cycle from this run, with or without reopening deferred work.",
        emphasis: "secondary",
        nextEffectSummary: "A new run starts from this board, optionally carrying deferred follow-on work into the next cycle.",
        requiresConfirmation: true,
        confirmationLabel: "Start a new board cycle from this run?",
        exampleRequest: { decision: "start_fresh_cycle", mode: "reopen_deferred" }
      }
    ],
    recommendedOptionValue: "complete_run",
    allowedDecisions: ["complete_run", "start_fresh_cycle"],
    requestedAtLabel: "recently",
    reasonLabel: "Final assembly"
  },
  followThroughItems: [
    {
      id: "follow-through-fallback-1",
      action: "opened_lane",
      summary: "CEO opened a new pricing review lane for CFO.",
      timestampLabel: "recently",
      persona: "CFO",
      deliverableLabel: "Pricing Review"
    }
  ],
  recentDecisions: [
    {
      id: "decision-fallback-1",
      decisionKind: "lane_opened",
      label: "CEO opened a new pricing review lane.",
      resolution: "create_lane",
      policyReasonLabel: "New lane approved",
      recommendationSummary: "Open a dedicated pricing review lane for CFO.",
      timestampLabel: "recently"
    }
  ],
  completionPackage: {
    status: "assembling",
    summary: "The current board package is almost ready, with one bounded governance question still shaping the handoff.",
    deferredApprovalCount: 1,
    hasOpenGovernanceItems: true,
    packageNote: "Keep the pricing handoff readable while the research expansion stays under review.",
    recommendations: [
      "Carry the current pricing review into the tenant-facing handoff.",
      "Revisit research expansion only after the CEO closes the current package."
    ],
    objections: ["Do not widen the board cycle until the current pricing decision is packaged cleanly."],
    governanceItems: [
      {
        proposalId: "proposal-fallback-1",
        statusLabel: "Pending CEO approval",
        persona: "RESEARCHER",
        deliverableLabel: "Research Brief",
        policyReasonLabel: "Review for expansion",
        recommendationSummary: "Approve only when the current pricing board package is stable.",
        nextReviewTrigger: "Revisit when the CEO is ready to widen the pricing work."
      }
    ],
    deliverables: [
      {
        cardId: "card-cfo-forecast",
        persona: "CFO",
        title: "Pressure-test the pricing lane",
        deliverableLabel: "Pricing Review",
        outcome: "Margin assumptions are holding with one discount edge case still waiting on approval."
      },
      {
        cardId: "card-coo-handoff",
        persona: "COO",
        title: "Prepare the fulfillment handoff",
        deliverableLabel: "Ops Handoff",
        outcome: "Fulfillment steps are packaged into a clean operational checklist for the first client wave."
      }
    ]
  }
};

const fallbackBoardResponses: Record<HarnessBoardFallbackVariant, HarnessBoardResponse> = {
  "review-attention": fallbackBoardBase,
  "resolve-attention": {
    ...fallbackBoardBase,
    runId: "harness-browser-fallback-resolve",
    pendingAttention: {
      kind: "await_lane_resume",
      runState: "waiting",
      statusLabel: "Waiting on lane resume",
      summary: "Resume the pricing lane once the tenant confirms the updated revenue assumption.",
      actionRoute: "resolve-attention",
      actionPath: "/api/harness/runs/harness-browser-fallback-resolve/resolve-attention",
      actionMethod: "POST",
      actionLabel: "Resume lane",
      actionDescription: "Resume the waiting lane when the required board input is ready.",
      requestFields: [
        {
          name: "command",
          label: "Resolution command",
          description: "Choose the single bounded command that resolves this attention state.",
          required: true,
          allowedValues: ["resume_lane"]
        },
        {
          name: "resumeSummary",
          label: "Resume summary",
          description: "Optional tenant-safe note describing what changed before execution resumes.",
          required: false
        }
      ],
      actionOptions: [
        {
          value: "resume_lane",
          label: "Resume lane",
          description: "Return the lane to active execution with an optional bounded resume note.",
          emphasis: "primary",
          nextEffectSummary: "The lane returns to active execution and re-enters the worker queue through the existing harness path.",
          exampleRequest: { command: "resume_lane" }
        }
      ],
      recommendedOptionValue: "resume_lane",
      allowedCommands: ["resume_lane"],
      requestedAtLabel: "recently",
      reasonLabel: "Awaiting tenant confirmation",
      targetCardId: "card-cfo-forecast",
      targetPersona: "CFO",
      targetTitle: "Pressure-test the pricing lane",
      targetSummary: "Resume CFO lane: Pressure-test the pricing lane"
    }
  }
};

const fallbackVariantLabels: Record<HarnessBoardFallbackVariant, string> = {
  "review-attention": "Final assembly review",
  "resolve-attention": "Lane resume"
};

const DEFAULT_HARNESS_BOARD_REQUEST_TIMEOUT_MS = 8_000;

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function parseHarnessFallbackVariant(search: string | undefined): HarnessBoardFallbackVariant {
  if (typeof search !== "string" || search.length === 0) {
    return "review-attention";
  }

  const params = new URLSearchParams(search);
  const requestedVariant = params.get("harnessPreview");
  return requestedVariant === "resolve-attention" ? "resolve-attention" : "review-attention";
}

function isHarnessBoardErrorCode(value: unknown): value is HarnessBoardClientErrorCode {
  return [
    "conflict",
    "invalid_request",
    "not_found",
    "rate_limited",
    "request_rejected",
    "service_unavailable",
    "unauthorized",
    "unknown"
  ].includes(String(value));
}

async function readHarnessError(response: Response, fallbackMessage: string) {
  let parsedCode: HarnessBoardClientErrorCode = "unknown";

  try {
    const errorBody = (await response.json()) as { code?: unknown };
    if (isHarnessBoardErrorCode(errorBody?.code)) {
      parsedCode = errorBody.code;
    }
  } catch {
    parsedCode = "unknown";
  }

  const retryAfterValue = response.headers.get("retry-after");
  const retryAfterSeconds =
    typeof retryAfterValue === "string" && retryAfterValue.trim().length > 0
      ? Number.parseInt(retryAfterValue, 10)
      : Number.NaN;

  throw new HarnessBoardClientError({
    code: parsedCode,
    message: fallbackMessage,
    status: response.status,
    retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null
  });
}

export function createHarnessBoardClient(
  fetchImpl: typeof fetch = fetch,
  browserWindow: Pick<Window, "location"> | undefined = typeof window === "undefined" ? undefined : window,
  options: { requestTimeoutMs?: number } = {}
) {
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_HARNESS_BOARD_REQUEST_TIMEOUT_MS;
  const fallbackVariant = parseHarnessFallbackVariant(browserWindow?.location.search);
  const fallbackState: HarnessBoardFallbackState = {
    board: fallbackBoardResponses[fallbackVariant],
    controlMode: "preview",
    variant: fallbackVariant,
    variantLabel: fallbackVariantLabels[fallbackVariant]
  };

  async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      return await fetchImpl(input, {
        ...init,
        signal: controller.signal
      });
    } catch (error) {
      if (
        typeof error === "object"
        && error !== null
        && "name" in error
        && error.name === "AbortError"
      ) {
        throw new HarnessBoardClientError({
          code: "timed_out",
          message: "Harness board request timed out",
          status: 408
        });
      }

      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  async function submitAction(
    actionPath: string,
    body: Record<string, unknown>,
    actionMethod: "POST" = "POST"
  ): Promise<HarnessBoardActionResult> {
    const response = await fetchWithTimeout(actionPath, {
      method: actionMethod,
      credentials: "include",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      await readHarnessError(response, "Unable to update harness board");
    }

    return (await response.json()) as HarnessBoardActionResult;
  }

  function isBrowserFallbackEnabled(): boolean {
    return Boolean(browserWindow && isLoopbackHost(browserWindow.location.hostname));
  }

  return {
    isBrowserFallbackEnabled,

    getFallback(): HarnessBoardResponse {
      return fallbackState.board;
    },

    getFallbackState(): HarnessBoardFallbackState {
      return fallbackState;
    },

    async fetchBoard(): Promise<HarnessBoardResponse> {
      const response = await fetchWithTimeout("/api/harness/board", {
        credentials: "include"
      });
      if (!response.ok) {
        await readHarnessError(response, "Unable to load harness board");
      }

      return (await response.json()) as HarnessBoardResponse;
    },

    submitAction
  };
}
