import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";

import { createAppShellHandler } from "./app-shell.js";
import type { ApiSession } from "./dashboard-api.js";
import { createDashboardApi, DashboardApiConflictError } from "./dashboard-api.js";
import { createDashboardHttpHandler, type DashboardHttpRequest, type DashboardHttpResponse } from "./dashboard-http.js";
import { createHarnessHttpHandler } from "./harness-http.js";
import { createHealthHttpHandler } from "./health-http.js";
import { createOperatorHttpHandler } from "./operator-http.js";
import { createStorageOAuthHttpHandler } from "./storage-oauth-http.js";
import { createFactoryPackageInstallApi } from "./factory-package-install-api.js";
import { createFactoryPackageInstallHttpHandler } from "./factory-package-install-http.js";
import { createPostgresTenantPackageInstallRoleResolver } from "./factory-package-install-role-resolver.js";
import { createDurableFactoryPackageInstallAuditSink } from "./factory-package-install-audit.js";
import { createDemoPackageBlueprintLoader } from "./factory-package-install-blueprint-loader.js";
import { createFactoryRunApprovalApi } from "./factory-run-approval-api.js";
import { createFactoryRunApprovalHttpHandler } from "./factory-run-approval-http.js";
import { createDurableFactoryRunApprovalAuditSink } from "./factory-run-approval-audit.js";
import { createFactoryRunExportApi } from "./factory-run-export-api.js";
import { createFactoryRunExportHttpHandler } from "./factory-run-export-http.js";
import {
  createPostgresFactoryPackageInstallRepository
} from "../factory/packages/package-install-repository.js";
import { createPostgresFactoryRunApprovalRepository } from "../factory/runs/run-approval-repository.js";
import { createPostgresFactoryRunDeliverableRepository } from "../factory/runs/deliverable-repository.js";
import { allowAllPackageInstallEntitlements } from "../factory/packages/package-install-application-service.js";
import { createDurableAuditSink } from "../audit/durable-audit.js";
import { createAcidGuardRepository } from "../db/acid-guard-repository.js";
import { createPgPool, createPgPoolQueryClient, createPgTransactionRunner } from "../db/postgres-client.js";
import { createSupabaseRepositories, createSupabaseSecretRepository } from "../db/supabase-repositories.js";
import {
  createPaperclipSecretAdminHttpClient,
  createPaperclipSecretBindingRepository,
  createPaperclipSecretProjectionService
} from "../paperclip/secret-sync.js";
import {
  createHarnessBoardService,
  type HarnessGovernanceHistoryExportReadyDispatch,
  type HarnessPackageBundleExportReadyDispatch
} from "../harness/board-service.js";
import { hasPublicWorkflowHarnessBootstrap, seedPublicWorkflowHarnessRun } from "../harness/public-run-bootstrap.js";
import { createPostgresHarnessRepository } from "../harness/repository.js";
import {
  createFilesystemGovernanceHistoryExportWriter,
  type GovernanceHistoryExportWriter
} from "../obsidian/governance-history-export-writer.js";
import {
  createFilesystemPackageBundleExportWriter,
  type PackageBundleExportWriter
} from "../obsidian/package-bundle-export-writer.js";
import { assertAllowedOrigin, createSecurityHeaders } from "../security/cors.js";
import { createPostgresFixedWindowRateLimiter } from "../security/postgres-rate-limit.js";
import { createEncryptedSecretVault } from "../secrets/encrypted-vault.js";
import { createAcidSecretRevokeService } from "../secrets/acid-secret-revoke-service.js";
import { createPostgresEncryptedVaultStore } from "../secrets/postgres-vault-store.js";
import { createProviderCredentialService } from "../secrets/provider-credential-service.js";
import { createRuntimeProviderExecutionContextResolver } from "../providers/runtime-provider-execution.js";
import type { RuntimeProviderBinding } from "../providers/runtime-provider-resolution.js";
import { createRuntimeHarnessCeoGoalExecutor } from "../harness/ceo-goal-executor.js";
import { createPostgresOperatorDependencies } from "../operators/operator-deps.js";
import { createOperatorService } from "../operators/operator-service.js";

function coerceExportWriterFailure(error: unknown): {
  code: string;
  message: string;
  receipt: Record<string, unknown>;
} {
  const message =
    error instanceof Error ? error.message : "Unknown export delivery failure";
  const receipt =
    typeof error === "object" &&
    error !== null &&
    "partialReceipt" in error &&
    typeof (error as { partialReceipt?: unknown }).partialReceipt === "object" &&
    (error as { partialReceipt?: unknown }).partialReceipt !== null
      ? { ...((error as { partialReceipt: Record<string, unknown> }).partialReceipt) }
      : typeof error === "object" &&
        error !== null &&
        "receipt" in error &&
        typeof (error as { receipt?: unknown }).receipt === "object" &&
        (error as { receipt?: unknown }).receipt !== null
      ? { ...((error as { receipt: Record<string, unknown> }).receipt) }
      : {};
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    (error as { code: string }).code.length > 0
      ? (error as { code: string }).code
      : Object.keys(receipt).length > 0
      ? "writer_partial_failure"
      : "writer_failed";
  return {
    code,
    message,
    receipt
  };
}

type ExportReadyDispatch = HarnessGovernanceHistoryExportReadyDispatch | HarnessPackageBundleExportReadyDispatch;

type ExportWriterSuccessReceipt = {
  primaryNotePath: string;
  manifestPath: string | null;
  writtenFileCount: number;
  writtenPaths: string[];
};

type ExportWriterSuccess = {
  writerKind: "obsidian_filesystem";
  deliveredAt: string;
  receipt: ExportWriterSuccessReceipt;
};

type ExportReadyWriter<TDispatch extends ExportReadyDispatch> = {
  write(dispatch: TDispatch): Promise<ExportWriterSuccess>;
};

