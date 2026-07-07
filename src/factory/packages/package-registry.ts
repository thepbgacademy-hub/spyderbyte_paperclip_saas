import type {
  BlueprintPackageDefinition,
  StationDefinition,
  StationKind
} from "../domain/types.js";

const ALLOWED_STATION_KINDS: ReadonlySet<StationKind> = new Set([
  "structured_interview",
  "analysis",
  "checkpoint",
  "assembly"
]);

export function isStationKindAllowed(kind: string): kind is StationKind {
  return ALLOWED_STATION_KINDS.has(kind as StationKind);
}

export function createBlueprintPackage(input: {
  key: string;
  title: string;
  stations: StationDefinition[];
}): BlueprintPackageDefinition {
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

    seenStationKeys.add(station.key);

    return { ...station };
  });

  return {
    id: input.key,
    key: input.key,
    title: input.title,
    kind: "blueprint",
    stations
  };
}
