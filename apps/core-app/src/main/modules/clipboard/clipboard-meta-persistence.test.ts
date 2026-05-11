import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  schedule: vi.fn(async (_label: string, operation: () => Promise<unknown>) => await operation()),
  withSqliteRetry: vi.fn(async (operation: () => Promise<unknown>) => await operation()),
  values: vi.fn(async () => undefined),
  logDebug: vi.fn(),
  logWarn: vi.fn()
}))

vi.mock('../../db/db-write-scheduler', () => ({
  dbWriteScheduler: {
    schedule: mocks.schedule
  }
}))

vi.mock('../../db/sqlite-retry', () => ({
  withSqliteRetry: mocks.withSqliteRetry
}))

vi.mock('../../db/schema', () => ({
  clipboardHistoryMeta: {}
}))

import {
  ClipboardMetaPersistence,
  isDroppedDbWriteTaskError,
  isForeignKeyConstraintError
} from './clipboard-meta-persistence'

function createDb() {
  return {
    insert: vi.fn(() => ({
      values: mocks.values
    }))
  }
}

describe('clipboard-meta-persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.schedule.mockImplementation(
      async (_label: string, operation: () => Promise<unknown>) => await operation()
    )
    mocks.values.mockResolvedValue(undefined)
  })

  it('persists defined metadata entries through the db write scheduler', async () => {
    const db = createDb()
    const persistence = new ClipboardMetaPersistence({
      getDatabase: () => db as never,
      isDestroyed: () => false,
      logDebug: mocks.logDebug,
      logWarn: mocks.logWarn
    })

    await persistence.persistMetaEntries(7, { source: 'app', skipped: undefined })

    expect(mocks.schedule).toHaveBeenCalledWith('clipboard.meta', expect.any(Function), undefined)
    expect(mocks.values).toHaveBeenCalledWith([{ clipboardId: 7, key: 'source', value: '"app"' }])
  })

  it('classifies dropped and foreign-key errors for safe persistence', async () => {
    expect(isDroppedDbWriteTaskError(new Error('DB write task dropped: clipboard.meta'))).toBe(true)
    expect(isForeignKeyConstraintError(new Error('FOREIGN KEY constraint failed'))).toBe(true)

    mocks.values.mockRejectedValueOnce(new Error('DB write task dropped: clipboard.meta'))
    const persistence = new ClipboardMetaPersistence({
      getDatabase: () => createDb() as never,
      isDestroyed: () => false,
      logDebug: mocks.logDebug,
      logWarn: mocks.logWarn
    })

    persistence.persistMetaEntriesSafely(8, { tag: 'url' })
    await Promise.resolve()

    expect(mocks.logDebug).toHaveBeenCalledWith(
      'Clipboard meta write dropped due to queue pressure',
      { meta: { clipboardId: 8 } }
    )
  })
})
