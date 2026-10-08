/**
 * A real usage-limit refusal for channel tests (A12): a migrated libSQL file, the real quota
 * manager holding a daily request limit of 1, and today's global usage already at 1 — so the real
 * SDK's usage gate refuses the next call before any provider is picked. Nothing in the call path
 * is mocked between the channel and the gate; the test only stands in for what is not under test
 * (native audio, Electron, the plugin host).
 *
 * The test file mocks `databaseModule.getDb` to `fixture.db` itself — `vi.mock` is hoisted per
 * file, so it cannot live here:
 *
 *   vi.mock('<relative>/modules/database', () => ({ databaseModule: { getDb: () => fixture?.db } }))
 */
import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from '../../../db/schema'
import { intelligenceUsageStats } from '../../../db/schema'
import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import { intelligenceAuditLogger } from '../intelligence-audit-logger'
import { GLOBAL_USAGE_CALLER_ID, GLOBAL_USAGE_CALLER_TYPE } from './constants'
import { dayPeriod, localDayKey, nextLocalDayStartMs } from './local-period'
import { setUsageLimits } from './usage-limits'

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../resources/db/migrations'
)

export interface UsageLimitRefusalFixture {
  client: Client
  db: LibSQLDatabase<typeof schema>
  tempDir: string
}

/** A fresh migrated database; the audit logger's own timers are stopped (tests flush explicitly). */
export async function openUsageLimitRefusalDatabase(): Promise<UsageLimitRefusalFixture> {
  const tempDir = await mkdtemp(join(tmpdir(), 'tuff-usage-limit-refusal-'))
  const client = createClient({ url: `file:${join(tempDir, 'refusal.sqlite')}` })
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  await intelligenceAuditLogger.destroy()
  return { client, db, tempDir }
}

/**
 * Sets a daily request limit of 1 through the real control plane and records one request for
 * today, so every metered call from here is refused. Resolves to the limit's reset instant (the
 * next local midnight), which the refusal names.
 */
export async function reachDailyRequestLimit(
  fixture: UsageLimitRefusalFixture,
  now: number = Date.now()
): Promise<number> {
  await setUsageLimits({ requestsPerDay: 1 })
  await fixture.db
    .insert(intelligenceUsageStats)
    .values({
      callerId: GLOBAL_USAGE_CALLER_ID,
      callerType: GLOBAL_USAGE_CALLER_TYPE,
      period: dayPeriod(localDayKey(now)),
      periodType: 'day',
      requestCount: 1,
      successCount: 1
    })
    .onConflictDoUpdate({
      target: [
        intelligenceUsageStats.callerId,
        intelligenceUsageStats.callerType,
        intelligenceUsageStats.period
      ],
      set: { requestCount: 1, successCount: 1 }
    })
  return nextLocalDayStartMs(now)
}

/** Clears the limit and removes the database file. */
export async function closeUsageLimitRefusalDatabase(
  fixture: UsageLimitRefusalFixture | undefined
): Promise<void> {
  if (!fixture) return
  await setUsageLimits({})
  await intelligenceAuditLogger.flushToDB()
  await dbWriteScheduler.drain()
  fixture.client.close()
  await rm(fixture.tempDir, { recursive: true, force: true })
}
