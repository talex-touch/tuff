import { describe, expect, it, vi } from 'vitest'
import {
  IndexedWorkerStatusSnapshotService,
  summarizeIndexedWorkerStatus,
  type IndexedWorkerState,
  type IndexedWorkerStatusLike
} from '../../search'

interface TestWorker extends IndexedWorkerStatusLike {
  name: string
}

function worker(name: string, state: IndexedWorkerState): TestWorker {
  return { name, state }
}

describe('IndexedWorkerStatusSnapshotService', () => {
  it('summarizes worker states', () => {
    expect(
      summarizeIndexedWorkerStatus([
        worker('scan', 'idle'),
        worker('index', 'busy'),
        worker('icon', 'offline'),
        worker('thumbnail', 'idle')
      ])
    ).toEqual({
      total: 4,
      busy: 1,
      idle: 2,
      offline: 1
    })
  })

  it('reuses snapshots inside the cache window', async () => {
    let now = 100
    const service = new IndexedWorkerStatusSnapshotService<TestWorker>({ now: () => now })
    const loadWorkers = vi.fn(async () => [worker('scan', 'idle')])

    await service.getSnapshot(loadWorkers)
    now += 999
    await service.getSnapshot(loadWorkers)

    expect(loadWorkers).toHaveBeenCalledTimes(1)
  })

  it('deduplicates concurrent snapshot loads', async () => {
    const service = new IndexedWorkerStatusSnapshotService<TestWorker>()
    let resolveWorkers!: (workers: TestWorker[]) => void
    const loadWorkers = vi.fn(
      () =>
        new Promise<TestWorker[]>((resolve) => {
          resolveWorkers = resolve
        })
    )

    const first = service.getSnapshot(loadWorkers)
    const second = service.getSnapshot(loadWorkers)

    expect(loadWorkers).toHaveBeenCalledTimes(1)
    resolveWorkers([worker('scan', 'busy')])

    await expect(Promise.all([first, second])).resolves.toEqual([
      {
        summary: { total: 1, busy: 1, idle: 0, offline: 0 },
        workers: [worker('scan', 'busy')]
      },
      {
        summary: { total: 1, busy: 1, idle: 0, offline: 0 },
        workers: [worker('scan', 'busy')]
      }
    ])
  })

  it('does not cache failed snapshot loads', async () => {
    const service = new IndexedWorkerStatusSnapshotService<TestWorker>()
    const loadWorkers = vi
      .fn<() => Promise<TestWorker[]>>()
      .mockRejectedValueOnce(new Error('metrics unavailable'))
      .mockResolvedValueOnce([worker('scan', 'idle')])

    await expect(service.getSnapshot(loadWorkers)).rejects.toThrow('metrics unavailable')
    const next = await service.getSnapshot(loadWorkers)

    expect(loadWorkers).toHaveBeenCalledTimes(2)
    expect(next.summary).toEqual({
      total: 1,
      busy: 0,
      idle: 1,
      offline: 0
    })
  })

  it('refreshes snapshots after the cache window', async () => {
    let now = 100
    const service = new IndexedWorkerStatusSnapshotService<TestWorker>({ now: () => now })
    const loadWorkers = vi
      .fn<() => Promise<TestWorker[]>>()
      .mockResolvedValueOnce([worker('scan', 'idle')])
      .mockResolvedValueOnce([worker('scan', 'busy')])

    await service.getSnapshot(loadWorkers)
    now += 1_001
    const next = await service.getSnapshot(loadWorkers)

    expect(loadWorkers).toHaveBeenCalledTimes(2)
    expect(next.summary).toEqual({
      total: 1,
      busy: 1,
      idle: 0,
      offline: 0
    })
  })
})
