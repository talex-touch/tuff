import type { Mock } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import type { SQL } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../../../../db/schema'
import { SearchIndexService } from '../../../search-engine/search-index-service'
import {
  ENRICHMENT_RESUME_ROUND_COOLDOWN_MS,
  FileProviderEnrichmentResumeService,
  type FileProviderEnrichmentResumeServiceDeps
} from './file-provider-enrichment-resume-service'

type ScheduledResult = { accepted: number; deferred: number }

/** The file ids of each page the resume pass offered to the scheduler, in call order. */
function scheduledIds(scheduleIndexing: Mock): number[][] {
  return scheduleIndexing.mock.calls.map((call) =>
    (call[0] as Array<{ id: number }>).map((row) => row.id)
  )
}

/** The mutation lease the resume pass handed to the scheduler for each page, in call order. */
function scheduledLeaseIds(scheduleIndexing: Mock): string[] {
  return scheduleIndexing.mock.calls.map((call) => call[2] as string)
}

/** A source lease stand-in that grants one distinct lease per page, immediately. */
function createImmediateLease(): <T>(operation: (leaseId: string) => Promise<T>) => Promise<T> {
  let sequence = 0
  return async <T>(operation: (leaseId: string) => Promise<T>): Promise<T> => {
    sequence += 1
    return await operation(`page-lease-${sequence}`)
  }
}

interface PagedReader {
  readFileEnrichmentPage: (predicate: SQL | undefined) => Promise<Array<Record<string, unknown>>>
  queryCount: () => number
}

/**
 * A scripted stand-in for fresh text pages. Retry/legacy probes are empty and must not consume
 * the next fresh page. Lane selection is decoded from bound SQL values, never source text;
 * actual lane eligibility and keyset pagination are exercised against SQLite below.
 */
function createPagedReader(pages: Array<Array<Record<string, unknown>>>): PagedReader {
  let queryCount = 0
  const dialect = new SQLiteSyncDialect()
  return {
    readFileEnrichmentPage: async (predicate) => {
      queryCount += 1
      const params = predicate ? dialect.sqlToQuery(predicate).params : []
      const freshQuery = !params.includes('pending') && !params.includes('skipped')
      return freshQuery ? (pages.shift() ?? []) : []
    },
    queryCount: () => queryCount
  }
}

function fileRow(id: number): Record<string, unknown> {
  return {
    id,
    path: `/tmp/file-${id}.txt`,
    name: `file-${id}.txt`,
    displayName: null,
    extension: '.txt',
    size: 10,
    mtime: new Date(id * 1_000),
    ctime: new Date(id * 1_000),
    lastIndexedAt: new Date(0),
    isDir: false,
    type: 'file',
    content: null,
    embeddingStatus: 'none'
  }
}

/** Runs the microtask-only resume loop (fake DB + immediate deps) to a stable point. */
async function settleResume(): Promise<void> {
  for (let index = 0; index < 160; index += 1) {
    await Promise.resolve()
  }
}

