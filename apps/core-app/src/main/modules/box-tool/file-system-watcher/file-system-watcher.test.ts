import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TalexEvents, touchEventBus } from '../../../core/eventbus/touch-event'
import { FileSystemWatcherModule } from './file-system-watcher'
import { FILE_SCAN_MAX_DEPTH } from '@talex-touch/utils/common/file-scan-constants'

const fsAccess = vi.hoisted(() => vi.fn())
const fsReaddir = vi.hoisted(() => vi.fn())
const fsStat = vi.hoisted(() => vi.fn())
const watcherAdd = vi.hoisted(() => vi.fn())
const chokidarWatch = vi.hoisted(() => vi.fn())
const chokidarFseventsWatch = vi.hoisted(() => vi.fn())
const probeFileAccessStatus = vi.hoisted(() => vi.fn())

// `file-system-watcher` and the scan constants both capture `process.platform` at module load, so
// the macOS-only whole-home ignore branch has to be selected *before* the imports above are
// evaluated. Pinned (and restored) so the same assertions run on a Linux CI runner.
const { originalPlatform } = vi.hoisted(() => {
  const originalPlatform = process.platform
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
  return { originalPlatform }
})

afterAll(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
})

vi.mock('node:fs/promises', () => ({
  default: {
    access: fsAccess,
    readdir: fsReaddir,
    stat: fsStat,
    constants: { R_OK: 4 }
  }
}))

vi.mock('../../system/platform-permission-service', () => ({
  PermissionStatus: {
    GRANTED: 'granted',
    DENIED: 'denied',
    NOT_DETERMINED: 'notDetermined',
    UNSUPPORTED: 'unsupported',
    UNVERIFIABLE: 'unverifiable'
  },
  platformPermissionService: {
    probeFileAccessStatus
  }
}))

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

vi.mock('@talex-touch/utils/common/utils/polling', () => ({
  pollingService: {
    register: vi.fn(),
    unregister: vi.fn()
  }
}))

vi.mock('chokidar', () => ({
  watch: chokidarWatch
}))

vi.mock('chokidar-fsevents', () => ({
  watch: chokidarFseventsWatch
}))

vi.mock('../../../core/eventbus/touch-event', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../core/eventbus/touch-event')>()
  return {
    ...actual,
    touchEventBus: {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn()
    }
  }
})

describe('FileSystemWatcherModule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const watcher = {
      add: watcherAdd,
      close: vi.fn(),
      on: vi.fn().mockReturnThis()
    }
    chokidarWatch.mockReturnValue(watcher)
    chokidarFseventsWatch.mockReturnValue(watcher)
    fsStat.mockResolvedValue({ isDirectory: () => true })
    fsAccess.mockResolvedValue(undefined)
    fsReaddir.mockResolvedValue([])
    probeFileAccessStatus.mockReturnValue('granted')
  })

  it('emits a recovered watch-root event when a pending path becomes accessible', async () => {
    const watcher = new FileSystemWatcherModule()
    // First probe (during addPath) reports no access → queued; the recovery poll
    // then sees it become accessible.
    probeFileAccessStatus.mockReturnValueOnce('notDetermined')

    await watcher.addPath('/tmp/recovered', 1)
    expect(watcher.getPendingPaths()).toEqual(['/tmp/recovered'])

    await expect(watcher.tryPendingPaths()).resolves.toEqual(['/tmp/recovered'])

    expect(watcherAdd).toHaveBeenCalledWith('/tmp/recovered')
    expect(touchEventBus.emit).toHaveBeenCalledWith(
      TalexEvents.FILE_WATCH_ROOT_RECOVERED,
      expect.objectContaining({
        name: TalexEvents.FILE_WATCH_ROOT_RECOVERED,
        filePath: '/tmp/recovered'
      })
    )
  })

  it('reconciles pending paths when permissions are refreshed', async () => {
    const watcher = new FileSystemWatcherModule()
    probeFileAccessStatus.mockReturnValueOnce('notDetermined')
    await watcher.addPath('/tmp/reconcile', 1)
    expect(watcher.getPendingPaths()).toEqual(['/tmp/reconcile'])

    await watcher.onInit()

    const registration = vi
      .mocked(touchEventBus.on)
      .mock.calls.find(([event]) => event === TalexEvents.PERMISSIONS_REFRESHED)
    expect(registration).toBeTruthy()

    // Access is granted by the time the permission refresh fires.
    probeFileAccessStatus.mockReturnValueOnce('granted')
    await (registration![1] as () => Promise<unknown>)()

    expect(watcherAdd).toHaveBeenCalledWith('/tmp/reconcile')
    expect(touchEventBus.emit).toHaveBeenCalledWith(
      TalexEvents.FILE_WATCH_ROOT_RECOVERED,
      expect.objectContaining({ filePath: '/tmp/reconcile' })
    )

    watcher.onDestroy()
    expect(touchEventBus.off).toHaveBeenCalledWith(
      TalexEvents.PERMISSIONS_REFRESHED,
      expect.any(Function)
    )
  })

  it('uses a bounded write-settle window for prompt file freshness', async () => {
    const watcher = new FileSystemWatcherModule()

    await watcher.addPath('/tmp/freshness', 24)

    const watchCall = chokidarFseventsWatch.mock.calls[0] ?? chokidarWatch.mock.calls[0]
    expect(watchCall?.[1]).toMatchObject({
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      }
    })
  })

  it('ignores private, system and dependency subtrees for the whole-home depth-24 watcher', async () => {
    const watcher = new FileSystemWatcherModule()

    await watcher.addPath('/Users/demo', FILE_SCAN_MAX_DEPTH)

    const watchCall = chokidarFseventsWatch.mock.calls[0] ?? chokidarWatch.mock.calls[0]
    const { ignored } = watchCall?.[1] as { ignored: (watchPath: string) => boolean }

    // Chokidar asks about each directory before descending, so the subtree root is cut; the walk
    // upward must also reject a leaf path whose excluded ancestor was never surfaced.
    expect([
      ignored('/Users/demo/.cache'),
      ignored('/Users/demo/Library'),
      ignored('/Users/demo/Workspace/repo/node_modules')
    ]).toEqual([true, true, true])

    expect([
      ignored('/Users/demo/.cache/x'),
      ignored('/Users/demo/Library/x'),
      ignored('/Users/demo/Workspace/repo/node_modules/x')
    ]).toEqual([true, true, true])

    // A personal `build` folder and ordinary project files stay observable: only unconditional
    // traversal exclusions apply under the whole-home root.
    expect([
      ignored('/Users/demo/Workspace/Projects/file.txt'),
      ignored('/Users/demo/Documents/build/note.txt')
    ]).toEqual([false, false])
  })
})
