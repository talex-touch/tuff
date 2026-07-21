import { afterEach, describe, expect, it, vi } from 'vitest'
import { DbWriteScheduler } from './db-write-scheduler'
import {
  getSqliteBusyRetryCount,
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
