import { sleep } from '@talex-touch/utils'
import { createLogger } from '../utils/logger'

const log = createLogger('DbRetry')

export interface SqliteRetryOptions {
  retries?: number
  baseDelayMs?: number
  maxDelayMs?: number
  label?: string
}

export function isSqliteBusyError(error: unknown): boolean {
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

export async function withSqliteRetry<T>(
  operation: () => Promise<T>,
  options: SqliteRetryOptions = {}
): Promise<T> {
  const retries = options.retries ?? 4
  const baseDelayMs = options.baseDelayMs ?? 120
  const maxDelayMs = options.maxDelayMs ?? 1_000
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

      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt)
      log.warn(`SQLITE_BUSY during ${label}, retry ${attempt + 1}/${retries}`, {
        meta: { delayMs: backoff }
      })
      await sleep(backoff)
    }
  }

  throw lastError
}
