import type { H3Event } from 'h3'
import type { PlatformGovernanceConfig } from './platformGovernanceStore'
import type { NotificationCredentialPayload } from './notificationCredentialStore'
import { Buffer } from 'node:buffer'
import { createHmac } from 'node:crypto'
import { networkClient } from '@talex-touch/utils/network'
import { getUserById } from './authStore'
import { storeBrowserNotification } from './browserNotificationInboxStore'
import { listBrowserPushSubscriptionsForDelivery } from './browserPushSubscriptionStore'
import { resolveNotificationChannelProfile } from './notificationChannelCatalog'
import { getNotificationCredential, notificationCredentialExists } from './notificationCredentialStore'
import { listPlatformGovernanceConfigs, recordPlatformGovernanceEvent } from './platformGovernanceStore'
import { isPlainObject, normalizeString } from './telemetrySanitizer'

export type NotificationDeliveryStatus = 'planned' | 'sent' | 'skipped' | 'failed'

export interface DispatchNotificationInput {
  action: string
  actorId?: string | null
  resourceType?: string | null
  resourceId?: string | null
  deliveryConfigIds?: string[]
  deliveryChannels?: string[]
  deliveryProviders?: string[]
  executionMode?: 'config' | 'plan'
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
  durationMs: number
  statusCode: number | null
}

interface EvaluatedNotificationDelivery extends NotificationDeliveryRecord {
  credentialRef: string | null
  config: PlatformGovernanceConfig
}

interface NotificationSendResult {
  reason: string
  statusCode: number | null
}

const SENDABLE_HTTP_ADAPTERS = new Set([
  'email/resend',
  'email/sendgrid',
  'email/mailgun',
  'email/postmark',
  'email/smtp',
  'email/generic',
  'feishu',
  'lark',
  'webhook',
  'webpush',
])

const SENDABLE_LOCAL_ADAPTERS = new Set([
  'browser',
])

