import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { buildNativeExecutionAcceptanceOptions } = require("../scripts/lib/live-native-execution-proof-options.mjs") as {
  buildNativeExecutionAcceptanceOptions(workflowId: string): {
    allowFreshExecutionClaimAsTerminal?: boolean;
  };
};

describe("live native execution proof options", () => {
  it("keeps wf_connect_first_workflow on the attention-first acceptance path without inheriting tax-only blocked-artifact requirements", () => {
    expect(buildNativeExecutionAcceptanceOptions("wf_connect_first_workflow")).toEqual({
      allowFreshExecutionClaimAsTerminal: false
    });
  });

  it("keeps wf_tax_strategy on the attention-first path without smuggling tax-domain blocker assertions into plumbing proof", () => {
    expect(buildNativeExecutionAcceptanceOptions("wf_tax_strategy")).toEqual({
      allowFreshExecutionClaimAsTerminal: false
    });
  });

  it("leaves unrelated workflows on the default acceptance behavior", () => {
    expect(buildNativeExecutionAcceptanceOptions("wf_package_followup")).toEqual({});
  });
});
