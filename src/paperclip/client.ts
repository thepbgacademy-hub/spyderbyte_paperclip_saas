import {
  type PaperclipRuntimeProviderContext,
  toPaperclipProviderContext,
  type CancelPaperclipRunInput,
  type CreatePaperclipRunInput,
  type GetPaperclipRunStatusInput,
  type PaperclipClient,
  type PaperclipHealth,
  type PaperclipRunReference,
  type PaperclipRunStatus
} from "./types.js";
import { createPaperclipIssueLaunchAdapter } from "./issue-launch.js";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type PaperclipClientOptions = {
  baseUrl: string;
  serviceToken: string;
  fetchImpl?: FetchLike;
  launchMode?: "runs" | "issues";
  issueLaunch?: {
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
    }): Promise<void>;
    pollIntervalMs?: number;
    maxPollAttempts?: number;
  };
};

export class PaperclipClientError extends Error {
  constructor(
    readonly code: "paperclip_unavailable" | "paperclip_bad_response",
    readonly publicMessage: "service_unavailable" | "workflow_failed",
    message: string
  ) {
    super(message);
    this.name = "PaperclipClientError";
  }
}

export function createPaperclipClient(options: PaperclipClientOptions): PaperclipClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const issueLaunchAdapter =
    options.launchMode === "issues" && options.issueLaunch
      ? createPaperclipIssueLaunchAdapter({
          baseUrl,
          serviceToken: options.serviceToken,
          fetchImpl,
          resolveLaunchTarget: options.issueLaunch.resolveLaunchTarget,
          ...(options.issueLaunch.syncProviderSecretRefs ? { syncProviderSecretRefs: options.issueLaunch.syncProviderSecretRefs } : {}),
          ...(options.issueLaunch.pollIntervalMs ? { pollIntervalMs: options.issueLaunch.pollIntervalMs } : {}),
          ...(options.issueLaunch.maxPollAttempts ? { maxPollAttempts: options.issueLaunch.maxPollAttempts } : {})
        })
      : null;

  async function request(path: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${options.serviceToken}`,
          "content-type": "application/json",
          ...init.headers
        }
      });
    } catch {
      throw new PaperclipClientError("paperclip_unavailable", "service_unavailable", "Paperclip request failed before receiving a response");
    }

    const body = await readJson(response);
    if (!response.ok) {
      throw new PaperclipClientError("paperclip_unavailable", "service_unavailable", `Paperclip request failed: ${response.status}`);
    }

    return body;
  }

  return {
    async healthCheck(): Promise<PaperclipHealth> {
      const body = await request("/api/health", { method: "GET" });
      return { ok: readHealth(body) };
    },

    async createRun(input: CreatePaperclipRunInput): Promise<PaperclipRunReference> {
      if (issueLaunchAdapter) {
        return issueLaunchAdapter.launch({
          companyId: input.companyId,
          workflowId: input.workflowId,
          spyderbyteRunId: input.spyderbyteRunId,
          providerContext: input.runtimeProviderContext ?? input.providerContext ?? []
        });
      }

      const body = await request(`/api/companies/${encodeURIComponent(input.companyId)}/runs`, {
        method: "POST",
        body: JSON.stringify({
          workflowId: input.workflowId,
          externalRunId: input.spyderbyteRunId,
          ...(input.providerContext ? { providerContext: toPaperclipProviderContext(input.providerContext) } : {})
        })
      });

      return toRunReference(body);
    },

    async getRunStatus(input: GetPaperclipRunStatusInput): Promise<PaperclipRunReference> {
      const body = await request(`/api/companies/${encodeURIComponent(input.companyId)}/runs/${encodeURIComponent(input.paperclipRunId)}`, {
        method: "GET"
      });

      return toRunReference(body);
    },

    async cancelRun(input: CancelPaperclipRunInput): Promise<PaperclipRunReference> {
      const body = await request(`/api/companies/${encodeURIComponent(input.companyId)}/runs/${encodeURIComponent(input.paperclipRunId)}/cancel`, {
        method: "POST"
      });

      return toRunReference(body);
    }
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function toRunReference(body: unknown): PaperclipRunReference {
  if (!isRecord(body) || typeof body.id !== "string" || !isRunStatus(body.status)) {
    throw new PaperclipClientError("paperclip_bad_response", "workflow_failed", "Paperclip returned an invalid run payload");
  }

  return {
    paperclipRunId: body.id,
    status: body.status
  };
}

function readHealth(body: unknown): boolean {
  if (!isRecord(body)) {
    throw new PaperclipClientError("paperclip_bad_response", "workflow_failed", "Paperclip returned an invalid health payload");
  }

  if (typeof body.ok === "boolean") {
    return body.ok;
  }

  if (body.status === "ok") {
    return true;
  }

  throw new PaperclipClientError("paperclip_bad_response", "workflow_failed", "Paperclip returned an invalid health payload");
}

function isRunStatus(value: unknown): value is PaperclipRunStatus {
  return value === "queued" || value === "running" || value === "completed" || value === "failed" || value === "cancelled";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
