import { createError } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import { getProvider, getProviderApiKey } from '../../../../utils/intelligenceStore'
import { fetchProviderModels } from '../../../../utils/intelligenceModels'

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

  try {
    const startTime = Date.now()
    const models = await fetchProviderModels({
      type: provider.type,
      baseUrl,
      apiKey,
    })
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