function toExportDeliveryUpsertInput(input: {
  dispatch: ExportReadyDispatch;
  existing: Awaited<ReturnType<ReturnType<typeof createPostgresHarnessRepository>["getExportDeliveryByIdempotencyKey"]>>;
  now: string;
  id: string;
}) {
  const { dispatch, existing, now, id } = input;
  return {
    id,
    runId: dispatch.runId,
    tenantId: dispatch.tenantId,
    workflowId: dispatch.workflowId,
    packageId: dispatch.packageId,
    candidateId: dispatch.candidateId,
    status: "export_ready" as const,
    exportFormat: dispatch.exportFormat,
    recordTarget: dispatch.recordTarget,
    bundleId: dispatch.bundleId,
    bundleRevision: dispatch.bundleRevision,
    idempotencyKey: dispatch.idempotencyKey,
    noteTitle: dispatch.noteTitle,
    noteFileName: dispatch.noteFileName,
    placementTargetSystem: dispatch.placement.targetSystem,
    vaultFolder: dispatch.placement.vaultFolder,
    primaryNotePath: dispatch.placement.primaryNotePath,
    syncStrategy: dispatch.placement.syncStrategy,
    confirmationRequirement: dispatch.placement.confirmationRequirement,
    files: dispatch.files.map((file) => ({ ...file })),
    recordCount: dispatch.recordCount,
    disclosureSummary: dispatch.disclosureSummary,
    redactionSummary: dispatch.redactionSummary,
    attemptCount: existing?.attemptCount ?? 0,
    lastAttemptedAt: existing?.lastAttemptedAt ?? null,
    deliveredAt: existing?.deliveredAt ?? null,
    writerKind: existing?.writerKind ?? null,
    deliveryReceipt: existing?.deliveryReceipt ?? {},
    lastErrorCode: existing?.lastErrorCode ?? null,
    lastErrorMessage: existing?.lastErrorMessage ?? null,
    createdAt: now,
    updatedAt: now
  };
}
import { createSecretService } from "../secrets/secret-service.js";
import { createStorageOAuthService, STORAGE_OAUTH_PROVIDER_CONFIGS } from "../storage/storage-oauth-service.js";
import { createPostgresOAuthStateStore } from "../storage/postgres-oauth-state-store.js";
import { createVaultBackedStorageOAuthRegistration } from "../storage/vault-backed-storage-oauth-registration.js";
import { listInstalledPackageDefinitions } from "../packages/package-catalog.js";
import { createHarnessWorkflowRegistry, WF_HARNESS_ELIGIBLE_WORKFLOWS } from "../wealthfactory/workflow-registry.js";
import { createAcidRunReservationService, type WorkflowRunEnqueuer } from "../workflows/acid-run-reservation.js";
import { createQueueOutboxPump } from "../workflows/queue-outbox-pump.js";
import { createQueueOutboxWorker } from "../workflows/queue-outbox-worker.js";

export type RuntimeEnv = {
  supabaseDbUrl: string;
  supabaseDbSsl?: string;
  allowedOrigins: readonly string[];
  apiPort: number;
  vaultMasterKey: string;
  webAppEntryUrl?: string;
  webAppStylesheetUrl?: string;
  runtimeEnv: Record<string, string | undefined>;
  storageOAuthRedirectOrigin?: string;
  googleDriveClientId?: string;
  googleDriveClientSecret?: string;
  dropboxClientId?: string;
  dropboxClientSecret?: string;
  obsidianExportRoot?: string;
};

export type RuntimeAuth = {
  authenticate(input: { authorization: string; cookie?: string }): Promise<ApiSession | null>;
};

export class RuntimeEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeEnvError";
  }
}

export function loadRuntimeEnv(source: NodeJS.ProcessEnv = process.env): RuntimeEnv {
  const supabaseDbUrl = source.SUPABASE_DB_URL;
  if (!supabaseDbUrl || supabaseDbUrl === "PLACE_HOLDER") {
    throw new RuntimeEnvError("SUPABASE_DB_URL is required");
  }

  const allowedOrigins = (source.WF_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (allowedOrigins.length === 0 || allowedOrigins.includes("*")) {
    throw new RuntimeEnvError("WF_ALLOWED_ORIGINS must list explicit portal origins");
  }

  const apiPort = source.WF_API_PORT ? Number(source.WF_API_PORT) : 8080;
  if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65_535) {
    throw new RuntimeEnvError("WF_API_PORT must be a valid TCP port");
  }
  const vaultMasterKey = source.WF_VAULT_MASTER_KEY;
  if (!vaultMasterKey || vaultMasterKey.length < 24) {
    throw new RuntimeEnvError("WF_VAULT_MASTER_KEY must be at least 24 characters");
  }
  let storageOAuthRedirectOrigin: string | undefined;
  if (source.WF_STORAGE_OAUTH_REDIRECT_ORIGIN) {
    const redirectOrigin = parseRedirectOrigin(source.WF_STORAGE_OAUTH_REDIRECT_ORIGIN);
    if (!allowedOrigins.includes(redirectOrigin)) {
      throw new RuntimeEnvError("WF_STORAGE_OAUTH_REDIRECT_ORIGIN must match an allowed portal origin");
    }
    storageOAuthRedirectOrigin = redirectOrigin;
  }
  let obsidianExportRoot: string | undefined;
  if (source.WF_OBSIDIAN_EXPORT_ROOT) {
    if (!path.isAbsolute(source.WF_OBSIDIAN_EXPORT_ROOT)) {
      throw new RuntimeEnvError("WF_OBSIDIAN_EXPORT_ROOT must be an absolute path");
    }
    obsidianExportRoot = path.resolve(source.WF_OBSIDIAN_EXPORT_ROOT);
  }

  return {
    supabaseDbUrl,
    ...(source.SUPABASE_DB_SSL ? { supabaseDbSsl: source.SUPABASE_DB_SSL } : {}),
    allowedOrigins,
    apiPort,
    vaultMasterKey,
    ...(source.WF_WEB_APP_ENTRY_URL ? { webAppEntryUrl: source.WF_WEB_APP_ENTRY_URL } : {}),
    ...(source.WF_WEB_APP_STYLESHEET_URL ? { webAppStylesheetUrl: source.WF_WEB_APP_STYLESHEET_URL } : {}),
    runtimeEnv: source,
    ...(storageOAuthRedirectOrigin ? { storageOAuthRedirectOrigin } : {}),
    ...(source.GOOGLE_DRIVE_CLIENT_ID ? { googleDriveClientId: source.GOOGLE_DRIVE_CLIENT_ID } : {}),
    ...(source.GOOGLE_DRIVE_CLIENT_SECRET ? { googleDriveClientSecret: source.GOOGLE_DRIVE_CLIENT_SECRET } : {}),
    ...(source.DROPBOX_CLIENT_ID ? { dropboxClientId: source.DROPBOX_CLIENT_ID } : {}),
    ...(source.DROPBOX_CLIENT_SECRET ? { dropboxClientSecret: source.DROPBOX_CLIENT_SECRET } : {}),
    ...(obsidianExportRoot ? { obsidianExportRoot } : {})
  };
}

function parseRedirectOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RuntimeEnvError("WF_STORAGE_OAUTH_REDIRECT_ORIGIN must be an absolute origin URL");
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new RuntimeEnvError("WF_STORAGE_OAUTH_REDIRECT_ORIGIN must be a bare http(s) origin");
  }
  return url.origin;
}

function createRedispatchQueueJobId(input: {
  tenantId: string;
  workflowId: string;
  runId: string;
  dispatchKind: string;
  actionToken: string;
}): string {
  const digest = createHash("sha256").update(input.actionToken).digest("hex").slice(0, 12);
  return `${input.tenantId}:${input.workflowId}:${input.runId}:redispatch:${input.dispatchKind}:${digest}`;
}

async function resolveTenantInstalledOverlayPackages(input: {
  tenantId: string;
  repositories: Pick<ReturnType<typeof createSupabaseRepositories>, "listActiveInstalledPackageIds">;
}) {
  const installedPackageIds = await input.repositories.listActiveInstalledPackageIds({ tenantId: input.tenantId });
  return listInstalledPackageDefinitions({ installedPackageIds });
}

