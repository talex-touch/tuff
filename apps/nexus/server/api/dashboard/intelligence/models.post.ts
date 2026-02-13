import { createError } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { fetchProviderModels } from '../../../utils/intelligenceModels'

const VALID_TYPES = ['openai', 'anthropic', 'deepseek', 'siliconflow', 'local', 'custom']
const normalizeBaseUrl = (value: string) => {
  try {
    return new URL(value).toString()
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid base URL format.' })
  }
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody(event)
  const { type, apiKey, baseUrl } = body || {}

  if (!type || !VALID_TYPES.includes(type)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid provider type. Must be one of: ${VALID_TYPES.join(', ')}` })
  }

  const normalizedBaseUrl = typeof baseUrl === 'string' && baseUrl.trim().length > 0
    ? normalizeBaseUrl(baseUrl)
    : undefined

  if (type !== 'local' && (typeof apiKey !== 'string' || apiKey.trim().length === 0)) {
    throw createError({ statusCode: 400, statusMessage: 'API key is required to fetch models.' })
  }

  const models = await fetchProviderModels({
    type,
    baseUrl: normalizedBaseUrl,
    apiKey: typeof apiKey === 'string' ? apiKey.trim() : null,
  })

  return { models }
})
