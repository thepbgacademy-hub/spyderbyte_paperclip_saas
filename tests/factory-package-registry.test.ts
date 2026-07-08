import { describe, expect, it } from "vitest";

import { createBlueprintPackage, isStationKindAllowed } from "../src/factory/packages/package-registry.js";
import type {
  BlueprintPersonaDefinition,
  PackageKind,
  StationDefinition
} from "../src/factory/domain/types.js";

function createBoundedPersonas(): BlueprintPersonaDefinition[] {
  return [
    {
      key: "founder_guide",
      name: "Founder Guide",
      tagline: "Guides the founder through intake.",
      specialistKey: "direction",
      allowedStationKeys: ["intake"]
    },
    {
      key: "market_strategist",
      name: "Market Strategist",
      tagline: "Shapes the positioning brief.",
      specialistKey: "market",
      allowedStationKeys: ["positioning"]
    }
  ];
}

function createFounderGuidePersona(): BlueprintPersonaDefinition {
  return {
    key: "founder_guide",
    name: "Founder Guide",
    tagline: "Guides the founder through intake.",
    specialistKey: "direction",
    allowedStationKeys: ["intake"]
  };
}

function createMarketStrategistPersona(): BlueprintPersonaDefinition {
  return {
    key: "market_strategist",
    name: "Market Strategist",
    tagline: "Shapes the positioning brief.",
    specialistKey: "market",
    allowedStationKeys: ["positioning"]
  };
}

