import { createError, getQuery, readBody } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import { dispatchNotificationEvent } from '../../../../utils/notificationDispatcher'
import { buildStoragePolicyAlerts, evaluateStorageChannelPolicy, listPlatformGovernanceConfigs } from '../../../../utils/platformGovernanceStore'
import { normalizeString } from '../../../../utils/telemetrySanitizer'

type StorageAlertNotifyMode = 'plan' | 'send'

function readPositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'string' && typeof value !== 'number')
    return fallback
  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeMode(value: unknown): StorageAlertNotifyMode {
  if (value == null || value === '')
    return 'plan'
  if (value === 'plan' || value === 'send')
    return value
  throw createError({ statusCode: 400, statusMessage: 'mode must be plan or send.' })
}

function normalizeOptionalList(value: unknown): string[] | undefined {
  if (!Array.isArray(value))
    return undefined

  const items = value
    .map(item => normalizeString(item, 180))
    .filter((item): item is string => Boolean(item))
    .slice(0, 20)

  return items.length ? items : undefined
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const query = getQuery(event)
  const body = await readBody(event)
  const mode = normalizeMode(body?.mode)
  const days = readPositiveInt(body?.days ?? query.days, 1)
  const limit = readPositiveInt(body?.limit ?? query.limit, 5000)

  const policies = await listPlatformGovernanceConfigs(event, {
    configType: 'storage_channel',
  })
  const evaluations = await Promise.all(
    policies.map(policy => evaluateStorageChannelPolicy(event, policy, { days, limit })),
  )
  const alerts = buildStoragePolicyAlerts(evaluations)

  const deliveryConfigIds = normalizeOptionalList(body?.deliveryConfigIds)
  const deliveryChannels = normalizeOptionalList(body?.deliveryChannels)
  const deliveryProviders = normalizeOptionalList(body?.deliveryProviders)
  const dispatches = await Promise.all(alerts.map(async (alert) => {
    const deliveries = await dispatchNotificationEvent(event, {
      action: 'storage.policy.alert',
      actorId: userId,
      resourceType: 'storage_policy',
      resourceId: alert.policyId,
      deliveryConfigIds,
      deliveryChannels,
      deliveryProviders,
      executionMode: mode === 'plan' ? 'plan' : 'config',
      metadata: {
        storageAlert: true,
        policyName: alert.name,
        storageChannel: alert.channel,
        storageProvider: alert.provider ?? 'unknown',
        metric: alert.metric,
        limitKey: alert.limitKey,
        usage: alert.usage,
        limit: alert.limit,
        utilization: alert.utilization,
        status: alert.status,
        reasons: alert.reasons,
        days,
      },
    })

    return {
      alert,
      deliveries,
    }
  }))

  return {
    mode,
    days,
    alerts,
    dispatches,
    generatedAt: new Date().toISOString(),
  }
})
