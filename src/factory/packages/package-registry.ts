import type {
  BlueprintPersonaDefinition,
  BlueprintPackageDefinition,
  StationDefinition,
  StationKind
} from "../domain/types.js";
import { resolveExpectedStationSpecialistKey } from "../specialists/specialist-registry.js";

const ALLOWED_STATION_KINDS: ReadonlySet<StationKind> = new Set([
  "structured_interview",
  "analysis",
  "checkpoint",
  "assembly"
]);
const ALLOWED_B10_STATION_FAMILIES = new Set(["intake", "positioning"]);

export function isStationKindAllowed(kind: string): kind is StationKind {
  return ALLOWED_STATION_KINDS.has(kind as StationKind);
}

export function createBlueprintPackage(input: {
  key: string;
  title: string;
  personas: BlueprintPersonaDefinition[];
  stations: StationDefinition[];
}): BlueprintPackageDefinition {
  const seenPersonaKeys = new Set<string>();
  const personas = input.personas.map((persona) => {
    if (seenPersonaKeys.has(persona.key)) {
      throw new Error(
        `Duplicate persona key "${persona.key}" is not allowed for blueprint package "${input.key}"`
      );
    }

    seenPersonaKeys.add(persona.key);
    return {
      ...persona,
      allowedStationKeys: [...persona.allowedStationKeys]
    };
  });

  const personaByKey = new Map(personas.map((persona) => [persona.key, persona]));
  const seenStationKeys = new Set<string>();
  const stations = input.stations.map((station) => {
    if (!isStationKindAllowed(station.kind)) {
      throw new Error(`Unsupported station kind "${station.kind}" for blueprint package "${input.key}"`);
    }

    if (seenStationKeys.has(station.key)) {
      throw new Error(
        `Duplicate station key "${station.key}" is not allowed for blueprint package "${input.key}"`
      );
    }

    if (!ALLOWED_B10_STATION_FAMILIES.has(station.familyKey)) {
      throw new Error(
        `Station family "${station.familyKey}" is outside the bounded B10 intake/positioning slice for blueprint package "${input.key}"`
      );
    }

    const persona = personaByKey.get(station.personaKey);
    if (!persona) {
      throw new Error(
        `Station "${station.key}" references undeclared persona "${station.personaKey}" in blueprint package "${input.key}"`
      );
    }

    if (!persona.allowedStationKeys.includes(station.key)) {
      throw new Error(
        `Persona "${persona.key}" is not allowed to run station "${station.key}" in blueprint package "${input.key}"`
      );
    }

    const expectedSpecialistKey = resolveExpectedStationSpecialistKey(station.familyKey);
    if (persona.specialistKey !== expectedSpecialistKey) {
      throw new Error(
        `Persona "${persona.key}" is bound to specialist "${persona.specialistKey}", but station family "${station.familyKey}" requires specialist "${expectedSpecialistKey}"`
      );
    }

    seenStationKeys.add(station.key);

    return { ...station };
  });

  for (const persona of personas) {
    for (const stationKey of persona.allowedStationKeys) {
      if (!seenStationKeys.has(stationKey)) {
        throw new Error(
          `Persona "${persona.key}" declares unknown allowed station "${stationKey}" in blueprint package "${input.key}"`
        );
      }
    }
  }

  return {
    id: input.key,
    key: input.key,
    title: input.title,
    kind: "blueprint",
    personas,
    stations
  };
}
