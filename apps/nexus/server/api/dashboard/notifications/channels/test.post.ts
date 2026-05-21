import { createError, readBody } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import { dispatchNotificationEvent } from '../../../../utils/notificationDispatcher'
import { listPlatformGovernanceConfigs } from '../../../../utils/platformGovernanceStore'
import { isPlainObject, normalizeString } from '../../../../utils/telemetrySanitizer'

type ChannelTestMode = 'plan' | 'send'

function normalizeBodyString(value: unknown, field: string, maxLength = 180): string {
  const normalized = normalizeString(value, maxLength)
  if (!normalized)
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  return normalized
}

function normalizeAction(value: unknown): string {
  const action = value == null
    ? 'system.notification.test'
    : normalizeBodyString(value, 'action', 120)
  if (!/^[a-z0-9][a-z0-9._:-]{0,119}$/i.test(action)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'action is invalid.',
    })
  }
  return action
}

function normalizeMode(value: unknown): ChannelTestMode {
  if (value == null || value === '')
    return 'plan'
  if (value === 'plan' || value === 'send')
    return value
  throw createError({ statusCode: 400, statusMessage: 'mode must be plan or send.' })
}

function normalizeMetadata(value: unknown): Record<string, unknown> | null {
  if (value == null)
    return null
  if (!isPlainObject(value))
    throw createError({ statusCode: 400, statusMessage: 'metadata must be an object.' })
  return value
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody(event)
  const configId = normalizeBodyString(body?.configId, 'configId', 180)
  const action = normalizeAction(body?.action)
  const mode = normalizeMode(body?.mode)
  const metadata = normalizeMetadata(body?.metadata)
  const resourceType = body?.resourceType == null
    ? 'notification_channel'
    : normalizeBodyString(body.resourceType, 'resourceType', 80)
  const resourceId = body?.resourceId == null
    ? configId
    : normalizeBodyString(body.resourceId, 'resourceId', 180)

  const [channel] = (await listPlatformGovernanceConfigs(event, {
    configType: 'notification_channel',
  })).filter(item => item.id === configId)

  if (!channel) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Notification channel config not found.',
    })
  }

  const deliveries = await dispatchNotificationEvent(event, {
    action,
    actorId: userId,
    resourceType,
    resourceId,
    deliveryConfigIds: [configId],
    executionMode: mode === 'plan' ? 'plan' : 'config',
    metadata: {
      ...(metadata ?? {}),
      test: true,
      channelTestId: configId,
    },
  })

  return {
    channel: {
      id: channel.id,
      name: channel.name,
      channel: channel.channel,
      provider: channel.provider,
      enabled: channel.enabled,
    },
    action,
    mode,
    deliveries,
    generatedAt: new Date().toISOString(),
  }
})
