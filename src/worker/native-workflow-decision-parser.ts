export type NativeWorkflowDecision = {
  state: "done" | "waiting" | "blocked" | "cancelled";
  summary: string;
  requiredArtifactName?: "founder_tax_posture_documents";
};

export function tryParseWorkflowDecision(text: string): NativeWorkflowDecision | null {
  const normalized = extractJsonObjectText(text);
  if (!normalized) {
    return null;
  }

  try {
    const parsed = JSON.parse(normalized);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const keys = Object.keys(parsed);
    if (
      (keys.length !== 2 && keys.length !== 3)
      || !keys.includes("state")
      || !keys.includes("summary")
      || (keys.length === 3 && !keys.includes("requiredArtifactName"))
    ) {
      return null;
    }

    const state = Reflect.get(parsed, "state");
    const summary = Reflect.get(parsed, "summary");
    const requiredArtifactName = Reflect.get(parsed, "requiredArtifactName");
    if (
      (state !== "done" && state !== "waiting" && state !== "blocked" && state !== "cancelled")
      || typeof summary !== "string"
      || (typeof requiredArtifactName !== "undefined" && state !== "blocked")
      || (typeof requiredArtifactName !== "undefined"
        && requiredArtifactName !== "founder_tax_posture_documents")
    ) {
      return null;
    }

    const trimmedSummary = summary.trim();
    if (!trimmedSummary) {
      return null;
    }

    return {
      state,
      summary: trimmedSummary,
      ...(requiredArtifactName ? { requiredArtifactName } : {})
    };
  } catch {
    return null;
  }
}

function extractJsonObjectText(text: string): string | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "");
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }
  return trimmed;
}
