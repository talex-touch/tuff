import { afterEach, describe, expect, it, vi } from 'vitest'

const { shellOpenPathMock, spawnSafeMock, showInternalSystemNotificationMock } = vi.hoisted(() => ({
  shellOpenPathMock: vi.fn(),
  spawnSafeMock: vi.fn(),
  showInternalSystemNotificationMock: vi.fn()
}))

vi.mock('electron', () => ({
  shell: {
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
})
