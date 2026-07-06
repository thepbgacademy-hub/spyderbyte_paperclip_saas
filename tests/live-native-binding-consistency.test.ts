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

  it("accepts the older first-subscriber auth-state alias as equivalent to the canonical runtime value", () => {
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
      ok: true,
      phase: "binding_auth_state_ref_verified",
      notes: [
        "The live bound provider context for wf_connect_first_workflow matched authStateRef first-subscriber-openai-device."
      ]
    });
  });

  it("accepts the legacy and canonical first-subscriber aliases as the same live binding seam", () => {
    expect(
      validateExpectedAuthStateRefOnRunBinding({
        expectedAuthStateRef: "codex-home:first-subscriber",
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
});
