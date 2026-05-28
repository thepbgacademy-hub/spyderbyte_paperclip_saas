import { describe, expect, it, vi } from "vitest";

import { ApiAuthError } from "../src/api/dashboard-api.js";
import {
  HarnessActionContractConflictError,
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

  it("routes bounded export preflight, dry-run, and governance-history export through guarded candidate endpoints", async () => {
    const preflightExportCandidate = vi.fn().mockResolvedValue({
      candidateId: "governance_history_export",
      status: "ready",
      readiness: "ready_now",
      readinessLabel: "Ready now",
      summary: "Governance history is ready for bounded tenant export later.",
      nextStepLabel: "Tenant export available",
      supportsDryRun: true,
      supportsExport: true
    });
    const dryRunExportCandidate = vi.fn().mockResolvedValue({
      candidateId: "governance_history_export",
      status: "ready",
      exportFormat: "obsidian_markdown_bundle",
      recordTarget: "governance_history_record",
      bundleId: "bundle-key",
      noteTitle: "Governance history",
      noteFileName: "wf_connect_first_workflow-governance-history.md",
      content: "# Governance history",
      placement: {
        targetSystem: "obsidian_vault",
        vaultFolder: "wealth-factory/governance-history/wf_connect_first_workflow",
        primaryNotePath: "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
        syncStrategy: "append_history_entry",
        confirmationRequirement: "tenant_export_confirmation"
      },
      files: [
        {
          path: "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
          mediaType: "text/markdown",
          byteSize: 20,
          checksum: "abc",
          content: "# Governance history"
        }
      ],
      recordCount: 2,
      disclosureSummary: "Decision summary only",
      redactionSummary: "Governance-safe redaction"
    });
    const exportGovernanceHistoryCandidate = vi.fn().mockResolvedValue({
      candidateId: "governance_history_export",
      status: "export_ready",
      exportFormat: "obsidian_markdown_bundle",
      recordTarget: "governance_history_record",
      bundleId: "bundle-key",
      noteTitle: "Governance history",
      noteFileName: "wf_connect_first_workflow-governance-history.md",
      content: "# Governance history",
      placement: {
        targetSystem: "obsidian_vault",
        vaultFolder: "wealth-factory/governance-history/wf_connect_first_workflow",
        primaryNotePath: "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
        syncStrategy: "append_history_entry",
        confirmationRequirement: "tenant_export_confirmation"
      },
      files: [
        {
          path: "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
          mediaType: "text/markdown",
          byteSize: 20,
          checksum: "abc",
          content: "# Governance history"
        }
      ],
      recordCount: 2,
      disclosureSummary: "Decision summary only",
      redactionSummary: "Governance-safe redaction",
      idempotencyKey: "export-key",
      summary: "Governance history export is ready."
    });
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      createTopLevelChildCard: vi.fn(),
      advanceChildCard: vi.fn(),
      decideProposal: vi.fn(),
      completeRun: vi.fn(),
      preflightExportCandidate,
      dryRunExportCandidate,
      exportGovernanceHistoryCandidate,
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) }
    });

    const requestBase = {
      method: "POST" as const,
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        cookie: "wf_session=abc",
        "content-type": "application/json"
      },
      body: { actionToken: "candidate-token" },
      bodyByteLength: JSON.stringify({ actionToken: "candidate-token" }).length,
      ip: "203.0.113.10"
    };

    const preflight = await handler({
      ...requestBase,
      path: "/api/harness/runs/run_123/export-candidates/governance_history_export/preflight"
    });
    const dryRun = await handler({
      ...requestBase,
      path: "/api/harness/runs/run_123/export-candidates/governance_history_export/dry-run"
    });
    const exported = await handler({
      ...requestBase,
      path: "/api/harness/runs/run_123/export-candidates/governance_history_export/export"
    });

    expect(preflight.status).toBe(200);
    expect(dryRun.status).toBe(200);
    expect(exported.status).toBe(200);
    expect(preflightExportCandidate).toHaveBeenCalledWith({
      authorization: "Bearer valid",
      cookie: "wf_session=abc",
      runId: "run_123",
      candidateId: "governance_history_export",
      actionToken: "candidate-token"
    });
    expect(dryRunExportCandidate).toHaveBeenCalledWith({
      authorization: "Bearer valid",
      cookie: "wf_session=abc",
      runId: "run_123",
      candidateId: "governance_history_export",
      actionToken: "candidate-token"
    });
    expect(exportGovernanceHistoryCandidate).toHaveBeenCalledWith({
      authorization: "Bearer valid",
      cookie: "wf_session=abc",
      runId: "run_123",
      candidateId: "governance_history_export",
      actionToken: "candidate-token"
    });
  });

  it("maps stale export-candidate tokens to stale_contract", async () => {
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      createTopLevelChildCard: vi.fn(),
      advanceChildCard: vi.fn(),
      decideProposal: vi.fn(),
      completeRun: vi.fn(),
      preflightExportCandidate: vi.fn().mockRejectedValue(new HarnessActionContractConflictError("stale")),
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) }
    });

    const response = await handler({
      method: "POST",
      path: "/api/harness/runs/run_123/export-candidates/governance_history_export/preflight",
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      body: { actionToken: "stale-token" },
      bodyByteLength: JSON.stringify({ actionToken: "stale-token" }).length,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ code: "stale_contract" });
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
        cookie: "wf_session=abc",
        "content-type": "application/json"
      },
      body: {
        actionToken: "test-proposal-token"
      },
      bodyByteLength: JSON.stringify({
        actionToken: "test-proposal-token"
      }).length,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(200);
    expect(decideProposal).toHaveBeenCalledWith({
      proposalId: "proposal_1",
      authorization: "Bearer valid",
      cookie: "wf_session=abc",
      decision: "approve",
      actionToken: "test-proposal-token"
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
        actionToken: "test-proposal-token",
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
      actionToken: "test-proposal-token",
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
        actionToken: "test-proposal-token",
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
      actionToken: "test-proposal-token",
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
        cookie: "wf_session=abc",
        "content-type": "application/json"
      },
      body: {
        actionToken: "test-proposal-token"
      },
      bodyByteLength: JSON.stringify({
        actionToken: "test-proposal-token"
      }).length,
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

  it("passes deferred direct CEO lane-cap requests through the guarded mutation route", async () => {
    const createTopLevelChildCard = vi.fn().mockResolvedValue({
      status: "deferred",
      proposalId: "proposal_lane_cap_1"
    });
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
    expect(response.body).toEqual({
      status: "deferred",
      proposalId: "proposal_lane_cap_1"
    });
  });

  it("returns deferred governance payloads when direct child-card creation is lane-capped", async () => {
    const createTopLevelChildCard = vi.fn().mockResolvedValue({
      status: "deferred",
      proposalId: "proposal_deferred_2"
    });
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
        persona: "analyst",
        title: "Review the offer language",
        deliverableType: "legal_review"
      },
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      bodyByteLength: 87,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(200);
    expect(createTopLevelChildCard).toHaveBeenCalledWith({
      authorization: "Bearer valid",
      persona: "analyst",
      title: "Review the offer language",
      deliverableType: "legal_review"
    });
    expect(response.body).toEqual({
      status: "deferred",
      proposalId: "proposal_deferred_2"
    });
  });

  it("returns deferred governance payloads when direct child-card creation hits an owner-conflict boundary", async () => {
    const createTopLevelChildCard = vi.fn().mockResolvedValue({
      status: "deferred",
      proposalId: "proposal_owner_conflict_1"
    });
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
        persona: "analyst",
        title: "Model the renewal downside",
        deliverableType: "pricing_review"
      },
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      bodyByteLength: 90,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "deferred",
      proposalId: "proposal_owner_conflict_1"
    });
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
        state: "working",
        resumeSummary: "Keep the pricing review lane moving from the revised assumptions workbook."
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
      state: "working",
      resumeSummary: "Keep the pricing review lane moving from the revised assumptions workbook."
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
        completionSummary: "The CEO packaged the final business-facing outcome.",
        actionToken: "test-review-token"
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
      completionSummary: "The CEO packaged the final business-facing outcome.",
      actionToken: "test-review-token"
    });
    expect(response.body).toEqual({ runId: "run_123", state: "done" });
  });

  it("maps stale complete-run contract drift without exposing backend details", async () => {
    const completeRun = vi
      .fn()
      .mockRejectedValueOnce(new HarnessActionContractConflictError("stale token"));
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
        completionSummary: "The CEO packaged the final business-facing outcome.",
        actionToken: "stale-review-token"
      },
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      bodyByteLength: JSON.stringify({
        completionSummary: "The CEO packaged the final business-facing outcome.",
        actionToken: "stale-review-token"
      }).length,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ code: "stale_contract" });
  });

  it("reviews pending CEO attention by completing the run through the guarded write route", async () => {
    const reviewPendingAttention = vi.fn().mockResolvedValue({ status: "done", runId: "run_123" });
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      decideProposal: vi.fn(),
      createTopLevelChildCard: vi.fn(),
      advanceChildCard: vi.fn(),
      completeRun: vi.fn(),
      reviewPendingAttention,
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) }
    });

    const response = await handler({
      method: "POST",
      path: "/api/harness/runs/run_123/review-attention",
      body: {
        decision: "complete_run",
        actionToken: "test-review-token",
        completionSummary: "The CEO accepted the board output and packaged the business-facing result."
      },
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        cookie: "wf_session=abc",
        "content-type": "application/json"
      },
      bodyByteLength: JSON.stringify({
        decision: "complete_run",
        actionToken: "test-review-token",
        completionSummary: "The CEO accepted the board output and packaged the business-facing result."
      }).length,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(200);
    expect(reviewPendingAttention).toHaveBeenCalledWith({
      authorization: "Bearer valid",
      cookie: "wf_session=abc",
      runId: "run_123",
      decision: "complete_run",
      actionToken: "test-review-token",
      completionSummary: "The CEO accepted the board output and packaged the business-facing result."
    });
    expect(response.body).toEqual({ status: "done", runId: "run_123" });
  });

  it("reviews pending CEO attention by starting a fresh cycle through the guarded write route", async () => {
    const reviewPendingAttention = vi
      .fn()
      .mockResolvedValue({ status: "fresh_cycle_started", runId: "run_124", reopenedProposalCount: 2 });
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      decideProposal: vi.fn(),
      createTopLevelChildCard: vi.fn(),
      advanceChildCard: vi.fn(),
      completeRun: vi.fn(),
      reviewPendingAttention,
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) }
    });

    const response = await handler({
      method: "POST",
      path: "/api/harness/runs/run_123/review-attention",
      body: {
        decision: "start_fresh_cycle",
        actionToken: "test-review-token",
        mode: "clean"
      },
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        cookie: "wf_session=abc",
        "content-type": "application/json"
      },
      bodyByteLength: JSON.stringify({
        decision: "start_fresh_cycle",
        actionToken: "test-review-token",
        mode: "clean"
      }).length,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(200);
    expect(reviewPendingAttention).toHaveBeenCalledWith({
      authorization: "Bearer valid",
      cookie: "wf_session=abc",
      runId: "run_123",
      decision: "start_fresh_cycle",
      actionToken: "test-review-token",
      mode: "clean"
    });
    expect(response.body).toEqual({ status: "fresh_cycle_started", runId: "run_124", reopenedProposalCount: 2 });
  });

  it("rejects invalid review-attention decisions before calling the service", async () => {
    const reviewPendingAttention = vi.fn();
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      decideProposal: vi.fn(),
      createTopLevelChildCard: vi.fn(),
      advanceChildCard: vi.fn(),
      completeRun: vi.fn(),
      reviewPendingAttention,
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) }
    });

    const invalidDecision = await handler({
      method: "POST",
      path: "/api/harness/runs/run_123/review-attention",
      body: {
        decision: "invented"
      },
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      bodyByteLength: JSON.stringify({ decision: "invented" }).length,
      ip: "203.0.113.10"
    });

    const missingSummary = await handler({
      method: "POST",
      path: "/api/harness/runs/run_123/review-attention",
      body: {
        decision: "complete_run"
      },
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      bodyByteLength: JSON.stringify({ decision: "complete_run" }).length,
      ip: "203.0.113.10"
    });

    const invalidMode = await handler({
      method: "POST",
      path: "/api/harness/runs/run_123/review-attention",
      body: {
        decision: "start_fresh_cycle",
        mode: "reopen_everything"
      },
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      bodyByteLength: JSON.stringify({
        decision: "start_fresh_cycle",
        mode: "reopen_everything"
      }).length,
      ip: "203.0.113.10"
    });

    expect(invalidDecision.status).toBe(400);
    expect(missingSummary.status).toBe(400);
    expect(invalidMode.status).toBe(400);
    expect(reviewPendingAttention).not.toHaveBeenCalled();
  });

  it("maps review-attention conflicts without exposing backend details", async () => {
    const reviewPendingAttention = vi
      .fn()
      .mockRejectedValueOnce(new ApiAuthError())
      .mockRejectedValueOnce(new HarnessRunCycleConflictError("not waiting on CEO review"))
      .mockRejectedValueOnce(new Error("db_down"));
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      decideProposal: vi.fn(),
      createTopLevelChildCard: vi.fn(),
      advanceChildCard: vi.fn(),
      completeRun: vi.fn(),
      reviewPendingAttention,
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) }
    });

    const baseRequest = {
      method: "POST" as const,
      path: "/api/harness/runs/run_123/review-attention",
      body: {
        decision: "start_fresh_cycle",
        actionToken: "test-review-token"
      },
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      bodyByteLength: JSON.stringify({
        decision: "start_fresh_cycle",
        actionToken: "test-review-token"
      }).length,
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

  it("maps stale review-attention contract drift without exposing backend details", async () => {
    const reviewPendingAttention = vi
      .fn()
      .mockRejectedValueOnce(new HarnessActionContractConflictError("stale token"));
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      decideProposal: vi.fn(),
      createTopLevelChildCard: vi.fn(),
      advanceChildCard: vi.fn(),
      completeRun: vi.fn(),
      reviewPendingAttention,
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) }
    });

    const response = await handler({
      method: "POST",
      path: "/api/harness/runs/run_123/review-attention",
      body: {
        decision: "start_fresh_cycle",
        actionToken: "stale-review-token"
      },
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      bodyByteLength: JSON.stringify({
        decision: "start_fresh_cycle",
        actionToken: "stale-review-token"
      }).length,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ code: "stale_contract" });
  });

  it("maps stale proposal-decision contract drift without exposing backend details", async () => {
    const decideProposal = vi
      .fn()
      .mockRejectedValueOnce(new HarnessActionContractConflictError("stale token"));
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      decideProposal,
      createTopLevelChildCard: vi.fn(),
      advanceChildCard: vi.fn(),
      completeRun: vi.fn(),
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) }
    });

    const response = await handler({
      method: "POST",
      path: "/api/harness/proposals/proposal_1/decision",
      body: {
        decision: "approve",
        actionToken: "stale-proposal-token"
      },
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      bodyByteLength: JSON.stringify({
        decision: "approve",
        actionToken: "stale-proposal-token"
      }).length,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ code: "stale_contract" });
  });

  it("resolves pending lane-resume attention through the guarded write route", async () => {
    const resolvePendingAttention = vi
      .fn()
      .mockResolvedValue({ status: "resumed", cardId: "card_waiting_1", state: "working" });
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      decideProposal: vi.fn(),
      createTopLevelChildCard: vi.fn(),
      advanceChildCard: vi.fn(),
      completeRun: vi.fn(),
      resolvePendingAttention,
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) }
    });

    const response = await handler({
      method: "POST",
      path: "/api/harness/runs/run_123/resolve-attention",
      body: {
        command: "resume_lane",
        actionToken: "test-resolve-token",
        resumeSummary: "Resume the pricing review with the confirmed revenue assumption."
      },
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        cookie: "wf_session=abc",
        "content-type": "application/json"
      },
      bodyByteLength: JSON.stringify({
        command: "resume_lane",
        resumeSummary: "Resume the pricing review with the confirmed revenue assumption."
      }).length,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(200);
    expect(resolvePendingAttention).toHaveBeenCalledWith({
      authorization: "Bearer valid",
      cookie: "wf_session=abc",
      runId: "run_123",
      command: "resume_lane",
      actionToken: "test-resolve-token",
      resumeSummary: "Resume the pricing review with the confirmed revenue assumption."
    });
    expect(response.body).toEqual({ status: "resumed", cardId: "card_waiting_1", state: "working" });
  });

  it("resolves pending lane-unblock attention through the guarded write route", async () => {
    const resolvePendingAttention = vi
      .fn()
      .mockResolvedValue({ status: "unblocked", cardId: "card_blocked_1", state: "approved" });
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      decideProposal: vi.fn(),
      createTopLevelChildCard: vi.fn(),
      advanceChildCard: vi.fn(),
      completeRun: vi.fn(),
      resolvePendingAttention,
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) }
    });

    const response = await handler({
      method: "POST",
      path: "/api/harness/runs/run_123/resolve-attention",
      body: {
        command: "unblock_lane",
        actionToken: "test-resolve-token",
        resumeSummary: "The blocker is cleared and this lane can return to the board queue."
      },
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        cookie: "wf_session=abc",
        "content-type": "application/json"
      },
      bodyByteLength: JSON.stringify({
        command: "unblock_lane",
        resumeSummary: "The blocker is cleared and this lane can return to the board queue."
      }).length,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(200);
    expect(resolvePendingAttention).toHaveBeenCalledWith({
      authorization: "Bearer valid",
      cookie: "wf_session=abc",
      runId: "run_123",
      command: "unblock_lane",
      actionToken: "test-resolve-token",
      resumeSummary: "The blocker is cleared and this lane can return to the board queue."
    });
    expect(response.body).toEqual({ status: "unblocked", cardId: "card_blocked_1", state: "approved" });
  });

  it("rejects invalid resolve-attention commands before calling the service", async () => {
    const resolvePendingAttention = vi.fn();
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      decideProposal: vi.fn(),
      createTopLevelChildCard: vi.fn(),
      advanceChildCard: vi.fn(),
      completeRun: vi.fn(),
      resolvePendingAttention,
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) }
    });

    const response = await handler({
      method: "POST",
      path: "/api/harness/runs/run_123/resolve-attention",
      body: {
        command: "invented"
      },
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      bodyByteLength: JSON.stringify({ command: "invented" }).length,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ code: "invalid_request" });
    expect(resolvePendingAttention).not.toHaveBeenCalled();
  });

  it("maps resolve-attention conflicts without exposing backend details", async () => {
    const resolvePendingAttention = vi
      .fn()
      .mockRejectedValueOnce(new ApiAuthError())
      .mockRejectedValueOnce(new HarnessCardProgressionConflictError("not waiting on a lane resume"))
      .mockRejectedValueOnce(new Error("db_down"));
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      decideProposal: vi.fn(),
      createTopLevelChildCard: vi.fn(),
      advanceChildCard: vi.fn(),
      completeRun: vi.fn(),
      resolvePendingAttention,
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) }
    });

    const baseRequest = {
      method: "POST" as const,
      path: "/api/harness/runs/run_123/resolve-attention",
      body: {
        command: "resume_lane",
        actionToken: "test-resolve-token"
      },
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      bodyByteLength: JSON.stringify({
        command: "resume_lane",
        actionToken: "test-resolve-token"
      }).length,
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

  it("maps stale resolve-attention contract drift without exposing backend details", async () => {
    const resolvePendingAttention = vi
      .fn()
      .mockRejectedValueOnce(new HarnessActionContractConflictError("stale token"));
    const handler = createHarnessHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      listBoardState: vi.fn(),
      decideProposal: vi.fn(),
      createTopLevelChildCard: vi.fn(),
      advanceChildCard: vi.fn(),
      completeRun: vi.fn(),
      resolvePendingAttention,
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }) }
    });

    const response = await handler({
      method: "POST",
      path: "/api/harness/runs/run_123/resolve-attention",
      body: {
        command: "resume_lane",
        actionToken: "stale-resolve-token"
      },
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      bodyByteLength: JSON.stringify({
        command: "resume_lane",
        actionToken: "stale-resolve-token"
      }).length,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ code: "stale_contract" });
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
        cookie: "wf_session=abc",
        "content-type": "application/json"
      },
      body: { mode: "clean", actionToken: "test-review-token" },
      bodyByteLength: JSON.stringify({ mode: "clean", actionToken: "test-review-token" }).length,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(200);
    expect(startFreshCycle).toHaveBeenCalledWith({
      authorization: "Bearer valid",
      cookie: "wf_session=abc",
      runId: "run_123",
      actionToken: "test-review-token",
      mode: "clean"
    });
    expect(response.body).toEqual({ runId: "run_124", reopenedProposalCount: 2 });
  });

  it("rejects invalid fresh-cycle modes before calling the service", async () => {
    const startFreshCycle = vi.fn();
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
        "content-type": "application/json"
      },
      body: { mode: "reopen_everything", actionToken: "test-review-token" },
      bodyByteLength: JSON.stringify({ mode: "reopen_everything", actionToken: "test-review-token" }).length,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ code: "invalid_request" });
    expect(startFreshCycle).not.toHaveBeenCalled();
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
      body: {
        mode: "reopen_deferred",
        actionToken: "test-review-token"
      },
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      bodyByteLength: JSON.stringify({
        mode: "reopen_deferred",
        actionToken: "test-review-token"
      }).length,
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

  it("maps stale fresh-cycle contract drift without exposing backend details", async () => {
    const startFreshCycle = vi
      .fn()
      .mockRejectedValueOnce(new HarnessActionContractConflictError("stale token"));
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
      body: {
        mode: "reopen_deferred",
        actionToken: "stale-review-token"
      },
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      bodyByteLength: JSON.stringify({
        mode: "reopen_deferred",
        actionToken: "stale-review-token"
      }).length,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ code: "stale_contract" });
  });
});
