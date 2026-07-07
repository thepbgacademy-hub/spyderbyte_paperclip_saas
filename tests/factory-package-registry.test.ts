import { describe, expect, it } from "vitest";

import { createBlueprintPackage, isStationKindAllowed } from "../src/factory/packages/package-registry.js";
import type { PackageKind, StationDefinition } from "../src/factory/domain/types.js";

describe("factory package registry", () => {
  it("builds a blueprint-native package definition", () => {
    const pkg = createBlueprintPackage({
      key: "connect-first",
      title: "Connect First Operating System",
      stations: [
        {
          key: "intake",
          familyKey: "intake",
          kind: "structured_interview",
          title: "Intake Station"
        }
      ]
    });

    expect(pkg.kind).toBe("blueprint");
    expect(pkg.stations[0]?.key).toBe("intake");
    expect(pkg.stations[0]?.familyKey).toBe("intake");
  });

  it("keeps blueprint-native packages inside the shared package kind union", () => {
    const pkg = createBlueprintPackage({
      key: "connect-first",
      title: "Connect First Operating System",
      stations: [
        {
          key: "intake",
          familyKey: "intake",
          kind: "structured_interview",
          title: "Intake Station"
        }
      ]
    });

    const kind: PackageKind = pkg.kind;

    expect(kind).toBe("blueprint");
  });

  it("allows only declared station kinds", () => {
    expect(isStationKindAllowed("structured_interview")).toBe(true);
    expect(isStationKindAllowed("legacy_board_unblock")).toBe(false);
  });

  it("rejects package definitions that try to bypass the bounded station catalog", () => {
    expect(() =>
      createBlueprintPackage({
        key: "broken",
        title: "Broken Package",
        stations: [
          {
            key: "legacy",
            familyKey: "intake",
            kind: "legacy_board_unblock" as never,
            title: "Legacy Board Action"
          }
        ]
      })
    ).toThrow('Unsupported station kind "legacy_board_unblock" for blueprint package "broken"');
  });

  it("returns a defensive copy of the declared station definitions", () => {
    const stations: StationDefinition[] = [
      {
        key: "intake",
        familyKey: "intake",
        kind: "structured_interview",
        title: "Intake Station"
      }
    ];
    const pkg = createBlueprintPackage({
      key: "connect-first",
      title: "Connect First Operating System",
      stations
    });

    stations[0] = {
      key: "mutated",
      familyKey: "positioning",
      kind: "analysis" as const,
      title: "Mutated Station"
    };

    expect(pkg.stations).toEqual([
      {
        key: "intake",
        familyKey: "intake",
        kind: "structured_interview",
        title: "Intake Station"
      }
    ]);
    expect(pkg.stations).not.toBe(stations);
  });

  it("rejects duplicate station keys so blueprint-native packages stay deterministic", () => {
    expect(() =>
      createBlueprintPackage({
        key: "duplicate-intake",
        title: "Duplicate Intake Package",
        stations: [
          {
            key: "intake",
            familyKey: "intake",
            kind: "structured_interview",
            title: "First Intake Station"
          },
          {
            key: "intake",
            familyKey: "positioning",
            kind: "analysis",
            title: "Second Intake Station"
          }
        ]
      })
    ).toThrow('Duplicate station key "intake" is not allowed for blueprint package "duplicate-intake"');
  });

  it("keeps the station family binding needed to derive specialist ownership later", () => {
    const pkg = createBlueprintPackage({
      key: "connect-first",
      title: "Connect First Operating System",
      stations: [
        {
          key: "positioning",
          familyKey: "positioning",
          kind: "analysis",
          title: "Positioning Station"
        }
      ]
    });

    expect(pkg.stations[0]?.familyKey).toBe("positioning");
  });
});
