import type { IntelligenceErrorCode as SharedIntelligenceErrorCode } from '@talex-touch/utils/transport/events/types'
import type { UsageLimitInfo } from './usage-ledger/usage-limits'
import { homedir } from 'node:os'
import { readUsageLimitInfo, USAGE_LIMIT_REACHED_CODE } from './usage-ledger/usage-limits'

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

const USAGE_LIMIT_PREFIX = /^\[USAGE_LIMIT_REACHED(?::[^\]]*)?\]\s*/
const USAGE_LIMIT_RESETS_AT = /resets at (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/i

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** `YYYY-MM-DD HH:mm` in the main process's local time. */
function formatLocalDateTime(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(
    date.getHours()
  )}:${pad2(date.getMinutes())}`
}

/**
 * Which limit refused the call and when it resets, from the structured `usageLimit` or, failing
 * that, the reset time in the message (`… resets at <ISO>`).
 */
function describeUsageLimit(error: unknown, message: string): string {
  const info: Partial<UsageLimitInfo> = readUsageLimitInfo(error) ?? {}
  const resetsAt =
    info.resetsAt ?? Date.parse(USAGE_LIMIT_RESETS_AT.exec(message)?.[1] ?? 'invalid')
  const limit =
    info.key === undefined
      ? 'The usage limit you set is reached'
      : `The usage limit you set is reached (${info.key}: ${info.used} / ${info.max})`
  return Number.isFinite(resetsAt)
    ? `${limit}; it resets at ${formatLocalDateTime(resetsAt)} local time (${new Date(resetsAt).toISOString()}).`
    : `${limit}.`
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

  // The user's own global limit, ahead of every quota rule: it is not Nexus credits, a team quota
  // or a provider 429, and must not be reported as one.
  if (explicitCode === USAGE_LIMIT_REACHED_CODE || lower.includes('usage_limit_reached')) {
    return {
      code: USAGE_LIMIT_REACHED_CODE,
      // The SDK's message already carries `[USAGE_LIMIT_REACHED:<capability>]`; the wrapper adds it.
      message: message.replace(USAGE_LIMIT_PREFIX, ''),
      reason: describeUsageLimit(error, message),
      recovery:
        'Wait until the limit resets, or raise or clear it in Settings › Intelligence › Audit.',
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
  if (normalized.code === USAGE_LIMIT_REACHED_CODE) {
    // Main-side callers (background services) read which limit and when it resets from here.
    const usageLimit = readUsageLimitInfo(error)
    if (usageLimit) Object.assign(wrapped, { usageLimit })
  }
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
 *
 * A call refused by the user's global usage limit carries our own sentence instead — which limit and
 * when it resets — so the host renderer can name the reset time; it holds nothing user-specific.
 */
export function toStreamFailure(
  code: string,
  error: unknown,
  options: { host: boolean }
): Error & { code: string } {
  const usageLimit =
    options.host && code === USAGE_LIMIT_REACHED_CODE ? readUsageLimitInfo(error) : null
  if (usageLimit) {
    const resetsAt = new Date(usageLimit.resetsAt).toISOString()
    return Object.assign(
      new Error(`[${code}] Usage limit reached: ${usageLimit.key}; resets at ${resetsAt}`),
      { code }
    )
  }
  const raw = options.host ? readProviderDetail(error) : null
  const detail = raw ? redactProviderDetail(raw) : ''
  return Object.assign(new Error(detail ? `[${code}] ${detail}` : code), { code })
}

/** A capability id fit for the `[CODE:capability]` prefix: lower-case dotted, nothing else. */
const CAPABILITY_ID_PATTERN = /^[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)*$/
const CAPABILITY_PREFIX = /^\[[A-Z][A-Z0-9_]*:([^\]\s]+)\]/

/**
 * Which capability failed: the normalizer's wrapper carries it, an SDK error only in its own
 * `[CODE:capability]` prefix. `undefined` for anything that is not a plain capability id.
 */
function readCapabilityId(error: unknown): string | undefined {
  const explicit =
    error && typeof error === 'object' ? (error as { capabilityId?: unknown }).capabilityId : null
  const candidate =
    typeof explicit === 'string' ? explicit : CAPABILITY_PREFIX.exec(messageOf(error))?.[1]
  return candidate && CAPABILITY_ID_PATTERN.test(candidate) ? candidate : undefined
}

/**
 * The reason {@link toNormalizedIntelligenceError} already wrote for this code. Normalizing the
 * wrapper again would classify its rewritten message, which can land on another rule than the
 * code it carries.
 */
function readNormalizedReason(error: unknown, code: string): string | null {
  if (!error || typeof error !== 'object') return null
  const wrapped = error as { code?: unknown; reason?: unknown; recovery?: unknown }
  return wrapped.code === code &&
    typeof wrapped.reason === 'string' &&
    wrapped.reason.trim() &&
    typeof wrapped.recovery === 'string'
    ? wrapped.reason
    : null
}

/**
 * What a failed capability call (`invoke`, context `execute`, …) answers — the request/response
 * sibling of {@link toStreamFailure}, under the same rule. A plugin gets the stable code alone. The
 * app's own renderer gets `[CODE:capability] reason`, the prefix the renderer already parses: the
 * normalizer's own sentence for the code — for a call the usage limit refused, which limit, how
 * much of it is used and when it resets in local time — or, where the provider itself said why (a
 * local CLI's run), those words redacted. Never the raw provider message: it can carry endpoints,
 * accounts and response bodies.
 */
export function toApiFailure(
  code: string,
  error: unknown,
  options: { host: boolean }
): { error: string; code?: string } {
  if (!options.host) return { error: code }
  const capabilityId = readCapabilityId(error)
  const prefix = `[${code}${capabilityId ? `:${capabilityId}` : ''}]`
  const said = code === USAGE_LIMIT_REACHED_CODE ? null : readProviderDetail(error)
  const reason =
    said ??
    readNormalizedReason(error, code) ??
    normalizeIntelligenceError(error, { capabilityId }).reason
  return { error: `${prefix} ${redactProviderDetail(reason)}`, code }
}

/** Whether `error` is the usage-limit refusal: by its info anywhere in its causes, or its code. */
function isUsageLimitRefusal(error: unknown): boolean {
  if (readUsageLimitInfo(error)) return true
  return (
    !!error &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === USAGE_LIMIT_REACHED_CODE
  )
}

/**
 * The usage-limit refusal alone, for channels whose every other failure keeps the public sentence
 * (the voice channels): `toApiFailure`'s answer for it, `undefined` for anything else.
 */
export function projectUsageLimitFailure(
  error: unknown,
  options: { host: boolean }
): { error: string; code?: string } | undefined {
  return isUsageLimitRefusal(error)
    ? toApiFailure(USAGE_LIMIT_REACHED_CODE, error, options)
    : undefined
}

/**
 * The stream sibling of {@link projectUsageLimitFailure}: the refusal in `toStreamFailure`'s shape,
 * anything else returned as it came.
 */
export function toUsageLimitStreamFailure(error: unknown, options: { host: boolean }): unknown {
  return isUsageLimitRefusal(error)
    ? toStreamFailure(USAGE_LIMIT_REACHED_CODE, error, options)
    : error
}
