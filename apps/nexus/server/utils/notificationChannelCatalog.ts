import type { PlatformGovernanceConfig } from './platformGovernanceStore'
import { createError } from 'h3'
import { normalizeString } from './telemetrySanitizer'

export interface NotificationChannelProfile {
  channel: string
  provider: string | null
  providerType: string | null
  adapter: string
  credentialRef: string | null
  credentialRequired: boolean
  supported: boolean
}

export interface NotificationChannelProfileTemplate {
  id: string
  channel: string
  provider: string
  providerType: string
  adapter: string
  label: string
  description: string
  credentialType: 'api_key' | 'smtp' | 'webhook' | 'bot_token' | null
  credentialRefPrefix: string | null
  requiredConfigKeys: string[]
  optionalConfigKeys: string[]
  defaultConfig: Record<string, unknown>
  defaultLimits: Record<string, unknown>
}

export interface NotificationChannelConfigInput {
  channel: string
  provider: string
  config: Record<string, unknown> | null
}

export interface NotificationRuntimeReadiness {
  webPushPublicKeyConfigured?: boolean
}

export interface NotificationChannelReadiness {
  status: 'ready' | 'warning' | 'disabled'
  productionReady: boolean
  reasons: string[]
  sendMode: boolean
  requiresPublicRuntime: boolean
  hasPublicRuntime: boolean
  requiresRelayEndpoint: boolean
  hasRelayEndpoint: boolean
}

