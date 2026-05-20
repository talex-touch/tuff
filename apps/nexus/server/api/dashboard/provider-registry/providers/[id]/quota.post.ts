import { createError, getRouterParam, readBody } from 'h3'
import { requireAdmin } from '../../../../../utils/auth'
import { upsertPlatformGovernanceConfig } from '../../../../../utils/platformGovernanceStore'
import { getProviderRegistryEntry } from '../../../../../utils/providerRegistryStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const id = String(getRouterParam(event, 'id') || '').trim()

  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'id is required.' })

  const provider = await getProviderRegistryEntry(event, id)
  if (!provider)
    throw createError({ statusCode: 404, statusMessage: 'Provider registry entry not found.' })

  const body = await readBody(event)
  const quota = await upsertPlatformGovernanceConfig(event, {
    ...(body ?? {}),
    configType: 'intelligence_provider_quota',
    name: body?.name ?? `${provider.displayName} quota`,
    targetId: id,
    provider: provider.vendor,
  }, userId)

  return { quota }
})
