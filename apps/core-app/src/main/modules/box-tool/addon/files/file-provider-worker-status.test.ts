import type { WorkerStatusSnapshot } from './workers/worker-status'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FileProviderWorkerStatusService,
  summarizeWorkerStatus
} from './services/file-provider-worker-status-service'

function worker(name: string, state: WorkerStatusSnapshot['state']): WorkerStatusSnapshot {
  return {
    name,
    state,
    threadId: null,
    pending: 0,
    lastTask: null,
    lastError: null,
    uptimeMs: null,
    metrics: null
  }
}

describe('file provider worker status', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('summarizes worker states for dashboard snapshots', () => {
    expect(
      summarizeWorkerStatus([
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

  it('reuses worker status snapshots inside the short cache window', async () => {
    const service = new FileProviderWorkerStatusService()
    const loadWorkers = vi.fn(async () => [worker('scan', 'idle')])

    await service.getSnapshot(loadWorkers)
    await service.getSnapshot(loadWorkers)

    expect(loadWorkers).toHaveBeenCalledTimes(1)
  })

  it('deduplicates concurrent worker status snapshot loads', async () => {
    const service = new FileProviderWorkerStatusService()
    let resolveWorkers!: (workers: WorkerStatusSnapshot[]) => void
    const loadWorkers = vi.fn(
      () =>
        new Promise<WorkerStatusSnapshot[]>((resolve) => {
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

  it('does not cache failed worker status snapshot loads', async () => {
    const service = new FileProviderWorkerStatusService()
    const loadWorkers = vi
      .fn<() => Promise<WorkerStatusSnapshot[]>>()
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

  it('refreshes worker status snapshots after the cache window', async () => {
    const service = new FileProviderWorkerStatusService()
    const loadWorkers = vi
      .fn<() => Promise<WorkerStatusSnapshot[]>>()
      .mockResolvedValueOnce([worker('scan', 'idle')])
      .mockResolvedValueOnce([worker('scan', 'busy')])

    await service.getSnapshot(loadWorkers)
    vi.advanceTimersByTime(1_001)
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
