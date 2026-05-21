import { getQuery } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { buildStoragePolicyAlerts, evaluateStorageChannelPolicy, listPlatformGovernanceConfigs } from '../../../utils/platformGovernanceStore'
import { listStorageChannelProfiles } from '../../../utils/storageChannelCatalog'

function readPositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'string')
    return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = getQuery(event)
  const days = readPositiveInt(query.days, 1)
  const limit = readPositiveInt(query.limit, 5000)

  const policies = await listPlatformGovernanceConfigs(event, {
    configType: 'storage_channel',
  })
  const evaluations = await Promise.all(
    policies.map(policy => evaluateStorageChannelPolicy(event, policy, { days, limit })),
  )

  return {
    policies,
    evaluations,
    alerts: buildStoragePolicyAlerts(evaluations),
    profiles: listStorageChannelProfiles(),
    generatedAt: new Date().toISOString(),
  }
})
