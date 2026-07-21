export const FACTORY_QUEUE_NAMESPACE_PREFIX = "wealth-factory-blueprint-v1";
export const FACTORY_CREDENTIAL_VALIDATION_QUEUE_NAME = "wealth-factory-validations-v1";
export const FACTORY_RUNTIME_QUEUE_NAME = "wealth-factory-runs-v1";

export const LEGACY_WORKFLOW_QUEUE_NAMES = [
  "wfpc-workflow-runs",
  "wfpc-workflow-runs-stage"
] as const;

type FactoryQueueConfigInput = {
  queueName?: string;
  prefix?: string;
};

type FactoryQueueConfig = {
  queueName: string;
  prefix: string;
};

export function createFactoryCredentialValidationQueueConfig(
  input: FactoryQueueConfigInput = {}
): FactoryQueueConfig {
  return {
    queueName: assertFactoryQueueNameIsolated(input.queueName ?? FACTORY_CREDENTIAL_VALIDATION_QUEUE_NAME),
    prefix: assertFactoryQueuePrefixIsolated(input.prefix ?? FACTORY_QUEUE_NAMESPACE_PREFIX)
  };
}

export function assertFactoryQueueNameIsolated(queueName: string): string {
  const normalizedQueueName = normalizeRequiredQueueValue(queueName, "Factory queue name is required");
  if (isLegacyQueueNamespace(normalizedQueueName)) {
    throw new Error(`Factory queue name must not reuse a legacy queue namespace: ${normalizedQueueName}`);
  }
  return normalizedQueueName;
}

export function assertFactoryQueuePrefixIsolated(prefix: string): string {
  const normalizedPrefix = normalizeRequiredQueueValue(prefix, "Factory queue prefix is required");
  if (isLegacyQueueNamespace(normalizedPrefix)) {
    throw new Error(`Factory queue prefix must not reuse a legacy queue namespace: ${normalizedPrefix}`);
  }
  return normalizedPrefix;
}

function normalizeRequiredQueueValue(value: string, errorMessage: string): string {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    throw new Error(errorMessage);
  }
  return normalizedValue;
}

function isLegacyQueueNamespace(value: string): boolean {
  const normalizedValue = value.toLowerCase();
  return (
    LEGACY_WORKFLOW_QUEUE_NAMES.includes(normalizedValue as (typeof LEGACY_WORKFLOW_QUEUE_NAMES)[number]) ||
    normalizedValue.startsWith("wfpc") ||
    normalizedValue.includes("paperclip")
  );
}
