import type {
  CompletionMessage,
  CompletionRequest,
  CompletionResult,
  FactoryProviderKey,
  ProviderHttpRequest,
  ProviderHttpResponse,
  TokenUsage
} from "./provider-types.js";

export function buildProviderCompletionRequest(params: {
  providerKey: FactoryProviderKey;
  request: CompletionRequest;
  headers: Record<string, string>;
}): ProviderHttpRequest {
  return {
    providerKey: params.providerKey,
    operation: "complete",
    url: completionUrlFor(params.providerKey, params.request.model),
    method: "POST",
    headers: params.headers,
    body: completionBodyFor(params.providerKey, params.request)
  };
}

export function normalizeProviderCompletionResponse(
  providerKey: FactoryProviderKey,
  response: ProviderHttpResponse
): Omit<CompletionResult, "costUsd"> {
  const body = asRecord(response.body);

  if (providerKey === "openai") {
    return {
      text: stringFrom(body.output_text),
      providerRequestId: response.providerRequestId ?? stringOrNull(body.id),
      usage: usageFromOpenAiShape(asRecord(body.usage))
    };
  }

  if (providerKey === "anthropic") {
    return {
      text: textFromAnthropicContent(body.content),
      providerRequestId: response.providerRequestId ?? stringOrNull(body.id),
      usage: usageFromInputOutputShape(asRecord(body.usage))
    };
  }

  if (providerKey === "google") {
    return {
      text: textFromGoogleCandidates(body.candidates),
      providerRequestId: response.providerRequestId ?? stringOrNull(body.responseId),
      usage: usageFromGoogleShape(asRecord(body.usageMetadata))
    };
  }

  return {
    text: textFromChatChoices(body.choices),
    providerRequestId: response.providerRequestId ?? stringOrNull(body.id),
    usage: usageFromChatShape(asRecord(body.usage))
  };
}

function completionUrlFor(providerKey: FactoryProviderKey, model: string): string {
  if (providerKey === "openai") {
    return "https://api.openai.com/v1/responses";
  }

  if (providerKey === "anthropic") {
    return "https://api.anthropic.com/v1/messages";
  }

  if (providerKey === "openrouter") {
    return "https://openrouter.ai/api/v1/chat/completions";
  }

  if (providerKey === "google") {
    return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  }

  return "https://api.x.ai/v1/chat/completions";
}

function completionBodyFor(providerKey: FactoryProviderKey, request: CompletionRequest): unknown {
  if (providerKey === "openai") {
    return {
      model: request.model,
      instructions: request.system,
      input: request.messages.map(openAiInputMessage),
      tools: request.tools?.map(openAiTool),
      text: request.responseFormat ? { format: jsonSchemaFormat(request.responseFormat) } : undefined
    };
  }

  if (providerKey === "anthropic") {
    return {
      model: request.model,
      system: request.system,
      max_tokens: 4_096,
      messages: request.messages.map(anthropicMessage),
      tools: request.tools?.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema
      })),
      output_config: request.responseFormat
        ? {
            format: {
              type: "json_schema",
              schema: request.responseFormat.schema
            }
          }
        : undefined
    };
  }

  if (providerKey === "google") {
    return {
      systemInstruction: request.system ? { parts: [{ text: request.system }] } : undefined,
      contents: request.messages.map(googleContent),
      tools: request.tools?.map((tool) => ({
        functionDeclarations: [
          {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema
          }
        ]
      })),
      generationConfig: request.responseFormat
        ? {
            responseMimeType: "application/json",
            responseSchema: request.responseFormat.schema
          }
        : undefined
    };
  }

  return {
    model: request.model,
    messages: chatMessages(request),
    tools: request.tools?.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    })),
    response_format: request.responseFormat
      ? {
          type: "json_schema",
          json_schema: jsonSchemaFormat(request.responseFormat)
        }
      : undefined
  };
}

function openAiInputMessage(message: CompletionMessage): Record<string, unknown> {
  if (message.role === "tool") {
    return {
      type: "function_call_output",
      call_id: message.toolCallId,
      output: message.content
    };
  }

  return {
    role: message.role,
    content: message.content
  };
}

function anthropicMessage(message: CompletionMessage): Record<string, unknown> {
  if (message.role === "tool") {
    return {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: message.toolCallId,
          content: message.content
        }
      ]
    };
  }

  return {
    role: message.role,
    content: message.content
  };
}

function googleContent(message: CompletionMessage): Record<string, unknown> {
  if (message.role === "tool") {
    return {
      role: "user",
      parts: [
        {
          functionResponse: {
            name: message.toolName ?? message.toolCallId ?? "tool_result",
            id: message.toolCallId,
            response: parseToolResultContent(message.content)
          }
        }
      ]
    };
  }

  return {
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }]
  };
}

function chatMessages(request: CompletionRequest): Record<string, unknown>[] {
  const messages: Record<string, unknown>[] = [];
  if (request.system) {
    messages.push({ role: "system", content: request.system });
  }

  for (const message of request.messages) {
    messages.push({
      role: message.role,
      content: message.content,
      tool_call_id: message.toolCallId
    });
  }

  return messages;
}

function openAiTool(tool: NonNullable<CompletionRequest["tools"]>[number]): Record<string, unknown> {
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema
  };
}

function jsonSchemaFormat(format: NonNullable<CompletionRequest["responseFormat"]>): Record<string, unknown> {
  return {
    name: format.schemaName,
    schema: format.schema,
    strict: true
  };
}

function parseToolResultContent(content: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through to the string wrapper below.
  }

  return { result: content };
}

function usageFromOpenAiShape(usage: Record<string, unknown>): TokenUsage {
  return {
    inputTokens: numberFrom(usage.input_tokens),
    outputTokens: numberFrom(usage.output_tokens)
  };
}

function usageFromInputOutputShape(usage: Record<string, unknown>): TokenUsage {
  return {
    inputTokens: numberFrom(usage.input_tokens),
    outputTokens: numberFrom(usage.output_tokens)
  };
}

function usageFromChatShape(usage: Record<string, unknown>): TokenUsage {
  return {
    inputTokens: numberFrom(usage.prompt_tokens),
    outputTokens: numberFrom(usage.completion_tokens)
  };
}

function usageFromGoogleShape(usage: Record<string, unknown>): TokenUsage {
  return {
    inputTokens: numberFrom(usage.promptTokenCount),
    outputTokens: numberFrom(usage.candidatesTokenCount)
  };
}

function textFromAnthropicContent(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((entry) => asRecord(entry))
    .filter((entry) => entry.type === "text")
    .map((entry) => stringFrom(entry.text))
    .join("");
}

function textFromChatChoices(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  const firstChoice = asRecord(value[0]);
  return stringFrom(asRecord(firstChoice.message).content);
}

function textFromGoogleCandidates(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  const firstCandidate = asRecord(value[0]);
  const parts = asRecord(firstCandidate.content).parts;
  if (Array.isArray(parts)) {
    return parts.map((part: unknown) => stringFrom(asRecord(part).text)).join("");
  }

  return "";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function numberFrom(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function stringFrom(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
