import type { Mock } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../../../../db/schema'
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

interface PagedReadDb {
  getFileIndexReadDb: () => unknown
  queryCount: () => number
}

/**
 * A paged stand-in for the split-aware file-index read home. Each `limit()` advances to the next
 * supplied page, so a resume pass that keeps re-querying the same suffix observes the same rows —
 * exactly what the durable "do not skip an unadmitted suffix" contract depends on.
 */
function createPagedReadDb(pages: Array<Array<Record<string, unknown>>>): PagedReadDb {
  let queryCount = 0
  const chain = {
    select: () => chain,
    from: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => {
      queryCount += 1
      return Promise.resolve(pages.shift() ?? [])
    }
  }
  return {
    getFileIndexReadDb: () => chain,
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
  waitForSearchIndexDrain?: (callIndex: number, leaseId: string) => Promise<void>
  withMutationLease?: <T>(operation: (leaseId: string) => Promise<T>) => Promise<T>
}) {
  const readDb = createPagedReadDb(options.pages)
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
    getDbUtils: () => ({ getFileIndexReadDb: readDb.getFileIndexReadDb }),
    isSearchIndexAvailable: () => true,
    isShuttingDown: () => options.isShuttingDown ?? false,
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
    queryCount: readDb.queryCount,
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
    expect(harness.queryCount()).toBe(3)
  })

  it('stops without spinning when the scheduler admits and defers nothing', async () => {
    const harness = createHarness({
      pages: [[fileRow(1)], [fileRow(1)], [fileRow(1)]],
      scheduleIndexing: () => ({ accepted: 0, deferred: 0 })
    })

    harness.service.resume('closed')
    await settleResume()

    expect(harness.scheduleIndexing).toHaveBeenCalledTimes(1)
    expect(harness.queryCount()).toBe(1)
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
  db: ReturnType<typeof drizzle<typeof schema>>
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
  return { client, directory, db: drizzle(client, { schema }) }
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
    getDbUtils: () => ({ getFileIndexReadDb: () => database.db }),
    isSearchIndexAvailable: () => true,
    isShuttingDown: () => false,
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
    expect(harness.queryCount()).toBe(1)
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
