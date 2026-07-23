import { afterEach, describe, expect, it, vi } from 'vitest'
import { DbWriteScheduler } from './db-write-scheduler'
import {
  getSqliteBusyRetryCount,
  isSqliteCorruptionError,
  setSqliteRetryExhaustedListener,
  withSqliteRetry
} from './sqlite-retry'

let disposeListener: (() => void) | null = null

afterEach(() => {
  disposeListener?.()
  disposeListener = null
})

function sqliteBusyError(): Error {
  return Object.assign(new Error('database is locked'), {
    code: 'SQLITE_BUSY',
    rawCode: 5
  })
}

describe('SQLite retry exhaustion observer', () => {
  it('emits one structured event only after direct retries are exhausted', async () => {
    const listener = vi.fn()
    disposeListener = setSqliteRetryExhaustedListener(listener)
    const error = sqliteBusyError()
    const operation = vi.fn(async () => {
      throw error
    })
    const retriesBefore = getSqliteBusyRetryCount()

    await expect(
      withSqliteRetry(operation, {
        label: 'file-index.test-reset',
        retries: 1,
        baseDelayMs: 0,
        maxDelayMs: 0,
        jitterRatio: 0
      })
    ).rejects.toBe(error)

    expect(operation).toHaveBeenCalledTimes(2)
    expect(getSqliteBusyRetryCount() - retriesBefore).toBe(1)
    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith({
      label: 'file-index.test-reset',
      attempts: 2,
      elapsedMs: expect.any(Number),
      code: 'SQLITE_BUSY',
      rawCode: 5,
      error
    })
  })

  it('observes exhaustion when retry runs inside the shared scheduler', async () => {
    const listener = vi.fn()
    disposeListener = setSqliteRetryExhaustedListener(listener)
    const scheduler = new DbWriteScheduler()
    const error = sqliteBusyError()

    await expect(
      scheduler.schedule(
        'file-index.scheduled-reset',
        () =>
          withSqliteRetry(
            async () => {
              throw error
            },
            {
              label: 'file-index.scheduled-reset',
              retries: 0
            }
          ),
        { priority: 'interactive', dropPolicy: 'none' }
      )
    ).rejects.toBe(error)

    expect(listener).toHaveBeenCalledOnce()
    expect(listener.mock.calls[0][0]).toMatchObject({
      label: 'file-index.scheduled-reset',
      attempts: 1,
      code: 'SQLITE_BUSY'
    })
  })
})

describe('isSqliteCorruptionError', () => {
  it('detects SQLITE_CORRUPT by code', () => {
    expect(
      isSqliteCorruptionError(
        Object.assign(new Error('database disk image is malformed'), {
          code: 'SQLITE_CORRUPT',
          rawCode: 11
        })
      )
    ).toBe(true)
  })

  it('detects extended corruption codes by rawCode (% 256 === 11)', () => {
    // SQLITE_CORRUPT_INDEX = 779
    expect(isSqliteCorruptionError(Object.assign(new Error('x'), { rawCode: 779 }))).toBe(true)
  })

  it('detects SQLITE_NOTADB (unreadable header)', () => {
    expect(
      isSqliteCorruptionError(Object.assign(new Error('file is not a database'), { rawCode: 26 }))
    ).toBe(true)
  })

  it('detects corruption message without a code', () => {
    expect(isSqliteCorruptionError(new Error('database disk image is malformed'))).toBe(true)
  })

  it('unwraps nested cause chains', () => {
    const inner = Object.assign(new Error('malformed'), { code: 'SQLITE_CORRUPT' })
    expect(isSqliteCorruptionError(new Error('wrapper', { cause: inner }))).toBe(true)
  })

  it('does not flag SQLITE_BUSY or generic errors as corruption', () => {
    expect(
      isSqliteCorruptionError(Object.assign(new Error('locked'), { code: 'SQLITE_BUSY' }))
    ).toBe(false)
    expect(isSqliteCorruptionError(new Error('some unrelated failure'))).toBe(false)
    expect(isSqliteCorruptionError(null)).toBe(false)
  })
})
