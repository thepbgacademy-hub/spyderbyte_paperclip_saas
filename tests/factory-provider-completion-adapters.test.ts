import { describe, expect, it } from "vitest";

import { createFactoryProviderAdapters } from "../src/factory/providers/provider-adapters.js";
import type { ProviderHttpRequest, ProviderHttpResponse } from "../src/factory/providers/provider-types.js";

describe("factory provider completion adapters", () => {
  it.each([
    {
      providerKey: "openai",
      model: "gpt-4.1",
      expectedUrl: "https://api.openai.com/v1/responses",
      response: {
        status: 200,
        providerRequestId: "openai-request-1",
        body: {
          output_text: "OpenAI output",
          usage: { input_tokens: 100, output_tokens: 25 }
        }
      },
      expectedText: "OpenAI output",
      expectedCost: 0.0004
    },
    {
      providerKey: "anthropic",
      model: "claude-sonnet-4",
      expectedUrl: "https://api.anthropic.com/v1/messages",
      response: {
        status: 200,
        providerRequestId: "anthropic-request-1",
        body: {
          content: [{ type: "text", text: "Anthropic output" }],
          usage: { input_tokens: 100, output_tokens: 25 }
        }
      },
      expectedText: "Anthropic output",
      expectedCost: 0.000675
    },
    {
      providerKey: "openrouter",
      model: "openrouter/auto",
      expectedUrl: "https://openrouter.ai/api/v1/chat/completions",
      response: {
        status: 200,
        providerRequestId: "openrouter-request-1",
        body: {
          choices: [{ message: { content: "OpenRouter output" } }],
          usage: { prompt_tokens: 100, completion_tokens: 25 }
        }
      },
      expectedText: "OpenRouter output",
      expectedCost: 0.0004
    },
    {
      providerKey: "google",
      model: "gemini-2.5-pro",
      expectedUrl: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent",
      response: {
        status: 200,
        providerRequestId: "google-request-1",
        body: {
          candidates: [{ content: { parts: [{ text: "Google output" }] } }],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 25 }
        }
      },
      expectedText: "Google output",
      expectedCost: 0.000375
    },
    {
      providerKey: "xai",
      model: "grok-3",
      expectedUrl: "https://api.x.ai/v1/chat/completions",
      response: {
        status: 200,
        providerRequestId: "xai-request-1",
        body: {
          choices: [{ message: { content: "xAI output" } }],
          usage: { prompt_tokens: 100, completion_tokens: 25 }
        }
      },
      expectedText: "xAI output",
      expectedCost: 0.000675
    }
  ] as const)("normalizes $providerKey completion requests and responses", async (caseData) => {
    const requests: ProviderHttpRequest[] = [];
    const adapters = createFactoryProviderAdapters({
      request: async (request) => {
        requests.push(request);
        return caseData.response;
      }
    });

    const result = await adapters[caseData.providerKey].complete(
      {
        model: caseData.model,
        system: "Stay inside the blueprint.",
        messages: [
          { role: "user", content: "Draft a station output." },
          { role: "assistant", content: "I need tool data." },
          { role: "tool", toolCallId: "tool-call-1", toolName: "deliverable_write", content: "{\"result\":\"ready\"}" }
        ],
        tools: [
          {
            name: "deliverable_write",
            description: "Write a deliverable.",
            inputSchema: { type: "object", properties: { title: { type: "string" } } }
          }
        ],
        responseFormat: {
          type: "json_schema",
          schemaName: "station_output",
          schema: { type: "object", properties: { title: { type: "string" } } }
        }
      },
      `${caseData.providerKey}-secret`
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      providerKey: caseData.providerKey,
      operation: "complete",
      method: "POST",
      url: caseData.expectedUrl
    });
    expectProviderNativeBody(caseData.providerKey, requests[0]?.body);
    expect(result).toEqual({
      text: caseData.expectedText,
      providerRequestId: `${caseData.providerKey}-request-1`,
      usage: { inputTokens: 100, outputTokens: 25 },
      costUsd: caseData.expectedCost
    });
  });

  it.each([
    { status: 401, errorClass: "auth", message: "Power Source credential was rejected by the provider." },
    { status: 429, errorClass: "rate_limit", message: "Provider rate limit reached; the run can retry later." },
    { status: 400, errorClass: "request_invalid", message: "Provider request shape was rejected before generation; check the adapter mapping." },
    { status: 422, errorClass: "content_refusal", message: "Provider blocked this station output and needs customer-safe guidance." },
    { status: 503, errorClass: "provider_outage", message: "Provider appears unavailable; the run can pause and retry later." }
  ] as const)("normalizes completion error $status without leaking raw provider bodies", async ({ status, message }) => {
    const adapters = createFactoryProviderAdapters({
      request: async (): Promise<ProviderHttpResponse> => ({
        status,
        body: { error: { message: "raw body contains sk-live-secret and stack trace" } }
      })
    });

    await expect(
      adapters.openai.complete(
        {
          model: "gpt-4.1",
          messages: [{ role: "user", content: "Draft." }]
        },
        "sk-live-secret"
      )
    ).rejects.toThrow(message);
  });
});

