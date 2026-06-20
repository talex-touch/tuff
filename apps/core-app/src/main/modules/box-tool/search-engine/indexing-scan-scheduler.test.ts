import type { IndexedSource } from '@talex-touch/utils/search'
import type { IndexStoreAdapter } from './indexing-store-adapter'
import { IndexedSourceScanReasons } from '@talex-touch/utils/search'
import { describe, expect, it, vi } from 'vitest'
import { ScanScheduler } from './indexing-scan-scheduler'

function buildSource(scan: IndexedSource['scan']): IndexedSource {
  return {
    descriptor: {
      id: 'test-source',
      kind: 'file',
      displayName: 'Test Source',
      platforms: ['darwin', 'win32', 'linux'],
      priority: 'deferred',
      storage: 'sqlite-index',
      privacy: 'low',
      capabilities: {
        scan: true,
        watch: false,
        reconcile: false,
        clear: true,
        open: true
      }
    },
    getHealth: async () => ({
      status: 'ready',
      permissionState: 'granted',
      itemCount: 0,
      watchState: 'not-supported',
      reconcileState: 'idle'
    }),
    getRoots: async () => [],
    scan
  }
}

describe('ScanScheduler', () => {
  it('guards concurrent scan tasks through the shared run gate', async () => {
    let releaseScan!: () => void
    const blocked = new Promise<void>((resolve) => {
      releaseScan = resolve
    })
    const scan = vi.fn(async function* () {
      await blocked
    })
    const store: IndexStoreAdapter = {
      applyBatch: vi.fn(async () => {}),
      applyDelta: vi.fn(async () => {}),
      clearSource: vi.fn(async () => {})
    }
    const scheduler = new ScanScheduler(store)
    const source = buildSource(scan)

    const first = scheduler.scanSource(source, IndexedSourceScanReasons.Scheduled)

    expect(scheduler.isRunning('test-source')).toBe(true)
    await expect(
      scheduler.scanSource(source, IndexedSourceScanReasons.ManualRebuild)
    ).rejects.toThrow("Indexed source 'test-source' scan is already running")

    releaseScan()
    await expect(first).resolves.toMatchObject({ sourceId: 'test-source' })
    expect(scheduler.isRunning('test-source')).toBe(false)
    expect(scan).toHaveBeenCalledTimes(1)
  })

  it('uses store batch summaries for indexed record counts', async () => {
    const batch = {
      sourceId: 'test-source',
      records: [
        {
          sourceId: 'test-source',
          recordId: 'record-1',
          stableKey: 'record-1',
          kind: 'file' as const,
          title: 'Record 1'
        }
      ],
      done: true
    }
    const scan = vi.fn(async function* () {
      yield batch
    })
    const store: IndexStoreAdapter = {
      applyBatch: vi.fn(async () => ({
        sourceId: 'test-source',
        recordCount: 1,
        indexedItemCount: 0,
        done: true
      })),
      applyDelta: vi.fn(async () => {}),
      clearSource: vi.fn(async () => {})
    }
    const scheduler = new ScanScheduler(store)

    await expect(
      scheduler.scanSource(buildSource(scan), IndexedSourceScanReasons.Scheduled)
    ).resolves.toMatchObject({
      sourceId: 'test-source',
      batches: 1,
      records: 1,
      indexedRecords: 0
    })
  })

  it('classifies store failures separately from source scan failures', async () => {
    const batch = {
      sourceId: 'test-source',
      records: [
        {
          sourceId: 'test-source',
          recordId: 'record-1',
          stableKey: 'record-1',
          kind: 'file' as const,
          title: 'Record 1'
        }
      ],
      done: true
    }
    const scan = vi.fn(async function* () {
      yield batch
    })
    const store: IndexStoreAdapter = {
      applyBatch: vi.fn(async () => {
        throw new Error('sqlite busy')
      }),
      applyDelta: vi.fn(async () => {}),
      clearSource: vi.fn(async () => {})
    }
    const scheduler = new ScanScheduler(store)

    await expect(
      scheduler.scanSourcesWithResult([buildSource(scan)], IndexedSourceScanReasons.Scheduled)
    ).resolves.toMatchObject({
      failedSources: 1,
      errors: [
        {
          sourceId: 'test-source',
          message: 'sqlite busy',
          phase: 'store',
          batches: 0,
          records: 0,
          indexedRecords: 0
        }
      ]
    })
  })

  it('keeps partial counters when a source scan fails after applied batches', async () => {
    const firstBatch = {
      sourceId: 'test-source',
      records: [
        {
          sourceId: 'test-source',
          recordId: 'record-1',
          stableKey: 'record-1',
          kind: 'file' as const,
          title: 'Record 1'
        },
        {
          sourceId: 'test-source',
          recordId: 'record-2',
          stableKey: 'record-2',
          kind: 'file' as const,
          title: 'Record 2'
        }
      ]
    }
    const scan = vi.fn(async function* () {
      yield firstBatch
      throw new Error('scanner crashed')
    })
    const store: IndexStoreAdapter = {
      applyBatch: vi.fn(async () => ({
        sourceId: 'test-source',
        recordCount: 2,
        indexedItemCount: 1,
        done: false
      })),
      applyDelta: vi.fn(async () => {}),
      clearSource: vi.fn(async () => {})
    }
    const scheduler = new ScanScheduler(store)

    await expect(
      scheduler.scanSourcesWithResult([buildSource(scan)], IndexedSourceScanReasons.Scheduled)
    ).resolves.toMatchObject({
      failedSources: 1,
      errors: [
        {
          sourceId: 'test-source',
          message: 'scanner crashed',
          phase: 'source',
          batches: 1,
          records: 2,
          indexedRecords: 1
        }
      ]
    })
  })

  it('applies empty done batches so completion reaches the runtime store boundary', async () => {
    const doneBatch = {
      sourceId: 'test-source',
      records: [],
      done: true
    }
    const scan = vi.fn(async function* () {
      yield doneBatch
    })
    const store: IndexStoreAdapter = {
      applyBatch: vi.fn(async () => {}),
      applyDelta: vi.fn(async () => {}),
      clearSource: vi.fn(async () => {})
    }
    const scheduler = new ScanScheduler(store)

    await expect(
      scheduler.scanSource(buildSource(scan), IndexedSourceScanReasons.Scheduled)
    ).resolves.toMatchObject({
      sourceId: 'test-source',
      batches: 1,
      records: 0,
      indexedRecords: 0
    })

    expect(store.applyBatch).toHaveBeenCalledWith(doneBatch)
  })
})
