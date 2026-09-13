import { DatabaseSync } from 'node:sqlite'
import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enforceAdminRateLimit } from './adminRateLimitStore'

const TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS admin_rate_limits (
    key TEXT PRIMARY KEY,
    window_start INTEGER NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    blocked_until INTEGER,
    updated_at INTEGER NOT NULL
  );
`

/**
 * A D1-shaped driver over real in-memory SQLite.
 *
 * The microtask yield before every statement is what makes this harness able to see the bug it
 * exists to catch: a read-then-write limiter lets concurrent callers all read the same count and
 * overwrite each other, so more than `limit` calls succeed. A single conditional UPSERT is
 * atomic and stays correct. Without the yield the statements would run back-to-back and a lost
 * update could never happen, which would make the concurrency test vacuous.
 */
function createD1(db: DatabaseSync) {
  function statement(sql: string) {
    const prepared = db.prepare(sql)
    const bound = (args: unknown[]) => ({
      async first<T>() {
        await Promise.resolve()
        return (prepared.get(...(args as never[])) ?? null) as T | null
      },
      async run() {
        await Promise.resolve()
        prepared.run(...(args as never[]))
        return { meta: { changes: 1 } }
      },
      async all<T>() {
        await Promise.resolve()
        return { results: prepared.all(...(args as never[])) as T[] }
      },
    })
    return { ...bound([]), bind: (...args: unknown[]) => bound(args) }
  }
  return { prepare: statement }
}

const db = new DatabaseSync(':memory:')
const d1 = createD1(db)

function eventFor() {
  const setHeader = vi.fn()
  return {
    event: {
      context: { cloudflare: { env: { DB: d1 } } },
      node: { res: { setHeader } },
    } as unknown as H3Event,
    setHeader,
  }
}

const CONFIG = {
  key: 'asr-transcribe:user:user-1',
  limit: 12,
  windowMs: 60_000,
  blockMs: 60_000,
} as const

function readRow(key: string): { count: number, blocked_until: number | null } | undefined {
  return db.prepare('SELECT count, blocked_until FROM admin_rate_limits WHERE key = ?').get(key) as
    | { count: number, blocked_until: number | null }
    | undefined
}

describe('enforceAdminRateLimit', () => {
  beforeEach(() => {
    db.exec('DROP TABLE IF EXISTS admin_rate_limits')
    db.exec(TABLE_DDL)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-13T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('admits exactly the configured limit when many calls race on one key', async () => {
    const { event } = eventFor()

    const outcomes = await Promise.allSettled(
      Array.from({ length: 20 }, () => enforceAdminRateLimit(event, CONFIG)),
    )

    const allowed = outcomes.filter((outcome) => outcome.status === 'fulfilled').length
    const blocked = outcomes.filter((outcome) => outcome.status === 'rejected')
    expect(allowed).toBe(CONFIG.limit)
    expect(blocked).toHaveLength(8)
    for (const outcome of blocked) {
      expect((outcome as PromiseRejectedResult).reason).toMatchObject({ statusCode: 429 })
    }
    // The 13th call is the one that crossed the limit; later attempts must not inflate the
    // counter further, or a burst would permanently poison the next window's starting count.
    expect(readRow(CONFIG.key)).toEqual({
      count: CONFIG.limit + 1,
      blocked_until: Date.now() + CONFIG.blockMs,
    })
  })

  it('does not extend an active block when the caller keeps retrying', async () => {
    const { event, setHeader } = eventFor()
    for (let attempt = 1; attempt <= CONFIG.limit; attempt += 1) {
      await enforceAdminRateLimit(event, CONFIG)
    }
    await expect(enforceAdminRateLimit(event, CONFIG)).rejects.toMatchObject({ statusCode: 429 })
    const blockedUntil = readRow(CONFIG.key)!.blocked_until

    vi.advanceTimersByTime(30_000)
    setHeader.mockClear()
    await expect(enforceAdminRateLimit(event, CONFIG)).rejects.toMatchObject({ statusCode: 429 })

    // Retrying while blocked must report the remaining wait, not restart it: otherwise a client
    // polling a 429 would keep itself locked out forever.
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '30')
    expect(readRow(CONFIG.key)!.blocked_until).toBe(blockedUntil)
  })

  it('starts a fresh count once the block has elapsed', async () => {
    const { event } = eventFor()
    for (let attempt = 1; attempt <= CONFIG.limit; attempt += 1) {
      await enforceAdminRateLimit(event, CONFIG)
    }
    await expect(enforceAdminRateLimit(event, CONFIG)).rejects.toMatchObject({ statusCode: 429 })

    vi.advanceTimersByTime(CONFIG.blockMs + 1)
    await expect(enforceAdminRateLimit(event, CONFIG)).resolves.toBeUndefined()

    expect(readRow(CONFIG.key)).toMatchObject({ count: 1 })
  })
})
