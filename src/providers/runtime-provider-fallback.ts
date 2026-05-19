import type { ProviderCapability } from "../packages/package-types.js";
import type { RuntimeProviderExecutionBinding } from "./runtime-provider-execution.js";
import type { ProviderKind } from "./provider-types.js";

export type ProviderExecutionMode = "tenant_credentials_required" | "debug_shared_fallback";

export class RuntimeProviderFallbackError extends Error {
  readonly code = "runtime_provider_fallback_unavailable";
  readonly publicMessage = "workflow_failed";

  constructor(readonly reason: "shared_secret_missing" | "shared_provider_unsupported") {
    super(`Debug shared provider fallback is unavailable: ${reason}`);
    this.name = "RuntimeProviderFallbackError";
  }
}

export function createDebugSharedProviderFallbackResolver(options: {
  providerKind?: ProviderKind;
  apiKey?: string;
  projectId?: string;
  label?: string;
}) {
  return {
    async resolveForRun(input: {
      requiredCapabilities: readonly ProviderCapability[];
    }): Promise<RuntimeProviderExecutionBinding[]> {
      const providerKind = options.providerKind ?? "openai_api";

      if (providerKind !== "openai_api" && providerKind !== "openai") {
        throw new RuntimeProviderFallbackError("shared_provider_unsupported");
      }

      if (!options.apiKey?.trim()) {
        throw new RuntimeProviderFallbackError("shared_secret_missing");
      }

      return input.requiredCapabilities.map((capability) => ({
        capability,
        providerKind,
        label: options.label ?? "Operator Debug Provider",
        secretRef: "wf_debug_shared_provider",
        metadata: options.projectId ? { projectId: options.projectId } : {},
        secretValues: {
          apiKey: options.apiKey as string
        }
      }));
    }
  };
}
