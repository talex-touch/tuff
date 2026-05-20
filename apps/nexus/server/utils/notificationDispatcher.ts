import type { H3Event } from 'h3'
import type { PlatformGovernanceConfig } from './platformGovernanceStore'
import { listPlatformGovernanceConfigs, recordPlatformGovernanceEvent } from './platformGovernanceStore'
import { isPlainObject, normalizeString } from './telemetrySanitizer'

export type NotificationDeliveryStatus = 'planned' | 'skipped' | 'failed'

export interface DispatchNotificationInput {
  action: string
  actorId?: string | null
  resourceType?: string | null
  resourceId?: string | null
  deliveryChannels?: string[]
  deliveryProviders?: string[]
  metadata?: Record<string, unknown> | null
  occurredAt?: string
}

export interface NotificationDeliveryRecord {
  configId: string
  configName: string
  action: string
  channel: string
  provider: string | null
  adapter: string
  status: NotificationDeliveryStatus
  reason: string
  credentialRequired: boolean
  hasCredentialRef: boolean
  resourceType: string | null
  resourceId: string | null
}

const SUPPORTED_ADAPTERS = new Set([
  'browser',
  'email/resend',
  'email/smtp',
  'email/generic',
  'feishu',
  'lark',
  'webhook',
])

const CREDENTIAL_REQUIRED_ADAPTERS = new Set([
  'email/resend',
  'email/smtp',
  'email/generic',
  'feishu',
  'lark',
  'webhook',
])

const SENSITIVE_METADATA_KEYS = new Set([
  'actorid',
  'auth',
  'authref',
  'credential',
  'credentialref',
  'email',
  'from',
  'password',
  'recipient',
  'recipients',
  'secret',
  'secretkey',
  'token',
  'to',
  'userid',
  'webhookurl',
])

function normalizeToken(value: unknown, maxLength = 120): string | null {
  return normalizeString(value, maxLength)?.toLowerCase() ?? null
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value))
    return []
  return value
    .map(item => normalizeToken(item))
    .filter((item): item is string => Boolean(item))
}

function normalizeOptionalList(value: string[] | undefined): string[] {
  if (!Array.isArray(value))
    return []
  return value
    .map(item => normalizeToken(item))
    .filter((item): item is string => Boolean(item))
}

function normalizeMetadataKey(key: string): string {
  return key.replace(/[-_\s]/g, '').toLowerCase()
}

function containsEmailLike(value: string): boolean {
  return /\S+@\S+\.\S+/.test(value)
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (typeof value === 'string') {
    const normalized = normalizeString(value, 160)
    if (!normalized || containsEmailLike(normalized))
      return undefined
    return normalized
  }
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : undefined
  if (typeof value === 'boolean')
    return value
  if (Array.isArray(value)) {
    const items = value
      .map(item => sanitizeMetadataValue(item))
      .filter(item => item !== undefined)
      .slice(0, 20)
    return items.length ? items : undefined
  }
  return undefined
}

function sanitizeDispatchMetadata(value: unknown): Record<string, unknown> | null {
  if (!isPlainObject(value))
    return null

  const entries: Array<[string, unknown]> = []
  for (const [key, raw] of Object.entries(value).slice(0, 30)) {
    const normalizedKey = normalizeString(key, 64)
    if (!normalizedKey || SENSITIVE_METADATA_KEYS.has(normalizeMetadataKey(normalizedKey)))
      continue
    const safeValue = sanitizeMetadataValue(raw)
    if (safeValue !== undefined)
      entries.push([normalizedKey, safeValue])
  }
  return entries.length ? Object.fromEntries(entries) : null
}

function resolveCredentialRef(config: PlatformGovernanceConfig): string | null {
  const value = config.config?.credentialRef ?? config.config?.authRef
  const normalized = normalizeString(value, 255)
  return normalized?.startsWith('secure://') ? normalized : null
}

