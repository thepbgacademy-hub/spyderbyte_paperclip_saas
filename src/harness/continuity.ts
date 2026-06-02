export type HarnessAbsorbedWorkResolution = "update_existing_lane" | "handoff_existing_lane";

export type ParsedHarnessContinuityAbsorbedWorkItem = {
  resolution: HarnessAbsorbedWorkResolution;
  requestedByPersona: string | null;
  title: string;
  label: string;
};

const CONTINUITY_UPDATE_PREFIX = "update_existing_lane|";
const CONTINUITY_HANDOFF_PREFIX = "handoff_existing_lane|";

export function createContinuityAbsorbedWorkItem(input: {
  resolution: HarnessAbsorbedWorkResolution;
  requestedByPersona: string;
  title: string;
}): string {
  const label = `${input.requestedByPersona.toUpperCase()}: ${input.title}`;
  const prefix = input.resolution === "handoff_existing_lane" ? CONTINUITY_HANDOFF_PREFIX : CONTINUITY_UPDATE_PREFIX;
  return `${prefix}${label}`;
}

export function parseContinuityAbsorbedWorkItem(value: string): ParsedHarnessContinuityAbsorbedWorkItem {
  const parsed = value.startsWith(CONTINUITY_HANDOFF_PREFIX)
    ? {
        resolution: "handoff_existing_lane" as const,
        label: value.slice(CONTINUITY_HANDOFF_PREFIX.length)
      }
    : value.startsWith(CONTINUITY_UPDATE_PREFIX)
      ? {
          resolution: "update_existing_lane" as const,
          label: value.slice(CONTINUITY_UPDATE_PREFIX.length)
        }
      : {
          resolution: "update_existing_lane" as const,
          label: value
        };

  const separatorIndex = parsed.label.indexOf(": ");
  if (separatorIndex <= 0) {
    return {
      ...parsed,
      requestedByPersona: null,
      title: parsed.label
    };
  }

  return {
    ...parsed,
    requestedByPersona: parsed.label.slice(0, separatorIndex),
    title: parsed.label.slice(separatorIndex + 2)
  };
}

export function mergeContinuityAbsorbedWorkItems(existing: readonly string[], nextValue: string): string[] {
  const merged: string[] = [];
  for (const value of [...existing, nextValue]) {
    const priorIndex = merged.indexOf(value);
    if (priorIndex >= 0) {
      merged.splice(priorIndex, 1);
    }
    merged.push(value);
  }
  return merged.slice(-6);
}
