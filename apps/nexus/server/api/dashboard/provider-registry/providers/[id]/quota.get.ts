import { createError, getRouterParam } from 'h3'
import { requireAdmin } from '../../../../../utils/auth'
import { evaluateIntelligenceProviderQuotas, listPlatformGovernanceConfigs } from '../../../../../utils/platformGovernanceStore'
import { getProviderRegistryEntry } from '../../../../../utils/providerRegistryStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = String(getRouterParam(event, 'id') || '').trim()

  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'id is required.' })

  const provider = await getProviderRegistryEntry(event, id)
  if (!provider)
    throw createError({ statusCode: 404, statusMessage: 'Provider registry entry not found.' })

  const [quota = null] = await listPlatformGovernanceConfigs(event, {
    configType: 'intelligence_provider_quota',
    targetId: id,
  })
  const evaluations = await evaluateIntelligenceProviderQuotas(event, id)

  return { quota, evaluations }
})