async function listTenantDashboardWorkflows(input: {
  tenantId: string;
  userId: string;
  repositories: Pick<ReturnType<typeof createSupabaseRepositories>, "listWorkflows" | "listActiveInstalledPackageIds">;
}) {
  const [dbWorkflows, installedPackages] = await Promise.all([
    input.repositories.listWorkflows({ tenantId: input.tenantId }),
    resolveTenantInstalledOverlayPackages({ tenantId: input.tenantId, repositories: input.repositories })
  ]);
  const registry = createHarnessWorkflowRegistry({
    harnessEnabledWorkflowIds: [],
    installedPackages
  });
  const coreBuiltInPublicIds = new Set<string>([...WF_HARNESS_ELIGIBLE_WORKFLOWS]);
  const workflowMap = new Map<string, Record<string, unknown>>();

  for (const workflow of dbWorkflows) {
    if (workflow && typeof workflow === "object") {
      const record = workflow as Record<string, unknown>;
      const id = String(record.id ?? "");
      if (id.length > 0) {
        workflowMap.set(id, {
          ...record,
          startEnabled: record.startEnabled !== false
        });
      }
    }
  }

  for (const workflow of registry.listPublicDashboardWorkflows()) {
    if (coreBuiltInPublicIds.has(workflow.id)) {
      continue;
    }
    if (!workflowMap.has(workflow.id)) {
      workflowMap.set(workflow.id, {
        ...workflow,
        enabled: true
      });
    }
  }

  return [...workflowMap.values()];
}

async function resolveWorkflowStartTarget(input: {
  tenantId: string;
  workflowId: string;
  repositories: Pick<
    ReturnType<typeof createSupabaseRepositories>,
    "resolveWorkflowTemplateStartIdentity" | "resolveWorkflowTemplateStartIdentityByPackageKey"
  >;
  registry: ReturnType<typeof createHarnessWorkflowRegistry>;
}) {
  const definition = (() => {
    try {
      return input.registry.getDefinition(input.workflowId);
    } catch {
      return null;
    }
  })();
  if (definition) {
    const templateIdentity = await input.repositories.resolveWorkflowTemplateStartIdentityByPackageKey({
      tenantId: input.tenantId,
      workflowPackageId: definition.packageId
    });
    return {
      publicWorkflowId: input.workflowId,
      workflowTemplateId: templateIdentity?.workflowTemplateId ?? null,
      definition
    };
  }

  const templateIdentity = await input.repositories.resolveWorkflowTemplateStartIdentity({
    tenantId: input.tenantId,
    workflowTemplateId: input.workflowId
  });
  if (!templateIdentity) {
    return {
      publicWorkflowId: input.workflowId,
      workflowTemplateId: input.workflowId,
      definition: null
    };
  }

  const templateDefinition = (() => {
    try {
      return input.registry.getDefinitionByPackageId(templateIdentity.workflowPackageId);
    } catch {
      return null;
    }
  })();

  // Package-key misses must fail closed here. Until we widen this seam deliberately,
  // template-id dashboard starts may only expose a public workflow identity when the
  // registry can prove the package maps back to a known public workflow definition.

  return {
    publicWorkflowId: templateDefinition?.publicId ?? input.workflowId,
    workflowTemplateId: templateIdentity.workflowTemplateId,
    definition: templateDefinition
  };
}

