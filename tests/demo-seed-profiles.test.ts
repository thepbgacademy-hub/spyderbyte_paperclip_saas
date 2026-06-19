import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { resolveDemoSeedProfile } = require("../scripts/lib/demo-seed-profiles.mjs");

describe("demo seed profiles", () => {
  it("resolves the default primary preset to the core connect-first workflow family instead of the retired social-media package", () => {
    expect(resolveDemoSeedProfile({ lane: "primary" }, {})).toMatchObject({
      laneName: "primary",
      packageId: "pkg_bib_connect",
      packageKey: "connect-first",
      packageName: "Connect First",
      workflowName: "Connect First Workflow",
      workflowDescription: "CEO-led first-workflow setup run inside the Wealth Factory harness."
    });
  });

  it("keeps every numbered demo preset on core Wealth Factory workflow families instead of the retired social-media package", () => {
    for (const lane of ["primary", "secondary", "tertiary", "quaternary", "quinary", "senary"] as const) {
      const profile = resolveDemoSeedProfile({ lane }, {});

      expect(profile.packageId).not.toBe("33333333-3333-4333-8333-333333333333");
      expect(profile.packageKey).not.toBe("social-media-agency");
      expect(profile.packageName).not.toBe("Social Media Agency");
      expect(profile.workflowName).not.toMatch(/social/i);
      expect(profile.workflowDescription).toMatch(/Wealth Factory harness/i);
    }
  });

  it("resolves the built-in senary preset without falling back to primary ids", () => {
    expect(resolveDemoSeedProfile({ lane: "senary" }, {})).toMatchObject({
      laneName: "senary",
      tenantId: "22222222-2222-4222-8222-777777777777",
      userId: "11111111-1111-4111-8111-666666666666",
      packageId: "pkg_package_followup",
      workflowId: "wf_package_followup",
      providerReferenceId: "55555555-5555-4555-8555-aaaaaaaaaaaa",
      purchaseId: "66666666-6666-4666-8666-bbbbbbbbbbbb",
      providerSecretRef: "wf_secret_demo_six_openai"
    });
  });

  it("resolves the built-in tax-strategy preset with native package wiring", () => {
    expect(resolveDemoSeedProfile({ lane: "tax-strategy" }, {})).toMatchObject({
      laneName: "tax-strategy",
      packageId: "pkg_tax_strategy",
      packageKey: "tax-strategy",
      packageName: "Tax Strategy",
      workflowId: "wf_tax_strategy",
      workflowName: "Tax Strategy Workflow",
      workflowDescription: "Bounded tax strategy review run inside the Wealth Factory harness."
    });
  });

  it("resolves the built-in package-followup preset with native package wiring", () => {
    expect(resolveDemoSeedProfile({ lane: "package-followup" }, {})).toMatchObject({
      laneName: "package-followup",
      packageId: "pkg_package_followup",
      packageKey: "package-followup",
      packageName: "Package Follow-up",
      workflowId: "wf_package_followup",
      workflowName: "Package Follow-up Workflow",
      workflowDescription: "Bounded package follow-up run inside the Wealth Factory harness."
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
      packageId: "pkg_bib_connect",
      packageKey: "connect-first",
      packageName: "Connect First",
      providerSecretRef: "wf_secret_demo_client-seven_openai"
    });
  });
});
