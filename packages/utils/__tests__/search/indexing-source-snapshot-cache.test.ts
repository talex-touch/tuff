import { describe, expect, it, vi } from 'vitest'
import { IndexedSourceSnapshotCacheService } from '../../search'

describe('IndexedSourceSnapshotCacheService', () => {
  it('reuses snapshots inside the cache window', async () => {
    let now = 100
    const service = new IndexedSourceSnapshotCacheService<{ value: number }>({ now: () => now })
    const loadSnapshot = vi.fn(() => ({ value: 1 }))

    await expect(service.getSnapshot(loadSnapshot)).resolves.toEqual({ value: 1 })
    now += 499
    await expect(service.getSnapshot(loadSnapshot)).resolves.toEqual({ value: 1 })

    expect(loadSnapshot).toHaveBeenCalledTimes(1)
  })

  it('deduplicates concurrent snapshot loads', async () => {
    const service = new IndexedSourceSnapshotCacheService<{ value: number }>()
    let resolveSnapshot!: (snapshot: { value: number }) => void
    const loadSnapshot = vi.fn(
      () =>
        new Promise<{ value: number }>((resolve) => {
          resolveSnapshot = resolve
        })
    )

    const first = service.getSnapshot(loadSnapshot)
    const second = service.getSnapshot(loadSnapshot)

    expect(loadSnapshot).toHaveBeenCalledTimes(1)
    resolveSnapshot({ value: 2 })

    await expect(Promise.all([first, second])).resolves.toEqual([{ value: 2 }, { value: 2 }])
  })

  it('does not cache failed loads', async () => {
    const service = new IndexedSourceSnapshotCacheService<{ value: number }>()
    const loadSnapshot = vi
      .fn<() => { value: number } | Promise<{ value: number }>>()
      .mockRejectedValueOnce(new Error('snapshot failed'))
      .mockReturnValueOnce({ value: 3 })

    await expect(service.getSnapshot(loadSnapshot)).rejects.toThrow('snapshot failed')
    await expect(service.getSnapshot(loadSnapshot)).resolves.toEqual({ value: 3 })

    expect(loadSnapshot).toHaveBeenCalledTimes(2)
  })

  it('refreshes snapshots after the cache window and supports clear', async () => {
    let now = 100
    const service = new IndexedSourceSnapshotCacheService<{ value: number }>({ now: () => now })
    const loadSnapshot = vi.fn<() => { value: number }>()
      .mockReturnValueOnce({ value: 1 })
      .mockReturnValueOnce({ value: 2 })
      .mockReturnValueOnce({ value: 3 })

    await expect(service.getSnapshot(loadSnapshot)).resolves.toEqual({ value: 1 })
    now += 501
    await expect(service.getSnapshot(loadSnapshot)).resolves.toEqual({ value: 2 })
    service.clear()
    await expect(service.getSnapshot(loadSnapshot)).resolves.toEqual({ value: 3 })

    expect(loadSnapshot).toHaveBeenCalledTimes(3)
  })
})
