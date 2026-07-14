import { IntelligenceProviderType } from "@talex-touch/tuff-intelligence/light";
import type {
  IntelligenceMessage,
  IntelligenceUsageInfo,
} from "@talex-touch/tuff-intelligence/light";
import type { IntelligenceProviderRecord } from "./intelligenceStore";
import {
  invokeAnthropicProviderAdapter,
  invokeOpenAiCompatibleProviderAdapter,
  streamAnthropicProviderAdapter,
  streamOpenAiCompatibleProviderAdapter,
} from "./tuffIntelligenceLangChainProviderAdapters";

const OPENAI_COMPATIBLE_TYPES = new Set([
  IntelligenceProviderType.OPENAI,
  IntelligenceProviderType.DEEPSEEK,
  IntelligenceProviderType.SILICONFLOW,
  IntelligenceProviderType.CUSTOM,
]);

export interface IntelligenceProviderAdapterContext {
  provider: IntelligenceProviderRecord;
  model: string;
  apiKey: string | null;
  timeoutMs: number;
}

export interface IntelligenceProviderAdapterResult {
  content: string;
  model: string;
  traceId: string;
  endpoint: string;
  status?: number;
  latency: number;
  usage?: IntelligenceUsageInfo;
}

export interface IntelligenceProviderAdapterPayload {
  context: IntelligenceProviderAdapterContext;
  messages: IntelligenceMessage[];
  signal?: AbortSignal;
}

export type IntelligenceProviderAdapter = (
  payload: IntelligenceProviderAdapterPayload,
) => Promise<IntelligenceProviderAdapterResult>;

export interface IntelligenceProviderAdapterStreamChunk {
  delta: string;
  done: boolean;
  model: string;
  traceId: string;
  endpoint: string;
  status?: number;
  latency: number;
  usage?: IntelligenceUsageInfo;
}

export type IntelligenceProviderStreamAdapter = (
  payload: IntelligenceProviderAdapterPayload,
) => AsyncGenerator<IntelligenceProviderAdapterStreamChunk>;

const adapterRegistry = new Map<string, IntelligenceProviderAdapter>();
const streamAdapterRegistry = new Map<
  string,
  IntelligenceProviderStreamAdapter
>();

export function registerIntelligenceProviderAdapterForTest(
  providerType: string,
  adapter: IntelligenceProviderAdapter,
): void {
  adapterRegistry.set(providerType, adapter);
}

export function registerIntelligenceProviderStreamAdapterForTest(
  providerType: string,
  adapter: IntelligenceProviderStreamAdapter,
): void {
  streamAdapterRegistry.set(providerType, adapter);
}

export function clearIntelligenceProviderAdaptersForTest(): void {
  adapterRegistry.clear();
  streamAdapterRegistry.clear();
}

export function resolveIntelligenceProviderAdapter(
  providerType: string,
): IntelligenceProviderAdapter | null {
  const registered = adapterRegistry.get(providerType);
  if (registered) return registered;
  if (providerType === IntelligenceProviderType.ANTHROPIC)
    return invokeAnthropicProviderAdapter;
  if (providerType === IntelligenceProviderType.LOCAL)
    return invokeOpenAiCompatibleProviderAdapter;
  if (OPENAI_COMPATIBLE_TYPES.has(providerType as IntelligenceProviderType))
    return invokeOpenAiCompatibleProviderAdapter;
  return null;
}

export function resolveIntelligenceProviderStreamAdapter(
  providerType: string,
): IntelligenceProviderStreamAdapter | null {
  const registered = streamAdapterRegistry.get(providerType);
  if (registered) return registered;
  if (providerType === IntelligenceProviderType.ANTHROPIC)
    return streamAnthropicProviderAdapter;
  if (providerType === IntelligenceProviderType.LOCAL)
    return streamOpenAiCompatibleProviderAdapter;
  if (OPENAI_COMPATIBLE_TYPES.has(providerType as IntelligenceProviderType))
    return streamOpenAiCompatibleProviderAdapter;
  return null;
}
