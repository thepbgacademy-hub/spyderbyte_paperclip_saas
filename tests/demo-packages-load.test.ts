import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { loadBlueprintPackageManifest } from "../src/factory/packages/package-manifest-loader.js";

const here = dirname(fileURLToPath(import.meta.url));

function loadDemoManifest(key: string) {
  const path = resolve(here, "..", "demo-packages", key, "manifest.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

const DEMOS = [
  { key: "local-service-launch", packageKey: "local-service-launch", packageId: "pkg_local_service_launch" },
  { key: "solo-consultant-positioning", packageKey: "solo-consultant-positioning", packageId: "pkg_solo_consultant_positioning" }
];

describe("demo packages load against the current slice", () => {
  for (const demo of DEMOS) {
    it(`${demo.key} loads without throwing and derives the expected structure`, () => {
      const manifest = loadDemoManifest(demo.key);
      const pkg = loadBlueprintPackageManifest(manifest);

      // Identity (B12/B13/B14)
      expect(pkg.key).toBe(demo.packageKey);
      expect(pkg.packageVersionId).toBe(`${demo.packageId}@1.0.0`);
      expect(pkg.source?.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);

      // Two-station intake -> positioning spine, correct specialist binding
      const stationKeys = pkg.stations.map((s: { key: string }) => s.key).sort();
      expect(stationKeys).toEqual(["intake", "positioning"]);

      const intake = pkg.stations.find((s: { key: string }) => s.key === "intake");
      const positioning = pkg.stations.find((s: { key: string }) => s.key === "positioning");
      expect(intake?.kind).toBe("structured_interview");
      expect(positioning?.kind).toBe("analysis");

      const intakePersona = pkg.personas.find((p: { key: string }) => p.key === intake?.personaKey);
      const positioningPersona = pkg.personas.find((p: { key: string }) => p.key === positioning?.personaKey);
      expect(intakePersona?.specialistKey).toBe("direction");
      expect(positioningPersona?.specialistKey).toBe("market");
    });
  }
});