const SUPPORTED_ADAPTERS = new Set([
  'browser',
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

const CREDENTIAL_REQUIRED_ADAPTERS = new Set([
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

const LEGACY_PROVIDER_ADAPTERS = new Set([
  'browser',
  'resend',
  'sendgrid',
  'mailgun',
  'postmark',
  'smtp',
  'generic',
  'feishu',
  'lark',
  'webhook',
  'webpush',
])

const DEFAULT_NOTIFICATION_LIMITS = {
  maxMessagesPerDay: 5000,
  maxFailuresPerHour: 50,
}

const DEFAULT_PLUGIN_REVIEW_EVENTS = ['plugin.version.approved', 'plugin.version.rejected']

const NOTIFICATION_CHANNEL_PROFILE_TEMPLATES: NotificationChannelProfileTemplate[] = [
  {
    id: 'browser-inbox',
    channel: 'browser',
    provider: 'browser',
    providerType: 'browser',
    adapter: 'browser',
    label: 'Browser inbox',
    description: 'Local dashboard inbox notifications for signed-in plugin developers and admins.',
    credentialType: null,
    credentialRefPrefix: null,
    requiredConfigKeys: [],
    optionalConfigKeys: ['title', 'body', 'tag', 'events', 'userId', 'ownerId'],
    defaultLimits: DEFAULT_NOTIFICATION_LIMITS,
    defaultConfig: {
      mode: 'send',
      providerType: 'browser',
      title: 'Plugin approved',
      body: 'Your plugin review status changed.',
      tag: 'plugin-review',
      events: DEFAULT_PLUGIN_REVIEW_EVENTS,
    },
  },
  {
    id: 'resend-email',
    channel: 'email',
    provider: 'resend-primary',
    providerType: 'resend',
    adapter: 'email/resend',
    label: 'Resend email',
    description: 'Resend transactional email sender for plugin review and system notifications.',
    credentialType: 'api_key',
    credentialRefPrefix: 'secure://notifications/',
    requiredConfigKeys: ['credentialRef', 'from'],
    optionalConfigKeys: ['subject', 'text', 'events', 'timeoutMs'],
    defaultLimits: DEFAULT_NOTIFICATION_LIMITS,
    defaultConfig: {
      mode: 'send',
      providerType: 'resend',
      credentialRef: 'secure://notifications/resend-primary',
      from: 'Tuff <noreply@example.com>',
      subject: 'Plugin approved',
      events: DEFAULT_PLUGIN_REVIEW_EVENTS,
    },
  },
  {
    id: 'sendgrid-email',
    channel: 'email',
    provider: 'sendgrid-primary',
    providerType: 'sendgrid',
    adapter: 'email/sendgrid',
    label: 'SendGrid email',
    description: 'SendGrid sender with independent secure://notifications/* API key binding.',
    credentialType: 'api_key',
    credentialRefPrefix: 'secure://notifications/',
    requiredConfigKeys: ['credentialRef', 'from'],
    optionalConfigKeys: ['subject', 'text', 'events', 'endpoint', 'timeoutMs'],
    defaultLimits: DEFAULT_NOTIFICATION_LIMITS,
    defaultConfig: {
      mode: 'send',
      providerType: 'sendgrid',
      credentialRef: 'secure://notifications/sendgrid-primary',
      from: 'noreply@example.com',
      subject: 'Plugin approved',
      events: DEFAULT_PLUGIN_REVIEW_EVENTS,
    },
  },
  {
    id: 'mailgun-email',
    channel: 'email',
    provider: 'mailgun-primary',
    providerType: 'mailgun',
    adapter: 'email/mailgun',
    label: 'Mailgun email',
    description: 'Mailgun sender with domain and region controls.',
    credentialType: 'api_key',
    credentialRefPrefix: 'secure://notifications/',
    requiredConfigKeys: ['credentialRef', 'from', 'domain'],
    optionalConfigKeys: ['subject', 'text', 'events', 'region', 'endpoint', 'timeoutMs'],
    defaultLimits: DEFAULT_NOTIFICATION_LIMITS,
    defaultConfig: {
      mode: 'send',
      providerType: 'mailgun',
      credentialRef: 'secure://notifications/mailgun-primary',
      from: 'Tuff <noreply@example.com>',
      domain: 'mg.example.com',
      region: 'us',
      subject: 'Plugin approved',
      events: DEFAULT_PLUGIN_REVIEW_EVENTS,
    },
  },
  {
    id: 'postmark-email',
    channel: 'email',
    provider: 'postmark-primary',
    providerType: 'postmark',
    adapter: 'email/postmark',
    label: 'Postmark email',
    description: 'Postmark sender with message stream support.',
    credentialType: 'api_key',
    credentialRefPrefix: 'secure://notifications/',
    requiredConfigKeys: ['credentialRef', 'from'],
    optionalConfigKeys: ['subject', 'text', 'events', 'messageStream', 'endpoint', 'timeoutMs'],
    defaultLimits: DEFAULT_NOTIFICATION_LIMITS,
    defaultConfig: {
      mode: 'send',
      providerType: 'postmark',
      credentialRef: 'secure://notifications/postmark-primary',
      from: 'noreply@example.com',
      subject: 'Plugin approved',
      messageStream: 'outbound',
      events: DEFAULT_PLUGIN_REVIEW_EVENTS,
    },
  },
  {
    id: 'smtp-relay',
    channel: 'email',
    provider: 'smtp-ops',
    providerType: 'smtp',
    adapter: 'email/smtp',
    label: 'SMTP relay',
    description: 'HTTPS SMTP relay sender using encrypted SMTP credentials.',
    credentialType: 'smtp',
    credentialRefPrefix: 'secure://notifications/',
    requiredConfigKeys: ['credentialRef', 'endpoint', 'from'],
    optionalConfigKeys: ['subject', 'text', 'events', 'timeoutMs'],
    defaultLimits: DEFAULT_NOTIFICATION_LIMITS,
    defaultConfig: {
      mode: 'send',
      providerType: 'smtp',
      credentialRef: 'secure://notifications/smtp-ops',
      endpoint: 'https://smtp-relay.example.com/send',
      from: 'Tuff <noreply@example.com>',
      subject: 'Plugin approved',
      events: DEFAULT_PLUGIN_REVIEW_EVENTS,
    },
  },
  {
    id: 'generic-http-email',
    channel: 'email',
    provider: 'generic-mail-relay',
    providerType: 'generic',
    adapter: 'email/generic',
    label: 'Generic HTTP email',
    description: 'Custom HTTPS email relay using webhook credentials and optional HMAC signing.',
    credentialType: 'webhook',
    credentialRefPrefix: 'secure://notifications/',
    requiredConfigKeys: ['credentialRef', 'from'],
    optionalConfigKeys: ['subject', 'text', 'events', 'timeoutMs'],
    defaultLimits: DEFAULT_NOTIFICATION_LIMITS,
    defaultConfig: {
      mode: 'send',
      providerType: 'generic',
      credentialRef: 'secure://notifications/generic-mail-relay',
      from: 'Tuff <noreply@example.com>',
      subject: 'Plugin approved',
      events: DEFAULT_PLUGIN_REVIEW_EVENTS,
    },
  },
  {
    id: 'feishu-bot',
    channel: 'feishu',
    provider: 'feishu-review',
    providerType: 'feishu',
    adapter: 'feishu',
    label: 'Feishu bot',
    description: 'Feishu bot webhook notification channel for review and operations rooms.',
    credentialType: 'bot_token',
    credentialRefPrefix: 'secure://notifications/',
    requiredConfigKeys: ['credentialRef'],
    optionalConfigKeys: ['text', 'events', 'timeoutMs'],
    defaultLimits: DEFAULT_NOTIFICATION_LIMITS,
    defaultConfig: {
      mode: 'send',
      providerType: 'feishu',
      credentialRef: 'secure://notifications/feishu-review',
      text: 'Tuff plugin review status changed.',
      events: DEFAULT_PLUGIN_REVIEW_EVENTS,
    },
  },
  {
    id: 'lark-bot',
    channel: 'lark',
    provider: 'lark-review',
    providerType: 'lark',
    adapter: 'lark',
    label: 'Lark bot',
    description: 'Lark bot webhook notification channel for global review and operations rooms.',
    credentialType: 'bot_token',
    credentialRefPrefix: 'secure://notifications/',
    requiredConfigKeys: ['credentialRef'],
    optionalConfigKeys: ['text', 'events', 'timeoutMs'],
    defaultLimits: DEFAULT_NOTIFICATION_LIMITS,
    defaultConfig: {
      mode: 'send',
      providerType: 'lark',
      credentialRef: 'secure://notifications/lark-review',
      text: 'Tuff plugin review status changed.',
      events: DEFAULT_PLUGIN_REVIEW_EVENTS,
    },
  },
  {
    id: 'webhook',
    channel: 'webhook',
    provider: 'review-webhook',
    providerType: 'webhook',
    adapter: 'webhook',
    label: 'Webhook',
    description: 'Generic HTTPS webhook with optional HMAC signature from secure credentials.',
    credentialType: 'webhook',
    credentialRefPrefix: 'secure://notifications/',
    requiredConfigKeys: ['credentialRef'],
    optionalConfigKeys: ['events', 'timeoutMs'],
    defaultLimits: DEFAULT_NOTIFICATION_LIMITS,
    defaultConfig: {
      mode: 'send',
      providerType: 'webhook',
      credentialRef: 'secure://notifications/review-webhook',
      events: DEFAULT_PLUGIN_REVIEW_EVENTS,
    },
  },
  {
    id: 'webpush-relay',
    channel: 'webpush',
    provider: 'webpush-relay',
    providerType: 'webpush',
    adapter: 'webpush',
    label: 'Web Push relay',
    description: 'Browser push delivery through a secure relay and stored user subscriptions.',
    credentialType: 'webhook',
    credentialRefPrefix: 'secure://notifications/',
    requiredConfigKeys: ['credentialRef', 'title', 'body'],
    optionalConfigKeys: ['tag', 'url', 'events', 'timeoutMs'],
    defaultLimits: DEFAULT_NOTIFICATION_LIMITS,
    defaultConfig: {
      mode: 'send',
      providerType: 'webpush',
      credentialRef: 'secure://notifications/webpush-relay',
      title: 'Plugin approved',
      body: 'Your plugin review status changed.',
      tag: 'plugin-review',
      events: DEFAULT_PLUGIN_REVIEW_EVENTS,
    },
  },
]

function normalizeToken(value: unknown, maxLength = 120): string | null {
  return normalizeString(value, maxLength)?.toLowerCase() ?? null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function cloneNotificationProfile(profile: NotificationChannelProfileTemplate): NotificationChannelProfileTemplate {
  return {
    ...profile,
    requiredConfigKeys: [...profile.requiredConfigKeys],
    optionalConfigKeys: [...profile.optionalConfigKeys],
    defaultConfig: { ...profile.defaultConfig },
    defaultLimits: { ...profile.defaultLimits },
  }
}

export function listNotificationChannelProfiles(): NotificationChannelProfileTemplate[] {
  return NOTIFICATION_CHANNEL_PROFILE_TEMPLATES.map(cloneNotificationProfile)
}

function normalizeAdapter(channel: string, value: string): string {
  if (value.includes('/'))
    return value
  if (channel === 'email')
    return `email/${value}`
  if (value === 'resend' || value === 'sendgrid' || value === 'mailgun' || value === 'postmark' || value === 'smtp' || value === 'generic')
    return `email/${value}`
  return value
}

function isSendMode(config: PlatformGovernanceConfig): boolean {
  return normalizeToken(config.config?.mode) === 'send'
}

function hasHttpsRelayEndpoint(config: PlatformGovernanceConfig): boolean {
  const endpoint = normalizeString(config.config?.endpoint, 2048)
    ?? normalizeString(config.config?.relayUrl, 2048)
    ?? normalizeString(config.config?.url, 2048)
  if (!endpoint)
    return false

  try {
    const parsed = new URL(endpoint)
    return parsed.protocol === 'https:'
      || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname))
  }
  catch {
    return false
  }
}

export function resolveNotificationCredentialRef(config: PlatformGovernanceConfig): string | null {
  const value = config.config?.credentialRef ?? config.config?.authRef
  const normalized = normalizeString(value, 255)
  return normalized && normalized.startsWith('secure://') ? normalized : null
}

export function assertNotificationChannelConfig(input: NotificationChannelConfigInput): void {
  const channel = readString(input.channel)
  if (!channel)
    throw createError({ statusCode: 400, statusMessage: 'notification channel is required.' })

  const config: PlatformGovernanceConfig = {
    id: 'validation',
    configType: 'notification_channel',
    name: 'Notification validation',
    ownerScope: 'system',
    ownerId: null,
    targetId: null,
    channel,
    provider: readString(input.provider),
    enabled: true,
    limits: null,
    warningThreshold: null,
    config: input.config,
    createdBy: 'validation',
    createdAt: '',
    updatedAt: '',
  }
  const profile = resolveNotificationChannelProfile(config)
  if (!profile.supported) {
    throw createError({
      statusCode: 400,
      statusMessage: `Unsupported notification adapter: ${profile.adapter}.`,
    })
  }

  const credentialRef = readString(input.config?.credentialRef) ?? readString(input.config?.authRef)
  if (credentialRef && !credentialRef.startsWith('secure://notifications/')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'config.credentialRef must use secure://notifications/ for notification channels.',
    })
  }
}

export function resolveNotificationChannelProfile(config: PlatformGovernanceConfig): NotificationChannelProfile {
  const channel = normalizeToken(config.channel) ?? 'browser'
  const provider = normalizeToken(config.provider)
  const configuredType = normalizeToken(config.config?.providerType)
    ?? normalizeToken(config.config?.adapter)
    ?? normalizeToken(config.config?.driver)
  const legacyProviderType = provider && LEGACY_PROVIDER_ADAPTERS.has(provider) ? provider : null
  const providerType = configuredType ?? legacyProviderType ?? (channel === 'email' ? 'generic' : channel)
  const adapter = normalizeAdapter(channel, providerType)

  return {
    channel,
    provider,
    providerType,
    adapter,
    credentialRef: resolveNotificationCredentialRef(config),
    credentialRequired: CREDENTIAL_REQUIRED_ADAPTERS.has(adapter),
    supported: SUPPORTED_ADAPTERS.has(adapter),
  }
}

export function resolveNotificationChannelReadiness(
  config: PlatformGovernanceConfig,
  runtime: NotificationRuntimeReadiness = {},
): NotificationChannelReadiness {
  const profile = resolveNotificationChannelProfile(config)
  const sendMode = isSendMode(config)
  const requiresPublicRuntime = profile.adapter === 'webpush'
  const hasPublicRuntime = !requiresPublicRuntime || runtime.webPushPublicKeyConfigured === true
  const requiresRelayEndpoint = profile.adapter === 'email/smtp'
  const hasRelayEndpoint = !requiresRelayEndpoint || hasHttpsRelayEndpoint(config)
  const reasons: string[] = []

  if (!config.enabled)
    reasons.push('channel-disabled')
  if (!profile.supported)
    reasons.push('unsupported-adapter')
  if (profile.credentialRequired && !profile.credentialRef)
    reasons.push('credential-ref-required')
  if (!sendMode && profile.adapter !== 'browser')
    reasons.push('send-mode-required')
  if (profile.adapter === 'webpush' && !profile.credentialRef)
    reasons.push('webpush-relay-credential-ref-required')
  if (!hasPublicRuntime)
    reasons.push('webpush-vapid-public-key-missing')
  if (!hasRelayEndpoint)
    reasons.push('smtp-relay-endpoint-required')

  const status = !config.enabled
    ? 'disabled'
    : reasons.length ? 'warning' : 'ready'

  return {
    status,
    productionReady: status === 'ready',
    reasons,
    sendMode,
    requiresPublicRuntime,
    hasPublicRuntime,
    requiresRelayEndpoint,
    hasRelayEndpoint,
  }
}
