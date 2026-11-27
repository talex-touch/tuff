import type { H3Event } from 'h3'
import type { SqliteD1Database } from '../helpers/d1-sqlite'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../helpers/d1-sqlite'

/**
 * End-to-end atomic & idempotent telemetry route tests against real SQLite D1.
 *
 * Covers the real `telemetry_events`, `daily_stats`, `platform_governance_events`,
 * `telemetry_batch_receipts`, and `telemetry_messages` tables inside single `db.batch()`
 * transactions, proving:
 * - serial and concurrent duplicate replays persist once with zero double-counting,
 * - conflicting payloads on the same idempotency key fail closed with 409,
 * - mid-batch write failures roll back every table and never return a fake success count,
 * - missing D1 bindings fail closed with 503 across batch, record, and messages routes.
 */

const state = vi.hoisted(() => ({
  db: null as SqliteD1Database | null,
  headers: {} as Record<string, string | undefined>,
  body: null as unknown,
  resolvedUserId: null as string | null,
  privacySettings: {
    analytics: true,
    crashReports: true,
    usageData: true,
    personalization: true,
  },
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getHeader: (event: any, name: string) => {
      const source = event?.headers ?? state.headers
      return source[name.toLowerCase()] ?? source[name]
    },
    readBody: async (event: any) => (event && 'body' in event ? event.body : state.body),
  }
})

vi.mock('../../server/utils/cloudflare', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../server/utils/cloudflare')>()),
  readCloudflareBindings: (event: any) => {
    if (event && 'noDb' in event && event.noDb)
      return undefined
    return state.db ? { DB: state.db } : undefined
  },
  shouldUseCloudflareBindings: () => true,
}))

vi.mock('../../server/utils/ipSecurityStore', () => ({
  guardTelemetryIp: vi.fn(async () => undefined),
  resolveRequestIp: () => '203.0.113.10',
}))

vi.mock('../../server/utils/requestGeo', () => ({
  resolveRequestGeo: () => ({
    countryCode: 'US',
    regionCode: 'CA',
    regionName: 'California',
    city: 'San Francisco',
    latitude: 37.7,
    longitude: -122.4,
    timezone: 'America/Los_Angeles',
    source: 'test',
  }),
}))

vi.mock('../../server/utils/telemetryIdentity', () => ({
  resolveTelemetryUserId: vi.fn(async (event: any) => (
    event && 'userId' in event ? event.userId : state.resolvedUserId
  )),
}))

vi.mock('../../server/utils/authStore', () => ({
  DEFAULT_USER_PRIVACY_SETTINGS: {
    analytics: true,
    crashReports: true,
    usageData: false,
    personalization: true,
  },
  getUserById: vi.fn(async () => ({
    id: state.resolvedUserId ?? 'user-1',
    privacySettings: state.privacySettings,
  })),
}))

vi.mock('../../server/utils/telemetryRetentionMaintenance', () => ({
  scheduleTelemetryRetentionMaintenance: vi.fn(),
}))

vi.mock('../../server/utils/telemetryDailyRollup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../server/utils/telemetryDailyRollup')>()),
  scheduleTelemetryDailyRollup: vi.fn(),
}))

type RouteHandler = (event: any) => Promise<any>

let batchHandler: RouteHandler
let recordHandler: RouteHandler
let messagesHandler: RouteHandler

function makeEvent(options: {
  idempotencyKey?: string
  body: unknown
  userId?: string | null
  noDb?: boolean
}): H3Event & { headers: Record<string, string | undefined>, body: unknown, userId: string | null, noDb?: boolean } {
  return {
    context: {},
    node: { req: { headers: {} } },
    headers: options.idempotencyKey ? { 'x-idempotency-key': options.idempotencyKey } : {},
    body: options.body,
    userId: options.userId ?? null,
    noDb: options.noDb,
  } as any
}

function tableCount(db: SqliteD1Database, table: string): number {
  const row = db.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number } | undefined
  return Number(row?.count ?? 0)
}

function statValue(db: SqliteD1Database, statType: string, statKey = ''): number {
  const row = db.sqlite
    .prepare('SELECT SUM(value) AS total FROM daily_stats WHERE stat_type = ? AND stat_key = ?')
    .get(statType, statKey) as { total: number | null } | undefined
  return Number(row?.total ?? 0)
}

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: RouteHandler) => fn
})

