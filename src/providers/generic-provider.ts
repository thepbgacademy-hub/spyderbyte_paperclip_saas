import { createGenericApiProvider } from "./provider-types.js";

const SECRET_LIKE_METADATA = /api[_-]?key|token|secret|authorization|password|credential/i;
const SECRET_LIKE_VALUE = /access_token=|api[_-]?key[:=]|authorization[:=]|Bearer\s+|sk-[A-Za-z0-9_-]+/i;

export function createGenericProviderRegistration(input: {
  label: string;
  secrets: Record<string, string>;
  metadata?: Record<string, string>;
}) {
  const metadata = input.metadata ?? {};
  const unsafe = Object.keys(metadata).find((key) => SECRET_LIKE_METADATA.test(key));
  if (unsafe) {
    throw new Error(`Provider metadata field "${unsafe}" looks secret-like`);
  }

  const unsafeValueField = Object.entries(metadata).find(([, value]) => SECRET_LIKE_VALUE.test(value))?.[0];
  if (unsafeValueField) {
    throw new Error(`Provider metadata field "${unsafeValueField}" contains secret-like content`);
  }

  const requiredSecrets = Object.keys(input.secrets).map((name) => ({
    name,
    envName: `${input.label.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_${name.toUpperCase()}`,
    description: `Customer-provided ${input.label} ${name}.`
  }));

  return {
    provider: createGenericApiProvider({ label: input.label, requiredSecrets, metadataFields: Object.keys(metadata) }),
    secretValues: input.secrets,
    metadata
  };
}
