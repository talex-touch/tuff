import type { ComposerTranslation } from 'vue-i18n'
import { formatResetTime } from '~/components/intelligence/audit/audit-format'

export interface IntelligenceErrorRecoveryInput {
  error?: string
  errorCode?: string
}

export interface IntelligenceErrorRecoveryAction {
  /** Renderer route the action opens. */
  path: string
  label: string
}

export interface IntelligenceErrorRecovery {
  code: string
  title: string
  detail: string
  /** The way out, for callers that render one. */
  action?: IntelligenceErrorRecoveryAction
}

/** Where the global AI usage limits are set: Settings › Intelligence › Audit. */
export const USAGE_LIMITS_ROUTE = '/setting/intelligence/audit'

/**
 * Shared error code of a call refused by the user's own global usage limit. Its messages never
 * contain QUOTA or CREDIT, so the branch below cannot be shadowed by the Nexus-credits one — and it
 * runs first regardless.
 */
export const USAGE_LIMIT_REACHED_CODE = 'USAGE_LIMIT_REACHED'

/**
 * The reset instant after `resets at`: right after it in a failed stream's sentence
 * (`… resets at <ISO>`), in parentheses after the local time in a failed call's reason
 * (`… it resets at 2026-10-04 00:00 local time (<ISO>).`).
 */
const USAGE_LIMIT_RESETS_AT =
  /resets at\b[^\n]*?\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/i

/** Whether a failure's code or text is the global usage-limit refusal. */
export function isUsageLimitFailure(text: string): boolean {
  return text.toUpperCase().includes(USAGE_LIMIT_REACHED_CODE)
}

/**
 * When the limit resets, from main's message (`… resets at <ISO>`). Null when only the code
 * arrived — plugins and some transports carry nothing else.
 */
export function readUsageLimitResetsAt(text: string): number | null {
  const iso = USAGE_LIMIT_RESETS_AT.exec(text)?.[1]
  if (!iso) return null
  const resetsAt = Date.parse(iso)
  return Number.isFinite(resetsAt) ? resetsAt : null
}

/**
 * When the limit resets, in the interface's language and this machine's local time — the audit
 * page's own format (`formatResetTime`), so every surface reads the same: 「10月4日 00:00」,
 * "Oct 4, 00:00". The locale is the UI's, never the runtime default, which wrote "10/4, 00:00" into
 * the Chinese interface.
 */
export function formatUsageLimitResetTime(resetsAt: number, locale: string): string {
  return formatResetTime(resetsAt, locale)
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeErrorInput(input: IntelligenceErrorRecoveryInput): string {
  return [input.errorCode, input.error].map(normalizeText).filter(Boolean).join(' ')
}

function includesAny(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => value.includes(pattern))
}

/**
 * `locale` is the interface's (`useI18n().locale`): the reset time a refusal names is written in
 * it, like every other date the user reads.
 */
