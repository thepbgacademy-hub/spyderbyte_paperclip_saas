import { describe, expect, it } from "vitest";

import { createHarnessRuntime } from "../src/harness/runtime.js";

describe("harness runtime", () => {
  it("starts a CEO-owned run and requires CEO approval for proposed sub-cards", () => {
    const runtime = createHarnessRuntime();
    const session = runtime.startRun({
      tenantId: "tenant_123",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      runtimeContext: {
        tenantId: "tenant_123",
        workflowId: "wf_connect_first_workflow",
        packageId: "pkg_bib_connect",
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });

    expect(session.run.orchestratorPersona).toBe("ceo");
    expect(session.run.state).toBe("planning");
    expect(session.ceoCard.persona).toBe("ceo");
    expect(session.ceoCard.state).toBe("planning");
    expect(session.run.runtimeContext).toEqual({
      providerKind: "openai_api",
      credentialLabel: "Primary OpenAI"
    });

    const child = runtime.createApprovedChildCard(session.run.id, {
      persona: "cfo",
      title: "Review pricing assumptions",
      deliverableType: "pricing_review"
    });

    expect(child.parentCardId).toBe(session.ceoCard.id);
    expect(child.state).toBe("approved");

    const proposal = runtime.proposeSubCard(child.id, {
      persona: "researcher",
      title: "Gather competitor price anchors",
      deliverableType: "research_brief"
    });

    expect(proposal.status).toBe("proposed");
    expect(runtime.listCards(session.run.id)).toHaveLength(2);

    const approved = runtime.approveSubCard(proposal.id);

    expect(approved.state).toBe("queued");
    expect(approved.persona).toBe("researcher");
    expect(approved.parentCardId).toBe(child.id);
    expect(runtime.listCards(session.run.id)).toHaveLength(3);
  });

  it("resumes from persisted state and keeps CEO-gated proposals intact", () => {
    const runtime = createHarnessRuntime();
    const resumed = runtime.resumeRun({
      run: {
        id: "run_123",
        tenantId: "tenant_123",
        workflowId: "wf_connect_first_workflow",
        packageId: "pkg_bib_connect",
        orchestratorPersona: "ceo",
        state: "active",
        runtimeContext: {
          providerKind: "openai_api",
          credentialLabel: "Primary OpenAI"
        },
        createdAt: "2026-05-21T10:00:00.000Z",
        updatedAt: "2026-05-21T10:03:00.000Z"
      },
      cards: [
        {
          id: "card_ceo",
          runId: "run_123",
          parentCardId: null,
          persona: "ceo",
          title: "Plan run",
          deliverableType: "plan",
          state: "working",
          createdAt: "2026-05-21T10:00:00.000Z",
          updatedAt: "2026-05-21T10:03:00.000Z"
        },
        {
          id: "card_cfo",
          runId: "run_123",
          parentCardId: "card_ceo",
          persona: "cfo",
          title: "Review numbers",
          deliverableType: "finance_review",
          state: "waiting",
          createdAt: "2026-05-21T10:01:00.000Z",
          updatedAt: "2026-05-21T10:03:00.000Z"
        }
      ],
      proposals: [
        {
          id: "proposal_research",
          runId: "run_123",
          parentCardId: "card_cfo",
          requestedByCardId: "card_cfo",
          requestedByPersona: "cfo",
          persona: "researcher",
          title: "Gather competitor price anchors",
          deliverableType: "research_brief",
          status: "proposed"
        }
      ],
      continuity: [
        {
          cardId: "card_cfo",
          runId: "run_123",
          continuitySummary: "Resume the finance review lane from the open dependency list.",
          latestResultSummary: null,
          absorbedWorkItems: [],
          updatedAt: "2026-05-21T10:03:00.000Z"
        }
      ]
    });

    expect(resumed.run.id).toBe("run_123");
    expect(resumed.cards).toHaveLength(2);
    expect(resumed.cards[0]?.state).toBe("working");
    expect(resumed.proposals).toHaveLength(1);
    expect(runtime.getResumeFocus("card_cfo")).toBe("Resume the finance review lane from the open dependency list.");

    const approved = runtime.approveSubCard("proposal_research");

    expect(approved.runId).toBe("run_123");
    expect(approved.parentCardId).toBe("card_cfo");
    expect(runtime.listProposals("run_123")).toHaveLength(0);
  });

  it("rejects proposal approval when resumed state is missing the CEO gate card", () => {
    const runtime = createHarnessRuntime();
    runtime.resumeRun({
      run: {
        id: "run_456",
        tenantId: "tenant_123",
        workflowId: "wf_connect_first_workflow",
        packageId: "pkg_bib_connect",
        orchestratorPersona: "ceo",
        state: "active",
        runtimeContext: {
          providerKind: "openai_api",
          credentialLabel: "Primary OpenAI"
        },
        createdAt: "2026-05-21T10:00:00.000Z",
        updatedAt: "2026-05-21T10:03:00.000Z"
      },
      cards: [
        {
          id: "card_cfo_only",
          runId: "run_456",
          parentCardId: null,
          persona: "cfo",
          title: "Review numbers",
          deliverableType: "finance_review",
          state: "working",
          createdAt: "2026-05-21T10:01:00.000Z",
          updatedAt: "2026-05-21T10:03:00.000Z"
        }
      ],
      proposals: [
        {
          id: "proposal_orphaned",
          runId: "run_456",
          parentCardId: "card_cfo_only",
          requestedByCardId: "card_cfo_only",
          requestedByPersona: "cfo",
          persona: "researcher",
          title: "Gather competitor price anchors",
          deliverableType: "research_brief",
          status: "proposed"
        }
      ]
    });

    expect(() => runtime.approveSubCard("proposal_orphaned")).toThrow(/missing ceo card/i);
  });
});
