import { createError } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { createProvider } from '../../../utils/intelligenceStore'

const VALID_TYPES = ['openai', 'anthropic', 'deepseek', 'siliconflow', 'local', 'custom']
const normalizeBaseUrl = (value: string) => {
  try {
    return new URL(value).toString()
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid base URL format.' })
  }
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody(event)

  const { type, name, enabled, apiKey, baseUrl, models, defaultModel, instructions, timeout, priority, rateLimit, capabilities, metadata } = body || {}
  const normalizedBaseUrl = baseUrl && typeof baseUrl === 'string' ? normalizeBaseUrl(baseUrl) : undefined

  if (!type || !VALID_TYPES.includes(type)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid provider type. Must be one of: ${VALID_TYPES.join(', ')}` })
  }

  if (!name || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100) {
    throw createError({ statusCode: 400, statusMessage: 'Provider name is required (1-100 characters).' })
  }

  if (apiKey && typeof apiKey !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid API key format.' })
  }

  if (models && !Array.isArray(models)) {
    throw createError({ statusCode: 400, statusMessage: 'Models must be an array of strings.' })
  }

  const provider = await createProvider(event, userId, {
    type,
    name: name.trim(),
    enabled: Boolean(enabled),
    apiKey: apiKey || undefined,
    baseUrl: normalizedBaseUrl,
    models: Array.isArray(models) ? models.filter((m: unknown) => typeof m === 'string') : undefined,
    defaultModel: typeof defaultModel === 'string' ? defaultModel : undefined,
    instructions: typeof instructions === 'string' ? instructions : undefined,
    timeout: typeof timeout === 'number' ? Math.min(Math.max(timeout, 5000), 120000) : undefined,
    priority: typeof priority === 'number' ? Math.min(Math.max(priority, 0), 100) : undefined,
    rateLimit: rateLimit && typeof rateLimit === 'object' ? rateLimit : undefined,
    capabilities: Array.isArray(capabilities) ? capabilities : undefined,
    metadata: metadata && typeof metadata === 'object' ? metadata : undefined,
  })

  return { provider }
})