const SENSITIVE_METADATA_KEYS = new Set([
  'actorid',
  'auth',
  'authref',
  'credential',
  'credentialref',
  'email',
  'from',
  'p256dh',
  'password',
  'recipient',
  'recipients',
  'secret',
  'secretkey',
  'token',
  'to',
  'userid',
  'webhookurl',
  'webpushsubscription',
  'webpushsubscriptions',
  'pushsubscription',
  'pushsubscriptions',
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

function normalizeConfigIdFilter(value: string[] | undefined): Set<string> | null {
  if (!Array.isArray(value))
    return null
  const ids = value
    .map(item => normalizeString(item, 180))
    .filter((item): item is string => Boolean(item))
  return ids.length ? new Set(ids) : null
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

function readConfigString(config: PlatformGovernanceConfig, key: string, maxLength = 512): string | null {
  return normalizeString(config.config?.[key], maxLength) ?? null
}

function readConfigNumber(config: PlatformGovernanceConfig, key: string, fallback: number, min: number, max: number): number {
  const value = config.config?.[key]
  if (typeof value !== 'number' || !Number.isFinite(value))
    return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

function readProviderRegion(config: PlatformGovernanceConfig): string | null {
  return normalizeToken(config.config?.region, 64)
}

function isSendMode(config: PlatformGovernanceConfig): boolean {
  return normalizeToken(config.config?.mode) === 'send'
}

function configMatchesTarget(config: PlatformGovernanceConfig, input: DispatchNotificationInput): boolean {
  const configIdFilter = normalizeConfigIdFilter(input.deliveryConfigIds)
  if (configIdFilter?.has(config.id))
    return true
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

function resolveNotificationOwnerId(
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

function resolveBrowserNotificationUserId(
  delivery: EvaluatedNotificationDelivery,
  input: DispatchNotificationInput,
): string | null {
  return resolveNotificationOwnerId(delivery, input)
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

async function resolveEmailRecipients(
  event: H3Event | undefined,
  delivery: EvaluatedNotificationDelivery,
  input: DispatchNotificationInput,
): Promise<string[]> {
  const recipients = readRecipients(input)
  const ownerId = resolveNotificationOwnerId(delivery, input)
  if (event && ownerId) {
    try {
      const owner = await getUserById(event, ownerId)
      if (owner?.email)
        recipients.push(owner.email)
    }
    catch {}
  }

  const seen = new Set<string>()
  return recipients
    .filter((recipient) => {
      const key = recipient.toLowerCase()
      if (!key || seen.has(key))
        return false
      seen.add(key)
      return true
    })
    .slice(0, 20)
}

function normalizeWebPushSubscription(value: unknown): Record<string, unknown> | null {
  if (!isPlainObject(value))
    return null

  const endpoint = normalizeString(value.endpoint, 2048)
  if (!endpoint)
    return null

  try {
    const url = new URL(endpoint)
    if (url.protocol !== 'https:')
      return null
  }
  catch {
    return null
  }

  const keys = isPlainObject(value.keys)
    ? {
        p256dh: normalizeString(value.keys.p256dh, 512),
        auth: normalizeString(value.keys.auth, 512),
      }
    : null

  return {
    endpoint,
    expirationTime: typeof value.expirationTime === 'number' && Number.isFinite(value.expirationTime)
      ? Math.max(0, Math.round(value.expirationTime))
      : null,
    keys: keys?.p256dh && keys.auth ? keys : null,
  }
}

function readRuntimeWebPushSubscriptions(input: DispatchNotificationInput): Array<Record<string, unknown>> {
  const raw = input.metadata?.webPushSubscriptions
    ?? input.metadata?.webPushSubscription
    ?? input.metadata?.pushSubscriptions
    ?? input.metadata?.pushSubscription
  const values = Array.isArray(raw) ? raw : [raw]
  return values
    .map(item => normalizeWebPushSubscription(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .slice(0, 20)
}

function toWebPushSubscriptionRecord(payload: { endpoint: string, expirationTime: number | null, keys: { p256dh: string, auth: string } }): Record<string, unknown> {
  return {
    endpoint: payload.endpoint,
    expirationTime: payload.expirationTime,
    keys: {
      p256dh: payload.keys.p256dh,
      auth: payload.keys.auth,
    },
  }
}

async function readWebPushSubscriptions(
  event: H3Event | undefined,
  delivery: EvaluatedNotificationDelivery,
  input: DispatchNotificationInput,
): Promise<Array<Record<string, unknown>>> {
  const subscriptions = readRuntimeWebPushSubscriptions(input)
  const userId = resolveBrowserNotificationUserId(delivery, input)
  if (event && userId && subscriptions.length < 20) {
    const stored = await listBrowserPushSubscriptionsForDelivery(event, {
      userId,
      limit: 20 - subscriptions.length,
    })
    subscriptions.push(...stored.map(item => toWebPushSubscriptionRecord(item.payload)))
  }

  const seenEndpoints = new Set<string>()
  return subscriptions
    .filter((subscription) => {
      const endpoint = typeof subscription.endpoint === 'string' ? subscription.endpoint : ''
      if (!endpoint || seenEndpoints.has(endpoint))
        return false
      seenEndpoints.add(endpoint)
      return true
    })
    .slice(0, 20)
}

function hasApiKeyCredential(credential: NotificationCredentialPayload): credential is { apiKey: string } {
  return 'apiKey' in credential && typeof credential.apiKey === 'string' && credential.apiKey.length > 0
}

function hasWebhookCredential(credential: NotificationCredentialPayload): credential is { url: string, signingSecret?: string } {
  return 'url' in credential && typeof credential.url === 'string' && credential.url.length > 0
}

function hasSmtpCredential(credential: NotificationCredentialPayload): credential is { host: string, port?: number, username?: string, password: string, secure?: boolean, from?: string } {
  return 'host' in credential
    && typeof credential.host === 'string'
    && credential.host.length > 0
    && 'password' in credential
    && typeof credential.password === 'string'
    && credential.password.length > 0
}

function hasBotTokenCredential(credential: NotificationCredentialPayload): credential is { token: string } {
  return 'token' in credential && typeof credential.token === 'string' && credential.token.length > 0
}

function readHttpsRelayEndpoint(config: PlatformGovernanceConfig): string | null {
  const endpoint = readConfigString(config, 'endpoint', 2048)
    ?? readConfigString(config, 'relayUrl', 2048)
    ?? readConfigString(config, 'url', 2048)
  if (!endpoint)
    return null

  try {
    const url = new URL(endpoint)
    if (url.protocol === 'https:')
      return url.toString()
    if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1'))
      return url.toString()
  }
  catch {
    return null
  }

  return null
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

function createSendResult(reason: string, statusCode: number | null = null): NotificationSendResult {
  return {
    reason,
    statusCode: typeof statusCode === 'number' && Number.isFinite(statusCode)
      ? Math.round(statusCode)
      : null,
  }
}

function createHttpSendResult(statusCode: number): NotificationSendResult {
  return createSendResult(statusCode >= 200 && statusCode < 300 ? 'sent' : 'adapter-http-error', statusCode)
}

async function sendResendNotification(
  event: H3Event | undefined,
  delivery: EvaluatedNotificationDelivery,
  input: DispatchNotificationInput,
  credential: NotificationCredentialPayload,
): Promise<NotificationSendResult> {
  if (!hasApiKeyCredential(credential))
    return createSendResult('credential-type-mismatch')

  const recipients = await resolveEmailRecipients(event, delivery, input)
  if (recipients.length === 0)
    return createSendResult('recipient-missing')

  const from = readConfigString(delivery.config, 'from', 320)
  if (!from)
    return createSendResult('sender-missing')

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

  return createHttpSendResult(response.status)
}

async function sendSendgridNotification(
  event: H3Event | undefined,
  delivery: EvaluatedNotificationDelivery,
  input: DispatchNotificationInput,
  credential: NotificationCredentialPayload,
): Promise<NotificationSendResult> {
  if (!hasApiKeyCredential(credential))
    return createSendResult('credential-type-mismatch')

  const recipients = await resolveEmailRecipients(event, delivery, input)
  if (recipients.length === 0)
    return createSendResult('recipient-missing')

  const from = readConfigString(delivery.config, 'from', 320)
  if (!from)
    return createSendResult('sender-missing')

  const response = await networkClient.request({
    method: 'POST',
    url: readHttpsRelayEndpoint(delivery.config) ?? 'https://api.sendgrid.com/v3/mail/send',
    timeoutMs: readConfigNumber(delivery.config, 'timeoutMs', 10000, 1000, 30000),
    validateStatus: Array.from({ length: 500 }, (_, index) => index + 100),
    headers: {
      Authorization: `Bearer ${credential.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      personalizations: [
        {
          to: recipients.map(email => ({ email })),
        },
      ],
      from: { email: from },
      subject: readConfigString(delivery.config, 'subject', 240) ?? `[Tuff] ${input.action}`,
      content: [
        {
          type: 'text/plain',
          value: readConfigString(delivery.config, 'text', 4000) ?? createNotificationText(delivery, input),
        },
      ],
    },
  })

  return createHttpSendResult(response.status)
}

async function sendMailgunNotification(
  event: H3Event | undefined,
  delivery: EvaluatedNotificationDelivery,
  input: DispatchNotificationInput,
  credential: NotificationCredentialPayload,
): Promise<NotificationSendResult> {
  if (!hasApiKeyCredential(credential))
    return createSendResult('credential-type-mismatch')

  const recipients = await resolveEmailRecipients(event, delivery, input)
  if (recipients.length === 0)
    return createSendResult('recipient-missing')

  const from = readConfigString(delivery.config, 'from', 320)
  if (!from)
    return createSendResult('sender-missing')

  const domain = readConfigString(delivery.config, 'domain', 255)
  if (!domain)
    return createSendResult('domain-missing')

  const baseUrl = readProviderRegion(delivery.config) === 'eu'
    ? 'https://api.eu.mailgun.net'
    : 'https://api.mailgun.net'
  const endpoint = readHttpsRelayEndpoint(delivery.config)
    ?? `${baseUrl}/v3/${encodeURIComponent(domain)}/messages`
  const body = new URLSearchParams()
  body.set('from', from)
  for (const recipient of recipients)
    body.append('to', recipient)
  body.set('subject', readConfigString(delivery.config, 'subject', 240) ?? `[Tuff] ${input.action}`)
  body.set('text', readConfigString(delivery.config, 'text', 4000) ?? createNotificationText(delivery, input))

  const response = await networkClient.request({
    method: 'POST',
    url: endpoint,
    timeoutMs: readConfigNumber(delivery.config, 'timeoutMs', 10000, 1000, 30000),
    validateStatus: Array.from({ length: 500 }, (_, index) => index + 100),
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${credential.apiKey}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  return createHttpSendResult(response.status)
}

async function sendPostmarkNotification(
  event: H3Event | undefined,
  delivery: EvaluatedNotificationDelivery,
  input: DispatchNotificationInput,
  credential: NotificationCredentialPayload,
): Promise<NotificationSendResult> {
  if (!hasApiKeyCredential(credential))
    return createSendResult('credential-type-mismatch')

  const recipients = await resolveEmailRecipients(event, delivery, input)
  if (recipients.length === 0)
    return createSendResult('recipient-missing')

  const from = readConfigString(delivery.config, 'from', 320)
  if (!from)
    return createSendResult('sender-missing')

  const response = await networkClient.request({
    method: 'POST',
    url: readHttpsRelayEndpoint(delivery.config) ?? 'https://api.postmarkapp.com/email',
    timeoutMs: readConfigNumber(delivery.config, 'timeoutMs', 10000, 1000, 30000),
    validateStatus: Array.from({ length: 500 }, (_, index) => index + 100),
    headers: {
      'X-Postmark-Server-Token': credential.apiKey,
      'Content-Type': 'application/json',
    },
    body: {
      From: from,
      To: recipients.join(','),
      Subject: readConfigString(delivery.config, 'subject', 240) ?? `[Tuff] ${input.action}`,
      TextBody: readConfigString(delivery.config, 'text', 4000) ?? createNotificationText(delivery, input),
      MessageStream: readConfigString(delivery.config, 'messageStream', 120) ?? undefined,
    },
  })

  return createHttpSendResult(response.status)
}

async function sendWebhookNotification(
  delivery: EvaluatedNotificationDelivery,
  input: DispatchNotificationInput,
  credential: NotificationCredentialPayload,
): Promise<NotificationSendResult> {
  if (!hasWebhookCredential(credential))
    return createSendResult('credential-type-mismatch')

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

  return createHttpSendResult(response.status)
}

async function sendGenericEmailNotification(
  event: H3Event | undefined,
  delivery: EvaluatedNotificationDelivery,
  input: DispatchNotificationInput,
  credential: NotificationCredentialPayload,
): Promise<NotificationSendResult> {
  if (!hasWebhookCredential(credential))
    return createSendResult('credential-type-mismatch')

  const recipients = await resolveEmailRecipients(event, delivery, input)
  if (recipients.length === 0)
    return createSendResult('recipient-missing')

  const from = readConfigString(delivery.config, 'from', 320)
  if (!from)
    return createSendResult('sender-missing')

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

  return createHttpSendResult(response.status)
}

async function sendSmtpRelayNotification(
  event: H3Event | undefined,
  delivery: EvaluatedNotificationDelivery,
  input: DispatchNotificationInput,
  credential: NotificationCredentialPayload,
): Promise<NotificationSendResult> {
  if (!hasSmtpCredential(credential))
    return createSendResult('credential-type-mismatch')

  const endpoint = readHttpsRelayEndpoint(delivery.config)
  if (!endpoint)
    return createSendResult('relay-endpoint-missing')

  const recipients = await resolveEmailRecipients(event, delivery, input)
  if (recipients.length === 0)
    return createSendResult('recipient-missing')

  const from = readConfigString(delivery.config, 'from', 320) ?? credential.from
  if (!from)
    return createSendResult('sender-missing')

  const response = await networkClient.request({
    method: 'POST',
    url: endpoint,
    timeoutMs: readConfigNumber(delivery.config, 'timeoutMs', 15000, 1000, 30000),
    validateStatus: Array.from({ length: 500 }, (_, index) => index + 100),
    headers: {
      'Content-Type': 'application/json',
    },
    body: {
      adapter: 'smtp',
      action: input.action,
      smtp: {
        host: credential.host,
        port: credential.port ?? (credential.secure ? 465 : 587),
        username: credential.username ?? null,
        password: credential.password,
        secure: Boolean(credential.secure),
      },
      from,
      to: recipients,
      subject: readConfigString(delivery.config, 'subject', 240) ?? `[Tuff] ${input.action}`,
      text: readConfigString(delivery.config, 'text', 4000) ?? createNotificationText(delivery, input),
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      metadata: sanitizeDispatchMetadata(input.metadata),
      occurredAt: input.occurredAt ?? new Date().toISOString(),
    },
  })

  return createHttpSendResult(response.status)
}

async function sendWebPushRelayNotification(
  event: H3Event | undefined,
  delivery: EvaluatedNotificationDelivery,
  input: DispatchNotificationInput,
  credential: NotificationCredentialPayload,
): Promise<NotificationSendResult> {
  if (!hasWebhookCredential(credential))
    return createSendResult('credential-type-mismatch')

  const subscriptions = await readWebPushSubscriptions(event, delivery, input)
  if (subscriptions.length === 0)
    return createSendResult('subscription-missing')

  const body = JSON.stringify({
    action: input.action,
    subscriptions,
    notification: {
      title: createNotificationTitle(delivery, input),
      body: readConfigString(delivery.config, 'body', 4000)
        ?? readConfigString(delivery.config, 'text', 4000)
        ?? createNotificationText(delivery, input),
      tag: readConfigString(delivery.config, 'tag', 180) ?? input.action,
      url: readConfigString(delivery.config, 'url', 2048),
    },
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

  return createHttpSendResult(response.status)
}

async function sendBotWebhookNotification(
  delivery: EvaluatedNotificationDelivery,
  input: DispatchNotificationInput,
  credential: NotificationCredentialPayload,
): Promise<NotificationSendResult> {
  const url = resolveBotWebhookUrl(delivery.adapter, credential)
  if (!url)
    return createSendResult('credential-type-mismatch')

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

  return createHttpSendResult(response.status)
}

async function sendNotification(
  event: H3Event | undefined,
  delivery: EvaluatedNotificationDelivery,
  input: DispatchNotificationInput,
  credential: NotificationCredentialPayload,
): Promise<NotificationSendResult> {
  try {
    if (delivery.adapter === 'email/resend')
      return await sendResendNotification(event, delivery, input, credential)
    if (delivery.adapter === 'email/sendgrid')
      return await sendSendgridNotification(event, delivery, input, credential)
    if (delivery.adapter === 'email/mailgun')
      return await sendMailgunNotification(event, delivery, input, credential)
    if (delivery.adapter === 'email/postmark')
      return await sendPostmarkNotification(event, delivery, input, credential)
    if (delivery.adapter === 'email/smtp')
      return await sendSmtpRelayNotification(event, delivery, input, credential)
    if (delivery.adapter === 'email/generic')
      return await sendGenericEmailNotification(event, delivery, input, credential)
    if (delivery.adapter === 'webhook')
      return await sendWebhookNotification(delivery, input, credential)
    if (delivery.adapter === 'webpush')
      return await sendWebPushRelayNotification(event, delivery, input, credential)
    if (delivery.adapter === 'feishu' || delivery.adapter === 'lark')
      return await sendBotWebhookNotification(delivery, input, credential)
    return createSendResult('send-adapter-unsupported')
  }
  catch {
    return createSendResult('adapter-request-failed')
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
  const profile = resolveNotificationChannelProfile(config)
  const { adapter, channel, credentialRef, credentialRequired, provider, providerType } = profile
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
  else if (!profile.supported) {
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
    durationMs: 0,
    statusCode: null,
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
      durationMs: delivery.durationMs,
      statusCode: delivery.statusCode,
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
  if (input.executionMode === 'plan')
    return delivery
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

  const result = await sendNotification(event, delivery, input, credential)
  if (result.reason === 'sent') {
    return {
      ...delivery,
      status: 'sent',
      reason: 'delivery-sent',
      statusCode: result.statusCode,
    }
  }

  return {
    ...delivery,
    status: 'failed',
    reason: result.reason,
    statusCode: result.statusCode,
  }
}

function toDeliveryRecord(delivery: EvaluatedNotificationDelivery): NotificationDeliveryRecord {
  const { config: _config, credentialRef: _credentialRef, ...record } = delivery
  return record
}

async function executeDeliveryWithTiming(
  event: H3Event | undefined,
  delivery: EvaluatedNotificationDelivery,
  input: DispatchNotificationInput,
): Promise<EvaluatedNotificationDelivery> {
  const startedAt = Date.now()
  const dispatched = await executeDelivery(event, delivery, input)
  return {
    ...dispatched,
    durationMs: Math.max(0, Date.now() - startedAt),
  }
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
  const configIdFilter = normalizeConfigIdFilter(normalizedInput.deliveryConfigIds)
  const configs = (await listPlatformGovernanceConfigs(event, {
    configType: 'notification_channel',
  })).filter(config => !configIdFilter || configIdFilter.has(config.id))
  const deliveries = await Promise.all(configs
    .map(config => evaluateDelivery(config, normalizedInput))
    .map(delivery => verifyCredentialRef(event, delivery)))
  const dispatchedDeliveries = await Promise.all(deliveries.map(delivery => executeDeliveryWithTiming(event, delivery, normalizedInput)))

  await Promise.all(dispatchedDeliveries.map(delivery => recordDeliveryAudit(event, delivery, normalizedInput)))
  return dispatchedDeliveries.map(toDeliveryRecord)
}
