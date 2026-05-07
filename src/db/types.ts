export type TenantRole = "owner" | "admin" | "member" | "operator";
export type WorkflowRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type ProviderKind = "openai" | "generic_api";

export type TenantRow = {
  id: string;
  name: string;
  slug: string;
  pausedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TenantMembershipRow = {
  tenantId: string;
  userId: string;
  role: TenantRole;
  createdAt: string;
};

export type WorkflowTemplateRow = {
  id: string;
  tenantId: string;
  name: string;
  providerKind: ProviderKind;
  enabled: boolean;
};

export type WorkflowRunRow = {
  id: string;
  tenantId: string;
  workflowTemplateId: string;
  createdByUserId: string;
  status: WorkflowRunStatus;
  publicResult: Record<string, unknown>;
  errorCode: string | null;
};

export type SecretReferenceRow = {
  id: string;
  tenantId: string;
  providerKind: ProviderKind;
  label: string;
  secretRef: string;
  metadata: Record<string, unknown>;
  revokedAt: string | null;
};
