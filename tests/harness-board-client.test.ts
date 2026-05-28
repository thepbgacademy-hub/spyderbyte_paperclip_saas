import { describe, expect, it, vi } from "vitest";

import {
  createHarnessBoardClient,
  HarnessBoardClientError
} from "../apps/web/src/harness-board-client.js";

describe("harness board client", () => {
  it("enables browser fallback only on loopback hosts", () => {
    const localClient = createHarnessBoardClient(
      fetch,
      { location: { hostname: "127.0.0.1" } as Window["location"] }
    );
    const remoteClient = createHarnessBoardClient(
      fetch,
      { location: { hostname: "app.spyderbyte.cloud" } as Window["location"] }
    );

    expect(localClient.isBrowserFallbackEnabled()).toBe(true);
    expect(remoteClient.isBrowserFallbackEnabled()).toBe(false);
  });

  it("does not silently fall back on non-loopback hosts when the live request fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: {
        get: vi.fn().mockReturnValue(null)
      },
      json: async () => ({ code: "service_unavailable" })
    });
    const client = createHarnessBoardClient(
      fetchImpl as unknown as typeof fetch,
      { location: { hostname: "app.spyderbyte.cloud" } as Window["location"] }
    );

    await expect(client.fetchBoard()).rejects.toThrow("Unable to load harness board");
    expect(fetchImpl).toHaveBeenCalledWith("/api/harness/board", expect.objectContaining({
      credentials: "include",
      signal: expect.any(AbortSignal)
    }));
    expect(client.isBrowserFallbackEnabled()).toBe(false);
  });

  it("submits bounded board actions through the live contract path", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "approved" })
    });
    const client = createHarnessBoardClient(
      fetchImpl as unknown as typeof fetch,
      { location: { hostname: "app.spyderbyte.cloud" } as Window["location"] }
    );

    await expect(
      client.submitAction("/api/harness/proposals/proposal_1/decision", { decision: "approve" })
    ).resolves.toEqual({ status: "approved" });

    expect(fetchImpl).toHaveBeenCalledWith("/api/harness/proposals/proposal_1/decision", expect.objectContaining({
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ decision: "approve" }),
      signal: expect.any(AbortSignal)
    }));
  });

  it("fails closed when a bounded board action request is rejected", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      headers: {
        get: vi.fn().mockReturnValue(null)
      },
      json: async () => ({ code: "conflict" })
    });
    const client = createHarnessBoardClient(
      fetchImpl as unknown as typeof fetch,
      { location: { hostname: "app.spyderbyte.cloud" } as Window["location"] }
    );

    await expect(
      client.submitAction("/api/harness/runs/run_1/review-attention", { decision: "complete_run" })
    ).rejects.toMatchObject({
      name: "HarnessBoardClientError",
      code: "conflict",
      status: 409
    } satisfies Partial<HarnessBoardClientError>);
  });

  it("preserves structured rate-limit details from the live action seam", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: {
        get: vi.fn().mockImplementation((name: string) => (name === "retry-after" ? "7" : null))
      },
      json: async () => ({ code: "rate_limited" })
    });
    const client = createHarnessBoardClient(
      fetchImpl as unknown as typeof fetch,
      { location: { hostname: "app.spyderbyte.cloud" } as Window["location"] }
    );

    await expect(
      client.submitAction("/api/harness/proposals/proposal_1/decision", { decision: "approve" })
    ).rejects.toMatchObject({
      name: "HarnessBoardClientError",
      code: "rate_limited",
      status: 429,
      retryAfterSeconds: 7
    } satisfies Partial<HarnessBoardClientError>);
  });

  it("fails with a bounded timed_out error when the live board load exceeds the request timeout", async () => {
    const fetchImpl = vi.fn().mockImplementation((_input: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        });
      });
    });
    const client = createHarnessBoardClient(
      fetchImpl as unknown as typeof fetch,
      { location: { hostname: "app.spyderbyte.cloud" } as Window["location"] },
      { requestTimeoutMs: 5 }
    );

    await expect(client.fetchBoard()).rejects.toMatchObject({
      name: "HarnessBoardClientError",
      code: "timed_out",
      status: 408
    } satisfies Partial<HarnessBoardClientError>);
  });

  it("fails with a bounded timed_out error when a live board action exceeds the request timeout", async () => {
    const fetchImpl = vi.fn().mockImplementation((_input: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        });
      });
    });
    const client = createHarnessBoardClient(
      fetchImpl as unknown as typeof fetch,
      { location: { hostname: "app.spyderbyte.cloud" } as Window["location"] },
      { requestTimeoutMs: 5 }
    );

    await expect(
      client.submitAction("/api/harness/proposals/proposal_1/decision", { decision: "approve" })
    ).rejects.toMatchObject({
      name: "HarnessBoardClientError",
      code: "timed_out",
      status: 408
    } satisfies Partial<HarnessBoardClientError>);
  });

  it("derives a bounded memory boundary when an older live board payload omits that seam", async () => {
    const previewClient = createHarnessBoardClient(
      fetch,
      { location: { hostname: "127.0.0.1", search: "" } as Window["location"] }
    );
    const { memoryBoundary: _memoryBoundary, ...legacyShape } = previewClient.getFallback();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => legacyShape
    });
    const client = createHarnessBoardClient(
      fetchImpl as unknown as typeof fetch,
      { location: { hostname: "app.spyderbyte.cloud" } as Window["location"] }
    );

    const board = await client.fetchBoard();

    expect(board.memoryBoundary).toEqual(
      expect.objectContaining({
        exportSummary: "2 export candidates are ready now, and 2 still wait for board closure.",
        roleSummary: "2 governance record candidates are ready now, and 2 packaged output candidates still wait on board closure.",
        ownershipSummary:
          "2 runtime memory buckets stay Wealth Factory-only, while 4 tenant-record candidate buckets may become tenant-owned later.",
        sequenceSummary:
          "1 export candidate group forms the foundational export sequence, and 1 group follows after board closure.",
        dependencySummary:
          "1 export candidate group stands independently, while 1 group still depends on the governance history export candidate.",
        nextStepSummary:
          "2 runtime buckets have no promotion step, 2 export candidate buckets are ready for a later tenant export step, and 2 buckets still need board closure before tenant export becomes the next step.",
        actionFamilySummary:
          "2 runtime buckets expose no promotion action, 2 export candidate buckets sit in the tenant export family, and 2 buckets remain in the board-closure-first family.",
        assemblySummary:
          "2 runtime buckets have no export assembly, 2 export candidate buckets are ready as standalone export records, and 2 buckets still belong to a package record set after board closure.",
        phaseSummary:
          "2 runtime buckets have no export phase, 2 export candidate buckets are ready in the phase-one export lane, and 2 buckets still wait in the phase-two package export lane.",
        mutabilitySummary:
          "2 runtime buckets stay runtime mutable, 2 export candidate buckets are append-only history, and 2 buckets still behave as replaceable package snapshots until board closure.",
        promotionSummary:
          "2 runtime memory buckets never promote, 2 candidate buckets are ready for explicit export later, and 2 candidate buckets still wait on board closure first.",
        recordTargetSummary:
          "2 governance history record candidates are ready, while 2 package record candidates stay package-shaped until board closure completes.",
        sensitivitySummary:
          "2 runtime buckets have no export sensitivity, 2 export candidate buckets carry tenant business context, and 2 buckets still carry tenant deliverable context.",
        audienceSummary:
          "2 runtime buckets stay Wealth Factory runtime only, 2 export candidate buckets are aimed at tenant governance-history readers, and 2 buckets still target tenant package consumers.",
        sanitizationSummary:
          "2 runtime buckets have no export sanitization, 2 export candidate buckets are exported as recorded, and 2 buckets still require sanitization before package export.",
        redactionSummary:
          "2 runtime buckets stay runtime internal only, 2 export candidate buckets use governance-safe redaction, and 2 buckets still require package-safe redaction.",
        sourceDisclosureSummary:
          "2 runtime buckets are runtime only, 2 export candidate buckets disclose decision summaries only, and 2 buckets still disclose closure-snapshot summaries only.",
        placementSummary:
          "2 runtime buckets have no tenant memory placement, 2 export candidate buckets land as governance history notes, and 2 buckets still land in package record folders.",
        syncStrategySummary:
          "2 runtime buckets have no tenant sync strategy, 2 export candidate buckets append history entries, and 2 buckets still replace package snapshots after board closure.",
        requestShapeSummary:
          "2 runtime buckets have no export request shape, 2 export candidate buckets use single-record export requests, and 2 buckets still use package-bundle export requests.",
        confirmationSummary:
          "2 runtime buckets have no export confirmation, 2 export candidate buckets require tenant export confirmation, and 2 buckets still require board closure before tenant export confirmation.",
        recoveryPathSummary:
          "2 runtime buckets are runtime only, 2 export candidate buckets retry the latest record export, and 2 buckets still rerun after the board-closure snapshot.",
        readyNowCount: 2,
        waitingOnBoardClosureCount: 2,
        governanceReadyCount: 2,
        packagedReadyCount: 0,
        packagedWaitingCount: 2,
        partitions: expect.objectContaining({
          runtime: expect.objectContaining({ itemCount: 2 }),
          governanceHistoryCandidates: expect.objectContaining({ itemCount: 2 }),
          packagedOutputCandidates: expect.objectContaining({ itemCount: 2 })
        }),
        operationalItems: expect.arrayContaining([
          expect.objectContaining({
            id: "lane_continuity",
            destination: "wealth_factory_runtime",
            readiness: "live_runtime_only",
            readinessLabel: "Live runtime only",
            role: "runtime_memory",
            eligibilityRule: "runtime_only",
            sourceSurface: "continuity_snapshots",
            candidateClass: "runtime_operational",
            durabilityCondition: "runtime_ephemeral",
            ownershipBoundary: "wealth_factory_only",
            promotionPath: "never_promotes",
            recordTarget: "none_runtime_only",
            promotionNextStep: "none_runtime_only",
            promotionActionFamily: "none_runtime_only",
            assemblyShape: "none_runtime_only",
            promotionPhase: "not_exported_runtime",
            promotionMutability: "runtime_mutable",
            exportSensitivity: "none_runtime_only",
            exportAudienceBoundary: "wealth_factory_runtime_only",
            exportSanitizationPolicy: "none_runtime_only",
            exportRedactionBoundary: "runtime_internal_only",
            exportSourceDisclosurePolicy: "runtime_only",
            memoryPlacement: "none_runtime_only",
            syncStrategy: "none_runtime_only",
            exportRequestShape: "none_runtime_only",
            exportConfirmationRequirement: "none_runtime_only",
            exportRecoveryPath: "runtime_only"
          })
        ]),
        exportReadyItems: expect.arrayContaining([
          expect.objectContaining({
            id: "governance_decisions",
            destination: "tenant_record_candidate",
            readiness: "ready_now",
            readinessLabel: "Ready now",
            role: "governance_record_candidate",
            eligibilityRule: "explicit_export_later",
            sourceSurface: "recent_decisions",
            candidateClass: "governance_history",
            durabilityCondition: "stable_when_recorded",
            ownershipBoundary: "tenant_owned_later",
            promotionPath: "ready_for_explicit_export",
            recordTarget: "governance_history_record",
            promotionNextStep: "tenant_export_available",
            promotionActionFamily: "tenant_export_candidate",
            assemblyShape: "standalone_export_record",
            promotionPhase: "phase_one_governance_history",
            promotionMutability: "append_only_history",
            exportSensitivity: "tenant_business_context",
            exportAudienceBoundary: "tenant_governance_history_readers",
            exportSanitizationPolicy: "export_as_recorded",
            exportRedactionBoundary: "governance_safe_redaction",
            exportSourceDisclosurePolicy: "decision_summary_only",
            memoryPlacement: "governance_history_note",
            syncStrategy: "append_history_entry",
            exportRequestShape: "single_record_export_request",
            exportConfirmationRequirement: "tenant_export_confirmation",
            exportRecoveryPath: "retry_latest_record_export"
          })
        ])
      })
    );
  });

  it("fills missing readiness fields when a staggered live payload includes memoryBoundary without the new item readiness seam", async () => {
    const previewClient = createHarnessBoardClient(
      fetch,
      { location: { hostname: "127.0.0.1", search: "" } as Window["location"] }
    );
    const fallback = previewClient.getFallback();
    const partialBoundary = {
      ...fallback.memoryBoundary,
      operationalItems: fallback.memoryBoundary.operationalItems.map(({ readiness: _readiness, ...item }) => item),
      exportReadyItems: fallback.memoryBoundary.exportReadyItems.map(({ readiness: _readiness, ...item }) => item)
    };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...fallback,
        memoryBoundary: partialBoundary
      })
    });
    const client = createHarnessBoardClient(
      fetchImpl as unknown as typeof fetch,
      { location: { hostname: "app.spyderbyte.cloud" } as Window["location"] }
    );

    const board = await client.fetchBoard();

    expect(board.memoryBoundary.operationalItems[0]?.readiness).toBe("live_runtime_only");
    expect(board.memoryBoundary.operationalItems[0]?.readinessLabel).toBe("Live runtime only");
    expect(board.memoryBoundary.ownershipSummary).toBe(
      "2 runtime memory buckets stay Wealth Factory-only, while 4 tenant-record candidate buckets may become tenant-owned later."
    );
    expect(board.memoryBoundary.promotionSummary).toBe(
      "2 runtime memory buckets never promote, 2 candidate buckets are ready for explicit export later, and 2 candidate buckets still wait on board closure first."
    );
    expect(board.memoryBoundary.recordTargetSummary).toBe(
      "2 governance history record candidates are ready, while 2 package record candidates stay package-shaped until board closure completes."
    );
    expect(board.memoryBoundary.blockerSummary).toBe(
      "2 export candidate buckets are still blocked by board closure. Runtime memory stays non-promotable by design."
    );
    expect(board.memoryBoundary.authoritySummary).toBe(
      "2 export candidate buckets are already tenant-controlled for later explicit export, while 2 buckets still need board closure before tenant export can own the next step."
    );
    expect(board.memoryBoundary.triggerSummary).toBe(
      "2 export candidate buckets are waiting only on a later tenant export request, while 2 buckets still need board closure before that request can happen."
    );
    expect(board.memoryBoundary.nextStepSummary).toBe(
      "2 runtime buckets have no promotion step, 2 export candidate buckets are ready for a later tenant export step, and 2 buckets still need board closure before tenant export becomes the next step."
    );
    expect(board.memoryBoundary.actionFamilySummary).toBe(
      "2 runtime buckets expose no promotion action, 2 export candidate buckets sit in the tenant export family, and 2 buckets remain in the board-closure-first family."
    );
    expect(board.memoryBoundary.assemblySummary).toBe(
      "2 runtime buckets have no export assembly, 2 export candidate buckets are ready as standalone export records, and 2 buckets still belong to a package record set after board closure."
    );
    expect(board.memoryBoundary.phaseSummary).toBe(
      "2 runtime buckets have no export phase, 2 export candidate buckets are ready in the phase-one export lane, and 2 buckets still wait in the phase-two package export lane."
    );
    expect(board.memoryBoundary.mutabilitySummary).toBe(
      "2 runtime buckets stay runtime mutable, 2 export candidate buckets are append-only history, and 2 buckets still behave as replaceable package snapshots until board closure."
    );
    expect(board.memoryBoundary.scopeSummary).toBe(
      "2 runtime buckets have no promotion scope, 2 export candidate buckets are ready as single-record exports, and 2 buckets still belong to a package record-set export scope."
    );
    expect(board.memoryBoundary.identitySummary).toBe(
      "2 runtime buckets keep transient runtime identity, 2 buckets already have stable record identity, and 2 buckets still finalize identity at board closure."
    );
    expect(board.memoryBoundary.auditSummary).toBe(
      "2 runtime buckets stay runtime-state-backed, 2 buckets are decision-ledger-backed, and 2 buckets are package-closure-backed."
    );
    expect(board.memoryBoundary.concurrencySummary).toBe(
      "2 runtime buckets stay runtime-only, 2 export candidate buckets are safe to promote independently, and 2 buckets still need a board-closure snapshot for concurrency-safe promotion."
    );
    expect(board.memoryBoundary.payloadShapeSummary).toBe(
      "2 runtime buckets have no export payload shape, 2 export candidate buckets are shaped as governance history records, and 2 buckets still export as package snapshot bundles."
    );
    expect(board.memoryBoundary.idempotencySummary).toBe(
      "2 runtime buckets have no idempotency policy, 2 export candidate buckets use deterministic upsert, and 2 buckets still depend on a board-closure snapshot-once policy."
    );
    expect(board.memoryBoundary.replaySafetySummary).toBe(
      "2 runtime buckets stay runtime-only, 2 export candidate buckets are replay-safe, and 2 buckets still require a fresh board-closure snapshot before replay."
    );
    expect(board.memoryBoundary.conflictPolicySummary).toBe(
      "2 runtime buckets stay outside export conflicts, 2 export candidate buckets use append-or-upsert conflict handling, and 2 buckets still replace the latest board-closure snapshot when promoted."
    );
    expect(board.memoryBoundary.atomicitySummary).toBe(
      "2 runtime buckets have no export atomicity, 2 export candidate buckets commit as record-level atomic exports, and 2 buckets still depend on closure-bundle atomic export once board closure completes."
    );
    expect(board.memoryBoundary.derivationSummary).toBe(
      "2 runtime buckets have no export derivation basis, 2 export candidate buckets are derived from decision history, and 2 buckets are derived from the board-closure snapshot."
    );
    expect(board.memoryBoundary.revisionSummary).toBe(
      "2 runtime buckets have no export revision policy, 2 export candidate buckets append as new revisions, and 2 buckets still replace the current closure-bundle revision."
    );
    expect(board.memoryBoundary.freshnessSummary).toBe(
      "2 runtime buckets have no export freshness source, 2 export candidate buckets use the latest record state, and 2 buckets still depend on the latest board-closure snapshot."
    );
    expect(board.memoryBoundary.validationSummary).toBe(
      "2 runtime buckets have no export validation boundary, 2 export candidate buckets validate at record level, and 2 buckets still validate at closure-bundle level."
    );
    expect(board.memoryBoundary.completenessSummary).toBe(
      "2 runtime buckets have no export completeness rule, 2 export candidate buckets are self-contained records, and 2 buckets still complete as board-closure bundles."
    );
    expect(board.memoryBoundary.sensitivitySummary).toBe(
      "2 runtime buckets have no export sensitivity, 2 export candidate buckets carry tenant business context, and 2 buckets still carry tenant deliverable context."
    );
    expect(board.memoryBoundary.audienceSummary).toBe(
      "2 runtime buckets stay Wealth Factory runtime only, 2 export candidate buckets are aimed at tenant governance-history readers, and 2 buckets still target tenant package consumers."
    );
    expect(board.memoryBoundary.sanitizationSummary).toBe(
      "2 runtime buckets have no export sanitization, 2 export candidate buckets export as recorded, and 2 buckets still require sanitization before package export."
    );
    expect(board.memoryBoundary.redactionSummary).toBe(
      "2 runtime buckets stay runtime internal only, 2 export candidate buckets use governance-safe redaction, and 2 buckets still require package-safe redaction."
    );
    expect(board.memoryBoundary.sourceDisclosureSummary).toBe(
      "2 runtime buckets are runtime only, 2 export candidate buckets disclose decision summaries only, and 2 buckets still disclose closure-snapshot summaries only."
    );
    expect(board.memoryBoundary.readyNowCount).toBe(2);
    expect(board.memoryBoundary.waitingOnBoardClosureCount).toBe(2);
    expect(board.memoryBoundary.governanceReadyCount).toBe(2);
    expect(board.memoryBoundary.packagedWaitingCount).toBe(2);
    expect(board.memoryBoundary.blockedCandidateCount).toBe(2);
    expect(board.memoryBoundary.tenantControlledCandidateCount).toBe(2);
    expect(board.memoryBoundary.boardControlledCandidateCount).toBe(2);
    expect(board.memoryBoundary.tenantExportTriggerCount).toBe(2);
    expect(board.memoryBoundary.boardClosureTriggerCount).toBe(2);
    expect(board.memoryBoundary.roleSummary).toBe(
      "2 governance record candidates are ready now, and 2 packaged output candidates still wait on board closure."
    );
    expect(board.memoryBoundary.exportSummary).toBe(
      "2 export candidates are ready now, and 2 still wait for board closure."
    );
    expect(board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.readiness).toBe(
      "after_board_closes"
    );
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.readinessLabel
    ).toBe("After board closes");
    expect(board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.role).toBe(
      "packaged_record_candidate"
    );
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.sourceSurfaceLabel
    ).toBe("Completion package deliverables");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.candidateClassLabel
    ).toBe("Packaged output");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.durabilityConditionLabel
    ).toBe("Stable after board closure");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.ownershipBoundaryLabel
    ).toBe("Tenant-owned later");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.promotionPathLabel
    ).toBe("After board closure, then export");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.recordTargetLabel
    ).toBe("Package deliverable record");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.promotionBlockerLabel
    ).toBe("Board closure required");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.promotionAuthorityLabel
    ).toBe("Board closure, then tenant export");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.promotionTriggerLabel
    ).toBe("Board closure");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.promotionNextStepLabel
    ).toBe("Board closure, then tenant export");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.promotionActionFamilyLabel
    ).toBe("Board closure first");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.assemblyShapeLabel
    ).toBe("Package record set");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.promotionPhaseLabel
    ).toBe("Phase-two package export");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.promotionMutabilityLabel
    ).toBe("Replaceable until board closure");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.promotionScopeLabel
    ).toBe("Package record-set export");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.identityStabilityLabel
    ).toBe("Finalized after board closure");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.auditBackingLabel
    ).toBe("Package-closure-backed");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.concurrencyBoundaryLabel
    ).toBe("Requires board-closure snapshot");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.exportPayloadShapeLabel
    ).toBe("Package snapshot bundle");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.idempotencyPolicyLabel
    ).toBe("Board-closure snapshot once");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.replaySafetyLabel
    ).toBe("Requires fresh board-closure snapshot");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.conflictPolicyLabel
    ).toBe("Replace latest closure snapshot");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.exportAtomicityLabel
    ).toBe("Closure-bundle atomic");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.exportDerivationBasisLabel
    ).toBe("Board-closure-snapshot-derived");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.exportRevisionPolicyLabel
    ).toBe("Replace closure-bundle revision");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.exportFreshnessSourceLabel
    ).toBe("Latest board-closure snapshot");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.exportValidationBoundaryLabel
    ).toBe("Closure-bundle validation");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.exportCompletenessRuleLabel
    ).toBe("Board-closure-complete bundle");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.exportSensitivityLabel
    ).toBe("Tenant deliverable context");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.exportAudienceBoundaryLabel
    ).toBe("Tenant package consumers");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.exportSanitizationPolicyLabel
    ).toBe("Sanitize before package export");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.exportRedactionBoundaryLabel
    ).toBe("Package-safe redaction");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.exportSourceDisclosurePolicyLabel
    ).toBe("Closure snapshot summary only");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.memoryPlacementLabel
    ).toBe("Package record folder");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.syncStrategyLabel
    ).toBe("Replace package snapshot after board closure");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.exportRequestShapeLabel
    ).toBe("Package-bundle export request");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.exportConfirmationRequirementLabel
    ).toBe("Board closure, then tenant export confirmation");
    expect(
      board.memoryBoundary.exportReadyItems.find((item) => item.id === "package_deliverables")?.exportRecoveryPathLabel
    ).toBe("Rerun after board-closure snapshot");
    expect(board.memoryBoundary.exportCandidateSummary).toContain("export candidate group");
    expect(board.memoryBoundary.exportCandidateGroupCount).toBe(2);
    expect(board.memoryBoundary.readyExportCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.waitingExportCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.foundationalExportCandidateCount).toBe(1);
    expect(board.memoryBoundary.boardClosureFollowingExportCandidateCount).toBe(1);
    expect(board.memoryBoundary.independentExportCandidateCount).toBe(1);
    expect(board.memoryBoundary.dependentExportCandidateCount).toBe(1);
    expect(board.memoryBoundary.independentExportSafeCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.requiresClosureSnapshotCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.exportCandidateConcurrencySummary).toContain("concurrency-safe for later independent export");
    expect(board.memoryBoundary.tenantBusinessContextCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.tenantDeliverableContextCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.governanceHistoryAudienceCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.packageConsumerAudienceCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.exportAsRecordedCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.sanitizeBeforePackageExportCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.governanceSafeRedactionCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.packageSafeRedactionCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.exportCandidateSensitivitySummary).toContain("tenant deliverable context");
    expect(board.memoryBoundary.exportCandidateAudienceSummary).toContain("tenant package consumers");
    expect(board.memoryBoundary.exportCandidateSanitizationSummary).toContain("sanitization before package export");
    expect(board.memoryBoundary.exportCandidateRedactionSummary).toContain("package-safe redaction");
    expect(board.memoryBoundary.decisionSummaryOnlyCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.closureSnapshotSummaryOnlyCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.singleRecordExportRequestCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.packageBundleExportRequestCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.tenantExportConfirmationCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.boardClosureThenTenantExportConfirmationCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.retryLatestRecordExportCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.rerunAfterBoardClosureSnapshotCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.governanceHistoryNoteCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.packageRecordFolderCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.appendHistoryEntryCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.replacePackageSnapshotAfterClosureCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.readyForTenantExportCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.awaitingBoardClosureCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.tenantExportAvailableNextStepCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.boardClosureThenTenantExportNextStepCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.tenantExportActionFamilyCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.boardClosureActionFamilyCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.governanceHistoryCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.packagedOutputCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.stableWhenRecordedCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.stableAfterBoardClosureCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.tenantOwnedLaterCandidateGroupCount).toBe(2);
    expect(board.memoryBoundary.governanceHistoryRecordCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.packageBundleRecordCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.tenantExplicitExportAuthorityCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.boardClosureThenTenantExportAuthorityCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.explicitExportLaterCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.afterBoardClosesThenExportCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.recentDecisionsSourceCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.completionPackageSurfaceCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.readyForExplicitExportCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.afterBoardClosureThenExportCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.noPromotionBlockerCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.boardClosureRequiredCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.tenantExportRequestCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.boardClosureTriggerCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.standaloneExportRecordCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.packageRecordSetCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.phaseOneExportCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.phaseTwoExportCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.appendOnlyHistoryCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.replaceableSnapshotCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.singleRecordExportScopeCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.packageRecordSetExportScopeCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.stableIdentityCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.closureFinalizedIdentityCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.exportCandidateSourceDisclosureSummary).toContain("closure-snapshot summaries only");
    expect(board.memoryBoundary.exportCandidateRequestShapeSummary).toContain("package-bundle export requests");
    expect(board.memoryBoundary.exportCandidateConfirmationSummary).toContain("board closure before tenant export confirmation");
    expect(board.memoryBoundary.exportCandidateRecoveryPathSummary).toContain("reruns after the board-closure snapshot");
    expect(board.memoryBoundary.exportCandidatePlacementSummary).toContain("package record folders");
    expect(board.memoryBoundary.exportCandidateSyncStrategySummary).toContain("package snapshots after board closure");
    expect(board.memoryBoundary.exportCandidateStateSummary).toContain("still awaiting board closure");
    expect(board.memoryBoundary.exportCandidateNextStepSummary).toContain("board closure before tenant export becomes the next step");
    expect(board.memoryBoundary.exportCandidateActionFamilySummary).toContain("board-closure-first family");
    expect(board.memoryBoundary.exportCandidateClassSummary).toContain("packaged output");
    expect(board.memoryBoundary.exportCandidateDurabilitySummary).toContain("stable after board closure");
    expect(board.memoryBoundary.exportCandidateOwnershipSummary).toContain("tenant-owned later");
    expect(board.memoryBoundary.exportCandidateRecordTargetSummary).toContain("package bundle export records");
    expect(board.memoryBoundary.exportCandidateAuthoritySummary).toContain("board closure before tenant export owns the next move");
    expect(board.memoryBoundary.exportCandidateEligibilitySummary).toContain("eligible only after board closure");
    expect(board.memoryBoundary.exportCandidateSourceSurfaceSummary).toContain("completion package bundle");
    expect(board.memoryBoundary.exportCandidatePathSummary).toContain("after-board-closure-then-export path");
    expect(board.memoryBoundary.exportCandidateBlockerSummary).toContain("board closure as the blocker boundary");
    expect(board.memoryBoundary.exportCandidateTriggerSummary).toContain("still waits on board closure first");
    expect(board.memoryBoundary.exportCandidateAssemblySummary).toContain("package record set");
    expect(board.memoryBoundary.exportCandidatePhaseSummary).toContain("phase-two package export");
    expect(board.memoryBoundary.exportCandidateMutabilitySummary).toContain("replaceable until board closure");
    expect(board.memoryBoundary.exportCandidateScopeSummary).toContain("package record-set export scope");
    expect(board.memoryBoundary.exportCandidateIdentitySummary).toContain("identity after board closure");
    expect(board.memoryBoundary.exportCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "governance_history_export",
          label: "Governance history export",
          itemCount: 2,
          readinessLabel: "Ready now",
          exportRequestShapeLabel: "Single-record export request",
          exportSequenceLabel: "Foundational export sequence",
          exportDependencyPolicyLabel: "Independent export candidate",
          exportPayloadShapeLabel: "Governance history record",
          idempotencyPolicyLabel: "Deterministic upsert",
          replaySafetyLabel: "Replay-safe",
          conflictPolicyLabel: "Append or upsert",
          exportAtomicityLabel: "Record-level atomic",
          exportDerivationBasisLabel: "Decision-history-derived",
          exportRevisionPolicyLabel: "Append new revision",
          exportFreshnessSourceLabel: "Latest record state",
          exportValidationBoundaryLabel: "Record-level validation",
          exportCompletenessRuleLabel: "Self-contained record",
          exportSensitivityLabel: "Tenant business context",
          exportAudienceBoundaryLabel: "Tenant governance-history readers",
          exportSanitizationPolicyLabel: "Export as recorded",
          exportRedactionBoundaryLabel: "Governance-safe redaction",
          exportSourceDisclosurePolicyLabel: "Decision summary only",
          candidateClassLabel: "Governance history",
          durabilityConditionLabel: "Stable when recorded",
          ownershipBoundaryLabel: "Tenant-owned later",
          promotionMutabilityLabel: "Append-only history",
          promotionScopeLabel: "Single-record export",
          identityStabilityLabel: "Stable record identity",
          auditBackingLabel: "Decision-ledger-backed",
          concurrencyBoundaryLabel: "Independent export safe",
          recordTargetLabel: "Governance history record",
          promotionAuthorityLabel: "Tenant explicit export",
          promotionTriggerLabel: "Tenant export request"
        }),
        expect.objectContaining({
          id: "package_bundle_export",
          label: "Package bundle export",
          itemCount: 2,
          readinessLabel: "After board closes",
          exportRequestShapeLabel: "Package-bundle export request",
          exportSequenceLabel: "Board-closure-following sequence",
          exportDependencyPolicyLabel: "Depends on governance history export",
          exportPayloadShapeLabel: "Package snapshot bundle",
          idempotencyPolicyLabel: "Board-closure snapshot once",
          replaySafetyLabel: "Requires fresh board-closure snapshot",
          conflictPolicyLabel: "Replace latest closure snapshot",
          exportAtomicityLabel: "Closure-bundle atomic",
          exportDerivationBasisLabel: "Board-closure-snapshot-derived",
          exportRevisionPolicyLabel: "Replace closure-bundle revision",
          exportFreshnessSourceLabel: "Latest board-closure snapshot",
          exportValidationBoundaryLabel: "Closure-bundle validation",
          exportCompletenessRuleLabel: "Board-closure-complete bundle",
          exportSensitivityLabel: "Tenant deliverable context",
          exportAudienceBoundaryLabel: "Tenant package consumers",
          exportSanitizationPolicyLabel: "Sanitize before package export",
          exportRedactionBoundaryLabel: "Package-safe redaction",
          exportSourceDisclosurePolicyLabel: "Closure snapshot summary only",
          candidateClassLabel: "Packaged output",
          durabilityConditionLabel: "Stable after board closure",
          ownershipBoundaryLabel: "Tenant-owned later",
          promotionMutabilityLabel: "Replaceable until board closure",
          promotionScopeLabel: "Package record-set export",
          identityStabilityLabel: "Finalized after board closure",
          auditBackingLabel: "Package-closure-backed",
          concurrencyBoundaryLabel: "Requires board-closure snapshot",
          recordTargetLabel: "Package bundle export records",
          promotionAuthorityLabel: "Board closure, then tenant export",
          promotionTriggerLabel: "Board closure",
          dependsOnCandidateLabels: ["Governance history export"]
        })
      ])
    );
  });

  it("derives governance-ready partition counts from readiness, not only from role membership", async () => {
    const previewClient = createHarnessBoardClient(
      fetch,
      { location: { hostname: "127.0.0.1", search: "" } as Window["location"] }
    );
    const fallback = previewClient.getFallback();
    const stagedBoundary = {
      ...fallback.memoryBoundary,
      governanceReadyCount: undefined,
      roleSummary: undefined,
      partitions: undefined,
      exportReadyItems: fallback.memoryBoundary.exportReadyItems.map((item) =>
        item.id === "governance_decisions"
          ? {
              ...item,
              readiness: "after_board_closes" as const,
              readinessLabel: "After board closes"
            }
          : item
      )
    };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...fallback,
        memoryBoundary: stagedBoundary
      })
    });
    const client = createHarnessBoardClient(
      fetchImpl as unknown as typeof fetch,
      { location: { hostname: "app.spyderbyte.cloud" } as Window["location"] }
    );

    const board = await client.fetchBoard();

    expect(board.memoryBoundary.governanceReadyCount).toBe(1);
    expect(board.memoryBoundary.readyExportCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.waitingExportCandidateGroupCount).toBe(1);
    expect(board.memoryBoundary.foundationalExportCandidateCount).toBe(1);
    expect(board.memoryBoundary.boardClosureFollowingExportCandidateCount).toBe(1);
    expect(board.memoryBoundary.independentExportCandidateCount).toBe(1);
    expect(board.memoryBoundary.dependentExportCandidateCount).toBe(1);
    expect(board.memoryBoundary.roleSummary).toBe(
      "1 governance record candidate is ready now, and 2 packaged output candidates still wait on board closure."
    );
    expect(board.memoryBoundary.partitions.governanceHistoryCandidates.itemCount).toBe(1);
  });

  it("keeps the localhost fallback aligned with the bounded board action contract", () => {
    const client = createHarnessBoardClient(
      fetch,
      { location: { hostname: "127.0.0.1", search: "" } as Window["location"] }
    );

    const fallback = client.getFallback();
    const fallbackState = client.getFallbackState();

    expect(fallbackState.controlMode).toBe("preview");
    expect(fallbackState.variant).toBe("review-attention");
    expect(fallbackState.variantLabel).toBe("Final assembly review");
    expect(fallbackState.board).toEqual(fallback);

    expect(fallback.pendingAttention).toEqual(
      expect.objectContaining({
        actionRoute: "review-attention",
        actionPath: expect.stringContaining("/review-attention"),
        actionMethod: "POST",
        actionLabel: "Review final assembly",
        requestedAtLabel: "recently",
        recommendedOptionValue: "complete_run",
        requestFields: expect.arrayContaining([
          expect.objectContaining({
            name: "mode",
            suggestedValue: "reopen_deferred"
          })
        ]),
        actionOptions: expect.arrayContaining([
          expect.objectContaining({
            value: "complete_run",
            nextEffectSummary: expect.any(String)
          }),
          expect.objectContaining({
            value: "start_fresh_cycle",
            requiresConfirmation: true
          })
        ])
      })
    );

    expect(fallback.pendingApprovals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionRoute: "proposal-decision",
          actionMethod: "POST",
          actionLabel: "Review proposal decision",
          recommendedOptionValue: "approve",
          policyReasonLabel: "Review for expansion",
          nextReviewTrigger: expect.any(String),
          lastDecisionAtLabel: "recently",
          requestFields: expect.arrayContaining([
            expect.objectContaining({
              name: "decisionNote",
              supportedWhenValue: "defer"
            })
          ]),
          actionOptions: expect.arrayContaining([
            expect.objectContaining({
              value: "approve",
              nextEffectSummary: expect.any(String)
            }),
            expect.objectContaining({
              value: "defer",
              emphasis: "secondary"
            }),
            expect.objectContaining({
              value: "deny",
              requiresConfirmation: true
            })
          ])
        })
      ])
    );

    expect(fallback.recentDecisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          decisionKind: "lane_opened",
          recommendationSummary: expect.any(String)
        })
      ])
    );

    expect(fallback.followThroughItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "opened_lane",
          persona: "CFO",
          policyReasonLabel: expect.any(String),
          recommendationSummary: expect.any(String)
        })
      ])
    );

    expect(fallback.completionPackage).toEqual(
      expect.objectContaining({
        status: "assembling",
        deferredApprovalCount: 1,
        hasOpenGovernanceItems: true,
        recommendations: expect.arrayContaining([expect.any(String)]),
        objections: expect.arrayContaining([expect.any(String)]),
        governanceItems: expect.arrayContaining([
          expect.objectContaining({
            persona: "RESEARCHER",
            deliverableLabel: "Research Brief"
          })
        ]),
        deliverables: expect.arrayContaining([
          expect.objectContaining({
            persona: "CFO",
            deliverableLabel: "Pricing Review"
          })
        ])
      })
    );
    expect(fallback.completionPackage?.governanceItems).toHaveLength(1);
    expect(fallback.completionPackage?.deliverables).toHaveLength(2);
    expect(fallback.memoryBoundary).toEqual(
      expect.objectContaining({
        exportSummary: "2 export candidates are ready now, and 2 still wait for board closure.",
        roleSummary: "2 governance record candidates are ready now, and 2 packaged output candidates still wait on board closure.",
        ownershipSummary:
          "2 runtime memory buckets stay Wealth Factory-only, while 4 tenant-record candidate buckets may become tenant-owned later.",
        promotionSummary:
          "2 runtime memory buckets never promote, 2 candidate buckets are ready for explicit export later, and 2 candidate buckets still wait on board closure first.",
        recordTargetSummary:
          "2 governance history record candidates are ready, while 2 package record candidates stay package-shaped until board closure completes.",
        blockerSummary:
          "2 export candidate buckets are still blocked by board closure. Runtime memory stays non-promotable by design.",
        authoritySummary:
          "2 export candidate buckets are already tenant-controlled for later explicit export, while 2 buckets still need board closure before tenant export can own the next step.",
        triggerSummary:
          "2 export candidate buckets are waiting only on a later tenant export request, while 2 buckets still need board closure before that request can happen.",
        sequenceSummary:
          "1 export candidate group forms the foundational export sequence, and 1 group follows after board closure.",
        dependencySummary:
          "1 export candidate group stands independently, while 1 group still depends on the governance history export candidate.",
        nextStepSummary:
          "2 runtime buckets have no promotion step, 2 export candidate buckets are ready for a later tenant export step, and 2 buckets still need board closure before tenant export becomes the next step.",
        actionFamilySummary:
          "2 runtime buckets expose no promotion action, 2 export candidate buckets sit in the tenant export family, and 2 buckets remain in the board-closure-first family.",
        readyNowCount: 2,
        waitingOnBoardClosureCount: 2,
        governanceReadyCount: 2,
        packagedWaitingCount: 2,
        blockedCandidateCount: 2,
        tenantControlledCandidateCount: 2,
        boardControlledCandidateCount: 2,
        tenantExportTriggerCount: 2,
        boardClosureTriggerCount: 2,
        foundationalExportCandidateCount: 1,
        boardClosureFollowingExportCandidateCount: 1,
        independentExportCandidateCount: 1,
        dependentExportCandidateCount: 1,
        operationalItems: expect.arrayContaining([
          expect.objectContaining({
            id: "lane_continuity",
            destination: "wealth_factory_runtime",
            readiness: "live_runtime_only",
            readinessLabel: "Live runtime only",
            sourceSurface: "continuity_snapshots",
            candidateClass: "runtime_operational",
            durabilityCondition: "runtime_ephemeral",
            ownershipBoundary: "wealth_factory_only",
            ownershipBoundaryLabel: "Wealth Factory only",
            promotionPath: "never_promotes",
            promotionPathLabel: "Never promotes",
            recordTarget: "none_runtime_only",
            recordTargetLabel: "Runtime only",
            promotionBlocker: "not_applicable_runtime_only",
            promotionBlockerLabel: "Not applicable in runtime",
            promotionAuthority: "wealth_factory_runtime_only",
            promotionAuthorityLabel: "Wealth Factory runtime only",
            promotionTrigger: "not_applicable_runtime",
            promotionTriggerLabel: "No promotion trigger",
            promotionNextStep: "none_runtime_only",
            promotionNextStepLabel: "No promotion step",
            promotionActionFamily: "none_runtime_only",
            promotionActionFamilyLabel: "No promotion action"
          })
        ]),
        exportReadyItems: expect.arrayContaining([
          expect.objectContaining({
            id: "governance_decisions",
            destination: "tenant_record_candidate",
            readiness: "ready_now",
            readinessLabel: "Ready now",
            sourceSurface: "recent_decisions",
            candidateClass: "governance_history",
            durabilityCondition: "stable_when_recorded",
            ownershipBoundary: "tenant_owned_later",
            ownershipBoundaryLabel: "Tenant-owned later",
            promotionPath: "ready_for_explicit_export",
            promotionPathLabel: "Ready for explicit export",
            recordTarget: "governance_history_record",
            recordTargetLabel: "Governance history record",
            promotionBlocker: "none_ready_now",
            promotionBlockerLabel: "No blocker",
            promotionAuthority: "tenant_explicit_export",
            promotionAuthorityLabel: "Tenant explicit export",
            promotionTrigger: "tenant_export_request",
            promotionTriggerLabel: "Tenant export request",
            promotionNextStep: "tenant_export_available",
            promotionNextStepLabel: "Tenant export available",
            promotionActionFamily: "tenant_export_candidate",
            promotionActionFamilyLabel: "Tenant export family"
          })
        ])
      })
    );
  });

  it("supports a bounded resolve-attention localhost fallback variant for preview-only contract work", () => {
    const client = createHarnessBoardClient(
      fetch,
      { location: { hostname: "127.0.0.1", search: "?harnessPreview=resolve-attention" } as Window["location"] }
    );

    const fallbackState = client.getFallbackState();

    expect(fallbackState.controlMode).toBe("preview");
    expect(fallbackState.variant).toBe("resolve-attention");
    expect(fallbackState.variantLabel).toBe("Lane resume");
    expect(fallbackState.board.pendingAttention).toEqual(
      expect.objectContaining({
        actionRoute: "resolve-attention",
        actionPath: expect.stringContaining("/resolve-attention"),
        actionLabel: "Resume lane",
        allowedCommands: ["resume_lane"],
        targetSummary: expect.stringContaining("Resume CFO lane")
      })
    );
  });

  it("supports a bounded pending-approvals localhost fallback variant for governance-backlog preview work", () => {
    const client = createHarnessBoardClient(
      fetch,
      { location: { hostname: "127.0.0.1", search: "?harnessPreview=pending-approvals" } as Window["location"] }
    );

    const fallbackState = client.getFallbackState();

    expect(fallbackState.controlMode).toBe("preview");
    expect(fallbackState.variant).toBe("pending-approvals");
    expect(fallbackState.variantLabel).toBe("Approval backlog");
    expect(fallbackState.board.pendingAttention).toEqual(
      expect.objectContaining({
        actionRoute: "pending-approvals",
        actionLabel: "Review pending approvals",
        pendingApprovalCount: 1,
        proposedApprovalCount: 1,
        deferredApprovalCount: 0,
        backlogMode: "new_work_waiting",
        reasonLabel: "Governance backlog",
        targetProposalId: "proposal-fallback-1",
        targetStatusLabel: "Pending CEO approval",
        targetSummary: expect.stringContaining("Next queue target: RESEARCHER")
      })
    );
  });
});
