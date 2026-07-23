import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  execFileSyncMock,
  spawnMock,
  openExternalMock,
  notificationIsSupportedMock,
  getMediaAccessStatusMock,
  askForMediaAccessMock,
  appGetPathMock,
  getMainConfigMock,
  accessSyncMock,
  notificationStatusMock
} = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
  spawnMock: vi.fn(),
  openExternalMock: vi.fn(async () => undefined),
  notificationIsSupportedMock: vi.fn(() => true),
  getMediaAccessStatusMock: vi.fn(() => 'granted'),
  askForMediaAccessMock: vi.fn(async () => true),
  appGetPathMock: vi.fn(),
  getMainConfigMock: vi.fn(),
  accessSyncMock: vi.fn(() => undefined),
  notificationStatusMock: vi.fn()
}))

vi.mock('@talex-touch/tuff-native', () => ({
  getNotificationAuthorizationStatus: notificationStatusMock
}))

vi.mock('node:child_process', () => ({
  execFileSync: execFileSyncMock,
  spawn: spawnMock
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    accessSync: accessSyncMock
  }
})

vi.mock('electron', () => ({
  app: {
    getPath: appGetPathMock
  },
  Notification: {
    isSupported: notificationIsSupportedMock
  },
  shell: {
    openExternal: openExternalMock
  },
  systemPreferences: {
    isTrustedAccessibilityClient: vi.fn(() => true),
    getMediaAccessStatus: getMediaAccessStatusMock,
    askForMediaAccess: askForMediaAccessMock
  }
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => ({
    on: vi.fn()
  }))
}))

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}))

vi.mock('../storage', () => ({
  getMainConfig: getMainConfigMock
}))

import * as fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  PermissionStatus,
  PermissionType,
  PlatformPermissionService
} from './platform-permission-service'

function withPlatform<T>(platform: NodeJS.Platform, run: () => T): T {
  const originalDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')
  const restore = () => {
    if (originalDescriptor) {
      Object.defineProperty(process, 'platform', originalDescriptor)
    }
  }

  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true
  })

  try {
    const result = run()
    if (result instanceof Promise) {
      return result.finally(restore) as T
    }
    restore()
    return result
  } catch (error) {
    restore()
    throw error
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

function createMacFileAccessFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-permission-roots-'))
  const pathMap: Record<string, string> = {
    documents: path.join(root, 'Documents'),
    downloads: path.join(root, 'Downloads'),
    desktop: path.join(root, 'Desktop'),
    music: path.join(root, 'Music'),
    pictures: path.join(root, 'Pictures'),
    videos: path.join(root, 'Videos')
  }
  const extraPath = path.join(root, 'Projects')

  for (const dir of [...Object.values(pathMap), extraPath]) {
    fs.mkdirSync(dir, { recursive: true })
  }

  appGetPathMock.mockImplementation((name: string) => pathMap[name])
  getMainConfigMock.mockReturnValue({ extraPaths: [extraPath] })

  return {
    extraPath,
    pathMap
  }
}

