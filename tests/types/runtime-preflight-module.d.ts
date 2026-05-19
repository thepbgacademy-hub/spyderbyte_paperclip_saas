declare module "../../scripts/lib/runtime-preflight.mjs" {
  export function loadRuntimePreflight(input: {
    client: {
      query(sql: string, values: readonly unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
    };
    tenantId: string;
    workflowId: string;
  }): Promise<{
    schema: {
      workflowRunsBoundProviderReady: boolean;
      tenantPackagePurchasesReady: boolean;
      purchaseActorColumn: "created_by_user_id" | "purchased_by_user_id" | null;
      hasOutbox: boolean;
      hasCompanyMappingTable: boolean;
    };
    tenant: {
      exists: boolean;
      paused: boolean;
    };
    workflow: {
      exists: boolean;
      enabled: boolean;
      packageId: string | null;
      providerKind: string | null;
    };
    mapping: {
      exists: boolean;
      paperclipCompanyId: string | null;
    };
  }>;

  export function summarizeRuntimePreflight(input: {
    schema: {
      workflowRunsBoundProviderReady: boolean;
      tenantPackagePurchasesReady: boolean;
      purchaseActorColumn: "created_by_user_id" | "purchased_by_user_id" | null;
      hasOutbox: boolean;
      hasCompanyMappingTable: boolean;
    };
    tenant: {
      exists: boolean;
      paused: boolean;
    };
    workflow: {
      exists: boolean;
      enabled: boolean;
      packageId: string | null;
      providerKind: string | null;
    };
    mapping: {
      exists: boolean;
      paperclipCompanyId: string | null;
    };
  }): {
    ok: boolean;
    blockers: string[];
  };
}
