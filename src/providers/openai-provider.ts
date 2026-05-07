import { OPENAI_PROVIDER } from "./provider-types.js";

export function createOpenAIProviderRegistration(input: { apiKey: string; projectId?: string }) {
  return {
    provider: OPENAI_PROVIDER,
    secretValues: { apiKey: input.apiKey },
    metadata: input.projectId ? { projectId: input.projectId } : {}
  };
}
