import { describe, expect, it } from "vitest";

import { createHarnessCardRecord, createHarnessRunRecord } from "../src/harness/types.js";
import {
  assertValidCardTransition,
  assertValidRunTransition,
  transitionHarnessCard,
  transitionHarnessRun
} from "../src/harness/state-machine.js";

describe("harness state machine", () => {
  it("allows valid queued run and card transitions", () => {
    const run = createHarnessRunRecord({
      tenantId: "tenant-123",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      orchestratorPersona: "ceo",
      runtimeContext: {
        providerKind: "openai_api",
        credentialLabel: "Primary OpenAI"
      }
    });
    const card = createHarnessCardRecord({
      runId: run.id,
      persona: "ceo",
      title: "Plan the first workflow",
      deliverableType: "plan"
    });

    expect(assertValidRunTransition("queued", "planning")).toBe("planning");
    expect(assertValidCardTransition("queued", "planning")).toBe("planning");
    expect(transitionHarnessRun(run, "planning").state).toBe("planning");
    expect(transitionHarnessCard(card, "planning").state).toBe("planning");
  });

  it("rejects invalid terminal and jump transitions", () => {
    expect(() => assertValidRunTransition("queued", "done")).toThrow(/invalid harness run transition/i);
    expect(() => assertValidRunTransition("done", "active")).toThrow(/invalid harness run transition/i);
    expect(() => assertValidCardTransition("queued", "done")).toThrow(/invalid harness card transition/i);
    expect(() => assertValidCardTransition("cancelled", "working")).toThrow(/invalid harness card transition/i);
  });
});
