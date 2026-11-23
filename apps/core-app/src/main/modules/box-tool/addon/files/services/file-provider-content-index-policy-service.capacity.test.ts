import type { Client } from '@libsql/client'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { FILE_CONTENT_CHUNKS_KEY } from '@talex-touch/utils/search'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../../../../db/schema'
import { searchIndexReserveReachedError } from '../../../../../db/search-index-size-cap'
import type { FilePersistenceEntry } from '../../../search-engine/file-index-persistence-repository'
import { SqliteFileIndexPersistenceRepository } from '../../../search-engine/file-index-persistence-repository'
import type { FileIndexSettings } from '../types'
import { DEFAULT_FILE_INDEX_SETTINGS } from '../types'
import { FileProviderContentCapacityService } from './file-provider-content-capacity-service'
import { FileProviderContentIndexPolicyService } from './file-provider-content-index-policy-service'
import { FileProviderIndexRuntimeService } from './file-provider-index-runtime-service'
import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'

const GIB = 1024 ** 3
const services: FileProviderContentIndexPolicyService[] = []
let client: Client | undefined
let directory: string | undefined

function createPolicy(
  enabled = true,
  options: {
    readCapacity?: () => Promise<{ bavail: number; bsize: number }>
    persistSettings?: (patch: Partial<FileIndexSettings>) => Promise<void>
  } = {}
) {
  let settings: FileIndexSettings = {
    ...DEFAULT_FILE_INDEX_SETTINGS,
    contentIndexingEnabled: enabled,
    contentIndexCleanupVersion: 2
  }
  let available = GIB
  let policy!: FileProviderContentIndexPolicyService
  const events: string[] = []
  const clearData = vi.fn(async () => undefined)
  const capacity = new FileProviderContentCapacityService({
    getDirectory: () => '/synthetic/search-index',
    statfs: options.readCapacity ?? (async () => ({ bavail: available, bsize: 1 })),
    onChange: () => policy.handleStorageChange()
  })
  policy = new FileProviderContentIndexPolicyService({
    capacity,
    cleanupVersion: 2,
    getSettings: () => settings,
    updateSettings: async (patch) => {
      await options.persistSettings?.(patch)
      settings = { ...settings, ...patch }
      return settings
    },
    syncSettings: () => undefined,
    getSchedulerSnapshot: () => ({ activeBatches: 0, queuedBatches: 0 }),
    isResumeActive: () => false,
    resume: () => {
      events.push('resume')
    },
    stop: () => {
      events.push('stop')
    },
    cancelPending: () => {
      events.push('cancel')
    },
    clearData
  })
  services.push(policy)
  return {
    policy,
    capacity,
    events,
    clearData,
    setAvailable: (bytes: number) => {
      available = bytes
    },
    getSettings: () => settings
  }
}

