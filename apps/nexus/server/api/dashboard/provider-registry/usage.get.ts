import type { ProviderUsageLedgerMode, ProviderUsageLedgerStatus } from '../../../utils/providerUsageLedgerStore'
import { getQuery } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { listProviderUsageLedgerEntries } from '../../../utils/providerUsageLedgerStore'

function readPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'string')
    return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = getQuery(event)

  const ledger = await listProviderUsageLedgerEntries(event, {
    runId: typeof query.runId === 'string' ? query.runId : undefined,
    sceneId: typeof query.sceneId === 'string' ? query.sceneId : undefined,
    providerId: typeof query.providerId === 'string' ? query.providerId : undefined,
    capability: typeof query.capability === 'string' ? query.capability : undefined,
    status: typeof query.status === 'string' ? query.status as ProviderUsageLedgerStatus : undefined,
    mode: typeof query.mode === 'string' ? query.mode as ProviderUsageLedgerMode : undefined,
    page: readPositiveInteger(query.page),
    limit: readPositiveInteger(query.limit),
  })

  return ledger
})
