import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { resolveProviderBaseUrl } from "./intelligenceModels";
import type {
  IntelligenceProviderAdapterPayload,
  IntelligenceProviderAdapterResult,
  IntelligenceProviderAdapterStreamChunk,
} from "./tuffIntelligenceProviderAdapters";

const OPENAI_CHAT_SUFFIXES = ["/chat/completions", "/v1/chat/completions"];
const OPENAI_VERSION_SUFFIXES = ["/v1", "/v1/"];
function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
function numberFrom(...candidates: unknown[]): number {
  for (const item of candidates) {
    if (typeof item === "number" && Number.isFinite(item)) return item;
  }
  return 0;
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value.map((item) => extractTextItem(item)).join("");
  const record = asRecord(value);
  return (
    extractText(record.content) ||
    extractText(record.reasoning_content) ||
    extractText(record.reasoning) ||
    extractText(record.analysis) ||
    extractText(record.text)
  );
}

function extractTextItem(value: unknown): string {
  if (typeof value === "string") return value;
  return value && typeof value === "object" && "text" in value
    ? extractText((value as { text?: unknown }).text)
    : "";
}
function extractUsageInfo(raw: Record<string, unknown>) {
  const usageMetadata = asRecord(raw.usage_metadata);
  const responseMetadata = asRecord(raw.response_metadata);
  const tokenUsage = asRecord(responseMetadata.tokenUsage);
  const promptTokens = numberFrom(
    usageMetadata.input_tokens,
    usageMetadata.prompt_tokens,
    usageMetadata.promptTokens,
    tokenUsage.promptTokens,
    tokenUsage.prompt_tokens,
  );
  const completionTokens = numberFrom(
    usageMetadata.output_tokens,
    usageMetadata.completion_tokens,
    usageMetadata.completionTokens,
    tokenUsage.completionTokens,
    tokenUsage.completion_tokens,
  );
  const totalTokens = numberFrom(
    usageMetadata.total_tokens,
    usageMetadata.totalTokens,
    tokenUsage.totalTokens,
    tokenUsage.total_tokens,
    promptTokens + completionTokens,
  );
  return { promptTokens, completionTokens, totalTokens };
}

function toLangChainMessages(
  messages: IntelligenceProviderAdapterPayload["messages"],
): BaseMessage[] {
  return messages.map((message) => {
    if (message.role === "system") return new SystemMessage(message.content);
    if (message.role === "assistant") return new AIMessage(message.content);
    return new HumanMessage(message.content);
  });
}

function trimBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function stripOpenAiEndpointSuffix(value: string): string {
  const trimmed = trimBaseUrl(value);
  const lower = trimmed.toLowerCase();
  const suffix = OPENAI_CHAT_SUFFIXES.find((item) => lower.endsWith(item));
  return suffix ? trimBaseUrl(trimmed.slice(0, -suffix.length)) : trimmed;
}

function normalizeOpenAiBaseUrl(baseUrl: string): string {
  const trimmed = stripOpenAiEndpointSuffix(baseUrl);
  const lower = trimmed.toLowerCase();
  return OPENAI_VERSION_SUFFIXES.some((suffix) => lower.endsWith(suffix))
    ? trimmed
    : `${trimmed}/v1`;
}

