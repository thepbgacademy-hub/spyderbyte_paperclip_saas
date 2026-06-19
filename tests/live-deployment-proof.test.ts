import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const script = readFileSync("apps/web/tests/live/deployment.spec.ts", "utf8");

describe("live deployment harness-board proof", () => {
  it("derives authenticated harness-board workflow selection from one canonical board url", () => {
    expect(script).toContain("resolveHarnessBoardUrl(requiredBaseUrl(baseURL))");
    expect(script).toContain('boardUrl.searchParams.get("workflowId")');
    expect(script).toContain("WF_LIVE_HARNESS_WORKFLOW_ID");
    expect(script).toContain('new URL(response.url()).searchParams.get("workflowId") === selectedWorkflowId');
  });

  it("fails closed when authenticated harness-board verification lacks an explicit workflow selector", () => {
    expect(script).toContain("WF_LIVE_HARNESS_WORKFLOW_ID or WF_LIVE_HARNESS_BOARD_PATH");
    expect(script).toContain("authenticated live harness-board verification requires an explicit workflow selector");
    expect(script).toContain("shellBody");
    expect(script).toContain("forbiddenHarnessPrivateFields");
  });
});
