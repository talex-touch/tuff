import type { SqliteD1Database, SqliteD1Statement } from '../../test/helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../../test/helpers/d1-sqlite'

/** Docs page views and engagement reports against real SQLite: what they count, and in how many round trips. */

let store: typeof import('./docAnalyticsStore')
let d1: SqliteD1Database

/** Counts round trips: one per statement run on its own, one per batch. */
function countingD1(inner: SqliteD1Database) {
  let roundTrips = 0
  const wrap = (statement: SqliteD1Statement): SqliteD1Statement => new Proxy(statement, {
    get(target, property, receiver) {
      if (property === 'bind')
        return (...values: unknown[]) => wrap(target.bind(...values))
      if (property === 'first' || property === 'all' || property === 'run') {
        return (...args: unknown[]) => {
          roundTrips += 1
          return (target as any)[property](...args)
        }
      }
      return Reflect.get(target, property, receiver)
    },
  })
  const db = {
    prepare: (sql: string) => wrap(inner.prepare(sql)),
    batch: async (statements: SqliteD1Statement[]) => {
      roundTrips += 1
      return inner.batch(statements)
    },
  }
  return { db: db as any, roundTrips: () => roundTrips }
}

function rows(table: string) {
  return d1.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all().map(row => ({ ...row }))
}

const opening = {
  path: '/docs/intro',
  title: 'Intro',
  sourceType: 'docs_page' as const,
  clientId: 'client-1',
  ip: '203.0.113.7',
  riskLevel: 0,
  sessionTtlMs: 600_000,
  challengeTtlMs: 600_000,
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T08:00:00.000Z'))
  vi.resetModules()
  store = await import('./docAnalyticsStore')
  d1 = createSqliteD1()
  await store.ensureDocAnalyticsSchema(d1 as any)
})

afterEach(() => {
  d1.close()
  vi.useRealTimers()
})

describe('openDocViewSession', () => {
  it('counts the view and opens a session in one round trip', async () => {
    const counting = countingD1(d1)
    const first = await store.openDocViewSession(counting.db, opening)
    const second = await store.openDocViewSession(counting.db, opening)

    expect(counting.roundTrips()).toBe(2)
    expect([first.views, second.views]).toEqual([1, 2])
    expect(first.challenge).toBeNull()
    expect(rows('doc_views_daily')).toEqual([expect.objectContaining({ date: '2026-10-15', path: '/docs/intro', views: 2, session_count: 2 })])
    expect(d1.sqlite.prepare(`SELECT session_id, status, risk_level, challenge_id FROM doc_engagement_sessions WHERE session_id = ?`).get(first.session.sessionId))
      .toEqual({ session_id: first.session.sessionId, status: 'pending', risk_level: 0, challenge_id: null })
  })

  it('issues a linked challenge to a risky client, harder past the second level', async () => {
    const risky = await store.openDocViewSession(d1 as any, { ...opening, riskLevel: 1 })
    const riskier = await store.openDocViewSession(d1 as any, { ...opening, riskLevel: 2 })

    expect(risky.challenge).toMatchObject({ sessionId: risky.session.sessionId, difficulty: 0 })
    expect(riskier.challenge).toMatchObject({ sessionId: riskier.session.sessionId, difficulty: 3 })
    expect(await store.getDocEngagementSession(d1 as any, risky.session.sessionId)).toMatchObject({ challengeId: risky.challenge!.challengeId })
    expect(await store.getDocChallenge(d1 as any, risky.challenge!.challengeId)).toEqual(risky.challenge)
  })
})

describe('expirePendingSessions', () => {
  it('expires only the client\'s overdue pending sessions, each counted once however many requests race', async () => {
    const overdue = await Promise.all([1, 2, 3].map(() => store.openDocViewSession(d1 as any, opening)))
    const other = await store.openDocViewSession(d1 as any, { ...opening, clientId: 'client-2' })
    const reported = await store.openDocViewSession(d1 as any, opening)
    await store.markDocSessionReported(d1 as any, reported.session.sessionId)
    const later = Date.now() + 600_001

    const counts = await Promise.all([
      store.expirePendingSessions(d1 as any, { ip: opening.ip, clientId: 'client-1', now: later }),
      store.expirePendingSessions(d1 as any, { ip: opening.ip, clientId: 'client-1', now: later }),
    ])

    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(3)
    for (const { session } of overdue)
      expect((await store.getDocEngagementSession(d1 as any, session.sessionId))?.status).toBe('expired')
    expect((await store.getDocEngagementSession(d1 as any, other.session.sessionId))?.status).toBe('pending')
    expect((await store.getDocEngagementSession(d1 as any, reported.session.sessionId))?.status).toBe('reported')
  })
})