function normalizeAnthropicBaseUrl(baseUrl: string): string {
  const trimmed = trimBaseUrl(baseUrl);
  return trimmed.toLowerCase().endsWith("/v1") ? trimmed.slice(0, -3) : trimmed;
}
function createRequestError(
  message: string,
  endpoint: string,
  response: unknown,
): Error {
  const error = new Error(message) as Error & Record<string, unknown>;
  error.endpoint = endpoint;
  error.status = 502;
  error.responseSnippet = JSON.stringify(asRecord(response)).slice(0, 400);
  return error;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Request timeout after ${timeoutMs}ms`)),
        timeoutMs,
      );
    }),
  ]);
}

interface NormalizeResponseMeta {
  payload: IntelligenceProviderAdapterPayload;
  traceId: string;
  startedAt: number;
  endpoint: string;
  resultEndpoint: string;
  emptyMessage: string;
}

function normalizeResponse(
  response: unknown,
  meta: NormalizeResponseMeta,
): IntelligenceProviderAdapterResult {
  const content = extractText(asRecord(response).content).trim();
  if (!content)
    throw createRequestError(meta.emptyMessage, meta.endpoint, response);
  return {
    content,
    model: meta.payload.context.model,
    traceId: meta.traceId,
    endpoint: meta.resultEndpoint,
    status: 200,
    latency: Date.now() - meta.startedAt,
    usage: extractUsageInfo(asRecord(response)),
  };
}

function mergeUsage(
  current: IntelligenceProviderAdapterStreamChunk["usage"],
  next: IntelligenceProviderAdapterStreamChunk["usage"],
): IntelligenceProviderAdapterStreamChunk["usage"] {
  if (!next) return current;
  if (!current) return next;
  return {
    promptTokens: Math.max(current.promptTokens, next.promptTokens),
    completionTokens: Math.max(current.completionTokens, next.completionTokens),
    totalTokens: Math.max(current.totalTokens, next.totalTokens),
  };
}

async function* streamProviderResponse(
  payload: IntelligenceProviderAdapterPayload,
  streamFactory: (
    messages: BaseMessage[],
    signal: AbortSignal,
  ) => Promise<AsyncIterable<unknown>>,
  meta: { endpoint: string; resultEndpoint: string; emptyMessage: string },
): AsyncGenerator<IntelligenceProviderAdapterStreamChunk> {
  const traceId = createId("trace");
  const startedAt = Date.now();
  const abortController = new AbortController();
  const abortFromCaller = () => abortController.abort(payload.signal?.reason);
  if (payload.signal?.aborted) abortFromCaller();
  else
    payload.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(
    () =>
      abortController.abort(
        new Error(`Request timeout after ${payload.context.timeoutMs}ms`),
      ),
    payload.context.timeoutMs,
  );
  let content = "";
  let usage: IntelligenceProviderAdapterStreamChunk["usage"];

  try {
    const responseStream = await streamFactory(
      toLangChainMessages(payload.messages),
      abortController.signal,
    );
    for await (const chunk of responseStream) {
      const record = asRecord(chunk);
      const delta = extractText(record.content);
      usage = mergeUsage(usage, extractUsageInfo(record));
      if (!delta) continue;
      content += delta;
      yield {
        delta,
        done: false,
        model: payload.context.model,
        traceId,
        endpoint: meta.resultEndpoint,
        status: 200,
        latency: Date.now() - startedAt,
      };
    }

    if (!content.trim())
      throw createRequestError(meta.emptyMessage, meta.endpoint, {});

    yield {
      delta: "",
      done: true,
      model: payload.context.model,
      traceId,
      endpoint: meta.resultEndpoint,
      status: 200,
      latency: Date.now() - startedAt,
      usage,
    };
  } finally {
    clearTimeout(timeout);
    payload.signal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function invokeOpenAiCompatibleProviderAdapter(
  payload: IntelligenceProviderAdapterPayload,
): Promise<IntelligenceProviderAdapterResult> {
  const { context, messages } = payload;
  const traceId = createId("trace");
  const startedAt = Date.now();
  const baseUrl = normalizeOpenAiBaseUrl(
    resolveProviderBaseUrl(context.provider.type, context.provider.baseUrl),
  );
  const { ChatOpenAI } = await import("@langchain/openai");
  const runner = new ChatOpenAI({
    apiKey: context.apiKey || "tuff-local-key",
    model: context.model,
    temperature: 0.2,
    timeout: context.timeoutMs,
    configuration: { baseURL: baseUrl },
  });
  return normalizeResponse(
    await withTimeout(
      runner.invoke(toLangChainMessages(messages)),
      context.timeoutMs,
    ),
    {
      payload,
      traceId,
      startedAt,
      endpoint: `${baseUrl}/chat/completions`,
      resultEndpoint: `langchain:${context.provider.type}:chat`,
      emptyMessage: "Provider returned empty content.",
    },
  );
}

export async function invokeAnthropicProviderAdapter(
  payload: IntelligenceProviderAdapterPayload,
): Promise<IntelligenceProviderAdapterResult> {
  const { context, messages } = payload;
  const traceId = createId("trace");
  const startedAt = Date.now();
  const baseUrl = normalizeAnthropicBaseUrl(
    resolveProviderBaseUrl(context.provider.type, context.provider.baseUrl),
  );
  const { ChatAnthropic } = await import("@langchain/anthropic");
  const runner = new ChatAnthropic({
    anthropicApiKey: context.apiKey || "",
    model: context.model,
    maxTokens: 1200,
    anthropicApiUrl: baseUrl,
    clientOptions: { baseURL: baseUrl },
  });
  return normalizeResponse(
    await withTimeout(
      runner.invoke(toLangChainMessages(messages)),
      context.timeoutMs,
    ),
    {
      payload,
      traceId,
      startedAt,
      endpoint: `${baseUrl}/messages`,
      resultEndpoint: "langchain:anthropic:chat",
      emptyMessage: "Anthropic returned empty content.",
    },
  );
}

export async function* streamOpenAiCompatibleProviderAdapter(
  payload: IntelligenceProviderAdapterPayload,
): AsyncGenerator<IntelligenceProviderAdapterStreamChunk> {
  const { context } = payload;
  const baseUrl = normalizeOpenAiBaseUrl(
    resolveProviderBaseUrl(context.provider.type, context.provider.baseUrl),
  );
  const { ChatOpenAI } = await import("@langchain/openai");
  const runner = new ChatOpenAI({
    apiKey: context.apiKey || "tuff-local-key",
    model: context.model,
    temperature: 0.2,
    timeout: context.timeoutMs,
    streaming: true,
    streamUsage: true,
    configuration: { baseURL: baseUrl },
  });
  yield* streamProviderResponse(
    payload,
    (messages, signal) => runner.stream(messages, { signal }),
    {
      endpoint: `${baseUrl}/chat/completions`,
      resultEndpoint: `langchain:${context.provider.type}:chat`,
      emptyMessage: "Provider returned empty streamed content.",
    },
  );
}

export async function* streamAnthropicProviderAdapter(
  payload: IntelligenceProviderAdapterPayload,
): AsyncGenerator<IntelligenceProviderAdapterStreamChunk> {
  const { context } = payload;
  const baseUrl = normalizeAnthropicBaseUrl(
    resolveProviderBaseUrl(context.provider.type, context.provider.baseUrl),
  );
  const { ChatAnthropic } = await import("@langchain/anthropic");
  const runner = new ChatAnthropic({
    anthropicApiKey: context.apiKey || "",
    model: context.model,
    maxTokens: 1200,
    streaming: true,
    streamUsage: true,
    anthropicApiUrl: baseUrl,
    clientOptions: { baseURL: baseUrl },
  });
  yield* streamProviderResponse(
    payload,
    (messages, signal) => runner.stream(messages, { signal }),
    {
      endpoint: `${baseUrl}/messages`,
      resultEndpoint: "langchain:anthropic:chat",
      emptyMessage: "Anthropic returned empty streamed content.",
    },
  );
}
