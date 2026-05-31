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
})
