import { sleep } from '@talex-touch/utils/common/utils'
import { createLogger } from '../utils/logger'

const log = createLogger('DbRetry')
let SQLITE_BUSY_RETRY_COUNT = 0

export interface SqliteRetryOptions {
  retries?: number
  baseDelayMs?: number
  maxDelayMs?: number
  /** Add jitter to the backoff delay, as a ratio of the delay (0.2 = ±20%). */
  jitterRatio?: number
  /** Throttle retry logs to avoid spamming under sustained contention. */
  logThrottleMs?: number
  label?: string
}

export interface SqliteRetryExhaustedEvent {
  label: string
  attempts: number
  elapsedMs: number
  code?: string
  rawCode?: number
  error: unknown
}

export type SqliteRetryExhaustedListener = (event: SqliteRetryExhaustedEvent) => void

interface RetryLogState {
  lastAt: number
  suppressed: number
}

const RETRY_LOG_STATE = new Map<string, RetryLogState>()
let retryExhaustedListener: SqliteRetryExhaustedListener | null = null

/**
 * Shared per-label throttle for SQLITE_BUSY retry logs. Both `withSqliteRetry`
 * and the DB write scheduler's busy re-enqueue path report through this state,
 * so a contended label logs at most once per throttle window process-wide.
 */
export function nextSqliteBusyRetryLogState(
  label: string,
  throttleMs: number
): { shouldLog: boolean; suppressed: number } {
  if (throttleMs <= 0) return { shouldLog: true, suppressed: 0 }

  const now = Date.now()
  const state = RETRY_LOG_STATE.get(label) ?? { lastAt: 0, suppressed: 0 }
  if (now - state.lastAt < throttleMs) {
    state.suppressed += 1
    RETRY_LOG_STATE.set(label, state)
    return { shouldLog: false, suppressed: state.suppressed }
  }

  const suppressed = state.suppressed
  state.lastAt = now
  state.suppressed = 0
  RETRY_LOG_STATE.set(label, state)
  return { shouldLog: true, suppressed }
}

function isSqliteBusyErrorNode(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const { code, rawCode, message } = error as {
    code?: string
    rawCode?: number
    message?: string
  }

  // Match all SQLITE_BUSY extended error codes:
  //   SQLITE_BUSY (5), SQLITE_BUSY_RECOVERY (261),
  //   SQLITE_BUSY_SNAPSHOT (517), SQLITE_BUSY_TIMEOUT (773)
  if (code === 'SQLITE_BUSY' || rawCode === 5) return true
  if (typeof code === 'string' && code.startsWith('SQLITE_BUSY')) return true
  if (typeof rawCode === 'number' && rawCode > 5 && rawCode % 256 === 5) return true

  return typeof message === 'string' && message.includes('SQLITE_BUSY')
}

function hasSqliteBusyError(error: unknown, visited = new Set<unknown>()): boolean {
  if (!error || typeof error !== 'object') return false
  if (visited.has(error)) return false
  visited.add(error)

  if (isSqliteBusyErrorNode(error)) return true

  if (error instanceof AggregateError) {
    for (const item of error.errors) {
      if (hasSqliteBusyError(item, visited)) return true
    }
  }

  const nextCandidates = [
    (error as { cause?: unknown }).cause,
    (error as { original?: unknown }).original,
    (error as { error?: unknown }).error
  ]

  for (const next of nextCandidates) {
    if (hasSqliteBusyError(next, visited)) return true
  }

  return false
}

export function isSqliteBusyError(error: unknown): boolean {
  return hasSqliteBusyError(error)
}

function isSqliteCorruptionErrorNode(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const { code, rawCode, message } = error as {
    code?: string
    rawCode?: number
    message?: string
  }

  // SQLITE_CORRUPT (11) and its extended codes — SQLITE_CORRUPT_VTAB (267),
  // SQLITE_CORRUPT_SEQUENCE (523), SQLITE_CORRUPT_INDEX (779) — all satisfy
  // rawCode % 256 === 11. SQLITE_NOTADB (26) means the header is unreadable
  // (truncated/foreign file); it is equally unrecoverable and must be rebuilt.
  if (code === 'SQLITE_CORRUPT' || code === 'SQLITE_NOTADB') return true
  if (typeof code === 'string' && code.startsWith('SQLITE_CORRUPT')) return true
  if (rawCode === 11 || rawCode === 26) return true
  if (typeof rawCode === 'number' && rawCode > 11 && rawCode % 256 === 11) return true

  if (typeof message !== 'string') return false
  return (
    message.includes('SQLITE_CORRUPT') ||
    message.includes('SQLITE_NOTADB') ||
    message.includes('database disk image is malformed') ||
    message.includes('file is not a database') ||
    message.includes('malformed database schema')
  )
}

