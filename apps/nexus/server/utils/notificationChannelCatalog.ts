import type { PlatformGovernanceConfig } from './platformGovernanceStore'
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

function normalizeToken(value: unknown, maxLength = 120): string | null {
  return normalizeString(value, maxLength)?.toLowerCase() ?? null
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

export function resolveNotificationCredentialRef(config: PlatformGovernanceConfig): string | null {
  const value = config.config?.credentialRef ?? config.config?.authRef
  const normalized = normalizeString(value, 255)
  return normalized && normalized.startsWith('secure://') ? normalized : null
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
