import { describe, expect, it } from "vitest";

import { createWorkspace } from "../src/factory/workspaces/workspace-service.js";
import { loadBlueprintPackageManifest } from "../src/factory/packages/package-manifest-loader.js";
import { installBlueprintPackage } from "../src/factory/packages/package-install-service.js";
import { submitIntakeAnswers, startIntakeRun } from "../src/factory/runs/intake-run-service.js";
import {
  completePositioningAnalysisWithProvider,
  startPositioningAnalysisStation
} from "../src/factory/runs/positioning-station-service.js";
import { createStubLLMProvider } from "../src/factory/providers/stub-provider.js";
import { createCurrentSliceManifest } from "./factory-package-manifest-fixtures.js";

function setUpAnalysisRun() {
  const workspace = createWorkspace({
    id: "ws_123",
    name: "Acme Advisory",
    slug: "acme-advisory",
    createdAt: "2026-07-06T20:00:00.000Z"
  });
  const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());
  const packageInstall = installBlueprintPackage({
    id: "install_123",
    workspaceId: workspace.id,
    blueprint,
    installedAt: "2026-07-06T20:01:00.000Z"
  });
  const intakeRun = startIntakeRun({
    id: "run_123",
    workspace,
    packageInstall,
    blueprint,
    startedAt: "2026-07-06T20:02:00.000Z"
  });
  const intakeCompletion = submitIntakeAnswers({
    run: intakeRun,
    workspace,
    packageInstall,
    blueprint,
    answers: {
      founderName: "Avery Stone",
      businessName: "Acme Advisory",
      primaryGoal: "Reach the first ten consulting clients",
      targetAudience: "Solo founders"
    },
    completedAt: "2026-07-06T20:03:00.000Z"
  });
  const analysisRun = startPositioningAnalysisStation({
    run: intakeCompletion.run,
    workspace,
    packageInstall,
    blueprint
  });

  return { workspace, blueprint, packageInstall, intakeCompletion, analysisRun };
}

describe("positioning station via stub provider (DEC-040 / TASK-055 AC2)", () => {
  it("sources the deliverable's positioning summary from provider.complete(), not the template literal", async () => {
    const { workspace, blueprint, packageInstall, intakeCompletion, analysisRun } = setUpAnalysisRun();
    const provider = createStubLLMProvider();

    const completion = await completePositioningAnalysisWithProvider({
      run: analysisRun,
      workspace,
      packageInstall,
      blueprint,
      founderProfile: intakeCompletion.deliverable,
      requestedAt: "2026-07-06T20:05:00.000Z",
      provider,
      providerModel: "stub-deterministic-v1",
      providerSecret: "unused-secret"
    });

    expect(completion.deliverable.body.positioningSummary).toMatch(/^\[stub:[0-9a-f]{16}\] /);
    expect(completion.deliverable.body.positioningSummary).not.toBe(
      "Acme Advisory should position itself as the focused guide for Solo founders who need to Reach the first ten consulting clients."
    );
    expect(completion.run.status).toBe("waiting_for_approval");
    expect(completion.approval.status).toBe("pending");
  });

  it("makes no network call and requires no real provider credential", async () => {
    const { workspace, blueprint, packageInstall, intakeCompletion, analysisRun } = setUpAnalysisRun();
    const provider = createStubLLMProvider();

    await expect(
      completePositioningAnalysisWithProvider({
        run: analysisRun,
        workspace,
        packageInstall,
        blueprint,
        founderProfile: intakeCompletion.deliverable,
        requestedAt: "2026-07-06T20:05:00.000Z",
        provider,
        providerModel: "stub-deterministic-v1",
        providerSecret: "not-a-real-secret"
      })
    ).resolves.toBeDefined();
  });
});
