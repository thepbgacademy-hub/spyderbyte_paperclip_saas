export type TenantRole = "owner" | "admin" | "member" | "operator";
export type WorkflowRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type HarnessRunStatus = "queued" | "planning" | "active" | "waiting" | "blocked" | "assembling" | "done" | "failed" | "cancelled";
export type HarnessCardStatus = "queued" | "planning" | "approved" | "working" | "waiting" | "blocked" | "done" | "cancelled";
export type HarnessCardEventKind = "created" | "state_changed" | "comment_added" | "subcard_proposed" | "result_recorded";
export type ProviderKind = "openai" | "openai_api" | "openai_chatgpt_codex_subscription" | "anthropic_api" | "xai_grok_api" | "openrouter_api" | "generic_api";

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

export type HarnessRuntimeContextRow = {
  providerKind: ProviderKind;
  credentialLabel: string;
};

export type HarnessRunRow = {
  id: string;
  tenantId: string;
  workflowId: string;
  packageId: string;
  orchestratorPersona: string;
  state: HarnessRunStatus;
  runtimeContext: HarnessRuntimeContextRow;
  createdAt: string;
  updatedAt: string;
};

export type HarnessCardRow = {
  id: string;
  runId: string;
  parentCardId: string | null;
  persona: string;
  title: string;
  deliverableType: string;
  state: HarnessCardStatus;
  createdAt: string;
  updatedAt: string;
};

export type HarnessCardEventRow = {
  id: string;
  cardId: string;
  eventKind: HarnessCardEventKind;
  payload: Record<string, unknown>;
  createdAt: string;
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

export type WealthFactoryPackageRow = {
  id: string;
  packageKey: string;
  name: string;
  kind: "industry" | "blank_canvas";
  metadata: Record<string, unknown>;
};

export type TenantPackageInstallRow = {
  id: string;
  tenantId: string;
  packageId: string;
  installedByUserId: string;
  status: "active" | "paused" | "removed";
  installedAt: string;
};

export type ArtifactMetadataRow = {
  id: string;
  tenantId: string;
  workflowRunId: string;
  packageId: string | null;
  artifactType: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  checksum: string;
  expiresAt: string;
  purgedAt: string | null;
  exportStatus: "not_exported" | "exported";
};

export type StorageConnectorRow = {
  id: string;
  tenantId: string;
  providerKind: string;
  displayName: string;
  publicTarget: Record<string, unknown>;
  revokedAt: string | null;
};
