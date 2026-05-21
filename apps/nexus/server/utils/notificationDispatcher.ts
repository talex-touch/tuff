import type { H3Event } from 'h3'
import type { PlatformGovernanceConfig } from './platformGovernanceStore'
import type { NotificationCredentialPayload } from './notificationCredentialStore'
import { createHmac } from 'node:crypto'
import { networkClient } from '@talex-touch/utils/network'
import { storeBrowserNotification } from './browserNotificationInboxStore'
import { getNotificationCredential, notificationCredentialExists } from './notificationCredentialStore'
import { listPlatformGovernanceConfigs, recordPlatformGovernanceEvent } from './platformGovernanceStore'
import { isPlainObject, normalizeString } from './telemetrySanitizer'

export type NotificationDeliveryStatus = 'planned' | 'sent' | 'skipped' | 'failed'

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
  providerType: string | null
  adapter: string
  status: NotificationDeliveryStatus
  reason: string
  credentialRequired: boolean
  hasCredentialRef: boolean
  resourceType: string | null
  resourceId: string | null
}

interface EvaluatedNotificationDelivery extends NotificationDeliveryRecord {
  credentialRef: string | null
  config: PlatformGovernanceConfig
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

const SENDABLE_HTTP_ADAPTERS = new Set([
  'email/resend',
  'email/generic',
  'feishu',
  'lark',
  'webhook',
])

const SENDABLE_LOCAL_ADAPTERS = new Set([
  'browser',
])

const LEGACY_PROVIDER_ADAPTERS = new Set([
  'browser',
  'resend',
  'smtp',
  'generic',
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
  return normalized && normalized.startsWith('secure://') ? normalized : null
}

function readConfigString(config: PlatformGovernanceConfig, key: string, maxLength = 512): string | null {
  return normalizeString(config.config?.[key], maxLength) ?? null
}

function readConfigNumber(config: PlatformGovernanceConfig, key: string, fallback: number, min: number, max: number): number {
  const value = config.config?.[key]
  if (typeof value !== 'number' || !Number.isFinite(value))
    return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

function isSendMode(config: PlatformGovernanceConfig): boolean {
  return normalizeToken(config.config?.mode) === 'send'
}

function normalizeAdapter(channel: string, value: string): string {
  if (value.includes('/'))
    return value
  if (channel === 'email')
    return `email/${value}`
  if (value === 'resend' || value === 'smtp' || value === 'generic')
    return `email/${value}`
  return value
}

function resolveAdapterProfile(config: PlatformGovernanceConfig): { adapter: string, providerType: string | null } {
  const channel = normalizeToken(config.channel) ?? 'browser'
  const provider = normalizeToken(config.provider)
  const configuredType = normalizeToken(config.config?.providerType)
    ?? normalizeToken(config.config?.adapter)
    ?? normalizeToken(config.config?.driver)
  const legacyProviderType = provider && LEGACY_PROVIDER_ADAPTERS.has(provider) ? provider : null
  const providerType = configuredType ?? legacyProviderType

  if (providerType) {
    return {
      adapter: normalizeAdapter(channel, providerType),
      providerType,
    }
  }

  if (channel === 'email') {
    return {
      adapter: 'email/generic',
      providerType: 'generic',
    }
  }

  return {
    adapter: normalizeAdapter(channel, channel),
    providerType: channel,
  }
}

function configMatchesTarget(config: PlatformGovernanceConfig, input: DispatchNotificationInput): boolean {
  if (!config.targetId)
    return true
  if (input.resourceId === config.targetId)
    return true
  return input.metadata?.pluginId === config.targetId
}

function createNotificationText(delivery: EvaluatedNotificationDelivery, input: DispatchNotificationInput): string {
  const lines = [
    `Tuff notification: ${input.action}`,
    delivery.resourceType ? `Resource: ${delivery.resourceType}/${delivery.resourceId ?? 'unknown'}` : '',
  ].filter(Boolean)
  const context = sanitizeDispatchMetadata(input.metadata)
  if (context && Object.keys(context).length > 0)
    lines.push(`Context: ${JSON.stringify(context)}`)
  return lines.join('\n')
}

function createNotificationTitle(delivery: EvaluatedNotificationDelivery, input: DispatchNotificationInput): string {
  return readConfigString(delivery.config, 'title', 180)
    ?? readConfigString(delivery.config, 'subject', 180)
    ?? `[Tuff] ${input.action}`
}

function resolveBrowserNotificationUserId(
  delivery: EvaluatedNotificationDelivery,
  input: DispatchNotificationInput,
): string | null {
  const configuredUserId = readConfigString(delivery.config, 'userId', 180)
    ?? readConfigString(delivery.config, 'ownerId', 180)
  if (configuredUserId)
    return configuredUserId
  if (delivery.config.ownerScope === 'user' && delivery.config.ownerId)
    return delivery.config.ownerId
  return normalizeString(input.metadata?.userId ?? input.metadata?.ownerId ?? input.metadata?.developerId, 180) ?? null
}

function readRecipients(input: DispatchNotificationInput): string[] {
  const raw = input.metadata?.to ?? input.metadata?.recipients
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map(item => normalizeString(item, 320))
      .filter((item): item is string => Boolean(item))
      .slice(0, 20)
  }
  if (!Array.isArray(raw))
    return []
  return raw
    .map(item => normalizeString(item, 320))
    .filter((item): item is string => Boolean(item))
    .slice(0, 20)
}

function hasApiKeyCredential(credential: NotificationCredentialPayload): credential is { apiKey: string } {
  return 'apiKey' in credential && typeof credential.apiKey === 'string' && credential.apiKey.length > 0
}

function hasWebhookCredential(credential: NotificationCredentialPayload): credential is { url: string, signingSecret?: string } {
  return 'url' in credential && typeof credential.url === 'string' && credential.url.length > 0
}

function hasBotTokenCredential(credential: NotificationCredentialPayload): credential is { token: string } {
  return 'token' in credential && typeof credential.token === 'string' && credential.token.length > 0
}

function resolveBotWebhookUrl(adapter: string, credential: NotificationCredentialPayload): string | null {
  if (hasWebhookCredential(credential))
    return credential.url
  if (!hasBotTokenCredential(credential))
    return null
  const host = adapter === 'lark' ? 'https://open.larksuite.com' : 'https://open.feishu.cn'
  return `${host}/open-apis/bot/v2/hook/${encodeURIComponent(credential.token)}`
}

function signBody(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex')
}

async function sendResendNotification(
  delivery: EvaluatedNotificationDelivery,
  input: DispatchNotificationInput,
  credential: NotificationCredentialPayload,
): Promise<'sent' | 'credential-type-mismatch' | 'recipient-missing' | 'sender-missing' | 'adapter-http-error' | 'adapter-request-failed'> {
  if (!hasApiKeyCredential(credential))
    return 'credential-type-mismatch'

  const recipients = readRecipients(input)
  if (recipients.length === 0)
    return 'recipient-missing'

  const from = readConfigString(delivery.config, 'from', 320)
  if (!from)
    return 'sender-missing'

  const subject = readConfigString(delivery.config, 'subject', 240) ?? `[Tuff] ${input.action}`
  const text = readConfigString(delivery.config, 'text', 4000) ?? createNotificationText(delivery, input)
  const response = await networkClient.request({
    method: 'POST',
    url: 'https://api.resend.com/emails',
    timeoutMs: readConfigNumber(delivery.config, 'timeoutMs', 10000, 1000, 30000),
    validateStatus: Array.from({ length: 500 }, (_, index) => index + 100),
    headers: {
      Authorization: `Bearer ${credential.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      from,
      to: recipients,
      subject,
      text,
    },
  })

  return response.status >= 200 && response.status < 300 ? 'sent' : 'adapter-http-error'
}

async function sendWebhookNotification(
  delivery: EvaluatedNotificationDelivery,
  input: DispatchNotificationInput,
  credential: NotificationCredentialPayload,
): Promise<'sent' | 'credential-type-mismatch' | 'adapter-http-error' | 'adapter-request-failed'> {
  if (!hasWebhookCredential(credential))
    return 'credential-type-mismatch'

  const body = JSON.stringify({
    action: input.action,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    metadata: sanitizeDispatchMetadata(input.metadata),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  })
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (credential.signingSecret)
    headers['X-Tuff-Signature'] = signBody(body, credential.signingSecret)

  const response = await networkClient.request({
    method: 'POST',
    url: credential.url,
    timeoutMs: readConfigNumber(delivery.config, 'timeoutMs', 10000, 1000, 30000),
    validateStatus: Array.from({ length: 500 }, (_, index) => index + 100),
    headers,
    body,
  })

  return response.status >= 200 && response.status < 300 ? 'sent' : 'adapter-http-error'
}

async function sendGenericEmailNotification(
  delivery: EvaluatedNotificationDelivery,
  input: DispatchNotificationInput,
  credential: NotificationCredentialPayload,
): Promise<'sent' | 'credential-type-mismatch' | 'recipient-missing' | 'sender-missing' | 'adapter-http-error' | 'adapter-request-failed'> {
  if (!hasWebhookCredential(credential))
    return 'credential-type-mismatch'

  const recipients = readRecipients(input)
  if (recipients.length === 0)
    return 'recipient-missing'

  const from = readConfigString(delivery.config, 'from', 320)
  if (!from)
    return 'sender-missing'

  const body = JSON.stringify({
    action: input.action,
    from,
    to: recipients,
    subject: readConfigString(delivery.config, 'subject', 240) ?? `[Tuff] ${input.action}`,
    text: readConfigString(delivery.config, 'text', 4000) ?? createNotificationText(delivery, input),
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    metadata: sanitizeDispatchMetadata(input.metadata),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  })
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (credential.signingSecret)
    headers['X-Tuff-Signature'] = signBody(body, credential.signingSecret)

  const response = await networkClient.request({
    method: 'POST',
    url: credential.url,
    timeoutMs: readConfigNumber(delivery.config, 'timeoutMs', 10000, 1000, 30000),
    validateStatus: Array.from({ length: 500 }, (_, index) => index + 100),
    headers,
    body,
  })

  return response.status >= 200 && response.status < 300 ? 'sent' : 'adapter-http-error'
}

async function sendBotWebhookNotification(
  delivery: EvaluatedNotificationDelivery,
  input: DispatchNotificationInput,
  credential: NotificationCredentialPayload,
): Promise<'sent' | 'credential-type-mismatch' | 'adapter-http-error' | 'adapter-request-failed'> {
  const url = resolveBotWebhookUrl(delivery.adapter, credential)
  if (!url)
    return 'credential-type-mismatch'

  const response = await networkClient.request({
    method: 'POST',
    url,
    timeoutMs: readConfigNumber(delivery.config, 'timeoutMs', 10000, 1000, 30000),
    validateStatus: Array.from({ length: 500 }, (_, index) => index + 100),
    headers: {
      'Content-Type': 'application/json',
    },
    body: {
      msg_type: 'text',
      content: {
        text: readConfigString(delivery.config, 'text', 4000) ?? createNotificationText(delivery, input),
      },
    },
  })

  return response.status >= 200 && response.status < 300 ? 'sent' : 'adapter-http-error'
}

async function sendNotification(
  delivery: EvaluatedNotificationDelivery,
  input: DispatchNotificationInput,
  credential: NotificationCredentialPayload,
): Promise<string> {
  try {
    if (delivery.adapter === 'email/resend')
      return await sendResendNotification(delivery, input, credential)
    if (delivery.adapter === 'email/generic')
      return await sendGenericEmailNotification(delivery, input, credential)
    if (delivery.adapter === 'webhook')
      return await sendWebhookNotification(delivery, input, credential)
    if (delivery.adapter === 'feishu' || delivery.adapter === 'lark')
      return await sendBotWebhookNotification(delivery, input, credential)
    return 'send-adapter-unsupported'
  }
  catch {
    return 'adapter-request-failed'
  }
}

async function sendBrowserNotification(
  event: H3Event | undefined,
  delivery: EvaluatedNotificationDelivery,
  input: DispatchNotificationInput,
): Promise<'sent' | 'recipient-missing' | 'adapter-request-failed'> {
  const userId = resolveBrowserNotificationUserId(delivery, input)
  if (!userId)
    return 'recipient-missing'

  try {
    await storeBrowserNotification(event, {
      userId,
      action: input.action,
      title: createNotificationTitle(delivery, input),
      body: readConfigString(delivery.config, 'body', 4000)
        ?? readConfigString(delivery.config, 'text', 4000)
        ?? createNotificationText(delivery, input),
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: input.metadata,
      occurredAt: input.occurredAt,
    })
    return 'sent'
  }
  catch {
    return 'adapter-request-failed'
  }
}

function evaluateDelivery(
  config: PlatformGovernanceConfig,
  input: DispatchNotificationInput,
): EvaluatedNotificationDelivery {
  const { adapter, providerType } = resolveAdapterProfile(config)
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
  else if (providerFilter.length && ![provider, providerType, adapter].some(item => item && providerFilter.includes(item))) {
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
    providerType,
    adapter,
    status,
    reason,
    credentialRequired,
    hasCredentialRef: Boolean(credentialRef),
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    credentialRef,
    config,
  }
}

async function recordDeliveryAudit(
  event: H3Event | undefined,
  delivery: EvaluatedNotificationDelivery,
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
    quantity: delivery.status === 'planned' || delivery.status === 'sent' ? 1 : 0,
    occurredAt: input.occurredAt,
    metadata: {
      notificationAction: input.action,
      configId: delivery.configId,
      configName: delivery.configName,
      provider: delivery.provider,
      providerType: delivery.providerType,
      adapter: delivery.adapter,
      reason: delivery.reason,
      credentialRequired: delivery.credentialRequired,
      hasCredentialRef: delivery.hasCredentialRef,
      context,
    },
  })
}

async function verifyCredentialRef(
  event: H3Event | undefined,
  delivery: EvaluatedNotificationDelivery,
): Promise<EvaluatedNotificationDelivery> {
  if (delivery.status !== 'planned' || !delivery.credentialRequired || !delivery.credentialRef)
    return delivery
  if (!event)
    return delivery

  try {
    const exists = await notificationCredentialExists(event, delivery.credentialRef)
    if (exists === false) {
      return {
        ...delivery,
        status: 'failed',
        reason: 'credential-missing',
      }
    }
  }
  catch {
    return {
      ...delivery,
      status: 'failed',
      reason: 'credential-ref-invalid',
    }
  }

  return delivery
}

async function executeDelivery(
  event: H3Event | undefined,
  delivery: EvaluatedNotificationDelivery,
  input: DispatchNotificationInput,
): Promise<EvaluatedNotificationDelivery> {
  if (delivery.status !== 'planned' || !isSendMode(delivery.config))
    return delivery
  if (SENDABLE_LOCAL_ADAPTERS.has(delivery.adapter)) {
    const result = await sendBrowserNotification(event, delivery, input)
    return result === 'sent'
      ? {
          ...delivery,
          status: 'sent',
          reason: 'delivery-sent',
        }
      : {
          ...delivery,
          status: 'failed',
          reason: result,
        }
  }
  if (!SENDABLE_HTTP_ADAPTERS.has(delivery.adapter)) {
    return {
      ...delivery,
      status: 'failed',
      reason: 'send-adapter-unsupported',
    }
  }
  if (!event || !delivery.credentialRef) {
    return {
      ...delivery,
      status: 'failed',
      reason: 'credential-ref-required',
    }
  }

  const credential = await getNotificationCredential(event, delivery.credentialRef)
  if (!credential) {
    return {
      ...delivery,
      status: 'failed',
      reason: 'credential-missing',
    }
  }

  const result = await sendNotification(delivery, input, credential)
  if (result === 'sent') {
    return {
      ...delivery,
      status: 'sent',
      reason: 'delivery-sent',
    }
  }

  return {
    ...delivery,
    status: 'failed',
    reason: result,
  }
}

function toDeliveryRecord(delivery: EvaluatedNotificationDelivery): NotificationDeliveryRecord {
  const { config: _config, credentialRef: _credentialRef, ...record } = delivery
  return record
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
  const deliveries = await Promise.all(configs
    .map(config => evaluateDelivery(config, normalizedInput))
    .map(delivery => verifyCredentialRef(event, delivery)))
  const dispatchedDeliveries = await Promise.all(deliveries.map(delivery => executeDelivery(event, delivery, normalizedInput)))

  await Promise.all(dispatchedDeliveries.map(delivery => recordDeliveryAudit(event, delivery, normalizedInput)))
  return dispatchedDeliveries.map(toDeliveryRecord)
}
