import { describe, expect, it, vi } from "vitest";

import { createPaperclipClient } from "../src/paperclip/client.js";

describe("createPaperclipClient", () => {
  it("checks Paperclip health through the private REST API", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const client = createPaperclipClient({
      baseUrl: "https://paperclip.internal.local",
      serviceToken: "service-token",
      fetchImpl
    });

    await expect(client.healthCheck()).resolves.toEqual({ ok: true });

    expect(fetchImpl).toHaveBeenCalledWith("https://paperclip.internal.local/api/health", {
      method: "GET",
      headers: {
        authorization: "Bearer service-token",
        "content-type": "application/json"
      }
    });
  });

  it("accepts live Paperclip health payloads that report status ok", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: "ok", deploymentMode: "authenticated" }));
    const client = createPaperclipClient({
      baseUrl: "https://paperclip.internal.local",
      serviceToken: "service-token",
      fetchImpl
    });

    await expect(client.healthCheck()).resolves.toEqual({ ok: true });
  });

  it("creates a private run using the mapped Paperclip company id", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "pc-run-1",
        status: "queued"
      })
    );
    const client = createPaperclipClient({
      baseUrl: "https://paperclip.internal.local/",
      serviceToken: "service-token",
      fetchImpl
    });

    await expect(
      client.createRun({
        companyId: "pc-company-1",
        workflowId: "wf-intake",
        spyderbyteRunId: "run-1"
      })
    ).resolves.toEqual({
      paperclipRunId: "pc-run-1",
      status: "queued"
    });

    expect(fetchImpl).toHaveBeenCalledWith("https://paperclip.internal.local/api/companies/pc-company-1/runs", {
      method: "POST",
      headers: {
        authorization: "Bearer service-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        workflowId: "wf-intake",
        externalRunId: "run-1"
      })
    });
  });

  it("forwards resolved provider execution context to the Paperclip run payload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "pc-run-1",
        status: "queued"
      })
    );
    const client = createPaperclipClient({
      baseUrl: "https://paperclip.internal.local/",
      serviceToken: "service-token",
      fetchImpl
    });

    await expect(
      client.createRun({
        companyId: "pc-company-1",
        workflowId: "wf-intake",
        spyderbyteRunId: "run-1",
        providerContext: [
          {
            capability: "text_generation",
            providerKind: "openai_api",
            label: "Primary OpenAI",
            secretRef: "wf_secret_openai",
            metadata: { projectId: "proj_123" },
            secretValues: { apiKey: "sk-openai-secret" }
          }
        ]
      })
    ).resolves.toEqual({
      paperclipRunId: "pc-run-1",
      status: "queued"
    });

    expect(fetchImpl).toHaveBeenCalledWith("https://paperclip.internal.local/api/companies/pc-company-1/runs", {
      method: "POST",
      headers: {
        authorization: "Bearer service-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        workflowId: "wf-intake",
        externalRunId: "run-1",
        providerContext: [
          {
            capability: "text_generation",
            providerKind: "openai_api",
            label: "Primary OpenAI",
            secretRef: "wf_secret_openai",
            metadata: { projectId: "proj_123" },
            secretValues: { apiKey: "sk-openai-secret" }
          }
        ]
      })
    });
  });

  it("translates Paperclip failures into safe internal error codes", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ message: "stack trace with prompt" }, 500));
    const client = createPaperclipClient({
      baseUrl: "https://paperclip.internal.local",
      serviceToken: "service-token",
      fetchImpl
    });

    await expect(client.getRunStatus({ companyId: "pc-company-1", paperclipRunId: "pc-run-1" })).rejects.toMatchObject({
      code: "paperclip_unavailable",
      publicMessage: "service_unavailable"
    });
  });

  it("translates fetch failures into safe internal error codes", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("DNS failure with internal host"));
    const client = createPaperclipClient({
      baseUrl: "https://paperclip.internal.local",
      serviceToken: "service-token",
      fetchImpl
    });

    await expect(client.healthCheck()).rejects.toMatchObject({
      code: "paperclip_unavailable",
      publicMessage: "service_unavailable"
    });
  });

  it("fetches run status through the private REST API", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: "pc-run-1", status: "running" }));
    const client = createPaperclipClient({
      baseUrl: "https://paperclip.internal.local",
      serviceToken: "service-token",
      fetchImpl
    });

    await expect(client.getRunStatus({ companyId: "pc-company-1", paperclipRunId: "pc-run-1" })).resolves.toEqual({
      paperclipRunId: "pc-run-1",
      status: "running"
    });
  });

  it("cancels runs through the private REST API", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: "pc-run-1", status: "cancelled" }));
    const client = createPaperclipClient({
      baseUrl: "https://paperclip.internal.local",
      serviceToken: "service-token",
      fetchImpl
    });

    await expect(client.cancelRun({ companyId: "pc-company-1", paperclipRunId: "pc-run-1" })).resolves.toEqual({
      paperclipRunId: "pc-run-1",
      status: "cancelled"
    });
  });

  it("rejects malformed Paperclip run payloads with safe error codes", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: "pc-run-1", status: "prompt leaked" }));
    const client = createPaperclipClient({
      baseUrl: "https://paperclip.internal.local",
      serviceToken: "service-token",
      fetchImpl
    });

    await expect(client.getRunStatus({ companyId: "pc-company-1", paperclipRunId: "pc-run-1" })).rejects.toMatchObject({
      code: "paperclip_bad_response",
      publicMessage: "workflow_failed"
    });
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