function hasSqliteCorruptionError(error: unknown, visited = new Set<unknown>()): boolean {
  if (!error || typeof error !== 'object') return false
  if (visited.has(error)) return false
  visited.add(error)

  if (isSqliteCorruptionErrorNode(error)) return true

  if (error instanceof AggregateError) {
    for (const item of error.errors) {
      if (hasSqliteCorruptionError(item, visited)) return true
    }
  }

  const nextCandidates = [
    (error as { cause?: unknown }).cause,
    (error as { original?: unknown }).original,
    (error as { error?: unknown }).error
  ]

  for (const next of nextCandidates) {
    if (hasSqliteCorruptionError(next, visited)) return true
  }

  return false
}

/**
 * True when the error (or any error in its cause chain) indicates on-disk
 * database corruption — a structural failure that retrying cannot fix and that
 * requires rebuilding the database file.
 */
export function isSqliteCorruptionError(error: unknown): boolean {
  return hasSqliteCorruptionError(error)
}

export function getSqliteBusyRetryCount(): number {
  return SQLITE_BUSY_RETRY_COUNT
}

/**
 * Count one SQLITE_BUSY retry attempt. Incremented by `withSqliteRetry` and by
 * the DB write scheduler's delayed re-enqueue path so the DatabaseModule
 * health snapshot's `busyRetryDelta` covers both retry mechanisms.
 */
export function incrementSqliteBusyRetryCount(): void {
  SQLITE_BUSY_RETRY_COUNT += 1
}

export function setSqliteRetryExhaustedListener(
  listener: SqliteRetryExhaustedListener | null
): () => void {
  retryExhaustedListener = listener
  return () => {
    if (retryExhaustedListener === listener) retryExhaustedListener = null
  }
}

/**
 * Fire the process-wide retry-exhausted listener (DatabaseModule reports it as
 * DATABASE_BUSY_RETRY_EXHAUSTED). Exposed so the DB write scheduler's
 * scheduler-owned busy retries emit the exact same event as `withSqliteRetry`.
 */
export function notifySqliteRetryExhausted(event: SqliteRetryExhaustedEvent): void {
  try {
    retryExhaustedListener?.(event)
  } catch (error) {
    log.warn('SQLite retry exhaustion listener failed', { error })
  }
}

/**
 * Extract the first `code`/`rawCode` found along an error's cause chain.
 * Shared decoder for SQLite error identity — do not re-cast these fields at
 * call sites.
 */
export function resolveSqliteErrorIdentity(error: unknown): { code?: string; rawCode?: number } {
  const visited = new Set<unknown>()
  let code: string | undefined
  let rawCode: number | undefined
  let current: unknown = error
  while (current && typeof current === 'object' && !visited.has(current)) {
    visited.add(current)
    const record = current as {
      code?: unknown
      rawCode?: unknown
      cause?: unknown
      original?: unknown
      error?: unknown
    }
    if (!code && typeof record.code === 'string') code = record.code
    if (rawCode === undefined && typeof record.rawCode === 'number') rawCode = record.rawCode
    current = record.cause ?? record.original ?? record.error
  }
  return { code, rawCode }
}

/**
 * Exponential busy-backoff with jitter: `baseDelayMs * 2^attempt` capped at
 * `maxDelayMs`, then ±`jitterRatio` random jitter. Single implementation
 * shared by `withSqliteRetry` and the DB write scheduler's delayed re-enqueue.
 */
export function computeSqliteBusyBackoffMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitterRatio: number
): number {
  const backoffBase = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt)
  const jitter = backoffBase * jitterRatio
  return Math.max(0, Math.round(backoffBase + (Math.random() * 2 - 1) * jitter))
}

export async function withSqliteRetry<T>(
  operation: () => Promise<T>,
  options: SqliteRetryOptions = {}
): Promise<T> {
  const retries = options.retries ?? 6
  const baseDelayMs = options.baseDelayMs ?? 200
  const maxDelayMs = options.maxDelayMs ?? 3_000
  const jitterRatio = options.jitterRatio ?? 0.2
  const logThrottleMs = options.logThrottleMs ?? 30_000
  const label = options.label ?? 'sqlite'
  const startedAt = Date.now()

  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      const busy = isSqliteBusyError(error)
      if (!busy) throw error
      if (attempt >= retries) {
        notifySqliteRetryExhausted({
          label,
          attempts: attempt + 1,
          elapsedMs: Math.max(0, Date.now() - startedAt),
          ...resolveSqliteErrorIdentity(error),
          error
        })
        throw error
      }

      const backoff = computeSqliteBusyBackoffMs(attempt, baseDelayMs, maxDelayMs, jitterRatio)

      const logState = nextSqliteBusyRetryLogState(label, logThrottleMs)
      incrementSqliteBusyRetryCount()
      if (logState.shouldLog) {
        log.warn(`SQLITE_BUSY during ${label}, retry ${attempt + 1}/${retries}`, {
          meta: {
            delayMs: backoff,
            suppressedRetries: logState.suppressed > 0 ? logState.suppressed : undefined
          }
        })
      }
      await sleep(backoff)
    }
  }

  throw lastError
}
