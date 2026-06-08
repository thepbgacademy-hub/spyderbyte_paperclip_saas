import { describe, expect, it } from "vitest";

import { buildBoardPath, resolveAppNavigationPath } from "../apps/web/src/App.js";

describe("app board routing", () => {
  it("builds an explicit board selector path when a workflow is selected", () => {
    expect(buildBoardPath("wf_tax_strategy")).toBe("/board?workflowId=wf_tax_strategy");
    expect(buildBoardPath("wf_package_followup")).toBe("/board?workflowId=wf_package_followup");
  });

  it("leaves the board path plain when no workflow is selected", () => {
    expect(buildBoardPath()).toBe("/board");
  });

  it("routes board navigation through the explicit workflow selector", () => {
    expect(resolveAppNavigationPath("/board", "wf_tax_strategy")).toBe("/board?workflowId=wf_tax_strategy");
    expect(resolveAppNavigationPath("/board", "wf_package_followup")).toBe("/board?workflowId=wf_package_followup");
  });

  it("does not rewrite non-board navigation paths", () => {
    expect(resolveAppNavigationPath("/results", "wf_tax_strategy")).toBe("/results");
  });
});
