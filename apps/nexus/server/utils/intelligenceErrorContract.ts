import type { IntelligenceErrorCode } from '@talex-touch/utils/transport/events/types'
import { isIntelligenceErrorCode } from '@talex-touch/utils/transport/events/types'

export interface NexusIntelligenceTransportFailure {
  code: IntelligenceErrorCode
  message: string
  reason: string
  recovery: string
}

type IntelligenceErrorDetails = Pick<
  NexusIntelligenceTransportFailure,
  'reason' | 'recovery'
>

const ERROR_DETAILS: Record<IntelligenceErrorCode, IntelligenceErrorDetails> = {
  NEXUS_AUTH_REQUIRED: {
    reason: 'Nexus provider requires a signed-in account.',
    recovery: 'Sign in to Nexus or switch to another enabled provider.',
  },
  PROVIDER_UNAVAILABLE: {
    reason: 'No usable provider is available for this capability.',
    recovery:
      'Enable a provider, verify provider configuration, or choose another capability.',
  },
  QUOTA_EXHAUSTED: {
    reason: 'The caller has exhausted its request, token, or cost quota.',
    recovery: 'Wait for quota reset, lower token usage, or adjust quota settings.',
  },
  QUOTA_CHECK_UNAVAILABLE: {
    reason: 'Quota verification is unavailable, so the request was blocked.',
    recovery:
      'Retry after quota storage recovers or inspect Intelligence quota configuration.',
  },
  MODEL_UNSUPPORTED: {
    reason: 'The selected model does not support this request.',
    recovery: 'Switch to a model that supports the requested capability.',
  },
  PERMISSION_DENIED: {
    reason:
      'The caller is not allowed to use this intelligence capability or provider.',
    recovery:
      'Grant the required permission or choose an allowed provider/capability.',
  },
  NETWORK_FAILURE: {
    reason:
      'The provider request failed before a valid model response was returned.',
    recovery: 'Check network/proxy settings and retry the request.',
  },
  CAPABILITY_UNSUPPORTED: {
    reason: 'The selected provider does not support the requested capability.',
    recovery: 'Select a provider/model that advertises this capability.',
  },
  INVALID_REQUEST: {
    reason: 'The request payload is invalid for this capability.',
    recovery: 'Check the request input and try again.',
  },
  UNKNOWN: {
    reason: 'The intelligence request failed with an unclassified error.',
    recovery: 'Retry the request or inspect the trace/audit entry.',
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readOptionalString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim())
      return value.trim()
  }
  return undefined
}

function readStatusCode(error: unknown): number | undefined {
  if (!isRecord(error))
    return undefined
  const value = error.statusCode ?? error.status
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}

function resolveExplicitCode(error: unknown): string {
  if (!isRecord(error))
    return ''
  const data = isRecord(error.data) ? error.data : null
  return (
    readOptionalString(error.code, data?.code, error.statusMessage)?.toUpperCase()
    ?? ''
  )
}

function resolveMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim())
    return error.message.trim()
  if (isRecord(error)) {
    const data = isRecord(error.data) ? error.data : null
    return (
      readOptionalString(error.message, error.statusMessage, data?.reason)
      ?? 'Nexus intelligence stream failed.'
    )
  }
  return readOptionalString(error) ?? 'Nexus intelligence stream failed.'
}

