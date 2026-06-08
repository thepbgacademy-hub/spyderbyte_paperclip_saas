import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { resolveDemoSeedProfile } = require("../scripts/lib/demo-seed-profiles.mjs");

describe("demo seed profiles", () => {
  it("resolves the built-in senary preset without falling back to primary ids", () => {
    expect(resolveDemoSeedProfile({ lane: "senary" }, {})).toMatchObject({
      laneName: "senary",
      tenantId: "22222222-2222-4222-8222-777777777777",
      userId: "11111111-1111-4111-8111-666666666666",
      workflowId: "44444444-4444-4444-8444-999999999999",
      providerReferenceId: "55555555-5555-4555-8555-aaaaaaaaaaaa",
      purchaseId: "66666666-6666-4666-8666-bbbbbbbbbbbb",
      providerSecretRef: "wf_secret_demo_six_openai"
    });
  });

  it("resolves the built-in tax-strategy preset with native package wiring", () => {
    expect(resolveDemoSeedProfile({ lane: "tax-strategy" }, {})).toMatchObject({
      laneName: "tax-strategy",
      packageId: "33333333-3333-4333-8333-444444444444",
      packageKey: "tax-strategy",
      packageName: "Tax Strategy",
      workflowName: "Wealth Factory Tax Strategy",
      workflowDescription: "Review tax strategy recommendations for the installed package."
    });
  });

  it("resolves the built-in package-followup preset with native package wiring", () => {
    expect(resolveDemoSeedProfile({ lane: "package-followup" }, {})).toMatchObject({
      laneName: "package-followup",
      packageId: "33333333-3333-4333-8333-555555555555",
      packageKey: "package-followup",
      packageName: "Package Follow-up",
      workflowName: "Wealth Factory Package Follow-up",
      workflowDescription: "Advance the bounded package follow-up workflow for the installed package."
    });
  });

  it("fails closed on an unknown lane when required explicit ids are missing", () => {
    expect(() => resolveDemoSeedProfile({ lane: "octonary" }, {})).toThrow(
      "Unknown demo lane 'octonary'. Use a known preset"
    );
  });

  it("builds a custom lane when explicit ids are provided", () => {
    expect(
      resolveDemoSeedProfile(
        {
          lane: "client-seven",
          user: "user-7",
          tenant: "tenant-7",
          workflow: "workflow-7",
          "provider-reference": "provider-7",
          purchase: "purchase-7"
        },
        {}
      )
    ).toMatchObject({
      laneName: "client-seven",
      userId: "user-7",
      tenantId: "tenant-7",
      workflowId: "workflow-7",
      providerReferenceId: "provider-7",
      purchaseId: "purchase-7",
      tenantSlug: "wealth-factory-client-seven",
      userEmail: "client-seven@wealthfactory.local",
      providerSecretRef: "wf_secret_demo_client-seven_openai"
    });
  });
});
