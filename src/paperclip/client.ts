import type {
  CancelPaperclipRunInput,
  CreatePaperclipRunInput,
  GetPaperclipRunStatusInput,
  PaperclipClient,
  PaperclipHealth,
  PaperclipRunReference,
  PaperclipRunStatus
} from "./types.js";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type PaperclipClientOptions = {
  baseUrl: string;
  serviceToken: string;
  fetchImpl?: FetchLike;
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
      return { ok: readBoolean(body, "ok") };
    },

    async createRun(input: CreatePaperclipRunInput): Promise<PaperclipRunReference> {
      const body = await request(`/api/companies/${encodeURIComponent(input.companyId)}/runs`, {
        method: "POST",
        body: JSON.stringify({
          workflowId: input.workflowId,
          externalRunId: input.spyderbyteRunId
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

function readBoolean(body: unknown, key: string): boolean {
  if (!isRecord(body) || typeof body[key] !== "boolean") {
    throw new PaperclipClientError("paperclip_bad_response", "workflow_failed", "Paperclip returned an invalid health payload");
  }

  return body[key];
}

function isRunStatus(value: unknown): value is PaperclipRunStatus {
  return value === "queued" || value === "running" || value === "completed" || value === "failed" || value === "cancelled";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
