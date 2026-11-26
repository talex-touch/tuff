import type { TdsLintIssue } from './types'

/** Maximum repaired frame content digests retained in memory per tracker instance. */
export const MAX_AUTO_FIX_TRACKED_DIGESTS = 256

/** Cap on accompanying warnings appended as secondary context in an auto-fix repair prompt. */
const MAX_AUTO_FIX_WARNINGS_IN_PROMPT = 8

export type TdsAutoFixSkipReason =
  | 'disabled'
  | 'in-flight'
  | 'empty-digest'
  | 'no-errors'
  | 'already-repaired'
  | 'frame-budget-exhausted'

export interface TdsAutoFixCheckInput {
  /** Opt-in flag; auto-fix never fires when `false`. */
  enabled: boolean
  /** Deterministic content digest representing the current frame/document revision. */
  contentDigest: string
  /** Static or already-merged lint issues for the current frame. */
  issues: readonly TdsLintIssue[]
  /** Optional Phase 2 DOM probe findings to merge & deduplicate with `issues`. */
  domIssues?: readonly TdsLintIssue[]
  /** Optional frame identifier for per-frame round tracking. */
  frameId?: string
  /** Optional human-readable frame title or file path shown in the generated prompt. */
  displayPath?: string
  /** True while an AI repair turn is already running (blocks duplicate triggers). */
  inFlight?: boolean
}

export interface TdsAutoFixDecision {
  /** Whether an automatic repair pass should fire now. */
  shouldTrigger: boolean
  /** Machine-readable decision outcome (`'trigger'` or the blocking guard reason). */
  reason: 'trigger' | TdsAutoFixSkipReason
  /** Normalized content digest evaluated by the loop breaker. */
  digest: string
  /** Blocking `error`-severity issues across merged static + DOM findings. */
  errorIssues: TdsLintIssue[]
  /** Full deduplicated list of merged static + DOM findings. */
  mergedIssues: TdsLintIssue[]
  /** Structured repair prompt when `shouldTrigger` is `true`, otherwise `''`. */
  prompt: string
}

export interface TdsAutoFixTrackerOptions {
  /** Maximum repaired content digests remembered (default: `256`). */
  maxTrackedDigests?: number
  /**
   * Optional hard cap on total automatic repair rounds per `frameId` across distinct digests
   * until `resetFrame(frameId)` is called. When omitted, the tracker enforces 1 pass per unique
   * content digest.
   */
  maxRoundsPerFrame?: number
}

export interface TdsAutoFixTrackerReadonly {
  hasRepaired(digest: string): boolean
  getFrameRounds(frameId: string): number
}

export interface TdsAutoFixTracker extends TdsAutoFixTrackerReadonly {
  markRepaired(digest: string, frameId?: string): void
  evaluate(input: TdsAutoFixCheckInput): TdsAutoFixDecision
  consume(input: TdsAutoFixCheckInput): TdsAutoFixDecision
  resetFrame(frameId: string): void
  clear(): void
  size(): number
}

/**
 * Deterministic 64-bit FNV-1a (two independent 32-bit lanes) hex digest for frame content
 * deduplication without requiring async WebCrypto APIs.
 */
