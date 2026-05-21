import { toPaperclipProviderContext, type PaperclipRuntimeProviderContext, type PaperclipRunReference } from "./types.js";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type PaperclipIssueLaunchOptions = {
  baseUrl: string;
  serviceToken?: string;
  resolveServiceToken?(input: {
    companyId: string;
    workflowId: string;
    providerContext: readonly PaperclipRuntimeProviderContext[];
  }): Promise<string> | string;
  resolveLaunchTarget(input: {
    companyId: string;
    workflowId: string;
    providerContext: readonly PaperclipRuntimeProviderContext[];
  }): Promise<{ agentId: string; issueTitle?: string; issueBody?: string }>;
  syncProviderSecretRefs?(input: {
    companyId: string;
    workflowId: string;
    agentId: string;
    providerContext: readonly PaperclipRuntimeProviderContext[];
  }): Promise<{ adapterConfig?: { env?: Record<string, { type: "secret_ref"; secretId: string; version: string | number }> } } | void>;
  fetchImpl?: FetchLike;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  requestRetryAttempts?: number;
  requestRetryDelayMs?: number;
};

export class PaperclipIssueLaunchError extends Error {
  readonly code = "paperclip_issue_launch_failed";
  readonly publicMessage = "workflow_failed";
}

export function createPaperclipIssueLaunchAdapter(options: PaperclipIssueLaunchOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const maxPollAttempts = options.maxPollAttempts ?? 60;
  const requestRetryAttempts = options.requestRetryAttempts ?? 3;
  const requestRetryDelayMs = options.requestRetryDelayMs ?? 250;

  return {
    async launch(input: {
      companyId: string;
      workflowId: string;
      spyderbyteRunId: string;
      providerContext: readonly PaperclipRuntimeProviderContext[];
    }): Promise<PaperclipRunReference> {
      const target = await options.resolveLaunchTarget({
        companyId: input.companyId,
        workflowId: input.workflowId,
        providerContext: input.providerContext
      });
      const serviceToken = await resolveIssueLaunchServiceToken(options, input);
      if (options.syncProviderSecretRefs) {
        const adapterOverrides = await options.syncProviderSecretRefs({
          companyId: input.companyId,
          workflowId: input.workflowId,
          agentId: target.agentId,
          providerContext: input.providerContext
        });
        const created = await requestJson(fetchImpl, `${baseUrl}/api/companies/${encodeURIComponent(input.companyId)}/issues`, {
          method: "POST",
          headers: createHeaders(serviceToken),
          body: JSON.stringify({
            title: target.issueTitle ?? `WF ${input.workflowId}`,
            body: target.issueBody ?? `External run ${input.spyderbyteRunId}`,
            assigneeAgentId: target.agentId,
            ...(adapterOverrides ? { assigneeAdapterOverrides: adapterOverrides } : {}),
            metadata: {
              externalRunId: input.spyderbyteRunId,
              workflowId: input.workflowId,
              providerContext: toPaperclipProviderContext(input.providerContext)
            }
          })
        });
        const issueId = readIssueId(created);
        if (!issueId) {
          throw new PaperclipIssueLaunchError("Paperclip issue creation did not return an identifier");
        }
        return pollForExecutionRunId(fetchImpl, baseUrl, serviceToken, issueId, maxPollAttempts, pollIntervalMs, requestRetryAttempts, requestRetryDelayMs);
      }

      const created = await requestJson(fetchImpl, `${baseUrl}/api/companies/${encodeURIComponent(input.companyId)}/issues`, {
        method: "POST",
        headers: createHeaders(serviceToken),
        body: JSON.stringify({
          title: target.issueTitle ?? `WF ${input.workflowId}`,
          body: target.issueBody ?? `External run ${input.spyderbyteRunId}`,
          assigneeAgentId: target.agentId,
          metadata: {
            externalRunId: input.spyderbyteRunId,
            workflowId: input.workflowId,
            providerContext: toPaperclipProviderContext(input.providerContext)
          }
        })
      });
      const issueId = readIssueId(created);
      if (!issueId) {
        throw new PaperclipIssueLaunchError("Paperclip issue creation did not return an identifier");
      }
      return pollForExecutionRunId(fetchImpl, baseUrl, serviceToken, issueId, maxPollAttempts, pollIntervalMs, requestRetryAttempts, requestRetryDelayMs);
    }
  };
}

async function pollForExecutionRunId(
  fetchImpl: FetchLike,
  baseUrl: string,
  serviceToken: string,
  issueId: string,
  maxPollAttempts: number,
  pollIntervalMs: number,
  requestRetryAttempts: number,
  requestRetryDelayMs: number
): Promise<PaperclipRunReference> {
  for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
    const issue = await requestJson(fetchImpl, `${baseUrl}/api/issues/${encodeURIComponent(issueId)}`, {
      method: "GET",
      headers: createHeaders(serviceToken)
    }, { attempts: requestRetryAttempts, retryDelayMs: requestRetryDelayMs });
    const executionRunId = readExecutionRunId(issue);
    if (executionRunId) {
      return {
        paperclipRunId: executionRunId,
        status: "running"
      };
    }
    await sleep(pollIntervalMs);
  }

  throw new PaperclipIssueLaunchError("Paperclip issue launch did not resolve an execution run id");
}

async function requestJson(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  retryPolicy: { attempts: number; retryDelayMs: number } = { attempts: 1, retryDelayMs: 0 }
): Promise<unknown> {
  for (let attempt = 0; attempt < retryPolicy.attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, init);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new PaperclipIssueLaunchError(`Paperclip issue-launch request failed: ${response.status}`);
      }
      return body;
    } catch (error) {
      if (!shouldRetryIssueLaunchRequest(error) || attempt >= retryPolicy.attempts - 1) {
        throw error;
      }
      await sleep(retryPolicy.retryDelayMs);
    }
  }
  throw new PaperclipIssueLaunchError("Paperclip issue-launch request failed");
}

function createHeaders(serviceToken: string): HeadersInit {
  return {
    authorization: `Bearer ${serviceToken}`,
    "content-type": "application/json"
  };
}

function readIssueId(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const record = body as Record<string, unknown>;
  return typeof record.id === "string" ? record.id : typeof record.identifier === "string" ? record.identifier : null;
}

function readExecutionRunId(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const record = body as Record<string, unknown>;
  return typeof record.executionRunId === "string"
    ? record.executionRunId
    : typeof record.execution_run_id === "string"
      ? record.execution_run_id
      : null;
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function shouldRetryIssueLaunchRequest(error: unknown): boolean {
  return error instanceof TypeError;
}

async function resolveIssueLaunchServiceToken(
  options: PaperclipIssueLaunchOptions,
  input: {
    companyId: string;
    workflowId: string;
    spyderbyteRunId: string;
    providerContext: readonly PaperclipRuntimeProviderContext[];
  }
): Promise<string> {
  if (options.resolveServiceToken) {
    const resolved = await options.resolveServiceToken({
      companyId: input.companyId,
      workflowId: input.workflowId,
      providerContext: input.providerContext
    });
    if (typeof resolved === "string" && resolved.trim().length > 0) {
      return resolved.trim();
    }
  }
  if (typeof options.serviceToken === "string" && options.serviceToken.trim().length > 0) {
    return options.serviceToken.trim();
  }
  throw new PaperclipIssueLaunchError(`Missing Paperclip issue-launch service token for company ${input.companyId}`);
}
