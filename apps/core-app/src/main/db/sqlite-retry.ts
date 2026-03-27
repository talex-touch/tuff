import { sleep } from '@talex-touch/utils'
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

interface RetryLogState {
  lastAt: number
  suppressed: number
}

const RETRY_LOG_STATE = new Map<string, RetryLogState>()

function nextRetryLogState(
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

export function getSqliteBusyRetryCount(): number {
  return SQLITE_BUSY_RETRY_COUNT
}

export async function withSqliteRetry<T>(
  operation: () => Promise<T>,
  options: SqliteRetryOptions = {}
): Promise<T> {
  const retries = options.retries ?? 4
  const baseDelayMs = options.baseDelayMs ?? 200
  const maxDelayMs = options.maxDelayMs ?? 2_000
  const jitterRatio = options.jitterRatio ?? 0.2
  const logThrottleMs = options.logThrottleMs ?? 30_000
  const label = options.label ?? 'sqlite'

  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (!isSqliteBusyError(error) || attempt >= retries) {
        throw error
      }

      const backoffBase = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt)
      const jitter = backoffBase * jitterRatio
      const backoff = Math.max(0, Math.round(backoffBase + (Math.random() * 2 - 1) * jitter))

      const logState = nextRetryLogState(label, logThrottleMs)
      SQLITE_BUSY_RETRY_COUNT += 1
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
