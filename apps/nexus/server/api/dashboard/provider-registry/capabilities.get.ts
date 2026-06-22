import type { ProviderRegistryVendor } from '../../../utils/providerRegistryStore'
import { getQuery } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { listProviderCapabilities, listProviderRegistryEntries } from '../../../utils/providerRegistryStore'
import { resolveSceneCapabilityAdapterReadiness } from '../../../utils/sceneCapabilityAdapterRegistry'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = getQuery(event)

  const capabilities = await listProviderCapabilities(event, {
    providerId: typeof query.providerId === 'string' ? query.providerId : undefined,
    vendor: typeof query.vendor === 'string' ? query.vendor as ProviderRegistryVendor : undefined,
    capability: typeof query.capability === 'string' ? query.capability : undefined,
  })

  const providerIds = new Set(capabilities.map(capability => capability.providerId))
  const providers = await listProviderRegistryEntries(event, {
    vendor: typeof query.vendor === 'string' ? query.vendor as ProviderRegistryVendor : undefined,
  })
  const providersById = new Map(providers
    .filter(provider => providerIds.has(provider.id))
    .map(provider => [provider.id, provider]))

  return {
    capabilities: capabilities.map((capability) => {
      const provider = providersById.get(capability.providerId)
      if (!provider)
        return capability
      return {
        ...capability,
        adapter: resolveSceneCapabilityAdapterReadiness(provider, capability.capability),
      }
    }),
  }
})
