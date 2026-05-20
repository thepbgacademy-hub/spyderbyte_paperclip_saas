import { describe, expect, it, vi } from "vitest";

import { createPaperclipIssueLaunchAdapter, PaperclipIssueLaunchError } from "../src/paperclip/issue-launch.js";

describe("paperclip issue launch adapter", () => {
  it("creates an issue and polls until executionRunId is available", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "WEA-19" }))
      .mockResolvedValueOnce(jsonResponse({ id: "WEA-19" }))
      .mockResolvedValueOnce(jsonResponse({ id: "WEA-19", executionRunId: "hb-run-1" }));

    const adapter = createPaperclipIssueLaunchAdapter({
      baseUrl: "https://paperclip.internal.local",
      serviceToken: "pc-token",
      fetchImpl,
      pollIntervalMs: 0,
      maxPollAttempts: 3,
      resolveLaunchTarget: vi.fn().mockResolvedValue({
        agentId: "agent-1",
        issueTitle: "WF workflow",
        issueBody: "launch"
      })
    });

    await expect(
      adapter.launch({
        companyId: "company-1",
        workflowId: "workflow-1",
        spyderbyteRunId: "run-1",
        providerContext: []
      })
    ).resolves.toEqual({
      paperclipRunId: "hb-run-1",
      status: "running"
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://paperclip.internal.local/api/companies/company-1/issues",
      expect.objectContaining({
        method: "POST",
        headers: {
          authorization: "Bearer pc-token",
          "content-type": "application/json"
        }
      })
    );
  });

  it("fails safely when paperclip never resolves an execution run id", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "WEA-20" }))
      .mockResolvedValue(jsonResponse({ id: "WEA-20" }));
    const adapter = createPaperclipIssueLaunchAdapter({
      baseUrl: "https://paperclip.internal.local",
      serviceToken: "pc-token",
      fetchImpl,
      pollIntervalMs: 0,
      maxPollAttempts: 2,
      resolveLaunchTarget: vi.fn().mockResolvedValue({
        agentId: "agent-1"
      })
    });

    await expect(
      adapter.launch({
        companyId: "company-1",
        workflowId: "workflow-1",
        spyderbyteRunId: "run-1",
        providerContext: []
      })
    ).rejects.toBeInstanceOf(PaperclipIssueLaunchError);
  });

  it("retries transient fetch failures while polling the issue run link", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "WEA-21" }))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse({ id: "WEA-21", executionRunId: "hb-run-2" }));

    const adapter = createPaperclipIssueLaunchAdapter({
      baseUrl: "https://paperclip.internal.local",
      serviceToken: "pc-token",
      fetchImpl,
      pollIntervalMs: 0,
      maxPollAttempts: 2,
      requestRetryAttempts: 2,
      requestRetryDelayMs: 0,
      resolveLaunchTarget: vi.fn().mockResolvedValue({
        agentId: "agent-1"
      })
    });

    await expect(
      adapter.launch({
        companyId: "company-1",
        workflowId: "workflow-1",
        spyderbyteRunId: "run-1",
        providerContext: []
      })
    ).resolves.toEqual({
      paperclipRunId: "hb-run-2",
      status: "running"
    });
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
