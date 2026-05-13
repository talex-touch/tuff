import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  shellOpenExternalMock,
  shellOpenPathMock,
  spawnSafeMock,
  showInternalSystemNotificationMock
} = vi.hoisted(() => ({
  shellOpenExternalMock: vi.fn(),
  shellOpenPathMock: vi.fn(),
  spawnSafeMock: vi.fn(),
  showInternalSystemNotificationMock: vi.fn()
}))

vi.mock('electron', () => ({
  shell: {
    openExternal: shellOpenExternalMock,
    openPath: shellOpenPathMock
  }
}))

vi.mock('@talex-touch/utils/common/utils/safe-shell', () => ({
  spawnSafe: spawnSafeMock
}))

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }))
}))

vi.mock('../../../notification', () => ({
  notificationModule: {
    showInternalSystemNotification: showInternalSystemNotificationMock
  }
}))

vi.mock('../../../../utils/i18n-helper', () => ({
  t: vi.fn((key: string, params?: Record<string, string | number>) => {
    if (key === 'notifications.appLaunchFailedTitle') return 'App Launch Failed'
    if (key === 'notifications.appLaunchFailedBody') {
      return `Failed to launch ${params?.name}\n${params?.error}`
    }
    return key
  })
}))

import { launchApp } from './app-launcher'

function createDetachedChildProcessMock() {
  return {
    once: vi.fn(),
    removeListener: vi.fn(),
    unref: vi.fn()
  }
}