function resolveAdapter(config: PlatformGovernanceConfig): string {
  const channel = normalizeToken(config.channel) ?? 'browser'
  const provider = normalizeToken(config.provider)

  if (channel === 'email')
    return provider ? `email/${provider}` : 'email/generic'
  if (channel === 'feishu' || provider === 'feishu')
    return 'feishu'
  if (channel === 'lark' || provider === 'lark')
    return 'lark'
  if (channel === 'webhook' || provider === 'webhook')
    return 'webhook'
  if (channel === 'browser')
    return 'browser'
  return provider ? `${channel}/${provider}` : channel
}

function configMatchesTarget(config: PlatformGovernanceConfig, input: DispatchNotificationInput): boolean {
  if (!config.targetId)
    return true
  if (input.resourceId === config.targetId)
    return true
  return input.metadata?.pluginId === config.targetId
}

function evaluateDelivery(
  config: PlatformGovernanceConfig,
  input: DispatchNotificationInput,
): NotificationDeliveryRecord {
  const adapter = resolveAdapter(config)
  const channel = normalizeToken(config.channel) ?? 'browser'
  const provider = normalizeToken(config.provider)
  const credentialRef = resolveCredentialRef(config)
  const credentialRequired = CREDENTIAL_REQUIRED_ADAPTERS.has(adapter)
  const channelFilter = normalizeOptionalList(input.deliveryChannels)
  const providerFilter = normalizeOptionalList(input.deliveryProviders)
  const configuredEvents = normalizeStringList(config.config?.events)
  let status: NotificationDeliveryStatus = 'planned'
  let reason = 'delivery-planned'

  if (!config.enabled) {
    status = 'skipped'
    reason = 'channel-disabled'
  }
  else if (channelFilter.length && !channelFilter.includes(channel)) {
    status = 'skipped'
    reason = 'channel-filter-mismatch'
  }
  else if (providerFilter.length && (!provider || !providerFilter.includes(provider))) {
    status = 'skipped'
    reason = 'provider-filter-mismatch'
  }
  else if (configuredEvents.length && !configuredEvents.includes(input.action)) {
    status = 'skipped'
    reason = 'event-mismatch'
  }
  else if (!configMatchesTarget(config, input)) {
    status = 'skipped'
    reason = 'target-mismatch'
  }
  else if (!SUPPORTED_ADAPTERS.has(adapter)) {
    status = 'failed'
    reason = 'unsupported-adapter'
  }
  else if (credentialRequired && !credentialRef) {
    status = 'failed'
    reason = 'credential-ref-required'
  }

  return {
    configId: config.id,
    configName: config.name,
    action: input.action,
    channel,
    provider,
    adapter,
    status,
    reason,
    credentialRequired,
    hasCredentialRef: Boolean(credentialRef),
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
  }
}

async function recordDeliveryAudit(
  event: H3Event | undefined,
  delivery: NotificationDeliveryRecord,
  input: DispatchNotificationInput,
) {
  const context = sanitizeDispatchMetadata(input.metadata)
  await recordPlatformGovernanceEvent(event, {
    scope: 'notification',
    action: `notification.delivery.${delivery.status}`,
    actorId: input.actorId,
    resourceType: input.resourceType ?? undefined,
    resourceId: input.resourceId ?? undefined,
    channel: delivery.channel,
    unit: 'delivery',
    quantity: delivery.status === 'planned' ? 1 : 0,
    occurredAt: input.occurredAt,
    metadata: {
      notificationAction: input.action,
      configId: delivery.configId,
      configName: delivery.configName,
      provider: delivery.provider,
      adapter: delivery.adapter,
      reason: delivery.reason,
      credentialRequired: delivery.credentialRequired,
      hasCredentialRef: delivery.hasCredentialRef,
      context,
    },
  })
}

export async function dispatchNotificationEvent(
  event: H3Event | undefined,
  input: DispatchNotificationInput,
): Promise<NotificationDeliveryRecord[]> {
  const action = normalizeToken(input.action)
  if (!action)
    return []

  const normalizedInput: DispatchNotificationInput = {
    ...input,
    action,
  }
  const configs = await listPlatformGovernanceConfigs(event, {
    configType: 'notification_channel',
  })
  const deliveries = configs.map(config => evaluateDelivery(config, normalizedInput))

  await Promise.all(deliveries.map(delivery => recordDeliveryAudit(event, delivery, normalizedInput)))
  return deliveries
}