describe('platform-permission-service', () => {
  it('defers macOS TCC folders silently instead of probing when access is undetermined', () => {
    // A real home-scoped TCC path (Documents) with no onboarding grant recorded.
    const tccPath = path.join(os.homedir(), 'Documents')
    getMainConfigMock.mockReturnValue({})
    const opendirSpy = vi.spyOn(fs, 'opendirSync')

    const status = withPlatform('darwin', () =>
      PlatformPermissionService.getInstance().probeFileAccessStatus(tccPath)
    )

    // No dialog-triggering enumeration is performed for an undetermined TCC folder.
    expect(opendirSpy).not.toHaveBeenCalled()
    expect(status).toBe(PermissionStatus.NOT_DETERMINED)
    opendirSpy.mockRestore()
  })

  it('reports DENIED when a directory probe hits an EPERM (TCC block)', () => {
    // A non-TCC path so the determination gate never applies and we always probe.
    const blockedPath = path.join(os.tmpdir(), 'tuff-blocked-probe')
    const opendirSpy = vi.spyOn(fs, 'opendirSync').mockImplementationOnce(() => {
      throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' })
    })

    const result = withPlatform('darwin', () =>
      PlatformPermissionService.getInstance().checkFileAccess(blockedPath, { allowPrompt: true })
    )

    expect(opendirSpy).toHaveBeenCalledWith(blockedPath)
    expect(result.status).toBe(PermissionStatus.DENIED)
    expect(result.canRequest).toBe(true)
    opendirSpy.mockRestore()
  })

  it('lists macOS default and custom file access roots without probing silently', () => {
    const { pathMap, extraPath } = createMacFileAccessFixture()

    const result = withPlatform('darwin', () =>
      PlatformPermissionService.getInstance().checkFileAccessRoots()
    )

    expect(result.map((root) => root.path)).toEqual([
      pathMap.documents,
      pathMap.downloads,
      pathMap.desktop,
      pathMap.music,
      pathMap.pictures,
      pathMap.videos,
      '/Applications',
      extraPath
    ])
    // Only TCC-gated folders (Documents/Downloads/Desktop) + user extras are required.
    expect(result.filter((root) => root.required).map((root) => root.path)).toEqual([
      pathMap.documents,
      pathMap.downloads,
      pathMap.desktop,
      extraPath
    ])
    expect(result.find((root) => root.path === pathMap.music)?.required).toBe(false)
    expect(result.every((root) => root.status === PermissionStatus.NOT_DETERMINED)).toBe(true)
    expect(accessSyncMock).not.toHaveBeenCalled()
  })

  it('probes macOS file access roots after user-confirmed request', async () => {
    const { pathMap, extraPath } = createMacFileAccessFixture()

    const result = await withPlatform('darwin', () =>
      PlatformPermissionService.getInstance().requestFileAccessRoots()
    )

    expect(result.map((root) => root.path)).toEqual([
      pathMap.documents,
      pathMap.downloads,
      pathMap.desktop,
      pathMap.music,
      pathMap.pictures,
      pathMap.videos,
      '/Applications',
      extraPath
    ])
    expect(result.find((root) => root.path === extraPath)?.status).toBe(PermissionStatus.GRANTED)
  })

  it('checks non-macOS file access roots directly', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-permission-roots-'))
    const pathMap: Record<string, string> = {
      documents: path.join(root, 'Documents'),
      downloads: path.join(root, 'Downloads'),
      desktop: path.join(root, 'Desktop'),
      music: path.join(root, 'Music'),
      pictures: path.join(root, 'Pictures'),
      videos: path.join(root, 'Videos')
    }
    const extraPath = path.join(root, 'Projects')

    for (const dir of [...Object.values(pathMap), extraPath]) {
      fs.mkdirSync(dir, { recursive: true })
    }

    appGetPathMock.mockImplementation((name: string) => pathMap[name])
    getMainConfigMock.mockReturnValue({ extraPaths: [extraPath] })

    const result = withPlatform('linux', () =>
      PlatformPermissionService.getInstance().checkFileAccessRoots()
    )

    expect(result).toEqual([
      expect.objectContaining({
        path: extraPath,
        status: PermissionStatus.GRANTED
      })
    ])
  })

  it('uses non-invasive PowerShell admin detection on Windows', () => {
    execFileSyncMock.mockReturnValue('True\n')

    const result = withPlatform('win32', () =>
      PlatformPermissionService.getInstance().checkAdminPrivileges()
    )

    expect(result.status).toBe(PermissionStatus.GRANTED)
    expect(execFileSyncMock).toHaveBeenCalledWith(
      'powershell',
      expect.arrayContaining(['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass']),
      expect.objectContaining({ windowsHide: true })
    )
  })

  it('returns unsupported for Windows and Linux notification status', async () => {
    const windows = await withPlatform('win32', () =>
      PlatformPermissionService.getInstance().checkNotifications()
    )
    const linux = await withPlatform('linux', () =>
      PlatformPermissionService.getInstance().checkNotifications()
    )

    expect(windows.status).toBe(PermissionStatus.UNSUPPORTED)
    expect(windows.canRequest).toBe(false)
    expect(linux.status).toBe(PermissionStatus.UNSUPPORTED)
    expect(linux.canRequest).toBe(false)
  })

  it('marks macOS notifications unverifiable in dev (native reader gated to packaged builds)', async () => {
    notificationIsSupportedMock.mockReturnValue(true)

    const result = await withPlatform('darwin', () =>
      PlatformPermissionService.getInstance().checkNotifications()
    )

    expect(result.status).toBe(PermissionStatus.UNVERIFIABLE)
    expect(result.canRequest).toBe(true)
    expect(result.message).toContain('could not be read')
    expect(notificationIsSupportedMock).toHaveBeenCalled()
    // Dev (app.isPackaged falsy) must not touch the native reader.
    expect(notificationStatusMock).not.toHaveBeenCalled()
  })

  it('returns unsupported when macOS native notifications are unavailable', async () => {
    notificationIsSupportedMock.mockReturnValue(false)

    const result = await withPlatform('darwin', () =>
      PlatformPermissionService.getInstance().checkNotifications()
    )

    expect(result.status).toBe(PermissionStatus.UNSUPPORTED)
    expect(result.canRequest).toBe(false)
  })

  it('maps the native macOS notification status in packaged builds', async () => {
    notificationIsSupportedMock.mockReturnValue(true)
    notificationStatusMock.mockResolvedValue({ status: 'denied' })
    const electron = await import('electron')
    const appRef = electron.app as unknown as { isPackaged: boolean }
    appRef.isPackaged = true

    try {
      const result = await withPlatform('darwin', () =>
        PlatformPermissionService.getInstance().checkNotifications()
      )

      expect(notificationStatusMock).toHaveBeenCalled()
      expect(result.status).toBe(PermissionStatus.DENIED)
      expect(result.canRequest).toBe(true)
    } finally {
      appRef.isPackaged = false
    }
  })

  it.each([
    ['granted', PermissionStatus.GRANTED],
    ['denied', PermissionStatus.DENIED],
    ['not-determined', PermissionStatus.NOT_DETERMINED],
    ['restricted', PermissionStatus.NOT_DETERMINED],
    ['unknown', PermissionStatus.NOT_DETERMINED]
  ])('maps macOS screen recording status %s', (mediaStatus, expectedStatus) => {
    getMediaAccessStatusMock.mockReturnValue(mediaStatus)

    const result = withPlatform('darwin', () =>
      PlatformPermissionService.getInstance().checkScreenRecording()
    )

    expect(getMediaAccessStatusMock).toHaveBeenCalledWith('screen')
    expect(result).toMatchObject({
      status: expectedStatus,
      canRequest: true
    })
  })

  it('opens the macOS Screen Recording settings pane when requested', async () => {
    const opened = await withPlatform('darwin', () =>
      PlatformPermissionService.getInstance().requestPermission(PermissionType.SCREEN_RECORDING)
    )

    expect(opened).toBe(true)
    expect(openExternalMock).toHaveBeenCalledWith(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
    )
  })

  it('opens the macOS Full Disk Access settings pane when requested', async () => {
    const opened = await withPlatform('darwin', () =>
      PlatformPermissionService.getInstance().requestPermission(PermissionType.FULL_DISK_ACCESS)
    )

    expect(opened).toBe(true)
    expect(openExternalMock).toHaveBeenCalledWith(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'
    )
  })

  it('maps denied macOS microphone status to a requestable denial', () => {
    getMediaAccessStatusMock.mockReturnValue('denied')

    const result = withPlatform('darwin', () =>
      PlatformPermissionService.getInstance().checkMicrophone()
    )

    expect(getMediaAccessStatusMock).toHaveBeenCalledWith('microphone')
    expect(result).toMatchObject({
      status: PermissionStatus.DENIED,
      canRequest: true
    })
  })

  it('opens the macOS Microphone settings pane instead of repeating a denied prompt', async () => {
    getMediaAccessStatusMock.mockReturnValue('denied')

    const opened = await withPlatform('darwin', () =>
      PlatformPermissionService.getInstance().requestPermission(PermissionType.MICROPHONE)
    )

    expect(opened).toBe(true)
    expect(openExternalMock).toHaveBeenCalledWith(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
    )
    expect(askForMediaAccessMock).not.toHaveBeenCalled()
  })

  it('requests native microphone access for a not-determined macOS status', async () => {
    getMediaAccessStatusMock.mockReturnValue('not-determined')
    askForMediaAccessMock.mockResolvedValue(true)

    const requested = await withPlatform('darwin', () =>
      PlatformPermissionService.getInstance().requestPermission(PermissionType.MICROPHONE)
    )

    expect(requested).toBe(true)
    expect(askForMediaAccessMock).toHaveBeenCalledWith('microphone')
    expect(openExternalMock).not.toHaveBeenCalled()
  })

  it('opens Linux settings via standard launcher candidates', async () => {
    spawnMock.mockImplementationOnce(() => {
      const child = new EventEmitter() as EventEmitter & { unref: () => void }
      child.unref = vi.fn()
      queueMicrotask(() => child.emit('spawn'))
      return child
    })

    await expect(
      PlatformPermissionService.getInstance().openSystemSettings('linux')
    ).resolves.toBeUndefined()
    expect(spawnMock).toHaveBeenCalledWith(
      'xdg-open',
      ['settings://'],
      expect.objectContaining({ detached: true, stdio: 'ignore' })
    )
  })

  it('throws explicit error when Linux settings launchers are unavailable', async () => {
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & { unref: () => void }
      child.unref = vi.fn()
      queueMicrotask(() =>
        child.emit('error', Object.assign(new Error('missing'), { code: 'ENOENT' }))
      )
      return child
    })

    await expect(
      PlatformPermissionService.getInstance().openSystemSettings('linux')
    ).rejects.toThrow('Linux system settings is unavailable')
  })
})