export function createDashboardRuntime(options: {
  env: RuntimeEnv;
  auth: RuntimeAuth;
  workflowQueueEnqueuer?: WorkflowRunEnqueuer;
  onGovernanceHistoryExportReady?: Parameters<typeof createHarnessBoardService>[0]["onGovernanceHistoryExportReady"];
  governanceHistoryExportWriter?: GovernanceHistoryExportWriter;
  onPackageBundleExportReady?: Parameters<typeof createHarnessBoardService>[0]["onPackageBundleExportReady"];
  packageBundleExportWriter?: PackageBundleExportWriter;
  operatorHttpHandler?: (request: DashboardHttpRequest) => Promise<DashboardHttpResponse>;
}) {
  const pool = createPgPool({
    connectionString: options.env.supabaseDbUrl,
    ...(options.env.supabaseDbSsl ? { sslMode: options.env.supabaseDbSsl } : {})
  });
  const transactionRunner = createPgTransactionRunner(pool);
  const queryClient = createPgPoolQueryClient(pool);
  const harnessRepository = createPostgresHarnessRepository(queryClient);
  const harnessWorkflowRegistry = createHarnessWorkflowRegistry({
    harnessEnabledWorkflowIds:
      options.env.runtimeEnv.WF_HARNESS_ENABLED_WORKFLOW_IDS?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? [],
    nativeExecutorEnabledWorkflowIds:
      options.env.runtimeEnv.WF_NATIVE_EXECUTOR_ENABLED_WORKFLOW_IDS?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? []
  });
  const repositories = createSupabaseRepositories(queryClient);
  const audit = createDurableAuditSink(queryClient);
  const vault = createEncryptedSecretVault({
    masterKey: options.env.vaultMasterKey,
    store: createPostgresEncryptedVaultStore(queryClient)
  });
  const paperclipSecretBindings = createPaperclipSecretBindingRepository(queryClient);
  const paperclipBoardSessionToken = options.env.runtimeEnv.WF_PAPERCLIP_BOARD_SESSION_TOKEN;
  const paperclipBoardOrigin = options.env.runtimeEnv.WF_PAPERCLIP_BOARD_ORIGIN;
  const paperclipProjection =
    paperclipBoardSessionToken &&
    options.env.runtimeEnv.PAPERCLIP_BASE_URL
      ? createPaperclipSecretProjectionService({
          adminClient: createPaperclipSecretAdminHttpClient({
            baseUrl: paperclipBoardOrigin ?? options.env.runtimeEnv.PAPERCLIP_BASE_URL,
            adminToken: paperclipBoardSessionToken,
            ...(paperclipBoardOrigin
              ? {
                  origin: paperclipBoardOrigin,
                  referer: `${paperclipBoardOrigin.replace(/\/+$/, "")}/`
                }
              : {})
          }),
          bindings: paperclipSecretBindings,
          resolveCompanyMapping: async ({ tenantId }) => repositories.resolvePaperclipCompanyMapping({ tenantId }),
          hasActiveRuns: async ({ tenantId }) => repositories.hasActiveWorkflowRuns({ tenantId }),
          ...(options.env.runtimeEnv.WF_PAPERCLIP_ISSUE_AGENT_ID
            ? { defaultPaperclipAgentId: options.env.runtimeEnv.WF_PAPERCLIP_ISSUE_AGENT_ID }
            : {}),
          audit
        })
      : undefined;
  const secretRepository = createSupabaseSecretRepository(queryClient, transactionRunner);
  const secretService = createSecretService({
    vault,
    repository: secretRepository,
    ...(paperclipProjection ? { projection: paperclipProjection } : {}),
    audit,
  });
  const registerProviderCredential = createProviderCredentialService({
    secrets: secretService,
    runtimeEnv: options.env.runtimeEnv
  }).register;
  const rotateProviderCredential = secretService.rotate;
  const providerExecutionResolver = createRuntimeProviderExecutionContextResolver({
    accessSecretRef: (input) => secretService.access(input)
  });
  const acidRepository = createAcidGuardRepository(transactionRunner);
  const revokeProviderCredential = createAcidSecretRevokeService({
    repository: { revokeCredential: acidRepository.revokeCredential },
    resolver: { findIdBySecretRef: repositories.findSecretReferenceId },
    vault,
    audit,
    ...(paperclipProjection ? { projection: paperclipProjection } : {})
  }).revoke;
  const storageOAuthProviders =
    options.env.storageOAuthRedirectOrigin
      ? {
          ...(options.env.googleDriveClientId
            ? {
                google_drive: STORAGE_OAUTH_PROVIDER_CONFIGS.googleDrive({
                  clientId: options.env.googleDriveClientId,
                  ...(options.env.googleDriveClientSecret ? { clientSecret: options.env.googleDriveClientSecret } : {}),
                  redirectUri: `${options.env.storageOAuthRedirectOrigin}/api/storage/oauth/google_drive/callback`
                })
              }
            : {}),
          ...(options.env.dropboxClientId
            ? {
                dropbox: STORAGE_OAUTH_PROVIDER_CONFIGS.dropbox({
                  clientId: options.env.dropboxClientId,
                  ...(options.env.dropboxClientSecret ? { clientSecret: options.env.dropboxClientSecret } : {}),
                  redirectUri: `${options.env.storageOAuthRedirectOrigin}/api/storage/oauth/dropbox/callback`
                })
              }
            : {})
        }
      : {};
  const storageOAuth =
    Object.keys(storageOAuthProviders).length > 0
      ? createStorageOAuthService({
          providers: storageOAuthProviders,
          stateStore: createPostgresOAuthStateStore(queryClient),
          registration: createVaultBackedStorageOAuthRegistration({
            runner: transactionRunner,
            vaultMasterKey: options.env.vaultMasterKey,
            audit
          }),
          fetch: globalThis.fetch
        })
      : undefined;
  const outboxPump = options.workflowQueueEnqueuer
    ? createQueueOutboxPump({
        worker: createQueueOutboxWorker({
          repository: acidRepository,
          enqueuer: options.workflowQueueEnqueuer
        })
      })
    : undefined;
  const workflowRunReservation =
    options.workflowQueueEnqueuer
      ? createAcidRunReservationService({
          repository: acidRepository,
          enqueuer: options.workflowQueueEnqueuer
        })
      : undefined;
  const dashboardApi = createDashboardApi({
    authenticate: options.auth.authenticate,
    requireTenantMember: repositories.requireTenantMember,
    listWorkflows: (input) => listTenantDashboardWorkflows({ ...input, repositories }),
    listPackages: repositories.listPackages,
    listArtifacts: repositories.listArtifacts,
    listResultApprovalStates: repositories.listResultApprovalStates,
    listProviderConnections: repositories.listProviderConnections,
    listStorageConnectors: repositories.listStorageConnectors,
    getPlatformLoad: repositories.getPlatformLoad,
    ...(workflowRunReservation
        ? {
          startWorkflowRun: async (input: { tenantId: string; userId: string; workflowId: string; freshRun?: boolean }) => {
            const installedPackages = await resolveTenantInstalledOverlayPackages({ tenantId: input.tenantId, repositories });
            const registry = createHarnessWorkflowRegistry({
              harnessEnabledWorkflowIds:
                options.env.runtimeEnv.WF_HARNESS_ENABLED_WORKFLOW_IDS?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? [],
              nativeExecutorEnabledWorkflowIds:
                options.env.runtimeEnv.WF_NATIVE_EXECUTOR_ENABLED_WORKFLOW_IDS?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? [],
              installedPackages
            });
            const resolvedTarget = await resolveWorkflowStartTarget({
              tenantId: input.tenantId,
              workflowId: input.workflowId,
              repositories,
              registry
            });
            const definition = resolvedTarget.definition;
            const publicWorkflowId = resolvedTarget.publicWorkflowId;
            const workflowTemplateId = resolvedTarget.workflowTemplateId;
            const existingNativePublicRun =
              definition &&
              definition.publicStartEnabled === true &&
              definition.executionEngine === "wf_native_v1" &&
              hasPublicWorkflowHarnessBootstrap(publicWorkflowId)
                ? await harnessRepository.findLatestActionableRunForTenantWorkflow({
                    tenantId: input.tenantId,
                    workflowId: publicWorkflowId
                  })
                : null;
            if (input.freshRun && existingNativePublicRun) {
              throw new DashboardApiConflictError("fresh_harness_run_conflict");
            }
            if (existingNativePublicRun && definition && definition.publicStartEnabled === true) {
              await acidRepository.transitionWorkflowRunStatus({
                tenantId: input.tenantId,
                runId: existingNativePublicRun.id,
                from: ["queued", "running", "completed", "failed", "cancelled"],
                to: "queued"
              });
              const actionToken = randomUUID();
              const redispatchQueueJobId = createRedispatchQueueJobId({
                tenantId: input.tenantId,
                workflowId: publicWorkflowId,
                runId: existingNativePublicRun.id,
                dispatchKind: "public_start",
                actionToken
              });
              const stagedRedispatch = await acidRepository.stageWorkflowRunRedispatch({
                tenantId: input.tenantId,
                runId: existingNativePublicRun.id,
                userId: input.userId,
                idempotencyKey: redispatchQueueJobId
              });
              if (stagedRedispatch.staged) {
                return { runId: existingNativePublicRun.id, queued: true };
              }
              return { runId: existingNativePublicRun.id, queued: true };
            }
            const runId = existingNativePublicRun?.id ?? randomUUID();
            return workflowRunReservation.reserveAndEnqueue({
              tenantId: input.tenantId,
              userId: input.userId,
              workflowId: publicWorkflowId,
              ...(definition && definition.publicStartEnabled === true && definition.providerKind
                ? {
                    workflowTemplateId: null,
                    workflowIdentityKind: "installed_package_overlay" as const,
                    workflowPackageId: definition.packageId,
                    workflowDefinitionSnapshot: {
                      publicWorkflowId,
                      packageId: definition.packageId,
                      executionEngine: definition.executionEngine ?? "paperclip",
                      requiredCapabilities: [...definition.requiredCapabilities],
                      providerKind: definition.providerKind
                    }
                  }
                : {
                    workflowTemplateId: workflowTemplateId ?? input.workflowId,
                    workflowIdentityKind: "tenant_template" as const
                  }),
              runId,
              idempotencyKey: `${input.tenantId}:${publicWorkflowId}:${runId}`,
              ...(definition && definition.publicStartEnabled === true && definition.providerKind
                ? {
                    workflowBinding: {
                      packageId: definition.packageId,
                      providerKind: definition.providerKind
                    }
                  }
                : {}),
              ...(definition &&
              definition.executionEngine === "wf_native_v1" &&
              hasPublicWorkflowHarnessBootstrap(publicWorkflowId) &&
              !existingNativePublicRun
                ? {
                    onReserved: async ({ transaction, publicWorkflowId, providerKind, credentialLabel }) => {
                      await seedPublicWorkflowHarnessRun({
                        repository: createPostgresHarnessRepository(transaction),
                        tenantId: input.tenantId,
                        runId,
                        workflowId: publicWorkflowId,
                        packageId: definition.packageId,
                        providerKind,
                        credentialLabel
                      });
                    }
                  }
                : {})
            });
          }
        }
      : {})
  });
  const governanceHistoryExportWriter =
    options.governanceHistoryExportWriter ??
    (options.env.obsidianExportRoot
      ? createFilesystemGovernanceHistoryExportWriter({ exportRoot: options.env.obsidianExportRoot })
      : undefined);
  const packageBundleExportWriter =
    options.packageBundleExportWriter ??
    (options.env.obsidianExportRoot
      ? createFilesystemPackageBundleExportWriter({ exportRoot: options.env.obsidianExportRoot })
      : undefined);
  const createExportReadyHandler = <TDispatch extends ExportReadyDispatch>(input: {
    writer: ExportReadyWriter<TDispatch> | undefined;
    onReady: ((dispatch: TDispatch) => void | Promise<void>) | undefined;
    deliveredEventType: string;
    failedEventType: string;
  }) => {
    return async (dispatch: TDispatch) => {
      const now = new Date().toISOString();
      const existing = await harnessRepository.getExportDeliveryByIdempotencyKey(dispatch.idempotencyKey);
      if (existing?.status === "delivered") {
        return;
      }

      const exportDelivery = await harnessRepository.upsertExportDelivery(
        toExportDeliveryUpsertInput({
          dispatch,
          existing,
          now,
          id: randomUUID()
        })
      );

      if (input.writer && exportDelivery.status !== "delivered") {
        const attemptedAt = new Date().toISOString();
        const claimed = await harnessRepository.claimExportDeliveryAttempt({
          idempotencyKey: dispatch.idempotencyKey,
          writerKind: "obsidian_filesystem",
          claimedAt: attemptedAt,
          updatedAt: attemptedAt
        });
        if (!claimed) {
          return;
        }

        try {
          const delivered = await input.writer.write(dispatch);
          const recorded = await harnessRepository.recordExportDeliveryOutcome({
            idempotencyKey: dispatch.idempotencyKey,
            expectedLastAttemptedAt: claimed.lastAttemptedAt ?? attemptedAt,
            status: "delivered",
            writerKind: delivered.writerKind,
            deliveryReceipt: { ...delivered.receipt },
            attemptCount: claimed.attemptCount,
            lastAttemptedAt: attemptedAt,
            deliveredAt: delivered.deliveredAt,
            lastErrorCode: null,
            lastErrorMessage: null,
            updatedAt: delivered.deliveredAt
          });
          if (recorded) {
            await audit({
              tenantId: dispatch.tenantId,
              actorUserId: dispatch.userId,
              eventType: input.deliveredEventType,
              entityType: "harness_export_delivery",
              metadata: {
                runId: dispatch.runId,
                workflowId: dispatch.workflowId,
                candidateId: dispatch.candidateId,
                bundleId: dispatch.bundleId,
                idempotencyKey: dispatch.idempotencyKey,
                writerKind: delivered.writerKind,
                writtenFileCount: delivered.receipt.writtenFileCount,
                primaryNotePath: delivered.receipt.primaryNotePath
              }
            });
          }
        } catch (error) {
          const failure = coerceExportWriterFailure(error);
          const recorded = await harnessRepository.recordExportDeliveryOutcome({
            idempotencyKey: dispatch.idempotencyKey,
            expectedLastAttemptedAt: claimed.lastAttemptedAt ?? attemptedAt,
            status: "delivery_failed",
            writerKind: "obsidian_filesystem",
            deliveryReceipt: failure.receipt,
            attemptCount: claimed.attemptCount,
            lastAttemptedAt: attemptedAt,
            deliveredAt: null,
            lastErrorCode: failure.code,
            lastErrorMessage: failure.message.slice(0, 240),
            updatedAt: attemptedAt
          });
          if (recorded) {
            await audit({
              tenantId: dispatch.tenantId,
              actorUserId: dispatch.userId,
              eventType: input.failedEventType,
              entityType: "harness_export_delivery",
              metadata: {
                runId: dispatch.runId,
                workflowId: dispatch.workflowId,
                candidateId: dispatch.candidateId,
                bundleId: dispatch.bundleId,
                idempotencyKey: dispatch.idempotencyKey,
                errorCode: failure.code,
                errorMessage: failure.message.slice(0, 240)
              }
            });
          }
        }
      }

      await input.onReady?.(dispatch);
    };
  };
  const onGovernanceHistoryExportReady = createExportReadyHandler({
    writer: governanceHistoryExportWriter,
    onReady: options.onGovernanceHistoryExportReady,
    deliveredEventType: "harness.governance_history_export_delivered",
    failedEventType: "harness.governance_history_export_delivery_failed"
  });
  const onPackageBundleExportReady = createExportReadyHandler({
    writer: packageBundleExportWriter,
    onReady: options.onPackageBundleExportReady,
    deliveredEventType: "harness.package_bundle_export_delivered",
    failedEventType: "harness.package_bundle_export_delivery_failed"
  });
  const ceoGoalExecutor = createRuntimeHarnessCeoGoalExecutor({
    loadBoundProviderContext: async ({ tenantId, runId }) => {
      const binding = await acidRepository.getBoundProviderLaunchBinding({ tenantId, runId });
      return binding
        ? ([{
            capability: binding.capability,
            providerKind: binding.providerKind as RuntimeProviderBinding["providerKind"],
            label: binding.label,
            secretRef: binding.secretRef,
            metadata: binding.metadata
          }] as const)
        : null;
    },
    hydrateProviderContext: ({ tenantId, runId, workflowId, providerBindings }) =>
      providerExecutionResolver.resolveForRun({
        tenantId,
        runId,
        workflowId,
        providerBindings
      }),
    ...(options.env.runtimeEnv.OPENAI_MODEL ? { openAIModel: options.env.runtimeEnv.OPENAI_MODEL } : {})
  });
  const harnessBoardApi = createHarnessBoardService({
    authenticate: options.auth.authenticate,
    requireTenantMember: repositories.requireTenantMember,
    requireActivePackageInstall: repositories.requireActivePackageInstall,
    repository: harnessRepository,
    workflowRegistry: harnessWorkflowRegistry,
    resolveWorkflowRegistry: async ({ tenantId }) =>
      createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds:
          options.env.runtimeEnv.WF_HARNESS_ENABLED_WORKFLOW_IDS?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? [],
        nativeExecutorEnabledWorkflowIds:
          options.env.runtimeEnv.WF_NATIVE_EXECUTOR_ENABLED_WORKFLOW_IDS?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? [],
        installedPackages: await resolveTenantInstalledOverlayPackages({ tenantId, repositories })
      }),
    audit,
    ceoGoalExecutor,
    ...(options.workflowQueueEnqueuer
      ? {
          onResolvedAttentionDispatch: async (dispatch: {
            tenantId: string;
            userId: string;
            runId: string;
            workflowId: string;
            cardId: string;
            actionToken: string;
            command: "resume_lane" | "unblock_lane";
            state: "working" | "approved";
          }) => {
            const workflowQueueEnqueuer = options.workflowQueueEnqueuer;
            if (!workflowQueueEnqueuer) {
              return;
            }
            const redispatchQueueJobId = createRedispatchQueueJobId({
              tenantId: dispatch.tenantId,
              workflowId: dispatch.workflowId,
              runId: dispatch.runId,
              dispatchKind: dispatch.command,
              actionToken: dispatch.actionToken
            });
            const stagedRedispatch = await acidRepository.stageWorkflowRunRedispatch({
              tenantId: dispatch.tenantId,
              runId: dispatch.runId,
              userId: dispatch.userId,
              idempotencyKey: redispatchQueueJobId
            });
            if (!stagedRedispatch.staged) {
              console.warn("Resolved harness attention redispatch staging did not return an outbox row", {
                runId: dispatch.runId,
                workflowId: dispatch.workflowId,
                cardId: dispatch.cardId,
                command: dispatch.command
              });
              return;
            }
            await workflowQueueEnqueuer.enqueueOnce({
              tenantId: dispatch.tenantId,
              userId: dispatch.userId,
              workflowId: dispatch.workflowId,
              runId: dispatch.runId,
              idempotencyKey: redispatchQueueJobId
            });
          },
          onFreshCycleDispatch: async (dispatch: {
            tenantId: string;
            userId: string;
            runId: string;
            workflowId: string;
            actionToken: string;
            mode: "reopen_deferred" | "clean";
            reopenedProposalCount: number;
          }) => {
            const workflowQueueEnqueuer = options.workflowQueueEnqueuer;
            if (!workflowQueueEnqueuer) {
              return;
            }
            const redispatchQueueJobId = createRedispatchQueueJobId({
              tenantId: dispatch.tenantId,
              workflowId: dispatch.workflowId,
              runId: dispatch.runId,
              dispatchKind: `fresh_cycle_${dispatch.mode}`,
              actionToken: dispatch.actionToken
            });
            const stagedRedispatch = await acidRepository.stageWorkflowRunRedispatch({
              tenantId: dispatch.tenantId,
              runId: dispatch.runId,
              userId: dispatch.userId,
              idempotencyKey: redispatchQueueJobId
            });
            if (!stagedRedispatch.staged) {
              const installedPackages = await resolveTenantInstalledOverlayPackages({ tenantId: dispatch.tenantId, repositories });
              const registry = createHarnessWorkflowRegistry({
                harnessEnabledWorkflowIds:
                  options.env.runtimeEnv.WF_HARNESS_ENABLED_WORKFLOW_IDS?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? [],
                nativeExecutorEnabledWorkflowIds:
                  options.env.runtimeEnv.WF_NATIVE_EXECUTOR_ENABLED_WORKFLOW_IDS?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? [],
                installedPackages
              });
              const resolvedTarget = await resolveWorkflowStartTarget({
                tenantId: dispatch.tenantId,
                workflowId: dispatch.workflowId,
                repositories,
                registry
              });
              const definition = resolvedTarget.definition;
              const publicWorkflowId = resolvedTarget.publicWorkflowId;
              const workflowTemplateId = resolvedTarget.workflowTemplateId;
              if (
                definition &&
                definition.publicStartEnabled === true &&
                definition.executionEngine === "wf_native_v1" &&
                hasPublicWorkflowHarnessBootstrap(publicWorkflowId)
              ) {
                const reservation = workflowRunReservation;
                if (!reservation) {
                  console.warn("Fresh harness cycle cannot reserve a missing workflow run without a queue enqueuer", {
                    runId: dispatch.runId,
                    workflowId: dispatch.workflowId,
                    mode: dispatch.mode
                  });
                  return;
                }
                await reservation.reserveAndEnqueue({
                  tenantId: dispatch.tenantId,
                  userId: dispatch.userId,
                  workflowId: publicWorkflowId,
                  ...(definition.providerKind
                    ? {
                        workflowTemplateId: null,
                        workflowIdentityKind: "installed_package_overlay" as const,
                        workflowPackageId: definition.packageId,
                        workflowDefinitionSnapshot: {
                          publicWorkflowId,
                          packageId: definition.packageId,
                          executionEngine: definition.executionEngine,
                          requiredCapabilities: [...definition.requiredCapabilities],
                          providerKind: definition.providerKind
                        }
                      }
                    : {
                        workflowTemplateId: workflowTemplateId ?? dispatch.workflowId,
                        workflowIdentityKind: "tenant_template" as const
                      }),
                  runId: dispatch.runId,
                  idempotencyKey: redispatchQueueJobId,
                  ...(definition.providerKind
                    ? {
                        workflowBinding: {
                          packageId: definition.packageId,
                          providerKind: definition.providerKind
                        }
                      }
                    : {})
                });
                return;
              }
              console.warn("Fresh harness cycle redispatch staging did not return an outbox row", {
                runId: dispatch.runId,
                workflowId: dispatch.workflowId,
                mode: dispatch.mode,
                reopenedProposalCount: dispatch.reopenedProposalCount
              });
              return;
            }
            await workflowQueueEnqueuer.enqueueOnce({
              tenantId: dispatch.tenantId,
              userId: dispatch.userId,
              workflowId: dispatch.workflowId,
              runId: dispatch.runId,
              idempotencyKey: redispatchQueueJobId
            });
          },
          onReviewedNextLaneDispatch: async (dispatch: {
            tenantId: string;
            userId: string;
            runId: string;
            workflowId: string;
            cardId: string;
            actionToken: string;
            decision: "start_next_lane" | "request_changes";
            state: "working";
          }) => {
            const workflowQueueEnqueuer = options.workflowQueueEnqueuer;
            if (!workflowQueueEnqueuer) {
              return;
            }
            const redispatchQueueJobId = createRedispatchQueueJobId({
              tenantId: dispatch.tenantId,
              workflowId: dispatch.workflowId,
              runId: dispatch.runId,
              dispatchKind: `reviewed_${dispatch.decision}`,
              actionToken: dispatch.actionToken
            });
            const stagedRedispatch = await acidRepository.stageWorkflowRunRedispatch({
              tenantId: dispatch.tenantId,
              runId: dispatch.runId,
              userId: dispatch.userId,
              idempotencyKey: redispatchQueueJobId
            });
            if (!stagedRedispatch.staged) {
              console.warn("Reviewed harness next-lane redispatch staging did not return an outbox row", {
                runId: dispatch.runId,
                workflowId: dispatch.workflowId,
                cardId: dispatch.cardId,
                decision: dispatch.decision
              });
              return;
            }
            await workflowQueueEnqueuer.enqueueOnce({
              tenantId: dispatch.tenantId,
              userId: dispatch.userId,
              workflowId: dispatch.workflowId,
              runId: dispatch.runId,
              idempotencyKey: redispatchQueueJobId
            });
          }
        }
      : {}),
    onGovernanceHistoryExportReady,
    onPackageBundleExportReady,
    runAtomically: async (work) =>
      transactionRunner.withTransaction(async (transaction) =>
        work(createPostgresHarnessRepository(transaction))
      )
  });
  const handler = createDashboardHttpHandler({
    allowedOrigins: options.env.allowedOrigins,
    dashboardApi,
    rateLimiter: createPostgresFixedWindowRateLimiter({ runner: transactionRunner, limit: 120, windowMs: 60_000 })
  });
  const harnessBoardHandler = createHarnessHttpHandler({
    allowedOrigins: options.env.allowedOrigins,
    listBoardState: harnessBoardApi.listBoardState,
    createTopLevelChildCard: harnessBoardApi.createTopLevelChildCard,
    submitTenantGoal: harnessBoardApi.submitTenantGoal,
    advanceChildCard: harnessBoardApi.advanceChildCard,
    decideProposal: harnessBoardApi.decideProposal,
    completeRun: harnessBoardApi.completeRun,
    reviewPendingAttention: harnessBoardApi.reviewPendingAttention,
    resolvePendingAttention: harnessBoardApi.resolvePendingAttention,
    startFreshCycle: harnessBoardApi.startFreshCycle,
    preflightExportCandidate: harnessBoardApi.preflightExportCandidate,
    dryRunExportCandidate: harnessBoardApi.dryRunExportCandidate,
    exportGovernanceHistoryCandidate: harnessBoardApi.exportGovernanceHistoryCandidate,
    exportPackageBundleCandidate: harnessBoardApi.exportPackageBundleCandidate,
    replayGovernanceHistoryDeliveryCandidate: harnessBoardApi.replayGovernanceHistoryDeliveryCandidate,
    replayPackageBundleDeliveryCandidate: harnessBoardApi.replayPackageBundleDeliveryCandidate,
    rateLimiter: createPostgresFixedWindowRateLimiter({ runner: transactionRunner, limit: 120, windowMs: 60_000 })
  });
  const operatorHttpHandler =
    options.operatorHttpHandler ??
    createOperatorHttpHandler({
      allowedOrigins: options.env.allowedOrigins,
      authenticate: options.auth.authenticate,
      operatorService: createOperatorService(createPostgresOperatorDependencies(queryClient, audit)),
      rateLimiter: createPostgresFixedWindowRateLimiter({ runner: transactionRunner, limit: 60, windowMs: 60_000 })
    });
  const healthHandler = createHealthHttpHandler({
    allowedOrigins: options.env.allowedOrigins,
    readinessCheck: () => checkDatabaseReadiness(pool)
  });
  const storageOAuthHandler = storageOAuth
    ? createStorageOAuthHttpHandler({
        allowedOrigins: options.env.allowedOrigins,
        authenticate: options.auth.authenticate,
        requireTenantMember: repositories.requireTenantMember,
        storageOAuth,
        rateLimiter: createPostgresFixedWindowRateLimiter({ runner: transactionRunner, limit: 60, windowMs: 60_000 })
      })
    : undefined;
  const appShellHandler = options.env.webAppEntryUrl
    ? createAppShellHandler({
        dashboardApi,
        webAppEntryUrl: options.env.webAppEntryUrl,
        ...(options.env.webAppStylesheetUrl ? { webAppStylesheetUrl: options.env.webAppStylesheetUrl } : {})
      })
    : undefined;
  const factoryPackageInstallApi = createFactoryPackageInstallApi({
    authenticate: options.auth.authenticate,
    requireTenantMember: repositories.requireTenantMember,
    resolveTenantPackageInstallRole: createPostgresTenantPackageInstallRoleResolver(queryClient),
    loadBlueprintPackage: createDemoPackageBlueprintLoader(),
    entitlements: allowAllPackageInstallEntitlements,
    repository: createPostgresFactoryPackageInstallRepository(queryClient),
    auditSink: createDurableFactoryPackageInstallAuditSink(queryClient)
  });
  const factoryPackageInstallHandler = createFactoryPackageInstallHttpHandler({
    allowedOrigins: options.env.allowedOrigins,
    packageInstallApi: factoryPackageInstallApi,
    rateLimiter: createPostgresFixedWindowRateLimiter({ runner: transactionRunner, limit: 60, windowMs: 60_000 })
  });
  const factoryRunApprovalApi = createFactoryRunApprovalApi({
    authenticate: options.auth.authenticate,
    requireTenantMember: repositories.requireTenantMember,
    repository: createPostgresFactoryRunApprovalRepository(queryClient),
    auditSink: createDurableFactoryRunApprovalAuditSink(queryClient)
  });
  const factoryRunApprovalHandler = createFactoryRunApprovalHttpHandler({
    allowedOrigins: options.env.allowedOrigins,
    runApprovalApi: factoryRunApprovalApi,
    rateLimiter: createPostgresFixedWindowRateLimiter({ runner: transactionRunner, limit: 60, windowMs: 60_000 })
  });
  const factoryRunExportApi = createFactoryRunExportApi({
    authenticate: options.auth.authenticate,
    requireTenantMember: repositories.requireTenantMember,
    deliverableRepository: createPostgresFactoryRunDeliverableRepository(queryClient),
    approvalRepository: createPostgresFactoryRunApprovalRepository(queryClient)
  });
  const factoryRunExportHandler = createFactoryRunExportHttpHandler({
    allowedOrigins: options.env.allowedOrigins,
    runExportApi: factoryRunExportApi,
    rateLimiter: createPostgresFixedWindowRateLimiter({ runner: transactionRunner, limit: 60, windowMs: 60_000 })
  });
  const runtimeHandler = async (request: DashboardHttpRequest): Promise<DashboardHttpResponse> => {
    if (request.path === "/health" || request.path === "/api/health") {
      return healthHandler(request);
    }
    if (request.path.startsWith("/api/storage/oauth/")) {
      if (!storageOAuthHandler) {
        return createStorageOAuthUnavailableResponse(request, options.env.allowedOrigins);
      }
      return storageOAuthHandler(request);
    }
    if (request.path.startsWith("/api/harness/")) {
      return harnessBoardHandler(request);
    }
    if (request.path.startsWith("/api/operator/")) {
      return operatorHttpHandler(request);
    }
    if (request.path.startsWith("/api/factory/package-installs")) {
      return factoryPackageInstallHandler(request);
    }
    if (request.path.startsWith("/api/factory/runs/") && request.path.endsWith("/export")) {
      return factoryRunExportHandler(request);
    }
    if (request.path.startsWith("/api/factory/runs/")) {
      return factoryRunApprovalHandler(request);
    }
    if (appShellHandler && !request.path.startsWith("/api/")) {
      return appShellHandler(request);
    }
    return handler(request);
  };

  return {
    server: createServer(createNodeRequestListener(runtimeHandler, options.env.allowedOrigins)),
    registerProviderCredential,
    rotateProviderCredential,
    revokeProviderCredential,
    storageOAuth,
    startWorkers: () => outboxPump?.start(),
    close: async () => {
      outboxPump?.stop();
      await pool.end();
    }
  };
}

