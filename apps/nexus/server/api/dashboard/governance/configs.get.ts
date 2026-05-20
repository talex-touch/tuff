import { getQuery } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import type { GovernanceConfigType, GovernanceOwnerScope } from '../../../utils/platformGovernanceStore'
import { listPlatformGovernanceConfigs } from '../../../utils/platformGovernanceStore'

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readBoolean(value: unknown): boolean | undefined {
  if (value === 'true')
    return true
  if (value === 'false')
    return false
  return undefined
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = getQuery(event)

  const configs = await listPlatformGovernanceConfigs(event, {
    configType: readString(query.configType) as GovernanceConfigType | undefined,
    ownerScope: readString(query.ownerScope) as GovernanceOwnerScope | undefined,
    ownerId: readString(query.ownerId),
    targetId: readString(query.targetId),
    channel: readString(query.channel),
    provider: readString(query.provider),
    enabled: readBoolean(query.enabled),
  })

  return {
    configs,
    generatedAt: new Date().toISOString(),
  }
})
