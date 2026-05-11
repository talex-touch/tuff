import type { ProviderRegistryVendor } from '../../../utils/providerRegistryStore'
import { getQuery } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { listProviderCapabilities } from '../../../utils/providerRegistryStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = getQuery(event)

  const capabilities = await listProviderCapabilities(event, {
    providerId: typeof query.providerId === 'string' ? query.providerId : undefined,
    vendor: typeof query.vendor === 'string' ? query.vendor as ProviderRegistryVendor : undefined,
    capability: typeof query.capability === 'string' ? query.capability : undefined,
  })

  return { capabilities }
})
