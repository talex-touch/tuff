import { createError } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { readCloudflareBindings } from '../../../utils/cloudflare'
import { fetchProviderModels } from '../../../utils/intelligenceModels'
import { isLocalDevelopmentRuntime } from '../../../utils/runtimeCredentialPolicy'
import { evaluateWebhookUrl } from '../../../utils/webhookUrlPolicy'

const VALID_TYPES = ['openai', 'anthropic', 'deepseek', 'siliconflow', 'local', 'custom']

function validateBaseUrl(value: string, allowLocalhost: boolean): string {
  const decision = evaluateWebhookUrl(value, { allowLocalhost })
  if (!decision.allowed) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid base URL (${decision.reason}).`,
    })
  }
  return decision.url
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody(event)
  const { type, apiKey, baseUrl } = body || {}

  if (!type || !VALID_TYPES.includes(type)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid provider type. Must be one of: ${VALID_TYPES.join(', ')}` })
  }

  const bindings = readCloudflareBindings(event)
  const isLocalDev = isLocalDevelopmentRuntime(bindings?.NEXUS_LOCAL_PAGES_PREVIEW, bindings)
  const allowLocalhost = type === 'local' && isLocalDev

  if (type === 'local' && !isLocalDev) {
    throw createError({ statusCode: 400, statusMessage: 'Local provider probing is disabled in production.' })
  }

  const normalizedBaseUrl = typeof baseUrl === 'string' && baseUrl.trim().length > 0
    ? validateBaseUrl(baseUrl, allowLocalhost)
    : undefined

  if (type !== 'local' && (typeof apiKey !== 'string' || apiKey.trim().length === 0)) {
    throw createError({ statusCode: 400, statusMessage: 'API key is required to fetch models.' })
  }

  const models = await fetchProviderModels({
    type,
    baseUrl: normalizedBaseUrl,
    apiKey: typeof apiKey === 'string' ? apiKey.trim() : null,
    allowLocalhost,
  })

  return { models }
})
