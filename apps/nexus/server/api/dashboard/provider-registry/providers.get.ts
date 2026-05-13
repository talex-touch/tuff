import type { ProviderRegistryOwnerScope, ProviderRegistryStatus, ProviderRegistryVendor } from '../../../utils/providerRegistryStore'
import { getQuery } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { listProviderRegistryEntries } from '../../../utils/providerRegistryStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = getQuery(event)

  const providers = await listProviderRegistryEntries(event, {
    vendor: typeof query.vendor === 'string' ? query.vendor as ProviderRegistryVendor : undefined,
    status: typeof query.status === 'string' ? query.status as ProviderRegistryStatus : undefined,
    ownerScope: typeof query.ownerScope === 'string' ? query.ownerScope as ProviderRegistryOwnerScope : undefined,
  })

  return { providers }
})
