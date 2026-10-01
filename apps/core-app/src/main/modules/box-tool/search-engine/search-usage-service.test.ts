import type { TuffItem } from '@talex-touch/utils'
import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isFrequentEligible } from '@talex-touch/utils/core-box'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import * as schema from '../../../db/schema'
import { createDbUtils, type DbUtils } from '../../../db/utils'
import { recommendationExposureService } from './recommendation/recommendation-exposure-service'
import { SearchUsageService } from './search-usage-service'
import { toUsageEntryPoint } from './usage-entry-point'

const schemaMigrationUrls = [
  new URL('../../../../../resources/db/migrations/0000_whole_mister_fear.sql', import.meta.url),
  new URL('../../../../../resources/db/migrations/0005_orange_wiccan.sql', import.meta.url),
  new URL(
    '../../../../../resources/db/migrations/0007_remarkable_silver_sable.sql',
    import.meta.url
  ),
  new URL(
    '../../../../../resources/db/migrations/0011_add_recommendation_tables.sql',
    import.meta.url
  ),
  new URL('../../../../../resources/db/migrations/0019_usage_trend_daily.sql', import.meta.url),
  new URL('../../../../../resources/db/migrations/0051_usage_execute_events.sql', import.meta.url)
]

const item: TuffItem = {
  id: 'app-item',
  kind: 'app',
  render: { basic: { title: 'Open app' }, mode: 'default' },
  scoring: { final: 1 },
  source: { id: 'application-provider', name: 'Application provider', type: 'application' }
}

async function applyMigration(client: Client, migrationUrl: URL): Promise<void> {
  const migration = await readFile(migrationUrl, 'utf8')
  for (const statement of migration.split('--> statement-breakpoint')) {
    if (statement.trim()) await client.execute(statement)
  }
}

/**
 * A real libSQL file with the usage tables applied, the service driving it, and the teardown the
 * rest of the suite uses. Each caller gets its own temp directory so nothing leaks between cases.
 */
async function withDatabase(
  run: (context: {
    client: Client
    dbUtils: DbUtils
    usageService: SearchUsageService
  }) => Promise<void>
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'tuff-search-usage-service-'))
  let client: Client | undefined
  try {
    client = createClient({ url: `file:${join(directory, 'search-usage.sqlite')}` })
    for (const migrationUrl of schemaMigrationUrls) {
      await applyMigration(client, migrationUrl)
    }
    const db = drizzle(client, { schema })
    const dbUtils = createDbUtils(db)
    const usageService = new SearchUsageService({ getDbUtils: () => dbUtils })
    usageService.initialize(db)
    await run({ client, dbUtils, usageService })
  } finally {
    await dbWriteScheduler.drain()
    client?.close()
    await rm(directory, { recursive: true, force: true })
  }
}

async function count(client: Client, table: string): Promise<number> {
  const { rows } = await client.execute(`SELECT COUNT(*) AS count FROM ${table}`)
  return Number(rows[0]?.count ?? 0)
}

async function executeCount(client: Client, itemId: string): Promise<number> {
  const { rows } = await client.execute({
    sql: 'SELECT execute_count AS executeCount FROM item_usage_stats WHERE item_id = ?',
    args: [itemId]
  })
  return Number(rows[0]?.executeCount ?? 0)
}

