import { describe, expect, it, vi } from "vitest";

import { ApiAuthError } from "../src/api/dashboard-api.js";
import { createHarnessHttpHandler } from "../src/api/harness-http.js";

describe("harness HTTP boundary", () => {
  it("rejects untrusted origins before resolving board data", async () => {
    const listBoardState = vi.fn();
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState,
      approveProposal: vi.fn(),
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
      pendingApprovals: []
    });
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState,
      approveProposal: vi.fn(),
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
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState,
      approveProposal: vi.fn(),
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
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState,
      approveProposal: vi.fn(),
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
    expect(listBoardState).not.toHaveBeenCalled();
  });

  it("distinguishes auth failures from internal service failures", async () => {
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn().mockRejectedValueOnce(new ApiAuthError()).mockRejectedValueOnce(new Error("db_down")),
      approveProposal: vi.fn(),
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
    const approveProposal = vi.fn().mockResolvedValue({ cardId: "card_new_1" });
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      approveProposal,
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
    expect(approveProposal).toHaveBeenCalledWith({
      proposalId: "proposal_1",
      authorization: "Bearer valid",
      cookie: "wf_session=abc"
    });
    expect(response.body).toEqual({ cardId: "card_new_1" });
  });
});