export function resolveIntelligenceErrorRecovery(
  input: IntelligenceErrorRecoveryInput,
  t: ComposerTranslation,
  locale: string
): IntelligenceErrorRecovery {
  const rawError = normalizeText(input.error)
  const normalized = normalizeErrorInput(input).toUpperCase()

  if (includesAny(normalized, ['NEXUS_AUTH_REQUIRED', 'NOT_AUTHENTICATED', 'AUTH_REQUIRED'])) {
    return {
      code: 'auth',
      title: t('intelligence.errorRecovery.authTitle', 'Sign in required'),
      detail: t(
        'intelligence.errorRecovery.authDetail',
        'Sign in to Tuff Nexus, then retry this AI request.'
      )
    }
  }

  // The limit the user set in Audit, ahead of both quota branches: it is not Nexus credits or a
  // team quota, and the way out is the Audit page, not the account.
  if (normalized.includes(USAGE_LIMIT_REACHED_CODE)) {
    const resetsAt = readUsageLimitResetsAt(rawError)
    return {
      code: 'usage-limit',
      title: t('intelligence.errorRecovery.usageLimitTitle', 'AI usage limit reached'),
      detail:
        resetsAt === null
          ? t(
              'intelligence.errorRecovery.usageLimitDetailNoTime',
              "You've reached the AI usage limit you set in Audit, where you can change it."
            )
          : t('intelligence.errorRecovery.usageLimitDetail', {
              time: formatUsageLimitResetTime(resetsAt, locale)
            }),
      action: {
        path: USAGE_LIMITS_ROUTE,
        label: t('intelligence.errorRecovery.openUsageLimits', 'Open Audit')
      }
    }
  }

  if (includesAny(normalized, ['QUOTA_CHECK_UNAVAILABLE', 'QUOTA VERIFICATION IS UNAVAILABLE'])) {
    return {
      code: 'quota-verification',
      title: t(
        'intelligence.errorRecovery.quotaVerificationTitle',
        'Quota verification unavailable'
      ),
      detail: t(
        'intelligence.errorRecovery.quotaVerificationDetail',
        'Retry later. If this continues, inspect Intelligence quota storage and configuration.'
      )
    }
  }

  if (includesAny(normalized, ['QUOTA', 'CREDIT', 'INSUFFICIENT_FUNDS', 'PAYMENT_REQUIRED'])) {
    return {
      code: 'quota',
      title: t('intelligence.errorRecovery.quotaTitle', 'AI quota unavailable'),
      detail: t(
        'intelligence.errorRecovery.quotaDetail',
        'Check your Nexus credits or team quota before retrying.'
      )
    }
  }

  if (
    includesAny(normalized, [
      'PROVIDER_UNAVAILABLE',
      'PROVIDER_NOT_FOUND',
      'NO_PROVIDER',
      'NO ENABLED PROVIDER',
      'PROVIDER_DISABLED',
      'SECURE_STORE_UNAVAILABLE',
      'SECURE_STORE_DEGRADED'
    ])
  ) {
    return {
      code: 'provider',
      title: t('intelligence.errorRecovery.providerTitle', 'AI provider unavailable'),
      detail: t(
        'intelligence.errorRecovery.providerDetail',
        'Check provider health, credentials, or choose another model.'
      )
    }
  }

  if (
    includesAny(normalized, [
      'UNSUPPORTED_MODEL',
      'MODEL_UNSUPPORTED',
      'CAPABILITY_UNSUPPORTED',
      'UNSUPPORTED_CAPABILITY',
      'UNSUPPORTED CAPABILITY'
    ])
  ) {
    return {
      code: 'model',
      title: t('intelligence.errorRecovery.modelTitle', 'Model does not support this request'),
      detail: t(
        'intelligence.errorRecovery.modelDetail',
        'Switch to a model that supports the requested capability and try again.'
      )
    }
  }

  if (
    includesAny(normalized, [
      'CREDENTIALS_MISSING',
      'MISSING_CREDENTIALS',
      'INVALID_CREDENTIALS',
      'AUTH_REF_MISSING',
      'API_KEY_MISSING',
      'API KEY MISSING'
    ])
  ) {
    return {
      code: 'credentials',
      title: t(
        'intelligence.errorRecovery.credentialsTitle',
        'Provider credentials need attention'
      ),
      detail: t(
        'intelligence.errorRecovery.credentialsDetail',
        'Open provider settings, check the credential status, then retry this AI request.'
      )
    }
  }

  if (
    includesAny(normalized, [
      'PERMISSION_DENIED',
      'PERMISSION_REQUIRED',
      'PERMISSION_MISSING',
      'INTELLIGENCE.BASIC',
      'CLIPBOARD.WRITE'
    ])
  ) {
    return {
      code: 'permission',
      title: t('intelligence.errorRecovery.permissionTitle', 'Permission required'),
      detail: t(
        'intelligence.errorRecovery.permissionDetail',
        'Grant the required permission, then retry this action.'
      )
    }
  }

  if (
    includesAny(normalized, [
      'TIMEOUT',
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'NETWORK',
      'FETCH FAILED'
    ])
  ) {
    return {
      code: 'network',
      title: t('intelligence.errorRecovery.networkTitle', 'Network request failed'),
      detail: t(
        'intelligence.errorRecovery.networkDetail',
        'Check the network connection or provider endpoint, then retry.'
      )
    }
  }

  return {
    code: 'unknown',
    title: t('intelligence.errorRecovery.unknownTitle', 'AI request failed'),
    detail: rawError || t('coreBox.intelligence.genericError')
  }
}
