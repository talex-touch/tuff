import { requireAdmin } from '../../../utils/auth'
import { listProviders } from '../../../utils/intelligenceStore'

/**
 * Returns available models for the current user, aggregated from all enabled providers.
 */
export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const providers = await listProviders(event, userId)

  const models: Array<{
    id: string
    provider: string
    providerType: string
    providerId: string
  }> = []

  for (const provider of providers) {
    if (!provider.enabled)
      continue
    for (const model of provider.models) {
      models.push({
        id: model,
        provider: provider.name,
        providerType: provider.type,
        providerId: provider.id,
      })
    }
  }

  return { models }
})
