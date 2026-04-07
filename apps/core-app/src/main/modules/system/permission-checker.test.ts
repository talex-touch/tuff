import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { execFileSyncMock, spawnMock, openExternalMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
  spawnMock: vi.fn(),
  openExternalMock: vi.fn(async () => undefined)
}))

vi.mock('node:child_process', () => ({
  execFileSync: execFileSyncMock,
  spawn: spawnMock
}))

vi.mock('electron', () => ({
  shell: {
    openExternal: openExternalMock
  },
  systemPreferences: {
    isTrustedAccessibilityClient: vi.fn(() => true),
    getMediaAccessStatus: vi.fn(() => 'granted'),
    askForMediaAccess: vi.fn(async () => true)
  }
}))

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}))

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

describe('permission-checker', () => {
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
    expect(linux.status).toBe(PermissionStatus.UNSUPPORTED)
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