function expectProviderNativeBody(providerKey: string, body: unknown): void {
  const payload = body as {
    input?: unknown[];
    messages?: Array<Record<string, unknown>>;
    contents?: Array<Record<string, unknown>>;
    tools?: Array<Record<string, unknown>>;
    text?: { format?: Record<string, unknown> };
    output_config?: { format?: Record<string, unknown> };
    generationConfig?: Record<string, unknown>;
    response_format?: { json_schema?: Record<string, unknown> };
  };

  if (providerKey === "openai") {
    expect(payload.input).toContainEqual({
      type: "function_call_output",
      call_id: "tool-call-1",
      output: "{\"result\":\"ready\"}"
    });
    expect(payload.tools?.[0]).toMatchObject({ type: "function", name: "deliverable_write" });
    expect(payload.text?.format).toMatchObject({ name: "station_output", strict: true });
    return;
  }

  if (providerKey === "anthropic") {
    const toolResultTurn = payload.messages?.find((message) => Array.isArray(message.content));
    expect(toolResultTurn).toMatchObject({ role: "user" });
    expect(toolResultTurn?.content).toContainEqual({
      type: "tool_result",
      tool_use_id: "tool-call-1",
      content: "{\"result\":\"ready\"}"
    });
    expect(payload.tools?.[0]).toMatchObject({ name: "deliverable_write" });
    expect(payload.output_config?.format).toMatchObject({ type: "json_schema", schema: { type: "object" } });
    expect(JSON.stringify(body)).not.toContain("response_format");
    return;
  }

  if (providerKey === "google") {
    const functionResponseTurn = payload.contents?.find((content) =>
      JSON.stringify(content).includes("functionResponse")
    );
    expect(functionResponseTurn).toMatchObject({
      role: "user",
      parts: [
        {
          functionResponse: {
            name: "deliverable_write",
            id: "tool-call-1",
            response: { result: "ready" }
          }
        }
      ]
    });
    expect(payload.tools?.[0]).toMatchObject({
      functionDeclarations: [{ name: "deliverable_write" }]
    });
    expect(payload.generationConfig).toMatchObject({
      responseMimeType: "application/json",
      responseSchema: { type: "object" }
    });
    expect(JSON.stringify(body)).not.toContain("tool_result:");
    return;
  }

  expect(payload.messages).toContainEqual({ role: "system", content: "Stay inside the blueprint." });
  expect(payload.messages).toContainEqual({
    role: "tool",
    content: "{\"result\":\"ready\"}",
    tool_call_id: "tool-call-1"
  });
  expect(payload.tools?.[0]).toMatchObject({ type: "function", function: { name: "deliverable_write" } });
  expect(payload.response_format?.json_schema).toMatchObject({ name: "station_output", strict: true });
}
