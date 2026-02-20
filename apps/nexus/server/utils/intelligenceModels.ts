const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  siliconflow: 'https://api.siliconflow.cn/v1',
  local: 'http://localhost:11434',
  custom: 'https://api.openai.com/v1',
}

const OPENAI_COMPATIBLE_TYPES = new Set(['openai', 'deepseek', 'siliconflow', 'custom'])
const OPENAI_VERSION_SUFFIXES = ['/v1', '/api/v1', '/openai/v1', '/api/openai/v1']
const OPENAI_CHAT_SUFFIXES = ['/chat/completions', '/completions']

function trimBaseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

function stripOpenAiEndpointSuffix(value: string): string {
  const trimmed = trimBaseUrl(value)
  const lower = trimmed.toLowerCase()
  for (const suffix of OPENAI_CHAT_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      return trimBaseUrl(trimmed.slice(0, -suffix.length))
    }
  }
  return trimmed
}

export function buildOpenAiCompatBaseUrls(baseUrl: string): string[] {
  const trimmed = stripOpenAiEndpointSuffix(baseUrl)
  const trimmedLower = trimmed.toLowerCase()
  if (OPENAI_VERSION_SUFFIXES.some(suffix => trimmedLower.endsWith(suffix))) {
    return [trimmed]
  }
  return [`${trimmed}/v1`]
}

export function resolveProviderBaseUrl(type: string, baseUrl?: string | null): string {
  if (typeof baseUrl === 'string' && baseUrl.trim().length > 0)
    return trimBaseUrl(baseUrl.trim())

  return DEFAULT_BASE_URLS[type] ?? DEFAULT_BASE_URLS.openai
}

function buildOpenAiModelEndpoints(baseUrl: string): string[] {
  const trimmed = stripOpenAiEndpointSuffix(baseUrl)
  if (/\/models$/i.test(trimmed))
    return [trimmed]
  return buildOpenAiCompatBaseUrls(trimmed).map(candidate => `${candidate}/models`)
}

export async function fetchProviderModels(options: {
  type: string
  baseUrl?: string | null
  apiKey?: string | null
}): Promise<string[]> {
  const resolvedBaseUrl = resolveProviderBaseUrl(options.type, options.baseUrl)

  if (options.type === 'local') {
    const res = await fetch(`${resolvedBaseUrl}/api/tags`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok)
      throw new Error(`Local server returned ${res.status}`)
    const data = await res.json() as { models?: Array<{ name: string }> }
    return (data.models || []).map(model => model.name)
  }

  if (options.type === 'anthropic') {
    const res = await fetch(`${resolvedBaseUrl}/models`, {
      headers: {
        'x-api-key': options.apiKey || '',
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Anthropic API returned ${res.status}: ${text.slice(0, 200)}`)
    }
    const data = await res.json() as { data?: Array<{ id: string }> }
    return (data.data || []).map(model => model.id)
  }

  if (!OPENAI_COMPATIBLE_TYPES.has(options.type)) {
    throw new Error(`Unsupported provider type: ${options.type}`)
  }

  const endpoints = buildOpenAiModelEndpoints(resolvedBaseUrl)
  let lastError: Error | null = null

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${options.apiKey || ''}`,
        },
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`API returned ${res.status}: ${text.slice(0, 200)}`)
      }
      const data = await res.json() as { data?: Array<{ id: string }> }
      return (data.data || []).map(model => model.id)
    }
    catch (error: any) {
      lastError = error instanceof Error ? error : new Error('Failed to fetch models.')
    }
  }

  throw lastError ?? new Error('Failed to fetch models.')
}
