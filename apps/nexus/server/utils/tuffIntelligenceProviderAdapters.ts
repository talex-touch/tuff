import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence/light'
import type { IntelligenceMessage, IntelligenceUsageInfo } from '@talex-touch/tuff-intelligence/light'
import type { IntelligenceProviderRecord } from './intelligenceStore'
import {
  invokeAnthropicProviderAdapter,
  invokeOpenAiCompatibleProviderAdapter,
} from './tuffIntelligenceLangChainProviderAdapters'

const OPENAI_COMPATIBLE_TYPES = new Set([
  IntelligenceProviderType.OPENAI,
  IntelligenceProviderType.DEEPSEEK,
  IntelligenceProviderType.SILICONFLOW,
  IntelligenceProviderType.CUSTOM,
])

export interface IntelligenceProviderAdapterContext {
  provider: IntelligenceProviderRecord
  model: string
  apiKey: string | null
  timeoutMs: number
}

export interface IntelligenceProviderAdapterResult {
  content: string
  model: string
  traceId: string
  endpoint: string
  status?: number
  latency: number
  usage?: IntelligenceUsageInfo
}

export interface IntelligenceProviderAdapterPayload {
  context: IntelligenceProviderAdapterContext
  messages: IntelligenceMessage[]
}

export type IntelligenceProviderAdapter = (
  payload: IntelligenceProviderAdapterPayload,
) => Promise<IntelligenceProviderAdapterResult>

const adapterRegistry = new Map<string, IntelligenceProviderAdapter>()

export function registerIntelligenceProviderAdapterForTest(
  providerType: string,
  adapter: IntelligenceProviderAdapter,
): void {
  adapterRegistry.set(providerType, adapter)
}

export function clearIntelligenceProviderAdaptersForTest(): void {
  adapterRegistry.clear()
}

export function resolveIntelligenceProviderAdapter(
  providerType: string,
): IntelligenceProviderAdapter | null {
  const registered = adapterRegistry.get(providerType)
  if (registered)
    return registered
  if (providerType === IntelligenceProviderType.ANTHROPIC)
    return invokeAnthropicProviderAdapter
  if (providerType === IntelligenceProviderType.LOCAL)
    return invokeOpenAiCompatibleProviderAdapter
  if (OPENAI_COMPATIBLE_TYPES.has(providerType as IntelligenceProviderType))
    return invokeOpenAiCompatibleProviderAdapter
  return null
}
