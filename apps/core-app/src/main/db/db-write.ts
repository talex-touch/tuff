import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from './schema'
import type { DbWriteLane, ScheduleOptions } from './db-write-scheduler'
import { dbWriteScheduler } from './db-write-scheduler'

/**
 * Shared entry points for main-process DB writes (design D3, issue #295 follow-up).
 *
 * Every scheduled write goes through `scheduleDbWrite` / `scheduleAuxWrite`
 * instead of hand-rolled `dbWriteScheduler.schedule(label, () =>
 * withSqliteRetry(op))` wrappers. SQLITE_BUSY retry is owned by the scheduler
 * itself (delayed re-enqueue — backoff is spent queued, never while holding the
 * write loop), so call sites must NOT wrap their operation in `withSqliteRetry`
 * again: that would nest a sleeping backoff inside the queue head, which is
 * exactly the head-of-line blocking this helper exists to prevent.
 * `withSqliteRetry` remains for non-scheduler paths only (worker-thread direct
 * writes, read-side retries).
 */

export type { DbWriteLane, ScheduleOptions }

export type MainDatabase = LibSQLDatabase<typeof schema>

export interface AuxDbResolution {
  db: MainDatabase
  /** True when `db` is the real database-aux.db handle (aux init completed). */
  isAux: boolean
}

export type AuxDbResolver = () => AuxDbResolution

// Registered by DatabaseModule.onInit (the first module loaded). Lives here so
// db/ never imports from modules/ — modules/database depends (transitively,
// via search-index-writer and the migrated call sites) on files in db/, and a
// direct import would create a cycle.
let auxDbResolver: AuxDbResolver | null = null

export function setAuxDbResolver(resolver: AuxDbResolver): void {
  auxDbResolver = resolver
}

export interface AuxWriteOptions extends ScheduleOptions {
  /**
   * Dependency-injection override for the aux-DB resolution (unit tests, or a
   * store that must keep its own read handle coherent with the write target).
   * Defaults to the resolver registered by DatabaseModule.
   */
  resolveDb?: AuxDbResolver
}

/**
 * Schedule a write against the primary database (database.db). Thin passthrough
 * to the scheduler: label policies, QoS options, and scheduler-owned busy retry
 * all apply unchanged.
 */
export function scheduleDbWrite<T>(
  label: string,
  operation: () => Promise<T>,
  options?: ScheduleOptions
): Promise<T> {
  return dbWriteScheduler.schedule(label, operation, options)
}

/**
 * Schedule a write against the auxiliary database (database-aux.db), resolving
 * the `{ db, lane }` pair AT ENQUEUE TIME rather than at store construction.
 *
 * This is the fix for the stale-capture defect (R3): the aux DB finishes
 * initializing in the background, so a store constructed during startup that
 * captures `databaseModule.getAuxDb()` in its constructor can hold the primary
 * fallback for the entire process lifetime — its "aux" writes then land on
 * database.db exactly during the startup contention peak. Resolving per write
 * makes the operation receive whichever handle is correct right now, and the
 * recorded lane always matches the file actually written.
 *
 * The lane is live routing (per-file lane split): the scheduler runs one
 * queue+loop per lane, so a real-aux write never queues behind primary-file
 * contention. During the fallback window (`isAux: false`) the write correctly
 * joins the primary lane, because that IS the file it will write.
 */
export async function scheduleAuxWrite<T>(
  label: string,
  opFactory: (db: MainDatabase) => Promise<T>,
  options?: AuxWriteOptions
): Promise<T> {
  const { resolveDb, ...scheduleOptions } = options ?? {}
  const resolver = resolveDb ?? auxDbResolver
  if (!resolver) {
    // DatabaseModule is the first module loaded and registers the resolver in
    // onInit, so reaching this point indicates a wiring bug (or a unit test
    // that must inject `resolveDb`). Being async, this surfaces as a rejection.
    throw new Error(
      `scheduleAuxWrite('${label}') called before the aux DB resolver was registered ` +
        '(DatabaseModule.onInit) — wiring bug, or a test missing a resolveDb override'
    )
  }
  const { db, isAux } = resolver()
  const lane: DbWriteLane = isAux ? 'aux' : 'primary'
  return dbWriteScheduler.schedule(label, () => opFactory(db), { ...scheduleOptions, lane })
}
