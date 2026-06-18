import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  execFileSyncMock,
  spawnMock,
  openExternalMock,
  notificationIsSupportedMock,
  appGetPathMock,
  getMainConfigMock,
  accessSyncMock
} = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
  spawnMock: vi.fn(),
  openExternalMock: vi.fn(async () => undefined),
  notificationIsSupportedMock: vi.fn(() => true),
  appGetPathMock: vi.fn(),
  getMainConfigMock: vi.fn(),
  accessSyncMock: vi.fn(() => undefined)
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
    getMediaAccessStatus: vi.fn(() => 'granted'),
    askForMediaAccess: vi.fn(async () => true)
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
import { PermissionChecker, PermissionStatus } from './permission-checker'

function withPlatform<T>(platform: NodeJS.Platform, run: () => T): T {
  const originalPlatform = process.platform
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true
  })
  try {
    return run()
  } finally {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true
    })
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

describe('permission-checker', () => {
  it('lists macOS default and custom file access roots without probing silently', () => {
    const { pathMap, extraPath } = createMacFileAccessFixture()

    const result = withPlatform('darwin', () =>
      PermissionChecker.getInstance().checkFileAccessRoots()
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
    expect(result.filter((root) => root.required)).toHaveLength(7)
    expect(result.every((root) => root.status === PermissionStatus.NOT_DETERMINED)).toBe(true)
    expect(accessSyncMock).not.toHaveBeenCalled()
  })

  it('probes macOS file access roots after user-confirmed request', async () => {
    const { pathMap, extraPath } = createMacFileAccessFixture()

    const result = await withPlatform('darwin', () =>
      PermissionChecker.getInstance().requestFileAccessRoots()
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
      PermissionChecker.getInstance().checkFileAccessRoots()
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
      PermissionChecker.getInstance().checkAdminPrivileges()
    )

    expect(result.status).toBe(PermissionStatus.GRANTED)
    expect(execFileSyncMock).toHaveBeenCalledWith(
      'powershell',
      expect.arrayContaining(['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass']),
      expect.objectContaining({ windowsHide: true })
    )
  })

  it('returns unsupported for Windows and Linux notification status', () => {
    const windows = withPlatform('win32', () =>
      PermissionChecker.getInstance().checkNotifications()
    )
    const linux = withPlatform('linux', () => PermissionChecker.getInstance().checkNotifications())

    expect(windows.status).toBe(PermissionStatus.UNSUPPORTED)
    expect(windows.canRequest).toBe(false)
    expect(linux.status).toBe(PermissionStatus.UNSUPPORTED)
    expect(linux.canRequest).toBe(false)
  })

  it('marks macOS notification permission as unverifiable when native notifications are supported', () => {
    notificationIsSupportedMock.mockReturnValue(true)

    const result = withPlatform('darwin', () =>
      PermissionChecker.getInstance().checkNotifications()
    )

    expect(result.status).toBe(PermissionStatus.UNVERIFIABLE)
    expect(result.canRequest).toBe(true)
    expect(result.message).toContain('not readable')
    expect(notificationIsSupportedMock).toHaveBeenCalled()
  })

  it('returns unsupported when macOS native notifications are unavailable', () => {
    notificationIsSupportedMock.mockReturnValue(false)

    const result = withPlatform('darwin', () =>
      PermissionChecker.getInstance().checkNotifications()
    )

    expect(result.status).toBe(PermissionStatus.UNSUPPORTED)
    expect(result.canRequest).toBe(false)
  })

  it('opens Linux settings via standard launcher candidates', async () => {
    spawnMock.mockImplementationOnce(() => {
      const child = new EventEmitter() as EventEmitter & { unref: () => void }
      child.unref = vi.fn()
      queueMicrotask(() => child.emit('spawn'))
      return child
    })

    await expect(
      PermissionChecker.getInstance().openSystemSettings('linux')
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

    await expect(PermissionChecker.getInstance().openSystemSettings('linux')).rejects.toThrow(
      'Linux system settings is unavailable'
    )
  })
})
