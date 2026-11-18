import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  NativeArenaIndexStats,
  NativeFileArenaHandle
} from '@talex-touch/tuff-native/file-index'

export const NATIVE_ARENA_SNAPSHOT_FILE = 'file-index.arena.bin'
export const NATIVE_FSEVENTS_CHECKPOINT_FILE = 'file-index.checkpoint.json'

export interface NativeFsCheckpointState {
  version: 1
  watchRootsKey: string
  volumeUuid: string | null
  lastEventId: string | null
  updatedAt: number
}

export interface NativeIndexStoreDeps {
  getStorageDir: () => string | null
  logInfo: (message: string, meta?: Record<string, unknown>) => void
  logDebug: (message: string, meta?: Record<string, unknown>) => void
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
}

export interface NativeIndexRestoreResult {
  restored: boolean
  checkpoint: NativeFsCheckpointState | null
  stats: NativeArenaIndexStats | null
  wipedReason?: string
}

export function buildWatchRootsKey(roots: readonly string[]): string {
  return [...roots].sort().join('|')
}

function parseValidatedCheckpoint(
  rawJson: string,
  expectedRootsKey: string
): NativeFsCheckpointState | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }
  const record = parsed as Record<string, unknown>
  if (record.version !== 1 || record.watchRootsKey !== expectedRootsKey) {
    return null
  }
  const volumeUuid =
    typeof record.volumeUuid === 'string' && record.volumeUuid.length > 0
      ? record.volumeUuid
      : record.volumeUuid === null || record.volumeUuid === undefined
        ? null
        : undefined
  if (volumeUuid === undefined) return null

  const lastEventId =
    typeof record.lastEventId === 'string' && record.lastEventId.length > 0
      ? record.lastEventId
      : record.lastEventId === null || record.lastEventId === undefined
        ? null
        : undefined
  if (lastEventId === undefined) return null

  const updatedAt =
    typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : Date.now()

  return {
    version: 1,
    watchRootsKey: expectedRootsKey,
    volumeUuid,
    lastEventId,
    updatedAt
  }
}

/**
 * Handles atomic binary snapshot + JSON FSEvents checkpoint persistence and recovery.
 * Incompatible/corrupt snapshots (such as stale `TUFFIDX2` magic after a format upgrade)
 * are wiped cleanly so startup falls back to a fresh bulk scan.
 */
export class NativeIndexStore {
  private persistChain: Promise<void> = Promise.resolve()

  constructor(private readonly deps: NativeIndexStoreDeps) {}

  public getPaths(): { snapshotPath: string; checkpointPath: string } | null {
    const dir = this.deps.getStorageDir()
    if (!dir) return null
    return {
      snapshotPath: path.join(dir, NATIVE_ARENA_SNAPSHOT_FILE),
      checkpointPath: path.join(dir, NATIVE_FSEVENTS_CHECKPOINT_FILE)
    }
  }

  public async restore(
    arena: NativeFileArenaHandle,
    roots: readonly string[]
  ): Promise<NativeIndexRestoreResult> {
    const paths = this.getPaths()
    if (!paths) {
      return { restored: false, checkpoint: null, stats: null }
    }

    const expectedRootsKey = buildWatchRootsKey(roots)
    let rawCheckpoint: string
    try {
      rawCheckpoint = await fs.readFile(paths.checkpointPath, 'utf8')
    } catch {
      await this.wipe()
      return { restored: false, checkpoint: null, stats: null, wipedReason: 'checkpoint-missing' }
    }

    const checkpoint = parseValidatedCheckpoint(rawCheckpoint, expectedRootsKey)
    if (!checkpoint) {
      await this.wipe()
      return {
        restored: false,
        checkpoint: null,
        stats: null,
        wipedReason: 'checkpoint-invalid-or-roots-changed'
      }
    }

    try {
      const stat = await fs.stat(paths.snapshotPath)
      if (!stat.isFile() || stat.size <= 0) {
        await this.wipe()
        return { restored: false, checkpoint: null, stats: null, wipedReason: 'snapshot-empty' }
      }
      const stats = arena.loadSnapshot(paths.snapshotPath)
      this.deps.logInfo('Loaded native file index snapshot', {
        files: stats.fileCount,
        dirs: stats.dirCount,
        arenaBytes: stats.arenaBytes
      })
      return { restored: true, checkpoint, stats }
    } catch (error) {
      this.deps.logDebug(
        'Incompatible or corrupt native file index snapshot; wiping for clean scan',
        {
          error: error instanceof Error ? error.message : String(error)
        }
      )
      await this.wipe()
      return {
        restored: false,
        checkpoint: null,
        stats: null,
        wipedReason: 'snapshot-incompatible-or-corrupt'
      }
    }
  }

  public async persist(
    arena: NativeFileArenaHandle,
    checkpoint: NativeFsCheckpointState | null
  ): Promise<boolean> {
    const paths = this.getPaths()
    if (!paths) return false

    const next = this.persistChain.then(async () => {
      const tempCheckpoint = `${paths.checkpointPath}.tmp`
      try {
        await fs.mkdir(path.dirname(paths.snapshotPath), { recursive: true })
        arena.saveSnapshot(paths.snapshotPath)
        if (checkpoint) {
          await fs.writeFile(tempCheckpoint, JSON.stringify(checkpoint), 'utf8')
          await fs.rename(tempCheckpoint, paths.checkpointPath)
        }
        return true
      } catch (error) {
        await fs.rm(tempCheckpoint, { force: true }).catch(() => undefined)
        this.deps.logWarn('Failed to persist native file index snapshot', error)
        return false
      }
    })

    this.persistChain = next.then(
      () => undefined,
      () => undefined
    )
    return await next
  }

  public async wipe(): Promise<void> {
    const paths = this.getPaths()
    if (!paths) return
    const snapshotTmp = paths.snapshotPath.replace(/\.bin$/, '.tmp')
    const checkpointTmp = `${paths.checkpointPath}.tmp`
    await Promise.all([
      fs.rm(paths.snapshotPath, { force: true }).catch(() => undefined),
      fs.rm(paths.checkpointPath, { force: true }).catch(() => undefined),
      fs.rm(snapshotTmp, { force: true }).catch(() => undefined),
      fs.rm(checkpointTmp, { force: true }).catch(() => undefined)
    ])
  }
}
