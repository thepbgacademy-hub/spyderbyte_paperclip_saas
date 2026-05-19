import type { RuntimeProviderExecutionBinding } from "../providers/runtime-provider-execution.js";
import type { RuntimeProviderBinding } from "../providers/runtime-provider-resolution.js";
import { RuntimeProviderResolutionError } from "../providers/runtime-provider-resolution.js";
import type { ProviderExecutionMode } from "../providers/runtime-provider-fallback.js";
import type { StartWorkflowRunInput } from "./run-service.js";

export type DebugSharedProviderResolver = (input: StartWorkflowRunInput) => Promise<readonly RuntimeProviderExecutionBinding[]>;

export async function resolveProviderExecutionContext(options: {
  mode: ProviderExecutionMode;
  input: StartWorkflowRunInput;
  resolveProviderContext?: (input: StartWorkflowRunInput) => Promise<readonly RuntimeProviderBinding[]>;
  hydrateProviderContext?: (input: StartWorkflowRunInput & {
    providerBindings: readonly RuntimeProviderBinding[];
  }) => Promise<readonly RuntimeProviderExecutionBinding[]>;
  resolveDebugSharedProvider?: DebugSharedProviderResolver;
}): Promise<readonly RuntimeProviderExecutionBinding[] | readonly RuntimeProviderBinding[] | undefined> {
  if (!options.resolveProviderContext) {
    return undefined;
  }

  try {
    const providerBindings = await options.resolveProviderContext(options.input);
    if (!options.hydrateProviderContext) {
      return providerBindings;
    }

    return options.hydrateProviderContext({
      ...options.input,
      providerBindings
    });
  } catch (error) {
    if (!(error instanceof RuntimeProviderResolutionError) || options.mode !== "debug_shared_fallback") {
      throw error;
    }

    if (!options.resolveDebugSharedProvider) {
      throw error;
    }

    return options.resolveDebugSharedProvider(options.input);
  }
}
