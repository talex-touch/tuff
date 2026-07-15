import type { ComposerTranslation } from 'vue-i18n'

export interface IntelligenceErrorRecoveryInput {
  error?: string
  errorCode?: string
}

export interface IntelligenceErrorRecovery {
  code: string
  title: string
  detail: string
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

export function resolveIntelligenceErrorRecovery(
  input: IntelligenceErrorRecoveryInput,
  t: ComposerTranslation
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