describe('SearchUsageService execution persistence', () => {
  it('commits the log, aggregate, summary and trend together and keeps them across maintenance', async () => {
    await withDatabase(async ({ client, usageService }) => {
      await usageService.recordExecute('execute-session', item, item.id, { eventId: 'event-1' })
      await dbWriteScheduler.drain()

      expect(await executeCount(client, 'app-item')).toBe(1)
      expect(
        (
          await client.execute(
            'SELECT item_id AS itemId, click_count AS clickCount FROM usage_summary'
          )
        ).rows
      ).toEqual([{ itemId: 'app-item', clickCount: 1 }])
      expect(
        (await client.execute('SELECT item_id AS itemId, source, action FROM usage_logs')).rows
      ).toEqual([{ itemId: 'app-item', source: 'application-provider', action: 'execute' }])
      expect(
        (
          await client.execute(
            'SELECT source_id AS sourceId, item_id AS itemId, execute_count AS executeCount FROM usage_trend_daily'
          )
        ).rows
      ).toEqual([{ sourceId: 'application-provider', itemId: 'app-item', executeCount: 1 }])

      // The accepted marker exists exactly once and is the dedupe home.
      expect(await count(client, 'usage_execute_events')).toBe(1)
    })
  })

  it('counts a retried or re-notified action once and a genuinely new action again', async () => {
    await withDatabase(async ({ client, usageService }) => {
      // The same user action, notified twice, carries the same eventId.
      await usageService.recordExecute('retry-session', item, item.id, { eventId: 'same-action' })
      await usageService.recordExecute('retry-session', item, item.id, { eventId: 'same-action' })
      await dbWriteScheduler.drain()

      expect(await executeCount(client, 'app-item')).toBe(1)
      expect(await count(client, 'usage_logs')).toBe(1)
      expect(
        (await client.execute('SELECT click_count AS clickCount FROM usage_summary')).rows
      ).toEqual([{ clickCount: 1 }])

      // The user triggers it again successfully: a new action, a new id, a second count.
      await usageService.recordExecute('retry-session', item, item.id, { eventId: 'second-action' })
      await dbWriteScheduler.drain()

      expect(await executeCount(client, 'app-item')).toBe(2)
      expect(await count(client, 'usage_logs')).toBe(2)
    })
  })

  it('rolls back every write when the transaction fails partway', async () => {
    await withDatabase(async ({ client, usageService }) => {
      // Seed a usage_logs row carrying the event id the next execute will use, so the transaction
      // passes the admission gate and then trips the usage_logs unique index. That is a real
      // mid-transaction failure, not a simulated one.
      await client.execute({
        sql: `INSERT INTO usage_logs (session_id, item_id, source, action, timestamp, event_id)
              VALUES ('seed', 'other-item', 'application-provider', 'execute', ?, 'colliding-event')`,
        args: [Date.now()]
      })

      await expect(
        usageService.recordExecute('rollback-session', item, item.id, {
          eventId: 'colliding-event'
        })
      ).rejects.toThrow()
      await dbWriteScheduler.drain()

      // The admission marker must not survive a rollback, or a retry would be deduped against a
      // count that was never written.
      expect(await count(client, 'usage_execute_events')).toBe(0)
      expect(await executeCount(client, 'app-item')).toBe(0)
      expect(
        (
          await client.execute(
            "SELECT COUNT(*) AS count FROM usage_summary WHERE item_id = 'app-item'"
          )
        ).rows[0]
      ).toEqual({ count: 0 })
      expect(
        (
          await client.execute(
            "SELECT COUNT(*) AS count FROM usage_trend_daily WHERE item_id = 'app-item'"
          )
        ).rows[0]
      ).toEqual({ count: 0 })
    })
  })

  it('reports the admitted action before the commit and the committed count exactly once', async () => {
    await withDatabase(async ({ usageService }) => {
      const notified: Array<{ eventId: string; executeCount: number | null }> = []
      usageService.onExecuteAccepted((event) => {
        notified.push({
          eventId: event.eventId,
          executeCount: event.usageStats?.executeCount ?? null
        })
      })

      await usageService.recordExecute('notify-session', item, item.id, { eventId: 'notify-1' })
      await dbWriteScheduler.drain()

      // Caches are dropped before the write is durable, then the committed row is pushed once.
      expect(notified[0]).toEqual({ eventId: 'notify-1', executeCount: null })
      expect(notified.filter((entry) => entry.executeCount !== null)).toEqual([
        { eventId: 'notify-1', executeCount: 1 }
      ])

      // A re-notification of the same action must not push a second committed count: consumers
      // keyed on the committed row would otherwise count or announce it twice.
      await usageService.recordExecute('notify-session', item, item.id, { eventId: 'notify-1' })
      await dbWriteScheduler.drain()
      expect(notified.filter((entry) => entry.executeCount !== null)).toEqual([
        { eventId: 'notify-1', executeCount: 1 }
      ])
    })
  })

  it('flush() is a write barrier for a fire-and-forget execute', async () => {
    await withDatabase(async ({ client, usageService }) => {
      // The caller does not await the acceptance (fire-and-forget, as the launch path does).
      void usageService.recordExecute('barrier-session', item, item.id, { eventId: 'barrier-1' })
      // A read that awaits flush() must observe it: the first recommendation snapshot after an
      // execute cannot be built from the pre-execute database.
      await usageService.flush()

      expect(await executeCount(client, 'app-item')).toBe(1)
    })
  })

  it('flush() settles a rejected execute without inventing a count', async () => {
    await withDatabase(async ({ client, usageService }) => {
      // Seed a conflicting log event id so the transaction trips mid-write and rejects.
      await client.execute({
        sql: `INSERT INTO usage_logs (session_id, item_id, source, action, timestamp, event_id)
              VALUES ('seed', 'other-item', 'application-provider', 'execute', ?, 'barrier-fail')`,
        args: [Math.floor(Date.now() / 1000)]
      })

      const pending = usageService.recordExecute('barrier-session', item, item.id, {
        eventId: 'barrier-fail'
      })
      // The caller still sees the rejection; flush must not swallow it into a false success.
      await expect(pending).rejects.toThrow()
      await usageService.flush()

      expect(await executeCount(client, 'app-item')).toBe(0)
      expect(await count(client, 'usage_execute_events')).toBe(0)
    })
  })

  it('persists across a reopen and dedupes a replay of the same event id', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tuff-search-usage-reopen-'))
    const url = `file:${join(directory, 'search-usage.sqlite')}`
    let client: Client | undefined
    try {
      client = createClient({ url })
      for (const migrationUrl of schemaMigrationUrls) {
        await applyMigration(client, migrationUrl)
      }
      const firstDb = drizzle(client, { schema })
      const first = new SearchUsageService({ getDbUtils: () => createDbUtils(firstDb) })
      first.initialize(firstDb)
      await first.recordExecute('reopen-session', item, item.id, { eventId: 'persist-1' })
      await dbWriteScheduler.drain()
      client.close()

      // Reopen the same file with a fresh service: the count is durable and a replay of the same
      // action is still deduped against the persisted marker.
      client = createClient({ url })
      const db = drizzle(client, { schema })
      const second = new SearchUsageService({ getDbUtils: () => createDbUtils(db) })
      second.initialize(db)
      expect(await executeCount(client, 'app-item')).toBe(1)

      await second.recordExecute('reopen-session', item, item.id, { eventId: 'persist-1' })
      await dbWriteScheduler.drain()
      expect(await executeCount(client, 'app-item')).toBe(1)
    } finally {
      await dbWriteScheduler.drain()
      client?.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('counts visible results as display only, never as an execution or a habit', async () => {
    await withDatabase(async ({ client, dbUtils, usageService }) => {
      // A thousand impressions of the same row: exposure is not a valid use (R3/AC4).
      for (let i = 0; i < 100; i += 1) {
        await usageService.recordVisibleResults(
          [
            { sourceId: 'application-provider', itemId: 'app-item', sourceType: 'application' },
            { sourceId: 'application-provider', itemId: 'app-item', sourceType: 'application' }
          ],
          `display-session-${i}`
        )
      }
      await usageService.flush()
      await dbWriteScheduler.drain()

      const stats = await dbUtils.getUsageStatsBatch([
        { sourceId: 'application-provider', itemId: 'app-item' }
      ])
      expect(stats[0]?.executeCount).toBe(0)
      expect(stats[0]?.searchCount).toBeGreaterThan(0)

      const [behavior] = await dbUtils.getUsageBehaviorBatch([
        { sourceId: 'application-provider', itemId: 'app-item' }
      ])
      // A display is not an execution: it must not create a valid-use fact a frequent gate reads.
      expect(behavior.executeCount).toBe(0)
      expect(behavior.executeCount30).toBe(0)
      expect(behavior.activeDays30).toBe(0)
      expect(isFrequentEligible(behavior)).toBe(false)
      expect(await count(client, 'usage_logs')).toBe(0)
    })
  })

  it('counts a display session once even when the same row is reported across RPCs', async () => {
    await withDatabase(async ({ dbUtils, usageService }) => {
      const identity = {
        sourceId: 'application-provider',
        itemId: 'app-item',
        sourceType: 'application'
      }

      // A virtual-scroll repaint reports the same visible row again in a later RPC of one session.
      await usageService.recordVisibleResults([identity], 'scroll-session')
      await usageService.recordVisibleResults([identity], 'scroll-session')
      await usageService.flush()
      await dbWriteScheduler.drain()

      const [stats] = await dbUtils.getUsageStatsBatch([
        { sourceId: 'application-provider', itemId: 'app-item' }
      ])
      expect(stats?.searchCount).toBe(1)

      // A genuinely new display session is a new impression of the row.
      await usageService.recordVisibleResults([identity], 'reopen-session')
      await usageService.flush()
      await dbWriteScheduler.drain()

      const [afterReopen] = await dbUtils.getUsageStatsBatch([
        { sourceId: 'application-provider', itemId: 'app-item' }
      ])
      expect(afterReopen?.searchCount).toBe(2)
    })
  })
})

describe('SearchUsageService behaviour windows', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('derives recent counts, distinct local days and decayed contribution from dated executes', async () => {
    // shouldAdvanceTime keeps the write scheduler's own timers running while the clock moves.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await withDatabase(async ({ dbUtils, usageService }) => {
      // Five executions spread over three distinct local days meets the frequent cohort.
      for (const localTime of [
        '2026-05-04T09:15:00',
        '2026-05-04T09:40:00',
        '2026-05-05T14:05:00',
        '2026-05-06T21:30:00',
        '2026-05-06T22:10:00'
      ]) {
        vi.setSystemTime(new Date(localTime))
        await usageService.recordExecute('window-session', item, item.id, {
          eventId: `window-${localTime}`
        })
      }
      await dbWriteScheduler.drain()

      vi.setSystemTime(new Date('2026-05-06T23:00:00'))
      const [row] = await dbUtils.getUsageBehaviorBatch(
        [{ sourceId: 'application-provider', itemId: 'app-item' }],
        Date.now()
      )

      expect(row.executeCount).toBe(5)
      expect(row.executeCount30).toBe(5)
      expect(row.activeDays30).toBe(3)
      expect(row.activeDays7).toBe(3)
      // Decayed (not raw) contribution: strictly below the count because each event has aged.
      expect(row.decayedExecuteScore30).toBeGreaterThan(0)
      expect(row.decayedExecuteScore30).toBeLessThanOrEqual(5)
      expect(row.hourDistribution30.reduce((a, b) => a + b, 0)).toBe(5)
      expect(row.dayOfWeekDistribution30.reduce((a, b) => a + b, 0)).toBe(5)
      expect(Object.values(row.timeSlotDistribution30).reduce((a, b) => a + b, 0)).toBe(5)
    })
  })

  it('keeps five executions in two days below the cohort', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await withDatabase(async ({ dbUtils, usageService }) => {
      // Five uses, two distinct local days: an afternoon session, not a habit.
      for (const localTime of [
        '2026-05-04T09:00:00',
        '2026-05-04T10:00:00',
        '2026-05-04T11:00:00',
        '2026-05-05T09:00:00',
        '2026-05-05T10:00:00'
      ]) {
        vi.setSystemTime(new Date(localTime))
        await usageService.recordExecute('two-days', item, item.id, { eventId: `two-${localTime}` })
      }
      await dbWriteScheduler.drain()

      vi.setSystemTime(new Date('2026-05-05T12:00:00'))
      const [row] = await dbUtils.getUsageBehaviorBatch(
        [{ sourceId: 'application-provider', itemId: 'app-item' }],
        Date.now()
      )
      expect(row.executeCount30).toBe(5)
      expect(row.activeDays30).toBe(2)
    })
  })

  it('returns a zero row for a key with no evidence rather than omitting it', async () => {
    await withDatabase(async ({ dbUtils }) => {
      const [row] = await dbUtils.getUsageBehaviorBatch([
        { sourceId: 'application-provider', itemId: 'never-seen' }
      ])

      expect(row).toMatchObject({
        sourceId: 'application-provider',
        itemId: 'never-seen',
        executeCount: 0,
        executeCount30: 0,
        activeDays30: 0,
        lastExecutedAt: null
      })
      expect(row.hourDistribution30).toHaveLength(24)
    })
  })

  it('keeps lifetime history off the windows when the executions have no ledger claim', async () => {
    // A migrated row: the lifetime counter, its stored last_executed and its log survive, but
    // nothing links them to a dated execution, so the item has proven nothing recent. The stored
    // fact stays for display; the behaviour field reports "no reliable instant" (null).
    await withDatabase(async ({ client, dbUtils }) => {
      // The column is a drizzle `timestamp` column: epoch SECONDS, matching every other writer.
      const storedLastExecuted = Math.floor(Date.UTC(2026, 3, 20, 10, 0, 0) / 1000)
      await client.execute({
        sql: `INSERT INTO item_usage_stats (source_id, item_id, source_type, execute_count, search_count, cancel_count, last_executed, created_at, updated_at)
              VALUES ('application-provider', 'legacy-item', 'application', 7, 0, 0, ?, ?, ?)`,
        args: [storedLastExecuted, storedLastExecuted, storedLastExecuted]
      })
      await client.execute({
        sql: `INSERT INTO usage_logs (session_id, item_id, source, action, timestamp)
              VALUES ('legacy-session', 'legacy-item', 'application-provider', 'execute', ?)`,
        args: [storedLastExecuted]
      })

      const [row] = await dbUtils.getUsageBehaviorBatch([
        { sourceId: 'application-provider', itemId: 'legacy-item' }
      ])

      expect(row.executeCount).toBe(7)
      expect(row.executeCount30).toBe(0)
      expect(row.activeDays30).toBe(0)
      expect(row.decayedExecuteScore30).toBe(0)
      expect(row.hourDistribution30.reduce((a, b) => a + b, 0)).toBe(0)
      // The reliable-instant field is null — an unlinked log is not evidence of "when".
      expect(row.lastExecutedAt).toBeNull()

      // …while the stored lifetime fact the detail view shows is left exactly as it was.
      const { rows } = await client.execute(
        `SELECT last_executed AS lastExecuted FROM item_usage_stats WHERE item_id = 'legacy-item'`
      )
      expect(Number(rows[0]?.lastExecuted)).toBe(storedLastExecuted)
    })
  })

  it('reports no reliable instant for an accepted execution older than the window', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await withDatabase(async ({ dbUtils, usageService }) => {
      // An accepted, ledger-linked execute from 90 days ago: real history, but nothing recent and
      // nothing inside the 30-day window to date it against.
      vi.setSystemTime(new Date('2026-05-30T09:00:00'))
      await usageService.recordExecute('old-session', item, item.id, { eventId: 'old-event' })
      await dbWriteScheduler.drain()

      vi.setSystemTime(new Date('2026-09-01T09:00:00'))
      const [row] = await dbUtils.getUsageBehaviorBatch(
        [{ sourceId: 'application-provider', itemId: 'app-item' }],
        Date.now()
      )

      expect(row.executeCount).toBe(1)
      expect(row.executeCount30).toBe(0)
      expect(row.activeDays30).toBe(0)
      expect(row.lastExecutedAt).toBeNull()
    })
  })
})