describe("factory package registry", () => {
  it("builds a blueprint-native package definition", () => {
    const pkg = createBlueprintPackage({
      key: "connect-first",
      title: "Connect First Operating System",
      personas: [createFounderGuidePersona()],
      stations: [
        {
          key: "intake",
          familyKey: "intake",
          personaKey: "founder_guide",
          kind: "structured_interview",
          title: "Intake Station"
        }
      ]
    });

    expect(pkg.kind).toBe("blueprint");
    expect(pkg.personas[0]?.key).toBe("founder_guide");
    expect(pkg.stations[0]?.key).toBe("intake");
    expect(pkg.stations[0]?.familyKey).toBe("intake");
    expect(pkg.stations[0]?.personaKey).toBe("founder_guide");
  });

  it("keeps blueprint-native packages inside the shared package kind union", () => {
    const pkg = createBlueprintPackage({
      key: "connect-first",
      title: "Connect First Operating System",
      personas: [createFounderGuidePersona()],
      stations: [
        {
          key: "intake",
          familyKey: "intake",
          personaKey: "founder_guide",
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
        personas: createBoundedPersonas(),
        stations: [
          {
            key: "legacy",
            familyKey: "intake",
            personaKey: "founder_guide",
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
        personaKey: "founder_guide",
        kind: "structured_interview",
        title: "Intake Station"
      }
    ];
    const personas = [createFounderGuidePersona()];
    const pkg = createBlueprintPackage({
      key: "connect-first",
      title: "Connect First Operating System",
      personas,
      stations
    });

    stations[0] = {
      key: "mutated",
      familyKey: "positioning",
      personaKey: "market_strategist",
      kind: "analysis" as const,
      title: "Mutated Station"
    };
    personas[0] = {
      key: "mutated_persona",
      name: "Mutated Persona",
      tagline: "Mutated",
      specialistKey: "offer",
      allowedStationKeys: ["positioning"]
    };

    expect(pkg.stations).toEqual([
      {
        key: "intake",
        familyKey: "intake",
        personaKey: "founder_guide",
        kind: "structured_interview",
        title: "Intake Station"
      }
    ]);
    expect(pkg.personas).toEqual([createFounderGuidePersona()]);
    expect(pkg.stations).not.toBe(stations);
    expect(pkg.personas).not.toBe(personas);
  });

  it("rejects duplicate station keys so blueprint-native packages stay deterministic", () => {
    expect(() =>
      createBlueprintPackage({
        key: "duplicate-intake",
        title: "Duplicate Intake Package",
        personas: createBoundedPersonas(),
        stations: [
          {
            key: "intake",
            familyKey: "intake",
            personaKey: "founder_guide",
            kind: "structured_interview",
            title: "First Intake Station"
          },
          {
            key: "intake",
            familyKey: "positioning",
            personaKey: "market_strategist",
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
      personas: [createMarketStrategistPersona()],
      stations: [
        {
          key: "positioning",
          familyKey: "positioning",
          personaKey: "market_strategist",
          kind: "analysis",
          title: "Positioning Station"
        }
      ]
    });

    expect(pkg.stations[0]?.familyKey).toBe("positioning");
  });

  it("fails closed when a station references an undeclared persona", () => {
    expect(() =>
      createBlueprintPackage({
        key: "missing-persona",
        title: "Missing Persona Package",
        personas: createBoundedPersonas(),
        stations: [
          {
            key: "intake",
            familyKey: "intake",
            personaKey: "ghost_persona",
            kind: "structured_interview",
            title: "Intake Station"
          }
        ]
      })
    ).toThrow(
      'Station "intake" references undeclared persona "ghost_persona" in blueprint package "missing-persona"'
    );
  });

  it("fails closed when duplicate persona keys are declared", () => {
    expect(() =>
      createBlueprintPackage({
        key: "duplicate-personas",
        title: "Duplicate Persona Package",
        personas: [createFounderGuidePersona(), createFounderGuidePersona()],
        stations: [
          {
            key: "intake",
            familyKey: "intake",
            personaKey: "founder_guide",
            kind: "structured_interview",
            title: "Intake Station"
          }
        ]
      })
    ).toThrow(
      'Duplicate persona key "founder_guide" is not allowed for blueprint package "duplicate-personas"'
    );
  });

  it("fails closed when a persona is assigned outside its allowed stations", () => {
    expect(() =>
      createBlueprintPackage({
        key: "wrong-binding",
        title: "Wrong Binding Package",
        personas: createBoundedPersonas(),
        stations: [
          {
            key: "positioning",
            familyKey: "positioning",
            personaKey: "founder_guide",
            kind: "analysis",
            title: "Positioning Station"
          }
        ]
      })
    ).toThrow(
      'Persona "founder_guide" is not allowed to run station "positioning" in blueprint package "wrong-binding"'
    );
  });

  it("fails closed when a persona specialist binding conflicts with the station family owner", () => {
    expect(() =>
      createBlueprintPackage({
        key: "wrong-specialist",
        title: "Wrong Specialist Package",
        personas: [
          {
            key: "founder_guide",
            name: "Founder Guide",
            tagline: "Guides the founder through intake.",
            specialistKey: "market",
            allowedStationKeys: ["intake"]
          }
        ],
        stations: [
          {
            key: "intake",
            familyKey: "intake",
            personaKey: "founder_guide",
            kind: "structured_interview",
            title: "Intake Station"
          }
        ]
      })
    ).toThrow(
      'Persona "founder_guide" is bound to specialist "market", but station family "intake" requires specialist "direction"'
    );
  });

  it("fails closed when a persona allowlist references an undeclared station key", () => {
    expect(() =>
      createBlueprintPackage({
        key: "dangling-allowlist",
        title: "Dangling Allowlist Package",
        personas: [
          {
            key: "founder_guide",
            name: "Founder Guide",
            tagline: "Guides the founder through intake.",
            specialistKey: "direction",
            allowedStationKeys: ["intake", "positioning"]
          }
        ],
        stations: [
          {
            key: "intake",
            familyKey: "intake",
            personaKey: "founder_guide",
            kind: "structured_interview",
            title: "Intake Station"
          }
        ]
      })
    ).toThrow(
      'Persona "founder_guide" declares unknown allowed station "positioning" in blueprint package "dangling-allowlist"'
    );
  });

  it("fails closed when a later station family is declared before that reboot slice ships", () => {
    expect(() =>
      createBlueprintPackage({
        key: "future-family",
        title: "Future Family Package",
        personas: [
          {
            key: "finance_reviewer",
            name: "Finance Reviewer",
            tagline: "Reviews pricing assumptions.",
            specialistKey: "finance",
            allowedStationKeys: ["pricing"]
          }
        ],
        stations: [
          {
            key: "pricing",
            familyKey: "pricing_analysis",
            personaKey: "finance_reviewer",
            kind: "analysis",
            title: "Pricing Station"
          }
        ]
      })
    ).toThrow(
      'Station family "pricing_analysis" is outside the bounded B10 intake/positioning slice for blueprint package "future-family"'
    );
  });
});
