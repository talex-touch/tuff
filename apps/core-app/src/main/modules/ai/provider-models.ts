import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { getNetworkService } from '../network'
import { isNexusManagedProvider } from './provider-runtime-shared'

const DEFAULT_BASE_URLS: Partial<Record<IntelligenceProviderType, string>> = {
  [IntelligenceProviderType.OPENAI]: 'https://api.openai.com/v1',
  [IntelligenceProviderType.ANTHROPIC]: 'https://api.anthropic.com/v1',
  [IntelligenceProviderType.DEEPSEEK]: 'https://api.deepseek.com/v1',
  [IntelligenceProviderType.SILICONFLOW]: 'https://api.siliconflow.cn/v1',
  [IntelligenceProviderType.CUSTOM]: undefined,
  [IntelligenceProviderType.LOCAL]: 'http://localhost:11434'
}

const ANTHROPIC_VERSION = '2023-06-01'
const OPENAI_VERSION_SUFFIXES = ['/v1', '/api/v1', '/openai/v1', '/api/openai/v1']
const LOCAL_DIRECT_PROXY = { mode: 'direct' as const }
const LOCAL_OLLAMA_CHAT_COOLDOWN_KEY_SUFFIX = ':ollama.chat'

export interface FetchProviderModelsOptions {
  allowStoredFallback?: boolean
  skipCooldownCheck?: boolean
}

function joinUrl(base: string, path: string): string {
  const normalizedBase = base.replace(/\/+$/, '')
  const normalizedPath = path.replace(/^\/+/, '')
  return `${normalizedBase}/${normalizedPath}`
}

function resolveBaseUrl(provider: IntelligenceProviderConfig): string {
  const candidate = provider.baseUrl?.trim() || DEFAULT_BASE_URLS[provider.type]
  if (!candidate) {
    throw new Error(`[${provider.type}] Base URL is required to fetch models`)
  }
  return candidate
}

function ensureApiKey(provider: IntelligenceProviderConfig): string {
  const key = provider.apiKey?.trim()
  if (!key && provider.type !== IntelligenceProviderType.LOCAL) {
    throw new Error(`[${provider.type}] API key is required to fetch models`)
  }
  return key || ''
}

function resolveOpenAiCompatibleBaseUrl(provider: IntelligenceProviderConfig): string {
  const baseUrl = resolveBaseUrl(provider)
  const normalized = baseUrl.replace(/\/+$/, '')
  const lower = normalized.toLowerCase()
  if (OPENAI_VERSION_SUFFIXES.some((suffix) => lower.endsWith(suffix))) {
    return normalized
  }
  return `${normalized}/v1`
}

function resolveOllamaBaseUrl(provider: IntelligenceProviderConfig): string {
  const baseUrl = resolveBaseUrl(provider)
  const normalized = baseUrl.replace(/\/+$/, '')
  const lower = normalized.toLowerCase()
  const suffix = OPENAI_VERSION_SUFFIXES.find((item) => lower.endsWith(item))
  return suffix ? normalized.slice(0, -suffix.length).replace(/\/+$/, '') : normalized
}

