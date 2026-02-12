import { createError } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import { getProvider, updateProvider } from '../../../../utils/intelligenceStore'

const normalizeBaseUrl = (value: string) => {
  try {
    return new URL(value).toString()
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid base URL format.' })
  }
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Provider ID is required.' })
  }

  const existing = await getProvider(event, userId, id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Provider not found.' })
  }

  const body = await readBody(event)
  const { name, enabled, apiKey, baseUrl, models, defaultModel, instructions, timeout, priority, rateLimit, capabilities, metadata } = body || {}
  const normalizedBaseUrl = typeof baseUrl === 'string' && baseUrl.length > 0 ? normalizeBaseUrl(baseUrl) : baseUrl

  if (name !== undefined && (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100)) {
    throw createError({ statusCode: 400, statusMessage: 'Provider name must be 1-100 characters.' })
  }

  const provider = await updateProvider(event, userId, id, {
    name: typeof name === 'string' ? name.trim() : undefined,
    enabled: typeof enabled === 'boolean' ? enabled : undefined,
    apiKey: apiKey === null ? null : (typeof apiKey === 'string' ? apiKey : undefined),
    baseUrl: normalizedBaseUrl === null ? null : (typeof normalizedBaseUrl === 'string' ? normalizedBaseUrl : undefined),
    models: Array.isArray(models) ? models.filter((m: unknown) => typeof m === 'string') : undefined,
    defaultModel: defaultModel === null ? null : (typeof defaultModel === 'string' ? defaultModel : undefined),
    instructions: instructions === null ? null : (typeof instructions === 'string' ? instructions : undefined),
    timeout: typeof timeout === 'number' ? Math.min(Math.max(timeout, 5000), 120000) : undefined,
    priority: typeof priority === 'number' ? Math.min(Math.max(priority, 0), 100) : undefined,
    rateLimit: rateLimit === null ? null : (rateLimit && typeof rateLimit === 'object' ? rateLimit : undefined),
    capabilities: capabilities === null ? null : (Array.isArray(capabilities) ? capabilities : undefined),
    metadata: metadata === null ? null : (metadata && typeof metadata === 'object' ? metadata : undefined),
  })

  return { provider }
})