export function computeTdsContentDigest(content: string): string {
  if (!content || !content.trim()) return ''
  let h1 = 0x811c9dc5
  let h2 = 0x9e3779b1
  for (let i = 0; i < content.length; i += 1) {
    const code = content.charCodeAt(i)
    h1 ^= code
    h1 = Math.imul(h1, 0x01000193)
    h2 ^= code ^ ((i & 0xff) + 1)
    h2 = Math.imul(h2, 0x85ebca6b)
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`
}

/**
 * Pure, side-effect-free merger for Phase 1 (`static`) and Phase 2 (`dom`) TDS lint findings.
 * Deduplicates identical entries while preserving each finding's phase and original order.
 */
export function mergeTdsLintIssues(
  staticIssues: readonly TdsLintIssue[],
  domIssues: readonly TdsLintIssue[] = []
): TdsLintIssue[] {
  const merged: TdsLintIssue[] = []
  const seen = new Set<string>()

  const pushUnique = (issue: TdsLintIssue, fallbackPhase: 'static' | 'dom'): void => {
    const phase = issue.phase === 'dom' || issue.phase === 'static' ? issue.phase : fallbackPhase
    const dedupeKey = [
      phase,
      issue.ruleId,
      issue.line ?? '',
      issue.column ?? '',
      issue.selector ?? '',
      issue.snippet ?? '',
      issue.message
    ].join('|')

    if (seen.has(dedupeKey)) return
    seen.add(dedupeKey)
    merged.push({ ...issue, phase })
  }

  for (const issue of staticIssues) pushUnique(issue, 'static')
  for (const issue of domIssues) pushUnique(issue, 'dom')
  return merged
}

function formatIssueBullet(issue: TdsLintIssue, index: number): string {
  const locParts: string[] = []
  if (issue.line !== undefined) {
    locParts.push(issue.column !== undefined ? `L${issue.line}:${issue.column}` : `L${issue.line}`)
  }
  if (issue.selector) {
    locParts.push(issue.selector)
  }
  const loc = locParts.length > 0 ? ` (${locParts.join(', ')})` : ''
  const snippet = issue.snippet ? ` — \`${issue.snippet}\`` : ''
  const phaseTag = issue.phase === 'dom' ? 'DOM' : 'STATIC'
  return `${index + 1}. [${phaseTag}][${issue.severity.toUpperCase()}] \`${issue.ruleId}\`${loc}: ${issue.message}${snippet}\n   Fix: ${issue.fixHint}`
}

/**
 * Builds a structured 1-pass auto-fix repair prompt from merged static + DOM findings.
 * Returns `''` when no `error`-severity issues exist.
 */
export function formatAutoFixRepairPrompt(
  issues: readonly TdsLintIssue[],
  displayPath = ''
): string {
  const errorIssues = issues.filter((issue) => issue.severity === 'error')
  if (errorIssues.length === 0) return ''

  const warningIssues = issues.filter((issue) => issue.severity === 'warning')
  const target = displayPath.trim() ? `\`${displayPath.trim()}\`` : 'the current preview'

  const summaryParts: string[] = [
    `${errorIssues.length} error${errorIssues.length === 1 ? '' : 's'}`
  ]
  if (warningIssues.length > 0) {
    summaryParts.push(`${warningIssues.length} warning${warningIssues.length === 1 ? '' : 's'}`)
  }

  const sections: string[] = [
    `Auto-fix the following TDS visual lint errors in ${target} (${summaryParts.join(', ')}):`,
    '',
    'Blocking errors (must fix):',
    ...errorIssues.map((issue, idx) => formatIssueBullet(issue, idx))
  ]

  if (warningIssues.length > 0) {
    const shownWarnings = warningIssues.slice(0, MAX_AUTO_FIX_WARNINGS_IN_PROMPT)
    sections.push(
      '',
      'Related warnings (fix if safe):',
      ...shownWarnings.map((issue, idx) => formatIssueBullet(issue, idx))
    )
    if (warningIssues.length > shownWarnings.length) {
      sections.push(`...and ${warningIssues.length - shownWarnings.length} more warning(s).`)
    }
  }

  sections.push(
    '',
    'Resolve every blocking error in a single pass. Keep the output offline-safe (no remote http(s) asset URLs), use canonical `--shell-*` / `--tx-*` tokens, preserve layout intent, and avoid generic AI styling.'
  )

  return sections.join('\n')
}

function isAlreadyRepaired(
  digest: string,
  tracker?: TdsAutoFixTrackerReadonly | ReadonlySet<string>
): boolean {
  if (!tracker) return false
  if ('hasRepaired' in tracker) return tracker.hasRepaired(digest)
  return tracker.has(digest)
}

function getTrackedFrameRounds(
  frameId: string,
  tracker?: TdsAutoFixTrackerReadonly | ReadonlySet<string>
): number {
  if (!tracker || !('getFrameRounds' in tracker)) return 0
  return tracker.getFrameRounds(frameId)
}

/**
 * Pure loop-breaker predicate deciding whether an automatic 1-pass TDS lint repair should fire.
 *
 * Hard invariants:
 * - Opt-in only (`enabled === true`).
 * - Never fires while another request is in flight (`inFlight === true`).
 * - Requires a non-empty content digest.
 * - Fires ONLY when at least one `error`-severity issue exists across merged static + DOM findings.
 * - Fires at most once per unique content digest (and respects optional per-frame budget).
 */
export function shouldTriggerAutoLintFix(
  input: TdsAutoFixCheckInput,
  tracker?: TdsAutoFixTrackerReadonly | ReadonlySet<string>,
  maxRoundsPerFrame?: number
): TdsAutoFixDecision {
  const digest = input.contentDigest.trim()
  const mergedIssues = mergeTdsLintIssues(input.issues, input.domIssues ?? [])
  const errorIssues = mergedIssues.filter((issue) => issue.severity === 'error')

  const skip = (reason: TdsAutoFixSkipReason): TdsAutoFixDecision => ({
    shouldTrigger: false,
    reason,
    digest,
    errorIssues,
    mergedIssues,
    prompt: ''
  })

  if (!input.enabled) return skip('disabled')
  if (input.inFlight) return skip('in-flight')
  if (!digest) return skip('empty-digest')
  if (errorIssues.length === 0) return skip('no-errors')
  if (isAlreadyRepaired(digest, tracker)) return skip('already-repaired')

  const frameId = input.frameId?.trim() ?? ''
  if (
    frameId &&
    typeof maxRoundsPerFrame === 'number' &&
    Number.isFinite(maxRoundsPerFrame) &&
    maxRoundsPerFrame >= 0 &&
    getTrackedFrameRounds(frameId, tracker) >= Math.floor(maxRoundsPerFrame)
  ) {
    return skip('frame-budget-exhausted')
  }

  const prompt = formatAutoFixRepairPrompt(mergedIssues, input.displayPath)
  if (!prompt) return skip('no-errors')

  return {
    shouldTrigger: true,
    reason: 'trigger',
    digest,
    errorIssues,
    mergedIssues,
    prompt
  }
}

/**
 * Builds a deterministic, bounded 1-pass auto-fix tracker for preview/canvas frames.
 * Tracks repaired content digests so identical content can never trigger a second auto-fix round.
 */
export function buildTdsAutoFixTracker(options: TdsAutoFixTrackerOptions = {}): TdsAutoFixTracker {
  const maxTrackedDigests =
    typeof options.maxTrackedDigests === 'number' && Number.isFinite(options.maxTrackedDigests)
      ? Math.max(1, Math.floor(options.maxTrackedDigests))
      : MAX_AUTO_FIX_TRACKED_DIGESTS
  const maxRoundsPerFrame = options.maxRoundsPerFrame

  const repairedDigests = new Set<string>()
  const frameRounds = new Map<string, number>()

  const tracker: TdsAutoFixTracker = {
    hasRepaired(digest: string): boolean {
      const normalized = digest.trim()
      return normalized.length > 0 && repairedDigests.has(normalized)
    },

    getFrameRounds(frameId: string): number {
      const normalized = frameId.trim()
      if (!normalized) return 0
      return frameRounds.get(normalized) ?? 0
    },

    markRepaired(digest: string, frameId?: string): void {
      const normalized = digest.trim()
      if (!normalized) return
      if (!repairedDigests.has(normalized)) {
        while (repairedDigests.size >= maxTrackedDigests) {
          const oldest = repairedDigests.values().next().value as string | undefined
          if (oldest === undefined) break
          repairedDigests.delete(oldest)
        }
        repairedDigests.add(normalized)
      }
      const normalizedFrame = frameId?.trim() ?? ''
      if (normalizedFrame) {
        frameRounds.set(normalizedFrame, (frameRounds.get(normalizedFrame) ?? 0) + 1)
      }
    },

    evaluate(input: TdsAutoFixCheckInput): TdsAutoFixDecision {
      return shouldTriggerAutoLintFix(input, tracker, maxRoundsPerFrame)
    },

    consume(input: TdsAutoFixCheckInput): TdsAutoFixDecision {
      const decision = shouldTriggerAutoLintFix(input, tracker, maxRoundsPerFrame)
      if (decision.shouldTrigger) {
        tracker.markRepaired(decision.digest, input.frameId)
      }
      return decision
    },

    resetFrame(frameId: string): void {
      const normalized = frameId.trim()
      if (normalized) {
        frameRounds.delete(normalized)
      }
    },

    clear(): void {
      repairedDigests.clear()
      frameRounds.clear()
    },

    size(): number {
      return repairedDigests.size
    }
  }

  return tracker
}
