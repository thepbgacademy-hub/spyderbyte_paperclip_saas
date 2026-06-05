import { describe, expect, it } from "vitest";

import { isPaperclipExecutionRequired, selectExecutionEngine } from "../src/harness/execution-selector.js";

describe("harness execution selector", () => {
  it("routes only opted-in eligible workflows to wf_harness_v1 when they are not cut over natively by default", () => {
    expect(
      selectExecutionEngine({
        workflowId: "wf_tax_strategy",
        harnessEnabledWorkflowIds: ["wf_tax_strategy"],
        harnessEligibleWorkflowIds: ["wf_connect_first_workflow", "wf_tax_strategy"]
      })
    ).toBe("wf_harness_v1");

    expect(
      selectExecutionEngine({
        workflowId: "wf_tax_strategy",
        harnessEnabledWorkflowIds: [],
        harnessEligibleWorkflowIds: ["wf_connect_first_workflow", "wf_tax_strategy"]
      })
    ).toBe("paperclip");

    expect(
      selectExecutionEngine({
        workflowId: "wf_social_campaign_builder",
        harnessEnabledWorkflowIds: ["wf_social_campaign_builder"],
        harnessEligibleWorkflowIds: ["wf_connect_first_workflow", "wf_tax_strategy"]
      })
    ).toBe("paperclip");
  });

  it("routes native-default eligible workflows to wf_native_v1 before the Paperclip adapter path", () => {
    expect(
      selectExecutionEngine({
        workflowId: "wf_connect_first_workflow",
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"],
        harnessEligibleWorkflowIds: ["wf_connect_first_workflow", "wf_tax_strategy"],
        nativeDefaultWorkflowIds: ["wf_connect_first_workflow"]
      })
    ).toBe("wf_native_v1");
  });

  it("treats native-default-only workflow configs as not requiring the Paperclip adapter", () => {
    expect(
      isPaperclipExecutionRequired({
        configuredWorkflowIds: ["wf_connect_first_workflow"],
        harnessEnabledWorkflowIds: ["wf_connect_first_workflow"],
        harnessEligibleWorkflowIds: ["wf_connect_first_workflow", "wf_tax_strategy"],
        nativeDefaultWorkflowIds: ["wf_connect_first_workflow"]
      })
    ).toBe(false);

    expect(
      isPaperclipExecutionRequired({
        configuredWorkflowIds: ["wf_tax_strategy"],
        harnessEnabledWorkflowIds: ["wf_tax_strategy"],
        harnessEligibleWorkflowIds: ["wf_connect_first_workflow", "wf_tax_strategy"],
        nativeDefaultWorkflowIds: ["wf_connect_first_workflow"]
      })
    ).toBe(false);
  });
});
