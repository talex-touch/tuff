import { AiProviderConfig, AiProviderType } from '@talex-touch/utils'

const DEFAULT_BASE_URLS: Partial<Record<AiProviderType, string>> = {
  [AiProviderType.OPENAI]: 'https://api.openai.com/v1',
  [AiProviderType.ANTHROPIC]: 'https://api.anthropic.com/v1',
  [AiProviderType.DEEPSEEK]: 'https://api.deepseek.com/v1',
  [AiProviderType.SILICONFLOW]: 'https://api.siliconflow.cn/v1',
  [AiProviderType.CUSTOM]: undefined,
  [AiProviderType.LOCAL]: undefined
}

const ANTHROPIC_VERSION = '2023-06-01'

function joinUrl(base: string, path: string): string {
  const normalizedBase = base.replace(/\/+$/, '')
  const normalizedPath = path.replace(/^\/+/, '')
  return `${normalizedBase}/${normalizedPath}`
}

function resolveBaseUrl(provider: AiProviderConfig): string {
  const candidate = provider.baseUrl?.trim() || DEFAULT_BASE_URLS[provider.type]
  if (!candidate) {
    throw new Error(`[${provider.type}] Base URL is required to fetch models`)
  }
  return candidate
}

function ensureApiKey(provider: AiProviderConfig): string {
  const key = provider.apiKey?.trim()
  if (!key && provider.type !== AiProviderType.LOCAL) {
    throw new Error(`[${provider.type}] API key is required to fetch models`)
  }
  return key || ''
}

function normalizeModelEntries(entries: any[]): string[] {
  const normalized: string[] = []
  for (const entry of entries) {
    if (!entry) continue
    if (typeof entry === 'string') {
      normalized.push(entry)
      continue
    }
    const id = entry.id ?? entry.name ?? entry.slug ?? entry.model
    if (id) normalized.push(id)
  }
  return Array.from(new Set(normalized))
}

async function parseJsonBody(response: Response): Promise<any> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export async function fetchProviderModels(provider: AiProviderConfig): Promise<string[]> {
  if (provider.type === AiProviderType.LOCAL) {
    return provider.models?.length ? [...new Set(provider.models)] : []
  }

  const baseUrl = resolveBaseUrl(provider)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (provider.type === AiProviderType.ANTHROPIC) {
    headers['x-api-key'] = ensureApiKey(provider)
    headers['anthropic-version'] = ANTHROPIC_VERSION
  } else {
    headers['Authorization'] = `Bearer ${ensureApiKey(provider)}`
  }

  const endpoint = joinUrl(baseUrl, 'models')
  const response = await fetch(endpoint, {
    method: 'GET',
    headers
  })

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText)
    throw new Error(`Failed to fetch models: ${response.status} ${response.statusText} - ${message}`)
  }

  const body = await parseJsonBody(response)
  const rawEntries = Array.isArray(body?.data)
    ? body?.data
    : Array.isArray(body?.models)
      ? body?.models
      : []

  const models = normalizeModelEntries(rawEntries)

  // Fallback to stored models if API returned nothing
  if (models.length === 0 && provider.models?.length) {
    return [...new Set(provider.models)]
  }

  return models
}