function createHarness(options: {
  pages: Array<Array<Record<string, unknown>>>
  scheduleIndexing: (payload: number[], callIndex: number) => ScheduledResult
  isShuttingDown?: boolean
  isEnabled?: boolean
  waitForSearchIndexDrain?: (callIndex: number, leaseId: string) => Promise<void>
  withMutationLease?: <T>(operation: (leaseId: string) => Promise<T>) => Promise<T>
}) {
  const reader = createPagedReader(options.pages)
  let callIndex = 0
  const scheduleIndexing = vi.fn<
    (
      files: Array<Record<string, unknown>>,
      reason: string,
      mutationLeaseId: string
    ) => Promise<ScheduledResult>
  >(async (files, _reason, _mutationLeaseId) => {
    const index = callIndex
    callIndex += 1
    return options.scheduleIndexing(
      files.map((file) => Number(file.id)),
      index
    )
  })
  const logInfo = vi.fn()
  const logWarn = vi.fn()
  let drainIndex = 0
  const drainLeaseIds: string[] = []
  const deps = {
    getSearchIndex: () => reader,
    isShuttingDown: () => options.isShuttingDown ?? false,
    isEnabled: () => options.isEnabled ?? true,
    // This harness supplies only text rows; image lanes are exercised against SQLite below.
    isImageEmbeddingReady: () => false,
    withMutationLease: options.withMutationLease ?? createImmediateLease(),
    scheduleIndexing,
    waitForSearchIndexDrain: async (_reason: string, leaseId: string) => {
      const index = drainIndex
      drainIndex += 1
      drainLeaseIds.push(leaseId)
      await (options.waitForSearchIndexDrain?.(index, leaseId) ?? Promise.resolve())
    },
    yieldToEventLoop: async () => undefined,
    logInfo,
    logWarn
  } as unknown as FileProviderEnrichmentResumeServiceDeps

  return {
    scheduleIndexing,
    drainLeaseIds,
    logInfo,
    logWarn,
    queryCount: reader.queryCount,
    service: new FileProviderEnrichmentResumeService(deps)
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('FileProviderEnrichmentResumeService durable suffix recovery', () => {
  it('advances the cursor past each page once every record was admitted', async () => {
    const harness = createHarness({
      pages: [[fileRow(1), fileRow(2)], [fileRow(3)], []],
      scheduleIndexing: (payload) => ({ accepted: payload.length, deferred: 0 })
    })

    harness.service.resume('startup')
    await settleResume()

    expect(scheduledIds(harness.scheduleIndexing)).toEqual([[1, 2], [3]])
    expect(harness.logInfo).toHaveBeenCalledWith('Deferred file enrichment recovery completed', {
      reason: 'startup',
      scheduled: 3
    })
    expect(harness.logWarn).not.toHaveBeenCalled()
  })

  it('re-queries the same suffix instead of skipping overflow the scheduler deferred', async () => {
    const harness = createHarness({
      pages: [[fileRow(1), fileRow(2), fileRow(3)], [fileRow(1), fileRow(2), fileRow(3)], []],
      scheduleIndexing: (payload, callIndex) =>
        callIndex === 0
          ? { accepted: 1, deferred: payload.length - 1 }
          : { accepted: payload.length, deferred: 0 }
    })

    harness.service.resume('recovery')
    await settleResume()

    // The deferred page must be offered again rather than having its cursor advance past it.
    expect(scheduledIds(harness.scheduleIndexing)).toEqual([
      [1, 2, 3],
      [1, 2, 3]
    ])
  })

  it('stops without spinning when the scheduler admits and defers nothing', async () => {
    const harness = createHarness({
      pages: [[fileRow(1)], [fileRow(1)], [fileRow(1)]],
      scheduleIndexing: () => ({ accepted: 0, deferred: 0 })
    })

    harness.service.resume('closed')
    await settleResume()

    expect(harness.scheduleIndexing).toHaveBeenCalledTimes(1)
    expect(harness.logInfo).not.toHaveBeenCalled()
  })

  it('does not read or schedule anything while shutting down', async () => {
    const harness = createHarness({
      pages: [[fileRow(1)]],
      scheduleIndexing: (payload) => ({ accepted: payload.length, deferred: 0 }),
      isShuttingDown: true
    })

    harness.service.resume('shutdown')
    await settleResume()

    expect(harness.queryCount()).toBe(0)
    expect(harness.scheduleIndexing).not.toHaveBeenCalled()
  })

  it('runs exactly one follow-up pass when resumption is requested during an in-flight pass', async () => {
    // Only the cooldown timer is faked; the resume loop itself is microtask-driven.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const drainGates: Array<() => void> = []
    const harness = createHarness({
      pages: [[fileRow(1), fileRow(2)], [], [fileRow(3)], []],
      scheduleIndexing: (payload) => ({ accepted: payload.length, deferred: 0 }),
      waitForSearchIndexDrain: () =>
        new Promise<void>((resolve) => {
          drainGates.push(resolve)
        })
    })

    harness.service.resume('first')
    await settleResume()
    expect(drainGates).toHaveLength(1)
    expect(harness.scheduleIndexing).toHaveBeenCalledTimes(1)

    // Requests made while a pass is running must not start a second concurrent pass...
    harness.service.resume('second')
    harness.service.resume('third')
    await settleResume()
    expect(drainGates).toHaveLength(1)
    expect(harness.scheduleIndexing).toHaveBeenCalledTimes(1)

    // ...but exactly one follow-up pass must run once the pass settles and the round cooldown has
    // elapsed, so rows that became pending mid-pass are not left waiting for an unrelated future
    // drain.
    drainGates[0]!()
    await settleResume()
    expect(harness.scheduleIndexing).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(ENRICHMENT_RESUME_ROUND_COOLDOWN_MS)
    await settleResume()
    expect(harness.scheduleIndexing).toHaveBeenCalledTimes(2)
    expect(scheduledIds(harness.scheduleIndexing)[1]).toEqual([3])

    drainGates[1]!()
    await settleResume()
    expect(harness.scheduleIndexing).toHaveBeenCalledTimes(2)
  })
})

/** Only the cooldown timer (and the clock it reads) is faked; resume pages yield real turns. */
function useCooldownClock(): void {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
}

function dispatchFailure(): AggregateError {
  return new AggregateError(
    [new Error('FILE_INDEX_WORKER_BATCH_FAILED:1/2')],
    'INDEXED_WORKER_SCHEDULER_DISPATCH_FAILED'
  )
}

/** First and last file id of each page the resume rounds offered to the scheduler. */
function pageBounds(scheduleIndexing: Mock): Array<[number, number]> {
  return scheduledIds(scheduleIndexing).map((ids) => [ids[0]!, ids[ids.length - 1]!])
}

/** Real macrotask turns; every page of the database-backed harness yields exactly one. */
async function settleRounds(turns = 60): Promise<void> {
  for (let index = 0; index < turns; index += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
}

interface ResumeDatabase {
  client: Client
  directory: string
  /** The page reader production wires: reader mode, every read through its executor. */
  reader: SearchIndexService
}

/** A split-home stand-in with `fileCount` enrichment-pending files (ids 1..fileCount). */
async function openResumeDatabase(fileCount: number): Promise<ResumeDatabase> {
  const directory = await mkdtemp(join(tmpdir(), 'enrichment-resume-'))
  const client = createClient({ url: `file:${join(directory, 'index.sqlite')}` })
  await client.execute(`
    CREATE TABLE files (
      id INTEGER PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      display_name TEXT,
      extension TEXT,
      size INTEGER,
      mtime INTEGER NOT NULL,
      ctime INTEGER NOT NULL,
      last_indexed_at INTEGER NOT NULL DEFAULT 0,
      is_dir INTEGER NOT NULL DEFAULT 0,
      type TEXT NOT NULL DEFAULT 'file',
      content TEXT,
      embedding_status TEXT NOT NULL DEFAULT 'none'
    )
  `)
  await client.execute(`
    CREATE TABLE file_index_progress (
      file_id INTEGER NOT NULL PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      progress INTEGER NOT NULL DEFAULT 0,
      processed_bytes INTEGER,
      total_bytes INTEGER,
      last_error TEXT,
      started_at INTEGER,
      updated_at INTEGER NOT NULL DEFAULT 0
    )
  `)
  await client.execute({
    sql: `
      WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < ?)
      INSERT INTO files (id, path, name, extension, size, mtime, ctime, type)
      SELECT n, '/tmp/resume-' || n || '.txt', 'resume-' || n || '.txt', '.txt', 10, 0, 0, 'file'
      FROM seq
    `,
    args: [fileCount]
  })
  // The reader-mode service checks these columns before its first read.
  await client.execute(
    'CREATE VIRTUAL TABLE search_index USING fts5(item_id UNINDEXED, provider UNINDEXED, content)'
  )
  const db = drizzle(client, { schema })
  const reader = new SearchIndexService(db, {
    initializationMode: 'reader',
    readiness: { waitUntilReady: async () => undefined },
    readExecutor: { all: async <T>(query: SQL): Promise<T[]> => await db.all<T>(query) }
  })
  return { client, directory, reader }
}

/**
 * Drives the service against real keyset queries. The scheduler stand-in never completes a
 * file, so a row stays pending until a round's cursor moves past it — which is what makes the
 * cursor observable across rounds.
 */
function createDatabaseHarness(
  database: ResumeDatabase,
  options: {
    scheduleIndexing: (payload: number[], callIndex: number) => ScheduledResult
    waitForSearchIndexDrain?: (callIndex: number, leaseId: string) => Promise<void>
    withMutationLease?: <T>(operation: (leaseId: string) => Promise<T>) => Promise<T>
  }
) {
  let scheduleCalls = 0
  let drainCalls = 0
  const scheduleIndexing = vi.fn<
    (
      files: Array<Record<string, unknown>>,
      reason: string,
      mutationLeaseId: string
    ) => Promise<ScheduledResult>
  >(async (files) => {
    const index = scheduleCalls
    scheduleCalls += 1
    // A runaway round fails fast instead of spinning until the test timeout.
    if (index >= 40) throw new Error('runaway resume round')
    return options.scheduleIndexing(
      files.map((file) => Number(file.id)),
      index
    )
  })
  const logInfo = vi.fn()
  const logWarn = vi.fn()
  const deps = {
    getSearchIndex: () => database.reader,
    isShuttingDown: () => false,
    isEnabled: () => true,
    isImageEmbeddingReady: () => false,
    withMutationLease: options.withMutationLease ?? createImmediateLease(),
    scheduleIndexing,
    waitForSearchIndexDrain: async (_reason: string, leaseId: string) => {
      const index = drainCalls
      drainCalls += 1
      await options.waitForSearchIndexDrain?.(index, leaseId)
    },
    yieldToEventLoop: () => new Promise<void>((resolve) => setImmediate(resolve)),
    logInfo,
    logWarn
  } as unknown as FileProviderEnrichmentResumeServiceDeps

  return {
    scheduleIndexing,
    logInfo,
    logWarn,
    service: new FileProviderEnrichmentResumeService(deps)
  }
}

describe('FileProviderEnrichmentResumeService round spacing and cursor', () => {
  let database: ResumeDatabase | undefined

  afterEach(async () => {
    database?.client.close()
    if (database) await rm(database.directory, { recursive: true, force: true })
    database = undefined
  })

  it('starts the follow-up one cooldown after the round ends, on a single timer', async () => {
    useCooldownClock()
    const drainGates: Array<() => void> = []
    const harness = createHarness({
      pages: [[fileRow(1)], [], [fileRow(2)], []],
      scheduleIndexing: (payload) => ({ accepted: payload.length, deferred: 0 }),
      waitForSearchIndexDrain: () =>
        new Promise<void>((resolve) => {
          drainGates.push(resolve)
        })
    })

    harness.service.resume('startup')
    await settleResume()
    harness.service.resume('indexed-source.watch')
    harness.service.resume('indexed-source.scan')
    expect(vi.getTimerCount()).toBe(0)

    drainGates[0]!()
    await settleResume()
    // The round ended with requests outstanding: one timer, and the follow-up has not started.
    expect(vi.getTimerCount()).toBe(1)
    expect(harness.scheduleIndexing).toHaveBeenCalledTimes(1)

    // Requests during the cooldown share that timer.
    harness.service.resume('indexed-source.watch')
    harness.service.resume('recovery.indexed-source.scan')
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(ENRICHMENT_RESUME_ROUND_COOLDOWN_MS - 1)
    await settleResume()
    expect(harness.scheduleIndexing).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    await settleResume()
    expect(harness.scheduleIndexing).toHaveBeenCalledTimes(2)
    expect(harness.scheduleIndexing.mock.calls[1]![1]).toBe('enrichment-resume.follow-up')

    drainGates[1]!()
    await settleResume()
    // Nothing was requested during the follow-up, so nothing is re-armed.
    expect(vi.getTimerCount()).toBe(0)
  })

  it('holds a request made during the cooldown until the cooldown ends', async () => {
    useCooldownClock()
    const harness = createHarness({
      pages: [[fileRow(1)], [], [fileRow(2)], [], [fileRow(3)], []],
      scheduleIndexing: (payload) => ({ accepted: payload.length, deferred: 0 })
    })

    harness.service.resume('startup')
    await settleResume()
    expect(harness.scheduleIndexing).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(10_000)
    harness.service.resume('indexed-source.watch')
    await settleResume()
    expect(harness.scheduleIndexing).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)

    // Due at the end of the previous round plus the cooldown, not 45s after the request.
    await vi.advanceTimersByTimeAsync(ENRICHMENT_RESUME_ROUND_COOLDOWN_MS - 10_000 - 1)
    await settleResume()
    expect(harness.scheduleIndexing).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await settleResume()
    expect(harness.scheduleIndexing).toHaveBeenCalledTimes(2)
    expect(harness.scheduleIndexing.mock.calls[1]![1]).toBe(
      'enrichment-resume.indexed-source.watch'
    )

    // Once a full cooldown has passed, a request starts a round straight away.
    await vi.advanceTimersByTimeAsync(ENRICHMENT_RESUME_ROUND_COOLDOWN_MS)
    harness.service.resume('indexed-source.scan')
    await settleResume()
    expect(harness.scheduleIndexing).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('never holds a request longer than one cooldown when the clock is set back', async () => {
    useCooldownClock()
    const harness = createHarness({
      pages: [[fileRow(1)], [], [fileRow(2)], []],
      scheduleIndexing: (payload) => ({ accepted: payload.length, deferred: 0 })
    })

    harness.service.resume('startup')
    await settleResume()
    expect(harness.scheduleIndexing).toHaveBeenCalledTimes(1)

    // The round ended by the old clock; the wall clock then moves an hour back (NTP, a manual
    // change, a VM resume). The remaining cooldown must not grow by that hour.
    vi.setSystemTime(Date.now() - 60 * 60_000)
    harness.service.resume('indexed-source.watch')
    await settleResume()
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(ENRICHMENT_RESUME_ROUND_COOLDOWN_MS)
    await settleResume()
    expect(harness.scheduleIndexing).toHaveBeenCalledTimes(2)
  })

  it('continues from the previous round’s cursor and wraps to the head only at the end', async () => {
    useCooldownClock()
    database = await openResumeDatabase(500)
    const harness = createDatabaseHarness(database, {
      scheduleIndexing: (payload, callIndex) => {
        if (callIndex === 2) throw new Error('file_index_progress write failed')
        return { accepted: payload.length, deferred: 0 }
      }
    })

    harness.service.resume('startup')
    await settleRounds()
    // Two pages admitted, then scheduling the third failed: the round paused after id 400.
    expect(pageBounds(harness.scheduleIndexing)).toEqual([
      [1, 200],
      [201, 400],
      [401, 500]
    ])
    expect(harness.logWarn).toHaveBeenCalledWith(
      'Deferred file enrichment recovery paused',
      expect.any(Error),
      { reason: 'startup' }
    )

    await vi.advanceTimersByTimeAsync(ENRICHMENT_RESUME_ROUND_COOLDOWN_MS)
    await settleRounds()
    // The retry continues after id 400 instead of re-reading the head of the table.
    expect(pageBounds(harness.scheduleIndexing).slice(3)).toEqual([[401, 500]])

    await vi.advanceTimersByTimeAsync(ENRICHMENT_RESUME_ROUND_COOLDOWN_MS)
    await settleRounds()
    // It reached the end having started mid-table, so the cursor wrapped and the rows before
    // id 401 get their pass in the next round.
    expect(pageBounds(harness.scheduleIndexing).slice(4)).toEqual([
      [1, 200],
      [201, 400],
      [401, 500]
    ])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('moves past a page whose dispatch failed instead of ending the round', async () => {
    let drains = 0
    const harness = createHarness({
      pages: [[fileRow(1), fileRow(2)], [fileRow(3)], []],
      scheduleIndexing: (payload) => ({ accepted: payload.length, deferred: 0 }),
      waitForSearchIndexDrain: async () => {
        drains += 1
        if (drains === 1) throw dispatchFailure()
      }
    })

    harness.service.resume('startup')
    await settleResume()

    expect(scheduledIds(harness.scheduleIndexing)).toEqual([[1, 2], [3]])
    expect(harness.logWarn).not.toHaveBeenCalled()
    expect(harness.logInfo).toHaveBeenCalledWith('Deferred file enrichment recovery completed', {
      reason: 'startup',
      scheduled: 3,
      failedPages: 1
    })
  })

  it('steps past a partially admitted page when its failed dispatch left every row pending', async () => {
    database = await openResumeDatabase(260)
    const harness = createDatabaseHarness(database, {
      // Admits 60 per page like the bounded scheduler; a dead worker completes none of them.
      scheduleIndexing: (payload) => ({
        accepted: Math.min(60, payload.length),
        deferred: Math.max(0, payload.length - 60)
      }),
      waitForSearchIndexDrain: async (callIndex) => {
        if (callIndex === 0) throw dispatchFailure()
      }
    })

    harness.service.resume('startup')
    await settleRounds()

    // Re-offering the identical page would fail the same way forever; its rows stay pending
    // for the pass after the wrap while the round carries on.
    expect(pageBounds(harness.scheduleIndexing)).toEqual([
      [1, 200],
      [201, 260]
    ])
    expect(harness.logWarn).not.toHaveBeenCalled()
  })

  it('retries a round paused for capacity once the cooldown ends, without another request', async () => {
    useCooldownClock()
    const harness = createHarness({
      pages: [
        [fileRow(1)],
        [fileRow(1)],
        [fileRow(1)],
        [fileRow(1)],
        [fileRow(1)],
        [fileRow(1)],
        []
      ],
      scheduleIndexing: (payload, callIndex) =>
        callIndex < 5
          ? { accepted: 0, deferred: payload.length }
          : { accepted: payload.length, deferred: 0 }
    })

    harness.service.resume('startup')
    await settleResume()
    expect(harness.scheduleIndexing).toHaveBeenCalledTimes(5)
    expect(harness.logWarn).toHaveBeenCalledWith(
      'Deferred file enrichment recovery paused',
      undefined,
      { reason: 'startup', remaining: 1 }
    )
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(ENRICHMENT_RESUME_ROUND_COOLDOWN_MS)
    await settleResume()
    expect(harness.scheduleIndexing).toHaveBeenCalledTimes(6)
    expect(harness.scheduleIndexing.mock.calls[5]![1]).toBe('enrichment-resume.follow-up')
  })

  it('retries a round a drain timeout ended once the cooldown ends', async () => {
    useCooldownClock()
    const timeout = new Error('file-index-search-drain-timeout:enrichment-resume.startup')
    let drains = 0
    const harness = createHarness({
      pages: [[fileRow(1)], [fileRow(1)], []],
      scheduleIndexing: (payload) => ({ accepted: payload.length, deferred: 0 }),
      waitForSearchIndexDrain: async () => {
        drains += 1
        if (drains === 1) throw timeout
      }
    })

    harness.service.resume('startup')
    await settleResume()
    // Only a scheduler dispatch failure is a failed page; a timeout still ends the round.
    expect(harness.scheduleIndexing).toHaveBeenCalledTimes(1)
    expect(harness.logWarn).toHaveBeenCalledWith(
      'Deferred file enrichment recovery paused',
      timeout,
      { reason: 'startup' }
    )
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(ENRICHMENT_RESUME_ROUND_COOLDOWN_MS)
    await settleResume()
    expect(harness.scheduleIndexing).toHaveBeenCalledTimes(2)
  })
})

describe('FileProviderEnrichmentResumeService page lease ownership', () => {
  it('does not admit or schedule a page before its mutation lease is granted', async () => {
    const leaseGrants: Array<(leaseId: string) => void> = []
    const harness = createHarness({
      pages: [[fileRow(1)], [fileRow(2)], []],
      scheduleIndexing: (payload) => ({ accepted: payload.length, deferred: 0 }),
      withMutationLease: <T>(operation: (leaseId: string) => Promise<T>): Promise<T> =>
        new Promise<T>((resolve, reject) => {
          leaseGrants.push((leaseId) => {
            operation(leaseId).then(resolve, reject)
          })
        })
    })

    harness.service.resume('startup')
    await settleResume()

    // The page was read, but nothing may be admitted while the source lease is not held yet.
    expect(harness.scheduleIndexing).not.toHaveBeenCalled()

    leaseGrants[0]!('page-lease-1')
    await settleResume()
    expect(scheduledLeaseIds(harness.scheduleIndexing)).toEqual(['page-lease-1'])

    leaseGrants[1]!('page-lease-2')
    await settleResume()
    expect(scheduledLeaseIds(harness.scheduleIndexing)).toEqual(['page-lease-1', 'page-lease-2'])
  })

  it('holds each page lease through its drain with the lease the scheduler received', async () => {
    const heldLeases = new Set<string>()
    const drainHeldLease: boolean[] = []
    let leaseSequence = 0
    const harness = createHarness({
      pages: [[fileRow(1), fileRow(2)], [fileRow(3)], []],
      scheduleIndexing: (payload) => ({ accepted: payload.length, deferred: 0 }),
      withMutationLease: async <T>(operation: (leaseId: string) => Promise<T>): Promise<T> => {
        leaseSequence += 1
        const leaseId = `page-lease-${leaseSequence}`
        heldLeases.add(leaseId)
        try {
          return await operation(leaseId)
        } finally {
          heldLeases.delete(leaseId)
        }
      },
      waitForSearchIndexDrain: async (_callIndex, leaseId) => {
        drainHeldLease.push(heldLeases.has(leaseId))
      }
    })

    harness.service.resume('startup')
    await settleResume()

    // One lease per page spans scheduling and draining...
    expect(scheduledLeaseIds(harness.scheduleIndexing)).toEqual(['page-lease-1', 'page-lease-2'])
    expect(harness.drainLeaseIds).toEqual(['page-lease-1', 'page-lease-2'])
    // ...and the drain runs while that lease is still held, not after it was given back.
    expect(drainHeldLease).toEqual([true, true])
  })
})

/**
 * Content enrichment is the only path that reads file bodies. With the setting off, a resume
 * request must not even query the pending rows — reading them is what turns into parser work.
 */
describe('FileProviderEnrichmentResumeService content indexing gate', () => {
  it('neither reads pending rows nor schedules work while content indexing is disabled', async () => {
    const harness = createHarness({
      pages: [[fileRow(1)]],
      scheduleIndexing: (payload) => ({ accepted: payload.length, deferred: 0 }),
      isEnabled: false
    })

    harness.service.resume('startup')
    await settleResume()

    expect(harness.queryCount()).toBe(0)
    expect(harness.scheduleIndexing).not.toHaveBeenCalled()
    expect(harness.service.isActive()).toBe(false)

    // A later explicit request while the setting is still off must also stay inert.
    harness.service.resume('settings-enabled')
    await settleResume()

    expect(harness.queryCount()).toBe(0)
    expect(harness.scheduleIndexing).not.toHaveBeenCalled()
  })
})

/** Creates low-id image backfill and leaves every higher-id image without progress. */
async function prepareImageBacklog(database: ResumeDatabase, legacyCount: number): Promise<void> {
  await database.client.batch(
    [
      {
        sql: "UPDATE files SET extension = '.png', path = '/scope/IMG_' || id || '.png', name = 'IMG_' || id || '.png'",
        args: []
      },
      {
        sql: `INSERT INTO file_index_progress (file_id, status, last_error, updated_at)
          SELECT id, 'skipped', 'content-indexing-disabled', 0 FROM files WHERE id <= ?`,
        args: [legacyCount]
      }
    ],
    'write'
  )
}

async function insertImageFile(database: ResumeDatabase, id: number): Promise<void> {
  await database.client.execute({
    sql: `INSERT INTO files (id, path, name, extension, size, mtime, ctime, type)
      VALUES (?, ?, ?, '.png', 10, 0, 0, 'file')`,
    args: [id, `/scope/IMG_${id}.png`, `IMG_${id}.png`]
  })
}

/** Real read home plus scheduler/drain boundaries, including whole-page pending persistence. */
function createCompletingImageHarness(
  database: ResumeDatabase,
  options: {
    admission?: (ids: number[], callIndex: number) => number
    markWholePagePending?: boolean
    failDispatch?: (ids: number[], callIndex: number) => boolean
    afterDrain?: (ids: number[], callIndex: number) => Promise<void>
    isEnabled?: () => boolean
    isImageEmbeddingReady?: () => boolean
  } = {}
) {
  const rounds: PromiseWithResolvers<void>[] = []
  let endedRounds = 0
  const roundFinished = (index = 0): Promise<void> => {
    rounds[index] ??= Promise.withResolvers<void>()
    return rounds[index]!.promise
  }
  const finishRound = (error?: unknown): void => {
    roundFinished(endedRounds)
    const round = rounds[endedRounds++]!
    if (error) round.reject(error)
    else round.resolve()
  }
  const admitted: number[] = []
  const pages = new Map<string, { ids: number[]; accepted: number[]; callIndex: number }>()
  let scheduleCalls = 0
  const scheduleIndexing = vi.fn(
    async (files: Array<{ id: number }>, _reason: string, leaseId: string) => {
      const callIndex = scheduleCalls++
      if (callIndex >= 40) throw new Error('IMAGE_RECOVERY_SPIN')
      const ids = files.map((file) => file.id)
      const accepted = ids.slice(0, options.admission?.(ids, callIndex) ?? ids.length)
      if (options.markWholePagePending) {
        await database.client.batch(
          ids.map((id) => ({
            sql: `INSERT INTO file_index_progress (file_id, status, progress, last_error, updated_at)
              VALUES (?, 'pending', 0, NULL, 0)
              ON CONFLICT(file_id) DO UPDATE SET status = 'pending', progress = 0, last_error = NULL`,
            args: [id]
          })),
          'write'
        )
      }
      if (accepted.length > 0) {
        await database.client.batch(
          accepted.map((id) => ({
            sql: `INSERT INTO file_index_progress (file_id, status, progress, last_error, updated_at)
            VALUES (?, 'processing', 0, NULL, 0)
            ON CONFLICT(file_id) DO UPDATE SET status = 'processing', progress = 0, last_error = NULL`,
            args: [id]
          })),
          'write'
        )
      }
      admitted.push(...accepted)
      pages.set(leaseId, { ids, accepted, callIndex })
      return { accepted: accepted.length, deferred: ids.length - accepted.length }
    }
  )
  const deps = {
    getSearchIndex: () => database.reader,
    isShuttingDown: () => false,
    isEnabled: options.isEnabled ?? (() => true),
    isImageEmbeddingReady: options.isImageEmbeddingReady ?? (() => true),
    withMutationLease: createImmediateLease(),
    scheduleIndexing,
    waitForSearchIndexDrain: async (_reason: string, leaseId: string) => {
      const page = pages.get(leaseId)
      // Dispatch-failure recovery drains the settled lease once more to flush publication.
      if (!page) return
      if (options.failDispatch?.(page.ids, page.callIndex)) {
        await database.client.batch(
          page.accepted.map((id) => ({
            sql: "UPDATE file_index_progress SET status = 'pending', progress = 0 WHERE file_id = ?",
            args: [id]
          })),
          'write'
        )
        await options.afterDrain?.(page.ids, page.callIndex)
        pages.delete(leaseId)
        throw dispatchFailure()
      }
      if (page.accepted.length > 0) {
        await database.client.batch(
          page.accepted.map((id) => ({
            sql: "UPDATE file_index_progress SET status = 'completed', progress = 100, last_error = NULL WHERE file_id = ?",
            args: [id]
          })),
          'write'
        )
      }
      await options.afterDrain?.(page.ids, page.callIndex)
      pages.delete(leaseId)
    },
    yieldToEventLoop: () => new Promise<void>((resolve) => setImmediate(resolve)),
    logInfo: () => finishRound(),
    logWarn: (_message: string, error?: unknown) =>
      finishRound(error ?? new Error('IMAGE_RECOVERY_PAUSED'))
  } as unknown as FileProviderEnrichmentResumeServiceDeps
  return {
    service: new FileProviderEnrichmentResumeService(deps),
    scheduleIndexing,
    admitted,
    roundFinished
  }
}

describe('FileProviderEnrichmentResumeService legacy image recovery', () => {
  let database: ResumeDatabase | undefined
  let service: FileProviderEnrichmentResumeService | undefined

  afterEach(async () => {
    service?.stop()
    database?.client.close()
    if (database) await rm(database.directory, { recursive: true, force: true })
    database = undefined
    service = undefined
  })

  it('completes a new image before a large low-id legacy image backlog', async () => {
    useCooldownClock()
    database = await openResumeDatabase(601)
    const home = database
    await prepareImageBacklog(home, 600)
    const harness = createCompletingImageHarness(home)
    service = harness.service

    service.resume('new-image-priority')
    await harness.roundFinished()

    expect(scheduledIds(harness.scheduleIndexing)[0]).toEqual([601])
    expect(harness.admitted[0]).toBe(601)
    expect(
      (
        await home.client.execute(
          'SELECT status, progress, last_error FROM file_index_progress WHERE file_id = 601'
        )
      ).rows
    ).toEqual([{ status: 'completed', progress: 100, last_error: null }])
    expect(
      (
        await home.client.execute(
          "SELECT COUNT(*) AS completed FROM file_index_progress WHERE status = 'completed'"
        )
      ).rows
    ).toEqual([{ completed: 601 }])
  })

  it('completes a fresh high-id image before low-id pending and processing image retries', async () => {
    useCooldownClock()
    database = await openResumeDatabase(601)
    const home = database
    await prepareImageBacklog(home, 600)
    await home.client.execute(`UPDATE file_index_progress SET status = CASE
      WHEN file_id <= 200 AND file_id % 2 = 0 THEN 'processing'
      WHEN file_id <= 200 THEN 'pending'
      ELSE 'completed' END, last_error = NULL`)
    const harness = createCompletingImageHarness(home)
    service = harness.service

    service.resume('fresh-before-retry')
    await harness.roundFinished()

    expect(scheduledIds(harness.scheduleIndexing)[0]).toEqual([601])
    expect(harness.admitted[0]).toBe(601)
    expect(
      (
        await home.client.execute(
          'SELECT status, progress FROM file_index_progress WHERE file_id = 601'
        )
      ).rows
    ).toEqual([{ status: 'completed', progress: 100 }])
    expect(
      (
        await home.client.execute(
          "SELECT COUNT(*) AS completed FROM file_index_progress WHERE status = 'completed'"
        )
      ).rows
    ).toEqual([{ completed: 601 }])
  })
  it('consumes an image inserted during a legacy page at the next fresh selection opportunity', async () => {
    useCooldownClock()
    database = await openResumeDatabase(600)
    const home = database
    await prepareImageBacklog(home, 600)
    const harness = createCompletingImageHarness(home, {
      afterDrain: async (_ids, callIndex) => {
        if (callIndex === 0) await insertImageFile(home, 1000)
      }
    })
    service = harness.service

    service.resume('image-arrived-during-backfill')
    await harness.roundFinished()

    expect(pageBounds(harness.scheduleIndexing).slice(0, 3)).toEqual([
      [1, 200],
      [1000, 1000],
      [201, 400]
    ])
    expect(
      (
        await home.client.execute(
          'SELECT status, progress FROM file_index_progress WHERE file_id = 1000'
        )
      ).rows
    ).toEqual([{ status: 'completed', progress: 100 }])
    expect(
      (
        await home.client.execute(
          "SELECT COUNT(*) AS completed FROM file_index_progress WHERE status = 'completed'"
        )
      ).rows
    ).toEqual([{ completed: 601 }])
  })

  it('advances retry and legacy pages while fresh images keep arriving', async () => {
    useCooldownClock()
    database = await openResumeDatabase(601)
    const home = database
    await prepareImageBacklog(home, 600)
    await home.client.execute(`UPDATE file_index_progress SET status = CASE
      WHEN file_id % 2 = 0 THEN 'processing' ELSE 'pending' END, last_error = NULL
      WHERE file_id BETWEEN 401 AND 600`)
    const snapshots: Array<{ backfilled: number; retried: number; waiting: number }> = []
    let nextImage = 602
    const harness = createCompletingImageHarness(home, {
      afterDrain: async (ids) => {
        if (ids[0]! > 600 && nextImage <= 605) await insertImageFile(home, nextImage++)
        if (ids[0] === 1) {
          const result = await home.client.execute(`
            SELECT
              (SELECT COUNT(*) FROM file_index_progress WHERE file_id <= 400 AND status = 'completed') AS backfilled,
              (SELECT COUNT(*) FROM file_index_progress WHERE file_id BETWEEN 401 AND 600 AND status = 'completed') AS retried,
              (SELECT COUNT(*) FROM files f LEFT JOIN file_index_progress p ON p.file_id = f.id
                WHERE f.id > 600 AND (p.file_id IS NULL OR p.status != 'completed')) AS waiting
          `)
          const row = result.rows[0]!
          snapshots.push({
            backfilled: Number(row.backfilled),
            retried: Number(row.retried),
            waiting: Number(row.waiting)
          })
        }
      }
    })
    service = harness.service
    service.resume('fresh-image-stream')
    await harness.roundFinished()

    const pages = scheduledIds(harness.scheduleIndexing)
    const nextFresh = pages.findIndex((ids) => ids.includes(602))
    expect(pages[0]).toEqual([601])
    expect(pages.findIndex((ids) => ids.includes(401))).toBeLessThan(nextFresh)
    expect(pages.findIndex((ids) => ids.includes(1))).toBeLessThan(nextFresh)
    expect(nextFresh).toBeLessThanOrEqual(3)
    expect(snapshots).toEqual([{ backfilled: 200, retried: 200, waiting: 1 }])
    expect(
      (
        await home.client.execute(
          "SELECT COUNT(*) AS completed FROM file_index_progress WHERE status = 'completed'"
        )
      ).rows
    ).toEqual([{ completed: 605 }])
  })

  it.each([
    { lane: 'fresh', legacyCount: 260, fileCount: 461, firstPartialId: 261 },
    { lane: 'retry', legacyCount: 260, fileCount: 461, firstPartialId: 261 },
    { lane: 'legacy', legacyCount: 260, fileCount: 261, firstPartialId: 1 }
  ])(
    'preserves a deferred $lane suffix while admitting newly arrived fresh work',
    async ({ lane, legacyCount, fileCount, firstPartialId }) => {
      useCooldownClock()
      database = await openResumeDatabase(fileCount)
      const home = database
      await prepareImageBacklog(home, legacyCount)
      if (lane === 'retry') {
        await home.client.execute(`INSERT INTO file_index_progress (file_id, status, updated_at)
          SELECT id, 'pending', 0 FROM files WHERE id > ${legacyCount}`)
      }
      let partialCall = -1
      const harness = createCompletingImageHarness(home, {
        admission: (ids, callIndex) => {
          if (partialCall === -1 && ids[0] === firstPartialId) {
            partialCall = callIndex
            return 60
          }
          return ids.length
        },
        afterDrain: async (_ids, callIndex) => {
          if (callIndex === partialCall) await insertImageFile(home, 1000)
        }
      })
      service = harness.service

      service.resume(`partial-${lane}-admission`)
      await harness.roundFinished()

      const offered = scheduledIds(harness.scheduleIndexing)
      expect(offered[partialCall]).toEqual(
        Array.from({ length: 200 }, (_, index) => firstPartialId + index)
      )
      const nextFresh = offered.findIndex((ids, index) => index > partialCall && ids.includes(1000))
      expect(nextFresh - partialCall).toBeGreaterThan(0)
      expect(nextFresh - partialCall).toBeLessThanOrEqual(3)
      if (lane === 'legacy') expect(nextFresh).toBe(partialCall + 1)
      expect(
        offered.some((ids, index) => index > partialCall && ids.includes(firstPartialId + 60))
      ).toBe(true)
      // Every durable row finishes exactly once, including the suffix no cursor was allowed to skip.
      expect([...harness.admitted].sort((left, right) => left - right)).toEqual([
        ...Array.from({ length: fileCount }, (_, index) => index + 1),
        1000
      ])
      expect(
        (
          await home.client.execute(
            "SELECT COUNT(*) AS completed FROM file_index_progress WHERE status = 'completed' AND progress = 100 AND last_error IS NULL"
          )
        ).rows
      ).toEqual([{ completed: fileCount + 1 }])
    }
  )

  it('gives fresh work the next turn after legacy overflow is persisted pending and migrates to retry', async () => {
    useCooldownClock()
    database = await openResumeDatabase(261)
    const home = database
    await prepareImageBacklog(home, 260)
    let legacyCall = -1
    let pendingSuffix = -1
    const harness = createCompletingImageHarness(home, {
      markWholePagePending: true,
      admission: (ids, callIndex) => {
        if (legacyCall === -1 && ids[0] === 1) {
          legacyCall = callIndex
          return 60
        }
        return ids.length
      },
      afterDrain: async (_ids, callIndex) => {
        if (callIndex !== legacyCall) return
        pendingSuffix = Number(
          (
            await home.client.execute(
              "SELECT COUNT(*) AS pending FROM file_index_progress WHERE file_id BETWEEN 61 AND 200 AND status = 'pending'"
            )
          ).rows[0]!.pending
        )
        await insertImageFile(home, 1000)
      }
    })
    service = harness.service
    service.resume('legacy-overflow-migrated-to-retry')
    await harness.roundFinished()

    const pages = scheduledIds(harness.scheduleIndexing)
    expect(pendingSuffix).toBe(140)
    expect(pages[legacyCall + 1]).toEqual([1000])
    expect(
      pages.some((ids, index) => index > legacyCall + 1 && ids[0] === 61 && ids.at(-1) === 200)
    ).toBe(true)
    expect([...harness.admitted].sort((left, right) => left - right)).toEqual([
      ...Array.from({ length: 261 }, (_, index) => index + 1),
      1000
    ])
    expect(
      (
        await home.client.execute(
          "SELECT COUNT(*) AS completed FROM file_index_progress WHERE status = 'completed' AND progress = 100 AND last_error IS NULL"
        )
      ).rows
    ).toEqual([{ completed: 262 }])
  })

  it.each([
    { lane: 'fresh', firstFailedId: 461 },
    { lane: 'retry', firstFailedId: 261 },
    { lane: 'legacy', firstFailedId: 1 }
  ])(
    'keeps $lane dispatch failures durable without blocking newly arrived fresh work',
    async ({ lane, firstFailedId }) => {
      useCooldownClock()
      database = await openResumeDatabase(661)
      const home = database
      await prepareImageBacklog(home, 460)
      await home.client.execute(
        "UPDATE file_index_progress SET status = 'pending', last_error = NULL WHERE file_id > 260"
      )
      let failedCall = -1
      let pendingAtFailure = -1
      const harness = createCompletingImageHarness(home, {
        markWholePagePending: true,
        admission: (ids, callIndex) => {
          if (failedCall === -1 && ids[0] === firstFailedId) {
            failedCall = callIndex
            return 60
          }
          return ids.length
        },
        failDispatch: (_ids, callIndex) => callIndex === failedCall,
        afterDrain: async (ids, callIndex) => {
          if (callIndex !== failedCall) return
          const result = await home.client.execute({
            sql: "SELECT COUNT(*) AS pending FROM file_index_progress WHERE file_id BETWEEN ? AND ? AND status = 'pending'",
            args: [ids[0]!, ids.at(-1)!]
          })
          pendingAtFailure = Number(result.rows[0]!.pending)
          await insertImageFile(home, 1000)
        }
      })
      service = harness.service
      service.resume(`failed-${lane}-dispatch`)
      await harness.roundFinished()
      await settleResume()

      const pages = scheduledIds(harness.scheduleIndexing)
      const newFreshPage = pages.findIndex((ids) => ids.includes(1000))
      expect(failedCall).toBeGreaterThanOrEqual(0)
      expect(pendingAtFailure).toBe(200)
      expect(newFreshPage - failedCall).toBeGreaterThan(0)
      expect(newFreshPage - failedCall).toBeLessThanOrEqual(3)
      let completed = Number(
        (
          await home.client.execute(
            "SELECT COUNT(*) AS completed FROM file_index_progress WHERE status = 'completed'"
          )
        ).rows[0]!.completed
      )
      if (completed !== 662) {
        const automaticFollowUp = service.isActive()
        await vi.advanceTimersByTimeAsync(ENRICHMENT_RESUME_ROUND_COOLDOWN_MS)
        if (!automaticFollowUp) service.resume('failed-page-after-wrap')
        await harness.roundFinished(1)
        await settleResume()
        completed = Number(
          (
            await home.client.execute(
              "SELECT COUNT(*) AS completed FROM file_index_progress WHERE status = 'completed' AND progress = 100 AND last_error IS NULL"
            )
          ).rows[0]!.completed
        )
      }
      expect(completed).toBe(662)
      expect(
        (
          await home.client.execute(
            'SELECT status, progress FROM file_index_progress WHERE file_id = 1000'
          )
        ).rows
      ).toEqual([{ status: 'completed', progress: 100 }])
    }
  )

  it('recovers low-id changes after each of the three lane cursors wraps across cooldown rounds', async () => {
    useCooldownClock()
    database = await openResumeDatabase(661)
    const home = database
    await prepareImageBacklog(home, 460)
    await home.client.execute(
      "UPDATE file_index_progress SET status = 'pending', last_error = NULL WHERE file_id > 260"
    )
    let failed = false
    const harness = createCompletingImageHarness(home, {
      admission: (ids) => {
        if (!failed && ids[0] === 661) {
          failed = true
          throw new Error('progress write failed')
        }
        return ids.length
      }
    })
    service = harness.service
    service.resume('three-lane-cursor-recovery')
    await expect(harness.roundFinished()).rejects.toThrow('progress write failed')
    await settleResume()
    expect(pageBounds(harness.scheduleIndexing)).toEqual([
      [461, 660],
      [261, 460],
      [1, 200],
      [661, 661]
    ])

    // Each lower-id change waits for its own cursor's wrap, not an eager rescan.
    await home.client.batch(
      [
        { sql: 'DELETE FROM file_index_progress WHERE file_id = 461', args: [] },
        {
          sql: "UPDATE file_index_progress SET status = 'pending', progress = 0 WHERE file_id = 261",
          args: []
        },
        {
          sql: "UPDATE file_index_progress SET status = 'skipped', progress = 0, last_error = 'content-indexing-disabled' WHERE file_id = 1",
          args: []
        }
      ],
      'write'
    )
    await insertImageFile(home, 662)
    await vi.advanceTimersByTimeAsync(ENRICHMENT_RESUME_ROUND_COOLDOWN_MS)
    await harness.roundFinished(1)
    await settleResume()
    const beforeWrapPages = scheduledIds(harness.scheduleIndexing).slice(4)
    expect(beforeWrapPages.flat().sort((left, right) => left - right)).toEqual([
      ...Array.from({ length: 60 }, (_, index) => 201 + index),
      661,
      662
    ])
    expect(
      (
        await home.client.execute(`SELECT f.id, p.status FROM files f
        LEFT JOIN file_index_progress p ON p.file_id = f.id WHERE f.id IN (1, 261, 461) ORDER BY f.id`)
      ).rows
    ).toEqual([
      { id: 1, status: 'skipped' },
      { id: 261, status: 'pending' },
      { id: 461, status: null }
    ])

    const beforeHeadRecovery = harness.scheduleIndexing.mock.calls.length
    await vi.advanceTimersByTimeAsync(ENRICHMENT_RESUME_ROUND_COOLDOWN_MS)
    await harness.roundFinished(2)
    await settleResume()
    expect(
      scheduledIds(harness.scheduleIndexing)
        .slice(beforeHeadRecovery)
        .flat()
        .sort((left, right) => left - right)
    ).toEqual([1, 261, 461])
    expect(
      (
        await home.client.execute(
          "SELECT COUNT(*) AS completed FROM file_index_progress WHERE status = 'completed'"
        )
      ).rows
    ).toEqual([{ completed: 662 }])
    expect(service.isActive()).toBe(false)
  })

  it('keeps all three image lanes durable while indexing is disabled and recovers them when enabled', async () => {
    useCooldownClock()
    database = await openResumeDatabase(3)
    const home = database
    await prepareImageBacklog(home, 1)
    await home.client.execute(
      "INSERT INTO file_index_progress (file_id, status, updated_at) VALUES (2, 'pending', 0)"
    )
    let enabled = false
    const harness = createCompletingImageHarness(home, { isEnabled: () => enabled })
    service = harness.service

    service.resume('disabled-image-recovery')
    expect(scheduledIds(harness.scheduleIndexing)).toEqual([])
    expect(
      (
        await home.client.execute(`SELECT f.id, p.status, p.last_error FROM files f
        LEFT JOIN file_index_progress p ON p.file_id = f.id ORDER BY f.id`)
      ).rows
    ).toEqual([
      { id: 1, status: 'skipped', last_error: 'content-indexing-disabled' },
      { id: 2, status: 'pending', last_error: null },
      { id: 3, status: null, last_error: null }
    ])

    enabled = true
    service.resume('enabled-image-recovery')
    await harness.roundFinished()
    expect(scheduledIds(harness.scheduleIndexing)[0]).toEqual([3])
    expect([...harness.admitted].sort((left, right) => left - right)).toEqual([1, 2, 3])
    expect(
      (
        await home.client.execute(
          'SELECT file_id, status, progress FROM file_index_progress ORDER BY file_id'
        )
      ).rows
    ).toEqual([
      { file_id: 1, status: 'completed', progress: 100 },
      { file_id: 2, status: 'completed', progress: 100 },
      { file_id: 3, status: 'completed', progress: 100 }
    ])
  })

  it.each([
    { name: 'media available', imageReady: true, recovered: [1, 2, 7, 8, 9, 10] },
    { name: 'media missing', imageReady: false, recovered: [7] }
  ])(
    'recovers only eligible image skips and pending text with $name, without retrying terminal faults',
    async ({ imageReady, recovered }) => {
      useCooldownClock()
      database = await openResumeDatabase(10)
      const home = database
      const rows = [
        { id: 1, extension: '.png', status: 'skipped', error: 'content-indexing-disabled' },
        { id: 2, extension: '.jpg', status: 'skipped', error: 'content-indexing-disabled' },
        { id: 3, extension: '.png', status: 'skipped', error: 'file-missing' },
        { id: 4, extension: '.png', status: 'skipped', error: 'permission-denied' },
        { id: 5, extension: '.jpg', status: 'failed', error: 'image-model-failed' },
        { id: 6, extension: '.zip', status: 'skipped', error: 'content-indexing-disabled' },
        { id: 7, extension: '.txt', status: 'pending', error: null },
        { id: 8, extension: '.png', status: 'pending', error: 'image-embedding-pending' },
        { id: 9, extension: '.png', status: 'processing', error: null },
        { id: 10, extension: '.png', status: null, error: null }
      ]
      await home.client.batch(
        rows.flatMap((row) => [
          {
            sql: 'UPDATE files SET extension = ?, path = ?, name = ? WHERE id = ?',
            args: [
              row.extension,
              `/scope/IMG_${row.id}${row.extension}`,
              `IMG_${row.id}${row.extension}`,
              row.id
            ]
          },
          ...(row.status === null
            ? []
            : [
                {
                  sql: 'INSERT INTO file_index_progress (file_id, status, last_error, updated_at) VALUES (?, ?, ?, 0)',
                  args: [row.id, row.status, row.error]
                }
              ])
        ]),
        'write'
      )
      const harness = createCompletingImageHarness(home, {
        isImageEmbeddingReady: () => imageReady
      })
      service = harness.service
      service.resume('image-recovery')
      await harness.roundFinished()
      const admitted = scheduledIds(harness.scheduleIndexing)
        .flat()
        .map((id) => `/scope/IMG_${id}${rows[id - 1]!.extension}`)
      expect([...admitted].sort()).toEqual(
        recovered.map((id) => `/scope/IMG_${id}${rows[id - 1]!.extension}`).sort()
      )
      expect(
        (
          await home.client.execute(
            `SELECT f.id AS file_id, p.status, p.last_error FROM files f
              LEFT JOIN file_index_progress p ON p.file_id = f.id ORDER BY f.id`
          )
        ).rows
      ).toEqual(
        rows.map((row) => ({
          file_id: row.id,
          status: recovered.includes(row.id) ? 'completed' : row.status,
          last_error: recovered.includes(row.id) ? null : row.error
        }))
      )
      await Promise.resolve()
      expect(vi.getTimerCount()).toBe(0)
    }
  )
})

describe('FileProviderEnrichmentResumeService text embedding retries', () => {
  let database: ResumeDatabase | undefined

  afterEach(async () => {
    database?.client.close()
    if (database) await rm(database.directory, { recursive: true, force: true })
    database = undefined
  })

  it('retries a text file kept pending by a failed embedding but never enrols finished files still marked pending', async () => {
    useCooldownClock()
    database = await openResumeDatabase(3)
    await database.client.batch(
      [
        "INSERT INTO file_index_progress (file_id, status, progress, updated_at) VALUES (1, 'pending', 100, 0), (2, 'completed', 100, 0), (3, 'completed', 100, 0)",
        "UPDATE files SET embedding_status = 'pending' WHERE id IN (1, 2)"
      ],
      'write'
    )
    const harness = createDatabaseHarness(database, {
      scheduleIndexing: (payload) => ({ accepted: payload.length, deferred: 0 })
    })

    harness.service.resume('text-embedding-retry')
    await settleRounds()

    expect(scheduledIds(harness.scheduleIndexing)).toEqual([[1]])
  })
})
