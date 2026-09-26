import type { IntelligenceErrorCode as SharedIntelligenceErrorCode } from '@talex-touch/utils/transport/events/types'
import { homedir } from 'node:os'

export type IntelligenceErrorCode = SharedIntelligenceErrorCode

export interface NormalizedIntelligenceError {
  code: IntelligenceErrorCode
  message: string
  reason: string
  recovery: string
  capabilityId?: string
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message || error.name
  return String(error)
}

export function normalizeIntelligenceError(
  error: unknown,
  options: { capabilityId?: string } = {}
): NormalizedIntelligenceError {
  const message = messageOf(error)
  const lower = message.toLowerCase()
  const explicitCode =
    error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
      ? String((error as { code: string }).code)
      : ''

  if (explicitCode === 'NEXUS_AUTH_REQUIRED' || lower.includes('nexus_auth_required')) {
    return {
      code: 'NEXUS_AUTH_REQUIRED',
      message,
      reason: 'Nexus provider requires a signed-in account.',
      recovery: 'Sign in to Nexus or switch to another enabled provider.',
      capabilityId: options.capabilityId
    }
  }

  if (
    explicitCode === 'QUOTA_CHECK_UNAVAILABLE' ||
    lower.includes('quota_check_unavailable') ||
    lower.includes('quota verification is unavailable')
  ) {
    return {
      code: 'QUOTA_CHECK_UNAVAILABLE',
      message,
      reason: 'Quota verification is unavailable, so the request was blocked.',
      recovery: 'Retry after quota storage recovers or inspect Intelligence quota configuration.',
      capabilityId: options.capabilityId
    }
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
    return {
      code: 'CAPABILITY_UNSUPPORTED',
      message,
      reason: `Capability ${options.capabilityId ?? 'unknown'} is not supported by the selected provider.`,
      recovery: 'Select a provider/model that advertises this capability.',
      capabilityId: options.capabilityId
    }
  }

  if (
    explicitCode === 'MODEL_UNSUPPORTED' ||
    lower.includes('model unsupported') ||
    lower.includes('model does not support') ||
    lower.includes('unsupported model')
  ) {
    return {
      code: 'MODEL_UNSUPPORTED',
      message,
      reason: 'The selected model does not support this request.',
      recovery: 'Switch to a model that supports the requested capability.',
      capabilityId: options.capabilityId
    }
  }

  if (
    lower.includes('quota exceeded') ||
    lower.includes('quota exhausted') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests')
  ) {
    return {
      code: 'QUOTA_EXHAUSTED',
      message,
      reason: 'The caller has exhausted its request, token, or cost quota.',
      recovery: 'Wait for quota reset, lower token usage, or adjust quota settings.',
      capabilityId: options.capabilityId
    }
  }

  if (
    lower.includes('provider unavailable') ||
    lower.includes('provider_config_unavailable') ||
    lower.includes('no enabled providers') ||
    lower.includes('no providers available') ||
    lower.includes('provider manager not initialized') ||
    (lower.includes('provider') && lower.includes('not found'))
  ) {
    return {
      code: 'PROVIDER_UNAVAILABLE',
      message,
      reason: 'No usable provider is available for this capability.',
      recovery: 'Enable a provider, verify provider configuration, or choose another capability.',
      capabilityId: options.capabilityId
    }
  }

  if (
    explicitCode === 'PERMISSION_DENIED' ||
    explicitCode === 'INTELLIGENCE_PERMISSION_DENIED' ||
    lower.includes('permission denied') ||
    lower.includes('permission_denied') ||
    lower.includes('not allowed') ||
    lower.includes('forbidden')
  ) {
    return {
      code: 'PERMISSION_DENIED',
      message,
      reason: 'The caller is not allowed to use this intelligence capability or provider.',
      recovery: 'Grant the required permission or choose an allowed provider/capability.',
      capabilityId: options.capabilityId
    }
  }

  if (
    lower.includes('network') ||
    lower.includes('fetch failed') ||
    lower.includes('timeout') ||
    lower.includes('econnreset') ||
    lower.includes('enotfound') ||
    lower.includes('socket')
  ) {
    return {
      code: 'NETWORK_FAILURE',
      message,
      reason: 'The provider request failed before a valid model response was returned.',
      recovery: 'Check network/proxy settings and retry the request.',
      capabilityId: options.capabilityId
    }
  }

  if (lower.includes('invalid')) {
    return {
      code: 'INVALID_REQUEST',
      message,
      reason: 'The request payload is invalid for this capability.',
      recovery: 'Check the request input and try again.',
      capabilityId: options.capabilityId
    }
  }

  return {
    code: 'UNKNOWN',
    message,
    reason: 'The intelligence request failed with an unclassified error.',
    recovery: 'Retry the request or inspect the trace/audit entry.',
    capabilityId: options.capabilityId
  }
}