function resolveCanonicalCode(error: unknown, message: string): IntelligenceErrorCode {
  const explicitCode = resolveExplicitCode(error)
  if (isIntelligenceErrorCode(explicitCode))
    return explicitCode

  if (
    explicitCode === 'CREDITS_EXCEEDED'
    || explicitCode === 'INTELLIGENCE_PROVIDER_REQUEST_QUOTA_EXCEEDED'
    || explicitCode === 'INTELLIGENCE_PROVIDER_TOKEN_QUOTA_EXCEEDED'
  ) {
    return 'QUOTA_EXHAUSTED'
  }

  const lower = `${explicitCode} ${message}`.toLowerCase()
  if (
    lower.includes('quota_check_unavailable')
    || lower.includes('quota verification is unavailable')
    || lower.includes('配额校验')
  ) {
    return 'QUOTA_CHECK_UNAVAILABLE'
  }

  const statusCode = readStatusCode(error)
  if (statusCode === 401)
    return 'NEXUS_AUTH_REQUIRED'
  if (statusCode === 403)
    return 'PERMISSION_DENIED'
  if (statusCode === 402 || statusCode === 429)
    return 'QUOTA_EXHAUSTED'
  if (
    lower.includes('nexus_auth_required')
    || lower.includes('not authenticated')
    || lower.includes('auth required')
    || lower.includes('sign in')
  ) {
    return 'NEXUS_AUTH_REQUIRED'
  }
  if (
    lower.includes('permission denied')
    || lower.includes('permission_denied')
    || lower.includes('forbidden')
    || lower.includes('not allowed')
  ) {
    return 'PERMISSION_DENIED'
  }
  if (
    lower.includes('quota exceeded')
    || lower.includes('quota exhausted')
    || lower.includes('credits_exceeded')
    || lower.includes('rate limit')
    || lower.includes('too many requests')
  ) {
    return 'QUOTA_EXHAUSTED'
  }
  if (
    lower.includes('network')
    || lower.includes('fetch failed')
    || lower.includes('timeout')
    || lower.includes('timed out')
    || lower.includes('econn')
    || lower.includes('socket')
  ) {
    return 'NETWORK_FAILURE'
  }
  if (
    lower.includes('no enabled intelligence providers')
    || lower.includes('no available intelligence providers')
    || lower.includes('provider unavailable')
    || lower.includes('provider_config_unavailable')
    || lower.includes('provider not found')
    || lower.includes('target provider not found')
  ) {
    return 'PROVIDER_UNAVAILABLE'
  }
  if (
    lower.includes('capability unsupported')
    || lower.includes('capability not supported')
    || lower.includes('unsupported capability')
    || lower.includes('no provider supports')
  ) {
    return 'CAPABILITY_UNSUPPORTED'
  }
  if (
    lower.includes('model unsupported')
    || lower.includes('model does not support')
    || lower.includes('unsupported model')
    || lower.includes('model is missing')
    || lower.includes('unsupported provider type')
  ) {
    return 'MODEL_UNSUPPORTED'
  }
  if (
    statusCode === 400
    || lower.includes('invalid request')
    || lower.includes('invalid_request')
    || lower.includes('is required')
  ) {
    return 'INVALID_REQUEST'
  }
  return 'UNKNOWN'
}

export function resolveNexusIntelligenceHttpStatus(
  error: unknown,
  code: IntelligenceErrorCode,
): number {
  const statusCode = readStatusCode(error)
  if (statusCode !== undefined && statusCode >= 400 && statusCode <= 599)
    return statusCode

  switch (code) {
    case 'NEXUS_AUTH_REQUIRED':
      return 401
    case 'INVALID_REQUEST':
      return 400
    case 'PERMISSION_DENIED':
      return 403
    case 'QUOTA_EXHAUSTED':
      return 429
    case 'MODEL_UNSUPPORTED':
    case 'CAPABILITY_UNSUPPORTED':
      return 422
    case 'PROVIDER_UNAVAILABLE':
    case 'QUOTA_CHECK_UNAVAILABLE':
      return 503
    case 'NETWORK_FAILURE':
      return 502
    case 'UNKNOWN':
      return 500
  }
}

export function normalizeNexusIntelligenceTransportError(
  error: unknown,
): NexusIntelligenceTransportFailure {
  const message = resolveMessage(error)
  const code = resolveCanonicalCode(error, message)
  return {
    code,
    message,
    ...ERROR_DETAILS[code],
  }
}
