import { createError } from 'h3'
import { requireAuth } from '../../../utils/auth'
import {
  normalizeNexusIntelligenceTransportError,
  resolveNexusIntelligenceHttpStatus,
} from '../../../utils/intelligenceErrorContract'
import { listIntelligenceLabProviders } from '../../../utils/tuffIntelligenceLabService'

export default defineEventHandler(async (event) => {
  try {
    const { userId } = await requireAuth(event)
    const { providers } = await listIntelligenceLabProviders(event, userId)
    const modelSet = new Set<string>()

    for (const provider of providers) {
      if (!provider.enabled)
        continue
      for (const model of provider.models || []) {
        if (typeof model === 'string' && model.trim()) {
          modelSet.add(model.trim())
        }
      }
    }

    return {
      models: Array.from(modelSet),
    }
  }
  catch (error) {
    const failure = normalizeNexusIntelligenceTransportError(error)
    throw createError({
      statusCode: resolveNexusIntelligenceHttpStatus(error, failure.code),
      statusMessage: failure.message,
      data: failure,
    })
  }
})