function getStoredModels(provider: IntelligenceProviderConfig): string[] {
  return provider.models?.length ? [...new Set(provider.models)] : []
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

function normalizeModelEntries(entries: unknown[]): string[] {
  const normalized: string[] = []
  for (const entry of entries) {
    if (!entry) continue
    if (typeof entry === 'string') {
      normalized.push(entry)
      continue
    }
    if (!isRecord(entry)) continue
    const id = [entry.id, entry.name, entry.slug, entry.model].find(
      (value): value is string => typeof value === 'string'
    )
    if (id) normalized.push(id)
  }
  return Array.from(new Set(normalized))
}

async function fetchOpenAiCompatibleModels(
  provider: IntelligenceProviderConfig,
  baseUrl = resolveBaseUrl(provider),
  options: FetchProviderModelsOptions = {}
): Promise<string[]> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (provider.type === IntelligenceProviderType.ANTHROPIC) {
    headers['x-api-key'] = ensureApiKey(provider)
    headers['anthropic-version'] = ANTHROPIC_VERSION
  } else {
    const apiKey = ensureApiKey(provider)
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }
  }

  const endpoint = joinUrl(baseUrl, 'models')
  const response = await getNetworkService().request<unknown>({
    method: 'GET',
    url: endpoint,
    headers,
    responseType: 'json',
    skipCooldownCheck: options.skipCooldownCheck,
    cooldownPolicy:
      provider.type === IntelligenceProviderType.LOCAL
        ? {
            key: `${provider.id}${LOCAL_OLLAMA_CHAT_COOLDOWN_KEY_SUFFIX}`,
            failureThreshold: 2,
            cooldownMs: 15_000,
            autoResetOnSuccess: true
          }
        : undefined,
    proxyOverride: provider.type === IntelligenceProviderType.LOCAL ? LOCAL_DIRECT_PROXY : undefined
  })

  const body = response.data
  const bodyRecord = isRecord(body) ? body : {}
  const rawEntries = Array.isArray(bodyRecord.data)
    ? bodyRecord.data
    : Array.isArray(bodyRecord.models)
      ? bodyRecord.models
      : []

  return normalizeModelEntries(rawEntries)
}

async function fetchOllamaModels(
  provider: IntelligenceProviderConfig,
  options: FetchProviderModelsOptions = {}
): Promise<string[]> {
  const endpoint = joinUrl(resolveOllamaBaseUrl(provider), 'api/tags')
  const response = await getNetworkService().request<unknown>({
    method: 'GET',
    url: endpoint,
    headers: {
      'Content-Type': 'application/json'
    },
    responseType: 'json',
    skipCooldownCheck: options.skipCooldownCheck,
    cooldownPolicy: {
      key: `${provider.id}${LOCAL_OLLAMA_CHAT_COOLDOWN_KEY_SUFFIX}`,
      failureThreshold: 2,
      cooldownMs: 15_000,
      autoResetOnSuccess: true
    },
    proxyOverride: LOCAL_DIRECT_PROXY
  })

  const body = response.data
  const bodyRecord = isRecord(body) ? body : {}
  const rawEntries = Array.isArray(bodyRecord.models) ? bodyRecord.models : []
  return normalizeModelEntries(rawEntries)
}

async function fetchLocalModels(
  provider: IntelligenceProviderConfig,
  options: FetchProviderModelsOptions = {}
): Promise<string[]> {
  const storedModels = getStoredModels(provider)
  const allowStoredFallback = options.allowStoredFallback !== false
  let lastError: unknown

  for (const fetcher of [
    (config: IntelligenceProviderConfig) => fetchOllamaModels(config, options),
    (config: IntelligenceProviderConfig) =>
      fetchOpenAiCompatibleModels(config, resolveOpenAiCompatibleBaseUrl(config), options)
  ]) {
    try {
      const models = await fetcher(provider)
      if (models.length) {
        return models
      }
    } catch (error) {
      lastError = error
    }
  }

  if (allowStoredFallback && storedModels.length) {
    return storedModels
  }

  if (lastError) {
    throw lastError
  }

  return []
}

export async function fetchProviderModels(
  provider: IntelligenceProviderConfig,
  options: FetchProviderModelsOptions = {}
): Promise<string[]> {
  if (isNexusManagedProvider(provider)) {
    return getStoredModels(provider)
  }

  if (provider.type === IntelligenceProviderType.LOCAL) {
    return await fetchLocalModels(provider, options)
  }

  const models = await fetchOpenAiCompatibleModels(provider, resolveBaseUrl(provider), options)

  // Fallback to stored models if API returned nothing
  if (models.length === 0 && options.allowStoredFallback !== false) {
    return getStoredModels(provider)
  }

  return models
}