function createStorageOAuthUnavailableResponse(
  request: DashboardHttpRequest,
  allowedOrigins: readonly string[]
): DashboardHttpResponse {
  const securityHeaders = createSecurityHeaders();
  let corsHeaders: Record<string, string>;
  try {
    corsHeaders =
      request.path.endsWith("/callback") && !request.headers.origin
        ? {}
        : assertAllowedOrigin(request.headers.origin, allowedOrigins);
  } catch {
    return { status: 403, headers: securityHeaders, body: { code: "request_rejected" } };
  }

  return {
    status: 503,
    headers: { ...securityHeaders, ...corsHeaders },
    body: { code: "storage_oauth_unavailable" }
  };
}

function createAdapterErrorResponse(
  request: IncomingMessage,
  allowedOrigins: readonly string[],
  status: 400 | 413 | 500,
  body: { code: string }
): DashboardHttpResponse {
  const securityHeaders = createSecurityHeaders();
  let corsHeaders: Record<string, string> = {};
  try {
    const origin = readHeader(request, "origin");
    corsHeaders = origin ? assertAllowedOrigin(origin, allowedOrigins) : {};
  } catch {
    // Invalid origins fall back to a headerless adapter error response.
  }

  return {
    status,
    headers: { "content-type": "application/json", ...securityHeaders, ...corsHeaders },
    body
  };
}

