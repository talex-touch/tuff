import type { ProviderHealthStatus } from '../../../utils/providerHealthStore'
import { getQuery } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { listProviderHealthChecks } from '../../../utils/providerHealthStore'

function readPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'string')
    return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = getQuery(event)

  return await listProviderHealthChecks(event, {
    providerId: typeof query.providerId === 'string' ? query.providerId : undefined,
    capability: typeof query.capability === 'string' ? query.capability : undefined,
    status: typeof query.status === 'string' ? query.status as ProviderHealthStatus : undefined,
    page: readPositiveInteger(query.page),
    limit: readPositiveInteger(query.limit),
  })
})
