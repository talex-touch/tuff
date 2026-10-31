/**
 * Display normalization for intelligence failures surfaced in the home conversation.
 *
 * Main funnels every capability failure through `toNormalizedIntelligenceError`, which rewrites the
 * message as `[CODE:capabilityId] original message`. The stream transport only carries that string
 * across IPC — `client-runtime` rebuilds a bare `new Error(data.error)` and drops the `code` /
 * `reason` / `recovery` fields — so the bracket prefix is the only classification signal that
 * survives to the renderer.
 */
import { aiRunFailureKey, readUsageLimitResetsAt } from '../intelligence/ai-error-recovery'

export interface ConversationError {
  /** Code parsed from main's prefix; `UNKNOWN` when the message carries no prefix. */
  code: string
  /** The message with the prefix stripped — what the user reads as the detail line. */
  detail: string
  /**
   * `USAGE_LIMIT_REACHED` only: when the limit the user set resets, if main said so. The detail
   * keeps main's sentence, so `resolveIntelligenceErrorRecovery({ errorCode: code, error: detail })`
   * gives the local copy, its reset time and the Audit action.
   */
  resetsAt?: number
}

/** No provider is configured or enabled for the capability. The one case worth its own copy. */
export const CONVERSATION_ERROR_PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE'

/**
 * The global AI usage limit the user set in Settings › Intelligence › Audit refused the turn — not
 * Nexus credits. Arrives as `[USAGE_LIMIT_REACHED:cap] …`, `[USAGE_LIMIT_REACHED] …` (a failed
 * stream) or, when nothing else could travel, the bare code.
 */
export const CONVERSATION_ERROR_USAGE_LIMIT_REACHED = 'USAGE_LIMIT_REACHED'

/**
 * The turn ended without producing any text. Not a main-side code — synthesized here, because an
 * empty assistant bubble reads as a frozen UI rather than as a failure.
 */
export const CONVERSATION_ERROR_EMPTY_RESPONSE = 'EMPTY_RESPONSE'

const NORMALIZED_PREFIX = /^\[([A-Z_]+)(?::[^\]]*)?\]\s*/

/**
 * Refusals by policy rather than failures of the request: the user's own usage limit, credits or
 * quota, a missing sign-in, a denied permission. Running the same request again without streaming
 * meets the same answer, so the Home conversation does not fall back on these — it reports them.
 */
const GOVERNANCE_ERROR_CODES: ReadonlySet<string> = new Set([
  CONVERSATION_ERROR_USAGE_LIMIT_REACHED,
  'QUOTA_EXHAUSTED',
  'QUOTA_CHECK_UNAVAILABLE',
  'NEXUS_AUTH_REQUIRED',
  'PERMISSION_DENIED'
])

/** Whether a failure is one of the refusals a retry without streaming cannot get past. */
export function isGovernanceFailure(error: unknown): boolean {
  const explicit =
    error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined
  if (typeof explicit === 'string' && GOVERNANCE_ERROR_CODES.has(explicit)) return true
  return GOVERNANCE_ERROR_CODES.has(resolveConversationError(error).code)
}

/** A failure main caught rather than named; the detail is the message it was thrown with. */
export const CONVERSATION_ERROR_EXECUTION_FAILED = 'WORKSPACE_EXECUTION_FAILED'

/**
 * A code, alone or as `<CODE>: <sentence>` — how an agent run records why it ended
 * (`AI_RUN_FAILED: AI run failed.`).
 */
const CODED = /^([A-Z][A-Z0-9_]*)(?::\s*([\s\S]*))?$/
/** Codes main throws for its own failures, as opposed to text it passes on from elsewhere. */
const OWN_CODE = /^(?:WORKSPACE|AI_RUN|CONVERSATION)_[A-Z0-9_]+$/

/**
 * A failed turn as main stored it on the message, in the shape the bubble reads. Main names most
 * endings itself (`WORKSPACE_TURN_CANCELLED`, `CONVERSATION_EMPTY_RESPONSE`). An agent run's ending
 * arrives as the run recorded it, a code and main's English for it, which the bubble words itself.
 * Anything else main caught is `WORKSPACE_EXECUTION_FAILED` with the thrown message as the detail:
 * a code of main's own (`WORKSPACE_PROFILE_UNAVAILABLE`), the `[CODE:capability] …` form, or text
 * from a provider or the system, which stays as it came.
 */
export function readTurnFailure(error: { code: string; detail: string }): ConversationError {
  const code = error.code.trim()
  const detail = error.detail.trim()
  if (code === CONVERSATION_ERROR_EXECUTION_FAILED && detail) {
    if (NORMALIZED_PREFIX.test(detail)) return resolveConversationError(detail)
    const thrown = CODED.exec(detail)?.[1] ?? ''
    if (OWN_CODE.test(thrown) || thrown === CONVERSATION_ERROR_USAGE_LIMIT_REACHED)
      return readTurnFailure({ code: detail, detail: '' })
    return { code, detail }
  }
  const coded = CODED.exec(code)
  if (!coded) return { code, detail }
  const [, name = '', sentence = ''] = coded
  // Main's sentence for a code the interface has its own words for says nothing more.
  const worded = name === CONVERSATION_ERROR_USAGE_LIMIT_REACHED || aiRunFailureKey(name) !== null
  return { code: name, detail: detail || (worded ? '' : sentence.trim()) }
}

export function resolveConversationError(error: unknown): ConversationError {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const match = NORMALIZED_PREFIX.exec(raw)
  const code = match?.[1]

  if (!match || !code) {
    if (raw.trim() === CONVERSATION_ERROR_USAGE_LIMIT_REACHED) {
      return { code: CONVERSATION_ERROR_USAGE_LIMIT_REACHED, detail: '' }
    }
    return { code: 'UNKNOWN', detail: raw.trim() }
  }

  const detail = raw.slice(match[0].length).trim()
  if (code === CONVERSATION_ERROR_USAGE_LIMIT_REACHED) {
    const resetsAt = readUsageLimitResetsAt(detail)
    return resetsAt === null ? { code, detail } : { code, detail, resetsAt }
  }
  return { code, detail }
}
