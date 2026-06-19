import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/prove-stage-live-deployment.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };

describe("stage live proof runner script", () => {
  it("runs the bounded preflight, smoke, and live Playwright proof sequence", () => {
    expect(script).toContain("npm run build:server");
    expect(script).toContain("npm run check:live-runtime --");
    expect(script).toContain("node scripts/external-smoke-security.mjs");
    expect(script).toContain("npx playwright test apps/web/tests/live/deployment.spec.ts --config apps/web/playwright.live.config.ts");
    expect(script).toContain("createRuntimeSessionToken");
    expect(script).toContain("buildLaneProofEnv");
    expect(script).toContain("selectSingleWorkflowTemplateId");
    expect(script).toContain("sessionToken");
  });

  it("is exposed as an npm proof command", () => {
    expect(packageJson.scripts["prove:stage-live"]).toBe("node scripts/prove-stage-live-deployment.mjs");
  });
});