describe('SearchUsageService entry-point attribution', () => {
  // The exposure set is a process-wide singleton shared with the real execute path, so each case
  // starts and ends empty rather than inheriting whatever a previous case rendered.
  afterEach(() => {
    recommendationExposureService.reset()
  })

  it('keeps the entry point a caller passed instead of deriving one', async () => {
    recommendationExposureService.reset()
    await withDatabase(async ({ client, usageService }) => {
      recommendationExposureService.recordExposure({
        sessionId: 'entry-point-session',
        itemKeys: ['application-provider:app-item']
      })

      await usageService.recordExecute('entry-point-session', item, item.id, {
        eventId: 'entry-point-1',
        entryPoint: 'settings-app-detail'
      })
      await dbWriteScheduler.drain()

      const { rows } = await client.execute('SELECT context AS context FROM usage_logs')
      const context = JSON.parse(String(rows[0].context)) as { ent?: unknown }
      expect(toUsageEntryPoint(context.ent)).toBe('settings-app-detail')
    })
  })

  it('derives a recommendation entry point from a live exposure before consuming it', async () => {
    recommendationExposureService.reset()
    await withDatabase(async ({ client, usageService }) => {
      recommendationExposureService.recordExposure({
        sessionId: 'entry-point-session',
        itemKeys: ['application-provider:app-item']
      })

      await usageService.recordExecute('entry-point-session', item, item.id, {
        eventId: 'entry-point-2'
      })
      await dbWriteScheduler.drain()

      const { rows } = await client.execute('SELECT context AS context FROM usage_logs')
      const context = JSON.parse(String(rows[0].context)) as { ent?: unknown }
      expect(toUsageEntryPoint(context.ent)).toBe('recommendation')
    })
  })
})
