import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  CORE_STAGE_PACKAGE_ROWS,
  STAGE_DEMO_LANE_NAMES,
  buildStageDemoRealignmentPlan,
  generateStageDemoRealignmentSql
} = require("../scripts/lib/wf-stage-demo-realignment.mjs") as {
  CORE_STAGE_PACKAGE_ROWS: Array<{
    id: string;
    publicPackageId: string;
    packageKey: string;
    name: string;
    kind: string;
    metadata: { workflowFamily: string };
  }>;
  STAGE_DEMO_LANE_NAMES: string[];
  buildStageDemoRealignmentPlan(): Array<{
    laneName: string;
    tenantSlug: string;
    tenantName: string;
    packageId: string;
    publicPackageId: string;
    packageKey: string;
    packageName: string;
    packageKind: string;
    packageMetadata: Record<string, unknown>;
    workflowName: string;
    workflowDescription: string;
  }>;
  generateStageDemoRealignmentSql(): string;
};

describe("Wealth Factory stage demo realignment", () => {
  it("maps the six demo tenants onto the three intended core package families", () => {
    const plan = buildStageDemoRealignmentPlan();

    expect(plan.map((entry) => entry.laneName)).toEqual(STAGE_DEMO_LANE_NAMES);
    expect(plan.map((entry) => entry.tenantSlug)).toEqual([
      "wealth-factory-demo",
      "wealth-factory-demo-two",
      "wealth-factory-demo-three",
      "wealth-factory-demo-four",
      "wealth-factory-demo-five",
      "wealth-factory-demo-six"
    ]);
    expect(plan.map((entry) => entry.packageKey)).toEqual([
      "pkg_bib_connect",
      "pkg_bib_connect",
      "pkg_tax_strategy",
      "pkg_tax_strategy",
      "pkg_package_followup",
      "pkg_package_followup"
    ]);
    expect(plan.map((entry) => entry.publicPackageId)).toEqual(plan.map((entry) => entry.packageKey));
    expect(plan.every((entry) => entry.packageId !== "33333333-3333-4333-8333-333333333333")).toBe(true);
    expect(plan.every((entry) => entry.workflowName.includes("Social Calendar"))).toBe(false);
  });

  it("generates a bounded, idempotent transaction that only realigns the intended demo tenants", () => {
    const sql = generateStageDemoRealignmentSql();

    expect(sql).toContain("begin;");
    expect(sql).toContain("commit;");
    expect(sql).toContain("insert into wfpc.wealth_factory_packages");
    expect(sql).toContain("insert into wfpc.package_provider_requirements");
    expect(sql).toContain("update wfpc.tenant_package_purchases");
    expect(sql).toContain("update wfpc.tenant_package_installs");
    expect(sql).toContain("update wfpc.workflow_templates");
    expect(sql).not.toMatch(/social-media-agency|Wealth Factory Social Calendar/i);

    for (const packageRow of CORE_STAGE_PACKAGE_ROWS) {
      expect(sql).toContain(packageRow.id);
      expect(sql).toContain(packageRow.packageKey);
      expect(sql).toContain(packageRow.name);
    }

    for (const tenantSlug of [
      "wealth-factory-demo",
      "wealth-factory-demo-two",
      "wealth-factory-demo-three",
      "wealth-factory-demo-four",
      "wealth-factory-demo-five",
      "wealth-factory-demo-six"
    ]) {
      expect(sql).toContain(tenantSlug);
    }
  });
});
