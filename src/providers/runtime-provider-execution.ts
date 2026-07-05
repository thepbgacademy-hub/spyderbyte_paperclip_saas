import type { RuntimeProviderBinding } from "./runtime-provider-resolution.js";
import { normalizeCodexSubscriptionMetadata } from "./codex-subscription-metadata.js";

export type RuntimeProviderExecutionBinding = RuntimeProviderBinding & {
  secretValues: Record<string, string>;
};

export class RuntimeProviderExecutionError extends Error {
  readonly code = "runtime_provider_execution_unavailable";
  readonly publicMessage = "workflow_failed";
  readonly reason: "secret_payload_invalid" | "secret_unavailable" | "multi_provider_binding_unsupported";

  constructor(input: {
    tenantId: string;
    workflowId: string;
    providerKind: string;
    reason: "secret_payload_invalid" | "secret_unavailable" | "multi_provider_binding_unsupported";
  }) {
    super(`Unable to hydrate provider execution context for ${input.providerKind}: ${input.reason}`);
    this.name = "RuntimeProviderExecutionError";
    this.reason = input.reason;
  }
}

export function createRuntimeProviderExecutionContextResolver(options: {
  accessSecretRef: (input: { tenantId: string; runId: string; secretRef: string }) => Promise<unknown>;
}) {
  return {
    async resolveForRun(input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      providerBindings: readonly RuntimeProviderBinding[];
    }): Promise<RuntimeProviderExecutionBinding[]> {
      if (input.providerBindings.length !== 1) {
        throw new RuntimeProviderExecutionError({
          tenantId: input.tenantId,
          workflowId: input.workflowId,
          providerKind: input.providerBindings[0]?.providerKind ?? "unknown_provider",
          reason: "multi_provider_binding_unsupported"
        });
      }

      return Promise.all(
        input.providerBindings.map(async (binding) => {
          if (binding.providerKind === "openai_chatgpt_codex_subscription") {
            return {
              ...binding,
              metadata: normalizeCodexSubscriptionMetadata(binding.metadata),
              secretValues: {}
            };
          }

          let secretValues: unknown;
          try {
            secretValues = await options.accessSecretRef({
              tenantId: input.tenantId,
              runId: input.runId,
              secretRef: binding.secretRef
            });
          } catch {
            throw new RuntimeProviderExecutionError({
              tenantId: input.tenantId,
              workflowId: input.workflowId,
              providerKind: binding.providerKind,
              reason: "secret_unavailable"
            });
          }

          if (!isStringRecord(secretValues)) {
            throw new RuntimeProviderExecutionError({
              tenantId: input.tenantId,
              workflowId: input.workflowId,
              providerKind: binding.providerKind,
              reason: "secret_payload_invalid"
            });
          }

          return {
            ...binding,
            secretValues
          };
        })
      );
    }
  };
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object") {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === "string");
}
