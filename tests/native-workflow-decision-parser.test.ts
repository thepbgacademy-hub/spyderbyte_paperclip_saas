import { describe, expect, it } from "vitest";

import { tryParseWorkflowDecision } from "../src/worker/native-workflow-decision-parser.js";

describe("native workflow decision parser", () => {
  it("accepts an explicit required artifact name on blocked decisions", () => {
    expect(
      tryParseWorkflowDecision(
        JSON.stringify({
          state: "blocked",
          summary: "Founder tax posture documents are still missing before this lane can continue.",
          requiredArtifactName: "founder_tax_posture_documents"
        })
      )
    ).toEqual({
      state: "blocked",
      summary: "Founder tax posture documents are still missing before this lane can continue.",
      requiredArtifactName: "founder_tax_posture_documents"
    });
  });

  it("rejects unknown required artifact names", () => {
    expect(
      tryParseWorkflowDecision(
        JSON.stringify({
          state: "blocked",
          summary: "A prerequisite artifact is missing.",
          requiredArtifactName: "unknown_artifact"
        })
      )
    ).toBeNull();
  });

  it("rejects required artifact names on non-blocked decisions", () => {
    expect(
      tryParseWorkflowDecision(
        JSON.stringify({
          state: "done",
          summary: "The lane is complete.",
          requiredArtifactName: "founder_tax_posture_documents"
        })
      )
    ).toBeNull();
  });
});
