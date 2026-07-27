import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StorageCache } from './storage-cache'
import { StorageLRUManager } from './storage-lru-manager'

describe('StorageLRUManager', () => {
  let cache: StorageCache

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-26T00:00:00.000Z'))
    cache = new StorageCache()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function seedIdle(name: string, dirty = false): void {
    cache.setWithVersion(name, { value: 1 }, 1)
    if (dirty) cache.markDirty(name)
    vi.advanceTimersByTime(61_000)
  }

  it('evicts an idle clean config', async () => {
    seedIdle('cold.ini')
    const manager = new StorageLRUManager(
      cache,
      vi.fn(async () => {}),
      60_000
    )

    await expect(manager.manualEvict()).resolves.toEqual(['cold.ini'])
    expect(cache.has('cold.ini')).toBe(false)
  })

  it('keeps a dirty config when an external read lands during its flush', async () => {
    seedIdle('active.ini', true)
    let releaseFlush!: () => void
    const flush = new Promise<void>((resolve) => {
      releaseFlush = resolve
    })
    const manager = new StorageLRUManager(
      cache,
      vi.fn(async (name) => {
        expect(cache.peekRaw(name)).toEqual({ value: 1 })
        await flush
        cache.clearDirty(name)
      }),
      60_000
    )

    const eviction = manager.manualEvict()
    expect(cache.get('active.ini')).toEqual({ value: 1 })
    releaseFlush()

    await expect(eviction).resolves.toEqual([])
    expect(cache.has('active.ini')).toBe(true)
  })

  it('keeps a config when it changes during its flush', async () => {
    seedIdle('changed.ini', true)
    const manager = new StorageLRUManager(
      cache,
      vi.fn(async (name) => {
        cache.clearDirty(name)
        cache.set(name, { value: 2 })
      }),
      60_000
    )

    await expect(manager.manualEvict()).resolves.toEqual([])
    expect(cache.getVersion('changed.ini')).toBe(2)
    expect(cache.isDirty('changed.ini')).toBe(true)
  })

  it('never evicts hot configs through manual or force paths', async () => {
    seedIdle('app-setting.ini', true)
    const onEvict = vi.fn(async () => {})
    const manager = new StorageLRUManager(
      cache,
      onEvict,
      60_000,
      30_000,
      new Set(['app-setting.ini'])
    )

    await expect(manager.manualEvict()).resolves.toEqual([])
    await manager.forceEvict('app-setting.ini')

    expect(cache.has('app-setting.ini')).toBe(true)
    expect(onEvict).not.toHaveBeenCalled()
  })

  it('force evicts a non-hot config without requiring it to be idle', async () => {
    cache.setWithVersion('forced.ini', { value: 1 }, 1)
    const manager = new StorageLRUManager(
      cache,
      vi.fn(async () => {}),
      60_000
    )

    await manager.forceEvict('forced.ini')

    expect(cache.has('forced.ini')).toBe(false)
  })
})