async function checkDatabaseReadiness(pool: { query(sql: string, values: readonly unknown[]): Promise<{ rows: unknown[] }> }) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      pool.query("select 1", []),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("health_readiness_timeout")), 2_000);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export function createNodeRequestListener(
  handler: (request: DashboardHttpRequest) => Promise<DashboardHttpResponse>,
  allowedOrigins: readonly string[] = []
) {
  return (request: IncomingMessage, response: ServerResponse) => {
    handleNodeRequest(handler, request, response, allowedOrigins).catch(() => {
      const errorResponse = createAdapterErrorResponse(request, allowedOrigins, 500, { code: "service_unavailable" });
      response.writeHead(errorResponse.status, errorResponse.headers);
      response.end(JSON.stringify(errorResponse.body));
    });
  };
}

async function handleNodeRequest(
  handler: (request: DashboardHttpRequest) => Promise<DashboardHttpResponse>,
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: readonly string[] = []
) {
  const url = new URL(request.url ?? "/", "http://wealthfactory.local");
  const maxBodyBytes = resolveMaxBodyBytes(url.pathname);
  const requestBody = await readRequestBody(request, maxBodyBytes);
  if (requestBody instanceof Error) {
    const rejection = createAdapterErrorResponse(request, allowedOrigins, 413, { code: "request_rejected" });
    response.writeHead(rejection.status, rejection.headers);
    response.end(JSON.stringify(rejection.body));
    return;
  }
  const parsedBody = parseRequestBody(request, requestBody.bodyText);
  if (parsedBody instanceof Error) {
    const invalidRequest = createAdapterErrorResponse(request, allowedOrigins, 400, { code: "invalid_request" });
    response.writeHead(invalidRequest.status, invalidRequest.headers);
    response.end(JSON.stringify(invalidRequest.body));
    return;
  }
  const result = await handler({
    method: request.method ?? "GET",
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    ...(parsedBody !== undefined ? { body: parsedBody } : {}),
    headers: normalizeHeaders(request),
    bodyByteLength: requestBody.bodyByteLength,
    ip: readClientIp(request)
  });

  const contentType = result.headers["content-type"] ?? "application/json";
  response.writeHead(result.status, { "content-type": contentType, ...result.headers });
  response.end(result.body === null ? "" : typeof result.body === "string" ? result.body : JSON.stringify(result.body));
}

