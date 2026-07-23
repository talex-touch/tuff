import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TalexEvents, touchEventBus } from '../../../core/eventbus/touch-event'
import { FileSystemWatcherModule } from './file-system-watcher'

const fsAccess = vi.hoisted(() => vi.fn())
const fsReaddir = vi.hoisted(() => vi.fn())
const fsStat = vi.hoisted(() => vi.fn())
const watcherAdd = vi.hoisted(() => vi.fn())
const probeFileAccessStatus = vi.hoisted(() => vi.fn())

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
  watch: vi.fn(() => ({
    add: watcherAdd,
    close: vi.fn(),
    on: vi.fn().mockReturnThis()
  }))
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
})
