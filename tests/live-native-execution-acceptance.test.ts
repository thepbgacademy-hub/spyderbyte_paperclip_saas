import { createRequire } from "node:module";

import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { waitForNativeExecutionAcceptance } = require("../scripts/lib/live-native-execution-acceptance.mjs");

describe("live native execution acceptance helper", () => {
  it("polls until a bootstrapped non-CEO lane records a fresh committed waiting outcome after the POST attempt", async () => {
    const loadState = vi.fn()
      .mockResolvedValueOnce({
        run: { id: "run-123", status: "queued" },
        outbox: { id: "outbox-1", status: "pending", lastError: null }
      })
      .mockResolvedValueOnce({
        run: { id: "run-123", status: "running" },
        outbox: { id: "outbox-1", status: "enqueued", lastError: null }
      })
      .mockResolvedValueOnce({
        run: { id: "run-123", status: "running" },
        outbox: { id: "outbox-1", status: "enqueued", lastError: null },
        event: {
          id: "event-1",
          cardId: "card-cmo-1",
          persona: "cmo",
          eventKind: "execution_outcome_committed",
          createdAt: "2026-06-18T23:40:05.000Z",
          payload: {
            outcomeState: "waiting",
            resultSummary: "Waiting for a bounded operator resume decision."
          }
        }
      });
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForNativeExecutionAcceptance({
        tenantId: "tenant-1",
        runId: "run-123",
        postAttemptedAt: "2026-06-18T23:40:00.000Z",
        loadState,
        sleepImpl,
        pollIntervalMs: 25,
        maxAttempts: 4
      })
    ).resolves.toEqual({
      ok: true,
      phase: "native_waiting_reached",
      attempts: 3,
      runId: "run-123",
      state: {
        run: { id: "run-123", status: "running" },
        outbox: { id: "outbox-1", status: "enqueued", lastError: null },
        event: {
          id: "event-1",
          cardId: "card-cmo-1",
          persona: "cmo",
          eventKind: "execution_outcome_committed",
          createdAt: "2026-06-18T23:40:05.000Z",
          payload: {
            outcomeState: "waiting",
            resultSummary: "Waiting for a bounded operator resume decision."
          }
        }
      },
      notes: [
        "The queued run advanced into bounded native execution.",
        "A fresh execution_outcome_committed event for the bootstrapped non-CEO lane recorded outcomeState waiting after the current POST attempt."
      ]
    });

    expect(loadState).toHaveBeenCalledTimes(3);
    expect(loadState).toHaveBeenNthCalledWith(1, {
      tenantId: "tenant-1",
      runId: "run-123",
      attempt: 1
    });
    expect(sleepImpl).toHaveBeenCalledTimes(2);
    expect(sleepImpl).toHaveBeenNthCalledWith(1, 25);
    expect(sleepImpl).toHaveBeenNthCalledWith(2, 25);
  });

  it("accepts blocked outcomes only when a fresh committed non-CEO lane event proves the worker advanced", async () => {
    const loadState = vi.fn().mockResolvedValue({
      run: { id: "run-blocked-123", status: "running" },
      outbox: { id: "outbox-blocked-1", status: "enqueued", lastError: null },
      event: {
        id: "event-blocked-1",
        cardId: "card-cfo-1",
        persona: "cfo",
        eventKind: "execution_outcome_committed",
        createdAt: "2026-06-18T23:41:05.000Z",
        payload: {
          outcomeState: "blocked",
          resultSummary: "A prerequisite is still missing before the bounded lane can continue.",
          continuitySummary: "Native execution reached the provider lane but the provider rejected the request with HTTP 403."
        }
      }
    });

    await expect(
      waitForNativeExecutionAcceptance({
        tenantId: "tenant-1",
        runId: "run-blocked-123",
        postAttemptedAt: "2026-06-18T23:41:00.000Z",
        loadState,
        maxAttempts: 1
      })
    ).resolves.toMatchObject({
      ok: true,
      phase: "native_blocked_reached",
      attempts: 1,
      runId: "run-blocked-123",
      notes: [
        "The queued run advanced into bounded native execution.",
        "A fresh execution_outcome_committed event for the bootstrapped non-CEO lane recorded outcomeState blocked after the current POST attempt.",
        "Blocked outcome summary: Native execution reached the provider lane but the provider rejected the request with HTTP 403."
      ]
    });
  });

  it("requires the expected blocked tax artifact name when the proof asks for tax prerequisite confirmation", async () => {
    const loadState = vi.fn().mockResolvedValue({
      run: { id: "run-tax-blocked-123", status: "running" },
      outbox: { id: "outbox-tax-blocked-1", status: "enqueued", lastError: null },
      event: {
        id: "event-tax-blocked-1",
        cardId: "card-cfo-tax-1",
        persona: "cfo",
        eventKind: "execution_outcome_committed",
        createdAt: "2026-06-23T23:41:05.000Z",
        payload: {
          outcomeState: "blocked",
          resultSummary: "A prerequisite is still missing before the bounded lane can continue.",
          continuitySummary:
            "Founder tax posture documents are still missing. Keep the lane blocked until founder_tax_posture_documents is supplied."
        }
      }
    });

    await expect(
      waitForNativeExecutionAcceptance({
        tenantId: "tenant-1",
        runId: "run-tax-blocked-123",
        postAttemptedAt: "2026-06-23T23:41:00.000Z",
        loadState,
        expectedBlockedArtifactName: "founder_tax_posture_documents",
        maxAttempts: 1
      })
    ).resolves.toMatchObject({
      ok: true,
      phase: "native_blocked_reached",
      notes: expect.arrayContaining([
        "Blocked outcome named the expected prerequisite artifact: founder_tax_posture_documents."
      ])
    });
  });

  it("accepts a fresh non-CEO worker claim before any outcome is committed", async () => {
    const loadState = vi.fn().mockResolvedValue({
      run: { id: "run-claimed-123", status: "running" },
      outbox: { id: "outbox-claimed-1", status: "enqueued", lastError: null },
      lane: {
        cardId: "card-cfo-claimed-1",
        persona: "cfo",
        title: "Pressure-test the pricing lane",
        state: "working",
        attemptedAt: "2026-06-18T23:41:00.000Z",
        executionClaimedAt: "2026-06-18T23:41:05.000Z",
        laneCount: 1
      }
    });

    await expect(
      waitForNativeExecutionAcceptance({
        tenantId: "tenant-1",
        runId: "run-claimed-123",
        postAttemptedAt: "2026-06-18T23:41:00.000Z",
        loadState,
        maxAttempts: 1
      })
    ).resolves.toEqual({
      ok: true,
      phase: "native_execution_claimed",
      attempts: 1,
      runId: "run-claimed-123",
      state: {
        run: { id: "run-claimed-123", status: "running" },
        outbox: { id: "outbox-claimed-1", status: "enqueued", lastError: null },
        lane: {
          cardId: "card-cfo-claimed-1",
          persona: "cfo",
          title: "Pressure-test the pricing lane",
          state: "working",
          attemptedAt: "2026-06-18T23:41:00.000Z",
          executionClaimedAt: "2026-06-18T23:41:05.000Z",
          laneCount: 1
        }
      },
      notes: [
        "The queued run advanced into bounded native execution.",
        "The bootstrapped non-CEO lane recorded a fresh worker claim after the current POST attempt."
      ]
    });
  });

  it("keeps polling past a fresh worker claim when the caller requires a committed outcome", async () => {
    const loadState = vi.fn()
      .mockResolvedValueOnce({
        run: { id: "run-tax-claimed-123", status: "running" },
        outbox: { id: "outbox-tax-claimed-1", status: "enqueued", lastError: null },
        lane: {
          cardId: "card-cfo-tax-claimed-1",
          persona: "cfo",
          title: "Review the founder tax posture",
          state: "working",
          attemptedAt: "2026-06-18T23:41:00.000Z",
          executionClaimedAt: "2026-06-18T23:41:05.000Z",
          laneCount: 1
        }
      })
      .mockResolvedValueOnce({
        run: { id: "run-tax-claimed-123", status: "completed" },
        outbox: { id: "outbox-tax-claimed-1", status: "enqueued", lastError: null },
        lane: {
          cardId: "card-cfo-tax-claimed-1",
          persona: "cfo",
          title: "Review the founder tax posture",
          state: "done",
          attemptedAt: "2026-06-18T23:41:00.000Z",
          executionClaimedAt: "2026-06-18T23:41:05.000Z",
          laneCount: 1
        },
        event: {
          id: "event-tax-done-1",
          cardId: "card-cfo-tax-claimed-1",
          persona: "cfo",
          eventKind: "execution_outcome_committed",
          createdAt: "2026-06-18T23:41:08.000Z",
          payload: {
            outcomeState: "done",
            resultSummary: "The bounded tax strategy review completed directly."
          }
        }
      });
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForNativeExecutionAcceptance({
        tenantId: "tenant-1",
        runId: "run-tax-claimed-123",
        postAttemptedAt: "2026-06-18T23:41:00.000Z",
        loadState,
        sleepImpl,
        pollIntervalMs: 10,
        maxAttempts: 2,
        allowFreshExecutionClaimAsTerminal: false
      })
    ).resolves.toMatchObject({
      ok: true,
      phase: "native_done_reached",
      attempts: 2,
      notes: [
        "The queued run advanced into bounded native execution.",
        "A fresh execution_outcome_committed event for the bootstrapped non-CEO lane recorded outcomeState done after the current POST attempt."
      ]
    });

    expect(loadState).toHaveBeenCalledTimes(2);
    expect(sleepImpl).toHaveBeenCalledTimes(1);
  });

  it("times out honestly when workflow status changes but no fresh committed non-CEO lane outcome appears", async () => {
    const loadState = vi.fn()
      .mockResolvedValueOnce({
        run: { id: "run-timeout-123", status: "running" },
        outbox: { id: "outbox-timeout-1", status: "enqueued", lastError: null }
      })
      .mockResolvedValueOnce({
        run: { id: "run-timeout-123", status: "completed" },
        outbox: { id: "outbox-timeout-1", status: "enqueued", lastError: null },
        event: {
          id: "event-stale-1",
          cardId: "card-cmo-1",
          persona: "cmo",
          eventKind: "execution_outcome_committed",
          createdAt: "2026-06-18T23:42:00.000Z",
          payload: {
            outcomeState: "done",
            resultSummary: "Completed before the current POST attempt."
          }
        }
      })
      .mockResolvedValueOnce({
        run: { id: "run-timeout-123", status: "completed" },
        outbox: { id: "outbox-timeout-1", status: "enqueued", lastError: null },
        event: {
          id: "event-ceo-1",
          cardId: "card-ceo-1",
          persona: "ceo",
          eventKind: "execution_outcome_committed",
          createdAt: "2026-06-18T23:42:10.000Z",
          payload: {
            outcomeState: "done",
            resultSummary: "Fresh but on the CEO lane, so not proof of bootstrapped worker advancement."
          }
        }
      });
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForNativeExecutionAcceptance({
        tenantId: "tenant-1",
        runId: "run-timeout-123",
        postAttemptedAt: "2026-06-18T23:42:05.000Z",
        loadState,
        sleepImpl,
        pollIntervalMs: 10,
        maxAttempts: 3
      })
    ).resolves.toEqual({
      ok: false,
      phase: "native_advancement_timeout",
      attempts: 3,
      runId: "run-timeout-123",
      state: {
        run: { id: "run-timeout-123", status: "completed" },
        outbox: { id: "outbox-timeout-1", status: "enqueued", lastError: null },
        event: {
          id: "event-ceo-1",
          cardId: "card-ceo-1",
          persona: "ceo",
          eventKind: "execution_outcome_committed",
          createdAt: "2026-06-18T23:42:10.000Z",
          payload: {
            outcomeState: "done",
            resultSummary: "Fresh but on the CEO lane, so not proof of bootstrapped worker advancement."
          }
        }
      },
      notes: [
        "Timed out before durable state proved a bounded native-execution advancement.",
        "Last observed run status: completed. Last observed outbox status: enqueued. Last observed committed outcome: done."
      ]
    });

    expect(loadState).toHaveBeenCalledTimes(3);
    expect(sleepImpl).toHaveBeenCalledTimes(2);
  });
});