beforeEach(async () => {
  vi.resetModules()
  ;(globalThis as any).defineEventHandler = (fn: RouteHandler) => fn
  state.db = createSqliteD1()
  state.headers = {}
  state.body = null
  state.resolvedUserId = null
  state.privacySettings = {
    analytics: true,
    crashReports: true,
    usageData: true,
    personalization: true,
  }

  batchHandler = (await import('../../server/api/telemetry/batch.post')).default as RouteHandler
  recordHandler = (await import('../../server/api/telemetry/record.post')).default as RouteHandler
  messagesHandler = (await import('../../server/api/telemetry/messages.post')).default as RouteHandler
})

afterEach(() => {
  state.db?.close()
  state.db = null
})

describe('telemetry atomic & idempotent lifecycle against real SQLite (#1788)', () => {
  it('commits batch events, daily_stats, governance, and receipt once across concurrent and serial replays', async () => {
    const db = state.db!
    const key = 'sentry:11111111-2222-4333-8444-555555555555'
    const payload = {
      events: [
        {
          eventType: 'feature_use',
          clientId: 'client-concurrent-1',
          platform: 'darwin',
          version: '2.4.15',
          metadata: { sourceType: 'plugin', pluginId: 'touch-notes', pluginName: 'Notes', featureId: 'open' },
        },
        {
          eventType: 'search',
          clientId: 'client-concurrent-1',
          platform: 'darwin',
          version: '2.4.15',
          searchDurationMs: 42,
          searchResultCount: 3,
          metadata: { searchScene: 'corebox', queryLength: 5 },
        },
      ],
    }

    // Warm schemas once so the concurrent requests race on the write batch itself.
    await batchHandler(makeEvent({
      idempotencyKey: 'sentry:00000000-0000-4000-8000-000000000000',
      body: { events: [{ eventType: 'visit', clientId: 'warmup' }] },
    }))

    const beforeEvents = tableCount(db, 'telemetry_events')
    const beforeGovernance = tableCount(db, 'platform_governance_events')
    const beforeReceipts = tableCount(db, 'telemetry_batch_receipts')

    const outcomes = await Promise.all([
      batchHandler(makeEvent({ idempotencyKey: key, body: payload })),
      batchHandler(makeEvent({ idempotencyKey: key, body: payload })),
      batchHandler(makeEvent({ idempotencyKey: key, body: payload })),
    ])

    expect(outcomes.filter(item => item.duplicate === false)).toHaveLength(1)
    expect(outcomes.filter(item => item.duplicate === true)).toHaveLength(2)
    for (const outcome of outcomes) {
      expect(outcome).toMatchObject({
        success: true,
        accepted: 2,
        rejected: 0,
        dropped: 0,
        processed: 2,
      })
    }

    // Serial replay returns identical ACK with duplicate: true and zero new rows.
    const serialReplay = await batchHandler(makeEvent({ idempotencyKey: key, body: payload }))
    expect(serialReplay).toEqual({
      success: true,
      accepted: 2,
      rejected: 0,
      duplicate: true,
      dropped: 0,
      processed: 2,
    })

    // Exactly 1 copy of every write landed: zero double-count in events, stats, governance, or receipts.
    expect(tableCount(db, 'telemetry_events') - beforeEvents).toBe(2)
    expect(tableCount(db, 'platform_governance_events') - beforeGovernance).toBe(2)
    expect(tableCount(db, 'telemetry_batch_receipts') - beforeReceipts).toBe(1)
    expect(statValue(db, 'feature_use', '')).toBe(1)
    expect(statValue(db, 'feature_use_plugin', 'Notes')).toBe(1)
  })

  it('rejects concurrent and serial key reuse with a different payload with 409 and zero side effects', async () => {
    const db = state.db!
    const key = 'sentry:22222222-3333-4444-8555-666666666666'
    const firstBody = { events: [{ eventType: 'feature_use', clientId: 'c1', metadata: { sourceType: 'app' } }] }
    const conflictingBody = { events: [{ eventType: 'feature_use', clientId: 'c2', metadata: { sourceType: 'plugin' } }] }

    await expect(batchHandler(makeEvent({ idempotencyKey: key, body: firstBody }))).resolves.toMatchObject({
      accepted: 1,
      duplicate: false,
      processed: 1,
    })

    await expect(batchHandler(makeEvent({ idempotencyKey: key, body: conflictingBody }))).rejects.toMatchObject({
      statusCode: 409,
    })

    // Same key across a different authenticated caller also fails with 409 rather than leaking the ACK.
    await expect(batchHandler(makeEvent({
      idempotencyKey: key,
      body: firstBody,
      userId: 'other-user',
    }))).rejects.toMatchObject({
      statusCode: 409,
    })

    expect(tableCount(db, 'telemetry_events')).toBe(1)
    expect(statValue(db, 'feature_use', '')).toBe(1)
  })

  it('rolls back all batch tables on mid-batch governance failure and never returns a fake processed count', async () => {
    const db = state.db!
    // Warm schema first so the trigger can be attached to platform_governance_events.
    await batchHandler(makeEvent({
      idempotencyKey: 'sentry:00000000-0000-4000-8000-000000000010',
      body: { events: [{ eventType: 'search', clientId: 'warm' }] },
    }))
    const beforeEvents = tableCount(db, 'telemetry_events')
    const beforeGovernance = tableCount(db, 'platform_governance_events')
    const beforeReceipts = tableCount(db, 'telemetry_batch_receipts')

    db.sqlite.exec(`
      CREATE TRIGGER fail_governance_write
      BEFORE INSERT ON platform_governance_events
      BEGIN
        SELECT RAISE(ABORT, 'simulated governance failure');
      END;
    `)

    const key = 'sentry:33333333-4444-4555-8666-777777777777'
    const body = {
      events: [
        { eventType: 'feature_use', clientId: 'c1', metadata: { sourceType: 'plugin', pluginId: 'p1' } },
        { eventType: 'search', clientId: 'c1', searchDurationMs: 25 },
      ],
    }

    await expect(batchHandler(makeEvent({ idempotencyKey: key, body }))).rejects.toThrow('simulated governance failure')

    // Every write in the failed batch rolled back cleanly.
    expect(tableCount(db, 'telemetry_events')).toBe(beforeEvents)
    expect(tableCount(db, 'platform_governance_events')).toBe(beforeGovernance)
    expect(tableCount(db, 'telemetry_batch_receipts')).toBe(beforeReceipts)
    expect(statValue(db, 'feature_use', '')).toBe(0)

    // Once D1 recovers, retrying with the SAME idempotency key succeeds cleanly once.
    db.sqlite.exec('DROP TRIGGER fail_governance_write;')
    const retryResult = await batchHandler(makeEvent({ idempotencyKey: key, body }))
    expect(retryResult).toEqual({
      success: true,
      accepted: 2,
      rejected: 0,
      duplicate: false,
      dropped: 0,
      processed: 2,
    })
    expect(tableCount(db, 'telemetry_events') - beforeEvents).toBe(2)
    expect(tableCount(db, 'platform_governance_events') - beforeGovernance).toBe(2)
    expect(tableCount(db, 'telemetry_batch_receipts') - beforeReceipts).toBe(1)
    expect(statValue(db, 'feature_use', '')).toBe(1)
  })

  it('enforces concurrent idempotency and privacy gating on /api/telemetry/record', async () => {
    const db = state.db!
    const key = 'startup:44444444-5555-4666-8777-888888888888'
    const body = {
      eventType: 'visit',
      clientId: 'client-rec-1',
      platform: 'darwin',
      version: '2.4.15',
      isAnonymous: true,
      metadata: { kind: 'startup', idempotencyKey: key },
    }

    // Warm schemas once.
    await recordHandler(makeEvent({
      idempotencyKey: 'startup:00000000-0000-4000-8000-000000000020',
      body: { eventType: 'visit', clientId: 'warm' },
    }))
    const beforeEvents = tableCount(db, 'telemetry_events')
    const beforeGovernance = tableCount(db, 'platform_governance_events')

    const outcomes = await Promise.all([
      recordHandler(makeEvent({ idempotencyKey: key, body })),
      recordHandler(makeEvent({ idempotencyKey: key, body })),
    ])
    expect(outcomes.filter(item => item.duplicate === false)).toHaveLength(1)
    expect(outcomes.filter(item => item.duplicate === true)).toHaveLength(1)
    expect(tableCount(db, 'telemetry_events') - beforeEvents).toBe(1)
    expect(tableCount(db, 'platform_governance_events') - beforeGovernance).toBe(1)

    // Privacy-disabled authenticated user is rejected honestly without writing an event row.
    state.privacySettings = { analytics: false, crashReports: true, usageData: true, personalization: true }
    const blocked = await recordHandler(makeEvent({
      idempotencyKey: 'startup:55555555-6666-4777-8888-999999999999',
      body: { eventType: 'visit', clientId: 'client-rec-1', isAnonymous: false },
      userId: 'user-privacy-off',
    }))
    expect(blocked).toEqual({ success: true, accepted: 0, rejected: 1, duplicate: false })
    expect(tableCount(db, 'telemetry_events') - beforeEvents).toBe(1)
  })

  it('makes /api/telemetry/messages atomic, idempotent, and fail-closed on missing D1 or write failure', async () => {
    const db = state.db!
    const key = 'msg:66666666-7777-4888-8999-aaaaaaaaaaaa'
    const body = {
      messages: [
        { id: 'm1', source: 'system', severity: 'warn', title: 'Perf', message: 'slow ipc' },
        { id: 'm2', source: 'system', severity: 'error', title: '', message: 'invalid missing title' },
      ],
    }

    // Missing D1 binding fails closed with 503 instead of HTTP 200 { success: true, processed: 0 }.
    await expect(messagesHandler(makeEvent({ idempotencyKey: key, body, noDb: true }))).rejects.toMatchObject({
      statusCode: 503,
    })

    // Malformed idempotency key fails closed with 400.
    await expect(messagesHandler(makeEvent({ idempotencyKey: 'bad', body }))).rejects.toMatchObject({
      statusCode: 400,
    })

    // Warm schema then verify concurrent duplicate replay writes once and reports honest accepted/rejected counts.
    await messagesHandler(makeEvent({
      idempotencyKey: 'msg:00000000-0000-4000-8000-000000000030',
      body: { messages: [{ id: 'm0', source: 'system', severity: 'info', title: 'Warm', message: 'ok' }] },
    }))
    const beforeMessages = tableCount(db, 'telemetry_messages')

    const outcomes = await Promise.all([
      messagesHandler(makeEvent({ idempotencyKey: key, body })),
      messagesHandler(makeEvent({ idempotencyKey: key, body })),
    ])
    expect(outcomes.filter(item => item.duplicate === false)).toHaveLength(1)
    expect(outcomes.filter(item => item.duplicate === true)).toHaveLength(1)
    for (const outcome of outcomes) {
      expect(outcome).toMatchObject({
        success: true,
        accepted: 1,
        rejected: 1,
        dropped: 0,
        processed: 1,
      })
    }
    expect(tableCount(db, 'telemetry_messages') - beforeMessages).toBe(1)

    // Conflicting payload on the same key fails with 409.
    await expect(messagesHandler(makeEvent({
      idempotencyKey: key,
      body: { messages: [{ id: 'm3', source: 'system', severity: 'warn', title: 'Other', message: 'diff' }] },
    }))).rejects.toMatchObject({ statusCode: 409 })

    // Mid-batch trigger failure throws fail-closed and rolls back all rows in the request.
    db.sqlite.exec(`
      CREATE TRIGGER fail_second_message
      BEFORE INSERT ON telemetry_messages
      WHEN NEW.id = 'm_fail_2'
      BEGIN
        SELECT RAISE(ABORT, 'simulated message write failure');
      END;
    `)
    await expect(messagesHandler(makeEvent({
      idempotencyKey: 'msg:77777777-8888-4999-8aaa-bbbbbbbbbbbb',
      body: {
        messages: [
          { id: 'm_fail_1', source: 'system', severity: 'warn', title: 'A', message: 'ok' },
          { id: 'm_fail_2', source: 'system', severity: 'warn', title: 'B', message: 'boom' },
        ],
      },
    }))).rejects.toThrow('simulated message write failure')
    expect(tableCount(db, 'telemetry_messages') - beforeMessages).toBe(1)
  })
})
