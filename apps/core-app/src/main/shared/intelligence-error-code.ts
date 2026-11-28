import type { IntelligenceErrorCode } from '@talex-touch/utils/transport/events/types'

/** Shared error code (`INTELLIGENCE_ERROR_CODES`) of a call refused by a global usage limit. */
export const INTELLIGENCE_USAGE_LIMIT_REACHED_CODE = 'USAGE_LIMIT_REACHED' as const

export function extractIntelligenceErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name
  return String(error)
}

/**
 * Pure stateless classifier mapping an arbitrary failure into a canonical `IntelligenceErrorCode`.
 * Shared between DP5 (`plugin`) and DP6 (`ai`) with zero runtime module dependencies.
 */
export function classifyIntelligenceErrorCode(error: unknown): IntelligenceErrorCode {
  const message = extractIntelligenceErrorMessage(error)
  const lower = message.toLowerCase()
  const explicitCode =
    error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
      ? String((error as { code: string }).code)
      : ''

  if (explicitCode === 'NEXUS_AUTH_REQUIRED' || lower.includes('nexus_auth_required')) {
    return 'NEXUS_AUTH_REQUIRED'
  }

  if (
    explicitCode === INTELLIGENCE_USAGE_LIMIT_REACHED_CODE ||
    lower.includes('usage_limit_reached')
  ) {
    return INTELLIGENCE_USAGE_LIMIT_REACHED_CODE
  }

  if (
    explicitCode === 'QUOTA_CHECK_UNAVAILABLE' ||
    lower.includes('quota_check_unavailable') ||
    lower.includes('quota verification is unavailable')
  ) {
    return 'QUOTA_CHECK_UNAVAILABLE'
  }

  if (
    explicitCode === 'INTELLIGENCE_CAPABILITY_UNSUPPORTED' ||
    explicitCode === 'NEXUS_STREAM_UNSUPPORTED' ||
    lower.includes('nexus_stream_unsupported') ||
    lower.includes('capability unsupported') ||
    lower.includes('capability is unsupported') ||
    lower.includes('capability not supported') ||
    lower.includes('is unsupported')
  ) {
    return 'CAPABILITY_UNSUPPORTED'
  }

  if (
    explicitCode === 'MODEL_UNSUPPORTED' ||
    lower.includes('model unsupported') ||
    lower.includes('model does not support') ||
    lower.includes('unsupported model')
  ) {
    return 'MODEL_UNSUPPORTED'
  }

  if (
    lower.includes('quota exceeded') ||
    lower.includes('quota exhausted') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests')
  ) {
    return 'QUOTA_EXHAUSTED'
  }

  if (
    lower.includes('provider unavailable') ||
    lower.includes('provider_config_unavailable') ||
    lower.includes('no enabled providers') ||
    lower.includes('no providers available') ||
    lower.includes('provider manager not initialized') ||
    (lower.includes('provider') && lower.includes('not found'))
  ) {
    return 'PROVIDER_UNAVAILABLE'
  }

  if (
    explicitCode === 'PERMISSION_DENIED' ||
    explicitCode === 'INTELLIGENCE_PERMISSION_DENIED' ||
    lower.includes('permission denied') ||
    lower.includes('permission_denied') ||
    lower.includes('not allowed') ||
    lower.includes('forbidden')
  ) {
    return 'PERMISSION_DENIED'
  }

  if (
    lower.includes('network') ||
    lower.includes('fetch failed') ||
    lower.includes('timeout') ||
    lower.includes('econnreset') ||
    lower.includes('enotfound') ||
    lower.includes('socket')
  ) {
    return 'NETWORK_FAILURE'
  }

  if (lower.includes('invalid')) {
    return 'INVALID_REQUEST'
  }

  return 'UNKNOWN'
}
