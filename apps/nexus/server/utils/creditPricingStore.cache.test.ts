import type { D1Database } from '@cloudflare/workers-types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1, type SqliteD1Database, type SqliteD1Statement } from '../../test/helpers/d1-sqlite'

/** The price list the call paths read: from memory within the TTL, fresh after an edit or expiry. */

let sqlite: SqliteD1Database
let store: typeof import('./creditPricingStore')

function countingD1(inner: SqliteD1Database) {
  const selects = { count: 0 }
  const wrap = (statement: SqliteD1Statement): SqliteD1Statement => new Proxy(statement, {
    get(target, property, receiver) {
      if (property === 'bind')
        return (...values: unknown[]) => wrap(target.bind(...values))
      if ((property === 'first' || property === 'all') && /^\s*SELECT \* FROM credit_pricing\s*$/.test(target.sql))
        selects.count += 1
      return Reflect.get(target, property, receiver)
    },
  })
  const db = {
    prepare: (sql: string) => wrap(inner.prepare(sql)),
    batch: (statements: SqliteD1Statement[]) => inner.batch(statements),
  }
  return { db: db as unknown as D1Database, selects }
}

/**
 * Holds the answer of the next price-list read until `release()`; `hang()` makes it never settle, as
 * a read whose request was cancelled (its client disconnected) never settles for anyone awaiting it.
 */
function gatedD1(inner: SqliteD1Database) {
  let gate: Promise<void> | null = null
  let release = () => {}
  const wrap = (statement: SqliteD1Statement): SqliteD1Statement => new Proxy(statement, {
    get(target, property, receiver) {
      if (property === 'bind')
        return (...values: unknown[]) => wrap(target.bind(...values))
      if (property === 'all' && /^\s*SELECT \* FROM credit_pricing\s*$/.test(target.sql) && gate) {
        const held = gate
        gate = null
        // Reads now, answers when released: what it answers is what the table held before.
        return async () => {
          const result = await target.all()
          await held
          return result
        }
      }
      return Reflect.get(target, property, receiver)
    },
  })
  const db = {
    prepare: (sql: string) => wrap(inner.prepare(sql)),
    batch: (statements: SqliteD1Statement[]) => inner.batch(statements),
  }
  return {
    db: db as unknown as D1Database,
    hold: () => {
      gate = new Promise<void>((resolve) => { release = resolve })
    },
    hang: () => {
      gate = new Promise<void>(() => {})
    },
    release: () => release(),
  }
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T08:00:00.000Z'))
  vi.resetModules()
  store = await import('./creditPricingStore')
  sqlite = createSqliteD1()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('credit pricing on the call paths', () => {
  it('reads the list once for repeated lookups within the window', async () => {
    const { db, selects } = countingD1(sqlite)
    await store.listCreditPricing(db) // seeds the defaults
    const before = selects.count

    await store.resolveSellableCreditPricingRule(db, 'text.chat')
    await store.resolveCreditPricingRule(db, 'text.translate')
    await store.resolveCreditPricingRule(db, 'text.chat')

    expect(selects.count - before).toBe(1)
  })

  it('does not make other lookups wait on a read that never settles', async () => {
    const gated = gatedD1(sqlite)
    await store.listCreditPricing(gated.db) // seeds the defaults
    gated.hang()

    void store.resolveCreditPricingRule(gated.db, 'text.chat')
    const settled = await Promise.race([
      store.resolveCreditPricingRule(gated.db, 'text.chat').then(rule => rule.capability),
      new Promise(resolve => setTimeout(resolve, 500, 'still waiting')),
    ])

    expect(settled).toBe('text.chat')
  })

  it('does not cache a list read before an edit made through this isolate', async () => {
    const gated = gatedD1(sqlite)
    const original = await store.resolveCreditPricingRule(gated.db, 'text.chat')
    vi.setSystemTime(new Date('2026-10-15T08:00:31.000Z'))

    gated.hold()
    const stale = store.resolveCreditPricingRule(gated.db, 'text.chat')
    await store.updateCreditPricing(gated.db, 'text.chat', { creditsPerUnit: original.creditsPerUnit + 5 })
    gated.release()
    expect((await stale).creditsPerUnit).toBe(original.creditsPerUnit)

    expect((await store.resolveCreditPricingRule(gated.db, 'text.chat')).creditsPerUnit).toBe(original.creditsPerUnit + 5)
  })

  it('sees an edit made through this isolate at once, and others after the window', async () => {
    const { db } = countingD1(sqlite)
    const original = await store.resolveCreditPricingRule(db, 'text.chat')

    await store.updateCreditPricing(db, 'text.chat', { creditsPerUnit: original.creditsPerUnit + 5 })
    expect((await store.resolveCreditPricingRule(db, 'text.chat')).creditsPerUnit).toBe(original.creditsPerUnit + 5)

    // Another isolate's edit: written straight to the table.
    sqlite.sqlite.prepare(`UPDATE credit_pricing SET credits_per_unit = 999 WHERE capability = 'text.chat'`).run()
    expect((await store.resolveCreditPricingRule(db, 'text.chat')).creditsPerUnit).toBe(original.creditsPerUnit + 5)
    vi.setSystemTime(new Date('2026-10-15T08:00:31.000Z'))
    expect((await store.resolveCreditPricingRule(db, 'text.chat')).creditsPerUnit).toBe(999)
  })
})
