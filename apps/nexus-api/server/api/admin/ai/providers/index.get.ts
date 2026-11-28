import { defineEventHandler, getQuery } from 'h3'
import { PROVIDER_PROTOCOLS } from '#shared/provider-registry'
import { requireAdmin } from '../../../../utils/auth'
import { hasProviderCredential } from '../../../../utils/providerCredentialStore'
import { getLatestProviderHealthChecks } from '../../../../utils/providerHealthStore'
import { extractProviderQuotaConfig } from '../../../../utils/providerQuota'
import {
  listProviderRegistryEntries,
  type ProviderRegistryOwnerScope,
  type ProviderRegistryStatus,
  type ProviderRegistryVendor,
} from '../../../../utils/providerRegistryStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = getQuery(event)
  const vendor = typeof query.vendor === 'string' && query.vendor.trim()
    ? query.vendor.trim() as ProviderRegistryVendor
    : undefined
  const status = typeof query.status === 'string' && query.status.trim()
    ? query.status.trim() as ProviderRegistryStatus
    : undefined
  const ownerScope = typeof query.ownerScope === 'string' && query.ownerScope.trim()
    ? query.ownerScope.trim() as ProviderRegistryOwnerScope
    : undefined

  const providers = await listProviderRegistryEntries(event, { vendor, status, ownerScope })
  const [healthMap, credentialFlags] = await Promise.all([
    getLatestProviderHealthChecks(event, { providerIds: providers.map(p => p.id) }).catch(() => new Map()),
    Promise.all(providers.map(async (provider) => {
      if (provider.authType === 'none' || !provider.authRef)
        return false
      return await hasProviderCredential(event, provider.authRef).catch(() => false)
    })),
  ])

  return {
    providers: providers.map((provider, index) => ({
      ...provider,
      hasCredential: provider.authType === 'none' ? true : Boolean(credentialFlags[index]),
      quota: extractProviderQuotaConfig(provider.metadata),
      latestHealth: healthMap.get(provider.id) ?? null,
    })),
    adapters: PROVIDER_PROTOCOLS,
  }
})