function normalizeHeaders(request: IncomingMessage): Record<string, string | undefined> {
  return {
    authorization: readHeader(request, "authorization"),
    cookie: readHeader(request, "cookie"),
    host: readHeader(request, "host"),
    origin: readHeader(request, "origin"),
    referer: readHeader(request, "referer"),
    "sec-fetch-site": readHeader(request, "sec-fetch-site"),
    "x-forwarded-proto": readHeader(request, "x-forwarded-proto")
  };
}

async function readRequestBody(
  request: IncomingMessage,
  maxBodyBytes: number
): Promise<{ bodyText: string; bodyByteLength: number } | Error> {
  const chunks: Buffer[] = [];
  let bodyByteLength = 0;

  return await new Promise<{ bodyText: string; bodyByteLength: number } | Error>((resolve, reject) => {
    request.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      bodyByteLength += buffer.byteLength;
      if (bodyByteLength > maxBodyBytes) {
        request.removeAllListeners("data");
        request.removeAllListeners("end");
        request.resume();
        resolve(new Error("request_too_large"));
        return;
      }

      chunks.push(buffer);
    });
    request.on("end", () => {
      resolve({ bodyText: Buffer.concat(chunks).toString("utf8"), bodyByteLength });
    });
    request.on("error", reject);
  });
}

function parseRequestBody(request: IncomingMessage, bodyText: string): unknown {
  if (bodyText.length === 0) {
    return undefined;
  }

  const contentType = readHeader(request, "content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return undefined;
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    return new Error("invalid_json");
  }
}

function readHeader(request: IncomingMessage, key: string): string | undefined {
  const value = request.headers[key];
  return Array.isArray(value) ? value[0] : value;
}

function readClientIp(request: IncomingMessage): string {
  const socketAddress = request.socket.remoteAddress || "unknown";
  const forwardedFor = readHeader(request, "x-forwarded-for");
  if (forwardedFor && isTrustedProxyAddress(socketAddress)) {
    const forwardedClientIp = forwardedFor
      .split(",")
      .map((entry) => entry.trim())
      .find(Boolean);
    if (forwardedClientIp) {
      return forwardedClientIp;
    }
  }

  return socketAddress;
}

function resolveMaxBodyBytes(pathname: string): number {
  if (pathname === "/api/health") {
    return 8_192;
  }

  return 16_384;
}

function isTrustedProxyAddress(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}
