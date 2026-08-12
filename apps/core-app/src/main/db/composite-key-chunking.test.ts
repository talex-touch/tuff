import { describe, expect, it, vi } from 'vitest'

/**
 * Composite-key lookups must not exceed SQLite's bound-parameter ceiling (#653).
 *
 * getUsageStatsBatch and getItemTimeStatsBatch each build two `inArray` lists, so one key costs two
 * bound parameters. Past SQLITE_MAX_VARIABLE_NUMBER — 32,766 by default — the statement fails
 * outright with 'too many SQL variables', which for a user with enough tracked items meant a cold
 * recommend() erroring rather than degrading.
 */

vi.mock('./db-write', () => ({
  resolveCurrentAuxDb: () => null,
  scheduleAuxWrite: vi.fn()
}))

vi.mock('../utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() })
}))

import { createDbUtils } from './utils'

/**
 * drizzle's and/inArray are real here; the fake `where` cannot count their parameters, so the
 * chunking is asserted through the number of statements instead — one per chunk.
 */
function createCountingDb() {
  const statements: number[] = []
  let pendingKeys = 0

  const builder = {
    from: () => builder,
    where: () => {
      statements.push(pendingKeys)
      return Promise.resolve([])
    },
    orderBy: () => builder,
    limit: () => Promise.resolve([])
  }

  return {
    statements,
    setPending: (count: number) => {
      pendingKeys = count
    },
    db: { select: () => builder } as never
  }
}

const keysFor = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    sourceId: 'app-provider',
    itemId: `item-${index}`
  }))

describe('composite-key chunking', () => {
  it('issues one statement for a small key set', async () => {
    // Positive control: the split below is only meaningful if the unsplit case is one statement.
    const { db, statements } = createCountingDb()
    const utils = createDbUtils(db)

    await utils.getUsageStatsBatch(keysFor(10))

    expect(statements).toHaveLength(1)
  })

  it('splits a key set that would exceed the parameter ceiling', async () => {
    const { db, statements } = createCountingDb()
    const utils = createDbUtils(db)

    // 20,000 keys is 40,000 bound parameters in a single statement — past the 32,766 ceiling.
    await utils.getUsageStatsBatch(keysFor(20_000))

    expect(statements.length).toBeGreaterThan(1)
  })

  it('applies the same split to item time stats', async () => {
    // Identical shape, two definitions apart in the same file.
    const { db, statements } = createCountingDb()
    const utils = createDbUtils(db)

    await utils.getItemTimeStatsBatch(keysFor(20_000))

    expect(statements.length).toBeGreaterThan(1)
  })

  it('still returns nothing for an empty key set', async () => {
    const { db, statements } = createCountingDb()
    const utils = createDbUtils(db)

    expect(await utils.getUsageStatsBatch([])).toEqual([])
    expect(statements).toHaveLength(0)
  })
})

describe('getAllItemTimeStats bounds', () => {
  it('applies a limit rather than reading the whole table', async () => {
    const calls: Array<{ limited: boolean }> = []
    const builder = {
      from: () => builder,
      orderBy: () => builder,
      limit: () => {
        calls.push({ limited: true })
        return Promise.resolve([])
      }
    }
    const utils = createDbUtils({ select: () => builder } as never)

    await utils.getAllItemTimeStats()

    expect(calls).toEqual([{ limited: true }])
  })
})
