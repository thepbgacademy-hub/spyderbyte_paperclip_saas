import { describe, expect, it, vi } from "vitest";

import { ApiAuthError } from "../src/api/dashboard-api.js";
import {
  HarnessCardCreationConflictError,
  HarnessCardProgressionConflictError,
  HarnessRunCycleConflictError
} from "../src/harness/board-service.js";
import { createHarnessHttpHandler } from "../src/api/harness-http.js";

describe("harness HTTP boundary", () => {
  it("rejects untrusted origins before resolving board data", async () => {
    const listBoardState = vi.fn();
    const createTopLevelChildCard = vi.fn();
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState,
      createTopLevelChildCard,
      advanceChildCard: vi.fn(),
      decideProposal: vi.fn(),
      completeRun: vi.fn(),
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: 1 }) }
    });

    const response = await handler({
      method: "GET",
      path: "/api/harness/board",
      headers: { origin: "https://evil.example", authorization: "Bearer valid" },
      bodyByteLength: 0,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(403);
    expect(listBoardState).not.toHaveBeenCalled();
  });

  it("returns high-level board data without backend chatter fields", async () => {
    const listBoardState = vi.fn().mockResolvedValue({
      runId: "run_123",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      columns: [
        {
          id: "planning",
          title: "Planning",
          description: "Work being shaped by the orchestrator.",
          cardIds: ["card_1"]
        }
      ],
      cards: [
        {
          id: "card_1",
          persona: "CEO",
          title: "Plan run",
          summary: "Keep the business-facing board clean and bounded.",
          lane: "planning",
          statusLabel: "Planning",
          priorityLabel: "High priority",
          deliverableLabel: "Launch Plan",
          updatedAtLabel: "Updated recently",
          outcome: "The next move is being shaped without backend chatter.",
          focusPoints: ["Stay bounded", "Keep it clear", "Protect tenant context"],
          activity: [
            {
              id: "activity_1",
              label: "CEO opened the planning lane.",
              timestampLabel: "recently"
            }
          ],
          detailSections: [
            {
              id: "snapshot",
              title: "Snapshot",
              body: "This lane is ready to resume from persisted state."
            }
          ]
        }
      ],
      pendingApprovals: [],
      followThroughItems: [],
      recentDecisions: []
    });
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState,
      createTopLevelChildCard: vi.fn(),
      advanceChildCard: vi.fn(),
      decideProposal: vi.fn(),
      completeRun: vi.fn(),
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: 1 }) }
    });

    const response = await handler({
      method: "GET",
      path: "/api/harness/board",
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        cookie: "wf_session=abc"
      },
      bodyByteLength: 0,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("https://portal.wealthfactory.test");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.body).toEqual(await listBoardState.mock.results[0]?.value);
    expect(listBoardState).toHaveBeenCalledWith({
      authorization: "Bearer valid",
      cookie: "wf_session=abc"
    });
    expect(JSON.stringify(response.body)).not.toMatch(/tool[\s_-]?call|prompt|raw[\s_-]?activity|internal[\s_-]?log/i);
  });

  it("answers authenticated harness board preflight requests", async () => {
    const listBoardState = vi.fn();
    const createTopLevelChildCard = vi.fn();
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState,
      createTopLevelChildCard,
      advanceChildCard: vi.fn(),
      decideProposal: vi.fn(),
      completeRun: vi.fn(),
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: 1 }) }
    });

    const response = await handler({
      method: "OPTIONS",
      path: "/api/harness/board",
      headers: { origin: "https://portal.wealthfactory.test" },
      bodyByteLength: 0,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-methods"]).toContain("GET");
    expect(response.headers["access-control-allow-headers"]).toContain("authorization");
    expect(listBoardState).not.toHaveBeenCalled();
  });

  it("rate limits board requests before resolving data", async () => {
    const listBoardState = vi.fn();
    const createTopLevelChildCard = vi.fn();
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState,
      createTopLevelChildCard,
      advanceChildCard: vi.fn(),
      decideProposal: vi.fn(),
      completeRun: vi.fn(),
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: false, remaining: 0, resetAt: 1 }) }
    });

    const response = await handler({
      method: "GET",
      path: "/api/harness/board",
      headers: { origin: "https://portal.wealthfactory.test", authorization: "Bearer valid" },
      bodyByteLength: 0,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(429);
    expect(response.headers["retry-after"]).toBe("0");
    expect(listBoardState).not.toHaveBeenCalled();
  });

  it("distinguishes auth failures from internal service failures", async () => {
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn().mockRejectedValueOnce(new ApiAuthError()).mockRejectedValueOnce(new Error("db_down")),
      createTopLevelChildCard: vi.fn(),
      advanceChildCard: vi.fn(),
      decideProposal: vi.fn(),
      completeRun: vi.fn(),
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: 1 }) }
    });

    const baseRequest = {
      method: "GET" as const,
      path: "/api/harness/board",
      headers: { origin: "https://portal.wealthfactory.test", authorization: "Bearer valid" },
      bodyByteLength: 0,
      ip: "203.0.113.10"
    };

    const unauthorized = await handler(baseRequest);
    const serviceUnavailable = await handler(baseRequest);

    expect(unauthorized.status).toBe(401);
    expect(serviceUnavailable.status).toBe(500);
    expect(serviceUnavailable.body).toEqual({ code: "service_unavailable" });
  });

  it("approves a persisted proposal through the guarded write route", async () => {
    const decideProposal = vi.fn().mockResolvedValue({ status: "approved", cardId: "card_new_1" });
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      createTopLevelChildCard: vi.fn(),
      advanceChildCard: vi.fn(),
      decideProposal,
      completeRun: vi.fn(),
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) }
    });

    const response = await handler({
      method: "POST",
      path: "/api/harness/proposals/proposal_1/approve",
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        cookie: "wf_session=abc"
      },
      bodyByteLength: 0,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(200);
    expect(decideProposal).toHaveBeenCalledWith({
      proposalId: "proposal_1",
      authorization: "Bearer valid",
      cookie: "wf_session=abc",
      decision: "approve"
    });
    expect(response.body).toEqual({ status: "approved", cardId: "card_new_1" });
  });

  it("passes an explicit handoff target through the guarded proposal route", async () => {
    const decideProposal = vi.fn().mockResolvedValue({ status: "approved", cardId: "card_owner_1" });
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      createTopLevelChildCard: vi.fn(),
      advanceChildCard: vi.fn(),
      decideProposal,
      completeRun: vi.fn(),
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) }
    });

    const response = await handler({
      method: "POST",
      path: "/api/harness/proposals/proposal_1/decision",
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        cookie: "wf_session=abc",
        "content-type": "application/json"
      },
      body: {
        decision: "approve",
        targetCardId: "card_owner_1"
      },
      bodyByteLength: 64,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(200);
    expect(decideProposal).toHaveBeenCalledWith({
      proposalId: "proposal_1",
      authorization: "Bearer valid",
      cookie: "wf_session=abc",
      decision: "approve",
      targetCardId: "card_owner_1"
    });
    expect(response.body).toEqual({ status: "approved", cardId: "card_owner_1" });
  });

  it("accepts explicit defer decisions through the guarded proposal decision route", async () => {
    const decideProposal = vi.fn().mockResolvedValue({ status: "deferred" });
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      createTopLevelChildCard: vi.fn(),
      advanceChildCard: vi.fn(),
      decideProposal,
      completeRun: vi.fn(),
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) }
    });

    const response = await handler({
      method: "POST",
      path: "/api/harness/proposals/proposal_1/decision",
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        cookie: "wf_session=abc",
        "content-type": "application/json"
      },
      body: {
        decision: "defer",
        decisionNote: "Wait for the current lane to finish first."
      },
      bodyByteLength: 74,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(200);
    expect(decideProposal).toHaveBeenCalledWith({
      proposalId: "proposal_1",
      authorization: "Bearer valid",
      cookie: "wf_session=abc",
      decision: "defer",
      decisionNote: "Wait for the current lane to finish first."
    });
    expect(response.body).toEqual({ status: "deferred" });
  });

  it("maps a non-approved /approve outcome back to conflict semantics", async () => {
    const decideProposal = vi.fn().mockResolvedValue({ status: "denied" });
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      createTopLevelChildCard: vi.fn(),
      advanceChildCard: vi.fn(),
      decideProposal,
      completeRun: vi.fn(),
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) }
    });

    const response = await handler({
      method: "POST",
      path: "/api/harness/proposals/proposal_1/approve",
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        cookie: "wf_session=abc"
      },
      bodyByteLength: 0,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ code: "conflict" });
  });

  it("returns 404 for unknown proposal paths without burning the approval rate-limit bucket", async () => {
    const rateLimiter = { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) };
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      decideProposal: vi.fn(),
      createTopLevelChildCard: vi.fn(),
      advanceChildCard: vi.fn(),
      completeRun: vi.fn(),
      rateLimiter
    });

    const response = await handler({
      method: "POST",
      path: "/api/harness/proposals/proposal_1/reject",
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      body: {},
      bodyByteLength: 2,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(404);
    expect(rateLimiter.consume).not.toHaveBeenCalled();
  });

  it("creates a CEO direct child card through the single guarded mutation route", async () => {
    const createTopLevelChildCard = vi.fn().mockResolvedValue({ cardId: "card_new_2" });
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      decideProposal: vi.fn(),
      createTopLevelChildCard,
      advanceChildCard: vi.fn(),
      completeRun: vi.fn(),
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) }
    });

    const response = await handler({
      method: "POST",
      path: "/api/harness/cards",
      body: {
        persona: "cfo",
        title: "Pressure-test the pricing lane",
        deliverableType: "pricing_review"
      },
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        cookie: "wf_session=abc",
        "content-type": "application/json"
      },
      bodyByteLength: 89,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(200);
    expect(createTopLevelChildCard).toHaveBeenCalledWith({
      authorization: "Bearer valid",
      cookie: "wf_session=abc",
      persona: "cfo",
      title: "Pressure-test the pricing lane",
      deliverableType: "pricing_review"
    });
    expect(response.body).toEqual({ cardId: "card_new_2" });
  });

  it("rejects out-of-bound child-card personas and deliverables at the HTTP seam", async () => {
    const createTopLevelChildCard = vi.fn();
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      decideProposal: vi.fn(),
      createTopLevelChildCard,
      advanceChildCard: vi.fn(),
      completeRun: vi.fn(),
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) }
    });

    const response = await handler({
      method: "POST",
      path: "/api/harness/cards",
      body: {
        persona: "rogue_persona",
        title: "Open a surprise lane",
        deliverableType: "surprise_output"
      },
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      bodyByteLength: 84,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(400);
    expect(createTopLevelChildCard).not.toHaveBeenCalled();
  });

  it("maps mutation route failures without exposing backend details", async () => {
    const createTopLevelChildCard = vi
      .fn()
      .mockRejectedValueOnce(new ApiAuthError())
      .mockRejectedValueOnce(new HarnessCardCreationConflictError("duplicate"))
      .mockRejectedValueOnce(new Error("db_down"));
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      decideProposal: vi.fn(),
      createTopLevelChildCard,
      advanceChildCard: vi.fn(),
      completeRun: vi.fn(),
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) }
    });

    const baseRequest = {
      method: "POST" as const,
      path: "/api/harness/cards",
      body: {
        persona: "cfo",
        title: "Pressure-test the pricing lane",
        deliverableType: "pricing_review"
      },
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      bodyByteLength: 89,
      ip: "203.0.113.10"
    };

    const unauthorized = await handler(baseRequest);
    const conflict = await handler(baseRequest);
    const serviceUnavailable = await handler(baseRequest);

    expect(unauthorized.status).toBe(401);
    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual({ code: "conflict" });
    expect(serviceUnavailable.status).toBe(500);
    expect(serviceUnavailable.body).toEqual({ code: "service_unavailable" });
  });

  it("advances a persisted child card through the guarded write route", async () => {
    const advanceChildCard = vi.fn().mockResolvedValue({ cardId: "card_new_2", state: "working" });
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      decideProposal: vi.fn(),
      createTopLevelChildCard: vi.fn(),
      advanceChildCard,
      completeRun: vi.fn(),
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) }
    });

    const response = await handler({
      method: "POST",
      path: "/api/harness/cards/card_new_2/advance",
      body: {
        state: "working"
      },
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        cookie: "wf_session=abc",
        "content-type": "application/json"
      },
      bodyByteLength: 19,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(200);
    expect(advanceChildCard).toHaveBeenCalledWith({
      authorization: "Bearer valid",
      cookie: "wf_session=abc",
      cardId: "card_new_2",
      state: "working"
    });
    expect(response.body).toEqual({ cardId: "card_new_2", state: "working" });
  });

  it("maps child-card progression conflicts without exposing backend details", async () => {
    const advanceChildCard = vi
      .fn()
      .mockRejectedValueOnce(new ApiAuthError())
      .mockRejectedValueOnce(new HarnessCardProgressionConflictError("invalid transition"))
      .mockRejectedValueOnce(new Error("db_down"));
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      decideProposal: vi.fn(),
      createTopLevelChildCard: vi.fn(),
      advanceChildCard,
      completeRun: vi.fn(),
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) }
    });

    const baseRequest = {
      method: "POST" as const,
      path: "/api/harness/cards/card_new_2/advance",
      body: {
        state: "working"
      },
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      bodyByteLength: 19,
      ip: "203.0.113.10"
    };

    const unauthorized = await handler(baseRequest);
    const conflict = await handler(baseRequest);
    const serviceUnavailable = await handler(baseRequest);

    expect(unauthorized.status).toBe(401);
    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual({ code: "conflict" });
    expect(serviceUnavailable.status).toBe(500);
    expect(serviceUnavailable.body).toEqual({ code: "service_unavailable" });
  });

  it("rejects unsupported child-card states while allowing parsed-body result summaries", async () => {
    const advanceChildCard = vi.fn();
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      decideProposal: vi.fn(),
      createTopLevelChildCard: vi.fn(),
      advanceChildCard,
      completeRun: vi.fn(),
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) }
    });

    const invalidState = await handler({
      method: "POST",
      path: "/api/harness/cards/card_new_2/advance",
      body: {
        state: "invented"
      },
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      bodyByteLength: 20,
      ip: "203.0.113.10"
    });

    const querySummary = await handler({
      method: "POST",
      path: "/api/harness/cards/card_new_2/advance",
      body: {
        state: "done",
        resultSummary: "Keep this off the URL surface."
      },
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      bodyByteLength: 64,
      ip: "203.0.113.10"
    });

    expect(invalidState.status).toBe(400);
    expect(querySummary.status).toBe(200);
    expect(advanceChildCard).toHaveBeenCalledTimes(1);
  });

  it("completes an assembling run through the guarded write route", async () => {
    const completeRun = vi.fn().mockResolvedValue({ runId: "run_123", state: "done" });
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      decideProposal: vi.fn(),
      createTopLevelChildCard: vi.fn(),
      advanceChildCard: vi.fn(),
      completeRun,
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) }
    });

    const response = await handler({
      method: "POST",
      path: "/api/harness/runs/run_123/complete",
      body: {
        completionSummary: "The CEO packaged the final business-facing outcome."
      },
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        cookie: "wf_session=abc",
        "content-type": "application/json"
      },
      bodyByteLength: 77,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(200);
    expect(completeRun).toHaveBeenCalledWith({
      authorization: "Bearer valid",
      cookie: "wf_session=abc",
      runId: "run_123",
      completionSummary: "The CEO packaged the final business-facing outcome."
    });
    expect(response.body).toEqual({ runId: "run_123", state: "done" });
  });

  it("starts a fresh board cycle through the guarded write route", async () => {
    const startFreshCycle = vi.fn().mockResolvedValue({ runId: "run_124", reopenedProposalCount: 2 });
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      decideProposal: vi.fn(),
      createTopLevelChildCard: vi.fn(),
      advanceChildCard: vi.fn(),
      completeRun: vi.fn(),
      startFreshCycle,
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) }
    });

    const response = await handler({
      method: "POST",
      path: "/api/harness/runs/run_123/fresh-cycle",
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        cookie: "wf_session=abc"
      },
      bodyByteLength: 0,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(200);
    expect(startFreshCycle).toHaveBeenCalledWith({
      authorization: "Bearer valid",
      cookie: "wf_session=abc",
      runId: "run_123"
    });
    expect(response.body).toEqual({ runId: "run_124", reopenedProposalCount: 2 });
  });

  it("maps fresh-cycle conflicts without exposing backend details", async () => {
    const startFreshCycle = vi
      .fn()
      .mockRejectedValueOnce(new ApiAuthError())
      .mockRejectedValueOnce(new HarnessRunCycleConflictError("not packaged"))
      .mockRejectedValueOnce(new Error("db_down"));
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      decideProposal: vi.fn(),
      createTopLevelChildCard: vi.fn(),
      advanceChildCard: vi.fn(),
      completeRun: vi.fn(),
      startFreshCycle,
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) }
    });

    const baseRequest = {
      method: "POST" as const,
      path: "/api/harness/runs/run_123/fresh-cycle",
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid"
      },
      bodyByteLength: 0,
      ip: "203.0.113.10"
    };

    const unauthorized = await handler(baseRequest);
    const conflict = await handler(baseRequest);
    const serviceUnavailable = await handler(baseRequest);

    expect(unauthorized.status).toBe(401);
    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual({ code: "conflict" });
    expect(serviceUnavailable.status).toBe(500);
    expect(serviceUnavailable.body).toEqual({ code: "service_unavailable" });
  });
});