afterEach(async () => {
  for (const service of services.splice(0)) service.dispose()
  client?.close()
  client = undefined
  if (directory) await rm(directory, { recursive: true, force: true })
  directory = undefined
  vi.clearAllTimers()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('content capacity policy transitions', () => {
  it('refreshes actual low-space evidence while disabled without polling, admitting work, or clearing data', async () => {
    vi.useFakeTimers()
    const { policy, events, clearData, getSettings } = createPolicy(false)
    await expect(policy.refreshSnapshot()).resolves.toMatchObject({
      contentIndexingEnabled: false,
      state: 'disabled',
      storage: { status: 'low-space', availableBytes: GIB, requiredBytes: 3 * GIB }
    })
    expect(getSettings().contentIndexingEnabled).toBe(false)
    expect(events).toEqual([])
    expect(clearData).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not accept or persist an enable request until the writer-volume check completes', async () => {
    const read = Promise.withResolvers<{ bavail: number; bsize: number }>()
    const started = Promise.withResolvers<void>()
    let persisted = false
    const { policy, getSettings, events } = createPolicy(false, {
      readCapacity: () => {
        started.resolve()
        return read.promise
      },
      persistSettings: async () => {
        persisted = true
      }
    })
    const enabling = policy.update(true)
    await started.promise
    expect(persisted).toBe(false)
    expect(getSettings().contentIndexingEnabled).toBe(false)
    expect(events).toEqual([])
    read.resolve({ bavail: GIB, bsize: 1 })
    await expect(enabling).resolves.toMatchObject({ contentIndexingEnabled: true, state: 'paused' })
    expect(persisted).toBe(true)
    expect(events).toEqual(['stop', 'cancel'])
  })

  it('reports a safe refusal and retains prior opt-out when the settings write itself hits disk full', async () => {
    vi.useFakeTimers()
    const secret = '/synthetic/private/settings-file'
    const { policy, events, clearData, getSettings } = createPolicy(false, {
      persistSettings: async () => {
        throw new Error(`failed write ${secret}: private-token`, {
          cause: Object.assign(new Error('database full'), { code: 'SQLITE_FULL' })
        })
      }
    })
    await expect(policy.update(true)).rejects.toMatchObject({
      message: 'FILE_CONTENT_STORAGE_PAUSED',
      code: 'FILE_CONTENT_STORAGE_PAUSED'
    })
    expect(policy.getSnapshot()).toMatchObject({
      contentIndexingEnabled: false,
      state: 'disabled',
      storage: { status: 'low-space' }
    })
    expect(getSettings().contentIndexingEnabled).toBe(false)
    expect(events).toEqual([])
    expect(clearData).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    expect(JSON.stringify(policy.getSnapshot())).not.toContain(secret)
    expect(JSON.stringify(policy.getSnapshot())).not.toContain('private-token')
  })

  it.each(['startup', 'enable'] as const)(
    '%s keeps opt-in intent but does not schedule or clear data when the device is full',
    async (action) => {
      const { policy, events, clearData, getSettings } = createPolicy(action === 'startup')
      if (action === 'startup') await policy.reconcileAtStartup()
      else await policy.update(true)
      expect(policy.getSnapshot()).toMatchObject({
        contentIndexingEnabled: true,
        state: 'paused',
        storage: { status: 'low-space' }
      })
      expect(getSettings().contentIndexingEnabled).toBe(true)
      expect(policy.isEnabled()).toBe(true)
      expect(policy.isAdmissionEnabled()).toBe(false)
      expect(events).toEqual(['stop', 'cancel'])
      expect(clearData).not.toHaveBeenCalled()
    }
  )

  it('admits exactly one resume after adequate capacity and does not oscillate at two GiB', async () => {
    const { policy, events, setAvailable } = createPolicy()
    await policy.reconcileAtStartup()
    setAvailable(3 * GIB - 1)
    await expect(policy.checkAdmission(true)).resolves.toBe(false)
    setAvailable(3 * GIB)
    await expect(policy.checkAdmission(true)).resolves.toBe(true)
    await expect(policy.checkAdmission(true)).resolves.toBe(true)
    setAvailable(2 * GIB)
    await expect(policy.checkAdmission(true)).resolves.toBe(true)
    expect(events).toEqual(['stop', 'cancel', 'resume'])
  })

  it('does not resume a user-disabled profile when capacity recovers', async () => {
    const { policy, capacity, events, clearData, setAvailable } = createPolicy()
    await policy.reconcileAtStartup()
    await policy.update(false)
    setAvailable(4 * GIB)
    await capacity.check(true)
    expect(policy.getSnapshot().state).toBe('disabled')
    expect(policy.isAdmissionEnabled()).toBe(false)
    expect(events.filter((event) => event === 'resume')).toEqual([])
    expect(clearData).toHaveBeenCalledTimes(1)
  })

  it('re-enabling a formerly paused profile admits only one resume', async () => {
    const { policy, events, setAvailable } = createPolicy()
    await policy.reconcileAtStartup()
    await policy.update(false)
    setAvailable(4 * GIB)
    await policy.update(true)
    expect(policy.isAdmissionEnabled()).toBe(true)
    expect(events.filter((event) => event === 'resume')).toEqual(['resume'])
  })

  it('turning content off leaves no capacity polling channel that can restart it', async () => {
    vi.useFakeTimers()
    const { policy, events, setAvailable } = createPolicy()
    await policy.reconcileAtStartup()
    await policy.update(false)
    const afterOff = [...events]
    setAvailable(4 * GIB)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(events).toEqual(afterOff)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stays paused with index-full across 30s polling ticks on plentiful disk and resumes once index space is freed', async () => {
    vi.useFakeTimers()
    const { policy, events, setAvailable } = createPolicy()
    setAvailable(10 * GIB)
    await policy.reconcileAtStartup()
    expect(events).toEqual(['resume'])

    expect(policy.recordStorageFailure(searchIndexReserveReachedError())).toBe(true)
    expect(policy.getSnapshot()).toMatchObject({
      contentIndexingEnabled: true,
      state: 'paused',
      storage: { status: 'index-full' }
    })
    expect(events).toEqual(['resume', 'stop', 'cancel'])

    await vi.advanceTimersByTimeAsync(120_000)
    expect(policy.getSnapshot()).toMatchObject({
      contentIndexingEnabled: true,
      state: 'paused',
      storage: { status: 'index-full' }
    })
    expect(events).toEqual(['resume', 'stop', 'cancel'])

    await expect(policy.notifyIndexSpaceFreed()).resolves.toBe(true)
    expect(policy.getSnapshot()).toMatchObject({
      contentIndexingEnabled: true,
      state: 'idle',
      storage: { status: 'ready' }
    })
    expect(events).toEqual(['resume', 'stop', 'cancel', 'resume'])
  })

  it('turning content off clears an index-full pause without leaving timers and allows re-enabling cleanly', async () => {
    vi.useFakeTimers()
    const { policy, events, setAvailable } = createPolicy()
    setAvailable(10 * GIB)
    await policy.reconcileAtStartup()
    expect(policy.recordStorageFailure(searchIndexReserveReachedError())).toBe(true)
    expect(policy.getSnapshot().storage?.status).toBe('index-full')

    await policy.update(false)
    expect(vi.getTimerCount()).toBe(0)

    const reenabled = await policy.update(true)
    expect(reenabled).toMatchObject({
      contentIndexingEnabled: true,
      state: 'idle',
      storage: { status: 'ready' }
    })
    expect(events.filter((event) => event === 'resume')).toHaveLength(2)
  })

  it('shutdown leaves no capacity polling timers or recovery callbacks', async () => {
    vi.useFakeTimers()
    const { policy, events, setAvailable } = createPolicy()
    await policy.reconcileAtStartup()
    policy.dispose()
    const stoppedEvents = [...events]
    setAvailable(4 * GIB)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(events).toEqual(stoppedEvents)
    expect(vi.getTimerCount()).toBe(0)
    await expect(policy.checkAdmission(true)).resolves.toBe(false)
  })

  it('rejects a late body result without completing pending progress or touching existing body, locators, or vectors', async () => {
    directory = await mkdtemp('/tmp/content-capacity-policy-')
    client = createClient({ url: `file:${join(directory, 'index.sqlite')}` })
    await client.execute('PRAGMA page_size = 4096')
    await client.execute('PRAGMA max_page_count = 128')
    await client.execute(`CREATE TABLE files (
      id INTEGER PRIMARY KEY, path TEXT NOT NULL, name TEXT NOT NULL,
      display_name TEXT, extension TEXT, size INTEGER, mtime INTEGER NOT NULL,
      ctime INTEGER NOT NULL, last_indexed_at INTEGER NOT NULL DEFAULT 0,
      is_dir INTEGER NOT NULL DEFAULT 0, type TEXT NOT NULL DEFAULT 'file',
      content TEXT, embedding_status TEXT NOT NULL
    )`)
    await client.execute(`CREATE TABLE file_index_progress (
      file_id INTEGER PRIMARY KEY, status TEXT NOT NULL, progress INTEGER NOT NULL,
      processed_bytes INTEGER, total_bytes INTEGER, last_error TEXT,
      started_at INTEGER, updated_at INTEGER NOT NULL
    )`)
    await client.execute(
      'CREATE TABLE file_extensions (id INTEGER PRIMARY KEY, file_id INTEGER NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL)'
    )
    await client.execute(`CREATE TABLE embeddings (
      id INTEGER PRIMARY KEY, source_id TEXT NOT NULL, source_type TEXT NOT NULL,
      embedding TEXT NOT NULL, model TEXT NOT NULL, content_hash TEXT, created_at INTEGER NOT NULL
    )`)
    await client.execute(
      "INSERT INTO files (id, path, name, size, mtime, ctime, content, embedding_status) VALUES (7, '/synthetic/keep.txt', 'keep.txt', 16, 0, 0, 'original body', 'completed')"
    )
    await client.execute(
      "INSERT INTO file_index_progress VALUES (7, 'pending', 0, 0, 16, NULL, NULL, 0)"
    )
    await client.execute({
      sql: 'INSERT INTO file_extensions VALUES (1, 7, ?, ?)',
      args: [FILE_CONTENT_CHUNKS_KEY, '[{"text":"original body","pageNumber":4}]']
    })
    await client.execute(
      "INSERT INTO embeddings VALUES (1, '7', 'file', '[1,0]', 'original-model', 'original-hash', 0)"
    )
    const repository = new SqliteFileIndexPersistenceRepository(drizzle(client, { schema }))
    const { policy, clearData, setAvailable } = createPolicy()
    await policy.reconcileAtStartup()
    const replacement: FilePersistenceEntry = {
      fileId: 7,
      fileUpdate: {
        content: 'replacement body',
        contentHash: 'replacement-hash',
        embeddingStatus: 'completed',
        chunks: [{ text: 'replacement body' }],
        embeddings: [{ vector: [0, 1], model: 'replacement-model' }]
      },
      progress: {
        status: 'completed',
        progress: 100,
        processedBytes: 16,
        totalBytes: 16,
        lastError: null,
        startedAt: null,
        updatedAt: '2026-10-11T00:00:00.000Z'
      }
    }
    const persistLateResult = async () =>
      repository.persistEntries(policy.filterPersistEntries([replacement]))
    await expect(persistLateResult()).rejects.toThrow('FILE_CONTENT_STORAGE_PAUSED')
    expect((await client.execute('SELECT content, embedding_status FROM files')).rows).toEqual([
      { content: 'original body', embedding_status: 'completed' }
    ])
    expect((await client.execute('SELECT status, progress FROM file_index_progress')).rows).toEqual(
      [{ status: 'pending', progress: 0 }]
    )
    expect((await client.execute('SELECT value FROM file_extensions')).rows).toEqual([
      { value: '[{"text":"original body","pageNumber":4}]' }
    ])
    expect(
      (await client.execute('SELECT embedding, model, content_hash FROM embeddings')).rows
    ).toEqual([{ embedding: '[1,0]', model: 'original-model', content_hash: 'original-hash' }])
    expect(clearData).not.toHaveBeenCalled()

    // A healthy first commit is still not a completed file: space can vanish before
    // publication. The real repository must leave durable pending progress, without
    // trying to repair a completed row on an already-full device.
    setAvailable(4 * GIB)
    await policy.checkAdmission(true)
    const workerResult: IndexWorkerFileResult = {
      type: 'file',
      taskId: 'capacity-file-7',
      fileId: 7,
      progress: {
        status: 'completed',
        progress: 100,
        processedBytes: 16,
        totalBytes: 16,
        lastError: null,
        updatedAt: '2026-10-11T00:00:00.000Z'
      },
      fileUpdate: {
        content: 'replacement body',
        embeddingStatus: 'pending',
        contentHash: 'replacement-hash',
        chunks: [{ text: 'replacement body' }]
      },
      indexItem: {
        itemId: '7',
        providerId: 'file-provider',
        type: 'file',
        name: 'keep.txt',
        content: 'replacement body'
      }
    }
    const published = vi.fn(async () => 1)
    const embedded = vi.fn(async () => undefined)
    let writes = 0
    const pending = new Map([[7, workerResult]])
    const inflight = new Map<number, IndexWorkerFileResult>()
    const runtime = new FileProviderIndexRuntimeService({
      resumeDeferredFlush: async (operation, signal) => {
        signal.throwIfAborted()
        await operation('capacity-regression-lease')
      },
      prepareDeferredEntries: async () => true,
      flushBatchScheduler: { currentSize: 1, recordDuration: () => undefined },
      getDbUtils: () => repository,
      getSearchIndex: () => repository,
      getPendingResults: () => pending,
      getInflightResults: () => inflight,
      ensureSearchIndexWorkerReady: async () => true,
      getSearchIndexWorker: () => ({
        persistEntries: async (entries) => {
          writes++
          const summary = await repository.persistEntries(entries)
          setAvailable(GIB)
          return summary
        }
      }),
      buildPersistEntries: (entries) => policy.buildPersistEntries(entries),
      publishRecords: published,
      indexEmbeddings: embedded,
      checkContentCapacity: () => policy.checkAdmission(true),
      isContentAdmissionEnabled: () => policy.isAdmissionEnabled(),
      recordStorageFailure: (error) => policy.recordStorageFailure(error),
      logDebug: () => undefined,
      logWarn: () => undefined
    })
    try {
      await runtime.flush()
      expect(writes).toBe(1)
      expect(published).not.toHaveBeenCalled()
      expect(embedded).not.toHaveBeenCalled()
      expect((await client.execute('SELECT status FROM file_index_progress')).rows).toEqual([
        { status: 'pending' }
      ])
      expect((await client.execute('SELECT content FROM files')).rows).toEqual([
        { content: 'replacement body' }
      ])
    } finally {
      runtime.dispose()
    }
  })
})
