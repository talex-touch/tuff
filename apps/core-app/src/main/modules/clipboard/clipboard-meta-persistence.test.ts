import { beforeEach, describe, expect, it, vi } from 'vitest'

async function waitForSafePersistenceCatch(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
}

const mocks = vi.hoisted(() => ({
  schedule: vi.fn(async (_label: string, operation: () => Promise<unknown>) => await operation()),
  values: vi.fn(async () => undefined),
  deleteWhere: vi.fn(async () => undefined),
  logDebug: vi.fn(),
  logWarn: vi.fn()
}))

vi.mock('../../db/db-write-scheduler', () => ({
  dbWriteScheduler: {
    schedule: mocks.schedule
  }
}))

vi.mock('../../db/schema', () => ({
  clipboardHistoryMeta: { clipboardId: 'clipboard_id', key: 'key' }
}))

vi.mock('drizzle-orm', () => ({
  and: (...parts: unknown[]) => ({ and: parts }),
  eq: (column: unknown, value: unknown) => ({ eq: [column, value] }),
  inArray: (column: unknown, values: unknown[]) => ({ inArray: [column, values] })
}))

import {
  ClipboardMetaPersistence,
  isDroppedDbWriteTaskError,
  isForeignKeyConstraintError
} from './clipboard-meta-persistence'

/**
 * Models the shape the writer actually uses: a transaction wrapping a delete and an insert.
 *
 * Before #646 this only needed `insert`. A stub without `transaction` is why that change first
 * showed up as "db.transaction is not a function" rather than as a behavioural failure.
 */
function createDb() {
  const tx = {
    delete: vi.fn(() => ({ where: mocks.deleteWhere })),
    insert: vi.fn(() => ({ values: mocks.values }))
  }
  return {
    tx,
    insert: vi.fn(() => ({ values: mocks.values })),
    transaction: vi.fn(async (run: (handle: typeof tx) => Promise<unknown>) => await run(tx))
  }
}

function createPersistence(db: ReturnType<typeof createDb>): ClipboardMetaPersistence {
  return new ClipboardMetaPersistence({
    getDatabase: () => db as never,
    resolveAuxDb: () => ({ db: db as never, isAux: true }),
    isDestroyed: () => false,
    logDebug: mocks.logDebug,
    logWarn: mocks.logWarn
  })
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
    const persistence = createPersistence(createDb())

    await persistence.persistMetaEntries(7, { source: 'app', skipped: undefined })

    // The enqueue-time aux resolution stamps the resolved lane on the options.
    expect(mocks.schedule).toHaveBeenCalledWith('clipboard.meta', expect.any(Function), {
      lane: 'aux'
    })
    expect(mocks.values).toHaveBeenCalledWith([{ clipboardId: 7, key: 'source', value: '"app"' }])
  })

  it('clears the previous rows for the same keys before inserting', async () => {
    // #646: without this each update appended a row, and both the hydrate fold and the key/value
    // filters could then see a superseded value.
    const db = createDb()
    const persistence = createPersistence(db)

    await persistence.persistMetaEntries(7, { source: 'app', category: 'image' })

    expect(db.transaction).toHaveBeenCalledOnce()
    expect(db.tx.delete).toHaveBeenCalledOnce()
    expect(mocks.deleteWhere).toHaveBeenCalledWith({
      and: [{ eq: ['clipboard_id', 7] }, { inArray: ['key', ['source', 'category']] }]
    })
  })

  it('deletes and inserts in one transaction', async () => {
    // Two statements outside a transaction would leave a window with the old rows gone and the
    // new ones not yet written — a concurrent read there sees the key missing entirely.
    const db = createDb()
    const persistence = createPersistence(db)

    await persistence.persistMetaEntries(7, { source: 'app' })

    expect(db.insert).not.toHaveBeenCalled()
    expect(db.tx.insert).toHaveBeenCalledOnce()
  })

  it('classifies dropped and foreign-key errors for safe persistence', async () => {
    expect(isDroppedDbWriteTaskError(new Error('DB write task dropped: clipboard.meta'))).toBe(true)
    expect(isForeignKeyConstraintError(new Error('FOREIGN KEY constraint failed'))).toBe(true)

    mocks.values.mockRejectedValueOnce(new Error('DB write task dropped: clipboard.meta'))
    const persistence = createPersistence(createDb())

    persistence.persistMetaEntriesSafely(8, { tag: 'url' })
    await waitForSafePersistenceCatch()

    expect(mocks.logDebug).toHaveBeenCalledWith(
      'Clipboard meta write dropped due to queue pressure',
      { meta: { clipboardId: 8 } }
    )
  })
})