async function withPlatform<T>(platform: NodeJS.Platform, run: () => Promise<T> | T): Promise<T> {
  const originalPlatform = process.platform
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true
  })
  try {
    return await run()
  } finally {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true
    })
  }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('app launcher', () => {
  it('opens Windows .lnk shortcuts through shell before parsing target metadata', async () => {
    shellOpenPathMock.mockResolvedValue('')

    await expect(
      withPlatform('win32', () =>
        launchApp({
          name: 'Shortcut App',
          path: 'C:\\Users\\demo\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Foo.lnk',
          launchKind: 'shortcut',
          launchTarget: 'C:\\Program Files\\Foo\\Foo.exe',
          launchArgs: '--profile work'
        })
      )
    ).resolves.toEqual({ status: 'success' })

    expect(shellOpenPathMock).toHaveBeenCalledWith(
      'C:\\Users\\demo\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Foo.lnk'
    )
    expect(spawnSafeMock).not.toHaveBeenCalled()
  })

  it('falls back to shortcut target when shell opening a Windows .lnk fails', async () => {
    vi.useFakeTimers()
    shellOpenPathMock.mockResolvedValue('shell failed')
    spawnSafeMock.mockReturnValue(createDetachedChildProcessMock())

    const launchPromise = withPlatform('win32', () =>
      launchApp({
        name: 'Shortcut App',
        path: 'C:\\Users\\demo\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Foo.lnk',
        launchKind: 'shortcut',
        launchTarget: 'C:\\Program Files\\Foo\\Foo.exe'
      })
    )

    await vi.advanceTimersByTimeAsync(2500)
    await expect(launchPromise).resolves.toEqual({ status: 'handedOff' })

    expect(shellOpenPathMock).toHaveBeenCalledWith(
      'C:\\Users\\demo\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Foo.lnk'
    )
    expect(spawnSafeMock).toHaveBeenCalledWith(
      'C:\\Program Files\\Foo\\Foo.exe',
      [],
      expect.objectContaining({ cwd: 'C:\\Program Files\\Foo' })
    )
    expect(showInternalSystemNotificationMock).not.toHaveBeenCalled()
  })

  it('opens Windows launchTarget .lnk through shell without spawning it', async () => {
    shellOpenPathMock.mockResolvedValue('')

    await expect(
      withPlatform('win32', () =>
        launchApp({
          name: 'Manual Shortcut App',
          path: 'C:\\Launchers\\Foo.lnk',
          launchKind: 'shortcut',
          launchTarget: 'C:\\Launchers\\Foo.lnk'
        })
      )
    ).resolves.toEqual({ status: 'success' })

    expect(shellOpenPathMock).toHaveBeenCalledWith('C:\\Launchers\\Foo.lnk')
    expect(spawnSafeMock).not.toHaveBeenCalled()
  })

  it('tries launchTarget .lnk through shell when source .lnk shell open fails', async () => {
    shellOpenPathMock.mockResolvedValueOnce('source failed').mockResolvedValueOnce('')

    await expect(
      withPlatform('win32', () =>
        launchApp({
          name: 'Nested Shortcut App',
          path: 'C:\\Start Menu\\Nested.lnk',
          launchKind: 'shortcut',
          launchTarget: 'C:\\Launchers\\Nested Target.lnk'
        })
      )
    ).resolves.toEqual({ status: 'success' })

    expect(shellOpenPathMock).toHaveBeenNthCalledWith(1, 'C:\\Start Menu\\Nested.lnk')
    expect(shellOpenPathMock).toHaveBeenNthCalledWith(2, 'C:\\Launchers\\Nested Target.lnk')
    expect(spawnSafeMock).not.toHaveBeenCalled()
  })

  it('does not spawn Windows launchTarget .lnk when shell handoff fails', async () => {
    shellOpenPathMock.mockResolvedValue('shell failed')

    await expect(
      withPlatform('win32', () =>
        launchApp({
          name: 'Manual Shortcut App',
          path: 'C:\\Launchers\\Foo.lnk',
          launchKind: 'shortcut',
          launchTarget: 'C:\\Launchers\\Foo.lnk'
        })
      )
    ).resolves.toEqual({ status: 'failed', error: 'shell failed' })

    expect(shellOpenPathMock).toHaveBeenCalledWith('C:\\Launchers\\Foo.lnk')
    expect(spawnSafeMock).not.toHaveBeenCalled()
    expect(showInternalSystemNotificationMock).toHaveBeenCalled()
  })

  it('launches Windows command scripts through cmd.exe', async () => {
    vi.useFakeTimers()
    spawnSafeMock.mockReturnValue(createDetachedChildProcessMock())

    const launchPromise = withPlatform('win32', () =>
      launchApp({
        name: 'Script App',
        path: 'C:\\Tools\\run.cmd',
        launchKind: 'shortcut',
        launchTarget: 'C:\\Tools\\run.cmd',
        launchArgs: '--flag "two words"'
      })
    )

    await vi.advanceTimersByTimeAsync(2500)
    await expect(launchPromise).resolves.toEqual({ status: 'handedOff' })

    expect(spawnSafeMock).toHaveBeenCalledWith(
      'cmd.exe',
      ['/d', '/s', '/c', 'C:\\Tools\\run.cmd', '--flag', 'two words'],
      expect.objectContaining({ cwd: 'C:\\Tools' })
    )
    expect(shellOpenPathMock).not.toHaveBeenCalled()
  })

  it('launches Windows PowerShell scripts through powershell.exe', async () => {
    vi.useFakeTimers()
    spawnSafeMock.mockReturnValue(createDetachedChildProcessMock())

    const launchPromise = withPlatform('win32', () =>
      launchApp({
        name: 'PowerShell App',
        path: 'C:\\Tools\\run.ps1',
        launchKind: 'shortcut',
        launchTarget: 'C:\\Tools\\run.ps1',
        launchArgs: '-Name demo'
      })
    )

    await vi.advanceTimersByTimeAsync(2500)
    await expect(launchPromise).resolves.toEqual({ status: 'handedOff' })

    expect(spawnSafeMock).toHaveBeenCalledWith(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'C:\\Tools\\run.ps1', '-Name', 'demo'],
      expect.objectContaining({ cwd: 'C:\\Tools' })
    )
    expect(shellOpenPathMock).not.toHaveBeenCalled()
  })

  it('launches Windows executable paths with executable directory as cwd', async () => {
    vi.useFakeTimers()
    spawnSafeMock.mockReturnValue(createDetachedChildProcessMock())

    const launchPromise = withPlatform('win32', () =>
      launchApp({
        name: '微信',
        path: 'C:\\Program Files\\Tencent\\Weixin\\Weixin.exe',
        launchKind: 'path',
        launchTarget: 'C:\\Program Files\\Tencent\\Weixin\\Weixin.exe'
      })
    )

    await vi.advanceTimersByTimeAsync(2500)
    await expect(launchPromise).resolves.toEqual({ status: 'handedOff' })

    expect(spawnSafeMock).toHaveBeenCalledWith(
      'C:\\Program Files\\Tencent\\Weixin\\Weixin.exe',
      [],
      expect.objectContaining({
        cwd: 'C:\\Program Files\\Tencent\\Weixin',
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      })
    )
    expect(shellOpenPathMock).not.toHaveBeenCalled()
  })

  it('keeps shell.openPath for non-executable path launches', async () => {
    shellOpenPathMock.mockResolvedValue('')

    await expect(
      withPlatform('win32', () =>
        launchApp({
          name: 'Document',
          path: 'C:\\Users\\demo\\doc.pdf',
          launchKind: 'path',
          launchTarget: 'C:\\Users\\demo\\doc.pdf'
        })
      )
    ).resolves.toEqual({ status: 'success' })

    expect(shellOpenPathMock).toHaveBeenCalledWith('C:\\Users\\demo\\doc.pdf')
    expect(spawnSafeMock).not.toHaveBeenCalled()
  })

  it('launches allowed Steam protocol URLs through shell.openExternal', async () => {
    shellOpenExternalMock.mockResolvedValue(undefined)

    await expect(
      launchApp({
        name: 'Steam Game',
        path: 'steam://rungameid/12345',
        launchKind: 'protocol',
        launchTarget: 'steam://rungameid/12345'
      })
    ).resolves.toEqual({ status: 'success' })

    expect(shellOpenExternalMock).toHaveBeenCalledWith('steam://rungameid/12345')
    expect(shellOpenPathMock).not.toHaveBeenCalled()
    expect(spawnSafeMock).not.toHaveBeenCalled()
  })

  it('rejects non-Steam protocol launches', async () => {
    await expect(
      launchApp({
        name: 'Bad Protocol',
        path: 'https://example.com',
        launchKind: 'protocol',
        launchTarget: 'https://example.com'
      })
    ).resolves.toMatchObject({ status: 'failed' })

    expect(shellOpenExternalMock).not.toHaveBeenCalled()
    expect(showInternalSystemNotificationMock).toHaveBeenCalled()
  })
})
