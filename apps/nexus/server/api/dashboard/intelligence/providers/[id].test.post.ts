import { createError } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import { getProvider, getProviderApiKey } from '../../../../utils/intelligenceStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Provider ID is required.' })
  }

  const provider = await getProvider(event, userId, id)
  if (!provider) {
    throw createError({ statusCode: 404, statusMessage: 'Provider not found.' })
  }

  const body = await readBody(event)
  const { baseUrl: overrideBaseUrl, apiKey: overrideApiKey } = body || {}

  const apiKey = typeof overrideApiKey === 'string'
    ? overrideApiKey
    : await getProviderApiKey(event, userId, id)

  const baseUrl = typeof overrideBaseUrl === 'string'
    ? overrideBaseUrl
    : provider.baseUrl

  if (!apiKey && provider.type !== 'local') {
    throw createError({ statusCode: 400, statusMessage: 'API key is required to test this provider.' })
  }

  const testBaseUrl = resolveTestBaseUrl(provider.type, baseUrl)

  try {
    const startTime = Date.now()
    const models = await fetchModels(testBaseUrl, apiKey, provider.type)
    const latency = Date.now() - startTime

    return {
      success: true,
      models,
      latency,
      message: `Connected successfully. Found ${models.length} model(s).`,
    }
  }
  catch (error: any) {
    return {
      success: false,
      models: [],
      latency: 0,
      message: error?.message || 'Connection test failed.',
    }
  }
})

function resolveTestBaseUrl(type: string, baseUrl: string | null): string {
  if (baseUrl)
    return baseUrl.replace(/\/+$/, '')

  switch (type) {
    case 'openai': return 'https://api.openai.com/v1'
    case 'anthropic': return 'https://api.anthropic.com/v1'
    case 'deepseek': return 'https://api.deepseek.com/v1'
    case 'siliconflow': return 'https://api.siliconflow.cn/v1'
    case 'local': return 'http://localhost:11434'
    default: return 'https://api.openai.com/v1'
  }
}

async function fetchModels(baseUrl: string, apiKey: string | null, type: string): Promise<string[]> {
  if (type === 'local') {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok)
      throw new Error(`Local server returned ${res.status}`)
    const data = await res.json() as { models?: Array<{ name: string }> }
    return (data.models || []).map(m => m.name)
  }

  if (type === 'anthropic') {
    const res = await fetch(`${baseUrl}/models`, {
      headers: {
        'x-api-key': apiKey || '',
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Anthropic API returned ${res.status}: ${text.slice(0, 200)}`)
    }
    const data = await res.json() as { data?: Array<{ id: string }> }
    return (data.data || []).map(m => m.id)
  }

  // OpenAI-compatible (openai, deepseek, siliconflow, custom)
  const res = await fetch(`${baseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API returned ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = await res.json() as { data?: Array<{ id: string }> }
  return (data.data || []).map(m => m.id)
}
