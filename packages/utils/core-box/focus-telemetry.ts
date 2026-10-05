/**
 * CoreBox focus telemetry sanitizer.
 *
 * Pure, dependency-free primitives that validate a single CoreBox focus record
 * against a strict allowlist before it may leave the process via Sentry or the
 * Nexus telemetry channel. No general object traversal: only the fields below
 * are accepted, and every value is individually validated.
 */

export const COREBOX_FOCUS_KINDS = ['summon', 'dismiss', 'blur_hide', 'focus', 'pin'] as const
export type CoreBoxFocusKind = (typeof COREBOX_FOCUS_KINDS)[number]

export const COREBOX_FOCUS_STAGES: ReadonlyArray<string> = [
  'attempted',
  'grace_started',
  'shown',
  'focus_granted',
  'focus_denied',
  'focus_failed',
  'hidden',
  'cancelled',
  'aborted'
] as const
export type CoreBoxFocusStage = (typeof COREBOX_FOCUS_STAGES)[number]

/** Stable, non-PII failure classification codes for focus operations. */
export const COREBOX_FOCUS_CODES: ReadonlyArray<string> = [
  'window_not_ready',
  'window_destroyed',
  'create_failed',
  'already_visible',
  'already_hidden',
  'grace_suppressed',
  'onboarding_blocked',
  'focus_error',
  'unexpected_active_element',
  'missing_target',
  'native_transport_error',
  'ok',
  'cancelled_by_user',
  'cancelled_by_shortcut_toggle',
  'cancelled_by_blur'
] as const
export type CoreBoxFocusCode = (typeof COREBOX_FOCUS_CODES)[number]

export type CoreBoxFocusOutcome = 'success' | 'failure' | 'cancelled'

export interface CoreBoxFocusRecord {
  /** What kind of focus transition was attempted. */
  kind: CoreBoxFocusKind
  /** Stable failure / status code drawn from the allowlist above. */
  code: CoreBoxFocusCode
  /** Fine-grained phase within the kind. */
  stage: CoreBoxFocusStage
  /** Correlation id for a summon run — UUIDv4 shape only. */
  summonId: string
  /** 0-based sample index within the summon run. */
  sampleIndex: number
  /** Whether the operation succeeded, failed, or was cancelled. */
  success: boolean
  /** Optional short diagnostic code (never free-form text). */
  detail?: CoreBoxFocusCode
}

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_SAMPLE_INDEX = 1_000_000

/**
 * Validate a single CoreBox focus record.
 *
 * Returns a strictly-typed shallow copy with only allowlisted fields, or
 * `null` when any field fails validation (so invalid records never reach either
 * Sentry or Nexus).
 */
export function sanitizeCoreBoxFocusRecord(
  input: Record<string, unknown> | CoreBoxFocusRecord | undefined | null
): CoreBoxFocusRecord | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null

  const rawKind = input.kind
  const kind = COREBOX_FOCUS_KINDS.find(candidate => candidate === rawKind)
  if (kind === undefined) return null

  const code = input.code
  if (typeof code !== 'string' || !COREBOX_FOCUS_CODES.includes(code)) return null

  const stage = input.stage
  if (typeof stage !== 'string' || !COREBOX_FOCUS_STAGES.includes(stage)) return null

  const summonId = input.summonId
  if (typeof summonId !== 'string' || !UUID_V4_PATTERN.test(summonId)) return null

  const sampleIndex = input.sampleIndex
  if (typeof sampleIndex !== 'number' || !Number.isFinite(sampleIndex) || sampleIndex < 0) {
    return null
  }
  const clampedSampleIndex = Math.min(Math.floor(sampleIndex), MAX_SAMPLE_INDEX)
  if (clampedSampleIndex !== sampleIndex) return null

  if (typeof input.success !== 'boolean') return null

  const record: CoreBoxFocusRecord = {
    kind,
    code,
    stage,
    summonId,
    sampleIndex: clampedSampleIndex,
    success: input.success
  }

  if (input.detail !== undefined && input.detail !== null) {
    const detail = input.detail
    if (COREBOX_FOCUS_CODES.includes(detail as CoreBoxFocusCode)) {
      record.detail = detail as CoreBoxFocusCode
    }
  }

  return record
}
