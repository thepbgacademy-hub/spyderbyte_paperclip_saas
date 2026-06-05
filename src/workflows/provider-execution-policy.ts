import type { RuntimeProviderExecutionBinding } from "../providers/runtime-provider-execution.js";
import type { RuntimeProviderBinding } from "../providers/runtime-provider-resolution.js";
import { RuntimeProviderResolutionError } from "../providers/runtime-provider-resolution.js";
import type { ProviderExecutionMode } from "../providers/runtime-provider-fallback.js";
import type { StartWorkflowRunInput } from "./run-service.js";

export type DebugSharedProviderResolver = (input: StartWorkflowRunInput) => Promise<readonly RuntimeProviderExecutionBinding[]>;

export async function resolveProviderExecutionContext(options: {
  mode: ProviderExecutionMode;
  input: StartWorkflowRunInput;
  loadBoundProviderContext?: (input: StartWorkflowRunInput) => Promise<readonly RuntimeProviderBinding[] | null>;
  resolveProviderContext?: (input: StartWorkflowRunInput) => Promise<readonly RuntimeProviderBinding[]>;
  hydrateProviderContext?: (input: StartWorkflowRunInput & {
    providerBindings: readonly RuntimeProviderBinding[];
  }) => Promise<readonly RuntimeProviderExecutionBinding[]>;
  resolveDebugSharedProvider?: DebugSharedProviderResolver;
}): Promise<readonly RuntimeProviderExecutionBinding[] | readonly RuntimeProviderBinding[] | undefined> {
  const boundProviderBindings = options.loadBoundProviderContext ? await options.loadBoundProviderContext(options.input) : null;
  if (options.loadBoundProviderContext && boundProviderBindings === null && options.mode !== "debug_shared_fallback") {
    throw new RuntimeProviderResolutionError({
      tenantId: options.input.tenantId,
      workflowId: options.input.workflowId,
      capability: options.input.requiredCapabilities?.[0] ?? "text_generation"
    });
  }

  const providerBindings =
    boundProviderBindings ??
    (options.resolveProviderContext ? await tryResolveProviderContext(options.resolveProviderContext, options.input, options.mode, options.resolveDebugSharedProvider) : undefined);

  if (!providerBindings) {
    return undefined;
  }

  if (!options.hydrateProviderContext) {
    return providerBindings;
  }

  return options.hydrateProviderContext({
    ...options.input,
    providerBindings
  });
}

async function tryResolveProviderContext(
  resolveProviderContext: (input: StartWorkflowRunInput) => Promise<readonly RuntimeProviderBinding[]>,
  input: StartWorkflowRunInput,
  mode: ProviderExecutionMode,
  resolveDebugSharedProvider?: DebugSharedProviderResolver
): Promise<readonly RuntimeProviderBinding[] | readonly RuntimeProviderExecutionBinding[]> {
  try {
    return await resolveProviderContext(input);
  } catch (error) {
    if (!(error instanceof RuntimeProviderResolutionError) || mode !== "debug_shared_fallback") {
      throw error;
    }

    if (!resolveDebugSharedProvider) {
      throw error;
    }

    return resolveDebugSharedProvider(input);
  }
}
