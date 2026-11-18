import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  NativeArenaIndexStats,
  NativeFileArenaHandle
} from '@talex-touch/tuff-native/file-index'
import {
  NATIVE_ARENA_SNAPSHOT_FILE,
  NATIVE_FSEVENTS_CHECKPOINT_FILE,
  NativeIndexStore,
  buildWatchRootsKey
} from './native-index-store'

describe('native-index-store', () => {
  let tmpDir = ''

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-native-store-'))
  })

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined)
    }
  })

  it('wipes incompatible or corrupt snapshot files cleanly so startup falls back to bulk scan', async () => {
    const store = new NativeIndexStore({
      getStorageDir: () => tmpDir,
      logInfo: vi.fn(),
      logDebug: vi.fn(),
      logWarn: vi.fn()
    })

    const snapshotPath = path.join(tmpDir, NATIVE_ARENA_SNAPSHOT_FILE)
    const checkpointPath = path.join(tmpDir, NATIVE_FSEVENTS_CHECKPOINT_FILE)
    await fs.writeFile(snapshotPath, 'TUFFIDX2-stale-magic')
    await fs.writeFile(
      checkpointPath,
      JSON.stringify({
        version: 1,
        watchRootsKey: buildWatchRootsKey(['/watch']),
        volumeUuid: 'vol-1',
        lastEventId: '42',
        updatedAt: Date.now()
      })
    )

    const fakeArena = {
      loadSnapshot: vi.fn(() => {
        throw new Error('Invalid TUFFIDX3 snapshot header')
      })
    } as unknown as NativeFileArenaHandle

    const result = await store.restore(fakeArena, ['/watch'])
    expect(result.restored).toBe(false)
    expect(result.wipedReason).toBe('snapshot-incompatible-or-corrupt')
    await expect(fs.stat(snapshotPath)).rejects.toThrow()
    await expect(fs.stat(checkpointPath)).rejects.toThrow()
  })

  it('persists and restores valid snapshot + checkpoint atomically even with overlapping saves', async () => {
    const store = new NativeIndexStore({
      getStorageDir: () => tmpDir,
      logInfo: vi.fn(),
      logDebug: vi.fn(),
      logWarn: vi.fn()
    })

    const stats: NativeArenaIndexStats = {
      fileCount: 3,
      dirCount: 1,
      activeCount: 4,
      tombstoneCount: 0,
      arenaBytes: 256,
      lastScanMs: 2,
      backend: 'snapshot'
    }

    const arena = {
      saveSnapshot: vi.fn((targetPath: string) => {
        // Synchronous write mirroring N-API behavior.
        require('node:fs').writeFileSync(targetPath, 'TUFFIDX3-mock-data')
        return 18
      }),
      loadSnapshot: vi.fn(() => stats)
    } as unknown as NativeFileArenaHandle

    const checkpoint = {
      version: 1 as const,
      watchRootsKey: buildWatchRootsKey(['/watch']),
      volumeUuid: 'vol-1',
      lastEventId: '99',
      updatedAt: 1_700_000_000_000
    }

    const saves = await Promise.all([
      store.persist(arena, checkpoint),
      store.persist(arena, checkpoint),
      store.persist(arena, checkpoint)
    ])
    expect(saves).toEqual([true, true, true])

    const restored = await store.restore(arena, ['/watch'])
    expect(restored.restored).toBe(true)
    expect(restored.checkpoint?.lastEventId).toBe('99')
    expect(restored.stats?.fileCount).toBe(3)
  })
})
