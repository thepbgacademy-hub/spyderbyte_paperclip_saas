import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { validateExpectedAuthStateRefOnRunBinding } = require("../scripts/lib/live-native-binding-consistency.mjs") as {
  validateExpectedAuthStateRefOnRunBinding(input: {
    expectedAuthStateRef?: string | null;
    workflowId?: string | null;
    durableSnapshot?: {
      run?: {
        providerContext?: Array<{
          metadata?: Record<string, unknown>;
        }>;
      };
    } | null;
  }): {
    ok: boolean;
    phase: string;
    notes: string[];
  };
};

describe("live native binding consistency", () => {
  it("accepts a matching auth-state reference on the single bound provider context", () => {
    expect(
      validateExpectedAuthStateRefOnRunBinding({
        expectedAuthStateRef: "first-subscriber-openai-device",
        workflowId: "wf_connect_first_workflow",
        durableSnapshot: {
          run: {
            providerContext: [
              {
                metadata: {
                  authStateRef: "first-subscriber-openai-device"
                }
              }
            ]
          }
        }
      })
    ).toMatchObject({
      ok: true,
      phase: "binding_auth_state_ref_verified"
    });
  });

  it("fails closed when the live binding still carries an older auth-state alias", () => {
    expect(
      validateExpectedAuthStateRefOnRunBinding({
        expectedAuthStateRef: "first-subscriber-openai-device",
        workflowId: "wf_connect_first_workflow",
        durableSnapshot: {
          run: {
            providerContext: [
              {
                metadata: {
                  authStateRef: "codex-home:first-subscriber"
                }
              }
            ]
          }
        }
      })
    ).toMatchObject({
      ok: false,
      phase: "binding_auth_state_ref_mismatch",
      notes: [
        "The live bound provider context for wf_connect_first_workflow carried authStateRef codex-home:first-subscriber, expected first-subscriber-openai-device."
      ]
    });
  });
});
