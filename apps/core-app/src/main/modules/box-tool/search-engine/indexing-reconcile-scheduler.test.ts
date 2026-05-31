import type { IndexedSource, IndexedSourceReconcileResult } from '@talex-touch/utils/search'
import { IndexedSourceReconcileReasons } from '@talex-touch/utils/search'
import { describe, expect, it, vi } from 'vitest'
import { ReconcileEngine } from './indexing-reconcile-engine'
import { ReconcileScheduler } from './indexing-reconcile-scheduler'

function buildSource(reconcile: IndexedSource['reconcile']): IndexedSource {
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
        scan: false,
        watch: false,
        reconcile: true,
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
    async *scan() {},
    reconcile
  }
}

describe('ReconcileScheduler', () => {
  it('guards concurrent reconcile tasks through the shared run gate', async () => {
    let releaseReconcile!: () => void
    const blocked = new Promise<void>((resolve) => {
      releaseReconcile = resolve
    })
    const result: IndexedSourceReconcileResult = {
      sourceId: 'test-source',
      added: 0,
      changed: 1,
      deleted: 0,
      skipped: 0,
      errors: 0,
      startedAt: 1700000000000,
      completedAt: 1700000000100
    }
    const reconcile = vi.fn(async () => {
      await blocked
      return result
    })
    const engine = new ReconcileEngine()
    const scheduler = new ReconcileScheduler(engine)
    const source = buildSource(reconcile)

    const first = scheduler.reconcileSource(source, {
      reason: IndexedSourceReconcileReasons.Scheduled
    })

    expect(scheduler.isRunning('test-source')).toBe(true)
    await expect(
      scheduler.reconcileSource(source, {
        reason: IndexedSourceReconcileReasons.ManualRepair
      })
    ).rejects.toThrow("Indexed source 'test-source' reconcile is already running")

    releaseReconcile()
    await expect(first).resolves.toMatchObject({ result })
    expect(scheduler.isRunning('test-source')).toBe(false)
    expect(reconcile).toHaveBeenCalledTimes(1)
  })
})
