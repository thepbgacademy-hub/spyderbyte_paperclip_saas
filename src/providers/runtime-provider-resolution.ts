import type { ProviderCapability } from "../packages/package-types.js";
import { normalizeCodexSubscriptionMetadata } from "./codex-subscription-metadata.js";
import type { ProviderKind } from "./provider-types.js";

export type RuntimeProviderConnection = {
  tenantId: string;
  providerKind: ProviderKind;
  label: string;
  secretRef: string;
  metadata: Record<string, unknown>;
  capabilities: readonly ProviderCapability[];
  revokedAt?: string | null;
};

export type RuntimeProviderBinding = {
  capability: ProviderCapability;
  providerKind: ProviderKind;
  label: string;
  secretRef: string;
  metadata: Record<string, unknown>;
};

export class RuntimeProviderResolutionError extends Error {
  readonly code = "runtime_provider_unavailable";
  readonly publicMessage = "workflow_failed";
  readonly reason = "provider_not_connected";

  constructor(input: { tenantId: string; workflowId: string; capability: ProviderCapability }) {
    super(`No active provider connection can satisfy capability "${input.capability}" for workflow "${input.workflowId}"`);
    this.name = "RuntimeProviderResolutionError";
  }
}

const DEFAULT_PROVIDER_ORDER: readonly ProviderKind[] = [
  "openai_chatgpt_codex_subscription",
  "openai_api",
  "anthropic_api",
  "xai_grok_api",
  "openrouter_api",
  "generic_api",
  "openai"
];

export function createRuntimeProviderResolver(options: {
  listProviderConnections: (input: { tenantId: string }) => Promise<readonly RuntimeProviderConnection[]>;
  preferredProviderOrder?: readonly ProviderKind[];
}) {
  const preferredProviderOrder = options.preferredProviderOrder ?? DEFAULT_PROVIDER_ORDER;

  return {
    async resolveForWorkflow(input: {
      tenantId: string;
      workflowId: string;
      requiredCapabilities: readonly ProviderCapability[];
    }): Promise<RuntimeProviderBinding[]> {
      const connections = (await options.listProviderConnections({ tenantId: input.tenantId }))
        .filter((connection) => connection.tenantId === input.tenantId)
        .filter((connection) => connection.revokedAt == null)
        .filter(isExecutableProviderConnection);

      return input.requiredCapabilities.map((capability) => {
        const eligible = connections.filter((connection) => connection.capabilities.includes(capability));
        const chosen = choosePreferredConnection(eligible, preferredProviderOrder);

        if (!chosen) {
          throw new RuntimeProviderResolutionError({
            tenantId: input.tenantId,
            workflowId: input.workflowId,
            capability
          });
        }

        return {
          capability,
          providerKind: chosen.providerKind,
          label: chosen.label,
          secretRef: chosen.secretRef,
          metadata: normalizeRuntimeProviderMetadata(chosen.providerKind, chosen.metadata)
        };
      });
    }
  };
}

function normalizeRuntimeProviderMetadata(providerKind: ProviderKind, metadata: Record<string, unknown>): Record<string, unknown> {
  if (providerKind !== "openai_chatgpt_codex_subscription") {
    return metadata;
  }

  return normalizeCodexSubscriptionMetadata(metadata);
}

function choosePreferredConnection(
  connections: readonly RuntimeProviderConnection[],
  preferredProviderOrder: readonly ProviderKind[]
): RuntimeProviderConnection | undefined {
  return [...connections].sort((left, right) => providerPriority(left.providerKind, preferredProviderOrder) - providerPriority(right.providerKind, preferredProviderOrder))[0];
}

function providerPriority(providerKind: ProviderKind, preferredProviderOrder: readonly ProviderKind[]): number {
  const index = preferredProviderOrder.indexOf(providerKind);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function isExecutableProviderConnection(connection: RuntimeProviderConnection): boolean {
  if (connection.providerKind !== "openai_chatgpt_codex_subscription") {
    return true;
  }

  return hasNonEmptyMetadataString(connection.metadata, "codexHome") && hasNonEmptyMetadataString(connection.metadata, "authStateRef");
}

function hasNonEmptyMetadataString(metadata: Record<string, unknown>, key: string): boolean {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0;
}
