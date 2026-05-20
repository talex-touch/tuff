import { getQuery } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { listPlatformGovernanceEvents } from '../../../utils/platformGovernanceStore'

function readPositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'string')
    return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = getQuery(event)

  const events = await listPlatformGovernanceEvents(event, {
    scope: readString(query.scope),
    action: readString(query.action),
    resourceType: readString(query.resourceType),
    resourceId: readString(query.resourceId),
    channel: readString(query.channel),
    days: readPositiveInt(query.days, 30),
    limit: readPositiveInt(query.limit, 100),
  })

  return {
    events,
    generatedAt: new Date().toISOString(),
  }
})
