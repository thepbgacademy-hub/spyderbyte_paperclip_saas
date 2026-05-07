export type ProviderKind = "openai" | "generic_api";

export type SecretRequirement = {
  name: string;
  envName: string;
  description: string;
};

export type OpenAIProviderConfig = {
  kind: "openai";
  label: "OpenAI";
  requiredSecrets: [SecretRequirement];
  metadataFields: readonly ["projectId"];
};

export type GenericApiProviderConfig = {
  kind: "generic_api";
  label: string;
  requiredSecrets: readonly SecretRequirement[];
  metadataFields: readonly string[];
};

export type ProviderConfig = OpenAIProviderConfig | GenericApiProviderConfig;

export const OPENAI_PROVIDER: OpenAIProviderConfig = {
  kind: "openai",
  label: "OpenAI",
  requiredSecrets: [
    {
      name: "apiKey",
      envName: "OPENAI_API_KEY",
      description: "Customer-provided OpenAI API key stored only by secret reference."
    }
  ],
  metadataFields: ["projectId"]
};

export function createGenericApiProvider(params: {
  label: string;
  requiredSecrets: readonly SecretRequirement[];
  metadataFields?: readonly string[];
}): GenericApiProviderConfig {
  if (params.label.trim().length === 0) {
    throw new Error("Generic provider label is required");
  }

  if (params.requiredSecrets.length === 0) {
    throw new Error("Generic provider must declare at least one secret requirement");
  }

  const metadataFields = params.metadataFields ?? [];
  const unsafeMetadataField = metadataFields.find(isSecretLikeFieldName);
  if (unsafeMetadataField) {
    throw new Error(`Provider metadata field "${unsafeMetadataField}" looks secret-like and must be modeled as a secret requirement`);
  }

  return {
    kind: "generic_api",
    label: params.label,
    requiredSecrets: params.requiredSecrets,
    metadataFields
  };
}

function isSecretLikeFieldName(fieldName: string): boolean {
  return /api[_-]?key|token|secret|authorization|password|credential/i.test(fieldName);
}
