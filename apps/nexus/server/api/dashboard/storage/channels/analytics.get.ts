import { getQuery } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import { getStorageChannelGovernanceAnalytics } from '../../../../utils/platformGovernanceStore'

function readPositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'string')
    return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = getQuery(event)

  return await getStorageChannelGovernanceAnalytics(event, {
    days: readPositiveInt(query.days, 30),
    limit: readPositiveInt(query.limit, 5000),
    topLimit: readPositiveInt(query.topLimit, 12),
    channel: readOptionalString(query.channel),
    provider: readOptionalString(query.provider),
  })
})