describe('recordDocEngagement', () => {
  it('adds a report to every counter and closes its session in one round trip', async () => {
    const { session } = await store.openDocViewSession(d1 as any, opening)
    const counting = countingD1(d1)

    await store.recordDocEngagement(counting.db, {
      path: '/docs/intro',
      title: 'Intro',
      sourceType: 'docs_page',
      activeMs: 1000,
      totalMs: 2000,
      sections: [
        { id: 'install', title: 'Install', activeMs: 300, totalMs: 500, buckets: [{ bucket: 2, activeMs: 100, totalMs: 150 }, { bucket: 2, activeMs: 20, totalMs: 30 }] },
        { id: 'install', title: '', activeMs: 50, totalMs: 60 },
      ],
      actions: [
        { type: 'copy', source: 'code', sectionId: 'install', sectionTitle: 'Install', count: 2, textHash: 'abc', textLength: 40, anchorStart: 3, anchorEnd: 9, anchorBucket: 2 },
        { type: 'copy', source: 'code', sectionId: 'install', sectionTitle: '', count: 1, textHash: 'abc', textLength: 30, anchorStart: 1, anchorEnd: 12, anchorBucket: 2 },
      ],
      sessionId: session.sessionId,
    })

    // The batch, then the evidence retention sweep this isolate runs at most once an interval.
    expect(counting.roundTrips()).toBeLessThanOrEqual(3)
    expect(rows('doc_views')).toEqual([expect.objectContaining({ path: '/docs/intro', active_ms: 1000, total_ms: 2000, copy_count: 3, select_count: 0 })])
    expect(rows('doc_section_stats')).toEqual([expect.objectContaining({ id: '/docs/intro#install', section_title: 'Install', view_count: 2, active_ms: 350, total_ms: 560 })])
    expect(rows('doc_section_heatmap')).toEqual([expect.objectContaining({ bucket: 2, active_ms: 120, total_ms: 180 })])
    expect(rows('doc_action_stats')).toEqual([expect.objectContaining({ count: 3, section_title: 'Install' })])
    expect(rows('doc_action_evidence')).toEqual([expect.objectContaining({ count: 3, text_length: 40, anchor_start: 3, anchor_end: 12 })])
    expect((await store.getDocEngagementSession(d1 as any, session.sessionId))?.status).toBe('reported')
  })

  it('writes nothing of a report the database refuses part of', async () => {
    const { session } = await store.openDocViewSession(d1 as any, opening)
    d1.sqlite.exec(`CREATE TRIGGER fail_evidence BEFORE INSERT ON doc_action_evidence BEGIN SELECT RAISE(ABORT, 'evidence is down'); END;`)

    await expect(store.recordDocEngagement(d1 as any, {
      path: '/docs/intro',
      title: 'Intro',
      sourceType: 'docs_page',
      activeMs: 1000,
      totalMs: 2000,
      sections: [{ id: 'install', title: 'Install', activeMs: 300, totalMs: 500 }],
      actions: [{ type: 'copy', source: 'code', sectionId: 'install', sectionTitle: '', count: 1 }],
      sessionId: session.sessionId,
    })).rejects.toThrow(/evidence is down/)

    expect(rows('doc_section_stats')).toEqual([])
    expect(rows('doc_views')).toEqual([expect.objectContaining({ active_ms: 0 })])
    expect((await store.getDocEngagementSession(d1 as any, session.sessionId))?.status).toBe('pending')
  })
})

describe('cleanupDocEngagementRecords', () => {
  it('deletes sessions, nonces and challenges older than a week, and keeps the rest', async () => {
    const now = Date.now()
    const old = await store.openDocViewSession(d1 as any, { ...opening, riskLevel: 1 })
    await store.registerDocNonce(d1 as any, { sessionId: old.session.sessionId, nonceHash: 'old-nonce', ttlMs: 900_000 })
    d1.sqlite.exec(`
      UPDATE doc_engagement_sessions SET issued_at = ${now - 8 * 86_400_000};
      UPDATE doc_engagement_nonces SET created_at = ${now - 8 * 86_400_000};
      UPDATE doc_engagement_challenges SET created_at = ${now - 8 * 86_400_000};
    `)
    const fresh = await store.openDocViewSession(d1 as any, opening)

    expect(await store.cleanupDocEngagementRecords(d1 as any, now)).toEqual({ sessions: 1, nonces: 1, challenges: 1 })
    expect(rows('doc_engagement_sessions').map(row => row.session_id)).toEqual([fresh.session.sessionId])
  })
})