export function toNormalizedIntelligenceError(
  error: unknown,
  options: { capabilityId?: string } = {}
): Error & NormalizedIntelligenceError {
  const normalized = normalizeIntelligenceError(error, options)
  const wrapped = new Error(
    `[${normalized.code}${options.capabilityId ? `:${options.capabilityId}` : ''}] ${normalized.message}`
  ) as Error & NormalizedIntelligenceError & { cause?: unknown }
  wrapped.code = normalized.code
  wrapped.reason = normalized.reason
  wrapped.recovery = normalized.recovery
  wrapped.capabilityId = normalized.capabilityId
  wrapped.cause = error
  return wrapped
}

// ---------------------------------------------------------------------------
// What the provider said, for the app's own renderer
// ---------------------------------------------------------------------------

/** Longest provider detail the renderer is sent: one or two lines of the failed bubble. */
export const PROVIDER_DETAIL_MAX_CHARS = 300

/**
 * What the provider itself said about a failure (`providerDetail`, set where a local CLI's run ended
 * without an answer), found on the error or anywhere down its `cause` chain — the SDK and the
 * normalizer wrap errors on the way out.
 */
export function readProviderDetail(error: unknown): string | null {
  let current: unknown = error
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth += 1) {
    const detail = (current as { providerDetail?: unknown }).providerDetail
    if (typeof detail === 'string' && detail.trim()) return detail
    current = (current as { cause?: unknown }).cause
  }
  return null
}

const REDACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bsk-[\w-]{6,}/g, 'sk-…'],
  [/\b(bearer)\s+[\w.~+/=-]{8,}/gi, '$1 …'],
  [
    /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|authorization)(["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi,
    '$1$2…'
  ],
  // Any other long unbroken run of key-like characters.
  [/[\w+/-]{32,}={0,2}/g, '…']
]

/**
 * A provider's words made fit to show: one line, credential-shaped runs and the home directory
 * masked, cut to {@link PROVIDER_DETAIL_MAX_CHARS}.
 */
export function redactProviderDetail(text: string, home = homedir()): string {
  let out = text.replace(/\s+/g, ' ').trim()
  if (home && home.length > 1) out = out.split(home).join('~')
  for (const [pattern, replacement] of REDACTIONS) out = out.replace(pattern, replacement)
  const chars = [...out]
  return chars.length > PROVIDER_DETAIL_MAX_CHARS
    ? `${chars.slice(0, PROVIDER_DETAIL_MAX_CHARS - 1).join('')}…`
    : out
}

/**
 * The error a failed intelligence stream ends with. Everyone gets the stable `code`. The app's own
 * renderer (`host`) also gets what the provider said, as `[CODE] detail` — the prefix the Home
 * conversation parses (`conversation-error-display.ts`) — so a CLI's 「invalid API key」 reaches the
 * failed bubble instead of a bare UNKNOWN. A plugin gets the code alone: a provider's words can name
 * the user's own endpoints and accounts.
 */
export function toStreamFailure(
  code: string,
  error: unknown,
  options: { host: boolean }
): Error & { code: string } {
  const raw = options.host ? readProviderDetail(error) : null
  const detail = raw ? redactProviderDetail(raw) : ''
  return Object.assign(new Error(detail ? `[${code}] ${detail}` : code), { code })
}
