import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const scriptPath = "scripts/prove-stage-live-native-execution.mjs";

describe("stage live native execution runner script", () => {
  it("runs the matched core-family native execution proof sequence on public workflow ids without wrapper-side template lookup", () => {
    const script = readFileSync(scriptPath, "utf8");
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };

    expect(script).toContain("sudo-password-file");
    expect(script).toContain("readFileSync");
    expect(script).toContain("parseSecretFileContents");
    expect(script).toContain("preflight-container");
    expect(script).toContain("runStageLiveNativeExecutionPlan");
    expect(script).toContain("wf_connect_first_workflow");
    expect(script).toContain("wf_tax_strategy");
    expect(script).toContain("wf_package_followup");
    expect(script).toContain("tertiary");
    expect(script).toContain("quinary");
    expect(script).toContain("requireWorkflowTemplateId");
    expect(script).toContain("VPS2_SUDO_PASSWORD: sudoPassword");
    expect(script).not.toContain("workflow_templates");
    expect(script).not.toContain("selectSingleWorkflowTemplateId");
    expect(script).not.toContain("wealth_factory_packages");
    expect(script).not.toContain("docker exec");
    expect(packageJson.scripts["prove:stage-live-native-execution"]).toBe("node scripts/prove-stage-live-native-execution.mjs");
  });
});
